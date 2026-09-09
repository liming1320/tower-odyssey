// 数字华容道：4x4 滑动排序
window.MiniGames = window.MiniGames || {};
MiniGames.slide15 = {
    start(container, opts) {
        const N = 4, S = 80;
        const { c, ctx, w, h, destroy } = MG.canvas(container, N*S + 4, N*S + 4);
        let board = [], moves = 0;
        const init = () => {
            const arr = []; for (let i = 1; i < N*N; i++) arr.push(i); arr.push(0);
            // 简单可解：随机移动若干次
            let bi = 3, bj = 3;
            for (let k = 0; k < 200; k++) {
                const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
                MG.shuffle(dirs);
                for (const [di, dj] of dirs) {
                    const ni = bi+di, nj = bj+dj;
                    if (ni>=0 && ni<N && nj>=0 && nj<N) {
                        [arr[bi*N+bj], arr[ni*N+nj]] = [arr[ni*N+nj], arr[bi*N+bj]];
                        bi = ni; bj = nj; break;
                    }
                }
            }
            board = []; for (let i = 0; i < N; i++) board.push(arr.slice(i*N, (i+1)*N));
        };
        const isWin = () => { for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const v = i*N+j+1; if (v < N*N && board[i][j] !== v) return false; } return board[N-1][N-1] === 0; };
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                const v = board[i][j];
                const x = 2 + j*S, y = 2 + i*S;
                if (v === 0) continue;
                ctx.fillStyle = '#5b8cff'; ctx.fillRect(x + 4, y + 4, S - 8, S - 8);
                ctx.fillStyle = '#fff'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(v, x + S/2, y + S/2);
            }
            opts.onScore && opts.onScore('步数：' + moves);
        };
        const onTap = p => {
            const j = Math.floor(p.x / S), i = Math.floor(p.y / S);
            if (i<0||i>=N||j<0||j>=N) return;
            // 找相邻空格
            const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
            for (const [di, dj] of dirs) {
                const ni = i+di, nj = j+dj;
                if (ni>=0&&ni<N&&nj>=0&&nj<N && board[ni][nj] === 0) {
                    board[ni][nj] = board[i][j]; board[i][j] = 0; moves++;
                    draw();
                    if (isWin()) opts.onScore && opts.onScore('🏆 排序完成！' + moves + ' 步');
                    return;
                }
            }
        };
        init(); MG.bind(c, onTap); draw();
        MG.hint(container, '点击数字旁边的空格将数字滑入，1→15 顺序即可');
        return { stop() { destroy(); } };
    }
};
