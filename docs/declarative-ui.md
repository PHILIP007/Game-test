# Vocabulary catalog

Every piece of shared vocabulary, where it lives, and one line on how to use it. `src/catalog.test.ts` fails when
this file and the code disagree, so a new word lands here in the same commit as its code. Rows marked PLACEHOLDER
belong to the starter's example game: replace them with your game's words.

Homes:

| Vocabulary | Home |
|---|---|
| Engine elements and properties | `src/decl/` (pure core `css.ts` + Pixi half `engine.ts`) |
| Game CSS properties, custom elements | `src/screens/shared.ts` (the only module calling `defineProp` / `defineElement`) |
| Shared prefabs | `src/screens/shared.kdl`, styled in `src/screens/shared.css` |
| Palette (UI and 3D) | `:root` of `src/screens/shared.css`, read by the shell through `src/tokens.ts` |
| Look numbers (light, camera, exposure) | `--look-*` tokens in the `:root` of `src/screens/shared.css`, read by the shell through `src/view/look.ts` |
| Behaviour words | `REWARDS` in `src/rewards.ts` |
| Content kinds | zod schemas in `src/content.ts`, data in `content/*.kdl` |
| Screens and their stacking | `src/runtime.ts` (import order = draw order) |
| Modelling words | `models/kit.py` (the only module model scripts import) |

## How screens work

A screen is `screens/<name>.kdl` (structure) + `.css` (look) + `.ts` (bindings only), made with `screenUi()` from
`shared.ts`, which prepends the shared prefabs and styles.

KDL: every top-level node is a `prefab "name" { ... }` holding one root element. Attributes on built-in elements:

| Attribute | Meaning |
|---|---|
| `class="a b"` | classes the CSS matches |
| `bind="x"` | the element's text (or sprite texture) comes from binding `x`; a bare string (`text "HI"`) is literal |
| `bind-class="x"` | more classes from binding `x` (space-separated) |
| `tap="x"` | binding `x` is the tap handler; makes the element tappable (`:pressed`, `:hover`) |
| `key=(bind)"x"` | reconcile identity among siblings (lists); `key=` in `use()` bindings keys a whole prefab |
| `slot="x"` | children come from `use(prefab, bindings, { x: [...] })` |
| `if="x"` / `if="!x"` | only when binding `x` is truthy / falsy |
| `name=(bind)"x"` | on a custom element, a bound property (a plain `name=1` is literal) |

The `.ts` renders with `ui.show(use('prefab', bindings, slots))`; every binding a prefab names must be passed. Errors
name the prefab, element and fix.

CSS dialect: `.class`, `type`, `:pressed`/`:hover`, compounds (`.a.b`), descendant chains, selector lists,
`:root { --var }` + `var(--var)`, `max(px, var(--touch-size))`, `@keyframes`, `transition`, `animation`. No child or
sibling combinators, `:not`, `:nth-child` or media queries. Numbers are design px (no unit needed), `%` of the parent,
times in `s` or `ms`, `rotate` in degrees, easings `linear` `ease` `ease-in` `ease-out` `ease-in-out` `cubic-bezier()`
`steps()`. Text properties inherit; `flex-shrink` defaults to 0. `var(--touch-size)` is a finger-sized target.

## CSS properties

Built-ins (engine) and game-defined (`defineProp` in shared.ts).

