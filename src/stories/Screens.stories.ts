// One story per screen and per interesting state. Each sets core state directly, then its play function drives the
// real canvas (taps by label) and asserts on state.
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { WEAPONS } from '../content';
import { newGame, sellPrice, type Enemy, type GameState, type Mount } from '../game';
import { T } from '../tuning';
import { advance, game, press, ready, screenText, stage, storyArgs, storyControls, type StoryArgs } from './stage';

export default {
  title: 'Screens',
  args: storyArgs,
  ...storyControls,
} satisfies Meta<StoryArgs>;
type Story = StoryObj<StoryArgs>;

const foe = (id: number, kind: string, x: number, y: number, hp = 3): Enemy =>
  ({ id, kind, x, y, hp, maxHp: hp, mode: 'walk', modeS: 0, v: { x: 0, y: 0 }, timers: {}, spin: 1 });
const mounts = (...weapons: string[]): Mount[] => Array.from({ length: T.MOUNTS }, (_, i) => ({ weapon: weapons[i] ?? '', cooldownS: 0 }));
/** A fight on wave 3 with one of each enemy on the field and three weapons mounted. */
const midFight = (): GameState => {
  const s = newGame(4);
  return {
    ...s, wave: 3, score: 340, points: 90, kills: 21, queue: ['crawler', 'crawler'],
    mounts: mounts('blaster', 'scatter', 'rail'),
    player: { ...s.player, hp: 6, aim: { x: 1, y: 0 } },
    enemies: [foe(901, 'crawler', 6, -3), foe(902, 'spitter', -7, -4), foe(903, 'charger', 8, 4, 5), foe(904, 'brute', -6, 4, 18)],
  };
};
/** The shop after wave 3, with `points` to spend. */
const shop = (points: number, over: Partial<GameState> = {}): GameState =>
  ({ ...midFight(), enemies: [], queue: [], shots: [], phase: 'shop', points, offer: ['nova', 'twin', 'barrier'], ...over });
const firedBy = (s: GameState, w: string) => s.shots.filter((b) => b.from !== 'foe' && b.from.weapon === w).length;

export const Title: Story = {
  render: () => stage(() => {
    game.setState({ meta: { best: 1260, bestWave: 7, runs: 3 } });
    return { run: newGame(1), ui: { screen: 'title' } };
  }, 1000),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toContain('DECKFIRE');
    await expect(screenText()).toContain('BEST 1260  ·  FURTHEST WAVE 7  ·  3 RUNS');
    await press('PLAY');
    await expect(screenText()).toContain('WAVE 1');
    await expect(game.getState().run.mounts[0]!.weapon).toBe('blaster');
  },
};

export const Fight: Story = {
  render: () => stage(() => ({ run: midFight(), ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toEqual(expect.arrayContaining(['WAVE 3', '90 PTS', 'BLASTER', 'SCATTER', 'RAIL', 'EMPTY MOUNT']));
    advance(100);
    // Mount 1 fires by itself; the others wait to be called.
    let s = game.getState().run;
    await expect(firedBy(s, 'blaster')).toBeGreaterThan(0);
    await expect(firedBy(s, 'scatter') + firedBy(s, 'rail')).toBe(0);
    await expect(screenText()).toContain('READY · PRESS 2');
    await press('SCATTER'); // a click on its tile
    s = game.getState().run;
    await expect(firedBy(s, 'scatter')).toBe(5);
    await expect(s.mounts[1]!.cooldownS).toBeGreaterThan(0);
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' })); // its key
    dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit3' }));
    await expect(firedBy(game.getState().run, 'rail')).toBe(1);
  },
};

export const Shop: Story = {
  render: () => stage(() => ({ run: shop(130), ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toEqual(expect.arrayContaining(['WAVE 3 CLEARED', '130 POINTS TO SPEND', 'NOVA', 'TWIN', 'BARRIER', `SELL +${sellPrice('rail')}`]));
    await press('NOVA');
    const run = game.getState().run;
    await expect(run.wave).toBe(4);
    await expect(run.phase).toBe('fight');
    await expect(run.mounts[3]!.weapon).toBe('nova');
    await expect(run.points).toBe(130 - WEAPONS.nova!.price);
  },
};

export const ShopFullMounts: Story = {
  render: () => stage(() => ({ run: shop(200, { mounts: mounts('blaster', 'scatter', 'rail', 'twin') }), ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toContain('NO FREE MOUNT');
    await press('SCATTER'); // sell it to make room
    let run = game.getState().run;
    await expect(run.points).toBe(200 + sellPrice('scatter'));
    await expect(run.mounts[1]!.weapon).toBe('');
    await press('BARRIER');
    run = game.getState().run;
    await expect(run.mounts[1]!.weapon).toBe('barrier');
    await expect(run.wave).toBe(4);
  },
};

export const ShopTooPoor: Story = {
  render: () => stage(() => ({ run: shop(20), ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    const before = game.getState().run;
    await press('NOVA');
    await expect(game.getState().run).toBe(before);
    await press('NEXT WAVE');
    await expect(game.getState().run.wave).toBe(4);
    await expect(game.getState().run.points).toBe(20);
  },
};

export const GameOver: Story = {
  render: () => stage(() => {
    game.setState({ meta: { best: 900, bestWave: 5, runs: 4 } });
    const s = midFight();
    return { run: { ...s, phase: 'dead', player: { ...s.player, hp: 0 }, shots: [] }, ui: { screen: 'run' } };
  }),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toContain('YOU FELL ON WAVE 3');
    await press('AGAIN');
    await expect(game.getState().run.wave).toBe(1);
    await expect(game.getState().run.phase).toBe('fight');
  },
};

export const Paused: Story = {
  render: () => stage(() => ({ run: midFight(), ui: { screen: 'run', paused: true } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    const before = game.getState().run;
    advance(500);
    await expect(game.getState().run).toBe(before); // the clock runs, the fight doesn't
    await press('RESUME');
    advance(100);
    await expect(game.getState().run).not.toBe(before);
  },
};

export const Shielded: Story = {
  render: () => stage(() => {
    const s = midFight();
    const m = mounts('blaster', 'barrier', 'medic', 'barrage');
    m[2] = { weapon: 'medic', cooldownS: 5 }; // mid-cooldown, so the hull still reads 1
    return { run: { ...s, mounts: m, player: { ...s.player, hp: 1, shieldS: 2, graceS: 2 } }, ui: { screen: 'run' } };
  }),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toEqual(expect.arrayContaining([`1/${T.PLAYER_HP}`, 'BARRIER', 'REPAIR DRONE', 'BARRAGE']));
  },
};
