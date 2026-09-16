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
            // 夜空星点（预生成，闪烁）
            const stars = [];
            for (let i = 0; i < 64; i++) stars.push({ x: Math.random() * W, y: Math.random() * (Y0 - 10), r: Math.random() * 1.4 + 0.4, ph: Math.random() * 6.28 });
            let lastSpark = false, lastPath = null, frame = 0, raf = 0, sparkFrame = -999;
            function draw(spark, path) {
                if (spark !== undefined) {
                    if (spark) { lastSpark = true; sparkFrame = frame; if (path && path.length) lastPath = path; }
                    else lastSpark = false;
                }
                frame++;
                // 夜空背景
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#0a0f28'); g.addColorStop(0.55, '#141a3c'); g.addColorStop(1, '#1d2342');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                // 月亮辉光
                const mg = ctx.createRadialGradient(W - 58, 52, 4, W - 58, 52, 72);
                mg.addColorStop(0, 'rgba(220,230,255,0.5)'); mg.addColorStop(1, 'rgba(220,230,255,0)');
                ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(W - 58, 52, 72, 0, 6.29); ctx.fill();
                ctx.fillStyle = '#eef3ff'; ctx.beginPath(); ctx.arc(W - 58, 52, 16, 0, 6.29); ctx.fill();
                ctx.fillStyle = '#141a3c'; ctx.beginPath(); ctx.arc(W - 46, 46, 14, 0, 6.29); ctx.fill();
                // 星星闪烁
                for (const s of stars) {
                    const a = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(frame * 0.05 + s.ph));
                    ctx.fillStyle = `rgba(255,255,255,${a})`;
                    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.29); ctx.fill();
                }
                // 控制面板底板
                const bx = X0 - 10, by = Y0 - 10, bw = G * CS + 20, bh = G * CS + 20;
                const pg = ctx.createLinearGradient(0, by, 0, by + bh);
                pg.addColorStop(0, '#2a3350'); pg.addColorStop(1, '#1a2238');
                ctx.fillStyle = pg; MG.ui.rr(ctx, bx, by, bw, bh, 10); ctx.fill();
                ctx.strokeStyle = '#3d4a6e'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#566089';
                for (const [cx2, cy2] of [[bx + 6, by + 6], [bx + bw - 6, by + 6], [bx + 6, by + bh - 6], [bx + bw - 6, by + bh - 6]]) {
                    ctx.beginPath(); ctx.arc(cx2, cy2, 2.6, 0, 6.29); ctx.fill();
                }
                // 引信入口：点火起爆器（红箱 + T 型摇杆）
                const fx = X0 - 26, fy = Y0 + fuseRow * CS + CS / 2;
                ctx.fillStyle = '#9c2a22'; MG.ui.rr(ctx, fx - 18, fy - 16, 34, 30, 5); ctx.fill();
                ctx.strokeStyle = '#4a100c'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#c93a30'; MG.ui.rr(ctx, fx - 14, fy - 12, 26, 10, 2); ctx.fill();
                ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(fx - 1, fy + 2); ctx.lineTo(fx - 1, fy - 16); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(fx - 8, fy - 16); ctx.lineTo(fx + 6, fy - 16); ctx.stroke();
                ctx.font = '12px sans-serif'; ctx.fillStyle = '#ffd56b'; ctx.textAlign = 'center';
                ctx.fillText('点火', fx - 1, fy + 24);
                // 格子与管道
                for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
                    const px = X0 + c * CS, py = Y0 + r * CS;
                    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
                    ctx.strokeRect(px + .5, py + .5, CS - 1, CS - 1);
                    drawPipes(px, py, grid[r][c]);
                }
                // 火箭（自带入发射台）
                for (const rr of rocketRows) {
                    const cy = Y0 + rr * CS + CS / 2, cx = X0 + G * CS + 26;
                    const launchedYet = launched > 0 && rocketRows.indexOf(rr) < launched;
                    ctx.globalAlpha = launchedYet ? 0.25 : 1;
                    drawRocket(cx, cy);
                    ctx.globalAlpha = 1;
                }
                // 发射火花动画路径（带彗星头与拖尾）
                if (lastSpark && lastPath && lastPath.length) {
                    const pts = [{ x: X0 - 14, y: Y0 + fuseRow * CS + CS / 2 }];
                    lastPath.forEach(p => pts.push({ x: X0 + p.c * CS + CS / 2, y: Y0 + p.r * CS + CS / 2 }));
                    pts.push({ x: X0 + G * CS + 8, y: Y0 + lastPath[lastPath.length - 1].r * CS + CS / 2 });
                    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    ctx.strokeStyle = 'rgba(255,200,90,0.35)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
                    ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
                    ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
                    const segs = pts.length - 1, head = (frame * 0.08) % segs, si = Math.floor(head), t = head - si;
                    const hx = pts[si].x + (pts[si + 1].x - pts[si].x) * t, hy = pts[si].y + (pts[si + 1].y - pts[si].y) * t;
                    const hg = ctx.createRadialGradient(hx, hy, 1, hx, hy, 12);
                    hg.addColorStop(0, 'rgba(255,255,220,0.95)'); hg.addColorStop(1, 'rgba(255,200,90,0)');
                    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, 12, 0, 6.29); ctx.fill();
                }
            }
            function drawPipes(px, py, cell) {
                const ops = openings(cell);
                const cx = px + CS / 2, cy = py + CS / 2;
                const colMain = cell.t === 'X' ? '#e0b24e' : '#8fc4e6';
                const colDark = MG.gfx.darken(colMain, 0.45), colLite = MG.gfx.lighten(colMain, 0.5);
                ctx.lineCap = 'round';
                // 底影
                ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 13;
                for (const d of ops) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + DIRS[d][0] * CS / 2, cy + DIRS[d][1] * CS / 2); ctx.stroke(); }
                // 主管（金属纵向高光）+ 高光细线
                for (const d of ops) {
                    const ex = cx + DIRS[d][0] * CS / 2, ey = cy + DIRS[d][1] * CS / 2;
                    const pg = ctx.createLinearGradient(cx - 5, cy - 5, cx + 5, cy + 5);
                    pg.addColorStop(0, colLite); pg.addColorStop(0.5, colMain); pg.addColorStop(1, colDark);
                    ctx.strokeStyle = pg; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
                }
                // 中心轮毂
                const hg = ctx.createRadialGradient(cx - 1.5, cy - 1.5, 1, cx, cy, 6);
                hg.addColorStop(0, colLite); hg.addColorStop(1, colDark);
                ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, 6.29); ctx.fill();
                ctx.strokeStyle = colDark; ctx.lineWidth = 1.4; ctx.stroke();
                // 开口端法兰（带铆钉的套环）
                for (const d of ops) {
                    const ex = cx + DIRS[d][0] * (CS / 2 - 1), ey = cy + DIRS[d][1] * (CS / 2 - 1);
                    const nx = DIRS[d][1], ny = DIRS[d][0]; // 法线方向
                    ctx.strokeStyle = colDark; ctx.lineWidth = 5;
                    ctx.beginPath(); ctx.moveTo(ex + nx * 6, ey + ny * 6); ctx.lineTo(ex - nx * 6, ey - ny * 6); ctx.stroke();
                    ctx.strokeStyle = colLite; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(ex + nx * 6, ey + ny * 6); ctx.lineTo(ex - nx * 6, ey - ny * 6); ctx.stroke();
                    ctx.fillStyle = '#cfd8e8';
                    for (const tt of [-3.5, 3.5]) { ctx.beginPath(); ctx.arc(ex + nx * tt, ey + ny * tt, 1.3, 0, 6.29); ctx.fill(); }
                }
            }
            // 火箭（朝右：尖头朝发射方向），自带发射台与动态尾焰
            function drawRocket(cx, cy) {
                ctx.save(); ctx.translate(cx, cy);
                // 发射台
                ctx.fillStyle = '#3a4258';
                ctx.beginPath(); ctx.moveTo(-18, 18); ctx.lineTo(18, 18); ctx.lineTo(13, 26); ctx.lineTo(-13, 26); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#4f5a78';
                for (let k = -12; k <= 12; k += 6) ctx.fillRect(k - 1.5, 18, 3, 8);
                // 尾焰（动态跳动）
                const fl = 14 + Math.sin(frame * 0.4) * 4 + Math.random() * 3;
                const fg = ctx.createLinearGradient(-16, 0, -16 - fl, 0);
                fg.addColorStop(0, 'rgba(255,230,150,0.95)'); fg.addColorStop(0.5, 'rgba(255,150,40,0.9)'); fg.addColorStop(1, 'rgba(255,80,20,0)');
                ctx.fillStyle = fg;
                ctx.beginPath(); ctx.moveTo(-16, -5); ctx.quadraticCurveTo(-16 - fl * 0.6, -3, -16 - fl, 0); ctx.quadraticCurveTo(-16 - fl * 0.6, 3, -16, 5); ctx.closePath(); ctx.fill();
                // 尾翼
                ctx.fillStyle = '#d84040';
                ctx.beginPath(); ctx.moveTo(-14, -9); ctx.lineTo(-22, -16); ctx.lineTo(-9, -9); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(-14, 9); ctx.lineTo(-22, 16); ctx.lineTo(-9, 9); ctx.closePath(); ctx.fill();
                // 箭体金属渐变
                const bg = ctx.createLinearGradient(0, -9, 0, 9);
                bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.45, '#eef0f6'); bg.addColorStop(1, '#aeb4c4');
                ctx.fillStyle = bg;
                MG.ui.rr(ctx, -16, -9, 26, 18, 9); ctx.fill();
                ctx.strokeStyle = '#5d6473'; ctx.lineWidth = 1.4; ctx.stroke();
                // 高光条
                ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(-14, -7, 3, 14);
                // 红色条纹环
                ctx.fillStyle = '#d84040';
                ctx.fillRect(-12, -9, 4, 18); ctx.fillRect(1, -9, 4, 18);
                // 舷窗
                const wg = ctx.createRadialGradient(-4, -1, 1, -4, 0, 5);
                wg.addColorStop(0, '#cdeeff'); wg.addColorStop(1, '#3a8fc0');
                ctx.beginPath(); ctx.arc(-4, 0, 4, 0, 6.29); ctx.fillStyle = wg; ctx.fill();
                ctx.strokeStyle = '#4a1410'; ctx.lineWidth = 1.6; ctx.stroke();
                ctx.beginPath(); ctx.arc(-5, -1, 1.3, 0, 6.29); ctx.fillStyle = '#fff'; ctx.fill();
                // 尖锥
                const ng = ctx.createLinearGradient(8, -8, 8, 8);
                ng.addColorStop(0, '#ff8a72'); ng.addColorStop(1, '#c23a2c');
                ctx.fillStyle = ng;
                ctx.beginPath(); ctx.moveTo(10, -8); ctx.quadraticCurveTo(24, 0, 10, 8); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#8c2a22'; ctx.lineWidth = 1.4; ctx.stroke();
                ctx.restore();
            }
            function anim() { if (over) return; if (lastSpark && frame - sparkFrame > 55) lastSpark = false; draw(); raf = requestAnimationFrame(anim); }
            reset(); draw(); anim();
            window.__rocketDbg = { findPath, tryLaunch, hasOpen, openings, get grid() { return grid; }, set grid(v) { grid = v; }, get fuseRow() { return fuseRow; }, set rocketRows(v) { rocketRows = v; } };
            const timer = setInterval(step, 250);
            return { stop() { clearInterval(timer); cancelAnimationFrame(raf); } };
        },
    };
})();
