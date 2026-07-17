# KBO 야구 팬 참여형 데이터 플랫폼

Redis 기반 성능 최적화를 적용한 야구 팬 참여형 데이터 플랫폼

동일한 기능을 **Redis 경유(실험군)** 와 **DB 직접 조회(대조군)** 두 가지로 구현하고,
`REDIS_ENABLED` 환경 변수로 전환하며 k6로 성능을 비교하는 것이 이 프로젝트의 목표입니다.

## 기술 스택

- **백엔드**: Node.js 20 + Express + ioredis + pg
- **DB**: PostgreSQL 16
- **캐시**: Redis 7
- **인프라**: Docker Compose (App×2 + Nginx + Redis + PostgreSQL + Prometheus + Grafana)
- **프론트엔드**: React (예정)
- **부하테스트**: k6

## 아키텍처

```
        ┌─────────┐
Client ─┤  Nginx  ├─┬─ app-1 ─┬─ Redis
        │  :80    │ │         │
        └─────────┘ └─ app-2 ─┴─ PostgreSQL

        Prometheus :9090 ─ Grafana :3001
```

| 서비스 | 컨테이너 | 호스트 포트 |
|---|---|---|
| Nginx | kbo-nginx | 80 |
| App ×2 | kbo-app-1, kbo-app-2 | (Nginx 경유) |
| Redis | kbo-redis | 6379 |
| PostgreSQL | kbo-postgres | **5433** → 5432 |
| Prometheus | kbo-prometheus | 9090 |
| Grafana | kbo-grafana | 3001 |

> PostgreSQL은 로컬에 이미 설치된 PostgreSQL과 충돌하지 않도록 호스트 포트를 **5433**으로 매핑합니다.

## 핵심 기능 (3개)

