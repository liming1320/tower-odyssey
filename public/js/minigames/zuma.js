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
    // 颜色提亮/压暗：amt ∈ [-1,1]，正=提亮，负=压暗
    function shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
        else { const k = 1 + amt; r *= k; g *= k; b *= k; }
        return `rgb(${r | 0},${g | 0},${b | 0})`;
    }

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
            let chain = [], shots = [], cool = 0, floaters = [];
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
                    let cx = 0, cy = 0;
                    for (let i = a; i <= b; i++) { const p = ptAt(path, chain[i].d); cx += p.x; cy += p.y; }
                    cx /= n; cy /= n;
                    chain.splice(a, n);
                    combo++;
                    const gain = 40 * n + combo * 15;
                    score += gain;
                    floaters.push({ x: cx, y: cy, t: 0, txt: combo > 1 ? `+${gain}  连击 ${combo}!` : (n > 3 ? `${n} 连消!` : `+${gain}`), big: n >= 4 || combo > 1 });
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
                // 丛林神庙背景：远景石阶金字塔 + 残柱 + 藤蔓光晕 + 暗角（靠拢原版丛林石道氛围）
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#16352a'); g.addColorStop(0.45, '#0e2823'); g.addColorStop(1, '#06100d');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                // 远景石阶金字塔（神庙剪影，居中靠下）
                ctx.fillStyle = 'rgba(8,24,18,0.5)';
                ctx.beginPath(); ctx.moveTo(W / 2, 150); ctx.lineTo(W / 2 - 150, 430); ctx.lineTo(W / 2 + 150, 430); ctx.closePath(); ctx.fill();
                for (let s = 0; s < 5; s++) {
                    const y = 198 + s * 48, half = 40 + s * 24;
                    ctx.fillStyle = `rgba(${14 - s},${38 - s * 3},${28 - s * 2},${0.5 - s * 0.05})`;
                    ctx.fillRect(W / 2 - half, y, half * 2, 26);
                }
                ctx.fillStyle = 'rgba(30,70,55,0.45)'; ctx.fillRect(W / 2 - 22, 168, 44, 32);
                // 两侧丛林神庙残柱
                for (const px2 of [34, W - 34]) {
                    ctx.fillStyle = 'rgba(10,28,22,0.55)';
                    ctx.fillRect(px2 - 9, 210, 18, 250);
                    ctx.fillStyle = 'rgba(15,38,29,0.55)';
                    ctx.fillRect(px2 - 13, 200, 26, 13);
                    ctx.fillStyle = 'rgba(10,28,22,0.55)'; ctx.fillRect(px2 - 12, 460, 24, 10);
                }
                // 丛林暖光晕（透过树冠的阳光）
                const rg = ctx.createRadialGradient(W / 2, 120, 20, W / 2, 120, W * 0.75);
                rg.addColorStop(0, 'rgba(255,210,130,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
                // 顶部垂藤树叶剪影（双层，更密）
                ctx.fillStyle = 'rgba(6,22,14,0.5)';
                for (let i = 0; i < 12; i++) {
                    const lx = 14 + i * 36, ly = 4 + (i % 3) * 8;
                    ctx.beginPath();
                    ctx.moveTo(lx, ly);
                    ctx.quadraticCurveTo(lx - 10, ly + 22, lx - 3, ly + 40);
                    ctx.quadraticCurveTo(lx + 1, ly + 22, lx + 8, ly + 38);
                    ctx.quadraticCurveTo(lx + 6, ly + 20, lx, ly);
                    ctx.fill();
                }
                // 垂下的藤蔓细线 + 小叶
                ctx.strokeStyle = 'rgba(8,26,16,0.5)'; ctx.lineWidth = 1.4;
                for (let i = 0; i < 9; i++) {
                    const vx = 30 + i * 46;
                    ctx.beginPath(); ctx.moveTo(vx, 0); ctx.quadraticCurveTo(vx + 6, 40, vx - 4, 80); ctx.stroke();
                    ctx.fillStyle = 'rgba(6,22,14,0.5)';
                    ctx.beginPath(); ctx.ellipse(vx - 4, 80, 5, 3, 0.6, 0, Math.PI * 2); ctx.fill();
                }
                // 底部草丛剪影（双层，更密）
                ctx.fillStyle = 'rgba(5,18,12,0.55)';
                for (let i = 0; i < 18; i++) {
                    const gx = 6 + i * 24, gh2 = 16 + (i % 4) * 7;
                    ctx.beginPath();
                    ctx.moveTo(gx, H); ctx.lineTo(gx - 5, H - gh2); ctx.lineTo(gx, H - gh2 - 4);
                    ctx.lineTo(gx + 5, H - gh2); ctx.lineTo(gx + 9, H); ctx.closePath(); ctx.fill();
                }
                ctx.fillStyle = 'rgba(4,16,10,0.7)';
                for (let i = 0; i < 12; i++) {
                    const gx = 18 + i * 34, gh2 = 22 + (i % 3) * 9;
                    ctx.beginPath();
                    ctx.moveTo(gx, H); ctx.lineTo(gx - 7, H - gh2); ctx.lineTo(gx, H - gh2 - 5);
                    ctx.lineTo(gx + 7, H - gh2); ctx.lineTo(gx + 12, H); ctx.closePath(); ctx.fill();
                }
                const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.33, W / 2, H / 2, H * 0.8);
                vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
                ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
                // 石道：外影 → 受光斜面 → 砂岩主体 → 暗中槽 → 砖缝刻线 → 边沿高光（靠拢原版石砌轨道）
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                const trace = () => { ctx.beginPath(); path.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); };
                trace(); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 42; ctx.stroke();
                ctx.save(); ctx.translate(0, -3); trace(); ctx.strokeStyle = 'rgba(232,216,176,0.4)'; ctx.lineWidth = 36; ctx.stroke(); ctx.restore();
                trace(); ctx.strokeStyle = '#a99a78'; ctx.lineWidth = 32; ctx.stroke();
                trace(); ctx.strokeStyle = '#6f6450'; ctx.lineWidth = 22; ctx.stroke();
                trace(); ctx.strokeStyle = '#4f4632'; ctx.lineWidth = 14; ctx.stroke();
                // 沿路径的砖缝刻线（制造石砌砖块感）
                ctx.strokeStyle = 'rgba(38,30,18,0.45)'; ctx.lineWidth = 2;
                for (let d = 6; d < path.total - 6; d += 18) {
                    const p = ptAt(path, d), p2 = ptAt(path, d + 4);
                    const ang = Math.atan2(p2.y - p.y, p2.x - p.x);
                    const nx = -Math.sin(ang), ny = Math.cos(ang), w = 15;
                    ctx.beginPath();
                    ctx.moveTo(p.x + nx * w, p.y + ny * w);
                    ctx.lineTo(p.x - nx * w, p.y - ny * w);
                    ctx.stroke();
                }
                trace(); ctx.strokeStyle = 'rgba(245,235,200,0.10)'; ctx.lineWidth = 30; ctx.setLineDash([2, 11]); ctx.stroke(); ctx.setLineDash([]);
                // 入口：石雕骷髅头刻洞（球链从这冒出来）—— 靠拢原版
                const p0 = path.pts[0];
                // 石框圆盘
                ctx.beginPath(); ctx.arc(p0.x, p0.y, 25, 0, Math.PI * 2);
                const fg = ctx.createRadialGradient(p0.x, p0.y, 4, p0.x, p0.y, 27);
                fg.addColorStop(0, '#9a8a68'); fg.addColorStop(1, '#5e5238');
                ctx.fillStyle = fg; ctx.fill();
                ctx.strokeStyle = '#3a3324'; ctx.lineWidth = 3; ctx.stroke();
                // 眼窝（雕刻）
                ctx.fillStyle = '#2a2418';
                for (const sx of [-8, 8]) {
                    ctx.beginPath(); ctx.ellipse(p0.x + sx, p0.y - 5, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
                }
                // 鼻孔
                ctx.beginPath(); ctx.arc(p0.x - 3, p0.y + 7, 1.6, 0, Math.PI * 2); ctx.arc(p0.x + 3, p0.y + 7, 1.6, 0, Math.PI * 2); ctx.fill();
                // 深井（球从这出来）
                ctx.beginPath(); ctx.arc(p0.x, p0.y, 12, 0, Math.PI * 2);
                const hg = ctx.createRadialGradient(p0.x, p0.y, 2, p0.x, p0.y, 13);
                hg.addColorStop(0, 'rgba(255,200,120,0.28)'); hg.addColorStop(0.6, 'rgba(50,32,16,0.95)'); hg.addColorStop(1, 'rgba(8,5,15,1)');
                ctx.fillStyle = hg; ctx.fill();
                // 球链
                for (let j = chain.length - 1; j >= 0; j--) {
                    const p = ptAt(path, chain[j].d);
                    if (chain[j].d < -2) continue;
                    ball(p.x, p.y, chain[j].c, R);
                }
                // 浮动得分 / 连击文字
                for (let i = floaters.length - 1; i >= 0; i--) {
                    const f = floaters[i];
                    f.t += 0.016;
                    const a = Math.max(0, 1 - f.t / 1.1);
                    ctx.globalAlpha = a;
                    ctx.font = (f.big ? 'bold 18px' : 'bold 14px') + ' Microsoft YaHei, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                    ctx.strokeText(f.txt, f.x, f.y - f.t * 34);
                    ctx.fillStyle = f.big ? '#ffd56b' : '#ffffff';
                    ctx.fillText(f.txt, f.x, f.y - f.t * 34);
                    ctx.globalAlpha = 1;
                    if (f.t >= 1.1) floaters.splice(i, 1);
                }
                // 蛙口光晕
                const fa = ctx.createRadialGradient(frog.x, frog.y, 4, frog.x, frog.y, 42);
                fa.addColorStop(0, 'rgba(130,255,190,0.20)'); fa.addColorStop(1, 'rgba(130,255,190,0)');
                ctx.fillStyle = fa; ctx.beginPath(); ctx.arc(frog.x, frog.y, 42, 0, Math.PI * 2); ctx.fill();
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

                // 神庙石框（嵌边，强化"石壁雕刻"原版感）
                const fw = 10;
                ctx.save();
                ctx.strokeStyle = 'rgba(20,16,10,0.6)'; ctx.lineWidth = fw;
                ctx.strokeRect(fw / 2, fw / 2, W - fw, H - fw);
                ctx.strokeStyle = 'rgba(185,168,128,0.35)'; ctx.lineWidth = 2;
                ctx.strokeRect(fw - 1, fw - 1, W - (fw - 1) * 2, H - (fw - 1) * 2);
                // 四角石雕铆
                ctx.fillStyle = 'rgba(120,108,80,0.55)';
                for (const [cx2, cy2] of [[fw / 2, fw / 2], [W - fw / 2, fw / 2], [fw / 2, H - fw / 2], [W - fw / 2, H - fw / 2]]) {
                    ctx.beginPath(); ctx.arc(cx2, cy2, 5, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
            // 石台（阶梯式收分 + 正面象形刻纹）
            function drawFrogBase(x, y) {
                for (let s = 0; s < 3; s++) {
                    const w = 32 - s * 4, hh = 7;
                    ctx.beginPath(); ctx.ellipse(x, y + s * 6, w, hh, 0, 0, Math.PI * 2);
                    const sg = ctx.createLinearGradient(x, y + s * 6 - hh, x, y + s * 6 + hh);
                    sg.addColorStop(0, '#8a8fa3'); sg.addColorStop(0.55, '#5d6275'); sg.addColorStop(1, '#3a3e4d');
                    ctx.fillStyle = sg; ctx.fill();
                    ctx.strokeStyle = '#23262f'; ctx.lineWidth = 2; ctx.stroke();
                }
                // 正面刻纹（象形纹）
                ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.3;
                ctx.beginPath();
                ctx.moveTo(x - 20, y + 2); ctx.lineTo(x - 10, y); ctx.lineTo(x - 2, y + 3);
                ctx.moveTo(x + 4, y + 1); ctx.lineTo(x + 12, y - 2); ctx.lineTo(x + 20, y + 1);
                ctx.stroke();
            }
            // 石蛙神像（局部坐标：+x 为嘴方向，+y 为下）—— 靠拢原版石雕风格
            function frogShape() {
                // 身体（苔绿砂岩石雕）
                ctx.beginPath(); ctx.ellipse(0, 0, 22, 18, 0, 0, Math.PI * 2);
                const bg = ctx.createRadialGradient(-6, -8, 3, 0, 2, 28);
                bg.addColorStop(0, '#c9d2b0'); bg.addColorStop(0.45, '#93a07e'); bg.addColorStop(1, '#54603f');
                ctx.fillStyle = bg; ctx.fill();
                ctx.strokeStyle = '#2f3526'; ctx.lineWidth = 2.4; ctx.stroke();
                // 头身分界（下巴线）
                ctx.strokeStyle = 'rgba(40,46,30,0.5)'; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.moveTo(-14, 6); ctx.quadraticCurveTo(0, 12, 14, 6); ctx.stroke();
                // 石纹裂纹
                ctx.strokeStyle = 'rgba(40,46,30,0.45)'; ctx.lineWidth = 1.1;
                ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(-5, -7); ctx.lineTo(2, -2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(2, 9); ctx.lineTo(9, 6); ctx.lineTo(13, 10); ctx.stroke();
                // 青苔斑
                ctx.fillStyle = 'rgba(95,135,60,0.45)';
                ctx.beginPath(); ctx.ellipse(-14, 8, 4, 2.4, 0.4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(11, 10, 3, 2, 0.2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-7, 12, 2.4, 1.4, -0.3, 0, Math.PI * 2); ctx.fill();
                // 头冠/石雕冠（顶饰，原版石蛙标志）
                ctx.fillStyle = '#7e8b66';
                ctx.beginPath();
                ctx.moveTo(-12, -14); ctx.quadraticCurveTo(-6, -26, 0, -18);
                ctx.quadraticCurveTo(6, -26, 12, -14);
                ctx.quadraticCurveTo(4, -20, 0, -18);
                ctx.quadraticCurveTo(-4, -20, -12, -14);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#2f3526'; ctx.lineWidth = 1.6; ctx.stroke();
                // 大嘴（前端楔形深口，球从这里射出）—— 加宽
                ctx.beginPath();
                ctx.moveTo(13, -8); ctx.quadraticCurveTo(29, 0, 13, 8);
                ctx.quadraticCurveTo(20, 0, 13, -8);
                ctx.fillStyle = '#160d05'; ctx.fill();
                ctx.strokeStyle = '#2f3526'; ctx.lineWidth = 2; ctx.stroke();
                // 嘴内微光
                ctx.fillStyle = 'rgba(120,200,255,0.22)';
                ctx.beginPath(); ctx.ellipse(19, 0, 4.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();
                // 嘴角上扬纹（雕刻笑纹）
                ctx.strokeStyle = '#2f3526'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(4, 4); ctx.quadraticCurveTo(13, 7, 18, 3); ctx.stroke();
                // 双眼（顶端眼柄 + 发光琥珀瞳，原版石像标志）—— 更突出
                for (const s of [-1, 1]) {
                    ctx.beginPath(); ctx.ellipse(4, -15 + s * 6, 8, 8, 0, 0, Math.PI * 2);
                    const eg = ctx.createRadialGradient(2, -18, 1.5, 4, -15 + s * 6, 10);
                    eg.addColorStop(0, '#e9d9a8'); eg.addColorStop(1, '#7d7256');
                    ctx.fillStyle = eg; ctx.fill();
                    ctx.strokeStyle = '#2f3526'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.save();
                    ctx.shadowColor = 'rgba(255,180,60,0.9)'; ctx.shadowBlur = 9;
                    ctx.beginPath(); ctx.arc(7, -15 + s * 6, 3.8, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffb43c'; ctx.fill();
                    ctx.restore();
                    ctx.beginPath(); ctx.arc(8.2, -16 + s * 6, 1.3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
                }
                // 鼻孔
                ctx.fillStyle = '#2f3526';
                ctx.beginPath(); ctx.arc(18, -2, 1, 0, Math.PI * 2); ctx.fill();
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
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
                const rg = ctx.createRadialGradient(x - r * 0.36, y - r * 0.4, r * 0.1, x, y, r);
                rg.addColorStop(0, '#ffffff');
                rg.addColorStop(0.2, shade(col, 0.55));
                rg.addColorStop(0.62, col);
                rg.addColorStop(1, shade(col, -0.5));
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = rg; ctx.fill();
                ctx.restore();
                // 暗边
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.strokeStyle = shade(col, -0.55); ctx.lineWidth = 1.3; ctx.stroke();
                // 底缘反光（环境光，增强立体）
                ctx.beginPath(); ctx.arc(x, y, r - 0.5, Math.PI * 0.18, Math.PI * 0.82);
                ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.2; ctx.stroke();
                // 主高光（玻璃质感）
                ctx.beginPath();
                ctx.ellipse(x - r * 0.3, y - r * 0.36, r * 0.42, r * 0.26, -0.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
                // 次高光点
                ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.34, r * 0.12, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
                // 星芒闪点（玻璃珠宝感）
                if (r > 10) {
                    ctx.save();
                    ctx.translate(x - r * 0.34, y - r * 0.4); ctx.rotate(-0.5);
                    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(-2.4, 0); ctx.lineTo(2.4, 0); ctx.moveTo(0, -2.4); ctx.lineTo(0, 2.4); ctx.stroke();
                    ctx.restore();
                }
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
