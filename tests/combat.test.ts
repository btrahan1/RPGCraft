import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';

describe('Combat and Spellcasting Simulation', () => {
  it('should start casting a spell and cancel it if player moves', () => {
    const sim = new Sim();
    
    // Initial state: 9 mobs
    expect(sim.mobs.length).toBe(9);
    const target = sim.mobs[0];
    target.x = 3;
    target.z = 3;
    
    // Select target
    sim.player.targetId = target.id;
    
    // Trigger spellcast for Fireball (Spell 1)
    sim.tick(0.1, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: true,
      castSpell2: false,
      targetNext: false
    });
    
    expect(sim.player.activeCast).not.toBeNull();
    expect(sim.player.activeCast?.spellId).toBe('fireball');
    // Timer stays 0 on the frame it is initiated because of else-if ordering
    expect(sim.player.activeCast?.timer).toBe(0);
    
    // Tick again to verify timer increment
    sim.tick(0.1, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      targetNext: false
    });
    expect(sim.player.activeCast?.timer).toBe(0.1);
    
    // Now simulate player movement
    sim.tick(0.1, {
      moveForward: true, // player moves
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      targetNext: false
    });
    
    // Spellcast should be cancelled
    expect(sim.player.activeCast).toBeNull();
  });

  it('should complete a spellcast, spawn a projectile, fly, hit target, and deal damage', () => {
    const sim = new Sim();
    const target = sim.mobs[0];
    target.x = 3;
    target.z = 3;
    
    // Set health to 100 for verification
    target.health = 100;
    target.maxHealth = 100;
    
    sim.player.targetId = target.id;
    
    // Cast Fireball (duration: 1.5s)
    sim.tick(0.1, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: true,
      castSpell2: false,
      targetNext: false
    });
    
    // Tick 15 times with 0.1s to reach 1.5s cast time
    for (let i = 0; i < 15; i++) {
      sim.tick(0.1, {
        moveForward: false,
        moveBack: false,
        turnLeft: false,
        turnRight: false,
        spawnOrc: false,
        castSpell1: false,
        castSpell2: false,
        targetNext: false
      });
    }
    
    // Cast should be complete now, projectile spawned
    expect(sim.player.activeCast).toBeNull();
    expect(sim.projectiles.length).toBe(1);
    
    const proj = sim.projectiles[0];
    expect(proj.spellType).toBe('fireball');
    expect(proj.damage).toBe(25);
    
    // Let's tick the projectile to fly to the target
    // Distance from (0,0) to (3,3) is sqrt(18) = 4.24 units
    // Speed is 18. At dt = 0.2s, distance traveled = 18 * 0.2 = 3.6 units, which is < 4.24
    sim.tick(0.1, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      targetNext: false
    });
    expect(sim.projectiles.length).toBe(1);
    
    // Tick another 0.2s, total distance traveled is 5.4 units, which is > 4.24
    sim.tick(0.2, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      targetNext: false
    });
    
    // Projectile should hit the target and be destroyed
    expect(sim.projectiles.length).toBe(0);
    // Health should be reduced by 25 damage (100 - 25 = 75)
    expect(target.health).toBe(75);
    // A combat event should be recorded
    expect(sim.combatEvents.length).toBe(1);
    expect(sim.combatEvents[0].type).toBe('damage');
    expect(sim.combatEvents[0].value).toBe(25);
  });
});
