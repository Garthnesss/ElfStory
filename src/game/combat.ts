import { computeBestiaryPerks } from './codex';
import { computeDerivedStats, SKILLS } from './skills';
import {
  Enemy,
  EnemyArchetype,
  EnemyIntent,
  PlayerState,
  StatusKind,
  Tile,
  WorldFlags,
  ZoneMap,
} from './types';

export function computeVisibility(zone: ZoneMap, px: number, py: number, radius = 8): void {
  if (zone.isTown) {
    for (let y = 0; y < zone.height; y++) {
      for (let x = 0; x < zone.width; x++) {
        zone.tiles[y][x].visible = true;
        zone.tiles[y][x].explored = true;
      }
    }
    return;
  }

  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < zone.width; x++) {
      zone.tiles[y][x].visible = false;
    }
  }

  const steps = 72;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let rx = px + 0.5;
    let ry = py + 0.5;

    for (let d = 0; d <= radius; d += 0.5) {
      const tx = Math.floor(rx);
      const ty = Math.floor(ry);
      if (tx < 0 || ty < 0 || tx >= zone.width || ty >= zone.height) break;
      const tile: Tile = zone.tiles[ty][tx];
      tile.visible = true;
      tile.explored = true;
      if (tile.blocksSight && !(tx === px && ty === py)) {
        break;
      }
      rx += dx * 0.5;
      ry += dy * 0.5;
    }
  }
}

export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function hasLineOfSight(zone: ZoneMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const dist = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  if (dist === 0) return true;
  for (let i = 1; i < dist; i++) {
    const t = i / dist;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    if (zone.tiles[cy]?.[cx]?.blocksSight) return false;
  }
  return true;
}

export function applyStatus(
  statuses: Array<{ kind: StatusKind; turns: number; potency: number }>,
  kind: StatusKind,
  turns: number,
  potency: number
): void {
  const existing = statuses.find((s) => s.kind === kind);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    existing.potency = Math.max(existing.potency, potency);
  } else {
    statuses.push({ kind, turns, potency });
  }
}

export function hasAffix(player: PlayerState, affix: string): boolean {
  return Object.values(player.equipped).some((item) => item?.affix === affix);
}

// ---------------------------------------------------------------------------
// Phase 8 Tier 2A: enemy behaviour brains.
//
// Until now every archetype shared one movement brain (BFS one step toward
// the player, always closing) and three telegraph families. These pure
// functions add four behaviours — caster kiting, summoning, mending and a
// charger lunge — all routed through the existing primed-intent machinery:
// intents snapshot their target tiles when primed and fire next turn, a
// Bastion Bash stun deletes a primed intent, and Chill scales intent damage.
// No parallel systems, no stat changes.
// ---------------------------------------------------------------------------

/** Non-boss hex casters keep a preferred range band instead of closing in. */
export const CASTER_BAND_MIN = 2;
export const CASTER_BAND_MAX = 4;
export const KITING_CASTER_ARCHETYPES: ReadonlySet<EnemyArchetype> = new Set([
  'bone_acolyte',
  'ash_cultist',
  'blight_weaver',
  'rime_revenant',
]);

/** Blight Weaver summon: cooldown, living-summons cap, trigger range, roll. */
export const SUMMON_COOLDOWN_TURNS = 12;
export const SUMMON_CAP = 2;
export const SUMMON_RANGE = 6;
export const SUMMON_ROLL = 0.6;

/** Ash Cultist mend: cooldown, prime range, fire range, HP threshold, roll. */
export const MEND_COOLDOWN_TURNS = 8;
export const MEND_RANGE = 4;
export const MEND_FIRE_RANGE = 5;
export const MEND_WOUNDED_THRESHOLD = 0.6;
export const MEND_ROLL = 0.75;

/** Shadow Stalker lunge roll when a clear 2–3 tile line exists. */
export const LUNGE_ROLL = 0.35;

