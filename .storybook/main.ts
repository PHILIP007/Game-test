import type { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
  framework: '@storybook/html-vite',
  stories: ['../src/stories/*.stories.ts'],
  core: { disableTelemetry: true },
  addons: ['@storybook/addon-mcp', '@storybook/addon-vitest'],
  viteFinal(config) {
    config.define = { ...config.define, 'import.meta.env.STORYBOOK': true };
    config.build = { ...config.build, target: 'esnext' };
    return config;
  },
};

export default config;
