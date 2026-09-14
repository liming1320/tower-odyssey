'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const output = path.resolve(__dirname, '../output/playwright/pk32-tower-shop');
const image = fs.readFileSync(path.resolve(__dirname, '../output/pk32-reference/module.bin'));
const guards = {
  '174509b': '83f919', '1745102': '83ea19', '17451fc': '81c220030000',
  '174562a': '83c204', '17456fd': '83790c64', '174542a': '81c2a00f0000',
  '1745856': '83c214', '172de1c': 'c78558ffffff03000000', '172df96': 'c78558ffffff0b000000',
  '1742f2e': '83f964', '1743089': '81c2e8030000', '1743167': '83c207', '1743243': '83c207',
  '1743713': '83fa1e', '1743879': '83c205', '174333a': '81f90e010000', '17433a8': '83c203',
  '17434a0': '81c2b80b0000', '174357e': '83c215', '174365a': '83c215', '1743952': '83f95f', '1743aae': '83c111'
};
for (const [rva, bytes] of Object.entries(guards)) {
  const at = parseInt(rva, 16), expected = Buffer.from(bytes, 'hex');
  assert.deepEqual(image.subarray(at, at + expected.length), expected, rva);
}
const nativeOffers = {
  3: { cost: image[0x174509d], hp: image.readUInt32LE(0x17451fe), attack: image[0x174562c], defense: image[0x174562c] },
  11: { cost: image[0x1745700], hp: image.readUInt32LE(0x174542c), attack: image[0x1745858], defense: image[0x1745858] }
};
const nativeExperience = {
  5: { levelCost: image[0x1742f30], level: 1, hp: image.readUInt32LE(0x174308b), attack: image[0x1743169], defense: image[0x1743245], abilityCost: image[0x1743715], ability: image[0x174387b] },
  13: { levelCost: image.readUInt32LE(0x174333c), level: image[0x17433aa], hp: image.readUInt32LE(0x17434a2), attack: image[0x1743580], defense: image[0x174365c], abilityCost: image[0x1743954], ability: image[0x1743ab0] }
};
const results = [];
function check(name, passed, detail) { results.push({ name, passed: !!passed, detail }); assert.ok(passed, name + ': ' + JSON.stringify(detail)); }
const state = page => page.evaluate(() => window.__towerShop.getState());
async function fixture(page, layer, gold) {
  await page.evaluate(({ layer, gold }) => {
    const game = window.__towerShop;
    game.restart(); while (game.state.dialog) game.dismissDialog();
    game.state.layer = layer; game.state.x = 5; game.state.y = layer === 3 ? 1 : 9;
    game.state.gold = gold; game.render();
  }, { layer, gold });
  await page.locator('[data-dir=up]').click();
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 768, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 844 }, isMobile: width < 500, hasTouch: width < 500 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base);
      await page.waitForFunction(() => window.PK32Tower && window.MiniGames.pk32);
      const id = await page.evaluate(() => {
        const start = window.PK32Tower.startUI;
        window.PK32Tower.startUI = (...args) => window.__towerShop = start(...args);
        SettingsView.openPk32();
        return window.PK32Catalog.find(row => row.name === '\u9b54\u5854').id;
      });
      await page.locator('[data-pk32-launch="' + id + '"]').click();
      for (const layer of [3, 11]) {
        const native = nativeOffers[layer], prefix = width + ':' + layer + ':';
        await fixture(page, layer, native.cost - 1);
        check(prefix + 'shop opens from adjacent native statue', await page.locator('[data-role=shop]').isVisible() && !(await state(page)).dialog);
        const before = await state(page);
        await page.locator('[data-dir=left]').click();
        check(prefix + 'movement blocked during shop', JSON.stringify(await state(page)) === JSON.stringify(before));
        check(prefix + 'insufficient funds disable all purchases', await page.locator('[data-shop-buy]:disabled').count() === 3);
        check(prefix + 'direct purchase also checks funds', await page.evaluate(() => window.__towerShop.buyShop(1)) === false);
        await page.locator('[data-role=shop-close]').click();
        const left = await state(page);
        check(prefix + 'leaving does not charge or move', left.gold === before.gold && left.x === before.x && left.y === before.y && left.shop === null);
        for (const [index, stat] of ['hp', 'attack', 'defense'].entries()) {
          await fixture(page, layer, native.cost);
          const initial = await state(page);
          await page.locator('[data-shop-buy="' + index + '"]').click();
          const purchased = await state(page);
          check(prefix + stat + ' exact-cost native bonus', purchased.gold === 0 && purchased[stat] === initial[stat] + native[stat]);
          check(prefix + stat + ' other stats unchanged', ['hp', 'attack', 'defense'].filter(s => s !== stat).every(s => initial[s] === purchased[s]));
          check(prefix + stat + ' no equipment invented', JSON.stringify(purchased.inventory) === JSON.stringify(initial.inventory));
          check(prefix + stat + ' cannot overspend', await page.evaluate(index => window.__towerShop.buyShop(index), index) === false);
        }
        await fixture(page, layer, native.cost * 3);
        for (let i = 0; i < 3; i++) await page.locator('[data-shop-buy="1"]').click();
        check(prefix + 'repeat price stays fixed', (await state(page)).gold === 0 && (await state(page)).attack === 10 + 3 * native.attack);
        await page.locator('[data-role=save]').click();
        const saved = await state(page);
        await page.locator('[data-role=restart]').click();
        await page.locator('[data-role=load]').click();
        check(prefix + 'save-load preserves open shop and transaction', JSON.stringify(await state(page)) === JSON.stringify(saved) && await page.locator('[data-role=shop]').isVisible());
        const bounds = await page.locator('[data-role=shop]').evaluate(panel => {
          const p = panel.getBoundingClientRect(), g = document.querySelector('[data-role=grid]').getBoundingClientRect(), s = document.querySelector('#pk32-stage').getBoundingClientRect();
          return { fitsMap: p.left >= g.left && p.right <= g.right && p.top >= g.top && p.bottom <= g.bottom + 1, visible: p.top >= s.top - 1 && p.bottom <= innerHeight + 1, noOverflow: document.documentElement.scrollWidth <= innerWidth };
        });
        check(prefix + 'shop fits map and phone viewport', bounds.fitsMap && bounds.visible && bounds.noOverflow, bounds);
        await page.screenshot({ path: path.join(output, width + '-floor-' + layer + '.png') });
        await page.locator('[data-role=shop-close]').press('Escape');
        check(prefix + 'Escape closes shop', (await state(page)).shop === null && await page.locator('[data-role=shop]').count() === 0);
        check(prefix + 'close retains bought stats', (await state(page)).attack === saved.attack && (await state(page)).gold === saved.gold);
      }
      for (const layer of [5, 13]) {
        const native = nativeExperience[layer], prefix = width + ':experience:' + layer + ':';
        for (const [index, stat] of ['level', 'attack', 'defense'].entries()) {
          const cost = index === 0 ? native.levelCost : native.abilityCost;
          await page.evaluate(({ layer, cost }) => {
            const g = window.__towerShop; g.restart(); while (g.state.dialog) g.dismissDialog();
            g.state.layer = layer; g.state.x = layer === 5 ? 1 : 4; g.state.y = layer === 5 ? 6 : 5;
            g.state.experience = cost; g.render();
          }, { layer, cost });
          await page.locator('[data-dir=down]').click();
          const before = await state(page);
          check(prefix + stat + ' elder opens experience shop', before.shop?.kind === 'experience' && !before.dialog);
          await page.locator('[data-shop-buy="' + index + '"]').click();
          const after = await state(page);
          check(prefix + stat + ' exact experience charge without gold', after.experience === 0 && after.gold === before.gold);
          for (const attribute of ['level', 'hp', 'attack', 'defense']) {
            const bonus = index === 0 ? native[attribute] : attribute === stat ? native.ability : 0;
            check(prefix + stat + ':' + attribute + ' native bonus', after[attribute] === before[attribute] + bonus);
          }
          check(prefix + stat + ' insufficient experience cannot repeat', await page.evaluate(index => window.__towerShop.buyShop(index), index) === false);
          await page.locator('[data-role=shop-close]').click();
          await page.locator('[data-dir=down]').click();
          check(prefix + stat + ' elder remains available', await page.locator('[data-role=shop]').isVisible() && !(await state(page)).cleared[layer + ':' + (layer === 5 ? 78 : 70)]);
          if (index === 2) await page.screenshot({ path: path.join(output, width + '-experience-' + layer + '.png') });
        }
      }
      await page.locator('#pk32-back').click();
      check(width + ': exit cleans up listeners', await page.evaluate(() => window.__towerShop.handlers.length === 0));
      check(width + ': no runtime errors', errors.length === 0, errors);
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ scope: 'native-gold-and-experience-shop-fixtures-through-production-gallery', naturalEquipmentWalkthroughVerified: false, fullGameRulesVerified: false, nativeOffers, nativeExperience, guards, results }, null, 2));
  }
  console.log(JSON.stringify({ passed: results.length, nativeInstructionGuards: Object.keys(guards).length, fullGameRulesVerified: false }));
})().catch(e => { console.error(e); process.exitCode = 1; });
