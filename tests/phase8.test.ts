import assert from 'node:assert/strict';
import test from 'node:test';
import { hasEquippableLoot, LOOT_COMPARE_PROMPT } from '../src/game/loot';
import { deriveTrackedObjectives } from '../src/game/quests';
import {
  getSkillEffectiveRange,
  resolveDirectionalSkillCast,
} from '../src/game/skillTargeting';
import {
  isTutorialStepComplete,
  TUTORIAL_STEPS,
  TutorialBaseline,
  TutorialSignals,
} from '../src/game/tutorial';
import { QuestProgress, Tile, WorldFlags, ZoneMap } from '../src/game/types';
import { createEnemy } from '../src/game/world';

// ---------------------------------------------------------------- fixtures

function makeFlags(overrides: Partial<WorldFlags> = {}): WorldFlags {
  return {
    discoveredZones: ['oakhaven'],
    miraPotionTier: 1,
    citadelAccess: false,
    floor3Shortcut: false,
    npcMet: {},
    npcDisposition: {},
    readLoreIds: [],
    confrontedBosses: [],
    waystonesAttuned: 0,
    bestiaryKills: {},
    unlockedFeats: [],
    townUpgrades: { apothecary: 0, smithy: 0, watchtower: 0 },
    ...overrides,
  };
}

function quest(id: string, status: QuestProgress['status'] = 'active', stage = 1): QuestProgress {
  return { id, status, stage, history: [] };
}

/** 7x7 open room, player at (3,3); '#' walls, '.' floor, all visible. */
function makeRoom(rows?: string[]): ZoneMap {
  const layout = rows ?? [
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
  ];
  const tiles: Tile[][] = layout.map((row, y) =>
    row.split('').map((ch, x) => ({
      x,
      y,
      kind: ch === '#' ? 'wall' : 'floor',
      glyph: ch,
      color: '#ECE4D4',
      walkable: ch !== '#',
      blocksSight: ch === '#',
      explored: true,
      visible: true,
    }))
  );
  return {
    id: 'dungeon_1',
    name: 'Test Chamber',
    subtitle: 'Test',
    depth: 1,
    width: layout[0].length,
    height: layout.length,
    tiles,
    enemies: [],
    npcs: [],
    loot: [],
    spawnPoint: { x: 3, y: 3 },
    returnPoint: { x: 3, y: 3 },
    isTown: false,
  };
}

function roomWithEnemyAt(x: number, y: number): ZoneMap {
  const zone = makeRoom();
  zone.enemies = [createEnemy('plague_rat', x, y, 1)];
  return zone;
}

const P = { playerX: 3, playerY: 3 };

// ------------------------------------------------- directional skill cast

test('skill-confirm: unarmed direction press is always a plain move', () => {
  const zone = roomWithEnemyAt(4, 3);
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: null, rank: 0, dx: 1, dy: 0, zone }),
    { kind: 'move' }
  );
});

test('skill-confirm: an unlearned (rank 0) armed skill never claims a press', () => {
  const zone = roomWithEnemyAt(4, 3);
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'cleave', rank: 0, dx: 1, dy: 0, zone }),
    { kind: 'move' }
  );
});

test('skill-confirm: wait (0,0) never casts', () => {
  const zone = roomWithEnemyAt(4, 3);
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'cleave', rank: 1, dx: 0, dy: 0, zone }),
    { kind: 'move' }
  );
});

test('skill-confirm: armed melee skill + direction at an adjacent foe casts at it', () => {
  const zone = roomWithEnemyAt(4, 3);
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'cleave', rank: 1, dx: 1, dy: 0, zone }),
    { kind: 'cast', targetX: 4, targetY: 3 }
  );
  // Diagonal adjacency counts too (Chebyshev distance 1).
  const diag = roomWithEnemyAt(4, 2);
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'shield_bash', rank: 2, dx: 1, dy: -1, zone: diag }),
    { kind: 'cast', targetX: 4, targetY: 2 }
  );
});

test('skill-confirm: armed melee skill + direction at empty floor or a wall falls through to move', () => {
  const zone = makeRoom();
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'cleave', rank: 1, dx: 1, dy: 0, zone }),
    { kind: 'move' }
  );
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'cleave', rank: 1, dx: 0, dy: -1, zone: makeRoom([
      '#######',
      '#.....#',
      '#..#..#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#######',
    ]) }),
    { kind: 'move' }
  );
});

test('skill-confirm: a foe on an unseen tile is not a valid target (input not eaten)', () => {
  const zone = roomWithEnemyAt(4, 3);
  zone.tiles[3][4].visible = false;
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'cleave', rank: 1, dx: 1, dy: 0, zone }),
    { kind: 'move' }
  );
});

test('skill-confirm: ranged skills cast at the adjacent foe in the pressed direction', () => {
  const zone = roomWithEnemyAt(3, 4);
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'venom_tip', rank: 1, dx: 0, dy: 1, zone }),
    { kind: 'cast', targetX: 3, targetY: 4 }
  );
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'ember_lance', rank: 1, dx: 0, dy: 1, zone }),
    { kind: 'cast', targetX: 3, targetY: 4 }
  );
  // But a ranged skill does not fire at empty floor in that direction.
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'ember_lance', rank: 1, dx: 1, dy: 0, zone }),
    { kind: 'move' }
  );
});

test('skill-confirm: Shadowstep blinks one step onto open visible floor', () => {
  const zone = makeRoom();
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'shadowstep', rank: 1, dx: -1, dy: 0, zone }),
    { kind: 'cast', targetX: 2, targetY: 3 }
  );
});

