import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';

describe('Consumables and Hotbar Items', () => {
  it('should consume a healing potion from inventory to restore health and decrement inventory count', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    player.health = 40;
    player.maxHealth = 100;
    player.inventory = [
      { itemId: 'healing_potion', count: 2 }
    ];

    // Consume 1 potion
    const success = sim.useItem(0);
    expect(success).toBe(true);
    expect(player.health).toBe(90); // 40 + 50
    expect(player.inventory.length).toBe(1);
    expect(player.inventory[0]).toEqual({ itemId: 'healing_potion', count: 1 });

    // Consume the second potion
    const success2 = sim.useItem(0);
    expect(success2).toBe(true);
    expect(player.health).toBe(100); // 90 + 50 capped at 100
    expect(player.inventory.length).toBe(0); // empty inventory
  });

  it('should consume a mana potion from inventory to restore mana and decrement inventory count', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    player.mana = 20;
    player.maxMana = 100;
    player.inventory = [
      { itemId: 'mana_potion', count: 1 }
    ];

    const success = sim.useItem(0);
    expect(success).toBe(true);
    expect(player.mana).toBe(70); // 20 + 50
    expect(player.inventory.length).toBe(0);
  });

  it('should not consume a usable item if the player is already at full health/mana', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    player.health = 100;
    player.maxHealth = 100;
    player.inventory = [
      { itemId: 'healing_potion', count: 1 }
    ];

    const success = sim.useItem(0);
    expect(success).toBe(false); // No consumption
    expect(player.health).toBe(100);
    expect(player.inventory.length).toBe(1);
  });

  it('should trigger healing and mana potion hotkey inputs from SimInput', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    player.health = 50;
    player.mana = 50;
    player.inventory = [
      { itemId: 'healing_potion', count: 1 },
      { itemId: 'mana_potion', count: 1 }
    ];

    // Trigger Hotbar 3 (healing potion)
    sim.tick(0.1, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      useHotbar3: true,
      useHotbar4: false,
      useHotbar5: false,
      targetNext: false,
      interact: false,
      openPortalUI: false,
      selectedPortalIndex: -1
    });

    expect(player.health).toBe(100);
    expect(player.inventory.length).toBe(1); // Mana potion remains
    expect(player.inventory[0].itemId).toBe('mana_potion');

    // Trigger Hotbar 4 (mana potion)
    sim.tick(0.1, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      useHotbar3: false,
      useHotbar4: true,
      useHotbar5: false,
      targetNext: false,
      interact: false,
      openPortalUI: false,
      selectedPortalIndex: -1
    });

    expect(player.mana).toBe(100);
    expect(player.inventory.length).toBe(0); // All consumables used
  });
});
