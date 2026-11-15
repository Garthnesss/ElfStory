import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeathCause, formatRunRecap } from '../src/game/autopsy';
import {
  adjustDerivedForChallenges,
  canUseConsumableWithChallenges,
  challengeDisplayLine,
  challengeSpawnCount,
  companionDamageWithChallenges,
  companionMaxHpWithChallenges,
  enemyGoldWithChallenges,
  normalizeChallenges,
  setCurrentChallenges,
} from '../src/game/challenges';
import { setCurrentCycle, setCurrentDifficulty } from '../src/game/difficulty';
import { LifetimeStats } from '../src/game/lifetime';
import { computeDerivedStats, getStarterPreset } from '../src/game/skills';
import { createStarterItem, generateInscription } from '../src/game/loot';
import {
  floorRngFor,
  generateRunSeed,
  generationSeedFor,
  hashSeedString,
  mulberry32,
  normalizeRunSeed,
  setCurrentRunSeed,
} from '../src/game/rng';
import { bundleChallenges, bundleSeed, SAVE_VERSION, SavedBundle } from '../src/game/saveSlots';
import { DerivedStats, PlayerState, ZoneMap } from '../src/game/types';
import {
  canChooseCompanion,
  canUseVeteransCache,
  companionChoiceHint,
  defaultCompanionKindForClass,
  sanitizeUnlockChoices,
  veteransCacheHint,
} from '../src/game/unlocks';
import { generateDungeonFloor, generateSideDungeonFloor } from '../src/game/world';

// ---------------------------------------------------------------- fixtures

function makeTestPlayer(): PlayerState {
  const preset = getStarterPreset('Vanguard');
  const weapon = createStarterItem(preset.weaponTag);
  return {
    name: 'Test',
    starterClass: 'Vanguard',
    x: 10,
    y: 10,
    hp: 48,
    maxHp: 48,
    mana: 18,
    maxMana: 18,
    level: 1,
    xp: 0,
    xpToNext: 65,
    gold: 35,
    glyphDust: 0,
    attributePoints: 0,
    skillPoints: 0,
    attributes: { ...preset.attributes },
    skills: {},
    hotbar: [null, null, null, null, null],
    cooldowns: {},
    statuses: [],
    equipped: { weapon },
    inventory: [],
    kills: 0,
    turnsElapsed: 0,
    firstStrikeReady: true,
  };
}

function lifetime(overrides: Partial<LifetimeStats> = {}): LifetimeStats {
  return {
    expeditionsStarted: 0,
    victories: 0,
    deaths: 0,
    totalKills: 0,
    deepestFloor: 0,
    highestCycle: 0,
    ...overrides,
  };
}

/**
 * The floor signature the seed contract promises: tile layout, spawn
 * archetypes/positions/stats, chest count, ground-loot placement and
 * contents, and the floor's mutator. (Enemy/item ids are session-unique
 * counters and timestamps by design, so they are not part of it.)
 */
function floorSignature(zone: ZoneMap): string {
  const tiles = zone.tiles.map((row) => row.map((t) => t.kind).join(',')).join('/');
  const enemies = zone.enemies
    .map((e) => `${e.archetype}@${e.x},${e.y}:${e.maxHp}/${e.atk}:${e.name}`)
    .sort()
    .join(';');
  const chests = zone.tiles.flat().filter((t) => t.kind === 'chest').length;
  const loot = zone.loot
    .map((l) => `${l.x},${l.y}:${l.gold ?? ''}:${l.item?.name ?? ''}:${l.item?.inscriptionKind ?? ''}`)
    .sort()
    .join(';');
  return `${tiles}|${enemies}|chests=${chests}|${loot}|mutator=${zone.mutator ?? '-'}`;
}

/** Reset every module-level run knob the generators read. */
function resetRunModules() {
  setCurrentCycle(0);
  setCurrentDifficulty('standard');
  setCurrentChallenges([]);
  setCurrentRunSeed(undefined);
}

// ---------------------------------------------------------------- seeds: rng

