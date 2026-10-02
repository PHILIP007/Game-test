// Weapon words: what a weapon does each time it fires. content/weapons.kdl lists them under each
// weapon, one per line (`volley 5 40 1`), and they run top to bottom when it fires; content.ts hands this registry to
// `combinators()`. Also the mounts' rules that don't need content: which are free, how many are filled.
// Catalog: ## Behaviour words.
import { T } from './tuning';
import { fan, fire, type GameState, type Mount } from './world';

/** One word of a weapon: the state after it, given which weapon it's on (shots remember their weapon for their paint). */
export type Effect = (s: GameState, weapon: string) => GameState;

const player = (s: GameState, p: Partial<GameState['player']>): GameState => ({ ...s, player: { ...s.player, ...p } });

export const EFFECTS: Record<string, (...args: number[]) => Effect> = {
  /** `volley n spread_deg damage`: n shots fanned across spread_deg along your aim (n 1: one straight shot). */
  volley: (n, spreadDeg, damage) => (s, weapon) =>
    fire(s, { weapon }, fan(s.player.aim, n, spreadDeg).map((dir) => ({ dir, speed: T.SHOT_SPEED_U_S, damage }))),
  /** `pierce damage`: one fast shot along your aim that goes through everything. */
  pierce: (damage) => (s, weapon) =>
    fire(s, { weapon }, [{ dir: s.player.aim, speed: T.PIERCE_SPEED_U_S, damage, pierce: true, r: T.SHOT_R_U * 1.5 }]),
  /** `nova n damage`: n shots in a ring all round you. */
  nova: (n, damage) => (s, weapon) =>
    fire(s, { weapon }, fan(s.player.aim, n, 360).map((dir) => ({ dir, speed: T.SHOT_SPEED_U_S * 0.8, damage }))),
  /** `shield s`: a bubble for s seconds; nothing touches you. */
  shield: (secs) => (s) => player(s, { shieldS: Math.max(s.player.shieldS, secs), graceS: Math.max(s.player.graceS, secs) }),
  /** `mend n`: n health back (never past full). */
  mend: (n) => (s) => player(s, { hp: Math.min(T.PLAYER_HP, s.player.hp + n) }),
};

// ---------- mounts ----------

/** The first empty mount, or -1 when every mount carries a weapon. */
export const freeMount = (mounts: Mount[]) => mounts.findIndex((m) => !m.weapon);
/** How many mounts carry a weapon. */
export const mountedCount = (mounts: Mount[]) => mounts.filter((m) => m.weapon).length;
