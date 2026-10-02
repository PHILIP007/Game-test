# Verification: stories, the game clock, determinism

- Every screen and every interesting state has a **story**. A story sets up core state directly (a setup function returning `GameState`), rather than replaying from the title screen.
- `play` functions drive the real canvas: tap design-space coordinates, find buttons by label, then assert on state. They never call a game action in place of a tap.
- Stories are tests: `@storybook/addon-vitest` runs every `play` in headless Chromium. Agents preview and run them through the Storybook MCP (`@storybook/addon-mcp`, served at `http://localhost:6006/mcp` while Storybook runs).
- Stories are **deterministic**. Animation time comes from a clock the shell owns, which tests can fast-forward, so a story never waits out real animations. A story that passes alone but fails under a parallel run is a bug to fix, not to retry. The shape that works (the starter's `src/clock.ts`):
  - Everything time-based subscribes with `onTick(dt => busy)`, returning true while something that moves a tap target or an asserted bound is still in motion (tweens, delays, springs including their velocity, finite keyframes). Idle loops (bob, blink, infinite keyframes) never count, or `settle()` never returns.
  - Live, the renderer's ticker steps the clock. A story holds it from before render (a project `beforeEach` when the story has a `play`), rewinds its origin when the story's state starts, and the driver ends every input with `settle()` (fixed 1/60 s steps until nothing is busy) or `advance(ms)` for a finger mid-drag.
  - `settle()` ends with a synchronous render: Pixi v8 hit-tests against the transforms of the last *render*, so a tap sent before one lands on stale positions. That, not timing, was most of the "flakes".
  - Browser-owned CSS transitions (DOM dialogs) aren't on the game clock; the driver finishes them (`document.getAnimations()`) in its settle.
- Look work (models, lighting, effects) is judged on real pixels: screenshots of the same stories before and after, looked at side by side.
