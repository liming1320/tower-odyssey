// 连连看：8x6 棋盘（48 张 24 对），找相同图案用 ≤2 个折点的路径连起来
window.MiniGames = window.MiniGames || {};
MiniGames.link = {
    start(container, opts) {
        const COLS = 8, ROWS = 6;
        const ICONS = ['🍎','🍊','🍋','🍉','🍇','🍓','🍒','🍑','🥝','🥥','🍍','🥭'];
        const initBoard = () => {
            const pairs = COLS*ROWS/2;
            const arr = [];
            for (let i = 0; i < pairs; i++) { const ico = ICONS[i % ICONS.length]; arr.push(ico, ico); }
            MG.shuffle(arr);
            const b = [];
            for (let i = 0; i < ROWS; i++) b.push(arr.slice(i*COLS, (i+1)*COLS));
            return b;
        };
        let board = initBoard(), sel = null, path = null, score = 0, timeLeft = 180;
        const cellW = 50, cellH = 50;
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS*cellW + 4, ROWS*cellH + 4);
        // 路径（≤2 折）：用 BFS 搜扩展图（棋盘外 + 1 圈空白）
        const canConnect = (a, b) => {
            if (a[0]===b[0] && a[1]===b[1]) return null;
            // 临时去掉两格
            const saved = [board[a[0]][a[1]], board[b[0]][b[1]]];
            board[a[0]][a[1]] = ''; board[b[0]][b[1]] = '';
            const found = searchPath(a, b);
            board[a[0]][a[1]] = saved[0]; board[b[0]][b[1]] = saved[1];
            return found;
        };
        const searchPath = (start, end) => {
            // 棋盘外加一圈空白：cols+2 x rows+2，索引 1..cols, 1..rows
            const W = COLS + 2, H = ROWS + 2;
            const inB = (x, y) => x>=0 && x<W && y>=0 && y<H;
            const blocked = (x, y) => {
                if (x === 0 || x === W-1 || y === 0 || y === H-1) return false; // 边界空白
                return !!board[y-1][x-1];
            };
            const sx = start[1]+1, sy = start[0]+1, ex = end[1]+1, ey = end[0]+1;
            // BFS 记折点 ≤ 2：state = (x, y, lastDir, turns)
            // 简化：直线相连（折点 0）+ L 型（折点 1）+ Z 型（折点 2）
            const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
            // 先尝试 0 折（同行/列）
            if (sx === ex) {
                const lo = Math.min(sy, ey), hi = Math.max(sy, ey);
                let ok = true; for (let y = lo+1; y < hi; y++) if (blocked(sx, y)) { ok = false; break; }
                if (ok) return [[sx-1, sy-1], [ex-1, ey-1]];
            }
            if (sy === ey) {
                const lo = Math.min(sx, ex), hi = Math.max(sx, ex);
                let ok = true; for (let x = lo+1; x < hi; x++) if (blocked(x, sy)) { ok = false; break; }
                if (ok) return [[sx-1, sy-1], [ex-1, ey-1]];
            }
            // 1-2 折：枚举所有转角点
            for (let cx = 0; cx < W; cx++) {
                for (let cy = 0; cy < H; cy++) {
                    if (cx === sx && cy === sy) continue;
                    if (cx === ex && cy === ey) continue;
                    if (blocked(cx, cy)) continue;
                    // 路径：start → (cx,cy) → end
                    if (line(sx, sy, cx, cy) && line(cx, cy, ex, ey)) {
                        return [[sx-1, sy-1], [cx-1, cy-1], [ex-1, ey-1]];
                    }
                }
            }
            return null;
        };
        const line = (x1, y1, x2, y2) => {
            if (x1 === x2) {
                const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
                for (let y = lo+1; y < hi; y++) if (blocked(x1, y)) return false;
                return true;
            }
            if (y1 === y2) {
                const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
                for (let x = lo+1; x < hi; x++) if (blocked(x, y1)) return false;
                return true;
            }
            return false;
        };
        const draw = () => {
            ctx.fillStyle = '#2a2540'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const x = 2 + j*cellW, y = 2 + i*cellH;
                ctx.fillStyle = (i+j)%2 ? '#3a3258' : '#454063';
                ctx.fillRect(x, y, cellW-2, cellH-2);
                if (board[i][j]) {
                    ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(board[i][j], x + cellW/2, y + cellH/2);
                }
                if (sel && sel[0]===i && sel[1]===j) { ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.strokeRect(x+1, y+1, cellW-4, cellH-4); }
            }
            if (path) {
                ctx.strokeStyle = '#5cd65c'; ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(path[0][1]*cellW + cellW/2, path[0][0]*cellH + cellH/2);
                for (let k = 1; k < path.length; k++) ctx.lineTo(path[k][1]*cellW + cellW/2, path[k][0]*cellH + cellH/2);
                ctx.stroke();
            }
            opts.onScore && opts.onScore('已消：' + score + ' · 剩余 ' + Math.floor(timeLeft) + 's');
        };
        const onTap = p => {
            const j = Math.floor(p.x / cellW), i = Math.floor(p.y / cellH);
            if (i<0||i>=ROWS||j<0||j>=COLS) return;
            const cur = board[i][j];
            if (!cur) return;
            if (!sel) { sel = [i, j]; path = null; }
            else if (sel[0]===i && sel[1]===j) { sel = null; path = null; }
            else if (board[sel[0]][sel[1]] === cur) {
                const pth = canConnect(sel, [i, j]);
                if (pth) {
                    board[i][j] = ''; board[sel[0]][sel[1]] = '';
                    score += 10; sel = null; path = null;
                } else { sel = [i, j]; path = null; }
            } else { sel = [i, j]; path = null; }
            draw();
            if (!board.flat().some(x => x)) { opts.onScore && opts.onScore('🏆 全部清空！得分 ' + score); stopTimer(); }
        };
        const timer = setInterval(() => { timeLeft -= 1; if (timeLeft <= 0) { timeLeft = 0; opts.onScore && opts.onScore('⏰ 时间到！得分 ' + score); clearInterval(timer); } draw(); }, 1000);
        const stopTimer = () => clearInterval(timer);
        MG.bind(c, onTap);
        draw();
        MG.hint(container, '点击两张相同图案，路径折点 ≤2 可消除');
        return { stop() { stopTimer(); destroy(); } };
    }
};
