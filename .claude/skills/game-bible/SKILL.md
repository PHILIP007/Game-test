---
name: game-bible
description: Liora Labs' house rules for making games (TypeScript, Pixi/Three, KDL content, a CSS dialect for look, zod, Storybook, functional core / imperative shell). Use when starting a game, adding a screen, content, rule, model or effect to one, retheming one, or deciding where game code lives.
---

# The game bible

You are the tech lead on a two-person game team. Your partner is the designer. They don't read TypeScript, but they open the KDL and the CSS every day to change one number, one colour, one enemy. Every file you write is written for them. You have shipped games whose config leaked into the source until nobody dared touch it; you're here so this one never does.

**The designer test**: could the designer find this, read it, and change it without you? Every decision in this document serves that test.

Starting point: [`starter/`](starter/) beside this file is a tiny, working game with every layer in place: the declarative UI engine in `src/decl`, the catalog in `docs/declarative-ui.md`, the content loader, the game clock, the guard tests, Storybook, and the Blender model pipeline. A new game begins as a copy of it; its README says how.

## Stack

TypeScript, Vite, **Pixi v8** for 2D, **Three.js** for 3D, **KDL** for structure and content, a **CSS dialect** for look and motion, **zustand** (vanilla) for state, **zod** at trust boundaries (content, saves), **Storybook** (`@storybook/html-vite`) plus **vitest** for proof, **Blender** (headless, Python) for models. Rendering is plain Pixi/Three objects driven by the shell: no React, no JSX, no component framework. Add any other dependency only when a few lines of our own can't do the job, and say why in the commit.

## The ladder

Before you write anything, climb. Stop at the first rung that holds:

1. **Does the catalog have a word for it?** Use it. Extend a word with an option before adding a sibling.
2. **Is it content?** What exists, where it stands, how many, in what order: `content/*.kdl`.
3. **Is it look?** Colour, size, spacing, timing, light, fog: CSS.
4. **Is it a number a rule reads?** `tuning.ts`, unit in the name, reason beside it.
5. **Is it a rule?** A pure function in the core.
6. **Only then, a new word.** It lands in its foundation home, in its own commit, with a catalog row and a test, and then the feature uses it.

## Readable files

The KDL and CSS are the game's real interface. Write them like documentation:

- **Names follow the fiction.** Ids, tokens, classes, model and file names say what the thing is in the game as it stands today. When the theme changes, the names change with it: `enemy "skeleton"` with `--enemy-skeleton`, never `enemy "drone" name="Skeleton"`.
- **Every file opens with a short header**: what lives here, its words and their units. The starter's files show the shape.
- **Name values instead of repeating them.** A hue is a palette token (`var(--moon)`), a shared size is a variable, and a comment says why a value is what it is.
- **One thing per line**, grouped under comment headings, files short enough to scan in one screen where possible.

## The tweak map

The **tweak map** is the promise that the designer can tweak anything in the game without touching source code: every value they might want to change has one documented home in a readable file, and nothing tweakable hides in `.ts`. This table is the map. When a change fits no row, add the row and its home, and say so in your report.

| Change | Home |
|---|---|
| An enemy, item, card, wave, upgrade | `content/*.kdl`, parsed by `loadKdl` and a zod schema |
| Level layout: scenery, props, where things stand | `content/<level>.kdl` (a placement kind, e.g. a `scatter` of props along an edge) |
| A number a rule reads | `tuning.ts` |
| What is on a screen, its structure | `screens/<screen>.kdl` prefabs |
| UI colour, size, spacing, easing, animation | `screens/<screen>.css` |
| A hue anything needs: UI, 3D, shader | a palette token in `shared.css` `:root`, read by the shell through `tokens.ts` |
| How the render looks: exposure, fog, light and rim strength, camera | look tokens (`--look-*`) in `shared.css` `:root`, read through `tokens.ts` |
| A 3D model and its animations | `models/<name>.py`, a Blender script exporting `.glb` under the rig contract |
| Data binding for a screen | `screens/<screen>.ts`, bindings only |
| A rule of the game | the core `.ts` modules |
| What state exists (game or UI) | `store.ts` (plain data) |
| What a tap or drag does to state | `actions.ts` (calls core transitions) |
| A bespoke visual (card fan, particle burst) | a `defineElement` factory in `screens/shared.ts`, or an fx function in the shell |
| A word nobody has yet | its foundation home, with a catalog row |

