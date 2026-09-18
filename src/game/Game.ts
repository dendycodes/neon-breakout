/**
 * Game.ts — the whole game simulation: the objects, the collisions, and the rules.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE ONE BIG RULE OF THIS FILE
 * ────────────────────────────────────────────────────────────────────────────
 * This file does not import Pixi, React, or anything from the browser. It does not
 * look at the clock (time is always passed IN as a parameter) and it does not use
 * Math.random().
 *
 * Why that matters, in plain terms:
 *   - Tests can run it in plain Node, with no browser and no fake objects. Fast.
 *   - The same inputs always give the same result, so bugs can be reproduced.
 *   - If you ever replace Pixi with something else, this file does not change.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE 4 OOP PRINCIPLES — where to find each one in this file
 * ────────────────────────────────────────────────────────────────────────────
 *   1. ABSTRACTION    (абстракция)   → the `Entity` class, line ~60
 *   2. INHERITANCE    (наследяване)  → `Paddle`, `Ball`, `Brick` extend `Entity`
 *   3. ENCAPSULATION  (капсулация)   → private fields: `_alive`, `hp`, `_score`
 *   4. POLYMORPHISM   (полиморфизъм) → `circleHitsBox` + the `bounds` getter
 * Every one of them is marked below with a `[OOP: ...]` comment.
 */

/** All the numbers you can tune, in one place. Change these to change the feel. */
export const CONFIG = {
  width: 800, // the game's own coordinate system, not screen pixels
  height: 600,
  paddle: { width: 110, height: 16, speed: 620, bottomOffset: 40 },
  ball: { radius: 8, speed: 400 },
  bricks: { rows: 5, columns: 9, width: 72, height: 26, gap: 6, topMargin: 70 },
  startingLives: 3,
  pointsPerBrick: 100,
  /** The biggest angle the ball can leave the paddle at. This one number = the skill. */
  maxDeflection: (60 * Math.PI) / 180, // 60 degrees, written in radians
};

/** A rectangle, described by its four edges. Used for every collision check. */
export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [OOP: ABSTRACTION / абстракция]  +  [OOP: ENCAPSULATION / капсулация]
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ABSTRACTION means: describe WHAT something must be able to do, and hide HOW.
 *
 * `Entity` is an `abstract class` — you can never write `new Entity()`. It only
 * says: "everything in this game has a position, can be destroyed, and must be
 * able to tell me its rectangle (`bounds`)". It does NOT say how that rectangle
 * is calculated — the ball, the paddle and a brick each work it out differently.
 *
 * ENCAPSULATION means: keep data private, and only allow safe ways to change it.
 *
 * `_alive` below is `private`. Outside code cannot write `brick._alive = true`
 * to bring a dead brick back. The only way in is `destroy()`. The object protects
 * its own rules — that is the whole idea.
 */
export abstract class Entity {
  // `private` = only THIS class can touch it. The `_` prefix is a naming habit
  // that shows "internal".
  private _alive = true;

  // `public x` in the constructor is TypeScript shorthand: it declares the field
  // AND assigns it in one line.
  constructor(
    public x: number,
    public y: number,
  ) {}

  /** A "getter" — reads like a property (`ball.isAlive`) but is really a method. */
  get isAlive(): boolean {
    return this._alive;
  }

  /** The ONLY way to kill an entity. Read-only from the outside, writable inside. */
  destroy(): void {
    this._alive = false;
  }

  /**
   * `abstract` = "every child class MUST provide this". If you write a new entity
   * and forget `bounds`, TypeScript refuses to compile. The compiler enforces the
   * contract for you.
   */
  abstract get bounds(): Bounds;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [OOP: INHERITANCE / наследяване]
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `extends Entity` means Paddle GETS everything Entity has (x, y, isAlive,
 * destroy) without copying that code. It only adds what is special about a paddle.
 *
 * Keep inheritance SHALLOW. One level, like here, is healthy. Five levels deep is
 * how OOP gets its bad reputation — nobody can then tell where a method comes from.
 */
export class Paddle extends Entity {
  readonly width = CONFIG.paddle.width;
  readonly height = CONFIG.paddle.height;

  constructor() {
    // `super(...)` calls the parent constructor. Required before using `this`.
    super(CONFIG.width / 2, CONFIG.height - CONFIG.paddle.bottomOffset);
  }

