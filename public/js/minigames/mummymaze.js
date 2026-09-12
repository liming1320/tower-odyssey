// 木乃伊迷宫：回合制走位，白木乃伊横优先追踪、红木乃伊一回合两步，逃向出口
window.MiniGames = window.MiniGames || {};
(function () {
    const NAMES = ['盗墓初探', '黄沙回廊', '法老之心', '亡者大厅'];
    const lv = [];
    for (let i = 0; i < 50; i++) {
        const n = 7 + Math.min(4, Math.floor(i / 12));
        const m = Math.min(6, 1 + Math.floor(i / 9));
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `${n}×${n} 迷宫 · ${m} 只木乃伊${i >= 27 ? '（含快速红木乃伊）' : ''}` });
    }
    function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

    MiniGames.mummymaze = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const N = 7 + Math.min(4, Math.floor(idx / 12));
            const nMum = Math.min(6, 1 + Math.floor(idx / 9));
            const redCount = idx >= 27 ? Math.floor(nMum / 2) : 0;
            const rnd = mulberry(idx * 977 + 13);
            // 生成迷宫：随机墙 + BFS 保证连通
            let walls, ok = false, tries = 0;
            while (!ok && tries++ < 200) {
                walls = Array.from({ length: N }, () => Array(N).fill(false));
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) walls[y][x] = rnd() < 0.17;
                walls[0][0] = false; walls[N - 1][N - 1] = false; // 起点与出口
                // 连通性
                const st = [[0, 0]], seen = new Set(['0,0']);
                while (st.length) {
                    const [x, y] = st.pop();
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
                        if (nx >= 0 && nx < N && ny >= 0 && ny < N && !walls[ny][nx] && !seen.has(k)) { seen.add(k); st.push([nx, ny]); }
                    }
                }
                if (seen.has((N - 1) + ',' + (N - 1)) && seen.size >= N * N * 0.6) ok = true;
            }
            let px = 0, py = 0, steps = 0, over = false;
            const par = N * 2 + 4;
            // 木乃伊出生在离玩家较远的空地
            const mums = [];
            for (let k = 0; k < nMum && k < 64; k++) {
                for (let t2 = 0; t2 < 100; t2++) {
                    const x = MG.ri(0, N - 1), y = MG.ri(0, N - 1);
                    if (!walls[y][x] && Math.abs(x - px) + Math.abs(y - py) >= Math.floor(N / 2) && !mums.some(m => m.x === x && m.y === y)) {
                        mums.push({ x, y, red: k >= nMum - redCount }); break;
                    }
                }
            }

            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:8px;';
            const cell = Math.floor(Math.min((container.clientWidth - 60 || 360) / N, (window.innerHeight - 220 || 420) / N, 58));
            const grid = document.createElement('div');
            grid.style.cssText = `display:grid;grid-template-columns:repeat(${N},${cell}px);gap:2px;background:#2a1f14;padding:8px;border-radius:10px;`;
            const cells = [];
            for (let i = 0; i < N * N; i++) {
                const d = document.createElement('div');
                d.style.cssText = `width:${cell}px;height:${cell}px;display:flex;align-items:center;justify-content:center;font-size:${cell * 0.58}px;border-radius:6px;`;
                grid.appendChild(d); cells.push(d);
            }
            wrap.appendChild(grid);
            // 方向键盘
            const pad = document.createElement('div');
            pad.style.cssText = 'display:grid;grid-template-columns:repeat(3,52px);gap:4px;justify-content:center;';
            const mkBtn = (txt, dx, dy) => {
                const b = document.createElement('button');
                b.className = 'btn ghost small'; b.textContent = txt;
                b.style.cssText = 'height:40px;font-size:17px;';
                b.addEventListener('pointerdown', () => move(dx, dy));
                return b;
            };
            pad.appendChild(document.createElement('span'));
            pad.appendChild(mkBtn('↑', 0, -1)); pad.appendChild(document.createElement('span'));
            pad.appendChild(mkBtn('←', -1, 0)); pad.appendChild(mkBtn('↓', 0, 1)); pad.appendChild(mkBtn('→', 1, 0));
            wrap.appendChild(pad);
            container.appendChild(wrap);

            function mumStep(m) {
                const moves = m.red ? 2 : 1;
                for (let s = 0; s < moves; s++) {
                    const dx = Math.sign(px - m.x), dy = Math.sign(py - m.y);
                    // 白：横向优先；红：纵向优先；快速追击
                    const tries = m.red ? [[0, dy], [dx, 0]] : [[dx, 0], [0, dy]];
                    for (const [tx, ty] of tries) {
                        if ((tx || ty) && !walls[m.y + ty][m.x + tx]) { m.x += tx; m.y += ty; break; }
                    }
                    if (m.x === px && m.y === py) return true;
                }
                return false;
            }
            function move(dx, dy) {
                if (over) return;
                const nx = px + dx, ny = py + dy;
                if (nx < 0 || nx >= N || ny < 0 || ny >= N || walls[ny][nx]) return;
                px = nx; py = ny; steps++;
                if (px === N - 1 && py === N - 1) {
                    over = true;
                    opts.onComplete && opts.onComplete({ win: true, stars: steps <= par ? 3 : steps <= par * 1.5 ? 2 : 1, lines: [`逃出生天！${steps} 步（标准 ${par} 步）`] });
                    return render();
                }
                for (const m of mums) { if (mumStep(m)) { over = true; render(); return opts.onComplete && opts.onComplete({ win: false, stars: 0, lines: ['被木乃伊抓住了…', `走了 ${steps} 步`] }); } }
                render();
            }
            // ---------- 像素贴图（点阵位图 → canvas，替换 emoji） ----------
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
                door: [
                    'OOOOOOOOOOOO',
                    'ODddddddddDO',
                    'ODDDDDDDDDDO',
                    'ODddddddddDO',
                    'ODDDDDDDDDDO',
                    'ODdddddddGDO',
                    'ODDDDDDDGGDO',
                    'ODddddddddDO',
                    'ODDDDDDDDDDO',
                    'ODddddddddDO',
                    'ODDDDDDDDDDO',
                    'OOOOOOOOOOOO',
                ],
                wall: [
                    'RrrrRrrrrRrr',
                    'RrrrRrrrrRrr',
                    'MMMMMMMMMMMM',
                    'rrRrrrRrrrRr',
                    'rrRrrrRrrrRr',
                    'MMMMMMMMMMMM',
                    'RrrrRrrrrRrr',
                    'RrrrRrrrrRrr',
                    'MMMMMMMMMMMM',
                    'rrRrrrRrrrRr',
                    'rrRrrrRrrrRr',
                    'MMMMMMMMMMMM',
                ],
            };
            const PAL = {
                hero: { O: '#241a0e', H: '#e6d290', h: '#8a6d3b', F: '#e8b27d', E: '#20242c', S: '#7a8a4a', s: '#55622f', P: '#6b5233', B: '#332619' },
                mummyW: { O: '#4d4840', W: '#ece8da', w: '#b9b2a0', E: '#20242c' },
                mummyR: { O: '#3a2410', N: '#d9b23c', n: '#2c5aa0', F: '#d8a86e', E: '#20242c', R: '#b03a2e', r: '#7c241c', G: '#f0d060' },
                door: { O: '#1d1208', D: '#7a4a26', d: '#5a3418', G: '#f0c850' },
                wall: { r: '#8a5a33', R: '#9c6b3e', M: '#4a3420' },
            };
            const sprCache = new Map();
            function sprCanvas(name) {
                let cv = sprCache.get(name);
                if (cv) return cv;
                cv = MG.gfx.px(ART[name], PAL[name], 'mz|' + name);
                const out = document.createElement('canvas');
                out.width = cell; out.height = cell;
                const c2 = out.getContext('2d');
                MG.gfx.pxDraw(c2, cv, 1, 1, cell - 2, cell - 2);
                sprCache.set(name, out);
                return out;
            }
            function render() {
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const d = cells[y * N + x];
                    let bg = walls[y][x] ? '#3a2c1c' : '#c8a86a';
                    let spr = '';
                    if (x === N - 1 && y === N - 1) { bg = '#3f7d3a'; spr = 'door'; }
                    else if (walls[y][x]) spr = 'wall';
                    const m = mums.find(mm => mm.x === x && mm.y === y);
                    if (m) spr = m.red ? 'mummyR' : 'mummyW';
                    if (px === x && py === y) spr = 'hero';
                    d.style.background = bg;
                    d.textContent = '';
                    if (spr) d.appendChild(sprCanvas(spr));
                }
                opts.onScore && opts.onScore(`步数 ${steps} · 出口在右下 🚪`);
            }
            render();
            window.__mummyDbg = { move, get state() { return { px, py, steps, mums: mums.map(m => ({ x: m.x, y: m.y, red: m.red })) }; }, walls };
            return { stop() {} };
        },
    };
})();
