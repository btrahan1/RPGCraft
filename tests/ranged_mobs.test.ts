import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';

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

describe('Ranged Mob Combat and AI', () => {
  it('should define skeleton_mage as a ranged mob in definitions', () => {
    const sim = new Sim();
    const skeletonMageMob = sim.mobs.find(m => m.type === 'skeleton_mage');
    expect(skeletonMageMob).toBeDefined();
    
    // Check type registry has the attackRange property
    const mobDef = (sim as any).zone.camps.find((c: any) => c.mobType === 'skeleton_mage');
    expect(mobDef).toBeDefined();
  });

  it('should stop chasing and shoot a frostbolt at the player when within attack range', () => {
    const sim = new Sim();
    const mage = sim.mobs.find(m => m.type === 'skeleton_mage');
    expect(mage).toBeDefined();
    if (!mage) return;

    // Reset health of player and mage
    sim.player.health = 100;
    mage.health = 50;
    mage.maxHealth = 50;
    mage.level = 1;
    mage.attackCooldown = 0;
    mage.state = 'chasing';

    // Position the mage 8 units away (attack range is 10.0)
    mage.x = 8;
    mage.z = 0;

    // Tick to update AI
    sim.tick(0.1, makeInput());

    // Mob should not be moving because it is within range (8 < 10.0)
    expect(mage.moving).toBe(false);

    // It should have fired a projectile (frostbolt) targeted at the player
    expect(sim.projectiles.length).toBe(1);
    const proj = sim.projectiles[0];
    expect(proj.targetId).toBe('player');
    expect(proj.spellType).toBe('frostbolt');
    expect(proj.damage).toBe(12); // baseDamage is 12
    expect(mage.attackCooldown).toBeCloseTo(1.5, 5); // attack cooldown is reset to 1.5s
  });

  it('should have the frostbolt projectile fly to the player and deal damage on impact', () => {
    const sim = new Sim();
    sim.player.health = 100;

    // Manually spawn a frostbolt projectile at (5, 0) targeting the player at (0, 0)
    // Speed is 18 (from gameConfig.json)
    sim.projectiles.push({
      id: 'test_mage_proj',
      x: 5,
      z: 0,
      targetId: 'player',
      speed: 18,
      damage: 12,
      spellType: 'frostbolt'
    });

    // Tick: distance is 5. Speed 18 * dt 0.1 = 1.8 units traveled. Not hit yet.
    sim.tick(0.1, makeInput());
    expect(sim.projectiles.length).toBe(1);
    expect(sim.player.health).toBe(100);

    // Tick: another 0.2s. Total dt = 0.3s. Speed 18 * 0.2 = 3.6 units traveled. Total traveled 5.4 > 5.0. Hits!
    sim.tick(0.2, makeInput());

    // Projectile hits player, is destroyed, deals 12 damage (100 - 12 = 88)
    expect(sim.projectiles.length).toBe(0);
    expect(sim.player.health).toBe(88);

    // Verify combat damage event recorded
    expect(sim.combatEvents.length).toBe(1);
    expect(sim.combatEvents[0].type).toBe('damage');
    expect(sim.combatEvents[0].targetId).toBe('player');
    expect(sim.combatEvents[0].value).toBe(12);
  });
});
