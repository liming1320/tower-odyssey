// 数独 6x6（2x3 子宫格）+ 出题与判重
window.MiniGames = window.MiniGames || {};
MiniGames.sudoku6 = {
    start(container, opts) {
        const N = 6, S = 56;
        const { c, ctx, w, h, destroy } = MG.canvas(container, N*S + 4, N*S + 4);
        // 生成简单 6x6 数独（2x3 子宫）：从全解中挖洞
        const fullBoard = [
            [1,2,3,4,5,6],
            [4,5,6,1,2,3],
            [2,3,1,5,6,4],
            [5,6,4,2,3,1],
            [3,1,2,6,4,5],
            [6,4,5,3,1,2],
        ];
        const permute = (arr) => { const a = arr.slice(); for (let i = a.length-1; i > 0; i--) { const j = MG.ri(0, i); [a[i],a[j]] = [a[j],a[i]]; } return a; };
        const make = () => {
            const a = fullBoard.map(r => r.slice());
            // 行内置换 + 列内置换（保持子框完整性）
            const rp = permute([0,1,2,3,4,5]);
            const b = a.map((r, i) => r.map((_, j) => a[rp.indexOf(i)][j]));
            // 列 swap：同子框内
            const cp = permute([0,2,1,3,5,4]);
            return b.map(r => r.map((_, j) => r[cp.indexOf(j)]));
        };
        const sol = make();
        let board = sol.map(r => r.slice());
        const holes = 22;
        const maskSet = new Set();
        while (maskSet.size < holes) maskSet.add(MG.ri(0, N*N-1));
        const initial = board.map(r => r.slice());
        for (const k of maskSet) { const i = Math.floor(k / N), j = k % N; board[i][j] = 0; initial[i][j] = 0; }
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#5a4880'; ctx.lineWidth = 2;
            for (let bi = 0; bi < N; bi += 3) for (let bj = 0; bj < N; bj += 2) {
                ctx.strokeRect(2 + bj*S, 2 + bi*S, 2*S, 3*S);
            }
            ctx.strokeStyle = '#3a3258'; ctx.lineWidth = 1;
            for (let i = 0; i <= N; i++) {
                ctx.beginPath(); ctx.moveTo(2, 2 + i*S); ctx.lineTo(2 + N*S, 2 + i*S); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(2 + i*S, 2); ctx.lineTo(2 + i*S, 2 + N*S); ctx.stroke();
            }
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                const v = board[i][j];
                if (!v) continue;
                ctx.fillStyle = initial[i][j] ? '#fff' : '#ffd56b';
                ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(v, 2 + j*S + S/2, 2 + i*S + S/2);
            }
        };
        const onTap = p => {
            const j = Math.floor(p.x / S), i = Math.floor(p.y / S);
            if (initial[i][j]) return;
            // 弹窗输入 1-6
            const v = prompt('填入数字 1-6（留空取消）');
            if (!v) return;
            const n = parseInt(v);
            if (n < 1 || n > 6) return;
            board[i][j] = n;
            draw();
            // 校验
            for (let ii = 0; ii < N; ii++) for (let jj = 0; jj < N; jj++) {
                if (board[ii][jj] !== sol[ii][jj]) { opts.onScore && opts.onScore('已填 · 检查中'); return; }
            }
            opts.onScore && opts.onScore('🏆 全部正确！');
        };
        MG.bind(c, onTap); draw();
        MG.hint(container, '点击空格填入 1-6 数字');
        return { stop() { destroy(); } };
    }
};
