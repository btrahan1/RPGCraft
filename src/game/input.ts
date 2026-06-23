// Keyboard + mouse input state.
// Keyboard actions: never hardcode KeyboardEvent.code in game logic.
// Mouse state: pointer lock used for camera orbit (left-drag).

export interface InputState {
  moveForward: boolean;
  moveBack: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  mouseDeltaX: number;       // raw movementX since last frame (pointer-locked)
  mouseDeltaY: number;       // raw movementY since last frame
  scrollDelta: number;       // accumulated wheel deltaY since last frame
  isPointerLocked: boolean;  // true while the pointer is locked to the canvas
  spawnOrc: boolean;         // one-shot: true for exactly one frame after Shift+O
  castSpell1: boolean;       // one-shot: true for exactly one frame after pressing 1
  castSpell2: boolean;       // one-shot: true for exactly one frame after pressing 2
  targetNext: boolean;       // one-shot: true for exactly one frame after pressing Tab
  interact: boolean;         // one-shot: true for exactly one frame after pressing E
  save: boolean;             // one-shot: true for exactly one frame after pressing K
  load: boolean;             // one-shot: true for exactly one frame after pressing L
  openPortalUI: boolean;     // one-shot: true for exactly one frame when UI triggers portal
  selectedPortalIndex: number; // -1 = none, 0+ = which portal entry was clicked
  keyboard: {
    justPressed: Set<string>;
  };
}

const state: InputState = {
  moveForward: false,
  moveBack: false,
  turnLeft: false,
  turnRight: false,
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  scrollDelta: 0,
  isPointerLocked: false,
  spawnOrc: false,
  castSpell1: false,
  castSpell2: false,
  targetNext: false,
  interact: false,
  save: false,
  load: false,
  openPortalUI: false,
  selectedPortalIndex: -1,
  keyboard: {
    justPressed: new Set<string>(),
  },
};

// ── keyboard bindings (only the boolean action fields) ─────────────
const BINDS = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack:    ['KeyS', 'ArrowDown'],
  turnLeft:    ['KeyA', 'ArrowLeft'],
  turnRight:   ['KeyD', 'ArrowRight'],
} as const satisfies Record<string, string[]>;

const CODE_MAP = new Map<string, keyof InputState>();
for (const [action, codes] of Object.entries(BINDS) as [keyof InputState, string[]][]) {
  for (const code of codes) CODE_MAP.set(code, action);
}

// ── mouse accumulators (private to this module) ────────────────────
let mouseDx = 0;
let mouseDy = 0;
let scrollAccum = 0;
let pointerLocked = false;
let canvas: HTMLCanvasElement | null = null;

// ── public API ─────────────────────────────────────────────────────

/** Call once with the game canvas to attach listeners. */
export function listenInput(cvs: HTMLCanvasElement): void {
  canvas = cvs;

  // ── keyboard ──
  window.addEventListener('keydown', (e) => {
    // One-shot: Shift+O spawns an orc
    const isO = e.code === 'KeyO' || e.key === 'o' || e.key === 'O';
    if (e.shiftKey && isO && !state.keyboard.justPressed.has('KeyO')) {
      state.keyboard.justPressed.add('KeyO');
      state.spawnOrc = true;
      e.preventDefault();
      return;
    }

    // One-shot: 1 casts spell 1
    if ((e.code === 'Digit1' || e.key === '1') && !state.keyboard.justPressed.has('Digit1')) {
      state.keyboard.justPressed.add('Digit1');
      state.castSpell1 = true;
      e.preventDefault();
      return;
    }

    // One-shot: 2 casts spell 2
    if ((e.code === 'Digit2' || e.key === '2') && !state.keyboard.justPressed.has('Digit2')) {
      state.keyboard.justPressed.add('Digit2');
      state.castSpell2 = true;
      e.preventDefault();
      return;
    }

    // One-shot: Tab targets next
    if ((e.code === 'Tab' || e.key === 'Tab') && !state.keyboard.justPressed.has('Tab')) {
      state.keyboard.justPressed.add('Tab');
      state.targetNext = true;
      e.preventDefault();
      return;
    }

    // One-shot: E interacts
    if ((e.code === 'KeyE' || e.key === 'e' || e.key === 'E') && !state.keyboard.justPressed.has('KeyE')) {
      state.keyboard.justPressed.add('KeyE');
      state.interact = true;
      e.preventDefault();
      return;
    }

    // One-shot: K saves
    if ((e.code === 'KeyK' || e.key === 'k' || e.key === 'K') && !state.keyboard.justPressed.has('KeyK')) {
      state.keyboard.justPressed.add('KeyK');
      state.save = true;
      e.preventDefault();
      return;
    }

    // One-shot: L loads
    if ((e.code === 'KeyL' || e.key === 'l' || e.key === 'L') && !state.keyboard.justPressed.has('KeyL')) {
      state.keyboard.justPressed.add('KeyL');
      state.load = true;
      e.preventDefault();
      return;
    }

    // Continuous actions (movement, turning)
    const action = CODE_MAP.get(e.code);
    if (action) {
      (state as any)[action] = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    state.keyboard.justPressed.delete(e.code);
    // Also support fallback keys for justPressed cleanup
    if (e.key === '1') state.keyboard.justPressed.delete('Digit1');
    if (e.key === '2') state.keyboard.justPressed.delete('Digit2');
    if (e.key === 'Tab') state.keyboard.justPressed.delete('Tab');
    if (e.key === 'o' || e.key === 'O') state.keyboard.justPressed.delete('KeyO');
    if (e.key === 'e' || e.key === 'E') state.keyboard.justPressed.delete('KeyE');
    if (e.key === 'k' || e.key === 'K') state.keyboard.justPressed.delete('KeyK');
    if (e.key === 'l' || e.key === 'L') state.keyboard.justPressed.delete('KeyL');

    const action = CODE_MAP.get(e.code);
    if (action) {
      (state as any)[action] = false;
    }
  });

  // ── wheel (zoom) ──
  canvas.addEventListener('wheel', (e) => {
    scrollAccum += e.deltaY;
    e.preventDefault();
  }, { passive: false });

  // ── pointer lock for camera orbit (left-click drag) ──
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      canvas!.requestPointerLock();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 0 && pointerLocked) {
      document.exitPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', (e) => {
    if (pointerLocked) {
      mouseDx += e.movementX;
      mouseDy += e.movementY;
    }
  });

  // prevent context menu on the game canvas
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Returns the current input state for this frame.
 *  One-shot flags (like spawnOrc) are consumed exactly once and reset. */
export function getInput(): InputState {
  state.mouseDeltaX = mouseDx;
  state.mouseDeltaY = mouseDy;
  state.scrollDelta = scrollAccum;
  state.isPointerLocked = pointerLocked;

  // reset accumulators for next frame
  mouseDx = 0;
  mouseDy = 0;
  scrollAccum = 0;

  // Consume one-shot flags: return a snapshot, then reset originals
  const result = { ...state };
  state.spawnOrc = false;
  state.castSpell1 = false;
  state.castSpell2 = false;
  state.targetNext = false;
  state.interact = false;
  state.save = false;
  state.load = false;
  state.openPortalUI = false;
  state.selectedPortalIndex = -1;

  return result;
}