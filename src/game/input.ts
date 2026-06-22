// Keyboard input state.
// Maps physical keys to named game actions -- never hardcode KeyboardEvent.code
// in game logic. Add new actions here and wire them in listen() below.

export interface InputState {
  moveForward: boolean;
  moveBack: boolean;
  turnLeft: boolean;
  turnRight: boolean;
}

const state: InputState = {
  moveForward: false,
  moveBack: false,
  turnLeft: false,
  turnRight: false,
};

// Default key bindings: action -> key codes
const BINDS: Record<keyof InputState, string[]> = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack:    ['KeyS', 'ArrowDown'],
  turnLeft:    ['KeyA', 'ArrowLeft'],
  turnRight:   ['KeyD', 'ArrowRight'],
};

// Build reverse map: code -> action
const CODE_MAP = new Map<string, keyof InputState>();
for (const [action, codes] of Object.entries(BINDS) as [keyof InputState, string[]][]) {
  for (const code of codes) CODE_MAP.set(code, action);
}

export function listenInput(): void {
  window.addEventListener('keydown', (e) => {
    const action = CODE_MAP.get(e.code);
    if (action) { state[action] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const action = CODE_MAP.get(e.code);
    if (action) state[action] = false;
  });
}

export function getInput(): InputState {
  return state;
}
