# Spec — First deployment to the Pi (phase 1, block 2)

> **Draft (2026-10-22).** Open questions at the end need answers before coding.

## What and why
Run the server on the Raspberry Pi as early as possible, so ARM problems show up now and the phone can test against a real server later. The Pi runs **`main` only**, updated only after a change is fully tested on the PC ([[tasks]], [[TECH]] Release flow). Deployment follows [[2026-10-20-deployment-docker-compose]]: Docker Compose, data in folders on the HDD, one install script.

## What gets built
- `src/server/Dockerfile` — `python:3.14-slim` + uv; installs locked dependencies only (`uv sync --frozen --no-dev`); runs uvicorn on port 8000.
- `ops/docker-compose.yml` gains an `api` service next to `db`:
  - `api` port bound to `127.0.0.1:8000` only — reached from other devices through `tailscale serve`, never exposed on the network directly.
  - Data as bind mounts under one folder on the HDD (`DATA_ROOT`): `postgres/` and `audio/`.
  - Log size limit: Docker's `json-file` driver, 10 MB × 5 files per container.
  - `restart: unless-stopped` for both.
  - Development keeps working as today: `docker compose up -d db`, server via `uv run`.
- `ops/install.sh` — run once on a new machine:
  1. Check Docker and Docker Compose are installed (stop with a message if not).
  2. Create `ops/.env` if missing: generated Postgres password, API token, `DATA_ROOT`.
  3. Create the data folders.
  4. Build the image, start `db`, run migrations, start `api`.
  5. Print the API token (for the app's settings screen) and the `tailscale serve` command.
- `ops/update.sh` — run on the Pi after a change is tested on the PC: `git pull` (on `main`) → build → migrate → restart `api`. Stops at the first failing step; the old container keeps running until the new one is built.
- `ops/backup.sh` — `pg_dump` + copy of the audio folder *(destination — open Q 4)*.

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
- HDD not mounted when the Pi boots → Postgres would start on an empty folder on the SD card. `install.sh`/`update.sh` refuse to run if `DATA_ROOT` isn't on a mounted disk; compose starts only when the folder exists *(exact check decided while coding — mount check vs. a marker file)*.
- Pi out of disk → Postgres stops accepting writes; `/health` shows the database as down.
- Migration fails during `update.sh` → stops before restarting `api`; the old version keeps serving (the failed file rolled back — [[server-foundation_spec]]).

## Out of scope
- Building images on the PC and pushing to a registry, multi-arch `buildx` builds *(see open Q 2)*.
- Automatic updates (CI/CD), automatic scheduled backups *(open Q 4)*.
- Monitoring and alerts.
- Notes/voice notes tables — they arrive through `update.sh` once their blocks are merged.

## Open questions
1. **Pi access:** which user do you log in with on the Pi, and can I have SSH access from this PC? My key (`~/.ssh/id_ed25519`) is refused. If yes: `! ssh-copy-id <user>@raspberrypi` (asks for the Pi password once). Without SSH, you'd run the scripts on the Pi yourself and I'd guide.
2. **Where images are built:** on the Pi itself from the git checkout (*recommended* — no registry, no `buildx`, no emulation; each machine builds its own, so ARM vs x86 stops mattering; cost: a few minutes of building on the Pi per update), or multi-arch builds on the PC pushed to a registry (what [[TECH]] says today; needs `buildx`, QEMU and a registry like GitHub's). The recommendation changes [[2026-10-20-deployment-docker-compose]] and TECH — updated in the same commit if agreed.
3. **Portainer:** deploy with the scripts over SSH and use Portainer only to look at containers and logs (*recommended* — one way to deploy, the same on every machine), or deploy as a Portainer stack from git (the decision record mentions it)?
4. **Backups:** where should they go — another folder on the same HDD (protects against a bad migration or a mistake, not against the disk dying), another disk, or your PC? And run them by hand for now, or on a schedule (cron on the Pi)?
5. **HDD path:** where is the HDD mounted on the Pi (e.g. `/mnt/hdd`)? I can find it myself once I have SSH.

## Related
[[tasks]] · [[TECH]] · [[PRD]] · [[server-foundation_spec]] · [[2026-10-20-deployment-docker-compose]] · [[2026-10-20-auth-tailscale-api-token]] · [[2026-10-20-git-workflow]]
