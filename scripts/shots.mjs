// Headless screenshots: `node scripts/shots.mjs <url> <out.png> [waitMs] [width] [height]`.
// Chromium runs WebGL through SwiftShader here, so frame rates are low but frames are real.
import { chromium } from 'playwright';

const [url, out, wait = '3000', w = '844', h = '390'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
