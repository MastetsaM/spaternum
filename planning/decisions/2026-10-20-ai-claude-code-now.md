# AI: Claude Code on the PC now, local AI later

Decided 2026-10-17 in conversation with Mihail.

## Decision
Version 1 has no AI on the server. Claude Code (Pro) runs as a terminal panel in the desktop app. Transcription (faster-whisper), embeddings/RAG and Ollama come later, mainly on the home server.

## Why
- The Pi has no GPU; local models there are small and slow.
- Mihail already pays for Claude Code and wants to experiment.

## Alternatives considered
- **Ollama on the Pi now:** only 1–3B models, a few words per second.
- **Paid API from the server:** per-use cost.

## Consequences
- Easier: no AI infrastructure in v1.
- Harder: server-side AI features wait for phase 2+. Headless Claude Code from the server is unverified against Anthropic's terms.

## Related
[[PRD]] · [[TECH]]
