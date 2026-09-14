const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/js/minigames/pk32-tower.js'), 'utf8'), context);
const tower = context.window.PK32Tower;
const expected = JSON.parse(fs.readFileSync(path.join(root, 'output/pk32-reference/tower-maps-index.json'), 'utf8'))[0];
const maps = tower.maps;
if (!Array.isArray(maps) || maps.length !== expected.maps.length) throw new Error('tower map count mismatch');

const rows = maps.map((map, layer) => {
  if (map !== expected.maps[layer].text) throw new Error('tower map payload mismatch at layer ' + (layer + 1));
  const codes = [];
  for (let i = 0; i < map.length; i += 2) codes.push(map.slice(i, i + 2));
  const count = code => codes.filter(value => value === code).length;
  const start = codes.indexOf('01') >= 0 ? codes.indexOf('01') : codes.indexOf('11');
  const seen = new Set(['' + start + ':0,0,1']);
  const queue = [{ at: start, keys: [0, 0, 1] }];
  const doorKey = { '06': 2, '07': 1, '08': 0 };
  const maxKeys = [1, 1, 1].map((initial, key) => initial + codes.filter(code => code === ['18', '17', '16'][key]).length);
  while (queue.length) {
    const current = queue.shift(), at = current.at, keys = current.keys;
    const x = at % 11, y = Math.floor(at / 11);
    [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
      if (nx < 0 || nx >= 11 || ny < 0 || ny >= 11) return;
      const next = ny * 11 + nx;
      const door = doorKey[codes[next]], nextKeys = keys.slice();
      if (codes[next] === '16') nextKeys[2] = Math.min(maxKeys[2], nextKeys[2] + 1);
      if (codes[next] === '17') nextKeys[1] = Math.min(maxKeys[1], nextKeys[1] + 1);
      if (codes[next] === '18') nextKeys[0] = Math.min(maxKeys[0], nextKeys[0] + 1);
      if (door != null) { if (!nextKeys[door]) return; nextKeys[door] -= 1; }
      if (['03', '04', '40', '66', '09', '10'].includes(codes[next])) return;
      const stateKey = next + ':' + nextKeys.join(',');
      if (!seen.has(stateKey) && seen.size < 50000) { seen.add(stateKey); queue.push({ at: next, keys: nextKeys }); }
    });
  }
  const reachable = code => codes.reduce((n, value, index) => n + (value === code && [...seen].some(key => key.split(':')[0] === String(index)) ? 1 : 0), 0);
  return {
    layer: layer + 1,
    cells: codes.length,
    player: count('01') + count('11'),
    npc: codes.filter(code => Number(code) >= 71 && Number(code) <= 75).length,
    monsters: codes.filter(code => Number(code) >= 38 && Number(code) <= 70).length,
    stairs: count('11') + count('12'),
    keys: ['16', '17', '18'].reduce((sum, code) => sum + count(code), 0),
    equipment: codes.filter(code => Number(code) >= 30 && Number(code) <= 37).length,
    itemCodes: codes.filter(code => Number(code) >= 19 && Number(code) <= 37),
    reachableNpc: codes.reduce((n, code, index) => n + (Number(code) >= 71 && Number(code) <= 75 && [...seen].some(key => key.split(':')[0] === String(index)) ? 1 : 0), 0),
    reachableEquipment: codes.reduce((n, code, index) => n + (Number(code) >= 30 && Number(code) <= 37 && [...seen].some(key => key.split(':')[0] === String(index)) ? 1 : 0), 0),
    reachableStairs: reachable('11') + reachable('12')
  };
});

const result = {
  mapCount: rows.length,
  dimensions: rows.every(row => row.cells === 121) ? '11x11' : 'invalid',
  rows,
  firstLayerEquipmentPresent: rows[0].equipment > 0,
  firstLayerNpcPresent: rows[0].npc > 0,
  firstLayerPlayerPresent: rows[0].player === 1,
  sourceMatchesExtractedIndex: true
};
console.log(JSON.stringify(result, null, 2));
if (!result.firstLayerPlayerPresent || !result.firstLayerNpcPresent) process.exitCode = 1;
