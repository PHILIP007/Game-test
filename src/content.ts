// Content kinds: weapon, enemy, wave. Each is a zod schema handed to loadKdl, so the schema is the type and the only
// parser; behaviour words attach through `combinators()` with the registry of the module that owns the rule (weapon
// words: weapons.ts; enemy words: enemies.ts; drop words: rewards.ts).
import { z } from 'zod';
import { combinators, loadKdl, tunedText } from './content-load';
import { BEHAVIOURS, type Behaviour } from './enemies';
import { REWARDS, type Reward } from './rewards';
import { EFFECTS, type Effect } from './weapons';
import enemiesKdl from '../content/enemies.kdl?raw';
import wavesKdl from '../content/waves.kdl?raw';
import weaponsKdl from '../content/weapons.kdl?raw';

/** A palette token in screens/shared.css :root (`--enemy-fly`); the shell reads its colour through tokens.ts. */
const paint = z.string().regex(/^--[\w-]+$/, 'a palette token like "--enemy-fly"');
const child = z.strictObject({ name: z.string(), args: z.array(z.unknown()), props: z.strictObject({}) });

// ---------- weapons ----------

/** What a weapon is for: its frame colour on screen, and nothing else. */
export const WEAPON_KINDS = ['attack', 'defend'] as const;

export const WeaponSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  /** Pennies to buy it in the shop (0: never on offer). Coughing it up pays back SELL_BACK of this. */
  price: z.number().int().nonnegative(),
  /** Seconds between uses: how often its words can run. The balance lever: big hits come slowly. */
  'cooldown-s': z.number().positive(),
  kind: z.enum(WEAPON_KINDS),
  /** Its gobs' colour in the basement. */
  paint,
  /** Copies swallowed when a run starts. */
  starting: z.number().int().nonnegative().default(0),
  /** The words on its tile. `{volley.0}` quotes the first number of its own `volley` word and `{cooldown}` its
   *  cooldown-s, so the text can't go stale. */
  text: z.string(),
  children: z.array(child),
}).transform(({ children, text, 'cooldown-s': cooldownS, ...w }, ctx) => {
  const words = combinators(EFFECTS, 'weapon word').safeParse(children);
  if (!words.success) { words.error.issues.forEach((i) => ctx.issues.push({ ...i, input: children, path: ['words', ...i.path] } as never)); return z.NEVER; }
  const quoted = tunedText({ ...Object.fromEntries(children.map((c) => [c.name, c.args])), cooldown: cooldownS }).safeParse(text);
  if (!quoted.success) { quoted.error.issues.forEach((i) => ctx.issues.push({ ...i, input: text, path: ['text'] } as never)); return z.NEVER; }
  return { ...w, cooldownS, text: quoted.data, effects: words.data as Effect[] };
});
export type WeaponDef = z.output<typeof WeaponSchema>;

export const WEAPONS = loadKdl(weaponsKdl, { weapon: WeaponSchema }).weapon;
export const WEAPON_IDS = Object.keys(WEAPONS);
/** What the shop can offer: every weapon with a price. */
export const SHOP_IDS = WEAPON_IDS.filter((id) => WEAPONS[id]!.price > 0);
/** What the kid has swallowed when a run starts: each weapon's `starting` copies, in file order. */
export const STARTING_WEAPONS = WEAPON_IDS.flatMap((id) => Array<string>(WEAPONS[id]!.starting).fill(id));

export function weaponDef(id: string): WeaponDef {
  const d = WEAPONS[id];
  if (!d) throw new Error(`unknown weapon "${id}" (known: ${WEAPON_IDS.join(', ')})`);
  return d;
}

// ---------- enemies ----------

/** The bodies an enemy can have in the basement (src/view/scene.ts builds each). */
export const SHAPES = ['fly', 'head', 'lump', 'blob'] as const;

export const EnemySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  hp: z.number().positive(),
  /** Radius, u: what gobs and the kid collide with. */
  r: z.number().positive(),
  /** Hearts lost when it touches the kid. */
  touch: z.number().int().nonnegative(),
  paint,
  shape: z.enum(SHAPES),
  children: combinators<Behaviour | Reward>({ ...BEHAVIOURS, ...REWARDS }, 'enemy word'),
}).transform(({ children, ...e }) => ({
  ...e,
  behaviours: children.filter((w): w is Behaviour => w.kind === 'behaviour'),
  drops: children.filter((w): w is Reward => w.kind === 'reward'),
}));
export type EnemyDef = z.output<typeof EnemySchema>;

export const ENEMIES = loadKdl(enemiesKdl, { enemy: EnemySchema }).enemy;
export const ENEMY_IDS = Object.keys(ENEMIES);

export function enemyDef(kind: string): EnemyDef {
  const d = ENEMIES[kind];
  if (!d) throw new Error(`unknown enemy "${kind}" (known: ${ENEMY_IDS.join(', ')})`);
  return d;
}

// ---------- waves ----------

export const WaveSchema = z.strictObject({
  id: z.string(),
  /** Seconds between one enemy appearing and the next. */
  'gap-s': z.number().positive(),
  /** One line per group, in the order they come: `<enemy id> <how many>`. */
  children: z.array(z.strictObject({
    name: z.enum(ENEMY_IDS as [string, ...string[]], { error: (i) => `unknown enemy "${String(i.input)}" (known: ${ENEMY_IDS.join(', ')})` }),
    args: z.tuple([z.number().int().positive()]),
    props: z.strictObject({}),
  })).min(1),
}).transform(({ children, ...w }) => ({ id: w.id, gapS: w['gap-s'], queue: children.flatMap((c) => Array<string>(c.args[0]).fill(c.name)) }));
export type WaveDef = z.output<typeof WaveSchema>;

/** The waves in file order; after the last, the list repeats (game.ts). */
export const WAVES = Object.values(loadKdl(wavesKdl, { wave: WaveSchema }).wave);
