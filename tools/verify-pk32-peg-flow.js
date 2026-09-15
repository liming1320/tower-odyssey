'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => window.PK32Puzzle && window.MiniGames && window.MiniGames.pk32);
    const result = await page.evaluate(async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        window.PK32Puzzle.startGame(host, '独粒钻石');
        for (let i = 0; i < 100 && !host.querySelector('.native-cell'); i++) await new Promise(resolve => setTimeout(resolve, 20));
        const cells = [...host.querySelectorAll('.native-cell')];
        const occupied = i => cells[i].dataset.code === '1';
        let move = null;
        for (let i = 0; i < 49 && !move; i++) {
            if (!occupied(i)) continue;
            const row = Math.floor(i / 7), col = i % 7;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const middle = (row + dr) * 7 + col + dc;
                const target = (row + dr * 2) * 7 + col + dc * 2;
                if (row + dr * 2 >= 0 && row + dr * 2 < 7 && col + dc * 2 >= 0 && col + dc * 2 < 7 && occupied(middle) && cells[target].dataset.code === '0') {
                    move = { source: i, middle, target, sourceCode: cells[i].dataset.code };
                    break;
                }
            }
        }
        if (!move) throw new Error('No legal native peg move found');
        cells[move.source].click();
        host.querySelectorAll('.native-cell')[move.target].click();
        const after = [...host.querySelectorAll('.native-cell')];
        const status = host.querySelector('.msg').textContent;
        return { cells: after.length, move, source: after[move.source].dataset.code, middle: after[move.middle].dataset.code, target: after[move.target].dataset.code, status, level: status.indexOf('剩余棋子：') >= 0 };
    });
    assert.equal(result.cells, 49);
    assert.equal(result.source, '0');
    assert.equal(result.middle, '0');
    assert.equal(result.target, result.move.sourceCode);
    assert.equal(result.level, true);
    assert.deepEqual(errors, []);
    await browser.close();
    console.log(JSON.stringify({ game: '独粒钻石', nativeBoards: 17, legalMove: result.move, preservesPieceCode: true, errors }));
})().catch(error => { console.error(error); process.exitCode = 1; });
