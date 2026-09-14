'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const output = path.resolve(__dirname, '../output/playwright/pk32-tower-flow');
const nativeImage = fs.readFileSync(path.resolve(__dirname, '../output/pk32-reference/module.bin'));
function nativePages(first, count) {
  return Array.from({ length: count }, (_, index) => {
    const instruction = first + index * 0x2f;
    assert.equal(nativeImage[instruction], 0x68, 'Native dialogue BSTR push');
    assert.equal(nativeImage[instruction + 5], 0xe8, 'Native dialogue call');
    assert.equal(instruction + 10 + nativeImage.readInt32LE(instruction + 6), first + 10 + nativeImage.readInt32LE(first + 6), 'Same native dialogue routine');
    const address = nativeImage.readUInt32LE(instruction + 1) - 0x400000;
    assert.ok(address >= 4 && address < nativeImage.length);
    const length = nativeImage.readUInt32LE(address - 4);
    assert.ok(length > 0 && length % 2 === 0 && address + length <= nativeImage.length);
    const text = nativeImage.subarray(address, address + length).toString('utf16le');
    return text;
  });
}
const nativeOpening = nativePages(0x174bcc4, 5);
const nativeFairy = nativePages(0x1732727, 18);
const nativeRevisit = nativePages(0x1732f4a, 2);
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, passed: !!ok, detail });
  assert.ok(ok, name + ': ' + JSON.stringify(detail));
};

async function dismiss(page) {
  for (let i = 0; i < 40 && await page.locator('[data-role=dialog]').isVisible(); i++) {
    await page.locator('[data-role=dialog-close]').click();
  }
  assert.equal(await page.locator('[data-role=dialog]').isVisible(), false);
}

async function geometry(page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-role=grid]').getBoundingClientRect();
    const dialog = document.querySelector('[data-role=dialog]').getBoundingClientRect();
    const player = document.querySelector('[data-kind=player]').getBoundingClientRect();
    const fairy = document.querySelector('[data-sprite-code="72"]').getBoundingClientRect();
    const within = dialog.left >= grid.left - 1 && dialog.right <= grid.right + 1 && dialog.top >= grid.top - 1 && dialog.bottom <= grid.bottom + 1;
    const separate = r => dialog.right <= r.left || dialog.left >= r.right || dialog.bottom <= r.top || dialog.top >= r.bottom;
    return { within, playerVisible: separate(player), fairyVisible: separate(fairy), width: grid.width, overflow: document.documentElement.scrollWidth > innerWidth };
  });
}

