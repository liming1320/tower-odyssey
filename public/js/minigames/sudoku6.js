// 数独 6x6（2x3 子宫格）：20 关挑战，挖洞数递增
window.MiniGames = window.MiniGames || {};
MiniGames.sudoku6 = {
    LEVELS: [
        // { name, desc, holes }
        { name: '入门', desc: '6×6 · 挖 12 空' },
        { name: '入门 II', desc: '6×6 · 挖 14 空' },
        { name: '初识', desc: '6×6 · 挖 16 空' },
        { name: '初识 II', desc: '6×6 · 挖 18 空' },
        { name: '熟练', desc: '6×6 · 挖 20 空' },
        { name: '熟练 II', desc: '6×6 · 挖 22 空' },
        { name: '稳健', desc: '6×6 · 挖 24 空' },
        { name: '稳健 II', desc: '6×6 · 挖 26 空' },
        { name: '进阶', desc: '6×6 · 挖 28 空' },
        { name: '进阶 II', desc: '6×6 · 挖 29 空' },
        { name: '挑战', desc: '6×6 · 挖 30 空' },
        { name: '挑战 II', desc: '6×6 · 挖 31 空' },
        { name: '高手', desc: '6×6 · 挖 32 空' },
        { name: '高手 II', desc: '6×6 · 挖 33 空' },
        { name: '精熟', desc: '6×6 · 挖 34 空' },
        { name: '精熟 II', desc: '6×6 · 挖 35 空 · 1 解' },
        { name: '宗匠', desc: '6×6 · 挖 35 空 · 1 解' },
        { name: '匠心', desc: '6×6 · 挖 35 空 · 1 解' },
        { name: '鬼手', desc: '6×6 · 挖 35 空 · 1 解' },
        { name: '数独王', desc: '6×6 · 挖 35 空 · 唯一解 · 终极' },
    ],
    PARAMS: [
        12, 14, 16, 18, 20, 22, 24, 26, 28, 29,
        30, 31, 32, 33, 34, 35, 35, 35, 35, 35,
    ],
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        // 框架 levelIdx 优先（fillLevels 会生成副本对象导致 indexOf 恒为 -1）
        const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? Math.min(idx, this.PARAMS.length - 1) : (opts.endless ? this.PARAMS.length - 1 : 0);
        const holes = this.PARAMS[pIdx] || 22;
        const N = 6, S = 56;
        const { c, ctx, w, h, destroy } = MG.canvas(container, N * S + 4, N * S + 4);
        const fullBoard = [
            [1, 2, 3, 4, 5, 6],
            [4, 5, 6, 1, 2, 3],
            [2, 3, 1, 5, 6, 4],
            [5, 6, 4, 2, 3, 1],
            [3, 1, 2, 6, 4, 5],
            [6, 4, 5, 3, 1, 2],
        ];
        const permute = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = MG.ri(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
        const make = () => {
            const a = fullBoard.map(r => r.slice());
            const rp = permute([0, 1, 2, 3, 4, 5]);
            const b = a.map((r, i) => r.map((_, j) => a[rp.indexOf(i)][j]));
            const cp = permute([0, 2, 1, 3, 5, 4]);
            return b.map(r => r.map((_, j) => r[cp.indexOf(j)]));
        };
        const sol = make();
        let board = sol.map(r => r.slice());
        const maskSet = new Set();
        while (maskSet.size < holes) maskSet.add(MG.ri(0, N * N - 1));
        const initial = board.map(r => r.slice());
        for (const k of maskSet) { const i = Math.floor(k / N), j = k % N; board[i][j] = 0; initial[i][j] = 0; }
        const draw = () => {
            MG.ui.board(ctx, w, h);
            // 2x3 子宫格交替底色（增强可读性）
            for (let bi = 0; bi < N; bi += 3) for (let bj = 0; bj < N; bj += 2) {
                if (((bi / 3) + (bj / 2)) % 2) {
                    MG.ui.rr(ctx, 3 + bj * S, 3 + bi * S, 2 * S - 2, 3 * S - 2, 8);
                    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
                }
            }
            // 细网格线
            ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
            for (let i = 0; i <= N; i++) {
                ctx.beginPath(); ctx.moveTo(2, 2 + i * S); ctx.lineTo(2 + N * S, 2 + i * S); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(2 + i * S, 2); ctx.lineTo(2 + i * S, 2 + N * S); ctx.stroke();
            }
            // 子宫格粗线
            ctx.strokeStyle = 'rgba(255,213,107,0.55)'; ctx.lineWidth = 2.5;
            for (let bi = 0; bi < N; bi += 3) for (let bj = 0; bj < N; bj += 2) {
                MG.ui.rr(ctx, 2 + bj * S, 2 + bi * S, 2 * S, 3 * S, 6); ctx.stroke();
            }
            // 数字：题面白 / 玩家填金
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                const v = board[i][j];
                if (!v) continue;
                ctx.fillStyle = initial[i][j] ? '#fff' : '#ffd56b';
                ctx.font = 'bold ' + (S * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(v, 2 + j * S + S / 2, 2 + i * S + S / 2 + 1);
            }
            // 计算空格数和已填数
            let filled = 0, total = 0;
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                if (!initial[i][j]) { total++; if (board[i][j]) filled++; }
            }
            opts.onScore && opts.onScore('已填 ' + filled + ' / ' + total + ' 空');
        };
        let sel = null; // 当前选中的空格 {i,j}
        // 选中高亮
        const drawSel = () => {
            if (sel) {
                ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3;
                MG.ui.rr(ctx, 3 + sel.j * S, 3 + sel.i * S, S - 2, S - 2, 6); ctx.stroke();
            }
        };
        // 数字键盘（替代 prompt，兼容移动端 / 嵌入场景）
        const pad = document.createElement('div');
        pad.className = 'mg-sudoku-pad';
        pad.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap';
        const checkWin = () => {
            for (let ii = 0; ii < N; ii++) for (let jj = 0; jj < N; jj++) {
                if (board[ii][jj] !== sol[ii][jj]) return;
            }
            opts.onComplete && opts.onComplete({ win: true, stars: 3, lines: ['全部填对！', lv.desc] });
        };
        const mkBtn = (label, val) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = 'min-width:44px;height:44px;border:none;border-radius:10px;background:#3a3f5a;color:#fff;font-size:18px;font-weight:bold;cursor:pointer';
            b.onclick = () => {
                if (!sel) return;
                board[sel.i][sel.j] = val; // val=0 表示擦除
                sel = null; render(); checkWin();
            };
            return b;
        };
        for (let n = 1; n <= 6; n++) pad.appendChild(mkBtn('' + n, n));
        pad.appendChild(mkBtn('✕', 0));
        container.appendChild(pad);
        const render = () => { draw(); drawSel(); };
        const onTap = p => {
            const j = Math.floor(p.x / S), i = Math.floor(p.y / S);
            if (i < 0 || i >= N || j < 0 || j >= N) return;
            if (initial[i][j]) { sel = null; render(); return; }
            sel = { i, j };
            render();
        };
        MG.bind(c, onTap); render();
        MG.hint(container, lv.desc + ' · 点击空格选中，再点下方数字填入 1-6（✕ 擦除）');
        return { stop() { pad.remove(); destroy(); } };
    }
};