// 记忆 / 观察 10 款：闪记数字 · 猩猩记忆 · 色彩记忆 · 记牌 · 记词 · 找隐藏 · 路径记忆 · 影子配对 · 缺什么 · 倒背数字
(function () {
    const E = MG.eng, U = MG.ui;
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const pick = a => a[Math.floor(Math.random() * a.length)];
    function qEnd(S, P, api) {
        if (S.n >= S.need) {
            const rate = S.right / S.n;
            api.finish({
                win: rate >= 0.6,
                stars: rate >= 0.9 ? 3 : rate >= 0.75 ? 2 : rate >= 0.6 ? 1 : 0,
                score: S.right, lines: [`答对 ${S.right}/${S.need} 题`],
            });
        }
    }
    function qStep(S, P, api, ok) { S.n++; if (ok) S.right++; S.info = ok ? '✅ 正确' : '❌ 错误'; S.prog = `第 ${S.n}/${S.need} 题 · ✅${S.right}`; qEnd(S, P, api); }
    function qNew(S, need) { S.n = 0; S.right = 0; S.need = need; S.info = ''; S.prog = `第 1/${need} 题`; return S; }
    const QH = (S, title, extra) => `<div class="mgq"><div class="mgq-h">${S.prog}</div><div class="mgq-t">${title}</div>${extra || ''}`;

    // ============ 1. 闪记数字 ============
    E.defd('flashnum', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), len: Math.min(9, 3 + Math.floor(i / 2)), ms: Math.max(700, 1800 - i * 60) }),
        hint: '数字会闪一下，记住后从选项中选出它',
        init(P) { const S = qNew({}, P.need); S.phase = 'show'; return S; },
        render(S, P, api) {
            if (S.phase === 'show') {
                if (!S.val) {
                    S.val = ''; for (let k = 0; k < P.len; k++) S.val += ri(0, 9);
                    const opts = new Set([S.val]);
                    while (opts.size < 4) { let v = ''; for (let k = 0; k < P.len; k++) v += ri(0, 9); opts.add(v); }
                    S.opts = MG.shuffle([...opts]);
                    setTimeout(() => { S.phase = 'pick'; api.update(); }, P.ms);
                }
                return QH(S, '记住这个数字', `<div style="font-size:44px;font-weight:bold;color:#ffd56b;letter-spacing:6px">${S.val}</div><div class="mgq-i">${P.ms} 毫秒后消失…</div></div>`);
            }
            return QH(S, '刚才的数字是？', `<div class="mgq-o">${S.opts.map((o, i) => `<button class="mg-btn mgq-b" data-i="${i}">${o}</button>`).join('')}</div><div class="mgq-i">${S.info || ''}</div></div>`);
        },
        bind(root, S, P, api) {
            root.querySelectorAll('.mgq-b').forEach(b => { b.onclick = () => { qStep(S, P, api, S.opts[+b.dataset.i] === S.val); S.phase = 'show'; S.val = null; api.update(); }; });
        },
    });

    // ============ 2. 猩猩记忆（位置）============
    E.def('chimp', {
        levels: E.nm(),
        params: (i, t) => ({ need: Math.min(9, 3 + Math.floor(i / 2)), ms: Math.max(600, 2000 - i * 70) }),
        w: 380, h: 480,
        hint: '记住数字的位置，消失后按从小到大依次点击',
        init: P => {
            const cells = [];
            const used = new Set();
            while (cells.length < P.need) { const k = ri(0, 24); if (!used.has(k)) { used.add(k); cells.push(k); } }
            return { cells, ms: P.ms, phase: 'show', t: 0, next: 1, lives: 3, info: '记住位置…' };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f4a3a', '#14241c');
            const C = 66, ox = (W - C * 5) / 2, oy = 90;
            for (let k = 0; k < 25; k++) {
                const x = ox + (k % 5) * C, y = oy + Math.floor(k / 5) * C;
                const idx = S.cells.indexOf(k);
                const shown = S.phase === 'show' || (S.done && S.done.includes(k));
                if (idx >= 0 && shown) {
                    E.card(ctx, x + 3, y + 3, C - 6, C - 6, '#ffd56b', '#e0a020', 8);
                    E.txt(ctx, idx + 1, x + C / 2, y + C / 2, 26, '#3a2a00', true);
                } else E.card(ctx, x + 3, y + 3, C - 6, C - 6, '#3a5a48', '#22402f', 8);
            }
            E.txt(ctx, S.info, W / 2, 40, 17, '#ffd56b', true);
            E.txt(ctx, `下一个：${S.next} · 命 ${S.lives}`, W / 2, H - 22, 15, '#cfe8d8');
        },
        tick(S, dt, P, api) {
            if (S.phase === 'show') {
                S.t += dt * 1000;
                if (S.t > S.ms) { S.phase = 'pick'; S.info = '按顺序点击！'; S.done = []; }
            }
        },
        tap(S, x, y, P, api) {
            if (S.phase !== 'pick') return;
            const C = 66, ox = (380 - C * 5) / 2, oy = 90;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i > 4 || j < 0 || j > 4) return;
            const k = i * 5 + j;
            if (S.cells[S.next - 1] === k) {
                S.done.push(k); S.next++;
                if (S.next > S.cells.length) api.finish({ win: true, stars: S.lives === 3 ? 3 : 2, score: S.cells.length, lines: [`记住了 ${S.cells.length} 个位置`] });
            } else {
                S.lives--; S.info = '❌ 点错了';
                if (S.lives <= 0) api.finish({ win: false, stars: 0, score: S.next - 1, lines: [`只记住 ${S.next - 1} 个`] });
                else { S.phase = 'show'; S.t = 0; S.next = 1; S.done = []; }
            }
        },
    });

    // ============ 3. 色彩记忆（Simon）============
    const SMC = ['#e03a4a', '#3a7fd0', '#3aa05a', '#e0b020'];
    E.def('simon', {
        levels: E.nm(),
        params: (i, t) => ({ need: 5 + Math.floor(i / 2), spd: Math.max(0.32, 0.75 - i * 0.02) }),
        endless: { need: 999, spd: 0.3 },
        w: 360, h: 480,
        hint: '看好闪烁顺序，然后照着点一遍（每轮加一个）',
        init: P => ({ seq: [], round: 0, phase: 'idle', t: 0, show: 0, inp: 0, need: P.need, spd: P.spd }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#262038', '#12101e');
            for (let k = 0; k < 4; k++) {
                const on = S.phase === 'show' && S.seq[S.show] === k;
                ctx.fillStyle = SMC[k];
                ctx.globalAlpha = on ? 1 : 0.55;
                U.rr(ctx, 40 + (k % 2) * 150, 90 + Math.floor(k / 2) * 150, 130, 130, 20); ctx.fill();
                ctx.globalAlpha = 1;
            }
            E.txt(ctx, P.endless ? `第 ${S.round} 轮` : `第 ${S.round}/${S.need} 轮`, W / 2, 40, 19, '#ffd56b', true);
            E.txt(ctx, S.phase === 'show' ? '看好顺序…' : S.phase === 'in' ? `请重复（${S.inp + 1}/${S.seq.length}）` : '点击任意色块开始', W / 2, H - 24, 15, '#c8c0e0');
        },
        tick(S, dt, P, api) {
            if (S.phase === 'show') {
                S.t += dt;
                if (S.t > S.spd) {
                    S.t = 0; S.show++;
                    if (S.show >= S.seq.length) { S.phase = 'in'; S.inp = 0; }
                }
            }
        },
        tap(S, x, y, P, api) {
            if (S.phase === 'idle') { S.round = 1; S.seq = [ri(0, 3)]; S.phase = 'show'; S.show = 0; S.t = 0; return; }
            if (S.phase !== 'in') return;
            for (let k = 0; k < 4; k++) {
                if (!E.hit(x, y, 40 + (k % 2) * 150, 90 + Math.floor(k / 2) * 150, 130, 130)) continue;
                if (S.seq[S.inp] === k) {
                    S.inp++;
                    if (S.inp >= S.seq.length) {
                        if (!P.endless && S.round >= S.need) return api.finish({ win: true, stars: 3, score: S.round, lines: [`完成 ${S.need} 轮`] });
                        S.round++; S.seq.push(ri(0, 3)); S.phase = 'show'; S.show = 0; S.t = 0;
                    }
                } else return api.finish({ win: false, stars: 0, score: S.round, lines: [`撑到第 ${S.round} 轮`] });
                return;
            }
        },
    });

    // ============ 4. 记牌 ============
    const CMC = ['♠', '♥', '♦', '♣'], CMR = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    E.defd('cardmem', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), cnt: Math.min(6, 1 + Math.floor(i / 4)), ms: Math.max(900, 2600 - i * 90) }),
        hint: '牌会亮一下，记住后选出出现过的那张',
        init(P) { const S = qNew({}, P.need); S.phase = 'show'; return S; },
        render(S, P, api) {
            if (S.phase === 'show') {
                if (!S.cards) {
                    S.cards = [];
                    for (let k = 0; k < P.cnt; k++) S.cards.push(pick(CMC) + pick(CMR));
                    const target = pick(S.cards);
                    const opts = new Set(S.cards);
                    while (opts.size < 4) opts.add(pick(CMC) + pick(CMR));
                    S.target = target; S.opts = MG.shuffle([...opts]);
                    setTimeout(() => { S.phase = 'pick'; api.update(); }, P.ms);
                }
                return QH(S, '记住这些牌',
                    `<div style="font-size:34px;letter-spacing:8px;color:#fff">${S.cards.join(' ')}</div><div class="mgq-i">${P.ms} 毫秒后消失…</div></div>`);
            }
            return QH(S, '哪一张出现过？',
                `<div class="mgq-o">${S.opts.map((o, i) => `<button class="mg-btn mgq-b" data-i="${i}" style="font-size:20px">${o}</button>`).join('')}</div><div class="mgq-i">${S.info || ''}</div></div>`);
        },
        bind(root, S, P, api) {
            root.querySelectorAll('.mgq-b').forEach(b => {
                b.onclick = () => {
                    qStep(S, P, api, S.cards.includes(S.opts[+b.dataset.i]));
                    S.phase = 'show'; S.cards = null; api.update();
                };
            });
        },
    });

    // ============ 5. 记词 ============
    const WORDS = ['苹果', '大象', '海洋', '火箭', '森林', '钢琴', '星星', '城堡', '河流', '沙漠', '彩虹', '月亮', '蝴蝶', '雪山', '灯塔', '草原', '瀑布', '贝壳', '风筝', '麦田'];
    E.defd('wordmem', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), cnt: Math.min(8, 2 + Math.floor(i / 3)), ms: Math.max(1000, 3000 - i * 100) }),
        hint: '词语会闪现，记住后选出出现过的那个',
        init(P) { const S = qNew({}, P.need); S.phase = 'show'; return S; },
        render(S, P, api) {
            if (S.phase === 'show') {
                if (!S.ws) {
                    S.ws = [];
                    const pool = MG.shuffle(WORDS.slice());
                    for (let k = 0; k < P.cnt; k++) S.ws.push(pool[k]);
                    const opts = new Set(S.ws);
                    while (opts.size < 4) opts.add(pick(WORDS));
                    S.opts = MG.shuffle([...opts]);
                    setTimeout(() => { S.phase = 'pick'; api.update(); }, P.ms);
                }
                return QH(S, '记住这些词',
                    `<div style="font-size:22px;color:#ffd56b;line-height:1.8">${S.ws.join('　')}</div><div class="mgq-i">${P.ms} 毫秒后消失…</div></div>`);
            }
            return QH(S, '哪个词出现过？',
                `<div class="mgq-o">${S.opts.map((o, i) => `<button class="mg-btn mgq-b" data-i="${i}">${o}</button>`).join('')}</div><div class="mgq-i">${S.info || ''}</div></div>`);
        },
        bind(root, S, P, api) {
            root.querySelectorAll('.mgq-b').forEach(b => {
                b.onclick = () => { qStep(S, P, api, S.ws.includes(S.opts[+b.dataset.i])); S.phase = 'show'; S.ws = null; api.update(); };
            });
        },
    });

    // ============ 6. 找隐藏 ============
    E.def('spot', {
        levels: E.nm(),
        params: (i, t) => ({ need: 5 + Math.floor(i / 3), n: Math.min(120, 24 + i * 6) }),
        w: 380, h: 500,
        hint: '在密密麻麻的图案里找出唯一不同的那个',
        init(P) {
            const base = pick(['🍎', '🐶', '⭐', '🌸', '🚗', '🎈', '🍀', '🐟']);
            const other = pick(['🍎', '🐶', '⭐', '🌸', '🚗', '🎈', '🍀', '🐟'].filter(x => x !== base));
            const idx = ri(0, P.n - 1);
            const pos = [];
            for (let k = 0; k < P.n; k++) pos.push({ x: ri(20, 360), y: ri(70, 470), s: ri(18, 30), ch: k === idx ? other : base });
            return { pos, idx, n: 0, need: P.need };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a3350', '#1a1730');
            S.pos.forEach(p => U.emoji(ctx, p.ch, p.x, p.y, p.s));
            E.txt(ctx, `第 ${S.n + 1}/${S.need} 关`, W / 2, 34, 17, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            const p = S.pos[S.idx];
            if (Math.abs(p.x - x) < p.s * 0.7 && Math.abs(p.y - y) < p.s * 0.7) {
                S.n++;
                if (S.n >= S.need) return api.finish({ win: true, stars: 3, score: S.need, lines: [`找出了 ${S.need} 个`] });
                const base = pick(['🍎', '🐶', '⭐', '🌸', '🚗', '🎈', '🍀', '🐟']);
                const other = pick(['🍎', '🐶', '⭐', '🌸', '🚗', '🎈', '🍀', '🐟'].filter(x => x !== base));
                const idx = ri(0, P.n - 1);
                S.pos = [];
                for (let k = 0; k < P.n; k++) S.pos.push({ x: ri(20, 360), y: ri(70, 470), s: ri(18, 30), ch: k === idx ? other : base });
                S.idx = idx;
            }
        },
    });

    // ============ 7. 路径记忆 ============
    E.def('pathmem', {
        levels: E.nm(),
        params: (i, t) => ({ need: 5 + Math.floor(i / 3), len: Math.min(9, 3 + Math.floor(i / 2)), spd: Math.max(0.35, 0.8 - i * 0.025) }),
        w: 380, h: 490,
        hint: '看好点亮的格子顺序，然后照着点一遍',
        init: P => {
            const seq = [];
            for (let k = 0; k < P.len; k++) seq.push(ri(0, 8));
            return { seq, phase: 'show', show: 0, t: 0, inp: 0, spd: P.spd };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2a3a52', '#141c2c');
            const C = 92, ox = (W - C * 3) / 2, oy = 100;
            for (let k = 0; k < 9; k++) {
                const x = ox + (k % 3) * C, y = oy + Math.floor(k / 3) * C;
                const on = S.phase === 'show' && S.seq[S.show] === k;
                E.card(ctx, x + 4, y + 4, C - 8, C - 8, on ? '#ffd56b' : '#3a4a6a', on ? '#e0a020' : '#22304a', 12);
            }
            E.txt(ctx, S.phase === 'show' ? `看好顺序（${S.show + 1}/${S.seq.length}）` : `请重复（${S.inp + 1}/${S.seq.length}）`, W / 2, 46, 18, '#ffd56b', true);
        },
        tick(S, dt, P, api) {
            if (S.phase !== 'show') return;
            S.t += dt;
            if (S.t > S.spd) { S.t = 0; S.show++; if (S.show >= S.seq.length) { S.phase = 'in'; S.inp = 0; } }
        },
        tap(S, x, y, P, api) {
            if (S.phase !== 'in') return;
            const C = 92, ox = (380 - C * 3) / 2, oy = 100;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i > 2 || j < 0 || j > 2) return;
            const k = i * 3 + j;
            if (S.seq[S.inp] === k) {
                S.inp++;
                if (S.inp >= S.seq.length) api.finish({ win: true, stars: 3, score: S.seq.length, lines: [`记住了 ${S.seq.length} 步路径`] });
            } else api.finish({ win: false, stars: 0, score: S.inp, lines: [`只记住 ${S.inp} 步`] });
        },
    });

    // ============ 8. 影子配对 ============
    E.defd('shadowmatch', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2) }),
        hint: '看剪影，选出对应的图案',
        init(P) { const S = qNew({}, P.need); return S; },
        render(S, P, api) {
            const set = ['🐶', '🐱', '🐘', '🐸', '🐧', '🦋', '🍎', '🌸', '🚗', '⚽', '🎸', '🏠', '🐟', '🌵', '🎈', '👑'];
            const ans = pick(set);
            const opts = new Set([ans]);
            while (opts.size < 4) opts.add(pick(set));
            S.ans = ans; S.opts = MG.shuffle([...opts]);
            return QH(S, '这个影子是谁？',
                `<div style="font-size:64px;filter:brightness(0) drop-shadow(0 3px 6px rgba(0,0,0,.6));opacity:.85">${ans}</div>
                 <div class="mgq-o">${S.opts.map((o, i) => `<button class="mg-btn mgq-b" data-i="${i}" style="font-size:26px">${o}</button>`).join('')}</div>
                 <div class="mgq-i">${S.info || ''}</div></div>`);
        },
        bind(root, S, P, api) {
            root.querySelectorAll('.mgq-b').forEach(b => { b.onclick = () => { qStep(S, P, api, S.opts[+b.dataset.i] === S.ans); api.update(); }; });
        },
    });

    // ============ 9. 缺什么 ============
    E.defd('whatmiss', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), cnt: Math.min(8, 3 + Math.floor(i / 3)), ms: Math.max(900, 2600 - i * 90) }),
        hint: '记住所有图案，然后选出被拿走的那个',
        init(P) { const S = qNew({}, P.need); S.phase = 'show'; return S; },
        render(S, P, api) {
            if (S.phase === 'show') {
                if (!S.items) {
                    const set = ['🐶', '🐱', '🐘', '🐸', '🐧', '🦋', '🍎', '🌸', '🚗', '⚽', '🎸', '🏠', '🐟', '🌵'];
                    const pool = MG.shuffle(set.slice());
                    S.items = pool.slice(0, P.cnt);
                    S.miss = pick(S.items);
                    const opts = new Set([S.miss]);
                    while (opts.size < 4) opts.add(pick(set));
                    S.opts = MG.shuffle([...opts]);
                    setTimeout(() => { S.phase = 'pick'; api.update(); }, P.ms);
                }
                return QH(S, '记住这些图案',
                    `<div style="font-size:34px;line-height:1.6">${S.items.join(' ')}</div><div class="mgq-i">${P.ms} 毫秒后消失…</div></div>`);
            }
            return QH(S, '哪一个不见了？',
                `<div style="font-size:34px;line-height:1.6">${S.items.filter(x => x !== S.miss).join(' ')}</div>
                 <div class="mgq-o">${S.opts.map((o, i) => `<button class="mg-btn mgq-b" data-i="${i}" style="font-size:26px">${o}</button>`).join('')}</div>
                 <div class="mgq-i">${S.info || ''}</div></div>`);
        },
        bind(root, S, P, api) {
            root.querySelectorAll('.mgq-b').forEach(b => {
                b.onclick = () => { qStep(S, P, api, S.opts[+b.dataset.i] === S.miss); S.phase = 'show'; S.items = null; api.update(); };
            });
        },
    });

    // ============ 10. 倒背数字 ============
    E.defd('reversenum', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), len: Math.min(7, 2 + Math.floor(i / 3)) }),
        hint: '把数字倒过来背，选出倒序后的结果',
        init(P) { const S = qNew({}, P.need); S.phase = 'show'; return S; },
        render(S, P, api) {
            if (!S.val) {
                S.val = ''; for (let k = 0; k < P.len; k++) S.val += ri(1, 9);
                const rev = S.val.split('').reverse().join('');
                const opts = new Set([rev]);
                while (opts.size < 4) { let v = ''; for (let k = 0; k < P.len; k++) v += ri(1, 9); opts.add(v); }
                S.opts = MG.shuffle([...opts]); S.rev = rev;
            }
            return QH(S, '倒过来是？',
                `<div style="font-size:40px;font-weight:bold;color:#ffd56b;letter-spacing:6px">${S.val}</div>
                 <div class="mgq-o">${S.opts.map((o, i) => `<button class="mg-btn mgq-b" data-i="${i}">${o}</button>`).join('')}</div>
                 <div class="mgq-i">${S.info || ''}</div></div>`);
        },
        bind(root, S, P, api) {
            root.querySelectorAll('.mgq-b').forEach(b => {
                b.onclick = () => { qStep(S, P, api, S.opts[+b.dataset.i] === S.rev); S.val = null; api.update(); };
            });
        },
    });
})();
