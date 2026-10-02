// Drop words: what killing an enemy gives you. content/enemies.kdl lists them under each enemy beside its behaviour
// words (`points 10`); content.ts hands this registry to `combinators()` together with enemies.ts's. Catalog:
// ## Behaviour words.
import { T } from './tuning';
import type { GameState } from './world';

/** One drop: the state after it's picked up. */
export type Reward = { kind: 'reward'; apply: (s: GameState) => GameState };

const reward = (apply: Reward['apply']): Reward => ({ kind: 'reward', apply });

export const REWARDS: Record<string, (...args: number[]) => Reward> = {
  /** `points n`: n points to spend in the shop (they count towards the run's score too). */
  points: (n) => reward((s) => ({ ...s, points: s.points + n, score: s.score + n })),
  /** `heal n`: n health back (never past full). */
  heal: (n) => reward((s) => ({ ...s, player: { ...s.player, hp: Math.min(T.PLAYER_HP, s.player.hp + n) } })),
};
