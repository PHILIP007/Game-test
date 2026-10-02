// Colours for things the shell draws itself (the 3D scene, custom elements): CSS variables from the palette in
// screens/shared.css, so every colour in the game is tweaked in one file.
import { color } from './decl/css';
import sharedCss from './screens/shared.css?raw';

const root = /:root\s*\{([^}]*)\}/.exec(sharedCss.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? '';
export const TOKENS: Record<string, string> = Object.fromEntries([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));

/** A palette colour as 0xRRGGBB: `token('--floor')`. Throws on a name the palette lacks. */
export function token(name: string): number {
  const v = TOKENS[name];
  if (v === undefined) throw new Error(`tokens: no \`${name}\` in shared.css :root; add it there`);
  return color(v);
}
