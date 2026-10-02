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
const mounts = (...weapons: string[]): Mount[] => Array.from({ length: T.STOMACH_SLOTS }, (_, i) => ({ weapon: weapons[i] ?? '', cooldownS: 0 }));
/** A fight on wave 3 with one of each enemy on the field and three weapons mounted. */
const midFight = (): GameState => {
  const s = newGame(4);
  return {
    ...s, wave: 3, score: 340, points: 90, kills: 21, queue: ['fly', 'fly'],
    mounts: mounts('spit', 'chunks', 'tooth'),
    player: { ...s.player, hp: 6, aim: { x: 1, y: 0 } },
    enemies: [foe(901, 'fly', 6, -3), foe(902, 'weeper', -7, -4), foe(903, 'squealer', 8, 4, 5), foe(904, 'glutton', -6, 4, 18)],
  };
};
/** The shop after wave 3, with `points` to spend. */
const shop = (points: number, over: Partial<GameState> = {}): GameState =>
  ({ ...midFight(), enemies: [], queue: [], shots: [], phase: 'shop', points, offer: ['burp', 'slobber', 'bubble'], ...over });
const firedBy = (s: GameState, w: string) => s.shots.filter((b) => b.from !== 'foe' && b.from.weapon === w).length;

export const Title: Story = {
  render: () => stage(() => {
    game.setState({ meta: { best: 1260, bestWave: 7, runs: 3 } });
    return { run: newGame(1), ui: { screen: 'title' } };
  }, 1000),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toContain('GOB');
    await expect(screenText()).toContain('BEST 1260  ·  FURTHEST WAVE 7  ·  3 RUNS');
    await press('PLAY');
    await expect(screenText()).toContain('WAVE 1');
    await expect(game.getState().run.mounts[0]!.weapon).toBe('spit');
  },
};

export const Fight: Story = {
  render: () => stage(() => ({ run: midFight(), ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toEqual(expect.arrayContaining(['WAVE 3', '90¢', 'SPIT', 'CHUNKS', 'LOOSE TOOTH', 'NOTHING SWALLOWED']));
    advance(100);
    // Mount 1 fires by itself; the others wait to be called.
    let s = game.getState().run;
    await expect(firedBy(s, 'spit')).toBeGreaterThan(0);
    await expect(firedBy(s, 'chunks') + firedBy(s, 'tooth')).toBe(0);
    await expect(screenText()).toContain('READY · PRESS 2');
    await press('CHUNKS'); // a click on its tile
    s = game.getState().run;
    await expect(firedBy(s, 'chunks')).toBe(5);
    await expect(s.mounts[1]!.cooldownS).toBeGreaterThan(0);
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' })); // its key
    dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit3' }));
    await expect(firedBy(game.getState().run, 'tooth')).toBe(1);
  },
};

export const Shop: Story = {
  render: () => stage(() => ({ run: shop(130), ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toEqual(expect.arrayContaining(['WAVE 3 SURVIVED', '130¢ TO SPEND', 'BIG BURP', 'SLOBBER', 'SPIT BUBBLE', `COUGH UP +${sellPrice('tooth')}¢`]));
    await press('BIG BURP');
    const run = game.getState().run;
    await expect(run.wave).toBe(4);
    await expect(run.phase).toBe('fight');
    await expect(run.mounts[3]!.weapon).toBe('burp');
    await expect(run.points).toBe(130 - WEAPONS.burp!.price);
  },
};

export const ShopFullMounts: Story = {
  render: () => stage(() => ({ run: shop(200, { mounts: mounts('spit', 'chunks', 'tooth', 'slobber') }), ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toContain('STOMACH FULL');
    await press('CHUNKS'); // sell it to make room
    let run = game.getState().run;
    await expect(run.points).toBe(200 + sellPrice('chunks'));
    await expect(run.mounts[1]!.weapon).toBe('');
    await press('SPIT BUBBLE');
    run = game.getState().run;
    await expect(run.mounts[1]!.weapon).toBe('bubble');
    await expect(run.wave).toBe(4);
  },
};

export const ShopTooPoor: Story = {
  render: () => stage(() => ({ run: shop(20), ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    const before = game.getState().run;
    await press('BIG BURP');
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
    await expect(screenText()).toContain('THE BASEMENT GOT YOU ON WAVE 3');
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
    const m = mounts('spit', 'bubble', 'lick', 'puke');
    m[2] = { weapon: 'lick', cooldownS: 5 }; // mid-cooldown, so the hull still reads 1
    return { run: { ...s, mounts: m, player: { ...s.player, hp: 1, shieldS: 2, graceS: 2 } }, ui: { screen: 'run' } };
  }),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toEqual(expect.arrayContaining(['SPIT BUBBLE', 'LICK WOUNDS', 'PROJECTILE PUKE']));
    await expect(game.getState().run.player.hp).toBe(1); // one heart left, the bubble up
  },
};
