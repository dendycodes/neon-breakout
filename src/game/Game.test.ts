import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG, Game, circleHitsBox, type Intent } from './Game';

const STEP = 1 / 60;
const IDLE: Intent = { direction: 0, pointerX: null, launch: false };
const LAUNCH: Intent = { ...IDLE, launch: true };

/**
 * These tests need no DOM, no canvas and no mocks, and the whole file runs in a
 * few milliseconds — purely because the simulation never imports Pixi or React.
 * That is the practical payoff of the architecture, and it is what makes it
 * realistic to actually run tests on every save.
 */
describe('circleHitsBox', () => {
  const box = { left: 60, right: 140, top: 90, bottom: 110 };

  it('reports nothing when the shapes are apart', () => {
    expect(circleHitsBox(100, 60, 8, box)).toBeNull();
  });

  it('returns an upward normal for a hit on the top face', () => {
    const normal = circleHitsBox(100, 85, 8, box);
    expect(normal).toEqual({ nx: 0, ny: -1 });
  });

  it('returns a sideways normal for a hit on the left face', () => {
    const normal = circleHitsBox(55, 100, 8, box);
    expect(normal!.nx).toBeLessThan(0);
  });

  /**
   * THE EDGE CASE WORTH THE TEST. With the circle's centre inside the box the
   * distance is 0, so a naive implementation divides by zero and returns NaN. One
   * NaN reaches the velocity and the ball disappears off screen forever — a
   * spectacular bug from a single unguarded division.
   */
  it('never returns NaN when the circle centre is inside the box', () => {
    const normal = circleHitsBox(100, 100, 8, box);
    expect(Number.isNaN(normal!.nx)).toBe(false);
    expect(Number.isNaN(normal!.ny)).toBe(false);
  });
});

describe('Game', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  it('keeps the ball docked until the player launches', () => {
    const y = game.ball.y;
    for (let i = 0; i < 30; i++) game.update(STEP, IDLE);

    expect(game.ball.isDocked).toBe(true);
    expect(game.ball.y).toBe(y);
  });

  it('launches the ball upward', () => {
    game.update(STEP, LAUNCH);
    expect(game.ball.isDocked).toBe(false);
    expect(game.ball.vy).toBeLessThan(0); // negative y is up
  });

  it('moves the paddle but never lets it leave the screen', () => {
    for (let i = 0; i < 300; i++) game.update(STEP, { ...IDLE, direction: -1 });
    expect(game.paddle.bounds.left).toBeGreaterThanOrEqual(0);
  });

  it('breaks bricks and awards points', () => {
    game.update(STEP, LAUNCH);
    for (let i = 0; i < 120; i++) game.update(STEP, IDLE);

    expect(game.bricks.length).toBeLessThan(CONFIG.bricks.rows * CONFIG.bricks.columns);
    expect(game.score).toBeGreaterThan(0);
  });

  it('costs a life and re-docks the ball when it falls past the floor', () => {
    game.update(STEP, LAUNCH);
    // Aim the ball straight down past the paddle to force the loss.
    game.ball.x = 10;
    game.ball.y = CONFIG.height - 20;
    game.ball.vx = 0;
    game.ball.vy = 500;

    for (let i = 0; i < 30; i++) game.update(STEP, IDLE);

    expect(game.lives).toBe(CONFIG.startingLives - 1);
    expect(game.ball.isDocked).toBe(true);
  });

  it('reports game-over when the last life is lost', () => {
    let outcome: string = 'playing';
    for (let life = 0; life < CONFIG.startingLives; life++) {
      game.update(STEP, LAUNCH);
      game.ball.x = 10;
      game.ball.y = CONFIG.height - 20;
      game.ball.vx = 0;
      game.ball.vy = 500;
      for (let i = 0; i < 30 && outcome === 'playing'; i++) outcome = game.update(STEP, IDLE);
    }
    expect(outcome).toBe('game-over');
  });

  /**
   * Determinism: the simulation takes time as a parameter and never calls
   * Math.random(), so identical inputs must produce identical output. That is what
   * makes a bug report reproducible.
   */
  it('is deterministic: identical inputs produce identical state', () => {
    const a = new Game();
    const b = new Game();
    for (const game of [a, b]) {
      game.update(STEP, LAUNCH);
      for (let i = 0; i < 100; i++) {
        game.update(STEP, { ...IDLE, direction: i % 3 === 0 ? 1 : -1 });
      }
    }

    expect(a.ball.x).toBe(b.ball.x);
    expect(a.ball.y).toBe(b.ball.y);
    expect(a.score).toBe(b.score);
  });
});
