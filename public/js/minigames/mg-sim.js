// 模拟 / 操作 10 款（多带无尽）：塔防 · 放置点击 · 生命游戏 · 病毒扩散 · 流沙填充 · 平衡杆 · 火箭着陆 · 轨道跳跃 · 交通调度 · 开心农场
(function () {
    const _eng = MG.eng, U = MG.ui;
    const E = Object.assign({}, _eng);
    (function () {
        const w = (orig) => (id, cfg) => {
            if (cfg && cfg.tap) {
                const t = cfg.tap;
                cfg.tap = (S, x, y, P, api) => { try { MG.audio.unlock(); MG.audio.sfx('click'); } catch (e) {} return t(S, x, y, P, api); };
            }
            return orig(id, cfg);
        };
        if (_eng.def) E.def = w(_eng.def);
        if (_eng.defd) E.defd = w(_eng.defd);
    })();
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

    // ============ 1. 简易塔防 ============
    const TDP = [[0, 2], [4, 2], [4, 6], [1, 6], [1, 9], [8, 9]];
    E.def('towerdef', {
        levels: E.nm(),
        params: (i, t) => ({ need: 5 + i, hp: 20 + i * 6 }),
        endless: { need: 9999, hp: 30 },
        w: 400, h: 460,
        hint: '点击空地建塔（花 20 金），拦住敌人；漏过的敌人会扣血',
        init: P => ({
            path: TDP, grid: {}, gold: 120, hp: P.hp, wave: 0, need: P.need,
            enemies: [], bullets: [], t: 0, spawn: 0, win: 0,
        }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f4a3a', '#14241c');
            const C = 44, ox = 10, oy = 50;
            for (let i = 0; i < 9; i++) for (let j = 0; j < 10; j++) {
                const x = ox + j * C, y = oy + i * C;
                ctx.fillStyle = (i + j) % 2 ? '#3a5a48' : '#345244'; ctx.fillRect(x, y, C, C);
            }
            ctx.strokeStyle = '#8a7a4a'; ctx.lineWidth = 22; ctx.lineCap = 'round';
            ctx.beginPath();
            S.path.forEach((p, k) => { const x = ox + p[1] * C + C / 2, y = oy + p[0] * C + C / 2; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
            ctx.stroke();
            Object.keys(S.grid).forEach(k => {
                const [i, j] = k.split(',').map(Number);
                U.emoji(ctx, '🗼', ox + j * C + C / 2, oy + i * C + C / 2, 30);
            });
            S.enemies.forEach(e => U.emoji(ctx, '👾', e.x * C + ox + C / 2, e.y * C + oy + C / 2, 26));
            ctx.fillStyle = '#ffd56b';
            S.bullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x * C + ox + C / 2, b.y * C + oy + C / 2, 4, 0, 6.284); ctx.fill(); });
            E.txt(ctx, `💰${S.gold} ❤️${S.hp} 第 ${S.wave + 1}/${S.need} 波`, W / 2, 28, 16, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            if (S.enemies.length === 0 && S.toGo == null) {
                S.t += dt;
                if (S.t > 1.2) { S.t = 0; S.wave++; S.toGo = 3 + S.wave; S.spawn = 0; if (S.wave > S.need) S.toGo = 1; }
                return;
            }
            if (S.toGo > 0) { S.spawn -= dt; if (S.spawn <= 0) { S.spawn = 0.7; S.toGo--; S.enemies.push({ seg: 0, p: 0, x: S.path[0][1], y: S.path[0][0], hp: 3 + S.wave }); } }
            S.enemies.forEach(e => {
                const a = S.path[e.seg], b = S.path[e.seg + 1];
                if (!b) { S.hp--; e.dead = true; return; }
                e.p += dt * 0.9;
                if (e.p >= 1) { e.p = 0; e.seg++; }
                e.x = a[1] + (b[1] - a[1]) * e.p; e.y = a[0] + (b[0] - a[0]) * e.p;
            });
            S.enemies = S.enemies.filter(e => !e.dead);
            Object.keys(S.grid).forEach(k => {
                const [i, j] = k.split(',').map(Number);
                const tw = S.grid[k]; tw.cd -= dt;
                if (tw.cd > 0) return;
                let tgt = null, bd = 2.4;
                S.enemies.forEach(e => { const d = Math.hypot(e.x - j, e.y - i); if (d < bd) { bd = d; tgt = e; } });
                if (!tgt) return;
                tw.cd = 0.5;
                S.bullets.push({ x: j, y: i, tx: tgt.x, ty: tgt.y, e: tgt });
            });
            S.bullets = S.bullets.filter(b => {
                const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
                if (d < 0.2) { if (b.e) { b.e.hp--; if (b.e.hp <= 0) { b.e.dead = true; S.gold += 8; } } return false; }
                b.x += dx / d * dt * 6; b.y += dy / d * dt * 6;
                return d > 0.05;
            });
            S.enemies = S.enemies.filter(e => !e.dead);
            if (S.hp <= 0) return api.finish({ win: false, stars: 0, score: S.wave, lines: [`撑到第 ${S.wave} 波`] });
            if (S.wave > S.need && S.enemies.length === 0 && !S.toGo) api.finish({ win: true, stars: 3, score: S.wave, lines: [`守住 ${S.need} 波`] });
        },
        tap(S, x, y, P) {
            const C = 44, ox = 10, oy = 50;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i > 8 || j < 0 || j > 9) return;
            const onPath = S.path.some((p, k) => {
                if (k === S.path.length - 1) return p[0] === i && p[1] === j;
                const q = S.path[k + 1];
                return Math.round(p[0] + (q[0] - p[0]) * 0.5) === i && Math.round(p[1] + (q[1] - p[1]) * 0.5) === j;
            });
            const k = i + ',' + j;
            if (onPath || S.grid[k] || S.gold < 20) return;
            S.grid[k] = { cd: 0 }; S.gold -= 20;
        },
    });

    // ============ 2. 放置点击 ============
    E.def('idleclick', {
        levels: E.nm(),
        params: (i, t) => ({ need: 500 + i * 900 }),
        endless: { need: 0 },
        w: 360, h: 460,
        hint: '点金币赚钱，买「自动」和「加倍」提升效率，先到目标金币即胜',
        init: P => ({ coin: 0, click: 1, auto: 0, mult: 1, t: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#4a3f22', '#241d10');
            E.txt(ctx, `💰 ${Math.floor(S.coin)}${P.endless ? '' : ' / ' + P.need}`, W / 2, 40, 22, '#ffd56b', true);
            E.txt(ctx, `点击 +${S.click * S.mult}　自动 ${S.auto}/s`, W / 2, 74, 14, '#f0e0c8');
            U.emoji(ctx, '🪙', 180, 170, 90);
            E.btnBox(ctx, 24, H - 150, 150, 52, `⬆点击 (${20 * S.click})`, '#8a5a2f', '#5a3a1c');
            E.btnBox(ctx, 186, H - 150, 150, 52, `🤖自动 (${50 * (S.auto + 1)})`, '#2f6f4a', '#1a4a2a');
            E.btnBox(ctx, 24, H - 88, 150, 52, `✨加倍 (${200 * S.mult})`, '#8a4a7f', '#5a2a4f');
            E.btnBox(ctx, 186, H - 88, 150, 52, '结束结算', '#5a5a7f', '#3a3a5f');
        },
        tick(S, dt, P, api) {
            S.coin += S.auto * S.mult * dt;
            if (P.need && S.coin >= P.need) api.finish({ win: true, stars: 3, score: Math.floor(S.coin), lines: [`金币达到 ${P.need}`] });
        },
        tap(S, x, y, P, api) {
            const H = 460;
            if (E.hit(x, y, 24, H - 150, 150, 52) && S.coin >= 20 * S.click) { S.coin -= 20 * S.click; S.click++; return; }
            if (E.hit(x, y, 186, H - 150, 150, 52) && S.coin >= 50 * (S.auto + 1)) { S.coin -= 50 * (S.auto + 1); S.auto++; return; }
            if (E.hit(x, y, 24, H - 88, 150, 52) && S.coin >= 200 * S.mult) { S.coin -= 200 * S.mult; S.mult++; return; }
            if (E.hit(x, y, 186, H - 88, 150, 52)) { api.finish({ win: !P.need || S.coin >= P.need, stars: 0, score: Math.floor(S.coin), lines: [`结算金币 ${Math.floor(S.coin)}`] }); return; }
            if (y < H - 170) S.coin += S.click * S.mult;
        },
    });

    // ============ 3. 生命游戏 ============
    E.def('life', {
        levels: E.nm(),
        params: (i, t) => ({ n: Math.min(22, 12 + Math.floor(i / 3)), gens: 30, target: 15 + i * 2 }),
        w: 396, h: 470,
        hint: '点格子布置初始图案，点「开始」演化 30 代，存活数达标即胜',
        init: P => {
            const n = P.n, b = [];
            for (let i = 0; i < n; i++) { b.push([]); for (let j = 0; j < n; j++) b[i].push(Math.random() < 0.35 ? 1 : 0); }
            return { n, b, gen: 0, gens: P.gens, run: false, t: 0, target: P.target };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#1f2a3a', '#0c1420');
            const C = Math.min(18, (W - 20) / S.n), ox = (W - C * S.n) / 2, oy = 80;
            for (let i = 0; i < S.n; i++) for (let j = 0; j < S.n; j++) {
                if (!S.b[i][j]) continue;
                ctx.fillStyle = '#5cd65c'; ctx.fillRect(ox + j * C + 0.5, oy + i * C + 0.5, C - 1, C - 1);
            }
            E.txt(ctx, `第 ${S.gen}/${S.gens} 代 · 存活 ${S.b.flat().reduce((a, b) => a + b, 0)} / 目标 ${S.target}`, W / 2, 34, 16, '#ffd56b', true);
            E.btnBox(ctx, 108, H - 90, 180, 52, S.run ? '演化中…' : '▶ 开始演化', '#2f6f4a', '#1a4a2a');
        },
        tick(S, dt, P, api) {
            if (!S.run) return;
            S.t += dt;
            if (S.t < 0.22) return;
            S.t = 0; S.gen++;
            const n = S.n, nb = S.b.map(r => r.slice());
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                let c = 0;
                for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
                    if (!di && !dj) continue;
                    const a = i + di, b2 = j + dj;
                    if (a >= 0 && a < n && b2 >= 0 && b2 < n && S.b[a][b2]) c++;
                }
                nb[i][j] = S.b[i][j] ? (c === 2 || c === 3 ? 1 : 0) : (c === 3 ? 1 : 0);
            }
            S.b = nb;
            if (S.gen >= S.gens) {
                const alive = S.b.flat().reduce((a, b) => a + b, 0);
                api.finish({
                    win: alive >= S.target, stars: alive >= S.target * 1.5 ? 3 : alive >= S.target ? 2 : 0,
                    score: alive, lines: [`${S.gens} 代后存活 ${alive} 个（目标 ${S.target}）`],
                });
            }
        },
        tap(S, x, y, P) {
            const H = 470;
            if (E.hit(x, y, 108, H - 90, 180, 52)) { S.run = true; return; }
            if (S.run) return;
            const C = Math.min(18, (396 - 20) / S.n), ox = (396 - C * S.n) / 2, oy = 80;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i >= 0 && i < S.n && j >= 0 && j < S.n) S.b[i][j] = S.b[i][j] ? 0 : 1;
        },
    });

    // ============ 4. 病毒扩散 ============
    E.def('virus', {
        levels: E.nm(),
        params: (i, t) => ({ n: Math.min(12, 6 + Math.floor(i / 3)), rate: 0.10 + i * 0.02, clicks: Math.max(6, 20 - Math.floor(i / 2)) }),
        w: 396, h: 470,
        hint: '点击感染格（🦠）治愈它，别让病毒扩散到全盘！点击次数有限',
        init: P => {
            const n = P.n, b = Array.from({ length: n }, () => Array(n).fill(0));
            for (let k = 0; k < 2; k++) b[ri(0, n - 1)][ri(0, n - 1)] = 1;
            return { n, b, clicks: P.clicks, t: 0, rate: P.rate, cured: 0 };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2a2038', '#140f1e');
            const C = Math.min(46, (W - 30) / S.n), ox = (W - C * S.n) / 2, oy = 80;
            for (let i = 0; i < S.n; i++) for (let j = 0; j < S.n; j++) {
                const x = ox + j * C, y = oy + i * C;
                if (S.b[i][j] === 1) { E.card(ctx, x + 2, y + 2, C - 4, C - 4, '#7a3a5a', '#4a1a3a', 8); U.emoji(ctx, '🦠', x + C / 2, y + C / 2, C * 0.5); }
                else if (S.b[i][j] === 2) { E.card(ctx, x + 2, y + 2, C - 4, C - 4, '#2f5f4a', '#1a3a2a', 8); U.emoji(ctx, '💊', x + C / 2, y + C / 2, C * 0.45); }
                else E.card(ctx, x + 2, y + 2, C - 4, C - 4, '#3a3452', '#242038', 8);
            }
            E.txt(ctx, `治愈次数 ${S.clicks} · 已治愈 ${S.cured}`, W / 2, 34, 16, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            S.t += dt;
            if (S.t < 1.1) return;
            S.t = 0;
            let infected = 0;
            const nb = S.b.map(r => r.slice());
            for (let i = 0; i < S.n; i++) for (let j = 0; j < S.n; j++) {
                if (S.b[i][j] !== 1) continue;
                infected++;
                for (const [a, c] of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]]) {
                    if (a >= 0 && a < S.n && c >= 0 && c < S.n && S.b[a][c] === 0 && Math.random() < S.rate) nb[a][c] = 1;
                }
            }
            S.b = nb;
            if (infected === 0) return api.finish({ win: true, stars: S.clicks > 0 ? 3 : 2, score: S.cured, lines: [`病毒被清除！治愈 ${S.cured} 次`] });
            if (infected >= S.n * S.n) return api.finish({ win: false, stars: 0, score: S.cured, lines: ['全盘感染'] });
            if (S.clicks <= 0) return api.finish({ win: false, stars: 0, score: S.cured, lines: [`治愈次数用尽，剩余 ${infected} 个病毒`] });
        },
        tap(S, x, y, P, api) {
            const C = Math.min(46, (396 - 30) / S.n), ox = (396 - C * S.n) / 2, oy = 80;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i >= S.n || j < 0 || j >= S.n) return;
            if (S.b[i][j] === 1 && S.clicks > 0) { S.b[i][j] = 2; S.clicks--; S.cured++; }
        },
    });

    // ============ 5. 流沙填充 ============
    E.def('sandfall', {
        levels: E.nm(),
        params: (i, t) => ({ target: Math.min(0.85, 0.35 + i * 0.03) }),
        endless: { target: 0.95 },
        w: 360, h: 470,
        hint: '点击顶部倒沙，把容器填到目标线以上（溢出到红线即失败）',
        init: P => ({ cols: 18, rows: 16, g: Array.from({ length: 16 }, () => Array(18).fill(0)), target: P.target, filled: 0, over: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f22', '#1a1410');
            const C = 19, ox = (W - C * S.cols) / 2, oy = 80;
            for (let i = 0; i < S.rows; i++) for (let j = 0; j < S.cols; j++) {
                if (!S.g[i][j]) continue;
                ctx.fillStyle = ['#d8b060', '#c8a050', '#e0c078'][S.g[i][j] - 1];
                ctx.fillRect(ox + j * C, oy + i * C, C - 0.5, C - 0.5);
            }
            ctx.strokeStyle = '#8aa8d8'; ctx.lineWidth = 2; ctx.strokeRect(ox - 2, oy - 2, C * S.cols + 4, C * S.rows + 4);
            const ty = oy + S.rows * C * (1 - S.target);
            ctx.strokeStyle = '#5cd65c'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(ox, ty); ctx.lineTo(ox + C * S.cols, ty); ctx.stroke(); ctx.setLineDash([]);
            ctx.strokeStyle = '#ff5252';
            ctx.beginPath(); ctx.moveTo(ox, oy - 8); ctx.lineTo(ox + C * S.cols, oy - 8); ctx.stroke();
            E.txt(ctx, `填充 ${(S.filled / (S.rows * S.cols) * 100).toFixed(0)}% / 目标 ${(S.target * 100).toFixed(0)}%`, W / 2, 34, 16, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            // 沙粒下落
            for (let i = S.rows - 2; i >= 0; i--) for (let j = 0; j < S.cols; j++) {
                if (!S.g[i][j]) continue;
                if (!S.g[i + 1][j]) { S.g[i + 1][j] = S.g[i][j]; S.g[i][j] = 0; }
                else { const d = Math.random() < 0.5 ? -1 : 1; if (j + d >= 0 && j + d < S.cols && !S.g[i + 1][j + d] && !S.g[i][j + d]) { S.g[i + 1][j + d] = S.g[i][j]; S.g[i][j] = 0; } }
            }
            S.filled = S.g.flat().reduce((a, b) => a + (b ? 1 : 0), 0);
            const top = S.g[0].filter(v => v).length;
            if (top > 0) S.over += top; else S.over = 0;
            if (S.over > 6) return api.finish({ win: false, stars: 0, score: Math.round(S.filled / (S.rows * S.cols) * 100), lines: ['沙子溢出了'] });
            if (S.filled / (S.rows * S.cols) >= S.target) api.finish({ win: true, stars: 3, score: Math.round(S.filled / (S.rows * S.cols) * 100), lines: [`填充到 ${(S.target * 100).toFixed(0)}%`] });
        },
        tap(S, x, y, P) {
            const C = 19, ox = (360 - C * S.cols) / 2;
            const j = Math.floor((x - ox) / C);
            if (j < 0 || j >= S.cols) return;
            for (let k = 0; k < 3; k++) {
                let i = 0;
                while (i < S.rows - 1 && S.g[i + 1][j]) i++;
                if (!S.g[0][j]) S.g[0][j] = ri(1, 3);
            }
        },
    });

    // ============ 6. 平衡杆 ============
    E.def('ballance', {
        levels: E.nm(),
        params: (i, t) => ({ need: 10 + i * 3, tilt: 0.5 + i * 0.1 }),
        endless: { need: 0, tilt: 2.6 },
        w: 360, h: 460,
        hint: '点击屏幕左右两侧给杆子施力，别让小球掉下去',
        init: P => ({ ang: 0, av: 0, bx: 0, bv: 0, t: 0, tilt: P.tilt, need: P.need }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f3a52', '#141c2c');
            const cx = 180, cy = 300;
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.ang);
            E.card(ctx, -140, -8, 280, 16, '#8a7a5a', '#5a4a2a', 8);
            ctx.beginPath(); ctx.arc(S.bx, -20, 14, 0, 6.284); ctx.fillStyle = '#ff6b7f'; ctx.fill();
            ctx.restore();
            ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 6.284); ctx.fillStyle = '#ffd56b'; ctx.fill();
            E.txt(ctx, P.endless ? `坚持 ${S.t.toFixed(1)}s` : `${S.t.toFixed(1)}s / ${S.need}s`, W / 2, 40, 19, '#ffd56b', true);
            E.txt(ctx, '◀ 点左侧　　点右侧 ▶', W / 2, H - 24, 14, '#c8d0e0');
        },
        tick(S, dt, P, api) {
            S.t += dt;
            S.av += -S.ang * 6 * dt; S.av *= 0.995; S.ang += S.av * dt;
            S.bv += Math.sin(S.ang) * 320 * dt; S.bx += S.bv * dt; S.bv *= 0.995;
            if (Math.abs(S.bx) > 140) return api.finish({ win: false, stars: 0, score: Math.floor(S.t * 10), lines: [`坚持 ${S.t.toFixed(1)} 秒`] });
            if (P.need && S.t >= P.need) api.finish({ win: true, stars: 3, score: Math.floor(S.t * 10), lines: [`坚持 ${P.need} 秒`] });
        },
        tap(S, x, y, P) { S.av += (x < 180 ? -1 : 1) * S.tilt; },
        key(S, k) { if (k === 'ArrowLeft' || k === 'a') S.av -= S.tilt; if (k === 'ArrowRight' || k === 'd') S.av += S.tilt; },
    });

    // ============ 7. 火箭着陆 ============
    E.def('rocketland', {
        levels: E.nm(),
        params: (i, t) => ({ need: 1 + Math.floor(i / 6), fuel: Math.max(60, 140 - i * 4) }),
        endless: { need: 999, fuel: 200 },
        w: 360, h: 470,
        hint: '点击点火减速，让火箭以安全速度（<60）落在平台上，燃料有限',
        init: P => ({ y: 40, vy: 0, fuel: P.fuel, land: 0, need: P.need, thrust: false, msg: '控制着陆' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#0e1430', '#05080f');
            for (let k = 0; k < 40; k++) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect((k * 97) % 360, (k * 53) % 340, 2, 2); }
            E.card(ctx, 100, H - 60, 160, 20, '#5a6a8a', '#3a4a6a', 4);
            U.emoji(ctx, '🚀', 180, S.y, 40);
            if (S.thrust) U.emoji(ctx, '🔥', 180, S.y + 26, 22);
            E.txt(ctx, `⛽ ${Math.floor(S.fuel)} · 速度 ${Math.abs(S.vy).toFixed(0)} · 着陆 ${S.land}/${P.need}`, W / 2, 34, 15, '#ffd56b', true);
            E.btnBox(ctx, 100, H - 46, 160, 36, '点火', '#8a5a2f', '#5a3a1c');
            E.txt(ctx, S.msg, W / 2, 70, 15, '#cfe0f8');
        },
        tick(S, dt, P, api) {
            S.vy += 90 * dt;
            if (S.thrust && S.fuel > 0) { S.vy -= 260 * dt; S.fuel -= 26 * dt; }
            S.y += S.vy * dt;
            if (S.y >= 470 - 60 - 20) {
                S.y = 470 - 60 - 20;
                if (Math.abs(S.vy) < 60) {
                    S.land++; S.msg = '着陆成功！';
                    if (S.land >= P.need && P.need < 900) return api.finish({ win: true, stars: S.fuel > P.fuel * 0.4 ? 3 : 2, score: S.land, lines: [`成功着陆 ${S.land} 次`] });
                    S.y = 40; S.vy = 0;
                } else return api.finish({ win: false, stars: 0, score: S.land, lines: [`速度太快 ${Math.abs(S.vy).toFixed(0)}，坠毁`] });
            }
            if (S.fuel <= 0 && S.y < 300) S.msg = '燃料耗尽';
        },
        tap(S, x, y, P) {
            const H = 470;
            if (E.hit(x, y, 100, H - 46, 160, 36)) S.thrust = true;
            else S.thrust = y > H - 90;
        },
        key(S, k) { S.thrust = (k === ' ' || k === 'ArrowUp'); },
    });

    // ============ 8. 轨道跳跃 ============
    E.def('orbit', {
        levels: E.nm(),
        params: (i, t) => ({ need: 15 + i * 4, spd: 1.1 + i * 0.09 }),
        endless: { need: 0, spd: 2.6 },
        w: 360, h: 470,
        hint: '点击切换轨道（内/中/外），躲开飞来的陨石 ☄️',
        init: P => ({ r: 1, ang: 0, rocks: [], t: 0, spawn: 0, spd: P.spd, need: P.need, score: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#0e1430', '#05080f');
            const cx = 180, cy = 235;
            [70, 105, 140].forEach((r, k) => {
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.284);
                ctx.strokeStyle = 'rgba(140,180,255,.3)'; ctx.lineWidth = 2; ctx.stroke();
            });
            ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 6.284); ctx.fillStyle = '#ffd56b'; ctx.fill();
            S.rocks.forEach(rk => {
                const x = cx + Math.cos(rk.a) * [70, 105, 140][rk.r], y = cy + Math.sin(rk.a) * [70, 105, 140][rk.r];
                U.emoji(ctx, '☄️', x, y, 24);
            });
            const rr = [70, 105, 140][S.r];
            U.emoji(ctx, '🛰️', cx + Math.cos(S.ang) * rr, cy + Math.sin(S.ang) * rr, 26);
            E.txt(ctx, P.endless ? `躲过 ${S.score}` : `躲过 ${Math.floor(S.score / 10)}/${P.need}`, W / 2, 34, 18, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            S.ang += S.spd * dt; S.score += 10 * dt;
            S.spawn -= dt;
            if (S.spawn <= 0) { S.spawn = Math.max(0.35, 1.1 - S.spd * 0.2); S.rocks.push({ r: ri(0, 2), a: S.ang + 3.0 + Math.random() * 1.2 }); }
            S.rocks.forEach(rk => rk.a += S.spd * 0.55 * dt);
            for (const rk of S.rocks) {
                let d = Math.abs(((rk.a - S.ang) % 6.284 + 6.284) % 6.284);
                if (d > 3.14) d = 6.284 - d;
                if (d < 0.16 && rk.r === S.r) return api.finish({ win: false, stars: 0, score: Math.floor(S.score / 10), lines: [`躲过 ${Math.floor(S.score / 10)} 颗陨石`] });
            }
            S.rocks = S.rocks.filter(rk => Math.abs(rk.a - S.ang) < 7);
            if (P.need && S.score / 10 >= P.need) api.finish({ win: true, stars: 3, score: Math.floor(S.score / 10), lines: [`躲过 ${P.need} 颗陨石`] });
        },
        tap(S, x, y, P) { S.r = (S.r + 1) % 3; },
        key(S, k) { if (k === ' ') S.r = (S.r + 1) % 3; },
    });

    // ============ 9. 交通调度 ============
    E.def('traffic', {
        levels: E.nm(),
        params: (i, t) => ({ need: 10 + i * 3, spd: 40 + i * 5 }),
        w: 380, h: 470,
        hint: '点击小车让它停下/前进，避免路口相撞；让 N 辆车安全通过',
        init: P => ({ cars: [], t: 0, spawn: 1, passed: 0, crash: 0, need: P.need, spd: P.spd }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f3a3a', '#141c1c');
            ctx.fillStyle = '#4a4a4a'; ctx.fillRect(0, 200, 380, 70); ctx.fillRect(155, 0, 70, 470);
            ctx.strokeStyle = '#ffd56b'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, 235); ctx.lineTo(380, 235); ctx.moveTo(190, 0); ctx.lineTo(190, 470); ctx.stroke(); ctx.setLineDash([]);
            S.cars.forEach(c => U.emoji(ctx, c.h ? '🚗' : '🛑', c.x, c.y, 28));
            E.txt(ctx, `通过 ${S.passed}/${S.need} · 事故 ${S.crash}/3`, W / 2, 34, 17, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            S.spawn -= dt;
            if (S.spawn <= 0) {
                S.spawn = Math.max(0.7, 2.2 - S.passed * 0.03);
                const dir = ri(0, 3);
                if (dir === 0) S.cars.push({ x: -20, y: 216, dx: 1, dy: 0 });
                if (dir === 1) S.cars.push({ x: 400, y: 254, dx: -1, dy: 0 });
                if (dir === 2) S.cars.push({ x: 168, y: -20, dx: 0, dy: 1 });
                if (dir === 3) S.cars.push({ x: 212, y: 490, dx: 0, dy: -1 });
                S.cars[S.cars.length - 1].h = 1;
            }
            S.cars.forEach(c => {
                if (c.h) { c.x += c.dx * S.spd * dt; c.y += c.dy * S.spd * dt; }
            });
            for (let a = 0; a < S.cars.length; a++) for (let b = a + 1; b < S.cars.length; b++) {
                const p = S.cars[a], q = S.cars[b];
                if (p.gone || q.gone) continue;
                if (Math.abs(p.x - q.x) < 26 && Math.abs(p.y - q.y) < 26) {
                    p.gone = q.gone = true; S.crash++;
                    if (S.crash >= 3) return api.finish({ win: false, stars: 0, score: S.passed, lines: [`${S.passed} 辆通过后 3 次事故`] });
                }
            }
            S.cars = S.cars.filter(c => {
                if (c.gone) return false;
                if (c.x > 420 || c.x < -40 || c.y > 510 || c.y < -40) { S.passed++; return false; }
                return true;
            });
            if (S.passed >= S.need) api.finish({ win: true, stars: S.crash === 0 ? 3 : 2, score: S.passed, lines: [`${S.passed} 辆车安全通过`] });
        },
        tap(S, x, y, P) {
            for (const c of S.cars) if (Math.abs(c.x - x) < 24 && Math.abs(c.y - y) < 24) { c.h = c.h ? 0 : 1; return; }
        },
    });

    // ============ 10. 开心农场 ============
    const CROP = [['🌱', '🌾', 20], ['🌱', '🍅', 35], ['🌱', '🌽', 50], ['🌱', '🎃', 80]];
    E.def('growfarm', {
        levels: E.nm(),
        params: (i, t) => ({ need: 150 + i * 150, grow: Math.max(1.4, 3.2 - i * 0.09) }),
        endless: { need: 0, grow: 1.4 },
        w: 380, h: 450,
        hint: '点击空地种植，成熟后点击收获换金币；先赚到目标金币即胜',
        init: P => ({ plots: Array.from({ length: 12 }, () => ({ s: 0 })), coin: 0, need: P.need, grow: P.grow, sel: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a5a2e', '#16281a');
            S.plots.forEach((p, k) => {
                const x = 20 + (k % 4) * 88, y = 80 + Math.floor(k / 4) * 88;
                E.card(ctx, x, y, 78, 78, '#6a4a2a', '#3a2a14', 10);
                if (p.s === 0) E.txt(ctx, '＋', x + 39, y + 39, 30, 'rgba(255,255,255,.4)', true);
                else if (p.s < 1) { U.emoji(ctx, p.c ? CROP[p.c][0] : '🌱', x + 39, y + 39, 34); ctx.fillStyle = '#5cd65c'; ctx.fillRect(x + 10, y + 66, 58 * p.s, 4); }
                else U.emoji(ctx, p.c ? CROP[p.c][1] : '🌾', x + 39, y + 39, 40);
            });
            E.txt(ctx, `💰 ${S.coin}${P.endless ? '' : ' / ' + P.need}`, W / 2, 36, 19, '#ffd56b', true);
            E.txt(ctx, '点空地种植 · 成熟后点收获', W / 2, H - 16, 13, '#cfe8d8');
        },
        tick(S, dt, P, api) {
            S.plots.forEach(p => { if (p.s > 0 && p.s < 1) p.s = Math.min(1, p.s + dt / S.grow); });
            if (P.need && S.coin >= P.need) api.finish({ win: true, stars: 3, score: S.coin, lines: [`赚到 ${S.coin} 金币`] });
        },
        tap(S, x, y, P, api) {
            for (let k = 0; k < 12; k++) {
                const px = 20 + (k % 4) * 88, py = 80 + Math.floor(k / 4) * 88;
                if (!E.hit(x, y, px, py, 78, 78)) continue;
                const p = S.plots[k];
                if (p.s === 0) { p.c = ri(0, 3); p.s = 0.01; }
                else if (p.s >= 1) { S.coin += CROP[p.c][2]; p.s = 0; p.c = null; }
                return;
            }
        },
    });
})();
