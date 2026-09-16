'use strict';

const assert = require('node:assert/strict');
let chromium = null;
try { ({ chromium } = require('playwright')); }
catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    require('./verify-pk32-evidence-cdp');
}

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';

if (chromium) (async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(base);
        await page.waitForFunction(() => window.MiniGames && window.MiniGames.pk32 && window.PK32Evidence);
        await page.evaluate(() => {
            [...document.body.children].forEach(node => { node.style.display = 'none'; });
            const host = document.createElement('main');
            host.id = 'pk32-evidence-test-host';
            document.body.appendChild(host);
            window.__pk32EvidenceSession = window.MiniGames.pk32.start(host, {});
        });
        await page.waitForFunction(() => document.querySelectorAll('[data-pk32-evidence]').length === 213);
        const catalog = await page.evaluate(() => ({
            evidenceButtons: document.querySelectorAll('[data-pk32-evidence]').length,
            dedicatedButtons: document.querySelectorAll('[data-pk32-launch],[data-pk32-module],[data-pk32-puzzle],[data-pk32-variant]').length,
            overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth
        }));
        assert.equal(catalog.evidenceButtons, 213);
        assert.equal(catalog.dedicatedButtons, 40);
        assert.equal(catalog.overflow, false);

        const slotRecord = await page.evaluate(() => window.PK32Catalog.find(record => record.name === '\u8001\u864e\u673a'));
        const slotEntry = page.locator('[data-pk32-id="' + slotRecord.id + '"]');
        assert.equal(await slotEntry.locator('button').count(), 1);
        await slotEntry.locator('[data-pk32-evidence]').click();
        await page.waitForSelector('.pk32-evidence-payload');
        const evidence = await page.evaluate(() => ({
            text: document.querySelector('.pk32-evidence').textContent,
            payloadLength: document.querySelector('.pk32-evidence-payload').textContent.length,
            fakeGame: !!document.querySelector('.pk32v-game,.pk32p,.pk32-board-ui'),
            overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth
        }));
        assert.match(evidence.text, /语义与规则未验证/);
        assert.ok(evidence.payloadLength > 0);
        assert.equal(evidence.fakeGame, false);
        assert.equal(evidence.overflow, false);

        await page.getByRole('button', { name: '返回 PK32 目录', exact: true }).click();
        assert.equal(await page.locator('[data-pk32-evidence]').count(), 213);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ catalog, evidence, returnedToCatalog: true, errors }));
    } finally {
        await page.evaluate(() => window.__pk32EvidenceSession && window.__pk32EvidenceSession.stop()).catch(() => {});
        await browser.close();
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
