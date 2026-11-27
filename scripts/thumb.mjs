#!/usr/bin/env node
// Optional helper: photograph a piece for its archive card.
//   node build.mjs && node scripts/thumb.mjs 2026-11-27-suminagashi
// Needs Playwright with Chromium. Writes experiments/<slug>/thumb.jpg (1200x900).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const slugs = process.argv.slice(2);
if (!slugs.length) { console.error('Usage: node scripts/thumb.mjs <slug> [...]'); process.exit(1); }
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const slug of slugs) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(root, 'dist', 'play', slug, 'index.html')).href);
  await page.waitForTimeout(Number(process.env.THUMB_WAIT) || 9000);
  await page.screenshot({ path: join(root, 'experiments', slug, 'thumb.jpg'), type: 'jpeg', quality: 78 });
  await page.close();
  console.log('thumb written for', slug);
}
await browser.close();
