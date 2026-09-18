// 答题 / 脑力 10 款：速算 · 色字干扰 · 比大小 · 找不同 · 成语填空 · 常识问答 · 数数 · 估算 · 读时钟 · 数列推理
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
    const pick = a => a[Math.floor(Math.random() * a.length)];

    // 通用「题干 + 4 选项」渲染
    function qRender(S, P, api, title, opts, extra) {
        return `<div class="mgq">
            <div class="mgq-h">${S.prog || ''}</div>
            <div class="mgq-t">${title}</div>
            ${extra || ''}
            <div class="mgq-o">${opts.map((o, i) => `<button class="mg-btn mgq-b" data-i="${i}">${o}</button>`).join('')}</div>
            <div class="mgq-i">${S.info || ''}</div>
        </div>`;
    }
    function qBind(root, S, P, api, onPick) {
        root.querySelectorAll('.mgq-b').forEach(b => { b.onclick = () => onPick(+b.dataset.i); });
    }
    // 通用判分结束
    function qEnd(S, P, api) {
        if (S.n >= S.need) {
            const rate = S.right / S.n;
            api.finish({
                win: rate >= 0.6,
                stars: rate >= 0.9 ? 3 : rate >= 0.75 ? 2 : rate >= 0.6 ? 1 : 0,
                score: S.right,
                lines: [`答对 ${S.right}/${S.n} 题`, `用时 ${((Date.now() - S.t0) / 1000).toFixed(1)} 秒`],
            });
        }
    }
    function qNew(S, need) { S.n = 0; S.right = 0; S.need = need; S.t0 = Date.now(); S.info = ''; S.prog = ''; }
    function qStep(S, P, api, ok) {
        S.n++; if (ok) S.right++;
        S.prog = `第 ${S.n}/${S.need} 题 · ✅${S.right}`;
        S.info = ok ? '✅ 答对了！' : '❌ 答错了';
        qEnd(S, P, api);
    }

    // ============ 1. 速算 ============
    E.defd('mathquiz', {
        levels: E.nm(),
        params: (i, t) => ({ need: 8 + i, ops: i < 6 ? '+-' : i < 13 ? '+-×' : '+-×÷' }),
        hint: '快速算出答案，答对越多星级越高',
        init(P) { const S = { ops: P.ops }; qNew(S, P.need); S.q = null; return S; },
        render(S, P, api) {
            if (!S.q || S.q.done) {
                const op = pick(P.ops.split(''));
                let a, b, v;
                if (op === '+') { a = ri(2, 90); b = ri(2, 90); v = a + b; }
                else if (op === '-') { a = ri(10, 99); b = ri(2, a - 1); v = a - b; }
                else if (op === '×') { a = ri(2, 12); b = ri(2, 9); v = a * b; }
                else { b = ri(2, 9); v = ri(2, 12); a = b * v; }
                const opts = new Set([v]);
                while (opts.size < 4) opts.add(Math.max(0, v + ri(-8, 8)));
                S.q = { text: `${a} ${op} ${b} = ?`, a: v, opts: MG.shuffle([...opts]), done: false };
            }
            return qRender(S, P, api, S.q.text, S.q.opts);
        },
        bind(root, S, P, api) {
            qBind(root, S, P, api, i => {
                const ok = S.q.opts[i] === S.q.a;
                S.q.done = true; S.q = null;
                if (!ok) S.info = `❌ 正确答案是 ${ok ? '' : ''}`;
                qStep(S, P, api, ok);
                api.update();
            });
        },
    });

    // ============ 2. 色字干扰（Stroop）============
    const STW = ['红', '蓝', '绿', '黄', '紫'], STC = ['#e03a4a', '#3a7fd0', '#3aa05a', '#e0b020', '#9a5ad0'];
    E.defd('stroop', {
        levels: E.nm(),
        params: (i, t) => ({ need: 8 + i, mode: i < 10 ? 0 : 1 }),
        hint: '选出「文字的颜色」（不是文字的意思），越快越好',
        init(P) { const S = {}; qNew(S, P.need); S.q = null; return S; },
        render(S, P, api) {
            if (!S.q || S.q.done) {
                const wi = ri(0, 4), ci = ri(0, 4);
                S.q = { w: wi, c: ci, done: false };
            }
            const word = STW[S.q.w], col = STC[S.q.c];
            const btns = STW.map((w, i) => `<button class="mg-btn mgq-b" data-i="${i}" style="color:${STC[i]}">${w}</button>`).join('');
            return `<div class="mgq">
                <div class="mgq-h">${S.prog || ''}</div>
                <div class="mgq-t">这个字是什么颜色？</div>
                <div style="font-size:52px;font-weight:bold;color:${col};text-shadow:0 2px 6px rgba(0,0,0,.5);margin:6px">${word}</div>
                <div style="font-size:12px;color:#b9b3d8">${P.mode ? '注意：要选字体颜色' : ''}</div>
                <div class="mgq-o">${btns}</div>
                <div class="mgq-i">${S.info || ''}</div>
            </div>`;
        },
        bind(root, S, P, api) {
            qBind(root, S, P, api, i => {
                const ok = i === S.q.c;
                S.q.done = true;
                qStep(S, P, api, ok);
                api.update();
            });
        },
    });

    // ============ 3. 比大小 ============
    E.defd('higherlower', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), range: 20 + i * 12 }),
        hint: '猜下一个数比当前大还是小，连对越多越好',
        init(P) { const S = {}; qNew(S, P.need); S.cur = ri(1, P.range); return S; },
        render(S, P, api) {
            return qRender(S, P, api, `当前：${S.cur}　下一个数是？`, ['⬆ 更大', '⬇ 更小'],
                `<div style="font-size:40px;font-weight:bold;color:#ffd56b">${S.cur}</div><div style="font-size:12px;color:#b9b3d8">范围 1 ~ ${P.range}</div>`);
        },
        bind(root, S, P, api) {
            qBind(root, S, P, api, i => {
                const nx = ri(1, P.range);
                const ok = nx === S.cur ? true : (i === 0 ? nx > S.cur : nx < S.cur);
                S.info = `开出了 ${nx}`;
                S.cur = nx;
                qStep(S, P, api, ok);
                api.update();
            });
        },
    });

    // ============ 4. 找不同 ============
    E.defd('oddone', {
        levels: E.nm(),
        params: (i, t) => ({ need: 8 + i, n: Math.min(9, 4 + Math.floor(i / 3)) }),
        hint: '下面有一只和其他不同，点它！',
        // 注意：S.cells 存格子数 —— 不能用 S.n！qNew() 会把 S.n 清零（S.n 是答题计数器），
        // 曾经导致找不同第一关网格为空、点什么都没反应
        init(P) { const S = {}; qNew(S, P.need); S.cells = P.n; return S; },
        render(S, P, api) {
            const base = pick(['🐶', '🐱', '🐭', '🐼', '🐸', '🍎', '⭐', '🌸', '🚗', '🎈']);
            const other = pick(['🐶', '🐱', '🐭', '🐼', '🐸', '🍎', '⭐', '🌸', '🚗', '🎈'].filter(x => x !== base));
            const idx = ri(0, S.cells - 1);
            S.ans = idx;
            let grid = '';
            for (let k = 0; k < S.cells; k++) grid += `<button class="mgq-g" data-i="${k}">${k === idx ? other : base}</button>`;
            return `<div class="mgq"><div class="mgq-h">${S.prog}</div><div class="mgq-t">找出不一样的那个</div>
                <div class="mgq-grid">${grid}</div><div class="mgq-i">${S.info || ''}</div></div>`;
        },
        bind(root, S, P, api) {
            root.querySelectorAll('.mgq-g').forEach(b => { b.onclick = () => { qStep(S, P, api, +b.dataset.i === S.ans); api.update(); }; });
        },
    });

    // ============ 5. 成语填空 ============
    const IDIOMS = ['一心一意', '三心二意', '四面八方', '五光十色', '七上八下', '九牛一毛', '千军万马', '万紫千红',
        '画蛇添足', '守株待兔', '亡羊补牢', '掩耳盗铃', '刻舟求剑', '井底之蛙', '狐假虎威', '画龙点睛',
        '名副其实', '不可思议', '别出心裁', '层出不穷', '大器晚成', '耳目一新', '废寝忘食', '锦上添花'];
    E.defd('idiom', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2) }),
        hint: '选出正确的字补全四字成语',
        init(P) { const S = {}; qNew(S, P.need); return S; },
        render(S, P, api) {
            const w = pick(IDIOMS), hi = ri(0, 3);
            const opts = new Set([w[hi]]);
            while (opts.size < 4) opts.add(pick(IDIOMS)[ri(0, 3)]);
            S.ans = w[hi];
            const shown = w.split('').map((c, k) => k === hi ? '?' : c).join('');
            return qRender(S, P, api, shown, MG.shuffle([...opts]),
                `<div style="font-size:36px;letter-spacing:10px;color:#ffd56b;font-weight:bold">${shown}</div>`);
        },
        bind(root, S, P, api) {
            qBind(root, S, P, api, i => {
                const btn = root.querySelectorAll('.mgq-b')[i];
                qStep(S, P, api, btn.textContent.trim() === S.ans);
                api.update();
            });
        },
    });

    // ============ 6. 常识问答 ============
    const TRIVIA = [
        ['中国的首都是？', ['北京', '上海', '广州', '深圳'], 0],
        ['一年有多少个季节？', ['2', '3', '4', '5'], 2],
        ['太阳从哪边升起？', ['东', '西', '南', '北'], 0],
        ['水的化学式是？', ['CO2', 'H2O', 'O2', 'NaCl'], 1],
        ['地球上最大的海洋是？', ['大西洋', '印度洋', '太平洋', '北冰洋'], 2],
        ['人体最大的器官是？', ['心脏', '肝脏', '皮肤', '肺'], 2],
        ['一周有几天？', ['5', '6', '7', '8'], 2],
        ['中国的国宝动物是？', ['熊猫', '老虎', '孔雀', '金丝猴'], 0],
        ['1 小时等于多少分钟？', ['30', '60', '90', '100'], 1],
        ['彩虹通常有几种颜色？', ['5', '6', '7', '8'], 2],
        ['哪种动物是两栖动物？', ['青蛙', '鲸鱼', '老鹰', '蛇'], 0],
        ['地球绕太阳一圈要多久？', ['一天', '一个月', '一年', '十年'], 2],
        ['电灯是谁发明的？', ['牛顿', '爱迪生', '爱因斯坦', '瓦特'], 1],
        ['中国的四大发明不包括？', ['造纸术', '指南针', '火药', '望远镜'], 3],
        ['哪种水果是黄色的？', ['苹果', '香蕉', '葡萄', '草莓'], 1],
        ['成年人通常有多少颗牙齿？', ['20', '24', '28-32', '40'], 2],
        ['奥运会几年举办一次？', ['2', '3', '4', '5'], 2],
        ['世界上最高的山峰是？', ['珠穆朗玛峰', '泰山', '黄山', '华山'], 0],
        ['人体正常体温约为？', ['30℃', '36.5℃', '40℃', '42℃'], 1],
        ['声音在空气中传播速度约？', ['340m/s', '3400m/s', '34m/s', '3.4m/s'], 0],
    ];
    E.defd('trivia', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2) }),
        hint: '常识问答，答对越多星级越高',
        init(P) { const S = { pool: MG.shuffle(TRIVIA.slice()) }; qNew(S, P.need); return S; },
        render(S, P, api) {
            const q = S.pool[S.n % S.pool.length];
            S.ans = q[2];
            return qRender(S, P, api, q[0], q[1]);
        },
        bind(root, S, P, api) {
            qBind(root, S, P, api, i => { qStep(S, P, api, i === S.ans); api.update(); });
        },
    });

    // ============ 7. 数数 ============
    E.defd('counting', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), n: 6 + i * 2 }),
        hint: '数一数屏幕上有多少个图形',
        // 同 oddone：S.cells 存图形上限，qNew() 会把 S.n 清零（答题计数器）
        init(P) { const S = {}; qNew(S, P.need); S.cells = P.n; return S; },
        render(S, P, api) {
            const ch = pick(['🔴', '⭐', '🍎', '🐟', '🌸', '💎']);
            const cnt = ri(4, Math.min(40, S.cells));
            S.ans = cnt;
            let s = '';
            for (let k = 0; k < cnt; k++) s += `<span style="font-size:20px">${ch}</span>`;
            const opts = new Set([cnt]);
            while (opts.size < 4) opts.add(Math.max(1, cnt + ri(-4, 4)));
            S.opts = MG.shuffle([...opts]);
            return qRender(S, P, api, '一共有多少个？', S.opts,
                `<div style="line-height:1.4;max-width:300px;margin:0 auto">${s}</div>`);
        },
        bind(root, S, P, api) {
            qBind(root, S, P, api, i => { qStep(S, P, api, S.opts[i] === S.ans); api.update(); });
        },
    });

    // ============ 8. 估算 ============
    E.defd('estimate', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), tol: Math.max(2, 10 - Math.floor(i / 2)) }),
        hint: '估算图中目标的数量，误差在允许范围内即算对',
        init(P) { const S = { tol: P.tol }; qNew(S, P.need); return S; },
        render(S, P, api) {
            const cnt = ri(12, 60);
            S.ans = cnt;
            let s = '';
            const ch = '•';
            for (let k = 0; k < cnt; k++) s += ch;
            const opts = new Set([cnt]);
            while (opts.size < 4) opts.add(Math.max(1, cnt + ri(-15, 15)));
            S.opts = MG.shuffle([...opts]);
            return qRender(S, P, api, `大约有多少个点？（误差 ±${S.tol} 算对）`, S.opts,
                `<div style="font-size:13px;line-height:1.1;word-break:break-all;max-width:300px;margin:0 auto;color:#ffd56b">${s}</div>`);
        },
        bind(root, S, P, api) {
            qBind(root, S, P, api, i => { qStep(S, P, api, Math.abs(S.opts[i] - S.ans) <= S.tol); api.update(); });
        },
    });

    // ============ 9. 读时钟 ============
    E.def('clockread', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), fine: i > 9 }),
        w: 360, h: 470,
        hint: '看时钟读出时间，点击正确选项',
        init(P) { const S = { need: P.need }; qNew(S, P.need); S.q = null; return S; },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2a2440', '#14102a');
            if (!S.q || S.q.done) {
                const h = ri(1, 12), m = P.fine ? pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]) : pick([0, 15, 30, 45]);
                const opts = new Set([`${h}:${String(m).padStart(2, '0')}`]);
                while (opts.size < 4) { const hh = ri(1, 12), mm = pick([0, 15, 30, 45]); opts.add(`${hh}:${String(mm).padStart(2, '0')}`); }
                S.q = { h, m, opts: MG.shuffle([...opts]), done: false };
            }
            const cx = 180, cy = 150, R = 96;
            ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.284);
            ctx.fillStyle = '#f4f0e0'; ctx.fill();
            ctx.strokeStyle = '#5a4a2a'; ctx.lineWidth = 5; ctx.stroke();
            for (let k = 1; k <= 12; k++) {
                const a = -Math.PI / 2 + k * Math.PI / 6;
                E.txt(ctx, k, cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20), 16, '#3a2a10', true);
            }
            const ha = -Math.PI / 2 + (S.q.h % 12 + S.q.m / 60) * Math.PI / 6;
            const ma = -Math.PI / 2 + S.q.m * Math.PI / 30;
            ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ha) * R * 0.5, cy + Math.sin(ha) * R * 0.5); ctx.stroke();
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ma) * R * 0.78, cy + Math.sin(ma) * R * 0.78); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 6.284); ctx.fillStyle = '#e03a4a'; ctx.fill();
            E.txt(ctx, `现在几点？ ${S.prog}`, W / 2, 280, 16, '#ffd56b', true);
            S.q.opts.forEach((o, k) => E.btnBox(ctx, 30 + (k % 2) * 160, 310 + Math.floor(k / 2) * 62, 140, 52, o, '#4a3f6a', '#2a2440'));
            E.txt(ctx, S.info || '', W / 2, H - 20, 14, '#d8c8f0');
        },
        tap(S, x, y, P, api) {
            for (let k = 0; k < 4; k++) {
                if (!E.hit(x, y, 30 + (k % 2) * 160, 310 + Math.floor(k / 2) * 62, 140, 52)) continue;
                const ok = S.q.opts[k] === `${S.q.h}:${String(S.q.m).padStart(2, '0')}`;
                S.q.done = true;
                qStep(S, P, api, ok);
                return;
            }
        },
    });

    // ============ 10. 数列推理 ============
    E.defd('sequence', {
        levels: E.nm(),
        params: (i, t) => ({ need: 6 + Math.floor(i / 2), hard: i > 9 }),
        hint: '找规律，选出数列的下一个数',
        init(P) { const S = { hard: P.hard }; qNew(S, P.need); return S; },
        render(S, P, api) {
            let seq, ans;
            const kind = S.hard ? ri(0, 3) : ri(0, 1);
            const a0 = ri(1, 9);
            if (kind === 0) { const d = ri(2, 9); seq = [a0, a0 + d, a0 + 2 * d, a0 + 3 * d]; ans = a0 + 4 * d; }
            else if (kind === 1) { const r = ri(2, 3); seq = [a0, a0 * r, a0 * r * r]; ans = a0 * r * r * r; }
            else if (kind === 2) { const d = ri(2, 6); seq = [a0, a0 + d, a0 + d + d + 1, a0 + d + d + 1 + d + 2]; ans = seq[3] + d + 3; }
            else { seq = [a0, a0 + 1, a0 + 3, a0 + 6]; ans = a0 + 10; }
            S.ans = ans;
            const opts = new Set([ans]);
            while (opts.size < 4) opts.add(ans + ri(-9, 9));
            S.opts = MG.shuffle([...opts]);
            return qRender(S, P, api, '下一个数是？', S.opts,
                `<div style="font-size:26px;color:#ffd56b;font-weight:bold">${seq.join(' , ')} , ?</div>`);
        },
        bind(root, S, P, api) {
            qBind(root, S, P, api, i => { qStep(S, P, api, S.opts[i] === S.ans); api.update(); });
        },
    });
})();
