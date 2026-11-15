// Challenge modifiers (Phase 8 Tier 3).
//
// Optional, stackable run modifiers chosen on the Title Screen beside
// difficulty and hardcore, stored on the save bundle (`challenges`) and
// carried through NG+ with the run. Each modifier acts through ONE
// existing funnel, and every function here is the identity when its
// modifier is absent — a run with no challenges (including every legacy
// bundle) plays exactly the pre-Tier-3 game:
//
// - glass_cannon    → computeDerivedStats (skills.ts) via
//                     adjustDerivedForChallenges: ATK ×1.30, max HP ×0.70.
// - no_draughts     → handleUseConsumable (App) via
//                     canUseConsumableWithChallenges: Crimson Draughts
//                     and Aether Vials cannot be drunk (other consumables
//                     unaffected; buying them is still allowed).
// - horde_world     → generateDungeonFloor (world.ts) via
//                     challengeSpawnCount: +30% spawn counts, using the
//                     same fractional-remainder approach as the Horde
//                     mutator (mutators.ts hordeSpawnCount).
// - frail_companion → companionMaxHpFor / the companion damage formula
//                     (App) via the two companion multipliers below:
//                     max HP ×0.50, damage ×0.75.
// - cursed_gold     → handleEnemyDeath (App) via enemyGoldWithChallenges:
//                     enemy gold drops halved (quest/feat gold untouched).
//
// The active list also lives in this module as a single source of truth
// (mirroring difficulty.ts), because world generation and the derived-stat
// funnel read it outside React state. App.tsx sets it whenever a run
// starts or loads — always BEFORE any zone is generated.

import { ConsumableKind, DerivedStats } from './types';

export type ChallengeId =
  | 'glass_cannon'
  | 'no_draughts'
  | 'horde_world'
  | 'frail_companion'
  | 'cursed_gold';

export interface ChallengeDef {
  id: ChallengeId;
  name: string;
  blurb: string;
}

export const CHALLENGE_DEFS: Record<ChallengeId, ChallengeDef> = {
  glass_cannon: {
    id: 'glass_cannon',
    name: 'Glass Cannon',
    blurb: 'Your attack rises 30% — and your max HP falls 30%. Kill fast, or be killed.',
  },
  no_draughts: {
    id: 'no_draughts',
    name: 'No Draughts',
    blurb: 'Crimson Draughts and Aether Vials cannot be drunk on this run. Braziers, rest and level-ups still restore you.',
  },
  horde_world: {
    id: 'horde_world',
    name: 'Horde World',
    blurb: 'Every dungeon chamber crowds with 30% more foes.',
  },
  frail_companion: {
    id: 'frail_companion',
    name: 'Frail Companion',
    blurb: 'Your spirit companion fights at half health and three-quarter strength.',
  },
  cursed_gold: {
    id: 'cursed_gold',
    name: 'Cursed Gold',
    blurb: 'Foes drop half the gold. Quest rewards are unaffected — the curse only taints the slain.',
  },
};

export const CHALLENGE_ORDER: ChallengeId[] = [
  'glass_cannon',
  'no_draughts',
  'horde_world',
  'frail_companion',
  'cursed_gold',
];

export function isChallengeId(value: unknown): value is ChallengeId {
  return typeof value === 'string' && (CHALLENGE_ORDER as string[]).includes(value);
}

/**
 * Normalize an arbitrary stored/chosen value into a clean challenge list:
 * valid ids only, deduplicated, in canonical display order. Anything
 * unrecognized (including a legacy bundle's missing field) is no
 * challenges at all.
 */
export function normalizeChallenges(value: unknown): ChallengeId[] {
  if (!Array.isArray(value)) return [];
  const present = new Set(value.filter(isChallengeId));
  return CHALLENGE_ORDER.filter((id) => present.has(id));
}

export function hasChallenge(
  challenges: readonly ChallengeId[] | undefined | null,
  id: ChallengeId
): boolean {
  return !!challenges && challenges.includes(id);
}

/** Display line for menus and end screens; undefined when none are active. */
export function challengeDisplayLine(
  challenges: readonly ChallengeId[] | undefined | null
): string | undefined {
  const clean = normalizeChallenges(challenges ? [...challenges] : undefined);
  if (clean.length === 0) return undefined;
  return `Challenges: ${clean.map((id) => CHALLENGE_DEFS[id].name).join(' · ')}`;
}

