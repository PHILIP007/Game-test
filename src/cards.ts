// Card words: what playing a card does. content/cards.kdl lists them under each card, one per line (`volley 5 40 1`),
// and they run top to bottom when it's played; content.ts hands this registry to `combinators()`. Also the deck's
// rules: drawing into empty slots, and shuffling the discard back in when the draw pile runs out. Catalog: ## Behaviour words.
import { shuffle, type Rng } from './rng';
import { T } from './tuning';
import { clampToArena, fan, fire, type GameState } from './world';

/** One word of a card: the state after it, given which card it's on (shots remember their card for their paint). */
export type Effect = (s: GameState, card: string) => GameState;

const player = (s: GameState, p: Partial<GameState['player']>): GameState => ({ ...s, player: { ...s.player, ...p } });

export const EFFECTS: Record<string, (...args: number[]) => Effect> = {
  /** `volley n spread_deg damage`: n shots fanned across spread_deg along your aim. */
  volley: (n, spreadDeg, damage) => (s, card) =>
    fire(s, { card }, fan(s.player.aim, n, spreadDeg).map((dir) => ({ dir, speed: T.SHOT_SPEED_U_S, damage }))),
  /** `rail damage`: one fast slug along your aim that goes through everything. */
  rail: (damage) => (s, card) =>
    fire(s, { card }, [{ dir: s.player.aim, speed: T.RAIL_SPEED_U_S, damage, pierce: true, r: T.SHOT_R_U * 1.5 }]),
  /** `nova n damage`: n shots in a ring all round you. */
  nova: (n, damage) => (s, card) =>
    fire(s, { card }, fan(s.player.aim, n, 360).map((dir) => ({ dir, speed: T.SHOT_SPEED_U_S * 0.8, damage }))),
  /** `dash dist_u`: jump dist_u along your aim (the walls stop you), untouchable for a moment. */
  dash: (distU) => (s) => {
    const from = { x: s.player.x, y: s.player.y };
    const to = clampToArena({ x: from.x + s.player.aim.x * distU, y: from.y + s.player.aim.y * distU }, T.PLAYER_R_U);
    return { ...player(s, { ...to, graceS: Math.max(s.player.graceS, T.DASH_GRACE_S) }), events: [...s.events, { type: 'dashed', from, to }] };
  },
  /** `shield s`: a bubble for s seconds; nothing touches you. */
  shield: (secs) => (s) => player(s, { shieldS: Math.max(s.player.shieldS, secs), graceS: Math.max(s.player.graceS, secs) }),
  /** `rapid s`: the blaster fires much faster for s seconds. */
  rapid: (secs) => (s) => player(s, { rapidS: Math.max(s.player.rapidS, secs) }),
  /** `charge n`: n energy now (never past the cap). */
  charge: (n) => (s) => player(s, { energy: Math.min(T.ENERGY_MAX, s.player.energy + n) }),
  /** `mend n`: n health back (never past full). */
  mend: (n) => (s) => player(s, { hp: Math.min(T.PLAYER_HP, s.player.hp + n) }),
};

// ---------- the deck ----------

/**
 * Fill the hand's empty slots (`''`) from the top of the draw pile, left to right. When the pile runs out the discard
 * is shuffled into it; a slot stays empty only when both are empty.
 */
export function drawCards(s: GameState): GameState {
  let { deck, discard, seed } = s;
  const hand = s.hand.slice(), events = s.events.slice();
  for (let slot = 0; slot < hand.length; slot++) {
    if (hand[slot]) continue;
    if (!deck.length) {
      if (!discard.length) break;
      const rng: Rng = { seed };
      deck = shuffle(rng, discard); discard = []; seed = rng.seed;
      events.push({ type: 'shuffled' });
    }
    hand[slot] = deck[0]!;
    deck = deck.slice(1);
  }
  return { ...s, deck, discard, seed, hand, events };
}

/** Every card you own, wherever it is (the pile, the hand, the discard). */
export const allCards = (s: GameState) => [...s.deck, ...s.hand.filter(Boolean), ...s.discard];
