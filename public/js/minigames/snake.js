// 贪吃蛇：经典方向键/滑动控制
window.MiniGames = window.MiniGames || {};
MiniGames.snake = {
    start(container, opts) {
        const COLS = 20, ROWS = 20, S = 18;
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS*S + 4, ROWS*S + 4);
        let snake = [{ x: 10, y: 10 }], dir = { x: 0, y: 0 }, food = null, score = 0, alive = true, tick = 0;
        const spawnFood = () => {
            while (true) {
                const f = { x: MG.ri(0, COLS-1), y: MG.ri(0, ROWS-1) };
                if (!snake.some(s => s.x === f.x && s.y === f.y)) { food = f; return; }
            }
        };
        spawnFood();
        const step = () => {
            if (!alive) return;
            const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
            if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { alive = false; opts.onScore && opts.onScore('💀 撞墙！分数：' + score); return; }
            if (snake.some(s => s.x === head.x && s.y === head.y)) { alive = false; opts.onScore && opts.onScore('💀 撞到自己！分数：' + score); return; }
            snake.unshift(head);
            if (head.x === food.x && head.y === food.y) { score += 10; spawnFood(); }
            else snake.pop();
            draw();
        };
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ff5252'; ctx.fillRect(2 + food.x*S, 2 + food.y*S, S-2, S-2);
            snake.forEach((s, i) => {
                ctx.fillStyle = i === 0 ? '#7cfc7c' : '#5cd65c';
                ctx.fillRect(2 + s.x*S, 2 + s.y*S, S-2, S-2);
            });
            opts.onScore && opts.onScore('分数：' + score);
        };
        const setDir = d => {
            if (d.x === -dir.x && d.y === -dir.y && snake.length > 1) return;
            dir = d;
        };
        const kbd = e => {
            const k = { ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0}, w:{x:0,y:-1}, s:{x:0,y:1}, a:{x:-1,y:0}, d:{x:1,y:0} }[e.key];
            if (k) { e.preventDefault(); setDir(k); }
        };
        window.addEventListener('keydown', kbd);
        let sx, sy;
        c.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; });
        c.addEventListener('touchend', e => {
            const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
            if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? {x:1,y:0} : {x:-1,y:0});
            else setDir(dy > 0 ? {x:0,y:1} : {x:0,y:-1});
        });
        const loop = setInterval(step, 120);
        draw();
        MG.hint(container, '方向键 / 滑动控制蛇移动，吃红色食物加分');
        return { stop() { clearInterval(loop); window.removeEventListener('keydown', kbd); destroy(); } };
    }
};
