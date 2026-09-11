// 祖玛：彩球链沿石道滚向蛙口，射球插入、同色三连消除
window.MiniGames = window.MiniGames || {};
(function () {
    const W = 420, H = 560, R = 15, SP = R * 2 - 3;
    const COLORS = ['#e94f4f', '#f5a623', '#3fa34d', '#3b7bd8', '#9b59d0', '#20c9b0', '#e858a8'];
    const NAMES = ['石道初探', '蛇径蜿蜒', '回环古道', '螺旋神殿', '虫洞迷窟'];
    const lv = [];
    for (let i = 0; i < 50; i++) {
        const colors = 4 + Math.min(3, Math.floor(i / 13));
        const v = Math.round(24 + i * 0.9);
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `${colors} 色球 · 车速 ${v} · ${26 + Math.floor(i * 0.8)} 球` });
    }

    function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

    function buildPath(seed) {
        const rnd = mulberry(seed * 131 + 7);
        const yBase = 150 + rnd() * 160;
        const a1 = 60 + rnd() * 70, a2 = 50 + rnd() * 60, f1 = 1.5 + rnd(), f2 = 2.2 + rnd();
        const pts = [];
        for (let k = 0; k <= 60; k++) {
            const t = k / 60;
            const x = W + 30 - t * (W + 110);
            const y = yBase + a1 * Math.sin(t * Math.PI * f1 + seed) * (1 - t * 0.35) + a2 * Math.sin(t * Math.PI * f2 + seed * 2) * t;
            pts.push({ x: Math.max(46, Math.min(W - 46, x)), y: Math.max(52, Math.min(H - 120, y)) });
        }
        const end = { x: 84, y: H - 82 };
        pts.push({ x: 110, y: H - 108 }, end);
        // 累积长度
        const cum = [0];
        for (let k = 1; k < pts.length; k++) {
            const dx = pts[k].x - pts[k - 1].x, dy = pts[k].y - pts[k - 1].y;
            cum.push(cum[k - 1] + Math.hypot(dx, dy));
        }
        return { pts, cum, total: cum[cum.length - 1], end };
    }
    function ptAt(path, d) {
        const { pts, cum } = path;
        if (d <= 0) return pts[0];
        if (d >= path.total) return pts[pts.length - 1];
        let lo = 0, hi = cum.length - 1;
        while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
        const seg = cum[lo + 1] - cum[lo] || 1, t = (d - cum[lo]) / seg;
        return { x: pts[lo].x + (pts[lo + 1].x - pts[lo].x) * t, y: pts[lo].y + (pts[lo + 1].y - pts[lo].y) * t };
    }

    MiniGames.zuma = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const nColors = 4 + Math.min(3, Math.floor(idx / 13));
            const v = 24 + idx * 0.9;
            const count = 26 + Math.floor(idx * 0.8);
            const path = buildPath(idx + 1);
            const frog = path.end;
            let score = 0, combo = 0, over = false, spawnLeft = count;
            let chain = [], shots = [], cool = 0;
            let cur = MG.ri(0, nColors - 1), next = MG.ri(0, nColors - 1);
            let aim = { x: W / 2, y: 60 };

            container.innerHTML = '';
            const cvs = document.createElement('canvas');
            cvs.width = W; cvs.height = H;
            cvs.style.cssText = 'max-width:100%;max-height:100%;touch-action:none;cursor:crosshair;';
            container.appendChild(cvs);
            const ctx = cvs.getContext('2d');

            const hud = t => opts.onScore && opts.onScore(`得分 ${score} · 余球 ${spawnLeft + chain.length}`);
            const over2 = win => {
                if (over) return; over = true;
                clearInterval(timer);
                const stars = !win ? 0 : (score >= 900 ? 3 : score >= 550 ? 2 : 1);
                opts.onComplete && opts.onComplete({ win, stars, lines: [win ? '球链全部消除！' : '球链滚进了蛙口…', '得分 ' + score] });
            };

            function insert(j, side, c) {
                const d = chain[j].d + side * SP * 0.5;
                chain.splice(side > 0 ? j : j + 1, 0, { d, c });
                normalize();
                // 消除判定：以新球为中心找同色连段
                let k = side > 0 ? j : j + 1;
                let a = k, b = k;
                while (a > 0 && chain[a - 1].c === c) a--;
                while (b < chain.length - 1 && chain[b + 1].c === c) b++;
                if (b - a + 1 >= 3) {
                    const n = b - a + 1;
                    chain.splice(a, n);
                    combo++;
                    score += 40 * n + combo * 15;
                } else combo = 0;
                hud();
            }
            function normalize() { // 保序 + 间距约束
                chain.sort((p, q) => q.d - p.d);
                for (let i = 1; i < chain.length; i++) {
                    if (chain[i].d > chain[i - 1].d - SP) chain[i].d = chain[i - 1].d - SP;
                }
            }

            function step() {
                if (over) return;
                const dt = 0.033;
                cool -= dt;
                // 球链推进
                if (chain.length) {
                    chain[0].d += v * dt;
                    for (let i = 1; i < chain.length; i++) chain[i].d = Math.min(chain[i].d + v * dt, chain[i - 1].d - SP);
                    if (chain[0].d >= path.total) return over2(false);
                }
                // 从洞口补球
                if (spawnLeft > 0 && (!chain.length || chain[chain.length - 1].d >= SP + 2)) {
                    chain.push({ d: 0, c: MG.ri(0, nColors - 1) });
                    spawnLeft--;
                }
                // 飞行球
                for (let s = shots.length - 1; s >= 0; s--) {
                    const b = shots[s];
                    b.x += b.vx * dt; b.y += b.vy * dt;
                    let hit = -1, best = 1e9;
                    for (let j = 0; j < chain.length; j++) {
                        const p = ptAt(path, chain[j].d);
                        const dd = Math.hypot(p.x - b.x, p.y - b.y);
                        if (dd < R * 1.8 && dd < best) { best = dd; hit = j; }
                    }
                    if (hit >= 0) {
                        const p = ptAt(path, chain[hit].d), p2 = ptAt(path, chain[hit].d + 3), p1 = ptAt(path, chain[hit].d - 3);
                        const tx = p2.x - p1.x, ty = p2.y - p1.y;
                        const side = (b.x - p.x) * tx + (b.y - p.y) * ty >= 0 ? 1 : -1;
                        shots.splice(s, 1);
                        insert(hit, side, b.c);
                        continue;
                    }
                    if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) shots.splice(s, 1);
                }
                // 胜利
                if (!spawnLeft && !chain.length) over2(true);
                draw();
            }

            function draw() {
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#241a33'); g.addColorStop(1, '#0d0a16');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                // 石道
                ctx.strokeStyle = '#3a2f4d'; ctx.lineWidth = 30; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); path.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
                ctx.strokeStyle = '#241c36'; ctx.lineWidth = 22; ctx.stroke();
                // 球链
                for (let j = chain.length - 1; j >= 0; j--) {
                    const p = ptAt(path, chain[j].d);
                    if (chain[j].d < -2) continue;
                    ball(p.x, p.y, chain[j].c, R);
                }
                // 蛙
                ctx.beginPath(); ctx.arc(frog.x, frog.y, 20, 0, Math.PI * 2);
                ctx.fillStyle = '#3f7d3a'; ctx.fill();
                ctx.strokeStyle = '#1d3d1b'; ctx.lineWidth = 3; ctx.stroke();
                const ang = Math.atan2(aim.y - frog.y, aim.x - frog.x);
                ctx.strokeStyle = '#8fce7c'; ctx.lineWidth = 7;
                ctx.beginPath(); ctx.moveTo(frog.x, frog.y); ctx.lineTo(frog.x + Math.cos(ang) * 26, frog.y + Math.sin(ang) * 26); ctx.stroke();
                // 待发球与下一球
                ball(frog.x + Math.cos(ang) * 26, frog.y + Math.sin(ang) * 26, cur, 12);
                ball(frog.x + 30, frog.y + 26, next, 9);
                // 飞行球
                for (const b of shots) ball(b.x, b.y, b.c, 12);
            }
            function ball(x, y, c, r) {
                const col = COLORS[c % COLORS.length];
                const rg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
                rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.25, col); rg.addColorStop(1, '#00000088');
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = rg; ctx.fill();
            }

            cvs.addEventListener('pointermove', e => {
                const r = cvs.getBoundingClientRect();
                aim = { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
            });
            cvs.addEventListener('pointerdown', e => {
                const r = cvs.getBoundingClientRect();
                aim = { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
                if (over || cool > 0) return;
                const ang = Math.atan2(aim.y - frog.y, aim.x - frog.x);
                shots.push({ x: frog.x + Math.cos(ang) * 26, y: frog.y + Math.sin(ang) * 26, vx: Math.cos(ang) * 430, vy: Math.sin(ang) * 430, c: cur });
                cur = next; next = MG.ri(0, nColors - 1);
                cool = 0.24;
            });

            draw();
            hud();
            window.__zumaDbg = { insert, normalize, ptAt: d => ptAt(path, d), get chain() { return chain; }, set chain(v) { chain = v; }, get path() { return path; } };
            const timer = setInterval(step, 33);
            return { stop() { clearInterval(timer); } };
        },
    };
})();
