// 五子棋：20 关挑战，AI 失误率递减（等级越高越稳）
window.MiniGames = window.MiniGames || {};
MiniGames.gomoku = {
    LEVELS: [
        // { name, desc, mistakeRate, weightAttack, weightDefense }
        { name: '入门', desc: 'AI 随机率 50% · 简单' },
        { name: '初识', desc: 'AI 随机率 45%' },
        { name: '热身', desc: 'AI 随机率 40%' },
        { name: '小成', desc: 'AI 随机率 35%' },
        { name: '练习', desc: 'AI 随机率 30%' },
        { name: '稳健', desc: 'AI 随机率 25%' },
        { name: '熟练', desc: 'AI 随机率 20%' },
        { name: '进阶', desc: 'AI 随机率 16%' },
        { name: '进阶 II', desc: 'AI 随机率 12%' },
        { name: '挑战', desc: 'AI 随机率 9%' },
        { name: '挑战 II', desc: 'AI 随机率 6%' },
        { name: '高手', desc: 'AI 随机率 4%' },
        { name: '高手 II', desc: 'AI 随机率 3%' },
        { name: '冲刺', desc: 'AI 随机率 2%' },
        { name: '冲刺 II', desc: 'AI 随机率 1.5%' },
        { name: '宗匠', desc: 'AI 随机率 1%' },
        { name: '宗匠 II', desc: 'AI 随机率 0.6%' },
        { name: '鬼手', desc: 'AI 随机率 0.4%' },
        { name: '神机', desc: 'AI 随机率 0.2%' },
        { name: '五子王', desc: 'AI 随机率 0% · 终极' },
    ],
    PARAMS: [
        [0.50, 0.9, 1.1], [0.45, 0.9, 1.1], [0.40, 0.9, 1.1], [0.35, 0.9, 1.1], [0.30, 0.9, 1.1],
        [0.25, 0.9, 1.1], [0.20, 0.9, 1.1], [0.16, 0.9, 1.1], [0.12, 0.9, 1.1], [0.09, 0.9, 1.1],
        [0.06, 0.9, 1.1], [0.04, 0.9, 1.1], [0.03, 0.9, 1.1], [0.02, 0.9, 1.1], [0.015, 0.9, 1.1],
        [0.01, 0.9, 1.1], [0.006, 0.9, 1.1], [0.004, 0.9, 1.1], [0.002, 0.9, 1.1], [0.0, 0.9, 1.1],
    ],
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const [mistakeRate, wA, wD] = this.PARAMS[idx] || this.PARAMS[0];
        const { c, ctx, w, h, destroy } = MG.canvas(container, 420, 420);
        const N = 15, S = 28, OFF = 8;
        const board = Array.from({ length: N }, () => Array(N).fill(0));
        const ai = 2, human = 1;
        let over = false, winLine = null, won = false;
        const score = (x, y, p) => {
            if (board[x][y] !== 0) return -1;
            let total = 0;
            const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
            for (const [dx, dy] of dirs) {
                let cnt = 0, block = 0;
                for (let s = 1; s < 5; s++) {
                    const nx = x + dx * s, ny = y + dy * s;
                    if (nx < 0 || nx >= N || ny < 0 || ny >= N) { block++; break; }
                    if (board[nx][ny] === p) cnt++;
                    else { if (board[nx][ny] !== 0) block++; break; }
                }
                for (let s = 1; s < 5; s++) {
                    const nx = x - dx * s, ny = y - dy * s;
                    if (nx < 0 || nx >= N || ny < 0 || ny >= N) { block++; break; }
                    if (board[nx][ny] === p) cnt++;
                    else { if (board[nx][ny] !== 0) block++; break; }
                }
                const v = cnt >= 4 ? 100000 : cnt === 3 ? (block === 0 ? 10000 : 1000) : cnt === 2 ? (block === 0 ? 1000 : 100) : cnt === 1 ? 100 : 10;
                total += v;
            }
            return total;
        };
        const checkWin = (x, y, p) => {
            const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
            for (const [dx, dy] of dirs) {
                const line = [[x, y]];
                for (let s = 1; s < 5; s++) { const nx = x + dx * s, ny = y + dy * s; if (nx >= 0 && nx < N && ny >= 0 && ny < N && board[nx][ny] === p) line.push([nx, ny]); else break; }
                for (let s = 1; s < 5; s++) { const nx = x - dx * s, ny = y - dy * s; if (nx >= 0 && nx < N && ny >= 0 && ny < N && board[nx][ny] === p) line.unshift([nx, ny]); else break; }
                if (line.length >= 5) return line.slice(0, 5);
            }
            return null;
        };
        const candidates = () => {
            // 缩小搜索到已有棋子 2 格内的空位
            const set = new Set();
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                if (board[i][j]) {
                    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
                        const ni = i + dx, nj = j + dy;
                        if (ni >= 0 && ni < N && nj >= 0 && nj < N && !board[ni][nj]) set.add(ni * N + nj);
                    }
                }
            }
            if (!set.size) set.add(Math.floor(N / 2) * N + Math.floor(N / 2));
            return [...set].map(k => [Math.floor(k / N), k % N]);
        };
        const aiMove = () => {
            const cs = candidates();
            let best = { x: 7, y: 7, s: -1 };
            const list = [];
            for (const [i, j] of cs) {
                if (board[i][j] !== 0) continue;
                const sa = score(i, j, ai), sh = score(i, j, human);
                const s = sa * wA + sh * wD;
                list.push({ x: i, y: j, s });
                if (s > best.s) best = { x: i, y: j, s };
            }
            // 随机失误：从前 30% 中随机选
            list.sort((a, b) => b.s - a.s);
            const cut = Math.max(1, Math.floor(list.length * (1 - mistakeRate)));
            const pool = list.slice(0, cut);
            const pick = pool[MG.ri(0, pool.length - 1)];
            board[pick.x][pick.y] = ai;
            const w = checkWin(pick.x, pick.y, ai);
            if (w) { over = true; winLine = w; won = false; }
            draw();
            if (over) {
                opts.onComplete && opts.onComplete({
                    win: false, stars: 0,
                    lines: ['电脑五连获胜！', lv.desc],
                });
            }
        };
        const draw = () => {
            ctx.fillStyle = '#d4a76a'; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1;
            for (let i = 0; i < N; i++) {
                ctx.beginPath(); ctx.moveTo(OFF + i * S, OFF); ctx.lineTo(OFF + i * S, OFF + (N - 1) * S); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(OFF, OFF + i * S); ctx.lineTo(OFF + (N - 1) * S, OFF + i * S); ctx.stroke();
            }
            const stars = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];
            ctx.fillStyle = '#5a3a1c';
            stars.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(OFF + x * S, OFF + y * S, 3, 0, Math.PI * 2); ctx.fill(); });
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                if (!board[i][j]) continue;
                const cx = OFF + j * S, cy = OFF + i * S;
                const grad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 12);
                if (board[i][j] === 1) { grad.addColorStop(0, '#666'); grad.addColorStop(1, '#000'); }
                else { grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#ccc'); }
                ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
            }
            if (winLine) {
                ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(OFF + winLine[0][1] * S, OFF + winLine[0][0] * S);
                ctx.lineTo(OFF + winLine[4][1] * S, OFF + winLine[4][0] * S);
                ctx.stroke();
            }
        };
        MG.bind(c, p => {
            if (over) return;
            const x = Math.round((p.y - OFF) / S), y = Math.round((p.x - OFF) / S);
            if (x < 0 || x >= N || y < 0 || y >= N || board[x][y]) return;
            board[x][y] = human;
            const w = checkWin(x, y, human);
            if (w) { over = true; winLine = w; won = true; draw(); opts.onComplete && opts.onComplete({ win: true, stars: 3, lines: ['你五连获胜！', lv.desc] }); return; }
            draw();
            setTimeout(aiMove, 200);
        });
        draw();
        MG.hint(container, lv.desc + ' · 点击棋盘落子，五连成线获胜');
        return { stop() { destroy(); } };
    }
};