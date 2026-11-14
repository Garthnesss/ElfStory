# ElfStory — Architecture

## Big picture
A single-page React app. All game logic lives in pure-ish TypeScript modules under `src/game/`; `src/App.tsx` is the game loop and state owner (5,500+ lines); `src/components/` are presentational modals/HUD/canvas driven entirely by App state. There is no server of ours — persistence is localStorage plus optional Firebase (Auth + Firestore) cloud saves.

```
TitleScreen ──► App.tsx (turn loop, state, saves) ──► AsciiCanvas (render)
                     │  ├─ src/game/world.ts    — zone & floor generation
                     │  ├─ src/game/combat.ts   — visibility, pathfinding, hit math
                     │  ├─ src/game/skills.ts   — attributes, trees, derived stats
                     │  ├─ src/game/loot.ts     — gear generation, relics, runeforge
                     │  ├─ src/game/npcs.ts     — dialogue trees, quest defs
                     │  ├─ src/game/codex.ts    — bestiary, feats, town upgrades
                     │  ├─ src/game/audio.ts    — synthesized Web Audio SFX (no music)
                     │  └─ src/game/cloudSave.ts— RLE zone packing, Firestore I/O
                     └─ src/components/*.tsx    — modals, HUD, dock, canvas
```

## Components
- **`src/App.tsx`** — owns all state (player, zones, flags, quests, merchants, logs), the turn loop, enemy/companion AI execution, hazard/DoT resolution, save/load, and every handler. Anything that happens in the game passes through here.
- **`src/game/world.ts`** — zone constructors for the 5 hand-authored maps (4 towns + overworld) and `generateDungeonFloor(depth, {skipStoryBoss})` for main, side (via `generateSideDungeonFloor`), and Abyss floors; `createEnemy` / `promoteEnemyRank` hold all enemy base stats and depth scaling.
- **`src/game/combat.ts`** — shadowcasting visibility, corner-safe pathfinding (`findPathNextStep`, `findPathPoints`, `findAutoExploreTarget`), enemy intent selection (telegraphs), `calculatePlayerHit`.
- **`src/game/skills.ts`** — attribute model, 3 skill trees, Prodigies, `computeDerivedStats` (the single source of derived player stats), `computeRespecPoints`.
- **`src/game/loot.ts`** — procedural item generation, starter/quest/named items, relic sets, rune enchants (`enchantEquipmentItem`), tempering (`upgradeEquipmentItem`), reroll, salvage.
- **`src/game/npcs.ts`** — all branching dialogue trees and `QUEST_DEFS`. Dialogue choices carry `condition` (flag/quest/item checks) and `action`/`extraActions` executed by App.
- **`src/game/codex.ts`** — bestiary definitions + Hunter/Slayer perks, 10 feat definitions, town upgrade definitions.
- **`src/game/cloudSave.ts`** — Firebase Auth (popup + redirect fallback), save packing: RLE + bitmask tile rows (`packZones`/`unpackZones`, backward-compatible with legacy rows), 940,000-byte cloud cap (`MAX_CLOUD_SAVE_BYTES`), structured error formatting.
- **`src/game/audio.ts`** — `SoundEngine`: synthesized one-shot SFX only. No music/ambience system exists.
- **`src/components/`** — `AsciiCanvas` (canvas renderer + minimap + touch), `ActionDock`, `TopHud`, and modals (Inventory, Merchant, Dialogue, QuestJournal, CharacterSkills, TownUpgrades, Travel, Legend, HallOfFame, EndPause, SpecialEncounter, TitleScreen).

## Data flow / protocols
- **Turn loop:** player action in App → player resolution (combat.ts math) → companion turn → enemy turns (intent selection in combat.ts, execution in App) → DoT/status ticks → autosave checks.
- **Saves:** `SavedBundle` (player, zones, currentZoneId, worldFlags, quests, merchantStocks, logs) → local: JSON with zones packed via `packZones`, under per-slot localStorage keys; cloud: Firestore doc via cloudSave, same packing, hard size cap. Saves have **no version field** (known fragility, see audit finding #7).
- **Dialogue:** component renders the node for `activeDialogue`; choice visibility is evaluated from `condition` against player + worldFlags + quests; App executes `action` + `extraActions` atomically on selection.

## Dependencies
- React 19, Vite 8 (rolldown), Tailwind CSS v4, TypeScript 7 — install needs `--legacy-peer-deps` on clean npm (peer conflict via `@firebase/eslint-plugin-security-rules` → `@typescript-eslint/parser` vs typescript ^7; see HANDOFF.md).
- Firebase 13 (Auth + Firestore) — optional at runtime; `firebase-applet-config.json` configures it. Firestore rules in `firestore.rules`, spec in `security_spec.md`.
- Node ≥24 recommended (Firebase declares `engines.node >= 24.12.0`).
- Portraits/backdrop are local JPEGs in `src/assets/images/` (~672 KB total) — no external assets at runtime beyond Google Fonts/Firebase.

## What's missing
- **No `package-lock.json` in the original handoff** — one was generated during the P0 fix pass (Nov 14, 2026, `npm install --legacy-peer-deps`) and ships with the fixed tree; commit it so installs stay reproducible.
- **No music/ambience layer** — `audio.ts` is SFX only; nothing substitutes today.
- **No ErrorBoundary** (pre-P0-fix state) — `src/main.tsx` renders `<App/>` bare; a render crash is a white screen.
- **No README** in the handoff (this doc set adds one linking the canonical docs).
- **Firestore rules are unproven live** — emulator assertions need a Java-enabled environment, which the handoff environment lacked (disclosed in HANDOFF.md).
