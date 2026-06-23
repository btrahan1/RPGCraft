# RPGCraft — Developer & Modding Guide

Welcome to the **RPGCraft Developer Guide**! RPGCraft is a lightweight, clean, single-player RPG starter engine designed for rapid cloning, modification, and expansion.

This engine is built on a **headless, deterministic simulation layer** (written in pure TypeScript/JavaScript) paired with a **Three.js rendering/audio loop** and a HTML overlay HUD. This architecture makes it extremely robust, testable, and ideal as a base for custom RPG titles.

### Credits
RPGCraft is inspired by and built upon foundations from the legendary **WorldOfClaudeCraft** engine. Special thanks to the WorldOfClaudeCraft community and creators for showcasing how web technologies can drive beautiful, immersive 3D RPG systems!

---

## 1. Core Architecture

The codebase is split cleanly into three domains:
1. **Simulation State (`src/sim/`)**: Pure deterministic logic. No Three.js, no DOM, no random numbers (uses a seeded LCG RNG), and no real clock time. Everything happens inside `Sim.tick(dt, input)`. This ensures that gameplay calculations are 100% testable and reproducible.
2. **Rendering Layer (`src/render/`)**: Handles 3D asset loading (GLTF/GLB models), rendering via Three.js, lighting, camera controls, and particle effects.
3. **UI HUD (`src/render/hud.ts`)**: An overlay DOM rendering player health, hotbars, inventory slots, dialogue panels, quest lists, and shopping screens.

---

## 2. Modding via JSON Configurations

You can add items, spells, mobs, quests, audio triggers, and even entire zones without writing a single line of TypeScript code. Simply modify the JSON files in `src/data/`.

### 2.1 Quests (`quest_definitions.json`)
Located at [quest_definitions.json](src/data/quest_definitions.json).
Define quests by creating a unique quest ID key:
```json
  "kill_orcs_quest": {
    "title": "Defend the Outpost",
    "description": "Defeat Orcs to protect the starter village.",
    "type": "kill",
    "targetType": "orc",
    "targetCount": 3,
    "rewards": {
      "experience": 150,
      "money": 500,
      "items": [
        { "itemId": "healing_potion", "count": 1 }
      ]
    }
  }
```
* **`type`**: Either `"kill"` (track defeated mobs of `targetType`) or `"collect"` (track items of `targetType` in inventory).

### 2.2 Items & Gear (`item_definitions.json`)
Located at [item_definitions.json](src/data/item_definitions.json).
Configure weapons, armor, rings, or consumables:
```json
  "iron_sword": {
    "name": "Iron Sword",
    "rarity": "common",
    "desc": "A sturdy iron blade.",
    "icon": "icon-sword",
    "value": 1500,
    "slot": "weapon",
    "spellDamageBonus": 8,
    "modelUrl": "models/weapons/sword_1handed.glb"
  }
```
* **`slot`**: Sets equippable slot (`"weapon"`, `"shield"`, `"chest"`, `"ring"`).
* **Consumables**: Add `"usable": true` along with `"restoreHealth"` or `"restoreMana"` values.
* **Attributes**: `healthBonus`, `manaBonus`, or `spellDamageBonus` will automatically sync with player stats when equipped.

### 2.3 Spells & Projectiles (`spell_definitions.json`)
Located at [spell_definitions.json](src/data/spell_definitions.json).
Customize player abilities:
```json
  {
    "id": "fireball",
    "name": "Fireball",
    "castDuration": 1.5,
    "manaCost": 15,
    "damage": 25,
    "icon": "icon-fireball"
  }
```

### 2.4 Mob Definitions (`mob_definitions.json`)
Located at [mob_definitions.json](src/data/mob_definitions.json).
Register mob properties, combat ranges, and loot:
```json
  "skeleton_mage": {
    "type": "skeleton_mage",
    "baseHealth": 50,
    "baseDamage": 12,
    "modelUrl": "models/chars/enemies/skeleton_mage.glb",
    "modelHeight": 2.2,
    "attackRange": 15.0,
    "clips": { "idle": "Idle", "walk": "Walk", "run": "Run" },
    "lootTable": {
      "minGold": 200,
      "maxGold": 500,
      "items": [
        { "itemId": "mana_potion", "chance": 0.3, "minCount": 1, "maxCount": 1 }
      ]
    }
  }
```
* **`attackRange`**: Setting this above `1.5` makes the mob a ranged combatant. Mobs with `attackRange > 1.5` stop moving and fire Frostbolts when targeting players, rather than engaging in melee.

### 2.5 Zone Layouts (`zone_starter.json`, etc.)
Add buildings, colliders, camps, portals, and NPCs to a zone:
* **`camps`**: Set up spawner points for mobs.
* **`npcs`**: Set coordinates, dialogue text, shops, and quests.
* **`portals`**: Create teleport pillars pointing to other zone keys.
* **`colliders`**: Define axis-aligned bounding boxes (AABBs) to block player/mob movement.

### 2.6 Audio Definitions (`audio_definitions.json`)
Located at [audio_definitions.json](src/data/audio_definitions.json).
Map actions to sound effect paths or zone keys to music tracks:
```json
{
  "cast_fireball": "sounds/cast_fireball.mp3",
  "music_starter_zone": "sounds/music_town.mp3"
}
```
Simply add your audio files to `public/sounds/` and reference the paths in this map. The engine handles missing audio files gracefully, printing a warning to the developer console rather than breaking game loops.

---

## 3. Running & Extending the Code

### Development Commands
* **Start Dev Server**: `npm run dev` (spins up local hot-reloading server)
* **Compile Types**: `npm run typecheck` (tsc compilation check)
* **Run Tests**: `npm test` (executes Vitest suite checking simulation, combat, gear, quests, and audio logs)

### Adding a New Zone
1. Create a new layout JSON file, e.g. `src/data/zone_dungeon.json`.
2. Import it and add it to `ZONE_REGISTRY` in `src/sim/sim.ts`.
3. Put a portal definition in `src/data/zone_starter.json` with `targetZone: "zone_dungeon"`.
