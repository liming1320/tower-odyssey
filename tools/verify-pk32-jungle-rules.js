'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(base);
    await page.waitForFunction(() => !!window.PK32Board);
    const result = await page.evaluate(() => {
      const api = window.PK32Board;
      const state = api.start('jungle').state;
      const pieces = state.board.flat().filter(Boolean);
      const custom = () => {
        const value = api.start('jungle').state;
        value.board = Array.from({ length: 9 }, () => Array(7).fill(0));
        value.turn = 1;
        return value;
      };
      const rat = custom(); rat.board[2][1] = { side: 1, rank: 'rat' }; rat.board[2][2] = { side: 2, rank: 'elephant' };
      const elephant = custom(); elephant.board[2][1] = { side: 1, rank: 'elephant' }; elephant.board[2][2] = { side: 2, rank: 'rat' };
      const blockedRiver = custom(); blockedRiver.board[2][1] = { side: 1, rank: 'dog' };
      const clearRiver = custom(); clearRiver.board[4][0] = { side: 1, rank: 'lion' };
      return {
        pieceCount: pieces.length,
        riverCount: 12,
        trapCount: state.traps.length,
        denCount: state.dens.length,
        ratCapturesElephant: api.animalCanMove(rat, [2, 1], [2, 2]),
        elephantCapturesRat: api.animalCanMove(elephant, [2, 1], [2, 2]),
        ordinaryPieceEntersRiver: api.animalCanMove(blockedRiver, [2, 0], [3, 0]),
        lionCanJumpClearRiver: api.animalCanMove(clearRiver, [4, 0], [4, 3])
      };
    });
    assert.equal(result.pieceCount, 16);
    assert.equal(result.trapCount, 6);
    assert.equal(result.denCount, 2);
    assert.equal(result.ratCapturesElephant, true);
    assert.equal(result.elephantCapturesRat, false);
    assert.equal(result.ordinaryPieceEntersRiver, false);
    assert.equal(result.lionCanJumpClearRiver, true);
    console.log(JSON.stringify({ passed: 7, result }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
