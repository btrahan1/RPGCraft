import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { saveGame, loadGame, applyLoadedSave } from '../src/game/save';

/** Helper to create a default SimInput with convenient overrides. */
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

describe('Loot and Inventory System', () => {
  it('should spawn loot when a mob dies', () => {
    const sim = new Sim();
    
    // Position mob and target it
    const mob = sim.mobs[0];
    mob.x = 2;
    mob.z = 2;
    mob.health = 10; // set low health
    sim.player.targetId = mob.id;
    sim.player.mana = 100;
    
    // Initial inventory & lootContainers should be empty
    expect(sim.player.inventory.length).toBe(0);
    expect(sim.player.money).toBe(0);
    expect(sim.lootContainers.length).toBe(0);

    // Cast Frostbolt (cast duration 1.0s, dmg 15)
    sim.tick(0.1, makeInput({ castSpell2: true }));
    
    // Complete cast
    for (let i = 0; i < 10; i++) {
      sim.tick(0.1, makeInput());
    }

    // Tick to allow projectile impact
    sim.tick(0.2, makeInput());

    // Verify mob is dead
    expect(mob.health).toBe(0);
    
    // Loot container should spawn at mob coordinates
    expect(sim.lootContainers.length).toBe(1);
    const container = sim.lootContainers[0];
    expect(container.x).toBe(mob.x);
    expect(container.z).toBe(mob.z);
    expect(container.money).toBeGreaterThanOrEqual(0);
  });

  it('should allow player to loot items and money', () => {
    const sim = new Sim();
    
    // Force spawn a mock loot container near player (0,0)
    sim.lootContainers.push({
      id: 'mock_loot',
      x: 0.5,
      z: 0.5,
      money: 1500, // 15s
      items: [
        { itemId: 'wolf_pelt', count: 2 },
        { itemId: 'healing_potion', count: 1 }
      ]
    });

    // Run tick to update proximity check
    sim.tick(0.1, makeInput());
    expect(sim.nearLootContainerIndex).toBe(0);

    // Loot only gold/money
    sim.lootGold('mock_loot');
    expect(sim.player.money).toBe(1500);
    expect(sim.lootContainers[0].money).toBe(0);
    expect(sim.lootContainers.length).toBe(1); // items remain

    // Loot one item
    sim.lootItem('mock_loot', 0); // wolf pelt
    expect(sim.player.inventory.length).toBe(1);
    expect(sim.player.inventory[0].itemId).toBe('wolf_pelt');
    expect(sim.player.inventory[0].count).toBe(2);
    expect(sim.lootContainers[0].items.length).toBe(1); // potion remains

    // Loot all remaining
    sim.lootAll('mock_loot');
    expect(sim.player.inventory.length).toBe(2);
    expect(sim.player.inventory[1].itemId).toBe('healing_potion');
    expect(sim.player.inventory[1].count).toBe(1);

    // Container should be removed when fully empty
    expect(sim.lootContainers.length).toBe(0);
    expect(sim.nearLootContainerIndex).toBe(-1);
  });

  it('should correctly save and load player inventory/money state', () => {
    const sim = new Sim();
    sim.player.money = 25000; // 2g 50s
    sim.player.inventory = [
      { itemId: 'bronze_ring', count: 1 },
      { itemId: 'healing_potion', count: 3 }
    ];

    // Mock localStorage
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => { store[key] = val; },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    saveGame(sim, 'starter_zone');

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.money).toBe(25000);
    expect(loaded?.inventory?.length).toBe(2);
    expect(loaded?.inventory?.[0].itemId).toBe('bronze_ring');

    const targetSim = new Sim();
    applyLoadedSave(targetSim.player, loaded!);
    expect(targetSim.player.money).toBe(25000);
    expect(targetSim.player.inventory.length).toBe(2);
    expect(targetSim.player.inventory[0].itemId).toBe('bronze_ring');
    expect(targetSim.player.inventory[0].count).toBe(1);
  });
});
