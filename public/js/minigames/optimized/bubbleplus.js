// 独立优化版：正确六邻接、真实下压、反弹瞄准、可用色弹药及掉落动画。
window.MiniGames = window.MiniGames || {};
(function () {
    const W = 400, H = 540, R = 16, COLS = 11, ROWH = R * 1.732;
    const COLORS = ['#e94f4f', '#f5a623', '#3fa34d', '#3b7bd8', '#9b59d0', '#20c9b0'];
    const NAMES = ['泡泡湾', '彩虹湖', '魔泡洞', '风暴顶'];
    const lv = [];
    for (let i = 0; i < 50; i++) {
        const rows = 5 + Math.min(5, Math.floor(i / 9));
        const colors = i < 12 ? 4 : i < 28 ? 5 : 6;
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `${rows} 行初始 · ${colors} 色 · 每弹 ${Math.max(4, 9 - Math.floor(i / 11))} 发下压` });
    }
    const gx = c => W / 2 - COLS * R + (c + 0.5) * 2 * R + (R); // 列中心 x（奇数行再偏移 R）

    MiniGames.bubbleplus = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const nColors = idx < 12 ? 4 : idx < 28 ? 5 : 6;
            const initRows = 5 + Math.min(5, Math.floor(idx / 9));
            const dropEvery = Math.max(4, 9 - Math.floor(idx / 11));
            const MAXROW = 13;
            // board[r][c] = color | -1 空（r 顶部 0 起）
            let board = [], cur = 0, next = 1, shot = null, shotsFired = 0, score = 0, over = false, aim = -Math.PI / 2;
            let ceiling = 0, falling = [], misses = 0;
            const keys = new AbortController();

            container.innerHTML = '';
            const cvs = document.createElement('canvas');
            cvs.width = W; cvs.height = H;
            cvs.style.cssText = 'max-width:100%;max-height:100%;touch-action:none;cursor:crosshair;';
            container.appendChild(cvs);
            const ctx = cvs.getContext('2d');
            const rndC = () => {
                const colors = [...new Set(board.flat().filter(c => c >= 0))];
                return colors.length ? colors[MG.ri(0, colors.length - 1)] : 0;
            };

            function cellX(r, c) { return W / 2 - COLS * R + (c + 0.5) * 2 * R + (r % 2 ? R : 0); }
            function cellY(r) { return 40 + ceiling + r * ROWH + R; }
            function colAt(r, x) { return Math.round((x - (W / 2 - COLS * R + (r % 2 ? R : 0))) / (2 * R) - 0.5); }
            function rowAt(y) { return Math.round((y - 40 - ceiling - R) / ROWH); }
            function inGrid(r, c) { return r >= 0 && r < MAXROW && c >= 0 && c < COLS - (r % 2 ? 1 : 0); }
            function reset() {
                board = Array.from({ length: MAXROW }, () => Array(COLS).fill(-1));
                const rng = MG.makeRng(8301 + idx * 977);
                for (let r = 0; r < initRows; r++) for (let c = 0; c < COLS - (r % 2 ? 1 : 0); c++) {
                    const shape = idx % 3;
                    if (shape === 1 && r > 1 && (c < r / 2 || c > COLS - 2 - r / 2)) continue;
                    if (shape === 2 && r > 2 && c % 3 === 1) continue;
                    board[r][c] = Math.floor(rng() * nColors);
                }
                cur = rndC(); next = rndC();
            }
            function neighbors(r, c) {
                const odd = r % 2, out = [];
                const offs = odd ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
                for (const [dr, dc] of offs) { const nr = r + dr, nc = c + dc; if (inGrid(nr, nc)) out.push([nr, nc]); }
                return out;
            }
            function popAt(r, c) {
                const col = board[r][c], st = [[r, c]], seen = new Set([r + ',' + c]), group = [];
                while (st.length) {
                    const [cr, cc] = st.pop(); group.push([cr, cc]);
                    for (const [nr, nc] of neighbors(cr, cc)) {
                        const k = nr + ',' + nc;
                        if (!seen.has(k) && board[nr][nc] === col) { seen.add(k); st.push([nr, nc]); }
                    }
                }
                if (group.length < 3) return 0;
                group.forEach(([r2, c2]) => { falling.push({ x: cellX(r2, c2), y: cellY(r2), c: board[r2][c2], vy: -60, life: .35 }); board[r2][c2] = -1; });
                // 悬空球掉落：从顶行泛洪，未触达的全部掉落
                const reach = new Set(), st2 = [];
                for (let c2 = 0; c2 < COLS; c2++) if (inGrid(0, c2) && board[0][c2] >= 0) { reach.add('0,' + c2); st2.push([0, c2]); }
                while (st2.length) {
                    const [cr, cc] = st2.pop();
                    for (const [nr, nc] of neighbors(cr, cc)) {
                        const k = nr + ',' + nc;
                        if (!reach.has(k) && board[nr][nc] >= 0) { reach.add(k); st2.push([nr, nc]); }
                    }
                }
                let fell = 0;
                for (let r2 = 0; r2 < MAXROW; r2++) for (let c2 = 0; c2 < COLS; c2++) {
                    if (inGrid(r2, c2) && board[r2][c2] >= 0 && !reach.has(r2 + ',' + c2)) { falling.push({ x: cellX(r2, c2), y: cellY(r2), c: board[r2][c2], vy: 0, life: 1.6 }); board[r2][c2] = -1; fell++; }
                }
                score += group.length * 20 + fell * 50;
                return group.length;
            }
            function shoot() {
                shot = { x: W / 2, y: H - 56, vx: Math.cos(aim) * 520, vy: Math.sin(aim) * 520, c: cur };
                cur = next; next = rndC();
                shotsFired++;
            }
            function stick(s, hit) {
                const candidates = hit ? neighbors(hit[0], hit[1]) : Array.from({ length: COLS }, (_, c) => [0, c]);
                const slots = candidates.filter(([r, c]) => inGrid(r, c) && board[r][c] < 0);
                slots.sort((a, b) => Math.hypot(cellX(...a) - s.x, cellY(a[0]) - s.y) - Math.hypot(cellX(...b) - s.x, cellY(b[0]) - s.y));
                if (!slots.length) { shot = null; return lose(); }
                const [r, c] = slots[0];
                board[r][c] = s.c;
                shot = null;
                const popped = popAt(r, c);
                if (!popped) misses++;
                if (board.every(row => row.every(v => v < 0))) return win2();
                if (misses >= dropEvery) { dropCeiling(); misses = 0; }
                const colors = new Set(board.flat().filter(c => c >= 0));
                if (!colors.has(cur)) cur = rndC();
                if (!colors.has(next)) next = rndC();
                if (board.some((row, rr) => row.some(v => v >= 0) && cellY(rr) > H - 110)) return lose();
            }
            function dropCeiling() {
                ceiling += ROWH;
            }
            const done = (win, lines) => {
                if (over) return; over = true; clearInterval(timer);
                keys.abort();
                opts.onComplete && opts.onComplete({ win, score, stars: win ? (score >= 800 ? 3 : score >= 450 ? 2 : 1) : 0, lines });
            };
            const win2 = () => done(true, ['清空所有泡泡！', '得分 ' + score]);
            const lose = () => done(false, ['泡泡压过底线了…', '得分 ' + score]);

            function step() {
                if (over || document.hidden) return;
                const dt = 0.028;
                falling = falling.filter(p => { p.life -= dt; p.vy += dt * 550; p.y += p.vy * dt; return p.life > 0 && p.y < H; });
                for (let sub = 0; sub < 4 && shot; sub++) {
                    shot.x += shot.vx * dt / 4; shot.y += shot.vy * dt / 4;
                    if (shot.x < 40) { shot.x = 80 - shot.x; shot.vx = Math.abs(shot.vx); }
                    if (shot.x > 360) { shot.x = 720 - shot.x; shot.vx = -Math.abs(shot.vx); }
                    if (shot.y <= cellY(0)) { stick(shot); break; }
                    let hit = null;
                    for (let r = 0; r < MAXROW && !hit; r++) for (let c = 0; c < COLS; c++) {
                        if (inGrid(r, c) && board[r][c] >= 0 && Math.hypot(cellX(r, c) - shot.x, cellY(r) - shot.y) <= R * 2) { hit = [r, c]; break; }
                    }
                    if (hit) stick(shot, hit);
                    if (shot && shot.y > H) shot = null;
                }
                draw();
                opts.onScore && opts.onScore(`得分 ${score} · 下压 ${dropEvery - misses}`);
            }
            function draw() {
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#14304a'); g.addColorStop(1, '#0a1626');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = '#788b95'; ctx.fillRect(24, 40, 352, ceiling + 4);
                ctx.fillStyle = '#bbcad0'; ctx.fillRect(24, 40 + ceiling, 352, 4);
                ctx.strokeStyle = '#779ca8'; ctx.lineWidth = 3; ctx.strokeRect(24, 40, 352, H - 150);
                ctx.strokeStyle = '#e97274'; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(24, H - 110); ctx.lineTo(376, H - 110); ctx.stroke(); ctx.setLineDash([]);
                // 瞄准虚线（含一次反弹）
                ctx.setLineDash([5, 7]); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2;
                let ax = W / 2, ay = H - 56, dx = Math.cos(aim), dy = Math.sin(aim);
                ctx.beginPath(); ctx.moveTo(ax, ay);
                for (let k = 0; k < 350; k++) {
                    ax += dx * 3; ay += dy * 3;
                    if (ax < 40) { ax = 80 - ax; dx *= -1; }
                    if (ax > 360) { ax = 720 - ax; dx *= -1; }
                    ctx.lineTo(ax, ay);
                    if (ay <= cellY(0) || board.some((row, r) => row.some((v, c) => v >= 0 && Math.hypot(cellX(r, c) - ax, cellY(r) - ay) <= R * 2))) break;
                }
                ctx.stroke(); ctx.setLineDash([]);
                // 球阵
                for (let r = 0; r < MAXROW; r++) for (let c = 0; c < COLS; c++) {
                    if (inGrid(r, c) && board[r][c] >= 0) bub(cellX(r, c), cellY(r), board[r][c], R);
                }
                // 发射台：石座 + 绿色泡泡龙 + 旋转炮管
                ctx.fillStyle = '#23405e'; ctx.fillRect(0, H - 40, W, 40);
                ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0, H - 40, W, 2);
                const lv0 = { x: W / 2, y: H - 52 };
                // 炮管（在龙身后方绘制，随瞄准旋转）
                ctx.save();
                ctx.translate(lv0.x, lv0.y); ctx.rotate(aim);
                ctx.fillStyle = '#1e5c2c'; MG.ui.rr(ctx, -6, -7, 34, 14, 6); ctx.fill();
                ctx.strokeStyle = '#0d3016'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#2e8b3f'; MG.ui.rr(ctx, 2, -4.5, 22, 9, 4); ctx.fill();
                ctx.restore();
                drawDragon(lv0.x, lv0.y + 12, aim);
                bub(lv0.x + Math.cos(aim) * 34, lv0.y + Math.sin(aim) * 34, cur, R);
                // 待发球托架
                ctx.fillStyle = '#183250'; MG.ui.rr(ctx, W / 2 + 52, H - 26, 34, 20, 8); ctx.fill();
                bub(W / 2 + 69, H - 16, next, R * 0.6);
                if (shot) bub(shot.x, shot.y, shot.c, R);
                for (const p of falling) { ctx.globalAlpha = Math.min(1, p.life * 3); bub(p.x, p.y, p.c, R); }
                ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.fillStyle = '#ebf6f4'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('泡泡龙优化版', W / 2, 25);
            }
            // 泡泡龙小龙（蹲坐，头随视线微偏）
            function drawDragon(x, y, aim) {
                const look = Math.cos(aim) * 2.2;   // 眼球朝瞄准方向偏
                // 尾巴
                ctx.strokeStyle = '#2e8b3f'; ctx.lineWidth = 7; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(x - 10, y + 2);
                ctx.quadraticCurveTo(x - 26, y + 4, x - 30, y - 8); ctx.stroke();
                ctx.lineWidth = 4; ctx.strokeStyle = '#7ee06a';
                ctx.beginPath(); ctx.moveTo(x - 24, y + 4); ctx.quadraticCurveTo(x - 29, y + 3, x - 30, y - 6); ctx.stroke();
                // 脚
                ctx.fillStyle = '#1e5c2c';
                ctx.beginPath(); ctx.ellipse(x - 10, y + 10, 8, 4.5, 0.2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(x + 10, y + 10, 8, 4.5, -0.2, 0, Math.PI * 2); ctx.fill();
                // 身体
                ctx.beginPath(); ctx.ellipse(x, y + 4, 16, 13, 0, 0, Math.PI * 2);
                const bg = ctx.createRadialGradient(x - 4, y - 2, 3, x, y + 4, 20);
                bg.addColorStop(0, '#8fe06e'); bg.addColorStop(0.5, '#3fae4c'); bg.addColorStop(1, '#1e6b2d');
                ctx.fillStyle = bg; ctx.fill();
                ctx.strokeStyle = '#0d3016'; ctx.lineWidth = 2; ctx.stroke();
                // 肚皮
                ctx.beginPath(); ctx.ellipse(x, y + 7, 9, 8, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#f0f5b8'; ctx.fill();
                // 肚皮横纹
                ctx.strokeStyle = 'rgba(120,130,50,0.5)'; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(x - 7, y + 6); ctx.lineTo(x + 7, y + 6); ctx.moveTo(x - 6, y + 10); ctx.lineTo(x + 6, y + 10); ctx.stroke();
                // 背鳍（三枚小三角）
                ctx.fillStyle = '#e0483e';
                for (let k = -1; k <= 1; k++) {
                    ctx.beginPath();
                    ctx.moveTo(x + k * 9 - 3, y - 4 + Math.abs(k) * 3);
                    ctx.lineTo(x + k * 9, y - 11 + Math.abs(k) * 3.5);
                    ctx.lineTo(x + k * 9 + 3, y - 4 + Math.abs(k) * 3);
                    ctx.closePath(); ctx.fill();
                }
                // 大头
                ctx.beginPath(); ctx.arc(x, y - 14, 14, 0, Math.PI * 2);
                const hg = ctx.createRadialGradient(x - 4, y - 19, 3, x, y - 14, 17);
                hg.addColorStop(0, '#9ce878'); hg.addColorStop(0.55, '#3fae4c'); hg.addColorStop(1, '#1e6b2d');
                ctx.fillStyle = hg; ctx.fill();
                ctx.strokeStyle = '#0d3016'; ctx.lineWidth = 2; ctx.stroke();
                // 吻部
                ctx.beginPath(); ctx.ellipse(x, y - 8, 8, 5.5, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#b8ec8e'; ctx.fill();
                ctx.strokeStyle = '#0d3016'; ctx.lineWidth = 1.4; ctx.stroke();
                // 鼻孔 + 嘴
                ctx.fillStyle = '#0d3016';
                ctx.beginPath(); ctx.arc(x - 3, y - 9.5, 1, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + 3, y - 9.5, 1, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#0d3016'; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.arc(x, y - 5.5, 3.4, 0.15, Math.PI - 0.15); ctx.stroke();
                // 大眼（白底黑瞳，看向瞄准方向）
                for (const s of [-1, 1]) {
                    ctx.beginPath(); ctx.arc(x + s * 6.5, y - 18, 5, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff'; ctx.fill();
                    ctx.strokeStyle = '#0d3016'; ctx.lineWidth = 1.3; ctx.stroke();
                    ctx.beginPath(); ctx.arc(x + s * 6.5 + look, y - 17.4, 2.3, 0, Math.PI * 2);
                    ctx.fillStyle = '#141414'; ctx.fill();
                    ctx.beginPath(); ctx.arc(x + s * 6.5 + look - 0.8, y - 18.6, 0.8, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff'; ctx.fill();
                }
                // 小手扶炮座
                ctx.fillStyle = '#2e8b3f';
                ctx.beginPath(); ctx.arc(x - 13, y - 2, 4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + 13, y - 2, 4, 0, Math.PI * 2); ctx.fill();
            }
            function bub(x, y, c, r) {
                const col = COLORS[c % COLORS.length];
                const rg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
                rg.addColorStop(0, '#ffffffcc'); rg.addColorStop(0.35, col); rg.addColorStop(1, '#00000077');
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = rg; ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
            }
            function setAim(e) {
                const r = cvs.getBoundingClientRect();
                const x = (e.clientX - r.left) * (W / r.width), y = (e.clientY - r.top) * (H / r.height);
                aim = Math.atan2(Math.min(y, H - 120) - (H - 56), x - W / 2);
                if (aim > -0.12) aim = -0.12; if (aim < -Math.PI + 0.12) aim = -Math.PI + 0.12;
            }
            cvs.addEventListener('pointermove', setAim);
            cvs.addEventListener('pointerdown', e => { if (e.button === 2) return; setAim(e); if (!over && !shot) shoot(); });
            cvs.addEventListener('contextmenu', e => { e.preventDefault(); if (!over && !shot) [cur, next] = [next, cur]; });
            window.addEventListener('keydown', e => {
                if (over || shot) return;
                if (['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
                if (e.code === 'ArrowLeft') aim = Math.max(-Math.PI + .12, aim - .06);
                if (e.code === 'ArrowRight') aim = Math.min(-.12, aim + .06);
                if (e.code === 'Space' || e.code === 'ArrowUp') shoot();
                if (e.code === 'ArrowDown') [cur, next] = [next, cur];
            }, { signal: keys.signal });
            reset(); draw();
            if (window.__MG_TEST) window.__bubblePlusDbg = { popAt, neighbors, inGrid, stick, dropCeiling, cellY, cellX, get board() { return board; }, set board(v) { board = v; } };
            const timer = setInterval(step, 28);
            return { stop() { over = true; clearInterval(timer); keys.abort(); } };
        },
    };
})();
