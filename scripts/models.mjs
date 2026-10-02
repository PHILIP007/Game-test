// Rebuild the 3D models from their Blender scripts: `npm run models` (all) or `npm run models -- crate lamp`.
// Each models/<name>.py runs in a fresh headless Blender and writes models/<name>.glb (committed, so the game builds
// without Blender). BLENDER overrides the binary.
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);
const blender = process.env.BLENDER ?? 'blender';
const all = readdirSync('models').filter((f) => f.endsWith('.py') && f !== 'kit.py').map((f) => f.slice(0, -3));
const want = process.argv.slice(2);
const unknown = want.filter((n) => !all.includes(n));
if (unknown.length) { console.error(`no models/${unknown[0]}.py (have: ${all.join(', ')})`); process.exit(1); }
const queue = want.length ? want : all;
let failed = 0;
async function worker() {
  for (let name; (name = queue.shift()); ) {
    try {
      const { stdout } = await run(blender, ['-b', '--factory-startup', '--python-exit-code', '1', '--python-expr', "import sys; sys.path.insert(0, 'models')", '-P', `models/${name}.py`], { maxBuffer: 1 << 24 });
      console.log(stdout.split('\n').find((l) => l.startsWith('MODEL')) ?? `${name}: no MODEL line`);
    } catch (e) {
      failed++;
      console.error(`${name} failed:\n${(e.stdout ?? '') + (e.stderr ?? '')}`.split('\n').filter((l) => /Error|error|Traceback|File "|^\s+\S/.test(l)).slice(-15).join('\n'));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(queue.length, Math.max(1, cpus().length - 1)) }, worker));
process.exit(failed ? 1 : 0);
