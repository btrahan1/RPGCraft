// RPGCraft entry point

import { Renderer } from './render/renderer';
import { Sim, isValidZoneKey } from './sim/sim';
import { listenInput, getInput } from './game/input';
import { saveGame, loadGame, applyLoadedSave } from './game/save';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

// ── Zone Management ──────────────────────────────────────────────────────
let currentZoneKey: string = 'starter_zone';
let sim: Sim;
let renderer: Renderer;

const loadedSave = loadGame();
if (loadedSave) {
  currentZoneKey = loadedSave.currentZoneKey;
  sim = new Sim(currentZoneKey);
  applyLoadedSave(sim.player, loadedSave);
  sim.recalculateStats(); // Recalculate stats with loaded equipment
} else {
  sim = new Sim(currentZoneKey);
}
renderer = new Renderer(canvas, sim);

listenInput(canvas);

let last = performance.now();

function switchZone(zoneKey: string, spawnX: number, spawnZ: number): void {
  if (!isValidZoneKey(zoneKey)) return;
  renderer.dispose();

  const newSim = Sim.transitionTo(sim, zoneKey, spawnX, spawnZ);
  sim = newSim;
  currentZoneKey = zoneKey;

  renderer = new Renderer(canvas, sim);
}

// Listen for portal selection from the UI
window.addEventListener('portal-select', ((e: CustomEvent) => {
  const { portalIndex } = e.detail;
  if (portalIndex >= 0) {
    const portal = sim.getPortal(portalIndex);
    if (portal) {
      switchZone(portal.targetZone, portal.spawnX, portal.spawnZ);
    }
  }
}) as EventListener);

function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  const input = getInput();

  if (input.save) {
    saveGame(sim, currentZoneKey);
    renderer.showMessage('✔  Game Saved');
  }
  if (input.load) {
    const loaded = loadGame();
    if (loaded) {
      if (!isValidZoneKey(loaded.currentZoneKey)) {
        renderer.showMessage('✘  Save is Corrupt', 2000, '#f87171');
      } else {
        renderer.dispose();
        currentZoneKey = loaded.currentZoneKey;
        sim = new Sim(currentZoneKey);
        applyLoadedSave(sim.player, loaded);
        renderer = new Renderer(canvas, sim);
        renderer.showMessage('✔  Game Loaded', 2000, '#60a5fa');
      }
    } else {
      renderer.showMessage('✘  No Save Found', 2000, '#f87171');
    }
  }

  sim.tick(dt, input);
  renderer.render(dt, sim, input);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);