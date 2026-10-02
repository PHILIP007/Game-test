// The rules, pure: (state, ...args) -> next state. Randomness is the seed in the state; nothing here touches the
// renderer, the store, the DOM or storage (src/core-purity.test.ts holds that line). Each transition leaves `events`
// describing what just happened, and the shell animates from those.
// PLACEHOLDER: a tiny collecting game so every layer has something to show. Replace it with your game's rules.
import { z } from 'zod';
import { THING_IDS, thingDef } from './content';
import { pick, rand, type Rng } from './rng';
import { T } from './tuning';

export type Thing = { id: number; kind: string; x: number; y: number };
export type GameEvent =
  | { type: 'collected'; id: number; kind: string; points: number }
  | { type: 'cleared' };
export type GameState = { seed: number; score: number; things: Thing[]; nextId: number; events: GameEvent[] };

/** A batch of things scattered over the field, drawn from the content. */
function spawn(s: GameState): GameState {
  const rng: Rng = { seed: s.seed };
  const things = Array.from({ length: T.BATCH_SIZE }, (_, i): Thing => ({
    id: s.nextId + i,
    kind: pick(rng, THING_IDS),
    x: (rand(rng) - 0.5) * T.FIELD_W_U,
    y: (rand(rng) - 0.5) * T.FIELD_H_U,
  }));
  return { ...s, seed: rng.seed, things, nextId: s.nextId + T.BATCH_SIZE };
}

export const newGame = (seed: number): GameState => spawn({ seed, score: 0, things: [], nextId: 1, events: [] });

/** Collect one thing: its reward words score it; the last one of a batch brings a fresh batch. Unknown id: no-op. */
export function collect(s: GameState, id: number): GameState {
  const thing = s.things.find((t) => t.id === id);
  if (!thing) return s;
  const score = thingDef(thing.kind).rewards.reduce((sc, reward) => reward(sc), s.score);
  const events: GameEvent[] = [{ type: 'collected', id, kind: thing.kind, points: score - s.score }];
  const next = { ...s, score, things: s.things.filter((t) => t !== thing), events };
  return next.things.length ? next : { ...spawn(next), events: [...events, { type: 'cleared' }] };
}

// ---------- meta: what outlives a game (saved by the store; zod checks a save on load, saves are untrusted) ----------

export const MetaSchema = z.object({ best: z.number().int().nonnegative(), games: z.number().int().nonnegative() });
export type Meta = z.infer<typeof MetaSchema>;

export const newMeta = (): Meta => ({ best: 0, games: 0 });

/** A finished game's score folded into the records. */
export const recordGame = (m: Meta, score: number): Meta => ({ best: Math.max(m.best, score), games: m.games + 1 });

/** A save's meta, or null when it isn't one. */
export const parseMeta = (raw: unknown): Meta | null => { const r = MetaSchema.safeParse(raw); return r.success ? r.data : null; };
