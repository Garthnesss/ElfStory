import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeBlessing,
  applyBlessing,
  BLESSING_DURATION_TURNS,
  blessingCost,
  canPurchaseBlessing,
} from '../src/game/blessings';
import { setCurrentCycle, setCurrentDifficulty } from '../src/game/difficulty';
import {
  applyMasterworkTemper,
  canMasterworkTemper,
  depthRarityBonus,
  generateProceduralItem,
  MASTERWORK_TEMPER_COST,
  rerollAffixCost,
  temperBaseCap,
  temperCapFor,
} from '../src/game/loot';
import {
  applyMutatorToEnemy,
  hordeSpawnCount,
  mutatorEligibility,
  mutatorIntroLine,
  mutatorLightPenalty,
  mutatorLootBonus,
  MUTATOR_POOL,
  rollMutator,
} from '../src/game/mutators';
import { SAVE_VERSION } from '../src/game/saveSlots';
import { computeDerivedStats, getStarterPreset } from '../src/game/skills';
import { createStarterItem } from '../src/game/loot';
import { Enemy, Item, PlayerState, StatusEffect } from '../src/game/types';
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

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: 'itm_test',
    name: 'Test Blade',
    category: 'equipment',
    slot: 'weapon',
    rarity: 'Rare',
    glyph: '/',
    levelReq: 1,
    upgradeLevel: 0,
    stats: { atk: 10 },
    value: 50,
    description: 'A test item.',
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<Enemy>): Enemy {
  return {
    id: 'en_test',
    archetype: 'crypt_skeleton',
    name: 'Test Foe',
    glyph: 's',
    color: '#FFFFFF',
    x: 1,
    y: 1,
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 2,
    xpReward: 40,
    goldReward: 20,
    statuses: [],
    alerted: false,
    description: 'A test enemy.',
    ...overrides,
  };
}

function resetScaling() {
  setCurrentDifficulty('standard');
  setCurrentCycle(0);
}

// ------------------------------------------------------- shrine blessings

test('blessings: offering cost starts at 150g and doubles per purchase this cycle', () => {
  assert.equal(blessingCost(0), 150);
  assert.equal(blessingCost(1), 300);
  assert.equal(blessingCost(2), 600);
  assert.equal(blessingCost(3), 1200);
  assert.equal(blessingCost(4), 2400);
  // Hostile inputs normalize to the first-offering price.
  assert.equal(blessingCost(-3), 150);
  assert.equal(blessingCost(Number.NaN), 150);
});

test('blessings: purchase is allowed exactly at the asking price, not below', () => {
  assert.equal(canPurchaseBlessing(150, 0), true);
  assert.equal(canPurchaseBlessing(149, 0), false);
  assert.equal(canPurchaseBlessing(300, 1), true);
  assert.equal(canPurchaseBlessing(299, 1), false);
  // A fortune still cannot skip the escalation: the 5th blessing costs 2400.
  assert.equal(canPurchaseBlessing(2000, 4), false);
  assert.equal(canPurchaseBlessing(2400, 4), true);
});

test('blessings: applying a blessing installs a 150-turn status at the def potency', () => {
  const might = applyBlessing([], 'might');
  assert.deepEqual(might, [{ kind: 'blessing_might', turns: BLESSING_DURATION_TURNS, potency: 2 }]);
  const ward = applyBlessing([], 'ward');
  assert.deepEqual(ward, [{ kind: 'blessing_ward', turns: 150, potency: 2 }]);
  const vigor = applyBlessing([], 'vigor');
  assert.deepEqual(vigor, [{ kind: 'blessing_vigor', turns: 150, potency: 10 }]);
  assert.equal(activeBlessing(might), 'might');
  assert.equal(activeBlessing(ward), 'ward');
  assert.equal(activeBlessing(vigor), 'vigor');
  assert.equal(activeBlessing([]), null);
});

test('blessings: exactly one blessing is active — a new offering replaces the old', () => {
  const debuffs: StatusEffect[] = [
    { kind: 'poison', turns: 3, potency: 3 },
    { kind: 'shielded', turns: 4, potency: 5 },
  ];
  const first = applyBlessing(debuffs, 'might');
  const second = applyBlessing(first, 'vigor');
  // The might blessing is gone; the vigor blessing is the only blessing.
  assert.equal(activeBlessing(second), 'vigor');
  assert.equal(second.filter((s) => s.kind.startsWith('blessing_')).length, 1);
  // Non-blessing statuses ride through untouched.
  assert.deepEqual(
    second.filter((s) => !s.kind.startsWith('blessing_')),
    debuffs
  );
  // The input list was not mutated.
  assert.equal(debuffs.length, 2);
  assert.equal(first.filter((s) => s.kind === 'blessing_might').length, 1);
});

