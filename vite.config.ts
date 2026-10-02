import { defineConfig } from 'vite';

// main.ts awaits Pixi at the top level of boot; esnext keeps top-level await and modern syntax as written.
// base './': asset URLs are relative, so the build also runs from a subfolder (itch.io serves games from one).
// assetsInclude: models are binary glTF (models/*.glb, built by `npm run models`), imported as URLs.
export default defineConfig({ base: './', build: { target: 'esnext' }, assetsInclude: ['**/*.glb'] });
