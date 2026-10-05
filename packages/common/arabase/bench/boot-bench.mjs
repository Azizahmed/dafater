// Boot flicker + startup benchmark for the web app.
// Usage: node boot-bench.mjs <baseUrl> <label> [runs]
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const [baseUrl = 'http://localhost:8090', label = 'run', runsArg = '5'] =
  process.argv.slice(2);
const RUNS = Number(runsArg);
// Optional throttling: THROTTLE=1 -> 10 Mbps / 80 ms RTT network and 4x CPU slowdown.
const THROTTLE = process.env.THROTTLE === '1';
const ONLY = process.env.ONLY?.split(',');

// Probe injected before any page script. Samples DOM state every animation frame.
const probe = `(() => {
  const m = (window.__boot = { samples: [], cls: 0, shifts: [], paint: {} });
  const AR = /[\\u0600-\\u06FF]/;
  const EN_UI = /All docs|Journals|Settings|Trash|Search/;
  const AR_UI = /كل المستندات|الإعدادات|سلة المهملات|بحث/;
  let last = '';
  const sample = () => {
    const de = document.documentElement;
    if (!de) { requestAnimationFrame(sample); return; }
    const nav = document.querySelector('[data-testid="app-sidebar"]');
    const navText = nav ? nav.textContent || '' : '';
    const state = [de.dir || '-', de.lang || '-', nav ? 1 : 0,
      AR_UI.test(navText) ? 'ar' : EN_UI.test(navText) ? 'en' : '-'].join('|');
    if (state !== last) { m.samples.push({ t: performance.now(), state }); last = state; }
    if (performance.now() < 30000) requestAnimationFrame(sample);
  };
  sample();
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) { m.cls += e.value; m.shifts.push({ t: e.startTime, v: e.value }); }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) m.paint[e.name] = e.startTime;
  }).observe({ type: 'paint', buffered: true });
})();`;

const scenarios = [
  { name: 'stored-ar', lang: 'ar', expect: { dir: 'rtl', ui: 'ar' } },
  { name: 'stored-en', lang: 'en', expect: { dir: 'ltr', ui: 'en' } },
  { name: 'fresh', lang: null, expect: null },
];

const results = {};
for (const sc of scenarios.filter(s => !ONLY || ONLY.includes(s.name))) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'dafater-bench-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.addInitScript(
    ({ lang }) => {
      if (lang)
        localStorage.setItem('global-cache:i18n_lng', JSON.stringify(lang));
    },
    { lang: sc.lang }
  );
  await page.addInitScript(probe);
  if (THROTTLE) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 40,
      downloadThroughput: 20e6 / 8,
      uploadThroughput: 10e6 / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
  }
  // Warm-up: creates the local workspace so later loads are "returning user" loads.
  await page.goto(baseUrl + '/', { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="app-sidebar"]', {
    timeout: 120000,
  });
  await page.waitForTimeout(3000);
  const workspaceUrl = page.url();

  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    await page.goto(workspaceUrl, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="app-sidebar"]', {
      timeout: 120000,
    });
    await page.waitForTimeout(THROTTLE ? 6000 : 2500);
    const boot = await page.evaluate(() => window.__boot);
    const nav = await page.evaluate(() =>
      performance.getEntriesByType('navigation')[0].toJSON()
    );
    const final = boot.samples.at(-1)?.state;
    // Time at which the final (settled) state was first reached.
    const lastOther = boot.samples.findLastIndex(s => s.state !== final);
    const settledAt = boot.samples[lastOther + 1].t;
    const sidebarAt = boot.samples.find(s => s.state.split('|')[2] === '1')?.t;
    const wrongStates = boot.samples.filter(s => {
      const [dir, , hasNav, ui] = s.state.split('|');
      if (!sc.expect) return false;
      return dir !== sc.expect.dir || (hasNav === '1' && ui !== sc.expect.ui);
    });
    runs.push({
      fcp: boot.paint['first-contentful-paint'],
      sidebarAt,
      settledAt,
      dclAt: nav.domContentLoadedEventEnd,
      loadAt: nav.loadEventEnd,
      cls: boot.cls,
      transitions: boot.samples.length - 1,
      wrongStates: wrongStates.length,
      sequence: boot.samples.map(s => `${s.t.toFixed(0)}ms:${s.state}`),
    });
  }
  await ctx.close();
  const med = k => {
    const v = runs
      .map(r => r[k])
      .filter(x => typeof x === 'number')
      .sort((a, b) => a - b);
    return v.length ? +v[Math.floor(v.length / 2)].toFixed(1) : null;
  };
  results[sc.name] = {
    median: {
      fcp: med('fcp'),
      sidebarAt: med('sidebarAt'),
      settledAt: med('settledAt'),
      dclAt: med('dclAt'),
      loadAt: med('loadAt'),
      cls: med('cls'),
      transitions: med('transitions'),
      wrongStates: med('wrongStates'),
    },
    exampleSequence: runs[runs.length - 1].sequence,
  };
  console.log(sc.name, JSON.stringify(results[sc.name], null, 1));
}
writeFileSync(`boot-${label}.json`, JSON.stringify(results, null, 2));
