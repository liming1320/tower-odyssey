// 贪吃蛇：20 关挑战，地图/速度/目标长度递增
window.MiniGames = window.MiniGames || {};
MiniGames.snake = {
    LEVELS: [
        // { name, desc, cols, rows, target, speed }
        { name: '启程', desc: '10×10 · 目标长度 6 · 速度 130ms' },
        { name: '熟悉', desc: '12×12 · 目标长度 8 · 速度 125ms' },
        { name: '小成', desc: '14×14 · 目标长度 10 · 速度 120ms' },
        { name: '熟练', desc: '14×14 · 目标长度 12 · 速度 115ms' },
        { name: '稳健', desc: '16×16 · 目标长度 14 · 速度 110ms' },
        { name: '提速', desc: '16×16 · 目标长度 16 · 速度 105ms' },
        { name: '进阶', desc: '18×18 · 目标长度 18 · 速度 100ms' },
        { name: '进阶 II', desc: '18×18 · 目标长度 20 · 速度 95ms' },
        { name: '挑战', desc: '20×20 · 目标长度 22 · 速度 90ms' },
        { name: '挑战 II', desc: '20×20 · 目标长度 24 · 速度 85ms' },
        { name: '高手', desc: '22×22 · 目标长度 26 · 速度 80ms' },
        { name: '高手 II', desc: '22×22 · 目标长度 28 · 速度 78ms' },
        { name: '疾速', desc: '24×24 · 目标长度 30 · 速度 75ms' },
        { name: '闪电', desc: '24×24 · 目标长度 32 · 速度 72ms' },
        { name: '狂飙', desc: '26×26 · 目标长度 34 · 速度 68ms' },
        { name: '大师', desc: '26×26 · 目标长度 36 · 速度 65ms' },
        { name: '宗匠', desc: '28×28 · 目标长度 38 · 速度 62ms' },
        { name: '鬼手', desc: '28×28 · 目标长度 40 · 速度 58ms' },
        { name: '传奇', desc: '30×30 · 目标长度 42 · 速度 55ms' },
        { name: '贪吃王', desc: '32×32 · 目标长度 45 · 速度 50ms · 终极' },
    ],
    PARAMS: [
        [10, 10, 6, 130], [12, 12, 8, 125], [14, 14, 10, 120], [14, 14, 12, 115], [16, 16, 14, 110],
        [16, 16, 16, 105], [18, 18, 18, 100], [18, 18, 20, 95], [20, 20, 22, 90], [20, 20, 24, 85],
        [22, 22, 26, 80], [22, 22, 28, 78], [24, 24, 30, 75], [24, 24, 32, 72], [26, 26, 34, 68],
        [26, 26, 36, 65], [28, 28, 38, 62], [28, 28, 40, 58], [30, 30, 42, 55], [32, 32, 45, 50],
    ],
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const [COLS, ROWS, target, speed] = this.PARAMS[idx] || this.PARAMS[0];
        const maxW = Math.min(container.clientWidth - 16, 480);
        const S = Math.floor(Math.min(maxW / COLS, 28));
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS * S + 4, ROWS * S + 4);
        let snake = [{ x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) }], dir = { x: 0, y: 0 }, food = null, alive = true, won = false;
        const spawnFood = () => {
            while (true) {
                const f = { x: MG.ri(0, COLS - 1), y: MG.ri(0, ROWS - 1) };
                if (!snake.some(s => s.x === f.x && s.y === f.y)) { food = f; return; }
            }
        };
        spawnFood();
        const step = () => {
            if (!alive || won) return;
            const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
            if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { alive = false; finalize(false); return; }
            if (snake.some(s => s.x === head.x && s.y === head.y)) { alive = false; finalize(false); return; }
            snake.unshift(head);
            if (head.x === food.x && head.y === food.y) {
                spawnFood();
                if (snake.length >= target) { alive = false; finalize(true); return; }
            } else snake.pop();
            draw();
        };
        const finalize = (win) => {
            won = true;
            const stars = win ? (snake.length >= target + 5 ? 3 : snake.length >= target ? 2 : 0) : 0;
            opts.onComplete && opts.onComplete({
                win, stars,
                lines: ['长度 ' + snake.length + ' / 目标 ' + target, lv.desc],
            });
        };
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ff5252'; ctx.fillRect(2 + food.x * S, 2 + food.y * S, S - 2, S - 2);
            snake.forEach((s, i) => {
                ctx.fillStyle = i === 0 ? '#7cfc7c' : '#5cd65c';
                ctx.fillRect(2 + s.x * S, 2 + s.y * S, S - 2, S - 2);
            });
            opts.onScore && opts.onScore('长度：' + snake.length + ' / 目标 ' + target);
        };
        const setDir = d => { if (d.x === -dir.x && d.y === -dir.y && snake.length > 1) return; dir = d; };
        const kbd = e => {
            const k = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 } }[e.key];
            if (k) { e.preventDefault(); setDir(k); }
        };
        window.addEventListener('keydown', kbd);
        let sx, sy;
        c.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; });
        c.addEventListener('touchend', e => {
            const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
            if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
            else setDir(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
        });
        const loop = setInterval(step, speed);
        draw();
        MG.hint(container, lv.desc + ' · 方向键/滑动控制蛇移动，吃红色食物');
        return { stop() { clearInterval(loop); window.removeEventListener('keydown', kbd); destroy(); } };
    }
};