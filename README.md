# KBO 야구 팬 참여형 데이터 플랫폼

Redis 기반 성능 최적화를 적용한 야구 팬 참여형 데이터 플랫폼

## 기술 스택

- **백엔드**: Node.js 20 + Express + ioredis + pg
- **DB**: PostgreSQL 16
- **캐시**: Redis 7
- **인프라**: Docker Compose (App×2 + Nginx + Redis + PostgreSQL + Prometheus + Grafana)
- **프론트엔드**: React (예정)
- **부하테스트**: k6

## 핵심 기능 (3개)

| 기능 | Redis 패턴 | 담당 |
|------|-----------|------|
| 선수 스탯 조회 | Look-Aside 캐싱 (String/Hash) | A |
| MVP 투표 / 랭킹 | INCR + Sorted Set + SET NX EX (분산 락) | B |
| 실시간 경기 현황 | HTTP 폴링 + Hash 캐싱 | C |

## 시작하기

1. `cp .env.example .env`
2. `cd server && npm install && cd ..`
3. `docker compose up -d`
4. `curl http://localhost/check/all`
