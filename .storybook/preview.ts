import type { Preview } from '@storybook/html-vite';
import { hold } from '../src/clock';
import '../src/fonts/fonts.css';

const preview: Preview = {
  // Stories draw text with the game's font: wait for it before a story renders (as main.ts does live).
  loaders: [() => document.fonts.load('16px "Gochi Hand"').catch(() => [])],
  parameters: { layout: 'fullscreen' },
  // A story with a play function runs on stepped game time from before it renders, so no live frame sneaks in.
  beforeEach: ({ playFunction, args }) => (playFunction && args.runInteraction !== false ? hold() : undefined),
};

export default preview;
