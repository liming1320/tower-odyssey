// 2048：4x4 滑动合并，触屏/方向键控制
window.MiniGames = window.MiniGames || {};
MiniGames.g2048 = {
    start(container, opts) {
        const N = 4, SIZE = 100;
        const { c, ctx, w, h, destroy } = MG.canvas(container, N*SIZE + 20, N*SIZE + 20);
        const COLORS = { 0: '#1a1c2a', 2:'#eee4da', 4:'#ede0c8', 8:'#f2b179', 16:'#f59563', 32:'#f67c5f', 64:'#f65e3b', 128:'#edcf72', 256:'#edcc61', 512:'#edc850', 1024:'#edc53f', 2048:'#edc22e' };
        const TXTCOLOR = { 2:'#776e65', 4:'#776e65' };
        let board = Array.from({ length: N }, () => Array(N).fill(0));
        let score = 0;
        const add = () => {
            const empty = [];
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (!board[i][j]) empty.push([i, j]);
            if (!empty.length) return;
            const [x, y] = MG.pick(empty);
            board[x][y] = Math.random() < 0.9 ? 2 : 4;
        };
        const draw = () => {
            ctx.fillStyle = '#bbada0'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                const v = board[i][j];
                ctx.fillStyle = COLORS[v] || '#3c3a32';
                ctx.fillRect(10 + j*SIZE + 4, 10 + i*SIZE + 4, SIZE - 8, SIZE - 8);
                if (v) {
                    ctx.fillStyle = TXTCOLOR[v] || '#fff';
                    ctx.font = `${v >= 1000 ? 28 : v >= 100 ? 36 : 44}px bold sans-serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(v, 10 + j*SIZE + SIZE/2, 10 + i*SIZE + SIZE/2);
                }
            }
        };
        const compress = (row) => {
            const a = row.filter(v => v);
            for (let i = 0; i < a.length - 1; i++) {
                if (a[i] === a[i+1]) { a[i] *= 2; score += a[i]; a.splice(i+1, 1); }
            }
            while (a.length < N) a.push(0);
            return a;
        };
        const move = (dir) => {
            const before = JSON.stringify(board);
            if (dir === 'L') for (let i = 0; i < N; i++) board[i] = compress(board[i]);
            if (dir === 'R') for (let i = 0; i < N; i++) board[i] = compress(board[i].slice().reverse()).reverse();
            if (dir === 'U') {
                for (let j = 0; j < N; j++) {
                    const col = [board[0][j], board[1][j], board[2][j], board[3][j]];
                    const nc = compress(col);
                    for (let i = 0; i < N; i++) board[i][j] = nc[i];
                }
            }
            if (dir === 'D') {
                for (let j = 0; j < N; j++) {
                    const col = [board[3][j], board[2][j], board[1][j], board[0][j]];
                    const nc = compress(col).reverse();
                    for (let i = 0; i < N; i++) board[i][j] = nc[i];
                }
            }
            if (JSON.stringify(board) !== before) add();
            draw();
            opts.onScore && opts.onScore('分数：' + score);
            if (board.flat().includes(2048)) opts.onScore && opts.onScore('🎉 达成 2048！分数：' + score);
        };
        // 键盘
        const kbd = e => {
            const k = { ArrowLeft:'L', ArrowRight:'R', ArrowUp:'U', ArrowDown:'D' }[e.key];
            if (k) { e.preventDefault(); move(k); }
        };
        window.addEventListener('keydown', kbd);
        // 触屏滑动
        let startX, startY;
        c.addEventListener('touchstart', e => { const t = e.touches[0]; startX = t.clientX; startY = t.clientY; });
        c.addEventListener('touchend', e => {
            const t = e.changedTouches[0]; const dx = t.clientX - startX, dy = t.clientY - startY;
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
            if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L'); else move(dy > 0 ? 'D' : 'U');
        });
        add(); add(); draw();
        MG.hint(container, '滑动屏幕（或方向键）合并方块到 2048');
        return { stop() { window.removeEventListener('keydown', kbd); destroy(); } };
    }
};
