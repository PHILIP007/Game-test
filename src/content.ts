// Content kinds: card, enemy, wave. Each is a zod schema handed to loadKdl, so the schema is the type and the only
// parser; behaviour words attach through `combinators()` with the registry of the module that owns the rule (card
// words: cards.ts; enemy words: enemies.ts; drop words: rewards.ts).
import { z } from 'zod';
import { EFFECTS, type Effect } from './cards';
import { combinators, loadKdl, tunedText } from './content-load';
import { BEHAVIOURS, type Behaviour } from './enemies';
import { REWARDS, type Reward } from './rewards';
import cardsKdl from '../content/cards.kdl?raw';
import enemiesKdl from '../content/enemies.kdl?raw';
import wavesKdl from '../content/waves.kdl?raw';

/** A palette token in screens/shared.css :root (`--enemy-crawler`); the shell reads its colour through tokens.ts. */
const paint = z.string().regex(/^--[\w-]+$/, 'a palette token like "--enemy-crawler"');
const child = z.strictObject({ name: z.string(), args: z.array(z.unknown()), props: z.strictObject({}) });

// ---------- cards ----------

/** What a card is for: its frame colour on screen, and nothing else. */
export const CARD_KINDS = ['attack', 'move', 'power'] as const;

export const CardSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  /** Energy to play it. */
  cost: z.number().int().nonnegative(),
  kind: z.enum(CARD_KINDS),
  /** Its shots' colour in the arena. */
  paint,
  /** Copies in the deck a run starts with (0: only found as a reward). */
  starting: z.number().int().nonnegative().default(0),
  /** The words on the card. `{volley.0}` quotes the first number of its own `volley` word, so the text can't go stale. */
  text: z.string(),
  children: z.array(child),
}).transform(({ children, text, ...c }, ctx) => {
  const words = combinators(EFFECTS, 'card word').safeParse(children);
  if (!words.success) { words.error.issues.forEach((i) => ctx.issues.push({ ...i, input: children, path: ['words', ...i.path] } as never)); return z.NEVER; }
  const quoted = tunedText(Object.fromEntries(children.map((w) => [w.name, w.args]))).safeParse(text);
  if (!quoted.success) { quoted.error.issues.forEach((i) => ctx.issues.push({ ...i, input: text, path: ['text'] } as never)); return z.NEVER; }
  return { ...c, text: quoted.data, effects: words.data as Effect[] };
});
export type CardDef = z.output<typeof CardSchema>;

export const CARDS = loadKdl(cardsKdl, { card: CardSchema }).card;
export const CARD_IDS = Object.keys(CARDS);
/** The deck a run starts with: each card's `starting` copies, in file order. */
export const STARTING_DECK = CARD_IDS.flatMap((id) => Array<string>(CARDS[id]!.starting).fill(id));

export function cardDef(id: string): CardDef {
  const d = CARDS[id];
  if (!d) throw new Error(`unknown card "${id}" (known: ${CARD_IDS.join(', ')})`);
  return d;
}

// ---------- enemies ----------

/** The meshes an enemy can wear in the arena (src/view/scene.ts draws each). */
export const SHAPES = ['spike', 'block', 'gem', 'orb'] as const;

export const EnemySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  hp: z.number().positive(),
  /** Radius, u: what shots and the pilot collide with. */
  r: z.number().positive(),
  /** Damage when it touches the pilot. */
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