  /**
   * [OOP: POLYMORPHISM / полиморфизъм]
   * Paddle's own answer to the `bounds` question the parent asked. A rectangle
   * around its centre point.
   */
  get bounds(): Bounds {
    return {
      left: this.x - this.width / 2,
      right: this.x + this.width / 2,
      top: this.y - this.height / 2,
      bottom: this.y + this.height / 2,
    };
  }

  /**
   * Move the paddle.
   * @param dt        how many seconds this step covers (always 1/60 here)
   * @param direction -1 = left, 0 = still, +1 = right (keyboard)
   * @param targetX   an exact x from the mouse, or null when the mouse is idle
   */
  update(dt: number, direction: number, targetX: number | null): void {
    const half = this.width / 2;
    // `??` means "use the left side unless it is null/undefined".
    const next = targetX ?? this.x + direction * CONFIG.paddle.speed * dt;
    // Keep the paddle on screen. Without this it slides away forever.
    this.x = Math.max(half, Math.min(CONFIG.width - half, next));
  }

  reset(): void {
    this.x = CONFIG.width / 2;
  }
}

/**
 * Ball — a circle that always moves at the SAME speed.
 *
 * The important game rule: bouncing changes the ball's DIRECTION, never its speed.
 * Keeping that rule inside this class (instead of letting collision code edit vx
 * and vy freely) means the rule cannot be broken by accident later.
 *
 * [OOP: INHERITANCE / наследяване] — again, `extends Entity`.
 */
export class Ball extends Entity {
  readonly radius = CONFIG.ball.radius;
  vx = 0; // velocity on x, in units per second
  vy = 0; // velocity on y. NOTE: on a screen, +y points DOWN, so up is negative.

  /** [OOP: ENCAPSULATION] private — outside code reads it via `isDocked`. */
  private docked = true;

  constructor() {
    super(CONFIG.width / 2, 0);
  }

  /** "Docked" = sitting on the paddle, waiting for the player to press Space. */
  get isDocked(): boolean {
    return this.docked;
  }

  /** [OOP: POLYMORPHISM] the ball's own answer: a square around the circle. */
  get bounds(): Bounds {
    return {
      left: this.x - this.radius,
      right: this.x + this.radius,
      top: this.y - this.radius,
      bottom: this.y + this.radius,
    };
  }

  dock(paddle: Paddle): void {
    this.docked = true;
    this.vx = 0;
    this.vy = 0;
    this.x = paddle.x;
    this.y = paddle.bounds.top - this.radius - 1;
  }

  launch(): void {
    if (!this.docked) return; // already flying — ignore extra key presses
    this.docked = false;
    this.vy = -CONFIG.ball.speed; // negative = upward
  }

  /**
   * Point the ball in a new direction, keeping the speed exactly the same.
   * @param angle 0 = straight up, negative = up-left, positive = up-right
   */
  setAngle(angle: number): void {
    this.vx = Math.sin(angle) * CONFIG.ball.speed;
    this.vy = -Math.cos(angle) * CONFIG.ball.speed;
  }