/** Heal a fired mend restores: 18 + 2 per dungeon depth. */
export function mendHealAmount(depth: number): number {
  return 18 + 2 * depth;
}

export function isKitingCaster(enemy: Enemy): boolean {
  return KITING_CASTER_ARCHETYPES.has(enemy.archetype) && !enemy.isBoss;
}

// Same direction order as findPathNextStep so step choice is deterministic.
const STEP_DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
];

/**
 * Legal single steps from (x, y): walkable, no diagonal corner-cutting
 * (same rule as findPathNextStep), and `isFree` — supplied by the caller to
 * express occupancy (enemies / NPCs / player / companion).
 */
export function legalStepTiles(
  zone: ZoneMap,
  x: number,
  y: number,
  isFree: (x: number, y: number) => boolean
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const d of STEP_DIRS) {
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (!zone.tiles[ny]?.[nx]?.walkable) continue;
    if (d.dx !== 0 && d.dy !== 0) {
      if (!zone.tiles[y]?.[nx]?.walkable || !zone.tiles[ny]?.[x]?.walkable) continue;
    }
    if (!isFree(nx, ny)) continue;
    out.push({ x: nx, y: ny });
  }
  return out;
}

export type CasterMovePlan =
  | { kind: 'step'; x: number; y: number }
  | { kind: 'hold' }
  | { kind: 'approach' };

/**
 * Kiting-caster movement brain. Preferred band is CASTER_BAND_MIN..MAX
 * (Chebyshev) from the player:
 * - beyond the band: 'approach' (caller uses the normal pathing step);
 * - inside the band: 'hold' — the caster stands and casts;
 * - closer than the band: 'step' to the legal tile that most increases the
 *   distance, or 'hold' when cornered (no step improves the distance — the
 *   caller then falls back to its normal adjacent behaviour, e.g. a bump).
 * One step per turn, so a player who keeps closing always corners it.
 */
export function planCasterMove(
  zone: ZoneMap,
  enemy: Enemy,
  player: PlayerState,
  isFree: (x: number, y: number) => boolean
): CasterMovePlan {
  const dist = chebyshev(enemy.x, enemy.y, player.x, player.y);
  if (dist > CASTER_BAND_MAX) return { kind: 'approach' };
  if (dist >= CASTER_BAND_MIN) return { kind: 'hold' };
  let best: { x: number; y: number } | null = null;
  let bestDist = dist;
  for (const step of legalStepTiles(zone, enemy.x, enemy.y, isFree)) {
    const d = chebyshev(step.x, step.y, player.x, player.y);
    if (d > bestDist) {
      bestDist = d;
      best = step;
    }
  }
  return best ? { kind: 'step', x: best.x, y: best.y } : { kind: 'hold' };
}

export function countLivingSummons(zone: ZoneMap, summonerId: string): number {
  return zone.enemies.filter((e) => e.summoned && e.summonerId === summonerId && e.hp > 0).length;
}

/** First free tile adjacent to the weaver a summon could manifest on. */
export function findSummonTile(
  zone: ZoneMap,
  weaver: Enemy,
  isFree: (x: number, y: number) => boolean
): { x: number; y: number } | null {
  for (const d of STEP_DIRS) {
    const nx = weaver.x + d.dx;
    const ny = weaver.y + d.dy;
    if (!zone.tiles[ny]?.[nx]?.walkable) continue;
    if (!isFree(nx, ny)) continue;
    return { x: nx, y: ny };
  }
  return null;
}

/**
 * Summon gating, all of it: blight_weaver only, off cooldown, fewer than
 * SUMMON_CAP living summons of its own, player within SUMMON_RANGE, and a
 * free adjacent tile. Returns the snapshot tile to prime on, or null.
 */
