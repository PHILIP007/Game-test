// Run a TS script through Vite's SSR loader (no extra deps): node scripts/run.mjs scripts/sim.ts [args]
import { createServer } from 'vite';
const file = process.argv.splice(2, 1)[0];
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try { await server.ssrLoadModule('/' + file.replace(/^\.?\//, '')); } finally { await server.close(); }