test('blessings: derived stats gain exactly the blessing potency while it lasts', () => {
  const base = makeTestPlayer();
  const baseStats = computeDerivedStats(base);
  const withMight = computeDerivedStats({ ...base, statuses: applyBlessing([], 'might') });
  assert.equal(withMight.atk, baseStats.atk + 2);
  assert.equal(withMight.def, baseStats.def);
  assert.equal(withMight.maxHp, baseStats.maxHp);
  const withWard = computeDerivedStats({ ...base, statuses: applyBlessing([], 'ward') });
  assert.equal(withWard.def, baseStats.def + 2);
  assert.equal(withWard.atk, baseStats.atk);
  const withVigor = computeDerivedStats({ ...base, statuses: applyBlessing([], 'vigor') });
  assert.equal(withVigor.maxHp, baseStats.maxHp + 10);
  // An unrelated status does not leak blessing stats.
  const withShield = computeDerivedStats({
    ...base,
    statuses: [{ kind: 'shielded', turns: 4, potency: 7 }],
  });
  assert.equal(withShield.atk, baseStats.atk);
  assert.equal(withShield.maxHp, baseStats.maxHp);
});

// --------------------------------------------------------- reroll pricing

test('reroll: affix reforge gold scales with rarity, dust stays flat at 8', () => {
  assert.deepEqual(rerollAffixCost('Common'), { gold: 25, dust: 8 });
  assert.deepEqual(rerollAffixCost('Uncommon'), { gold: 40, dust: 8 });
  assert.deepEqual(rerollAffixCost('Rare'), { gold: 65, dust: 8 });
  assert.deepEqual(rerollAffixCost('Epic'), { gold: 100, dust: 8 });
  assert.deepEqual(rerollAffixCost('Relic'), { gold: 180, dust: 8 });
  const ladder = (['Common', 'Uncommon', 'Rare', 'Epic', 'Relic'] as const).map(
    (r) => rerollAffixCost(r).gold
  );
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i] > ladder[i - 1], 'reforge gold strictly increases with rarity');
  }
});

// ---------------------------------------------------- masterwork tempering

test('temper: the base cap is +3, rising to +4 at Smithy level 2', () => {
  assert.equal(temperBaseCap(0), 3);
  assert.equal(temperBaseCap(1), 3);
  assert.equal(temperBaseCap(2), 4);
  assert.equal(temperBaseCap(5), 4);
  assert.equal(temperCapFor(makeItem({ upgradeLevel: 1 }), 0), 3);
  assert.equal(temperCapFor(makeItem({ upgradeLevel: 1 }), 2), 4);
});

test('temper: only a weapon or armor AT the cap may take the Masterwork step', () => {
  assert.equal(canMasterworkTemper(makeItem({ slot: 'weapon', upgradeLevel: 3 }), 0), true);
  assert.equal(canMasterworkTemper(makeItem({ slot: 'armor', upgradeLevel: 3 }), 0), true);
  assert.equal(canMasterworkTemper(makeItem({ slot: 'weapon', upgradeLevel: 2 }), 0), false);
  // At Smithy 2 the cap is +4, so a +3 weapon is not yet at the cap.
  assert.equal(canMasterworkTemper(makeItem({ slot: 'weapon', upgradeLevel: 3 }), 2), false);
  assert.equal(canMasterworkTemper(makeItem({ slot: 'weapon', upgradeLevel: 4 }), 2), true);
  // Other slots never masterwork, even at the cap.
  assert.equal(canMasterworkTemper(makeItem({ slot: 'ring', upgradeLevel: 3 }), 0), false);
  assert.equal(canMasterworkTemper(makeItem({ slot: 'helm', upgradeLevel: 3 }), 0), false);
  assert.equal(canMasterworkTemper(makeItem({ slot: 'amulet', upgradeLevel: 3 }), 0), false);
  // Non-equipment never masterworks.
  assert.equal(
    canMasterworkTemper(makeItem({ category: 'consumable', slot: undefined, upgradeLevel: 3 }), 0),
    false
  );
  assert.deepEqual(MASTERWORK_TEMPER_COST, { gold: 250, dust: 40 });
});

