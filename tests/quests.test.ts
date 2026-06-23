import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';

describe('Quest System', () => {
  it('should allow player to accept a quest and initialize progress', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    player.quests = [];

    // Accept kill_orcs_quest
    const success = sim.acceptQuest('kill_orcs_quest');
    expect(success).toBe(true);
    expect(player.quests.length).toBe(1);
    expect(player.quests[0]).toEqual({
      questId: 'kill_orcs_quest',
      progress: 0,
      completed: false
    });

    // Accept again should fail
    const success2 = sim.acceptQuest('kill_orcs_quest');
    expect(success2).toBe(false);
  });

  it('should progress a kill quest when target mob is defeated', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    player.quests = [];
    sim.acceptQuest('kill_orcs_quest');

    // Simulate killing an orc
    const target = sim.mobs.find(m => m.type === 'orc');
    expect(target).toBeDefined();
    player.x = target!.x - 1;
    player.z = target!.z;
    player.targetId = target!.id;

    // Direct XP grant on death, simulate tick that kills mob
    player.activeCast = {
      spellId: 'fireball',
      name: 'Fireball',
      timer: 0,
      duration: 1.5,
      targetId: target!.id
    };
    // Make target near death so 1 hit kills it
    target!.health = 5;

    sim.tick(1.5, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      targetNext: false,
      interact: false,
      openPortalUI: false,
      selectedPortalIndex: -1
    });

    expect(target!.health).toBe(0);
    // Quest should now have 1 progress
    expect(player.quests[0].progress).toBe(1);
  });

  it('should progress a collect quest dynamically based on inventory count', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    player.quests = [];
    sim.acceptQuest('collect_pelts_quest');

    expect(player.quests[0].progress).toBe(0);

    // Add pelts to inventory and recalculate
    player.inventory = [{ itemId: 'wolf_pelt', count: 2 }];
    sim.recalculateStats();

    expect(player.quests[0].progress).toBe(2);
  });

  it('should complete a quest, deduct items if collect quest, and award money/XP/items', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    // Reset state
    player.quests = [];
    player.money = 0;
    player.experience = 0;
    player.level = 1;

    sim.acceptQuest('collect_pelts_quest');
    player.inventory = [{ itemId: 'wolf_pelt', count: 4 }]; // has 4, objective needs 3
    sim.recalculateStats();

    expect(player.quests[0].progress).toBe(4);

    // Grimur is at (10, -5). Move player near him
    player.x = 10;
    player.z = -5;

    // Complete collect_pelts_quest
    // rewards: 150 exp, 800 money, 1 healing_potion
    const success = sim.completeQuest('npc_grimur', 'collect_pelts_quest');
    expect(success).toBe(true);

    const q = player.quests[0];
    expect(q.completed).toBe(true);

    // Check item deduction (should have 1 wolf_pelt left: 4 - 3 = 1)
    const pelt = player.inventory.find(i => i.itemId === 'wolf_pelt');
    expect(pelt).toBeDefined();
    expect(pelt!.count).toBe(1);

    // Check money reward
    expect(player.money).toBe(800);

    // Check XP reward (150 xp triggers level up if xp threshold is 100)
    expect(player.level).toBe(2);
    expect(player.experience).toBe(50); // level 1 needs 100 xp. remaining is 50 xp

    // Check reward items (1 healing_potion should be added)
    const potion = player.inventory.find(i => i.itemId === 'healing_potion');
    expect(potion).toBeDefined();
    expect(potion!.count).toBe(1);
  });
});
