// Deterministic simulation core.
// Rules: no DOM, no Three.js, no Math.random(), no Date.now().
// All state mutations happen here, inside tick().

import { Rng } from './rng';
import { checkCollision } from './world';

// Input snapshot passed in from the game layer each tick.
// Defined here so sim stays self-contained (no import from game/).
export interface SimInput {
  moveForward: boolean;
  moveBack: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  spawnOrc: boolean;
  castSpell1: boolean; // Digit1 (Fireball)
  castSpell2: boolean; // Digit2 (Frostbolt)
  targetNext: boolean; // Tab
}

export interface SpellCast {
  spellId: string;
  name: string;
  timer: number;
  duration: number;
  targetId: string;
}

export interface Player {
  id: string;
  x: number;
  z: number;
  facing: number;   // radians, 0 = +Z (toward camera)
  moving: boolean;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  targetId: string | null;
  activeCast: SpellCast | null;
}

export interface Mob {
  id: string;
  type: 'orc' | 'wolf' | 'goblin';
  x: number;
  z: number;
  facing: number;
  moving: boolean;
  health: number;
  maxHealth: number;
  patrolTimer: number; // time left in current AI state
  state: 'idle' | 'walking';
}

export interface Projectile {
  id: string;
  x: number;
  z: number;
  targetId: string;
  speed: number;
  damage: number;
  spellType: 'fireball' | 'frostbolt';
}

export interface CombatEvent {
  id: string;
  type: 'damage' | 'miss' | 'dodge';
  targetId: string;
  value: number; // damage amount
  x: number;
  z: number;
}

const MOVE_SPEED = 8; // world units per second
const TURN_SPEED = 3; // radians per second (keyboard turning)
const PROJECTILE_SPEED = 18; // speed of fireball/frostbolt

export class Sim {
  readonly rng = new Rng(12345);
  readonly player: Player = {
    id: 'player',
    x: 0,
    z: 0,
    facing: 0,
    moving: false,
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    targetId: null,
    activeCast: null
  };
  readonly mobs: Mob[] = [
    // Orc Camp (48, 48) - Adjusted to avoid tents and weapon stand
    { id: 'mob_1', type: 'orc', x: 48, z: 45, facing: 0, moving: false, health: 60, maxHealth: 60, patrolTimer: 2, state: 'idle' },
    { id: 'mob_2', type: 'orc', x: 45, z: 49, facing: 0, moving: false, health: 60, maxHealth: 60, patrolTimer: 1.5, state: 'idle' },
    { id: 'mob_3', type: 'orc', x: 51, z: 51, facing: 0, moving: false, health: 60, maxHealth: 60, patrolTimer: 2.5, state: 'idle' },
    // Wolf Camp (-60, -60) - Adjusted to avoid large rocks
    { id: 'mob_4', type: 'wolf', x: -60, z: -60, facing: 0, moving: false, health: 40, maxHealth: 40, patrolTimer: 1.8, state: 'idle' },
    { id: 'mob_5', type: 'wolf', x: -63, z: -63, facing: 0, moving: false, health: 40, maxHealth: 40, patrolTimer: 2.2, state: 'idle' },
    { id: 'mob_6', type: 'wolf', x: -57, z: -57, facing: 0, moving: false, health: 40, maxHealth: 40, patrolTimer: 1.2, state: 'idle' },
    // Goblin Camp (72, -72) - Adjusted to avoid small tents
    { id: 'mob_7', type: 'goblin', x: 72, z: -72, facing: 0, moving: false, health: 50, maxHealth: 50, patrolTimer: 2.1, state: 'idle' },
    { id: 'mob_8', type: 'goblin', x: 75, z: -75, facing: 0, moving: false, health: 50, maxHealth: 50, patrolTimer: 1.7, state: 'idle' },
    { id: 'mob_9', type: 'goblin', x: 69, z: -69, facing: 0, moving: false, health: 50, maxHealth: 50, patrolTimer: 2.8, state: 'idle' }
  ];
  readonly projectiles: Projectile[] = [];
  combatEvents: CombatEvent[] = [];

  private nextId = 10; // For generating unique IDs

  private generateId(prefix: string): string {
    return `${prefix}_${this.nextId++}`;
  }

