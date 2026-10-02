// The catalog (docs/declarative-ui.md) and the code must list the same vocabulary. Fix whichever side is stale in the
// same commit; never delete a section to make this pass.
import { describe, expect, it } from 'vitest';
import catalog from '../docs/declarative-ui.md?raw';
import sharedTs from './screens/shared.ts?raw';
import sharedKdl from './screens/shared.kdl?raw';
import contentTs from './content.ts?raw';
import runtimeTs from './runtime.ts?raw';
import contentLoadTs from './content-load.ts?raw';
import kitPy from '../models/kit.py?raw';
import { PROPS } from './decl/css';
import { REWARDS } from './rewards';
import { TOKENS } from './tokens';
import { LOOK_KEYS, lookToken } from './view/look';
import './screens/shared'; // registers the game's properties

/** The backticked first-column names of the table under `## title`. */
function section(title: string): string[] {
  const start = catalog.indexOf(`\n## ${title}\n`);
  if (start < 0) throw new Error(`docs/declarative-ui.md has no "## ${title}" section`);
  const end = catalog.indexOf('\n## ', start + 1);
  return [...catalog.slice(start, end < 0 ? undefined : end).matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]!);
}
const all = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[1]!);
const same = (title: string, code: string[]) => expect([...section(title)].sort(), `## ${title}`).toEqual([...new Set(code)].sort());

describe('the catalog matches the code', () => {
  it('CSS properties', () => same('CSS properties', Object.keys(PROPS)));
  it('elements', () => same('Elements', ['panel', 'button', 'text', 'sprite', ...all(sharedTs, /defineElement\('([\w-]+)'/g)]));
  it('shared prefabs', () => same('Shared prefabs', all(sharedKdl, /^prefab "([\w-]+)"/gm)));
  const looks = Object.keys(TOKENS).filter((k) => k.startsWith('--look-'));
  it('palette', () => same('Palette', Object.keys(TOKENS).filter((k) => !k.startsWith('--look-'))));
  it('look', () => same('Look', looks));
  it('every look token is read by the shell', () => expect(LOOK_KEYS.map(lookToken).sort()).toEqual([...looks].sort()));
  it('behaviour words', () => same('Behaviour words', Object.keys(REWARDS)));
  it('content kinds', () => same('Content kinds', all(contentTs, /loadKdl\(\w+, \{ ([^}]+) \}/g).flatMap((kinds) => kinds.split(',').map((k) => k.split(':')[0]!.trim()))));
  it('content helpers', () => same('Content helpers', all(contentLoadTs, /^export function (\w+)/gm)));
  it('modelling kit', () => same('Modelling kit', all(kitPy, /^def ([a-z]\w*)\(/gm)));
  it('screens, in draw order', () => expect(section('Screens')).toEqual(all(runtimeTs, /^import \{ draw\w+ \} from '\.\/screens\/([\w-]+)';/gm)));
});
