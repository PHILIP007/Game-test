// One story per screen and per interesting state. Each sets core state directly, then its play function drives the
// real canvas (taps by label) and asserts on state. PLACEHOLDER: the starter's one screen.
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { newGame } from '../game';
import { game, press, ready, screenText, stage, storyArgs, storyControls, type StoryArgs } from './stage';

export default {
  title: 'Screens',
  args: storyArgs,
  ...storyControls,
} satisfies Meta<StoryArgs>;
type Story = StoryObj<StoryArgs>;

export const Title: Story = {
  render: () => stage(() => {
    game.setState({ meta: { best: 12, games: 3 } });
    return { run: newGame(1), ui: { screen: 'title' } };
  }, 1000),
  play: async ({ args }) => {
    if (!args.runInteraction) return;
    await ready();
    await expect(screenText()).toContain('MY GAME');
    await expect(screenText()).toContain('BEST 12 OVER 3 GAMES');
    const before = game.getState().run;
    await press('COLLECT');
    const after = game.getState().run;
    await expect(after.things).toHaveLength(before.things.length - 1);
    await expect(after.score).toBeGreaterThan(0);
    await expect(screenText()).toContain(`SCORE ${after.score}`);
    await press('NEW GAME');
    await expect(game.getState().run.score).toBe(0);
    await expect(game.getState().meta.games).toBe(4);
  },
};
