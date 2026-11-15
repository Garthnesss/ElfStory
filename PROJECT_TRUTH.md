# ElfStory — Project Truth

## One line
ElfStory is a turn-based tactical dungeon-crawler RPG in the browser, starring elven outrider Garth Elfstrom descending beneath Oakhaven and Highspire to confront Sovereign Malakor.

## What it is
- A single-player, turn-based roguelite RPG: bump combat, telegraphed enemy windups, DoT/status play, procedural dungeon floors and loot.
- Built with React 19, TypeScript, Vite, Tailwind CSS v4, HTML5 Canvas tile/sprite rendering, procedural Web Audio SFX, and optional Firebase Auth + Firestore cloud saves.
- World scope (verified in code, Nov 14, 2026): 4 sanctuary towns (Oakhaven, Thornwick Fen, Cinderwatch Bastion, Highspire Citadel), the Silverwood Vale overworld, a 5-floor main descent, 3 side dungeons (7 floors), and a procedural Endless Abyss from floor 6.
- Systems: 3 intermixable skill trees + milestone Prodigies, procedural gear with rarity/affixes, named relics and 2-piece relic sets, Runeforge enchants + affix reroll, tempering (incl. a Masterwork step past the cap), town upgrades, a spirit companion with stances, bestiary perks, feats, branching NPC dialogue and 10 quests.
- Phase 8 systems (Nov 14, 2026): enemies have distinct behaviours, not one shared brain — casters hold a range band and kite, Blight Weavers summon no-reward Mire Mites, Ash Cultists mend allies (interruptible by stun), Shadow Stalkers lunge down telegraphed lines. Floor mutators (Gilded / Horde / Umbral / Vital Surge) texture Abyss and NG+ floors; shrine blessings are a repeatable, escalating gold sink; the Abyss rarity curve flattens past depth 5 so top-tier loot stays frequent but never guaranteed. Runs carry a shareable seed that fixes floor generation, five stackable challenge modifiers (Glass Cannon, No Draughts, Horde World, Frail Companion, Cursed Gold), a cause-of-death autopsy on the Fallen screen and in the Hall of Fame, and lifetime-gated unlocks (companion choice after a first victory; a Veteran's Cache inscription after three victories or Floor 12).
- Saves: 3 slots, local (localStorage, RLE-packed) + optional cloud (Firestore), Hall of Fame chronicles.

## What it is not
- Not a real-time / action RPG — every action is a turn.
- Not multiplayer — cloud saves are the only network feature.
- Not a commercial release yet — `package.json` version is `1.1.0` (Phase 8 + pre-ship fix pack). (The settings menu, generative music, and real ending sequence that were missing at handoff all shipped in Phase 2 — see STATUS.md.)

## Design-audit corrections (Nov 14, 2026)
Two "facts" from earlier docs and dialogue were wrong and are corrected wherever they appear:
- **The Contraband Cache has no fixed location.** Floor 1 is procedurally generated per run; the cache sits at the centre of a random room. Vance's dialogue no longer names a compass direction (an earlier line said "eastern chambers"; a playtest run happened to roll it southwest) — it points at the cache's pink ▤ glow instead.
- **The main quest is Kaelen's, not Vance's.** The Sovereign of Cinder commission comes from Kaelen in Highspire; Vance gives the Ledger side quest. The HUD tracker now derives the main objective from the correct quest.

## Non-negotiables
1. **HANDOFF.md claims must stay true.** That document has proven unusually honest — no invented systems. Any change that makes a HANDOFF claim false must update HANDOFF.md in the same change.
2. **Difficulty and content claims must be evidence-backed.** Numbers come from the engine code and simulation, not from design intent. (The Nov 14, 2026 audit found the *intended* difficulty and the *actual* difficulty badly diverged — see STATUS.md.)
3. **No silent destructive actions.** Deleting, overwriting, or restarting over a save requires explicit confirmation (established in the P0 fix pass, Nov 14, 2026) — through the in-game ConfirmModal, never a native browser dialog (Phase 8 fix pack).
4. **Firebase is optional.** The game must remain fully playable offline / signed-out; cloud failure must never block play.

## Confirmed by Garth
- Nov 14, 2026: Commissioned an adversarial audit — difficulty scaling, multi-hour content, and top-end completeness were the three questions.
- Nov 14, 2026: Chose "Fix the P0 exploits + save/confirm issues" as the first fix pass (over P1 difficulty rebalance, which shipped later the same day — boss HP pins 420/690/1000, see STATUS.md).
- Nov 14, 2026: Garth creates the GitHub repo himself; the four canonical docs are part of the project's first real state.

## Scope boundaries
- In scope: balance passes, the product shell (settings, music, tutorial, ending), content depth (set-piece rooms, new archetypes, new quest types) — sequenced in ROADMAP.md.
- Out of scope unless Garth says otherwise: multiplayer, monetization, native app packaging, a backend beyond Firebase saves.
