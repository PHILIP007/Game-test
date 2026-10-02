import { describe, expect, it } from 'vitest';
import { CARDS, ENEMIES, STARTING_DECK, WAVES } from './content';
import { IDLE, newGame, parseMeta, pickReward, playCard, recordRun, step, waveDef, type GameState } from './game';
import { T } from './tuning';
import type { Enemy } from './world';

const STEP_S = 1 / 60;
const run = (s: GameState, secs: number, input = IDLE) => { for (let t = 0; t < secs; t += STEP_S) s = step(s, STEP_S, input); return s; };
const foe = (kind: string, x: number, y: number, over: Partial<Enemy> = {}): Enemy =>
  ({ id: 900, kind, x, y, hp: ENEMIES[kind]!.hp, maxHp: ENEMIES[kind]!.hp, mode: 'walk', modeS: 0, v: { x: 0, y: 0 }, timers: {}, spin: 1, ...over });
/** A fight with only the given enemies and nothing left to come. */
const arena = (enemies: Enemy[], over: Partial<GameState> = {}): GameState => ({ ...newGame(1), queue: [], enemies, ...over });

describe('a new run', () => {
  it('is the same for the same seed', () => {
    expect(newGame(7)).toEqual(newGame(7));
  });
  it('starts on wave 1 with a full hand drawn from the starting deck', () => {
    const s = newGame(3);
    expect(s.wave).toBe(1);
    expect(s.phase).toBe('fight');
    expect(s.hand).toHaveLength(T.HAND_SIZE);
    expect([...s.hand, ...s.deck].sort()).toEqual([...STARTING_DECK].sort());
    expect(s.queue).toEqual(WAVES[0]!.queue);
  });
});

