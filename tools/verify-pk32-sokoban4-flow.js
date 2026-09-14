'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const data = require('../public/data/pk32-sokoban4-levels.json');
const model = require('../public/js/minigames/pk32-sokoban4');
const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const output = path.resolve(__dirname, '../output/playwright/pk32-sokoban4-flow');
const results = [];

async function sameBoard(page, expected) {
    const actual = await page.evaluate(() => window.__soko4Test.getState());
    assert.equal(actual.player, expected.player);
    assert.deepEqual(actual.cells, expected.cells);
    assert.equal(actual.won, expected.won);
}

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 768, 1280]) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 });
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ': ' + response.url()); });
            await page.goto(base);
            await page.waitForFunction(() => window.PK32Sokoban4 && window.MiniGames.pk32);
            const id = await page.evaluate(() => {
                const host = document.createElement('div'); host.id = 'soko4-gallery';
                host.style.cssText = 'position:absolute;inset:0;background:white;z-index:2147483647;min-height:100%';
                document.body.appendChild(host);
                const start = window.PK32Sokoban4.start;
                window.PK32Sokoban4.start = function (...args) { return window.__soko4Test = start(...args); };
                window.__soko4Gallery = window.MiniGames.pk32.start(host, {});
                return window.PK32Catalog.find(row => row.name === '\u63a8\u7bb1\u5b50\u56db').id;
            });
            const entry = page.locator('[data-pk32-id="' + id + '"]');
            assert.equal(await entry.locator('button').count(), 1, 'Only one verified launch route for Sokoban IV');
            await entry.locator('button').click();
            const canvas = page.locator('[data-role=sokoban4-board]');
            await page.waitForFunction(() => document.querySelector('[data-role=sokoban4-board]')?.dataset.ready === 'true');
            assert.equal(await page.locator('.pk32-soko4 select option').count(), 23);
            assert.equal(await page.locator('#soko-board').count(), 0, 'Must not enter generic demo');
            const first = model.createState(data.levels[0]);
            await sameBoard(page, first);
            // Every board cell is compared against native sprite rectangles, including SRCPAINT.
            const pixelCheck = await page.evaluate(async () => {
                const image = new Image(); image.src = window.PK32Sokoban4.ATLAS; await image.decode();
                const expected = document.createElement('canvas'); expected.width = expected.height = 32;
                const ctx = expected.getContext('2d');
                const actual = document.querySelector('[data-role=sokoban4-board]').getContext('2d');
                const s = window.__soko4Test.getState();
                let matched = 0;
                s.cells.forEach((code, index) => {
                    ctx.drawImage(image, 677, (code === 0 ? 0 : code === 5 ? 25 : code + 4) * 32, 32, 32, 0, 0, 32, 32);
                    const tile = ctx.getImageData(0, 0, 32, 32).data;
                    if (index === s.player) {
                        ctx.drawImage(image, 283 + s.frame * 32, s.direction * 32, 32, 32, 0, 0, 32, 32);
                        const person = ctx.getImageData(0, 0, 32, 32).data;
                        for (let i = 0; i < tile.length; i += 4) { tile[i] |= person[i]; tile[i + 1] |= person[i + 1]; tile[i + 2] |= person[i + 2]; }
                    }
                    const rendered = actual.getImageData(14 + index % 11 * 32, 14 + Math.floor(index / 11) * 32, 32, 32).data;
                    if (tile.every((value, index) => value === rendered[index])) matched++;
                });
                return matched;
            });
            assert.equal(pixelCheck, 99, 'Every tile must match native pixels');
            await page.locator('.pk32-soko4').screenshot({ path: path.join(output, width + '-initial.png') });
            const frame = await page.evaluate(() => window.__soko4Test.getState().frame);
            await page.waitForFunction(frame => window.__soko4Test.getState().frame !== frame, frame);
            for (const direction of ['up', 'right', 'down']) {
                await page.locator('[data-direction=' + direction + ']').click();
                model.move(first, direction); await sameBoard(page, first);
            }
            assert.equal(first.won, true);
            await page.locator('.pk32-soko4').screenshot({ path: path.join(output, width + '-won.png') });
            assert.equal(await page.getByRole('dialog', { name: '\u8fc7\u5173' }).isVisible(), true);
            const wonFrame = await page.evaluate(() => window.__soko4Test.getState().frame);
            await page.waitForTimeout(650);
            assert.equal(await page.evaluate(() => window.__soko4Test.getState().frame), wonFrame);
            await page.getByRole('button', { name: '\u786e\u5b9a', exact: true }).click();
            await page.getByRole('button', { name: '\u64a4\u9500', exact: true }).click();
            assert.equal(await page.evaluate(() => window.__soko4Test.getState().won), false);
            await page.waitForFunction(frame => window.__soko4Test.getState().frame !== frame, wonFrame);
            await page.getByRole('button', { name: '\u91cd\u5f00\u672c\u5173', exact: true }).click();
            await sameBoard(page, model.createState(data.levels[0]));
            await page.locator('body').press('ArrowUp');
            const keyboardExpected = model.createState(data.levels[0]); model.move(keyboardExpected, 'up');
            await sameBoard(page, keyboardExpected);
            for (let index = 0; index < 3; index++) {
                await page.locator('.pk32-soko4 select').selectOption(String(index));
                if (index === 0) await page.evaluate(() => {
                    const b = document.querySelector('.pk32-soko4 button[aria-label="\u539f\u7248\u6f14\u793a"]');
                    b.addEventListener('click', () => { window.__demoStarted = performance.now(); }, { once: true, capture: true });
                });
                await page.getByRole('button', { name: '\u539f\u7248\u6f14\u793a', exact: true }).click();
                if (index === 0) {
                    await page.waitForFunction(() => window.__soko4Test.getState().moves > 0);
                    const elapsed = await page.evaluate(() => performance.now() - window.__demoStarted);
                    assert.ok(elapsed >= 580 && elapsed < 1400, 'Native 600 ms initial demo cadence: ' + elapsed);
                }
                await page.waitForFunction(() => window.__soko4Test.getState().won && !window.__soko4Test.getState().demonstrating);
                assert.equal(await page.getByRole('dialog', { name: '\u8fc7\u5173' }).isVisible(), false, 'Demo suppresses victory acknowledgement');
            }
            await page.getByRole('button', { name: '\u539f\u7248\u6f14\u793a', exact: true }).click();
            await page.getByRole('button', { name: '\u91cd\u5f00\u672c\u5173', exact: true }).click();
            await page.waitForTimeout(600);
            await sameBoard(page, model.createState(data.levels[2]));
            for (let index = 0; index < data.levels.length; index++) {
                await page.locator('.pk32-soko4 select').selectOption(String(index));
                await sameBoard(page, model.createState(data.levels[index]));
                const geometry = await canvas.boundingBox();
                assert.ok(geometry.x >= 0 && geometry.x + geometry.width <= width + 1, 'Board within viewport');
            }
            await page.getByRole('button', { name: '\u4e0b\u4e00\u5173', exact: true }).click();
            assert.equal(await page.locator('.pk32-soko4 select').inputValue(), '0', 'Level 23 wraps to 1');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
            const state = await page.evaluate(() => window.__soko4Test.getState());
            await page.getByRole('button', { name: '\u8fd4\u56de PK32 \u76ee\u5f55', exact: true }).click();
            const stopped = await page.evaluate(() => window.__soko4Test.getState());
            assert.deepEqual(stopped.cells, state.cells);
            assert.equal(stopped.player, state.player);
            await page.waitForTimeout(600);
            assert.equal(await canvas.count(), 0);
            assert.deepEqual(await page.evaluate(() => window.__soko4Test.getState()), stopped, 'Stopped timer must not animate');
            // A fetch resolving after return must not resurrect the game.
            let release;
            const gate = new Promise(resolve => { release = resolve; });
            await page.route('**/data/pk32-sokoban4-levels.json', async route => { await gate; await route.continue(); });
            const pending = page.waitForRequest('**/data/pk32-sokoban4-levels.json');
            await entry.locator('button').click(); await pending;
            await page.getByRole('button', { name: '\u8fd4\u56de PK32 \u76ee\u5f55', exact: true }).click();
            release();
            await page.waitForTimeout(300);
            assert.equal(await canvas.count(), 0);
            await page.unroute('**/data/pk32-sokoban4-levels.json');
            await page.evaluate(() => {
                window.__soko4Gallery.stop();
                window.__casualMenu = window.PK32Casual.start(document.querySelector('#soko4-gallery'), {});
            });
            const standalone = page.locator('[data-pk32-casual="\u63a8\u7bb1\u5b50\u56db"]');
            await standalone.click();
            await page.waitForFunction(() => document.querySelector('[data-role=sokoban4-board]')?.dataset.ready === 'true');
            await page.getByRole('button', { name: '\u8fd4\u56de PK32 \u7eb8\u724c\u4e0e\u76ca\u667a', exact: true }).click();
            const closedStandalone = await page.evaluate(() => window.__soko4Test.getState());
            await page.waitForTimeout(600);
            assert.deepEqual(await page.evaluate(() => window.__soko4Test.getState()), closedStandalone);
            await standalone.click();
            await page.waitForFunction(() => document.querySelector('[data-role=sokoban4-board]')?.dataset.ready === 'true');
            await page.evaluate(() => window.__casualMenu.stop());
            const stoppedStandalone = await page.evaluate(() => window.__soko4Test.getState());
            await page.waitForTimeout(600);
            assert.deepEqual(await page.evaluate(() => window.__soko4Test.getState()), stoppedStandalone);
            assert.equal(await canvas.count(), 0);
            assert.deepEqual(errors, []);
            results.push({ width, nativePixelTiles: pixelCheck, levelsLoaded: 23, nativeFirstLevelDemo: '123', nativeDemoReplays: 3, victoryFreezesAnimation: true, wrapsLastLevel: true, standaloneMenuCleanedUp: true, won: true, stoppedFetchAndTimer: true });
            await context.close();
        }
    } finally {
        await browser.close();
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ scope: 'sokoban4-gallery-native-data-first-level-and-lifecycle', fullGameRulesVerified: false, results }, null, 2));
    }
    console.log(JSON.stringify({ viewports: results.length, levelLoads: results.length * 23, fullGameRulesVerified: false, output }));
})().catch(error => { console.error(error); process.exitCode = 1; });
