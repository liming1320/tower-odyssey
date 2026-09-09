// 俄罗斯方块：20 关挑战，下落速度/目标分递增
window.MiniGames = window.MiniGames || {};
MiniGames.tetris = {
    LEVELS: [
        // { name, desc, dropInt, target }
        { name: '初识', desc: '速度 700ms · 目标 1500 分' },
        { name: '熟悉', desc: '速度 650ms · 目标 2000 分' },
        { name: '入门', desc: '速度 600ms · 目标 2500 分' },
        { name: '练习', desc: '速度 550ms · 目标 3000 分' },
        { name: '小成', desc: '速度 500ms · 目标 3500 分' },
        { name: '熟练', desc: '速度 450ms · 目标 4000 分' },
        { name: '稳健', desc: '速度 400ms · 目标 4500 分' },
        { name: '进阶', desc: '速度 360ms · 目标 5000 分' },
        { name: '进阶 II', desc: '速度 320ms · 目标 6000 分' },
        { name: '挑战', desc: '速度 280ms · 目标 7000 分' },
        { name: '提速', desc: '速度 240ms · 目标 8000 分' },
        { name: '高手', desc: '速度 210ms · 目标 9000 分' },
        { name: '高手 II', desc: '速度 190ms · 目标 10000 分' },
        { name: '冲刺', desc: '速度 170ms · 目标 11000 分' },
        { name: '疾速', desc: '速度 150ms · 目标 12000 分' },
        { name: '宗匠', desc: '速度 140ms · 目标 13000 分' },
        { name: '魔鬼', desc: '速度 130ms · 目标 14000 分' },
        { name: '极限', desc: '速度 120ms · 目标 15000 分' },
        { name: '炼狱', desc: '速度 110ms · 目标 16000 分' },
        { name: '方块王', desc: '速度 100ms · 目标 18000 分 · 终极' },
    ],
    PARAMS: [
        [700, 1500], [650, 2000], [600, 2500], [550, 3000], [500, 3500],
        [450, 4000], [400, 4500], [360, 5000], [320, 6000], [280, 7000],
        [240, 8000], [210, 9000], [190, 10000], [170, 11000], [150, 12000],
        [140, 13000], [130, 14000], [120, 15000], [110, 16000], [100, 18000],
    ],
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const [baseDrop, target] = this.PARAMS[idx] || this.PARAMS[0];
        const COLS = 10, ROWS = 20, S = 22;
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS * S + 4, ROWS * S + 4);
        const SHAPES = [
            [[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]],
            [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]],
        ];
        const COL = ['#000', '#5cc7ff', '#ffd56b', '#b78bff', '#5b8cff', '#ff9d5c', '#5cd65c', '#ff5252'];
        let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        let cur = null, score = 0, alive = true, dropInt = baseDrop, won = false;
        const spawn = () => { const s = MG.pick(SHAPES); cur = { s, x: Math.floor((COLS - s[0].length) / 2), y: 0, c: MG.ri(1, 7) }; };
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
        const finalize = (win) => {
            won = true;
            const stars = win ? (score >= target * 1.3 ? 3 : score >= target ? 2 : 0) : 0;
            opts.onComplete && opts.onComplete({
                win, stars,
                lines: ['分数：' + score + ' / 目标 ' + target, lv.desc],
            });
        };
        const merge = () => {
            for (let i = 0; i < cur.s.length; i++) for (let j = 0; j < cur.s[0].length; j++) {
                if (cur.s[i][j]) board[cur.y + i][cur.x + j] = cur.c;
            }
            let lines = 0;
            for (let i = ROWS - 1; i >= 0; i--) {
                if (board[i].every(v => v)) { board.splice(i, 1); board.unshift(Array(COLS).fill(0)); lines++; i++; }
            }
            score += lines * 100 + (lines > 1 ? lines * 50 : 0);
            if (lines > 0) dropInt = Math.max(60, dropInt - lines * 15);
            if (score >= target) { alive = false; draw(); finalize(true); return; }
            spawn();
            if (collide(cur.x, cur.y, cur.s)) { alive = false; }
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
                ctx.fillStyle = COL[board[i][j]]; ctx.fillRect(2 + j * S, 2 + i * S, S - 2, S - 2);
            }
            if (cur) for (let i = 0; i < cur.s.length; i++) for (let j = 0; j < cur.s[0].length; j++) {
                if (cur.s[i][j]) { ctx.fillStyle = COL[cur.c]; ctx.fillRect(2 + (cur.x + j) * S, 2 + (cur.y + i) * S, S - 2, S - 2); }
            }
            opts.onScore && opts.onScore('分数：' + score + ' / ' + target);
        };
        const kbd = e => {
            if (!alive || won) return;
            const k = { ArrowLeft: 'L', ArrowRight: 'R', ArrowDown: 'D', ArrowUp: 'U', ' ': 'D' }[e.key];
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
        const loop = setInterval(() => {
            if (alive && !won) {
                move(0, 1); draw();
                if (!alive) finalize(false);
            }
        }, dropInt);
        draw();
        MG.hint(container, lv.desc + ' · 方向键移动/旋转，触屏滑动操作');
        return { stop() { clearInterval(loop); window.removeEventListener('keydown', kbd); destroy(); } };
    }
};