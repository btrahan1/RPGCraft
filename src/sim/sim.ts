// Deterministic simulation core.
// Rules: no DOM, no Three.js, no Math.random(), no Date.now().
// All state mutations happen here, inside tick().

import { Rng } from './rng';

// Input snapshot passed in from the game layer each tick.
// Defined here so sim stays self-contained (no import from game/).
export interface SimInput {
  moveForward: boolean;
  moveBack: boolean;
  turnLeft: boolean;
  turnRight: boolean;
}

export interface Player {
  x: number;
  z: number;
  facing: number;   // radians, 0 = +Z (toward camera)
  moving: boolean;
}

const MOVE_SPEED = 8; // world units per second
const TURN_SPEED = 3; // radians per second (keyboard turning)

export class Sim {
  readonly rng = new Rng(12345);
  readonly player: Player = { x: 0, z: 0, facing: 0, moving: false };

  tick(dt: number, input: SimInput): void {
    const p = this.player;

    // Turn with A/D
    if (input.turnLeft) p.facing += TURN_SPEED * dt;
    if (input.turnRight) p.facing -= TURN_SPEED * dt;

    // Move with W/S relative to facing direction
    let dx = 0;
    let dz = 0;
    if (input.moveForward) {
      dx += Math.sin(p.facing) * MOVE_SPEED * dt;
      dz += Math.cos(p.facing) * MOVE_SPEED * dt;
    }
    if (input.moveBack) {
      dx -= Math.sin(p.facing) * MOVE_SPEED * dt * 0.6;
      dz -= Math.cos(p.facing) * MOVE_SPEED * dt * 0.6;
    }

    p.x += dx;
    p.z += dz;
    p.moving = dx !== 0 || dz !== 0;
  }
}