| Property | Use |
|---|---|
| `display` | `flex` or `none` |
| `position` | `static` or `absolute` (with `left`/`top`) |
| `left` | px or % of the parent, absolute only |
| `top` | px or % of the parent, absolute only |
| `width` | px or % |
| `height` | px or % |
| `padding` | 1-4 values |
| `gap` | px between children |
| `flex-direction` | `column` (default) or `row` |
| `justify-content` | `flex-start` `center` `flex-end` `space-between` |
| `align-items` | `stretch` `flex-start` `center` `flex-end` |
| `flex-grow` | take the remaining space |
| `flex-wrap` | `nowrap` or `wrap` |
| `flex-shrink` | default 0 |
| `flex-basis` | px or % |
| `pointer-events` | `auto` swallows taps (scrims); default `none` lets them through |
| `background-color` | panel fill |
| `border-color` | panel stroke, drawn inside |
| `border-width` | panel stroke width |
| `panel-art` | `"<atlas frame> <slice border>"`: a 9-slice from the texture atlas, tinted by `background-color` (needs an atlas: screenUi's `texture` hook) |
| `image-scale` | sprite scale (default 2: art drawn at 2x) |
| `font-family` | `var(--title-font)` or `var(--body-font)` |
| `font-size` | px |
| `font-color` | text colour |
| `text-align` | `left` `center` `right` |
| `text-wrap` | `wrap` wraps to the box |
| `letter-spacing` | px |
| `line-height` | px |
| `text-stroke-color` | outline colour |
| `text-stroke-width` | outline width |
| `opacity` | 0..1 |
| `scale` | `1.1` or `.9 1.1`, about the box centre |
| `translate` | `x y` px |
| `rotate` | degrees |
| `transition` | `<prop> <dur> [easing] [delay], ...` |
| `animation` | `<name> <dur> [easing] [delay] [count] [alternate] [fill], ...` |
| `tint` | game: multiplies a node's colours; colours `meter` |

## Elements

| Element | Use |
|---|---|
| `panel` | box with children |
| `button` | tappable box with children; base style in shared.css |
| `text` | `bind="x"` or a literal |
| `sprite` | atlas texture (needs an atlas: screenUi's `texture` hook throws until the game has one) |
| `meter` | `meter value=(bind)"fill"`: a fill of `w * value` (0..1), coloured by `tint` |

## Shared prefabs

Build them with the binding builders exported from `screens/shared.ts`.

| Prefab | Use |
|---|---|
| `btn` | `btn(label, tap, state?)`; state `primary` / `off` |

## Palette

UI colours, the scene's colours, and one `--thing-<id>` per thing (a guard test checks every `paint=` is here).

| Token | Use |
|---|---|
| `--ink` | the darkest background, the scene's clear colour and ground bounce |
| `--panel` | button and bar fill |
| `--edge` | button and bar border |
| `--text` | body text |
| `--dim` | secondary text |
| `--accent` | primary UI accent: primary buttons, hover, the score |
| `--scrim` | the dark behind a modal |
| `--pop` | overshoot easing |
| `--title-font` | headings and button labels |
| `--body-font` | body text |
| `--floor` | the field's floor in the scene |
| `--light` | the key and sky light's hue |
| `--thing-orb` | PLACEHOLDER: the orb |
| `--thing-gem` | PLACEHOLDER: the gem |

## Look

`--look-*` tokens in the `:root` of `src/screens/shared.css`, beside the palette; `src/view/look.ts` reads them as `LOOK`
(`--look-camera-dist-u` is `LOOK.CAMERA_DIST_U`). Hues come from the palette; these numbers say how much of them you see.
Plain numbers, the unit the name's last word (`u`, `s`, `deg`, `rad`, `px`); no unit is a strength or 0..1 amount.

| Name | Use |
|---|---|
| `--look-exposure` | tone-mapping exposure, the whole frame |
| `--look-key-light` | key light intensity (`--light`) |
| `--look-key-dir` | `x y z` towards the key light |
| `--look-fill-light` | sky/ground fill intensity |
| `--look-camera-fov-deg` | field of view |
| `--look-camera-dist-u` | camera distance from the field's centre |
| `--look-camera-tilt-rad` | camera tilt off straight down |

## Behaviour words

Under a `thing` node in `content/things.kdl`, one per line.

| Word | Use |
|---|---|
| `points` | PLACEHOLDER `points n`: collecting it scores n points |

## Content kinds

| Kind | Use |
|---|---|
| `thing` | PLACEHOLDER `thing "id" name= r= paint="--token" { reward words }`, in `content/things.kdl` |

## Content helpers

| Helper | Use |
|---|---|
| `loadKdl` | `loadKdl(src, { kind: schema })`: KDL to validated records, errors name node and field |
| `combinators` | `combinators(registry, what)`: a node's children as behaviour/effect words |
| `tunedText` | `tunedText(T)`: `{A.b}` in a string quotes a tuning value  |

## Modelling kit

Words in `models/kit.py` for model scripts (`from kit import *`). Blender +X is forward, +Z up, 1 unit = the collision radius. The rig contract (materials `body` `trim` `glow` `cloth`; clips `idle` `attack` `die`; one `rig` root) is in the header of `models/kit.py`.

| Word | Use |
|---|---|
| `lathe` | `lathe(name, [(r, z), ...], mat, seg)`: a body of revolution around Z |
| `slab` | `slab(name, [(x, y), ...], depth, mat, bevel)`: an outline extruded and bevelled: wings, fins, blades, plates |
| `box` | `box(name, (x, y, z), mat, bevel)`: a bevelled box |
| `ball` | `ball(name, r, mat, seg, rings)`: a UV sphere |
| `cone` | `cone(name, r1, r2, depth, mat, seg)`: along +Z; r2 = r1 is a cylinder, 0 a spike |
| `torus` | `torus(name, R, r, mat)`: a ring in the XY plane |
| `tube` | `tube(name, [(x, y, z), ...], radii, mat, seg)`: a tube swept along points, a radius per point: limbs, branches, roots, pipes, rags |
| `at` | `at(ob, loc, rot_degrees, scale)`: place a shape |
| `aim` | `aim(ob, direction, loc)`: point a shape's +Z along a direction |
| `deform` | `deform(ob, fn)`: move every vertex: taper, bulge, bend |
| `rough` | `rough(ob, amp, freq, seed)`: push vertices along their normals by noise: bark, rot, stone, torn cloth |
| `smooth` | `smooth(ob, levels)`: subdivide (soft chunky forms, and vertices to hold the paint) |
| `shell` | `shell(ob, thickness)`: give an open surface thickness |
| `cut` | `cut(ob, keep)`: delete faces whose centre fails `keep`: open a hood, split plates |
| `fuse` | `fuse(name, *shapes, voxel, keep)`: melt shapes into one organic mesh (voxel remesh, decimated to `keep`): organic lumps, heaped earth |
| `carve` | `carve(ob, *cutters)`: boolean-cut the cutters' volumes out (sockets, hollows); the cutters are deleted |
| `sphere_dirs` | `sphere_dirs(n, zmin)`: evenly spread directions (spikes, crystals) |
| `part` | `part(name, *shapes, pivot, parent)`: merge shapes into one moving rig part |
| `key` | `key(part, clip, [(s, {loc, rot, scale}), ...])`: key a clip relative to rest; one per part per clip |
| `loop` | `loop(part, period, n, steps, phase, loc=, rot=, scale=)`: a sine idle loop |
| `spin` | `spin(part, clip, period, turns, axis)`: a constant spin |
| `still` | `still(part, clips)`: scenery's clips, an imperceptible settle in each (the exporter drops a clip that doesn't move) |
| `burst_apart` | `burst_apart(parts, dur, fling, rise)`: the generic `die`: parts fly out, tumble, shrink |
| `export` | `export(__file__)`: paint the vertices (value only; hue comes from CSS: top light, cavities, baked ambient occlusion against the whole model), check the rig contract and write the .glb |

## Screens

In draw order (later on top). Each is `screens/<name>.kdl` + `.css` + `.ts` (bindings only).

| Screen | Use |
|---|---|
| `title` | PLACEHOLDER: name, score, what's left of the batch, collect and new-game buttons, best score |