export function primeSummonTile(
  enemy: Enemy,
  player: PlayerState,
  zone: ZoneMap,
  isFree: (x: number, y: number) => boolean
): { x: number; y: number } | null {
  if (enemy.archetype !== 'blight_weaver') return null;
  if ((enemy.intentCooldowns?.summon ?? 0) > 0) return null;
  if (chebyshev(enemy.x, enemy.y, player.x, player.y) > SUMMON_RANGE) return null;
  if (countLivingSummons(zone, enemy.id) >= SUMMON_CAP) return null;
  return findSummonTile(zone, enemy, isFree);
}

/**
 * The ally a mend should be primed on: another living enemy within
 * MEND_RANGE that is below MEND_WOUNDED_THRESHOLD of its max HP — the most
 * wounded one (lowest HP fraction; first in zone order wins ties).
 */
export function findMendTarget(cultist: Enemy, zone: ZoneMap): Enemy | undefined {
  let best: Enemy | undefined;
  let bestRatio = Infinity;
  for (const ally of zone.enemies) {
    if (ally.id === cultist.id || ally.hp <= 0) continue;
    if (ally.hp >= ally.maxHp * MEND_WOUNDED_THRESHOLD) continue;
    if (chebyshev(cultist.x, cultist.y, ally.x, ally.y) > MEND_RANGE) continue;
    const ratio = ally.hp / ally.maxHp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = ally;
    }
  }
  return best;
}

/**
 * Fire-time mend validation (the primed intent's second half): the target
 * must still be alive on the board and within MEND_FIRE_RANGE of the
 * cultist. Returns the capped heal, or undefined when the mend fizzles —
 * target dead, gone, out of reach, or already full. (A cultist killed or
 * Bash-stunned before this point never gets here: its primed intent is
 * deleted by the stun machinery, like every other intent.)
 */
export function resolveMend(
  caster: Enemy,
  targetEnemyId: string | undefined,
  zone: ZoneMap,
  healAmount: number
): { target: Enemy; heal: number } | undefined {
  if (!targetEnemyId) return undefined;
  const target = zone.enemies.find((e) => e.id === targetEnemyId);
  if (!target || target.hp <= 0) return undefined;
  if (chebyshev(caster.x, caster.y, target.x, target.y) > MEND_FIRE_RANGE) return undefined;
  const heal = Math.min(healAmount, target.maxHp - target.hp);
  if (heal <= 0) return undefined;
  return { target, heal };
}

/**
 * The stalker's lunge line: the player 2–3 tiles away on a straight
 * cardinal or diagonal line, every intermediate tile walkable and
 * unoccupied. Returns the line tiles (one step out … the player's tile,
 * which is the damage snapshot), or null when no lunge is on.
 */
export function findLungeLine(
  zone: ZoneMap,
  enemy: Enemy,
  player: PlayerState
): Array<{ x: number; y: number }> | null {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (dist < 2 || dist > 3) return null;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const tiles: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= dist; i++) {
    const tx = enemy.x + sx * i;
    const ty = enemy.y + sy * i;
    if (i < dist) {
      if (!zone.tiles[ty]?.[tx]?.walkable) return null;
      if (zone.enemies.some((e) => e.id !== enemy.id && e.x === tx && e.y === ty)) return null;
      if (zone.npcs.some((n) => n.x === tx && n.y === ty)) return null;
    }
    tiles.push({ x: tx, y: ty });
  }
  return tiles;
}

/**
 * Where a fired lunge ends: the stalker dashes along the line and stops on
 * the last free tile before the first blocked one (the player's tile is
 * never free, so a connecting lunge ends adjacent to the player). Returns
 * null when even the first line tile is blocked — the stalker stays put.
 */
export function lungeDestination(
  zone: ZoneMap,
  lineTiles: Array<{ x: number; y: number }>,
  isFree: (x: number, y: number) => boolean
): { x: number; y: number } | null {
  let dest: { x: number; y: number } | null = null;
  for (const t of lineTiles) {
    if (!zone.tiles[t.y]?.[t.x]?.walkable) break;
    if (!isFree(t.x, t.y)) break;
    dest = t;
  }
  return dest;
}

