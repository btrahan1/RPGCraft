// Deterministic simulation core.
// Rules: no DOM, no Three.js, no Math.random(), no Date.now().
// All state mutations happen here, inside tick().

import { Rng } from './rng';
import { checkCollision, portalProximityCheck, type ZoneData, type PortalDef, MobType, MOB_REGISTRY } from './world';
import starterZone from '../data/zone_starter.json';
import scorchingDesert from '../data/zone_scorching_desert.json';
import gameConfig from '../data/game_config.json';
import spellDefinitions from '../data/spell_definitions.json';

// ── Zone Registry ────────────────────────────────────────────────────────
const ZONE_REGISTRY: Record<string, ZoneData> = {
  'starter_zone': starterZone as unknown as ZoneData,
  'scorching_desert': scorchingDesert as unknown as ZoneData,
};

export function getZoneKeys(): string[] {
  return Object.keys(ZONE_REGISTRY);
}

export function getZoneData(key: string): ZoneData | undefined {
  return ZONE_REGISTRY[key];
}

export function isValidZoneKey(key: string): boolean {
  return key in ZONE_REGISTRY;
}

// Input snapshot passed in from the game layer each tick.
export interface SimInput {
  moveForward: boolean;
  moveBack: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  spawnOrc: boolean;
  castSpell1: boolean;
  castSpell2: boolean;
  targetNext: boolean;
  interact: boolean;        // E key – interact with objects like portals
  openPortalUI: boolean;    // true when the portal list is opened by the renderer
  selectedPortalIndex: number; // -1 = none, 0+ = which portal entry was clicked
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
  facing: number;
  moving: boolean;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  level: number;
  experience: number;
  nextLevelExp: number;
  targetId: string | null;
  activeCast: SpellCast | null;
}

export interface Mob {
  id: string;
  type: MobType; // Now uses the MobType alias
  level: number;
  x: number;
  z: number;
  facing: number;
  moving: boolean;
  health: number;
  maxHealth: number;
  patrolTimer: number;
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
  value: number;
  x: number;
  z: number;
}

const MOVE_SPEED = gameConfig.player.moveSpeed;
const TURN_SPEED = gameConfig.player.turnSpeed;
const PROJECTILE_SPEED = gameConfig.combat.projectileSpeed;

// ── Experience & Leveling constants ──────────────────────────────────────
const LEVEL_XP_TABLE: number[] = gameConfig.combat.levelXpTable;

export function getXpForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level >= LEVEL_XP_TABLE.length) {
    return (level * level * 65) + LEVEL_XP_TABLE[LEVEL_XP_TABLE.length - 1];
  }
  return LEVEL_XP_TABLE[level - 1];
}

export function getMobXpValue(mobLevel: number): number {
  return gameConfig.combat.xpPerMobLevelMultiplier * mobLevel;
}