test('skill-confirm: Shadowstep does not blink onto a foe or into a wall (falls through to bump/move)', () => {
  const withEnemy = roomWithEnemyAt(4, 3);
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'shadowstep', rank: 1, dx: 1, dy: 0, zone: withEnemy }),
    { kind: 'move' }
  );
  const zone = makeRoom();
  assert.deepEqual(
    resolveDirectionalSkillCast({ ...P, skillId: 'shadowstep', rank: 3, dx: 0, dy: -1, zone: makeRoom([
      '#######',
      '#.....#',
      '#..#..#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#######',
    ]) }),
    { kind: 'move' }
  );
  assert.equal(zone.enemies.length, 0); // fixture sanity
});

test('skill-confirm: self-target skills never claim a direction press', () => {
  const zone = roomWithEnemyAt(4, 3);
  for (const skillId of ['iron_fortress', 'frost_nova'] as const) {
    assert.deepEqual(
      resolveDirectionalSkillCast({ ...P, skillId, rank: 1, dx: 1, dy: 0, zone }),
      { kind: 'move' }
    );
  }
});

test('skill-confirm: effective ranges mirror the click-path rules', () => {
  assert.equal(getSkillEffectiveRange('cleave', 1), 1);
  assert.equal(getSkillEffectiveRange('cleave', 3), 1);
  assert.equal(getSkillEffectiveRange('venom_tip', 1), 4);
  assert.equal(getSkillEffectiveRange('venom_tip', 2), 5);
  assert.equal(getSkillEffectiveRange('ember_lance', 1), 5);
  assert.equal(getSkillEffectiveRange('ember_lance', 2), 6);
  assert.equal(getSkillEffectiveRange('executioners_mark', 1), 5);
  assert.equal(getSkillEffectiveRange('shadowstep', 1), 4);
  assert.equal(getSkillEffectiveRange('shadowstep', 2), 5);
  assert.equal(getSkillEffectiveRange('shadowstep', 3), 5);
});

// ------------------------------------------------------------- quest tracker

test('tracker: accepting the Ledger quest advances the main objective past Vance', () => {
  const quests = { shadows_beneath: quest('shadows_beneath', 'active', 1) };
  const { main, side } = deriveTrackedObjectives(quests, makeFlags());
  assert.ok(main);
  assert.doesNotMatch(main.hint, /Speak with Warden Vance/);
  assert.match(main.hint, /Malakor/);
  // The side line is the Ledger quest itself, with its own next step.
  assert.ok(side);
  assert.equal(side.questId, 'shadows_beneath');
  assert.match(side.hint, /Smuggler Cache/);
});

test('tracker: completing the Ledger quest points the main objective at Kaelen', () => {
  const quests = { shadows_beneath: quest('shadows_beneath', 'completed', 2) };
  const { main } = deriveTrackedObjectives(quests, makeFlags());
  assert.ok(main);
  assert.match(main.hint, /Kaelen/);
  assert.match(main.hint, /Floor 5/);
});

test('tracker: a truly fresh run still points at Vance first', () => {
  const { main } = deriveTrackedObjectives({}, makeFlags());
  assert.ok(main);
  assert.match(main.hint, /Warden Vance/);
});

// ------------------------------------------------------------------ tutorial

const tutBaseline: TutorialBaseline = {
  x: 5,
  y: 5,
  kills: 0,
  consumableCount: 3,
  companionStance: 'aggressive',
};
const tutIdle: TutorialSignals = {
  x: 5,
  y: 5,
  kills: 0,
  consumableCount: 3,
  companionStance: 'aggressive',
  dialogueOpen: false,
  anySkillOnCooldown: false,
  restedOrSaved: false,
};

test('tutorial: the companion step completes only when the stance changes', () => {
  assert.equal(isTutorialStepComplete('companion', tutBaseline, tutIdle), false);
  assert.equal(
    isTutorialStepComplete('companion', tutBaseline, { ...tutIdle, companionStance: 'guard' }),
    true
  );
  assert.equal(
    isTutorialStepComplete('companion', tutBaseline, { ...tutIdle, companionStance: 'recall' }),
    true
  );
  // Other progress signals do not complete it.
  assert.equal(
    isTutorialStepComplete('companion', tutBaseline, { ...tutIdle, kills: 2, x: 6 }),
    false
  );
});

test('tutorial: the talk step no longer describes a glyph the sprite game does not render', () => {
  const talk = TUTORIAL_STEPS.find((s) => s.id === 'talk');
  assert.ok(talk);
  assert.doesNotMatch(talk.body, /@/);
  const companion = TUTORIAL_STEPS.find((s) => s.id === 'companion');
  assert.ok(companion);
  assert.match(companion.body, /Aggressive/);
  assert.match(companion.body, /cannot permanently die/);
});

// ---------------------------------------------------------------- loot prompt

test('loot prompt: fires only when a chest granted something equippable', () => {
  assert.equal(hasEquippableLoot([{ category: 'equipment' }]), true);
  assert.equal(hasEquippableLoot([{ category: 'inscription' }]), true);
  assert.equal(hasEquippableLoot([{ category: 'consumable' }, { category: 'equipment' }]), true);
  assert.equal(hasEquippableLoot([{ category: 'consumable' }]), false);
  assert.equal(hasEquippableLoot([{ category: 'quest' }]), false);
  assert.equal(hasEquippableLoot([]), false);
  assert.match(LOOT_COMPARE_PROMPT, /\[I\]/);
});
