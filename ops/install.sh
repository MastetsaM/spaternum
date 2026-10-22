#!/usr/bin/env bash
# Set up the Spaternum server on this machine. Safe to run again: keeps the existing
# token, password and data. Usage: ops/install.sh [DATA_ROOT]   (default /mnt/hdd/spaternum)
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n== %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

say "Checking Docker"
command -v docker >/dev/null || fail "Docker is not installed."
docker compose version >/dev/null 2>&1 || fail "Docker Compose is not installed (Arch: docker-compose, Debian/Pi OS: docker-compose-plugin)."
docker info >/dev/null 2>&1 || fail "Can't talk to Docker. Is it running, and is $USER in the docker group?"

random() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

if [[ -f .env ]]; then
    say "Keeping existing ops/.env"
    DATA_ROOT=$(grep '^DATA_ROOT=' .env | cut -d= -f2-)
else
    DATA_ROOT=${1:-/mnt/hdd/spaternum}
    say "Creating ops/.env (DATA_ROOT=$DATA_ROOT)"
    (umask 077; cat > .env) <<EOF
POSTGRES_PASSWORD=$(random)
API_TOKEN=$(random)
DATA_ROOT=$DATA_ROOT
LOG_LEVEL=INFO
EOF
fi

say "Checking where the data goes"
parent=$DATA_ROOT
while [[ ! -d $parent ]]; do parent=$(dirname "$parent"); done
fstype=$(findmnt -n -o FSTYPE --target "$parent")
mountpoint=$(findmnt -n -o TARGET --target "$parent")
case $fstype in
    vfat|exfat|ntfs|ntfs3|fuseblk) fail "$parent is on $fstype — Postgres needs ext4, btrfs or xfs." ;;
esac
if [[ $mountpoint == / ]]; then
    echo "$DATA_ROOT is on the system disk (/), not a separate disk like the HDD."
    read -rp "Continue anyway? [y/N] " answer
    [[ $answer == [yY] ]] || fail "Stopped. Mount the disk, or pass a different DATA_ROOT."
fi
mkdir -p "$DATA_ROOT"/{postgres,files/audio,backups} \
    || fail "Can't create $DATA_ROOT. Run: sudo mkdir -p $DATA_ROOT && sudo chown $USER $DATA_ROOT"

say "Building the server image (a few minutes on the Pi)"
docker compose build api

say "Starting the database"
docker compose up -d --wait db

say "Applying migrations"
docker compose run --rm api python -m spaternum.migrate

say "Starting the server"
docker compose up -d api

say "Done"
cat <<EOF
Server: http://127.0.0.1:8000/health on this machine.
To reach it from your devices over HTTPS, run once:
    sudo tailscale serve --bg 8000
then open https://$(hostname).<your-tailnet>.ts.net/health

API token for the app's settings screen:
    $(grep '^API_TOKEN=' .env | cut -d= -f2-)
EOF