test('temper: the Masterwork step adds one level, flags the item, and freezes its cap', () => {
  const capped = makeItem({ slot: 'weapon', upgradeLevel: 3, stats: { atk: 10 } });
  const mw = applyMasterworkTemper(capped);
  assert.equal(mw.upgradeLevel, 4);
  assert.equal(mw.masterwork, true);
  assert.equal(mw.stats.atk, 12); // ordinary temper math: +2 per positive stat
  assert.ok(mw.name.endsWith('+4'));
  // The original item is untouched.
  assert.equal(capped.upgradeLevel, 3);
  assert.equal(capped.masterwork, undefined);
  // One step only: a masterwork item can never masterwork (or temper) again,
  // and its cap stays frozen even if the Smithy later improves.
  assert.equal(canMasterworkTemper(mw, 0), false);
  assert.equal(canMasterworkTemper(mw, 2), false);
  assert.equal(temperCapFor(mw, 0), 4);
  assert.equal(temperCapFor(mw, 2), 4);
});

// --------------------------------------------------------- abyss loot curve

test('loot curve: the depth bonus is the old 9-per-depth through depth 5', () => {
  for (let d = 1; d <= 5; d++) {
    assert.equal(depthRarityBonus(d), d * 9, `depth ${d} must be identical to the old curve`);
  }
  assert.equal(depthRarityBonus(1), 9);
  assert.equal(depthRarityBonus(5), 45);
});

test('loot curve: beyond depth 5 the bonus grows by 3 per depth and caps at +80', () => {
  assert.equal(depthRarityBonus(6), 48);
  assert.equal(depthRarityBonus(10), 60);
  assert.equal(depthRarityBonus(14), 72);
  assert.equal(depthRarityBonus(16), 78);
  assert.equal(depthRarityBonus(17), 80); // cap reached
  assert.equal(depthRarityBonus(30), 80);
  assert.equal(depthRarityBonus(100), 80);
});

function rarityShare(depth: number, samples: number, lootBonus = 0): Record<string, number> {
  const counts: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Epic: 0, Relic: 0 };
  for (let i = 0; i < samples; i++) {
    counts[generateProceduralItem(depth, { lootBonus }).rarity] += 1;
  }
  for (const k of Object.keys(counts)) counts[k] /= samples;
  return counts;
}

test('loot curve: at depth 14 drops are often Relic but never guaranteed, and never junk', () => {
  const share = rarityShare(14, 800);
  // New curve (bonus 72): Relic ~54%, Epic ~22%, Rare ~24%, nothing below Rare.
  assert.ok(share.Relic > 0.42 && share.Relic < 0.66, `Relic share ${share.Relic}`);
  assert.equal(share.Common, 0);
  assert.equal(share.Uncommon, 0);
  assert.ok(share.Rare > 0.12, `Rare share ${share.Rare} — the tail must not saturate`);
});

test('loot curve: at depth 30 Relic is frequent but a real share of drops is still below it', () => {
  const share = rarityShare(30, 800);
  // Capped curve (bonus 80): Relic ~62%, Epic ~22%, Rare ~16%.
  assert.ok(share.Relic > 0.5 && share.Relic < 0.74, `Relic share ${share.Relic}`);
  assert.ok(share.Rare > 0.06, `Rare share ${share.Rare}`);
  assert.equal(share.Common, 0);
  assert.equal(share.Uncommon, 0);
});

test('loot curve: an Umbral-style +15 loot bonus visibly enriches a floor\'s drops', () => {
  const plain = rarityShare(5, 900, 0);
  const enriched = rarityShare(5, 900, 15);
  // Depth 5: Relic ~27% plain vs ~42% with +15.
  assert.ok(
    enriched.Relic > plain.Relic + 0.05,
    `plain Relic ${plain.Relic} vs enriched ${enriched.Relic}`
  );
});

// ------------------------------------------------------------- mutator roll

test('mutators: eligibility — cycle-0 main floors never, Abyss sometimes, NG+ always', () => {
  assert.equal(mutatorEligibility(1, 0, false), 'never');
  assert.equal(mutatorEligibility(5, 0, false), 'never');
  assert.equal(mutatorEligibility(6, 0, false), 'chance');
  assert.equal(mutatorEligibility(30, 0, false), 'chance');
  // Cycle-0 side dungeons never roll, even at effective depth 6 (Caldera).
  assert.equal(mutatorEligibility(6, 0, true), 'never');
  assert.equal(mutatorEligibility(2, 0, true), 'never');
  // NG+: every dungeon floor, side dungeons included.
  assert.equal(mutatorEligibility(1, 1, false), 'always');
  assert.equal(mutatorEligibility(5, 1, false), 'always');
  assert.equal(mutatorEligibility(2, 1, true), 'always');
  assert.equal(mutatorEligibility(6, 3, true), 'always');
});

