// 休闲 10 款（多为无尽）：抛硬币 · 骰子比大小 · 老虎机 · 宾果 · 转盘 · 猜拳连胜 · 弹珠 · 幸运七 · 连点挑战 · 扭蛋抽卡
(function () {
    const E = MG.eng, U = MG.ui;
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const pick = a => a[Math.floor(Math.random() * a.length)];

    // ============ 1. 抛硬币 ============
    E.def('coinflip', {
        levels: E.nm(),
        params: (i, t) => ({ need: 2 + Math.floor(i / 3) }),
        endless: { need: 999 },
        w: 360, h: 430,
        hint: '猜正反面，猜对连胜 +1，猜错清零',
        init: P => ({ streak: 0, best: 0, face: 0, spin: 0, msg: '选择正面或反面' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f52', '#1a1430');
            const cx = 180, cy = 150;
            const sc = Math.abs(Math.cos(S.spin));
            ctx.save(); ctx.translate(cx, cy); ctx.scale(Math.max(0.12, sc), 1);
            ctx.beginPath(); ctx.arc(0, 0, 56, 0, 6.284);
            ctx.fillStyle = S.face ? '#c8a020' : '#d8d8e0'; ctx.fill();
            ctx.strokeStyle = '#8a7a30'; ctx.lineWidth = 4; ctx.stroke();
            E.txt(ctx, S.face ? '🪙' : '⚪', 0, 0, 44, S.face ? '#8a6a10' : '#7a7a90', true);
            ctx.restore();
            E.txt(ctx, P.endless ? `连胜 ${S.streak} · 最高 ${S.best}` : `连胜 ${S.streak}/${P.need}`, W / 2, 40, 19, '#ffd56b', true);
            E.btnBox(ctx, 30, H - 130, 140, 54, '🙂 正面', '#4a3f6a', '#2a2440');
            E.btnBox(ctx, 190, H - 130, 140, 54, '🪙 反面', '#4a3f6a', '#2a2440');
            E.txt(ctx, S.msg, W / 2, H - 44, 15, '#d8c8f0');
        },
        tick(S, dt, P) { if (S.spin > 0) S.spin += dt * 12; },
        tap(S, x, y, P, api) {
            if (S.spin > 0) return;
            let guess = null;
            if (E.hit(x, y, 30, 430 - 130, 140, 54)) guess = 0;
            if (E.hit(x, y, 190, 430 - 130, 140, 54)) guess = 1;
            if (guess == null) return;
            S.spin = 0.01;
            setTimeout(() => {
                S.face = ri(0, 1); S.spin = 0;
                if (guess === S.face) {
                    S.streak++; S.best = Math.max(S.best, S.streak); S.msg = '猜对了！';
                    if (!P.endless && S.streak >= P.need) api.finish({ win: true, stars: 3, score: S.streak, lines: [`连胜 ${S.streak} 次`] });
                } else { S.msg = '猜错了，连胜清零'; S.streak = 0; }
            }, 620);
        },
    });

    // ============ 2. 骰子比大小 ============
    E.def('dicehi', {
        levels: E.nm(),
        params: (i, t) => ({ need: 3 + Math.floor(i / 3) }),
        endless: { need: 999 },
        w: 360, h: 440,
        hint: '猜骰子点数：小（1-3）还是大（4-6）',
        init: P => ({ v: 1, streak: 0, roll: 0, msg: '选择大小' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f4a3a', '#14241c');
            const cx = 180, cy = 140;
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.roll * 8);
            E.card(ctx, -52, -52, 104, 104, '#f4f0e0', '#d0c8b0', 14);
            const pips = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [-1, 1], [1, -1], [1, 1]], [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]], [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]]];
            ctx.fillStyle = '#2a2a3a';
            (pips[S.v] || []).forEach(([a, b]) => { ctx.beginPath(); ctx.arc(a * 26, b * 26, 10, 0, 6.284); ctx.fill(); });
            ctx.restore();
            E.txt(ctx, P.endless ? `连胜 ${S.streak}` : `连胜 ${S.streak}/${P.need}`, W / 2, 40, 19, '#ffd56b', true);
            E.btnBox(ctx, 30, H - 130, 140, 54, '⬇ 小 1-3', '#2f6f4a', '#1a4a2a');
            E.btnBox(ctx, 190, H - 130, 140, 54, '⬆ 大 4-6', '#8a4a2f', '#5a2a1a');
            E.txt(ctx, S.msg, W / 2, H - 44, 15, '#cfe8d8');
        },
        tap(S, x, y, P, api) {
            let g = null;
            if (E.hit(x, y, 30, 440 - 130, 140, 54)) g = 0;
            if (E.hit(x, y, 190, 440 - 130, 140, 54)) g = 1;
            if (g == null) return;
            S.roll = 1;
            setTimeout(() => {
                S.v = ri(1, 6); S.roll = 0;
                const big = S.v >= 4 ? 1 : 0;
                if (big === g) {
                    S.streak++; S.msg = `掷出 ${S.v}，猜对！`;
                    if (!P.endless && S.streak >= P.need) api.finish({ win: true, stars: 3, score: S.streak, lines: [`连胜 ${S.streak} 次`] });
                } else { S.msg = `掷出 ${S.v}，猜错`; S.streak = 0; }
            }, 500);
        },
    });

    // ============ 3. 老虎机 ============
    const SLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
    E.def('slots', {
        levels: E.nm(),
        params: (i, t) => ({ need: 200 + i * 120 }),
        endless: { need: 0 },
        w: 360, h: 440,
        hint: '点击拉杆转一次，三连中奖！先攒到目标分即胜',
        init: P => ({ r: [0, 0, 0], chips: 100, spin: 0, msg: '点击拉杆开始' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#5a2f4a', '#2a1020');
            for (let k = 0; k < 3; k++) {
                E.card(ctx, 30 + k * 104, 80, 92, 120, '#f4f0e0', '#c0b8a0', 12);
                const idx = (S.r[k] + Math.floor(S.spin * 9)) % SLS.length;
                U.emoji(ctx, SLS[idx], 30 + k * 104 + 46, 140, 54);
            }
            E.txt(ctx, `💰 ${S.chips}${P.endless ? '' : ' / ' + P.need}`, W / 2, 40, 19, '#ffd56b', true);
            E.btnBox(ctx, 110, H - 130, 140, 54, '🎰 转 (10)', '#8a5a2f', '#5a3a1c');
            E.txt(ctx, S.msg, W / 2, H - 44, 15, '#f0d8e8');
        },
        tick(S, dt) { if (S.spin > 0) { S.spin += dt * 2; if (S.spin >= 1) { S.spin = 0; slSettle(S); } } },
        tap(S, x, y, P, api) {
            if (S.spin > 0 || S.chips < 10) { if (S.chips < 10) S.msg = '筹码不足'; return; }
            if (!E.hit(x, y, 110, 440 - 130, 140, 54)) return;
            S.chips -= 10; S.spin = 0.01;
            setTimeout(() => {
                S.r = [ri(0, 5), ri(0, 5), ri(0, 5)]; S.spin = 0; slSettle(S);
                if (S.chips >= P.need && P.need) api.finish({ win: true, stars: 3, score: S.chips, lines: [`筹码 ${S.chips}`] });
                if (S.chips < 10 && !P.endless) api.finish({ win: false, stars: 0, score: 0, lines: ['筹码输光了'] });
            }, 700);
        },
    });
    function slSettle(S) {
        const [a, b, c] = S.r;
        if (a === b && b === c) { const w = (a + 1) * 40; S.chips += w; S.msg = `三连！+${w}`; }
        else if (a === b || b === c || a === c) { S.chips += 15; S.msg = '两个相同 +15'; }
        else S.msg = '没中奖';
    }

    // ============ 4. 宾果 ============
    E.def('bingo', {
        levels: E.nm(),
        params: (i, t) => ({ need: 1 + Math.floor(i / 7), draws: Math.max(20, 45 - i) }),
        w: 380, h: 480,
        hint: '每次抽号会点亮对应格子，连成线即得分（横/竖/斜）',
        init: P => {
            const nums = MG.shuffle(Array.from({ length: 40 }, (_, k) => k + 1));
            const card = [];
            for (let i = 0; i < 5; i++) { card.push([]); for (let j = 0; j < 5; j++) card[i].push(nums[i * 5 + j]); }
            return { card, mark: Array.from({ length: 5 }, () => Array(5).fill(false)), pool: MG.shuffle(Array.from({ length: 40 }, (_, k) => k + 1)), cur: null, lines: 0, drawn: 0, draws: P.draws, need: P.need };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f52', '#1a1430');
            const C = 56, ox = (W - C * 5) / 2, oy = 90;
            for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
                const x = ox + j * C, y = oy + i * C;
                E.card(ctx, x + 2, y + 2, C - 4, C - 4, S.mark[i][j] ? '#ffd56b' : '#4a3f6a', S.mark[i][j] ? '#e0a020' : '#2a2440', 8);
                E.txt(ctx, S.card[i][j], x + C / 2, y + C / 2, 20, S.mark[i][j] ? '#3a2a00' : '#fff', true);
            }
            E.txt(ctx, `连成 ${S.lines}/${S.need} 条线 · 剩余 ${S.draws - S.drawn} 抽`, W / 2, 40, 17, '#ffd56b', true);
            E.btnBox(ctx, 90, H - 120, 200, 52, S.cur ? '最新：' + S.cur : '抽号', '#8a5a2f', '#5a3a1c');
        },
        tap(S, x, y, P, api) {
            if (!E.hit(x, y, 90, 480 - 120, 200, 52)) return;
            if (S.drawn >= S.draws) {
                return api.finish(S.lines >= S.need ? { win: true, stars: 3, score: S.lines, lines: [`连成 ${S.lines} 条线`] } : { win: false, stars: 0, score: S.lines, lines: [`只连成 ${S.lines} 条`] });
            }
            S.cur = S.pool[S.drawn++];
            for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (S.card[i][j] === S.cur) S.mark[i][j] = true;
            let n = 0;
            for (let i = 0; i < 5; i++) { if (S.mark[i].every(v => v)) n++; if (S.mark.every(r => r[i])) n++; }
            if (S.mark.every((r, k) => r[k])) n++;
            if (S.mark.every((r, k) => r[4 - k])) n++;
            S.lines = n;
            if (S.lines >= S.need) api.finish({ win: true, stars: S.drawn <= S.draws * 0.6 ? 3 : 2, score: S.lines, lines: [`${S.drawn} 抽连成 ${S.lines} 条线`] });
        },
    });

    // ============ 5. 幸运转盘 ============
    E.def('spinner', {
        levels: E.nm(),
        params: (i, t) => ({ need: 200 + i * 150, seg: 8 }),
        endless: { need: 0, seg: 8 },
        w: 380, h: 470,
        hint: '点击转盘转动，指针停在哪个区就得分，目标分数达成即胜',
        init: P => ({ ang: 0, spin: 0, score: 0, seg: P.seg, msg: '点击转盘' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#4a2f52', '#20103a');
            const cx = 190, cy = 180, R = 130;
            for (let k = 0; k < S.seg; k++) {
                ctx.beginPath(); ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, R, k * 6.284 / S.seg + S.ang, (k + 1) * 6.284 / S.seg + S.ang);
                ctx.closePath();
                ctx.fillStyle = k % 2 ? '#ff8a6b' : '#ffd56b'; ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
                const mid = (k + 0.5) * 6.284 / S.seg + S.ang;
                E.txt(ctx, (k + 1) * 10, cx + Math.cos(mid) * R * 0.66, cy + Math.sin(mid) * R * 0.66, 18, '#5a2a10', true);
            }
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.moveTo(cx, cy - R - 6); ctx.lineTo(cx - 10, cy - R - 26); ctx.lineTo(cx + 10, cy - R - 26); ctx.closePath(); ctx.fill();
            E.txt(ctx, P.endless ? `得分 ${S.score}` : `${S.score}/${P.need}`, W / 2, 40, 19, '#ffd56b', true);
            E.txt(ctx, S.msg, W / 2, H - 40, 15, '#f0d8e8');
        },
        tick(S, dt) {
            if (S.spin > 0) {
                S.ang += S.spin * dt; S.spin *= 0.985;
                if (S.spin < 0.25) { S.spin = 0; const idx = Math.floor(((6.284 - (S.ang % 6.284)) % 6.284) / (6.284 / S.seg)); const v = (idx + 1) * 10; S.score += v; S.msg = `停在 ${v} 分`; }
            }
        },
        tap(S, x, y, P, api) {
            if (S.spin > 0) return;
            S.spin = 12 + Math.random() * 8;
            setTimeout(() => { if (P.need && S.score >= P.need) api.finish({ win: true, stars: 3, score: S.score, lines: [`得分 ${S.score}`] }); }, 3200);
        },
    });

    // ============ 6. 猜拳连胜 ============
    E.def('rpsgame', {
        levels: E.nm(),
        params: (i, t) => ({ need: 3 + Math.floor(i / 3) }),
        endless: { need: 999 },
        w: 360, h: 440,
        hint: '石头剪刀布，连胜到目标次数即胜',
        init: P => ({ mine: null, ai: null, streak: 0, msg: '出拳吧！' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f3a52', '#141c2c');
            E.txt(ctx, P.endless ? `连胜 ${S.streak}` : `连胜 ${S.streak}/${P.need}`, W / 2, 40, 19, '#ffd56b', true);
            if (S.mine) {
                E.txt(ctx, '你 ' + S.mine, 90, 130, 26, '#fff', true);
                E.txt(ctx, '电脑 ' + S.ai, 270, 130, 26, '#fff', true);
            }
            const ops = ['✊', '✌️', '✋'];
            ops.forEach((o, k) => E.btnBox(ctx, 20 + k * 112, H - 130, 100, 62, o + ['石头', '剪刀', '布'][k], '#4a3f6a', '#2a2440'));
            E.txt(ctx, S.msg, W / 2, H - 44, 16, '#c8c0e0');
        },
        tap(S, x, y, P, api) {
            const ops = ['✊', '✌️', '✋'];
            for (let k = 0; k < 3; k++) {
                if (!E.hit(x, y, 20 + k * 112, 440 - 130, 100, 62)) continue;
                S.mine = ops[k]; S.ai = ops[ri(0, 2)];
                const d = (k - ops.indexOf(S.ai) + 3) % 3;
                if (d === 0) S.msg = '平局，再来';
                else if (d === 1) {
                    S.streak++; S.msg = '你赢了！';
                    if (!P.endless && S.streak >= P.need) api.finish({ win: true, stars: 3, score: S.streak, lines: [`连胜 ${S.streak} 次`] });
                } else { S.streak = 0; S.msg = '你输了，连胜清零'; }
                return;
            }
        },
    });

    // ============ 7. 弹珠（Plinko）============
    E.def('plinko', {
        levels: E.nm(),
        params: (i, t) => ({ need: 300 + i * 200 }),
        endless: { need: 0 },
        w: 380, h: 500,
        hint: '点击顶部投放弹珠，落进高分槽得分',
        init: P => ({ balls: [], score: 0, pegs: [], msg: '点击投放弹珠' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#1f3a52', '#0c1e2e');
            if (!S.pegs.length) {
                for (let r = 0; r < 6; r++) for (let k = 0; k <= r + 2; k++) S.pegs.push({ x: 190 + (k - (r + 2) / 2) * 46, y: 110 + r * 48 });
            }
            S.pegs.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 6.284); ctx.fillStyle = '#ffd56b'; ctx.fill(); });
            const slots = [10, 30, 60, 100, 60, 30, 10];
            slots.forEach((v, k) => {
                const x = 20 + k * 48;
                E.card(ctx, x, H - 70, 44, 44, '#2f5f8f', '#17324f', 6);
                E.txt(ctx, v, x + 22, H - 48, 14, '#fff', true);
            });
            S.balls.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, 6.284); ctx.fillStyle = '#ff6b7f'; ctx.fill(); });
            E.txt(ctx, P.endless ? `得分 ${S.score}` : `${S.score}/${P.need}`, W / 2, 40, 19, '#ffd56b', true);
            E.txt(ctx, S.msg, W / 2, H - 14, 14, '#cfe0f0');
        },
        tick(S, dt, P, api) {
            S.balls.forEach(b => {
                b.vy += 700 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
                if (b.x < 14 || b.x > 366) b.vx *= -1;
                for (const p of S.pegs) {
                    const dx = b.x - p.x, dy = b.y - p.y;
                    if (dx * dx + dy * dy < 200) { b.vx = (dx > 0 ? 1 : -1) * ri(60, 150); b.vy = Math.min(b.vy, -40); }
                }
            });
            const kept = [];
            S.balls.forEach(b => {
                if (b.y > 500 - 76) {
                    const k = Math.max(0, Math.min(6, Math.floor((b.x - 20) / 48)));
                    S.score += [10, 30, 60, 100, 60, 30, 10][k];
                    if (P.need && S.score >= P.need) api.finish({ win: true, stars: 3, score: S.score, lines: [`得分 ${S.score}`] });
                } else kept.push(b);
            });
            S.balls = kept;
        },
        tap(S, x, y, P) { if (S.balls.length < 6) S.balls.push({ x: 190 + ri(-60, 60), y: 60, vx: ri(-60, 60), vy: 0 }); },
    });

    // ============ 8. 幸运七 ============
    E.def('lucky7', {
        levels: E.nm(),
        params: (i, t) => ({ need: 150 + i * 100 }),
        endless: { need: 0 },
        w: 360, h: 440,
        hint: '两颗骰子，猜总和是小于 7 / 等于 7 / 大于 7',
        init: P => ({ d: [1, 1], score: 0, msg: '下注吧' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f22', '#1a1410');
            S.d.forEach((v, k) => {
                E.card(ctx, 70 + k * 130, 80, 90, 90, '#f4f0e0', '#c0b8a0', 12);
                E.txt(ctx, ['⚀','⚁','⚂','⚃','⚄','⚅'][v - 1], 70 + k * 130 + 45, 125, 48, '#2a2a3a', true);
            });
            E.txt(ctx, `总和 ${S.d[0] + S.d[1]}`, W / 2, 200, 22, '#ffd56b', true);
            E.txt(ctx, P.endless ? `得分 ${S.score}` : `${S.score}/${P.need}`, W / 2, 40, 19, '#ffd56b', true);
            E.btnBox(ctx, 12, H - 120, 108, 52, '小 <7', '#2f6f4a', '#1a4a2a');
            E.btnBox(ctx, 126, H - 120, 108, 52, '等于 7', '#8a7a2f', '#5a4a1a');
            E.btnBox(ctx, 240, H - 120, 108, 52, '大 >7', '#8a4a2f', '#5a2a1a');
            E.txt(ctx, S.msg, W / 2, H - 44, 15, '#f0e0c8');
        },
        tap(S, x, y, P, api) {
            const H = 440;
            let g = null;
            if (E.hit(x, y, 12, H - 120, 108, 52)) g = 0;
            if (E.hit(x, y, 126, H - 120, 108, 52)) g = 1;
            if (E.hit(x, y, 240, H - 120, 108, 52)) g = 2;
            if (g == null) return;
            S.d = [ri(1, 6), ri(1, 6)];
            const sum = S.d[0] + S.d[1];
            const actual = sum < 7 ? 0 : sum === 7 ? 1 : 2;
            if (actual === g) { const w = g === 1 ? 60 : 25; S.score += w; S.msg = `猜中！+${w}`; }
            else { S.score = Math.max(0, S.score - 15); S.msg = '猜错 -15'; }
            if (P.need && S.score >= P.need) api.finish({ win: true, stars: 3, score: S.score, lines: [`得分 ${S.score}`] });
        },
    });

    // ============ 9. 连点挑战 ============
    E.def('tapburst', {
        levels: E.nm(),
        params: (i, t) => ({ need: 20 + i * 6, sec: 10 }),
        endless: { need: 0, sec: 30 },
        w: 360, h: 440,
        hint: '在时间内疯狂点击，点得越多越好',
        init: P => ({ taps: 0, t: 0, sec: P.sec, started: false }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f4a5f', '#12283a');
            const left = Math.max(0, S.sec - S.t);
            E.txt(ctx, `剩余 ${left.toFixed(1)} 秒`, W / 2, 40, 19, '#ffd56b', true);
            E.txt(ctx, S.taps, W / 2, 200, 66, '#fff', true);
            if (!S.started) E.btnBox(ctx, 100, H - 140, 160, 56, '开始连点', '#8a5a2f', '#5a3a1c');
            else { ctx.fillStyle = '#ff6b7f'; U.rr(ctx, 60, H - 140, 240, 56, 12); ctx.fill(); E.txt(ctx, '点我！', 180, H - 112, 24, '#fff', true); }
        },
        tick(S, dt, P, api) {
            if (!S.started) return;
            S.t += dt;
            if (S.t >= S.sec) {
                api.finish({
                    win: !P.need || S.taps >= P.need,
                    stars: !P.need ? 0 : (S.taps >= P.need * 1.4 ? 3 : S.taps >= P.need ? 2 : 1),
                    score: S.taps, lines: [`${S.sec} 秒点了 ${S.taps} 下`],
                });
            }
        },
        tap(S, x, y, P) {
            const H = 440;
            if (!S.started) { if (E.hit(x, y, 100, H - 140, 160, 56)) S.started = true; return; }
            if (E.hit(x, y, 60, H - 140, 240, 56)) S.taps++;
        },
    });

    // ============ 10. 扭蛋抽卡 ============
    const GR = [['N', '#9aa2b5', 55], ['R', '#5cc7ff', 26], ['SR', '#b78bff', 14], ['SSR', '#ffd56b', 5]];
    E.def('gacha', {
        levels: E.nm(),
        params: (i, t) => ({ need: 1 + Math.floor(i / 5), tickets: 10 + i }),
        endless: { need: 999, tickets: 9999 },
        w: 380, h: 470,
        hint: '消耗扭蛋币抽奖，抽到目标数量的 SSR/ SR 即胜',
        init: P => ({ ticket: P.tickets, got: { N: 0, R: 0, SR: 0, SSR: 0 }, last: null, anim: 0, msg: '点击扭蛋' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#4a2f52', '#20103a');
            E.txt(ctx, `🎟 ${S.ticket}　SSR ${S.got.SSR} · SR ${S.got.SR}`, W / 2, 40, 17, '#ffd56b', true);
            const cx = 190, cy = 170;
            E.card(ctx, cx - 60, cy - 70, 120, 140, '#f4f0e0', '#c0b8a0', 16);
            if (S.last) {
                const [, col] = GR.find(g => g[0] === S.last);
                ctx.fillStyle = col;
                U.rr(ctx, cx - 44, cy - 54, 88, 108, 10); ctx.fill();
                E.txt(ctx, S.last, cx, cy, 30, '#fff', true);
            } else U.emoji(ctx, '🥚', cx, cy, 60);
            E.txt(ctx, `目标：抽到 ${P.need} 张 SR 及以上`, W / 2, 270, 15, '#d8c8f0');
            E.btnBox(ctx, 100, H - 130, 180, 54, '🎲 抽一次', '#8a5a2f', '#5a3a1c');
            E.txt(ctx, S.msg, W / 2, H - 40, 15, '#f0d8e8');
        },
        tap(S, x, y, P, api) {
            if (!E.hit(x, y, 100, 470 - 130, 180, 54) || S.ticket <= 0) { if (S.ticket <= 0) S.msg = '没有扭蛋币了'; return; }
            S.ticket--;
            let r = Math.random() * 100, name = 'N';
            for (const [n, , w] of GR) { if (r < w) { name = n; break; } r -= w; }
            S.got[name]++; S.last = name;
            S.msg = `抽到了 ${name}！`;
            const good = S.got.SSR + S.got.SR;
            if (good >= P.need && P.need < 900) api.finish({ win: true, stars: 3, score: good, lines: [`抽到 ${good} 张 SR 及以上`] });
            if (!P.endless && S.ticket <= 0 && good < P.need) api.finish({ win: false, stars: 0, score: good, lines: [`币用尽，只有 ${good} 张`] });
        },
    });
})();
