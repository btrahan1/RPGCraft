export interface StaticBuilding {
  url: string;
  x: number;
  z: number;
  rotY: number;
  scale: number;
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
  health: number;
  maxHealth: number;
}

export interface CampDef {
  mobType: 'orc' | 'wolf' | 'goblin';
  spawns: MobSpawn[];
}

export interface ZoneData {
  name: string;
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

