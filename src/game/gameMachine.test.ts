import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from './gameMachine';

/**
 * Testing a state machine is mostly testing what it REFUSES to do.
 *
 * The valuable assertions here are the negative ones: a paused game cannot end,
 * a finished run cannot be revived by a stray event. With boolean flags those
 * cases are untestable, because they are not modelled at all — you can only find
 * them by playing. That is the argument for a machine, and this is how you
 * defend it.
 */
const start = () => createActor(gameMachine).start();

describe('gameMachine', () => {
  it('starts on the menu', () => {
    expect(start().getSnapshot().value).toBe('menu');
  });

  it('pauses and resumes with a single toggle event', () => {
    const actor = start();
    actor.send({ type: 'START' });

    actor.send({ type: 'TOGGLE_PAUSE' });
    expect(actor.getSnapshot().value).toBe('paused');

    actor.send({ type: 'TOGGLE_PAUSE' });
    expect(actor.getSnapshot().value).toBe('playing');
  });

  it('IGNORES events that are illegal in the current state', () => {
    const actor = start();
    // "Game over" on the title screen is nonsense, so the machine drops it rather
    // than ending a run that never began.
    actor.send({ type: 'GAME_OVER', score: 999 });
    expect(actor.getSnapshot().value).toBe('menu');
  });

  it('cannot end a run while it is paused', () => {
    const actor = start();
    actor.send({ type: 'START' });
    actor.send({ type: 'TOGGLE_PAUSE' });
    actor.send({ type: 'GAME_OVER', score: 500 });

    expect(actor.getSnapshot().value).toBe('paused');
  });

  it('advances the level without leaving play', () => {
    const actor = start();
    actor.send({ type: 'START' });
    actor.send({ type: 'LEVEL_CLEARED' });

    expect(actor.getSnapshot().value).toBe('playing');
    expect(actor.getSnapshot().context.level).toBe(2);
  });

  it('keeps the best score across a restart, but resets the run', () => {
    const actor = start();
    actor.send({ type: 'START' });
    actor.send({ type: 'GAME_OVER', score: 4200 });
    actor.send({ type: 'RESTART' });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe('playing');
    expect(snapshot.context.level).toBe(1);
    expect(snapshot.context.bestScore).toBe(4200);
  });
});
