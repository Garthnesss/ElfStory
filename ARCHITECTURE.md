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
                     │  ├─ src/game/audio.ts    — Web Audio SFX + generative music
                     │  ├─ src/game/ambient.ts  — zone life: townsfolk, barks, critters
                     │  ├─ src/game/quests.ts   — quest "Next:" guidance derivation
                     │  ├─ src/game/difficulty.ts— difficulty tiers + NG+ cycle scalers
                     │  ├─ src/game/saveSlots.ts— SAVE_VERSION, slots, death-stamp policy
                     │  ├─ src/game/settings.ts — per-device settings blob + keymap
                     │  ├─ src/game/tutorial.ts — first-run tutorial steps
                     │  ├─ src/game/coachMarks.ts— one-time contextual hints
                     │  ├─ src/game/gamepad.ts  — gamepad polling/mapping
                     │  ├─ src/game/lifetime.ts — per-device lifetime stats
                     │  ├─ src/game/rng.ts      — run seeds: mulberry32 + per-floor streams
                     │  ├─ src/game/mutators.ts — floor mutators (Abyss / NG+)
                     │  ├─ src/game/blessings.ts— shrine blessings (repeatable gold sink)
                     │  ├─ src/game/challenges.ts— stackable challenge modifiers
                     │  ├─ src/game/autopsy.ts  — cause-of-death + run recap
                     │  ├─ src/game/unlocks.ts  — lifetime-gated new-game options
                     │  ├─ src/game/skillTargeting.ts— directional skill-confirm resolver
                     │  └─ src/game/cloudSave.ts— RLE zone packing, Firestore I/O
                     └─ src/components/*.tsx    — modals, HUD, dock, canvas
```

## Components
- **`src/App.tsx`** — owns all state (player, zones, flags, quests, merchants, logs), the turn loop, enemy/companion AI execution, hazard/DoT resolution, save/load, and every handler. Anything that happens in the game passes through here.
- **`src/game/world.ts`** — zone constructors for the 5 hand-authored maps (4 towns + overworld) and `generateDungeonFloor(depth, {skipStoryBoss})` for main, side (via `generateSideDungeonFloor`), and Abyss floors; `createEnemy` / `promoteEnemyRank` hold all enemy base stats and depth scaling.
- **`src/game/combat.ts`** — shadowcasting visibility, corner-safe pathfinding (`findPathNextStep`, `findPathPoints`, `findAutoExploreTarget`), enemy intent selection (telegraphs), `calculatePlayerHit`. Phase 8: the enemy behaviour brains are pure functions here too — caster range-band planning (`planCasterMove`), summon/mend gating, lunge line/destination, and the post-move lunge prime (`shouldPrimeLungeAfterMove`, added in the fix pack after round-3 play showed the turn-start prime almost never found a line).
- **`src/game/skills.ts`** — attribute model, 3 skill trees, Prodigies, `computeDerivedStats` (the single source of derived player stats), `computeRespecPoints`.
- **`src/game/loot.ts`** — procedural item generation, starter/quest/named items, relic sets, rune enchants (`enchantEquipmentItem`), tempering (`upgradeEquipmentItem`), reroll, salvage.
- **`src/game/npcs.ts`** — all branching dialogue trees and `QUEST_DEFS`. Dialogue choices carry `condition` (flag/quest/item checks) and `action`/`extraActions` executed by App.
- **`src/game/codex.ts`** — bestiary definitions + Hunter/Slayer perks, 10 feat definitions, town upgrade definitions.
- **`src/game/cloudSave.ts`** — Firebase Auth (popup + redirect fallback), save packing: RLE + bitmask tile rows (`packZones`/`unpackZones`, backward-compatible with legacy rows), 940,000-byte cloud cap (`MAX_CLOUD_SAVE_BYTES`), structured error formatting.
- **`src/game/audio.ts`** — `SoundEngine`: synthesized one-shot SFX plus a fully procedural generative music engine (pad chords + pentatonic melody; town/dungeon/boss themes chosen by `resolveMusicTheme`, crossfaded, gesture-gated).
- **`src/game/ambient.ts`** — zone life: roaming townsfolk, NPC bark lines, critter definitions, points of interest, per-biome dungeon ambience lines.
- **`src/game/quests.ts`** — stage-aware quest guidance ("Next:") derived once and shared by the Journal and the HUD `QuestTracker`.
- **`src/game/difficulty.ts`** — difficulty tiers (Story/Standard/Hardened) and NG+ cycle scalers; the single funnel is `scaleEnemyForDifficulty` inside `createEnemy` (plus `scaleXpForDifficulty` in the XP grant).
- **`src/game/saveSlots.ts`** — `SAVE_VERSION` (= 1), per-slot localStorage reads/writes with corruption isolation, legacy hydration, future-version refusal, and the hardcore death-stamp load policy (`canLoadBundle`). Also the extracted Phase 7-fix decision logic: `canOfferReturnToEnding` (town-only gate), `resolveLoadedState` (Hardcore hp ≤ 0 → GAME_OVER; non-Hardcore → 1 HP rescue), `clearCompletionStamp`, and the ConfirmModal copy (`overwriteConfirmMessage` / `deleteSlotConfirmMessage`).
- **`src/game/settings.ts`** — the per-device settings blob (volumes, mute, shake, zoom, keymap with swap-on-conflict, text size, pattern signals), merged over defaults so older blobs hydrate.
- **`src/game/tutorial.ts`** — the six-step first-run tutorial sequence (data + step gating).
- **`src/game/coachMarks.ts`** — one-time-per-device contextual hints, claimed at the real event points (first telegraph, first inscription, first Prodigy point).
- **`src/game/gamepad.ts`** — pure gamepad polling/mapping (standard layout, deadzone, hold-repeat), unit-tested; App feeds it into the same dispatch as the keyboard.
- **`src/game/lifetime.ts`** — per-device lifetime stats record (`elfstory-lifetime`, outside save bundles): expeditions, victories, deaths, kills, deepest floor, highest cycle.
- **`src/game/rng.ts`** — run-seed plumbing (Phase 8 Tier 3): mulberry32 PRNG + FNV-1a hashing; a run's seed derives an independent stream per floor from (seed, NG+ cycle, zone id), so any floor regenerates identically in any order — including Abyss floors dropped by the save pruner.
- **`src/game/mutators.ts`** — floor mutators (Gilded Depths / Horde / Umbral / Vital Surge): eligibility (Abyss depth ≥ 6 at 75%, every NG+ floor, never cycle-0 main/side floors), no-consecutive-repeat rolling, and the multipliers applied through the generation/loot/light funnels; hand-tuned bosses are exempt from stat multipliers.
- **`src/game/blessings.ts`** — shrine blessings: three 150-turn offerings (Might/Ward/Vigor) as ordinary player statuses, one active at a time, cost doubling per purchase within a cycle (`150·2ⁿ`, counter resets on ascension).
- **`src/game/challenges.ts`** — the five stackable challenge modifiers (Glass Cannon, No Draughts, Horde World, Frail Companion, Cursed Gold), chosen at run creation, stored on the bundle, applied through the derived-stat / consumable / spawn / companion / gold funnels; an absent list is the identity everywhere.
- **`src/game/autopsy.ts`** — `buildDeathCause` + `formatRunRecap` (pure): App records the last damage source at every player-damage site; the Fallen screen and the Hall of Fame chronicle entry name the cause and recap the run.
- **`src/game/unlocks.ts`** — lifetime-gated new-game options (pure predicates): companion-kind choice after 1 victory; Veteran's Cache (one bonus starting inscription) after 3 victories or lifetime Floor 12. `sanitizeUnlockChoices` strips locked options in the new-game path.
- **`src/game/skillTargeting.ts`** — the directional skill-confirm resolver (Phase 8 Tier 1): with a skill armed, a direction press casts at a valid target in that direction (mirroring the click path); invalid directions fall through to the normal move/bump, so input is never eaten.
- **`src/components/`** — `AsciiCanvas` (canvas renderer + minimap + touch), `ActionDock`, `TopHud`, and modals/screens (Inventory, Merchant, Dialogue, QuestJournal, CharacterSkills, TownUpgrades, Travel, Legend, HallOfFame, EndPause, SpecialEncounter, TitleScreen, SettingsModal, EndingScreen, CreditsScreen, QuestTracker, TutorialOverlay, ConfirmModal).

## Data flow / protocols
- **Turn loop:** player action in App → player resolution (combat.ts math) → companion turn → enemy turns (intent selection in combat.ts, execution in App) → DoT/status ticks → autosave checks.
- **Saves:** `SavedBundle` (player, zones, currentZoneId, worldFlags, quests, merchantStocks, logs) → local: JSON with zones packed via `packZones`, under per-slot localStorage keys; cloud: Firestore doc via cloudSave, same packing, hard size cap. Every bundle is stamped with `SAVE_VERSION` (= 1, `src/game/saveSlots.ts`): a missing version hydrates as legacy, a newer version is refused gracefully, and reads are per-slot isolated so one corrupt slot never breaks the others.
- **Dialogue:** component renders the node for `activeDialogue`; choice visibility is evaluated from `condition` against player + worldFlags + quests; App executes `action` + `extraActions` atomically on selection.
- **Seeded generation (Phase 8 Tier 3):** `generateDungeonFloor` threads its per-floor rng (from `rng.ts`) explicitly through layout, spawns, ground loot, and the mutator roll. The loot-generator call chain (`rollRarity` / `generateProceduralItem` / `generateInscription`) instead draws through a *scoped generation RNG*: a module-level source the generator installs for the duration of the call and restores afterwards — outside generation it is exactly `Math.random`, so kill-time drops and chest-open rolls are unchanged. Combat and AI dice are never seeded. **Documented limitation: chest *contents* roll at open time in App (only chest placement and ground loot are generation-time), so chest contents are not seed-stable.** NG+ folds the cycle into the generation seed (`seed#cycleN`) while the displayed run seed stays stable.
- **Destructive-action confirmation (Phase 8 fix pack):** App holds a `PendingConfirm` in state; the guarded handler (`startNewRun` body / slot delete) runs only when the `ConfirmModal` resolves it, via an exactly-once resolver (ref-consumed). Copy is pure (`saveSlots.ts`). This replaced the last two native `window.confirm` calls, which hung headless automation and clashed with the game's own UI.

## Dependencies
- React 19, Vite 8 (rolldown), Tailwind CSS v4, TypeScript 7 — install needs `--legacy-peer-deps` on clean npm (peer conflict via `@firebase/eslint-plugin-security-rules` → `@typescript-eslint/parser` vs typescript ^7; see HANDOFF.md).
- Firebase 13 (Auth + Firestore) — optional at runtime; `firebase-applet-config.json` configures it. Firestore rules in `firestore.rules`, spec in `security_spec.md`.
- Node ≥24 recommended (Firebase declares `engines.node >= 24.12.0`).
- Portraits/backdrop are local JPEGs in `src/assets/images/` (~672 KB total) — no external assets at runtime beyond Google Fonts/Firebase.

## What's missing
- **No `package-lock.json` in the original handoff** — one was generated during the P0 fix pass (Nov 14, 2026, `npm install --legacy-peer-deps`) and ships with the fixed tree; commit it so installs stay reproducible.
- **Music/ambience shipped** — generative music in `audio.ts` (Phase 2) and zone life in `src/game/ambient.ts` (Phase 3); no longer a gap.
- **ErrorBoundary shipped** — `src/main.tsx` defines an `ErrorBoundary` wrapping `<App/>` since the P0 pass; a render crash shows a recoverable screen instead of a white page.
- **No README** in the handoff (this doc set adds one linking the canonical docs).
- **Firestore rules are unproven live** — emulator assertions need a Java-enabled environment, which the handoff environment lacked (disclosed in HANDOFF.md).
