// 扫雷：20 关挑战，棋盘尺寸/雷数递增
window.MiniGames = window.MiniGames || {};
MiniGames.mine = {
    LEVELS: [
        // { name, desc, rows, cols, mines }
        { name: '入门', desc: '5×5 · 4 雷' },
        { name: '入门 II', desc: '6×6 · 5 雷' },
        { name: '基础', desc: '6×6 · 8 雷' },
        { name: '基础 II', desc: '7×7 · 9 雷' },
        { name: '练习', desc: '7×7 · 12 雷' },
        { name: '练习 II', desc: '8×8 · 12 雷' },
        { name: '经典', desc: '9×9 · 10 雷' },
        { name: '经典 II', desc: '9×9 · 14 雷' },
        { name: '进阶', desc: '10×10 · 16 雷' },
        { name: '进阶 II', desc: '10×10 · 20 雷' },
        { name: '进阶 III', desc: '10×10 · 25 雷' },
        { name: '高阶', desc: '12×12 · 25 雷' },
        { name: '高阶 II', desc: '12×12 · 30 雷' },
        { name: '高手', desc: '12×14 · 30 雷' },
        { name: '高手 II', desc: '14×14 · 35 雷' },
        { name: '硬核', desc: '14×14 · 45 雷' },
        { name: '硬核 II', desc: '14×16 · 50 雷' },
        { name: '大师', desc: '16×16 · 50 雷' },
        { name: '大师 II', desc: '16×16 · 60 雷' },
        { name: '扫雷王', desc: '16×16 · 70 雷 · 终极' },
    ],
    PARAMS: [
        [5, 5, 4], [6, 6, 5], [6, 6, 8], [7, 7, 9], [7, 7, 12],
        [8, 8, 12], [9, 9, 10], [9, 9, 14], [10, 10, 16], [10, 10, 20],
        [10, 10, 25], [12, 12, 25], [12, 12, 30], [12, 14, 30],
        [14, 14, 35], [14, 14, 45], [14, 16, 50], [16, 16, 50],
        [16, 16, 60], [16, 16, 70],
    ],
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        // 框架 levelIdx 优先（fillLevels 会生成副本对象导致 indexOf 恒为 -1）
        const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? Math.min(idx, this.PARAMS.length - 1) : (opts.endless ? this.PARAMS.length - 1 : 0);
        const [ROWS, COLS, MINES] = this.PARAMS[pIdx] || this.PARAMS[0];
        const maxW = Math.min(container.clientWidth - 16, 480);
        const maxH = Math.min(window.innerHeight - 200, 560);
        const S = Math.max(18, Math.floor(Math.min(maxW / COLS, maxH / ROWS, 44)));
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS * S + 4, ROWS * S + 4);
        let board = [], revealed = [], flagged = [], over = false, win = false;
        const init = () => {
            board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
            revealed = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
            flagged = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
            let placed = 0;
            while (placed < MINES) {
                const x = MG.ri(0, COLS - 1), y = MG.ri(0, ROWS - 1);
                if (board[y][x] !== -1) { board[y][x] = -1; placed++; }
            }
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                if (board[i][j] === -1) continue;
                let n = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    if (!dy && !dx) continue;
                    const ni = i + dy, nj = j + dx;
                    if (ni >= 0 && ni < ROWS && nj >= 0 && nj < COLS && board[ni][nj] === -1) n++;
                }
                board[i][j] = n;
            }
        };
        const flood = (i, j) => {
            if (i < 0 || i >= ROWS || j < 0 || j >= COLS || revealed[i][j] || flagged[i][j]) return;
            revealed[i][j] = true;
            if (board[i][j] === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dy || dx) flood(i + dy, j + dx);
        };
        const checkWin = () => {
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                if (board[i][j] !== -1 && !revealed[i][j]) return false;
            }
            return true;
        };
        const draw = () => {
            MG.ui.board(ctx, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const x = 2 + j * S, y = 2 + i * S;
                if (revealed[i][j]) {
                    MG.ui.rr(ctx, x + 1, y + 1, S - 3, S - 3, 5);
                    ctx.fillStyle = '#2e2a48'; ctx.fill();
                    if (board[i][j] === -1) { MG.ui.emoji(ctx, '💣', x + S / 2, y + S / 2, S * 0.62); }
                    else if (board[i][j] > 0) {
                        ctx.fillStyle = ['#5cc7ff', '#5cd65c', '#ff5252', '#b78bff', '#ff9d5c', '#5cc7ff', '#888', '#888'][board[i][j] - 1];
                        ctx.font = 'bold ' + (S * 0.52) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(board[i][j], x + S / 2, y + S / 2 + 1);
                    }
                } else {
                    // 未翻格：紫色渐变凸起按钮
                    MG.ui.tile(ctx, x, y, S, '#7a68b0', '#52427e', '#3a2f5c', 6);
                    if (flagged[i][j]) MG.ui.emoji(ctx, '🚩', x + S / 2, y + S / 2 - 1, S * 0.55);
                }
            }
        };
        const onTap = p => {
            if (over) return;
            const j = Math.floor(p.x / S), i = Math.floor(p.y / S);
            if (i < 0 || i >= ROWS || j < 0 || j >= COLS) return;
            if (p.longTap || p.shift) {
                flagged[i][j] = !flagged[i][j];
            } else {
                if (flagged[i][j]) return;
                if (board[i][j] === -1) {
                    over = true; for (let ii = 0; ii < ROWS; ii++) for (let jj = 0; jj < COLS; jj++) if (board[ii][jj] === -1) revealed[ii][jj] = true;
                    draw();
                    opts.onComplete && opts.onComplete({ win: false, stars: 0, lines: ['💥 踩雷！', lv.desc] });
                    return;
                }
                flood(i, j);
                if (checkWin()) { win = true; over = true; draw(); opts.onComplete && opts.onComplete({ win: true, stars: 3, lines: ['🏆 全部排雷！', lv.desc] }); return; }
            }
            draw();
        };
        c.addEventListener('contextmenu', e => { e.preventDefault(); onTap({ x: 0, y: 0, longTap: true }); });
        let pressT = 0, pressX = 0, pressY = 0;
        c.addEventListener('touchstart', e => { const t = e.touches[0]; pressT = Date.now(); pressX = t.clientX; pressY = t.clientY; });
        c.addEventListener('touchend', e => { const t = e.changedTouches[0]; const dt = Date.now() - pressT; if (dt > 500) { const r = c.getBoundingClientRect(); onTap({ x: (pressX - r.left) * (c.width / r.width), y: (pressY - r.top) * (c.height / r.height), longTap: true }); } });
        MG.bind(c, onTap);
        init(); draw();
        MG.hint(container, lv.desc + ' · 点击翻开，长按标记雷');
        return { stop() { destroy(); } };
    }
};