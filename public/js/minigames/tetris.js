// 俄罗斯方块：标准 SRS 简化，10x20
window.MiniGames = window.MiniGames || {};
MiniGames.tetris = {
    start(container, opts) {
        const COLS = 10, ROWS = 20, S = 24;
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS*S + 4, ROWS*S + 4);
        const SHAPES = [
            [[1,1,1,1]],                       // I
            [[1,1],[1,1]],                     // O
            [[0,1,0],[1,1,1]],                 // T
            [[1,0,0],[1,1,1]],                 // J
            [[0,0,1],[1,1,1]],                 // L
            [[1,1,0],[0,1,1]],                 // S
            [[0,1,1],[1,1,0]],                 // Z
        ];
        const COL = ['#000','#5cc7ff','#ffd56b','#b78bff','#5b8cff','#ff9d5c','#5cd65c','#ff5252'];
        let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        let cur = null, score = 0, alive = true, dropTimer = 0, dropInt = 600;
        const spawn = () => {
            const s = MG.pick(SHAPES);
            cur = { s, x: Math.floor((COLS - s[0].length) / 2), y: 0 };
        };
        const collide = (x, y, s) => {
            for (let i = 0; i < s.length; i++) for (let j = 0; j < s[0].length; j++) {
                if (!s[i][j]) continue;
                const nx = x + j, ny = y + i;
                if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
                if (ny >= 0 && board[ny][nx]) return true;
            }
            return false;
        };
        const rot = s => s[0].map((_, i) => s.map(r => r[i]).reverse());
        const merge = () => {
            for (let i = 0; i < cur.s.length; i++) for (let j = 0; j < cur.s[0].length; j++) {
                if (cur.s[i][j]) board[cur.y + i][cur.x + j] = MG.ri(1, 7);
            }
            // 消行
            let lines = 0;
            for (let i = ROWS - 1; i >= 0; i--) {
                if (board[i].every(v => v)) { board.splice(i, 1); board.unshift(Array(COLS).fill(0)); lines++; i++; }
            }
            score += lines * 100;
            if (lines > 0) dropInt = Math.max(100, dropInt - lines * 20);
            spawn();
            if (collide(cur.x, cur.y, cur.s)) alive = false;
        };
        const move = (dx, dy) => {
            if (collide(cur.x + dx, cur.y + dy, cur.s)) {
                if (dy > 0) merge();
                return false;
            }
            cur.x += dx; cur.y += dy; return true;
        };
        const hardDrop = () => { while (move(0, 1)) {} };
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                if (!board[i][j]) continue;
                ctx.fillStyle = COL[board[i][j]]; ctx.fillRect(2 + j*S, 2 + i*S, S-2, S-2);
            }
            if (cur) for (let i = 0; i < cur.s.length; i++) for (let j = 0; j < cur.s[0].length; j++) {
                if (cur.s[i][j]) { ctx.fillStyle = COL[MG.ri(1, 7)]; ctx.fillRect(2 + (cur.x + j)*S, 2 + (cur.y + i)*S, S-2, S-2); }
            }
            opts.onScore && opts.onScore('分数：' + score);
        };
        const kbd = e => {
            if (!alive) return;
            const k = { ArrowLeft:'L', ArrowRight:'R', ArrowDown:'D', ArrowUp:'U', ' ':'D' }[e.key];
            if (k === 'L') move(-1, 0);
            else if (k === 'R') move(1, 0);
            else if (k === 'D') move(0, 1);
            else if (k === 'U') { const r = rot(cur.s); if (!collide(cur.x, cur.y, r)) cur.s = r; }
            else return;
            e.preventDefault(); draw();
        };
        window.addEventListener('keydown', kbd);
        let sx, sy;
        c.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; });
        c.addEventListener('touchend', e => {
            const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20) { const r = rot(cur.s); if (!collide(cur.x, cur.y, r)) cur.s = r; }
            else if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
            else if (dy < -20) { const r = rot(cur.s); if (!collide(cur.x, cur.y, r)) cur.s = r; }
            else if (dy > 20) hardDrop();
            else move(0, 1);
            draw();
        });
        spawn();
        const loop = setInterval(() => { if (alive) { move(0, 1); draw(); if (!alive) opts.onScore && opts.onScore('💀 游戏结束！分数：' + score); } }, dropInt);
        draw();
        MG.hint(container, '方向键移动/旋转，↑旋转，↓加速下落，触屏滑动操作');
        return { stop() { clearInterval(loop); window.removeEventListener('keydown', kbd); destroy(); } };
    }
};
