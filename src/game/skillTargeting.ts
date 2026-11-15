import { chebyshev, hasLineOfSight } from './combat';
import { SKILLS } from './skills';
import { SkillId, ZoneMap } from './types';

// Directional skill confirmation (Phase 8). Arming a hotbar skill used to
// confirm ONLY via a mouse click / tap on a tile — pressing a movement
// direction performed a basic bump attack instead, so keyboard players
// concluded skills were broken. This module is the pure decision the input
// layer now consults on every directional step while a skill is armed:
// if the tile one step in the pressed direction is a valid target for the
// armed skill (by that skill's own targeting rules — the same rules
// executeSkill enforces on the click path), the step becomes the cast;
// otherwise the step falls through to the normal move/bump untouched.

/**
 * Effective range of a targeted skill at a given rank. Mirrors the range
 * rules executeSkill and getInRangeEnemies apply: Ember Lance and Viper
 * Edge gain +1 range at rank 2+, Shadowstep blinks 4 tiles at rank 1 and
 * 5 from rank 2.
 */
export function getSkillEffectiveRange(skillId: SkillId, rank: number): number {
  const def = SKILLS[skillId];
  if (!def) return 0;
  if (skillId === 'shadowstep') return rank <= 1 ? 4 : 5;
  if ((skillId === 'ember_lance' || skillId === 'venom_tip') && rank >= 2) {
    return def.range + 1;
  }
  return def.range;
}

export type DirectionalCastResolution =
  | { kind: 'cast'; targetX: number; targetY: number }
  | { kind: 'move' };

export interface DirectionalCastInput {
  /** The armed hotbar skill, or null when nothing is armed. */
  skillId: SkillId | null;
  /** The player's rank in the armed skill (0 = not learned). */
  rank: number;
  playerX: number;
  playerY: number;
  /** One-step direction (each component -1, 0, or 1; not both 0). */
  dx: number;
  dy: number;
  zone: ZoneMap;
}

/**
 * Decide whether a directional step confirms the armed skill.
 *
 * - Enemy-targeted skills ('adjacent' / 'ranged'): the direction tile must
 *   hold a visible enemy within the skill's effective range with line of
 *   sight — exactly the validity executeSkill demands of a clicked tile.
 *   (A single keypress names the adjacent tile, so in practice this fires
 *   on the foe you are stepping toward; longer shots still go through
 *   Tab-cycling + Enter, or a click.)
 * - 'blink' (Shadowstep): the direction tile must be a legal blink landing
 *   — walkable, visible, unoccupied, within blink range.
 * - 'self' skills fire the instant they are armed and passives can never
 *   be armed, so they never claim a direction press.
 * Anything else resolves to 'move': the input is never eaten.
 */
export function resolveDirectionalSkillCast(
  input: DirectionalCastInput
): DirectionalCastResolution {
  const { skillId, rank, playerX, playerY, dx, dy, zone } = input;
  if (!skillId || rank <= 0) return { kind: 'move' };
  if (dx === 0 && dy === 0) return { kind: 'move' };
  const def = SKILLS[skillId];
  if (!def) return { kind: 'move' };

  const targetX = playerX + dx;
  const targetY = playerY + dy;
  const tile = zone.tiles[targetY]?.[targetX];
  if (!tile) return { kind: 'move' };
  const dist = chebyshev(playerX, playerY, targetX, targetY);

  if (def.targeting === 'blink') {
    const occupied = zone.enemies.some((e) => e.x === targetX && e.y === targetY);
    if (
      !tile.walkable ||
      !tile.visible ||
      occupied ||
      dist === 0 ||
      dist > getSkillEffectiveRange(skillId, rank)
    ) {
      return { kind: 'move' };
    }
    return { kind: 'cast', targetX, targetY };
  }

  if (def.targeting === 'adjacent' || def.targeting === 'ranged') {
    const enemy = zone.enemies.find((e) => e.x === targetX && e.y === targetY);
    if (!enemy || !tile.visible) return { kind: 'move' };
    if (dist > getSkillEffectiveRange(skillId, rank)) return { kind: 'move' };
    if (!hasLineOfSight(zone, playerX, playerY, targetX, targetY)) return { kind: 'move' };
    return { kind: 'cast', targetX, targetY };
  }

  return { kind: 'move' };
}
