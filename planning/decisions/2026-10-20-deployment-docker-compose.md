# Deployment: Docker Compose, multi-arch, install script

Decided 2026-10-17 in conversation with Mihail.

## Decision
The server ships as Docker images (ARM64 + x86_64) with a `docker-compose.yml` and an `install.sh` that sets up any machine. Data lives in bind-mounted folders on the HDD.

## Update (2026-10-22): images are built on the machine that runs them
Instead of multi-arch `buildx` builds pushed to a registry, each machine builds its own image from the git checkout (`ops/install.sh`, `ops/update.sh`). Why: no registry, no `buildx` or emulation, ARM vs x86 stops mattering. Cost: a few minutes of building on the Pi per update. Deploying is done with the scripts; Portainer is used to view containers and logs. Details: [[deploy_spec]].

## Why
- Runs on a Pi 4 (ARM64) now, a home server (likely x86_64) later.
- Mihail already uses Docker + Portainer on the Pi.
- Moving machines should be: copy data folder, run the script.

## Alternatives considered
- **Bare-metal install (systemd + system Python/Postgres):** no Docker overhead, but tied to each machine's OS and harder to move.

## Consequences
- Easier: identical install anywhere; deploy as a Portainer stack from git.
- Harder: ~~multi-arch builds need `docker buildx`~~ (no longer — see update above); each update rebuilds on the Pi.

## Related
[[PRD]] · [[TECH]]
