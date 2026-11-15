import { Enemy, FloorMutatorId } from './types';

// Floor mutators (Phase 8 Tier 2B — endgame novelty).
//
// The audit found the back half of the game introduces nothing new: F5 is
// Malakor alone and the Abyss is the same pool under pure number scaling,
// while NG+ is scaling only. Mutators give those floors a *texture*: when a
// dungeon floor is generated for the Abyss (depth >= 6, cycle 0 included)
// it has a 75% chance to carry one mutator; in NG+ (cycle >= 1) EVERY
// dungeon floor carries exactly one. Cycle-0 floors 1-5 and cycle-0 side
// dungeons NEVER roll one, so the main game is behaviour-identical.
//
// Application goes through the existing funnels only: enemy multipliers are
// folded into the enemies at generation time inside generateDungeonFloor
// (alongside the difficulty/cycle scaling already applied at creation), the
// sight penalty flows through App's getSightRadius, and the loot bonus
// flows through the loot generators' depth-bonus parameter. Hand-tuned
// bosses (isBoss) are EXEMPT from the stat multipliers — their numbers are
// pinned by the P1/P5 tuning pipeline; a mutator reshapes the floor's
// regular inhabitants, never the boss math.

export interface MutatorDef {
  id: FloorMutatorId;
  name: string;
  /** Line shown in the zone intro card when the floor is entered. */
  introLine: string;
  /** Multiplier on non-boss enemy HP at generation. */
  enemyHpMult: number;
  /** Multiplier on non-boss enemy gold rewards at generation. */
  enemyGoldMult: number;
  /** Multiplier on non-boss enemy XP rewards at generation. */
  enemyXpMult: number;
  /** Player sight radius penalty while on the floor (Umbral). */
  lightPenalty: number;
  /** Extra rarity-roll depth bonus for loot generated on the floor (Umbral). */
  lootBonus: number;
}

export const MUTATOR_DEFS: Record<FloorMutatorId, MutatorDef> = {
  gilded_depths: {
    id: 'gilded_depths',
    name: 'Gilded Depths',
    introLine: 'The deep shifts — Gilded Depths: foes here carry heavy purses and heavier flesh.',
    enemyHpMult: 1.15,
    enemyGoldMult: 1.5,
    enemyXpMult: 1,
    lightPenalty: 0,
    lootBonus: 0,
  },
  horde: {
    id: 'horde',
    name: 'Horde',
    introLine: 'The deep shifts — Horde: the dark here teems. More foes crowd every chamber, frailer for their numbers.',
    enemyHpMult: 0.9,
    enemyGoldMult: 1,
    enemyXpMult: 1,
    lightPenalty: 0,
    lootBonus: 0,
  },
  umbral: {
    id: 'umbral',
    name: 'Umbral',
    introLine: 'The deep shifts — Umbral: your light shrinks in the gloom, but the dark hoards richer spoils.',
    enemyHpMult: 1,
    enemyGoldMult: 1,
    enemyXpMult: 1,
    lightPenalty: 2,
    lootBonus: 15,
  },
  vital_surge: {
    id: 'vital_surge',
    name: 'Vital Surge',
    introLine: 'The deep shifts — Vital Surge: foes here burn with borrowed vigor — hardier, and worth more to fell.',
    enemyHpMult: 1.25,
    enemyGoldMult: 1,
    enemyXpMult: 1.25,
    lightPenalty: 0,
    lootBonus: 0,
  },
};

export const MUTATOR_POOL: FloorMutatorId[] = ['gilded_depths', 'horde', 'umbral', 'vital_surge'];

/** Spawn-count multiplier for the Horde mutator (+40% at generation). */
export const HORDE_SPAWN_MULT = 1.4;

/** Probability an eligible Abyss floor (cycle 0) carries a mutator. */
export const ABYSS_MUTATOR_CHANCE = 0.75;

export type MutatorEligibility = 'always' | 'chance' | 'never';