// ------------------------------------------------------------ active list

let currentChallenges: ChallengeId[] = [];

export function setCurrentChallenges(challenges: readonly ChallengeId[]): void {
  currentChallenges = normalizeChallenges([...challenges]);
}

export function getCurrentChallenges(): ChallengeId[] {
  return currentChallenges;
}

// ------------------------------------------------------------ glass cannon

export const GLASS_CANNON_ATK_MULT = 1.3;
export const GLASS_CANNON_HP_MULT = 0.7;

/**
 * Fold Glass Cannon into a finished DerivedStats block. Returns the input
 * object unchanged (same reference) when the modifier is absent, so the
 * no-challenge path through computeDerivedStats is a true identity.
 */
export function adjustDerivedForChallenges(
  stats: DerivedStats,
  challenges: readonly ChallengeId[]
): DerivedStats {
  if (!hasChallenge(challenges, 'glass_cannon')) return stats;
  return {
    ...stats,
    atk: Math.max(1, Math.round(stats.atk * GLASS_CANNON_ATK_MULT)),
    maxHp: Math.max(1, Math.round(stats.maxHp * GLASS_CANNON_HP_MULT)),
  };
}

// ------------------------------------------------------------ frail companion

export const FRAIL_COMPANION_HP_MULT = 0.5;
export const FRAIL_COMPANION_DMG_MULT = 0.75;

/** Companion max HP under the active challenges (identity without Frail Companion). */
export function companionMaxHpWithChallenges(
  baseMaxHp: number,
  challenges: readonly ChallengeId[]
): number {
  if (!hasChallenge(challenges, 'frail_companion')) return baseMaxHp;
  return Math.max(1, Math.round(baseMaxHp * FRAIL_COMPANION_HP_MULT));
}

/** One companion hit's damage under the active challenges (identity without Frail Companion). */
export function companionDamageWithChallenges(
  baseDamage: number,
  challenges: readonly ChallengeId[]
): number {
  if (!hasChallenge(challenges, 'frail_companion')) return baseDamage;
  return Math.max(1, Math.round(baseDamage * FRAIL_COMPANION_DMG_MULT));
}

// ------------------------------------------------------------ no draughts

/** Consumable kinds sealed by No Draughts: the two drinkable vials. */
export const DRAUGHT_KINDS: readonly ConsumableKind[] = ['heal_potion', 'mana_potion'];

/**
 * Whether a consumable may be used under the active challenges. Only the
 * drinkable draughts/vials are blocked by No Draughts; talismans, blink
 * scrolls and darts are not drinks and stay usable.
 */
export function canUseConsumableWithChallenges(
  kind: ConsumableKind,
  challenges: readonly ChallengeId[]
): boolean {
  if (!hasChallenge(challenges, 'no_draughts')) return true;
  return !DRAUGHT_KINDS.includes(kind);
}

// ------------------------------------------------------------ horde world

export const HORDE_WORLD_SPAWN_MULT = 1.3;

/**
 * Spawn count under Horde World: +30% in expectation, resolved with the
 * same fractional-remainder roll as the Horde mutator so small room
 * counts still average out over a floor. Identity (and no roll consumed
 * by the caller — the roll is only read here) without the modifier.
 */
export function challengeSpawnCount(
  baseCount: number,
  roll: number,
  challenges: readonly ChallengeId[]
): number {
  if (!hasChallenge(challenges, 'horde_world')) return baseCount;
  if (baseCount <= 0) return baseCount;
  const extraFloat = baseCount * (HORDE_WORLD_SPAWN_MULT - 1);
  const extra = Math.floor(extraFloat) + (roll < extraFloat - Math.floor(extraFloat) ? 1 : 0);
  return baseCount + extra;
}

// ------------------------------------------------------------ cursed gold

/**
 * The gold an enemy actually drops under the active challenges: halved
 * (rounded down) by Cursed Gold. Quest and feat gold never pass through
 * here — only the kill funnel in handleEnemyDeath does.
 */
export function enemyGoldWithChallenges(
  goldReward: number,
  challenges: readonly ChallengeId[]
): number {
  if (!hasChallenge(challenges, 'cursed_gold')) return goldReward;
  return Math.floor(goldReward * 0.5);
}
