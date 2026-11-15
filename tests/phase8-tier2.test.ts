import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseEnemyIntent,
  countLivingSummons,
  findLungeLine,
  findMendTarget,
  findSummonTile,
  isKitingCaster,
  lungeDestination,
  mendHealAmount,
  planCasterMove,
  primeSummonTile,
  resolveMend,
} from '../src/game/combat';
import { createStarterItem } from '../src/game/loot';
import { getStarterPreset } from '../src/game/skills';
import { Enemy, PlayerState, Tile, ZoneMap } from '../src/game/types';
import { createEnemy } from '../src/game/world';

// ---------------------------------------------------------------- fixtures

function makeTestPlayer(x = 10, y = 10): PlayerState {
  const preset = getStarterPreset('Vanguard');
  const weapon = createStarterItem(preset.weaponTag);
  return {
    name: 'Test',
    starterClass: 'Vanguard',
    x,
    y,
    lastDirX: 1,
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

/** Fully open zone (no walls), depth 3 unless overridden. */
function openZone(w = 20, h = 20, depth = 3): ZoneMap {
  const tiles: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) {
      row.push({
        x,
        y,
        kind: 'floor',
        glyph: '·',
        color: '#39414E',
        walkable: true,
        blocksSight: false,
        explored: true,
        visible: true,
      });
    }
    tiles.push(row);
  }
  return {
    id: 'dungeon_3',
    name: 'Test Chamber',
    subtitle: '',
    isTown: false,
    depth,
    width: w,
    height: h,
    tiles,
    enemies: [],
    npcs: [],
    loot: [],
    spawnPoint: { x: 10, y: 10 },
    returnPoint: { x: 10, y: 10 },
  };
}

/** Zone from ASCII rows: '#' is a wall, anything else open floor. */
function roomZone(rows: string[], depth = 3): ZoneMap {
  const tiles: Tile[][] = rows.map((rowStr, y) =>
    rowStr.split('').map((ch, x) => ({
      x,
      y,
      kind: ch === '#' ? 'wall' : 'floor',
      glyph: ch,
      color: '#39414E',
      walkable: ch !== '#',
      blocksSight: ch === '#',
      explored: true,
      visible: true,
    }))
  );
  return {
    id: 'dungeon_3',
    name: 'Test Room',
    subtitle: '',
    isTown: false,
    depth,
    width: rows[0].length,
    height: rows.length,
    tiles,
    enemies: [],
    npcs: [],
    loot: [],
    spawnPoint: { x: 1, y: 1 },
    returnPoint: { x: 1, y: 1 },
  };
}

/** Occupancy predicate mirroring the App's: no enemy, not the player. */
function freeExcept(zone: ZoneMap, player: PlayerState) {
  return (x: number, y: number): boolean =>
    !(x === player.x && y === player.y) && !zone.enemies.some((e) => e.hp > 0 && e.x === x && e.y === y);
}

