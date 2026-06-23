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

  it('should block player movement when colliding with building AABB bounds', () => {
    const sim = new Sim();
    
    // Set player position just outside the Inn (AABB max X is -9.2)
    sim.player.x = -8.5;
    sim.player.z = -8.0;
    sim.player.facing = -Math.PI / 2; // Facing West (towards the Inn)
    
    // Try to move forward into the Inn (speed is 8, so in 0.1s it moves 0.8 units)
    sim.tick(0.1, {
      moveForward: true,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      targetNext: false
    });
    
    // Player position should be blocked and remain outside the Inn bounds (should not cross the -9.2 threshold + radius)
    expect(sim.player.x).toBeGreaterThan(-9.2);
  });

  it('should transition mob to chasing when damaged, run towards player, and attack when in range', () => {
    const sim = new Sim();
    
    // Choose the first mob (an Orc) and position them at (5, 5)
    const target = sim.mobs[0];
    target.type = 'orc';
    target.x = 5;
    target.z = 5;
    target.health = 100;
    target.maxHealth = 100;
    target.state = 'idle';
    
    // Direct damage triggers aren't directly exposed other than through projectile impact.
    // Let's spawn a projectile that is already about to hit it.
    sim.projectiles.push({
      id: 'test_proj',
      x: 4.9,
      z: 4.9,
      targetId: target.id,
      speed: 10,
      damage: 10,
      spellType: 'fireball'
    });
    
    // Tick to impact projectile
    sim.tick(0.02, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      targetNext: false
    });
    
    // Verify mob is in chasing state
    expect(target.health).toBe(90);
    expect(target.state).toBe('chasing');
    expect(target.moving).toBe(true);
    
    // Player is at (0, 0).
    // Let's tick and check if mob moves towards (0, 0).
    // Initial distance to (0, 0) from (5, 5) is sqrt(50) ~ 7.07.
    // Run speed is 3.8. At dt = 0.5s, distance traveled = 1.9 units.
    const initialX = target.x;
    const initialZ = target.z;
    
    sim.tick(0.5, {
      moveForward: false,
      moveBack: false,
      turnLeft: false,
      turnRight: false,
      spawnOrc: false,
      castSpell1: false,
      castSpell2: false,
      targetNext: false
    });
    
    // Mob should have moved closer to (0, 0)
    expect(target.x).toBeLessThan(initialX);
    expect(target.z).toBeLessThan(initialZ);
    expect(target.state).toBe('chasing');
    expect(target.moving).toBe(true);
    
    // Place mob in melee range (1.2 units away from player at 0,0)
    target.x = 1.2;
    target.z = 0;
    
    // Tick: it should stop moving and attack the player
    sim.player.health = 100;
    target.attackCooldown = 0; // reset cooldown so it attacks immediately
    
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
    
    // It should have stopped moving
    expect(target.moving).toBe(false);
    // Player should have taken 10 damage from Orc
    expect(sim.player.health).toBe(90);
    expect(target.attackCooldown).toBeCloseTo(1.5, 5); // reset to 1.5 after attacking
    
    // Check combat event
    expect(sim.combatEvents.length).toBe(1);
    expect(sim.combatEvents[0].type).toBe('damage');
    expect(sim.combatEvents[0].targetId).toBe('player');
    expect(sim.combatEvents[0].value).toBe(10);
    
    // If player health drops to 0, mob should reset to idle
    sim.player.health = 0;
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
    
    expect(target.state).toBe('idle');
    expect(target.moving).toBe(false);
  });
});
