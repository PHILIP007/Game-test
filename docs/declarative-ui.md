# Vocabulary catalog

Every piece of shared vocabulary, where it lives, and one line on how to use it. `src/catalog.test.ts` fails when
this file and the code disagree, so a new word lands here in the same commit as its code.

Homes:

| Vocabulary | Home |
|---|---|
| Engine elements and properties | `src/decl/` (pure core `css.ts` + Pixi half `engine.ts`) |
| Game CSS properties, custom elements | `src/screens/shared.ts` (the only module calling `defineProp` / `defineElement`) |
| Shared prefabs | `src/screens/shared.kdl`, styled in `src/screens/shared.css` |
| Palette (UI and 3D) | `:root` of `src/screens/shared.css`, read by the shell through `src/tokens.ts` |
| Look numbers (light, camera, exposure) | `--look-*` tokens in the `:root` of `src/screens/shared.css`, read by the shell through `src/view/look.ts` |
| Behaviour words | weapon words: `EFFECTS` in `src/weapons.ts`; enemy words: `BEHAVIOURS` in `src/enemies.ts`; drop words: `REWARDS` in `src/rewards.ts` |
| Content kinds | zod schemas in `src/content.ts`, data in `content/*.kdl` |
| Weapon kinds, enemy shapes | `WEAPON_KINDS`, `SHAPES` in `src/content.ts` |
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
| `hearts` | `hearts value=(bind)"hp" max=(bind)"max"`: `max` hearts across the box, the first `value` full, the rest hollow; coloured by `tint` |

## Shared prefabs

Build them with the binding builders exported from `screens/shared.ts`.

| Prefab | Use |
|---|---|
| `btn` | `btn(label, tap, state?)`; state `primary` / `off` |
| `weapon` | `weapon(id, tap, { key, tag, charge, foot, off?, ready? })`: a weapon tile from `content/weapons.kdl`; `charge` fills its cooldown bar; its kind, `off` and `ready` are classes; no tap (the automatic slot), not pressable |
| `slot-empty` | `emptySlot(key)`: an empty stomach slot, the size of a weapon tile |
| `line` | `line(text)`: a line of text in a dialog's body |
| `dialog` | `dialog(title, sub, body, buttons, layout?)`: over the dimmed basement, swallows taps; `layout` `column` (lines) or `row` (tiles) |

## Palette

UI colours, the basement's colours, one `--weapon-<id>` per weapon and one `--enemy-<id>` per enemy (a guard test
checks every `paint=` is here and named after its weapon or enemy).

| Token | Use |
|---|---|
| `--ink` | the darkest background, the basement's clear colour and bounce light, a cooldown bar's track |
| `--panel` | button, tile and bar fill |
| `--panel-ready` | a called slot's tile when it can be used |
| `--edge` | button and empty-slot border |
| `--text` | body text |
| `--dim` | secondary text |
| `--accent` | primary UI accent: primary buttons, hover, the wave, dialog titles, the title |
| `--scrim` | the dark behind a dialog and the title |
| `--heart` | the hearts |
| `--penny` | pennies: the HUD's count, the shop's, prices |
| `--pop` | overshoot easing |
| `--title-font` | headings, numbers and button labels (Gochi Hand, bundled in `src/fonts`) |
| `--body-font` | body text |
| `--kind-attack` | an attack's tile frame and cooldown bar |
| `--kind-defend` | a defence's tile frame and cooldown bar |
| `--floor` | the basement floor |
| `--grid` | the seams between floor tiles |
| `--wall` | the walls |
| `--light` | the bulb's hue (key and bounce light) |
| `--vignette` | the dark round the screen's edges |
| `--kid-skin` | the kid's skin, and their burst when they die |
| `--kid-eye` | the kid's eyes |
| `--kid-mouth` | the kid's mouth |
| `--bubble` | the spit bubble round the kid |
| `--reticle` | the aim ring under the cursor |
| `--eye` | every enemy's eyes |
| `--mouth` | every enemy's mouth |
| `--enemy-spit` | what enemies spit back, the weeper's tears, the blood in the gore |
| `--weapon-spit` | spit |
| `--weapon-slobber` | slobber |
| `--weapon-chunks` | chunks |
| `--weapon-tooth` | the loose tooth |
| `--weapon-raspberry` | the raspberry |
| `--weapon-burp` | the big burp's ring |
| `--weapon-puke` | projectile puke |
| `--weapon-bubble` | the spit bubble (defence) |
| `--weapon-lick` | lick wounds (defence) |
| `--enemy-fly` | the fly, and its gore |
| `--enemy-weeper` | the weeper |
| `--enemy-squealer` | the squealer |
| `--enemy-glutton` | the glutton |

## Look

`--look-*` tokens in the `:root` of `src/screens/shared.css`, beside the palette; `src/view/look.ts` reads them as `LOOK`
(`--look-camera-lift-u` is `LOOK.CAMERA_LIFT_U`). Hues come from the palette; these numbers say how much of them you see.
Plain numbers, the unit the name's last word (`u`, `s`, `deg`, `rad`, `u-s` per second, `u-s2` per second squared);
no unit is a strength, a count or a 0..1 amount.

