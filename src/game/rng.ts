// Seeded randomness (Phase 8 Tier 3 — run seeds).
//
// A run may carry a seed string (bundle field `runSeed`, chosen or
// generated at run creation). The seed governs WORLD GENERATION ONLY:
// dungeon-floor layout, room dressing, spawns, set pieces, ground-loot
// rolls made at generation time, and the Tier 2B mutator roll. Combat
// rolls, enemy AI rolls and kill-time drop rolls stay on Math.random —
// the seed makes the *place* reproducible and shareable, not the dice.
//
// Plumbing mirrors difficulty.ts: the active run seed lives in this
// module as a single source of truth (App.tsx sets it whenever a run
// starts, loads, or ascends — always BEFORE any zone is generated),
// because generateDungeonFloor is called from many places and its
// signature is load-bearing. Individual floors derive their own stream
// from (seed, zoneId) via floorRngFor, so generation order never matters:
// regenerating a floor that the save pruner dropped reproduces it
// exactly, mutator included.
//
// NG+ cycles fold into the derived stream (see generationSeedFor), so
// each cycle's world is a fresh layout while the run's displayed seed
// stays stable.

/** A uniform random source on [0, 1) — Math.random has this shape. */
export type Rng = () => number;

/** mulberry32: small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string — stable across runs and platforms. */
export function hashSeedString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The seed actually fed to floor derivation for a run: cycle 0 uses the
 * run seed verbatim; NG+ cycles suffix it, so an ascended world is
 * remade with fresh layouts instead of replaying cycle 0's dungeons.
 */
export function generationSeedFor(runSeed: string, cycle: number): string {
  const c = Number.isFinite(cycle) ? Math.max(0, Math.floor(cycle)) : 0;
  return c > 0 ? `${runSeed}#cycle${c}` : runSeed;
}

/** The dedicated random stream for one floor of one run. */
export function floorRngFor(generationSeed: string, zoneKey: string): Rng {
  return mulberry32(hashSeedString(`${generationSeed}::${zoneKey}`));
}

const SEED_WORDS = [
  'ashen', 'bramble', 'cinder', 'dusken', 'elder', 'ember', 'frost', 'gilded',
  'hollow', 'iron', 'kindle', 'lantern', 'mossy', 'night', 'oaken', 'pale',
  'quiet', 'runic', 'silver', 'thorn', 'umbral', 'velvet', 'whisper', 'wyrd',
];

/**
 * A fresh human-copyable run seed (e.g. "ember-k7x2q"), drawn from the
 * injected random source (Math.random in production).
 */
export function generateRunSeed(random: Rng = Math.random): string {
  const word = SEED_WORDS[Math.min(SEED_WORDS.length - 1, Math.floor(random() * SEED_WORDS.length))];
  let tail = '';
  for (let i = 0; i < 5; i++) {
    tail += Math.floor(random() * 36).toString(36);
  }
  return `${word}-${tail}`;
}

/**
 * Normalize player-supplied / stored seed text: trims, collapses to a
 * single line, caps the length, and maps empty or non-string input to
 * undefined (the unseeded legacy path).
 */
export function normalizeRunSeed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim().slice(0, 48);
  return clean.length > 0 ? clean : undefined;
}

// ------------------------------------------------------------ active seed

let currentRunSeed: string | undefined;

export function setCurrentRunSeed(seed: string | undefined): void {
  currentRunSeed = normalizeRunSeed(seed);
}

export function getCurrentRunSeed(): string | undefined {
  return currentRunSeed;
}

// ------------------------------------------- scoped generation-time RNG
//
// generateDungeonFloor threads its floor rng explicitly through its own
// rolls, but the loot generators it calls (loot.ts: generateProceduralItem
// / generateInscription / rollRarity) are also called at kill time and at
// chest-open, where rolls must stay on Math.random. Rather than threading
// an rng parameter through that whole call chain, generateDungeonFloor
// installs its floor rng here for the duration of the generation call and
// the loot generators draw through generationRandom(). Outside a
// generation call this is exactly Math.random, so kill-time drops,
// chest-open rolls, merchant stock and starter kit are untouched.

let generationRng: Rng | null = null;

/** Install the generation rng; returns the previous one for restore. */
export function setGenerationRng(rng: Rng | null): Rng | null {
  const prev = generationRng;
  generationRng = rng;
  return prev;
}

/** Draw from the active generation rng, or Math.random when none is set. */
export function generationRandom(): number {
  return generationRng ? generationRng() : Math.random();
}
