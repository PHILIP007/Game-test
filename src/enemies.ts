// Enemy words: how an enemy moves and attacks. content/enemies.kdl lists them under each enemy, one per line
// (`chase 3.5`), and every word runs every step; content.ts hands this registry to `combinators()` together with the
// drop words in rewards.ts. Catalog: ## Behaviour words.
import { T } from './tuning';
import { clampToArena, dist, fan, rotate, toward, unit, type Enemy, type GameEvent, type ShotSpec, type Vec } from './world';

/** What a step gives a behaviour word: where the pilot is, and how much time passed. */
export type Ctx = { target: Vec; dtS: number };
/** A word's step: the enemy after it, shots it fired, and what happened. */
export type Act = { e: Enemy; shots: ShotSpec[]; events: GameEvent[] };
export type Behaviour = { kind: 'behaviour'; run: (e: Enemy, ctx: Ctx) => Act };

const behaviour = (run: Behaviour['run']): Behaviour => ({ kind: 'behaviour', run });
const quiet = (e: Enemy): Act => ({ e, shots: [], events: [] });
const walk = (e: Enemy, vel: Vec, dtS: number): Enemy => ({ ...e, ...clampToArena({ x: e.x + vel.x * dtS, y: e.y + vel.y * dtS }, 0.3) });
/** Count a word's timer down; `ready` when it reaches zero, and then it starts again at `every`. The first wait is shorter. */
function timer(e: Enemy, word: string, everyS: number, dtS: number): { e: Enemy; ready: boolean } {
  const left = (e.timers[word] ?? everyS * 0.6) - dtS, ready = left <= 0;
  return { e: { ...e, timers: { ...e.timers, [word]: ready ? everyS : left } }, ready };
}
const foeShot = (from: Vec, dir: Vec, speed: number): ShotSpec =>
  ({ at: { x: from.x, y: from.y }, dir, speed, damage: T.FOE_SHOT_DAMAGE, r: T.FOE_SHOT_R_U, lifeS: T.FOE_SHOT_LIFE_S });

export const BEHAVIOURS: Record<string, (...args: number[]) => Behaviour> = {
  /** `chase speed_u_s`: walk straight at the pilot. */
  chase: (speed) => behaviour((e, { target, dtS }) =>
    quiet(e.mode === 'walk' ? walk(e, scale(toward(e, target), speed), dtS) : e)),

  /** `orbit range_u speed_u_s`: keep about range_u away and circle the pilot. */
  orbit: (range, speed) => behaviour((e, { target, dtS }) => {
    if (e.mode !== 'walk') return quiet(e);
    const d = dist(e, target), inward = toward(e, target);
    const radial = d > range ? 1 : d < range * 0.75 ? -1 : 0;
    const side = rotate(inward, (Math.PI / 2) * e.spin);
    return quiet(walk(e, scale(unit({ x: inward.x * radial + side.x * 0.8, y: inward.y * radial + side.y * 0.8 }), speed), dtS));
  }),

  /** `lunge every_s speed_u_s`: every few seconds, stop and shake (the windup), then dash at where the pilot was. */
  lunge: (everyS, speed) => behaviour((e, { target, dtS }) => {
    if (e.mode === 'walk') {
      const t = timer(e, 'lunge', everyS, dtS);
      if (!t.ready) return quiet(t.e);
      return { e: { ...t.e, mode: 'windup', modeS: T.LUNGE_WINDUP_S }, shots: [], events: [{ type: 'windup', id: e.id }] };
    }
    const modeS = e.modeS - dtS;
    if (e.mode === 'windup') return quiet(modeS > 0 ? { ...e, modeS } : { ...e, mode: 'lunge', modeS: T.LUNGE_S, v: scale(toward(e, target), speed) });
    const moved = walk(e, e.v, dtS);
    return quiet(modeS > 0 ? { ...moved, modeS } : { ...moved, mode: 'walk', modeS: 0 });
  }),

  /** `shoot every_s speed_u_s`: every few seconds, one shot at the pilot. */
  shoot: (everyS, speed) => behaviour((e, { target, dtS }) => {
    const t = timer(e, 'shoot', everyS, dtS);
    return { e: t.e, shots: t.ready && e.mode === 'walk' ? [foeShot(e, toward(e, target), speed)] : [], events: [] };
  }),

  /** `spray n every_s speed_u_s`: every few seconds, n shots in a ring. */
  spray: (n, everyS, speed) => behaviour((e, { target, dtS }) => {
    const t = timer(e, 'spray', everyS, dtS);
    return { e: t.e, shots: t.ready && e.mode === 'walk' ? fan(toward(e, target), n, 360).map((dir) => foeShot(e, dir, speed)) : [], events: [] };
  }),
};

function scale(v: Vec, k: number): Vec { return { x: v.x * k, y: v.y * k }; }
