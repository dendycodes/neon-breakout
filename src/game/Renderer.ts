import { Application, Container, Graphics } from 'pixi.js';
import { CONFIG, type Brick, type Game } from './Game';

/**
 * Renderer.ts — the ONLY file in the project that imports Pixi.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IS PIXI, IN ONE PARAGRAPH
 * ────────────────────────────────────────────────────────────────────────────
 * Pixi draws 2D graphics on a <canvas> using the GPU. Three words to know:
 *   • Application — Pixi's main object: it owns the canvas and the draw loop.
 *   • Graphics    — a shape you draw (circle, rectangle). Like a <div> you can move.
 *   • Container   — a folder that holds other objects, so you can group them.
 * Objects are added to `app.stage` (the root), and Pixi draws that tree.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS SEPARATELY
 * ────────────────────────────────────────────────────────────────────────────
 * The Renderer knows about the Game. The Game knows NOTHING about the Renderer.
 * The arrow only points one way. That is why the game logic can be tested with no
 * browser, and why switching to another drawing library would only change this file.
 *
 * [OOP: ENCAPSULATION / капсулация] — every Pixi object below is `private`. No other
 * file can reach in and move a brick sprite; they can only call `render(game)`.
 *
 * [OOP: SINGLE RESPONSIBILITY] — this class only draws. It never decides rules.
 */

/** All the colours, in one place, so the look can change without touching logic. */
const COLORS = {
  background: 0x080b18, // 0x… is a hex colour, the same as #080b18 in CSS
  paddle: 0x4de1ff,
  ball: 0xfff3b0,
  rows: [0xff5f6d, 0xff9a4d, 0xffd93d, 0x6ddf6d, 0x4dd0ff], // one colour per brick row
};

export class Renderer {
  private app: Application | null = null;
  /** The <canvas> Pixi created for us. The input layer needs it for mouse events. */
  private _canvas: HTMLCanvasElement | null = null;
  private readonly brickLayer = new Container();
  private readonly ball = new Graphics();
  private readonly paddle = new Graphics();

  /**
   * One Graphics per Brick. A `Map` lets us look up "which drawing belongs to this
   * brick object?" instantly, so when a brick dies we remove exactly its drawing.
   */
  private readonly brickGraphics = new Map<Brick, Graphics>();

  /** Set once destroy() has run, so a late frame cannot draw on a dead context. */
  private destroyed = false;

  get canvas(): HTMLCanvasElement | null {
    return this._canvas;
  }

