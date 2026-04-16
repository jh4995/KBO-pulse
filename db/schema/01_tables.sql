-- 1. 팀 마스터
CREATE TABLE teams (
    team_id     SERIAL PRIMARY KEY,
    short_name  VARCHAR(10) NOT NULL UNIQUE,
    full_name   VARCHAR(30) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 선수 마스터
CREATE TABLE players (
    player_id       SERIAL PRIMARY KEY,
    kbo_player_id   INTEGER UNIQUE,
    name            VARCHAR(30) NOT NULL,
    team_short      VARCHAR(10) NOT NULL REFERENCES teams(short_name),
    back_number     VARCHAR(10),
    birth_date      DATE,
    position        VARCHAR(30),
    throw_bat       VARCHAR(20),
    height_cm       SMALLINT,
    weight_kg       SMALLINT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_players_name_team ON players(name, team_short);

-- 3. 경기 및 이닝 정보
CREATE TABLE games (
    game_id         SERIAL PRIMARY KEY,
    game_date       DATE NOT NULL,
    home_team       VARCHAR(10) NOT NULL REFERENCES teams(short_name),
    away_team       VARCHAR(10) NOT NULL REFERENCES teams(short_name),
    doubleheader    SMALLINT DEFAULT 1,
    home_score      SMALLINT DEFAULT 0,
    away_score      SMALLINT DEFAULT 0,
    status          VARCHAR(20) DEFAULT '경기전',
    place           VARCHAR(20),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_games_date_teams ON games(game_date, home_team, away_team, doubleheader);
CREATE INDEX idx_games_date ON games(game_date);

CREATE TABLE game_innings (
    id              SERIAL PRIMARY KEY,
    game_id         INTEGER NOT NULL REFERENCES games(game_id),
    team_short      VARCHAR(10) NOT NULL,
    inning          SMALLINT NOT NULL,
    is_home         BOOLEAN NOT NULL, -- True: 말, False: 초
    runs            SMALLINT DEFAULT 0,
    UNIQUE(game_id, team_short, inning)
);

-- 4. 경기별 상세 기록 (원천 데이터)
CREATE TABLE game_batters (
    id              SERIAL PRIMARY KEY,
    game_id         INTEGER NOT NULL REFERENCES games(game_id),
    player_id       INTEGER REFERENCES players(player_id),
    name            VARCHAR(30) NOT NULL,
    team_short      VARCHAR(10) NOT NULL,
    batting_order   SMALLINT,
    hits            SMALLINT DEFAULT 0,
    at_bats         SMALLINT DEFAULT 0,
    rbi             SMALLINT DEFAULT 0,
    runs_scored     SMALLINT DEFAULT 0
);

CREATE TABLE game_pitchers (
    id              SERIAL PRIMARY KEY,
    game_id         INTEGER NOT NULL REFERENCES games(game_id),
    player_id       INTEGER REFERENCES players(player_id),
    name            VARCHAR(30) NOT NULL,
    team_short      VARCHAR(10) NOT NULL,
    is_starter      BOOLEAN NOT NULL,
    innings_numeric NUMERIC(4,1),
    strikeouts      SMALLINT DEFAULT 0,
    walks           SMALLINT DEFAULT 0,
    runs_allowed    SMALLINT DEFAULT 0,
    earned_runs     SMALLINT DEFAULT 0,
    pitch_count     SMALLINT DEFAULT 0
);

-- 5. 시즌 누적 성적 (캐시 무효화 실험 대상)
CREATE TABLE season_batting (
    id              SERIAL PRIMARY KEY,
    season_year     SMALLINT NOT NULL,
    player_id       INTEGER REFERENCES players(player_id),
    name            VARCHAR(30) NOT NULL,
    team_short      VARCHAR(10) NOT NULL REFERENCES teams(short_name),
    avg             NUMERIC(4,3),
    home_runs       SMALLINT DEFAULT 0,
    rbi             SMALLINT DEFAULT 0,
    UNIQUE(season_year, name, team_short)
);

CREATE TABLE season_pitching (
    id              SERIAL PRIMARY KEY,
    season_year     SMALLINT NOT NULL,
    player_id       INTEGER REFERENCES players(player_id),
    name            VARCHAR(30) NOT NULL,
    team_short      VARCHAR(10) NOT NULL REFERENCES teams(short_name),
    era             NUMERIC(5,2),
    wins            SMALLINT DEFAULT 0,
    losses          SMALLINT DEFAULT 0,
    ip_numeric      NUMERIC(5,1),
    UNIQUE(season_year, name, team_short)
);

-- 6. 유저 및 투표 (분산 락/부하 테스트 대상)
CREATE TABLE users (
    user_id     SERIAL PRIMARY KEY,
    username    VARCHAR(30) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE votes (
    vote_id     SERIAL PRIMARY KEY,
    game_id     INTEGER NOT NULL REFERENCES games(game_id),
    player_id   INTEGER NOT NULL REFERENCES players(player_id),
    user_id     INTEGER REFERENCES users(user_id),
    voted_at    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uidx_user_game UNIQUE(user_id, game_id)
);