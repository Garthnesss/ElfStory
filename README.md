# ElfStory

A turn-based tactical dungeon-crawler RPG in the browser — elven outrider Garth Elfstrom descends beneath Oakhaven and Highspire to confront Sovereign Malakor. React 19 · TypeScript · Vite · Tailwind CSS v4 · Canvas rendering · procedural Web Audio SFX · optional Firebase cloud saves.

**Canonical project docs:** [PROJECT_TRUTH.md](PROJECT_TRUTH.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [ROADMAP.md](ROADMAP.md) · [STATUS.md](STATUS.md)

See [HANDOFF.md](HANDOFF.md) for the full architecture & handoff guide.

## Quick start

```bash
npm install --legacy-peer-deps   # plain install currently hits a peer-resolution conflict (see HANDOFF.md)
npm run dev                       # Vite dev server on http://0.0.0.0:3000
npm run lint                      # tsc --noEmit
npm test                          # node test runner over tests/*.test.ts
npm run build                     # production build into dist/
```
