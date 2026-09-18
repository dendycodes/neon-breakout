import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest config.
 *
 * Note `environment: 'node'` — NOT jsdom. The entire simulation is headless by
 * design, so its tests need no DOM, no canvas and no mocks. They run in a few
 * milliseconds, which is what makes it realistic to actually run them on every
 * save. A test suite that takes 30 seconds is a test suite nobody runs.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Only the logic is worth a coverage number. Chasing coverage on rendering
      // code means writing brittle tests that assert Pixi's behaviour, not ours.
      include: ['src/game/Game.ts', 'src/game/gameMachine.ts'],
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
