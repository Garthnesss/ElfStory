# ElfStory — Roadmap

Phases are gated on verification, not dates. A phase is done when STATUS.md
can state its claim with evidence behind it. Sequencing follows the
Nov 14, 2026 adversarial audit and Garth's picks from its decision pack.

## Phase 0 — "Ship-safe" (P0 fixes — Garth's pick, Nov 14, 2026)
- Close the 3 unbounded exploits: Vex's repeatable +15g tip, Runeforge value compounding on rune swaps, duplicate Whispering Bells in side dungeons (+ gated bell interaction in App).
- Confirmation on destructive actions: slot delete, New Adventure over an occupied slot, Play Again; remove Enter/Space auto-start on Title and auto-Play-Again on Game Over.
- Autosave: local save every 25 turns while playing + save on tab hide/close; persist mute and zoom preferences.
- ErrorBoundary around the app so a render crash shows a recoverable screen instead of a white page.
- Regression tests for the 3 exploits in `tests/engine.test.ts` style.
- Gate: `npm test` green including new regression tests, `tsc --noEmit` clean, `npm run build` clean, and each exploit's repro from the audit no longer works.

## Phase 1 — "Difficulty that scales" (P1 — DONE Nov 14, 2026; sim-verified, see STATUS.md and `tools/difficulty_sim.py`)
- Rebalance early game: enemy HP bases up ~2–3× and/or player ATK growth down, so floors 1–7 are fights, not one-shots.
- Scale story bosses to expected arrival level (Malakor especially; current: dies in 3–4 basic attacks); fix the inversion where side boss Kaelthar (359 HP / 57 ATK) massively out-stats the final boss.
- Scale Crimson Draught healing and companion HP/damage with level/depth (companion currently flat 24 HP, perma-dead from ~floor 5).
- Decide the intended Endless Abyss death curve and tune XP curve / enemy ATK growth to land there (currently: level stalls ~20, guaranteed death ~floor 25–40).
- Gate: simulation (audit's `difficulty_sim.py` method) shows TTK 2–5 on normal enemies per floor, bosses surviving a real rotation, and no boss inversion; plus a played full run by Garth.

## Phase 2 — "Top-end shell" (P2)
- Settings menu: volume, difficulty select, key rebinding, text size, colourblind-safe rarity/hazard signalling, screen-shake/flash toggles — all persisted.
- Music + ambience layer (procedural Web Audio in the existing SoundEngine style is acceptable).
- Guided onboarding: first-fight coaching + coach-marks when telegraphs, inscriptions, and prodigies first appear.
- Real ending: epilogue reflecting the Ledger and Bell choices, credits, completion stamp on the save slot.
- HUD objective tracker: surface the Quest Journal's existing stage-aware "Next:" text on the HUD.
- Autosave hardening + save version field and per-slot corruption isolation (audit finding #7).
- Gate: a cold player (not Garth, not the developer) completes floor 1 unaided; settings persist across reload; killing Malakor plays the ending.

## Phase 3 — "Content depth" (P3)
- 3–5 hand-built set-piece / puzzle rooms per biome (generator is currently bare rectangles only).
- 2–3 new enemy archetypes gated to side-dungeon / Abyss floors (nothing new currently arrives after floor 4).
- At least one quest type that is not kill/fetch-and-return; a second trap type.
- More relic sets (currently 2 sets / 4 pieces, duplicates guaranteed).
- Gate: unique-content novelty demonstrably extends into hour 3 of a first full clear (content audit recount).

## Explicitly later (not this roadmap)
- NG+ / ascension / permadeath modes — only after Phase 1 makes base difficulty coherent.
- Gamepad support and PWA/offline install — un-park if Garth targets a specific device for play.
- Platform achievements / lifetime stats beyond the 10 in-run feats — un-park with a distribution decision.
- Code-splitting the 1.22 MB single JS chunk — un-park if load time becomes a measured problem.
