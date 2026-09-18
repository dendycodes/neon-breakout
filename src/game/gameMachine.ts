import { assign, setup } from 'xstate';

/**
 * gameMachine.ts — which SCREEN the game is on: menu, playing, paused, game over.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IS A STATE MACHINE? (the idea, before the library)
 * ────────────────────────────────────────────────────────────────────────────
 * A state machine says: "the app is in exactly ONE state at a time, and from each
 * state only certain moves are allowed."
 *
 *      menu ──START──▶ playing ──TOGGLE_PAUSE──▶ paused
 *                         │  ▲                     │
 *                  GAME_OVER  └──TOGGLE_PAUSE──────┘
 *                         ▼
 *                     gameOver ──RESTART──▶ playing
 *
 * WHY BOTHER? The usual alternative is three booleans: isPaused, isGameOver,
 * hasStarted. Three booleans = 8 combinations, and only about 4 of them make sense.
 * Nothing stops `isPaused = true` AND `isGameOver = true` at the same time — that is
 * literally where bugs like "the pause menu is showing on top of the game over
 * screen" come from. A machine makes those combinations impossible to even write.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * XSTATE VOCABULARY (all of it used below)
 * ────────────────────────────────────────────────────────────────────────────
 *   state    — a named situation: 'menu', 'playing', 'paused', 'gameOver'
 *   event    — something that happens: { type: 'START' }
 *   context  — extra data carried along: score, level, bestScore
 *   action   — a small function that changes context during a transition
 *   actor    — a running instance of the machine (React's useMachine creates one)
 *
 * The golden rule: if you send an event the current state does not list, XState
 * simply IGNORES it. No crash, no wrong state. That is the safety you are buying.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHERE TO STOP (interviewers love this question)
 * ────────────────────────────────────────────────────────────────────────────
 * This machine holds screens and a couple of numbers that survive a run. It does
 * NOT hold the ball's position. Sending 60 updates a second through a machine would
 * create a new context object every frame and gain nothing. Game.ts owns that.
 * Rule of thumb: does this thing have MODES with rules about order? → machine.
 * Is it just a number going up? → plain variable.
 */

/** The extra data the machine carries around with it. */
export interface GameContext {
  /** Score of the last FINISHED run. The live score comes straight from Game.ts. */
  score: number;
  level: number;
  /** Best score this browser session — on purpose, it survives a restart. */
  bestScore: number;
}

/**
 * All events the machine understands.
 *
 * This is a "discriminated union": each option has a different `type`. TypeScript
 * then knows that `event.score` only exists on the GAME_OVER option — try to read
 * it elsewhere and you get a compile error instead of `undefined` at runtime.
 */
export type GameEvent =
  | { type: 'START' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'LEVEL_CLEARED' }
  | { type: 'GAME_OVER'; score: number }
  | { type: 'RESTART' };

export const gameMachine = setup({
  // `setup` is where you tell XState the types and name the reusable actions.
  types: { context: {} as GameContext, events: {} as GameEvent },
  actions: {
    // `assign` = "produce the new context". Never mutate the old one.
    nextLevel: assign(({ context }) => ({ level: context.level + 1 })),

    recordScore: assign(({ context, event }) =>
      // The check is needed because actions can, in principle, run for any event.
      event.type === 'GAME_OVER'
        ? { score: event.score, bestScore: Math.max(context.bestScore, event.score) }
        : {},
    ),

    resetRun: assign({ score: 0, level: 1 }), // note: bestScore is NOT reset
  },
}).createMachine({
  id: 'breakout',
  initial: 'menu', // where we start
  context: { score: 0, level: 1, bestScore: 0 },
  states: {
    /** The title screen. The game is drawn behind it, but frozen. */
    menu: {
      on: { START: 'playing' }, // "on event START, go to state playing"
    },

    playing: {
      on: {
        TOGGLE_PAUSE: 'paused',
        // Target 'playing' again = stay here, but run the action. The level number
        // changes, React notices, and asks Game.ts to build the next level.
        LEVEL_CLEARED: { target: 'playing', actions: 'nextLevel' },
        GAME_OVER: { target: 'gameOver', actions: 'recordScore' },
        RESTART: { target: 'playing', actions: 'resetRun' },
      },
    },

    /**
     * Look at what is MISSING here: no GAME_OVER, no LEVEL_CLEARED. While paused
     * those events are thrown away, so a late event cannot end your run behind the
     * pause menu. You get that protection from the machine's shape — you do not
     * write a single `if (!isPaused)` anywhere in the code.
     */
    paused: {
      on: {
        TOGGLE_PAUSE: 'playing',
        RESTART: { target: 'playing', actions: 'resetRun' },
      },
    },

    /** Only RESTART leaves here, so nothing can accidentally revive a dead run. */
    gameOver: {
      on: { RESTART: { target: 'playing', actions: 'resetRun' } },
    },
  },
});

/** The four possible states, as a type — so the UI can never misspell one. */
export type GameStateValue = 'menu' | 'playing' | 'paused' | 'gameOver';

/** One single place that answers "should the physics be running right now?". */
export function shouldSimulate(state: GameStateValue): boolean {
  return state === 'playing';
}
