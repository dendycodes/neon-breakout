# Neon Breakout

A small Breakout game built to **learn from and to talk through in an interview**:
**PixiJS 8 + TypeScript + Next.js**, with XState for screens and RxJS for input.

Five source files. Every non-obvious line has a comment explaining *why*, and every
OOP principle is marked in the code with a `[OOP: ...]` tag you can search for.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test       # 17 unit tests, ~200ms, no browser needed
pnpm typecheck
```

← → or A/D, or move the mouse · Space/click to launch · Esc or P pause · R restart.

---

## Read the files in this order

| # | File | What it teaches |
|---|---|---|
| 1 | `src/game/Game.ts` | All 4 OOP principles, collision maths, the game rules |
| 2 | `src/game/Renderer.ts` | How PixiJS works, and how to draw fast |
| 3 | `src/game/input.ts` | RxJS basics: streams, subscriptions, cleanup |
| 4 | `src/game/gameMachine.ts` | State machines: why booleans are not enough |
| 5 | `src/components/GameCanvas.tsx` | React + a game loop living together |

Find every principle in the code with one command:

```bash
grep -rn "OOP:" src
```

---

## The 4 OOP principles, and exactly where they are

### 1. Abstraction / абстракция — `Game.ts`, the `Entity` class

Describe **what** something must do, hide **how**.

```ts
export abstract class Entity {
  abstract get bounds(): Bounds;   // every entity MUST answer this…
}                                   // …but each one answers differently
```

`abstract` means you can never write `new Entity()`, and if a child class forgets
`bounds`, the code does not compile. The compiler enforces the contract.

### 2. Inheritance / наследяване — `Ball`, `Paddle`, `Brick`

```ts
export class Ball extends Entity { … }
```

`extends` means Ball automatically has `x`, `y`, `isAlive` and `destroy()` — no
copy-paste. **Keep it shallow.** One level, like here, is healthy; five levels deep
is why people complain about OOP.

### 3. Encapsulation / капсулация — private fields everywhere

```ts
export class Brick extends Entity {
  private hp = 1;                       // nobody outside can touch this
  get hitPoints() { return this.hp; }   // read-only from outside
  hit(): boolean { … }                  // the ONLY way to damage a brick
}
```

Also `Entity._alive`, `Ball.docked`, and `Game._score` / `_lives` / `_level`. The
result: no code anywhere can give itself points without breaking a brick. The object
protects its own rules.

`input.ts` shows the same idea **without a class**, using a closure — the variables
live inside the function and only three safe methods are returned.

### 4. Polymorphism / полиморфизъм — `circleHitsBox()`

```ts
circleHitsBox(ball.x, ball.y, ball.radius, brick.bounds);   // a Brick
circleHitsBox(ball.x, ball.y, ball.radius, paddle.bounds);  // a Paddle
```

One function, many types, and **not a single `if (thing instanceof Brick)`**. Add a
new entity type next year and this function keeps working untouched.

*(Bonus, also marked in the code: **composition** — `Game` **has** a paddle, a ball
and bricks rather than inheriting from anything. Prefer "has-a" over "is-a".)*

---

## The 5 things to be able to explain in the interview

**1. The game logic never imports Pixi, React or the DOM.**
`Game.ts` gets time as a parameter, never reads the clock, never uses
`Math.random()`. So the tests run in plain Node in ~200 ms with no browser and no
mocks, and the same inputs always give the same result — bugs can be reproduced.

**2. Fixed timestep** (the loop in `GameCanvas.tsx`).
Moving the ball by "however much time passed" means the game plays differently at
144 Hz than at 60 Hz, and a background tab returns a 2-second jump that sends the
ball straight *through* the paddle (tunnelling). The fix: collect elapsed time and
always update with the same `1/60`. The `Math.min(..., 0.25)` cap is the
"spiral of death" guard.

**3. XState only for screens.**
Three booleans (`isPaused`, `isOver`, `hasStarted`) = 8 combinations, 4 of them
nonsense, and nothing prevents them. The machine makes those impossible. It
deliberately does **not** store the ball position — 60 updates a second through a
machine would allocate a context object per frame and gain nothing.

**4. RxJS only for input.**
Five event sources that must be cleaned up together; one `Subscription` removes all
of them. It stops at the loop's edge: the game *pulls* the intent once per step
rather than being pushed by a stream. Driving the render loop with RxJS would look
clever and cost you determinism — that's the over-engineering trap the job ad hints at.

**5. Performance, and how you'd find it.**
- Shapes are drawn once and then only **moved**. Calling `.clear().circle().fill()`
  each frame rebuilds and re-uploads geometry to the GPU — the #1 PixiJS mistake.
- React never sees the game; it re-renders only when the score changes.
- The HUD is DOM, not canvas text (canvas text can't reflow and screen readers
  can't see it).
- Ball-vs-brick checks all 45 bricks every step — knowingly. That's nothing. If it
  ever *did* get slow, the fix is a grid lookup, not a quadtree. **Measure first.**
- `destroy()` releases the WebGL context. Skip it and each hot reload leaks one;
  browsers allow ~16, then the screen goes black.

---

## The tests (`pnpm test`)

17 tests, and the interesting ones are:

- **the NaN bug** — when the ball's centre is *inside* a brick, distance is 0 and a
  naive implementation divides by zero. One `NaN` reaches the velocity and the ball
  disappears forever. There is a test for exactly that.
- **determinism** — two games given identical inputs must end in identical positions.
- **the machine's refusals** — "a paused game cannot end". With booleans you cannot
  even write that test, because the bad state is not modelled. That is the argument
  for a state machine, in one test.
