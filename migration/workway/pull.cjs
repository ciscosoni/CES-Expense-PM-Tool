#!/usr/bin/env node
/**
 * Workway full data pull — phase 2 (paginated, resumable).
 *
 * Opens Chrome (persistent profile, so you stay logged in across runs), waits
 * for you to log in once, then re-fetches each DataTables endpoint PAGE BY PAGE
 * (500 rows at a time) through your live session and concatenates — so big
 * lists like timelogs (2k+) pull reliably without a giant single response.
 *
 * Resumable: entities already saved in _discovery/full/ are skipped (set
 * FORCE=1 to re-pull). One entity failing never ends the run.
 *
 * Usage:  node migration/workway/pull.cjs
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
const FORCE = process.env.FORCE === '1';
const DISC = path.join(__dirname, '_discovery');
const OUT = path.join(DISC, 'full');
const PROFILE = path.join(DISC, '.chrome-profile');
fs.mkdirSync(OUT, { recursive: true });

const TARGETS = [
  'employees',
  'clients',
  'projects',
  'projectroadmap',
  'timelogs',
  'expenses',
  'payroll-expenses',
  'leaves',
];

const PAGE_SIZE = 250;

function buildBaseUrls() {
  const idx = JSON.parse(fs.readFileSync(path.join(DISC, 'api-index.json'), 'utf8'));
  const urls = {};
  for (const name of TARGETS) {
    const hit = idx.find((it) => new RegExp(`/account/${name}\\?`).test(it.url));
    if (hit) urls[name] = hit.url;
  }
  urls.tasks =
    `${BASE}/account/tasks?draw=1&start=0&length=10&search[value]=&status=all&projectId=all&assignedTo=all&assignedBY=all&searchText=&_=${Date.now()}`;
  return urls;
}

async function fetchInPage(page, url) {
  // page.evaluate itself can throw "Execution context was destroyed" if the page
  // navigates mid-call (happens constantly during the OAuth login dance). Swallow
  // it at the Node level so the caller just retries instead of the run dying.
  try {
    return await page.evaluate(async (u) => {
      try {
        const r = await fetch(u, {
          headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
          credentials: 'include',
        });
        const text = await r.text();
        try {
          return { status: r.status, json: JSON.parse(text) };
        } catch {
          return { status: r.status, json: null, snippet: text.slice(0, 120) };
        }
      } catch (e) {
        return { status: 0, json: null, snippet: String(e).slice(0, 120) };
      }
    }, url);
  } catch (e) {
    return { status: 0, json: null, snippet: 'context: ' + String(e.message).slice(0, 80) };
  }
}

function withPage(url, start, length) {
  let u = url
    .replace(/([?&])start=\d+/, `$1start=${start}`)
    .replace(/([?&])length=-?\d+/, `$1length=${length}`);
  if (!/[?&]start=/.test(u)) u += `&start=${start}`;
  if (!/[?&]length=/.test(u)) u += `&length=${length}`;
  return u;
}

async function pullEntity(page, name, baseUrl, have = []) {
  // Fetch one page, retrying transient failures (nav/size hiccups) before giving up.
  const fetchPage = async (start, length) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetchInPage(page, withPage(baseUrl, start, length));
      if (r.json && (Array.isArray(r.json) || Array.isArray(r.json.data))) return r.json;
      await new Promise((s) => setTimeout(s, 1500));
    }
    return null;
  };

  const first = await fetchPage(0, PAGE_SIZE);
  if (!first) return { ok: false, status: 0, snippet: 'no data after retries' };
  if (Array.isArray(first)) return { ok: true, rows: first, total: first.length };

  const total = first.recordsTotal ?? (first.data || []).length;
  // Resume from what we already have on disk for this entity.
  const all = have.length && have.length < total ? [...have] : [...(first.data || [])];
  let start = all.length;
  while (all.length < total && start < 1000000) {
    const j = await fetchPage(start, PAGE_SIZE);
    const rows = j && Array.isArray(j.data) ? j.data : [];
    if (!rows.length) break; // genuinely empty after retries
    all.push(...rows);
    process.stdout.write(`\r    ${name}: ${all.length}/${total}   `);
    start += PAGE_SIZE;
  }
  return { ok: true, rows: all, total };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: null,
    userDataDir: PROFILE,
    args: ['--start-maximized', '--no-sandbox'],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());

  console.log(`
┌─ Workway full pull (paginated, resumable) ────────────────────┐
│ Log in IN THE CHROME WINDOW if prompted (the profile persists, │
│ so later runs skip login). Then leave it open — every module   │
│ is pulled automatically, 500 rows at a time. One failure won't │
│ stop the rest. Already-saved entities are skipped (FORCE=1 to  │
│ re-pull).                                                      │
└────────────────────────────────────────────────────────────────┘
`);
  await page.goto(`${BASE}/account/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

  const urls = buildBaseUrls();
  const probe = urls.employees || `${BASE}/account/employees?draw=1&start=0&length=1&_=${Date.now()}`;

  process.stdout.write('Waiting for an authenticated session');
  const deadline = Date.now() + 8 * 60 * 1000;
  for (;;) {
    const r = await fetchInPage(page, withPage(probe, 0, 1));
    if (r.json && typeof r.json.recordsTotal === 'number') break;
    if (Date.now() > deadline) {
      console.log('\nTimed out waiting for login (8 min). Log in, then re-run.');
      return;
    }
    process.stdout.write('.');
    await new Promise((s) => setTimeout(s, 3000));
  }
  console.log('\n✓ Authenticated — pulling…\n');

  const summary = [];
  for (const [name, url] of Object.entries(urls)) {
    const file = path.join(OUT, `${name}.json`);
    let have = [];
    if (!FORCE && fs.existsSync(file) && fs.statSync(file).size > 100) {
      const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
      const rows = Array.isArray(existing) ? existing : existing.data || [];
      const tot = Array.isArray(existing) ? rows.length : existing.recordsTotal ?? rows.length;
      if (rows.length >= tot) {
        console.log(`  ⏭  ${name.padEnd(18)} complete (${rows.length} rows) — skipped`);
        summary.push({ name, ok: true, rows: rows.length, skipped: true });
        continue;
      }
      have = rows;
      console.log(`  ↻  ${name.padEnd(18)} resuming from ${rows.length}/${tot}…`);
    }
    try {
      const res = await pullEntity(page, name, url, have);
      if (!res.ok) {
        console.log(`  ✗ ${name.padEnd(18)} HTTP ${res.status} ${res.snippet ?? ''}`);
        summary.push({ name, ok: false, status: res.status });
        continue;
      }
      fs.writeFileSync(file, JSON.stringify({ recordsTotal: res.total, data: res.rows }, null, 2));
      const flag = res.rows.length < res.total ? ` ⚠ ${res.rows.length}/${res.total}` : '';
      console.log(`\r  ✓ ${name.padEnd(18)} ${res.rows.length} rows${flag}                `);
      summary.push({ name, ok: true, rows: res.rows.length, total: res.total });
    } catch (e) {
      console.log(`  ✗ ${name.padEnd(18)} ${String(e.message).slice(0, 100)}`);
      summary.push({ name, ok: false, error: String(e.message).slice(0, 200) });
    }
  }
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));

  console.log(`
✓ Done. Saved to migration/workway/_discovery/full/.
Tell Claude "the full pull is done". You can close the window.
`);
  // Leave the browser open so the persistent session is reused next time.
})().catch((err) => {
  console.error('\nPull error (browser left open):', err.message);
});