/** The lunge intent for a validated line, at the Heavy Strike damage scale. */
export function buildLungeIntent(
  enemy: Enemy,
  line: Array<{ x: number; y: number }>
): EnemyIntent {
  const chilled = enemy.statuses.some((s) => s.kind === 'chilled');
  const dmgScale = chilled ? 0.65 : 1;
  return {
    type: 'lunge',
    label: 'Coiling to Lunge',
    damage: Math.round(enemy.atk * 1.45 * dmgScale),
    targetTiles: line,
  };
}

/**
 * Phase 8 fix pack (lunge tuning): the post-move lunge prime. Round-3 live
 * play showed the turn-start lunge in chooseEnemyIntent almost never primed:
 * the stalker's own approach step usually closes it into melee before a
 * straight 2–3 tile line ever exists at a turn boundary. So after the
 * stalker's movement step, if it actually moved and ENDS that move on a
 * clear 2–3 tile line with no intent already primed, it gets the same
 * LUNGE_ROLL here. The primed intent is identical to the turn-start one —
 * same telegraph, snapshot and WHIFF rules; it fires next turn as usual.
 * `roll` is supplied by the caller (Math.random() in App) so the decision
 * stays pure and testable. A stalker whose step was blocked (moved=false)
 * does not re-roll: it already had its turn-start chance if it was in line.
 */
export function shouldPrimeLungeAfterMove(
  zone: ZoneMap,
  enemy: Enemy,
  player: PlayerState,
  moved: boolean,
  roll: number
): EnemyIntent | undefined {
  if (!moved) return undefined;
  if (enemy.archetype !== 'shadow_stalker') return undefined;
  if (enemy.intent) return undefined;
  if (enemy.statuses.some((s) => s.kind === 'stunned')) return undefined;
  const line = findLungeLine(zone, enemy, player);
  if (!line) return undefined;
  if (roll >= LUNGE_ROLL) return undefined;
  return buildLungeIntent(enemy, line);
}

/** Occupancy as chooseEnemyIntent can see it from the zone alone. */
function zoneTileFree(zone: ZoneMap, player: PlayerState, x: number, y: number): boolean {
  if (x === player.x && y === player.y) return false;
  if (zone.enemies.some((e) => e.hp > 0 && e.x === x && e.y === y)) return false;
  if (zone.npcs.some((n) => n.x === x && n.y === y)) return false;
  return true;
}