/**
 * Whether a floor generation may roll a mutator:
 * - NG+ (cycle >= 1): every dungeon floor, side dungeons included — 'always'.
 * - Cycle 0 Abyss (depth >= 6, main descent only): 'chance' (75%).
 * - Everything else (cycle-0 floors 1-5, cycle-0 side dungeons): 'never'.
 */
export function mutatorEligibility(
  depth: number,
  cycle: number,
  isSideBranch: boolean
): MutatorEligibility {
  if (cycle >= 1) return 'always';
  if (depth >= 6 && !isSideBranch) return 'chance';
  return 'never';
}

export interface RollMutatorContext {
  depth: number;
  cycle: number;
  /** True when generating a side-dungeon floor (barrow/mire/frost). */
  isSideBranch?: boolean;
  /** The mutator on the previous floor of the descent, if any — never repeated. */
  previousMutator?: FloorMutatorId | null;
}

/**
 * Roll the mutator for a floor being generated. Pure: all randomness comes
 * from the injected rng (uniform [0, 1)). Ineligible floors return
 * undefined WITHOUT consuming the rng, so cycle-0 main-game generation is
 * untouched down to the random stream.
 */
export function rollMutator(
  rng: () => number,
  ctx: RollMutatorContext
): FloorMutatorId | undefined {
  const eligibility = mutatorEligibility(ctx.depth, ctx.cycle, ctx.isSideBranch ?? false);
  if (eligibility === 'never') return undefined;
  if (eligibility === 'chance' && rng() >= ABYSS_MUTATOR_CHANCE) return undefined;
  const candidates = MUTATOR_POOL.filter((m) => m !== ctx.previousMutator);
  const idx = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[idx];
}

/**
 * Fold a mutator's enemy multipliers into a freshly generated enemy.
 * Bosses (isBoss) are exempt and returned unchanged, as is any enemy when
 * no mutator is active.
 */
export function applyMutatorToEnemy(
  enemy: Enemy,
  mutator: FloorMutatorId | undefined | null
): Enemy {
  if (!mutator || enemy.isBoss) return enemy;
  const def = MUTATOR_DEFS[mutator];
  if (def.enemyHpMult === 1 && def.enemyGoldMult === 1 && def.enemyXpMult === 1) return enemy;
  const maxHp = Math.max(1, Math.round(enemy.maxHp * def.enemyHpMult));
  return {
    ...enemy,
    maxHp,
    hp: Math.max(1, Math.round(enemy.hp * def.enemyHpMult)),
    goldReward: Math.round(enemy.goldReward * def.enemyGoldMult),
    xpReward: Math.round(enemy.xpReward * def.enemyXpMult),
  };
}

/**
 * Horde spawn count: +40% of the base count in expectation. The fractional
 * remainder is resolved by the injected roll so small room counts (1-3)
 * still average out over a floor.
 */
export function hordeSpawnCount(baseCount: number, roll: number): number {
  if (baseCount <= 0) return baseCount;
  const extraFloat = baseCount * (HORDE_SPAWN_MULT - 1);
  const extra = Math.floor(extraFloat) + (roll < extraFloat - Math.floor(extraFloat) ? 1 : 0);
  return baseCount + extra;
}

/** Sight-radius penalty imposed by a floor's mutator (Umbral: 2). */
export function mutatorLightPenalty(mutator: FloorMutatorId | undefined | null): number {
  return mutator ? MUTATOR_DEFS[mutator].lightPenalty : 0;
}

/** Extra rarity-roll depth bonus for loot generated on a mutated floor (Umbral: +15). */
export function mutatorLootBonus(mutator: FloorMutatorId | undefined | null): number {
  return mutator ? MUTATOR_DEFS[mutator].lootBonus : 0;
}

/** The intro-card line for a floor's mutator, if it has one. */
export function mutatorIntroLine(mutator: FloorMutatorId | undefined | null): string | undefined {
  return mutator ? MUTATOR_DEFS[mutator].introLine : undefined;
}

/** Display name for a floor's mutator, if it has one. */
export function mutatorName(mutator: FloorMutatorId | undefined | null): string | undefined {
  return mutator ? MUTATOR_DEFS[mutator].name : undefined;
}
