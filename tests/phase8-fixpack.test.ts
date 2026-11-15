import assert from 'node:assert/strict';
import test from 'node:test';
import { LUNGE_ROLL, shouldPrimeLungeAfterMove } from '../src/game/combat';
import { createStarterItem } from '../src/game/loot';
import {
  deleteSlotConfirmMessage,
  overwriteConfirmMessage,
  saveSlotLabel,
} from '../src/game/saveSlots';
import { getStarterPreset } from '../src/game/skills';
import { PlayerState, Tile, ZoneMap } from '../src/game/types';
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
    tiles,
    enemies: [],
    npcs: [],
    loot: [],
    width: w,
    height: h,
    spawnPoint: { x: 1, y: 1 },
    returnPoint: { x: 1, y: 1 },
  } as ZoneMap;
}

// ------------------------------------------- post-move lunge prime (fix 3)

test('lunge prime: a stalker that ends its move in a clear line primes the lunge', () => {
  const zone = openZone(15, 15);
  const player = makeTestPlayer(5, 8);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  zone.enemies = [stalker];
  const intent = shouldPrimeLungeAfterMove(zone, stalker, player, true, 0);
  assert.equal(intent?.type, 'lunge');
  assert.equal(intent?.label, 'Coiling to Lunge');
  assert.equal(intent?.damage, Math.round(stalker.atk * 1.45), 'heavy-windup damage scale');
  assert.deepEqual(intent?.targetTiles, [
    { x: 5, y: 6 },
    { x: 5, y: 7 },
    { x: 5, y: 8 },
  ]);
});

test('lunge prime: diagonal lines prime too', () => {
  const zone = openZone(15, 15);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  zone.enemies = [stalker];
  const intent = shouldPrimeLungeAfterMove(zone, stalker, makeTestPlayer(7, 7), true, 0);
  assert.equal(intent?.type, 'lunge');
  assert.deepEqual(intent?.targetTiles, [
    { x: 6, y: 6 },
    { x: 7, y: 7 },
  ]);
});

test('lunge prime: ending adjacent, off-line or beyond range primes nothing', () => {
  const zone = openZone(15, 15);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  zone.enemies = [stalker];
  assert.equal(
    shouldPrimeLungeAfterMove(zone, stalker, makeTestPlayer(5, 6), true, 0),
    undefined,
    'dist 1 — it bumps or windups instead'
  );
  assert.equal(
    shouldPrimeLungeAfterMove(zone, stalker, makeTestPlayer(7, 6), true, 0),
    undefined,
    'knight-move offset is not a straight line'
  );
  assert.equal(
    shouldPrimeLungeAfterMove(zone, stalker, makeTestPlayer(5, 9), true, 0),
    undefined,
    'dist 4 is beyond the lunge line'
  );
});

test('lunge prime: a body on the line blocks the prime', () => {
  const zone = openZone(15, 15);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  const blocker = createEnemy('plague_rat', 5, 6, 3);
  zone.enemies = [stalker, blocker];
  assert.equal(shouldPrimeLungeAfterMove(zone, stalker, makeTestPlayer(5, 8), true, 0), undefined);
});

test('lunge prime: an already-primed stalker never double-primes', () => {
  const zone = openZone(15, 15);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  stalker.intent = {
    type: 'heavy_windup',
    label: 'Telegraphing Heavy Strike',
    damage: 20,
    targetTiles: [{ x: 5, y: 8 }],
  };
  zone.enemies = [stalker];
  assert.equal(shouldPrimeLungeAfterMove(zone, stalker, makeTestPlayer(5, 8), true, 0), undefined);
});

test('lunge prime: non-stalkers never prime a lunge after moving', () => {
  const zone = openZone(15, 15);
  const goblin = createEnemy('goblin_skirmisher', 5, 5, 3);
  zone.enemies = [goblin];
  assert.equal(shouldPrimeLungeAfterMove(zone, goblin, makeTestPlayer(5, 8), true, 0), undefined);
});

test('lunge prime: no move, no prime — a blocked stalker keeps only its turn-start chance', () => {
  const zone = openZone(15, 15);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  zone.enemies = [stalker];
  assert.equal(shouldPrimeLungeAfterMove(zone, stalker, makeTestPlayer(5, 8), false, 0), undefined);
});

test('lunge prime: the roll gates the prime at LUNGE_ROLL', () => {
  const zone = openZone(15, 15);
  const stalker = createEnemy('shadow_stalker', 5, 5, 3);
  zone.enemies = [stalker];
  const player = makeTestPlayer(5, 8);
  assert.equal(shouldPrimeLungeAfterMove(zone, stalker, player, true, LUNGE_ROLL), undefined);
  assert.equal(shouldPrimeLungeAfterMove(zone, stalker, player, true, 0.99), undefined);
  assert.equal(shouldPrimeLungeAfterMove(zone, stalker, player, true, LUNGE_ROLL - 0.01)?.type, 'lunge');
});

test('lunge prime: stunned stalkers do not prime; chilled stalkers prime softer', () => {
  const zone = openZone(15, 15);
  const player = makeTestPlayer(5, 8);
  const stunned = createEnemy('shadow_stalker', 5, 5, 3);
  stunned.statuses = [{ kind: 'stunned', turns: 1, potency: 1 }];
  zone.enemies = [stunned];
  assert.equal(shouldPrimeLungeAfterMove(zone, stunned, player, true, 0), undefined);

  const chilled = createEnemy('shadow_stalker', 5, 5, 3);
  chilled.statuses = [{ kind: 'chilled', turns: 2, potency: 1 }];
  zone.enemies = [chilled];
  const intent = shouldPrimeLungeAfterMove(zone, chilled, player, true, 0);
  assert.equal(intent?.damage, Math.round(chilled.atk * 1.45 * 0.65), 'chill scales the lunge like every intent');
});

// --------------------------------------- confirm-modal copy (fix 2)

test('confirm copy: slot labels', () => {
  assert.equal(saveSlotLabel('slot_1'), 'Slot 1');
  assert.equal(saveSlotLabel('slot_2'), 'Slot 2');
  assert.equal(saveSlotLabel('slot_3'), 'Slot 3');
});

test('confirm copy: overwrite message matches the old window.confirm text exactly', () => {
  assert.equal(
    overwriteConfirmMessage('slot_1'),
    'Slot 1 already holds a saved expedition. Starting a new adventure will overwrite it. Continue?'
  );
  assert.equal(
    overwriteConfirmMessage('slot_3'),
    'Slot 3 already holds a saved expedition. Starting a new adventure will overwrite it. Continue?'
  );
});

test('confirm copy: delete message matches the old window.confirm text exactly', () => {
  assert.equal(
    deleteSlotConfirmMessage('slot_2'),
    'Delete the saved expedition in Slot 2? This removes both the local and cloud save and cannot be undone.'
  );
});
