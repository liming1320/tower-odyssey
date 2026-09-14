const path = require('path');
const fs = require('fs');
const core = require(path.join(__dirname, '..', 'public', 'js', 'minigames', 'pk32-light-core.js'));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-light-levels.json'), 'utf8'));

function show(tag, st) {
  console.log('--- ' + tag + ' (W=' + st.W + ' H=' + st.H + ' ox=' + st.ox + ' oy=' + st.oy + ') ---');
  for (let y = 0; y < 9; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      const v = st.grid[y * 16 + x];
      row += (v < 0 ? '..' : String(v).padStart(2, '0')) + ' ';
    }
    console.log(row);
  }
}

const lvl = data.levels.find(l => l.number === 1);
const demo = data.demos.find(d => d.level === 1);
console.log('demo L1 raw=' + demo.raw + ' clicks=' + JSON.stringify(demo.clicks));
let st = core.decodeLevel(lvl);
show('initial', st);
for (const [x, y] of demo.clicks) { core.click(st, x, y); }
show('after demos', st);
console.log('win=' + core.isWin(st));
// list remaining dark codes
const dark = core.DARK;
const rem = st.grid.filter(v => v >= 0 && v <= 59 && dark.indexOf(v) >= 0);
console.log('remaining dark cells: ' + rem.length + ' -> ' + JSON.stringify(rem));
const lit = st.grid.filter(v => v >= 0 && v <= 59 && dark.indexOf(v) < 0);
console.log('lit cells: ' + lit.length);
