'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const data = require('../public/data/pk32-burst-balls-levels.json');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';

function widthFor(cells) {
  return cells.length === 192 ? 12 : cells.length === 40 ? 8 : 6;
}

function groupAt(cells, width, start) {
  const color = cells[start];
  if (color === '0') return [];
  const found = [];
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const index = queue.shift();
    found.push(index);
    const x = index % width;
    const y = Math.floor(index / width);
    [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
      if (nx < 0 || nx >= width || ny < 0 || ny >= Math.ceil(cells.length / width)) return;
      const next = ny * width + nx;
      if (!seen.has(next) && cells[next] === color) {
        seen.add(next);
        queue.push(next);
      }
    });
  }
  return found;
}

function compact(cells, width) {
  const height = Math.ceil(cells.length / width);
  for (let x = 0; x < width; x += 1) {
    const column = [];
    for (let y = height - 1; y >= 0; y -= 1) {
      if (cells[y * width + x] !== '0') column.push(cells[y * width + x]);
    }
    for (let y = height - 1; y >= 0; y -= 1) {
      cells[y * width + x] = column[height - 1 - y] || '0';
    }
  }
  for (let x = 0; x < width;) {
    const empty = Array.from({ length: height }, (_, y) => cells[y * width + x] === '0').every(Boolean);
    if (!empty) {
      x += 1;
      continue;
    }
    for (let from = x + 1; from < width; from += 1) {
      for (let y = 0; y < height; y += 1) cells[y * width + from - 1] = cells[y * width + from];
    }
    for (let y = 0; y < height; y += 1) cells[y * width + width - 1] = '0';
  }
}

function allGroups(cells, width) {
  const groups = [];
  const seen = new Set();
  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index] === '0' || seen.has(index)) continue;
    const group = groupAt(cells, width, index);
    group.forEach(item => seen.add(item));
    groups.push(group);
  }
  return groups;
}

function solvedPath(raw, width, maxNodes = 60000) {
  const initial = raw.split('');
  const memo = new Set();
  let nodes = 0;
  function visit(cells) {
    nodes += 1;
    if (!cells.some(value => value !== '0')) return [];
    if (nodes > maxNodes || memo.has(cells.join(''))) return null;
    memo.add(cells.join(''));
    for (const group of allGroups(cells, width).filter(item => item.length >= 2)) {
      const next = cells.slice();
      group.forEach(index => { next[index] = '0'; });
      compact(next, width);
      const tail = visit(next);
      if (tail) return [group[0], ...tail];
    }
    return null;
  }
  return visit(initial);
}

function physicsCandidate() {
  for (let level = 0; level < data.levels.length; level += 1) {
    const raw = data.levels[level].cells;
    const width = widthFor(raw);
    const before = raw.split('');
    for (const group of allGroups(before, width).filter(item => item.length >= 2)) {
      const after = before.slice();
      group.forEach(index => { after[index] = '0'; });
      compact(after, width);
      const hadVerticalHole = group.some(index => index < raw.length - width && before[index + width] !== '0');
      const emptyColumns = Array.from({ length: width }, (_, x) =>
        after.every((value, index) => index % width !== x || value === '0'));
      if (hadVerticalHole && emptyColumns.some(Boolean)) return { level, width, index: group[0], before, after };
    }
  }
  return null;
}

async function launch(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PK32Variants && window.PK32Variants.startGame);
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'pk32-burst-edge-host';
    document.body.appendChild(host);
    window.__burstEdge = window.PK32Variants.startGame(host, '爆破彩球', {});
  });
  await page.waitForSelector('.pk32v-native-data [data-cell]');
}

async function selectLevel(page, level) {
  await page.locator('select[aria-label="爆破彩球原生关卡"]').selectOption(String(level));
  await page.waitForFunction(expected => {
    const select = document.querySelector('select[aria-label="爆破彩球原生关卡"]');
    return select && Number(select.value) === expected;
  }, level);
}

async function snapshot(page) {
  return page.locator('.pk32v-native-data [data-cell]').evaluateAll(nodes => nodes.map(node => ({
    value: node.dataset.value,
    background: getComputedStyle(node).backgroundColor,
    color: getComputedStyle(node).color,
    disabled: node.disabled
  })));
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await launch(page);
    assert.equal(await page.locator('select[aria-label="爆破彩球原生关卡"] option').count(), data.levels.length, 'native level count');

    const initial = await snapshot(page);
    const nonEmpty = initial.filter(cell => cell.value !== '0');
    assert.ok(nonEmpty.length > 0, 'real non-empty board');
    assert.ok(new Set(nonEmpty.map(cell => cell.value)).size >= 2, 'native board has multiple colors');
    assert.ok(new Set(nonEmpty.map(cell => cell.background + '|' + cell.color)).size >= 2, 'each color is visibly rendered');

    const candidate = physicsCandidate();
    assert.ok(candidate, 'found a native move that exercises gravity and column compression');
    await selectLevel(page, candidate.level);
    const beforeMove = await snapshot(page);
    const group = groupAt(candidate.before, candidate.width, candidate.index);
    assert.ok(group.length >= 2, 'selectable group contains at least two balls');
    await page.locator('[data-cell="' + candidate.index + '"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.pk32v-native-data [data-cell]').length > 0);
    const afterMove = await snapshot(page);
    assert.equal(afterMove.filter(cell => cell.value !== '0').length, beforeMove.filter(cell => cell.value !== '0').length - group.length, 'group removal count');
    assert.deepEqual(afterMove.map(cell => cell.value), candidate.after, 'gravity and horizontal empty-column compression');

    const singletonLevel = data.levels.findIndex(item => {
      const raw = item.cells;
      return allGroups(raw.split(''), widthFor(raw)).some(itemGroup => itemGroup.length === 1);
    });
    assert.ok(singletonLevel >= 0, 'found a native singleton');
    await selectLevel(page, singletonLevel);
    const singleton = await snapshot(page);
    const singletonIndex = allGroups(singleton.map(cell => cell.value), widthFor(data.levels[singletonLevel].cells)).find(item => item.length === 1)[0];
    await page.locator('[data-cell="' + singletonIndex + '"]').click();
    assert.deepEqual((await snapshot(page)).map(cell => cell.value), singleton.map(cell => cell.value), 'single ball is not removable');

    const noMoveLevel = data.levels.findIndex(item => allGroups(item.cells.split(''), widthFor(item.cells)).every(itemGroup => itemGroup.length === 1));
    assert.ok(noMoveLevel >= 0, 'found a native no-move board');
    await selectLevel(page, noMoveLevel);
    assert.match(await page.locator('.pk32v-prompt').textContent(), /失败|结束|无可消除/, 'no-move failure prompt');

    let completionLevel = -1;
    let path = null;
    for (let level = 0; level < data.levels.length && !path; level += 1) {
      path = solvedPath(data.levels[level].cells, widthFor(data.levels[level].cells));
      if (path) completionLevel = level;
    }
    assert.ok(path && completionLevel >= 0, 'found a natively solvable board');
    await selectLevel(page, completionLevel);
    for (const index of path) await page.locator('[data-cell="' + index + '"]').click();
    assert.match(await page.locator('.pk32v-status').textContent(), /完成/, 'clearing the board completes the game');
    assert.deepEqual(errors, [], 'page runtime errors');
    console.log(JSON.stringify({ passed: true, levelCount: data.levels.length, physicsLevel: candidate.level + 1, completionLevel: completionLevel + 1 }));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
