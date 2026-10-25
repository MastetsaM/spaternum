#!/usr/bin/env bash
# Back up the database and files into DATA_ROOT/backups/<date-time>/, keeping the last 7.
# Same disk as the data: protects against mistakes and bad updates, not a dead disk.
# Restore: see ops/CONTEXT.md.
set -euo pipefail
cd "$(dirname "$0")"

KEEP=7
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || fail "No ops/.env — run ops/install.sh first."
DATA_ROOT=$(grep '^DATA_ROOT=' .env | cut -d= -f2-)
[[ -d $DATA_ROOT/postgres ]] || fail "$DATA_ROOT/postgres not found — is the HDD mounted?"

target=$DATA_ROOT/backups/$(date +%Y-%m-%d_%H%M%S)
mkdir -p "$target"

docker compose exec -T db pg_dump -U spaternum --format=custom spaternum > "$target/db.dump"
cp -a "$DATA_ROOT/files" "$target/files"
echo "Backed up to $target ($(du -sh "$target" | cut -f1))"

# Oldest first; remove all but the newest $KEEP
mapfile -t old < <(ls -1d "$DATA_ROOT"/backups/*/ | sort | head -n -"$KEEP")
for dir in "${old[@]}"; do
    rm -rf -- "$dir"
    echo "Removed old backup $dir"
done
