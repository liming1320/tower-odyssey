'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const output = path.resolve(__dirname, '../output/playwright/pk32-richman-flow');
const results = [];
function check(name, passed, detail) {
  results.push({ name, passed: !!passed, detail });
  assert.ok(passed, name + ': ' + JSON.stringify(detail));
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, isMobile: width === 390, hasTouch: width === 390 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.waitForFunction(() => !!window.PK32Richman);
      await page.evaluate(() => {
        const host = document.createElement('div'); host.id = 'richman-flow-host';
        host.style.cssText = 'position:absolute;inset:0;min-height:100%;background:#fff;z-index:2147483647';
        document.body.appendChild(host); Math.random = () => 0.8;
        window.__richmanFlow = window.PK32Richman.start(host, {});
        window.__richmanFlow.restart();
        window.__richmanSamples = [];
        window.__richmanSampler = setInterval(() => window.__richmanSamples.push(window.__richmanFlow.getState()), 20);
      });
      await page.locator('canvas[data-ready=true]').waitFor();
      const initial = await page.evaluate(() => window.__richmanFlow.getState());
      check(width + ': native 40-cell module and 50000 cash', await page.locator('.pk32-rh-cell').count() === 40 && initial.players.every(player => player.cash === 50000), initial);
      check(width + ': one human and three AI players', await page.locator('[data-controller=human]').count() === 1 && await page.locator('[data-controller=ai]').count() === 3);
      await page.getByLabel('\u79fb\u52a8\u901f\u5ea6').selectOption('360');
      await page.locator('[data-cell="5"]').click();
      check(width + ': location selection does not clear speed', await page.getByLabel('\u79fb\u52a8\u901f\u5ea6').inputValue() === '360' && await page.getByLabel('\u9009\u62e9\u5730\u5757').inputValue() === '5');
      await page.getByRole('button', { name: '\u63b7\u9ab0\u5b50', exact: true }).click();
      check(width + ': cannot buy during movement', await page.getByRole('button', { name: '\u8d2d\u4e70\u5f53\u524d\u5730\u4ea7', exact: true }).isDisabled());
      await page.waitForFunction(() => window.__richmanFlow.getState().phase === 'buy');
      const moving = await page.evaluate(() => window.__richmanSamples.filter(s => s.phase === 'moving' && s.turn === 0).map(s => s.players[0].pos));
      check(width + ': all five intermediate cells are observable', [1, 2, 3, 4, 5].every(position => moving.includes(position)), moving);
      check(width + ': speed survives movement renders', await page.getByLabel('\u79fb\u52a8\u901f\u5ea6').inputValue() === '360');
      const landed = await page.evaluate(() => window.__richmanFlow.getState());
      check(width + ': single die lands on cell five', landed.dice.length === 1 && landed.dice[0] === 5 && landed.players[0].pos === 5, landed);
      check(width + ': property purchase enabled after landing', await page.getByRole('button', { name: '\u8d2d\u4e70\u5f53\u524d\u5730\u4ea7', exact: true }).isEnabled());
      const bought = await page.evaluate(() => {
        [...document.querySelectorAll('.pk32-rh-actions button')].find(button => button.textContent === '\u8d2d\u4e70\u5f53\u524d\u5730\u4ea7').click();
        return window.__richmanFlow.getState();
      });
      check(width + ': buying transfers property and deducts 2000', bought.own[5] === 0 && bought.players[0].cash === 48000, bought);
      const turns = [];
      for (const turn of [1, 2, 3]) {
        await page.waitForFunction(turn => { const s = window.__richmanFlow.getState(); return s.turn === turn && s.phase === 'moving'; }, turn);
        const dice = await page.evaluate(async turn => {
          const canvas = document.querySelector('.pk32-rh-canvas'), state = window.__richmanFlow.getState();
          const image = new Image(); image.src = '/img/pk32/original/sheet-de1b36.png'; await image.decode();
          const expected = document.createElement('canvas'); expected.width = 32; expected.height = 32;
          const ctx = expected.getContext('2d'); ctx.drawImage(image, 1077, 203 + state.dice[0] * 32, 32, 32, 0, 0, 32, 32);
          const [x, y] = [[333, 169], [333, 210], [333, 251], [374, 210]][turn];
          const actualPixels = canvas.getContext('2d').getImageData(x, y, 32, 32).data;
          const expectedPixels = ctx.getImageData(0, 0, 32, 32).data;
          return { turn: state.turn, matches: actualPixels.every((value, index) => value === expectedPixels[index]) };
        }, turn);
        turns.push(dice);
        await page.screenshot({ path: path.join(output, width + '-ai-' + turn + '.png'), fullPage: true });
      }
      check(width + ': dice pixels follow each AI portrait', turns.every((row, index) => row.turn === index + 1 && row.matches), turns);
      await page.waitForFunction(() => { const s = window.__richmanFlow.getState(); return s.turn === 0 && s.round === 2 && s.phase === 'roll'; });
      check(width + ': all AI turns finish', true);
      await page.getByRole('button', { name: '\u63b7\u9ab0\u5b50', exact: true }).click();
      await page.getByRole('button', { name: '\u91cd\u5f00', exact: true }).click();
      await page.waitForTimeout(2200);
      const reset = await page.evaluate(() => window.__richmanFlow.getState());
      check(width + ': restart cancels old movement and AI timers', reset.round === 1 && reset.phase === 'roll' && reset.players.every(player => player.pos === 0 && player.cash === 50000), reset);
      check(width + ': viewport has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      check(width + ': no runtime errors', errors.length === 0, errors);
      await page.evaluate(() => { clearInterval(window.__richmanSampler); window.__richmanFlow.destroy(); });
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ scope: 'pk32-richman-turn-and-restart-flow', fullGameRulesVerified: false, results }, null, 2));
  }
  console.log(JSON.stringify({ passed: results.length, fullGameRulesVerified: false, output }));
})().catch(error => { console.error(error); process.exitCode = 1; });
