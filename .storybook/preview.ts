import type { Preview } from '@storybook/html-vite';
import { hold } from '../src/clock';

const preview: Preview = {
  parameters: { layout: 'fullscreen' },
  // A story with a play function runs on stepped game time from before it renders, so no live frame sneaks in.
  beforeEach: ({ playFunction, args }) => (playFunction && args.runInteraction !== false ? hold() : undefined),
};

export default preview;
