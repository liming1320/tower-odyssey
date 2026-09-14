'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const output = path.resolve(__dirname, '../output/playwright/pk32-browser');
const results = [];
const lifecycle = [];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, isMobile: width === 390, hasTouch: width === 390 });
      const page = await context.newPage();
      let releaseCatalog;
      const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
      await page.route('**/data/pk32-native-catalog.json', async route => { await catalogGate; await route.continue(); });
      let errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
      await page.goto(base);
      await page.waitForFunction(() => window.PK32Catalog && window.MiniGames.pk32);
      await page.evaluate(() => {
        window.__catalogDestroyCount = 0;
        const startTower = window.PK32Tower.startUI;
        window.PK32Tower.startUI = function (...args) {
          const game = startTower.apply(this, args), destroy = game.destroy;
          game.destroy = function () { window.__catalogDestroyCount++; return destroy.call(game); };
          return game;
        };
        const host = document.createElement('div'); host.id = 'pk32-browser-host';
        host.style.cssText = 'position:absolute;inset:0;min-height:100%;background:white;z-index:2147483647';
        document.body.appendChild(host); window.__catalogTest = window.MiniGames.pk32.start(host, {});
      });
      const towerId = await page.evaluate(() => window.PK32Catalog.find(row => row.playable && row.playable.gameId === 'tower').id);
      await page.locator('[data-pk32-launch="' + towerId + '"]').click();
      releaseCatalog();
      await page.waitForResponse(response => response.url().includes('/data/pk32-native-catalog.json'));
      await page.waitForTimeout(100);
      assert.equal(await page.locator('[data-role=pk32-tower]').count(), 1, 'Delayed catalog response replaced active game');
      await page.getByRole('button', { name: '\u8fd4\u56de PK32 \u76ee\u5f55', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__catalogDestroyCount), 1, 'Returning to catalog must destroy once');
      await page.locator('[data-pk32-launch="' + towerId + '"]').click();
      await page.evaluate(() => { window.__catalogTest.stop(); window.__catalogTest.stop(); });
      assert.equal(await page.evaluate(() => window.__catalogDestroyCount), 2, 'Stopping the gallery must destroy once');
      assert.equal(await page.locator('[data-role=pk32-tower]').count(), 0, 'Stopped gallery retained the game');
      lifecycle.push({ width, delayedCatalogPreservedGame: true, returnDestroyedOnce: true, stopDestroyedOnce: true });
      await page.unroute('**/data/pk32-native-catalog.json');
      await page.evaluate(() => { window.__catalogTest = window.MiniGames.pk32.start(document.querySelector('#pk32-browser-host'), {}); });
      // Wait for the asynchronous native catalog enrichment before taking the roster.
      await page.waitForTimeout(500);
      const roster = await page.evaluate(() => window.PK32Catalog.map(record => ({ id: record.id, name: record.name, status: record.status })));
      for (const record of roster) {
        errors = [];
        const row = { width, ...record, fullGameRulesVerified: false };
        try {
          const entry = page.locator('[data-pk32-id="' + record.id + '"]');
          const launch = entry.locator('button').first();
          await launch.click({ timeout: 5000 });
          await page.waitForTimeout(200);
          row.render = await page.evaluate(() => {
            const host = document.querySelector('#pk32-list').children[1];
            if (!host) return { mounted: false };
            const rect = host.getBoundingClientRect();
            const images = [...host.querySelectorAll('img')];
            const canvases = [...host.querySelectorAll('canvas')];
            let visibleCanvases = 0, nonblankCanvases = 0;
            for (const canvas of canvases) {
              if (!canvas.width || !canvas.height || !canvas.getBoundingClientRect().width) continue;
              visibleCanvases++;
              try {
                const ctx = canvas.getContext('2d');
                if (!ctx) continue;
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set();
                const stride = Math.max(4, Math.floor(pixels.length / 4096 / 4) * 4);
                for (let i = 0; i < pixels.length; i += stride) colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2] + ',' + pixels[i + 3]);
                if (colors.size > 1) nonblankCanvases++;
              } catch (_) { /* Tainted or WebGL surfaces remain unverified, not a pass. */ }
            }
            return {
              mounted: rect.width > 0 && rect.height > 0 && host.childElementCount > 0,
              nodes: host.querySelectorAll('*').length,
              brokenImages: images.filter(image => image.complete && !image.naturalWidth).map(image => image.src),
              loadingImages: images.filter(image => !image.complete).map(image => image.src),
              visibleCanvases, nonblankCanvases,
              preformatted: host.querySelectorAll('pre').length,
              documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              launchError: /\u542f\u52a8\u5931\u8d25|\u52a0\u8f7d\u5931\u8d25/.test(host.textContent),
              contentSample: host.textContent.slice(0, 200)
            };
          });
          row.errors = errors.slice();
          row.smokePassed = row.render.mounted && !row.render.launchError && row.render.brokenImages.length === 0 && !row.render.documentOverflow && row.errors.length === 0;
          row.visualNeedsReview = row.render.preformatted > 0 || row.render.loadingImages.length > 0 || row.render.visibleCanvases > row.render.nonblankCanvases;
          if (!row.smokePassed || row.visualNeedsReview) await page.screenshot({ path: path.join(output, width + '-' + record.id + '.png'), fullPage: true });
          await page.getByRole('button', { name: '\u8fd4\u56de PK32 \u76ee\u5f55', exact: true }).click();
        } catch (error) {
          row.smokePassed = false; row.error = error.message;
          await page.evaluate(() => {
            window.__catalogTest.stop();
            window.__catalogTest = window.MiniGames.pk32.start(document.querySelector('#pk32-browser-host'), {});
          });
          await page.waitForTimeout(300);
        }
        results.push(row);
      }
      await page.evaluate(() => window.__catalogTest.stop());
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ scope: 'catalog-browser-smoke-only', fullGameRulesVerified: false, lifecycle, results }, null, 2));
  }
  const failed = results.filter(row => !row.smokePassed);
  console.log(JSON.stringify({ checked: results.length, smokePassed: results.length - failed.length, failed: failed.map(row => ({ width: row.width, name: row.name, error: row.error, render: row.render, errors: row.errors })), visualNeedsReview: results.filter(row => row.visualNeedsReview).length, fullGameRulesVerified: false, output }));
  if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