test('mutators: ineligible floors return undefined without consuming randomness', () => {
  const throwingRng = () => {
    throw new Error('rng must not be consumed for ineligible floors');
  };
  assert.equal(rollMutator(throwingRng, { depth: 3, cycle: 0 }), undefined);
  assert.equal(rollMutator(throwingRng, { depth: 5, cycle: 0 }), undefined);
  assert.equal(rollMutator(throwingRng, { depth: 6, cycle: 0, isSideBranch: true }), undefined);
});

test('mutators: Abyss floors roll a mutator 75% of the time', () => {
  // Scripted rng: the gate roll decides; 0.8 fails the 75% gate.
  assert.equal(rollMutator(() => 0.8, { depth: 8, cycle: 0 }), undefined);
  // Gate passes (0.5 < 0.75), then the pick roll 0.999 lands on the last entry.
  const scripted = [0.5, 0.999];
  assert.equal(rollMutator(() => scripted.shift() ?? 0, { depth: 8, cycle: 0 }), 'vital_surge');
  // Statistical check over the real rng.
  let mutated = 0;
  const seen = new Set<string>();
  const N = 1200;
  for (let i = 0; i < N; i++) {
    const m = rollMutator(Math.random, { depth: 8, cycle: 0 });
    if (m) {
      mutated += 1;
      seen.add(m);
    }
  }
  const frac = mutated / N;
  assert.ok(frac > 0.69 && frac < 0.81, `mutated fraction ${frac}`);
  assert.equal(seen.size, 4, 'all four mutators appear');
});

test('mutators: NG+ floors always roll, and never repeat the previous floor', () => {
  for (const prev of MUTATOR_POOL) {
    for (const pick of [0, 0.24, 0.26, 0.5, 0.74, 0.76, 0.999]) {
      const rolls = [pick];
      const m = rollMutator(() => rolls.shift() ?? 0, {
        depth: 2,
        cycle: 1,
        previousMutator: prev,
      });
      assert.ok(m, 'NG+ floors always carry a mutator');
      assert.notEqual(m, prev, `must not repeat ${prev}`);
    }
  }
  // With no previous mutator, the full pool is reachable.
  assert.equal(rollMutator(() => 0, { depth: 1, cycle: 1 }), 'gilded_depths');
  assert.equal(rollMutator(() => 0.999, { depth: 1, cycle: 1 }), 'vital_surge');
});

// -------------------------------------------------------- mutator application

test('mutators: Gilded Depths fattens purses and flesh, nothing else', () => {
  const foe = makeEnemy({ hp: 100, maxHp: 100, goldReward: 20, xpReward: 40 });
  const out = applyMutatorToEnemy(foe, 'gilded_depths');
  assert.equal(out.maxHp, 115);
  assert.equal(out.hp, 115);
  assert.equal(out.goldReward, 30);
  assert.equal(out.xpReward, 40);
  assert.equal(out.atk, 10);
  // Input not mutated.
  assert.equal(foe.maxHp, 100);
  assert.equal(foe.goldReward, 20);
});

test('mutators: Vital Surge hardens foes and enriches XP; Horde thins HP', () => {
  const foe = makeEnemy({ hp: 100, maxHp: 100, goldReward: 20, xpReward: 40 });
  const vital = applyMutatorToEnemy(foe, 'vital_surge');
  assert.equal(vital.maxHp, 125);
  assert.equal(vital.xpReward, 50);
  assert.equal(vital.goldReward, 20);
  const horde = applyMutatorToEnemy(foe, 'horde');
  assert.equal(horde.maxHp, 90);
  assert.equal(horde.hp, 90);
  assert.equal(horde.xpReward, 40);
  // Umbral changes no enemy numbers (its teeth are light and loot).
  assert.equal(applyMutatorToEnemy(foe, 'umbral'), foe);
  // No mutator, no change.
  assert.equal(applyMutatorToEnemy(foe, undefined), foe);
  assert.equal(applyMutatorToEnemy(foe, null), foe);
});

test('mutators: hand-tuned bosses are exempt from stat multipliers', () => {
  const boss = makeEnemy({ isBoss: true, hp: 1000, maxHp: 1000, goldReward: 250, xpReward: 550 });
  for (const m of MUTATOR_POOL) {
    const out = applyMutatorToEnemy(boss, m);
    assert.equal(out, boss, `boss must pass through ${m} untouched`);
  }
});

