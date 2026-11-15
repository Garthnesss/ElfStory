// Save-slot storage: versioning + per-slot corruption isolation (Phase 4).
//
// Bundles live in localStorage under `ashen_glyph_save_v2_slot_N` (the key
// scheme is unchanged from P0 — versioning lives INSIDE the bundle). Every
// bundle written by this build carries `version: SAVE_VERSION`.
//
// Loader rules:
// - Missing version field  => legacy bundle (P0–P3 era), hydrate normally.
// - version > SAVE_VERSION => written by a newer build; refuse gracefully
//   with a user-visible message, never throw, never white-screen.
// - Unparseable JSON / failed validation in ONE slot must not break the
//   Title Screen slot list or any other slot: each slot is read in its own
//   try/catch and reported as an independent SlotReadResult.
//
// The pure parse/validate logic takes raw strings / an injectable storage
// so it is unit-testable without a DOM (same pattern as settings.ts).

import { ChallengeId, normalizeChallenges } from './challenges';
import { DifficultyTier, normalizeCycle, normalizeDifficulty } from './difficulty';
import { normalizeRunSeed } from './rng';
import { StorageLike } from './settings';
import {
  GameState,
  Item,
  LogEntry,
  PlayerState,
  QuestProgress,
  SaveSlotId,
  WorldFlags,
  ZoneId,
  ZoneMap,
} from './types';

/** Current save-bundle format version. Bump when the bundle shape changes
 *  in a way older builds cannot safely read. */
export const SAVE_VERSION = 1;

export const LEGACY_SAVE_KEY = 'ashen_glyph_save_v1';
export const SLOT_KEY_PREFIX = 'ashen_glyph_save_v2_';

export const SAVE_SLOTS: SaveSlotId[] = ['slot_1', 'slot_2', 'slot_3'];

export interface SavedBundle {
  player: PlayerState;
  zones: Record<ZoneId, ZoneMap>;
  currentZoneId: ZoneId;
  worldFlags: WorldFlags;
  quests: Record<string, QuestProgress>;
  merchantStocks: Record<string, Item[]>;
  logs: LogEntry[];
  updatedAtMs?: number;
  /** Bundle format version (Phase 4). Absent on legacy (pre-P4) bundles. */
  version?: number;
  /** Per-run difficulty tier (Phase 4). Absent on legacy bundles => Standard. */
  difficulty?: DifficultyTier;
  /** Epoch ms when the run first reached the ending (Phase 4 completion
   *  stamp). Absent until the Sovereign falls; survives Abyss continuation. */
  completedAtMs?: number;
  /** Expedition time accumulated across sessions, in ms (tidy-up pass).
   *  Absent on older bundles => 0; the live session adds its own span, so
   *  the Ending Screen total survives save/load instead of restarting. */
  playTimeMs?: number;
  /** NG+ ascension cycle (Phase 5). Absent on pre-P5 bundles => cycle 0.
   *  Optional-with-default, so SAVE_VERSION stays 1. */
  ngPlusCycle?: number;
  /** Hardcore (permadeath) run (Phase 5). Set only at run creation; absent
   *  on pre-P5 bundles => false. */
  hardcore?: boolean;
  /** Epoch ms of a hardcore run's final death (Phase 5). Once stamped the
   *  run is fallen: the slot renders as fallen and can never be loaded. */
  deadAtMs?: number;
  /** Short human-readable death note (floor / zone / cycle) recorded with
   *  deadAtMs for the Title Screen's fallen-slot line. */
  deathNote?: string;
  /** Run seed (Phase 8 Tier 3). Every new run carries one (player-supplied
   *  or generated at creation); it governs dungeon-floor generation only.
   *  Absent on pre-Tier-3 bundles => the unseeded legacy path. */
  runSeed?: string;
  /** Challenge modifier ids chosen at run creation (Phase 8 Tier 3).
   *  Absent on pre-Tier-3 bundles => no challenges. */
  challenges?: string[];
}

export function getLocalSlotKey(slotId: SaveSlotId): string {
  return `${SLOT_KEY_PREFIX}${slotId}`;
}

export type SlotReadResult =
  | { status: 'empty' }
  | { status: 'ok'; bundle: SavedBundle }
  | { status: 'corrupt'; message: string }
  | { status: 'future-version'; version: number; message: string };

/** UI-facing summary of a slot that exists but cannot be loaded. */
export interface SlotIssue {
  kind: 'corrupt' | 'future-version';
  message: string;
}