  /**
   * Set Pixi up and put its canvas inside `host`.
   *
   * ⚠️ WHY PIXI CREATES THE CANVAS, INSTEAD OF REACT GIVING IT ONE
   *
   * A <canvas> can only ever have ONE WebGL context, and destroying that context is
   * permanent — the same element can never be used for WebGL again. React in dev
   * mode (StrictMode) mounts every component TWICE on purpose, to catch exactly
   * this kind of bug: mount → cleanup (context destroyed) → mount again. If React
   * owned the canvas, that second mount would get a dead element and Pixi would
   * throw "Could not retrieve shader source (WebGL context may be lost)".
   *
   * So: Pixi makes its own canvas, we append it here, and `destroy()` removes it
   * again. Each mount gets a brand new, healthy canvas.
   *
   * It is `async` because Pixi 8 has to ask the browser for a GPU context (it tries
   * WebGPU first, then falls back to WebGL) — and that await is why GameCanvas must
   * check whether the component disappeared while we were waiting.
   */
  async init(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      width: CONFIG.width, // the game's coordinate system, 800×600
      height: CONFIG.height,
      background: COLORS.background,
      antialias: true, // smooth edges
      // On a retina screen 1 CSS pixel = 2 real pixels. Telling Pixi this keeps
      // everything sharp instead of blurry.
      resolution: Math.min(globalThis.devicePixelRatio ?? 1, 2),
      autoDensity: true,
      // IMPORTANT: turn Pixi's own loop off. OUR loop (in GameCanvas) decides when
      // to draw. Two loops running at once = stutter that is painful to debug.
      autoStart: false,
    });
    this.app = app;
    this._canvas = app.canvas;
    app.ticker.stop();

    // Pixi built the canvas; now put it on the page. `replaceChildren` (rather than
    // `appendChild`) guarantees this host holds exactly ONE canvas, even if a hot
    // reload left an old one behind. React never renders anything into this div, so
    // clearing it is safe.
    app.canvas.classList.add('touch-none', 'rounded-lg');
    host.replaceChildren(app.canvas);

    // Draw each shape ONCE here, and from now on only MOVE it.
    //
    // The classic Pixi performance mistake is calling .clear().circle().fill()
    // every frame. That rebuilds the shape and re-uploads it to the GPU 60 times a
    // second. Moving an existing shape is almost free; rebuilding it is not.
    this.ball.circle(0, 0, CONFIG.ball.radius).fill({ color: COLORS.ball });
    const { width: pw, height: ph } = CONFIG.paddle;
    this.paddle.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2).fill({ color: COLORS.paddle });

    // Order matters: things added later are drawn on top.
    app.stage.addChild(this.brickLayer, this.paddle, this.ball);
  }

  /** Draw one frame. Called by the loop in GameCanvas.tsx. */
  render(game: Game): void {
    // Two guards, both needed: init() may not have finished, and destroy() may have
    // already run (the loop can have one frame still queued when React unmounts).
    if (!this.app || this.destroyed) return;

    // STEP 1: give any brick without a drawing one.
    for (const brick of game.bricks) {
      let graphic = this.brickGraphics.get(brick);
      if (!graphic) {
        const { width, height } = CONFIG.bricks;
        graphic = new Graphics()
          .roundRect(-width / 2, -height / 2, width, height, 4)
          .fill({ color: COLORS.rows[brick.row % COLORS.rows.length] });
        graphic.position.set(brick.x, brick.y);
        this.brickLayer.addChild(graphic);
        this.brickGraphics.set(brick, graphic);
      }
      // A damaged brick fades. Changing `alpha` is free; redrawing the shape is not.
      graphic.alpha = brick.hitPoints > 1 ? 1 : 0.75;
    }

    // STEP 2: delete drawings whose brick is gone.
    // We compare against the live list instead of trusting some other code to tell
    // us "this brick died". Nothing can be forgotten this way.
    const live = new Set(game.bricks);
    for (const [brick, graphic] of this.brickGraphics) {
      if (live.has(brick)) continue;
      // Pixi objects hold GPU memory. JavaScript's garbage collector cannot free
      // that for you — you must call destroy() yourself.
      graphic.destroy();
      this.brickGraphics.delete(brick);
    }

    // STEP 3: move the ball and paddle, then draw everything.
    this.paddle.position.set(game.paddle.x, game.paddle.y);
    this.ball.position.set(game.ball.x, game.ball.y);
    this.app.render();
  }

  /**
   * The game is always 800×600 internally. This scales the canvas with CSS so it
   * fits whatever space the page gives it, keeping the shape correct (letterboxing).
   */
  resize(cssWidth: number, cssHeight: number): void {
    const canvas = this.app?.canvas;
    if (!canvas) return;
    const scale = Math.min(cssWidth / CONFIG.width, cssHeight / CONFIG.height);
    canvas.style.width = `${CONFIG.width * scale}px`;
    canvas.style.height = `${CONFIG.height * scale}px`;
  }

  /**
   * Clean everything up.
   *
   * If you skip this, every hot reload while developing leaves an old WebGL context
   * behind. Browsers only allow about 16 of them, then start killing the oldest —
   * and your game suddenly goes black for no visible reason. Always clean up.
   */
  destroy(): void {
    if (this.destroyed) return; // calling it twice must be harmless
    this.destroyed = true;
    this.brickGraphics.clear();
    // `{ removeView: true }` = also take the canvas out of the page, since Pixi is
    // the one that created it. (Passing a plain `true` here does NOT do that in
    // Pixi 8 — the old canvas then stays in the DOM as a dead black rectangle.)
    this.app?.destroy({ removeView: true }, { children: true, texture: true });
    // Belt and braces: if anything above failed, make sure the element is gone.
    this._canvas?.remove();
    this.app = null;
    this._canvas = null;
  }
}
