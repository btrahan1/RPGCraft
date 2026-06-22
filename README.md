# RPGCraft

A lean single-player RPG engine, extracted from the ideas in BartCraft/WorldOfClaudeCraft.

## Goals

- Understandable: every file fits in your head
- Learnable: clean seams between sim, render, and UI
- Extensible: good base for different game types

## Structure

```
src/sim/    - deterministic simulation (no DOM, no Three.js, no Math.random)
src/render/ - Three.js renderer (reads sim state, never writes it)
src/ui/     - HUD and menus (vanilla DOM)
src/game/   - input handling and keybinds
tests/      - Vitest unit tests
public/     - static assets (models, textures, audio)
```

## Running

```bash
npm install
npm run dev       # http://localhost:5174
npm test          # unit tests
npm run typecheck # TypeScript validation
```

## Core Rules

- `src/sim/` has zero DOM or Three.js imports - enforced by architecture tests
- All state mutations happen inside `Sim.tick()` 
- Never call `Math.random()` in sim - use the seeded RNG
- Renderer reads world state; it never writes it
