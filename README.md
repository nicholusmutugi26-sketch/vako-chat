# Vakochat MVP (handoff for next agent)

React+TS+Vite+Tailwind frontend · FastAPI backend (same code, 2 nodes) · Redis 7 Pub/Sub · shared SQLite (WAL).

## Run
```bash
docker compose -f infrastructure/docker-compose.yml up -d          # Redis
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
SERVER_ID=node-1 PORT=8001 uvicorn app.main:app --port 8001 &      # node 1
SERVER_ID=node-2 PORT=8002 uvicorn app.main:app --port 8002 &      # node 2 (same cwd => same vakochat.db)
cd ../frontend && cp .env.example .env.local && npm install && npm run dev   # http://localhost:5173
```
Tests (no Redis needed): `cd backend && pytest`.

## Status: UNVERIFIED
Written without network access: **nothing was executed except Python syntax checks and a TS check with deps missing.**
First task for the next agent: install deps, run both nodes, fix whatever breaks, then run the acceptance checks below.

## Design of note
- Origin node delivers locally, then publishes `chat.message.created` (v1 envelope) to `vakochat:events`; subscribers skip `origin_node == self`. Message ID created once at origin; client dedupes by ID.
- WS auth = first frame `{type:"auth",token}`; sender identity from token; membership checked on every send.
- Heartbeat keys `vakochat:node:<id>` (TTL 6s) drive cluster view; traffic = per-minute Redis counters; presence = TTL keys. Missing data renders "Unavailable".
- Frontend: `FailoverSocket` (backoff+jitter, node switch after 2 fails, ping/pong), REST also fails over across nodes. Brand name only in `src/config/brand.ts`.

## TODO / known gaps
- Run & fix; add integration tests (2 nodes + Redis, cross-node, failover, non-member isolation).
- No outbox: sends while disconnected are rejected, not queued. Pub/Sub is at-most-once; history refetch on reconnect covers gaps.
- Rate limiter is per-node in-memory; JWT in sessionStorage (HttpOnly cookie preferable); no attachments, read receipts, group admin, mobile keyboard testing.
- Visual polish vs `design_assets/approved_final_design.jpg`; screenshots, report, user guide not produced.
- Node-1 REST outage mid-login not tested; SQLite shared file is local-demo only.
