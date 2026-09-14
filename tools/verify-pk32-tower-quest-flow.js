'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const output = path.resolve(__dirname, '../output/playwright/pk32-tower-quest');
const image = fs.readFileSync(path.resolve(__dirname, '../output/pk32-reference/module.bin'));
const route = 'U11 R5 U7 L8 R8 D7 L6 U5 L2 D1 U1 L2 D1 U1 R4 D5 R6 U7 L10 D9 U1 R3 U2 L4 U3 R1 U4 L1';
const directions = { U: 'up', D: 'down', L: 'left', R: 'right' };
const shieldRoute = [
  { dir: 'R1 D4 R1 D1 R4 D1 R1 D2 L1 D2 R2 U1 D1 L2 U2 R1 U2 L1 U3 L1 U3', buy: [1], stats: [498, 30, 13, 11, 23, 1, 1, 0] },
  { dir: 'D2 R1 D3 R2 U5 R2 D9 U9 L2 D10 L2 U1 L2 D1 L2 U6 D6 R6 U10 R2 D10 U8 L2 D5 L1 D2 R1 L1 U2 L1 U3 L1 U3', buy: [1, 1], stats: [842, 38, 13, 1, 47, 4, 1, 0] },
  { dir: 'D2 R1 D3 R2 U5 R2 D9 U9 L2 D10 L6 U10 L2 D10 R1 D1 R2 U4 D4 L3 U9 R2 D10 R6 U10 R2 D10 U8 L2 D5 L2 U3 L1 U3', buy: [0], stats: [950, 38, 13, 10, 68, 2, 1, 0] },
  { dir: 'D2 R1 D2 L4 U1 L2 D3 R4 D2 L3 D1 L1 U9 R9 D7 L6 U5 L3 D3 U3 R3 D3 R4 U3 L2 D1 R2 D2 L4 D2 R6 U7 L10 D9 U1 R3 U2 L4 U3 R2 D1 R4 D1 R2 U5 R2 D9 U9 L2 D10 L6 U10 L2 D10 R1 D1 R2 U5 L1 U5 D5 R1 D5 L3 U9 R2 D10 R6 U10 R2 D10 U8 L2 D5 L2 U3 L1 U3', buy: [1, 1], stats: [701, 49, 13, 2, 96, 2, 1, 0] },
  { dir: 'D2 R1 D3 R2 U5 R2 D9 U9 L2 D10 L6 U10 L2 D10 R1 D1 R2 U5 L1 U2 L2 D3 U3 R2 D2 R1 D5 L3 U9 R2 D10 R6 U10 R2 D10 U8 L2 D5 L2 U1 L4 U1 L2 D3 R4 D2 L3 D1 L1 U9 R9 D7 L6 U5 L3 D3 L1 D1 R1 D2 L1 D1 R1 L1 D1 R1 U8 R3 D5 R6 U7 L10 D9 U1 R3 U2 L4 U3 R1 U3 L1 D1 R1 D2 R1 D1 R4 D1 R1 D3 U3 R1 U5 R2 D9 U9 L2 D10 L6 U10 L2 D10 R1 D1 R4 U1 D1 L2 U5 R4 U1 R3 L1 U1 D1 L2 D1 L4 D5 L3 U9 R2 D10 R6 U10 R2 D10 U8 L2 D5 L2 U3 L1 U3', buy: [1, 1], stats: [843, 60, 19, 2, 129, 2, 1, 0] },
  { dir: 'D2 R1 D3 R2 U5 R2 D9 U9 L2 D10 L6 U10 L2 D10 R1 D1 R2 U5 L1 U2 L2 U3 D3 R2 D2 R1 D5 L3 U9 R2 D10 R6 U10 R2 D10 U8 L2 D5 L2 U1 L4 U1 L2 D3 R4 D2 L3 D1 L1 U9 R9 D7 L6 U5 L3 D7 R1 D1 U2 L1 U6 R3 D5 R6 U7 L10 D9 U1 R3 U2 L4 U3 R1 U4 R1 L2 D1 R1 D3 R1 D1 R4 D1 R2 U5 R2 D9 U9 L2 D10 L6 U10 L2 D10 R1 D1 R4 U3 R2 D2 R2 D1 L1 D1 L4 U2 L2 U2 L1 D1 R1 D1 R2 D2 L1 R1 D1 R4 L2 U2 L2 D3 L2 U5 R4 U2 R1 U2 L3 D1 L1 D1', buy: [], stats: [540, 63, 32, 33, 152, 2, 3, 0] }
];
function nativePages(first, count) {
  return Array.from({ length: count }, (_, i) => {
    const at = first + i * 47;
    assert.equal(image[at], 0x68); assert.equal(image[at + 5], 0xe8);
    const p = image.readUInt32LE(at + 1) - 0x400000;
    return image.subarray(p, p + image.readUInt32LE(p - 4)).toString('utf16le');
  });
}
const jackText = nativePages(0x17336d5, 10), elderText = nativePages(0x173458f, 5), merchantText = nativePages(0x1734da0, 5);
const guards = { '172cd00': '6a28', '175880f': 'c78540ffffff08000000', '17593af': '66c704720000', '1733896': '894858', '173465d': '83c146', '1734e6e': '83c155', '1735091': '66c704700000' };
for (const [rva, bytes] of Object.entries(guards)) {
  const at = parseInt(rva, 16), expected = Buffer.from(bytes, 'hex');
  assert.deepEqual(image.subarray(at, at + expected.length), expected, rva);
}
const results = [];
function check(name, passed, detail) { results.push({ name, passed: !!passed, detail }); assert.ok(passed, name + ': ' + JSON.stringify(detail)); }
const state = page => page.evaluate(() => window.__towerQuest.getState());
async function dismiss(page) { for (let i = 0; i < 40 && await page.locator('[data-role=dialog]').isVisible(); i++) await page.locator('[data-role=dialog-close]').click(); }
async function walk(page, steps) {
  for (const step of steps.split(' ')) {
    for (let i = 0; i < Number(step.slice(1)); i++) await page.locator('[data-dir=' + directions[step[0]] + ']').click();
  }
}
async function fixture(page, layer, x, y) {
  await page.evaluate(({ layer, x, y }) => {
    const game = window.__towerQuest;
    game.restart(); while (game.state.dialog) game.dismissDialog();
    game.state.layer = layer; game.state.x = x; game.state.y = y; game.render();
  }, { layer, x, y });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 844 }, isMobile: width < 500, hasTouch: width < 500 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base); await page.waitForFunction(() => window.PK32Tower && window.MiniGames.pk32);
      const id = await page.evaluate(() => {
        const start = window.PK32Tower.startUI;
        window.PK32Tower.startUI = (...args) => window.__towerQuest = start(...args);
        SettingsView.openPk32();
        return window.PK32Catalog.find(row => row.name === '\u9b54\u5854').id;
      });
      await page.locator('[data-pk32-launch="' + id + '"]').click();
      await dismiss(page); await page.locator('[data-dir=up]').click(); await dismiss(page);
      // This route begins at new-game stats and uses UI input only: no teleport or bonus fixtures.
      await walk(page, route);
      const sword = await state(page);
      check(width + ': natural new-game to floor-three sword', sword.layer === 3 && sword.x === 0 && sword.y === 0 && sword.inventory.sword === '31', sword);
      check(width + ': natural route resources', sword.hp === 230 && sword.attack === 23 && sword.defense === 10 && sword.gold === 21 && sword.experience === 14, sword);
      check(width + ': sword sprite in equipment', await page.locator('[data-equipment=sword] [data-sprite-code="31"]').count() === 1);
      await page.screenshot({ path: path.join(output, width + '-natural-sword.png') });
      for (let segment = 0; segment < shieldRoute.length; segment++) {
        const step = shieldRoute[segment];
        await walk(page, step.dir);
        for (const offer of step.buy) await page.locator('[data-shop-buy="' + offer + '"]').click();
        if (step.buy.length) await page.locator('[data-role=shop-close]').click();
        const progress = await state(page);
        const actual = [progress.hp, progress.attack, progress.defense, progress.gold, progress.experience, progress.keys.yellow, progress.keys.blue, progress.keys.red];
        check(width + ': natural shield route checkpoint ' + (segment + 1), JSON.stringify(actual) === JSON.stringify(step.stats), progress);
        check(width + ': natural shield route position ' + (segment + 1), segment < 5 ? progress.layer === 3 && progress.x === 5 && progress.y === 1 : progress.layer === 5 && progress.x === 4 && progress.y === 3, progress);
        console.log(JSON.stringify({ width, naturalShieldCheckpoint: segment + 1, hp: progress.hp }));
      }
      const shield = await state(page);
      check(width + ': natural new-game to both original equipment tiles', shield.inventory.sword === '31' && shield.inventory.shield === '35' && shield.inventory.book === true, shield.inventory);
      check(width + ': iron shield art in equipment', await page.locator('[data-equipment=shield] [data-sprite-code="35"]').count() === 1);
      await page.locator('[data-role=grid]').evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
      check(width + ': entire shield map can be scrolled into view', await page.locator('[data-role=grid]').evaluate(el => {
        const map = el.getBoundingClientRect(), stage = document.querySelector('#pk32-stage').getBoundingClientRect();
        return map.top >= stage.top && map.bottom <= innerHeight && map.left >= 0 && map.right <= innerWidth;
      }));
      await page.screenshot({ path: path.join(output, width + '-natural-shield.png') });
      // Focused quest fixtures are recorded separately from the natural sword walkthrough.
      await page.clock.install({ time: new Date('2026-09-14T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-09-14T00:00:01Z'));
      await fixture(page, 4, 5, 3);
      const beforeDoor = await state(page);
      await page.locator('[data-dir=up]').click();
      check(width + ': iron door starts without keys or clearing guards', (await state(page)).door?.index === 27 && !(await state(page)).cleared['4:27']);
      await page.clock.runFor(120);
      const moving = await state(page);
      check(width + ': native 40ms door frame cadence', moving.door.step === 3);
      check(width + ': native door slides down 4px each frame', await page.locator('[data-role=door-frame]').evaluate(el => el.style.transform) === 'translateY(37.5%)');
      if (width === 1280) {
        const tile = page.locator('.pk32-tower-tile').nth(27);
        await tile.scrollIntoViewIfNeeded();
        const bounds = await tile.boundingBox();
        check('native-size door layout is exactly 32px square', bounds.width === 32 && bounds.height === 32, bounds);
        // Locator screenshots round fractional document bounds outward; exclude the extra fringe row.
        const screenshot = await page.screenshot({ clip: { x: Math.floor(bounds.x), y: Math.floor(bounds.y), width: 32, height: 32 } });
        const pixels = await page.evaluate(async base64 => {
          const atlas = new Image(), actual = new Image();
          atlas.src = '/img/pk32/original/sheet-915611.png'; actual.src = 'data:image/png;base64,' + base64;
          await Promise.all([atlas.decode(), actual.decode()]);
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(atlas, 0, 0, 32, 32, 0, 0, 32, 32);
          ctx.drawImage(atlas, 297, 0, 32, 20, 0, 12, 32, 20);
          const expected = ctx.getImageData(0, 0, 32, 32).data;
          ctx.clearRect(0, 0, 32, 32); ctx.drawImage(actual, 0, 0);
          const rendered = ctx.getImageData(0, 0, 32, 32).data;
          return { width: actual.width, height: actual.height, equal: expected.every((v, i) => v === rendered[i]) };
        }, screenshot.toString('base64'));
        check('native-size base-frame door pixels match original blit', pixels.width === 32 && pixels.height === 32 && pixels.equal, pixels);
      }
      await page.locator('[data-dir=left]').click();
      check(width + ': input locked during door animation', (await state(page)).x === beforeDoor.x && (await state(page)).y === beforeDoor.y);
      await page.locator('[data-role=save]').click();
      await page.locator('[data-role=restart]').click();
      await page.clock.runFor(400);
      check(width + ': restart cancels pending door callback', !(await state(page)).cleared['4:27']);
      await page.locator('[data-role=load]').click();
      check(width + ': load resumes exact door frame', (await state(page)).door.step === 3);
      await page.clock.runFor(200);
      const opened = await state(page);
      check(width + ': eighth tick clears only target door', opened.door === null && opened.cleared['4:27'] === true && Object.keys(opened.cleared).length === 1);
      check(width + ': opening does not advance or consume keys', opened.x === beforeDoor.x && opened.y === beforeDoor.y && JSON.stringify(opened.keys) === JSON.stringify(beforeDoor.keys));
      check(width + ': door completion restores keyboard focus', await page.evaluate(() => document.activeElement === window.__towerQuest.container));
      await page.keyboard.press('ArrowUp');
      check(width + ': mouse-opened door allows keyboard continuation', (await state(page)).x === 5 && (await state(page)).y === 2);
      await page.locator('[data-dir=up]').click();
      await page.locator('[data-dir=up]').click();
      const talking = await state(page);
      check(width + ': Jack native dialogue opens behind iron door', JSON.stringify(talking.dialogPages) === JSON.stringify(jackText));
      check(width + ': floor-two gate stays closed until dialogue finishes', !talking.cleared['2:67']);
      await page.locator('[data-role=dialog-close]').click();
      await page.locator('[data-role=save]').click();
      await page.locator('[data-role=restart]').click(); await page.locator('[data-role=load]').click();
      check(width + ': pending quest survives save-load', (await state(page)).dialogEvent === 'jack-rescue' && (await state(page)).dialogIndex === 1);
      await dismiss(page);
      const rescued = await state(page);
      check(width + ': Jack unlocks only floor-two mystery gate', rescued.cleared['2:67'] && !rescued.cleared['2:96'] && !rescued.cleared['2:98']);
      check(width + ': Jack remains and hero stays adjacent', rescued.x === 5 && rescued.y === 1 && await page.locator('[data-sprite-code="73"]').count() === 1);
      // Free sword gift must be atomic and cannot be farmed by revisiting its original map cell.
      await fixture(page, 2, 7, 9);
      await page.evaluate(() => { window.__towerQuest.state.inventory.compass = true; window.__towerQuest.render(); });
      await page.locator('[data-dir=down]').click();
      check(width + ': elder native five-page sword gift', JSON.stringify((await state(page)).dialogPages) === JSON.stringify(elderText));
      check(width + ': gift not granted during dialogue', (await state(page)).attack === 10);
      check(width + ': compass locked during gift dialogue', await page.locator('[data-role=layer]').isDisabled());
      await page.locator('[data-role=layer]').evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('change', { bubbles: true })); });
      check(width + ': queued floor change cannot bypass dialogue lock', (await state(page)).layer === 2 && (await state(page)).attack === 10);
      await dismiss(page);
      const gifted = await state(page);
      check(width + ': native free sword +70 and elder disappears', gifted.attack === 80 && gifted.gold === 0 && gifted.inventory.qingfengSword && gifted.cleared['2:117']);
      await page.locator('[data-dir=down]').click(); await page.locator('[data-dir=up]').click(); await page.locator('[data-dir=down]').click();
      check(width + ': gift cannot repeat', (await state(page)).attack === 80 && !(await state(page)).dialog);
      await page.screenshot({ path: path.join(output, width + '-elder-gift.png') });
      await fixture(page, 2, 9, 9);
      await page.locator('[data-dir=down]').click();
      check(width + ': merchant native five-page shield gift', JSON.stringify((await state(page)).dialogPages) === JSON.stringify(merchantText));
      check(width + ': shield not granted during dialogue', (await state(page)).defense === 10 && !(await state(page)).cleared['2:119']);
      await page.locator('[data-role=dialog-close]').click();
      await page.locator('[data-role=save]').click(); await page.locator('[data-role=restart]').click(); await page.locator('[data-role=load]').click();
      check(width + ': pending shield gift survives save-load', (await state(page)).dialogEvent === 'merchant-shield' && (await state(page)).dialogIndex === 1);
      await dismiss(page);
      const shieldGift = await state(page);
      check(width + ': native free shield +85 and merchant disappears', shieldGift.defense === 95 && shieldGift.gold === 0 && shieldGift.inventory.goldenShield && shieldGift.cleared['2:119']);
      check(width + ': shield giver does not move hero', shieldGift.x === 9 && shieldGift.y === 9);
      check(width + ': shield gift equipment name', await page.locator('[data-equipment=shield]').innerText() === '\u9ec4\u91d1\u76fe');
      await page.locator('[data-role=save]').click(); await page.locator('[data-role=load]').click();
      await page.locator('[data-dir=down]').click(); await page.locator('[data-dir=up]').click(); await page.locator('[data-dir=down]').click();
      check(width + ': shield gift cannot repeat after save-load', (await state(page)).defense === 95 && !(await state(page)).dialog);
      await page.screenshot({ path: path.join(output, width + '-merchant-gift.png') });
      await fixture(page, 4, 5, 3); await page.locator('[data-dir=up]').click();
      await page.locator('#pk32-back').click();
      const stopped = await state(page); await page.clock.runFor(400);
      check(width + ': exit cancels door timers', JSON.stringify(await state(page)) === JSON.stringify(stopped));
      check(width + ': no runtime errors', errors.length === 0, errors);
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ scope: 'natural-sword-and-shield-route-and-separate-native-quest-fixtures', naturalSwordRoute: route, naturalShieldRoute: shieldRoute, naturalShieldRouteVerified: [320, 390, 1280].every(width => results.some(r => r.name === width + ': natural new-game to both original equipment tiles' && r.passed)), fullGameRulesVerified: false, results }, null, 2));
  }
  console.log(JSON.stringify({ passed: results.length, fullGameRulesVerified: false, output }));
})().catch(e => { console.error(e); process.exitCode = 1; });
