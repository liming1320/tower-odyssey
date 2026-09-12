// 独立优化版：环形轨道、独立发射台、断链回吸、连锁与特殊球。
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
        const pts = [];
        const variant = (seed - 1) % 5;
        for (let k = 0; k <= 240; k++) {
            const t = k / 240, a = 0.7 + t * Math.PI * (1.65 + variant * 0.07);
            const ripple = variant > 1 ? Math.sin(a * 3) * 8 : 0;
            pts.push({ x: W / 2 + Math.cos(a) * (174 - 26 * t + ripple),
                y: 267 + Math.sin(a) * (210 - 40 * t + ripple) });
        }
        const end = pts[pts.length - 1];
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

    MiniGames.zumaplus = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const nColors = 4 + Math.min(3, Math.floor(idx / 13));
            const v = 18 + idx * 0.55;
            const count = 26 + Math.floor(idx * 0.8);
            const path = buildPath(idx + 1);
            const frog = { x: W / 2, y: 290 };
            let score = 0, combo = 0, over = false, spawnLeft = count;
            let chain = [], shots = [], cool = 0;
            let cur = MG.ri(0, nColors - 1), next = MG.ri(0, nColors - 1);
            let aim = { x: W / 2, y: 60 };
            let slow = 0, reverse = 0, particles = [], stopped = false;
            const keyAbort = new AbortController();
            const availableColor = () => {
                const pool = spawnLeft > 0 ? Array.from({ length: nColors }, (_, i) => i) : [...new Set(chain.map(b => b.c))];
                return pool.length ? pool[MG.ri(0, pool.length - 1)] : 0;
            };

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
                keyAbort.abort();
                const stars = !win ? 0 : (score >= 900 ? 3 : score >= 550 ? 2 : 1);
                opts.onComplete && opts.onComplete({ win, stars, score, lines: [win ? '神殿守住了！' : '球链滚进了终点洞穴…', '得分 ' + score] });
            };

            function insert(j, side, c) {
                const k = side > 0 ? j : j + 1;
                const d = chain[j].d + (side > 0 ? SP : 0);
                for (let i = 0; i < k; i++) chain[i].d += SP;
                chain.splice(k, 0, { d, c });
                combo = 0;
                resolve(k);
                hud();
            }
            function resolve(k) {
                if (!chain[k]) return false;
                const c = chain[k].c;
                let a = k, b = k;
                while (a > 0 && chain[a - 1].c === c && chain[a - 1].d - chain[a].d <= SP + 1) a--;
                while (b < chain.length - 1 && chain[b + 1].c === c && chain[b].d - chain[b + 1].d <= SP + 1) b++;
                if (b - a + 1 >= 3) {
                    const n = b - a + 1;
                    for (const ball of chain.slice(a, b + 1)) {
                        const p = ptAt(path, ball.d);
                        for (let i = 0; i < 7; i++) particles.push({ ...p, vx: (Math.random() - .5) * 170, vy: (Math.random() - .5) * 170, life: .6, c: ball.c });
                        if (ball.power === 'slow') slow = 5;
                        if (ball.power === 'reverse') reverse = 2;
                    }
                    chain.splice(a, n);
                    combo++;
                    score += 40 * n * combo;
                    if (!spawnLeft && chain.length) {
                        const colors = new Set(chain.map(b => b.c));
                        if (!colors.has(cur)) cur = availableColor();
                        if (!colors.has(next)) next = availableColor();
                    }
                    return true;
                }
                return false;
            }
            function normalize() { // 保序 + 间距约束
                chain.sort((p, q) => q.d - p.d);
                for (let i = 1; i < chain.length; i++) {
                    if (chain[i].d > chain[i - 1].d - SP) chain[i].d = chain[i - 1].d - SP;
                }
            }

            function step() {
                if (over || stopped || document.hidden) return;
                const dt = 0.033;
                cool -= dt;
                slow = Math.max(0, slow - dt); reverse = Math.max(0, reverse - dt);
                particles = particles.filter(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.life > 0; });
                // 球链推进
                if (chain.length) {
                    const advance = (reverse > 0 ? -65 : slow > 0 ? v * .3 : v) * dt;
                    for (const b of chain) b.d += advance;
                    for (let i = 1; i < chain.length; i++) {
                        const gap = chain[i - 1].d - chain[i].d - SP;
                        if (gap > .01) {
                            if (chain[i - 1].c === chain[i].c) {
                                const pull = Math.min(gap, 180 * dt);
                                for (let j = 0; j < i; j++) chain[j].d -= pull;
                            } else {
                                const push = Math.min(gap, 60 * dt);
                                for (let j = i; j < chain.length; j++) chain[j].d += push;
                            }
                            if (chain[i - 1].d - chain[i].d <= SP + .1 && resolve(i)) break;
                        }
                    }
                    if (!chain.length) { hud(); draw(); return; }
                    if (chain[0].d >= path.total) return over2(false);
                }
                // 从洞口补球
                if (spawnLeft > 0 && (!chain.length || chain[chain.length - 1].d >= SP + 2)) {
                    chain.push({ d: 0, c: MG.ri(0, nColors - 1), power: spawnLeft % 13 === 0 ? 'reverse' : spawnLeft % 9 === 0 ? 'slow' : null });
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
                hud();
                draw();
            }

            function draw() {
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#213f35'); g.addColorStop(1, '#142922');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                ctx.strokeStyle = '#3b5844'; ctx.lineWidth = 1;
                for (let y = 0; y < H; y += 38) for (let x = -(y % 76 ? 22 : 0); x < W; x += 44) ctx.strokeRect(x, y, 44, 38);
                // 石道
                ctx.strokeStyle = '#8a9275'; ctx.lineWidth = 38; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); path.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
                ctx.strokeStyle = '#394a3c'; ctx.lineWidth = 28; ctx.stroke();
                ctx.fillStyle = '#080b09'; ctx.beginPath(); ctx.arc(path.end.x, path.end.y, 23, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = chain.length && path.total - chain[0].d < 150 ? '#ef6758' : '#d1c790'; ctx.lineWidth = 5; ctx.stroke();
                // 入口洞（球链从这冒出来）
                const p0 = path.pts[0];
                ctx.beginPath(); ctx.arc(p0.x, p0.y, 19, 0, Math.PI * 2);
                ctx.fillStyle = '#08050f'; ctx.fill();
                ctx.strokeStyle = '#4a3c66'; ctx.lineWidth = 3; ctx.stroke();
                ctx.beginPath(); ctx.arc(p0.x, p0.y, 12, 0, Math.PI * 2);
                ctx.fillStyle = '#000'; ctx.fill();
                // 球链
                for (let j = chain.length - 1; j >= 0; j--) {
                    const p = ptAt(path, chain[j].d);
                    if (chain[j].d < -2) continue;
                    ball(p.x, p.y, chain[j].c, R);
                    if (chain[j].power) {
                        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
                        ctx.fillText(chain[j].power === 'slow' ? 'II' : '<', p.x, p.y + 5);
                    }
                }
                // 蛙：石台底座 + 蹲坐蛤蟆（朝瞄准方向旋转，朝左时上下翻回正）
                drawFrogBase(frog.x, frog.y + 6);
                const ang = Math.atan2(aim.y - frog.y, aim.x - frog.x);
                // 瞄准虚线：从蛙口沿射击方向，到第一颗链球（或屏幕边）为止
                {
                    const dx = Math.cos(ang), dy = Math.sin(ang);
                    let tEnd = 920;
                    for (const ch of chain) {
                        const p = ptAt(path, ch.d);
                        const rel = (p.x - frog.x) * dx + (p.y - frog.y) * dy;
                        if (rel <= 10) continue;
                        const perp = Math.abs(-(p.x - frog.x) * dy + (p.y - frog.y) * dx);
                        if (perp < R * 1.7 && rel < tEnd) tEnd = rel;
                    }
                    ctx.setLineDash([4, 9]);
                    ctx.strokeStyle = 'rgba(255,235,180,0.4)'; ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(frog.x + dx * 30, frog.y + dy * 30);
                    ctx.lineTo(frog.x + dx * tEnd, frog.y + dy * tEnd);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                drawFrog(frog.x, frog.y, ang);
                // 待发球与下一球
                ball(frog.x + Math.cos(ang) * 26, frog.y + Math.sin(ang) * 26, cur, 12);
                ball(frog.x + 34, frog.y + 30, next, 9);
                // 飞行球
                for (const b of shots) ball(b.x, b.y, b.c, 12);
                for (const p of particles) { ctx.globalAlpha = p.life / .6; ctx.fillStyle = COLORS[p.c]; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
                ctx.globalAlpha = 1; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e3dba2';
                ctx.fillText('祖玛优化版', W / 2, 25);
                ctx.font = '14px sans-serif';
                ctx.fillText(slow > 0 ? '减速 ' + slow.toFixed(1) : reverse > 0 ? '倒退' : combo > 1 ? '连锁 ×' + combo : '神殿 ' + (idx + 1), W / 2, H - 22);
            }
            // 石台
            function drawFrogBase(x, y) {
                ctx.beginPath(); ctx.ellipse(x, y, 30, 13, 0, 0, Math.PI * 2);
                const sg = ctx.createLinearGradient(x, y - 13, x, y + 13);
                sg.addColorStop(0, '#8a8fa3'); sg.addColorStop(0.55, '#5d6275'); sg.addColorStop(1, '#3a3e4d');
                ctx.fillStyle = sg; ctx.fill();
                ctx.strokeStyle = '#23262f'; ctx.lineWidth = 2.5; ctx.stroke();
                // 石纹
                ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.moveTo(x - 18, y - 3); ctx.lineTo(x - 8, y - 5); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + 16, y + 1); ctx.stroke();
            }
            // 蛤蟆本体（局部坐标：+x 为嘴方向，+y 为下）
            function frogShape() {
                // 后腿（左右两坨）
                for (const s of [-1, 1]) {
                    ctx.beginPath(); ctx.ellipse(-10, 8 * s * 0.6 + 6, 9, 6, s * 0.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#2f6b2a'; ctx.fill();
                }
                // 身体
                ctx.beginPath(); ctx.ellipse(0, 0, 20, 16, 0, 0, Math.PI * 2);
                const bg = ctx.createRadialGradient(-4, -6, 3, 0, 2, 24);
                bg.addColorStop(0, '#8fce5f'); bg.addColorStop(0.45, '#57a53f'); bg.addColorStop(1, '#2f6b2a');
                ctx.fillStyle = bg; ctx.fill();
                ctx.strokeStyle = '#1d3d1b'; ctx.lineWidth = 2.4; ctx.stroke();
                // 背部斑纹
                ctx.fillStyle = 'rgba(30,70,25,0.55)';
                ctx.beginPath(); ctx.ellipse(-8, -4, 3.4, 2.4, 0.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-3, -8, 2.6, 1.8, 0.3, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-13, 3, 2.2, 1.6, -0.4, 0, Math.PI * 2); ctx.fill();
                // 肚皮
                ctx.beginPath(); ctx.ellipse(4, 7, 12, 7, 0.1, 0, Math.PI * 2);
                ctx.fillStyle = '#d8eda6'; ctx.fill();
                // 张开的嘴（前端楔形暗口，球从这里射出）
                ctx.beginPath();
                ctx.moveTo(14, -6); ctx.quadraticCurveTo(26, 0, 14, 7);
                ctx.quadraticCurveTo(18, 0, 14, -6);
                ctx.fillStyle = '#132a10'; ctx.fill();
                ctx.strokeStyle = '#1d3d1b'; ctx.lineWidth = 2; ctx.stroke();
                // 嘴角线
                ctx.strokeStyle = '#1d3d1b'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(6, 3); ctx.quadraticCurveTo(13, 5, 17, 2); ctx.stroke();
                // 头顶两只大眼（眼柄 + 眼球 + 瞳孔 + 高光）
                for (const s of [-1, 1]) {
                    ctx.beginPath(); ctx.ellipse(6, -14 + s * 5.5, 7, 7, 0, 0, Math.PI * 2);
                    const eg = ctx.createRadialGradient(4, -17, 1.5, 6, -14 + s * 5.5, 8);
                    eg.addColorStop(0, '#a8dd6e'); eg.addColorStop(1, '#3f7d3a');
                    ctx.fillStyle = eg; ctx.fill();
                    ctx.strokeStyle = '#1d3d1b'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.beginPath(); ctx.arc(8, -14 + s * 5.5, 4.4, 0, Math.PI * 2);
                    ctx.fillStyle = '#fdfdf2'; ctx.fill();
                    ctx.beginPath(); ctx.arc(9.6, -14 + s * 5.5, 2.2, 0, Math.PI * 2);
                    ctx.fillStyle = '#141414'; ctx.fill();
                    ctx.beginPath(); ctx.arc(8.6, -15.6 + s * 5.5, 0.9, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff'; ctx.fill();
                }
                // 鼻孔
                ctx.fillStyle = '#1d3d1b';
                ctx.beginPath(); ctx.arc(17, -2, 0.9, 0, Math.PI * 2); ctx.fill();
            }
            function drawFrog(x, y, ang) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                if (Math.cos(ang) < 0) ctx.scale(1, -1);   // 朝左时翻回正，不倒挂
                frogShape();
                ctx.restore();
            }
            function ball(x, y, c, r) {
                const col = COLORS[c % COLORS.length];
                const rg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
                rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.25, col); rg.addColorStop(1, '#00000088');
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = rg; ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.4; ctx.stroke();
                ctx.beginPath(); ctx.arc(x - r * 0.38, y - r * 0.38, r * 0.16, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
            }

            cvs.addEventListener('pointermove', e => {
                const r = cvs.getBoundingClientRect();
                aim = { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
            });
            cvs.addEventListener('pointerdown', e => {
                if (e.button === 2) return;
                const r = cvs.getBoundingClientRect();
                aim = { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
                if (over || cool > 0) return;
                if (Math.hypot(aim.x - (frog.x + 34), aim.y - (frog.y + 30)) < 20) { [cur, next] = [next, cur]; return; }
                const ang = Math.atan2(aim.y - frog.y, aim.x - frog.x);
                shots.push({ x: frog.x + Math.cos(ang) * 26, y: frog.y + Math.sin(ang) * 26, vx: Math.cos(ang) * 430, vy: Math.sin(ang) * 430, c: cur });
                cur = next; next = availableColor();
                cool = 0.24;
            });
            cvs.addEventListener('contextmenu', e => { e.preventDefault(); if (!over) [cur, next] = [next, cur]; });
            window.addEventListener('keydown', e => { if (e.code === 'Space' && !over) { e.preventDefault(); [cur, next] = [next, cur]; } }, { signal: keyAbort.signal });

            draw();
            hud();
            if (window.__MG_TEST) window.__zumaPlusDbg = { insert, resolve, normalize, step, ptAt: d => ptAt(path, d), get chain() { return chain; }, set chain(v) { chain = v; }, get path() { return path; }, frog };
            const timer = setInterval(step, 33);
            return { stop() { stopped = true; over = true; clearInterval(timer); keyAbort.abort(); } };
        },
    };
})();
