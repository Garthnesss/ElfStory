// Run autopsy (Phase 8 Tier 3).
//
// The game tracks the last blow that damaged the player (App records it
// at every player-damage site: enemy basics, telegraphed intents, DoT
// ticks, traps, floor hazards and death-bursts). When the run ends, the
// Fallen screen and the Hall of Fame chronicle name the cause — built
// here, purely, so the phrasing is testable without the game loop.

import { challengeDisplayLine, ChallengeId } from './challenges';

export type DamageSourceKind = 'basic' | 'telegraph' | 'dot' | 'trap' | 'environment';

export interface LastDamageSource {
  kind: DamageSourceKind;
  /** Attacker / hazard display name ('Inquisitor Serath', 'Spike Snare'). */
  name?: string;
  /** Telegraph only: the attack's short noun ('telegraphed slam'). */
  detail?: string;
}

export interface DeathCauseContext {
  lastDamage: LastDamageSource | null | undefined;
  /** Name of the zone the run ended in. */
  zoneName: string;
  /** Depth of that zone (0 on the surface / in towns). */
  depth: number;
}

/**
 * The one-line cause of death:
 * - basic:      "Slain by Crypt Sentinel — Floor 1"
 * - telegraph:  "Slain by Inquisitor Serath's telegraphed slam — Floor 4"
 * - dot:        "Claimed by Poison — Floor 6"
 * - trap:       "Claimed by a Spike Snare — Floor 2"
 * - environment:"Claimed by Blight Spore Pool — Floor 1"
 * - unrecorded: "Fell in the deep — Floor 3"
 * The location suffix is "Floor N" in the descent and the zone's own
 * name on the surface.
 */
export function buildDeathCause(ctx: DeathCauseContext): string {
  const where = ctx.depth > 0 ? `Floor ${ctx.depth}` : ctx.zoneName;
  const src = ctx.lastDamage;
  if (!src || !src.name) return `Fell in the deep — ${where}`;
  switch (src.kind) {
    case 'basic':
      return `Slain by ${src.name} — ${where}`;
    case 'telegraph':
      return `Slain by ${src.name}'s ${src.detail ?? 'telegraphed attack'} — ${where}`;
    case 'trap':
      return `Claimed by a ${src.name} — ${where}`;
    case 'dot':
    case 'environment':
      return `Claimed by ${src.name} — ${where}`;
  }
}

export interface RunRecap {
  level: number;
  cycle: number;
  deepestFloor: number;
  kills: number;
  gold: number;
  challenges?: readonly ChallengeId[];
}

/**
 * The compact end-of-run recap row shown on the Fallen and Ending
 * screens: "Lv 12 · Cycle 1 · Deepest Floor 7 · 143 Slain · 2,310g",
 * with the active challenges appended when the run had any.
 */
export function formatRunRecap(recap: RunRecap): string {
  const parts = [
    `Lv ${recap.level}`,
    ...(recap.cycle > 0 ? [`Cycle ${recap.cycle}`] : []),
    `Deepest Floor ${recap.deepestFloor}`,
    `${recap.kills} Slain`,
    `${recap.gold}g`,
  ];
  const line = challengeDisplayLine(recap.challenges);
  return line ? `${parts.join(' · ')} · ${line}` : parts.join(' · ');
}
