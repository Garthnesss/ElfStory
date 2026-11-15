import assert from 'node:assert/strict';
import test from 'node:test';
import { packZones, pruneAbyssZones } from '../src/game/cloudSave';
import { formatDeathNote } from '../src/game/lifetime';
import {
  SavedBundle,
  canOfferReturnToEnding,
  clearCompletionStamp,
  resolveLoadedState,
  withCompletionStamp,
} from '../src/game/saveSlots';
import { ZoneId, ZoneMap } from '../src/game/types';
import { createInitialZones, generateDungeonFloor, isSerathGateSealed } from '../src/game/world';

// Behaviour tests for the post-Phase-7 audit fixes (Nov 14). Unlike the
// Phase 7 string-includes pins, these exercise the extracted pure
// decision functions directly: break the logic and these fail, reformat
// the source and they still pass.

// ---------------------------------------------------------------- fixtures

function makeBundle(overrides: Record<string, unknown> = {}): SavedBundle {
  return {
    player: { name: 'Garth Elfstrom', level: 3 },
    zones: {},
    currentZoneId: 'oakhaven',
    worldFlags: {},
    quests: {},
    merchantStocks: {},
    logs: [],
    ...overrides,
  } as unknown as SavedBundle;
}

/** The starting world plus a full 75-floor Abyss (floors 6–80), each
 *  floor individually generated (~12 KB packed, as in a real delve —
 *  the summed size is stable at ~1.0–1.1 MB across generator RNG). */
function makeAbyssZoneSet(): Record<ZoneId, ZoneMap> {
  const zones = createInitialZones();
  for (let d = 6; d <= 80; d++) {
    zones[`dungeon_${d}` as ZoneId] = generateDungeonFloor(d);
  }
  return zones;
}

function abyssKeys(zones: Record<ZoneId, ZoneMap>): string[] {
  return Object.keys(zones)
    .filter((k) => k.startsWith('dungeon_') && Number(k.slice('dungeon_'.length)) > 5)
    .sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
}

// ------------------------------------------- 1. Return to the Ending gate

test('audit 1: Return to the Ending is offered in a town after victory', () => {
  assert.equal(canOfferReturnToEnding({ malakorDefeated: true, isTown: true }), true);
});

test('audit 1: Return to the Ending is NOT offered in a dungeon or the Abyss', () => {
  // The Hardcore escape: pause mid-Abyss at 1 HP, ascend, full heal,
  // death stamp cleared. The button must not exist outside a sanctuary.
  assert.equal(canOfferReturnToEnding({ malakorDefeated: true, isTown: false }), false);
});

test('audit 1: Return to the Ending requires the victory in the first place', () => {
  assert.equal(canOfferReturnToEnding({ malakorDefeated: false, isTown: true }), false);
  assert.equal(canOfferReturnToEnding({ malakorDefeated: false, isTown: false }), false);
});

// ------------------------------------------------- 2. Death-turn load fix

test('audit 2: a living bundle loads into PLAYING with HP untouched (both modes)', () => {
  assert.deepEqual(resolveLoadedState({ hp: 37, hardcore: false }), {
    gameState: 'PLAYING',
    hp: 37,
  });
  assert.deepEqual(resolveLoadedState({ hp: 37, hardcore: true }), {
    gameState: 'PLAYING',
    hp: 37,
  });
  assert.deepEqual(resolveLoadedState({ hp: 1, hardcore: true }), {
    gameState: 'PLAYING',
    hp: 1,
  });
});

test('audit 2: a Hardcore death-turn bundle loads into GAME_OVER (death is final)', () => {
  assert.deepEqual(resolveLoadedState({ hp: 0, hardcore: true }), {
    gameState: 'GAME_OVER',
    hp: 0,
  });
  assert.equal(resolveLoadedState({ hp: -4, hardcore: true }).gameState, 'GAME_OVER');
});

test('audit 2: a non-Hardcore death-turn bundle is rescued at 1 HP, slot unlocked', () => {
  // Phase 7 routed this to GAME_OVER for everyone, locking the slot
  // behind exits that wipe or abandon the run.
  assert.deepEqual(resolveLoadedState({ hp: 0, hardcore: false }), {
    gameState: 'PLAYING',
    hp: 1,
  });
  assert.deepEqual(resolveLoadedState({ hp: -9, hardcore: false }), {
    gameState: 'PLAYING',
    hp: 1,
  });
});

// ---------------------------------------------------- 3. Abyss save bloat

test('audit 3: an 80-floor zone set prunes to story floors + current + previous', () => {
  const zones = makeAbyssZoneSet();
  const pruned = pruneAbyssZones(zones, 'dungeon_80');
  assert.deepEqual(abyssKeys(pruned), ['dungeon_79', 'dungeon_80']);
  // Every non-Abyss zone survives: towns, overworld, side dungeons,
  // and the story descent 1–5.
  for (const id of Object.keys(zones)) {
    if (!abyssKeys(zones).includes(id)) {
      assert.ok(id in pruned, `${id} must never be pruned`);
    }
  }
  assert.ok('dungeon_5' in pruned && 'dungeon_1' in pruned, 'story floors are kept');
});

