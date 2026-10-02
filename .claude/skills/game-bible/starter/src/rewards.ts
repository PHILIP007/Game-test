// Behaviour words for what collecting a thing does. content/things.kdl lists them under each thing (`points 5`), one per
// line; content.ts hands this registry to `combinators()`. The core module that owns a rule owns its words.
// PLACEHOLDER: one word to show the pattern; add words here with a catalog row (## Behaviour words).

/** What one word does to the score when its thing is collected. */
export type Reward = (score: number) => number;

export const REWARDS: Record<string, (...args: number[]) => Reward> = {
  /** Collecting it scores `n` points. */
  points: (n) => (score) => score + n,
};
