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

describe('NPC Dialogue Proximity System', () => {
  it('should detect when player is close to an NPC', () => {
    const sim = new Sim('starter_zone');
    
    // Initial: Player is at (0,0).
    // The closest NPC is Captain Caleb at (3, -5). Distance is sqrt(9 + 25) = sqrt(34) ~ 5.8 units (> 2.5)
    sim.tick(0.1, makeInput());
    expect(sim.nearNpcIndex).toBe(-1);

    // Place Captain Caleb closer to the player: (1, 1). Distance is sqrt(2) ~ 1.4 units (< 2.5)
    const caleb = sim.zone.npcs.find(n => n.id === 'npc_caleb');
    expect(caleb).toBeDefined();
    
    caleb!.x = 1;
    caleb!.z = 1;
    
    sim.tick(0.1, makeInput());
    
    // Caleb should now be recognized as the nearby NPC
    const calebIdx = sim.zone.npcs.indexOf(caleb!);
    expect(sim.nearNpcIndex).toBe(calebIdx);

    // Move player far away: e.g. x: 50, z: 50
    sim.player.x = 50;
    sim.player.z = 50;
    
    sim.tick(0.1, makeInput());
    expect(sim.nearNpcIndex).toBe(-1);
  });
});
