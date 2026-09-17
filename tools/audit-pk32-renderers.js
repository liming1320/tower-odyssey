const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public', 'js', 'minigames', 'pk32-variants.js'), 'utf8');
const catalogSource = fs.readFileSync(path.join(root, 'public', 'js', 'minigames', 'pk32.js'), 'utf8');
const namesMatch = catalogSource.match(/'([^']+)'\s*\r?\n\s*\)\.split\('\|'\);/);
if (!namesMatch) throw new Error('cannot locate PK32 variant names');
const names = namesMatch[1].split('|');
const specialNames = new Set();
for (const match of catalogSource.matchAll(/'([^']+)'\s*:\s*\{\s*family:\s*'[^']+'\s*,\s*id:\s*'([^']+)'/g)) specialNames.add(match[1]);
for (const match of source.matchAll(/config\.name === '([^']+)'\s*\?\s*(renderNative[A-Za-z0-9_]*)/g)) specialNames.add(match[1]);
for (const match of source.matchAll(/if\s*\(config\.name === '([^']+)'\)\s*return\s+(renderNative[A-Za-z0-9_]*)/g)) specialNames.add(match[1]);
[
  '魔塔', '魔塔二', '魔塔三', '魔塔四',
  '强手棋', '智慧之光', '独粒钻石', '木乃伊', '电磁彩球', '建筑制造',
  '同步移动', '坦克大战', '宇宙黑洞', '七巧板', '立体魔方二', '跟花二',
  '魔力纸牌', '多彩泡泡', '魅力之球', '推箱子三', '骰子王', '数谜', '变色彩球',
  '蜘蛛纸牌', '14点', '桥牌', '麻将王三', '弹力连珠'
].forEach(name => specialNames.add(name));
const modeNames = {};
for (const match of source.matchAll(/const ([A-Z0-9_]+) = new Set\('([^']*)'\.split\('\|'\)\);/g)) {
  for (const name of match[2].split('|').filter(Boolean)) modeNames[name] = match[1].toLowerCase();
}
for (const match of source.matchAll(/const (GO|CHESS|MUMMY|ELECTROMAGNETIC|PIXEL_ISLAND|ZEN_GARDEN) = new Set\(\[?'([^']+)'\]?\);/g)) {
  for (const name of match[2].split('|').filter(Boolean)) modeNames[name] = match[1].toLowerCase();
}
const dataDir = path.join(root, 'public', 'data');
const dataByName = new Map();
for (const file of fs.readdirSync(dataDir).filter(name => /^pk32-.*-levels\.json$/.test(name))) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    if (data.name) dataByName.set(data.name, { file, records: Array.isArray(data.levels) ? data.levels.length : 0, nativeLevelCount: data.nativeLevelCount || null });
  } catch (_) {}
}
const rows = names.map((name, index) => {
  const data = dataByName.get(name);
  const renderer = specialNames.has(name) ? 'native-renderer' : (modeNames[name] ? 'mode-renderer' : 'generic-renderer');
  return { index: index + 1, name, renderer, mode: modeNames[name] || 'action', nativeData: data || null };
});
const result = {
  games: rows.length,
  nativeRenderer: rows.filter(row => row.renderer === 'native-renderer').length,
  modeRenderer: rows.filter(row => row.renderer === 'mode-renderer').length,
  genericRenderer: rows.filter(row => row.renderer === 'generic-renderer').length,
  withNativeData: rows.filter(row => row.nativeData).length,
  rows
};
console.log(JSON.stringify(result, null, 2));
