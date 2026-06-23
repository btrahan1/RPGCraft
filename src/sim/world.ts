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

export const WORLD_LAYOUT = {
  // Town Square paved area dimensions
  townSquare: {
    width: 32,
    depth: 28,
  },

  // Building coordinates, models, rotations, and scales
  buildings: [
    { url: 'models/props/inn.glb', x: -12, z: -8, rotY: Math.PI / 2, scale: 1.2 },
    { url: 'models/props/blacksmith.glb', x: 12, z: -8, rotY: -Math.PI / 2, scale: 1.2 },
    { url: 'models/props/house_1.glb', x: -8, z: 12, rotY: Math.PI, scale: 1.2 },
    { url: 'models/props/house_2.glb', x: 8, z: 12, rotY: Math.PI, scale: 1.2 },
    { url: 'models/props/house_3.glb', x: 0, z: 18, rotY: Math.PI, scale: 1.2 },
  ] as StaticBuilding[],

  // Smaller interactive/visual props
  props: [
    { url: 'models/props/well.glb', x: 0, z: -6, rotY: 0, scale: 1.0 },
    { url: 'models/props/bonfire.glb', x: 0, z: -2, rotY: 0, scale: 1.0 },
  ] as StaticProp[],

  // Roads going from town gates/boundaries out to the mob camps
  roads: [
    // Connecting town center to Orc Camp (24, 24)
    { startX: 12, startZ: 12, endX: 24, endZ: 24, width: 3.5 },
    // Connecting town center to Wolf Camp (-30, -30)
    { startX: -12, startZ: -12, endX: -30, endZ: -30, width: 3.5 },
    // Connecting town center to Goblin Camp (36, -36)
    { startX: 12, startZ: -12, endX: 36, endZ: -36, width: 3.5 },
    // Core pathways linking the town square edges
    { startX: 0, startZ: -6, endX: 12, endZ: 12, width: 3.0 },
    { startX: 0, startZ: -6, endX: -12, endZ: -12, width: 3.0 },
    { startX: 0, startZ: -6, endX: 12, endZ: -12, width: 3.0 }
  ] as RoadSegment[],

  // Static colliders to block character movements (calculated from building models' bounds)
  colliders: [
    // Inn Collider
    { minX: -14.8, maxX: -9.2, minZ: -12.5, maxZ: -3.5 },
    // Blacksmith Collider
    { minX: 9.2, maxX: 14.8, minZ: -12.5, maxZ: -3.5 },
    // House 1
    { minX: -10.8, maxX: -5.2, minZ: 9.5, maxZ: 14.5 },
    // House 2
    { minX: 5.2, maxX: 10.8, minZ: 9.5, maxZ: 14.5 },
    // House 3
    { minX: -2.8, maxX: 2.8, minZ: 15.5, maxZ: 20.5 },
    // Well Collider (circular but approximated via square)
    { minX: -1.3, maxX: 1.3, minZ: -7.3, maxZ: -4.7 },
  ] as CollisionBox[],

  // Static Foliage placed outside the town square boundaries (radius > 16)
  foliage: [
    { url: 'models/foliage/pine_1.glb', x: -20, z: -5, scale: 1.3 },
    { url: 'models/foliage/oak_1.glb', x: 20, z: 5, scale: 1.4 },
    { url: 'models/foliage/pine_1.glb', x: -15, z: 22, scale: 1.1 },
    { url: 'models/foliage/oak_1.glb', x: 18, z: -25, scale: 1.2 },
    { url: 'models/foliage/rock_1.glb', x: -22, z: 15, scale: 1.5 },
    { url: 'models/foliage/rock_2.glb', x: 25, z: -15, scale: 1.6 },
  ] as FoliageProp[]
};

/**
 * Checks if a circular body collides with any town colliders.
 * Returns true if colliding.
 */
export function checkCollision(x: number, z: number, radius: number = 0.65): boolean {
  for (const box of WORLD_LAYOUT.colliders) {
    if (x + radius > box.minX && x - radius < box.maxX &&
        z + radius > box.minZ && z - radius < box.maxZ) {
      return true;
    }
  }
  return false;
}
