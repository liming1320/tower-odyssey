// Native atlas/geometry checks in a real browser; this is not a full rules certification.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/playwright');
const saveKey = 'pk32-richman-save-picform13-v2';

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 950 }, deviceScaleFactor: 1 });
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('http://127.0.0.1:5180');
        await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#eee}#host{width:100%}</style></head><body><main id="host"></main></body></html>');
        await page.addScriptTag({ path: path.join(root, 'public/js/minigames/pk32-richman.js') });
        const initial = await page.evaluate(async () => {
            localStorage.setItem('pk32-richman-save-v1', 'legacy-save-must-survive');
            window.game = PK32Richman.start(document.querySelector('#host'));
            window.atlas = new Image(); atlas.src = '/img/pk32/original/sheet-de1b36.png'; await atlas.decode();
            return game.getState();
        });
        await page.waitForSelector('canvas[data-ready=true]');
        assert.equal(initial.players.length, 4);
        async function pixelCheck(label) {
            const png = await page.locator('canvas').screenshot();
            const result = await page.evaluate(async ({ png }) => {
                const s = game.getState();
                const expected = document.createElement('canvas'); expected.width = 698; expected.height = 452;
                const ctx = expected.getContext('2d'); ctx.imageSmoothingEnabled = false;
                const blit = (sx, sy, w, h, x, y) => ctx.drawImage(atlas, sx, sy, w, h, x, y, w, h);
                blit(0, 195, 698, 452, 0, 0);
                const track = [], houses = [];
                for (let k = 0; k < 10; k++) track.push([534 - k * 41, 411]);
                for (let k = 0; k < 10; k++) track.push([124, 411 - k * 41]);
                for (let k = 0; k < 10; k++) track.push([124 + k * 41, 1]);
                for (let k = 0; k < 10; k++) track.push([534, 1 + k * 41]);
                houses.push([657, 411]);
                for (let k = 0; k < 9; k++) houses.push([493 - k * 41, 288]);
                for (let k = 0; k < 11; k++) houses.push([1, 411 - k * 41]);
                for (let k = 0; k < 9; k++) houses.push([165 + k * 41, 124]);
                for (let k = 0; k < 10; k++) houses.push([657, 1 + k * 41]);
                track.forEach((p, i) => {
                    blit(1067, 195, 40, 40, ...p);
                    blit(698 + (s.own[i] + 1) * 41, 196 + (s.own[i] < 0 ? 0 : s.buildings[i]) * 41, 40, 40, ...houses[i]);
                });
                [[448, 179], [243, 179], [243, 220], [243, 261]].forEach(([x, y], id) => {
                    const digits = Math.min(99999999, Math.max(0, Math.floor(s.players[id].cash))).toString().padStart(8, ' ');
                    [...digits].forEach((digit, i) => blit(985 + (digit === ' ' ? 10 : Number(digit)) * 8, 360 + 13 * id, 8, 13, x + i * 8, y));
                });
                [[333, 169], [333, 210], [333, 251], [374, 210]].forEach(p => blit(1077, 203, 32, 32, ...p));
                s.dice.forEach((die, i) => blit(1077, 203 + die * 32, 32, 32, 333 + 41 * i, 210));
                [0, 1, 2, 3].filter(id => id !== s.turn).concat(s.turn).forEach(id => {
                    if (!s.players[id].out) blit(903 + Math.floor(s.players[id].pos / 10) * 41, 196 + id * 41, 40, 40, ...track[s.players[id].pos]);
                });
                const actual = new Image(); actual.src = 'data:image/png;base64,' + png; await actual.decode();
                const canvas = document.createElement('canvas'); canvas.width = 698; canvas.height = 452;
                canvas.getContext('2d').drawImage(actual, 0, 0);
                const a = canvas.getContext('2d').getImageData(0, 0, 698, 452).data;
                const b = ctx.getImageData(0, 0, 698, 452).data;
                let differentPixels = 0;
                for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) differentPixels++;
                return { width: actual.width, height: actual.height, differentPixels };
            }, { png: png.toString('base64') });
            assert.deepEqual(result, { width: 698, height: 452, differentPixels: 0 }, label);
            return { label, ...result };
        }
        const pixelChecks = [await pixelCheck('initial')];
        // Roll 1+4 to a real station, then buy through the visible controls.
        await page.evaluate(() => { const values = [0, 0.5]; Math.random = () => values.length ? values.shift() : 0; });
        await page.getByRole('button', { name: '掷骰子', exact: true }).click();
        let s = await page.evaluate(() => game.getState());
        assert.equal(s.players[0].pos, 5); assert.equal(s.phase, 'buy');
        await page.getByRole('button', { name: '购买当前地产', exact: true }).click();
        await page.waitForFunction(() => game.getState().round === 2);
        s = await page.evaluate(() => game.getState());
        assert.equal(s.own[5], 0); assert.equal(s.players[0].cash, 700); // Three birthday events each collect 100.
        assert.equal(s.turn, 0); assert.equal(s.phase, 'roll');
        assert(s.players.slice(1).every(p => p.pos === 2));
        pixelChecks.push(await pixelCheck('purchase-and-four-player-turn'));
        await page.getByRole('button', { name: '建造', exact: true }).click();
        assert.equal(await page.evaluate(() => game.getState().buildings[5]), 1);
        await page.getByRole('button', { name: '存档', exact: true }).click();
        const saved = await page.evaluate(() => { const s = game.getState(); game.destroy(); game = PK32Richman.start(document.querySelector('#host')); return { before: s, after: game.getState(), legacy: localStorage.getItem('pk32-richman-save-v1') }; });
        assert.deepEqual(saved.after, saved.before); assert.equal(saved.legacy, 'legacy-save-must-survive');
        await page.waitForSelector('canvas[data-ready=true]');
        pixelChecks.push(await pixelCheck('load-with-house'));
        // Fixtures cover all 40 positions, four sprite directions, owners, and house levels.
        for (let step = 0; step < 10; step++) {
            await page.evaluate(({ initial, step, saveKey }) => {
                game.destroy(); const s = structuredClone(initial);
                s.players.forEach((p, id) => { p.pos = id * 10 + step; p.cash = 12345678 - id * 1000000; });
                for (let i = 0; i < 40; i++) { s.own[i] = i % 4; s.buildings[i] = i % 5; }
                s.dice = [1 + step % 6, 6 - step % 6];
                localStorage.setItem(saveKey, JSON.stringify(s)); game = PK32Richman.start(document.querySelector('#host'));
            }, { initial, step, saveKey });
            await page.waitForSelector('canvas[data-ready=true]');
            pixelChecks.push(await pixelCheck('track-fixture-' + step));
        }
        await page.screenshot({ path: path.join(output, 'pk32-richman-native-desktop.png'), fullPage: true });
        const viewports = [];
        for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(viewport);
            const layout = await page.evaluate(() => {
                const r = document.querySelector('.pk32-rh-board').getBoundingClientRect();
                return { width: r.width, height: r.height, overflow: document.documentElement.scrollWidth > innerWidth,
                    cells: document.querySelectorAll('.pk32-rh-cell').length,
                    inside: [...document.querySelectorAll('.pk32-rh-cell')].every(c => { const p = c.getBoundingClientRect(); return p.left >= r.left && p.top >= r.top && p.right <= r.right + 0.1 && p.bottom <= r.bottom + 0.1; }) };
            });
            assert.equal(layout.overflow, false); assert.equal(layout.cells, 40); assert.equal(layout.inside, true);
            assert(Math.abs(layout.width / layout.height - 698 / 452) < 0.01);
            await page.locator('[data-cell="39"]').click();
            assert.match(await page.locator('.pk32-rh-log').textContent(), /长生北路.*4000/);
            await page.screenshot({ path: path.join(output, `pk32-richman-native-${viewport.width}.png`), fullPage: true });
            viewports.push({ viewport, board: layout });
        }
        await page.setViewportSize({ width: 320, height: 740 });
        await page.getByRole('button', { name: '放大棋盘', exact: true }).click();
        const zoom = await page.evaluate(() => ({ target: document.querySelector('.pk32-rh-cell').getBoundingClientRect().width, overflow: document.documentElement.scrollWidth > innerWidth, localScroll: document.querySelector('.pk32-rh-board-wrap').scrollWidth > document.querySelector('.pk32-rh-board-wrap').clientWidth }));
        assert.equal(zoom.target, 80); assert.equal(zoom.overflow, false); assert.equal(zoom.localScroll, true);
        await page.getByRole('combobox', { name: '选择地块' }).selectOption('1');
        assert.match(await page.locator('.pk32-rh-log').textContent(), /解放路.*600/);
        await page.getByRole('button', { name: '缩小棋盘', exact: true }).click();
        async function fixture(change) {
            await page.evaluate(({ initial, saveKey, change }) => {
                game.destroy(); const s = structuredClone(initial);
                if (change === 'bankrupt') { s.players[0].pos = 7; s.players[0].cash = 1; s.own[9] = 1; }
                if (change === 'jail') { s.players[0].pos = 28; s.cards[0] = []; }
                if (change === 'invalid') delete s.dice;
                localStorage.setItem(saveKey, JSON.stringify(s)); Math.random = () => 0;
                game = PK32Richman.start(document.querySelector('#host'));
            }, { initial, saveKey, change });
            await page.waitForSelector('canvas[data-ready=true]');
        }
        await fixture('bankrupt');
        await page.getByRole('button', { name: '掷骰子', exact: true }).click();
        assert.equal(await page.evaluate(() => game.getState().phase), 'over');
        assert.match(await page.locator('.pk32-rh-status').textContent(), /破产.*结束/);
        await page.getByRole('button', { name: '重开', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: '掷骰子', exact: true }).isEnabled(), true);
        await fixture('jail');
        await page.getByRole('button', { name: '掷骰子', exact: true }).click();
        assert.equal(await page.evaluate(() => game.getState().players[0].pos), 10);
        assert.match(await page.locator('.pk32-rh-log').textContent(), /^坐牢/);
        await fixture('invalid');
        assert.deepEqual(await page.evaluate(() => game.getState().dice), [1, 1]);
        await page.route('**/img/pk32/original/sheet-de1b36.png', route => route.abort());
        await page.evaluate(() => { game.destroy(); game = PK32Richman.start(document.querySelector('#host')); });
        await page.getByRole('button', { name: '重试加载', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: '掷骰子', exact: true }).isEnabled(), false);
        await page.unroute('**/img/pk32/original/sheet-de1b36.png');
        await page.getByRole('button', { name: '重试加载', exact: true }).click();
        await page.waitForSelector('canvas[data-ready=true]');
        assert.equal(await page.getByRole('button', { name: '掷骰子', exact: true }).isEnabled(), true);
        assert.deepEqual(errors, []);
        const report = { pixelChecks, viewports, zoom, interactionPassed: true, failureRecoveryPassed: true, rulesComplete: false, comparison: 'native atlas and recovered blit formulas; not a full original-window comparison', errors };
        fs.writeFileSync(path.join(output, 'pk32-richman-art-verification.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report));
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
