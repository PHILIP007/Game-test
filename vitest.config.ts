// Two test projects: `unit` (the pure core, in node) and `storybook` (every story's play function, in headless Chromium).
// A story tagged 'skip' is reported as skipped: behaviour awaiting a decision ticket, kept until it's confirmed deleted.
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  assetsInclude: ['**/*.glb'], // models/*.glb: a rig-contract test can read them ?inline
  test: {
    projects: [
      // css.include: vitest otherwise replaces .css imports (even ?raw) with empty strings, and the screens' sheets are data here.
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'], css: { include: [/.+/] } } },
      {
        extends: true,
        plugins: [storybookTest({ configDir: '.storybook', tags: { skip: ['skip'] } })],
        test: { name: 'storybook', testTimeout: 60_000, browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] } },
      },
    ],
  },
});
