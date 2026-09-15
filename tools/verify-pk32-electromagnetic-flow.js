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
        const host = document.createElement('div'); host.id = 'electromagnetic-flow-host';
        host.style.cssText = 'position:absolute;inset:0;z-index:2147483647;background:#fff';
        document.body.appendChild(host); window.__electromagnetic = window.PK32Variants.startGame(host, '电磁彩球', {});
      });
      await page.waitForFunction(() => document.querySelectorAll('[data-board=electromagnetic] [data-cell]').length === 256);
      assert.equal(await page.locator('[data-board=electromagnetic] [data-cell]').count(), 256);
      assert.equal(await page.locator('[data-board=electromagnetic]').locator('xpath=..').locator('option').count(), 160);
      const initial = await page.locator('[data-board=electromagnetic] [data-cell]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
      assert.ok(initial.every(value => /^[0-5]$/.test(value)));
      const before = initial.join('');
      const movable = await page.locator('[data-board=electromagnetic] [data-cell]').evaluateAll(nodes => nodes.findIndex(node => node.dataset.value >= '1' && node.dataset.value <= '4'));
      assert.ok(movable >= 0, 'native board has no movable ball');
      await page.locator('[data-board=electromagnetic] [data-cell]').nth(movable).click();
      await page.keyboard.press('ArrowRight');
      const after = await page.locator('[data-board=electromagnetic] [data-cell]').evaluateAll(nodes => nodes.map(node => node.dataset.value).join(''));
      assert.notEqual(after, before, 'direction key did not move any native ball');
      await page.getByRole('button', { name: '撤销上一步', exact: true }).click();
      assert.equal(await page.locator('[data-board=electromagnetic] [data-cell]').evaluateAll(nodes => nodes.map(node => node.dataset.value).join('')), before);
      await page.getByRole('button', { name: '下一关', exact: true }).click();
      assert.match(await page.locator('.pk32v-status').textContent(), /原版流程/);
      assert.equal(await page.locator('[data-board=electromagnetic] [data-cell="255"]').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(JSON.stringify({ widths: [390, 1280], levelCount: 160, cellsPerLevel: 256, passed: true, fullGameRulesVerified: false }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
