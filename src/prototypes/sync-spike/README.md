# Sync spike

Throwaway test of RxDB sync — spec: [[sync-spike_spec]].

## Run the server (on the PC)
```bash
# Postgres (once)
docker run -d --name spike-db -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=spike -e POSTGRES_PASSWORD=spike -e POSTGRES_DB=spike \
  pgvector/pgvector:0.8.7-pg18

cd server
cp .env.example .env               # then set API_TOKEN
uv run --env-file .env migrate.py
uv run --env-file .env uvicorn main:app --host 127.0.0.1 --port 8000

# Expose it to the tailnet over HTTPS (once; stays on in the background)
tailscale serve --bg 8000
```

## Run the client
```bash
cd client
cp .env.example .env               # server URL + same token
pnpm tauri dev                     # PC
# Phone: build and sign a release APK — see TECH "Build an APK and send it to the phone"
```

## Related
[[sync-spike_spec]] · [[2026-10-21-sync-rxdb]] · [[TECH]]
