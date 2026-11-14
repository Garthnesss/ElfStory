# ElfStory — Status

**Last updated:** 2026-11-14
**Phase:** Phase 3 — "Content depth" (P3 complete in the working tree, verified by tests + typecheck + build + difficulty sim; awaiting Garth's review/push and a hand play-check)

## Where things stand
- **Base game — RUNS** (verified Nov 14, 2026): clean install (`--legacy-peer-deps`, Node 24), `npm test` 11/11 pass, `tsc --noEmit` clean, `vite build` clean (single 1.22 MB JS chunk). HANDOFF.md claims audited against code and found unusually honest — all claimed systems present.
- **Adversarial audit — DONE** (Nov 14, 2026): full report at `~/workspace/your_files/elfstory-adversarial-audit.md` (Garth's files, to be copied into the repo if he wants it there). Headlines: difficulty broken (one-shots floors 1–7, story bosses die in 3–4 hits, side boss Kaelthar out-stats final boss Malakor, Abyss death guaranteed ~floor 25–40), unique content ~2 h of a 2.7–3.8 h full clear, 3 unbounded exploits, product shell missing (settings/music/tutorial/ending).
- **P0 fixes — DONE, VERIFIED** (Nov 14, 2026): `npm test` **14/14 pass** (11 original + 3 new P0 regression tests), `tsc --noEmit` clean, `vite build` clean. Changes:
  - Vex tip: one-time `vexTipClaimed` world flag gates the dialogue choice and is set when the tip is taken.
  - Runeforge: `enchantEquipmentItem` no longer raises item value (was ×1.15 per swap, compounding).
  - Whispering Bell: side-dungeon generation (`skipStoryBoss`) no longer spawns story quest nodes (bell, contraband cache, herb node); App additionally treats any bell outside `dungeon_3`, after a bell fate, or while already carrying the Bell as inert.
  - Confirms: `handleStartNew` (covers New Adventure + Play Again) and `handleDeleteSlot` now `window.confirm` when the slot is occupied; Title Screen Enter/Space auto-start removed; Game Over Enter/Space no longer triggers Play Again.
  - Autosave: local save every 25 turns while PLAYING + on tab hide/close (local-only); mute persisted (`elfstory-muted`), zoom persisted (`elfstory-tile-size`).
  - ErrorBoundary in `src/main.tsx`: a render crash now shows a recoverable "lantern guttered out" screen with reload, instead of a white page.
  - Not play-tested in a live browser by Muse (no browser on the VM reaches the local build) — the verification is test/typecheck/build + code-level repro closure. Garth's first run in the new repo is the by-hand check.
- **Repo — LIVE** (Nov 14, 2026): **Garthnesss/ElfStory** (public). P0 tree pushed by Muse via the official GitHub connector (commit `42e0b5f`); the 14 JPGs could not ride the text-only snapshot push and were committed on the Mac clone (`e46a711`) — one `git push` from Garth's GUI Terminal (or `~/sync-all.sh`) lands them. (The legacy gh-api route 401s; the official connector is the working route.)
- **P1 difficulty rebalance — DONE, VERIFIED** (Nov 14, 2026; `npm test` **17/17**, `tsc` clean, `vite build` clean; tuning verified with `tools/difficulty_sim.py`, which parses its constants from the game source so it cannot drift):
  - Normal enemies: base HP roughly ×2.3 and early ATK up — F1 trash now takes 2–3 hits instead of being one-shot, and F1–F2 hits register past starter DEF.
  - Story bosses scaled to expected arrival level: Vaelen 95→420 HP, Serath 145→690, Malakor 230→1000 HP / 24→36 ATK (TTK ≈ 8 / 8 / 10 basic attacks). Bell-weakened Malakor now loses 180 HP instead of 45.
  - Kaelthar inversion fixed: side bosses get an explicit tuning table in `generateSideDungeonFloor` (Morvath/Vexis 376 HP, Kaelthar 513 HP / 34 ATK — all below Malakor); F5 vault guards no longer spawn a depth deeper at randboss rank.
  - XP curve ×1.42 → ×1.30 per level so levels keep arriving in the Abyss; simulated full-clear death window moves from ~F25–40 to roughly **F33–42**, with pressure building gradually (hits-to-die 8 at F15 → ~3 at F40). Estimate from the sim, not a playthrough guarantee.
  - Potions scale: Crimson Draught heals max(flat, 35% of Max HP), Aether Vial restores max(flat, 40% of Max Mana).
  - Companions scale: max HP grows per level (lynx 24 + 7/level, owl 20 + 5/level, applied at bond, on level-up, and on companion swap), damage scaling raised, damage-intake reduction grows every 3 levels.
- **P2 top-end shell — DONE, VERIFIED** (Nov 14, 2026; `npm test` **35/35** — 17 prior + 18 new Phase 2 tests — `tsc --noEmit` clean, `vite build` clean; built, not yet hand-played):
  - **Settings menu** (`src/components/SettingsModal.tsx`, reachable from the Title Screen and the Pause menu): SFX volume, music volume, master mute, screen-shake toggle, and the map tile zoom — all applied live and persisted per-device via `src/game/settings.ts` (new `elfstory-settings` blob; the P0 `elfstory-muted` key is still honoured on load and rewritten on save, and old saves need no migration since settings live outside save bundles).
  - **Music** (`src/game/audio.ts`): fully procedural Web Audio in the existing SoundEngine — generative pad chords + sparse pentatonic melody in a minor key, three themes (calm town/overworld in D minor, tense dungeon in A minor, driving boss variant with root pulse) chosen by `resolveMusicTheme`, crossfade on theme change, starts only after the first user gesture, honours music volume + mute. No audio asset files.
  - **Tutorial** (`src/game/tutorial.ts` + `TutorialOverlay`): six coach-mark steps (move → talk → fight → skills → potion → rest/save) on a fresh expedition, once per device (`elfstory-tutorial-done`), auto-advancing when the coached action is performed, always skippable/advanceable by hand, non-blocking, and re-openable from the Guide ("Replay the First-Run Tutorial").
  - **Real ending** (`src/components/EndingScreen.tsx`): killing Malakor now opens a dedicated ending screen instead of the pause modal — epilogue text that reflects the Bell, Ledger, and Blight choices plus the weakened-ward flag, run stats (level, kills, turns, gold, expedition time), and three exits: Continue into the Endless Abyss (resumes play at the Floor 5 stair), Play Again, Return to Title (Hall of Fame stays one tap away). Victory flag/chronicle behaviour is unchanged.
  - **Quest tracker** (`src/components/QuestTracker.tsx`): the Journal's stage-aware "Next:" guidance is now derived in `src/game/quests.ts` (single source of truth — the Journal imports it too) and pinned on the HUD: main quest on top, tracked side quest beneath it, compact on small screens, hidden while dialogues/prompts own the screen.
- **P3 content depth — DONE, VERIFIED** (Nov 14, 2026; `npm test` **49/49** — 35 prior + 14 new Phase 3 tests — `tsc --noEmit` clean, `vite build` clean; P1 tuning untouched and re-verified with `tools/difficulty_sim.py`, which now also prints the new archetypes):
  - **Set-piece rooms** (`generateDungeonFloor` in `src/game/world.ts`): one hand-built room per floor, interior-only so the reachability guarantee/boss/story placement is preserved — Whispering Sepulcher (barrow + F1), Spore-Heart Chamber (mire), Rime Circle (frost), Sealed Brazier Hall (main F2+: light 3 Seal Braziers → the Brazier-Sealed Door opens; App `interactWithTile`). 1,560-floor stress run: 0 errors, set piece on ~every floor, all ordinary chests reachable.
  - **New enemies**: Grave Husk (Deathless — first killing blow revives at 30% HP via the `handleEnemyDeath` funnel + survivor-set restore in `runEnemyTurns`), Spore Hulk (elite slam tank, death-burst + Poison at point blank), Rime Revenant (elite ranged, Rime Bolts Chill). Gated to side-branch pools + Abyss pool; bestiary + sprites + intents fully wired. Sim lines sit inside P1 bands (e.g. Husk @depth 3: 103 HP, TTK 1.4 + the free revive; Hulk @depth 4: 239 HP, TTK 2.7; Revenant @depth 5: 119 HP, TTK 1.1, 27 hits-to-die — glass cannon by design).
  - **Survey quest** "Charting the Deep Roads" (`deep_survey`): transcribe 6 steles anywhere; progress from `readLoreIds` (pre-acceptance reading counts); Rowan gives/turns in; tracker + journal hints wired; reward Surveyor's Star-Compass.
  - **Venom Dart Snare** (`dart_trap`): second trap type — Agility 4+ to spot, damage + Poison (3t), depth-2+ scatter, canvas art, Legend/hover entries, auto-explore avoids revealed ones.
  - **Relic sets 2 → 4** (Thornbound, Rimebound; 8 pieces total): bonuses in `computeDerivedStats`, depth-gated drop pool, fixed values.
  - **Overworld & zone life** (`src/game/ambient.ts`): 5 roaming townsfolk with dialogue, bark lines for all 18 NPCs, 6 critter kinds (non-combat/non-blocking, flee the player), 4 POIs (Standing Stones, Hunter's Camp, Roadside Shrine, Old Outpost Oak), per-biome dungeon ambience lines. Save-safe: critters persist as plain zone data; pre-P3 saves hydrate unchanged (round-trip tested).

## Decisions made
- Audit first, fix second (Nov 14, 2026, Garth).
- First fix pass = P0 exploits + save/confirm only; difficulty (P1) explicitly not bundled (Nov 14, 2026, Garth's tap on the decision pack).
- Four canonical docs live in the project root (standing rule, Oct 28, 2026; applied to ElfStory Nov 14, 2026).

## Open decisions (need Garth's call)
1. **Push the JPG commit** — Mac clone has `e46a711` (the 14 portraits/backdrop) committed and ready; needs one `git push` from the GUI Terminal (SSH sessions can't read the keychain) or a `~/sync-all.sh` run.
2. **By-hand play check** — P0 + P1 are test/sim/build-verified, not yet hand-played. First run: does F1 feel fair at 2–3 hits per enemy, and do the bosses feel like bosses?
3. **Audit report in-repo?** — copy `elfstory-adversarial-audit.md` into the repo (e.g. `docs/`) or keep it in Garth's files only.

## Next actions
- [x] Muse: finish P0 (ErrorBoundary, regression tests, test/lint/build green — Nov 14, 2026).
- [x] Muse: P1 difficulty rebalance (Nov 14, 2026) and P2 top-end shell (Nov 14, 2026) — tests/typecheck/build green for both.
- [x] Muse: P3 content depth (Nov 14, 2026) — set pieces, 3 archetypes, survey quest, dart traps, 2 relic sets, ambient life; tests/typecheck/build/sim green.
- [ ] Garth: review + push the P2 + P3 working tree; run the game once by hand (fresh expedition: does the tutorial read well, does the music sit right, does the ending land? Plus P3: find a Sealed Brazier Hall, a Spore Hulk, and Rowan's survey).
- [ ] Garth: push the JPG commit from the Mac clone (see Open decisions #1).
