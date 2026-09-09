// 五子棋：15x15 棋盘，玩家先手黑子，电脑白子（简单评分 AI）
window.MiniGames = window.MiniGames || {};
MiniGames.gomoku = {
    start(container, opts) {
        const { c, ctx, w, h, destroy } = MG.canvas(container, 420, 420);
        const N = 15, S = 28, OFF = 8;
        const board = Array.from({ length: N }, () => Array(N).fill(0));
        const ai = 2, human = 1;
        let over = false, winLine = null;
        // 评分函数：连续越多分越高
        const score = (x, y, p) => {
            if (board[x][y] !== 0) return -1;
            let total = 0;
            const dirs = [[1,0],[0,1],[1,1],[1,-1]];
            for (const [dx,dy] of dirs) {
                let cnt = 0, block = 0;
                for (let s = 1; s < 5; s++) {
                    const nx = x+dx*s, ny = y+dy*s;
                    if (nx<0||nx>=N||ny<0||ny>=N) { block++; break; }
                    if (board[nx][ny] === p) cnt++;
                    else { if (board[nx][ny] !== 0) block++; break; }
                }
                for (let s = 1; s < 5; s++) {
                    const nx = x-dx*s, ny = y-dy*s;
                    if (nx<0||nx>=N||ny<0||ny>=N) { block++; break; }
                    if (board[nx][ny] === p) cnt++;
                    else { if (board[nx][ny] !== 0) block++; break; }
                }
                const v = cnt >= 4 ? 100000 : cnt === 3 ? (block === 0 ? 10000 : 1000) : cnt === 2 ? (block === 0 ? 1000 : 100) : cnt === 1 ? 100 : 10;
                total += v;
            }
            return total;
        };
        const checkWin = (x, y, p) => {
            const dirs = [[1,0],[0,1],[1,1],[1,-1]];
            for (const [dx,dy] of dirs) {
                const line = [[x,y]];
                for (let s = 1; s < 5; s++) { const nx=x+dx*s,ny=y+dy*s; if (nx>=0&&nx<N&&ny>=0&&ny<N&&board[nx][ny]===p) line.push([nx,ny]); else break; }
                for (let s = 1; s < 5; s++) { const nx=x-dx*s,ny=y-dy*s; if (nx>=0&&nx<N&&ny>=0&&ny<N&&board[nx][ny]===p) line.unshift([nx,ny]); else break; }
                if (line.length >= 5) return line.slice(0, 5);
            }
            return null;
        };
        const aiMove = () => {
            let best = { x: 7, y: 7, s: -1 };
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                if (board[i][j] !== 0) continue;
                const sa = score(i, j, ai), sh = score(i, j, human);
                const s = sa * 0.9 + sh * 1.1; // 防守略重
                if (s > best.s) best = { x: i, y: j, s };
            }
            board[best.x][best.y] = ai;
            const w = checkWin(best.x, best.y, ai);
            if (w) { over = true; winLine = w; }
            draw();
        };
        const draw = () => {
            ctx.fillStyle = '#d4a76a'; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1;
            for (let i = 0; i < N; i++) {
                ctx.beginPath(); ctx.moveTo(OFF + i*S, OFF); ctx.lineTo(OFF + i*S, OFF + (N-1)*S); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(OFF, OFF + i*S); ctx.lineTo(OFF + (N-1)*S, OFF + i*S); ctx.stroke();
            }
            // 星位
            const stars = [[3,3],[3,11],[11,3],[11,11],[7,7]];
            ctx.fillStyle = '#5a3a1c';
            stars.forEach(([x,y]) => { ctx.beginPath(); ctx.arc(OFF+x*S, OFF+y*S, 3, 0, Math.PI*2); ctx.fill(); });
            // 棋子
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                if (!board[i][j]) continue;
                const cx = OFF + j*S, cy = OFF + i*S;
                const grad = ctx.createRadialGradient(cx-3, cy-3, 2, cx, cy, 12);
                if (board[i][j] === 1) { grad.addColorStop(0, '#666'); grad.addColorStop(1, '#000'); }
                else { grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#ccc'); }
                ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI*2); ctx.fill();
            }
            if (winLine) {
                ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(OFF + winLine[0][1]*S, OFF + winLine[0][0]*S);
                ctx.lineTo(OFF + winLine[4][1]*S, OFF + winLine[4][0]*S);
                ctx.stroke();
            }
        };
        MG.bind(c, p => {
            if (over) return;
            const x = Math.round((p.y - OFF) / S), y = Math.round((p.x - OFF) / S);
            if (x<0||x>=N||y<0||y>=N||board[x][y]) return;
            board[x][y] = human;
            const w = checkWin(x, y, human);
            if (w) { over = true; winLine = w; draw(); opts.onScore && opts.onScore('你赢啦！'); return; }
            draw();
            setTimeout(aiMove, 200);
        });
        draw();
        MG.hint(container, '点击棋盘落子，五连成线获胜');
        return { stop() { destroy(); } };
    }
};
