import { describe, expect, it } from 'vitest';
import { ENEMIES, WAVES, WEAPONS } from './content';
import { IDLE, buy, canFire, canSell, cantBuy, fireWeapon, newGame, nextWave, parseMeta, recordRun, sell, sellPrice, step, waveDef, type GameState } from './game';
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
  it('starts on wave 1 with the spit swallowed, the other slots empty, no pennies', () => {
    const s = newGame(3);
    expect(s.wave).toBe(1);
    expect(s.phase).toBe('fight');
    expect(s.mounts.map((m) => m.weapon)).toEqual(['spit', ...Array(T.STOMACH_SLOTS - 1).fill('')]);
    expect(s.points).toBe(0);
    expect(s.queue).toEqual(WAVES[0]!.queue);
  });
});

describe('the fight', () => {
  it('enemies come in from the edge, in the wave\'s order', () => {
    const s = run(newGame(1), WAVES[0]!.gapS + STEP_S);
    expect(s.enemies).toHaveLength(1);
    const e = s.enemies[0]!;
    expect(e.kind).toBe(WAVES[0]!.queue[0]);
    expect(Math.abs(e.x) > T.FLOOR_W_U / 2 - 1 || Math.abs(e.y) > T.FLOOR_H_U / 2 - 1).toBe(true);
  });
  it('the thing in slot 1 fires at the cursor by itself, then waits out its cooldown', () => {
    let s = arena([foe('fly', -8, 6)]);
    s = step(s, STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: 5 } });
    expect(s.shots).toHaveLength(1);
    expect(s.shots[0]!.v.y).toBeGreaterThan(0);
    expect(s.events).toContainEqual({ type: 'fired', from: { weapon: 'spit' } });
    expect(s.mounts[0]!.cooldownS).toBeCloseTo(WEAPONS.spit!.cooldownS);
    s = step(s, STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: 5 } });
    expect(s.shots).toHaveLength(1);
  });
  const armed = () => arena([foe('fly', -8, 6)], { mounts: [{ weapon: 'spit', cooldownS: 0 }, { weapon: 'tooth', cooldownS: 0 }, { weapon: 'chunks', cooldownS: 0 }, { weapon: '', cooldownS: 0 }] });
  it('the other slots never fire by themselves: they wait, ready, to be called', () => {
    const s = run(armed(), 2, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(s.shots.some((b) => b.from !== 'foe' && b.from.weapon !== 'spit')).toBe(false);
    expect(canFire(s, 1)).toBe(true);
    expect(canFire(s, 0)).toBe(false); // slot 1 is automatic
  });
  it('calling a ready thing fires it and starts its own cooldown; called again too soon, nothing happens', () => {
    let s = fireWeapon(step(armed(), STEP_S, IDLE), 1);
    expect(s.events).toEqual([{ type: 'fired', from: { weapon: 'tooth' } }]);
    expect(s.mounts[1]!.cooldownS).toBe(WEAPONS.tooth!.cooldownS);
    expect(fireWeapon(s, 1)).toBe(s);
    s = run(s, WEAPONS.tooth!.cooldownS + STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(canFire(s, 1)).toBe(true);
    expect(fireWeapon(s, 3)).toBe(s); // an empty slot
  });
  it('a called thing can be fired into an empty basement (it\'s your call); the automatic one holds its fire', () => {
    const s = step(arena([], { queue: ['fly'] , spawnS: 9 , mounts: [{ weapon: 'spit', cooldownS: 0 }, { weapon: 'burp', cooldownS: 0 }, { weapon: '', cooldownS: 0 }, { weapon: '', cooldownS: 0 }] }), STEP_S, IDLE);
    expect(s.events.some((e) => e.type === 'fired')).toBe(false);
    expect(fireWeapon(s, 1).shots.length).toBeGreaterThan(0);
  });
  it('the kid moves, and the walls stop it', () => {
    const s = run(newGame(1), 10, { move: { x: 1, y: 0 }, aim: { x: 0, y: 0 } });
    expect(s.player.x).toBeCloseTo(T.FLOOR_W_U / 2 - T.PLAYER_R_U);
  });
  it('a fly walks at the kid and hurts on contact, then the kid is briefly untouchable', () => {
    let s = arena([foe('fly', 3, 0)]);
    s = run(s, 1, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } }); // aim away so the spit misses
    expect(s.player.hp).toBe(T.PLAYER_HP - ENEMIES.fly!.touch);
    expect(s.player.graceS).toBeGreaterThan(0);
  });
  it('shots kill, and kills pay pennies (which count towards the score)', () => {
    let s = arena([foe('fly', 4, 0, { hp: 1 }), foe('fly', -8, 6, { id: 901 })]);
    s = run(s, 0.5, { move: { x: 0, y: 0 }, aim: { x: 4, y: 0 } });
    expect(s.kills).toBe(1);
    expect(s.points).toBe(10);
    expect(s.score).toBe(10);
  });
  it('a squealer winds up, then lunges', () => {
    let s = arena([foe('squealer', 8, 0, { timers: { lunge: 0.01 } })]);
    s = step(s, STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(s.enemies[0]!.mode).toBe('windup');
    expect(s.events).toContainEqual({ type: 'windup', id: 900 });
    s = run(s, T.LUNGE_WINDUP_S + STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(s.enemies[0]!.mode).toBe('lunge');
  });
  it('a weeper shoots at the kid', () => {
    let s = arena([foe('weeper', 6, 0, { timers: { shoot: 0.01 } })]);
    s = step(s, STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(s.shots.filter((b) => b.from === 'foe')).toHaveLength(1);
  });
  it('a glutton sprays a ring', () => {
    let s = arena([foe('glutton', 6, 0, { timers: { spray: 0.01 } })]);
    s = step(s, STEP_S, { move: { x: 0, y: 0 }, aim: { x: 0, y: -5 } });
    expect(s.shots.filter((b) => b.from === 'foe').length).toBeGreaterThan(5);
  });
  it('a cleared wave opens the shop with priced weapons; dying ends the run', () => {
    const cleared = step(arena([]), STEP_S, IDLE);
    expect(cleared.phase).toBe('shop');
    expect(cleared.offer).toHaveLength(T.OFFER_SIZE);
    expect(cleared.offer.every((w) => WEAPONS[w]!.price > 0)).toBe(true);
    const dead = step(arena([foe('fly', 0.2, 0)], { player: { ...newGame(1).player, hp: 1 } }), STEP_S, IDLE);
    expect(dead.phase).toBe('dead');
    expect(dead.events.at(-1)).toEqual({ type: 'died' });
    expect(step(dead, STEP_S, IDLE)).toBe(dead);
  });
});

describe('the shop', () => {
  const shop = (over: Partial<GameState> = {}): GameState => ({ ...step(arena([]), STEP_S, IDLE), offer: ['chunks', 'tooth', 'burp'], ...over });
  it('swallowing spends pennies, puts the thing in the first free slot, and starts the next wave', () => {
    const s = shop({ points: 100 }), next = buy(s, 'tooth');
    expect(next.points).toBe(100 - WEAPONS.tooth!.price);
    expect(next.mounts[1]!.weapon).toBe('tooth');
    expect(next.wave).toBe(2);
    expect(next.phase).toBe('fight');
    expect(next.events).toEqual([{ type: 'bought', weapon: 'tooth', mount: 1 }]);
  });
  it('without the pennies, without a free slot, or off the offer, it is a no-op (same reference)', () => {
    const poor = shop({ points: 10 });
    expect(cantBuy(poor, 'tooth')).toBe('points');
    expect(buy(poor, 'tooth')).toBe(poor);
    const full = shop({ points: 999, mounts: Array.from({ length: T.STOMACH_SLOTS }, () => ({ weapon: 'spit', cooldownS: 0 })) });
    expect(cantBuy(full, 'tooth')).toBe('mounts');
    expect(buy(full, 'tooth')).toBe(full);
    expect(buy(shop({ points: 999 }), 'puke')).toEqual(shop({ points: 999 }));
  });
  it('coughing one up pays back part of the price and frees the slot; the shop stays open', () => {
    const s = shop({ points: 0, mounts: [{ weapon: 'spit', cooldownS: 0 }, { weapon: 'burp', cooldownS: 0 }, { weapon: '', cooldownS: 0 }, { weapon: '', cooldownS: 0 }] });
    const n = sell(s, 1);
    expect(n.points).toBe(sellPrice('burp'));
    expect(sellPrice('burp')).toBe(Math.floor(WEAPONS.burp!.price * T.SELL_BACK));
    expect(n.mounts[1]!.weapon).toBe('');
    expect(n.phase).toBe('shop');
  });
  it('the last thing in your stomach can\'t be coughed up', () => {
    const s = shop();
    expect(canSell(s, 0)).toBe(false);
    expect(sell(s, 0)).toBe(s);
  });
  it('moving on keeps your pennies', () => {
    const n = nextWave(shop({ points: 70 }));
    expect(n.wave).toBe(2);
    expect(n.points).toBe(70);
  });
  it("a weapon's text quotes its own words and cooldown", () => {
    expect(WEAPONS.chunks!.text).toBe('5 chunky gobs in a fan');
    expect(WEAPONS.bubble!.text).toBe('Untouchable for 2s, every 9s');
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