  tick(dt: number, input: SimInput): void {
    const p = this.player;

    // Clear combat events so they only exist for exactly one tick
    this.combatEvents = [];

    // ── Handle one-shot spawn ──────────────────────────────────────
    if (input.spawnOrc) {
      // Spawn 4 units in front and 2 units to the right of the player (so it is not blocked by player body)
      const spawnX = p.x + Math.sin(p.facing) * 4 + Math.cos(p.facing) * 2;
      const spawnZ = p.z + Math.cos(p.facing) * 4 - Math.sin(p.facing) * 2;
      const mobId = this.generateId('mob');
      this.mobs.push({
        id: mobId,
        type: 'orc',
        x: spawnX,
        z: spawnZ,
        facing: p.facing,
        moving: false,
        health: 60,
        maxHealth: 60,
        patrolTimer: this.rng.next() * 2 + 1, // 1 to 3 seconds
        state: 'idle',
      });
    }

    // ── Handle Targeting (Tab cycle) ──────────────────────────────
    // Keep only alive mobs for targeting
    const aliveMobs = this.mobs.filter(m => m.health > 0);
    if (input.targetNext && aliveMobs.length > 0) {
      if (!p.targetId) {
        p.targetId = aliveMobs[0].id;
      } else {
        const currentIndex = aliveMobs.findIndex(m => m.id === p.targetId);
        if (currentIndex === -1) {
          p.targetId = aliveMobs[0].id;
        } else {
          p.targetId = aliveMobs[(currentIndex + 1) % aliveMobs.length].id;
        }
      }
    }

    // Ensure player's target is still alive, otherwise clear it
    if (p.targetId) {
      const target = this.mobs.find(m => m.id === p.targetId);
      if (!target || target.health <= 0) {
        p.targetId = null;
      }
    }

    const isMovingInput = input.moveForward || input.moveBack || input.turnLeft || input.turnRight;
    if ((isMovingInput || p.moving) && p.activeCast) {
      p.activeCast = null;
    }

    if (p.activeCast) {
      p.activeCast.timer += dt;
      if (p.activeCast.timer >= p.activeCast.duration) {
        // Complete the cast: spawn a projectile
        const targetId = p.activeCast.targetId;
        const target = this.mobs.find(m => m.id === targetId);

        if (target && target.health > 0) {
          this.projectiles.push({
            id: this.generateId('proj'),
            x: p.x,
            z: p.z,
            targetId: targetId,
            speed: PROJECTILE_SPEED,
            damage: p.activeCast.spellId === 'fireball' ? 25 : 15,
            spellType: p.activeCast.spellId as 'fireball' | 'frostbolt'
          });
        }
        p.activeCast = null;
      }
    } else if (p.targetId && !p.moving && !isMovingInput) {
      // Only cast if we have a target and are standing still
      if (input.castSpell1 && p.mana >= 15) {
        p.mana -= 15;
        p.activeCast = {
          spellId: 'fireball',
          name: 'Fireball',
          timer: 0,
          duration: 1.5, // 1.5 second cast
          targetId: p.targetId
        };
      } else if (input.castSpell2 && p.mana >= 10) {
        p.mana -= 10;
        p.activeCast = {
          spellId: 'frostbolt',
          name: 'Frostbolt',
          timer: 0,
          duration: 1.0, // 1.0 second cast
          targetId: p.targetId
        };
      }
    }

    // Mana passive regen: +5 mana per second, capped at max
    if (p.mana < p.maxMana) {
      p.mana = Math.min(p.maxMana, p.mana + 5 * dt);
    }

    // ── Projectile Simulation ───────────────────────────────────────
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const target = this.mobs.find(m => m.id === proj.targetId);

      if (!target || target.health <= 0) {
        // Target lost or already dead, destroy projectile
        this.projectiles.splice(i, 1);
        continue;
      }

      // Move projectile towards target in 2D plane
      const dx = target.x - proj.x;
      const dz = target.z - proj.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      const step = proj.speed * dt;
      if (distance <= step) {
        // Impact!
        target.health = Math.max(0, target.health - proj.damage);
        
        // Push combat event
        this.combatEvents.push({
          id: this.generateId('evt'),
          type: 'damage',
          targetId: target.id,
          value: proj.damage,
          x: target.x,
          z: target.z
        });

        this.projectiles.splice(i, 1);
      } else {
        proj.x += (dx / distance) * step;
        proj.z += (dz / distance) * step;
      }
    }

    // ── Player movement ────────────────────────────────────────────
    // Turn with A/D
    if (input.turnLeft) p.facing += TURN_SPEED * dt;
    if (input.turnRight) p.facing -= TURN_SPEED * dt;

    // Move with W/S relative to facing direction
    let pdx = 0;
    let pdz = 0;
    if (input.moveForward) {
      pdx += Math.sin(p.facing) * MOVE_SPEED * dt;
      pdz += Math.cos(p.facing) * MOVE_SPEED * dt;
    }
    if (input.moveBack) {
      pdx -= Math.sin(p.facing) * MOVE_SPEED * dt * 0.6;
      pdz -= Math.cos(p.facing) * MOVE_SPEED * dt * 0.6;
    }

    const nextX = p.x + pdx;
    if (!checkCollision(nextX, p.z, 0.65)) {
      p.x = nextX;
    }
    const nextZ = p.z + pdz;
    if (!checkCollision(p.x, nextZ, 0.65)) {
      p.z = nextZ;
    }
    p.moving = pdx !== 0 || pdz !== 0;

    // ── Mobs AI & movement ──────────────────────────────────────────
    const MOB_WALK_SPEED = 2.5; // walking speed for patrol
    for (const m of this.mobs) {
      if (m.health <= 0) {
        m.moving = false;
        continue; // Dead mobs don't move or patrol
      }

      m.patrolTimer -= dt;
      if (m.patrolTimer <= 0) {
        if (m.state === 'idle') {
          // Choose a random angle to walk
          m.state = 'walking';
          m.facing = this.rng.next() * Math.PI * 2;
          m.patrolTimer = this.rng.next() * 3 + 2; // walk for 2 to 5 seconds
          m.moving = true;
        } else {
          // Pause and stand idle
          m.state = 'idle';
          m.patrolTimer = this.rng.next() * 2.5 + 1.5; // idle for 1.5 to 4 seconds
          m.moving = false;
        }
      }

      if (m.state === 'walking') {
        const mdx = Math.sin(m.facing) * MOB_WALK_SPEED * dt;
        const mdz = Math.cos(m.facing) * MOB_WALK_SPEED * dt;
        
        const mNextX = m.x + mdx;
        if (!checkCollision(mNextX, m.z, 0.65)) {
          m.x = mNextX;
        } else {
          m.state = 'idle';
          m.patrolTimer = this.rng.next() * 2;
          m.moving = false;
        }
        
        const mNextZ = m.z + mdz;
        if (!checkCollision(m.x, mNextZ, 0.65)) {
          m.z = mNextZ;
        } else {
          m.state = 'idle';
          m.patrolTimer = this.rng.next() * 2;
          m.moving = false;
        }
      }
    }
  }
}