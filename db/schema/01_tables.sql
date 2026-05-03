-- =========================================================
-- 1. 팀 마스터
-- =========================================================
CREATE TABLE teams (
    team_id         SERIAL PRIMARY KEY,
    short_name      VARCHAR(10) NOT NULL UNIQUE,
    full_name       VARCHAR(30) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 2. 선수 마스터
-- =========================================================
CREATE TABLE players (
    player_id       SERIAL PRIMARY KEY,

    -- 실제 CSV 데이터에서 중복 발생 가능
    -- UNIQUE 제거
    kbo_player_id   INTEGER,

    name            VARCHAR(30) NOT NULL,

    team_short      VARCHAR(10)
        NOT NULL REFERENCES teams(short_name),

    back_number     VARCHAR(10),

    birth_date      DATE,

    position        VARCHAR(30),

    throw_bat       VARCHAR(20),

    height_cm       SMALLINT,

    weight_kg       SMALLINT,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 이름 + 팀 조합 유니크
CREATE UNIQUE INDEX idx_players_name_team
ON players(name, team_short);

CREATE INDEX idx_players_team
ON players(team_short);

CREATE INDEX idx_players_kbo_id
ON players(kbo_player_id);

-- =========================================================
-- 3. 경기
-- =========================================================
CREATE TABLE games (
    game_id         SERIAL PRIMARY KEY,

    game_date       DATE NOT NULL,

    home_team       VARCHAR(10)
        NOT NULL REFERENCES teams(short_name),

    away_team       VARCHAR(10)
        NOT NULL REFERENCES teams(short_name),

    doubleheader    SMALLINT DEFAULT 1,

    home_score      SMALLINT DEFAULT 0,

    away_score      SMALLINT DEFAULT 0,

    -- 한글 인코딩 문제 방지
    status          VARCHAR(20)
        DEFAULT 'scheduled'
        CHECK (
            status IN (
                'scheduled',
                'live',
                'final',
                'canceled'
            )
        ),

    place           VARCHAR(30),

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_games_date_teams
ON games(game_date, home_team, away_team, doubleheader);

CREATE INDEX idx_games_date
ON games(game_date);

CREATE INDEX idx_games_status
ON games(status);

-- =========================================================
-- 4. 이닝 기록
-- =========================================================
CREATE TABLE game_innings (
    id              SERIAL PRIMARY KEY,

    game_id         INTEGER
        NOT NULL REFERENCES games(game_id)
        ON DELETE CASCADE,

    inning          SMALLINT NOT NULL,

    is_home         BOOLEAN NOT NULL,

    team_short      VARCHAR(10) NOT NULL,

    runs            SMALLINT DEFAULT 0,

    UNIQUE(game_id, inning, is_home)
);

CREATE INDEX idx_game_innings_game
ON game_innings(game_id);

-- =========================================================
-- 5. 경기별 타자 기록
-- =========================================================
CREATE TABLE game_batters (
    id              SERIAL PRIMARY KEY,

    game_id         INTEGER
        NOT NULL REFERENCES games(game_id)
        ON DELETE CASCADE,

    player_id       INTEGER
        REFERENCES players(player_id),

    name            VARCHAR(30) NOT NULL,

    team_short      VARCHAR(10) NOT NULL,

    batting_order   SMALLINT,

    hits            SMALLINT DEFAULT 0,

    at_bats         SMALLINT DEFAULT 0,

    rbi             SMALLINT DEFAULT 0,

    runs_scored     SMALLINT DEFAULT 0
);

CREATE INDEX idx_game_batters_game
ON game_batters(game_id);

CREATE INDEX idx_game_batters_player
ON game_batters(player_id);

-- =========================================================
-- 6. 경기별 투수 기록
-- =========================================================
CREATE TABLE game_pitchers (
    id                  SERIAL PRIMARY KEY,

    game_id             INTEGER
        NOT NULL REFERENCES games(game_id)
        ON DELETE CASCADE,

    player_id           INTEGER
        REFERENCES players(player_id),

    name                VARCHAR(30) NOT NULL,

    team_short          VARCHAR(10) NOT NULL,

    is_starter          BOOLEAN NOT NULL,

    innings_numeric     NUMERIC(4,1),

    strikeouts          SMALLINT DEFAULT 0,

    walks               SMALLINT DEFAULT 0,

    runs_allowed        SMALLINT DEFAULT 0,

    earned_runs         SMALLINT DEFAULT 0,

    pitch_count         SMALLINT DEFAULT 0
);

CREATE INDEX idx_game_pitchers_game
ON game_pitchers(game_id);

CREATE INDEX idx_game_pitchers_player
ON game_pitchers(player_id);

-- =========================================================
-- 7. 시즌 타격 스탯
-- =========================================================
CREATE TABLE season_batting (
    id              SERIAL PRIMARY KEY,

    season_year     SMALLINT NOT NULL,

    -- 실제 데이터에서 매칭 실패 가능
    -- NOT NULL 제거
    player_id       INTEGER
        REFERENCES players(player_id),

    name            VARCHAR(30) NOT NULL,

    team_short      VARCHAR(10)
        NOT NULL REFERENCES teams(short_name),

    avg             NUMERIC(4,3),

    home_runs       SMALLINT DEFAULT 0,

    rbi             SMALLINT DEFAULT 0,

    created_at      TIMESTAMPTZ DEFAULT NOW(),

    -- player_id 기준
    UNIQUE(season_year, player_id),

    -- load_data.py ON CONFLICT 대응
    UNIQUE(season_year, name, team_short)
);

CREATE INDEX idx_season_batting_team_year
ON season_batting(team_short, season_year);

CREATE INDEX idx_season_batting_avg
ON season_batting(avg DESC);

-- =========================================================
-- 8. 시즌 투수 스탯
-- =========================================================
CREATE TABLE season_pitching (
    id              SERIAL PRIMARY KEY,

    season_year     SMALLINT NOT NULL,

    -- 실제 데이터에서 매칭 실패 가능
    -- NOT NULL 제거
    player_id       INTEGER
        REFERENCES players(player_id),

    name            VARCHAR(30) NOT NULL,

    team_short      VARCHAR(10)
        NOT NULL REFERENCES teams(short_name),

    era             NUMERIC(5,2),

    wins            SMALLINT DEFAULT 0,

    losses          SMALLINT DEFAULT 0,

    ip_numeric      NUMERIC(5,1),

    created_at      TIMESTAMPTZ DEFAULT NOW(),

    -- player_id 기준
    UNIQUE(season_year, player_id),

    -- load_data.py ON CONFLICT 대응
    UNIQUE(season_year, name, team_short)
);

CREATE INDEX idx_season_pitching_team_year
ON season_pitching(team_short, season_year);

CREATE INDEX idx_season_pitching_era
ON season_pitching(era);

-- =========================================================
-- 9. 유저
-- =========================================================
CREATE TABLE users (
    user_id         SERIAL PRIMARY KEY,

    username        VARCHAR(30)
        NOT NULL UNIQUE,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 10. 투표
-- =========================================================
CREATE TABLE votes (
    vote_id         SERIAL PRIMARY KEY,

    game_id         INTEGER
        NOT NULL REFERENCES games(game_id)
        ON DELETE CASCADE,

    player_id       INTEGER
        NOT NULL REFERENCES players(player_id),

    user_id         INTEGER
        NOT NULL REFERENCES users(user_id),

    voted_at        TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uidx_user_game
        UNIQUE(user_id, game_id)
);

CREATE INDEX idx_votes_game
ON votes(game_id);

CREATE INDEX idx_votes_player
ON votes(player_id);