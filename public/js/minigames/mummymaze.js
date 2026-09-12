// 木乃伊迷宫（PopCap 原版规则复刻）：回合制走位；木乃伊八向追踪（白 1 步/回合、红 2 步/回合）；
// 栅栏门只有主角能通过（引诱木乃伊撞门是核心解法）；可原地等待；收集金像；抵达楼梯口过关。
window.MiniGames = window.MiniGames || {};
(function () {
    const NAMES = ['盗墓初探', '黄沙回廊', '法老之心', '亡者大厅'];
    const lv = [];
    for (let i = 0; i < 50; i++) {
        const n = 9 + Math.min(4, Math.floor(i / 10));
        const m = Math.min(7, 1 + Math.floor(i / 6));
        const red = i >= 20 ? Math.max(1, Math.floor(m / 3)) : 0;
        const gate = i >= 4 ? Math.min(3, 1 + Math.floor(i / 15)) : 0;
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `${n}×${n} 墓室 · ${m} 只木乃伊${red ? `（红 ${red}）` : ''}${gate ? ` · 栅栏门 ${gate}` : ''}` });
    }
    function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

    MiniGames.mummymaze = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const N = 9 + Math.min(4, Math.floor(idx / 10));
            const nMum = Math.min(7, 1 + Math.floor(idx / 6));
            const redCount = idx >= 20 ? Math.max(1, Math.floor(nMum / 3)) : 0;
            const gateCount = idx >= 4 ? Math.min(3, 1 + Math.floor(idx / 15)) : 0;
            const nGold = Math.min(5, 2 + Math.floor(idx / 12));
            const rnd = mulberry(idx * 977 + 13);
            const EX = N - 1, EY = N - 1;

            // 生成墓室：随机石墙 + BFS 保证起点到楼梯连通
            let walls, ok = false, tries = 0;
            while (!ok && tries++ < 300) {
                walls = Array.from({ length: N }, () => Array(N).fill(false));
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) walls[y][x] = rnd() < 0.15;
                walls[0][0] = false; walls[EY][EX] = false;
                const st = [[0, 0]], seen = new Set(['0,0']);
                while (st.length) {
                    const [x, y] = st.pop();
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
                        if (nx >= 0 && nx < N && ny >= 0 && ny < N && !walls[ny][nx] && !seen.has(k)) { seen.add(k); st.push([nx, ny]); }
                    }
                }
                if (seen.has(EX + ',' + EY) && seen.size >= N * N * 0.62) ok = true;
            }
            const open = (x, y) => x >= 0 && x < N && y >= 0 && y < N && !walls[y][x];

            // 栅栏门：放在开阔地（至少两个相邻通道），离起点远，不挡楼梯
            const gates = new Set();
            for (let k = 0; k < gateCount; k++) {
                for (let t2 = 0; t2 < 200; t2++) {
                    const x = MG.ri(1, N - 2), y = MG.ri(1, N - 2);
                    const key = x + ',' + y;
                    if (!open(x, y) || gates.has(key)) continue;
                    if (x + y < 5) continue;
                    const deg = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(x + dx, y + dy)).length;
                    if (deg >= 2) { gates.add(key); break; }
                }
            }
            // 金像：散在通道上
            const golds = new Map(); // key -> {x,y}
            for (let k = 0; k < nGold; k++) {
                for (let t2 = 0; t2 < 200; t2++) {
                    const x = MG.ri(0, N - 1), y = MG.ri(0, N - 1), key = x + ',' + y;
                    if (!open(x, y) || gates.has(key) || golds.has(key) || (x < 2 && y < 2) || (x === EX && y === EY)) continue;
                    if (x + y < 4) continue;
                    golds.set(key, { x, y }); break;
                }
            }
            // 木乃伊：出生在离主角远的空地
            const mums = [];
            for (let k = 0; k < nMum && k < 64; k++) {
                for (let t2 = 0; t2 < 120; t2++) {
                    const x = MG.ri(0, N - 1), y = MG.ri(0, N - 1), key = x + ',' + y;
                    if (!open(x, y) || golds.has(key) || (x + y) < N || mums.some(m => m.x === x && m.y === y)) continue;
                    mums.push({ x, y, red: k >= nMum - redCount }); break;
                }
            }

            let px = 0, py = 0, steps = 0, got = 0, over = false;
            // 标准步数：BFS 最短路 + 拿宝冗余
            const dist = Array.from({ length: N }, () => Array(N).fill(-1));
            { const q = [[0, 0]]; dist[0][0] = 0;
                while (q.length) { const [x, y] = q.shift();
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy;
                        if (open(nx, ny) && dist[ny][nx] < 0) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); } } } }
            const par = (dist[EY][EX] > 0 ? dist[EY][EX] : N * 2) + nGold * 2;

            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:8px;';
            const cell = Math.floor(Math.min((container.clientWidth - 60 || 360) / N, (window.innerHeight - 250 || 420) / N, 56));
            const grid = document.createElement('div');
            grid.style.cssText = `display:grid;grid-template-columns:repeat(${N},${cell}px);gap:1px;background:#241a10;padding:8px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.5);`;
            const cells = [];
            for (let i = 0; i < N * N; i++) {
                const d = document.createElement('div');
                d.style.cssText = `width:${cell}px;height:${cell}px;display:flex;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;`;
                d.addEventListener('pointerdown', () => {
                    const x = i % N, y = Math.floor(i / N);
                    if (x === px && y === py) doWait();
                    else if (x === px && Math.abs(y - py) === 1) move(0, Math.sign(y - py));
                    else if (y === py && Math.abs(x - px) === 1) move(Math.sign(x - px), 0);
                });
                grid.appendChild(d); cells.push(d);
            }
            wrap.appendChild(grid);
            // 方向键盘 + 等待
            const pad = document.createElement('div');
            pad.style.cssText = 'display:grid;grid-template-columns:repeat(3,56px);gap:4px;justify-content:center;';
            const mkBtn = (txt, fn, title) => {
                const b = document.createElement('button');
                b.className = 'btn ghost small'; b.textContent = txt; b.title = title || '';
                b.style.cssText = 'height:42px;font-size:16px;';
                b.addEventListener('pointerdown', fn);
                return b;
            };
            pad.appendChild(document.createElement('span'));
            pad.appendChild(mkBtn('↑', () => move(0, -1))); pad.appendChild(document.createElement('span'));
            pad.appendChild(mkBtn('←', () => move(-1, 0))); pad.appendChild(mkBtn('⌛', doWait, '原地等待（空格）')); pad.appendChild(mkBtn('→', () => move(1, 0)));
            pad.appendChild(document.createElement('span'));
            pad.appendChild(mkBtn('↓', () => move(0, 1))); pad.appendChild(document.createElement('span'));
            wrap.appendChild(pad);
            const tip = document.createElement('div');
            tip.style.cssText = 'font-size:12px;opacity:.75;color:#e8d9b0;text-align:center;line-height:1.5;';
            tip.textContent = '栅栏门只有你能通过，木乃伊会八向追踪（红的两倍速）· 点自己或空格=等待';
            wrap.appendChild(tip);
            container.appendChild(wrap);

            // ---------- 木乃伊 AI：八向贪心追踪（PopCap 规则） ----------
            const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
            function mumCanStep(m, nx, ny) {
                if (!open(nx, ny) || gates.has(nx + ',' + ny)) return false;      // 门只挡木乃伊
                if (nx === EX && ny === EY) return false;                          // 不上楼梯
                if (mums.some(o => o !== m && o.x === nx && o.y === ny)) return false;
                return true;
            }
            function mumStepOnce(m) {
                const d0 = Math.hypot(px - m.x, py - m.y);
                const cands = DIRS8
                    .map(([dx, dy]) => ({ x: m.x + dx, y: m.y + dy, dx, dy }))
                    .filter(c => mumCanStep(m, c.x, c.y))
                    // 斜向不允许穿墙角：两个正交邻格至少一个可走
                    .filter(c => !(c.dx && c.dy) || open(m.x + c.dx, m.y) || open(m.x, m.y + c.dy))
                    .map(c => ({ ...c, d: Math.hypot(px - c.x, py - c.y) }))
                    .filter(c => c.d < d0)
                    .sort((a, b) => a.d - b.d || (Math.abs(b.dx) + Math.abs(b.dy)) - (Math.abs(a.dx) + Math.abs(a.dy)));
                if (!cands.length) return false;
                m.x = cands[0].x; m.y = cands[0].y;
                return m.x === px && m.y === py;
            }
            function mumsTurn() {
                for (const m of mums) {
                    const moves = m.red ? 2 : 1;
                    for (let s = 0; s < moves; s++) {
                        if (mumStepOnce(m)) return true;   // 抓到主角
                    }
                }
                return false;
            }
            function afterHeroAct() {
                steps++;
                // 拾取金像
                const key = px + ',' + py;
                if (golds.has(key)) { golds.delete(key); got++; }
                // 到达楼梯
                if (px === EX && py === EY) {
                    over = true;
                    const all = got >= nGold;
                    const stars = all && steps <= par ? 3 : (all || steps <= par) ? 2 : 1;
                    opts.onComplete && opts.onComplete({ win: true, stars, lines: [`逃出墓室！${steps} 步（标准 ${par}）· 金像 ${got}/${nGold}`] });
                    return render();
                }
                if (mumsTurn()) {
                    over = true; render();
                    return opts.onComplete && opts.onComplete({ win: false, stars: 0, lines: ['被木乃伊抓住了…', `存活 ${steps} 回合 · 金像 ${got}/${nGold}`] });
                }
                render();
            }
            function move(dx, dy) {
                if (over) return;
                const nx = px + dx, ny = py + dy;
                if (!open(nx, ny)) return;                          // 撞墙
                if (mums.some(m => m.x === nx && m.y === ny)) return; // 不能主动撞木乃伊
                px = nx; py = ny;
                afterHeroAct();
            }
            function doWait() {
                if (over) return;
                afterHeroAct();
            }
            // 键盘：方向/WASD 移动，空格等待
            const onKey = e => {
                const k = e.key.toLowerCase();
                if (k === 'arrowup' || k === 'w') { move(0, -1); e.preventDefault(); }
                else if (k === 'arrowdown' || k === 's') { move(0, 1); e.preventDefault(); }
                else if (k === 'arrowleft' || k === 'a') { move(-1, 0); e.preventDefault(); }
                else if (k === 'arrowright' || k === 'd') { move(1, 0); e.preventDefault(); }
                else if (k === ' ') { doWait(); e.preventDefault(); }
            };
            window.addEventListener('keydown', onKey);

            // ---------- 像素贴图 ----------
            const ART = {
                hero: [
                    '....OOOO....',
                    '...OHHHHO...',
                    '..OHHHHHHO..',
                    '..OhhhhhhO..',
                    '.OOOOOOOOOO.',
                    '..OFEFFEFO..',
                    '...OFFFFO...',
                    '..OSSSSSSO..',
                    '.OsSSSSSSsO.',
                    '..OSsSSsSO..',
                    '...OP..PO...',
                    '..OBB..BBO..',
                ],
                mummyW: [
                    '....OOOO....',
                    '...OWWWWO...',
                    '..OWEWWEWO..',
                    '..OWwWWwWO..',
                    '..OWWWWWWO..',
                    '..OwWWWWwO..',
                    '..OWWWwWWO..',
                    '..OwWWWwWO..',
                    '..OWWwWWWO..',
                    '..OwWWWWWO..',
                    '..OWW..WWO..',
                    '...OO..OO...',
                ],
                mummyR: [
                    '....OOOO....',
                    '...ONNNNO...',
                    '..ONnNNnNO..',
                    '..ONNNNNNO..',
                    '..OFEFFEFO..',
                    '..OnFFFFnO..',
                    '..ORRRRRRO..',
                    '..OrRRRRrO..',
                    '..ORRrRRRO..',
                    '..OrRRRrRO..',
                    '..ORR..RRO..',
                    '..OO...OO...',
                ],
                gate: [
                    'OOOOOOOOOOOO',
                    'OGgGGgGGgGGO',
                    'OG.GG.GG.GGO',
                    'OGgGGgGGgGGO',
                    'OG.GG.GG.GGO',
                    'OGgGGgGGgGGO',
                    'OG.GG.GG.GGO',
                    'OGgGGgGGgGGO',
                    'OG.GG.GG.GGO',
                    'OGgGGgGGgGGO',
                    'OGGGGGGGGGGO',
                    'OOOOOOOOOOOO',
                ],
                stairs: [
                    'aaaaaaaaaaaa',
                    'abbbbbbbbbbA',
                    'abbcccccccbA',
                    'abbccddddcbA',
                    'abbccdeeedA.',
                    'abbccdeee...',
                    'abbccded....',
                    'abbccdd.....',
                    'abbccd......',
                    'abbcc.......',
                    'abbc........',
                    'abc.........',
                ],
                gold: [
                    '............',
                    '....gggg....',
                    '...gGGGGg...',
                    '...GgEEgG...',
                    '...GGGGGG...',
                    '....GGGG....',
                    '...gGGGGg...',
                    '..gGGGGGGg..',
                    '..gGGggGGg..',
                    '..gGGGGGGg..',
                    '...gGGGGg...',
                    '....gggg....',
                ],
                wall: [
                    'SsssSssssSss',
                    'SsssSssssSss',
                    'MMMMMMMMMMMM',
                    'ssSsssSssSss',
                    'ssSsssSssSss',
                    'MMMMMMMMMMMM',
                    'SsssSssssSss',
                    'SsssSssssSss',
                    'MMMMMMMMMMMM',
                    'ssSsssSssSss',
                    'ssSsssSssSss',
                    'MMMMMMMMMMMM',
                ],
            };
            const PAL = {
                hero: { O: '#241a0e', H: '#e6d290', h: '#8a6d3b', F: '#e8b27d', E: '#20242c', S: '#7a8a4a', s: '#55622f', P: '#6b5233', B: '#332619' },
                mummyW: { O: '#4d4840', W: '#ece8da', w: '#b9b2a0', E: '#20242c' },
                mummyR: { O: '#3a2410', N: '#d9b23c', n: '#2c5aa0', F: '#d8a86e', E: '#20242c', R: '#b03a2e', r: '#7c241c' },
                gate: { O: '#1d1208', G: '#c89b3c', g: '#8a6a24', '.': '#2b1d0e' },
                stairs: { a: '#4d3a22', b: '#3a2c18', c: '#2c2113', d: '#221a0f', e: '#17110a', '.': '#17110a', A: '#5a462a' },
                gold: { g: '#8a6a1c', G: '#f0c440', E: '#3a2c10' },
                wall: { s: '#7d6a4a', S: '#8d7a58', M: '#5c4c32' },
            };
            const sprCache = new Map();
            function sprCanvas(name) {
                let cv = sprCache.get(name);
                if (cv) return cv;
                cv = MG.gfx.px(ART[name], PAL[name], 'mz2|' + name);
                const out = document.createElement('canvas');
                out.width = cell; out.height = cell;
                const c2 = out.getContext('2d');
                MG.gfx.pxDraw(c2, cv, 0, 0, cell, cell);
                sprCache.set(name, out);
                return out;
            }
            function render() {
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const d = cells[y * N + x];
                    const check = (x + y) % 2 === 0;
                    let bg = walls[y][x] ? '#3a2f20' : check ? '#c9a86a' : '#c2a061';
                    let spr = '';
                    if (x === EX && y === EY) spr = 'stairs';
                    else if (walls[y][x]) spr = 'wall';
                    else if (gates.has(x + ',' + y)) spr = 'gate';
                    else if (golds.has(x + ',' + y)) spr = 'gold';
                    const m = mums.find(mm => mm.x === x && mm.y === y);
                    if (m) spr = m.red ? 'mummyR' : 'mummyW';
                    if (px === x && py === y) spr = 'hero';
                    d.style.background = bg;
                    d.textContent = '';
                    if (spr) d.appendChild(sprCanvas(spr));
                }
                opts.onScore && opts.onScore(`回合 ${steps} · 金像 ${got}/${nGold} · 标准步数 ${par}`);
            }
            render();
            window.__mummyDbg = {
                move, wait: doWait,
                _hero: (x, y) => { px = x; py = y; },
                _mum: (i, x, y) => { if (mums[i]) { mums[i].x = x; mums[i].y = y; } },
                canStep: (i, x, y) => mums[i] ? mumCanStep(mums[i], x, y) : false,
                get state() { return { px, py, steps, got, gates: [...gates], golds: [...golds.keys()], mums: mums.map(m => ({ x: m.x, y: m.y, red: m.red })) }; },
                walls, N, EX, EY, isGate: k => gates.has(k), isOpen: open,
            };
            return { stop() { window.removeEventListener('keydown', onKey); } };
        },
    };
})();