export function corruptSlotMessage(): string {
  return 'Save data in this slot is corrupted and cannot be loaded. You can delete it and start fresh.';
}

export function futureVersionMessage(version: number): string {
  return `This save was written by a newer version of ElfStory (save format v${version}; this build reads up to v${SAVE_VERSION}) and cannot be loaded here.`;
}

/** Display label for a save slot ("Slot 1" / "Slot 2" / "Slot 3"). */
export function saveSlotLabel(slotId: SaveSlotId): string {
  return slotId === 'slot_1' ? 'Slot 1' : slotId === 'slot_2' ? 'Slot 2' : 'Slot 3';
}

/**
 * Phase 8 fix pack: the destructive-action confirmations moved from native
 * window.confirm to the in-game ConfirmModal; the copy lives here as pure
 * functions so it is behaviour-tested and identical at every call site.
 */
export function overwriteConfirmMessage(slotId: SaveSlotId): string {
  return `${saveSlotLabel(slotId)} already holds a saved expedition. Starting a new adventure will overwrite it. Continue?`;
}

export function deleteSlotConfirmMessage(slotId: SaveSlotId): string {
  return `Delete the saved expedition in ${saveSlotLabel(slotId)}? This removes both the local and cloud save and cannot be undone.`;
}

/**
 * Parse + validate one slot's stored JSON (the packed representation).
 * Never throws. A bundle is loadable when it parses to an object carrying a
 * player object; deeper hydration stays with the caller.
 */
export function parseStoredBundle(raw: string | null): SlotReadResult {
  if (raw === null || raw === '') return { status: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', message: corruptSlotMessage() };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { status: 'corrupt', message: corruptSlotMessage() };
  }
  const bundle = parsed as SavedBundle;
  if (!bundle.player || typeof bundle.player !== 'object') {
    return { status: 'corrupt', message: corruptSlotMessage() };
  }
  if (typeof bundle.version === 'number' && bundle.version > SAVE_VERSION) {
    return {
      status: 'future-version',
      version: bundle.version,
      message: futureVersionMessage(bundle.version),
    };
  }
  return { status: 'ok', bundle };
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // storage access can throw in hardened/private contexts
  }
  return null;
}

/** Read one slot with full isolation: any failure is reported in the
 *  result, never thrown, and never affects other slots. */
export function readSlotState(
  slotId: SaveSlotId,
  storage: StorageLike | null = defaultStorage()
): SlotReadResult {
  if (!storage) return { status: 'empty' };
  let raw: string | null;
  try {
    raw = storage.getItem(getLocalSlotKey(slotId));
  } catch {
    return { status: 'empty' };
  }
  return parseStoredBundle(raw);
}

/** Read every slot independently — a garbage string in one slot leaves the
 *  others fully readable. */
export function readAllSlotStates(
  storage: StorageLike | null = defaultStorage()
): Record<SaveSlotId, SlotReadResult> {
  return {
    slot_1: readSlotState('slot_1', storage),
    slot_2: readSlotState('slot_2', storage),
    slot_3: readSlotState('slot_3', storage),
  };
}

/** Stamp a bundle with the current format version before persisting. */
export function stampBundle(bundle: SavedBundle): SavedBundle {
  return { ...bundle, version: SAVE_VERSION };
}

/**
 * Record run completion on a bundle. Idempotent: the FIRST completion time
 * is kept, so continuing into the Endless Abyss (and re-saving) never moves
 * the stamp.
 */
export function withCompletionStamp(bundle: SavedBundle, nowMs: number): SavedBundle {
  if (typeof bundle.completedAtMs === 'number') return bundle;
  return { ...bundle, completedAtMs: nowMs };
}

/** The difficulty a bundle plays at — legacy bundles default to Standard. */
export function bundleDifficulty(bundle: SavedBundle): DifficultyTier {
  return normalizeDifficulty(bundle.difficulty);
}

// ------------------------------------------------------------- Phase 5

/** The NG+ cycle a bundle is on — pre-P5 bundles default to cycle 0. */
export function bundleCycle(bundle: SavedBundle): number {
  return normalizeCycle(bundle.ngPlusCycle);
}

/** Whether a bundle is a hardcore (permadeath) run. Default false. */
export function bundleHardcore(bundle: SavedBundle): boolean {
  return bundle.hardcore === true;
}

// ------------------------------------------------------------- Phase 8 Tier 3

/** The run seed a bundle generates its world from — pre-Tier-3 bundles
 *  have none and stay on the unseeded legacy path. */
export function bundleSeed(bundle: SavedBundle): string | undefined {
  return normalizeRunSeed(bundle.runSeed);
}

