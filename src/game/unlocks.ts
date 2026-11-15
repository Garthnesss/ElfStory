// Lifetime unlocks (Phase 8 Tier 3).
//
// Two new-game OPTIONS earned through the per-device lifetime record
// (game/lifetime.ts) — options, never power: nothing here makes a run
// stronger than a fresh player's run could be, it only widens the
// choices at creation.
//
// - companion_choice: after 1 lifetime victory, a new game may bond
//   either companion kind regardless of starter class (the class default
//   is Runecaster → Starlight Owl, everyone else → Silverwind Lynx).
// - veterans_cache: after 3 lifetime victories OR a lifetime deepest
//   floor of 12 (deep in the Endless Abyss), a new game may elect to
//   start with one extra random inscription in the free third slot —
//   the same pool, rarity and depth-1 strength as any starter rune.
//
// The guards live here in the pure layer: sanitizeUnlockChoices strips
// any locked choice, and App's new-game path applies ONLY the sanitized
// result, so a locked option cannot be applied even if a caller (or a
// tampered bundle) asks for it.

import { LifetimeStats } from './lifetime';
import { CompanionKind, PlayerState } from './types';

export const COMPANION_CHOICE_REQUIRED_VICTORIES = 1;
export const VETERANS_CACHE_REQUIRED_VICTORIES = 3;
export const VETERANS_CACHE_REQUIRED_DEEPEST_FLOOR = 12;

/** The companion a starter class bonds by default (no unlock involved). */
export function defaultCompanionKindForClass(
  starterClass: PlayerState['starterClass']
): CompanionKind {
  return starterClass === 'Runecaster' ? 'starlight_owl' : 'silverwind_lynx';
}

export function canChooseCompanion(
  lifetime: Pick<LifetimeStats, 'victories'>
): boolean {
  return lifetime.victories >= COMPANION_CHOICE_REQUIRED_VICTORIES;
}

export function canUseVeteransCache(
  lifetime: Pick<LifetimeStats, 'victories' | 'deepestFloor'>
): boolean {
  return (
    lifetime.victories >= VETERANS_CACHE_REQUIRED_VICTORIES ||
    lifetime.deepestFloor >= VETERANS_CACHE_REQUIRED_DEEPEST_FLOOR
  );
}

/** Title Screen hint shown while the companion choice is locked. */
export function companionChoiceHint(
  lifetime: Pick<LifetimeStats, 'victories'>
): string {
  return canChooseCompanion(lifetime)
    ? 'Companion choice unlocked — bond either spirit, whatever your discipline.'
    : 'Win a run to choose your companion.';
}

/** Title Screen hint shown while the Veteran's Cache is locked. */
export function veteransCacheHint(
  lifetime: Pick<LifetimeStats, 'victories' | 'deepestFloor'>
): string {
  return canUseVeteransCache(lifetime)
    ? 'Veteran’s Cache unlocked — begin with one extra inscription from the road behind you.'
    : 'Win 3 runs — or reach Floor 12 — to unlock the Veteran’s Cache.';
}

export interface NewGameUnlockChoices {
  /** Explicit companion bond; absent/null means the class default. */
  companionKind?: CompanionKind | null;
  /** Elect the Veteran's Cache starting inscription. */
  veteransCache?: boolean;
}

/**
 * Strip any choice the lifetime record has not earned. The new-game path
 * must apply ONLY this sanitized result — that is what makes a locked
 * option un-appliable rather than merely un-shown.
 */
export function sanitizeUnlockChoices(
  lifetime: Pick<LifetimeStats, 'victories' | 'deepestFloor'>,
  choices: NewGameUnlockChoices | undefined | null
): Required<NewGameUnlockChoices> {
  const companionOk = canChooseCompanion(lifetime);
  const cacheOk = canUseVeteransCache(lifetime);
  return {
    companionKind:
      companionOk && (choices?.companionKind === 'silverwind_lynx' || choices?.companionKind === 'starlight_owl')
        ? choices.companionKind
        : null,
    veteransCache: cacheOk ? choices?.veteransCache === true : false,
  };
}