async function walkTo(page, target) {
  const directions = await page.evaluate(target => {
    const s = window.__towerFlow.getState(), cells = [...document.querySelectorAll('.pk32-tower-tile')];
    const start = s.y * 11 + s.x, queue = [[start, []]], seen = new Set([start]);
    const steps = [[0, -1, 'up'], [1, 0, 'right'], [0, 1, 'down'], [-1, 0, 'left']];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const [index, route] = queue[cursor];
      if (index === target) return route;
      for (const [dx, dy, dir] of steps) {
        const x = index % 11 + dx, y = Math.floor(index / 11) + dy, next = y * 11 + x;
        if (x < 0 || x >= 11 || y < 0 || y >= 11 || seen.has(next)) continue;
        const cell = cells[next];
        if (['wall', 'npc', 'enemy'].includes(cell.dataset.kind)) continue;
        if (cell.dataset.kind === 'door') {
          const color = { '06': 'yellow', '07': 'blue', '08': 'red' }[cell.dataset.code];
          if (!color || !s.keys[color]) continue;
        }
        seen.add(next); queue.push([next, route.concat(dir)]);
      }
    }
    return null;
  }, target);
  assert.ok(directions, 'No walkable route to ' + target);
  for (const direction of directions) await page.locator('[data-dir=' + direction + ']').click();
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 768, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : width === 390 ? 844 : 960 }, hasTouch: width < 500, isMobile: width < 500 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.waitForFunction(() => !!window.PK32Tower && !!window.MiniGames.pk32);
      const towerId = await page.evaluate(() => {
        const start = window.PK32Tower.startUI;
        window.PK32Tower.startUI = function (...args) { return window.__towerFlow = start(...args); };
        SettingsView.openPk32();
        return window.PK32Catalog.find(row => row.name === '\u9b54\u5854').id;
      });
      await page.locator('[data-pk32-launch="' + towerId + '"]').click();
      check(width + ': production gallery mounts tower in full-screen stage', await page.locator('#pk32-stage [data-role=pk32-tower]').count() === 1);
      check(width + ': 121 tiles and one hero', await page.locator('.pk32-tower-tile').count() === 121 && await page.locator('.pk32-tower-tile[data-kind=player]').count() === 1);
      const opening = await page.locator('[data-role=dialog-text]').textContent();
      check(width + ': native opening', opening.includes('\u8fd9\u662f\u4e00\u4e2a\u5f88\u53e4\u8001\u7684\u6545\u4e8b'), opening);
      const openingPages = await page.evaluate(() => window.__towerFlow.getState().dialogPages);
      check(width + ': all five opening pages match native call order', JSON.stringify(openingPages) === JSON.stringify(nativeOpening));
      check(width + ': opening inside map', (await geometry(page)).within, await geometry(page));
      await page.screenshot({ path: path.join(output, width + '-opening.png'), fullPage: true });
      await dismiss(page);
      const beforeFairy = await page.evaluate(() => window.__towerFlow.getState());
      await page.locator('[data-dir=up]').click();
      check(width + ': fairy conversation opens', await page.locator('[data-role=dialog]').isVisible());
      const speaking = await page.evaluate(() => window.__towerFlow.getState());
      check(width + ': hero does not cover fairy', speaking.x === beforeFairy.x && speaking.y === beforeFairy.y);
      check(width + ': keys start at zero and are not granted mid-dialogue', ['red', 'blue', 'yellow'].every(color => speaking.keys[color] === 0));
      const geo = await geometry(page);
      check(width + ': fairy balloon visible and in bounds', geo.within && geo.playerVisible && geo.fairyVisible && !geo.overflow, geo);
      const visibleDialogue = await page.locator('[data-role=dialog]').evaluate(box => {
        const rect = box.getBoundingClientRect(), stage = document.querySelector('#pk32-stage').getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, stageTop: stage.top, viewportHeight: innerHeight };
      });
      check(width + ': fairy conversation actually inside visible phone viewport', visibleDialogue.top >= visibleDialogue.stageTop && visibleDialogue.bottom <= visibleDialogue.viewportHeight, visibleDialogue);
      await page.screenshot({ path: path.join(output, width + '-fairy.png'), fullPage: true });
      const lines = [await page.locator('[data-role=dialog-text]').textContent()];
      await page.locator('[data-role=dialog-close]').click();
      await page.locator('[data-role=save]').click();
      const pendingDialogue = await page.evaluate(() => window.__towerFlow.getState());
      await page.locator('[data-role=restart]').click();
      await page.locator('[data-role=load]').click();
      check(width + ': mid-dialogue save preserves pages and pending event', JSON.stringify(await page.evaluate(() => window.__towerFlow.getState())) === JSON.stringify(pendingDialogue));
      for (let i = 0; i < 40 && await page.locator('[data-role=dialog]').isVisible(); i++) {
        lines.push(await page.locator('[data-role=dialog-text]').textContent());
        check(width + ': dialogue page fits ' + i, (await geometry(page)).within);
        check(width + ': dialogue page visible without searching by scrolling ' + i, await page.locator('[data-role=dialog]').evaluate(box => {
          const rect = box.getBoundingClientRect(), stage = document.querySelector('#pk32-stage').getBoundingClientRect();
          return rect.top >= stage.top - 1 && rect.bottom <= innerHeight + 1;
        }));
        await page.locator('[data-role=dialog-close]').click();
      }
      check(width + ': original equipment directions', lines.some(line => line.includes('\u4e09\u697c') && line.includes('\u4e94\u697c') && line.includes('\u4e03\u697c')), lines);
      check(width + ': all 18 fairy lines match native call order', JSON.stringify(lines) === JSON.stringify(nativeFairy), lines);
      const gifted = await page.evaluate(() => window.__towerFlow.getState());
      check(width + ': native dialogue completion does not move the hero', gifted.x === beforeFairy.x && gifted.y === beforeFairy.y);
      check(width + ': one of each key after completed dialogue', ['red', 'blue', 'yellow'].every(color => gifted.keys[color] === 1), gifted.keys);
      check(width + ': fairy steps left and leaves passage open', await page.evaluate(() => {
        const g = window.__towerFlow;
        return g.cellCode(92) === '72' && g.cellCode(93) === '00' && g.layers[0].cells[93] === '72' && g.container.querySelectorAll('[data-sprite-code="72"]').length === 1;
      }));
      await walkTo(page, 5);
      check(width + ': entrance to floor one without state injection', (await page.evaluate(() => window.__towerFlow.getState())).layer === 1);
      await walkTo(page, 7 * 11 + 5);
      check(width + ': floor-one red door is passable', (await page.evaluate(() => window.__towerFlow.getState())).y === 7);
      await walkTo(page, 6);
      const beforeBattle = await page.evaluate(() => window.__towerFlow.getState());
      await page.locator('[data-dir=left]').click();
      const afterBattle = await page.evaluate(() => window.__towerFlow.getState());
      check(width + ': reachable first-floor combat resolves correctly', afterBattle.hp === beforeBattle.hp - 60 && afterBattle.gold === beforeBattle.gold + 1 && afterBattle.cleared['1:5'] === true, afterBattle);
      await page.locator('[data-role=save]').click();
      const saved = await page.evaluate(() => window.__towerFlow.getState());
      await page.locator('[data-role=restart]').click();
      check(width + ': new game starts at entrance', (await page.evaluate(() => window.__towerFlow.getState())).layer === 0);
      await page.locator('[data-role=load]').click();
      const loaded = await page.evaluate(() => window.__towerFlow.getState());
      check(width + ': save and load preserve inventory and position', JSON.stringify(loaded) === JSON.stringify(saved));
      await walkTo(page, 115);
      check(width + ': downstairs returns to entrance', (await page.evaluate(() => window.__towerFlow.getState())).layer === 0);
      await walkTo(page, 93);
      const beforeRevisitPosition = await page.evaluate(() => window.__towerFlow.getState());
      const beforeRevisit = await page.evaluate(() => window.__towerFlow.getState().keys);
      await page.locator('[data-dir=left]').click();
      check(width + ': ordinary fairy revisit matches native two-page dialogue', JSON.stringify(await page.evaluate(() => window.__towerFlow.getState().dialogPages)) === JSON.stringify(nativeRevisit));
      await dismiss(page);
      check(width + ': revisiting fairy cannot duplicate keys', JSON.stringify(await page.evaluate(() => window.__towerFlow.getState().keys)) === JSON.stringify(beforeRevisit));
      const revisited = await page.evaluate(() => window.__towerFlow.getState());
      check(width + ': revisiting fairy keeps the hero beside her', revisited.x === beforeRevisitPosition.x && revisited.y === beforeRevisitPosition.y);
      // Focused pickup fixtures use real map cells, not a claimed full-game walkthrough.
      const items = await page.evaluate(() => {
        const g = window.__towerFlow, api = window.PK32Tower;
        const result = [];
        function fixture(layer, x, y) {
          g.restart();
          while (g.state.dialog) g.dismissDialog();
          g.state.layer = layer; g.state.x = x; g.state.y = y; g.render();
        }
        fixture(1, 1, 3);
        g.move(1, 0);
        result.push({ kind: 'gem', attack: g.state.attack, label: g.container.querySelector('[data-equipment=sword]').textContent });
        fixture(3, 1, 0);
        g.move(-1, 0);
        result.push({ kind: 'sword', attack: g.state.attack, slot: g.state.inventory.sword, sprite: g.container.querySelector('[data-equipment=sword] [data-sprite-code]').dataset.spriteCode });
        g.move(1, 0); // Combat may block this fixture; re-enter the cleared pickup from the adjacent cell.
        g.state.x = 1; g.state.y = 0; g.move(-1, 0);
        result.push({ kind: 'sword-once', attack: g.state.attack });
        delete g.state.inventory.sword;
        g.save(); g.load();
        result.push({ kind: 'legacy-sword', sprite: g.container.querySelector('[data-equipment=sword] [data-sprite-code]').dataset.spriteCode });
        fixture(5, 5, 3);
        g.move(-1, 0);
        result.push({ kind: 'shield', defense: g.state.defense, slot: g.state.inventory.shield, sprite: g.container.querySelector('[data-equipment=shield] [data-sprite-code]').dataset.spriteCode });
        const source = api.maps.map((map, layer) => ({ layer, sword: map.match(/../g).indexOf('31'), shield: map.match(/../g).indexOf('35') })).filter(row => row.sword >= 0 || row.shield >= 0);
        return { result, source };
      });
      check(width + ': gems do not invent equipment', items.result[0].attack === 13 && items.result[0].label === '\u672a\u83b7\u5f97\u5251', items);
      check(width + ': sword pickup and sprite', items.result[1].attack === 20 && items.result[1].slot === '31' && items.result[1].sprite === '31', items);
      check(width + ': sword pickup cannot duplicate', items.result[2].attack === 20, items);
      check(width + ': legacy save restores equipment from cleared cells', items.result[3].sprite === '31', items);
      check(width + ': shield pickup and sprite', items.result[4].defense === 20 && items.result[4].slot === '35' && items.result[4].sprite === '35', items);
      check(width + ': native sword floor 3 and shield floor 5', items.source.some(row => row.layer === 3 && row.sword === 0) && items.source.some(row => row.layer === 5 && row.shield === 37), items.source);
      const sprites = await page.evaluate(async () => {
        const tile = document.querySelector('[data-sprite-code]');
        const image = new Image();
        image.src = getComputedStyle(tile).backgroundImage.slice(5, -2);
        await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        return ['31', '35', '72', '76'].map(code => {
          const sprite = window.PK32Tower.tileSprite(code);
          ctx.clearRect(0, 0, 32, 32); ctx.drawImage(image, sprite.x, sprite.y, 32, 32, 0, 0, 32, 32);
          const pixels = ctx.getImageData(0, 0, 32, 32).data, colors = new Set();
          for (let i = 0; i < pixels.length; i += 4) colors.add(Array.from(pixels.slice(i, i + 4)).join(','));
          return { code, colors: colors.size, width: image.naturalWidth, height: image.naturalHeight };
        });
      });
      check(width + ': native art loaded and sprite pixels are nonblank', sprites.every(sprite => sprite.colors > 4 && sprite.width === 593 && sprite.height === 1038), sprites);
      await page.screenshot({ path: path.join(output, width + '-shield.png'), fullPage: true });
      const edges = await page.evaluate(() => {
        const g = window.__towerFlow, results = [];
        for (const y of [0, 5, 10]) for (const x of [0, 5, 10]) {
          g.showDialog('Dialogue placement probe. '.repeat(12), { x, y });
          const grid = g.container.querySelector('[data-role=grid]').getBoundingClientRect();
          const box = g.container.querySelector('[data-role=dialog]').getBoundingClientRect();
          results.push(box.left >= grid.left && box.right <= grid.right && box.top >= grid.top && box.bottom <= grid.bottom);
        }
        return results;
      });
      check(width + ': dialogue clamped at all corners and map edges', edges.every(Boolean), edges);
      await page.setViewportSize({ width: width === 320 ? 390 : 320, height: 960 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const resized = await page.evaluate(() => {
        const grid = document.querySelector('[data-role=grid]').getBoundingClientRect(), box = document.querySelector('[data-role=dialog]').getBoundingClientRect();
        return box.left >= grid.left && box.right <= grid.right && box.top >= grid.top && box.bottom <= grid.bottom;
      });
      check(width + ': open dialogue repositions on resize', resized);
      check(width + ': no runtime errors', errors.length === 0, errors);
      await page.locator('#pk32-back').click();
      check(width + ': closing production gallery destroys tower', await page.locator('[data-role=pk32-tower]').count() === 0 && await page.evaluate(() => window.__towerFlow.handlers.length === 0));
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ scope: 'production-pk32-gallery-tower-opening-and-first-floor-flow', authenticationFlowVerified: false, equipmentFullWalkthroughVerified: false, fullGameRulesVerified: false, results }, null, 2));
  }
  console.log(JSON.stringify({ passed: results.length, fullGameRulesVerified: false, output }));
})().catch(error => { console.error(error); process.exitCode = 1; });