/** The challenge list a bundle plays under — invalid entries dropped,
 *  pre-Tier-3 bundles default to none. */
export function bundleChallenges(bundle: SavedBundle): ChallengeId[] {
  return normalizeChallenges(bundle.challenges);
}

/** Whether a bundle is a fallen hardcore run (death stamp present). */
export function isBundleDead(bundle: SavedBundle): boolean {
  return typeof bundle.deadAtMs === 'number';
}

/**
 * Load policy for a parsed bundle: everything loads except a fallen
 * hardcore run — death is final, so a dead bundle can be deleted but
 * never resumed.
 */
export function canLoadBundle(bundle: SavedBundle): boolean {
  return !isBundleDead(bundle);
}

export function fallenBundleMessage(bundle: SavedBundle): string {
  const note = bundle.deathNote ? ` ${bundle.deathNote}.` : '';
  return `This delver has fallen — in Hardcore, death is final.${note} The slot can be deleted, but the run cannot be resumed.`;
}

/**
 * Stamp a bundle with its final death (hardcore). Idempotent: the FIRST
 * death stamp wins, so later saves of the fallen run never move it.
 */
export function withDeathStamp(
  bundle: SavedBundle,
  nowMs: number,
  deathNote?: string
): SavedBundle {
  if (isBundleDead(bundle)) return bundle;
  return { ...bundle, deadAtMs: nowMs, deathNote };
}

// ------------------------------------------- Audit fixes (Nov 14, post-P7)
// Decision logic for the Phase 7 regressions found by the external audit,
// extracted as pure functions so behaviour — not source text — is tested.

/**
 * Whether the pause menu may offer "Return to the Ending" (Phase 7).
 *
 * The button reopens the Ending Screen, whose Ascend action full-heals,
 * keeps all gear, and clears any death stamp — so offering it anywhere
 * once Malakor is dead hands a Hardcore player a sealed-death escape
 * (pause mid-Abyss at 1 HP, ascend, never stamped). The offer is now
 * restricted to sanctuary towns (`ZoneMap.isTown` — the zones where the
 * game already guarantees no combat) in EVERY mode: the feature's real
 * purpose is ascend-after-reload, and a reloaded completed run resumes
 * in or can stroll to a town in normal play, while the Abyss is never
 * a safe zone.
 */
export function canOfferReturnToEnding(state: {
  malakorDefeated: boolean;
  isTown: boolean;
}): boolean {
  return state.malakorDefeated && state.isTown;
}

export interface LoadedStateResolution {
  /** The game state a loaded bundle should enter. */
  gameState: GameState;
  /** The HP the loaded player should start with. */
  hp: number;
}

/**
 * How a loaded bundle's hp resolves into a starting state (Phase 7 fix).
 *
 * A bundle can be saved on the death turn itself (hp <= 0, before the
 * death flow resolved it). Phase 7 routed every such load to GAME_OVER,
 * which for a NON-hardcore run locks the slot: the only exits wipe the
 * run or abandon it, and the death is never recorded. Policy:
 * - hp > 0: play on, HP untouched (both modes).
 * - Hardcore, hp <= 0: GAME_OVER — death is final; the GAME_OVER effect
 *   applies the death stamp, closing the tab-close race as well.
 * - Non-hardcore, hp <= 0: PLAYING with HP clamped to 1 — the
 *   pre-Phase-7 rescue (load, drink a draught, continue).
 */
export function resolveLoadedState(input: {
  hp: number;
  hardcore: boolean;
}): LoadedStateResolution {
  if (input.hp > 0) return { gameState: 'PLAYING', hp: input.hp };
  if (input.hardcore) return { gameState: 'GAME_OVER', hp: input.hp };
  return { gameState: 'PLAYING', hp: 1 };
}

/**
 * Remove a bundle's completion stamp (the inverse of withCompletionStamp).
 *
 * Ascension into NG+ starts a fresh cycle, so the previous cycle's stamp
 * must not ride along: the Title Screen's "✦ Completed" badge should
 * describe the CURRENT cycle, and the completion-stamp effect (which
 * fires only while no stamp exists) must be free to stamp the new
 * cycle's own victory. Lifetime stats keep the record of past victories.
 * Returns the bundle unchanged when it carries no stamp.
 */
export function clearCompletionStamp(bundle: SavedBundle): SavedBundle {
  if (bundle.completedAtMs === undefined) return bundle;
  const next = { ...bundle };
  delete next.completedAtMs;
  return next;
}
