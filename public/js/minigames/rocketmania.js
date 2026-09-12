// 疯狂火箭：旋转管道接通引信，点火升空，限时完成配额
window.MiniGames = window.MiniGames || {};
(function () {
    const W = 420, H = 560, G = 7, CS = 44, X0 = 46, Y0 = 96;
    // 管型开口（N=0,E=1,S=2,W=3），rot 为顺时针 90° 次数
    const TYPES = {
        I: { base: [0, 2] }, L: { base: [0, 1] }, T: { base: [0, 1, 3] }, X: { base: [0, 1, 2, 3] },
    };
    const NAMES = ['点火演习', '火箭军列', '升空狂潮', '星际发射场'];
    const lv = [];
    for (let i = 0; i < 50; i++) {
        const rockets = i < 10 ? 1 : i < 30 ? 2 : 3;
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `发射 ${rockets} 枚火箭 · 90 秒` });
    }
    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    MiniGames.rocketmania = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const quota = idx < 10 ? 1 : idx < 30 ? 2 : 3;
            const timeLimit = 90;
            let grid = [], time = timeLimit, launched = 0, score = 0, combo = 0, over = false;
            let fuseRow = 1 + MG.ri(0, G - 3);
            let rocketRows = [];
            {
                const pool = [];
                for (let r = 0; r < G; r++) if (r !== fuseRow) pool.push(r);
                MG.shuffle(pool);
                rocketRows = pool.slice(0, quota).sort((a, b) => a - b);
            }
            const rndType = () => MG.pick(['I', 'I', 'L', 'L', 'T', 'X']);

            container.innerHTML = '';
            const cvs = document.createElement('canvas');
            cvs.width = W; cvs.height = H;
            cvs.style.cssText = 'max-width:100%;max-height:100%;touch-action:manipulation;cursor:pointer;';
            container.appendChild(cvs);
            const ctx = cvs.getContext('2d');

            function newTile() { return { t: rndType(), rot: MG.ri(0, 3) }; }
            function openings(cell) {
                return TYPES[cell.t].base.map(d => (d + cell.rot) % 4);
            }
            function hasOpen(cell, d) { return openings(cell).includes(d); }
            function reset() {
                grid = Array.from({ length: G }, () => Array.from({ length: G }, newTile));
            }
            // 从左侧引信口 BFS，找一条到火箭的通路
            function findPath() {
                const start = { r: fuseRow, c: 0 };
                if (!grid[fuseRow] || !hasOpen(grid[fuseRow][0], 3)) return null;
                const prev = new Map(), key = p => p.r + ',' + p.c;
                const q = [start]; prev.set(key(start), null);
                while (q.length) {
                    const p = q.shift();
                    const cell = grid[p.r][p.c];
                    for (const d of openings(cell)) {
                        const nr = p.r + DIRS[d][1], nc = p.c + DIRS[d][0];
                        // 通向右侧火箭？
                        if (d === 1 && nc === G && rocketRows.includes(p.r)) {
                            const path = []; let cur = p;
                            while (cur) { path.unshift(cur); cur = prev.get(key(cur)); }
                            return path;
                        }
                        if (nr < 0 || nr >= G || nc < 0 || nc >= G) continue;
                        const opp = (d + 2) % 4, k = key({ r: nr, c: nc });
                        if (prev.has(k) || !hasOpen(grid[nr][nc], opp)) continue;
                        prev.set(k, p); q.push({ r: nr, c: nc });
                    }
                }
                return null;
            }
            function tryLaunch() {
                const path = findPath();
                if (!path) { combo = 0; return false; }
                launched++; combo++;
                score += 120 * combo;
                path.forEach(p => grid[p.r][p.c] = newTile()); // 通路管道消耗重置
                return true;
            }
            cvs.addEventListener('pointerdown', e => {
                if (over) return;
                const r = cvs.getBoundingClientRect();
                const x = (e.clientX - r.left) * (W / r.width) - X0, y = (e.clientY - r.top) * (H / r.height) - Y0;
                const c = Math.floor(x / CS), row = Math.floor(y / CS);
                if (c >= 0 && c < G && row >= 0 && row < G) {
                    grid[row][c].rot = (grid[row][c].rot + 1) % 4;
                    if (tryLaunch()) draw(true, pathOf(findPath()));
                    else draw();
                }
            });
            function pathOf(p) { return p || null; }

            const done = (win, lines) => {
                if (over) return; over = true; clearInterval(timer);
                opts.onComplete && opts.onComplete({ win, stars: win ? (time >= 50 ? 3 : time >= 25 ? 2 : 1) : 0, lines });
            };
            function step() {
                if (over) return;
                time -= 0.25;
                if (time <= 0) return done(false, ['时间到！', `发射 ${launched}/${quota} 枚`]);
                if (tryLaunch()) { /* 自动连发（一条通路接多枚的情况逐次触发） */ }
                if (launched >= quota) done(true, ['全部升空！🚀', '得分 ' + score]);
                draw();
                opts.onScore && opts.onScore(`⏱ ${Math.ceil(time)}s · 已发射 ${launched}/${quota} · 连击 ×${combo}`);
            }
            function draw(spark, path) {
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#1a2438'); g.addColorStop(1, '#0a0f1c');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(X0 - 6, Y0 - 6, G * CS + 12, G * CS + 12);
                // 引信入口：点火起爆器（红箱 + T 型摇杆）
                const fx = X0 - 26, fy = Y0 + fuseRow * CS + CS / 2;
                ctx.fillStyle = '#b03028'; MG.ui.rr(ctx, fx - 16, fy - 14, 30, 26, 4); ctx.fill();
                ctx.strokeStyle = '#5c1410'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#8c2018'; MG.ui.rr(ctx, fx - 12, fy - 10, 22, 8, 2); ctx.fill();
                ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(fx - 1, fy + 2); ctx.lineTo(fx - 1, fy - 14); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(fx - 7, fy - 14); ctx.lineTo(fx + 6, fy - 14); ctx.stroke();
                ctx.font = '12px sans-serif'; ctx.fillStyle = '#ffd56b'; ctx.textAlign = 'center';
                ctx.fillText('点火', fx - 1, fy + 22);
                // 格子与管道
                for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
                    const px = X0 + c * CS, py = Y0 + r * CS;
                    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
                    ctx.strokeRect(px + .5, py + .5, CS - 1, CS - 1);
                    drawPipes(px, py, grid[r][c]);
                }
                // 发射架 + 火箭
                for (const rr of rocketRows) {
                    const cy = Y0 + rr * CS + CS / 2, cx = X0 + G * CS + 26;
                    // 发射架
                    ctx.fillStyle = '#2c3444'; ctx.fillRect(X0 + G * CS + 4, cy + 6, 44, 7);
                    ctx.fillStyle = '#39445a';
                    ctx.fillRect(cx - 12, cy + 13, 5, 10); ctx.fillRect(cx + 8, cy + 13, 5, 10);
                    ctx.fillStyle = '#e8b23c';
                    for (let k = 0; k < 5; k++) ctx.fillRect(X0 + G * CS + 5 + k * 9, cy + 7, 5, 3);
                    const launchedYet = launched > 0 && rocketRows.indexOf(rr) < launched;
                    ctx.globalAlpha = launchedYet ? 0.25 : 1;
                    drawRocket(cx, cy);
                    ctx.globalAlpha = 1;
                }
                // 发射火花动画路径
                if (spark && path) {
                    ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(X0 - 14, Y0 + fuseRow * CS + CS / 2);
                    path.forEach(p => ctx.lineTo(X0 + p.c * CS + CS / 2, Y0 + p.r * CS + CS / 2));
                    ctx.lineTo(X0 + G * CS + 8, Y0 + path[path.length - 1].r * CS + CS / 2);
                    ctx.stroke();
                    ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 2.4; ctx.stroke();
                }
            }
            function drawPipes(px, py, cell) {
                const ops = openings(cell);
                const cx = px + CS / 2, cy = py + CS / 2;
                const colMain = cell.t === 'X' ? '#d8a24a' : '#7ab8d8';
                // 底影 → 主管 → 高光 → 法兰
                ctx.lineCap = 'butt';
                for (const [w, col] of [[12, 'rgba(0,0,0,0.35)'], [8, colMain], [3, MG.gfx.lighten(colMain, 0.45)]]) {
                    ctx.strokeStyle = col; ctx.lineWidth = w;
                    for (const d of ops) {
                        ctx.beginPath(); ctx.moveTo(cx, cy);
                        ctx.lineTo(cx + DIRS[d][0] * CS / 2, cy + DIRS[d][1] * CS / 2); ctx.stroke();
                    }
                }
                ctx.fillStyle = '#c8dcf0';
                ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
                // 开口端法兰（垂直于管道的小横杆）
                ctx.strokeStyle = MG.gfx.darken(colMain, 0.35); ctx.lineWidth = 3; ctx.lineCap = 'round';
                for (const d of ops) {
                    const ex = cx + DIRS[d][0] * (CS / 2 - 2), ey = cy + DIRS[d][1] * (CS / 2 - 2);
                    const px2 = DIRS[d][1], py2 = DIRS[d][0];   // 法线方向
                    ctx.beginPath(); ctx.moveTo(ex + px2 * 6, ey + py2 * 6); ctx.lineTo(ex - px2 * 6, ey - py2 * 6); ctx.stroke();
                }
            }
            // 火箭（朝右：尖头朝发射方向）
            function drawRocket(cx, cy) {
                ctx.save(); ctx.translate(cx, cy);
                // 尾翼
                ctx.fillStyle = '#d84040';
                ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(-20, -15); ctx.lineTo(-8, -9); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(-14, 8); ctx.lineTo(-20, 15); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
                // 箭体
                const bg = ctx.createLinearGradient(0, -9, 0, 9);
                bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#e8e8ee'); bg.addColorStop(1, '#b8bcc8');
                ctx.fillStyle = bg;
                MG.ui.rr(ctx, -16, -9, 26, 18, 8); ctx.fill();
                ctx.strokeStyle = '#6a6f7c'; ctx.lineWidth = 1.4; ctx.stroke();
                // 条纹环
                ctx.fillStyle = '#d84040';
                ctx.fillRect(-12, -9, 4, 18); ctx.fillRect(2, -9, 4, 18);
                // 舷窗
                ctx.beginPath(); ctx.arc(-4, 0, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#7ec8e8'; ctx.fill();
                ctx.strokeStyle = '#5c1410'; ctx.lineWidth = 1.6; ctx.stroke();
                ctx.beginPath(); ctx.arc(-5.2, -1.2, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
                // 尖锥
                ctx.fillStyle = '#e05c50';
                ctx.beginPath(); ctx.moveTo(10, -8); ctx.quadraticCurveTo(22, 0, 10, 8); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#8c2a22'; ctx.lineWidth = 1.4; ctx.stroke();
                // 尾焰（待发射余火）
                ctx.fillStyle = 'rgba(255,170,60,0.85)';
                ctx.beginPath(); ctx.moveTo(-16, -4); ctx.lineTo(-24, 0); ctx.lineTo(-16, 4); ctx.closePath(); ctx.fill();
                ctx.fillStyle = 'rgba(255,240,180,0.9)';
                ctx.beginPath(); ctx.moveTo(-16, -2); ctx.lineTo(-20, 0); ctx.lineTo(-16, 2); ctx.closePath(); ctx.fill();
                ctx.restore();
            }
            reset(); draw();
            window.__rocketDbg = { findPath, tryLaunch, hasOpen, openings, get grid() { return grid; }, set grid(v) { grid = v; }, get fuseRow() { return fuseRow; }, set rocketRows(v) { rocketRows = v; } };
            const timer = setInterval(step, 250);
            return { stop() { clearInterval(timer); } };
        },
    };
})();