test('rng: mulberry32 is deterministic per seed and differs across seeds', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  const c = mulberry32(43);
  assert.notDeepEqual([c(), c(), c(), c()], seqA);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('rng: hashSeedString is stable and seed-sensitive', () => {
  assert.equal(hashSeedString('ember-123'), hashSeedString('ember-123'));
  assert.notEqual(hashSeedString('ember-123'), hashSeedString('ember-124'));
  assert.notEqual(hashSeedString('seed::dungeon_1'), hashSeedString('seed::dungeon_2'));
});

test('rng: floorRngFor separates streams by zone', () => {
  const f1 = floorRngFor('seed', 'dungeon_1');
  const f2 = floorRngFor('seed', 'dungeon_2');
  assert.notEqual(f1(), f2());
});

test('rng: generationSeedFor folds NG+ cycles in', () => {
  assert.equal(generationSeedFor('abc', 0), 'abc');
  assert.equal(generationSeedFor('abc', 2), 'abc#cycle2');
  assert.equal(generationSeedFor('abc', -3), 'abc');
});

test('rng: generateRunSeed produces distinct copyable seeds', () => {
  const s1 = generateRunSeed();
  const s2 = generateRunSeed();
  assert.match(s1, /^[a-z]+-[0-9a-z]{5}$/);
  assert.notEqual(s1, s2);
  // A rigged source pins the shape deterministically.
  assert.equal(generateRunSeed(() => 0), 'ashen-00000');
});

test('rng: normalizeRunSeed trims, caps and rejects empties', () => {
  assert.equal(normalizeRunSeed('  ember-1  '), 'ember-1');
  assert.equal(normalizeRunSeed(''), undefined);
  assert.equal(normalizeRunSeed('   '), undefined);
  assert.equal(normalizeRunSeed(undefined), undefined);
  assert.equal(normalizeRunSeed(42), undefined);
  assert.equal(normalizeRunSeed('x'.repeat(80))?.length, 48);
});

// ---------------------------------------------------------------- seeds: floors

test('seeds: same seed + zone regenerates the identical floor', () => {
  resetRunModules();
  for (const depth of [1, 2, 3, 5]) {
    const a = floorSignature(generateDungeonFloor(depth, { seed: 'ember-test1' }));
    const b = floorSignature(generateDungeonFloor(depth, { seed: 'ember-test1' }));
    assert.equal(a, b, `depth ${depth}`);
  }
});

test('seeds: Abyss floors (mutator-bearing) also regenerate identically', () => {
  resetRunModules();
  for (const depth of [6, 7, 9, 12]) {
    const a = floorSignature(generateDungeonFloor(depth, { seed: 'abyss-seed' }));
    const b = floorSignature(generateDungeonFloor(depth, { seed: 'abyss-seed' }));
    assert.equal(a, b, `depth ${depth}`);
  }
});

test('seeds: different seeds produce different floors', () => {
  resetRunModules();
  const a = floorSignature(generateDungeonFloor(3, { seed: 'ember-test1' }));
  const b = floorSignature(generateDungeonFloor(3, { seed: 'other-seed' }));
  assert.notEqual(a, b);
});

test('seeds: a pruned Abyss floor regenerates identically after other floors intervene', () => {
  resetRunModules();
  // The Tier-"prune" correctness property: floor 7 is dropped from a
  // save, floors 8/9/12 are generated in the meantime (advancing every
  // piece of session generation state), and floor 7 must still come
  // back exactly as it was — mutator included.
  const before = floorSignature(generateDungeonFloor(7, { seed: 'regen-check' }));
  generateDungeonFloor(8, { seed: 'regen-check' });
  generateDungeonFloor(9, { seed: 'regen-check' });
  generateDungeonFloor(12, { seed: 'regen-check' });
  const after = floorSignature(generateDungeonFloor(7, { seed: 'regen-check' }));
  assert.equal(after, before);
});

test('seeds: side-dungeon floors are seeded by their real zone id', () => {
  resetRunModules();
  const a = floorSignature(generateSideDungeonFloor('barrow', 1, { seed: 'side-seed' }));
  const b = floorSignature(generateSideDungeonFloor('barrow', 1, { seed: 'side-seed' }));
  assert.equal(a, b);
  const c = floorSignature(generateSideDungeonFloor('mire', 2, { seed: 'side-seed' }));
  const d = floorSignature(generateSideDungeonFloor('mire', 2, { seed: 'side-seed' }));
  assert.equal(c, d);
  // Same effective depth, different branch: barrow_1 (depth 2) must not
  // alias the main descent's dungeon_2 stream.
  const main = floorSignature(generateDungeonFloor(2, { seed: 'side-seed' }));
  assert.notEqual(a, main);
});

test('seeds: the module run seed (App path) drives generation when no option is passed', () => {
  resetRunModules();
  setCurrentRunSeed('module-seed');
  const a = floorSignature(generateDungeonFloor(3));
  const b = floorSignature(generateDungeonFloor(3));
  assert.equal(a, b);
  resetRunModules();
});

test('seeds: NG+ cycles remake the world — deterministic per cycle, different across cycles', () => {
  resetRunModules();
  const cycle0 = floorSignature(generateDungeonFloor(2, { seed: 'cycle-check' }));
  setCurrentCycle(1);
  const cycle1a = floorSignature(generateDungeonFloor(2, { seed: 'cycle-check' }));
  const cycle1b = floorSignature(generateDungeonFloor(2, { seed: 'cycle-check' }));
  assert.equal(cycle1a, cycle1b);
  assert.notEqual(cycle1a, cycle0);
  resetRunModules();
});

test('seeds: a bundle without a seed still generates (legacy path)', () => {
  resetRunModules();
  const zone = generateDungeonFloor(3);
  assert.equal(zone.width, 46);
  assert.equal(zone.height, 32);
  assert.ok(zone.enemies.length > 0);
  assert.ok(zone.tiles.flat().some((t) => t.kind === 'stairs_down'));
});

test('seeds: bundle accessors normalize seed and challenges', () => {
  const bare = { runSeed: undefined } as unknown as SavedBundle;
  assert.equal(bundleSeed(bare), undefined);
  assert.deepEqual(bundleChallenges(bare), []);
  const rich = {
    runSeed: '  ember-9  ',
    challenges: ['cursed_gold', 'bogus', 'glass_cannon', 'cursed_gold'],
  } as unknown as SavedBundle;
  assert.equal(bundleSeed(rich), 'ember-9');
  assert.deepEqual(bundleChallenges(rich), ['glass_cannon', 'cursed_gold']);
  assert.equal(SAVE_VERSION, 1);
});

// ---------------------------------------------------------------- challenges

test('challenges: normalizeChallenges filters, dedupes and orders canonically', () => {
  assert.deepEqual(normalizeChallenges(undefined), []);
  assert.deepEqual(normalizeChallenges('glass_cannon'), []);
  assert.deepEqual(
    normalizeChallenges(['cursed_gold', 'nope', 'glass_cannon', 'cursed_gold', 7]),
    ['glass_cannon', 'cursed_gold']
  );
});

test('challenges: glass cannon scales ATK +30% and max HP -30% through the derived funnel', () => {
  const base: DerivedStats = {
    maxHp: 100,
    maxMana: 40,
    atk: 50,
    def: 10,
    spellPower: 20,
    critChance: 10,
    dodgeChance: 5,
    lifesteal: 0,
    thorns: 0,
    buildTitle: 'Test',
  };
  const adjusted = adjustDerivedForChallenges(base, ['glass_cannon']);
  assert.equal(adjusted.atk, 65);
  assert.equal(adjusted.maxHp, 70);
  assert.equal(adjusted.def, 10);
  // Identity without the modifier: same object, untouched values.
  assert.equal(adjustDerivedForChallenges(base, []), base);
  assert.equal(adjustDerivedForChallenges(base, ['cursed_gold']), base);

  // And through the real funnel: computeDerivedStats honours the module list.
  resetRunModules();
  const player = makeTestPlayer();
  const plain = computeDerivedStats(player);
  setCurrentChallenges(['glass_cannon']);
  const cannon = computeDerivedStats(player);
  assert.equal(cannon.atk, Math.round(plain.atk * 1.3));
  assert.equal(cannon.maxHp, Math.round(plain.maxHp * 0.7));
  resetRunModules();
  assert.deepEqual(computeDerivedStats(player), plain);
});

test('challenges: no draughts blocks only the drinkable vials', () => {
  assert.equal(canUseConsumableWithChallenges('heal_potion', ['no_draughts']), false);
  assert.equal(canUseConsumableWithChallenges('mana_potion', ['no_draughts']), false);
  assert.equal(canUseConsumableWithChallenges('ward_talisman', ['no_draughts']), true);
  assert.equal(canUseConsumableWithChallenges('scroll_blink', ['no_draughts']), true);
  assert.equal(canUseConsumableWithChallenges('throwing_knife', ['no_draughts']), true);
  // Identity: everything usable without the challenge.
  assert.equal(canUseConsumableWithChallenges('heal_potion', []), true);
  assert.equal(canUseConsumableWithChallenges('mana_potion', ['glass_cannon']), true);
});

test('challenges: horde world spawn counts average +30% and are identity without it', () => {
  // Fractional-remainder resolution, same approach as the Horde mutator.
  assert.equal(challengeSpawnCount(10, 0.99, ['horde_world']), 13);
  assert.equal(challengeSpawnCount(1, 0.1, ['horde_world']), 2);
  assert.equal(challengeSpawnCount(1, 0.9, ['horde_world']), 1);
  assert.equal(challengeSpawnCount(0, 0, ['horde_world']), 0);
  assert.equal(challengeSpawnCount(10, 0, []), 10);
  assert.equal(challengeSpawnCount(10, 0, ['cursed_gold']), 10);
});

test('challenges: horde world crowds a seeded floor (pinned counts)', () => {
  resetRunModules();
  const base = generateDungeonFloor(2, { seed: 'horde-check' }).enemies.length;
  setCurrentChallenges(['horde_world']);
  const horde = generateDungeonFloor(2, { seed: 'horde-check' }).enemies.length;
  resetRunModules();
  assert.equal(base, 16);
  assert.equal(horde, 18);
  assert.ok(horde > base);
});

test('challenges: frail companion halves max HP and cuts damage to three quarters', () => {
  assert.equal(companionMaxHpWithChallenges(24, ['frail_companion']), 12);
  assert.equal(companionMaxHpWithChallenges(45, ['frail_companion']), 23);
  assert.equal(companionMaxHpWithChallenges(24, []), 24);
  assert.equal(companionDamageWithChallenges(20, ['frail_companion']), 15);
  assert.equal(companionDamageWithChallenges(7, ['frail_companion']), 5);
  assert.equal(companionDamageWithChallenges(20, ['glass_cannon']), 20);
});

test('challenges: cursed gold halves enemy drops, rounded down', () => {
  assert.equal(enemyGoldWithChallenges(10, ['cursed_gold']), 5);
  assert.equal(enemyGoldWithChallenges(5, ['cursed_gold']), 2);
  assert.equal(enemyGoldWithChallenges(250, ['cursed_gold']), 125);
  assert.equal(enemyGoldWithChallenges(0, ['cursed_gold']), 0);
  assert.equal(enemyGoldWithChallenges(10, []), 10);
});

test('challenges: modifiers stack — glass cannon and frail companion apply together', () => {
  const both = normalizeChallenges(['frail_companion', 'glass_cannon']);
  const base: DerivedStats = {
    maxHp: 200,
    maxMana: 40,
    atk: 40,
    def: 10,
    spellPower: 20,
    critChance: 10,
    dodgeChance: 5,
    lifesteal: 0,
    thorns: 0,
    buildTitle: 'Test',
  };
  const adjusted = adjustDerivedForChallenges(base, both);
  assert.equal(adjusted.atk, 52);
  assert.equal(adjusted.maxHp, 140);
  assert.equal(companionMaxHpWithChallenges(30, both), 15);
  assert.equal(companionDamageWithChallenges(16, both), 12);
  assert.equal(
    challengeDisplayLine(both),
    'Challenges: Glass Cannon · Frail Companion'
  );
  // An empty/absent list is the identity everywhere it is displayed.
  assert.equal(challengeDisplayLine([]), undefined);
  assert.equal(challengeDisplayLine(undefined), undefined);
  assert.equal(challengeDisplayLine(null), undefined);
});

// ---------------------------------------------------------------- autopsy

test('autopsy: buildDeathCause names the lethal blow across kinds', () => {
  assert.equal(
    buildDeathCause({
      lastDamage: { kind: 'basic', name: 'Crypt Sentinel' },
      zoneName: 'Moss-Sunken Reliquary',
      depth: 1,
    }),
    'Slain by Crypt Sentinel — Floor 1'
  );
  assert.equal(
    buildDeathCause({
      lastDamage: { kind: 'telegraph', name: 'Inquisitor Serath', detail: 'telegraphed slam' },
      zoneName: 'Inquisitor Crucible',
      depth: 4,
    }),
    "Slain by Inquisitor Serath's telegraphed slam — Floor 4"
  );
  // A telegraph without a recorded detail falls back to the generic noun.
  assert.equal(
    buildDeathCause({
      lastDamage: { kind: 'telegraph', name: 'Vaelen, Bone Cantor' },
      zoneName: 'Frost-Bound Ossuary',
      depth: 2,
    }),
    "Slain by Vaelen, Bone Cantor's telegraphed attack — Floor 2"
  );
});

test('autopsy: buildDeathCause uses claimed-by phrasing for dots, traps and hazards', () => {
  assert.equal(
    buildDeathCause({
      lastDamage: { kind: 'dot', name: 'Poison' },
      zoneName: 'The Endless Abyss',
      depth: 6,
    }),
    'Claimed by Poison — Floor 6'
  );
  assert.equal(
    buildDeathCause({
      lastDamage: { kind: 'trap', name: 'Spike Snare' },
      zoneName: 'Frost-Bound Ossuary',
      depth: 2,
    }),
    'Claimed by a Spike Snare — Floor 2'
  );
  assert.equal(
    buildDeathCause({
      lastDamage: { kind: 'environment', name: 'Blight Spore Pool' },
      zoneName: 'Moss-Sunken Reliquary',
      depth: 1,
    }),
    'Claimed by Blight Spore Pool — Floor 1'
  );
  assert.equal(
    buildDeathCause({
      lastDamage: { kind: 'environment', name: "Spore Hulk's death-burst" },
      zoneName: 'The Ember Vaults',
      depth: 3,
    }),
    "Claimed by Spore Hulk's death-burst — Floor 3"
  );
});

test('autopsy: buildDeathCause falls back gracefully and names the surface', () => {
  assert.equal(
    buildDeathCause({ lastDamage: null, zoneName: 'The Endless Abyss', depth: 9 }),
    'Fell in the deep — Floor 9'
  );
  assert.equal(
    buildDeathCause({
      lastDamage: { kind: 'basic', name: 'Brigand Captain' },
      zoneName: 'Silverwood Vale',
      depth: 0,
    }),
    'Slain by Brigand Captain — Silverwood Vale'
  );
  assert.equal(
    buildDeathCause({ lastDamage: undefined, zoneName: 'Oakhaven Outpost', depth: 0 }),
    'Fell in the deep — Oakhaven Outpost'
  );
});

test('autopsy: formatRunRecap renders the compact row, with challenges when active', () => {
  assert.equal(
    formatRunRecap({ level: 12, cycle: 1, deepestFloor: 7, kills: 143, gold: 2310 }),
    'Lv 12 · Cycle 1 · Deepest Floor 7 · 143 Slain · 2310g'
  );
  assert.equal(
    formatRunRecap({
      level: 3,
      cycle: 0,
      deepestFloor: 2,
      kills: 21,
      gold: 140,
      challenges: ['glass_cannon'],
    }),
    'Lv 3 · Deepest Floor 2 · 21 Slain · 140g · Challenges: Glass Cannon'
  );
  assert.equal(
    formatRunRecap({ level: 1, cycle: 0, deepestFloor: 0, kills: 0, gold: 35, challenges: [] }),
    'Lv 1 · Deepest Floor 0 · 0 Slain · 35g'
  );
});

// ---------------------------------------------------------------- unlocks

test('unlocks: companion choice boundary is exactly one victory', () => {
  assert.equal(canChooseCompanion(lifetime({ victories: 0 })), false);
  assert.equal(canChooseCompanion(lifetime({ victories: 1 })), true);
  assert.equal(canChooseCompanion(lifetime({ victories: 7 })), true);
  assert.equal(defaultCompanionKindForClass('Runecaster'), 'starlight_owl');
  assert.equal(defaultCompanionKindForClass('Vanguard'), 'silverwind_lynx');
  assert.equal(companionChoiceHint(lifetime({ victories: 0 })), 'Win a run to choose your companion.');
});

test('unlocks: veterans cache boundary is 3 victories OR deepest floor 12', () => {
  assert.equal(canUseVeteransCache(lifetime({ victories: 2, deepestFloor: 11 })), false);
  assert.equal(canUseVeteransCache(lifetime({ victories: 3, deepestFloor: 0 })), true);
  assert.equal(canUseVeteransCache(lifetime({ victories: 0, deepestFloor: 12 })), true);
  assert.equal(canUseVeteransCache(lifetime({ victories: 2, deepestFloor: 12 })), true);
  assert.equal(canUseVeteransCache(lifetime({ victories: 0, deepestFloor: 11 })), false);
  assert.equal(
    veteransCacheHint(lifetime({ victories: 0, deepestFloor: 0 })),
    'Win 3 runs — or reach Floor 12 — to unlock the Veteran’s Cache.'
  );
});

test('unlocks: locked options cannot be applied — the pure-layer guard strips them', () => {
  const locked = lifetime({ victories: 0, deepestFloor: 0 });
  assert.deepEqual(
    sanitizeUnlockChoices(locked, { companionKind: 'starlight_owl', veteransCache: true }),
    { companionKind: null, veteransCache: false }
  );
  // Partially earned: companion (1 victory) applies, cache (needs 3) does not.
  const partial = lifetime({ victories: 1, deepestFloor: 4 });
  assert.deepEqual(
    sanitizeUnlockChoices(partial, { companionKind: 'starlight_owl', veteransCache: true }),
    { companionKind: 'starlight_owl', veteransCache: false }
  );
  // Earned via the floor route: the CACHE applies, but the companion
  // choice is victory-gated and stays stripped.
  const floorEarned = lifetime({ victories: 0, deepestFloor: 12 });
  assert.deepEqual(
    sanitizeUnlockChoices(floorEarned, { companionKind: 'silverwind_lynx', veteransCache: true }),
    { companionKind: null, veteransCache: true }
  );
  // Fully earned (3 victories earn both): both apply.
  const earned = lifetime({ victories: 3, deepestFloor: 12 });
  assert.deepEqual(
    sanitizeUnlockChoices(earned, { companionKind: 'silverwind_lynx', veteransCache: true }),
    { companionKind: 'silverwind_lynx', veteransCache: true }
  );
  // Nothing asked, nothing granted — even for a veteran.
  assert.deepEqual(sanitizeUnlockChoices(earned, undefined), {
    companionKind: null,
    veteransCache: false,
  });
  assert.deepEqual(sanitizeUnlockChoices(earned, {}), {
    companionKind: null,
    veteransCache: false,
  });
});

test('unlocks: the veterans cache inscription comes from the standard pool', () => {
  // The cache grants via generateInscription(1) — assert the granted item
  // is a real pool inscription of starter-grade strength, not a new kind.
  const item = generateInscription(1, { minRarity: 'Uncommon' });
  assert.equal(item.category, 'inscription');
  assert.ok(item.inscriptionKind);
  assert.ok(item.levelReq <= 1);
});
