import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';

describe('Gear and Equipment System', () => {
  it('should equip an item from inventory and recalculate player stats', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    // Reset inventory and equipment
    player.inventory = [
      { itemId: 'iron_sword', count: 1 },
      { itemId: 'apprentice_robe', count: 1 }
    ];
    player.equipment = {
      weapon: null,
      shield: null,
      chest: null,
      ring: null
    };

    // Base stats: maxHealth = 100, maxMana = 100, spellPower = 15
    player.baseMaxHealth = 100;
    player.baseMaxMana = 100;
    player.health = 100;
    player.mana = 100;
    sim.recalculateStats();

    expect(player.maxHealth).toBe(100);
    expect(player.maxMana).toBe(100);
    expect(player.spellPower).toBe(15);

    // Equip apprentice_robe (has healthBonus: 50, manaBonus: 30)
    // robe is at index 1 currently (since iron_sword is at index 0)
    let success = sim.equipItem(1);
    expect(success).toBe(true);
    expect(player.equipment.chest).toBe('apprentice_robe');
    expect(player.maxHealth).toBe(150); // 100 + 50
    expect(player.maxMana).toBe(130);   // 100 + 30

    // Equip iron_sword (has spellDamageBonus: 8, slot: weapon)
    // Now iron_sword is at index 0
    success = sim.equipItem(0);
    expect(success).toBe(true);
    expect(player.equipment.weapon).toBe('iron_sword');
    expect(player.spellPower).toBe(23); // 15 + 8
  });

  it('should swap currently equipped item back to inventory when a new item is equipped in the same slot', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    player.inventory = [
      { itemId: 'iron_sword', count: 1 }
    ];
    player.equipment = {
      weapon: 'iron_sword', // already equipped one
      shield: null,
      chest: null,
      ring: null
    };

    // We have a second iron_sword in inventory we want to equip
    const success = sim.equipItem(0);
    expect(success).toBe(true);
    expect(player.equipment.weapon).toBe('iron_sword');
    // The swapped out iron_sword should now be in the inventory
    expect(player.inventory.length).toBe(1);
    expect(player.inventory[0]).toEqual({ itemId: 'iron_sword', count: 1 });
  });

  it('should successfully unequip an item back to inventory', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    player.inventory = [];
    player.equipment = {
      weapon: 'iron_sword',
      shield: null,
      chest: null,
      ring: null
    };
    player.baseMaxHealth = 100;
    player.baseMaxMana = 100;
    sim.recalculateStats();

    expect(player.spellPower).toBe(23); // 15 + 8

    // Unequip weapon
    const success = sim.unequipItem('weapon');
    expect(success).toBe(true);
    expect(player.equipment.weapon).toBeNull();
    expect(player.spellPower).toBe(15);
    expect(player.inventory.length).toBe(1);
    expect(player.inventory[0]).toEqual({ itemId: 'iron_sword', count: 1 });
  });

  it('should scale fireball projectile damage with spell power', () => {
    const sim = new Sim('starter_zone');
    const player = sim.player;

    // Equip iron_sword (spellPower = 23, +8 bonus over 15 base)
    player.equipment = {
      weapon: 'iron_sword',
      shield: null,
      chest: null,
      ring: null
    };
    sim.recalculateStats();
    expect(player.spellPower).toBe(23);

    // Target a mob
    const target = sim.mobs[0];
    expect(target).toBeDefined();
    player.targetId = target.id;

    // Fast-forward cast
    player.activeCast = {
      spellId: 'fireball',
      name: 'Fireball',
      timer: 0,
      duration: 1.5,
      targetId: target.id
    };

    // Tick the simulation to finish the cast
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

    // Check if the projectile was spawned with scaled damage
    expect(sim.projectiles.length).toBe(1);
    // Base damage of fireball in spell_definitions.json is 25.
    // Let's verify projectile damage has extra bonus (spellPower - 15) which is +8.
    // Base is 25 + 8 = 33.
    expect(sim.projectiles[0].damage).toBe(25 + 8);
  });
});