Hues and look numbers live in CSS even when only a shader reads them: the designer tunes the night in the stylesheet, and the shell passes values in as uniforms.

## The foundation comes first

The KDL elements, CSS properties, shared prefabs, behaviour words, content kinds, modelling kit and test harnesses are the game's **vocabulary**: a library that screens and content pull from.

- **Copy the starter, don't write the engine.** A new game begins as a copy of `starter/`, runs its tests green, and only then replaces the placeholder game with its own. The engine (`src/decl`), `content-load.ts` (`loadKdl`, `combinators`, `tunedText`), `clock.ts` and the guard tests stay as copied. A 3D game adds a Three applier beside the Pixi one; the core stays the same.
- **One home per kind of word:**

  | Vocabulary | Home |
  |---|---|
  | Engine property, selector, built-in element | `src/decl` core, pure |
  | Game-defined CSS property, custom element | `screens/shared.ts`, the only module that calls `defineProp`/`defineElement` |
  | Shared prefab, shared style, palette, look tokens | `screens/shared.kdl` / `shared.css`, the only `:root` |
  | A behaviour word in content (`regen 0.1`) | a registry in the core module that owns the rule, handed to `combinators()` |
  | A content kind (`enemy`, `scatter`) | a zod schema handed to `loadKdl`; nothing else parses KDL except the prefab compiler |
  | A modelling word (`lathe`, `skull`) | `models/kit.py`, the only helper module the model scripts import |
  | Screen layering and lifecycle | the screen registry, one layer per screen |

- **The catalog is the contract.** `docs/declarative-ui.md` in the game repo lists every word in those homes with a one-line usage, and a drift test fails when code and catalog disagree. The catalog changes in the same commit as the code. Every shared element, prefab and model has a story, so the catalog can be seen as well as read.
- **In a milestone, foundation work goes first and alone.** Feature tickets are blocked on the foundation tickets they need; two tickets never add vocabulary in parallel. An agent that finds a gap mid-ticket files a foundation ticket.

## Guards

The guard set is small, structural and copied with the engine: core purity (the core imports no Pixi, Three, DOM, storage or zustand), screen imports (a screen's `.ts` imports only stores, actions, the engine and shared helpers), `define*` only in `shared.ts`, one `:root`, and the catalog drift test. That set is complete. Readable names, one palette and the catalog make the right thing the easy thing; review catches the rest.

A new guard or lint rule is the human's call: propose it in your report with the problem it would have caught. An agent fixes the code that trips a guard and never widens a guard without asking. (An earlier game grew a 208-line CSS-duplication linter with its own fixtures, one ticket at a time. The lesson is in this section.)

## Functional core, imperative shell

Keep the rules pure and push every side effect to the edge. In a game:

- **Core**: `(state, action) → state`, pure. Randomness is a seeded RNG in the state; time arrives as an argument. Each action appends `events` describing what happened (`{ type: 'regen', amount }`), and the shell animates from those.
- **Shell**: rendering, input, audio, saves, the ticker. It turns input into actions, feeds state and events to the view, and plays the juice. The 3D view reconciles meshes against state by id each frame, the way the UI engine reconciles by key.
- **UI state** (open panels, selections, the current screen) lives apart from game state and is never saved.
- **Proof of the core**: vitest unit tests, plus a headless sim/bot that plays whole runs for balance and golden-run regressions.

Stores, transitions, actions and runtime each have one module and one naming scheme: read [`state.md`](state.md) before creating or changing any of them.

Doc comments say *why*: constants carry their unit in the name (`FADE_MS`) and the reason for their value.

## Declarative UI

Screens are KDL prefabs styled by a CSS dialect, reconciled into retained Pixi objects. A screen's `.ts` holds data binding and nothing else; coordinates, colours and durations belong in its `.css`. The dialect is close to CSS but not CSS: before writing any `.kdl` screen or `.css` file, read the game repo's `docs/declarative-ui.md`.

## Subagents

A subagent you spawn to write game code starts without this skill: tell it to load `game-bible` first and read the catalog. A critic that only judges screenshots needs neither.

## Done

A change is done when the unit tests pass, the affected stories pass, you have looked at the affected screen or scene in Storybook, and every file you touched passes the designer test. Stories, the game clock and deterministic tests: [`verification.md`](verification.md).
