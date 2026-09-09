// 打砖块：20 关挑战，砖块行数/球速递增
window.MiniGames = window.MiniGames || {};
MiniGames.breakout = {
    LEVELS: [
        // { name, desc, rows, cols, ballSpeed, target }
        { name: '练习', desc: '4 行 · 球速 4 · 清砖获胜' },
        { name: '练习 II', desc: '4 行 · 球速 4.5' },
        { name: '入门', desc: '5 行 · 球速 5' },
        { name: '入门 II', desc: '5 行 · 球速 5.5' },
        { name: '小成', desc: '6 行 · 球速 5' },
        { name: '小成 II', desc: '6 行 · 球速 5.5' },
        { name: '熟练', desc: '6 行 · 球速 6' },
        { name: '稳健', desc: '7 行 · 球速 5.5' },
        { name: '进阶', desc: '7 行 · 球速 6' },
        { name: '进阶 II', desc: '8 行 · 球速 6' },
        { name: '挑战', desc: '8 行 · 球速 6.5' },
        { name: '挑战 II', desc: '8 行 · 球速 7' },
        { name: '高手', desc: '9 行 · 球速 6.5' },
        { name: '高手 II', desc: '9 行 · 球速 7' },
        { name: '冲刺', desc: '10 行 · 球速 7' },
        { name: '冲刺 II', desc: '10 行 · 球速 7.5' },
        { name: '宗匠', desc: '10 行 · 球速 8' },
        { name: '魔鬼', desc: '11 行 · 球速 7.5' },
        { name: '极限', desc: '12 行 · 球速 8' },
        { name: '砖块王', desc: '12 行 · 球速 9 · 终极' },
    ],
    PARAMS: [
        [4, 8, 4, 32], [4, 8, 4.5, 32], [5, 8, 5, 40], [5, 8, 5.5, 40],
        [6, 8, 5, 48], [6, 8, 5.5, 48], [6, 8, 6, 48], [7, 8, 5.5, 56],
        [7, 8, 6, 56], [8, 8, 6, 64], [8, 8, 6.5, 64], [8, 8, 7, 64],
        [9, 9, 6.5, 81], [9, 9, 7, 81], [10, 9, 7, 90], [10, 9, 7.5, 90],
        [10, 10, 8, 100], [11, 10, 7.5, 110], [12, 10, 8, 120], [12, 10, 9, 120],
    ],
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? idx : (opts.endless ? this.PARAMS.length - 1 : 0);
        const [rows, cols, ballSpd, target] = this.PARAMS[pIdx] || this.PARAMS[0];
        const W = Math.min(container.clientWidth - 16, 400);
        const H = Math.min(window.innerHeight - 200, 480);
        const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
        const COLORS = ['#ff5252', '#ff9d5c', '#ffd56b', '#5cd65c', '#5cc7ff', '#b78bff', '#ff7a8b', '#5b8cff', '#7adf7a', '#9aa2b5', '#5cd65c', '#ff5252'];
        let ball = { x: W / 2, y: H - 50, vx: ballSpd * 0.7, vy: -ballSpd, r: 6 };
        let paddle = { x: W / 2 - 35, y: H - 20, w: 70, h: 8 };
        let bricks = [], score = 0, lives = 3, alive = true, won = false;
        const init = () => {
            bricks = [];
            const bw = (W - 10) / cols - 2;
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bricks.push({ x: 5 + c * (bw + 2), y: 30 + r * 18, w: bw, h: 14, color: COLORS[r % COLORS.length], alive: true });
        };
        init();
        const finalize = (win) => {
            won = true;
            const stars = win ? (lives >= 3 ? 3 : lives >= 2 ? 2 : 1) : 0;
            opts.onComplete && opts.onComplete({
                win, stars,
                lines: ['分数：' + score + ' / 目标 ' + target, '剩余命数：' + lives, lv.desc],
            });
        };
        const draw = () => {
            MG.ui.board(ctx, w, h);
            // 砖块：圆角渐变 + 高光 + 描边
            for (const b of bricks) if (b.alive) {
                const DARK = { '#ff5252': '#b02020', '#ff9d5c': '#c06020', '#ffd56b': '#b08a10', '#5cd65c': '#2a8a30', '#5cc7ff': '#2080b0', '#b78bff': '#6a48b0', '#ff7a8b': '#c04050', '#5b8cff': '#2a50b0', '#7adf7a': '#3a9a40', '#9aa2b5': '#5a6070' };
                MG.ui.rr(ctx, b.x, b.y, b.w, b.h, 4);
                let g = null;
                try { g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, b.color); g.addColorStop(1, DARK[b.color] || b.color); } catch (e) {}
                ctx.fillStyle = g || b.color; ctx.fill();
                ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
                MG.ui.rr(ctx, b.x + 2, b.y + 1.5, b.w - 4, b.h * 0.32, 2);
                ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
            }
            // 挡板：白→浅蓝渐变圆角
            MG.ui.rr(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 4);
            let pg = null;
            try { pg = ctx.createLinearGradient(0, paddle.y, 0, paddle.y + paddle.h); pg.addColorStop(0, '#fff'); pg.addColorStop(1, '#8ac8ff'); } catch (e) {}
            ctx.fillStyle = pg || '#fff'; ctx.fill();
            // 球：金色 + 光晕
            ctx.save();
            ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 12;
            let bg2 = null;
            try { bg2 = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r); bg2.addColorStop(0, '#fff8d0'); bg2.addColorStop(1, '#ffb020'); } catch (e) {}
            ctx.fillStyle = bg2 || '#ffd56b';
            ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            opts.onScore && opts.onScore('分数：' + score + ' / ' + target + ' · 命 ' + lives);
        };
        const step = () => {
            if (!alive || won) return;
            ball.x += ball.vx; ball.y += ball.vy;
            if (ball.x < ball.r || ball.x > W - ball.r) ball.vx = -ball.vx;
            if (ball.y < ball.r) ball.vy = -ball.vy;
            if (ball.y > H) {
                lives--; if (lives <= 0) { alive = false; draw(); finalize(false); return; }
                ball.x = W / 2; ball.y = H - 50; ball.vy = -ballSpd;
            }
            if (ball.y > paddle.y - ball.r && ball.y < paddle.y && ball.x > paddle.x && ball.x < paddle.x + paddle.w) ball.vy = -Math.abs(ball.vy);
            for (const b of bricks) {
                if (!b.alive) continue;
                if (ball.x > b.x && ball.x < b.x + b.w && ball.y > b.y && ball.y < b.y + b.h) {
                    b.alive = false; score += 10; ball.vy = -ball.vy; break;
                }
            }
            if (!bricks.some(b => b.alive)) { alive = false; draw(); finalize(true); return; }
            draw();
        };
        const onTap = p => { paddle.x = Math.max(0, Math.min(W - paddle.w, p.x - paddle.w / 2)); };
        let sx, dragging = false;
        c.addEventListener('mousedown', e => { dragging = true; onTap({ x: e.clientX - c.getBoundingClientRect().left, y: 0 }); });
        c.addEventListener('mousemove', e => { if (dragging) onTap({ x: e.clientX - c.getBoundingClientRect().left, y: 0 }); });
        c.addEventListener('mouseup', () => dragging = false);
        c.addEventListener('touchstart', e => { dragging = true; const t = e.touches[0]; onTap({ x: t.clientX - c.getBoundingClientRect().left, y: 0 }); }, { passive: true });
        c.addEventListener('touchmove', e => { if (dragging) { const t = e.touches[0]; onTap({ x: t.clientX - c.getBoundingClientRect().left, y: 0 }); } }, { passive: true });
        c.addEventListener('touchend', () => dragging = false);
        const loop = setInterval(step, 20);
        draw();
        MG.hint(container, lv.desc + ' · 拖动控制挡板接球消砖');
        return { stop() { clearInterval(loop); destroy(); } };
    }
};