import mobDefinitionsData from '../data/mob_definitions.json';

export interface StaticBuilding {
  url: string;
  x: number;
  z: number;
  rotY: number;
  scale: number;
  label?: string;
  labelHeight?: number;
}

export interface StaticProp {
  url: string;
  x: number;
  z: number;
  rotY: number;
  scale: number;
}

export interface RoadSegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  width: number;
}

export interface FoliageProp {
  url: string;
  x: number;
  z: number;
  scale: number;
}

export interface CollisionBox {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface MobSpawn {
  x: number;
  z: number;
}

export interface LootTableItem {
  itemId: string;
  chance: number;
  minCount: number;
  maxCount: number;
}

export interface LootTableDef {
  minGold: number;
  maxGold: number;
  items: LootTableItem[];
}

export interface MobDefinition {
  type: string;
  baseHealth: number;
  baseDamage: number;
  modelUrl: string;
  /** World-unit height from feet to crown, used by CharacterVisual for scaling. */
  modelHeight: number;
  /** Animation clip names for this rig. */
  clips: { idle: string; walk: string; run: string };
  lootTable: LootTableDef;
}

export const MOB_REGISTRY: Record<string, MobDefinition> = mobDefinitionsData;

export type MobType = keyof typeof MOB_REGISTRY;

export interface CampDef {
  mobType: MobType;
  minLevel: number;
  maxLevel: number;
  spawns: MobSpawn[];
}

export interface PortalDef {
  /** Display name shown in the UI */
  label: string;
  /** Name of the target zone (must match a key in ZoneRegistry) */
  targetZone: string;
  /** World x where this portal pillar sits */
  x: number;
  /** World z where this portal pillar sits */
  z: number;
  /** Where the player spawns when arriving in the target zone */
  spawnX: number;
  /** Where the player spawns when arriving in the target zone */
  spawnZ: number;
}

export interface ShopDef {
  items: string[];
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  modelUrl: string;
  x: number;
  z: number;
  rotY: number;
  dialogue: string[];
  shop?: ShopDef;
  offeredQuests?: string[];
  turnInQuests?: string[];
}

export interface ZoneData {
  name: string;
  /** Name used to reference this zone in the registry and portal targets */
  zoneKey: string;
  townSquare: {
    width: number;
    depth: number;
  };
  buildings: StaticBuilding[];
  props: StaticProp[];
  roads: RoadSegment[];
  colliders: CollisionBox[];
  foliage: FoliageProp[];
  camps: CampDef[];
  portals: PortalDef[];
  npcs: NpcDef[];
}

/**
 * Checks if a circular body collides with any of the zone's colliders.
 * Returns true if colliding.
 */
export function checkCollision(x: number, z: number, colliders: CollisionBox[], radius: number = 0.65): boolean {
  for (const box of colliders) {
    if (x + radius > box.minX && x - radius < box.maxX &&
        z + radius > box.minZ && z - radius < box.maxZ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if the player is within interaction range of a portal.
 */
export function portalProximityCheck(px: number, pz: number, portal: PortalDef, range: number = 2.5): boolean {
  const dx = portal.x - px;
  const dz = portal.z - pz;
  return (dx * dx + dz * dz) <= range * range;
}