export function chooseEnemyIntent(enemy: Enemy, player: PlayerState, zone: ZoneMap): EnemyIntent | undefined {
  if (enemy.statuses.some((s) => s.kind === 'stunned')) {
    return undefined;
  }
  const dist = chebyshev(enemy.x, enemy.y, player.x, player.y);
  const chilled = enemy.statuses.some((s) => s.kind === 'chilled');
  const dmgScale = chilled ? 0.65 : 1;

  // Rare / Randboss enemies roll real player skills off cooldown
  if (enemy.skillLoadout && enemy.skillLoadout.length > 0 && Math.random() < 0.65) {
    const readySkills = enemy.skillLoadout.filter((id) => (enemy.skillCooldowns?.[id] ?? 0) === 0);
    for (const skillId of readySkills) {
      if (skillId === 'ember_lance' && dist >= 2 && dist <= 5 && hasLineOfSight(zone, enemy.x, enemy.y, player.x, player.y)) {
        return {
          type: 'enemy_skill',
          skillId,
          label: `Charging ${SKILLS[skillId].name}`,
          damage: Math.round(enemy.atk * 1.45 * dmgScale),
          targetTiles: [{ x: player.x, y: player.y }],
        };
      }
      if (skillId === 'venom_tip' && dist >= 2 && dist <= 4 && hasLineOfSight(zone, enemy.x, enemy.y, player.x, player.y)) {
        return {
          type: 'enemy_skill',
          skillId,
          label: `Aiming ${SKILLS[skillId].name}`,
          damage: Math.round(enemy.atk * 1.25 * dmgScale),
          targetTiles: [{ x: player.x, y: player.y }],
        };
      }
      if (skillId === 'frost_nova' && dist <= 2) {
        const area: Array<{ x: number; y: number }> = [];
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const tx = enemy.x + dx;
            const ty = enemy.y + dy;
            if (zone.tiles[ty]?.[tx]?.walkable) area.push({ x: tx, y: ty });
          }
        }
        return {
          type: 'enemy_skill',
          skillId,
          label: `Gathering ${SKILLS[skillId].name}`,
          damage: Math.round(enemy.atk * 1.35 * dmgScale),
          targetTiles: area,
        };
      }
      if ((skillId === 'shield_bash' || skillId === 'cleave') && dist === 1) {
        return {
          type: 'enemy_skill',
          skillId,
          label: `Telegraphing ${SKILLS[skillId].name}`,
          damage: Math.round(enemy.atk * (skillId === 'cleave' ? 1.55 : 1.3) * dmgScale),
          targetTiles: [{ x: player.x, y: player.y }],
        };
      }
      if (skillId === 'shadowstep' && dist >= 2 && dist <= 4 && hasLineOfSight(zone, enemy.x, enemy.y, player.x, player.y)) {
        return {
          type: 'enemy_skill',
          skillId,
          label: `Priming ${SKILLS[skillId].name} Ambush`,
          damage: Math.round(enemy.atk * 1.4 * dmgScale),
          targetTiles: [{ x: player.x, y: player.y }],
        };
      }
    }
  }

  // Phase 8 Tier 2A: Blight Weaver summon — support action, checked before
  // its hex so an eligible weaver raises mites instead of bolting. The
  // 12-turn cooldown (set when the intent fires) is the real gate; the roll
  // only staggers the first summon by a turn or two.
  const summonTile = primeSummonTile(enemy, player, zone, (x, y) => zoneTileFree(zone, player, x, y));
  if (summonTile && Math.random() < SUMMON_ROLL) {
    return {
      type: 'summon',
      label: 'Weaving a Summoning',
      damage: 0,
      targetTiles: [summonTile],
    };
  }

  // Phase 8 Tier 2A: Ash Cultist mend — checked before its hex for the same
  // reason: a cultist with a wounded ally in reach is a healer first. The
  // 8-turn cooldown (set when the intent fires) gates the rate.
  if (enemy.archetype === 'ash_cultist' && (enemy.intentCooldowns?.mend ?? 0) === 0) {
    const mendTarget = findMendTarget(enemy, zone);
    if (mendTarget && Math.random() < MEND_ROLL) {
      return {
        type: 'mend',
        label: 'Weaving a Mending',
        damage: 0,
        targetTiles: [{ x: mendTarget.x, y: mendTarget.y }],
        targetEnemyId: mendTarget.id,
        healAmount: mendHealAmount(zone.depth),
      };
    }
  }

  // Boss / heavy archetypes telegraph impactful windups
  if (
    (enemy.archetype === 'iron_golem' ||
      enemy.archetype === 'obsidian_warden' ||
      enemy.archetype === 'spore_hulk' ||
      enemy.archetype === 'boss_ashen_inquisitor' ||
      enemy.archetype === 'boss_malakor') &&
    dist <= 2 &&
    Math.random() < 0.45
  ) {
    const targets: Array<{ x: number; y: number }> = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = enemy.x + dx;
        const ty = enemy.y + dy;
        if (zone.tiles[ty]?.[tx]?.walkable) {
          targets.push({ x: tx, y: ty });
        }
      }
    }
    return {
      type: 'ground_slam',
      label:
        enemy.archetype === 'obsidian_warden'
          ? 'Winding up Obsidian Cleave'
          : enemy.archetype === 'spore_hulk'
            ? 'Swelling Spore Slam'
            : 'Winding up Ground Slam',
      damage: Math.round(enemy.atk * 1.55 * dmgScale),
      targetTiles: targets,
    };
  }

  if (
    (enemy.archetype === 'bone_acolyte' ||
      enemy.archetype === 'ash_cultist' ||
      enemy.archetype === 'blight_weaver' ||
      enemy.archetype === 'rime_revenant' ||
      enemy.archetype === 'boss_bone_cantor' ||
      enemy.archetype === 'boss_malakor') &&
    // Phase 8 Tier 2A: a cornered non-boss caster (dist 1) casts point-blank
    // rather than only bumping; bosses keep the original 2–5 band.
    (dist >= 2 || (dist === 1 && isKitingCaster(enemy))) &&
    dist <= 5 &&
    hasLineOfSight(zone, enemy.x, enemy.y, player.x, player.y) &&
    Math.random() < 0.65
  ) {
    return {
      type: 'hex_bolt',
      label:
        enemy.archetype === 'blight_weaver'
          ? 'Weaving Venom Hex'
          : enemy.archetype === 'rime_revenant'
            ? 'Charging Rime Bolt'
            : 'Charging Hex Bolt',
      damage: Math.round(enemy.atk * 1.25 * dmgScale),
      targetTiles: [{ x: player.x, y: player.y }],
    };
  }

  // Phase 8 Tier 2A: Shadow Stalker lunge — a telegraphed dash down a clear
  // 2–3 tile line. Damage lands only if the player is still on the end tile
  // (the snapshot) when it fires; stepping off the line is a clean WHIFF,
  // exactly like every other telegraph. Same 1.45x scale as its Heavy Strike.
  if (enemy.archetype === 'shadow_stalker') {
    const line = findLungeLine(zone, enemy, player);
    if (line && Math.random() < LUNGE_ROLL) {
      return buildLungeIntent(enemy, line);
    }
  }

  if (
    (enemy.archetype === 'goblin_skirmisher' ||
      enemy.archetype === 'crypt_skeleton' ||
      enemy.archetype === 'shadow_stalker' ||
      enemy.archetype === 'grave_husk' ||
      enemy.archetype === 'dread_wraith') &&
    dist === 1 &&
    Math.random() < 0.38
  ) {
    return {
      type: 'heavy_windup',
      label:
        enemy.archetype === 'dread_wraith'
          ? 'Channeling Soul Chill'
          : enemy.archetype === 'grave_husk'
            ? 'Raising a Tomb-Cleaver Blow'
            : 'Telegraphing Heavy Strike',
      damage: Math.round(enemy.atk * 1.45 * dmgScale),
      targetTiles: [{ x: player.x, y: player.y }],
    };
  }

  return undefined;
}

