// Drop words: what killing an enemy gives you. content/enemies.kdl lists them under each enemy beside its behaviour
// words (`score 10`); content.ts hands this registry to `combinators()` together with enemies.ts's. Catalog:
// ## Behaviour words.
import { T } from './tuning';
import type { GameState } from './world';

/** One drop: the state after it's picked up. */
export type Reward = { kind: 'reward'; apply: (s: GameState) => GameState };

const reward = (apply: Reward['apply']): Reward => ({ kind: 'reward', apply });

export const REWARDS: Record<string, (...args: number[]) => Reward> = {
  /** `score n`: n points. */
  score: (n) => reward((s) => ({ ...s, score: s.score + n })),
  /** `energy n`: n energy (never past the cap). */
  energy: (n) => reward((s) => ({ ...s, player: { ...s.player, energy: Math.min(T.ENERGY_MAX, s.player.energy + n) } })),
  /** `heal n`: n health back (never past full). */
  heal: (n) => reward((s) => ({ ...s, player: { ...s.player, hp: Math.min(T.PLAYER_HP, s.player.hp + n) } })),
};
