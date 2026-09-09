// 数字华容道：20 关挑战，尺寸/打乱步数递增
window.MiniGames = window.MiniGames || {};
MiniGames.slide15 = {
    LEVELS: [
        // { name, desc, rows, cols, shuffle }
        { name: '三阶', desc: '3×3 · 打乱 30 步' },
        { name: '三阶 II', desc: '3×3 · 打乱 60 步' },
        { name: '三阶 III', desc: '3×3 · 打乱 100 步' },
        { name: '宽三阶', desc: '3×4 · 打乱 80 步' },
        { name: '宽三阶 II', desc: '3×4 · 打乱 120 步' },
        { name: '宽三阶 III', desc: '3×4 · 打乱 160 步' },
        { name: '经典', desc: '4×4 · 打乱 100 步' },
        { name: '经典 II', desc: '4×4 · 打乱 150 步' },
        { name: '经典 III', desc: '4×4 · 打乱 200 步' },
        { name: '四阶', desc: '4×4 · 打乱 250 步' },
        { name: '四阶 II', desc: '4×4 · 打乱 300 步' },
        { name: '四阶 III', desc: '4×4 · 打乱 350 步' },
        { name: '五阶', desc: '5×5 · 打乱 200 步' },
        { name: '五阶 II', desc: '5×5 · 打乱 280 步' },
        { name: '五阶 III', desc: '5×5 · 打乱 360 步' },
        { name: '六阶', desc: '5×5 · 打乱 450 步' },
        { name: '六阶 II', desc: '5×5 · 打乱 550 步' },
        { name: '六阶 III', desc: '5×5 · 打乱 650 步' },
        { name: '宗匠', desc: '5×5 · 打乱 800 步' },
        { name: '华容道王', desc: '5×5 · 打乱 1000 步' },
    ],
    PARAMS: [
        [3, 3, 30], [3, 3, 60], [3, 3, 100],
        [3, 4, 80], [3, 4, 120], [3, 4, 160],
        [4, 4, 100], [4, 4, 150], [4, 4, 200],
        [4, 4, 250], [4, 4, 300], [4, 4, 350],
        [5, 5, 200], [5, 5, 280], [5, 5, 360],
        [5, 5, 450], [5, 5, 550], [5, 5, 650],
        [5, 5, 800], [5, 5, 1000],
    ],
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? idx : (opts.endless ? this.PARAMS.length - 1 : 0);
        const [ROWS, COLS, shuffles] = this.PARAMS[pIdx] || this.PARAMS[0];
        const maxW = Math.min(container.clientWidth - 16, 460);
        const S = Math.floor(Math.min(maxW / COLS, 80));
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS * S + 4, ROWS * S + 4);
        let board = [], moves = 0, won = false;
        const init = () => {
            const arr = []; for (let i = 1; i < ROWS * COLS; i++) arr.push(i); arr.push(0);
            let bi = ROWS - 1, bj = COLS - 1;
            for (let k = 0; k < shuffles; k++) {
                const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                MG.shuffle(dirs);
                for (const [di, dj] of dirs) {
                    const ni = bi + di, nj = bj + dj;
                    if (ni >= 0 && ni < ROWS && nj >= 0 && nj < COLS) {
                        [arr[bi * COLS + bj], arr[ni * COLS + nj]] = [arr[ni * COLS + nj], arr[bi * COLS + bj]];
                        bi = ni; bj = nj; break;
                    }
                }
            }
            board = [];
            for (let i = 0; i < ROWS; i++) board.push(arr.slice(i * COLS, (i + 1) * COLS));
        };
        const isWin = () => {
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const v = i * COLS + j + 1;
                if (v < ROWS * COLS && board[i][j] !== v) return false;
            }
            return board[ROWS - 1][COLS - 1] === 0;
        };
        const draw = () => {
            MG.ui.board(ctx, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const v = board[i][j];
                const x = 2 + j * S, y = 2 + i * S;
                if (v === 0) {   // 空格提示
                    MG.ui.rr(ctx, x + 4, y + 4, S - 8, S - 8, 10);
                    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
                    continue;
                }
                const correct = (i * COLS + j + 1) === v;
                // 就位的块用金色渐变奖励视觉，未就位用蓝
                MG.ui.tile(ctx, x, y, S, correct ? '#ffe896' : '#7aa0ff', correct ? '#d0a020' : '#3a5ac0', correct ? '#8f6a10' : '#24408e', 10);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold ' + (S * 0.38) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(v, x + S / 2, y + S / 2 + 1);
            }
            opts.onScore && opts.onScore('步数：' + moves);
        };
        const onTap = p => {
            if (won) return;
            const j = Math.floor(p.x / S), i = Math.floor(p.y / S);
            if (i < 0 || i >= ROWS || j < 0 || j >= COLS) return;
            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            for (const [di, dj] of dirs) {
                const ni = i + di, nj2 = j + dj;
                if (ni >= 0 && ni < ROWS && nj2 >= 0 && nj2 < COLS && board[ni][nj2] === 0) {
                    board[ni][nj2] = board[i][j]; board[i][j] = 0; moves++;
                    draw();
                    if (isWin()) {
                        won = true;
                        const stars = moves <= ROWS * COLS * 6 ? 3 : moves <= ROWS * COLS * 10 ? 2 : 1;
                        opts.onComplete && opts.onComplete({
                            win: true, stars,
                            lines: ['用 ' + moves + ' 步完成', lv.desc],
                        });
                    }
                    return;
                }
            }
        };
        init(); MG.bind(c, onTap); draw();
        MG.hint(container, lv.desc + ' · 点击数字旁的空格滑入，1→N 排序即胜');
        return { stop() { destroy(); } };
    }
};