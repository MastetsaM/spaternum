#!/usr/bin/env bash
# Update the server to the latest main. Run only after the change is tested on the PC.
# Stops at the first failing step; until the last step the old server keeps running.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n== %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || fail "No ops/.env — run ops/install.sh first."
DATA_ROOT=$(grep '^DATA_ROOT=' .env | cut -d= -f2-)
[[ -d $DATA_ROOT/postgres ]] || fail "$DATA_ROOT/postgres not found — is the HDD mounted?"

[[ $(git symbolic-ref --short HEAD) == main ]] || fail "Not on main. The server runs main only."
[[ -z $(git status --porcelain --untracked-files=no) ]] || fail "Local changes in the checkout — the server should run main exactly."

say "Pulling main"
git pull --ff-only

say "Building the server image"
docker compose build api

say "Applying migrations"
docker compose up -d --wait db
docker compose run --rm api python -m spaternum.migrate

say "Restarting the server"
docker compose up -d api

say "Done — now at $(git log --oneline -1)"
