#!/usr/bin/env node
/**
 * Workway full data pull — phase 2 of the migration.
 *
 * The phase-1 capture (capture.cjs) recorded the API *shapes* but only page 1
 * (10 rows) of each list. This tool opens Chrome, waits for YOU to log in, then
 * re-fetches each DataTables endpoint with length=all through your live session
 * — pulling every row. Output → migration/workway/_discovery/full/<entity>.json.
 *
 * Usage:  node migration/workway/pull.cjs
 * Reuses the exact authenticated query strings captured in api-index.json, just
 * bumping start=0 & length to a large number. Your password is never read.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch {
  puppeteer = require(path.join(os.homedir(), '.ces-shotter', 'node_modules', 'puppeteer-core'));
}

const BASE = process.env.WORKWAY_URL || 'https://cestech.workway.pro';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DISC = path.join(__dirname, '_discovery');
const OUT = path.join(DISC, 'full');
fs.mkdirSync(OUT, { recursive: true });

// Entities we want the full dataset for (path fragment → output name).
const TARGETS = [
  'employees',
  'clients',
  'projects',
  'timelogs',
  'expenses',
  'projectroadmap',
  'payroll-expenses',
  'leaves',
];

// Pull the captured query string for each entity from phase 1, bump the page size.
function buildUrls() {
  const idx = JSON.parse(fs.readFileSync(path.join(DISC, 'api-index.json'), 'utf8'));
  const urls = {};
  for (const name of TARGETS) {
    const hit = idx.find((it) => new RegExp(`/account/${name}\\?`).test(it.url));
    if (!hit) continue;
    let u = hit.url.replace(/([?&])start=\d+/, '$1start=0').replace(/([?&])length=-?\d+/, '$1length=100000');
    if (!/[?&]length=/.test(u)) u += '&length=100000';
    urls[name] = u;
  }
  // Tasks list isn't a DataTables capture (the kanban returns HTML); try the list endpoint.
  urls.tasks =
    `${BASE}/account/tasks?draw=1&start=0&length=100000&search[value]=&status=all&projectId=all&assignedTo=all&assignedBY=all&searchText=&_=${Date.now()}`;
  return urls;
}

const fetchInPage = (page, url) =>
  page.evaluate(async (u) => {
    try {
      const r = await fetch(u, {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
        credentials: 'include',
      });
      const text = await r.text();
      try {
        return { status: r.status, json: JSON.parse(text) };
      } catch {
        return { status: r.status, json: null, snippet: text.slice(0, 160) };
      }
    } catch (e) {
      return { status: 0, json: null, snippet: String(e).slice(0, 160) };
    }
  }, url);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox'],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());

  console.log(`
┌─ Workway full pull ───────────────────────────────────────────┐
│ Log in IN THE CHROME WINDOW. Once you're on the dashboard,     │
│ this tool fetches every row of each module automatically —     │
│ you don't need to click through pages. Leave the window open.  │
└────────────────────────────────────────────────────────────────┘
`);
  await page.goto(`${BASE}/account/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

  const urls = buildUrls();
  const probe = urls.employees || `${BASE}/account/employees?draw=1&start=0&length=1&search[value]=&_=${Date.now()}`;

  // Wait (up to 5 min) until an authenticated fetch succeeds.
  process.stdout.write('Waiting for you to log in');
  const deadline = Date.now() + 5 * 60 * 1000;
  for (;;) {
    const r = await fetchInPage(page, probe);
    if (r.json && (r.json.recordsTotal !== undefined || Array.isArray(r.json))) break;
    if (Date.now() > deadline) {
      console.log('\nTimed out waiting for login. Re-run when ready.');
      await browser.close();
      process.exit(1);
    }
    process.stdout.write('.');
    await new Promise((s) => setTimeout(s, 3000));
  }
  console.log('\n✓ Logged in — pulling data…\n');

  const summary = [];
  for (const [name, url] of Object.entries(urls)) {
    const r = await fetchInPage(page, url);
    if (!r.json) {
      console.log(`  ✗ ${name.padEnd(18)} HTTP ${r.status} ${r.snippet ?? ''}`);
      summary.push({ name, ok: false, status: r.status });
      continue;
    }
    const rows = Array.isArray(r.json) ? r.json : r.json.data ?? [];
    const total = r.json.recordsTotal ?? rows.length;
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(r.json, null, 2));
    const flag = rows.length < total ? ` ⚠ got ${rows.length}/${total}` : '';
    console.log(`  ✓ ${name.padEnd(18)} ${rows.length} rows${flag}`);
    summary.push({ name, ok: true, rows: rows.length, total });
  }
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));

  console.log(`
✓ Full pull saved to migration/workway/_discovery/full/.
Tell Claude "the full pull is done" — it will map each entity to our schema,
dry-run, and import on your approval. You can close the window now.
`);
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('\nPull failed:', err.message);
  process.exit(1);
});
