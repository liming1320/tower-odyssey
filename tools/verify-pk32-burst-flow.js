'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 });
      const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.goto(base); await page.waitForFunction(() => !!window.PK32Variants);
      await page.evaluate(() => { const h = document.createElement('div'); h.id = 'burst-flow-host'; h.style.cssText = 'position:absolute;inset:0;background:#fff;z-index:2147483647'; document.body.appendChild(h); window.__burst = window.PK32Variants.startGame(h, '爆破彩球', {}); });
      await page.waitForFunction(() => document.querySelectorAll('.pk32v-native-data [data-cell]').length > 0);
      assert.equal(await page.locator('select option').count(), 29);
      const first = await page.locator('[data-cell]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
      assert.ok(first.every(value => /^[0-5]$/.test(value)));
      const candidate = await page.locator('[data-cell]').evaluateAll(nodes => { const values = nodes.map(node => node.dataset.value); for (let i = 0; i < values.length; i++) { const x = i % 12, y = Math.floor(i / 12); if (values[i] === '0') continue; const near = [i - 1, i + 1, i - 12, i + 12].filter(j => j >= 0 && j < values.length && Math.abs((j % 12) - x) + Math.abs(Math.floor(j / 12) - y) === 1); if (near.some(j => values[j] === values[i])) return i; } return -1; });
      assert.ok(candidate >= 0, 'first native board has no selectable group'); await page.locator('[data-cell="' + candidate + '"]').click();
      assert.ok(await page.locator('.pk32v-status').textContent().then(text => !/只能|请选择/.test(text)));
      await page.getByRole('button', { name: '下一关', exact: true }).click(); assert.equal(await page.locator('[data-cell]').count(), 192);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []); await page.close();
    }
    console.log(JSON.stringify({ widths: [390, 1280], levels: 29, rules: 'group-of-two-gravity', passed: true, fullGameRulesVerified: false }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
