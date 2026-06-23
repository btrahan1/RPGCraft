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
    
    // Orc Camp (48, 48) themed props
    { url: 'models/props/bonfire.glb', x: 48, z: 48, rotY: 0, scale: 1.0 },
    { url: 'models/props/tent_open.glb', x: 48, z: 52, rotY: 0, scale: 1.0 },
    { url: 'models/props/tent_small.glb', x: 52, z: 48, rotY: Math.PI / 2, scale: 1.0 },
    { url: 'models/props/weapon_stand.glb', x: 44, z: 46, rotY: -Math.PI / 4, scale: 1.0 },
    { url: 'models/props/crate_wooden.glb', x: 45, z: 52, rotY: 0.2, scale: 1.0 },

    // Wolf Camp (-60, -60) natural/debris props
    { url: 'models/foliage/rock_1.glb', x: -62, z: -57, rotY: 0.5, scale: 1.8 },
    { url: 'models/foliage/rock_2.glb', x: -57, z: -63, rotY: 1.2, scale: 2.0 },
    { url: 'models/props/barrel.glb', x: -60, z: -55, rotY: 0.1, scale: 1.0 },

    // Goblin Camp (72, -72) themed props
    { url: 'models/props/bonfire.glb', x: 72, z: -72, rotY: 0, scale: 1.0 },
    { url: 'models/props/tent_small.glb', x: 70, z: -76, rotY: Math.PI / 4, scale: 1.0 },
    { url: 'models/props/tent_small.glb', x: 76, z: -70, rotY: -Math.PI / 4, scale: 1.0 },
    { url: 'models/props/barrel.glb', x: 74, z: -74, rotY: 0, scale: 1.0 },
    { url: 'models/props/crate_wooden.glb', x: 69, z: -69, rotY: 0.4, scale: 1.0 }
  ] as StaticProp[],

  // Roads going from town gates/boundaries out to the mob camps
  roads: [
    // Connecting town center to Orc Camp (48, 48) - 2x distance
    { startX: 12, startZ: 12, endX: 48, endZ: 48, width: 3.5 },
    // Connecting town center to Wolf Camp (-60, -60) - 2x distance
    { startX: -12, startZ: -12, endX: -60, endZ: -60, width: 3.5 },
    // Connecting town center to Goblin Camp (72, -72) - 2x distance
    { startX: 12, startZ: -12, endX: 72, endZ: -72, width: 3.5 },
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

    // Orc Camp Colliders
    { minX: 46.2, maxX: 49.8, minZ: 50.2, maxZ: 53.8 }, // open tent
    { minX: 50.2, maxX: 53.8, minZ: 46.2, maxZ: 49.8 }, // small tent
    { minX: 43.0, maxX: 45.0, minZ: 45.0, maxZ: 47.0 }, // weapon stand

    // Wolf Camp Colliders
    { minX: -63.5, maxX: -60.5, minZ: -58.5, maxZ: -55.5 }, // Rock 1
    { minX: -58.5, maxX: -55.5, minZ: -64.5, maxZ: -61.5 }, // Rock 2

    // Goblin Camp Colliders
    { minX: 68.2, maxX: 71.8, minZ: -77.8, maxZ: -74.2 }, // small tent 1
    { minX: 74.2, maxX: 77.8, minZ: -71.8, maxZ: -68.2 }  // small tent 2
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
