// 动作 10 款（均带无尽模式）：飞扬小鸟 · 躲避方块 · 接苹果 · 扎气球 · 射箭 · 投篮 · 飞镖 · 钓鱼 · 直升机 · 叠方块
(function () {
    const E = MG.eng, U = MG.ui;
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // ============ 1. 飞扬的小鸟 ============
    E.def('flappy', {
        levels: E.nm(),
        params: (i, t) => ({ gap: Math.round(190 - 90 * t), spd: 105 + 115 * t, target: 5 + i * 2 }),
        endless: { gap: 96, spd: 240, target: 999999 },
        w: 360, h: 520,
        hint: '点击/空格让小鸟上升，穿过管道缝隙；撞到即结束',
        init: P => ({ y: 240, vy: 0, pipes: [], t: 0, score: 0, done: false }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#7ec8f0', '#3a90c0');
            for (let k = 0; k < 5; k++) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(50 + k * 80, 60 + (k % 2) * 30, 26, 0, 6.284); ctx.fill(); }
            S.pipes.forEach(p => {
                E.card(ctx, p.x, 0, 52, p.g, '#4a9f3a', '#2a6f1e', 4);
                E.card(ctx, p.x, p.g + P.gap, 52, H - p.g - P.gap, '#4a9f3a', '#2a6f1e', 4);
            });
            U.emoji(ctx, '🐤', 80, S.y, 34);
            E.txt(ctx, P.endless ? `得分 ${S.score}` : `得分 ${S.score}/${P.target}`, W / 2, 30, 20, '#fff', true);
        },
        tick(S, dt, P, api) {
            S.vy += 1100 * dt; S.y += S.vy * dt;
            S.t -= dt;
            if (S.t <= 0) { S.t = 1.35; S.pipes.push({ x: 360, g: ri(40, 520 - P.gap - 60), pass: false }); }
            S.pipes.forEach(p => {
                p.x -= P.spd * dt;
                if (!p.pass && p.x + 52 < 80) { p.pass = true; S.score++; if (!P.endless && S.score >= P.target) api.finish({ win: true, stars: 3, score: S.score, lines: [`通过 ${S.score} 根管道`] }); }
            });
            S.pipes = S.pipes.filter(p => p.x > -60);
            for (const p of S.pipes) {
                if (80 + 15 > p.x && 80 - 15 < p.x + 52 && (S.y - 15 < p.g || S.y + 15 > p.g + P.gap)) {
                    return api.finish({ win: false, stars: 0, score: S.score, lines: [`撞上管道，得分 ${S.score}`] });
                }
            }
            if (S.y > 505 || S.y < 5) api.finish({ win: false, stars: 0, score: S.score, lines: [`坠地，得分 ${S.score}`] });
        },
        tap(S) { S.vy = -360; },
        key(S, k) { if (k === ' ' || k === 'ArrowUp') S.vy = -360; },
    });

    // ============ 2. 躲避方块 ============
    E.def('dodge', {
        levels: E.nm(),
        params: (i, t) => ({ spd: 105 + 155 * t, rate: Math.max(0.22, 0.75 - 0.5 * t), time: 15 + i }),
        endless: { spd: 300, rate: 0.2, time: 0 },
        w: 360, h: 520,
        hint: '点击左右移动，躲开落下的方块，坚持到时间结束',
        init: P => ({ x: 180, tx: 180, items: [], t: 0, time: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2a2440', '#14102a');
            S.items.forEach(b => E.card(ctx, b.x - 16, b.y - 16, 32, 32, '#ff6b7f', '#a02030', 6));
            U.emoji(ctx, '🚶', S.x, H - 40, 34);
            E.txt(ctx, P.endless ? `坚持 ${S.time.toFixed(1)}s` : `${(P.time - S.time).toFixed(1)}s / ${P.time}s`, W / 2, 30, 20, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            S.x += (S.tx - S.x) * Math.min(1, 12 * dt);
            S.time += dt; S.t -= dt;
            if (S.t <= 0) { S.t = P.rate; S.items.push({ x: ri(30, 330), y: -20 }); }
            S.items.forEach(b => b.y += P.spd * dt);
            S.items = S.items.filter(b => b.y < 540);
            for (const b of S.items) {
                if (Math.abs(b.x - S.x) < 30 && Math.abs(b.y - (520 - 40)) < 30) {
                    return api.finish({ win: false, stars: 0, score: Math.round(S.time * 10), lines: [`坚持 ${S.time.toFixed(1)} 秒`] });
                }
            }
            if (!P.endless && P.time && S.time >= P.time) api.finish({ win: true, stars: 3, score: Math.round(S.time * 10), lines: [`坚持满 ${P.time} 秒`] });
        },
        tap(S, x) { S.tx = clamp(x, 24, 336); },
        key(S, k) { if (k === 'ArrowLeft' || k === 'a') S.tx = clamp(S.tx - 40, 24, 336); if (k === 'ArrowRight' || k === 'd') S.tx = clamp(S.tx + 40, 24, 336); },
    });

    // ============ 3. 接苹果 ============
    E.def('catcher', {
        levels: E.nm(),
        params: (i, t) => ({ spd: 95 + 135 * t, rate: Math.max(0.4, 1.1 - 0.6 * t), target: 8 + i * 2, miss: 3 }),
        endless: { spd: 250, rate: 0.42, target: 999999, miss: 3 },
        w: 360, h: 520,
        hint: '点击左右移动篮子接苹果 🍎，别接 💣；漏接或炸到都会掉命',
        init: P => ({ x: 180, tx: 180, items: [], t: 0, got: 0, life: P.miss }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a5a2e', '#16281a');
            S.items.forEach(b => U.emoji(ctx, b.bad ? '💣' : '🍎', b.x, b.y, 30));
            U.emoji(ctx, '🧺', S.x, H - 34, 40);
            E.txt(ctx, P.endless ? `接到 ${S.got} · 命 ${S.life}` : `${S.got}/${P.target} · 命 ${S.life}`, W / 2, 30, 20, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            S.x += (S.tx - S.x) * Math.min(1, 12 * dt);
            S.t -= dt;
            if (S.t <= 0) { S.t = P.rate; S.items.push({ x: ri(30, 330), y: -20, bad: Math.random() < 0.22 }); }
            S.items.forEach(b => b.y += P.spd * dt);
            for (const b of S.items) {
                if (b.y > 520 - 50 && Math.abs(b.x - S.x) < 34) {
                    b.done = true;
                    if (b.bad) {
                        S.life--;
                        // 炸弹：火花四溅 + 大冲击环 + 强震屏
                        if (api.boom) api.boom(b.x, b.y, { n: 24, shape: 'spark', speed: 210, life: .5, r: 3.4, colors: ['#ff5252', '#ff9d5c', '#ffd56b'], glow: true });
                        if (api.ring) api.ring(b.x, b.y, { r: 74, color: '#ff5252', lw: 4 });
                        if (api.pop) api.pop(b.x, b.y - 22, '-1', { color: '#ff8a8a', size: 22 });
                        if (api.shake) api.shake(11, .36);
                    } else {
                        S.got++;
                        // 接到苹果：小碎点 + 飘分
                        if (api.boom) api.boom(b.x, b.y, { n: 8, shape: 'dot', speed: 95, life: .4, r: 3, colors: ['#b8ffb8', '#ffd56b'], glow: true });
                        if (api.pop) api.pop(b.x, b.y - 18, '+1', { color: '#b8ffb8', size: 18 });
                    }
                    if (S.life <= 0) return api.finish({ win: false, stars: 0, score: S.got, lines: [`接到 ${S.got} 个后失败`] });
                    if (!P.endless && S.got >= P.target) return api.finish({ win: true, stars: S.life >= 3 ? 3 : 2, score: S.got, lines: [`接到 ${S.got} 个苹果`] });
                } else if (b.y > 540) {
                    b.done = true;
                    if (!b.bad) {
                        S.life--;
                        if (api.pop) api.pop(b.x, 470, '漏接 -1', { color: '#ffb0b0', size: 17 });
                        if (S.life <= 0) return api.finish({ win: false, stars: 0, score: S.got, lines: ['漏接太多'] });
                    }
                }
            }
            S.items = S.items.filter(b => !b.done && b.y < 560);
        },
        tap(S, x) { S.tx = clamp(x, 30, 330); },
    });

    // ============ 4. 扎气球 ============
    E.def('balloonpop', {
        levels: E.nm(),
        params: (i, t) => ({ spd: 55 + 70 * t, rate: Math.max(0.35, 1.1 - 0.6 * t), target: 10 + i * 3 }),
        endless: { spd: 150, rate: 0.34, target: 999999 },
        w: 360, h: 520,
        hint: '点击戳破气球 🎈；漏掉一个飞走就结束',
        init: P => ({ items: [], t: 0, score: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#4a7fd0', '#1a3a70');
            S.items.forEach(b => U.emoji(ctx, '🎈', b.x, b.y, b.s));
            E.txt(ctx, P.endless ? `戳破 ${S.score}` : `${S.score}/${P.target}`, W / 2, 30, 20, '#fff', true);
        },
        tick(S, dt, P, api) {
            S.t -= dt;
            if (S.t <= 0) { S.t = P.rate; S.items.push({ x: ri(40, 320), y: 540, s: ri(36, 56) }); }
            S.items.forEach(b => b.y -= P.spd * dt * (b.s / 45));
            for (const b of S.items) {
                if (b.y < -40) {
                    return api.finish({ win: false, stars: 0, score: S.score, lines: [`气球飞走了，得分 ${S.score}`] });
                }
            }
        },
        tap(S, x, y, P, api) {
            for (let k = S.items.length - 1; k >= 0; k--) {
                const b = S.items[k];
                if (Math.abs(b.x - x) < b.s / 2 + 4 && Math.abs(b.y - y) < b.s / 2 + 4) {
                    S.items.splice(k, 1); S.score++;
                    // 爆裂反馈：彩色碎片 + 冲击环 + 飘分 + 轻微震屏
                    if (api.boom) api.boom(b.x, b.y, {
                        n: 16, shape: 'confetti', speed: 155, life: .6, r: b.s / 9,
                        colors: ['#ff7a8b', '#ffd56b', '#7ad0ff', '#b8ffb8', '#ff9d5c'], glow: true,
                    });
                    if (api.ring) api.ring(b.x, b.y, { r: b.s * 0.85, color: '#ffe9b0', lw: 2.5 });
                    if (api.pop) api.pop(b.x, b.y - b.s / 2, '+1', { color: '#fff3c4', size: 18 });
                    if (api.shake) api.shake(3, .16);
                    if (!P.endless && S.score >= P.target) api.finish({ win: true, stars: 3, score: S.score, lines: [`戳破 ${S.score} 个`] });
                    return;
                }
            }
        },
    });

    // ============ 5. 射箭 ============
    E.def('archery', {
        levels: E.nm(),
        params: (i, t) => ({ wind: 0 + 40 * t, move: Math.round(60 * t), target: 40 + i * 8, arrows: 8 }),
        endless: { wind: 45, move: 70, target: 999999, arrows: 999 },
        w: 360, h: 500,
        hint: '点击靶面方向射箭，越靠近靶心分越高（10/6/3 环）',
        init: P => ({ arrows: P.arrows, used: 0, score: 0, ty: 250, dir: 1, flying: null, msg: '点击射箭' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#5a7a4a', '#22381a');
            ctx.beginPath(); ctx.arc(300, S.ty, 46, 0, 6.284); ctx.fillStyle = '#f4f4f0'; ctx.fill();
            ctx.beginPath(); ctx.arc(300, S.ty, 34, 0, 6.284); ctx.fillStyle = '#4a7fd0'; ctx.fill();
            ctx.beginPath(); ctx.arc(300, S.ty, 22, 0, 6.284); ctx.fillStyle = '#ff6b7f'; ctx.fill();
            ctx.beginPath(); ctx.arc(300, S.ty, 10, 0, 6.284); ctx.fillStyle = '#ffd56b'; ctx.fill();
            U.emoji(ctx, '🏹', 46, 250, 40);
            if (S.flying) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(S.flying.x, S.flying.y); ctx.lineTo(S.flying.x - 22, S.flying.y - 6); ctx.stroke(); }
            E.txt(ctx, P.endless ? `得分 ${S.score} · 箭 ${S.arrows - S.used}` : `${S.score}/${P.target} · 箭 ${S.arrows - S.used}`, W / 2, 30, 18, '#fff', true);
            E.txt(ctx, S.msg, W / 2, H - 22, 15, '#f0f0d8');
        },
        tick(S, dt, P, api) {
            S.ty += S.dir * P.move * dt;
            if (S.ty < 70 || S.ty > 430) S.dir *= -1;
            if (S.flying) {
                S.flying.x += S.flying.vx * dt; S.flying.y += S.flying.vy * dt;
                S.flying.vy += P.wind * dt;
                if (S.flying.x >= 300) {
                    const d = Math.abs(S.flying.y - S.ty);
                    const pt = d < 12 ? 10 : d < 24 ? 6 : d < 40 ? 3 : 0;
                    S.score += pt; S.msg = pt ? `命中 ${pt} 环！` : '脱靶…';
                    S.flying = null; S.used++;
                    if (!P.endless && S.score >= P.target) return api.finish({ win: true, stars: 3, score: S.score, lines: [`${S.used} 箭得 ${S.score} 分`] });
                    if (S.used >= S.arrows) return api.finish({ win: !P.endless && S.score >= P.target, stars: 0, score: S.score, lines: [`箭用尽，得分 ${S.score}`] });
                } else if (S.flying.y > 520 || S.flying.y < -20) { S.flying = null; S.used++; S.msg = '箭飞歪了'; if (S.used >= S.arrows) return api.finish({ win: false, stars: 0, score: S.score, lines: [`箭用尽，得分 ${S.score}`] }); }
            }
        },
        tap(S, x, y, P, api) {
            if (S.flying) return;
            const dx = x - 46, dy = y - 250, len = Math.hypot(dx, dy) || 1;
            S.flying = { x: 46, y: 250, vx: dx / len * 620, vy: dy / len * 620 };
        },
    });

    // ============ 6. 投篮 ============
    E.def('basketball', {
        levels: E.nm(),
        params: (i, t) => ({ move: Math.round(30 + 90 * t), target: 4 + i, shots: 10 }),
        endless: { move: 130, target: 999999, shots: 999 },
        w: 360, h: 500,
        hint: '点击决定投篮方向与力度（离球员越远越用力），把球投进篮筐',
        init: P => ({ hx: 180, dir: 1, ball: null, score: 0, shots: 0, msg: '点击投篮' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#8a5a2f', '#3a2412');
            ctx.strokeStyle = '#ff6b3a'; ctx.lineWidth = 5;
            ctx.strokeRect(S.hx - 40, 150, 80, 8);
            E.txt(ctx, '🏀', 0, 0, 0);
            U.emoji(ctx, '⛹️', 40, H - 60, 40);
            if (S.ball) U.emoji(ctx, '🏀', S.ball.x, S.ball.y, 26);
            E.txt(ctx, P.endless ? `投进 ${S.score}` : `${S.score}/${P.target} · 第 ${S.shots + 1} 投`, W / 2, 30, 18, '#ffd56b', true);
            E.txt(ctx, S.msg, W / 2, H - 20, 15, '#f0e0c8');
        },
        tick(S, dt, P, api) {
            S.hx += S.dir * P.move * dt;
            if (S.hx < 60 || S.hx > 300) S.dir *= -1;
            if (S.ball) {
                S.ball.vy += 980 * dt;
                S.ball.x += S.ball.vx * dt; S.ball.y += S.ball.vy * dt;
                if (S.ball.vy > 0 && Math.abs(S.ball.x - S.hx) < 34 && Math.abs(S.ball.y - 158) < 14 && S.ball.py < 158) {
                    S.score += 2; S.msg = '空心入网！'; S.ball = null;
                    if (!P.endless && S.score / 2 >= P.target) return api.finish({ win: true, stars: 3, score: S.score, lines: [`投进 ${S.score / 2} 球`] });
                } else if (S.ball.y > 520) { S.ball = null; S.msg = '没进…'; }
                else S.ball.py = S.ball.y;
            }
        },
        tap(S, x, y, P) {
            if (S.ball) return;
            const dx = (x - 40), dy = (y - (500 - 60));
            const len = Math.hypot(dx, dy) || 1;
            const pw = Math.min(1.5, len / 180);
            S.ball = { x: 40, y: 500 - 60, py: 500 - 60, vx: dx / len * 380 * pw, vy: -Math.abs(dy / len) * 480 * pw - 260 };
            S.shots++;
        },
    });

    // ============ 7. 飞镖 ============
    E.def('darts', {
        levels: E.nm(),
        params: (i, t) => ({ spd: 1 + 2.2 * t, target: 60 + i * 10, darts: 6 }),
        endless: { spd: 3.6, target: 999999, darts: 999 },
        w: 360, h: 480,
        hint: '瞄准条来回移动，点击停下投镖，越靠中心分越高',
        init: P => ({ pos: 0, dir: 1, score: 0, used: 0, msg: '点击投镖' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f52', '#1a1430');
            const cx = 180, cy = 170;
            ctx.beginPath(); ctx.arc(cx, cy, 120, 0, 6.284); ctx.fillStyle = '#2a2440'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 92, 0, 6.284); ctx.fillStyle = '#4a3f6a'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 58, 0, 6.284); ctx.fillStyle = '#6a5f8a'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 6.284); ctx.fillStyle = '#ff6b7f'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 6.284); ctx.fillStyle = '#ffd56b'; ctx.fill();
            ctx.fillStyle = '#ffd56b';
            U.rr(ctx, 30 + S.pos * 300 - 3, 350, 6, 40, 3); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(30, 350, 300, 40);
            E.txt(ctx, P.endless ? `得分 ${S.score}` : `${S.score}/${P.target} · 镖 ${P.darts - S.used}`, W / 2, 30, 18, '#ffd56b', true);
            E.txt(ctx, S.msg, W / 2, H - 20, 15, '#d8c8f0');
        },
        tick(S, dt, P, api) {
            S.pos += S.dir * P.spd * dt;
            if (S.pos < 0) { S.pos = 0; S.dir = 1; }
            if (S.pos > 1) { S.pos = 1; S.dir = -1; }
        },
        tap(S, x, y, P, api) {
            const off = (S.pos - 0.5) * 2;
            const d = Math.abs(off) * 120;
            const pt = d < 10 ? 50 : d < 26 ? 25 : d < 58 ? 12 : d < 92 ? 5 : 0;
            S.score += pt; S.used++;
            S.msg = pt ? `命中 ${pt} 分！` : '脱靶';
            if (!P.endless && S.score >= P.target) return api.finish({ win: true, stars: 3, score: S.score, lines: [`${S.used} 镖得 ${S.score} 分`] });
            if (S.used >= P.darts) return api.finish({ win: false, stars: 0, score: S.score, lines: [`镖用尽，得分 ${S.score}`] });
        },
    });

    // ============ 8. 钓鱼 ============
    E.def('fishing', {
        levels: E.nm(),
        params: (i, t) => ({ spd: 40 + 90 * t, n: Math.min(6, 2 + Math.floor(i / 4)), target: 6 + i * 2 }),
        endless: { spd: 150, n: 6, target: 999999 },
        w: 360, h: 500,
        hint: '鱼游过钩子正下方时点击收杆；钓到 🐟 得分，钓到 👟 扣分',
        init: P => ({ hook: 0, down: false, fish: [], score: 0, miss: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2a6a9f', '#0e2a4a');
            ctx.strokeStyle = '#e8e0c0'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(180, 40); ctx.lineTo(180, 40 + S.hook); ctx.stroke();
            U.emoji(ctx, '🪝', 180, 44 + S.hook, 24);
            S.fish.forEach(f => U.emoji(ctx, f.bad ? '👟' : '🐟', f.x, f.y, 30));
            E.txt(ctx, P.endless ? `钓到 ${S.score} · 空竿 ${S.miss}/5` : `${S.score}/${P.target} · 空竿 ${S.miss}/5`, W / 2, 28, 17, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            if (S.down) { S.hook += 320 * dt; if (S.hook > 380) { S.hook = 380; S.down = false; } }
            else { S.hook -= 320 * dt; if (S.hook < 0) { S.hook = 0; } }
            if (S.fish.length < P.n && Math.random() < 0.02 + P.n * 0.004) {
                S.fish.push({ x: Math.random() < 0.5 ? -20 : 380, y: 200 + Math.random() * 220, bad: Math.random() < 0.28, sp: (60 + Math.random() * 60) * (Math.random() < 0.5 ? 1 : -1) });
            }
            S.fish.forEach(f => { f.x += f.sp * dt; f.sp += (f.sp > 0 ? -6 : 6) * dt * 0; });
            S.fish = S.fish.filter(f => f.x > -60 && f.x < 420);
        },
        tap(S, x, y, P, api) {
            S.down = true;
            setTimeout(() => {
                if (S.hook < 300) { S.miss++; return; }
                const hit = S.fish.find(f => Math.abs(f.x - 180) < 34 && Math.abs(f.y - (44 + S.hook)) < 34);
                if (hit) { S.fish.splice(S.fish.indexOf(hit), 1); if (hit.bad) S.score = Math.max(0, S.score - 1); else S.score++; }
                else S.miss++;
                if (S.miss >= 5) api.finish({ win: false, stars: 0, score: S.score, lines: [`空竿 5 次，钓到 ${S.score}`] });
                else if (!P.endless && S.score >= P.target) api.finish({ win: true, stars: 3, score: S.score, lines: [`钓到 ${S.score} 条`] });
            }, 420);
        },
    });

    // ============ 9. 直升机 ============
    E.def('helicopter', {
        levels: E.nm(),
        params: (i, t) => ({ spd: 118 + 142 * t, gap: Math.round(200 - 80 * t), target: 300 + i * 120 }),
        endless: { spd: 290, gap: 110, target: 999999 },
        w: 360, h: 500,
        hint: '点击给直升机上推力，穿过上下障碍的缝隙',
        init: P => ({ y: 250, vy: 0, walls: [], t: 0, score: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2a3a5f', '#121c32');
            S.walls.forEach(w => {
                E.card(ctx, w.x, 0, 46, w.g, '#6a7f9f', '#3a4a6a', 4);
                E.card(ctx, w.x, w.g + P.gap, 46, H - w.g - P.gap, '#6a7f9f', '#3a4a6a', 4);
            });
            U.emoji(ctx, '🚁', 80, S.y, 36);
            E.txt(ctx, P.endless ? `飞行 ${Math.floor(S.score / 30)}m` : `${Math.floor(S.score / 30)}/${P.target}m`, W / 2, 28, 19, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            S.vy += 620 * dt; S.y += S.vy * dt; S.score += P.spd * dt;
            S.t -= dt;
            if (S.t <= 0) { S.t = 1.5; S.walls.push({ x: 360, g: ri(40, 500 - P.gap - 40) }); }
            S.walls.forEach(w => w.x -= P.spd * dt);
            S.walls = S.walls.filter(w => w.x > -60);
            for (const w of S.walls) {
                if (80 + 16 > w.x && 80 - 16 < w.x + 46 && (S.y - 16 < w.g || S.y + 16 > w.g + P.gap)) {
                    return api.finish({ win: false, stars: 0, score: Math.floor(S.score / 30), lines: [`飞行 ${Math.floor(S.score / 30)} 米`] });
                }
            }
            if (S.y > 490 || S.y < 10) return api.finish({ win: false, stars: 0, score: Math.floor(S.score / 30), lines: [`飞行 ${Math.floor(S.score / 30)} 米`] });
            if (!P.endless && S.score / 30 >= P.target) api.finish({ win: true, stars: 3, score: Math.floor(S.score / 30), lines: [`飞行 ${P.target} 米达成`] });
        },
        tap(S) { S.vy = Math.max(-320, S.vy - 340); },
        key(S, k) { if (k === ' ') S.vy = Math.max(-320, S.vy - 340); },
    });

    // ============ 10. 叠方块 ============
    E.def('stacker', {
        levels: E.nm(),
        params: (i, t) => ({ spd: 78 + 142 * t, target: Math.min(20, 5 + Math.floor(i / 2)) }),
        endless: { spd: 240, target: 9999 },
        w: 360, h: 500,
        hint: '方块左右滑动，点击让它落下；对齐越高分，偏太多就掉',
        init: P => ({ blocks: [{ x: 130, w: 100 }], cur: { x: 20, w: 100, dir: 1 }, spd: P.spd, h: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f52', '#1a1430');
            S.blocks.forEach((b, k) => E.card(ctx, b.x, H - 60 - k * 26, b.w, 24, BSC[k % 7], '#241c3a', 4));
            const top = S.blocks[S.blocks.length - 1];
            E.card(ctx, S.cur.x, H - 60 - S.blocks.length * 26, S.cur.w, 24, BSC[S.blocks.length % 7], '#241c3a', 4);
            E.txt(ctx, P.endless ? `叠了 ${S.blocks.length} 层` : `${S.blocks.length}/${P.target + 1} 层`, W / 2, 30, 19, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            S.cur.x += S.cur.dir * S.spd * dt;
            if (S.cur.x < 10) { S.cur.x = 10; S.cur.dir = 1; }
            if (S.cur.x + S.cur.w > 350) { S.cur.x = 350 - S.cur.w; S.cur.dir = -1; }
        },
        tap(S, x, y, P, api) {
            const top = S.blocks[S.blocks.length - 1];
            const ov = Math.min(S.cur.x + S.cur.w, top.x + top.w) - Math.max(S.cur.x, top.x);
            if (ov <= 0) return api.finish({ win: false, stars: 0, score: S.blocks.length, lines: [`没对齐，叠了 ${S.blocks.length} 层`] });
            const nx = Math.max(S.cur.x, top.x), nw = ov;
            S.blocks.push({ x: nx, w: nw });
            S.cur = { x: 10, w: nw, dir: 1 };
            S.spd = Math.min(320, S.spd + 8);
            if (!P.endless && S.blocks.length > P.target) api.finish({ win: true, stars: 3, score: S.blocks.length, lines: [`叠到 ${S.blocks.length} 层`] });
        },
    });
    const BSC = ['#ff6b7f', '#ffd56b', '#5cd65c', '#5cc7ff', '#b78bff', '#ff9d5c', '#7adf7a'];
})();
