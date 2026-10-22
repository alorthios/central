import { describe, expect, it } from 'vitest';
import { GameClock } from './clock.ts';

function fakeTime() {
  let t = 1_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('GameClock', () => {
  it('reste à zéro tant qu’elle n’a pas démarré', () => {
    const time = fakeTime();
    const clock = new GameClock(time.now);
    time.advance(500);
    expect(clock.elapsed()).toBe(0);
    expect(clock.running).toBe(false);
  });

  it('compte le temps écoulé depuis le démarrage', () => {
    const time = fakeTime();
    const clock = new GameClock(time.now);
    clock.start();
    time.advance(2_500);
    expect(clock.elapsed()).toBe(2_500);
  });

  it('ne compte pas les pauses', () => {
    const time = fakeTime();
    const clock = new GameClock(time.now);
    clock.start();
    time.advance(1_000);
    clock.pause();
    time.advance(60_000);
    expect(clock.elapsed()).toBe(1_000);
    expect(clock.running).toBe(false);
    clock.resume();
    time.advance(500);
    expect(clock.elapsed()).toBe(1_500);
  });

  it('accélère le temps de jeu, pauses comprises', () => {
    const time = fakeTime();
    const clock = new GameClock(time.now, 10);
    clock.start();
    time.advance(1_000);
    clock.pause();
    time.advance(5_000);
    clock.resume();
    time.advance(500);
    expect(clock.elapsed()).toBe(15_000);
  });

  it('ignore les appels redondants', () => {
    const time = fakeTime();
    const clock = new GameClock(time.now);
    clock.start();
    time.advance(1_000);
    clock.start();
    clock.resume();
    clock.pause();
    clock.pause();
    time.advance(1_000);
    clock.resume();
    expect(clock.elapsed()).toBe(1_000);
  });
});
