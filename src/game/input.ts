import { Subject, Subscription, fromEvent } from 'rxjs';
import { CONFIG, type Intent } from './Game';

/**
 * input.ts — turns keyboard and mouse events into a simple object the game reads.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * RxJS IN THREE SENTENCES (this is all you need for this file)
 * ────────────────────────────────────────────────────────────────────────────
 * • An Observable is "a stream of values over time" — here, a stream of events.
 * • `fromEvent(window, 'keydown')` turns DOM events into such a stream.
 * • `.subscribe(fn)` runs `fn` for every value; `Subscription` collects all of
 *   those so ONE call to `unsubscribe()` removes every listener at once.
 *
 * A `Subject` is a stream you can push into yourself: `actions.next('restart')`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY USE RxJS HERE, BUT NOWHERE ELSE IN THE PROJECT?
 * ────────────────────────────────────────────────────────────────────────────
 * Because input is five different event sources that must be cleaned up together,
 * and forgetting one `removeEventListener` is the most common memory leak there is.
 * One `Subscription` makes that impossible to get wrong.
 *
 * It would be OVER-ENGINEERING to also run the game loop through RxJS. Interviewers
 * ask about this: the right answer is "use it where it removes real work, not
 * everywhere". Here RxJS PUSHES events into small variables, and the game PULLS the
 * result once per step.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * [OOP: ENCAPSULATION / капсулация] — without a class
 * ────────────────────────────────────────────────────────────────────────────
 * The variables below (`left`, `right`, `pointerX`…) live inside the function, so
 * nothing outside can touch them. The returned object exposes only three safe
 * things: `actions$`, `readIntent()` and `dispose()`. That is exactly what private
 * fields + public methods give you in a class — this is the closure version of the
 * same idea, and it is a normal, idiomatic choice in TypeScript.
 */

/** One-off commands. These go to the state machine, not to the physics. */
export type Action = 'toggle-pause' | 'restart' | 'confirm';

export function createInput(canvas: HTMLCanvasElement) {
  /** Collects every subscription so we can cancel them all in one call later. */
  const subscription = new Subscription();
  /** A stream WE push into, whenever the player presses Esc / R / Space. */
  const actions = new Subject<Action>();

  // --- The private state. Only the functions below can see these. ---
  let left = false;
  let right = false;
  /** Where the mouse wants the paddle, or null when the mouse is not being used. */
  let pointerX: number | null = null;
  /** True for ONE step only, then cleared. See readIntent() below. */
  let launchQueued = false;

  // --- Keyboard down ---
  subscription.add(
    fromEvent<KeyboardEvent>(window, 'keydown').subscribe((event) => {
      // Holding a key makes the browser repeat keydown forever. Ignore repeats, or
      // "launch" would fire on every single frame while Space is held.
      if (event.repeat) return;

      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        left = true;
        pointerX = null; // using the keyboard switches mouse steering off
      }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        right = true;
        pointerX = null;
      }
      if (event.code === 'Space') launchQueued = true;
      if (event.code === 'Space' || event.code === 'Enter') actions.next('confirm');
      if (event.code === 'Escape' || event.code === 'KeyP') actions.next('toggle-pause');
      if (event.code === 'KeyR') actions.next('restart');
    }),
  );

  // --- Keyboard up ---
  subscription.add(
    fromEvent<KeyboardEvent>(window, 'keyup').subscribe((event) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') left = false;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') right = false;
    }),
  );

  // --- Mouse / touch move ---
  subscription.add(
    fromEvent<PointerEvent>(canvas, 'pointermove').subscribe((event) => {
      const rect = canvas.getBoundingClientRect();
      // The canvas is stretched by CSS, so screen pixels ≠ game units. Convert:
      // (position inside the canvas ÷ canvas width) × game width.
      pointerX = ((event.clientX - rect.left) / rect.width) * CONFIG.width;
    }),
  );

  // --- Mouse / touch press ---
  subscription.add(
    fromEvent<PointerEvent>(canvas, 'pointerdown').subscribe(() => {
      launchQueued = true;
      actions.next('confirm');
    }),
  );

  // --- Window loses focus ---
  subscription.add(
    // If you alt-tab away while holding →, the browser never sends keyup, so the
    // paddle keeps sliding when you come back. Clearing the keys on blur fixes a
    // bug that exists in a lot of real browser games.
    fromEvent(window, 'blur').subscribe(() => {
      left = false;
      right = false;
    }),
  );

  return {
    /** The `$` at the end is a convention meaning "this is a stream". */
    actions$: actions.asObservable(),

    /**
     * Give the game what the player wants right now.
     *
     * Note that reading CLEARS `launchQueued`. This is called "edge triggering":
     * one key press produces exactly one launch, no matter how many frames the key
     * stays held. Getting this wrong is one of the most common input bugs — the
     * ball would re-launch every frame.
     */
    readIntent(): Intent {
      const intent: Intent = {
        direction: (right ? 1 : 0) - (left ? 1 : 0), // +1, 0 or -1
        pointerX,
        launch: launchQueued,
      };
      launchQueued = false;
      return intent;
    },

    /** One call removes all five listeners above. Called when React unmounts. */
    dispose(): void {
      subscription.unsubscribe();
      actions.complete();
    },
  };
}
