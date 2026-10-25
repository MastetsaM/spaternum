# Spec — First deployment to the Pi (phase 1, block 2)

## What and why
Run the server on the Raspberry Pi as early as possible, so ARM problems show up now and the phone can test against a real server later. The Pi runs **`main` only**, updated only after a change is fully tested on the PC ([[tasks]], [[TECH]] Release flow). Deployment follows [[2026-10-20-deployment-docker-compose]]: Docker Compose, data in folders on the HDD, one install script.

## What gets built
- `src/server/Dockerfile` — **built on the machine that runs it** (the Pi builds its own ARM image; no registry, no `buildx`). `python:3.14-slim` + uv; installs locked dependencies only (`uv sync --frozen --no-dev`); runs uvicorn on port 8000.
- `ops/docker-compose.yml` gains an `api` service next to `db`:
  - `api` port bound to `127.0.0.1:8000` only — reached from other devices through `tailscale serve`, never exposed on the network directly.
  - Data as bind mounts under one folder (`DATA_ROOT`, on the Pi `/mnt/hdd/spaternum`): `postgres/` (database), `files/` (mounted as the server's `/data`; audio in `files/audio/`), `backups/`. Docker is told **not** to create missing folders, so if the HDD isn't mounted at boot the containers fail to start instead of writing to the SD card.
  - Log size limit: Docker's `json-file` driver, 10 MB × 5 files per container.
  - `restart: unless-stopped` for both.
  - Development keeps working: `docker compose up -d db` (dev `DATA_ROOT` is `ops/data`, git-ignored), server via `uv run`.
- `ops/install.sh` — run once on a new machine:
  1. Check Docker and Docker Compose are installed, and that `DATA_ROOT` is on a filesystem Postgres can use (not FAT/exFAT/NTFS) and not on the SD card / system disk (asks before continuing if it is).
  2. Create `ops/.env` if missing: generated Postgres password, API token, `DATA_ROOT`.
  3. Create the data folders.
  4. Build the image, start `db`, run migrations, start `api`.
  5. Print the API token (for the app's settings screen) and the `tailscale serve` command.
- `ops/update.sh` — run on the Pi after a change is tested on the PC: `git pull` (on `main`) → build → migrate → restart `api`. Stops at the first failing step; the old container keeps running until the new one is built.
- `ops/backup.sh` — run by hand for now: `pg_dump` + copy of `files/` into `DATA_ROOT/backups/<date-time>/`; keeps the last 7. Same HDD: protects against mistakes and bad updates, not against the disk dying ([[risks]]).

## HTTPS over Tailscale
`tailscale serve --bg 8000` on the Pi gives `https://raspberrypi.<tailnet>.ts.net` with a valid certificate, reachable only from Mihail's devices. Same setup the sync spike used on the PC. HTTPS also avoids Android blocking plain-HTTP traffic from apps.

## Acceptance criteria (done when…)
1. `install.sh` on the Pi brings up `db` and `api` from a fresh clone; running it again changes nothing and keeps the existing token and password.
2. From the phone and the PC, `https://raspberrypi.<tailnet>.ts.net/health` reports the database as up.
3. `/api/…` without the token → `401`, over Tailscale.
4. After a reboot of the Pi, both containers come back by themselves.
5. Database files are on the HDD under `DATA_ROOT`, not on the SD card.
6. `update.sh` applies a new commit from `main`: new migrations applied, `api` restarted; a broken build leaves the old `api` running.
7. `backup.sh` produces a dump that restores into an empty database.
8. The same `install.sh` works on the PC (x86_64) — proves the move to a future home server.

## Edge cases and failure modes
- HDD not mounted when the Pi boots → the data folders don't exist and Docker won't create them, so the containers fail to start (visible in Portainer) instead of starting empty on the SD card. `update.sh` and `backup.sh` also refuse to run.
- Pi out of disk → Postgres stops accepting writes; `/health` shows the database as down.
- Migration fails during `update.sh` → stops before restarting `api`; the old version keeps serving (the failed file rolled back — [[server-foundation_spec]]).

## Out of scope
- Building images on the PC and pushing to a registry, multi-arch `buildx` builds.
- Automatic updates (CI/CD), scheduled backups (cron) — later, once backups have a second disk to go to.
- Running the server as a non-root user inside the container — the data folders would need matching ownership; revisit if the server is ever exposed beyond Tailscale.
- Monitoring and alerts.
- Notes/voice notes tables — they arrive through `update.sh` once their blocks are merged.

## Results
All 8 criteria met. **PC (2026-10-23)** — `install.sh` run in a fresh clone with its own `DATA_ROOT`, under a separate Compose project name:

| # | Criterion | Result |
|---|---|---|
| 1 | Fresh install; re-run changes nothing, keeps token and password | ✅ |
| 2 | `/health` over Tailscale from phone and PC | ✅ Pi (2026-10-25) |
| 3 | `/api/…` without token → 401 | ✅ locally and over Tailscale |
| 4 | Containers back after a reboot | ✅ Pi |
| 5 | Database files under `DATA_ROOT` | ✅ on the PC; on the Pi `DATA_ROOT=/mnt/hdd/spaternum` (ext4) — the containers can't start without those folders, so the data is there |
| 6 | `update.sh`: new migration applied, `api` restarted; broken build leaves the old `api` running | ✅ |
| 7 | Backup restores into an empty database | ✅ (row + migrations + audio file present); keeps the last 7 ✅ |
| 8 | Same `install.sh` on x86_64 | ✅ |

Found while testing:
- `install.sh` set a strict file mask for `.env` and it leaked into the data folders it created; now limited to `.env`.
- Right after a restart the server needs ~2 s to answer, and the scripts said "Done" too early. `api` now has a health check and the scripts wait for it (`up --wait`).
- The PC has no `buildx`; Compose falls back to the classic builder, which works.
- **Pi (2026-10-25):** port 8000 was already taken on the Pi (likely Portainer's Edge agent port). The host port is now a setting, `API_PORT` in `ops/.env` (default 8000); `tailscale serve` uses the same port.

## Decided 2026-10-22
Mihail runs the commands on the Pi; Claude prepares the scripts and guides (no SSH access) · images built on the Pi itself, no registry · deploy with the scripts, Portainer only for viewing · backups by hand to the same HDD for now · HDD at `/mnt/hdd`, `DATA_ROOT=/mnt/hdd/spaternum`.

## Related
[[tasks]] · [[TECH]] · [[PRD]] · [[server-foundation_spec]] · [[2026-10-20-deployment-docker-compose]] · [[2026-10-20-auth-tailscale-api-token]] · [[2026-10-20-git-workflow]]
