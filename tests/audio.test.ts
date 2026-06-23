import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';

function makeInput(overrides: Partial<import('../src/sim/sim').SimInput> = {}): import('../src/sim/sim').SimInput {
  return {
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
    selectedPortalIndex: -1,
    ...overrides,
  };
}

describe('Deterministic Audio System Simulation', () => {
  it('should trigger spell cast and projectile hit sound events', () => {
    const sim = new Sim();
    const target = sim.mobs[0];
    target.x = 3;
    target.z = 3;
    target.health = 100;
    sim.player.targetId = target.id;

    // Trigger spellcast
    sim.tick(0.1, makeInput({ castSpell1: true }));
    expect(sim.soundEvents).toContain('cast_fireball');

    // Fast-forward cast
    for (let i = 0; i < 15; i++) {
      sim.tick(0.1, makeInput());
    }
    expect(sim.projectiles.length).toBe(1);

    // Fly projectile to target to trigger impact sound
    sim.tick(0.3, makeInput());
    expect(sim.soundEvents).toContain('projectile_hit');
  });

  it('should trigger quest sound events', () => {
    const sim = new Sim();
    
    // Accept quest
    const accepted = sim.acceptQuest('kill_orcs_quest');
    expect(accepted).toBe(true);
    expect(sim.soundEvents).toContain('quest_accept');

    // Complete quest
    // Setup target count
    const quest = sim.player.quests.find(q => q.questId === 'kill_orcs_quest')!;
    quest.progress = 3; // orc count target
    
    // Teleport player near Tavernkeeper Eldon (id: npc_eldon at x: -10, z: -5)
    sim.player.x = -10;
    sim.player.z = -5;

    const completed = sim.completeQuest('npc_eldon', 'kill_orcs_quest');
    expect(completed).toBe(true);
    expect(sim.soundEvents).toContain('quest_complete');
  });

  it('should trigger potion sound events', () => {
    const sim = new Sim();
    sim.player.inventory.push({ itemId: 'healing_potion', count: 1 });
    sim.player.health = 20;
    sim.player.maxHealth = 100;

    const used = sim.useItem(sim.player.inventory.length - 1);
    expect(used).toBe(true);
    expect(sim.soundEvents).toContain('use_potion');
  });

  it('should trigger equip and unequip sound events', () => {
    const sim = new Sim();
    sim.player.inventory.push({ itemId: 'iron_sword', count: 1 });

    const equipped = sim.equipItem(sim.player.inventory.length - 1);
    expect(equipped).toBe(true);
    expect(sim.soundEvents).toContain('equip_item');

    const unequipped = sim.unequipItem('weapon');
    expect(unequipped).toBe(true);
    expect(sim.soundEvents).toContain('unequip_item');
  });

  it('should trigger buy and sell sound events', () => {
    const sim = new Sim();
    // Position player near Grimur (npc_grimur at x: 10, z: -5)
    sim.player.x = 10;
    sim.player.z = -5;
    sim.player.money = 2000;

    const bought = sim.buyItem('npc_grimur', 'bronze_ring');
    expect(bought).toBe(true);
    expect(sim.soundEvents).toContain('buy_item');

    const sellIdx = sim.player.inventory.findIndex(i => i.itemId === 'bronze_ring');
    const sold = sim.sellItem('npc_grimur', sellIdx);
    expect(sold).toBe(true);
    expect(sim.soundEvents).toContain('sell_item');
  });
});
