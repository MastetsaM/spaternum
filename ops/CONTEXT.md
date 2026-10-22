# CONTEXT — ops

Deployment and operations for the Spaternum server. Spec: [[deploy_spec]].

## Contents
| File | Purpose |
|---|---|
| `docker-compose.yml` | `db` (Postgres + pgvector) + `api` (the server, built from `src/server`). Data in bind mounts under `DATA_ROOT` |
| `.env` (not committed) | Postgres password, API token, `DATA_ROOT`, `LOG_LEVEL` — see `.env.example`; `install.sh` creates it |
| `install.sh` | Once per machine: checks → creates `.env` and data folders → builds → starts `db` → migrates → starts `api` → prints the token |
| `update.sh` | On the Pi, after a change is tested on the PC: pull `main` → build → migrate → restart `api` |
| `backup.sh` | By hand: `pg_dump` + copy of `files/` into `DATA_ROOT/backups/<date-time>/`, keeps the last 7 |

Details and reasoning: [[TECH]] (Deployment), [[2026-10-20-deployment-docker-compose]].

## Data folders (`DATA_ROOT`)
`postgres/` (database), `files/` (the server's `/data`; audio in `files/audio/`), `backups/`. Docker does not create them — if the HDD isn't mounted, the containers fail to start instead of writing to the SD card.

## Restore a backup
```bash
cd ops
docker compose stop api
docker compose exec -T db psql -U spaternum -d postgres -c "DROP DATABASE spaternum" -c "CREATE DATABASE spaternum"
docker compose exec -T db pg_restore -U spaternum -d spaternum < "$DATA_ROOT/backups/<date-time>/db.dump"
rsync -a --delete "$DATA_ROOT/backups/<date-time>/files/" "$DATA_ROOT/files/"
docker compose up -d --wait api
```
Restoring into an empty database was tested on the PC (2026-10-23); the full sequence above hasn't been run yet.

## Machines
- **Pi (production):** Raspberry Pi 4, 8 GB, ARM64, Docker + Portainer, Tailscale (`raspberrypi`). HDD at `/mnt/hdd`, `DATA_ROOT=/mnt/hdd/spaternum`. Runs `main` only. Portainer is for viewing containers and logs; deploying is done with the scripts.
- **Later:** a home server, likely x86_64 — same `install.sh` (tested on the PC).
- **Dev PC:** `docker compose up -d db` with `DATA_ROOT=./data` (git-ignored); the server runs with `uv run` (see `src/server`). A stopped container `spike-db` is left from the sync spike — safe to remove with `docker rm spike-db`. `tailscale serve` is off.

## Rules
- Never commit secrets (`.env`, tokens).
- The server is only reachable over Tailscale — ports are bound to `127.0.0.1`, other devices come in through `tailscale serve`.

## Related
[[CLAUDE]] · [[TECH]] · [[risks]] · [[deploy_spec]]
