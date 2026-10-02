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
| `weapon` | `weapon(id, tap, { key, tag, charge, foot, off?, ready?, compact? })`: a weapon tile from `content/weapons.kdl`; `charge` fills its cooldown bar; its kind, `off`, `ready` and `compact` (the HUD: no description) are classes; no tap (the automatic slot), not pressable |
| `slot-empty` | `emptySlot(key)`: an empty stomach slot, the size of a weapon tile (the shop; the HUD shows only what's swallowed) |
| `line` | `line(text)`: a line of text in a dialog's body |
| `dialog` | `dialog(title, sub, body, buttons, layout?)`: over the dimmed basement, swallows taps; `layout` `column` (lines) or `row` (tiles) |

## Palette

The world is greyscale; the only colours are the two accents, warm (the child and anything theirs) and danger red
(attacks and the tells before them). One `--weapon-<id>` per weapon and one `--enemy-<id>` per enemy (a guard test
checks every `paint=` is here and named after its weapon or enemy). Each row quotes the comment above it in
`shared.css`, where the tokens are grouped.

| Token | Use |
|---|---|
| `--warm` | Warm: the kid, their shots, their hearts and anything that's theirs. |
| `--warm-core` | Warm: the kid, their shots, their hearts and anything that's theirs. |
| `--danger` | Sickly red: enemy attacks and danger (a bulge before an attack, the pulse when you're hurt). |
| `--danger-core` | Sickly red: enemy attacks and danger (a bulge before an attack, the pulse when you're hurt). |
| `--danger-eye-rest` | Every creature's iris: a dark grey at rest (no colour on a creature that isn't attacking), blazing to the second colour just before it attacks, so red always means "about to hurt you". |
| `--danger-eye` | Every creature's iris: a dark grey at rest (no colour on a creature that isn't attacking), blazing to the second colour just before it attacks, so red always means "about to hurt you". |
| `--ink` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--panel` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--panel-ready` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--edge` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--text` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--dim` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--accent` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--scrim` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--heart` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--penny` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--pop` | ---------- UI: greyscale, so the accents stay loud ---------- |
| `--title-font` | Gochi Hand is bundled (src/fonts/fonts.css); the others stand in only if it fails to load. |
| `--body-font` | Gochi Hand is bundled (src/fonts/fonts.css); the others stand in only if it fails to load. |
| `--kind-attack` | Tile frames, one per weapon kind (content/weapons.kdl `kind=`). |
| `--kind-defend` | Tile frames, one per weapon kind (content/weapons.kdl `kind=`). |
| `--floor-glow` | The floor: bright where the light is, black where it isn't. |
| `--floor-dark` | The floor: bright where the light is, black where it isn't. |
| `--beyond` | Beyond the far wall: the bright fog the light comes from (what hangs in front of it reads as silhouette). |
| `--fog` | The fog things fade into with distance, and the haze laid over the whole frame. |
| `--haze` | The fog things fade into with distance, and the haze laid over the whole frame. |
| `--wall` | The walls, every body (near-black paper cutouts), the thin light on their edges, their shadows. |
| `--silhouette` | The walls, every body (near-black paper cutouts), the thin light on their edges, their shadows. |
| `--rim` | The walls, every body (near-black paper cutouts), the thin light on their edges, their shadows. |
| `--shadow` | The walls, every body (near-black paper cutouts), the thin light on their edges, their shadows. |
| `--eye` | Every creature's eyes: big and pale round an iris (--danger-eye-rest), so they read at a glance; their pupils. |
| `--pupil` | Every creature's eyes: big and pale round an iris (--danger-eye-rest), so they read at a glance; their pupils. |
| `--splat` | Ink: what's left on the floor when something dies. |
| `--vignette` | The film: the dark round the edges, the blurred silhouettes in front of the lens, the grain. |
| `--edge-silhouette` | The film: the dark round the edges, the blurred silhouettes in front of the lens, the grain. |
| `--grain` | The film: the dark round the edges, the blurred silhouettes in front of the lens, the grain. |
| `--reticle` | The aim ring under the cursor and the bubble round the kid: the kid's, so warm. |
| `--bubble` | The aim ring under the cursor and the bubble round the kid: the kid's, so warm. |
| `--weapon-spit` | One --weapon-<id> per weapon in content/weapons.kdl: the kid's shots, all warm. |
| `--weapon-slobber` | One --weapon-<id> per weapon in content/weapons.kdl: the kid's shots, all warm. |
| `--weapon-chunks` | One --weapon-<id> per weapon in content/weapons.kdl: the kid's shots, all warm. |
| `--weapon-tooth` | One --weapon-<id> per weapon in content/weapons.kdl: the kid's shots, all warm. |
| `--weapon-raspberry` | One --weapon-<id> per weapon in content/weapons.kdl: the kid's shots, all warm. |
| `--weapon-burp` | One --weapon-<id> per weapon in content/weapons.kdl: the kid's shots, all warm. |
| `--weapon-puke` | One --weapon-<id> per weapon in content/weapons.kdl: the kid's shots, all warm. |
| `--weapon-bubble` | One --weapon-<id> per weapon in content/weapons.kdl: the kid's shots, all warm. |
| `--weapon-lick` | One --weapon-<id> per weapon in content/weapons.kdl: the kid's shots, all warm. |
| `--enemy-mothling` | One --enemy-<id> per enemy in content/enemies.kdl: its body, a near-black grey (no colour: they're shadows). |
| `--enemy-goggler` | One --enemy-<id> per enemy in content/enemies.kdl: its body, a near-black grey (no colour: they're shadows). |
| `--enemy-gnasher` | One --enemy-<id> per enemy in content/enemies.kdl: its body, a near-black grey (no colour: they're shadows). |
| `--enemy-sackmaw` | One --enemy-<id> per enemy in content/enemies.kdl: its body, a near-black grey (no colour: they're shadows). |

## Look

`--look-*` tokens in the `:root` of `src/screens/shared.css`, beside the palette; `src/view/look.ts` reads them as `LOOK`
(`--look-camera-lift-u` is `LOOK.CAMERA_LIFT_U`). Plain numbers, the unit the name's last word (`u`, `s`, `deg`, `rad`,
`hz`, `px`, `u-s` per second, `u-s2` per second squared); no unit is a strength, a count or a 0..1 amount. Each row
quotes the comment above it in `shared.css`.

| Name | Use |
|---|---|
| `--look-floor-glow-radius` | The floor's glow: how far it reaches (0..1 of the floor), how far up-screen its brightest point sits, and how much grit breaks it up. |
| `--look-floor-glow-y-u` | The floor's glow: how far it reaches (0..1 of the floor), how far up-screen its brightest point sits, and how much grit breaks it up. |
| `--look-floor-grit` | The floor's glow: how far it reaches (0..1 of the floor), how far up-screen its brightest point sits, and how much grit breaks it up. |
| `--look-floor-plank-u` | The floorboards: how wide a plank is, how dark the gaps between them, how much grain along them, how dark the stains soaked into them. |
| `--look-floor-seam` | The floorboards: how wide a plank is, how dark the gaps between them, how much grain along them, how dark the stains soaked into them. |
| `--look-floor-grain` | The floorboards: how wide a plank is, how dark the gaps between them, how much grain along them, how dark the stains soaked into them. |
| `--look-floor-stain` | The floorboards: how wide a plank is, how dark the gaps between them, how much grain along them, how dark the stains soaked into them. |
| `--look-floor-edge-soft-u` | No hard edge round the floor: it sinks into the dark over this many u at the walls, to this darkness (0..1). |
| `--look-floor-edge-dark` | No hard edge round the floor: it sinks into the dark over this many u at the walls, to this darkness (0..1). |
| `--look-beyond-soft-u` | Beyond the far wall: bright fog, the light the whole room is lit from, fading in over this many u. |
| `--look-crib-bar-u` | The far wall is the bars of a giant crib: how thick a bar is, how tall, how far apart. |
| `--look-crib-height-u` | The far wall is the bars of a giant crib: how thick a bar is, how tall, how far apart. |
| `--look-crib-spacing-u` | The far wall is the bars of a giant crib: how thick a bar is, how tall, how far apart. |
| `--look-bar-shadow` | The light beyond that wall throws the bars' shadows across the floor: how dark, how much they fan out (per u from the wall), how far they reach before fading. |
| `--look-bar-shadow-fan` | The light beyond that wall throws the bars' shadows across the floor: how dark, how much they fan out (per u from the wall), how far they reach before fading. |
| `--look-bar-shadow-reach-u` | The light beyond that wall throws the bars' shadows across the floor: how dark, how much they fan out (per u from the wall), how far they reach before fading. |
| `--look-warm-halo-u` | The warm light round the kid on the floor: how far it reaches, how bright. |
| `--look-warm-halo` | The warm light round the kid on the floor: how far it reaches, how bright. |
| `--look-fog-near-u` | Fog: things this far from the camera start to fade into --fog, and are gone into it this far. |
| `--look-fog-far-u` | Fog: things this far from the camera start to fade into --fog, and are gone into it this far. |
| `--look-mist` | Ground fog: banks of mist drifting over the floor, how thick (0..1), how fast, how big a bank is. |
| `--look-mist-drift-u-s` | Ground fog: banks of mist drifting over the floor, how thick (0..1), how fast, how big a bank is. |
| `--look-mist-size-u` | Ground fog: banks of mist drifting over the floor, how thick (0..1), how fast, how big a bank is. |
| `--look-haze` | Haze over the whole frame, and how much more of it at the top (further away). |
| `--look-haze-top` | Haze over the whole frame, and how much more of it at the top (further away). |
| `--look-grain` | Film grain: how strong, how many times a second it changes. |
| `--look-grain-hz` | Film grain: how strong, how many times a second it changes. |
| `--look-vignette` | The dark round the edges: how dark (0..1), and where it starts (0 centre, 1 the edge of its shape). |
| `--look-vignette-start` | The dark round the edges: how dark (0..1), and where it starts (0 centre, 1 the edge of its shape). |
| `--look-vignette-round` | Its shape: 0 follows the screen's edges, 1 is a circle (an old lens). |
| `--look-edge-layer` | Blurred silhouettes in front of the lens (grass, roots, brambles): how dark, how blurred, how far into the frame (0..1), how much they slide as the kid moves (depth). |
| `--look-edge-blur-px` | Blurred silhouettes in front of the lens (grass, roots, brambles): how dark, how blurred, how far into the frame (0..1), how much they slide as the kid moves (depth). |
| `--look-edge-depth` | Blurred silhouettes in front of the lens (grass, roots, brambles): how dark, how blurred, how far into the frame (0..1), how much they slide as the kid moves (depth). |
| `--look-edge-parallax` | Blurred silhouettes in front of the lens (grass, roots, brambles): how dark, how blurred, how far into the frame (0..1), how much they slide as the kid moves (depth). |
| `--look-hurt-pulse` | The red pulse round the edges when the kid is hurt: how strong, how long. |
| `--look-hurt-pulse-s` | The red pulse round the edges when the kid is hurt: how strong, how long. |
| `--look-rim` | Cutouts: a light edge round every body (`rim-width-u` wide, in body units, brightest on top), plus a little more light caught by the bevel where they turn (how bright, how tight: higher is thinner), where the backlight comes from (x y z on screen), how dark their shadows, how big. |
| `--look-rim-power` | Cutouts: a light edge round every body (`rim-width-u` wide, in body units, brightest on top), plus a little more light caught by the bevel where they turn (how bright, how tight: higher is thinner), where the backlight comes from (x y z on screen), how dark their shadows, how big. |
| `--look-rim-width-u` | Cutouts: a light edge round every body (`rim-width-u` wide, in body units, brightest on top), plus a little more light caught by the bevel where they turn (how bright, how tight: higher is thinner), where the backlight comes from (x y z on screen), how dark their shadows, how big. |
| `--look-rim-dir` | Cutouts: a light edge round every body (`rim-width-u` wide, in body units, brightest on top), plus a little more light caught by the bevel where they turn (how bright, how tight: higher is thinner), where the backlight comes from (x y z on screen), how dark their shadows, how big. |
| `--look-wall-rim` | The walls catch only a little of that light: they're the dark frame round the floor. |
| `--look-shadow` | The walls catch only a little of that light: they're the dark frame round the floor. |
| `--look-child-rim` | The child stands out: their warm edge this many times wider than the creatures', drawn this much bigger, and the night-light they carry: its glow's size (in child units) and brightness. |
| `--look-child-scale` | The child stands out: their warm edge this many times wider than the creatures', drawn this much bigger, and the night-light they carry: its glow's size (in child units) and brightness. |
| `--look-lamp-size` | The child stands out: their warm edge this many times wider than the creatures', drawn this much bigger, and the night-light they carry: its glow's size (in child units) and brightness. |
| `--look-lamp-glow` | The child stands out: their warm edge this many times wider than the creatures', drawn this much bigger, and the night-light they carry: its glow's size (in child units) and brightness. |
| `--look-shadow-size` | The child stands out: their warm edge this many times wider than the creatures', drawn this much bigger, and the night-light they carry: its glow's size (in child units) and brightness. |
| `--look-body-scale` | How big bodies are drawn against what they collide with (1: exactly): big heads read better. |
| `--look-shot-glow` | How big a shot's glow is against the shot itself. |
| `--look-danger-glow` | An enemy shot's glow is tight: danger is a crisp drop, not a smear. |
| `--look-danger-size` | How big an enemy shot is drawn against what it hits with, so danger reads at phone size. |
| `--look-camera-fov-deg` | Camera: field of view, tilt off straight down (slight), room round the floor (1: edge to edge), and how far below its centre it looks, so the floor sits above the HUD's slots. |
| `--look-camera-tilt-rad` | Camera: field of view, tilt off straight down (slight), room round the floor (1: edge to edge), and how far below its centre it looks, so the floor sits above the HUD's slots. |
| `--look-camera-margin` | Camera: field of view, tilt off straight down (slight), room round the floor (1: edge to edge), and how far below its centre it looks, so the floor sits above the HUD's slots. |
| `--look-camera-lift-u` | Camera: field of view, tilt off straight down (slight), room round the floor (1: edge to edge), and how far below its centre it looks, so the floor sits above the HUD's slots. |
| `--look-flash-s` | Hit: how long a struck enemy's rim flares, how much it squishes, how fast it springs back, for how long. |
| `--look-squish` | Hit: how long a struck enemy's rim flares, how much it squishes, how fast it springs back, for how long. |
| `--look-squish-hz` | Hit: how long a struck enemy's rim flares, how much it squishes, how fast it springs back, for how long. |
| `--look-squish-s` | Hit: how long a struck enemy's rim flares, how much it squishes, how fast it springs back, for how long. |
| `--look-bulge` | Before an attack: how much an enemy swells, starting this long before it shoots, sprays or charges. |
| `--look-bulge-s` | Before an attack: how much an enemy swells, starting this long before it shoots, sprays or charges. |
| `--look-splat-size` | Death: an ink splat this big (against the body), fading over this long; droplets flung out, how fast, how hard they fall, how long they last. |
| `--look-splat-s` | Death: an ink splat this big (against the body), fading over this long; droplets flung out, how fast, how hard they fall, how long they last. |
| `--look-burst-bits` | Death: an ink splat this big (against the body), fading over this long; droplets flung out, how fast, how hard they fall, how long they last. |
| `--look-burst-speed-u-s` | Death: an ink splat this big (against the body), fading over this long; droplets flung out, how fast, how hard they fall, how long they last. |
| `--look-burst-gravity-u-s2` | Death: an ink splat this big (against the body), fading over this long; droplets flung out, how fast, how hard they fall, how long they last. |
| `--look-burst-s` | Death: an ink splat this big (against the body), fading over this long; droplets flung out, how fast, how hard they fall, how long they last. |
| `--look-shake-u` | Shake: how far and how long when the kid is hurt; a smaller nudge when something dies. |
| `--look-shake-s` | Shake: how far and how long when the kid is hurt; a smaller nudge when something dies. |
| `--look-kill-shake-u` | Shake: how far and how long when the kid is hurt; a smaller nudge when something dies. |
| `--look-wobble` | Living things wobble: how much (0..1) and how fast; wings flap faster. |
| `--look-wobble-hz` | Living things wobble: how much (0..1) and how fast; wings flap faster. |
| `--look-flap-hz` | Living things wobble: how much (0..1) and how fast; wings flap faster. |
| `--look-spawn-grow-s` | How long a new enemy takes to grow in, how hard a charger shakes before it charges. |
| `--look-windup-shake-u` | How long a new enemy takes to grow in, how hard a charger shakes before it charges. |
| `--look-gape-s` | How long the kid's mouth glows open after a shot, and how wide (1: shut). |
| `--look-gape` | How long the kid's mouth glows open after a shot, and how wide (1: shut). |

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

The `shape=` of an enemy: its body (`src/view/scene.ts`), a flat black cutout with a light edge that always faces the
camera and turns to the child, sized by its `r`. Every eye's pupil follows the child; its iris blazes red before an
attack.

| Shape | Use |
|---|---|
| `moth` | a fat fuzzy body that's mostly two big eyes, ragged flapping wings, feelers; it hovers |
| `eyeball` | one enormous eye under a heavy lashed lid, on three stubby feet; a red glow swells round it before it spits |
| `grin` | a squat lump that's mostly crooked teeth, mismatched beady eyes, stub horns; its mouth glows red before it charges |
| `sack` | a huge sewn-up sack tied at the top, five eyes of every size, a stitched mouth that glows red before it heaves |

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
