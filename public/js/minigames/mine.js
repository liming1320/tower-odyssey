// 扫雷：9x9 共 10 雷
window.MiniGames = window.MiniGames || {};
MiniGames.mine = {
    start(container, opts) {
        const COLS = 9, ROWS = 9, MINES = 10, S = 44;
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS*S + 4, ROWS*S + 4);
        let board = [], revealed = [], flagged = [], over = false, win = false;
        const init = () => {
            board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
            revealed = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
            flagged = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
            let placed = 0;
            while (placed < MINES) {
                const x = MG.ri(0, COLS-1), y = MG.ri(0, ROWS-1);
                if (board[y][x] !== -1) { board[y][x] = -1; placed++; }
            }
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                if (board[i][j] === -1) continue;
                let n = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    if (!dy && !dx) continue;
                    const ni = i + dy, nj = j + dx;
                    if (ni>=0 && ni<ROWS && nj>=0 && nj<COLS && board[ni][nj] === -1) n++;
                }
                board[i][j] = n;
            }
        };
        const flood = (i, j) => {
            if (i<0||i>=ROWS||j<0||j>=COLS||revealed[i][j]||flagged[i][j]) return;
            revealed[i][j] = true;
            if (board[i][j] === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dy||dx) flood(i+dy, j+dx);
        };
        const checkWin = () => {
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                if (board[i][j] !== -1 && !revealed[i][j]) return false;
            }
            return true;
        };
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const x = 2 + j*S, y = 2 + i*S;
                if (revealed[i][j]) {
                    ctx.fillStyle = '#3a3258'; ctx.fillRect(x, y, S-2, S-2);
                    if (board[i][j] === -1) { ctx.fillStyle = '#ff5252'; ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💣', x + S/2, y + S/2); }
                    else if (board[i][j] > 0) {
                        ctx.fillStyle = ['#5cc7ff','#5cd65c','#ff5252','#b78bff','#ff9d5c','#5cc7ff','#888','#888'][board[i][j]-1];
                        ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(board[i][j], x + S/2, y + S/2);
                    }
                } else {
                    ctx.fillStyle = '#5a4880'; ctx.fillRect(x, y, S-2, S-2);
                    if (flagged[i][j]) { ctx.fillStyle = '#ffd56b'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🚩', x + S/2, y + S/2); }
                }
            }
        };
        const onTap = p => {
            if (over) return;
            const j = Math.floor(p.x / S), i = Math.floor(p.y / S);
            if (i<0||i>=ROWS||j<0||j>=COLS) return;
            if (p.longTap || p.shift) {
                flagged[i][j] = !flagged[i][j];
            } else {
                if (flagged[i][j]) return;
                if (board[i][j] === -1) { over = true; for (let ii=0;ii<ROWS;ii++) for (let jj=0;jj<COLS;jj++) if (board[ii][jj] === -1) revealed[ii][jj] = true; opts.onScore && opts.onScore('💥 踩雷！'); }
                else flood(i, j);
                if (checkWin()) { win = true; over = true; opts.onScore && opts.onScore('🏆 胜利！'); }
            }
            draw();
        };
        // 长按 = 标记（长按事件在 bind 里简化用右键/长按触屏实现）
        c.addEventListener('contextmenu', e => { e.preventDefault(); onTap({ x: 0, y: 0, longTap: true }); });
        let pressT = 0, pressX = 0, pressY = 0;
        c.addEventListener('touchstart', e => { const t = e.touches[0]; pressT = Date.now(); pressX = t.clientX; pressY = t.clientY; });
        c.addEventListener('touchend', e => { const t = e.changedTouches[0]; const dt = Date.now() - pressT; if (dt > 500) { const r = c.getBoundingClientRect(); onTap({ x: (pressX - r.left) * (c.width / r.width), y: (pressY - r.top) * (c.height / r.height), longTap: true }); } });
        MG.bind(c, onTap);
        init(); draw();
        MG.hint(container, '点击翻开，长按标记雷（右键也可标记）');
        return { stop() { destroy(); } };
    }
};