| 기능 | Redis 패턴 | 담당 |
|------|-----------|------|
| 선수 스탯 조회 | Look-Aside 캐싱 (String/Hash) + 이벤트 기반 무효화 | [@thdtmdrud](https://github.com/thdtmdrud) |
| MVP 투표 / 랭킹 | INCR + Sorted Set + SET NX EX (분산 락) + Write-Behind + Pub/Sub | [@jh4995](https://github.com/jh4995) |
| 실시간 경기 현황 | HTTP 폴링 + Hash 캐싱 | [@sylee002](https://github.com/sylee002) |

## 시작하기

### 1. 환경 변수 설정

```bash
cp .env.example .env
```

### 2. 의존성 설치 및 컨테이너 기동

```bash
cd server && npm install && cd ..
docker compose up -d
```

### 3. 스키마 생성

`db/init/`만 컨테이너 초기화 시 자동 실행되므로(pg_stat_statements 확장), 테이블은 직접 적용합니다.

```bash
docker exec -i kbo-postgres psql -U kbo_user -d kbo_db < db/schema/01_tables.sql
```

### 4. 데이터 적재

CSV 원본(`db/seed/csv_data/`)은 이 저장소에 포함되어 있지 않습니다.
KBO 데이터 수집 파이프라인인 [capstone-kbo-data](https://github.com/jh4995/capstone-kbo-data)를 실행해 생성한 뒤 복사해 옵니다.

```bash
git clone https://github.com/jh4995/capstone-kbo-data.git
cd capstone-kbo-data

python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
# 브라우저 버전에 맞는 ChromeDriver를 drivers/ 에 배치

# 경기별 박스스코어 → 2024/2025_scoreboard·batter·pitcher.csv
python 02_crawl.py
python 03_convert.py

# 시즌 스탯 및 선수 프로필 → season_hitter_*.csv, player_ids.csv, player_master.csv
python 04_season_stats.py
python 05_player_master.py
```

생성된 `csv_data/`를 이 저장소로 복사한 뒤 적재합니다.

```bash
cd ..
cp -r capstone-kbo-data/csv_data KBO-pulse/db/seed/

# 팀/선수/경기/타자 기록 적재 (teams 포함)
python db/seed/load_data.py --csv-dir db/seed/csv_data
```

이어서 시드 SQL을 순서대로 적용합니다.

```bash
# game_batters 증량 (~1,450K행)
docker exec -i kbo-postgres psql -U kbo_user -d kbo_db < db/seed/02_inflate_stats.sql
# 더미 유저 20만 명
docker exec -i kbo-postgres psql -U kbo_user -d kbo_db < db/seed/03_users.sql
# game_id 1557~1560 투표 데이터
docker exec -i kbo-postgres psql -U kbo_user -d kbo_db < db/seed/04_votes.sql
```

> `01_teams.sql`은 `load_data.py`의 팀 적재와 동일한 역할이므로, 스크립트를 쓰지 않을 때만 사용합니다.

### 5. 동작 확인

```bash
curl http://localhost/check/all
```

## API

### 헬스체크

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 인스턴스 확인 (Nginx 라운드 로빈 검증용) |
| GET | `/check/db` | PostgreSQL 연결 확인 |
| GET | `/check/redis` | Redis 연결 확인 |
| GET | `/check/all` | 전체 인프라 상태 종합 |

### 선수 스탯 — `/api/stats`

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/players?team=&position=&season=` | 선수 목록 (팀/포지션/시즌 필터) |
| GET | `/players/:id` | 선수 상세 스탯 |
| GET | `/players/name/:name` | 이름으로 스탯 조회 |
| PUT | `/players/name/:name` | 스탯 수정 + 캐시 무효화 |
| GET | `/ranking?category=&season=&limit=` | 부문별 랭킹 |

### MVP 투표 — `/api/vote`

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/:gameId/:playerId` | 투표 (Body: `{ "userId": 1 }`) |
| GET | `/:gameId/ranking?limit=10` | 실시간 투표 랭킹 |

```bash
# 투표
curl -X POST http://localhost/api/vote/1557/29 \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'

# 랭킹 조회
curl "http://localhost/api/vote/1557/ranking?limit=5"
```

응답 코드: `201` 성공 / `400` userId 누락 / `409` 중복 투표(동일 유저·경기)

### 실시간 경기 — `/api/game`

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/live` | 진행 중(`status='live'`)인 경기 목록 |
| GET | `/:gameId/status` | 경기 실시간 점수/이닝 (폴링용) |
| POST | `/:gameId/simulate` | `game_innings` 기반 시뮬레이션 시작 |

## A/B 성능 테스트

`.env`의 `REDIS_ENABLED`를 바꾼 뒤 앱 컨테이너를 재기동합니다.

```bash
# 대조군 — DB 직접 조회
REDIS_ENABLED=false docker compose up -d --force-recreate app-1 app-2

# 실험군 — Redis 경유
REDIS_ENABLED=true docker compose up -d --force-recreate app-1 app-2
```

| 기능 | 대조군 (false) | 실험군 (true) |
|---|---|---|
| 선수 스탯 | DB 직접 조회 | Look-Aside 캐싱 |
| 투표 | 중복 체크 후 INSERT | SET NX EX 락 → INCR → ZINCRBY |
| 랭킹 | `GROUP BY` + `COUNT` + `ORDER BY` | `ZREVRANGE` (O(log N + M)) |
| 경기 현황 | DB 직접 조회 | Hash 캐싱 |

### 투표 기능 동작 방식 (실험군)

1. **SET NX EX** — 유저·경기 단위 분산 락으로 중복 투표 차단 (TTL 7200초)
2. **INCR** — 투표 카운터 원자적 증가
3. **ZINCRBY** — Sorted Set 랭킹 갱신
4. **LPUSH → RPOP** — `vote:queue`에 적재 후 주기적으로 최대 100건씩 DB 배치 INSERT (Write-Behind)
5. **PUBLISH** — `cache:invalidate` 채널로 인스턴스 간 캐시 무효화 전파

Write-Behind 주기는 `WRITE_BEHIND_INTERVAL`(ms, 기본 30000)로 조정합니다.
Graceful shutdown 시 큐에 남은 투표를 마지막으로 flush합니다.

## 부하테스트

```bash
k6 run k6/A_stats_load_test.js
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `POSTGRES_USER` | `kbo_user` | DB 사용자 |
| `POSTGRES_PASSWORD` | `kbo_pass_1234` | DB 비밀번호 |
| `POSTGRES_DB` | `kbo_db` | DB 이름 |
| `REDIS_ENABLED` | `true` | `true` 실험군 / `false` 대조군 |
| `WRITE_BEHIND_INTERVAL` | `30000` | 투표 Write-Behind 배치 주기 (ms) |
| `APP_INSTANCE_ID` | `local` | 인스턴스 식별자 (compose에서 주입) |

## 프로젝트 구조

```
db/
  init/      컨테이너 초기화 시 자동 실행 (확장 설치)
  schema/    테이블 정의
  seed/      시드 데이터 및 CSV 적재 스크립트
k6/          부하테스트 스크립트
monitoring/  Prometheus 설정
nginx/       리버스 프록시 설정
server/src/
  config/      db, redis 연결
  routes/      HTTP 요청/응답 (index.js에서 자동 등록)
  controllers/ 컨트롤러
  services/    비즈니스 로직 + Redis 패턴
  models/      SQL 쿼리
  middleware/  에러 핸들러, 레이트 리미터
```

라우트는 `routes/index.js`에서 자동 등록되므로, 기능 추가 시 `app.js`를 수정하지 않습니다.
