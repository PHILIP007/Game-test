// Content kinds: thing. Each is a zod schema handed to loadKdl, so the schema is the type and the only parser;
// behaviour words attach through `combinators()` with the registry of the module that owns the rule.
// PLACEHOLDER: replace `thing` with your game's kinds (enemies, cards, items, waves, level layout).
import { z } from 'zod';
import { combinators, loadKdl } from './content-load';
import { REWARDS } from './rewards';
import thingsKdl from '../content/things.kdl?raw';

export const ThingSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  /** Radius, u: its size on the field. */
  r: z.number().positive(),
  /** The palette token it's painted in (`--thing-orb`); the shell reads it from shared.css. */
  paint: z.string().regex(/^--[\w-]+$/, 'a palette token like "--thing-orb"'),
  children: combinators(REWARDS, 'reward'),
}).transform(({ children, ...t }) => ({ ...t, rewards: children }));
export type ThingDef = z.output<typeof ThingSchema>;

export const THINGS = loadKdl(thingsKdl, { thing: ThingSchema }).thing;
export const THING_IDS = Object.keys(THINGS);

export function thingDef(kind: string): ThingDef {
  const d = THINGS[kind];
  if (!d) throw new Error(`unknown thing "${kind}" (known: ${THING_IDS.join(', ')})`);
  return d;
}
