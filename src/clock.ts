// The game's one clock. Live, Pixi's ticker steps it; in stories the driver holds it and steps it by hand
// (advance/settle), so animations finish in zero wall time. A story is the same run every time when the driver
// holds before any live frame can run and rewinds the time origin as it starts the scene.
// Everything time-based (tweens, sprite anims, delays) subscribes with onTick instead of reading a timer.

export const STEP_MS = 1000 / 60; // one fixed frame when stepped by hand
export const MAX_STEP_S = 0.05; // a stalled tab resumes without teleporting the game forward

type Tick = (dtS: number) => boolean | void; // true = something is still moving
export type Ticker = { add(fn: (tk: { deltaMS: number }) => void): unknown; remove(fn: (tk: { deltaMS: number }) => void): unknown };

// ponytail: module-level singleton, one clock per page; a page with two games would need a Clock instance.
const subs = new Set<Tick>();
let t = 0;
let holder: object | null = null;
let renderNow = () => {};

/** Game time in seconds. */
export const now = () => t;

/** Put game time back to 0. Only for starting a scene: anything that stored an absolute now() is stale after this. */
export const rewind = () => { t = 0; };

export function onTick(fn: Tick) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

function step(dtS: number) {
  t += dtS;
  let busy = false;
  for (const fn of subs) if (fn(dtS)) busy = true;
  return busy;
}

/** Live mode: the ticker drives the clock. `render` is what advance/settle finish with (Pixi hit-tests the last render). */
export function startClock(ticker: Ticker, render: () => void) {
  const frame = (tk: { deltaMS: number }) => { if (!holder) step(Math.min(MAX_STEP_S, tk.deltaMS / 1000)); };
  ticker.add(frame);
  renderNow = render;
  return () => { ticker.remove(frame); renderNow = () => {}; };
}

/** Freeze game time (Pixi keeps rendering). The release is a no-op once another hold has taken over. */
export function hold() {
  const mine = {};
  holder = mine;
  return () => { if (holder === mine) holder = null; };
}

export function advance(ms: number) {
  for (let i = 0, n = Math.round(ms / STEP_MS); i < n; i++) step(STEP_MS / 1000);
  renderNow();
}

/** Step until nothing is moving. Throws when something animates forever rather than hanging the story. */
export function settle(maxMs = 30_000) {
  for (let ms = 0; step(STEP_MS / 1000); ms += STEP_MS) {
    if (ms > maxMs) throw new Error(`clock did not settle within ${maxMs}ms of game time: something animates forever`);
  }
  renderNow();
}
