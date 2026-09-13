const assert = require('assert/strict');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = [], results = [];
    try {
        const page = await browser.newPage();
        page.on('pageerror', e => errors.push(e.message));
        for (const viewport of [{ width: 1000, height: 950 }, { width: 390, height: 844 }]) {
            await page.setViewportSize(viewport);
            await page.goto('http://127.0.0.1:5180');
            await page.waitForFunction(() => window.MiniGames && MiniGames.pk32 && window.PK32Tower && window.PK32Richman);
            // Keep the real page's styles and loaded scripts; enter through the real PK32 catalog.
            await page.evaluate(() => {
                [...document.body.children].forEach(node => { node.style.display = 'none'; });
                const host = document.createElement('main'); host.id = 'entry-host'; document.body.appendChild(host);
                MiniGames.pk32.start(document.querySelector('#entry-host'));
            });
            for (const id of ['pk32-120', 'pk32-099']) {
                await page.locator('[data-pk32-launch="' + id + '"]').click();
                if (id === 'pk32-099') await page.waitForSelector('canvas[data-ready=true]');
                else await page.evaluate(async () => { const image = new Image(); image.src = '/img/pk32/original/sheet-915611.png'; await image.decode(); });
                const layout = await page.evaluate(id => {
                    const selector = id === 'pk32-099' ? '.pk32-rh-board' : '[data-role=grid]';
                    const board = document.querySelector(selector).getBoundingClientRect();
                    return { id, width: board.width, height: board.height, overflow: document.documentElement.scrollWidth > innerWidth,
                        hasPlaceholders: !!document.querySelector('.pk32-rh-center') || [...document.querySelectorAll('.pk32-tower-tile')].some(c => c.textContent !== '') };
                }, id);
                assert.equal(layout.overflow, false); assert.equal(layout.hasPlaceholders, false);
                if (id === 'pk32-120') assert(Math.abs(layout.width - layout.height) < 1);
                else assert(Math.abs(layout.width / layout.height - 698 / 452) < .01);
                await page.screenshot({ path: path.resolve(__dirname, '../output/playwright', `pk32-entry-${id}-${viewport.width}.png`), fullPage: true });
                results.push({ viewport, ...layout });
                await page.getByRole('button', { name: '返回 PK32 目录', exact: true }).click();
            }
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ catalogEntryPassed: true, results, errors }));
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
