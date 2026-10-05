// Long-document benchmark: paste, reopen, and per-keystroke latency.
// Usage: node typing-bench.mjs <baseUrl> <label> [paragraphs]
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

const [baseUrl = 'http://localhost:8090', label = 'run', countArg = '2000'] =
  process.argv.slice(2);
const COUNT = Number(countArg);
const CPU = Number(process.env.CPU ?? '1');

const AR =
  'هذه فقرة عربية طويلة نسبيًا لاختبار أداء المحرر مع النصوص العربية والأرقام 2026';
const EN =
  'This is a fairly long English paragraph used to benchmark the editor with Latin text';
const lines = Array.from(
  { length: COUNT },
  (_, i) => `${i % 2 ? EN : AR} #${i}`
);

const median = a => {
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.floor(s.length / 2)].toFixed(2);
};
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2);
};

const dir = mkdtempSync(join(tmpdir(), 'dafater-typing-'));
const ctx = await chromium.launchPersistentContext(dir, {
  headless: true,
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
await ctx.addInitScript(() => {
  localStorage.setItem('app_config', '{"onBoarding":false}');
  localStorage.setItem('dismissAiOnboarding', 'true');
  localStorage.setItem('dismissAiOnboardingLocal', 'true');
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
if (CPU > 1) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
}
await page.goto(baseUrl + '/');
await page.getByTestId('sidebar-new-page-button').click({ timeout: 120000 });
await page.waitForSelector('doc-title .inline-editor');
await page.locator('doc-title .inline-editor').first().click();
await page.keyboard.type('Benchmark');
await page.keyboard.press('Enter');

// 1) Paste COUNT paragraphs.
await page.evaluate(
  text => navigator.clipboard.writeText(text),
  lines.join('\n')
);
const pasteStart = Date.now();
await page.keyboard.press('ControlOrMeta+v');
await page.waitForFunction(
  n => document.querySelectorAll('affine-paragraph').length >= n,
  COUNT,
  { timeout: 300000, polling: 100 }
);
const pasteMs = Date.now() - pasteStart;
await page.waitForTimeout(3000);
const docUrl = page.url();

// 2) Reopen the long document (cold editor render from local storage).
const openMs = [];
for (let i = 0; i < 3; i++) {
  await page.goto(baseUrl + '/');
  await page.waitForTimeout(1500);
  const t0 = Date.now();
  await page.goto(docUrl);
  await page.waitForFunction(
    n => document.querySelectorAll('affine-paragraph').length >= n,
    COUNT,
    { timeout: 300000, polling: 50 }
  );
  openMs.push(Date.now() - t0);
}
await page.waitForTimeout(2000);

// 3) Keystroke latency: keydown → next painted frame.
await page.evaluate(() => {
  const w = window;
  w.__lat = [];
  // beforeinput fires for both key presses and composed/inserted text.
  document.addEventListener(
    'beforeinput',
    () => {
      const t0 = performance.now();
      requestAnimationFrame(() =>
        setTimeout(() => w.__lat.push(performance.now() - t0), 0)
      );
    },
    true
  );
});
async function typeInto(index, text) {
  const p = page
    .locator('affine-paragraph')
    .nth(index)
    .locator('.inline-editor');
  await p.scrollIntoViewIfNeeded();
  await p.click();
  await page.keyboard.press('End');
  await page.evaluate(() => (window.__lat = []));
  await page.keyboard.type(text, { delay: 40 });
  await page.waitForTimeout(300);
  return page.evaluate(() => window.__lat);
}
const arLat = await typeInto(
  Math.floor(COUNT / 2),
  ' نص عربي إضافي للكتابة السريعة في منتصف المستند الطويل'
);
const enLat = await typeInto(
  Math.floor(COUNT / 2) + 1,
  ' more English text typed in the middle of a long doc'
);

const result = {
  label,
  paragraphs: COUNT,
  cpuThrottle: CPU,
  pasteMs,
  openMs,
  openMedianMs: median(openMs),
  typingArabic: {
    n: arLat.length,
    medianMs: median(arLat),
    p95Ms: pct(arLat, 0.95),
  },
  typingEnglish: {
    n: enLat.length,
    medianMs: median(enLat),
    p95Ms: pct(enLat, 0.95),
  },
  dirAttrs: await page.evaluate(() => {
    const ps = [...document.querySelectorAll('affine-paragraph')];
    return {
      rtl: ps.filter(p => p.getAttribute('dir') === 'rtl').length,
      ltr: ps.filter(p => p.getAttribute('dir') === 'ltr').length,
    };
  }),
};
console.log(JSON.stringify(result, null, 1));
writeFileSync(`typing-${label}.json`, JSON.stringify(result, null, 2));
await ctx.close();
