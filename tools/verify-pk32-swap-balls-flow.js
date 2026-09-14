'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.waitForFunction(() => !!window.PK32Variants);
      await page.evaluate(() => {
        const host = document.createElement('div'); host.id = 'swap-flow-host'; document.body.appendChild(host);
        window.__swap = window.PK32Variants.startGame(host, '交换彩球', {});
      });
      await page.waitForFunction(() => document.querySelectorAll('.bubble-board [data-cell]').length > 0);
      assert.equal(await page.locator('[data-cell]').count(), 192);
      const values = await page.locator('[data-cell]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
      assert.ok(values.some(value => value === '4'), 'native board has no bomb');
      assert.ok(values.every(value => /^[0-4]$/.test(value)), 'native values changed unexpectedly');
      const before = values.filter(value => value !== '0').length;
      const pair = await page.locator('[data-cell]').evaluateAll(nodes => {
        const values = nodes.map(node => node.dataset.value);
        for (let i = 0; i < values.length; i += 1) {
          const x = i % 16, y = Math.floor(i / 16);
          if (values[i] === '0') continue;
          for (const next of [i + 1, i + 16]) {
            if (next < values.length && Math.abs(next % 16 - x) + Math.abs(Math.floor(next / 16) - y) === 1 && values[next] !== '0') return [i, next];
          }
        }
        return null;
      });
      assert.ok(pair, 'native board has no adjacent swappable balls');
      await page.locator('[data-cell="' + pair[0] + '"]').click();
      await page.locator('[data-cell="' + pair[1] + '"]').click();
      const after = await page.locator('[data-cell]').evaluateAll(nodes => nodes.filter(node => node.dataset.value !== '0').length);
      assert.ok(after <= before, 'swap interaction increased occupied cells');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(JSON.stringify({ widths: [390, 1280], cells: 192, passed: true, fullGameRulesVerified: false }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