test('mutators: Horde spawn counts average +40% with exact fractional behaviour', () => {
  // Whole-number extras are roll-independent.
  assert.equal(hordeSpawnCount(5, 0), 7);
  assert.equal(hordeSpawnCount(5, 0.999), 7);
  assert.equal(hordeSpawnCount(10, 0.5), 14);
  // Fractional extras resolve on the roll: 2 * 0.4 = 0.8.
  assert.equal(hordeSpawnCount(2, 0.5), 3);
  assert.equal(hordeSpawnCount(2, 0.9), 2);
  // 1 * 0.4 = 0.4.
  assert.equal(hordeSpawnCount(1, 0.3), 2);
  assert.equal(hordeSpawnCount(1, 0.5), 1);
  // 3 * 0.4 = 1.2: one guaranteed, plus one on a low roll.
  assert.equal(hordeSpawnCount(3, 0.1), 5);
  assert.equal(hordeSpawnCount(3, 0.5), 4);
  assert.equal(hordeSpawnCount(0, 0), 0);
});

test('mutators: Umbral carries the light penalty and loot bonus; the others do not', () => {
  assert.equal(mutatorLightPenalty('umbral'), 2);
  assert.equal(mutatorLootBonus('umbral'), 15);
  for (const m of ['gilded_depths', 'horde', 'vital_surge'] as const) {
    assert.equal(mutatorLightPenalty(m), 0);
    assert.equal(mutatorLootBonus(m), 0);
  }
  assert.equal(mutatorLightPenalty(undefined), 0);
  assert.equal(mutatorLootBonus(undefined), 0);
  assert.equal(
    mutatorIntroLine('gilded_depths'),
    'The deep shifts — Gilded Depths: foes here carry heavy purses and heavier flesh.'
  );
  assert.equal(mutatorIntroLine(undefined), undefined);
});

// ------------------------------------------------- generator-level behaviour

test('mutators: cycle-0 floors 1-5 and side dungeons carry no mutator', () => {
  resetScaling();
  for (let depth = 1; depth <= 5; depth++) {
    assert.equal(generateDungeonFloor(depth).mutator, undefined, `floor ${depth}`);
  }
  // Frost floor 3 is effective depth 6 but a cycle-0 side dungeon: no mutator.
  assert.equal(generateSideDungeonFloor('frost', 3).mutator, undefined);
  assert.equal(generateSideDungeonFloor('barrow', 2).mutator, undefined);
});

test('mutators: NG+ floors always carry one, and consecutive floors never repeat', () => {
  resetScaling();
  setCurrentCycle(1);
  try {
    const chain = [
      generateDungeonFloor(1),
      generateDungeonFloor(2),
      generateDungeonFloor(3),
      generateDungeonFloor(4),
      generateDungeonFloor(5),
      generateDungeonFloor(6),
    ];
    for (const zone of chain) {
      assert.ok(zone.mutator, `NG+ floor ${zone.depth} must carry a mutator`);
      assert.ok(MUTATOR_POOL.includes(zone.mutator!));
    }
    for (let i = 1; i < chain.length; i++) {
      assert.notEqual(chain[i].mutator, chain[i - 1].mutator, 'consecutive floors must differ');
    }
    // Side dungeons in NG+ also always carry one.
    assert.ok(generateSideDungeonFloor('barrow', 1).mutator);
  } finally {
    resetScaling();
  }
});

test('mutators: Abyss floors in cycle 0 carry one about three times in four', () => {
  resetScaling();
  let mutated = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    if (generateDungeonFloor(8).mutator) mutated += 1;
  }
  // 75% expected; P(<=28 or >=57 of 60) is vanishingly small.
  assert.ok(mutated > 28 && mutated < 57, `mutated ${mutated}/${N}`);
});

test('mutators: NG+ Malakor keeps his exact cycle-scaled stats on a mutated floor', () => {
  resetScaling();
  setCurrentCycle(1);
  try {
    const floor5 = generateDungeonFloor(5);
    assert.ok(floor5.mutator, 'the NG+ floor is mutated');
    const malakor = floor5.enemies.find((e) => e.archetype === 'boss_malakor');
    assert.ok(malakor, 'Malakor is placed on floor 5');
    // Cycle 1 scaling only (1000 * 1.35 / 36 * 1.25) — no mutator multiplier.
    assert.equal(malakor.hp, 1350);
    assert.equal(malakor.maxHp, 1350);
    assert.equal(malakor.atk, 45);
  } finally {
    resetScaling();
  }
});

test('tier2b: save version stays 1 — mutator and blessing fields are optional additions', () => {
  assert.equal(SAVE_VERSION, 1);
});
