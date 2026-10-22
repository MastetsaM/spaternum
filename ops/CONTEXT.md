# CONTEXT — ops

Deployment and operations for the Spaternum server.

## Planned contents
| File | Purpose |
|---|---|
| `docker-compose.yml` | `db` (Postgres + pgvector) for development now — `docker compose up -d db`, password in `ops/.env`; `api` (FastAPI) added in block 2 |
| `install.sh` | Sets up any machine: install Docker if missing → create data folders → generate API token → `docker compose up -d` |
| `.env.example` | Variables the server needs (token, DB credentials, data paths) — the real `.env` is never committed |
| Backup script | `pg_dump` + copy of the audio folder |

Details and reasoning: [[TECH]] (Deployment) and `planning/decisions/2026-10-20-deployment-docker-compose.md`.

## Target machines
- **Now:** Raspberry Pi 4, 8 GB, ARM64, Docker + Portainer, Tailscale; data on an attached HDD.
- **Later:** dedicated home server, likely x86_64. Images are built for both.
- **Dev PC:** Docker + uv installed (2026-10-21). A stopped container `spike-db` (Postgres + pgvector) is left from the sync spike — safe to remove with `docker rm spike-db`. `tailscale serve` is off.

## Rules
- Never commit secrets (`.env`, tokens).
- The server is only reachable over Tailscale — don't expose ports to the internet.

## Related
[[CLAUDE]] · [[TECH]] · [[risks]]