describe('the fight', () => {
  it('enemies come in from the edge, in the wave\'s order', () => {
    const s = run(newGame(1), WAVES[0]!.gapS + STEP_S);
    expect(s.enemies).toHaveLength(1);
    const e = s.enemies[0]!;
    expect(e.kind).toBe(WAVES[0]!.queue[0]);
    expect(Math.abs(e.x) > T.ARENA_W_U / 2 - 1 || Math.abs(e.y) > T.ARENA_H_U / 2 - 1).toBe(true);
  });
  it('the blaster fires at the cursor on its own', () => {
    const s = step(newGame(1), STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: 5 } });
    expect(s.shots).toHaveLength(1);
    expect(s.shots[0]!.v.y).toBeGreaterThan(0);
    expect(s.events).toContainEqual({ type: 'fired', from: 'blaster' });
  });
  it('the pilot moves, and the walls stop it', () => {
    const s = run(newGame(1), 10, { move: { x: 1, y: 0 }, aim: { x: 0, y: 0 } });
    expect(s.player.x).toBeCloseTo(T.ARENA_W_U / 2 - T.PLAYER_R_U);
  });
  it('a crawler walks at the pilot and hurts on contact, then the pilot is briefly untouchable', () => {
    let s = arena([foe('crawler', 3, 0)]);
    s = run(s, 1, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } }); // aim away so the blaster misses
    expect(s.player.hp).toBe(T.PLAYER_HP - ENEMIES.crawler!.touch);
    expect(s.player.graceS).toBeGreaterThan(0);
  });
  it('shots kill, and kills pay out their drop words', () => {
    let s = arena([foe('crawler', 4, 0, { hp: 1 }), foe('crawler', -8, 6, { id: 901 })]);
    s = run(s, 0.5, { move: { x: 0, y: 0 }, aim: { x: 4, y: 0 } });
    expect(s.kills).toBe(1);
    expect(s.score).toBe(10);
  });
  it('a charger winds up, then lunges', () => {
    let s = arena([foe('charger', 8, 0, { timers: { lunge: 0.01 } })]);
    s = step(s, STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(s.enemies[0]!.mode).toBe('windup');
    expect(s.events).toContainEqual({ type: 'windup', id: 900 });
    s = run(s, T.LUNGE_WINDUP_S + STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(s.enemies[0]!.mode).toBe('lunge');
  });
  it('a spitter shoots at the pilot', () => {
    let s = arena([foe('spitter', 6, 0, { timers: { shoot: 0.01 } })]);
    s = step(s, STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(s.shots.filter((b) => b.from === 'foe')).toHaveLength(1);
  });
  it('a brute sprays a ring', () => {
    let s = arena([foe('brute', 6, 0, { timers: { spray: 0.01 } })]);
    s = step(s, STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(s.shots.filter((b) => b.from === 'foe').length).toBeGreaterThan(5);
  });
  it('a cleared wave offers cards; dying ends the run', () => {
    const cleared = step(arena([]), STEP_S, IDLE);
    expect(cleared.phase).toBe('reward');
    expect(cleared.offer).toHaveLength(T.OFFER_SIZE);
    const dead = step(arena([foe('crawler', 0.2, 0)], { player: { ...newGame(1).player, hp: 1 } }), STEP_S, IDLE);
    expect(dead.phase).toBe('dead');
    expect(dead.events.at(-1)).toEqual({ type: 'died' });
    expect(step(dead, STEP_S, IDLE)).toBe(dead);
  });
});

describe('cards', () => {
  const holding = (card: string, energy: number = T.ENERGY_MAX) => {
    const s = arena([]);
    return { ...s, hand: [card, ...s.hand.slice(1)], player: { ...s.player, energy } };
  };
  it('playing a card pays its cost, discards it and draws the next into its slot', () => {
    const s = holding('scatter');
    const top = s.deck[0];
    const n = playCard(s, 0);
    expect(n.player.energy).toBe(T.ENERGY_MAX - CARDS.scatter!.cost);
    expect(n.discard.at(-1)).toBe('scatter');
    expect(n.hand[0]).toBe(top);
    expect(n.shots).toHaveLength(5);
  });
  it('without the energy, or with nothing in the slot, it is a no-op (same reference)', () => {
    const s = holding('rail', 1);
    expect(playCard(s, 0)).toBe(s);
    const empty = { ...s, hand: ['', ...s.hand.slice(1)] };
    expect(playCard(empty, 0)).toBe(empty);
  });
  it('a rail goes through every enemy in a line', () => {
    let s = playCard({ ...holding('rail'), enemies: [foe('crawler', 3, 0, { hp: 3 }), foe('crawler', 6, 0, { id: 901, hp: 3 })], player: { ...holding('rail').player, aim: { x: 1, y: 0 } } }, 0);
    s = run(s, 0.4, { move: { x: 0, y: 0 }, aim: { x: 10, y: 0 } });
    expect(s.kills).toBe(2);
  });
  it('dash jumps along the aim and leaves the pilot untouchable', () => {
    const s = playCard({ ...holding('dash'), player: { ...holding('dash').player, aim: { x: 0, y: 1 } } }, 0);
    expect(s.player.y).toBeCloseTo(4);
    expect(s.player.graceS).toBeGreaterThan(0);
  });
  it('when the draw pile runs out the discard is shuffled back in', () => {
    const s = { ...holding('surge', 0), deck: [], discard: ['rail', 'dash'] };
    const n = playCard(s, 0);
    expect(n.events).toContainEqual({ type: 'shuffled' });
    expect(n.hand[0]).not.toBe('');
  });
  it('a picked reward joins the deck and the next wave starts with every card shuffled back', () => {
    const cleared = step(arena([]), STEP_S, IDLE), card = cleared.offer[0]!;
    const next = pickReward(cleared, card);
    expect(next.wave).toBe(2);
    expect(next.phase).toBe('fight');
    expect([...next.deck, ...next.hand].sort()).toEqual([...STARTING_DECK, card].sort());
    expect(pickReward(cleared, 'not-on-offer')).toBe(cleared);
  });
  it('card text quotes its own words', () => {
    expect(CARDS.scatter!.text).toBe('5 shots in a fan');
  });
});

describe('waves and meta', () => {
  it('after the last wave the list repeats, a lap harder', () => {
    expect(waveDef(WAVES.length + 1)).toEqual({ def: WAVES[0], lap: 1 });
  });
  it('meta keeps the best; a bad save is rejected', () => {
    const s = { ...newGame(1), score: 50, wave: 3 };
    expect(recordRun({ best: 80, bestWave: 2, runs: 1 }, s)).toEqual({ best: 80, bestWave: 3, runs: 2 });
    expect(parseMeta({ best: -1, bestWave: 0, runs: 0 })).toBeNull();
  });
});
