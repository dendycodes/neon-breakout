'use client'; // this component uses hooks and the browser, so it runs on the client

import { useMachine } from '@xstate/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, IDLE } from '@/game/Game';
import { createInput, type Action } from '@/game/input';
import { Renderer } from '@/game/Renderer';
import { gameMachine, shouldSimulate, type GameStateValue } from '@/game/gameMachine';

/**
 * GameCanvas.tsx — where React meets the game.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE IDEA YOU MUST BE ABLE TO EXPLAIN
 * ────────────────────────────────────────────────────────────────────────────
 * React is DECLARATIVE: you describe what the screen should look like, and React
 * re-renders when state changes. A game is IMPERATIVE: 60 times a second, move
 * things and draw them.
 *
 * Mixing them is a trap. If the ball's position lived in `useState`, React would
 * rebuild the component tree 60 times a second in order to draw pixels it cannot
 * even see (the canvas is drawn by Pixi, not by React).
 *
 * So the split is:
 *   • React owns  → the HTML around the canvas (score, menu) and which SCREEN we
 *                   are on (the state machine).
 *   • The game owns → everything inside the canvas. It lives in a `useRef` and runs
 *                     its own loop, completely outside React's render cycle.
 *
 * A `useRef` is just a box: `ref.current = anything`. Changing it does NOT cause a
 * re-render — which is exactly what we want for the game.
 */

/** The simulation always advances by exactly this much time. See the loop below. */
const FIXED_STEP = 1 / 60; // in seconds