| Name | Use |
|---|---|
| `--look-exposure` | tone-mapping exposure, the whole frame |
| `--look-key-light` | the bulb's intensity (`--light`) |
| `--look-key-dir` | `x y z` towards the bulb |
| `--look-fill-light` | bounce light intensity |
| `--look-glow` | how much enemies glow in their own colour |
| `--look-wall-glow` | how much the walls glow in their own colour |
| `--look-vignette` | how dark the screen's edges get (0..1) |
| `--look-vignette-start` | where the dark starts (0 centre, 1 the corners) |
| `--look-camera-fov-deg` | field of view |
| `--look-camera-tilt-rad` | camera tilt off straight down |
| `--look-camera-margin` | room round the floor (1: edge to edge); the camera backs off to fit it |
| `--look-camera-lift-u` | how far below the floor's centre the camera looks, so the floor clears the stomach slots |
| `--look-flash-s` | how long a struck enemy shows white |
| `--look-flash-glow` | how bright that flash is |
| `--look-burst-bits` | bits of gore flung out when an enemy pops |
| `--look-burst-speed-u-s` | how fast they fly |
| `--look-burst-gravity-u-s2` | how hard they fall back (they splat on the floor) |
| `--look-burst-s` | how long they last |
| `--look-shake-u` | how far the camera shakes when you're hurt |
| `--look-shake-s` | how long it shakes |
| `--look-wobble` | how much fleshy enemies squash (0..1) |
| `--look-wobble-hz` | how fast they wobble |
| `--look-flap-hz` | how fast flies' wings flap |
| `--look-body-scale` | how big bodies are drawn against what they collide with (1: exactly) |
| `--look-spawn-grow-s` | how long a new enemy takes to grow in |
| `--look-windup-shake-u` | how hard a squealer shakes before it charges |
| `--look-gape-s` | how long the kid's mouth gapes after spitting |
| `--look-gape` | how wide it gapes (1: shut) |

## Behaviour words

Weapon words go under a `weapon` in `content/weapons.kdl` and run top to bottom each time it fires
(`src/weapons.ts`). Enemy words and drop words go under an `enemy` in `content/enemies.kdl`: enemy words run every
step (`src/enemies.ts`), drop words pay out when it dies (`src/rewards.ts`). One word per line; names are unique
across all three.

| Word | Use |
|---|---|
| `volley` | weapon: `volley n spread_deg damage`: n shots fanned across spread_deg along your aim (n 1: one straight shot) |
| `pierce` | weapon: `pierce damage`: one fast shot that goes through everything (the tooth) |
| `nova` | weapon: `nova n damage`: n shots in a ring all round you |
| `shield` | weapon: `shield s`: a bubble for s seconds, nothing touches you |
| `mend` | weapon: `mend n`: n health back |
| `chase` | enemy: `chase speed_u_s`: go straight for the kid |
| `orbit` | enemy: `orbit range_u speed_u_s`: keep about range_u away and circle |
| `lunge` | enemy: `lunge every_s speed_u_s`: stop, shake, then charge at the kid |
| `shoot` | enemy: `shoot every_s speed_u_s`: one shot at the kid |
| `spray` | enemy: `spray n every_s speed_u_s`: n shots in a ring |
| `pennies` | drop: `pennies n`: n pennies to spend in the shop (and towards the score) |
| `heal` | drop: `heal n`: n hearts back |

## Content kinds

| Kind | Use |
|---|---|
| `weapon` | `weapon "id" name= price= cooldown-s= kind= paint="--weapon-<id>" starting= text= { weapon words }`, in `content/weapons.kdl`; `{word.i}` and `{cooldown}` in `text` quote its own numbers; price 0 is never on offer; the kid starts with the `starting` ones swallowed |
| `enemy` | `enemy "id" name= hp= r= touch= paint="--enemy-<id>" shape= { enemy words, drop words }`, in `content/enemies.kdl` |
| `wave` | `wave "id" gap-s= { <enemy id> <count> ... }`, in `content/waves.kdl`, in order; the list repeats, a lap harder |

## Weapon kinds

The `kind=` of a weapon: its tile's frame and cooldown bar colour (`--kind-<kind>`), nothing else.

| Kind | Use |
|---|---|
| `attack` | things you spit, burp or puke at them |
| `defend` | things that keep you alive: the bubble, licking wounds |

## Enemy shapes

The `shape=` of an enemy: its body in the basement (`src/view/scene.ts`), sized by its `r`, always facing the kid.

| Shape | Use |
|---|---|
| `fly` | a fat dark body, two eyes and two flapping wings; it hovers |
| `head` | a floating head with black eyes streaming blood and a small mouth; it wobbles |
| `lump` | a squat lump with a snout and beady eyes; it wobbles |
| `blob` | a huge body that's mostly mouth, two little eyes on top; it wobbles |

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
| `title` | the name (GOB), how to play, PLAY, your records |
| `hud` | during a run: hearts, wave, pennies, score; the stomach slots with their cooldown bars (tap a ready one to use it) |
| `shop` | after a cleared wave: three things to swallow (one, then the next wave), your stomach to cough up, or move on |
| `over` | the run is over: its numbers, go again or back to the title (a `dialog`) |
| `pause` | the run is paused: resume or quit (a `dialog`) |
