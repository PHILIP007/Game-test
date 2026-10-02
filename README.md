# Gob

A top-down shooter for the web: a lost child's nightmare. The look borrows its lighting from Limbo (black paper-cutout
silhouettes in grey fog, light pouring through the bars of a giant crib, film grain, a heavy vignette, blurred shapes in
front of the lens) and its creature feel from The Binding of Isaac (chunky, big-headed, big-eyed things that are cute
and gross at once), with every design original. The world is greyscale: the only colours are the child's warm glow and
the sickly red of danger. The child, in a nightshirt and nightcap with a night-light at their side, spits at the
things in the dark: fuzzy mothlings, the one-eyed goggler, the grinning gnasher and the many-eyed sackmaw.

You can have up to four things swallowed, each on its own cooldown. Whatever's in slot 1 (spit, to start) spits at
the cursor by itself; the others charge up and wait for you to call them: a loose tooth that goes through a whole
line of them, a big burp all round you, projectile puke, a spit bubble, licking your wounds. Things drop pennies;
after each wave the shop offers three things to swallow, and you can cough up what you've got for half its price.

**Controls:** WASD or arrows to move, the mouse aims, 2 3 4 (or a click on the tile) uses whatever's ready in that
slot, Esc pauses.

Built on the game-bible (`.claude/skills/game-bible`): TypeScript, Vite, Three for the basement (toon-shaded), Pixi with a
declarative KDL/CSS dialect for the UI, zod-checked KDL content, a pure core with a seeded RNG, Storybook stories as
tests.

## Where to change things

| Change | Home |
|---|---|
| Something to swallow: price, cooldown, what comes out, its text | `content/weapons.kdl` |
| An enemy: health, size, body, how it moves and attacks, the pennies it drops | `content/enemies.kdl` |
| What each wave sends, in what order, how fast | `content/waves.kdl` |
| A number a rule reads (speeds, stomach slots, how many spit by themselves, offer size, cough-up price) | `src/tuning.ts` |
| Any colour, the camera, the bulb, the vignette, the gore and wobble | `src/screens/shared.css` (`:root`) |
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

- The rules, pure: `src/game.ts` (a run: waves, the fight's step, the stomach slots, the shop, meta), `src/world.ts`
  (the run's shape, geometry, firing), `src/weapons.ts`, `src/enemies.ts`, `src/rewards.ts` (behaviour words), `src/content.ts`
  (the content kinds), `src/tuning.ts`. Tests: `src/game.test.ts`; balance: `npm run sim`.
- The shell: `src/store.ts`, `src/actions.ts`, `src/input.ts`, `src/runtime.ts`, `src/view/scene.ts` (the basement in
  Three), `src/screens/` (title, hud, shop, over, pause).
- Foundation from the game-bible starter (keep; change only with a catalog row and a test): `src/decl/`,
  `src/content-load.ts`, `src/clock.ts`, `src/rng.ts`, `src/tokens.ts`, `src/view/look.ts`, `src/stage.ts`, the
  guard tests, `src/stories/stage.ts`, `.storybook/`, `scripts/`, `models/kit.py`.

There are no Blender models yet: the kid and the enemies are built from squashed spheres in `src/view/scene.ts`,
picked by `shape=` in `content/enemies.kdl`. The first
`models/<name>.py` imports `kit` and follows the rig contract in its header.
