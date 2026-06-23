// RPGCraft entry point
// src/sim/   - deterministic game simulation (no DOM, no Three.js)
// src/render/ - Three.js renderer
// src/ui/    - HUD and menus
// src/game/  - input handling

import { Renderer } from './render/renderer';
import { Sim } from './sim/sim';
import { listenInput, getInput } from './game/input';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

const sim = new Sim();
const renderer = new Renderer(canvas, sim);

listenInput(canvas);

let last = performance.now();

function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  const input = getInput();
  sim.tick(dt, input); // InputState satisfies SimInput shape
  renderer.render(dt, sim, input);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);