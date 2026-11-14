// Persisted player-facing settings (Phase 2 "top-end shell").
//
// Settings live outside the save-slot bundles on purpose: they are a
// per-device preference, not part of a run, so they survive New Adventure,
// Play Again, and slot deletes. Storage access is injectable so the
// load/save/validation logic can be unit-tested without a DOM.

export interface GameSettings {
  /** SFX volume, 0..1. */
  sfxVolume: number;
  /** Music volume, 0..1. */
  musicVolume: number;
  /** Master mute (covers SFX and music). */
  muted: boolean;
  /** Whether combat hit screen-shake is allowed. */
  screenShake: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  sfxVolume: 0.9,
  musicVolume: 0.65,
  muted: false,
  screenShake: true,
};

export const SETTINGS_KEY = 'elfstory-settings';
/** P0-era standalone mute key. Still read as a fallback and still written,
 *  so older builds / tooling that know this key keep working. */
export const LEGACY_MUTED_KEY = 'elfstory-muted';
export const TILE_SIZE_KEY = 'elfstory-tile-size';
export const TUTORIAL_DONE_KEY = 'elfstory-tutorial-done';

/** Tile zoom steps, mirrored from AsciiCanvas (kept in sync deliberately:
 *  the settings menu offers exactly these three sizes). */
export const TILE_SIZE_STEPS: readonly number[] = [28, 36, 44];
export const DEFAULT_TILE_SIZE = 36;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // storage access can throw in hardened/private contexts
  }
  return null;
}

export function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Load settings, tolerating: no storage, a missing blob, corrupt JSON,
 * partial blobs from older/newer builds, and the P0 legacy mute key.
 * Unknown fields are ignored; missing/invalid fields fall back to defaults.
 */
export function loadSettings(storage: StorageLike | null = defaultStorage()): GameSettings {
  const out: GameSettings = { ...DEFAULT_SETTINGS };
  if (!storage) return out;

  // Legacy P0 mute preference applies first so a blob without `muted`
  // still honours the player's older choice.
  try {
    const legacy = storage.getItem(LEGACY_MUTED_KEY);
    if (legacy !== null) out.muted = legacy === '1';
  } catch {
    // ignore — defaults stand
  }

  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Partial<GameSettings> | null;
    if (!parsed || typeof parsed !== 'object') return out;
    out.sfxVolume = clampVolume(parsed.sfxVolume, out.sfxVolume);
    out.musicVolume = clampVolume(parsed.musicVolume, out.musicVolume);
    out.muted = asBoolean(parsed.muted, out.muted);
    out.screenShake = asBoolean(parsed.screenShake, out.screenShake);
    return out;
  } catch {
    return out;
  }
}

export function saveSettings(settings: GameSettings, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    storage.setItem(LEGACY_MUTED_KEY, settings.muted ? '1' : '0');
  } catch {
    // preference just won't persist — never fatal
  }
}

export function loadTileSize(storage: StorageLike | null = defaultStorage()): number {
  if (!storage) return DEFAULT_TILE_SIZE;
  try {
    const v = Number(storage.getItem(TILE_SIZE_KEY));
    if (TILE_SIZE_STEPS.includes(v)) return v;
  } catch {
    // fall through to default
  }
  return DEFAULT_TILE_SIZE;
}

export function saveTileSize(tileSize: number, storage: StorageLike | null = defaultStorage()): void {
  if (!storage || !TILE_SIZE_STEPS.includes(tileSize)) return;
  try {
    storage.setItem(TILE_SIZE_KEY, String(tileSize));
  } catch {
    // ignore — preference just won't persist
  }
}

export function isTutorialDone(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return true; // no storage => never nag, treat as done
  try {
    return storage.getItem(TUTORIAL_DONE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTutorialDone(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TUTORIAL_DONE_KEY, '1');
  } catch {
    // ignore
  }
}
