import { describe, expect, it } from 'vitest';
import { advance, hold, MAX_STEP_S, now, onTick, rewind, settle, startClock, STEP_MS, type Ticker } from './clock';

const fakeTicker = () => {
  const fns = new Set<Parameters<Ticker['add']>[0]>();
  return { fns, add: (f: Parameters<Ticker['add']>[0]) => fns.add(f), remove: (f: Parameters<Ticker['add']>[0]) => fns.delete(f), frame: (deltaMS: number) => fns.forEach((f) => f({ deltaMS })) };
};

describe('clock', () => {
  it('steps whole fixed frames and renders once', () => {
    let renders = 0, steps = 0;
    const stop = startClock(fakeTicker(), () => renders++);
    const off = onTick(() => { steps++; });
    advance(STEP_MS * 10);
    expect([steps, renders]).toEqual([10, 1]);
    off(); stop();
  });

  it('is driven by the ticker unless held, clamping stalled frames', () => {
    const tk = fakeTicker();
    const stop = startClock(tk, () => {});
    const t0 = now();
    tk.frame(5000);
    expect(now() - t0).toBeCloseTo(MAX_STEP_S);
    const release = hold();
    tk.frame(16);
    expect(now() - t0).toBeCloseTo(MAX_STEP_S);
    release();
    tk.frame(16);
    expect(now() - t0).toBeCloseTo(MAX_STEP_S + 16 / 1000);
    stop();
    expect(tk.fns.size).toBe(0);
  });

  it('settle stops when idle, then renders', () => {
    let renders = 0, left = 5;
    const stop = startClock(fakeTicker(), () => renders++);
    const off = onTick(() => --left > 0);
    settle();
    expect([left, renders]).toEqual([0, 1]);
    off(); stop();
  });

  it('settle throws when something never stops', () => {
    const off = onTick(() => true);
    expect(() => settle(100)).toThrow(/did not settle/);
    off();
  });

  it('a stale release does not unfreeze a newer hold', () => {
    const tk = fakeTicker();
    const stop = startClock(tk, () => {});
    const first = hold(), second = hold();
    first();
    const t0 = now();
    tk.frame(16);
    expect(now()).toBe(t0);
    second();
    tk.frame(16);
    expect(now()).toBeGreaterThan(t0);
    stop();
  });

  it('onTick disposer unsubscribes', () => {
    let n = 0;
    const off = onTick(() => { n++; });
    advance(STEP_MS);
    off();
    advance(STEP_MS);
    expect(n).toBe(1);
  });

  it('stopping detaches the ticker and the render', () => {
    let renders = 0;
    const stop = startClock(fakeTicker(), () => renders++);
    stop();
    advance(STEP_MS);
    settle();
    expect(renders).toBe(0);
  });

  it('rewind puts game time back to 0', () => {
    advance(STEP_MS * 3);
    rewind();
    expect(now()).toBe(0);
  });
});