export function calcLevelUpXp(currentLevel: number): number {
  return getXpForLevel(currentLevel + 1) - getXpForLevel(currentLevel);
}

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
    stamina: 100,
    maxStamina: 100,
    level: 1,
    experience: 0,
    nextLevelExp: 100,
    targetId: null,
    activeCast: null
  };
  readonly zone: ZoneData;
  readonly mobs: Mob[] = [];
  readonly projectiles: Projectile[] = [];
  combatEvents: CombatEvent[] = [];

  /** Index of the portal the player is currently near, or -1 if none. */
  nearPortalIndex: number = -1;

  private nextId = 10;

  constructor(zoneKey: string = 'starter_zone') {
    const zoneData = ZONE_REGISTRY[zoneKey];
    if (!zoneData) {
      throw new Error(`Unknown zone key: "${zoneKey}". Available: ${Object.keys(ZONE_REGISTRY).join(', ')}`);
    }
    this.zone = zoneData;
    // Place the player at the zone's first portal's spawn, or (0,0) if no portals
    this.player.x = 0;
    this.player.z = 0;
    this.spawnMobs();
  }

  /** Imports from another zone's Sim (carries over player state). */
  static transitionTo(from: Sim, zoneKey: string, spawnX: number, spawnZ: number): Sim {
    const newSim = new Sim(zoneKey);
    // Carry over player state (stats, level, experience)
    const p = newSim.player;
    p.level = from.player.level;
    p.experience = from.player.experience;
    p.nextLevelExp = from.player.nextLevelExp;
    p.health = from.player.health;
    p.maxHealth = from.player.maxHealth;
    p.mana = from.player.mana;
    p.maxMana = from.player.maxMana;
    p.stamina = from.player.stamina;
    p.maxStamina = from.player.maxStamina;
    p.facing = from.player.facing;
    // Place player at the spawn coordinates
    p.x = spawnX;
    p.z = spawnZ;
    return newSim;
  }

  /** Returns the portal definition at the given index, or null. */
  getPortal(index: number): PortalDef | null {
    if (index >= 0 && index < this.zone.portals.length) {
      return this.zone.portals[index];
    }
    return null;
  }

  private spawnMobs(): void {
    let mobIndex = 1;
    for (const camp of this.zone.camps) {
      for (const spawn of camp.spawns) {
        const mobLevel = this.rng.int(camp.minLevel, camp.maxLevel);
        const mobDef = MOB_REGISTRY[camp.mobType];
        if (!mobDef) {
          console.warn(`Attempted to spawn unknown mob type: ${camp.mobType}`);
          continue;
        }
        const health = mobDef.baseHealth + (mobLevel - 1) * gameConfig.combat.mobHealthPerLevel; // Simple scaling
        const patrolTimer = 1.0 + this.rng.next() * 1.8;
        this.mobs.push({
          id: `mob_${mobIndex++}`,
          type: camp.mobType,
          level: mobLevel,
          x: spawn.x,
          z: spawn.z,
          facing: 0,
          moving: false,
          health: health,
          maxHealth: health,
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

  private grantXp(amount: number): void {
    const p = this.player;
    p.experience += amount;
    while (p.experience >= p.nextLevelExp) {
      p.experience -= p.nextLevelExp;
      p.level++;
      p.maxHealth += gameConfig.player.levelUpHealthGain;
      p.health = p.maxHealth;
      p.maxMana += gameConfig.player.levelUpManaGain;
      p.mana = p.maxMana;
      p.maxStamina += gameConfig.player.levelUpStaminaGain;
      p.stamina = p.maxStamina;
      p.nextLevelExp = calcLevelUpXp(p.level);
      this.combatEvents.push({
        id: this.generateId('evt'),
        type: 'damage',
        targetId: 'player',
        value: 0, // This is a level up event, not damage
        x: p.x,
        z: p.z
      });
    }
  }

  tick(dt: number, input: SimInput): void {
    const p = this.player;

    this.combatEvents = [];

    // ── Portal Proximity Check ──────────────────────────────────────────
    // Just check and expose proximity — do NOT auto-transition
    this.nearPortalIndex = -1;
    for (let i = 0; i < this.zone.portals.length; i++) {
      if (portalProximityCheck(p.x, p.z, this.zone.portals[i])) {
        this.nearPortalIndex = i;
        break;
      }
    }

    // ── Handle one-shot spawn ──────────────────────────────────────
    if (input.spawnOrc) {
      const spawnX = p.x + Math.sin(p.facing) * 4 + Math.cos(p.facing) * 2;
      const spawnZ = p.z + Math.cos(p.facing) * 4 - Math.sin(p.facing) * 2;
      const mobId = this.generateId('mob');
      const spawnLevel = Math.max(1, p.level - 1 + this.rng.int(0, 2));
      const mobDef = MOB_REGISTRY['orc']; // Directly using 'orc' for this specific spawn input
      if (mobDef) {
        const health = mobDef.baseHealth + (spawnLevel - 1) * gameConfig.combat.mobHealthPerLevel;
        this.mobs.push({
          id: mobId,
          type: 'orc',
          level: spawnLevel,
          x: spawnX,
          z: spawnZ,
          facing: p.facing,
          moving: false,
          health: health,
          maxHealth: health,
          patrolTimer: this.rng.next() * 2 + 1,
          state: 'idle',
          attackCooldown: 0
        });
      }
    }

    // ── Handle Targeting (Tab cycle) ──────────────────────────────
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
        const targetId = p.activeCast.targetId;
        const target = this.mobs.find(m => m.id === targetId);
        if (target && target.health > 0) {
          const spell = spellDefinitions.find(s => s.id === p.activeCast!.spellId);
          this.projectiles.push({
            id: this.generateId('proj'),
            x: p.x,
            z: p.z,
            targetId: targetId,
            speed: PROJECTILE_SPEED,
            damage: spell ? spell.damage : 15,
            spellType: p.activeCast.spellId as 'fireball' | 'frostbolt'
          });
        }
        p.activeCast = null;
      }
    } else if (p.targetId && !p.moving && !isMovingInput) {
      if (input.castSpell1) {
        const spell = spellDefinitions.find(s => s.id === 'fireball');
        if (spell && p.mana >= spell.manaCost) {
          p.mana -= spell.manaCost;
          p.activeCast = {
            spellId: 'fireball',
            name: spell.name,
            timer: 0,
            duration: spell.castDuration,
            targetId: p.targetId
          };
        }
      } else if (input.castSpell2) {
        const spell = spellDefinitions.find(s => s.id === 'frostbolt');
        if (spell && p.mana >= spell.manaCost) {
          p.mana -= spell.manaCost;
          p.activeCast = {
            spellId: 'frostbolt',
            name: spell.name,
            timer: 0,
            duration: spell.castDuration,
            targetId: p.targetId
          };
        }
      }
    }

    if (p.mana < p.maxMana) {
      p.mana = Math.min(p.maxMana, p.mana + gameConfig.player.manaRegenPerSecond * dt);
    }

    // ── Projectile Simulation ───────────────────────────────────────
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const target = this.mobs.find(m => m.id === proj.targetId);

      if (!target || target.health <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const dx = target.x - proj.x;
      const dz = target.z - proj.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const step = proj.speed * dt;

      if (distance <= step) {
        const killed = target.health <= proj.damage;
        target.health = Math.max(0, target.health - proj.damage);
        if (target.health > 0) {
          target.state = 'chasing';
          target.moving = true;
        }

        this.combatEvents.push({
          id: this.generateId('evt'),
          type: 'damage',
          targetId: target.id,
          value: proj.damage,
          x: target.x,
          z: target.z
        });

        if (killed) {
          const xpGained = getMobXpValue(target.level);
          this.grantXp(xpGained);
          this.combatEvents.push({
            id: this.generateId('evt'),
            type: 'damage',
            targetId: 'player',
            value: xpGained,
            x: p.x,
            z: p.z
          });
        }

        this.projectiles.splice(i, 1);
      } else {
        proj.x += (dx / distance) * step;
        proj.z += (dz / distance) * step;
      }
    }

    // ── Player movement ────────────────────────────────────────────
    if (input.turnLeft) p.facing += TURN_SPEED * dt;
    if (input.turnRight) p.facing -= TURN_SPEED * dt;

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
    const MOB_WALK_SPEED = gameConfig.combat.mobWalkSpeed;
    for (const m of this.mobs) {
      if (m.health <= 0) {
        m.moving = false;
        continue;
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
            const runSpeed = gameConfig.combat.mobRunSpeed;
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
              const mobDef = MOB_REGISTRY[m.type];
              let dmg = mobDef.baseDamage + (m.level - 1) * gameConfig.combat.mobDamagePerLevel; // Simple scaling

              p.health = Math.max(0, p.health - dmg);
              this.combatEvents.push({
                id: this.generateId('evt'),
                type: 'damage',
                targetId: 'player',
                value: dmg,
                x: p.x,
                z: p.z
              });
              m.attackCooldown = gameConfig.combat.mobAttackCooldown;
            }
          }
        }
      } else {
        m.patrolTimer -= dt;
        if (m.patrolTimer <= 0) {
          if (m.state === 'idle') {
            m.state = 'walking';
            m.facing = this.rng.next() * Math.PI * 2;
            m.patrolTimer = this.rng.next() * 3 + 2;
            m.moving = true;
          } else {
            m.state = 'idle';
            m.patrolTimer = this.rng.next() * 2.5 + 1.5;
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