  update(dt: number, paddle: Paddle): void {
    if (this.docked) {
      // Ride on top of the paddle. This runs AFTER the paddle has moved this step.
      this.x = paddle.x;
      this.y = paddle.bounds.top - this.radius - 1;
      return;
    }
    // "New position = old position + speed × time". That is all movement is.
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

/**
 * Brick — a rectangle that does not move and has hit points.
 *
 * [OOP: ENCAPSULATION / капсулация] — `hp` is private, so the only way to damage a
 * brick is `hit()`. Nobody outside can set it to -5, or to 100.
 *
 * Notice what is NOT here: no colour, no image. The renderer decides how a brick
 * LOOKS. That separation lets a designer change the visuals with zero risk of
 * breaking the gameplay.
 */
export class Brick extends Entity {
  constructor(
    x: number,
    y: number,
    readonly row: number, // which row it is in — the renderer uses it for colour
    private hp = 1,
  ) {
    super(x, y);
  }

  get hitPoints(): number {
    return this.hp;
  }

  /** [OOP: POLYMORPHISM] a third, different answer to the same `bounds` question. */
  get bounds(): Bounds {
    return {
      left: this.x - CONFIG.bricks.width / 2,
      right: this.x + CONFIG.bricks.width / 2,
      top: this.y - CONFIG.bricks.height / 2,
      bottom: this.y + CONFIG.bricks.height / 2,
    };
  }

  /** Returns true if THIS hit killed the brick, so the caller can add points. */
  hit(): boolean {
    this.hp -= 1;
    if (this.hp > 0) return false;
    this.destroy(); // inherited from Entity
    return true;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [OOP: POLYMORPHISM / полиморфизъм] — the payoff
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This function takes a `Bounds`. It has NO IDEA whether that rectangle came from
 * a Paddle, a Brick, or something you add next year. It just asks for `bounds` and
 * every entity answers in its own way.
 *
 * That is polymorphism: one piece of code, many different objects, no `if` checks
 * like `if (thing instanceof Brick)`.
 *
 * HOW THE MATH WORKS:
 *   1. Find the point on the rectangle closest to the circle's centre.
 *   2. If that point is closer than the radius, they are touching.
 *   3. The direction from that point to the centre is the bounce direction
 *      ("the normal").
 *
 * THE BUG EVERY BEGINNER HITS: if the circle's centre is INSIDE the rectangle, the
 * closest point IS the centre, so the distance is 0, and dividing by 0 gives NaN
 * ("not a number"). One NaN reaches the velocity and the ball vanishes off screen
 * forever. That is what the `dist === 0` branch prevents — and there is a unit test
 * for exactly this case in Game.test.ts.
 */
export function circleHitsBox(
  cx: number,
  cy: number,
  radius: number,
  box: Bounds,
): { nx: number; ny: number } | null {
  // Math.max(left, Math.min(cx, right)) = "clamp cx between left and right".
  const closestX = Math.max(box.left, Math.min(cx, box.right));
  const closestY = Math.max(box.top, Math.min(cy, box.bottom));

  const dx = cx - closestX;
  const dy = cy - closestY;
  // Compare squared distances to skip a square root — a tiny speed win, and the
  // standard trick when you only need to compare, not to know the real distance.
  const distSq = dx * dx + dy * dy;

  if (distSq > radius * radius) return null; // not touching

  const dist = Math.sqrt(distSq);
  if (dist === 0) {
    // Centre is inside the box: push the ball out vertically (bricks are wide/flat).
    const boxCenterY = (box.top + box.bottom) / 2;
    return { nx: 0, ny: cy < boxCenterY ? -1 : 1 };
  }
  // Divide by the length to get a direction of length 1 (a "unit vector").
  return { nx: dx / dist, ny: dy / dist };
}

/** What the player wants this step. The input layer builds this object. */
export interface Intent {
  direction: number; // -1, 0 or +1
  pointerX: number | null; // exact x from the mouse, or null
  launch: boolean; // true only on the step Space/click was pressed
}

export const IDLE: Intent = { direction: 0, pointerX: null, launch: false };

/** How a step ended. The state machine reacts to this; Game just reports it. */
export type Outcome = 'playing' | 'level-cleared' | 'game-over';

/**
 * Game — holds the world and enforces the rules.
 *
 * [OOP: COMPOSITION / композиция] — Game HAS a paddle, a ball and bricks. It does
 * NOT extend them. "Has-a" (composition) is almost always the better choice over
 * "is-a" (inheritance); use inheritance only when the child really IS a kind of
 * the parent, like Brick IS an Entity.
 *
 * [OOP: ENCAPSULATION / капсулация] — `_score`, `_lives` and `_level` are private
 * with read-only getters. Nothing outside can give itself points. To change the
 * score you must break a brick, which is exactly the rule we want.
 */
export class Game {
  readonly paddle = new Paddle();
  readonly ball = new Ball();
  bricks: Brick[] = [];

  private _score = 0;
  private _lives = CONFIG.startingLives;
  private _level = 1;

  constructor() {
    this.loadLevel(1);
  }

  get score(): number {
    return this._score;
  }
  get lives(): number {
    return this._lives;
  }
  get level(): number {
    return this._level;
  }

  /** Build the grid of bricks. From level 2 on, the top rows need two hits. */
  loadLevel(level: number): void {
    this._level = level;
    const { rows, columns, width, height, gap, topMargin } = CONFIG.bricks;
    // Work out where the grid starts so it ends up centred on screen.
    const gridWidth = columns * width + (columns - 1) * gap;
    const originX = (CONFIG.width - gridWidth) / 2;

    this.bricks = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        this.bricks.push(
          new Brick(
            originX + column * (width + gap) + width / 2,
            topMargin + row * (height + gap) + height / 2,
            row,
            row < Math.min(level - 1, 2) ? 2 : 1, // tougher rows on later levels
          ),
        );
      }
    }
    this.ball.dock(this.paddle);
  }

  restart(): void {
    this._score = 0;
    this._lives = CONFIG.startingLives;
    this.paddle.reset();
    this.loadLevel(1);
  }

  /**
   * Move the game forward by ONE step. `dt` is always the same value (1/60 of a
   * second) — see the loop in GameCanvas.tsx for why that matters so much.
   */
  update(dt: number, intent: Intent = IDLE): Outcome {
    if (intent.launch) this.ball.launch();
    this.paddle.update(dt, intent.direction, intent.pointerX);
    this.ball.update(dt, this.paddle);

    if (this.ball.isDocked) return 'playing'; // nothing can collide yet

    const lost = this.bounceOffWalls();
    this.bounceOffPaddle();
    this.hitBricks();

    // Remove dead bricks ONCE, here — never while looping over them. Deleting from
    // an array you are looping over makes the loop skip the next item.
    this.bricks = this.bricks.filter((brick) => brick.isAlive);

    if (this.bricks.length === 0) return 'level-cleared';
    if (lost) {
      this._lives -= 1;
      if (this._lives <= 0) return 'game-over';
      this.paddle.reset();
      this.ball.dock(this.paddle);
    }
    return 'playing';
  }

  /** Bounce off left, right and top walls. Falling past the bottom costs a life. */
  private bounceOffWalls(): boolean {
    const r = this.ball.radius;

    if (this.ball.x - r < 0) {
      // Move the ball out of the wall FIRST, then flip the direction. If you flip
      // while still overlapping, next step it collides again and the ball vibrates
      // stuck inside the wall — a very common beginner bug.
      this.ball.x = r;
      this.ball.vx = -this.ball.vx;
    } else if (this.ball.x + r > CONFIG.width) {
      this.ball.x = CONFIG.width - r;
      this.ball.vx = -this.ball.vx;
    }

    if (this.ball.y - r < 0) {
      this.ball.y = r;
      this.ball.vy = -this.ball.vy;
    }
    return this.ball.y - r > CONFIG.height; // true = ball is gone
  }

  /**
   * The paddle bounce — this is where Breakout becomes a GAME instead of a physics demo.
   *
   * If the paddle bounced the ball like a mirror, the player could never aim. So
   * instead we look at WHERE on the paddle the ball landed:
   *     far left  = -1  →  ball flies up-left
   *     centre    =  0  →  ball flies straight up
   *     far right = +1  →  ball flies up-right
   */
  private bounceOffPaddle(): void {
    // Only catch a ball moving DOWN. Without this check, a ball touching the side
    // of the paddle while moving up gets flipped up again and looks like it went
    // straight through.
    if (this.ball.vy <= 0) return;
    if (!circleHitsBox(this.ball.x, this.ball.y, this.ball.radius, this.paddle.bounds)) return;

    const offset = (this.ball.x - this.paddle.x) / (this.paddle.width / 2); // -1 … +1
    this.ball.y = this.paddle.bounds.top - this.ball.radius - 0.01; // lift it clear
    this.ball.setAngle(Math.max(-1, Math.min(1, offset)) * CONFIG.maxDeflection);
  }

  /**
   * Ball vs bricks. We handle only the FIRST brick found, then `return`.
   * Bouncing off two bricks in one step (in a corner) can cancel out and send the
   * ball back where it came from, which looks like a glitch.
   *
   * SPEED: this checks all 45 bricks every step. That sounds wasteful, but it is
   * ~45 cheap comparisons — nothing. Only optimise after measuring. If it ever DID
   * get slow, the right fix here is a grid lookup (the bricks are already in a
   * grid), not a complicated tree.
   */
  private hitBricks(): void {
    for (const brick of this.bricks) {
      if (!brick.isAlive) continue;
      const normal = circleHitsBox(this.ball.x, this.ball.y, this.ball.radius, brick.bounds);
      if (!normal) continue;

      // Bounce: flip the axis the ball hit. Math.sign gives -1 or +1.
      if (normal.nx !== 0) this.ball.vx = Math.abs(this.ball.vx) * Math.sign(normal.nx);
      if (normal.ny !== 0) this.ball.vy = Math.abs(this.ball.vy) * Math.sign(normal.ny);

      if (brick.hit()) this._score += CONFIG.pointsPerBrick;
      return; // only one brick per step
    }
  }
}
