import csv
import os
import re
import argparse
from collections import defaultdict
from datetime import date

import psycopg2
from psycopg2.extras import execute_values


# ─────────────────────────────────────────────
# DB 연결 설정
# ─────────────────────────────────────────────
DB_CONFIG = {
    "host": "localhost",
    "port": int(os.getenv("DB_PORT","5433")),
    "dbname": "kbo_db",
    "user": "kbo_user",
    "password": "kbo_pass_1234",
}


# ─────────────────────────────────────────────
# 공통 유틸
# ─────────────────────────────────────────────
def connect():
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    return conn


def read_csv(filepath):
    with open(filepath, "r", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def safe_int(val, default=None):
    if val is None or val == "" or val == "-":
        return default
    try:
        return int(val)
    except ValueError:
        return default


def safe_float(val, default=None):
    if val is None or val == "" or val == "-":
        return default
    try:
        return float(val)
    except ValueError:
        return default


def parse_pitcher_inning(raw):
    """
    경기별 투수 이닝 변환
    예:
    '31' -> 3.1
    '52' -> 5.2
    """
    if raw is None or raw == "" or raw == "-":
        return None

    try:
        n = int(raw)
        full = n // 10
        frac = n % 10
        return float(f"{full}.{frac}")
    except ValueError:
        return None


# ─────────────────────────────────────────────
# 선수 마스터 파싱
# ─────────────────────────────────────────────
def parse_player_master(row):

    # 등번호
    back_num = row.get("등번호", "")
    back_num = back_num.replace("No.", "").strip() if back_num else None

    # 생년월일
    birth_date = None
    birth_str = row.get("생년월일", "")

    m = re.match(r"(\d{4})년\s*(\d{2})월\s*(\d{2})일", birth_str)

    if m:
        birth_date = date(
            int(m.group(1)),
            int(m.group(2)),
            int(m.group(3)),
        )

    # 포지션 / 투타
    position = None
    throw_bat = None

    pos_raw = row.get("포지션", "")

    m2 = re.match(r"(.+?)\((.+?)\)", pos_raw)

    if m2:
        position = m2.group(1).strip()
        throw_bat = m2.group(2).strip()

    elif pos_raw:
        position = pos_raw.strip()

    # 신장/체중
    height = None
    weight = None

    hw = row.get("신장/체중", "")

    m3 = re.match(r"(\d+)cm/(\d+)kg", hw)

    if m3:
        height = int(m3.group(1))
        weight = int(m3.group(2))

    return {
        "back_number": back_num,
        "birth_date": birth_date,
        "position": position,
        "throw_bat": throw_bat,
        "height_cm": height,
        "weight_kg": weight,
    }


# ─────────────────────────────────────────────
# 팀 적재
# ─────────────────────────────────────────────
def load_teams(cur):
    print("[1/8] Loading teams...")

    teams = [
        ("LG", "LG 트윈스"),
        ("KT", "KT 위즈"),
        ("SSG", "SSG 랜더스"),
        ("NC", "NC 다이노스"),
        ("두산", "두산 베어스"),
        ("KIA", "KIA 타이거즈"),
        ("롯데", "롯데 자이언츠"),
        ("삼성", "삼성 라이온즈"),
        ("한화", "한화 이글스"),
        ("키움", "키움 히어로즈"),
    ]

    execute_values(
        cur,
        """
        INSERT INTO teams (short_name, full_name)
        VALUES %s
        ON CONFLICT (short_name) DO NOTHING
        """,
        teams,
    )

    print(f"  teams INSERT: {len(teams)}개")


# ─────────────────────────────────────────────
# 선수 적재
# ─────────────────────────────────────────────
def load_players(cur, csv_dir):

    print("[2/8] Loading players...")

    unique_players = set()

    for fname in [
        "2024_batter.csv",
        "2025_batter.csv",
        "2024_pitcher.csv",
        "2025_pitcher.csv",
    ]:
        rows = read_csv(os.path.join(csv_dir, fname))

        for r in rows:
            unique_players.add(
                (
                    r["name"],
                    r["team"],
                )
            )

    batch = []

    for name, team in sorted(unique_players):
        batch.append((name, team))

    execute_values(
        cur,
        """
        INSERT INTO players (name, team_short)
        VALUES %s
        ON CONFLICT (name, team_short) DO NOTHING
        """,
        batch,
    )

    print(f"  players 기본 INSERT: {len(batch)}명")

    # player_ids.csv
    pid_path = os.path.join(csv_dir, "player_ids.csv")

    if os.path.exists(pid_path):

        rows = read_csv(pid_path)

        pid_map = {}

        for r in rows:
            try:
                pid_map[r["name"]] = int(r["player_id"])
            except:
                pass

        for name, kbo_id in pid_map.items():

            cur.execute(
                """
                UPDATE players
                SET kbo_player_id = %s
                WHERE name = %s
                  AND kbo_player_id IS NULL
                """,
                (kbo_id, name),
            )

    # player_master.csv
    master_path = os.path.join(csv_dir, "player_master.csv")

    if os.path.exists(master_path):

        rows = read_csv(master_path)

        updated = 0

        for r in rows:

            parsed = parse_player_master(r)

            cur.execute(
                """
                UPDATE players
                SET
                    back_number = COALESCE(%s, back_number),
                    birth_date = COALESCE(%s, birth_date),
                    position = COALESCE(%s, position),
                    throw_bat = COALESCE(%s, throw_bat),
                    height_cm = COALESCE(%s, height_cm),
                    weight_kg = COALESCE(%s, weight_kg)
                WHERE name = %s
                """,
                (
                    parsed["back_number"],
                    parsed["birth_date"],
                    parsed["position"],
                    parsed["throw_bat"],
                    parsed["height_cm"],
                    parsed["weight_kg"],
                    r["선수명"],
                ),
            )

            updated += cur.rowcount

        print(f"  players 상세 UPDATE: {updated}명")


# ─────────────────────────────────────────────
# 경기 적재
# ─────────────────────────────────────────────
def load_games(cur, csv_dir):

    print("[3/8] Loading games...")

    game_count = 0
    inning_count = 0

    for year in [2024, 2025]:

        rows = read_csv(os.path.join(csv_dir, f"{year}_scoreboard.csv"))

        groups = defaultdict(list)

        for r in rows:
            key = (
                r["year"],
                r["month"],
                r["day"],
                r["home"],
                r["away"],
            )
            groups[key].append(r)

        for (yr, mon, day, home, away), team_rows in groups.items():

            game_date = date(int(yr), int(mon), int(day))

            if len(team_rows) == 4:

                game1 = [r for r in team_rows if r["idx"][8] == "1"]
                game2 = [r for r in team_rows if r["idx"][8] == "2"]

                sub_games = [
                    (1, game1),
                    (2, game2),
                ]

            else:
                sub_games = [(1, team_rows)]

            for dh_num, pair in sub_games:

                if len(pair) < 2:
                    continue

                home_row = next(
                    (r for r in pair if r["team"] == home),
                    pair[0],
                )

                away_row = next(
                    (r for r in pair if r["team"] == away),
                    pair[1],
                )

                status = "final"

                cur.execute(
                    """
                    INSERT INTO games
                    (
                        game_date,
                        home_team,
                        away_team,
                        doubleheader,
                        home_score,
                        away_score,
                        status,
                        place
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT
                    (game_date, home_team, away_team, doubleheader)
                    DO NOTHING
                    RETURNING game_id
                    """,
                    (
                        game_date,
                        home,
                        away,
                        dh_num,
                        safe_int(home_row.get("r"), 0),
                        safe_int(away_row.get("r"), 0),
                        status,
                        home_row.get("place"),
                    ),
                )

                row = cur.fetchone()

                if row is None:
                    continue

                game_id = row[0]

                game_count += 1

                # 이닝 적재
                for team_row, is_home in [
                    (home_row, True),
                    (away_row, False),
                ]:

                    for inn in range(1, 19):

                        val = team_row.get(f"i_{inn}", "-")

                        if val and val != "-":

                            cur.execute(
                                """
                                INSERT INTO game_innings
                                (
                                    game_id,
                                    team_short,
                                    inning,
                                    is_home,
                                    runs
                                )
                                VALUES (%s,%s,%s,%s,%s)
                                ON CONFLICT DO NOTHING
                                """,
                                (
                                    game_id,
                                    team_row["team"],
                                    inn,
                                    is_home,
                                    safe_int(val, 0),
                                ),
                            )

                            inning_count += 1

    print(f"  games INSERT: {game_count}경기")
    print(f"  game_innings INSERT: {inning_count}행")


# ─────────────────────────────────────────────
# game_id 매핑
# ─────────────────────────────────────────────
def _get_game_id_map(cur):

    cur.execute(
        """
        SELECT
            game_id,
            game_date,
            home_team,
            away_team,
            doubleheader
        FROM games
        """
    )

    result = {}

    for gid, gdate, home, away, dh in cur.fetchall():

        result[(gdate, home, away, dh)] = gid

    return result


def _resolve_game_id(game_id_map, idx_str, home, away):

    yr = int(idx_str[:4])
    mon = int(idx_str[4:6])
    day = int(idx_str[6:8])

    dh = int(idx_str[8]) if len(idx_str) > 8 else 1

    gdate = date(yr, mon, day)

    gid = game_id_map.get(
        (
            gdate,
            home,
            away,
            dh,
        )
    )

    if gid:
        return gid

    return game_id_map.get(
        (
            gdate,
            home,
            away,
            1,
        )
    )


# ─────────────────────────────────────────────
# player_id 매핑
# ─────────────────────────────────────────────
def get_player_map(cur):

    cur.execute(
        """
        SELECT player_id, name, team_short
        FROM players
        """
    )

    result = {}

    for pid, name, team in cur.fetchall():
        result[(name, team)] = pid

    return result


# ─────────────────────────────────────────────
# 타자 경기 기록
# ─────────────────────────────────────────────
def load_game_batters(cur, csv_dir):

    print("[4/8] Loading game_batters...")

    game_id_map = _get_game_id_map(cur)
    player_map = get_player_map(cur)

    idx_to_teams = {}

    for year in [2024, 2025]:

        rows = read_csv(os.path.join(csv_dir, f"{year}_scoreboard.csv"))

        for r in rows:
            idx_to_teams[r["idx"]] = (
                r["home"],
                r["away"],
            )

    count = 0

    for year in [2024, 2025]:

        rows = read_csv(os.path.join(csv_dir, f"{year}_batter.csv"))

        batch = []

        for r in rows:

            idx = r["idx"]

            if idx not in idx_to_teams:
                continue

            home, away = idx_to_teams[idx]

            game_id = _resolve_game_id(
                game_id_map,
                idx,
                home,
                away,
            )

            if game_id is None:
                continue

            player_id = player_map.get(
                (
                    r["name"],
                    r["team"],
                )
            )

            batch.append(
                (
                    game_id,
                    player_id,
                    r["name"],
                    r["team"],
                    safe_int(r.get("position")),
                    safe_int(r.get("hit"), 0),
                    safe_int(r.get("bat_num"), 0),
                    safe_int(r.get("hit_get"), 0),
                    safe_int(r.get("own_get"), 0),
                )
            )

        if batch:

            execute_values(
                cur,
                """
                INSERT INTO game_batters
                (
                    game_id,
                    player_id,
                    name,
                    team_short,
                    batting_order,
                    hits,
                    at_bats,
                    rbi,
                    runs_scored
                )
                VALUES %s
                """,
                batch,
                page_size=1000,
            )

            count += len(batch)

    print(f"  game_batters INSERT: {count}행")


# ─────────────────────────────────────────────
# 투수 경기 기록
# ─────────────────────────────────────────────
def load_game_pitchers(cur, csv_dir):

    print("[5/8] Loading game_pitchers...")

    game_id_map = _get_game_id_map(cur)
    player_map = get_player_map(cur)

    idx_to_teams = {}

    for year in [2024, 2025]:

        rows = read_csv(os.path.join(csv_dir, f"{year}_scoreboard.csv"))

        for r in rows:
            idx_to_teams[r["idx"]] = (
                r["home"],
                r["away"],
            )

    count = 0

    for year in [2024, 2025]:

        rows = read_csv(os.path.join(csv_dir, f"{year}_pitcher.csv"))

        batch = []

        for r in rows:

            idx = r["idx"]

            if idx not in idx_to_teams:
                continue

            home, away = idx_to_teams[idx]

            game_id = _resolve_game_id(
                game_id_map,
                idx,
                home,
                away,
            )

            if game_id is None:
                continue

            player_id = player_map.get(
                (
                    r["name"],
                    r["team"],
                )
            )

            batch.append(
                (
                    game_id,
                    player_id,
                    r["name"],
                    r["team"],
                    r.get("mound") == "1",
                    parse_pitcher_inning(r.get("inning")),
                    safe_int(r.get("strikeout"), 0),
                    safe_int(r.get("dead4ball"), 0),
                    safe_int(r.get("losescore"), 0),
                    safe_int(r.get("earnedrun"), 0),
                    safe_int(r.get("pitchnum"), 0),
                )
            )

        if batch:

            execute_values(
                cur,
                """
                INSERT INTO game_pitchers
                (
                    game_id,
                    player_id,
                    name,
                    team_short,
                    is_starter,
                    innings_numeric,
                    strikeouts,
                    walks,
                    runs_allowed,
                    earned_runs,
                    pitch_count
                )
                VALUES %s
                """,
                batch,
                page_size=1000,
            )

            count += len(batch)

    print(f"  game_pitchers INSERT: {count}행")


# ─────────────────────────────────────────────
# 시즌 타격 성적
# ─────────────────────────────────────────────
def load_season_batting(cur, csv_dir):

    print("[6/8] Loading season_batting...")

    player_map = get_player_map(cur)

    count = 0

    for year in [2024, 2025]:

        rows = read_csv(os.path.join(csv_dir, f"season_hitter_{year}.csv"))

        batch = []

        for r in rows:

            player_id = player_map.get(
                (
                    r["선수명"],
                    r["팀명"],
                )
            )

            if player_id is None:
                continue

            batch.append(
                (
                    year,
                    player_id,
                    r["선수명"],
                    r["팀명"],
                    safe_float(r.get("AVG")),
                    safe_int(r.get("HR"), 0),
                    safe_int(r.get("RBI"), 0),
                )
            )

        if batch:

            execute_values(
                cur,
                """
                INSERT INTO season_batting
                (
                    season_year,
                    player_id,
                    name,
                    team_short,
                    avg,
                    home_runs,
                    rbi
                )
                VALUES %s
                ON CONFLICT
                (season_year, name, team_short)
                DO NOTHING
                """,
                batch,
                page_size=1000,
            )

            count += len(batch)

    print(f"  season_batting INSERT: {count}행")


# ─────────────────────────────────────────────
# 시즌 투수 성적
# ─────────────────────────────────────────────
def load_season_pitching(cur, csv_dir):

    print("[7/8] Loading season_pitching...")

    player_map = get_player_map(cur)

    count = 0

    for year in [2024, 2025]:

        rows = read_csv(os.path.join(csv_dir, f"season_pitcher_{year}.csv"))

        batch = []

        for r in rows:

            player_id = player_map.get(
                (
                    r["선수명"],
                    r["팀명"],
                )
            )

            if player_id is None:
                continue

            batch.append(
                (
                    year,
                    player_id,
                    r["선수명"],
                    r["팀명"],
                    safe_float(r.get("ERA")),
                    safe_int(r.get("W"), 0),
                    safe_int(r.get("L"), 0),
                    parse_pitcher_inning(r.get("IP")),
                )
            )

        if batch:

            execute_values(
                cur,
                """
                INSERT INTO season_pitching
                (
                    season_year,
                    player_id,
                    name,
                    team_short,
                    era,
                    wins,
                    losses,
                    ip_numeric
                )
                VALUES %s
                ON CONFLICT
                (season_year, name, team_short)
                DO NOTHING
                """,
                batch,
                page_size=1000,
            )

            count += len(batch)

    print(f"  season_pitching INSERT: {count}행")


# ─────────────────────────────────────────────
# 검증
# ─────────────────────────────────────────────
def verify(cur):

    print("\n[8/8] Verifying...")

    tables = [
        "teams",
        "players",
        "games",
        "game_innings",
        "game_batters",
        "game_pitchers",
        "season_batting",
        "season_pitching",
    ]

    for t in tables:

        cur.execute(f"SELECT COUNT(*) FROM {t}")

        cnt = cur.fetchone()[0]

        print(f"  {t:20s}: {cnt:>8,}행")


# ─────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────
def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--csv-dir",
        required=True,
        help="csv_data 디렉토리 경로",
    )

    args = parser.parse_args()

    csv_dir = args.csv_dir

    if not os.path.isdir(csv_dir):
        print(f"ERROR: {csv_dir} 디렉토리가 존재하지 않습니다.")
        return

    conn = connect()
    cur = conn.cursor()

    try:

        load_teams(cur)
        conn.commit()

        load_players(cur, csv_dir)
        conn.commit()

        load_games(cur, csv_dir)
        conn.commit()

        load_game_batters(cur, csv_dir)
        conn.commit()

        load_game_pitchers(cur, csv_dir)
        conn.commit()

        load_season_batting(cur, csv_dir)
        conn.commit()

        load_season_pitching(cur, csv_dir)
        conn.commit()

        verify(cur)

        print("\n✅ 데이터 적재 완료!")

    except Exception as e:

        conn.rollback()

        print(f"\n❌ 에러 발생: {e}")

        raise

    finally:

        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
