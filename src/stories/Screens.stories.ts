// One story per screen and per interesting state. Each sets core state directly, then its play function drives the
// real canvas (taps by label) and asserts on state.
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { cardDef } from '../content';
import { newGame, type Enemy, type GameState } from '../game';
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
/** A fight on wave 3 with one of each enemy on the field and a known hand. */
const midFight = (): GameState => {
  const s = newGame(4);
  return {
    ...s, wave: 3, score: 340, kills: 21, queue: ['crawler', 'crawler'],
    hand: ['scatter', 'rail', 'dash', 'surge'],
    player: { ...s.player, energy: 2.4, hp: 6, aim: { x: 1, y: 0 } },
    enemies: [foe(901, 'crawler', 6, -3), foe(902, 'spitter', -7, -4), foe(903, 'charger', 8, 4, 5), foe(904, 'brute', -6, 4, 18)],
  };
};

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
    await expect(game.getState().run.wave).toBe(1);
  },
};

export const Fight: Story = {
  render: () => stage(() => ({ run: midFight(), ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toContain('WAVE 3');
    await expect(screenText()).toContain('RAIL');
    const before = game.getState().run;
    await press('SCATTER');
    const after = game.getState().run;
    await expect(after.discard.at(-1)).toBe('scatter');
    await expect(after.player.energy).toBeLessThan(before.player.energy);
    await expect(after.shots.filter((b) => typeof b.from === 'object').length).toBeGreaterThan(0);
  },
};

export const CantAfford: Story = {
  render: () => stage(() => {
    const s = midFight();
    return { run: { ...s, player: { ...s.player, energy: 0.2 }, hand: ['rail', 'nova', 'barrier', 'overclock'] }, ui: { screen: 'run' } };
  }),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    const before = game.getState().run.hand;
    await press('NOVA');
    await expect(game.getState().run.hand).toEqual(before);
  },
};

export const Reward: Story = {
  render: () => stage(() => ({ run: { ...midFight(), enemies: [], queue: [], shots: [], phase: 'reward', offer: ['nova', 'barrier', 'overclock'] }, ui: { screen: 'run' } })),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toContain('WAVE 3 CLEARED');
    await press(cardDef('nova').name.toUpperCase());
    const run = game.getState().run;
    await expect(run.wave).toBe(4);
    await expect(run.phase).toBe('fight');
    await expect([...run.deck, ...run.hand, ...run.discard]).toContain('nova');
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

export const LowHull: Story = {
  render: () => stage(() => {
    const s = midFight();
    return { run: { ...s, player: { ...s.player, hp: 1, shieldS: 2, graceS: 2, energy: T.ENERGY_MAX } }, ui: { screen: 'run' } };
  }),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toContain(`1/${T.PLAYER_HP}`);
  },
};
