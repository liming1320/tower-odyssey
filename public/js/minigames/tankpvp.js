// 坦克大决战：双人实时对战（无 AI）。各自操控坦克移动+开火；子弹由拥有者回声同步，
// 命中对手时由拥有者发 hit 事件、对手本地扣血。生命耗尽即负。
// 状态回声：每帧广播己方坦克状态 + 子弹列表；接收端据快照渲染对手。
// 结果语义：commit 的 over 为「发送方视角」——0=发送方负、1=发送方胜、2=平局。
window.MiniGames = window.MiniGames || {};
(function () {
    const COLS = 15, ROWS = 13, CELL = 38;
    const W = COLS * CELL, H = ROWS * CELL;
    const T_EMPTY = 0, T_BRICK = 1, T_STEEL = 2;
    const DIRS = { U: { x: 0, y: -1 }, D: { x: 0, y: 1 }, L: { x: -1, y: 0 }, R: { x: 1, y: 0 } };
    const S0 = { x: 1, y: ROWS - 2 }, S1 = { x: COLS - 2, y: 1 };

    function genMap() {
        const g = Array.from({ length: ROWS }, () => Array(COLS).fill(T_EMPTY));
        const put = (x, y, v) => { if (x >= 0 && x < COLS && y >= 0 && y < ROWS) g[y][x] = v; };
        for (let x = 5; x <= 9; x++) put(x, 6, T_STEEL);
        for (let y = 3; y <= 9; y++) put(7, y, T_STEEL);
        [[3, 3], [3, 4], [11, 8], [11, 9], [3, 9], [11, 3], [6, 2], [8, 10]].forEach(([x, y]) => put(x, y, T_BRICK));
        return g;
    }

    MiniGames['tankpvp'] = {
        LEVELS: [{ name: '坦克大决战', desc: '双人实时 · 移动+开火 · 3 条命' }],
        start(container, opts) {
            opts = opts || {};
            const id = 'tankpvp';
            const net = !!(MG.pvp && MG.pvp.shouldBegin && MG.pvp.shouldBegin(id));
            if (!net) {
                container.innerHTML = '<div style="padding:30px;color:#cdd;text-align:center;font-size:14px">🎯 坦克大决战为<b>联机对战专属</b>小游戏<br>请从小游戏列表「🌐 联网对战」分类进入，与好友实时对决。</div>';
                return { stop() {} };
            }
            const mySide = (MG.pvp._armed && MG.pvp._armed.side) || 0;
            const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
            const map = genMap();
            const mySpawn = mySide === 0 ? S0 : S1, oppSpawn = mySide === 0 ? S1 : S0;
            const me = { x: mySpawn.x * CELL + 3, y: mySpawn.y * CELL + 3, dir: mySide === 0 ? 'R' : 'L', size: CELL - 6, lives: 3, shield: 0, fireCd: 0, respawn: 0 };
            let opp = { x: oppSpawn.x * CELL + 3, y: oppSpawn.y * CELL + 3, dir: mySide === 0 ? 'L' : 'R', size: CELL - 6, lives: 3, shield: 0 };
            let myBullets = [], oppBullets = [], over = false, won = false;
            const consumed = new Set();
            const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (f => setTimeout(() => f(Date.now()), 33));
            const caf = (typeof cancelAnimationFrame === 'function') ? cancelAnimationFrame : (id => clearTimeout(id));

            const blocked = (nx, ny, size) => {
                if (nx < 0 || ny < 0 || nx + size > W || ny + size > H) return true;
                const x0 = Math.floor(nx / CELL), x1 = Math.floor((nx + size - 1) / CELL);
                const y0 = Math.floor(ny / CELL), y1 = Math.floor((ny + size - 1) / CELL);
                for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
                    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
                    if (map[gy][gx] === T_BRICK || map[gy][gx] === T_STEEL) return true;
                }
                return false;
            };

            const applyRemote = (m) => {
                if (!m) return;
                if (m.tk) { opp.x = m.tk.x; opp.y = m.tk.y; opp.dir = m.tk.dir; opp.lives = m.tk.lives; opp.shield = m.tk.shield || 0; }
                if (m.b) oppBullets = m.b;
                if (m.hit) hitMe();
                if (m.over != null) finish(m.over === 0 ? 1 : m.over === 1 ? 0 : 2);
            };

            const sendNet = () => { if (over) return; MG.pvp.commit({ tk: { x: me.x, y: me.y, dir: me.dir, lives: me.lives, shield: me.shield }, b: myBullets.filter(x => !x.dead).map(x => ({ id: x.id, x: x.x, y: x.y })), hit: 0 }); };

            const hitMe = () => {
                if (over || me.respawn > 0 || me.shield > 0) return;
                me.lives--; me.shield = 1.6; me.respawn = 1.4;
                if (me.lives <= 0) { over = true; won = false; MG.pvp.commit({ tk: { x: me.x, y: me.y, dir: me.dir, lives: 0, shield: 0 }, b: myBullets.filter(x => !x.dead).map(x => ({ id: x.id, x: x.x, y: x.y })), over: 0 }); finish(0); }
            };

            let bid = 1;
            const fire = () => {
                if (over || me.fireCd > 0 || me.respawn > 0) return;
                me.fireCd = 0.35;
                const d = DIRS[me.dir], cx = me.x + me.size / 2, cy = me.y + me.size / 2;
                myBullets.push({ id: bid++, x: cx + d.x * 14 - 2, y: cy + d.y * 14 - 2, vx: d.x * 340, vy: d.y * 340 });
            };

            const finish = (code) => {   // 1 胜 / 0 负 / 2 平
                if (over) return; over = true; won = code === 1;
                opts.onComplete && opts.onComplete({
                    win: code === 1, stars: code === 1 ? 3 : (code === 2 ? 1 : 0),
                    title: code === 1 ? '🏆 你击毁了对手！' : (code === 2 ? '🤝 平局' : '💥 你的坦克被击毁…'),
                    lines: [`剩余生命 ${me.lives}`, `对手剩余 ${opp.lives}`],
                });
            };

            // 输入（联网中每端一名玩家，WASD 与方向键都控制自己）
            const keys = new Set();
            const KMAP = { KeyW: 'U', KeyS: 'D', KeyA: 'L', KeyD: 'R', ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' };
            const FIRE = ['KeyF', 'Space', 'Enter'];
            const onKeyDown = e => {
                const k = KMAP[e.code];
                if (k || FIRE.includes(e.code)) e.preventDefault();
                if (FIRE.includes(e.code)) fire();
                if (k) me.dir = k;
                keys.add(e.code);
            };
            const onKeyUp = e => keys.delete(e.code);
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onKeyUp);
            let tsx = 0, tsy = 0, tdir = null, tmoved = false;
            c.addEventListener('touchstart', e => { const p = e.touches[0]; tsx = p.clientX; tsy = p.clientY; tmoved = false; }, { passive: true });
            c.addEventListener('touchmove', e => { const p = e.touches[0], dx = p.clientX - tsx, dy = p.clientY - tsy; if (Math.hypot(dx, dy) > 16) { tmoved = true; tdir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'); tsx = p.clientX; tsy = p.clientY; } }, { passive: true });
            c.addEventListener('touchend', () => { if (!tmoved) fire(); else if (tdir) me.dir = tdir; tdir = null; }, { passive: true });

            let last = Date.now();
            const loop = () => {
                if (over) { draw(); rafId = raf(loop); return; }
                const now = Date.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
                me.fireCd -= dt;
                if (me.shield > 0) me.shield -= dt;
                if (me.respawn > 0) {
                    me.respawn -= dt;
                    if (me.respawn <= 0) { me.x = mySpawn.x * CELL + 3; me.y = mySpawn.y * CELL + 3; me.dir = mySide === 0 ? 'R' : 'L'; }
                } else {
                    let mv = null;
                    if (keys.has('KeyW') || keys.has('ArrowUp')) mv = 'U';
                    else if (keys.has('KeyS') || keys.has('ArrowDown')) mv = 'D';
                    else if (keys.has('KeyA') || keys.has('ArrowLeft')) mv = 'L';
                    else if (keys.has('KeyD') || keys.has('ArrowRight')) mv = 'R';
                    if (mv) { me.dir = mv; const d = DIRS[mv], nx = me.x + d.x * 130 * dt, ny = me.y + d.y * 130 * dt; if (!blocked(nx, ny, me.size)) { me.x = nx; me.y = ny; } }
                }
                for (const b of myBullets) {
                    b.x += b.vx * dt; b.y += b.vy * dt;
                    if (b.x < -6 || b.y < -6 || b.x > W + 6 || b.y > H + 6) { b.dead = true; continue; }
                    const gx = Math.floor((b.x + 2) / CELL), gy = Math.floor((b.y + 2) / CELL);
                    if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
                        const v = map[gy][gx];
                        if (v === T_BRICK) { map[gy][gx] = T_EMPTY; b.dead = true; }
                        else if (v === T_STEEL) b.dead = true;
                    }
                    if (b.dead) continue;
                    if (opp.lives > 0 && b.x < opp.x + opp.size && b.x + 4 > opp.x && b.y < opp.y + opp.size && b.y + 4 > opp.y) {
                        b.dead = true;
                        if (opp.shield <= 0) MG.pvp.commit({ tk: { x: me.x, y: me.y, dir: me.dir, lives: me.lives, shield: me.shield }, b: myBullets.filter(x => !x.dead).map(x => ({ id: x.id, x: x.x, y: x.y })), hit: 1 });
                    }
                }
                for (const b of oppBullets) {
                    if (consumed.has(b.id)) continue;
                    if (b.x < me.x + me.size && b.x + 4 > me.x && b.y < me.y + me.size && b.y + 4 > me.y) {
                        consumed.add(b.id);
                        if (me.shield <= 0 && me.respawn <= 0) hitMe();
                    }
                }
                myBullets = myBullets.filter(b => !b.dead);
                sendNet();
                draw();
                rafId = raf(loop);
            };
            let rafId = raf(loop);

            const draw = () => {
                ctx.fillStyle = '#16160f'; ctx.fillRect(0, 0, W, H);
                for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
                    const v = map[y][x]; if (!v) continue;
                    const px = x * CELL, py = y * CELL;
                    if (v === T_BRICK) { ctx.fillStyle = '#9c4a2a'; ctx.fillRect(px, py, CELL, CELL); ctx.fillStyle = '#7a3620'; ctx.fillRect(px + 3, py + CELL / 2 - 1, CELL, 2); }
                    else { let g = null; try { g = ctx.createLinearGradient(px, py, px + CELL, py + CELL); g.addColorStop(0, '#c8d0dc'); g.addColorStop(1, '#5a6478'); } catch (e) {} ctx.fillStyle = g || '#9aa4b6'; ctx.fillRect(px, py, CELL, CELL); }
                }
                const drawTank = (tk, col) => {
                    ctx.save(); ctx.translate(tk.x + tk.size / 2, tk.y + tk.size / 2);
                    const d = tk.dir; ctx.rotate(d === 'R' ? Math.PI / 2 : d === 'D' ? Math.PI : d === 'L' ? -Math.PI / 2 : 0);
                    ctx.fillStyle = col; ctx.fillRect(-tk.size * 0.28, -tk.size * 0.38, tk.size * 0.56, tk.size * 0.76);
                    ctx.beginPath(); ctx.arc(0, 0, tk.size * 0.24, 0, Math.PI * 2); ctx.fillStyle = '#333'; ctx.fill();
                    ctx.restore();
                    if (tk.shield > 0) { ctx.strokeStyle = 'rgba(120,200,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tk.x + tk.size / 2, tk.y + tk.size / 2, tk.size * 0.62, 0, Math.PI * 2); ctx.stroke(); }
                };
                drawTank(opp, '#8ae87a');
                drawTank(me, '#ffe066');
                const drawB = (bs, col) => { ctx.fillStyle = col; for (const b of bs) { ctx.beginPath(); ctx.arc(b.x + 2, b.y + 2, 3, 0, Math.PI * 2); ctx.fill(); } };
                drawB(oppBullets, '#8ae87a'); drawB(myBullets, '#ffe066');
                opts.onScore && opts.onScore(`你 ♥${me.lives}${me.shield > 0 ? ' 🛡' : ''} · 对手 ♥${opp.lives}${opp.shield > 0 ? ' 🛡' : ''}`);
            };

            MG.pvp.begin({ setState: applyRemote, onOver(r) { finish(r === 0 ? 1 : r === 1 ? 0 : 2); } });
            draw();
            MG.hint(container, 'WASD/方向键 移动 · F/空格/轻点 开火 · 3 条命 · 击毁对手坦克');

            if (typeof window !== 'undefined' && window.__MG_TEST) {
                window.__tankpvp = { get over() { return over; }, get me() { return me; }, get opp() { return opp; }, fire, sendNet, get bullets() { return myBullets; }, get oppBullets() { return oppBullets; }, applyRemote, hitMe };
            }
            return { stop() { caf(rafId); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); destroy(); MG.pvp.end(); } };
        },
    };
})();
