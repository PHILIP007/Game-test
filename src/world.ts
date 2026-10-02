// The shape of a run, and the small helpers every rule module shares (moving, aiming, firing). Pure: plain data in,
// plain data out. game.ts runs the rules; weapons.ts, enemies.ts and rewards.ts own the behaviour words content uses.
import { T } from './tuning';

export type Vec = { x: number; y: number };

export type Player = {
  x: number; y: number;
  hp: number;
  /** Where the kid is aiming: a unit vector, set from the cursor every step. Weapons fire along it. */
  aim: Vec;
  /** Seconds left untouchable (after a hit, or under a shield). */
  graceS: number;
  /** Seconds left of a `shield`: drawn as a bubble, and untouchable meanwhile. */
  shieldS: number;
};

/** A weapon slot on the kid: the weapon's id (`''` when empty) and seconds until it fires again. */
export type Mount = { weapon: string; cooldownS: number };

/** What an enemy is doing: walking its behaviour words, or a charger's windup and lunge. */
export type Mode = 'walk' | 'windup' | 'lunge';

export type Enemy = {
  id: number; kind: string;
  x: number; y: number;
  hp: number; maxHp: number;
  mode: Mode;
  /** Seconds left in the current mode (windup, lunge). */
  modeS: number;
  /** The lunge's direction and speed, locked at the end of the windup. */
  v: Vec;
  /** Per behaviour word, seconds until it acts again (`shoot`, `spray`, `lunge`). */
  timers: Record<string, number>;
  /** Which way an `orbit` circles: 1 or -1, set at spawn. */
  spin: number;
};

/** Who fired a shot: one of the kid's weapons (its id), or an enemy. Its paint follows from this. */
export type ShotSource = 'foe' | { weapon: string };

export type Shot = {
  id: number;
  x: number; y: number;
  v: Vec;
  r: number;
  damage: number;
  /** Goes through enemies, hitting each once (`hit` remembers whom). */
  pierce: boolean;
  hit: number[];
  lifeS: number;
  from: ShotSource;
};

export type GameEvent =
  | { type: 'fired'; from: ShotSource }
  | { type: 'bought'; weapon: string; mount: number }
  | { type: 'sold'; weapon: string; mount: number; points: number }
  | { type: 'spawned'; id: number; kind: string }
  | { type: 'struck'; id: number; damage: number }
  | { type: 'killed'; id: number; kind: string; x: number; y: number }
  | { type: 'hurt'; damage: number }
  | { type: 'windup'; id: number }
  | { type: 'cleared'; wave: number }
  | { type: 'died' };

/** fight: the wave is on. shop: the wave is cleared and weapons are on offer. dead: the run is over. */
export type Phase = 'fight' | 'shop' | 'dead';

export type GameState = {
  seed: number;
  phase: Phase;
  /** 1-based; which entry of content/waves.kdl is wave n wraps around (see game.ts). */
  wave: number;
  /** Enemy kinds still to come this wave, in order. */
  queue: string[];
  /** Seconds until the next of the queue appears. */
  spawnS: number;
  player: Player;
  enemies: Enemy[];
  shots: Shot[];
  /** The kid's weapon slots, MOUNTS of them, left to right. */
  mounts: Mount[];
  /** Weapon ids on offer in the shop after a cleared wave. */
  offer: string[];
  /** Points to spend in the shop: kills pay them. */
  points: number;
  /** Every point earned this run, spent or not: the run's score. */
  score: number;
  kills: number;
  nextId: number;
  events: GameEvent[];
};

// ---------- geometry ----------

export const len = (v: Vec) => Math.hypot(v.x, v.y);
/** A unit vector along v, or `fallback` when v is (nearly) zero. */
export const unit = (v: Vec, fallback: Vec = { x: 1, y: 0 }): Vec => { const l = len(v); return l < 1e-6 ? fallback : { x: v.x / l, y: v.y / l }; };
export const toward = (from: Vec, to: Vec): Vec => unit({ x: to.x - from.x, y: to.y - from.y });
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const rotate = (v: Vec, rad: number): Vec => ({ x: v.x * Math.cos(rad) - v.y * Math.sin(rad), y: v.x * Math.sin(rad) + v.y * Math.cos(rad) });
export const DEG = Math.PI / 180;

/** A point kept `r` inside the arena's walls. */
export function clampToArena(p: Vec, r: number): Vec {
  const hw = T.FLOOR_W_U / 2 - r, hh = T.FLOOR_H_U / 2 - r;
  return { x: Math.max(-hw, Math.min(hw, p.x)), y: Math.max(-hh, Math.min(hh, p.y)) };
}

export const inArena = (p: Vec) => Math.abs(p.x) <= T.FLOOR_W_U / 2 && Math.abs(p.y) <= T.FLOOR_H_U / 2;

// ---------- firing ----------

export type ShotSpec = { dir: Vec; speed: number; damage: number; r?: number; pierce?: boolean; lifeS?: number; at?: Vec };

/** The state with new shots leaving the kid (or `at`), each along its own `dir`. */
export function fire(s: GameState, from: ShotSource, specs: ShotSpec[]): GameState {
  if (!specs.length) return s;
  const shots = specs.map((p, i): Shot => {
    const at = p.at ?? s.player;
    return {
      id: s.nextId + i, x: at.x, y: at.y,
      v: { x: p.dir.x * p.speed, y: p.dir.y * p.speed },
      r: p.r ?? T.SHOT_R_U, damage: p.damage, pierce: p.pierce ?? false, hit: [],
      lifeS: p.lifeS ?? T.SHOT_LIFE_S, from,
    };
  });
  return { ...s, shots: [...s.shots, ...shots], nextId: s.nextId + specs.length, events: [...s.events, { type: 'fired', from }] };
}

/** `n` directions fanned evenly across `spreadDeg` around `dir` (a full 360 spreads them round a circle). */
export function fan(dir: Vec, n: number, spreadDeg: number): Vec[] {
  if (n <= 1) return [dir];
  const full = spreadDeg >= 360, step = (spreadDeg * DEG) / (full ? n : n - 1), start = full ? 0 : -(spreadDeg * DEG) / 2;
  return Array.from({ length: n }, (_, i) => rotate(dir, start + i * step));
}
