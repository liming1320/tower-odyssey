'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pk32-native-catalog.json')));
const source = fs.readFileSync(path.join(root, 'public/js/minigames/pk32.js'), 'utf8');
const match = source.match(/'([^']+)'\s*\r?\n\s*\)\.split\('\|'\);/);
assert.ok(match, 'PK32 main catalog list not found');
const names = match[1].split('|');
assert.equal(catalog.total, 213);
assert.equal(catalog.records.length, 213);
assert.equal(names.length, 213);
assert.equal(new Set(names).size, names.length);
assert.equal(new Set(catalog.records.map(record => record.name)).size, catalog.records.length);
const catalogNames = new Set(catalog.records.map(record => record.name));
const entryNames = new Set(names);
assert.deepEqual([...entryNames].filter(name => !catalogNames.has(name)), []);
assert.deepEqual([...catalogNames].filter(name => !entryNames.has(name)), []);
const dataFiles = fs.readdirSync(path.join(root, 'public/data')).filter(file => /^pk32-.*-levels\.json$/.test(file));
const nativeDataNames = new Set();
for (const file of dataFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'public/data', file), 'utf8'));
  if (data.assignmentVerified === false) continue;
  if (data.name) nativeDataNames.add(data.name);
}
const variantSource = fs.readFileSync(path.join(root, 'public/js/minigames/pk32-variants.js'), 'utf8');
const nativeRendererNames = new Set([...variantSource.matchAll(/config\.name === '([^']+)'/g)].map(item => item[1]));
[
  '魔塔', '魔塔二', '魔塔三', '魔塔四',
  '强手棋', '智慧之光', '独粒钻石', '木乃伊', '电磁彩球', '建筑制造', '同色方块',
  '同步移动', '坦克大战', '宇宙黑洞', '七巧板', '立体魔方二', '跟花二',
  '魔力纸牌', '多彩泡泡', '魅力之球', '推箱子三', '骰子王', '数谜', '变色彩球',
  '蜘蛛纸牌', '14点', '桥牌', '麻将王三', '弹力连珠'
].forEach(name => nativeRendererNames.add(name));
console.log(JSON.stringify({ catalog: names.length, nativeData: [...nativeDataNames].filter(name => entryNames.has(name)).length, nativeRenderer: [...nativeRendererNames].filter(name => entryNames.has(name)).length, rulesVerified: 0, unverified: names.length, fullGameRulesVerified: false }));