export function calculatePlayerHit(
  player: PlayerState,
  target: Enemy,
  multiplier = 1,
  isSpell = false,
  forceCrit = false,
  ignoreDefRatio = 0,
  worldFlags?: WorldFlags
): { damage: number; isCrit: boolean; lifestealHeal: number } {
  const stats = computeDerivedStats(player, worldFlags);
  const rawPower = isSpell ? stats.spellPower : stats.atk;
  let critChance = stats.critChance;
  if ((player.skills.bloodlust ?? 0) > 0 && target.hp < target.maxHp * 0.5) {
    const rank = player.skills.bloodlust ?? 0;
    critChance += rank === 1 ? 10 : rank === 2 ? 18 : 25;
  }

  const isCrit = forceCrit || Math.random() * 100 < critChance;
  let dmg = rawPower * multiplier;

  dmg *= computeBestiaryPerks(worldFlags).damageMultiplierVs(target.archetype);

  if (player.firstStrikeReady && hasAffix(player, 'first_strike')) {
    dmg *= 1.35;
  }

  if (target.hp < target.maxHp * 0.4 && hasAffix(player, 'execute_bonus')) {
    dmg *= 1.25;
  }

  const marked = target.statuses.find((s) => s.kind === 'marked');
  if (marked) {
    dmg *= 1 + marked.potency / 100;
  }

  if (isCrit) {
    dmg *= 1.65;
  }

  const effectiveDef = Math.round(target.def * (1 - ignoreDefRatio));
  const finalDamage = Math.max(2, Math.round(dmg - effectiveDef * 0.6));

  let lifestealHeal = 0;
  if (!isSpell && stats.lifesteal > 0) {
    lifestealHeal += Math.max(1, Math.round((finalDamage * stats.lifesteal) / 100));
  }
  if (isCrit && hasAffix(player, 'vampiric_touch')) {
    lifestealHeal += 3;
  }

  return { damage: finalDamage, isCrit, lifestealHeal };
}

