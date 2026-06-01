#!/usr/bin/env node
/**
 * Workway data capture — phase 1 of the migration.
 *
 * Opens a real Chrome window pointed at Workway. YOU log in (Google/email/2FA —
 * whatever you normally use); this script never sees or stores your password.
 * As you click through Workway's modules, every JSON response the app's own
 * backend returns is saved to `migration/workway/_discovery/` — that JSON *is*
 * the structured data, far cleaner than scraping the UI.
 *
 * Usage:
 *   node migration/workway/capture.cjs
 * Optional env:
 *   WORKWAY_URL   (default https://cestech.workway.pro/)
 *   CHROME_PATH   (default macOS Google Chrome)
 *
 * When you've opened every module/report you want migrated (and paged through
 * the long lists so they actually load), just CLOSE the browser window.
 * Then tell Claude the capture is done.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// Reuse the puppeteer-core already installed for the screenshotter (zero install).
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch {
  puppeteer = require(path.join(os.homedir(), '.ces-shotter', 'node_modules', 'puppeteer-core'));
}

const BASE = process.env.WORKWAY_URL || 'https://cestech.workway.pro/';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, '_discovery');
const API_DIR = path.join(OUT, 'api');
fs.mkdirSync(API_DIR, { recursive: true });

const sanitize = (url) =>
  url
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .slice(0, 80);

const shape = (b) => {
  if (Array.isArray(b)) {
    const first = b[0];
    const inner =
      first && typeof first === 'object' ? Object.keys(first).slice(0, 15).join(',') : typeof first;
    return `array[${b.length}] of { ${inner} }`;
  }
  if (b && typeof b === 'object') return `object { ${Object.keys(b).slice(0, 20).join(',')} }`;
  return typeof b;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox'],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());

  const index = [];
  let n = 0;

  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('application/json')) return; // only JSON API payloads
      if (!/workway/i.test(url)) return; // skip third-party analytics etc.
      let body;
      try {
        body = await res.json();
      } catch {
        return;
      }
      n += 1;
      const method = res.request().method();
      const file = path.join('api', `${String(n).padStart(4, '0')}_${method}_${sanitize(url)}.json`);
      fs.writeFileSync(
        path.join(OUT, file),
        JSON.stringify({ url, method, status: res.status(), body }, null, 2),
      );
      index.push({ n, method, status: res.status(), url, file, shape: shape(body) });
      fs.writeFileSync(path.join(OUT, 'api-index.json'), JSON.stringify(index, null, 2));
      process.stdout.write(`\r📡 captured ${n} JSON responses… (latest: ${sanitize(url).slice(0, 50)})   `);
    } catch {
      /* ignore individual response errors */
    }
  });

  console.log(`
┌─ Workway capture ─────────────────────────────────────────────┐
│ A Chrome window is opening at:                                 │
│   ${BASE}
│                                                                │
│ 1. LOG IN in that window (Google / email / 2FA — your call).   │
│ 2. Open EVERY module you want migrated and page through the    │
│    lists so all rows load:                                     │
│      People · Clients · Projects · Tasks · Timesheets ·        │
│      Allocations · Expenses · Travel · Attendance · Reports    │
│ 3. The app's JSON is being saved to migration/workway/_discovery/
│ 4. When done, just CLOSE the browser window.                   │
│                                                                │
│ Your password is never read or stored by this script.         │
└────────────────────────────────────────────────────────────────┘
`);

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    console.log('(navigation slow — log in once the page appears)');
  }

  await new Promise((resolve) => browser.on('disconnected', resolve));
  fs.writeFileSync(path.join(OUT, 'api-index.json'), JSON.stringify(index, null, 2));
  console.log(`

✓ Capture finished. ${n} JSON responses saved to:
    migration/workway/_discovery/   (api-index.json = the map)

Next: tell Claude "Workway capture is done" — it will read the index, propose the
column→schema mapping, dry-run, and import on your approval.

If api-index.json is EMPTY, Workway renders data server-side (no JSON API) — say
so and Claude will switch to the Excel-export path instead.
`);
  process.exit(0);
})().catch((err) => {
  console.error('\nCapture failed:', err.message);
  console.error('If Chrome was not found, set CHROME_PATH to your browser binary.');
  process.exit(1);
});
