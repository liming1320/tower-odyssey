// 打砖块：挡板 + 球，消砖得分
window.MiniGames = window.MiniGames || {};
MiniGames.breakout = {
    start(container, opts) {
        const W = 380, H = 480;
        const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
        const COLORS = ['#ff5252','#ff9d5c','#ffd56b','#5cd65c','#5cc7ff','#b78bff'];
        let ball = { x: W/2, y: H-50, vx: 3, vy: -3, r: 6 };
        let paddle = { x: W/2 - 35, y: H-20, w: 70, h: 8 };
        let bricks = [], score = 0, lives = 3, alive = true;
        const init = () => {
            bricks = [];
            for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) bricks.push({ x: 5 + c*47, y: 30 + r*20, w: 44, h: 16, color: COLORS[r], alive: true });
        };
        init();
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            for (const b of bricks) if (b.alive) { ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h); }
            ctx.fillStyle = '#fff'; ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
            ctx.fillStyle = '#ffd56b'; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
            opts.onScore && opts.onScore('分数：' + score + ' · 命 ' + lives);
        };
        const step = () => {
            if (!alive) return;
            ball.x += ball.vx; ball.y += ball.vy;
            if (ball.x < ball.r || ball.x > W-ball.r) ball.vx = -ball.vx;
            if (ball.y < ball.r) ball.vy = -ball.vy;
            if (ball.y > H) { lives--; if (lives <= 0) { alive = false; opts.onScore && opts.onScore('💀 球掉了！分数：' + score); return; } ball.x = W/2; ball.y = H-50; ball.vy = -3; }
            // 挡板
            if (ball.y > paddle.y - ball.r && ball.y < paddle.y && ball.x > paddle.x && ball.x < paddle.x + paddle.w) ball.vy = -Math.abs(ball.vy);
            // 砖
            for (const b of bricks) {
                if (!b.alive) continue;
                if (ball.x > b.x && ball.x < b.x+b.w && ball.y > b.y && ball.y < b.y+b.h) {
                    b.alive = false; score += 10; ball.vy = -ball.vy; break;
                }
            }
            if (!bricks.some(b => b.alive)) { alive = false; opts.onScore && opts.onScore('🏆 全部清空！分数：' + score); return; }
            draw();
        };
        const onTap = p => {
            paddle.x = Math.max(0, Math.min(W - paddle.w, p.x - paddle.w/2));
        };
        let sx, dragging = false;
        c.addEventListener('mousedown', e => { dragging = true; onTap({ x: e.clientX - c.getBoundingClientRect().left, y: 0 }); });
        c.addEventListener('mousemove', e => { if (dragging) onTap({ x: e.clientX - c.getBoundingClientRect().left, y: 0 }); });
        c.addEventListener('mouseup', () => dragging = false);
        c.addEventListener('touchstart', e => { dragging = true; const t = e.touches[0]; onTap({ x: t.clientX - c.getBoundingClientRect().left, y: 0 }); }, { passive: true });
        c.addEventListener('touchmove', e => { if (dragging) { const t = e.touches[0]; onTap({ x: t.clientX - c.getBoundingClientRect().left, y: 0 }); } }, { passive: true });
        c.addEventListener('touchend', () => dragging = false);
        const loop = setInterval(step, 20);
        draw();
        MG.hint(container, '按住/拖动控制挡板，接球消砖');
        return { stop() { clearInterval(loop); destroy(); } };
    }
};
