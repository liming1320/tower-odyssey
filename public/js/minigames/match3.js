// 消消乐：8x8 棋盘，3+ 同色相连消除
window.MiniGames = window.MiniGames || {};
MiniGames.match3 = {
    start(container, opts) {
        const COLS = 8, ROWS = 8, COLORS = 5;
        const cellW = 50, cellH = 50;
        const COL = ['#ff5252','#ffd56b','#5cd65c','#5cc7ff','#b78bff'];
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS*cellW + 4, ROWS*cellH + 4);
        let board = [], sel = null, score = 0, busy = false, moves = 20;
        const init = () => {
            board = [];
            for (let i = 0; i < ROWS; i++) { const r = []; for (let j = 0; j < COLS; j++) r.push(MG.ri(0, COLORS-1)); board.push(r); }
        };
        const findMatches = () => {
            const match = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
            // 横
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS-2; j++) {
                if (board[i][j] >= 0 && board[i][j] === board[i][j+1] && board[i][j] === board[i][j+2]) {
                    match[i][j] = match[i][j+1] = match[i][j+2] = true;
                    let k = j+3; while (k < COLS && board[i][k] === board[i][j]) match[i][k++] = true;
                }
            }
            // 竖
            for (let j = 0; j < COLS; j++) for (let i = 0; i < ROWS-2; i++) {
                if (board[i][j] >= 0 && board[i][j] === board[i+1][j] && board[i][j] === board[i+2][j]) {
                    match[i][j] = match[i+1][j] = match[i+2][j] = true;
                    let k = i+3; while (k < ROWS && board[k][j] === board[i][j]) match[k++][j] = true;
                }
            }
            return match;
        };
        const collapse = async () => {
            busy = true;
            // 标记消除
            let match = findMatches();
            let total = 0;
            while (match.some(r => r.some(x => x))) {
                let cnt = 0;
                for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) if (match[i][j]) { board[i][j] = -1; cnt++; }
                score += cnt * 10;
                draw();
                await new Promise(r => setTimeout(r, 250));
                // 下落
                for (let j = 0; j < COLS; j++) {
                    let write = ROWS - 1;
                    for (let i = ROWS - 1; i >= 0; i--) if (board[i][j] >= 0) { board[write--][j] = board[i][j]; board[i][j] = -1; }
                    for (let i = write; i >= 0; i--) board[i][j] = MG.ri(0, COLORS-1);
                }
                draw();
                await new Promise(r => setTimeout(r, 150));
                match = findMatches();
            }
            busy = false;
            draw();
        };
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const v = board[i][j];
                const x = 2 + j*cellW, y = 2 + i*cellH;
                if (v < 0) continue;
                ctx.fillStyle = COL[v]; ctx.beginPath(); ctx.arc(x + cellW/2, y + cellH/2, 18, 0, Math.PI*2); ctx.fill();
                if (sel && sel[0]===i && sel[1]===j) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); }
            }
            opts.onScore && opts.onScore('分数：' + score + ' · 剩余步数：' + moves);
        };
        const onTap = async p => {
            if (busy || moves <= 0) return;
            const j = Math.floor(p.x / cellW), i = Math.floor(p.y / cellH);
            if (i<0||i>=ROWS||j<0||j>=COLS) return;
            if (!sel) { sel = [i, j]; }
            else if (sel[0]===i && sel[1]===j) { sel = null; }
            else {
                const di = Math.abs(sel[0]-i), dj = Math.abs(sel[1]-j);
                if (di+dj === 1) {
                    [board[sel[0]][sel[1]], board[i][j]] = [board[i][j], board[sel[0]][sel[1]]];
                    sel = null; moves--;
                    if (findMatches().some(r => r.some(x => x))) await collapse();
                    else { [board[sel[0]][sel[1]], board[i][j]] = [board[i][j], board[sel[0]][sel[1]]]; moves++; }
                } else { sel = [i, j]; }
            }
            draw();
        };
        init();
        MG.bind(c, onTap);
        draw();
        MG.hint(container, '点击两个相邻色块交换，3+ 相同颜色相连消除');
        return { stop() { destroy(); } };
    }
};
