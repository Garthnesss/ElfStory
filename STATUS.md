# ElfStory — Status

**Last updated:** 2026-11-14
**Phase:** Phase 0 — "Ship-safe" (P0 fix pass complete, verified; awaiting push to the new repo)

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
- **Repo — CREATED BY GARTH** (Nov 14, 2026): **`elfstory`** (his words; Muse's GitHub API route returned 401 Bad credentials the same day, so Muse cannot see or push to it — the fixed tree ships as a zip for Garth to drop in). The four canonical docs + README are in the project root so they land with the first real commit.
- **Difficulty rebalance (P1) — NOT STARTED**: queued behind P0 per Garth's pick.
- **Music / settings / tutorial / ending — NOT STARTED**: Phase 2.

## Decisions made
- Audit first, fix second (Nov 14, 2026, Garth).
- First fix pass = P0 exploits + save/confirm only; difficulty (P1) explicitly not bundled (Nov 14, 2026, Garth's tap on the decision pack).
- Four canonical docs live in the project root (standing rule, Oct 28, 2026; applied to ElfStory Nov 14, 2026).

## Open decisions (need Garth's call)
1. **P1 difficulty pass go-ahead** — after P0 lands, start Phase 1 rebalance, or play the P0 build first?
2. **Repo visibility** — repo `elfstory` created by Garth Nov 14, 2026; public/private was his call in that flow (not visible to Muse via the API route).
3. **Audit report in-repo?** — copy `elfstory-adversarial-audit.md` into the repo (e.g. `docs/`) or keep it in Garth's files only.

## Next actions
- [x] Muse: finish P0 (ErrorBoundary, regression tests, test/lint/build green — Nov 14, 2026).
- [ ] Garth: drop the fixed tree (`elfstory-p0-fixed.zip`) into the new `elfstory` repo and push; run the game once by hand.
- [ ] Garth: say the word on P1 (difficulty pass).