export function findPathNextStep(
  zone: ZoneMap,
  sx: number,
  sy: number,
  tx: number,
  ty: number
): { x: number; y: number } | null {
  if (sx === tx && sy === ty) return null;
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number; firstStep: { x: number; y: number } | null }> = [
    { x: sx, y: sy, firstStep: null },
  ];
  visited.add(`${sx},${sy}`);

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === tx && cur.y === ty) {
      return cur.firstStep;
    }

    for (const d of dirs) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (nx < 0 || ny < 0 || nx >= zone.width || ny >= zone.height) continue;
      const tile = zone.tiles[ny][nx];
      if (!tile.walkable) continue;
      if (d.dx !== 0 && d.dy !== 0) {
        if (!zone.tiles[cur.y]?.[nx]?.walkable || !zone.tiles[ny]?.[cur.x]?.walkable) continue;
      }
      const blockedByEnemy = zone.enemies.some((e) => e.x === nx && e.y === ny && !(nx === tx && ny === ty));
      const blockedByNpc = zone.npcs.some((n) => n.x === nx && n.y === ny && !(nx === tx && ny === ty));
      if (blockedByEnemy || blockedByNpc) continue;

      visited.add(key);
      queue.push({
        x: nx,
        y: ny,
        firstStep: cur.firstStep ?? { x: nx, y: ny },
      });
    }
  }
  return null;
}

export function findPathPoints(
  zone: ZoneMap,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  exploredOnly = true,
  maxSteps = 16
): Array<{ x: number; y: number }> {
  if (sx === tx && sy === ty) return [];
  if (tx < 0 || ty < 0 || tx >= zone.width || ty >= zone.height) return [];
  const destTile = zone.tiles[ty]?.[tx];
  if (!destTile?.walkable || (exploredOnly && !destTile.explored)) return [];

  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: Array<{ x: number; y: number; dist: number }> = [{ x: sx, y: sy, dist: 0 }];
  visited.add(`${sx},${sy}`);

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
  ];

  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === tx && cur.y === ty) {
      found = true;
      break;
    }
    if (cur.dist >= maxSteps) continue;

    for (const d of dirs) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (nx < 0 || ny < 0 || nx >= zone.width || ny >= zone.height) continue;
      const tile = zone.tiles[ny][nx];
      if (!tile.walkable || (exploredOnly && !tile.explored)) continue;
      if (d.dx !== 0 && d.dy !== 0) {
        const c1 = zone.tiles[cur.y]?.[nx];
        const c2 = zone.tiles[ny]?.[cur.x];
        if (!c1?.walkable || !c2?.walkable) continue;
        if (exploredOnly && (!c1.explored || !c2.explored)) continue;
      }
      const blockedByEnemy =
        tile.visible && zone.enemies.some((e) => e.x === nx && e.y === ny && !(nx === tx && ny === ty));
      const blockedByNpc = zone.npcs.some((n) => n.x === nx && n.y === ny && !(nx === tx && ny === ty));
      if (blockedByEnemy || blockedByNpc) continue;

      visited.add(key);
      parent.set(key, `${cur.x},${cur.y}`);
      queue.push({ x: nx, y: ny, dist: cur.dist + 1 });
    }
  }

  if (!found) return [];
  const path: Array<{ x: number; y: number }> = [];
  let curKey = `${tx},${ty}`;
  const startKey = `${sx},${sy}`;
  while (curKey && curKey !== startKey) {
    const [cx, cy] = curKey.split(',').map(Number);
    path.push({ x: cx, y: cy });
    curKey = parent.get(curKey) ?? '';
  }
  return path.reverse();
}