/** Run fn with Math.random pinned to a constant (0 = every roll succeeds). */
function withRandom<T>(value: number, fn: () => T): T {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

// ------------------------------------------------------- 1. caster kiting

test('kiting: planCasterMove steps away when the player is too close', () => {
  const zone = openZone(11, 11);
  const player = makeTestPlayer(5, 6);
  const acolyte = createEnemy('bone_acolyte', 5, 5, 1);
  zone.enemies = [acolyte];
  const plan = planCasterMove(zone, acolyte, player, freeExcept(zone, player));
  assert.equal(plan.kind, 'step');
  if (plan.kind === 'step') {
    // The chosen step strictly increases the Chebyshev distance.
    assert.ok(Math.max(Math.abs(plan.x - player.x), Math.abs(plan.y - player.y)) > 1);
    assert.ok(zone.tiles[plan.y][plan.x].walkable);
  }
});

test('kiting: planCasterMove holds inside the band and approaches beyond it', () => {
  const zone = openZone(11, 11);
  const acolyte = createEnemy('bone_acolyte', 5, 5, 1);
  zone.enemies = [acolyte];
  const inBand = makeTestPlayer(5, 8); // dist 3
  assert.deepEqual(planCasterMove(zone, acolyte, inBand, freeExcept(zone, inBand)), { kind: 'hold' });
  const atBandEdge = makeTestPlayer(5, 9); // dist 4
  assert.deepEqual(planCasterMove(zone, acolyte, atBandEdge, freeExcept(zone, atBandEdge)), {
    kind: 'hold',
  });
  const beyond = makeTestPlayer(5, 10); // dist 5
  assert.deepEqual(planCasterMove(zone, acolyte, beyond, freeExcept(zone, beyond)), {
    kind: 'approach',
  });
});

test('kiting: a cornered caster holds (no step improves its distance)', () => {
  const zone = roomZone(['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######']);
  const player = makeTestPlayer(2, 2);
  const cultist = createEnemy('ash_cultist', 1, 1, 1);
  zone.enemies = [cultist];
  // Every neighbour of (1,1) is a wall, the player, or stays at distance 1.
  assert.deepEqual(planCasterMove(zone, cultist, player, freeExcept(zone, player)), { kind: 'hold' });
});

test('kiting: occupied and walled steps are never chosen', () => {
  // Wall directly north of the caster; the diagonal distance-gaining steps
  // are corner-cut by that same wall, and the rest stay at distance 1.
  const zone = roomZone(['#######', '#.....#', '#..#..#', '#.....#', '#.....#', '#.....#', '#######']);
  const player = makeTestPlayer(3, 4);
  const revenant = createEnemy('rime_revenant', 3, 3, 4);
  zone.enemies = [revenant];
  assert.deepEqual(planCasterMove(zone, revenant, player, freeExcept(zone, player)), { kind: 'hold' });

  // Same geometry without the wall, but enemies squat on every tile that
  // would increase the distance: still a hold.
  const open = openZone(11, 11);
  const p2 = makeTestPlayer(5, 6);
  const weaver = createEnemy('blight_weaver', 5, 5, 2);
  const blockers = [
    createEnemy('plague_rat', 5, 4, 2),
    createEnemy('plague_rat', 6, 4, 2),
    createEnemy('plague_rat', 4, 4, 2),
  ];
  open.enemies = [weaver, ...blockers];
  assert.deepEqual(planCasterMove(open, weaver, p2, freeExcept(open, p2)), { kind: 'hold' });
});

test('kiting: isKitingCaster covers the four non-boss casters only', () => {
  for (const arch of ['bone_acolyte', 'ash_cultist', 'blight_weaver', 'rime_revenant'] as const) {
    assert.equal(isKitingCaster(createEnemy(arch, 0, 0, 1)), true, arch);
  }
  const bossWeaver = { ...createEnemy('blight_weaver', 0, 0, 2), isBoss: true };
  assert.equal(isKitingCaster(bossWeaver), false, 'bosses keep their current movement');
  assert.equal(isKitingCaster(createEnemy('goblin_skirmisher', 0, 0, 1)), false);
  assert.equal(isKitingCaster(createEnemy('boss_bone_cantor', 0, 0, 2)), false);
});

test('kiting: a cornered caster casts its hex at distance 1; a boss does not', () => {
  const zone = openZone();
  const player = makeTestPlayer(10, 11);
  const acolyte = createEnemy('bone_acolyte', 10, 10, 1);
  zone.enemies = [acolyte];
  const intent = withRandom(0, () => chooseEnemyIntent(acolyte, player, zone));
  assert.equal(intent?.type, 'hex_bolt', 'non-boss caster hex is choosable point-blank');

  const cantor = createEnemy('boss_bone_cantor', 10, 10, 2);
  zone.enemies = [cantor];
  const bossIntent = withRandom(0, () => chooseEnemyIntent(cantor, player, zone));
  assert.notEqual(bossIntent?.type, 'hex_bolt', 'boss hex keeps its 2-5 band');
});

// ------------------------------------------------------------- 2. summoner

function makeMite(summonerId: string, x: number, y: number, hp?: number): Enemy {
  const mite: Enemy = {
    ...createEnemy('plague_rat', x, y, 2),
    name: 'Summoned Mire Mite',
    summoned: true,
    summonerId,
    alerted: true,
    xpReward: 0,
    goldReward: 0,
  };
  if (hp !== undefined) mite.hp = hp;
  return mite;
}

test('summon: primeSummonTile returns an adjacent free tile when eligible', () => {
  const zone = openZone();
  const player = makeTestPlayer(10, 14); // dist 4 from the weaver
  const weaver = createEnemy('blight_weaver', 10, 10, 2);
  zone.enemies = [weaver];
  const tile = primeSummonTile(weaver, player, zone, freeExcept(zone, player));
  assert.ok(tile, 'eligible weaver should have a summon tile');
  assert.equal(Math.max(Math.abs(tile.x - weaver.x), Math.abs(tile.y - weaver.y)), 1);
  assert.ok(zone.tiles[tile.y][tile.x].walkable);
});

test('summon: gating — cooldown, cap, range, free tile, archetype', () => {
  const zone = openZone();
  const player = makeTestPlayer(10, 14);
  const weaver = createEnemy('blight_weaver', 10, 10, 2);
  zone.enemies = [weaver];
  const free = freeExcept(zone, player);

  const onCooldown: Enemy = { ...weaver, intentCooldowns: { summon: 5 } };
  assert.equal(primeSummonTile(onCooldown, player, zone, free), null, 'cooldown blocks');

  zone.enemies = [weaver, makeMite(weaver.id, 9, 9), makeMite(weaver.id, 11, 9)];
  assert.equal(countLivingSummons(zone, weaver.id), 2);
  assert.equal(primeSummonTile(weaver, player, zone, free), null, 'two living summons = cap');

  // Another weaver's mites do not count against this one; dead ones neither.
  const other = createEnemy('blight_weaver', 4, 4, 2);
  zone.enemies = [weaver, makeMite(other.id, 9, 9), makeMite(weaver.id, 11, 9, 0)];
  assert.equal(countLivingSummons(zone, weaver.id), 0);
  assert.ok(primeSummonTile(weaver, player, zone, free), 'foreign/dead summons leave room');

  const farPlayer = makeTestPlayer(10, 17); // dist 7 > SUMMON_RANGE 6
  zone.enemies = [weaver];
  assert.equal(primeSummonTile(weaver, farPlayer, zone, freeExcept(zone, farPlayer)), null, 'range blocks');

  const surrounded = roomZone(['#####', '#...#', '#.#.#', '#...#', '#####']);
  const trapped = createEnemy('blight_weaver', 2, 2, 2);
  // Wall off every neighbour: rewrite the room so all 8 neighbours are walls.
  const sealed = roomZone(['#####', '#####', '##.##', '#####', '#####']);
  const p3 = makeTestPlayer(2, 2);
  sealed.enemies = [trapped];
  assert.equal(findSummonTile(sealed, trapped, freeExcept(sealed, p3)), null, 'no free tile');
  void surrounded;

  const notWeaver = createEnemy('bone_acolyte', 10, 10, 2);
  zone.enemies = [notWeaver];
  assert.equal(primeSummonTile(notWeaver, player, zone, free), null, 'weaver only');
});

test('summon: chooseEnemyIntent primes a summon; cooldown reroutes to hex', () => {
  const zone = openZone();
  const player = makeTestPlayer(10, 13); // dist 3
  const weaver = createEnemy('blight_weaver', 10, 10, 2);
  zone.enemies = [weaver];
  const intent = withRandom(0, () => chooseEnemyIntent(weaver, player, zone));
  assert.equal(intent?.type, 'summon');
  assert.equal(intent?.targetTiles.length, 1);
  assert.equal(intent?.damage, 0);

  const cooling: Enemy = { ...weaver, intentCooldowns: { summon: 12 } };
  const rerouted = withRandom(0, () => chooseEnemyIntent(cooling, player, zone));
  assert.equal(rerouted?.type, 'hex_bolt', 'on cooldown the weaver falls back to its hex');
});

test('summon: summoned mites carry the no-reward contract; wild rats do not', () => {
  const wild = createEnemy('plague_rat', 0, 0, 2);
  assert.equal(wild.summoned, undefined, 'a wild rat is a normal, rewarding kill');
  assert.ok(wild.xpReward > 0 && wild.goldReward > 0);
  const mite = makeMite('weaver-1', 1, 1);
  assert.equal(mite.summoned, true);
  assert.equal(mite.xpReward, 0, 'summoned: no XP');
  assert.equal(mite.goldReward, 0, 'summoned: no gold');
  // (No loot: handleEnemyDeath early-returns for `summoned` before the drop
  // roll, the bestiary tick and the kill counter — the funnel honours this
  // flag; the zeroed rewards above are the belt-and-braces half.)
});

// --------------------------------------------------------------- 3. healer

test('mend: findMendTarget picks the most wounded ally in range', () => {
  const zone = openZone();
  const cultist = createEnemy('ash_cultist', 10, 10, 2);
  const hurt = createEnemy('goblin_skirmisher', 12, 10, 2);
  hurt.hp = Math.floor(hurt.maxHp * 0.5);
  const worse = createEnemy('crypt_skeleton', 11, 12, 2);
  worse.hp = Math.floor(worse.maxHp * 0.3);
  const healthy = createEnemy('plague_rat', 10, 12, 2);
  healthy.hp = Math.floor(healthy.maxHp * 0.7); // above the 60% threshold
  const farHurt = createEnemy('goblin_skirmisher', 15, 10, 2);
  farHurt.hp = Math.floor(farHurt.maxHp * 0.2); // dist 5 > MEND_RANGE 4
  zone.enemies = [cultist, hurt, worse, healthy, farHurt];
  assert.equal(findMendTarget(cultist, zone)?.id, worse.id);

  zone.enemies = [cultist, healthy, farHurt];
  assert.equal(findMendTarget(cultist, zone), undefined, 'nobody both wounded and in range');

  // The cultist never targets itself.
  const woundedSelf: Enemy = { ...cultist, hp: Math.floor(cultist.maxHp * 0.2) };
  zone.enemies = [woundedSelf];
  assert.equal(findMendTarget(woundedSelf, zone), undefined);
});

test('mend: heal amount scales with depth and caps at max HP when fired', () => {
  assert.equal(mendHealAmount(1), 20);
  assert.equal(mendHealAmount(5), 28);
  const zone = openZone(20, 20, 5);
  const cultist = createEnemy('ash_cultist', 10, 10, 5);
  const ally = createEnemy('goblin_skirmisher', 12, 10, 5);
  ally.hp = ally.maxHp - 10; // only 10 HP missing
  zone.enemies = [cultist, ally];
  const res = resolveMend(cultist, ally.id, zone, mendHealAmount(zone.depth));
  assert.equal(res?.heal, 10, 'heal caps at the missing HP');
  assert.equal(res?.target.id, ally.id);
});

test('mend: fire-time validation fizzles on dead, gone, distant or full targets', () => {
  const zone = openZone();
  const cultist = createEnemy('ash_cultist', 10, 10, 3);
  const ally = createEnemy('goblin_skirmisher', 12, 10, 3);
  ally.hp = Math.floor(ally.maxHp * 0.4);
  zone.enemies = [cultist, ally];
  assert.ok(resolveMend(cultist, ally.id, zone, 24), 'baseline: fires');

  const dead: Enemy = { ...ally, hp: 0 };
  zone.enemies = [cultist, dead];
  assert.equal(resolveMend(cultist, ally.id, zone, 24), undefined, 'dead ally: fizzle');

  zone.enemies = [cultist];
  assert.equal(resolveMend(cultist, ally.id, zone, 24), undefined, 'removed ally: fizzle');

  const distant: Enemy = { ...ally, x: 16, y: 10 }; // dist 6 > fire range 5
  zone.enemies = [cultist, distant];
  assert.equal(resolveMend(cultist, ally.id, zone, 24), undefined, 'out of reach: fizzle');

  const full: Enemy = { ...ally, hp: ally.maxHp };
  zone.enemies = [cultist, full];
  assert.equal(resolveMend(cultist, ally.id, zone, 24), undefined, 'already full: fizzle');

  assert.equal(resolveMend(cultist, undefined, zone, 24), undefined, 'no target id: fizzle');
});

test('mend: chooseEnemyIntent primes on the wounded ally; stun and cooldown reroute', () => {
  const zone = openZone(); // depth 3
  const player = makeTestPlayer(10, 13);
  const cultist = createEnemy('ash_cultist', 10, 10, 3);
  const ally = createEnemy('goblin_skirmisher', 12, 10, 3);
  ally.hp = Math.floor(ally.maxHp * 0.4);
  zone.enemies = [cultist, ally];

  const intent = withRandom(0, () => chooseEnemyIntent(cultist, player, zone));
  assert.equal(intent?.type, 'mend');
  assert.equal(intent?.targetEnemyId, ally.id);
  assert.equal(intent?.healAmount, 18 + 2 * zone.depth);
  assert.deepEqual(intent?.targetTiles, [{ x: ally.x, y: ally.y }]);

  // Cancellation by stun, at the decision level: a stunned cultist primes
  // nothing at all (and in the App loop / Bastion Bash handler a stun also
  // deletes an already-primed intent, so the mend never reaches firing).
  const stunned: Enemy = {
    ...cultist,
    statuses: [{ kind: 'stunned', turns: 1, potency: 1 }],
  };
  assert.equal(withRandom(0, () => chooseEnemyIntent(stunned, player, zone)), undefined);

  // On cooldown the cultist goes back to hexing.
  const cooling: Enemy = { ...cultist, intentCooldowns: { mend: 8 } };
  const rerouted = withRandom(0, () => chooseEnemyIntent(cooling, player, zone));
  assert.equal(rerouted?.type, 'hex_bolt');
});

// -------------------------------------------------------------- 4. charger

test('lunge: findLungeLine detects clear cardinal and diagonal lines', () => {
  const zone = openZone(15, 15);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  zone.enemies = [stalker];
  assert.deepEqual(findLungeLine(zone, stalker, makeTestPlayer(5, 8)), [
    { x: 5, y: 6 },
    { x: 5, y: 7 },
    { x: 5, y: 8 },
  ]);
  assert.deepEqual(findLungeLine(zone, stalker, makeTestPlayer(7, 7)), [
    { x: 6, y: 6 },
    { x: 7, y: 7 },
  ]);
  assert.deepEqual(findLungeLine(zone, stalker, makeTestPlayer(3, 5)), [
    { x: 4, y: 5 },
    { x: 3, y: 5 },
  ]);
});

test('lunge: off-line, too near and too far are all rejected', () => {
  const zone = openZone(15, 15);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  zone.enemies = [stalker];
  assert.equal(findLungeLine(zone, stalker, makeTestPlayer(7, 6)), null, 'knight-move offset');
  assert.equal(findLungeLine(zone, stalker, makeTestPlayer(6, 6)), null, 'dist 1');
  assert.equal(findLungeLine(zone, stalker, makeTestPlayer(5, 9)), null, 'dist 4');
  assert.equal(findLungeLine(zone, stalker, makeTestPlayer(8, 6)), null, 'not straight');
});

test('lunge: walls and bodies on the line block it', () => {
  const walled = roomZone([
    '#########',
    '#.......#',
    '#.......#',
    '#....#..#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#########',
  ]);
  const stalker = createEnemy('shadow_stalker', 5, 2, 3);
  walled.enemies = [stalker];
  assert.equal(findLungeLine(walled, stalker, makeTestPlayer(5, 5)), null, 'wall at (5,3)');

  const zone = openZone(15, 15);
  const s2 = createEnemy('shadow_stalker', 5, 5, 3);
  const blocker = createEnemy('plague_rat', 5, 6, 3);
  zone.enemies = [s2, blocker];
  assert.equal(findLungeLine(zone, s2, makeTestPlayer(5, 8)), null, 'enemy on the line');

  // A body BESIDE the line does not block.
  const beside = createEnemy('plague_rat', 6, 6, 3);
  zone.enemies = [s2, beside];
  assert.ok(findLungeLine(zone, s2, makeTestPlayer(5, 8)));
});

test('lunge: destination is the last free tile before the blockage', () => {
  const zone = openZone(15, 15);
  const player = makeTestPlayer(5, 8);
  const line = [
    { x: 5, y: 6 },
    { x: 5, y: 7 },
    { x: 5, y: 8 },
  ];
  // Player still on the end tile: the dash stops adjacent to them.
  assert.deepEqual(lungeDestination(zone, line, freeExcept(zone, player)), { x: 5, y: 7 });
  // Player stepped off entirely: the stalker lands on the snapshot tile.
  const gone = makeTestPlayer(9, 9);
  assert.deepEqual(lungeDestination(zone, line, freeExcept(zone, gone)), { x: 5, y: 8 });
  // First tile blocked: no movement at all.
  const blocker = createEnemy('plague_rat', 5, 6, 3);
  zone.enemies = [blocker];
  assert.equal(lungeDestination(zone, line, freeExcept(zone, player)), null);
});

test('lunge: chooseEnemyIntent primes a lunge at the heavy-strike scale', () => {
  const zone = openZone(15, 15);
  const player = makeTestPlayer(5, 8);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  zone.enemies = [stalker];
  const intent = withRandom(0, () => chooseEnemyIntent(stalker, player, zone));
  assert.equal(intent?.type, 'lunge');
  assert.equal(intent?.damage, Math.round(stalker.atk * 1.45), 'heavy-windup damage scale');
  assert.deepEqual(intent?.targetTiles[2], { x: 5, y: 8 }, 'end tile snapshots the player');

  // Chilled stalkers lunge softer, like every other intent.
  const chilled: Enemy = { ...stalker, statuses: [{ kind: 'chilled', turns: 2, potency: 1 }] };
  const coldIntent = withRandom(0, () => chooseEnemyIntent(chilled, player, zone));
  assert.equal(coldIntent?.damage, Math.round(stalker.atk * 1.45 * 0.65));

  // Roll missed: no lunge (and no other intent at dist 3 for a stalker).
  assert.equal(withRandom(0.99, () => chooseEnemyIntent(stalker, player, zone)), undefined);
});

// ------------------------------------------- regression pins: existing rates

test('regression: pre-existing intent rolls are unchanged', () => {
  const zone = openZone();
  const player = makeTestPlayer(10, 11);
  const goblin = createEnemy('goblin_skirmisher', 10, 10, 1);
  zone.enemies = [goblin];
  assert.equal(withRandom(0, () => chooseEnemyIntent(goblin, player, zone))?.type, 'heavy_windup');
  assert.equal(withRandom(0.99, () => chooseEnemyIntent(goblin, player, zone)), undefined);

  const p2 = makeTestPlayer(10, 12);
  const golem = createEnemy('iron_golem', 10, 10, 4);
  zone.enemies = [golem];
  assert.equal(withRandom(0, () => chooseEnemyIntent(golem, p2, zone))?.type, 'ground_slam');
});