test('audit 3: pruning keeps the frontier when the save happens outside the Abyss', () => {
  const zones = makeAbyssZoneSet();
  // Saved from town after fast-travelling out: the deepest floor is the
  // re-entry point and must survive (with the floor below it).
  assert.deepEqual(abyssKeys(pruneAbyssZones(zones, 'oakhaven')), ['dungeon_79', 'dungeon_80']);
  // Saved mid-Abyss on the way back up: current pair + frontier pair,
  // still bounded at four Abyss floors no matter how deep the delve was.
  assert.deepEqual(abyssKeys(pruneAbyssZones(zones, 'dungeon_40')), [
    'dungeon_39',
    'dungeon_40',
    'dungeon_79',
    'dungeon_80',
  ]);
});

test('audit 3: a pruned floor-80 bundle serializes well under the cloud ceiling', () => {
  const zones = makeAbyssZoneSet();
  const fullBytes = new TextEncoder().encode(JSON.stringify(packZones(zones))).length;
  // The fixture reproduces the audited bloat: ~1 MB by floor 80, over
  // the 940,000-byte cloud ceiling (MAX_CLOUD_SAVE_BYTES).
  assert.ok(fullBytes > 940_000, `fixture should exceed the ceiling, got ${fullBytes}`);
  const prunedBytes = new TextEncoder().encode(
    JSON.stringify(packZones(pruneAbyssZones(zones, 'dungeon_80')))
  ).length;
  assert.ok(prunedBytes < 940_000, `pruned bundle must fit the cloud, got ${prunedBytes}`);
  assert.ok(prunedBytes < fullBytes / 4, 'pruning removes the unbounded growth');
});

test('audit 3: pruning is a no-op (same reference) when there is nothing to drop', () => {
  const fresh = createInitialZones();
  assert.equal(pruneAbyssZones(fresh, 'oakhaven'), fresh);
  const shallow = makeAbyssZoneSet();
  for (const id of Object.keys(shallow)) {
    if (abyssKeys(shallow).includes(id) && id !== 'dungeon_6') delete shallow[id as ZoneId];
  }
  // Only the current floor remains — nothing stale to drop.
  assert.equal(pruneAbyssZones(shallow, 'dungeon_6'), shallow);
});

// ------------------------------------------- 4. NG+ completion stamp reset

test('audit 4: clearing the completion stamp lets the new cycle earn its own', () => {
  const finished = makeBundle({ completedAtMs: 111_000, ngPlusCycle: 0 });
  const ascended = clearCompletionStamp({ ...finished, ngPlusCycle: 1 });
  assert.equal(ascended.completedAtMs, undefined, 'the stamp does not ride into NG+');
  assert.equal(ascended.ngPlusCycle, 1, 'other bundle fields are untouched');
  assert.equal(finished.completedAtMs, 111_000, 'the input bundle is not mutated');
  // The bug: the stamp effect bails while any stamp exists, so a carried
  // stamp blocked every later victory from refreshing it. A cleared
  // bundle accepts a fresh stamp again…
  const restamped = withCompletionStamp(ascended, 222_000);
  assert.equal(restamped.completedAtMs, 222_000);
  // …and withCompletionStamp still keeps the FIRST stamp once set.
  assert.equal(withCompletionStamp(restamped, 333_000).completedAtMs, 222_000);
});

test('audit 4: clearing an unstamped bundle returns it unchanged', () => {
  const fresh = makeBundle();
  assert.equal(clearCompletionStamp(fresh), fresh);
});

// ------------------------------------------------------- 5a. Serath's gate

test('audit 5a: the Floor 5 descent is sealed while Serath lives', () => {
  assert.equal(isSerathGateSealed('dungeon_4', { inquisitorDefeated: false }), true);
  assert.equal(isSerathGateSealed('dungeon_4', {}), true, 'an unrecorded defeat seals');
  assert.equal(isSerathGateSealed('dungeon_4', { inquisitorDefeated: undefined }), true);
});

test('audit 5a: the gate lifts on Serath’s defeat and applies nowhere else', () => {
  assert.equal(isSerathGateSealed('dungeon_4', { inquisitorDefeated: true }), false);
  assert.equal(isSerathGateSealed('dungeon_3', { inquisitorDefeated: false }), false);
  assert.equal(isSerathGateSealed('dungeon_5', { inquisitorDefeated: false }), false);
  assert.equal(isSerathGateSealed('overworld', { inquisitorDefeated: false }), false);
  assert.equal(isSerathGateSealed('frost_2', { inquisitorDefeated: false }), false);
});

// ---------------------------------------------------- 5b. Death-note floor

test('audit 5b: the hardcore death note names the floor when there is one', () => {
  assert.equal(formatDeathNote(5, 'The Obsidian Sanctum'), 'Fell on Floor 5 · The Obsidian Sanctum');
  assert.equal(formatDeathNote(1, 'Moss-Sunken Reliquary'), 'Fell on Floor 1 · Moss-Sunken Reliquary');
});

test('audit 5b: a surface death never reads “Floor 0”', () => {
  const note = formatDeathNote(0, 'Oakhaven Outpost');
  assert.equal(note, 'Fell on the surface · Oakhaven Outpost');
  assert.ok(!note.includes('Floor 0'));
});
