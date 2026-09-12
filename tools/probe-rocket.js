// 一次性探针：疯狂火箭 findPath 为何为 null（跑完即删）
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global; global.MiniGames = {}; global.addEventListener = () => {}; global.removeEventListener = () => {};
global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {};
function fakeCtx() { const s = { canvas: { width: 420, height: 560 } }; return new Proxy(s, { get(t, k) { if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return () => undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
function fakeEl() { const el = { style: {}, className: '', innerHTML: '', textContent: '', children: [], classList: { add() {}, remove() {}, contains: () => false }, appendChild(c) { this.children.push(c); return c; }, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, querySelector: () => fakeEl(), querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 560 }), getContext: () => fakeCtx(), clientWidth: 420, clientHeight: 560, width: 420, height: 560, focus() {}, click() {}, value: '', dataset: {}, setAttribute() {} }; return el; }
global.document = { createElement: fakeEl, getElementById: () => fakeEl(), querySelector: () => fakeEl(), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } };
global.localStorage = { getItem: () => null, setItem() {} };
const d = path.join(__dirname, '..', 'public', 'js', 'minigames');
const { engineDir, ENGINE_FILES } = require('./mg-engine-files');
for (const f of ENGINE_FILES) vm.runInThisContext(fs.readFileSync(path.join(engineDir, f), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(d, 'rocketmania.js'), 'utf8'));
const out = [];
const M = global.MiniGames;
const inst = M.rocketmania.start(fakeEl(), { levelIdx: 0, onScore() {}, onComplete() {} });
const dbg = global.__rocketDbg;
const G = 7, fr = dbg.fuseRow;
out.push('fuseRow=' + fr + ' rocketRows(原)=' + JSON.stringify(dbg.rocketRows));
dbg.grid = Array.from({ length: G }, () => Array.from({ length: G }, () => ({ t: 'I', rot: 1 })));
dbg.grid[fr][3] = { t: 'L', rot: 1 };
dbg.rocketRows = [fr + 1];
dbg.grid[fr + 1][3] = { t: 'T', rot: 1 };
out.push('grid(fr,0)=' + JSON.stringify(dbg.openings(dbg.grid[fr][0])));
out.push('grid(fr,3)=' + JSON.stringify(dbg.openings(dbg.grid[fr][3])));
out.push('grid(fr+1,3)=' + JSON.stringify(dbg.openings(dbg.grid[fr + 1][3])));
out.push('grid(fr+1,4)=' + JSON.stringify(dbg.openings(dbg.grid[fr + 1][4])));
const p = dbg.findPath();
out.push('findPath => ' + (p === null ? 'null' : JSON.stringify(p)));

// 手动复跑 BFS 打点
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const prev = new Map();
const key = q => q.r + ',' + q.c;
const q = [{ r: fr, c: 0 }];
prev.set('4,0', null);
let log = [];
while (q.length) {
    const cell = q.shift();
    const ops = dbg.openings(dbg.grid[cell.r][cell.c]);
    log.push(`扩 ${cell.r},${cell.c} 开口=${JSON.stringify(ops)}`);
    for (const dd of ops) {
        const nr = cell.r + DIRS[dd][1], nc = cell.c + DIRS[dd][0];
        if (dd === 1 && nc === G) { log.push(`  → d=1 nc=G row=${cell.r} rocketRows=${JSON.stringify(dbg.grid && 0)}`); }
        if (nr < 0 || nr >= G || nc < 0 || nc >= G) continue;
        const opp = (dd + 2) % 4, k = nr + ',' + nc;
        if (prev.has(k)) { log.push(`  邻 ${k} 已访问`); continue; }
        if (!dbg.hasOpen(dbg.grid[nr][nc], opp)) { log.push(`  邻 ${k} 对口=${opp} 不通`); continue; }
        prev.set(k, cell); q.push({ r: nr, c: nc });
    }
}
out.push('可达集: ' + [...prev.keys()].join(' '));
fs.writeFileSync(path.join(__dirname, 'shots', 'probe.txt'), out.concat(log).join('\n'), 'utf8');
