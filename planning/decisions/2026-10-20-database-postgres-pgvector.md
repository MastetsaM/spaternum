# Database: Postgres + pgvector

Decided 2026-10-17 in conversation with Mihail.

## Decision
Structured data lives in Postgres 18 with the pgvector extension (Docker image `pgvector/pgvector`).

## Why
- A RAG system over notes and transcripts is planned.
- Docker is already in use, so an extra database container costs little.
- Switching databases later is expensive.

## Alternatives considered
- **SQLite + sqlite-vec:** simplest (one file), but sqlite-vec is pre-1.0 and less proven; weaker with concurrent writers.

## Consequences
- Easier: vector search, full-text search, concurrent clients.
- Harder: ~100–200 MB extra RAM; backups need `pg_dump` instead of copying a file.

## Related
[[PRD]] · [[TECH]]
