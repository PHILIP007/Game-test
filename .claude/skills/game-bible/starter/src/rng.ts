// Seeded RNG (mulberry32). State is a plain number so it lives inside GameState and undo snapshots.
export function nextRandom(seed: number): [value: number, seed: number] {
  let t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

/** Mutable helper for code that threads rng through a state object. */
export type Rng = { seed: number };

export function rand(rng: Rng): number {
  const [v, s] = nextRandom(rng.seed);
  rng.seed = s;
  return v;
}

export function randInt(rng: Rng, n: number): number {
  return Math.floor(rand(rng) * n);
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const pick = <T>(rng: Rng, xs: T[]): T => xs[randInt(rng, xs.length)]!;
