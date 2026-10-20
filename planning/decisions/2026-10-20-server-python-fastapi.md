# Server: Python + FastAPI, managed with uv

Decided 2026-10-17 in conversation with Mihail.

## Decision
The server is written in Python with FastAPI, run by uvicorn (one worker), packaged with uv, in a `python:3.12-slim`-style image.

## Why
- Mihail prefers Python but wants it light and efficient.
- The roadmap (transcription, RAG) has its best tools in Python.
- FastAPI idles at ~50–80 MB RAM, fine on a Pi.

## Alternatives considered
- **TypeScript (Node):** shared types with the React client, but weaker AI ecosystem.
- **Go:** lightest and fastest, but a second language with no AI ecosystem and no shared types.

## Consequences
- Easier: transcription and RAG later; auto-generated API docs.
- Harder: client types must be generated from OpenAPI (`openapi-typescript`) instead of shared directly.

## Related
[[PRD]] · [[TECH]]
