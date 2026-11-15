import { StatusEffect, StatusKind } from './types';

// Shrine blessings (Phase 8 Tier 2B — economy sink).
//
// The audit found the gold economy runs dry of sinks: town upgrades total
// ~420g, tempering caps out, and a finished run holds ~4,000g with nothing
// to buy. Blessings are the repeatable sink: at any Glyph Shrine (the same
// altar that offers free respec) the player may make an offering for ONE
// active blessing. The offering cost doubles with every purchase within a
// cycle — 150 / 300 / 600 / 1200 / ... — and the purchase counter resets
// when a new cycle begins (NG+ ascension), never on zone changes.
//
// Duration model — 150 TURNS, chosen over "until you leave the delve":
// blessings ride the existing status plumbing end to end. A blessing is a
// player StatusEffect with a blessing_* kind; statuses already tick down
// exactly once per turn in runEnemyTurns and expire through the same
// filter, and computeDerivedStats already reads stat bonuses out of
// player.statuses (the 'shielded' precedent). A delve-bound blessing would
// need new zone-transition hooks in a dozen places; the turn-bound one
// needs none, survives zone changes inside a delve naturally, and its
// remaining turns are already visible on the HUD status chips.

export type BlessingId = 'might' | 'ward' | 'vigor';

export interface BlessingDef {
  id: BlessingId;
  name: string;
  /** Short effect summary shown in the shrine menu. */
  effectLabel: string;
  statusKind: StatusKind;
  /** Stat magnitude: +ATK (might), +DEF (ward), +Max HP (vigor). */
  potency: number;
}

export const BLESSING_DURATION_TURNS = 150;

export const BLESSING_DEFS: Record<BlessingId, BlessingDef> = {
  might: {
    id: 'might',
    name: 'Blessing of Might',
    effectLabel: '+2 ATK',
    statusKind: 'blessing_might',
    potency: 2,
  },
  ward: {
    id: 'ward',
    name: 'Blessing of Warding',
    effectLabel: '+2 DEF',
    statusKind: 'blessing_ward',
    potency: 2,
  },
  vigor: {
    id: 'vigor',
    name: 'Blessing of Vigor',
    effectLabel: '+10 Max HP (and heals 10 on purchase)',
    statusKind: 'blessing_vigor',
    potency: 10,
  },
};

export const BLESSING_IDS: BlessingId[] = ['might', 'ward', 'vigor'];

const BLESSING_STATUS_KINDS: ReadonlySet<StatusKind> = new Set([
  'blessing_might',
  'blessing_ward',
  'blessing_vigor',
]);

export function isBlessingStatusKind(kind: StatusKind): boolean {
  return BLESSING_STATUS_KINDS.has(kind);
}

/** Offering cost for the next blessing: 150g, doubling per purchase this cycle. */
export function blessingCost(purchasesThisCycle: number): number {
  const n =
    typeof purchasesThisCycle === 'number' && Number.isFinite(purchasesThisCycle)
      ? Math.max(0, Math.floor(purchasesThisCycle))
      : 0;
  return 150 * 2 ** n;
}

/** Whether a blessing may be bought right now (pure affordability check). */
export function canPurchaseBlessing(gold: number, purchasesThisCycle: number): boolean {
  return gold >= blessingCost(purchasesThisCycle);
}

/** The blessing currently active in a status list, if any. */
export function activeBlessing(statuses: ReadonlyArray<StatusEffect>): BlessingId | null {
  for (const st of statuses) {
    for (const id of BLESSING_IDS) {
      if (st.kind === BLESSING_DEFS[id].statusKind) return id;
    }
  }
  return null;
}

/**
 * Return a NEW status list with the chosen blessing active and any previous
 * blessing removed — exactly one blessing may be active at a time. All
 * non-blessing statuses are preserved untouched. The new blessing lasts
 * BLESSING_DURATION_TURNS turns at the def's potency.
 */
export function applyBlessing(
  statuses: ReadonlyArray<StatusEffect>,
  blessing: BlessingId
): StatusEffect[] {
  const def = BLESSING_DEFS[blessing];
  const kept = statuses.filter((s) => !isBlessingStatusKind(s.kind));
  return [
    ...kept,
    { kind: def.statusKind, turns: BLESSING_DURATION_TURNS, potency: def.potency },
  ];
}
