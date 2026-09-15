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
        window.__MG_TEST = true;
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
      const nativeEncoding = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('[data-board=electromagnetic] [data-cell]')];
        const fixed = nodes.find(node => node.dataset.value === '5');
        const empty = nodes.find(node => node.dataset.value === '0');
        return {
          fixedImage: fixed ? getComputedStyle(fixed).backgroundImage : '',
          emptyImage: empty ? getComputedStyle(empty).backgroundImage : '',
          fixedCount: nodes.filter(node => node.dataset.value === '0').length,
          emptyCount: nodes.filter(node => node.dataset.value === '5').length
        };
      });
      assert.match(nativeEncoding.fixedImage, /sheet-d3525b\.png/);
      assert.equal(nativeEncoding.emptyImage, 'none');
      assert.ok(nativeEncoding.fixedCount > 0 && nativeEncoding.emptyCount > 0);
      const coreRules = await page.evaluate(() => {
        const shift = window.__pk32ElectromagneticDebug.shift;
        const empty = () => Array(256).fill('0');
        const chain = empty(); chain[1] = '1'; chain[2] = '2';
        const blocked = empty(); blocked[0] = '5'; blocked[1] = '1'; blocked[2] = '2';
        const joined = empty(); joined[1] = '1'; joined[2] = '1';
        return {
          chain: shift(chain, -1, 0).slice(0, 4).join(''),
          blocked: shift(blocked, -1, 0).slice(0, 4).join(''),
          joined: shift(joined, -1, 0).slice(0, 4).join('')
        };
      });
      assert.deepEqual(coreRules, { chain: '1200', blocked: '5120', joined: '1100' });
      const key = await page.evaluate(() => {
        const debug = window.__pk32ElectromagneticDebug, state = debug.getState().cells;
        const moves = [['ArrowLeft', -1, 0], ['ArrowUp', 0, -1], ['ArrowRight', 1, 0], ['ArrowDown', 0, 1]];
        const found = moves.find(move => debug.shift(state, move[1], move[2]).join('') !== state.join(''));
        return found && found[0];
      });
      assert.ok(key, 'native board has no legal global movement');
      await page.keyboard.press(key);
      const after = await page.locator('[data-board=electromagnetic] [data-cell]').evaluateAll(nodes => nodes.map(node => node.dataset.value).join(''));
      assert.notEqual(after, before, 'direction key did not move the native components');
      await page.getByRole('button', { name: '撤销上一步', exact: true }).click();
      assert.equal(await page.locator('[data-board=electromagnetic] [data-cell]').evaluateAll(nodes => nodes.map(node => node.dataset.value).join('')), before);
      await page.getByRole('button', { name: '下一关', exact: true }).click();
      assert.match(await page.locator('.pk32v-status').textContent(), /原版流程/);
      assert.equal(await page.locator('[data-board=electromagnetic] [data-cell="255"]').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(JSON.stringify({ widths: [390, 1280], levelCount: 160, cellsPerLevel: 256, nativeEncoding: { empty: 0, movable: [1, 2, 3, 4], fixed: 5 }, globalMovementVerified: true, originalAtlasVerified: true, passed: true, fullGameRulesVerified: false }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
