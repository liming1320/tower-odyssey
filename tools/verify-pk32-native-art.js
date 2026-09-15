// Isolated browser checks against the native dispatch table and original atlas.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', 'playwright');
const evidence = require('../output/pk32-reference/native-index.json');

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const failures = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
        page.on('pageerror', error => failures.push(error.message));
        await page.goto('http://127.0.0.1:5180');
        await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0e1015}#host{width:100%}</style></head><body><main id="host"></main></body></html>');
        await page.addScriptTag({ path: path.join(root, 'public/js/minigames/pk32-tower.js') });
        await page.evaluate(async () => {
            window.atlas = new Image();
            atlas.src = '/img/pk32/original/sheet-915611.png';
            await atlas.decode();
        });
        const pixelChecks = [];
        for (const floor of evidence.towerFloorDispatch.maps) {
            const state = await page.evaluate(floor => {
                if (window.game) game.destroy();
                game = PK32Tower.startUI(document.querySelector('#host'), { layer: floor.floor });
                if (PK32Tower.maps[floor.floor] !== floor.text) throw new Error('Native floor data mismatch');
                const buttons = [...document.querySelectorAll('.pk32-tower-tile')];
                if (buttons.length !== 121 || buttons.some(b => b.textContent !== '')) throw new Error('Missing original tiles');
                return game.getState();
            }, floor);
            while (await page.locator('[data-role=dialog-close]').isVisible().catch(() => false)) {
                await page.locator('[data-role=dialog-close]').click();
            }
            const shot = await page.locator('[data-role=grid]').screenshot();
            const check = await page.evaluate(async ({ png, floor, state }) => {
                const screenshot = new Image(); screenshot.src = 'data:image/png;base64,' + png; await screenshot.decode();
                const expected = document.createElement('canvas'); expected.width = expected.height = 352;
                const ctx = expected.getContext('2d'); ctx.imageSmoothingEnabled = false;
                for (let i = 0; i < 121; i++) {
                    const code = i === state.y * 11 + state.x ? 76 : Number(floor.text.slice(i * 2, i * 2 + 2));
                    ctx.drawImage(atlas, code % 18 * 33, Math.floor(code / 18) * 66, 32, 32, i % 11 * 32, Math.floor(i / 11) * 32, 32, 32);
                }
                const actual = document.createElement('canvas'); actual.width = actual.height = 352;
                actual.getContext('2d').drawImage(screenshot, 0, 0);
                const a = actual.getContext('2d').getImageData(0, 0, 352, 352).data;
                const b = ctx.getImageData(0, 0, 352, 352).data;
                let differentPixels = 0;
                for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) differentPixels++;
                return { floor: floor.floor, width: screenshot.width, height: screenshot.height, differentPixels };
            }, { png: shot.toString('base64'), floor, state });
            pixelChecks.push(check);
            assert.deepEqual([check.width, check.height, check.differentPixels], [352, 352, 0], 'Native pixels: ' + JSON.stringify(check));
            if (floor.floor === 1) await page.screenshot({ path: path.join(output, 'pk32-tower-native-desktop.png') });
        }
        const interaction = await page.evaluate(() => {
            game.destroy(); game = PK32Tower.startUI(document.querySelector('#host'), { layer: 0 });
            const initial = game.getState();
            while (game.getState().dialog) game.dismissDialog();
            game.move(0, -1); const fairy = game.getState();
            while (game.getState().dialog) game.dismissDialog();
            game.move(0, -1); game.move(0, -1); const door = game.getState();
            const reopened = door;
            for (let i = 0; i < 7; i++) game.move(0, -1);
            const upstairs = game.getState();
            const stairs = game.layers[1].cells.indexOf('11');
            const direction = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => upstairs.x + dx === stairs % 11 && upstairs.y + dy === Math.floor(stairs / 11));
            if (direction) game.move(...direction);
            const downstairs = game.getState();
            // A fixture at a real source key checks repeat visits and storage, not inferred combat rules.
            game.state.layer = 1; const key = game.layers[1].cells.findIndex((code, index) => code === '16' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
                const x = index % 11 + dx, y = Math.floor(index / 11) + dy;
                return x >= 0 && x < 11 && y >= 0 && y < 11 && game.layers[1].cells[y * 11 + x] === '00';
            }));
            game.state.x = key % 11; game.state.y = Math.floor(key / 11);
            const neighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => {
                const x = game.state.x + dx, y = game.state.y + dy;
                return x >= 0 && x < 11 && y >= 0 && y < 11 && game.layers[1].cells[y * 11 + x] === '00';
            });
            if (!neighbor) throw new Error('No adjacent floor for key fixture');
            game.move(...neighbor); const beforeKey = game.getState();
            game.move(-neighbor[0], -neighbor[1]); const picked = game.getState();
            game.move(...neighbor); game.move(-neighbor[0], -neighbor[1]); const revisited = game.getState();
            game.save(); game.restart(); game.load(); const loaded = game.getState();
            return { initial, fairy, door, reopened, upstairs, downstairs, beforeKey, picked, revisited, loaded };
        });
        assert.deepEqual([interaction.initial.hp, interaction.initial.attack, interaction.initial.defense], [1000, 10, 10]);
        assert.equal(interaction.fairy.layer, 0);
        assert.equal(interaction.door.keys.yellow, 0);
        assert.equal(interaction.reopened.y, 7);
        assert.equal(interaction.upstairs.layer, 1);
        assert.equal(interaction.downstairs.layer, 0);
        assert.equal(interaction.picked.keys.yellow, interaction.beforeKey.keys.yellow + 1);
        assert.equal(interaction.revisited.keys.yellow, interaction.picked.keys.yellow);
        assert.deepEqual(interaction.loaded, interaction.revisited);
        const pickups = await page.evaluate(() => {
            const result = [];
            for (let code = 19; code <= 37; code++) {
                game.destroy(); game = PK32Tower.startUI(document.querySelector('#host'), { layer: 1 });
                const text = String(code), layer = game.layers.findIndex(l => l.cells.includes(text));
                if (layer < 0) throw new Error('No native item: ' + text);
                const before = game.getState(), after = structuredClone(before);
                if (!PK32Tower.originalPickup(after, text)) throw new Error('No native pickup rule: ' + text);
                result.push({ code, before, after, revisit: structuredClone(after), sprite: document.querySelector('[data-code="' + text + '"]')?.dataset.spriteCode });
            }
            game.destroy(); game = PK32Tower.startUI(document.querySelector('#host'), { layer: 5 });
            game.state.x = 0; game.state.y = 1; game.move(0, -1); const keyAfter = game.getState();
            game.state.x = 0; game.state.y = 1; game.move(0, -1);
            if (game.getState().keys.yellow !== keyAfter.keys.yellow) throw new Error('Repeated native pickup was not consumed');
            game.destroy(); game = PK32Tower.startUI(document.querySelector('#host'), { layer: 3 });
            while (game.getState().dialog) game.dismissDialog();
            const index = game.layers[3].cells.findIndex((code, i) => code === '38' && i >= 11 && game.layers[3].cells[i - 11] === '00'), enemyX = index % 11, enemyY = Math.floor(index / 11);
            game.state.x = enemyX; game.state.y = enemyY - 1;
            game.move(0, 1); const battle = game.getState();
            return { items: result, battle };
        });
        for (const item of pickups.items) {
            assert.deepEqual(item.revisit, item.after, 'Repeated item ' + item.code);
            const s = item.after;
            if (item.code === 19) {
                assert.equal(s.keys.red, item.before.keys.red + 1);
                assert.equal(s.keys.blue, item.before.keys.blue + 1);
                assert.equal(s.keys.yellow, item.before.keys.yellow + 1);
                assert.equal(s.keys.green, item.before.keys.green);
            }
            if (item.code === 20) assert.equal(s.hp, 1200);
            if (item.code === 21) assert.equal(s.hp, 1500);
            if (item.code === 22) assert.equal(s.hp, 2000);
            if (item.code === 23) assert.deepEqual([s.hp, s.attack, s.defense, s.level], [2000, 17, 17, 2]);
            if (item.code === 24) assert.deepEqual([s.hp, s.attack, s.defense, s.level], [4000, 31, 31, 4]);
            if (item.code >= 25 && item.code <= 28) assert.equal(Object.values(s.inventory)[0], true);
            if (item.code === 29) assert.equal(s.gold, 300);
            if (item.code >= 30 && item.code <= 33) assert.equal(s.attack, [13, 20, 50, 160][item.code - 30]);
            if (item.code >= 34) assert.equal(s.defense, [13, 20, 40, 200][item.code - 34]);
        }
        assert.deepEqual([pickups.battle.hp, pickups.battle.gold, pickups.battle.experience], [955, 2, 1]);
        const viewports = [];
        for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(viewport);
            await page.evaluate(() => { game.destroy(); game = PK32Tower.startUI(document.querySelector('#host'), { layer: 1 }); });
            const layout = await page.evaluate(() => {
                const grid = document.querySelector('[data-role=grid]');
                const r = grid.getBoundingClientRect();
                const tiles = [...grid.children].map(n => n.getBoundingClientRect());
                return { width: r.width, height: r.height, overflow: document.documentElement.scrollWidth > innerWidth,
                         squareTiles: tiles.every(t => Math.abs(t.width - t.height) < 1), sprites: grid.querySelectorAll('[data-sprite-code]').length };
            });
            assert.equal(layout.overflow, false); assert.equal(layout.squareTiles, true); assert.equal(layout.sprites, 121);
            viewports.push({ viewport, grid: layout });
            await page.screenshot({ path: path.join(output, `pk32-tower-native-${viewport.width}.png`), fullPage: true });
        }
        assert.deepEqual(failures, []);
        const report = { pixelChecks, viewports, interaction, pickups, rulesComplete: false, errors: failures };
        fs.writeFileSync(path.join(output, 'pk32-native-art-verification.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ pixelVerifiedFloors: pixelChecks.length, pixelMismatches: 0, viewports, interactionPassed: true, rulesComplete: false }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