export function GameCanvas() {
  // Refs = boxes that survive re-renders and never trigger one.
  /** The box that sizes the game on the page. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** An EMPTY div that Pixi owns completely, and puts its canvas inside. */
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  // `useMachine` starts the XState machine and re-renders when its state changes.
  // `state` = where we are now, `send` = how to fire an event at it.
  const [state, send] = useMachine(gameMachine);

  // Numbers the PLAYER reads. These are allowed in React state: they change a few
  // times a second at most, not 60 times.
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1 });

  const stateValue = state.value as GameStateValue;

  /**
   * A copy of the current state kept in a ref.
   *
   * WHY: the game loop below is created ONCE. If it read `stateValue` directly it
   * would forever see the value from the first render ("stale closure" — a very
   * common React bug). Reading `stateRef.current` always gives the fresh value.
   */
  const stateRef = useRef<GameStateValue>(stateValue);
  useEffect(() => {
    // Refs must be written inside an effect, not during render: React is allowed
    // to throw a render away and run it again.
    stateRef.current = stateValue;
  }, [stateValue]);

  /** Everything the player can command, in one place, forwarded to the machine. */
  const handleAction = useCallback(
    (action: Action) => {
      if (action === 'toggle-pause') return send({ type: 'TOGGLE_PAUSE' });

      if (action === 'restart' || (action === 'confirm' && stateRef.current === 'gameOver')) {
        gameRef.current?.restart(); // reset the simulation…
        return send({ type: 'RESTART' }); // …and the screen
      }

      // For everything else just send START. If we are already playing, the machine
      // does not list START there, so it is ignored — no `if` needed on our side.
      send({ type: 'START' });
    },
    // `useCallback` keeps this function identical between renders, so the effect
    // below does not tear the game down and rebuild it on every render.
    [send],
  );

  /* ═════════════════════════════════════════════════════════════════════════
   * Build the game once, run the loop, clean up on unmount.
   * The empty-ish dependency list means this runs on mount only.
   * ═════════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const game = new Game();
    const renderer = new Renderer();
    gameRef.current = game;

    let frame = 0;
    let disposed = false;
    let lastTime = performance.now();
    let accumulator = 0; // unsimulated time we have collected but not used yet

    // Input listens on the canvas, and Pixi only creates that during init() — so
    // these two start out empty and are filled in once init resolves, below.
    let input: ReturnType<typeof createInput> | null = null;
    let actionSub: { unsubscribe(): void } | null = null;

    /* ───────────────────────────────────────────────────────────────────────
     * THE FIXED TIMESTEP LOOP — the most important 20 lines in the project
     * ───────────────────────────────────────────────────────────────────────
     * The naive version is: "move the ball by however much time passed". That is
     * broken in three ways:
     *   1. On a 144 Hz monitor the game runs differently than on 60 Hz.
     *   2. Nothing is reproducible, so bugs cannot be retested.
     *   3. Switch browser tabs for 2 seconds and the ball jumps 800 pixels in one
     *      step — straight THROUGH the paddle, because it was never near it at any
     *      moment we checked. (This is called "tunnelling".)
     *
     * The fix: collect real elapsed time in `accumulator`, then run update() with
     * the SAME dt (1/60) as many times as fits. The simulation only ever sees one
     * constant time step, so it behaves identically on every machine.
     *
     * `Math.min(..., 0.25)` is the "spiral of death" guard: after a long freeze, a
     * naive loop would try to run 600 catch-up updates in one frame, which takes
     * longer than the time it is simulating, which queues even more updates… and the
     * page hangs. Capping the catch-up is a correctness fix, not an optimisation.
     * ─────────────────────────────────────────────────────────────────────── */
    const tick = (now: number) => {
      if (disposed) return;

      accumulator += Math.min((now - lastTime) / 1000, 0.25);
      lastTime = now;

      while (accumulator >= FIXED_STEP) {
        accumulator -= FIXED_STEP;

        if (!shouldSimulate(stateRef.current)) {
          // Paused or in a menu: still READ the input so a key held down now does
          // not suddenly fire the moment the game resumes.
          input?.readIntent();
          continue;
        }

        const outcome = game.update(FIXED_STEP, input?.readIntent() ?? IDLE);
        if (outcome === 'level-cleared') send({ type: 'LEVEL_CLEARED' });
        if (outcome === 'game-over') send({ type: 'GAME_OVER', score: game.score });
      }

      renderer.render(game);
      setHud({ score: game.score, lives: game.lives, level: game.level });

      // Ask the browser to call us again before the next screen refresh.
      frame = requestAnimationFrame(tick);
    };

    void renderer.init(host).then(() => {
      // Pixi's setup is async, so React may already have unmounted us while we
      // waited. Starting a loop on a destroyed renderer is the classic
      // "cannot read property of null" crash in React + canvas code.
      if (disposed || !renderer.canvas) return renderer.destroy();

      input = createInput(renderer.canvas);
      actionSub = input.actions$.subscribe(handleAction);
      resize();
      frame = requestAnimationFrame(tick);
    });

    // Resize the canvas whenever the surrounding box changes size.
    const container = containerRef.current;
    const resize = () => {
      const box = container?.getBoundingClientRect();
      if (box) renderer.resize(box.width, box.height);
    };
    const observer = new ResizeObserver(resize);
    if (container) observer.observe(container);

    // The cleanup function React calls on unmount. EVERYTHING started above must be
    // stopped here, or hot reload slowly leaks loops, listeners and GPU contexts.
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      actionSub?.unsubscribe();
      input?.dispose();
      renderer.destroy();
      gameRef.current = null;
    };
  }, [handleAction, send]);

  /** The machine moved to the next level, so tell the simulation to build it. */
  useEffect(() => {
    const game = gameRef.current;
    if (game && game.level !== state.context.level) game.loadLevel(state.context.level);
  }, [state.context.level]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-[min(80vh,600px)] w-full max-w-[800px] items-center justify-center"
    >
      {/*
        Pixi puts its <canvas> inside this div and owns it completely — React never
        renders children here. That separation is what stops React's dev
        double-mount from killing the WebGL context, and it keeps the HUD below
        positioned against the outer box instead of against the canvas.
      */}
      <div ref={hostRef} className="absolute inset-0 flex items-center justify-center" />

      {/*
        The score is normal HTML, NOT text drawn inside the canvas. Canvas text has
        to be turned into an image, cannot reflow, and screen readers cannot see it.
        Rule of thumb: the world goes in the canvas, the interface goes in the DOM.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-4 font-mono text-sm text-cyan-100">
        <span className="text-xl font-bold tabular-nums">{hud.score}</span>
        <span className="text-cyan-300/60">
          lvl {hud.level} · {'●'.repeat(Math.max(hud.lives, 0))}
        </span>
      </div>

      {/*
        ONE value decides which screen shows. Because of that it is impossible to
        display the pause menu and the game-over screen at the same time — which
        WOULD be possible with `{isPaused && …}{isOver && …}`. This is the state
        machine paying off, visible right here in the UI.
      */}
      {stateValue !== 'playing' && (
        <button
          type="button"
          onClick={() => handleAction('confirm')}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70 font-mono text-cyan-200"
        >
          <span className="text-2xl tracking-widest">
            {stateValue === 'menu' && 'NEON BREAKOUT'}
            {stateValue === 'paused' && 'PAUSED'}
            {stateValue === 'gameOver' && `GAME OVER · ${state.context.score}`}
          </span>
          <span className="text-sm text-cyan-100/60">
            {stateValue === 'paused' ? 'Esc / P to resume' : 'Space or click to play'}
          </span>
        </button>
      )}
    </div>
  );
}
