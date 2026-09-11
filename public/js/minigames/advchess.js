// 冒险棋（单线掷骰冒险棋盘）
// 玩法：掷骰子，点数走几步；踩到文字格触发效果——前进 N 格 / 后退 N 格 / 停一轮 /
//   退回起点 / 再掷一次。一路单线，谁最先到达终点获胜。
// 支持 1~4 人本地同屏，空位由 AI（自动掷骰）接管。
// 注：这类棋当年国内玩具厂做了大量动漫主题盗版棋盘（数码宝贝 / 宠物小精灵 /
//   奥特曼 / 哆啦 A 梦），外观各异但规则完全一致，这里还原的正是这套通用规则。
window.MiniGames = window.MiniGames || {};
(function () {
    const E = MG.eng;
    const COLORS = ['#e8483c', '#f2c230', '#3a7fd5', '#3fae62'];
    const NAMES = ['红', '黄', '蓝', '绿'];
    const PIPS = {
        1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
        4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
        6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
    };
    const SKIN = {
        start: { c: '#3f6ea8', t: '起' }, goal: { c: '#c9a227', t: '终' },
        fwd: { c: '#2f7d51', t: '' }, back: { c: '#a8382f', t: '' },
        stop: { c: '#b06f14', t: '停' }, tostart: { c: '#6d2626', t: '返' },
        again: { c: '#2c5f96', t: '再' }, blank: { c: '#39415e', t: '' },
    };

    function lcg(seed) {
        let s = (seed >>> 0) || 1;
        return () => { s = (s * 1103515245 + 12345) >>> 0; return (s >>> 16) / 65536; };
    }
    // 生成单线棋盘：首尾固定为起点/终点，中间按「危险度」撒文字格
    function genCells(n, seed, danger) {
        const r = lcg(seed);
        const cells = [{ t: 'start' }];
        for (let i = 1; i < n - 1; i++) {
            const x = r();
            if (x < 0.10 + danger * 0.10) cells.push({ t: 'back', v: 1 + Math.floor(r() * 5) });
            else if (x < 0.20 + danger * 0.20) cells.push({ t: 'fwd', v: 1 + Math.floor(r() * 4) });
            else if (x < 0.26 + danger * 0.12) cells.push({ t: 'stop' });
            else if (x < 0.28 + danger * 0.06) cells.push({ t: 'tostart' });
            else if (x < 0.32 + danger * 0.04) cells.push({ t: 'again' });
            else cells.push({ t: 'blank' });
        }
        cells.push({ t: 'goal' });
        return cells;
    }
    function labelOf(c) {
        if (c.t === 'fwd') return '前' + c.v;
        if (c.t === 'back') return '退' + c.v;
        return SKIN[c.t] ? SKIN[c.t].t : '';
    }
    // 蛇形排布：偶数行左→右，奇数行右→左
    function cellRect(i, g) {
        const row = Math.floor(i / g.cols);
        let col = i % g.cols;
        if (row % 2 === 1) col = g.cols - 1 - col;
        return { x: g.pad + col * g.cw, y: g.y0 + row * g.ch, w: g.cw, h: g.ch };
    }

    E.def('advchess', {
        w: 400, h: 520,
        levels: E.nm(),
        hint: '点击掷骰 → 按点数前进 · 踩到「前3/退5/停/返」会触发效果 · 最先到终点者胜',
        params(i, t) {
            return {
                n: 20 + Math.round(t * 28),                 // 格子数 20 → 48
                danger: Math.min(1, 0.15 + t * 0.85),       // 特殊格密度
            };
        },
        desc(i, t, p) { return `${p.n} 格 · 机关密度 ${Math.round(p.danger * 100)}%`; },
        init(P) {
            const n = P.n || 20;
            return {
                cells: genCells(n, 1234 + (P.n || 20) * 977, P.danger || 0.3),
                n, pos: [0, 0, 0, 0], skip: [0, 0, 0, 0],
                turn: 0, humans: 1, dice: 0, rolling: false, busy: false,
                winner: -1, msg: '点击掷骰开始', rnd: null, flash: -1,
            };
        },
        draw(ctx, S, P, W, H, api) {
            if (!S.rnd) S.rnd = api.rng(777);
            const G = MG.gfx;
            const cols = S.n <= 24 ? 6 : 8;
            const rows = Math.ceil(S.n / cols);
            const pad = 14;
            const cw = (W - pad * 2) / cols;
            const ch = Math.min(46, 336 / rows);
            // 棋盘在可用区里垂直居中，格子少时不会吊在顶上留出大片空白
            const y0 = 52 + Math.max(0, (330 - rows * ch) / 2);
            const g = { cols, rows, pad, y0, cw, ch };
            S._geo = g;
            G.scene(ctx, W, H, '#1b2340', '#080b18');

            // 顶栏
            G.panel(ctx, 8, 8, W - 16, 38, '#2b3550', '#141a2c', 10);
            G.text(ctx, S.winner >= 0 ? `🏆 ${NAMES[S.winner]}方抵达终点！`
                : `当前：${NAMES[S.turn]}方${S.turn < S.humans ? '（你）' : '（AI）'}`,
                W / 2, 27, 14, S.winner >= 0 ? '#ffd56b' : '#fff', { bold: true });
            for (let p = 0; p < 4; p++) {
                const x = W - 152 + p * 36;
                ctx.beginPath(); ctx.arc(x, 27, 9, 0, Math.PI * 2);
                ctx.fillStyle = COLORS[p]; ctx.fill();
                ctx.strokeStyle = p === S.turn ? '#fff' : 'rgba(0,0,0,.4)';
                ctx.lineWidth = p === S.turn ? 2.5 : 1; ctx.stroke();
                G.text(ctx, String(S.pos[p] + 1), x, 27, 10.5, '#fff', { bold: true });
            }

            // 格子
            for (let i = 0; i < S.n; i++) {
                const c = S.cells[i], r = cellRect(i, g);
                const skin = SKIN[c.t] || SKIN.blank;
                const hot = i === S.flash;
                G.panel(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2,
                    MG.gfx.lighten(skin.c, hot ? .5 : .12), MG.gfx.darken(skin.c, .45), 7);
                G.text(ctx, String(i + 1), r.x + 11, r.y + 12, 9, 'rgba(255,255,255,.55)');
                const lb = labelOf(c);
                if (lb) G.text(ctx, lb, r.x + r.w / 2, r.y + r.h / 2 + (c.t === 'start' || c.t === 'goal' ? 0 : 3),
                    c.t === 'start' || c.t === 'goal' ? 16 : 13, '#fff', { bold: true });
                if (c.t === 'goal') G.text(ctx, '🏁', r.x + r.w / 2, r.y + r.h - 11, 9, '#ffe9a8');
            }
            // 棋子
            const stack = {};
            for (let p = 0; p < 4; p++) {
                const r = cellRect(S.pos[p], g);
                const key = S.pos[p];
                const k = stack[key] = (stack[key] || 0) + 1;
                const cx = r.x + r.w / 2 + (k - 1) * 9 - 4;
                const cy = r.y + r.h - 11;
                ctx.beginPath(); ctx.arc(cx, cy + 1, 6.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fill();
                const grd = ctx.createLinearGradient(cx - 6, cy - 6, cx + 6, cy + 6);
                grd.addColorStop(0, MG.gfx.lighten(COLORS[p], .5)); grd.addColorStop(1, COLORS[p]);
                ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
            }
            // 底部
            const by = 392;
            G.panel(ctx, 8, by, W - 16, H - by - 8, '#222c46', '#0d1220', 12);
            drawDice(ctx, 40, by + 30, 26, S.dice, S.rolling);
            G.text(ctx, S.msg, 82, by + 26, 12.5, '#dce6f7');
            G.text(ctx, `第 ${S.pos[S.turn] + 1}/${S.n} 格`, 82, by + 45, 11, '#8fa2c4');
            if (S.winner < 0 && !S.busy) {
                const bw = 108, bx = W / 2 - bw / 2, bty = by + 56;
                E.btnBox(ctx, bx, bty, bw, 30, S.rolling ? '掷骰中…' : '掷 骰', '#ff9d5c', '#b04818');
                S._btn = { x: bx, y: bty, w: bw, h: 30 };
            } else S._btn = null;
            G.text(ctx, `👥 本地 ${S.humans} 人（点此切换）`, W / 2, by + 100, 11, '#8fa2c4');
            S._ppl = { x: W / 2 - 70, y: by + 88, w: 140, h: 22 };
        },
        tap(S, x, y, P, api) {
            if (S.winner >= 0 || S.busy || S.rolling) return;
            if (S._ppl && E.hit(x, y, S._ppl.x, S._ppl.y, S._ppl.w, S._ppl.h)) {
                S.humans = S.humans >= 4 ? 1 : S.humans + 1;
                S.msg = `本地 ${S.humans} 人，其余由 AI 接管`;
                return;
            }
            if (S.turn >= S.humans) return;
            const b = S._btn;
            if (!b || E.hit(x, y, b.x, b.y, b.w, b.h)) roll(S, P, api);
        },
        score(S) { return S.pos[0] * 10; },
        check(S) {
            if (S.winner === 0) return { win: true, stars: 3, score: 1000 + S.pos[0] * 10, lines: ['率先抵达终点！'] };
            if (S.winner > 0) return { win: false, stars: 0, score: S.pos[0] * 10, lines: [NAMES[S.winner] + '方先到了'] };
            return null;
        },
    });

    // ---------------- 回合流程 ----------------
    function roll(S, P, api) {
        if (S.busy || S.rolling || S.winner >= 0) return;
        S.rolling = true; S.dice = 0; S.msg = '掷骰中…';
        api.later(() => {
            S.dice = 1 + Math.floor((S.rnd ? S.rnd() : Math.random()) * 6);
            S.rolling = false; S.busy = true;
            S.msg = `${NAMES[S.turn]}方掷出 ${S.dice}`;
            walk(S, P, api, S.dice);
        }, 400);
    }
    // 逐格移动（有动画），走完再结算落点效果
    function walk(S, P, api, left) {
        const p = S.turn, last = S.n - 1;
        if (left <= 0) return resolve(S, P, api);
        let nx = S.pos[p] + 1;
        if (nx > last) nx = last - (nx - last);           // 过头往回弹
        S.pos[p] = nx; S.flash = nx;
        if (nx >= last) { S.busy = false; S.winner = p; S.msg = `${NAMES[p]}方抵达终点！`; return; }
        api.later(() => walk(S, P, api, left - 1), 130);
    }
    function resolve(S, P, api) {
        const p = S.turn, c = S.cells[S.pos[p]];
        const again = () => { S.busy = false; if (p >= S.humans) api.later(() => roll(S, P, api), 600); };
        const next = () => { S.busy = false; nextTurn(S, P, api); };
        if (c.t === 'goal') { S.busy = false; S.winner = p; return; }
        if (c.t === 'fwd') {
            const to = Math.min(S.n - 1, S.pos[p] + c.v);
            S.pos[p] = to; S.msg = `前进 ${c.v} 格！`;
            if (to >= S.n - 1) { S.busy = false; S.winner = p; return; }
            return api.later(() => resolve(S, P, api), 260);
        }
        if (c.t === 'back') {
            S.pos[p] = Math.max(0, S.pos[p] - c.v);
            S.msg = `后退 ${c.v} 格…`;
            return next();
        }
        if (c.t === 'stop') { S.skip[p] = 1; S.msg = '停一轮！'; return next(); }
        if (c.t === 'tostart') { S.pos[p] = 0; S.msg = '退回起点…'; return next(); }
        if (c.t === 'again') { S.msg = '再掷一次！'; return again(); }
        next();
    }
    function nextTurn(S, P, api) {
        if (S.winner >= 0) return;
        for (let guard = 0; guard < 8; guard++) {
            S.turn = (S.turn + 1) % 4;
            if (S.skip[S.turn]) { S.skip[S.turn] = 0; S.msg = `${NAMES[S.turn]}方停一轮，跳过`; continue; }
            break;
        }
        S.dice = 0;
        if (S.turn >= S.humans) {
            S.msg = `${NAMES[S.turn]}方（AI）回合…`;
            api.later(() => { if (S.winner < 0) roll(S, P, api); }, 520);
        } else S.msg = `轮到 ${NAMES[S.turn]}方，点击掷骰`;
    }

    function drawDice(ctx, x, y, s, v, rolling) {
        ctx.save();
        ctx.translate(x, y);
        if (rolling) ctx.rotate((Date.now() % 360) * Math.PI / 180 * 0.4);
        MG.gfx.panel(ctx, -s / 2, -s / 2, s, s, '#fff', '#c9cfdb', 7);
        if (v >= 1 && v <= 6) {
            const step = s * 0.28, r = s * 0.075;
            ctx.fillStyle = '#22304a';
            for (const [px, py] of PIPS[v]) {
                ctx.beginPath();
                ctx.arc(-step + px * step, -step + py * step, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
})();
