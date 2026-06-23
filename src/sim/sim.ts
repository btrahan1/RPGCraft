// Deterministic simulation core.
// Rules: no DOM, no Three.js, no Math.random(), no Date.now().
// All state mutations happen here, inside tick().

import { Rng } from './rng';
import { checkCollision, type ZoneData } from './world';
import starterZone from '../data/zone_starter.json';

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
  state: 'idle' | 'walking' | 'chasing';
  attackCooldown: number;
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
  readonly zone: ZoneData;
  readonly mobs: Mob[] = [];
  readonly projectiles: Projectile[] = [];
  combatEvents: CombatEvent[] = [];

  private nextId = 10; // For generating unique IDs

  constructor(zone: ZoneData = starterZone as unknown as ZoneData) {
    this.zone = zone;
    
    // Dynamically spawn mobs from the zone camp configuration
    let mobIndex = 1;
    for (const camp of this.zone.camps) {
      for (const spawn of camp.spawns) {
        // Stagger patrol timers using deterministic RNG
        const patrolTimer = 1.0 + this.rng.next() * 1.8;
        this.mobs.push({
          id: `mob_${mobIndex++}`,
          type: camp.mobType,
          x: spawn.x,
          z: spawn.z,
          facing: 0,
          moving: false,
          health: spawn.health,
          maxHealth: spawn.maxHealth,
          patrolTimer: patrolTimer,
          state: 'idle',
          attackCooldown: 0
        });
      }
    }
  }

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
        attackCooldown: 0
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
        if (target.health > 0) {
          target.state = 'chasing';
          target.moving = true;
        }
        
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
    if (!checkCollision(nextX, p.z, this.zone.colliders, 0.65)) {
      p.x = nextX;
    }
    const nextZ = p.z + pdz;
    if (!checkCollision(p.x, nextZ, this.zone.colliders, 0.65)) {
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

      if (m.state === 'chasing') {
        if (p.health <= 0) {
          m.state = 'idle';
          m.moving = false;
          m.patrolTimer = this.rng.next() * 2.5 + 1.5;
        } else {
          const dx = p.x - m.x;
          const dz = p.z - m.z;
          const distance = Math.sqrt(dx * dx + dz * dz);

          if (distance > 1.5) {
            m.facing = Math.atan2(dx, dz);
            m.moving = true;
            
            const runSpeed = 3.8;
            const mdx = Math.sin(m.facing) * runSpeed * dt;
            const mdz = Math.cos(m.facing) * runSpeed * dt;
            
            const mNextX = m.x + mdx;
            if (!checkCollision(mNextX, m.z, this.zone.colliders, 0.65)) {
              m.x = mNextX;
            }
            const mNextZ = m.z + mdz;
            if (!checkCollision(m.x, mNextZ, this.zone.colliders, 0.65)) {
              m.z = mNextZ;
            }
          } else {
            m.moving = false;
            m.attackCooldown -= dt;
            if (m.attackCooldown <= 0) {
              // Deal damage based on type: Orc = 10, Goblin = 7, Wolf = 5
              let dmg = 5;
              if (m.type === 'orc') dmg = 10;
              else if (m.type === 'goblin') dmg = 7;
              else if (m.type === 'wolf') dmg = 5;

              p.health = Math.max(0, p.health - dmg);

              // Push combat event targeting player
              this.combatEvents.push({
                id: this.generateId('evt'),
                type: 'damage',
                targetId: 'player',
                value: dmg,
                x: p.x,
                z: p.z
              });

              m.attackCooldown = 1.5;
            }
          }
        }
      } else {
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
          if (!checkCollision(mNextX, m.z, this.zone.colliders, 0.65)) {
            m.x = mNextX;
          } else {
            m.state = 'idle';
            m.patrolTimer = this.rng.next() * 2;
            m.moving = false;
          }
          
          const mNextZ = m.z + mdz;
          if (!checkCollision(m.x, mNextZ, this.zone.colliders, 0.65)) {
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
}