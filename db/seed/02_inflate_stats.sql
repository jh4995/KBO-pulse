-- ============================================================
-- A 담당: game_batters 데이터 증량
-- 목표: ~40K → ~1,450K행 (인덱스 포함 ~156 MB)
-- 방법: 2024~2025 경기를 1989~2023(35개 시즌)으로 복제
-- ============================================================

-- Step 1: games 복제
-- 원본(2024, 2025)의 날짜를 연도 오프셋만큼 이동하여 INSERT
-- UNIQUE(game_date, home_team, away_team, doubleheader) 충돌 시 스킵
-- KBO 시즌은 3~10월이므로 윤년(2/29) 문제 없음

INSERT INTO games (
    game_date, home_team, away_team, doubleheader,
    home_score, away_score, status, place
)
SELECT
    (g.game_date
     + make_interval(
         years => t.target_year - EXTRACT(YEAR FROM g.game_date)::INT
       )
    )::DATE                          AS new_date,
    g.home_team,
    g.away_team,
    g.doubleheader,
    g.home_score,
    g.away_score,
    g.status,
    g.place
FROM games g
CROSS JOIN generate_series(1989, 2023) AS t(target_year)
WHERE EXTRACT(YEAR FROM g.game_date) IN (2024, 2025)
ON CONFLICT (game_date, home_team, away_team, doubleheader)
DO NOTHING;


-- Step 2: game_batters 복제
-- 원본 game → 복제된 game을 날짜+팀+더블헤더로 매핑
-- 스탯에 ±1 랜덤 변동, 음수 방지

INSERT INTO game_batters (
    game_id, player_id, name, team_short,
    batting_order, hits, at_bats, rbi, runs_scored
)
SELECT
    new_g.game_id,
    ob.player_id,
    ob.name,
    ob.team_short,
    ob.batting_order,
    GREATEST(0, ob.hits        + (FLOOR(RANDOM()*3) - 1)::INT),
    GREATEST(1, ob.at_bats     + (FLOOR(RANDOM()*3) - 1)::INT),
    GREATEST(0, ob.rbi         + (FLOOR(RANDOM()*3) - 1)::INT),
    GREATEST(0, ob.runs_scored + (FLOOR(RANDOM()*3) - 1)::INT)
FROM game_batters ob
JOIN games orig_g
    ON ob.game_id = orig_g.game_id
CROSS JOIN generate_series(1989, 2023) AS t(target_year)
JOIN games new_g
    ON  new_g.game_date = (
            orig_g.game_date
            + make_interval(
                years => t.target_year
                         - EXTRACT(YEAR FROM orig_g.game_date)::INT
              )
        )::DATE
    AND new_g.home_team    = orig_g.home_team
    AND new_g.away_team    = orig_g.away_team
    AND new_g.doubleheader = orig_g.doubleheader
WHERE EXTRACT(YEAR FROM orig_g.game_date) IN (2024, 2025);


-- Step 3: 인덱스 통계 갱신 (쿼리 플래너 최적화)
VACUUM ANALYZE games;
VACUUM ANALYZE game_batters;


-- Step 4: 검증
SELECT '행 수 확인' AS label;

SELECT 'games' AS tbl, COUNT(*) AS rows FROM games
UNION ALL
SELECT 'game_batters', COUNT(*) FROM game_batters;

SELECT '디스크 크기 확인' AS label;

SELECT
    relname,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('games', 'game_batters')
ORDER BY pg_total_relation_size(c.oid) DESC;