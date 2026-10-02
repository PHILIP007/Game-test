# Starter

The game-bible foundation as a project you copy on day one: the declarative UI engine, the content loader, the game
clock, the seeded RNG, the guard tests, the Storybook harness, the Blender model kit, and a tiny placeholder game
that uses every layer once so the patterns are there to copy.

## Start a game

```sh
cp -r <skill dir>/starter my-game && cd my-game && npm install
npx playwright install chromium   # once per machine, for the story tests
git init && git add -A && git commit -m "Start from the game-bible starter"
```

Then rename `"name"` in `package.json`, `META_KEY` in `src/store.ts` and the `<title>` in `index.html`.

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

Foundation (keep; change only with a catalog row and a test):

- `src/decl/`: the declarative UI engine (`css.ts` pure, `engine.ts` Pixi) and its tests
- `src/content-load.ts`: `loadKdl`, `combinators`, `tunedText`
- `src/clock.ts`, `src/rng.ts`, `src/tokens.ts`, `src/view/look.ts`, `src/stage.ts`
- guards: `src/core-purity.test.ts`, `src/screens/screen-imports.test.ts`, `src/screens/guards.test.ts`,
  `src/catalog.test.ts` (keep `CORE` in the first two in step as core modules come and go)
- `src/stories/stage.ts` (the story harness and tap driver), `.storybook/`
- `scripts/`, `models/kit.py`, configs

Placeholders (replace with your game):

| File | The placeholder |
|---|---|
| `src/game.ts`, `src/game.test.ts` | the rules: collect a thing, score its reward words, a fresh batch when the field is empty; the saved meta |
| `src/rewards.ts` | one behaviour word, `points n` |
| `src/tuning.ts` | the field size and batch size |
| `src/content.ts`, `content/things.kdl` | one content kind, `thing` |
| `src/store.ts`, `src/actions.ts`, `src/runtime.ts` | keep the shape, change the state and the actions |
| `src/view/scene.ts` | a Three scene with a sphere per thing, reconciled by id |
| `src/screens/title.*` | the one screen |
| `src/screens/shared.*` | the palette, look tokens, one prefab (`btn`), one element (`meter`), one property (`tint`) |
| `src/stories/Screens.stories.ts` | one story with a `play` |
| `scripts/sim.ts` | a bot that always collects the first thing |
| `docs/declarative-ui.md` | the catalog: engine rows stay, rows marked PLACEHOLDER go when their code does |

There are no model scripts yet: the first `models/<name>.py` imports `kit` and follows the rig contract in its
header. When the game loads models, add a loader and a test that checks every committed `.glb` against that contract.
