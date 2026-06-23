import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';

describe('Shop and Trading System', () => {
  it('should successfully buy items when player has enough money and is close to merchant', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;
    const grimur = sim.zone.npcs.find(n => n.id === 'npc_grimur');
    expect(grimur).toBeDefined();

    // Move player close to Blacksmith Grimur (10, -5)
    player.x = 10;
    player.z = -5;

    // Set player money to 2000 copper
    player.money = 2000;
    player.inventory = [];

    // Buy "iron_sword" (value 1500)
    const success = sim.buyItem('npc_grimur', 'iron_sword');
    expect(success).toBe(true);
    expect(player.money).toBe(500); // 2000 - 1500
    expect(player.inventory.length).toBe(1);
    expect(player.inventory[0]).toEqual({ itemId: 'iron_sword', count: 1 });
  });

  it('should fail to buy item if player does not have enough money', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;
    player.x = 10;
    player.z = -5;
    player.money = 1000; // iron_sword costs 1500
    player.inventory = [];

    const success = sim.buyItem('npc_grimur', 'iron_sword');
    expect(success).toBe(false);
    expect(player.money).toBe(1000);
    expect(player.inventory.length).toBe(0);
  });

  it('should fail to buy item if player is too far away', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;
    // Blacksmith Grimur is at (10, -5). Move player to (20, -5)
    player.x = 20;
    player.z = -5;
    player.money = 2000;
    player.inventory = [];

    const success = sim.buyItem('npc_grimur', 'iron_sword');
    expect(success).toBe(false);
    expect(player.money).toBe(2000);
  });

  it('should successfully sell items and receive 50% of value in money', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;
    player.x = 10;
    player.z = -5;
    player.money = 0;
    // Put iron_sword (value 1500) in inventory
    player.inventory = [{ itemId: 'iron_sword', count: 1 }];

    const success = sim.sellItem('npc_grimur', 0);
    expect(success).toBe(true);
    expect(player.money).toBe(750); // 50% of 1500
    expect(player.inventory.length).toBe(0);
  });
});
