import { Sim } from '../sim/sim';

export interface SaveGame {
  currentZoneKey: string;
  playerX: number;
  playerZ: number;
  playerFacing: number;
  level: number;
  experience: number;
  nextLevelExp: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  inventory?: { itemId: string; count: number }[];
  money?: number;
}

const SAVE_KEY = 'rpgcraft-savegame';

export function saveGame(sim: Sim, currentZoneKey: string): void {
  const p = sim.player;
  if (!p) {
    console.warn('Attempted to save game, but no player found.');
    return;
  }

  const saveData: SaveGame = {
    currentZoneKey,
    playerX: p.x,
    playerZ: p.z,
    playerFacing: p.facing,
    level: p.level,
    experience: p.experience,
    nextLevelExp: p.nextLevelExp,
    health: p.health,
    maxHealth: p.maxHealth,
    mana: p.mana,
    maxMana: p.maxMana,
    stamina: p.stamina,
    maxStamina: p.maxStamina,
    inventory: p.inventory,
    money: p.money,
  };

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    console.log('Game saved successfully!');
  } catch (e) {
    console.error('Failed to save game to localStorage:', e);
  }
}


export function loadGame(): SaveGame | null {
  try {
    const savedData = localStorage.getItem(SAVE_KEY);
    if (savedData) {
      const parsedData: SaveGame = JSON.parse(savedData);
      // Basic validation: ensure parsed data is an object and not null
      if (typeof parsedData === 'object' && parsedData !== null) {
        console.log('Game loaded successfully!');
        return parsedData;
      }
    }
  } catch (e) {
    console.error('Failed to load game from localStorage:', e);
  }
  return null;
}

/**
 * Apply a loaded SaveGame onto a player object.
 * Uses `??` fallbacks so saves created before new fields were added
 * (which would deserialize as `undefined`) get sensible defaults.
 */
export function applyLoadedSave(p: Sim['player'], s: SaveGame): void {
  p.x            = s.playerX          ?? 0;
  p.z            = s.playerZ          ?? 0;
  p.facing       = s.playerFacing     ?? 0;
  p.level        = s.level            ?? 1;
  p.experience   = s.experience       ?? 0;
  p.nextLevelExp = s.nextLevelExp      ?? 100;
  p.health       = s.health           ?? 100;
  p.maxHealth    = s.maxHealth        ?? 100;
  p.mana         = s.mana             ?? 100;
  p.maxMana      = s.maxMana          ?? 100;
  p.stamina      = s.stamina          ?? 100;
  p.maxStamina   = s.maxStamina       ?? 100;
  p.inventory    = s.inventory        ?? [];
  p.money        = s.money            ?? 0;
}