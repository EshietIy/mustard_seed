/**
 * Renders the email images (email-assets/*.svg) to PNG at 1x and 2x into public/email/.
 * Emails use PNG (not SVG) for client support; they're hosted on the site, not Supabase,
 * so email opens don't use the Supabase egress allowance (AGENT.md §3.1).
 *
 *   node scripts/render-email-assets.mjs        (needs Playwright's Chromium)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { chromium } from '@playwright/test';

const src = new URL('../email-assets/', import.meta.url).pathname;
const out = new URL('../public/email/', import.meta.url).pathname;
const browser = await chromium.launch();

for (const file of readdirSync(src).filter((f) => f.endsWith('.svg'))) {
  const svg = readFileSync(join(src, file), 'utf8');
  const width = Number(/width="(\d+)"/.exec(svg)?.[1]);
  const height = Number(/height="(\d+)"/.exec(svg)?.[1]);
  for (const scale of [1, 2]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const name = `${basename(file, '.svg')}${scale === 2 ? '@2x' : ''}.png`;
    await page.locator('svg').screenshot({ path: join(out, name), omitBackground: true });
    await page.close();
    process.stdout.write(`${name} (${width * scale}x${height * scale})\n`);
  }
}
await browser.close();
