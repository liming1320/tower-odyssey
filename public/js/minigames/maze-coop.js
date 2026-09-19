// 双人迷宫闯关：联机协作（co-op）。两人共享同一迷宫，收集全部钥匙打开出口，
// 两人都抵达出口即通关；任一玩家踩到陷阱🔥则双双失败。
// 状态同步：房主按种子生成布局并广播种子，双端重建同一迷宫；各自广播位置与钥匙进度。
window.MiniGames = window.MiniGames || {};
(function () {
    const COLS = 11, ROWS = 11;          // 奇数尺寸迷宫（墙格位于偶数坐标）
    const CELL = 40;
    const W = COLS * CELL, H = ROWS * CELL;
    const TOTAL_KEYS = 2;

    function mkRng(seed) {
        let s = (seed >>> 0) || 1;
        return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }

    // 生成完美迷宫 + 钥匙 + 陷阱 + 出入口（全部由 seed 决定，双端一致）
    function buildLevel(seed) {
        const rnd = mkRng(seed);
        const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
        const gw = COLS, gh = ROWS;
        const m = Array.from({ length: gh }, () => Array(gw).fill(1));
        const halfW = (gw - 1) / 2, halfH = (gh - 1) / 2;
        const visited = Array.from({ length: halfH }, () => Array(halfW).fill(false));
        const stack = [[0, 0]]; visited[0][0] = true; m[1][1] = 0;
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        while (stack.length) {
            const [x, y] = stack[stack.length - 1];
            const ns = [];
            for (const [dx, dy] of dirs) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < halfW && ny >= 0 && ny < halfH && !visited[ny][nx]) ns.push([nx, ny, dx, dy]);
            }
            if (ns.length) {
                const [nx, ny, dx, dy] = ns[ri(0, ns.length - 1)];
                visited[ny][nx] = true;
                m[1 + 2 * ny][1 + 2 * nx] = 0;
                m[1 + y + dy][1 + x + dx] = 0;
                stack.push([nx, ny]);
            } else stack.pop();
        }
        const start0 = { x: 1, y: 1 };
        const start1 = { x: 1, y: gh - 2 };
        const exit = { x: gw - 2, y: gh - 2 };
        const used = new Set([`${start0.x},${start0.y}`, `${start1.x},${start1.y}`, `${exit.x},${exit.y}`]);
        const paths = [];
        for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++)
            if (m[y][x] === 0) paths.push({ x, y });
        const take = () => {
            while (paths.length) {
                const i = ri(0, paths.length - 1); const c = paths.splice(i, 1)[0];
                const k = `${c.x},${c.y}`; if (used.has(k)) continue; used.add(k); return c;
            }
            return null;
        };
        const keys = []; let c; while (keys.length < TOTAL_KEYS && (c = take())) keys.push(c);
        const traps = []; while (traps.length < 4 && (c = take())) traps.push(c);
        return { m, gw, gh, start0, start1, exit, keys, traps };
    }

    MiniGames['maze-coop'] = {
        LEVELS: [{ name: '协作迷宫', desc: '双人联网 · 收集钥匙开出口 · 同达终点' }],
        start(container, opts) {
            opts = opts || {};
            const id = 'maze-coop';
            const net = !!(MG.pvp && MG.pvp.shouldBegin && MG.pvp.shouldBegin(id));
            if (!net) {
                container.innerHTML = '<div style="padding:30px;color:#cdd;text-align:center;font-size:14px">🤝 双人迷宫闯关为<b>联机协作专属</b>小游戏<br>请从小游戏列表「🌐 联网对战」分类进入，与好友同闯迷宫。</div>';
                return { stop() {} };
            }
            const mySide = (MG.pvp._armed && MG.pvp._armed.side) || 0;
            const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
            let L = null, seedVal = 0;
            let pos = { x: 1, y: 1 }, oppPos = { x: 1, y: 1 };
            const keysCollected = new Set();
            let over = false, won = false;
            const me = mySide === 0 ? 'P1' : 'P2';
            const isExitOpen = () => keysCollected.size >= TOTAL_KEYS;

            const sendNet = (extra) => { if (over) return; MG.pvp.commit(Object.assign(mySide === 0 ? { seed: seedVal } : {}, extra)); };

            const applyRemote = (m) => {
                if (!m) return;
                if (m.seed != null && !L) {
                    L = buildLevel(m.seed);
                    pos = (mySide === 0 ? L.start0 : L.start1);
                    oppPos = (mySide === 0 ? L.start1 : L.start0);
                }
                if (m.key != null) keysCollected.add(m.key);
                if (m.pos) oppPos = m.pos;
                if (m.over != null) finish(m.over === 1);   // m.over: 发送方视角 1=其胜(我负) 0=其负(我胜)
            };

            // 房主生成种子（种子本身即完整布局，双端一致）；广播放到 begin 之后（commit 需 active）
            if (mySide === 0) {
                seedVal = (Math.floor(Math.random() * 1e9) >>> 0) || 1;
                L = buildLevel(seedVal);
                pos = L.start0; oppPos = L.start1;
            }

            const move = (dx, dy) => {
                if (over || !L) return;
                const nx = pos.x + dx, ny = pos.y + dy;
                if (nx < 0 || ny < 0 || nx >= L.gw || ny >= L.gh) return;
                if (L.m[ny][nx] === 1) return;            // 墙
                pos = { x: nx, y: ny };
                const ki = L.keys.findIndex(k => k.x === nx && k.y === ny);
                if (ki >= 0 && !keysCollected.has(ki)) { keysCollected.add(ki); sendNet({ key: ki }); }
                if (L.traps.some(t => t.x === nx && t.y === ny)) { finish(false); sendNet({ over: 0 }); return; }
                if (nx === L.exit.x && ny === L.exit.y && isExitOpen() && oppPos.x === L.exit.x && oppPos.y === L.exit.y) {
                    finish(true); sendNet({ over: 1 }); return;
                }
                sendNet({ pos: { x: nx, y: ny } });
                draw();
            };

            const finish = (win) => {
                if (over) return; over = true; won = !!win;
                opts.onComplete && opts.onComplete({
                    win: !!win, stars: win ? 3 : 0,
                    title: win ? '🤝 协作通关！' : '💥 闯关失败…',
                    lines: (win ? ['两人都抵达了出口 🚪', `收集钥匙 ${keysCollected.size}/${TOTAL_KEYS}`] : ['有人踩到了陷阱 🔥', '再接再厉！']).filter(Boolean),
                });
                draw();
            };

            // 输入（本地玩家控制自己的头像；联网中每端即一名玩家）
            const kbd = e => {
                const k = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[(e.key || '').toLowerCase()];
                if (k) { e.preventDefault(); move(k[0], k[1]); }
            };
            window.addEventListener('keydown', kbd);
            let tsx = 0, tsy = 0;
            c.addEventListener('touchstart', e => { const t = e.touches[0]; tsx = t.clientX; tsy = t.clientY; }, { passive: true });
            c.addEventListener('touchend', e => {
                const t = e.changedTouches[0]; const dx = t.clientX - tsx, dy = t.clientY - tsy;
                if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
                if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0); else move(0, dy > 0 ? 1 : -1);
            }, { passive: true });

            const draw = () => {
                if (!L) { ctx.fillStyle = '#10131c'; ctx.fillRect(0, 0, W, H); return; }
                ctx.fillStyle = '#10131c'; ctx.fillRect(0, 0, W, H);
                for (let y = 0; y < L.gh; y++) for (let x = 0; x < L.gw; x++) {
                    if (L.m[y][x] === 1) {
                        const px = x * CELL, py = y * CELL;
                        ctx.fillStyle = '#3a4a66'; ctx.fillRect(px, py, CELL, CELL);
                        ctx.fillStyle = '#2a3650'; ctx.fillRect(px + 3, py + 3, CELL - 6, CELL - 6);
                    }
                }
                const ex = L.exit.x * CELL, ey = L.exit.y * CELL;
                ctx.fillStyle = isExitOpen() ? 'rgba(120,220,140,0.25)' : 'rgba(120,120,140,0.18)';
                ctx.fillRect(ex, ey, CELL, CELL);
                ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(isExitOpen() ? '🚪' : '🔒', ex + CELL / 2, ey + CELL / 2);
                L.keys.forEach((k, i) => { if (!keysCollected.has(i)) { ctx.font = '22px serif'; ctx.fillText('🔑', k.x * CELL + CELL / 2, k.y * CELL + CELL / 2); } });
                L.traps.forEach(t => { ctx.font = '22px serif'; ctx.fillText('🔥', t.x * CELL + CELL / 2, t.y * CELL + CELL / 2); });
                const dot = (p, col, label) => {
                    ctx.fillStyle = col;
                    ctx.beginPath(); ctx.arc(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, CELL * 0.34, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#111'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(label, p.x * CELL + CELL / 2, p.y * CELL + CELL / 2);
                };
                dot(oppPos, mySide === 0 ? '#8ae87a' : '#ffe066', '友');
                dot(pos, mySide === 0 ? '#ffe066' : '#8ae87a', '你');
                opts.onScore && opts.onScore(`🤝 双人闯关 · 钥匙 ${keysCollected.size}/${TOTAL_KEYS}${isExitOpen() ? ' · 出口已开🚪，同达终点！' : ''} · ${me}`);
            };

            MG.pvp.begin({ setState: applyRemote, onOver(r) { finish(!!r); } });
            if (mySide === 0) sendNet({});   // 房主在 begin 之后广播种子，确保队友拿到并重建同一迷宫
            draw();
            MG.hint(container, 'WASD/方向键/滑动移动 · 收集 🔑 开 🚪 · 两人同达终点通关 · 别踩 🔥');

            if (typeof window !== 'undefined' && window.__MG_TEST) {
                window.__mazecoop = {
                    get over() { return over; }, get L() { return L; }, get pos() { return pos; },
                    get oppPos() { return oppPos; }, move, get keys() { return keysCollected.size; }, applyRemote,
                };
            }
            return {
                stop() { window.removeEventListener('keydown', kbd); destroy(); MG.pvp.end(); },
            };
        },
    };
})();