export function findAutoExploreTarget(
  zone: ZoneMap,
  px: number,
  py: number
): { nextStep: { x: number; y: number } | null; reason: 'loot' | 'chest' | 'frontier' | 'stairs' | 'done' } {
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
  ];

  const isTargetFrontier = (x: number, y: number): boolean => {
    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      const nt = zone.tiles[ny]?.[nx];
      if (nt && !nt.explored) return true;
    }
    return false;
  };

  const bfsSearch = (predicate: (x: number, y: number) => boolean): { x: number; y: number } | null => {
    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number; firstStep: { x: number; y: number } | null }> = [
      { x: px, y: py, firstStep: null },
    ];
    visited.add(`${px},${py}`);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if ((cur.x !== px || cur.y !== py) && predicate(cur.x, cur.y)) {
        return cur.firstStep;
      }

      for (const d of dirs) {
        const nx = cur.x + d.dx;
        const ny = cur.y + d.dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (nx < 0 || ny < 0 || nx >= zone.width || ny >= zone.height) continue;
        const tile = zone.tiles[ny][nx];
        if (!tile.explored || !tile.walkable) continue;
        if (d.dx !== 0 && d.dy !== 0) {
          const c1 = zone.tiles[cur.y]?.[nx];
          const c2 = zone.tiles[ny]?.[cur.x];
          if (!c1?.explored || !c1.walkable || !c2?.explored || !c2.walkable) continue;
        }
        if ((tile.kind === 'trap' || tile.kind === 'dart_trap') && tile.revealed && !tile.used) continue;
        if (
          (tile.kind === 'spore_pool' ||
            tile.kind === 'frost_vent' ||
            tile.kind === 'ember_crust' ||
            tile.kind === 'shock_rune') &&
          !tile.used
        ) {
          continue;
        }
        if (zone.npcs.some((n) => n.x === nx && n.y === ny)) continue;

        visited.add(key);
        queue.push({
          x: nx,
          y: ny,
          firstStep: cur.firstStep ?? { x: nx, y: ny },
        });
      }
    }
    return null;
  };

  // 1. Collect visible/known ground loot
  const lootStep = bfsSearch((x, y) => zone.loot.some((l) => l.x === x && l.y === y));
  if (lootStep) return { nextStep: lootStep, reason: 'loot' };

  // 2. Open known unopened standard chests (avoid auto-walking into unrevealed vault chests)
  const chestStep = bfsSearch((x, y) => {
    const t = zone.tiles[y][x];
    return t.kind === 'chest' && !t.used;
  });
  if (chestStep) return { nextStep: chestStep, reason: 'chest' };

  // 3. Explore nearest frontier adjacent to unexplored tiles
  const frontierStep = bfsSearch((x, y) => isTargetFrontier(x, y));
  if (frontierStep) return { nextStep: frontierStep, reason: 'frontier' };

  // 4. Otherwise navigate toward discovered descent stairs if not standing on them
  if (!zone.isTown && zone.tiles[py]?.[px]?.kind !== 'stairs_down') {
    const stairStep = bfsSearch((x, y) => zone.tiles[y][x].kind === 'stairs_down');
    if (stairStep) return { nextStep: stairStep, reason: 'stairs' };
  }

  return { nextStep: null, reason: 'done' };
}
