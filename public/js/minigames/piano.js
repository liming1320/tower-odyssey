// 别踩白块（钢琴块）：4 车道，下落黑块点掉，碰到白块或漏点即结束
window.MiniGames = window.MiniGames || {};
MiniGames.piano = {
    start(container, opts) {
        const W = 360, H = 480, LANES = 4;
        const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
        const laneW = W / LANES;
        let blocks = [], score = 0, alive = true, speed = 4, lastT = 0;
        const spawn = () => {
            const lane = MG.ri(0, LANES-1);
            blocks.push({ x: lane*laneW, y: -50, lane, hit: false });
        };
        const step = () => {
            if (!alive) return;
            if (Math.random() < 0.04) spawn();
            for (const b of blocks) b.y += speed;
            // 移出屏幕底部且未击中 = 漏点
            blocks = blocks.filter(b => {
                if (b.y > H && !b.hit) { alive = false; opts.onScore && opts.onScore('💥 漏点了！分数：' + score); return false; }
                if (b.y > H) return false;
                return true;
            });
            // 速度随分数提升
            speed = 4 + Math.floor(score / 20);
            draw();
        };
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            // 车道分隔
            ctx.strokeStyle = '#2a2540'; ctx.lineWidth = 1;
            for (let i = 1; i < LANES; i++) { ctx.beginPath(); ctx.moveTo(i*laneW, 0); ctx.lineTo(i*laneW, H); ctx.stroke(); }
            // 底部判定线
            ctx.fillStyle = '#ff5252'; ctx.fillRect(0, H - 60, W, 2);
            for (const b of blocks) {
                ctx.fillStyle = b.hit ? '#888' : '#1a1a1a';
                ctx.fillRect(b.x + 2, b.y, laneW - 4, 48);
                // 顶部白点装饰（让"白块"概念明确）
                ctx.fillStyle = '#fff';
                ctx.fillRect(b.x + 8, b.y + 8, 4, 4);
                ctx.fillRect(b.x + laneW - 16, b.y + 8, 4, 4);
            }
            opts.onScore && opts.onScore('分数：' + score + ' · 速度 ' + speed);
        };
        const onTap = p => {
            if (!alive) return;
            const lane = Math.floor(p.x / laneW);
            for (const b of blocks) {
                if (!b.hit && b.lane === lane && b.y > H - 120 && b.y < H) { b.hit = true; score++; return; }
            }
            // 点到空白 = 错误
            alive = false; opts.onScore && opts.onScore('💥 点错了！分数：' + score);
        };
        MG.bind(c, onTap);
        const loop = setInterval(step, 30);
        draw();
        MG.hint(container, '点击下落的黑块，漏点或点错即结束');
        return { stop() { clearInterval(loop); destroy(); } };
    }
};
