// 贪吃蛇对战：同一棋盘两条蛇，吃 🍎 成长；撞墙/自身/对手身体即亡，头对头同归于尽。
// 状态同步：各自广播蛇身+方向+分数；食物由吃到方广播新位置，双端一致。
// 结果语义：commit 的 over 为「发送方视角」——0=发送方负、1=发送方胜、2=平局；
// 接收方按其取反映射（发送方负 → 我胜）。
window.MiniGames = window.MiniGames || {};
(function () {
    const COLS = 17, ROWS = 17, S = 30;
    const W = COLS * S, H = ROWS * S;
    const SPEED = 140;                    // ms/步

    MiniGames['snakepvp'] = {
        LEVELS: [{ name: '蛇王争霸', desc: '双人同盘 · 吃苹果成长 · 存活到最后' }],
        start(container, opts) {
            opts = opts || {};
            const id = 'snakepvp';
            const net = !!(MG.pvp && MG.pvp.shouldBegin && MG.pvp.shouldBegin(id));
            if (!net) {
                container.innerHTML = '<div style="padding:30px;color:#cdd;text-align:center;font-size:14px">🐍 贪吃蛇对战为<b>联机对战专属</b>小游戏<br>请从小游戏列表「🌐 联网对战」分类进入，与好友一决高下。</div>';
                return { stop() {} };
            }
            const mySide = (MG.pvp._armed && MG.pvp._armed.side) || 0;
            const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
            const sx = mySide === 0 ? 4 : COLS - 5, sy = (ROWS / 2) | 0;
            const dir0 = mySide === 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
            let snake = [{ x: sx, y: sy }];
            for (let i = 1; i < 3; i++) snake.push({ x: sx - dir0.x * i, y: sy - dir0.y * i });
            let dir = { x: 0, y: 0 }, nextDir = { x: 0, y: 0 };
            let opp = { snake: [{ x: -1, y: -1 }], score: 0 };
            let food = null, over = false, score = 0;

            const spawnFood = (avoid) => {
                const occ = new Set((avoid || []).map(s => s.x + ',' + s.y));
                while (true) {
                    const f = { x: MG.ri(0, COLS - 1), y: MG.ri(0, ROWS - 1) };
                    if (!occ.has(f.x + ',' + f.y)) return f;
                }
            };
            if (mySide === 0) food = spawnFood(snake.concat(opp.snake));

            const applyRemote = (m) => {
                if (!m) return;
                if (m.snake) opp.snake = m.snake;
                if (typeof m.score === 'number') opp.score = m.score;
                if (m.food) food = m.food;
                if (m.over != null) finish(m.over === 0 ? 1 : m.over === 1 ? 0 : 2);  // 取反映射
            };

            const setDir = d => { if (d.x === -dir.x && d.y === -dir.y && snake.length > 1) return; nextDir = d; };

            const step = () => {
                if (over) return;
                if (!nextDir.x && !nextDir.y) return;     // 等首次输入
                dir = nextDir;
                const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
                let dead = false, tie = false;
                if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) dead = true;
                else if (snake.some(s => s.x === head.x && s.y === head.y)) dead = true;
                else if (opp.snake.some(s => s.x === head.x && s.y === head.y)) dead = true;
                if (!dead && opp.snake[0] && opp.snake[0].x === head.x && opp.snake[0].y === head.y) { dead = true; tie = true; }
                if (dead) { over = true; MG.pvp.commit({ snake, score, food, over: tie ? 2 : 0 }); finish(tie ? 2 : 0); return; }
                snake.unshift(head);
                if (food && head.x === food.x && head.y === food.y) {
                    score++;
                    const nf = spawnFood(snake.concat(opp.snake));
                    food = nf;
                } else snake.pop();
                MG.pvp.commit({ snake, score, food });
                draw();
            };

            const finish = (code) => {   // code: 1 胜 / 0 负 / 2 平
                if (over) return; over = true;
                opts.onComplete && opts.onComplete({
                    win: code === 1, stars: code === 1 ? 3 : (code === 2 ? 1 : 0),
                    title: code === 1 ? '🏆 你赢了！' : (code === 2 ? '🤝 平局' : '💥 你被击败…'),
                    lines: [`长度 ${snake.length} · 得分 ${score}`, `对手长度 ${opp.snake.length >= 0 ? opp.snake.length : 0} · ${opp.score}`],
                });
                draw();
            };

            const kbd = e => {
                const k = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 } }[(e.key || '').toLowerCase()];
                if (k) { e.preventDefault(); setDir(k); }
            };
            window.addEventListener('keydown', kbd);
            let tsx = 0, tsy = 0;
            c.addEventListener('touchstart', e => { const t = e.touches[0]; tsx = t.clientX; tsy = t.clientY; }, { passive: true });
            c.addEventListener('touchend', e => {
                const t = e.changedTouches[0]; const dx = t.clientX - tsx, dy = t.clientY - tsy;
                if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
                if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 }); else setDir(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
            }, { passive: true });

            const loop = setInterval(step, SPEED);

            const draw = () => {
                MG.ui.board(ctx, w, h);
                if (food) { ctx.save(); ctx.shadowColor = '#ff5252'; ctx.shadowBlur = 10; MG.ui.emoji(ctx, '🍎', 2 + food.x * S + S / 2 - 1, 2 + food.y * S + S / 2, S * 0.85); ctx.restore(); }
                const drawSnake = (sn, headCol, bodyCol) => {
                    sn.forEach((s, i) => {
                        if (s.x < 0) return;
                        const x = 2 + s.x * S, y = 2 + s.y * S;
                        ctx.fillStyle = i === 0 ? headCol : bodyCol;
                        ctx.beginPath();
                        if (ctx.roundRect) ctx.roundRect(x + 3, y + 3, S - 6, S - 6, 7); else ctx.rect(x + 3, y + 3, S - 6, S - 6);
                        ctx.fill();
                    });
                };
                drawSnake(opp.snake, '#ff9d6b', '#c87a5a');
                drawSnake(snake, '#ffe066', '#5ad45a');
                opts.onScore && opts.onScore(`你 长度 ${snake.length} · ${score} 分 · 对手 长度 ${(opp.snake[0] && opp.snake[0].x >= 0 ? opp.snake.length : 0)} · ${opp.score} 分`);
            };

            MG.pvp.begin({ setState: applyRemote, onOver(r) { finish(r === 0 ? 1 : r === 1 ? 0 : 2); } });
            if (mySide === 0) MG.pvp.commit({ snake, score: 0, food });   // 房主首发食物+蛇身，确保对手开局即见
            draw();
            MG.hint(container, '方向键/滑动控制 · 吃 🍎 成长 · 撞墙/自身/对手即亡');

            if (typeof window !== 'undefined' && window.__MG_TEST) {
                window.__snakepvp = {
                    get over() { return over; }, get snake() { return snake; }, step, setDir,
                    get food() { return food; }, applyRemote, get score() { return score; }, get opp() { return opp.snake; },
                };
            }
            return { stop() { clearInterval(loop); window.removeEventListener('keydown', kbd); destroy(); MG.pvp.end(); } };
        },
    };
})();
