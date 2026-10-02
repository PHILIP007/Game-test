# Deckfire

A top-down arena shooter for the web. Waves of enemies pour in from the arena's edge. You carry up to four mounted
weapons, each on its own cooldown. The one in mount 1 fires at the cursor by itself; the others charge up and wait
for you to call them, so when you spend a slow rail, a nova ring or a barrier is up to you. Kills pay points; after
each wave the shop offers three weapons to buy one of, and buys back the ones you carry for half their price.

**Controls:** WASD or arrows to move, the mouse aims, 2 3 4 (or a click on the tile) fires a ready weapon in that
mount, Esc pauses.

Enemies: the **crawler** swarms you, the **spitter** circles at range and shoots, the **charger** stops, shakes and
lunges, and the **brute** is a slow, huge sponge that sprays rings of shots.

Built on the game-bible (`.claude/skills/game-bible`): TypeScript, Vite, Three for the arena, Pixi with a
declarative KDL/CSS dialect for the UI, zod-checked KDL content, a pure core with a seeded RNG, Storybook stories as
tests.

## Where to change things

| Change | Home |
|---|---|
| A weapon: price, cooldown, what it fires, its text | `content/weapons.kdl` |
| An enemy: health, size, how it moves and attacks, the points it pays | `content/enemies.kdl` |
| What each wave sends, in what order, how fast | `content/waves.kdl` |
| A number a rule reads (speeds, mounts, how many fire by themselves, offer size, sell-back) | `src/tuning.ts` |
| Any colour, the camera, the light, the juice | `src/screens/shared.css` (`:root`) |
| A screen's layout and look | `src/screens/<screen>.kdl` and `.css` |
| The words weapons, enemies and drops can use | `src/weapons.ts`, `src/enemies.ts`, `src/rewards.ts` |

Every word, token, prefab and screen is listed in `docs/declarative-ui.md`; a test fails when it and the code disagree.

## Start

```sh
npm install
npx playwright install chromium   # once per machine, for the story tests
npm run dev
```

## Deploy

`.github/workflows/pages.yml` runs the unit tests, builds, and publishes `dist/` to GitHub Pages on every push to the
default branch (or by hand: Actions > Deploy to GitHub Pages > Run workflow). One-time setup: Settings > Pages >
Source: **GitHub Actions**. The game is then at `https://<owner>.github.io/<repo>/`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | the game, live, with hot reload of screens' KDL and CSS |
| `npm run storybook` | stories at http://localhost:6006 (MCP at `/mcp` for agents) |
| `npm test` | unit tests: core, engine, content, guards, catalog drift |
| `npm run test:stories` | every story's `play`, in headless Chromium |
| `npm run typecheck` | `tsc` |
| `npm run build` | typecheck and build to `dist/` |
| `npm run sim` | play whole games headless on the pure core |
| `npm run shots -- <url> <out.png>` | a headless screenshot |
| `npm run models [-- name]` | build `models/<name>.py` to `.glb` with headless Blender (`BLENDER` overrides the binary) |

## What's here

- The rules, pure: `src/game.ts` (a run: waves, the fight's step, mounted weapons, the shop, meta), `src/world.ts`
  (the run's shape, geometry, firing), `src/weapons.ts`, `src/enemies.ts`, `src/rewards.ts` (behaviour words), `src/content.ts`
  (the content kinds), `src/tuning.ts`. Tests: `src/game.test.ts`; balance: `npm run sim`.
- The shell: `src/store.ts`, `src/actions.ts`, `src/input.ts`, `src/runtime.ts`, `src/view/scene.ts` (the arena in
  Three), `src/screens/` (title, hud, shop, over, pause).
- Foundation from the game-bible starter (keep; change only with a catalog row and a test): `src/decl/`,
  `src/content-load.ts`, `src/clock.ts`, `src/rng.ts`, `src/tokens.ts`, `src/view/look.ts`, `src/stage.ts`, the
  guard tests, `src/stories/stage.ts`, `.storybook/`, `scripts/`, `models/kit.py`.

There are no Blender models yet: enemies are primitive meshes picked by `shape=` in `content/enemies.kdl`. The first
`models/<name>.py` imports `kit` and follows the rig contract in its header.
