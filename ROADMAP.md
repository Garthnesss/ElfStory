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

## Phase 2 — "Top-end shell" (P2 — DONE Nov 14, 2026 for the five delivered features; see STATUS.md)
- Settings menu ✔: SFX/music volume sliders, master mute, screen-shake toggle, tile zoom — persisted per-device and applied live. (Not delivered: difficulty select, key rebinding, text size, colourblind-safe signalling — carried to follow-ups below.)
- Music + ambience layer ✔: procedural Web Audio in the SoundEngine — generative minor-key pad + melody themes for town/overworld, dungeon, and boss, crossfading on zone type, gesture-gated start.
- Guided onboarding ✔: six-step first-run coach-mark sequence (move, talk, fight, skills, potion, rest/save), once per device, skippable, auto-advancing on the coached action, replayable from the Guide. (Not delivered: contextual coach-marks at first telegraph/inscription/prodigy sighting.)
- Real ending ✔: dedicated ending screen with choice-reflecting epilogue (Ledger, Bell, Blight, weakened ward), run stats, and Continue-to-Abyss / Play Again / Title exits. (Not delivered: credits roll, completion stamp on the save slot.)
- HUD objective tracker ✔: the Journal's stage-aware "Next:" text, derived in `src/game/quests.ts`, pinned on the HUD (main + tracked side quest).
- Carried to follow-ups: autosave hardening + save version field and per-slot corruption isolation (audit finding #7); difficulty select / key rebinding / text size / colourblind signalling; ending credits + save-slot completion stamp.
- Gate: a cold player (not Garth, not the developer) completes floor 1 unaided; settings persist across reload; killing Malakor plays the ending. (Settings persistence and the ending path are test/build-verified; the cold-player gate is still Garth's to run.)

## Phase 3 — "Content depth" (P3) — DONE Nov 14, 2026 (working tree; tests 49/49, tsc + build clean; awaiting Garth's review/push + hand play-check)
- ✅ **Set-piece rooms** — one hand-built room injected per floor by the generator (interior-only, so the reachability guarantee, boss floors, and story nodes are untouched): **Whispering Sepulcher** (barrow + Floor 1: pillar corners, twin trapped sarcophagi, epitaph stele), **Spore-Heart Chamber** (mire: cursed-altar "heart" ringed by live spore pools), **Rime Circle** (frost: vent ring + pillars around a Rimebound Cache), **Sealed Brazier Hall** (main descent F2+: light all 3 Seal Braziers and the rune-sealed treasure door grinds open; sepulcher is the fallback when no room fits the nook). Stress check: 1,560 generated floors, 0 errors, a set piece on ~every floor.
- ✅ **New enemy archetypes (3)** — gated to side-dungeon biome pools + the Abyss pool, never on main floors 1–5: **Grave Husk** (barrow; Heavy-Strike telegraphs + *Deathless* — the first killing blow revives it at 30% HP, hooked into the single death funnel `handleEnemyDeath`), **Spore Hulk** (mire; elite Ground-Slam tank that *bursts* for damage + Poison when slain at point blank), **Rime Revenant** (frost; elite ranged hexer whose Rime Bolts also Chill). Full integration: createEnemy stats on the P1 scale conventions, bestiary entries, sprites, intent tables.
- ✅ **New quest type** — **"Charting the Deep Roads"** (survey/exploration): Rowan commissions transcribing 6 carved steles (‡) anywhere in the realm; progress derives from `WorldFlags.readLoreIds`, pre-acceptance reading counts, journal + HUD tracker wired (`quests.ts`), reward = Surveyor's Star-Compass + 60g + 120 XP. No kills, no fetch-and-return.
- ✅ **Second trap type** — **Venom Dart Snare** (`dart_trap`): wall-mounted, harder to spot (Agility 4+ disarms vs 3+ for spikes), damage + Poison (3t); generator scatter from depth 2 down, set-piece placements, canvas structure art, auto-explore avoidance, Legend + hover-hint entries.
- ✅ **More relic sets** — 2 → **4 sets / 8 pieces**: **Thornbound Covenant** (Thornbound Circlet + Fenroot Talisman; +3 ATK · +4 Thorns · +3% Lifesteal · +12 Max HP) and **Rimebound Regalia** (Glacierheart Pendant + Rimebound Plate; +5 DEF · +8% Dodge · +10 Max Mana · +8 Max HP), bonuses wired in `computeDerivedStats`, depth-gated random set-relic pool, fixed values (P0 Runeforge rule intact).
- ✅ **Overworld & zone life** (Garth's scope addition, same tranche) — 5 new ambient townsfolk (Pell, Wren, Tomas, Fenwick, Sella) who wander a few tiles from their posts; bark lines for all 18 NPCs surfaced in the log near townsfolk; 6 critter kinds (vale rabbit, ash fox, cinder crow, cave bat, town cat, fen frog) as non-combat, non-blocking wildlife that idles and flees; 4 points of interest (Standing Stones of the Vale, Hunter's Cold Camp, Roadside Shrine, the Old Outpost Oak) with flavor + a tiny one-time discovery; per-biome dungeon ambience log lines (9 biomes × 3). Ambient state is save-safe: critters persist as plain zone data, old saves hydrate with them absent.
- **Content recount (Phase 3 gate):** enemy archetypes 14 → **17** (normal 11 → 14); relic sets 2 → **4** (pieces 4 → **8**); trap types 1 → **2**; quests 9 → **10** with **2** non-kill/fetch types (attunement + survey); set-piece rooms **4 designs**, 1 per floor across all 13 dungeon floors; ambient: **5** roaming townsfolk, **18** barking NPCs, **6** critter kinds, **4** POIs, **27** dungeon ambience lines. Novelty now lands in every biome and keeps arriving through the side dungeons and Abyss — the hour-3 content cliff is dressed.
- Follow-ups deliberately left out: difficulty select / save-version field (Phase 2 leftovers), critters in the hover inspector, a second survey-style quest chain, set-piece variants per floor band (one design per biome ships first).

## Explicitly later (not this roadmap)
- NG+ / ascension / permadeath modes — only after Phase 1 makes base difficulty coherent.
- Gamepad support and PWA/offline install — un-park if Garth targets a specific device for play.
- Platform achievements / lifetime stats beyond the 10 in-run feats — un-park with a distribution decision.
- Code-splitting the 1.22 MB single JS chunk — un-park if load time becomes a measured problem.
