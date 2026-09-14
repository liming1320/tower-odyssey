const path = require('path');
const fs = require('fs');
const core = require(path.join(__dirname, '..', 'public', 'js', 'minigames', 'pk32-light-core.js'));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-light-levels.json'), 'utf8'));

function show(tag, st) {
  console.log('--- ' + tag + ' (W=' + st.W + ' H=' + st.H + ' ox=' + st.ox + ' oy=' + st.oy + ') ---');
  for (let y = 0; y < 9; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) { const v = st.grid[y * 16 + x]; row += (v < 0 ? '..' : String(v).padStart(2, '0')) + ' '; }
    console.log(row);
  }
}
function cellAt(st, gx, gy) { return (gx<0||gx>15||gy<0||gy>8) ? 'OOB' : (st.grid[gy*16+gx] < 0 ? '..' : String(st.grid[gy*16+gx]).padStart(2,'0')); }

const lvl = data.levels.find(l => l.number === 16);
const demo = data.demos.find(d => d.level === 16);
console.log('L16 cells head:', lvl.cells.slice(0, 6), '=> W,H=', lvl.width, lvl.height);
console.log('demo raw=' + demo.raw + ' clicks=' + JSON.stringify(demo.clicks));
let st = core.decodeLevel(lvl);
show('L16 initial', st);
for (const [x, y] of demo.clicks) {
  console.log('click grid(' + x + ',' + y + ') -> cell=' + cellAt(st, x, y) + '  board-local=(' + (x-st.ox) + ',' + (y-st.oy) + ')');
  core.click(st, x, y);
}
console.log('after demos, win=' + core.isWin(st));
