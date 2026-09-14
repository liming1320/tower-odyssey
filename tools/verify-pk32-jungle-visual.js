'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 });
      const page = await context.newPage();
      await page.goto(base);
      await page.waitForFunction(() => window.PK32Catalog && window.MiniGames.pk32);
      await page.evaluate(() => { const host = document.createElement('div'); host.id = 'jungle-visual-host'; document.body.appendChild(host); window.__jungleVisual = window.MiniGames.pk32.start(host, {}); });
      const id = await page.evaluate(() => window.PK32Catalog.find(row => row.name === '斗兽棋').id);
      await page.locator('[data-pk32-id="' + id + '"] button').first().click();
      const result = await page.evaluate(() => {
        const shell = document.querySelector('.pk32-board-scroll');
        const grid = document.querySelector('.pk32-board-grid');
        const pieces = [...document.querySelectorAll('.pk32-animal-piece')];
        return { cells: grid ? grid.children.length : 0, pieces: pieces.length, labels: pieces.map(node => node.textContent), scrollable: !!shell && shell.scrollWidth >= shell.clientWidth };
      });
      assert.equal(result.cells, 63);
      assert.equal(result.pieces, 16);
      assert.ok(result.labels.every(Boolean));
      assert.ok(result.scrollable);
      results.push({ width, ...result });
      await context.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ results, passed: results.length, fullGameRulesVerified: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
