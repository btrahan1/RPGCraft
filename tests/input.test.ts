import { describe, it, expect, vi } from 'vitest';
import { listenInput, getInput } from '../src/game/input';

describe('Input handling', () => {
  it('should trigger spawnOrc when Shift+O is pressed', () => {
    const listeners: Record<string, Function[]> = {};

    const mockWindow = {
      addEventListener: vi.fn((event: string, callback: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(callback);
      }),
    };

    const mockCanvas = {
      addEventListener: vi.fn(),
    };

    const mockDocument = {
      addEventListener: vi.fn(),
    };

    // Temporarily replace global window and document
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = mockWindow as any;
    global.document = mockDocument as any;

    try {
      listenInput(mockCanvas as any);

      // Trigger Shift keydown
      const shiftDownCallback = listeners['keydown']?.[0];
      expect(shiftDownCallback).toBeDefined();

      const state1 = getInput();
      expect(state1.spawnOrc).toBe(false);

      // Simulate KeyO down with shiftKey
      shiftDownCallback!({
        code: 'KeyO',
        shiftKey: true,
        preventDefault: vi.fn(),
      });

      const state2 = getInput();
      expect(state2.spawnOrc).toBe(true);

      // Next frame should reset
      const state3 = getInput();
      expect(state3.spawnOrc).toBe(false);
    } finally {
      global.window = originalWindow;
      global.document = originalDocument;
    }
  });
});
