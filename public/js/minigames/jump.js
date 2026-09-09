// 跳一跳：蓄力跳跃小游戏，按住蓄力松开跳跃，精准定距
window.MiniGames = window.MiniGames || {};
MiniGames.jump = {
    start(container, opts) {
        const W = 380, H = 500;
        const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
        let player = { x: 80, y: H - 80, r: 18 };
        let target = { x: 200, y: H - 80, w: 60 };
        let power = 0, charging = false, score = 0, alive = true;
        const platforms = [{ x: 50, y: H - 80, w: 80 }];
        const draw = () => {
            ctx.fillStyle = '#f0e8d8'; ctx.fillRect(0, 0, w, h);
            // 平台
            platforms.forEach(p => { ctx.fillStyle = '#8a5732'; ctx.fillRect(p.x, p.y + 22, p.w, 6); });
            ctx.fillStyle = '#5b8cff'; ctx.fillRect(target.x, target.y, target.w, 22);
            // 玩家
            ctx.fillStyle = '#ff5252'; ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillRect(player.x - 6, player.y - 22, 12, 16);
            // 蓄力条
            if (charging) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(10, 50, 50, 200);
                ctx.fillStyle = power > 100 ? '#ff5252' : '#5cd65c';
                ctx.fillRect(10, 250 - power*2, 50, power*2);
                ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText('蓄力', 35, 30);
            }
            opts.onScore && opts.onScore('分数：' + score);
        };
        const step = () => {
            if (charging && power < 120) { power += 2.5; draw(); }
        };
        const jump = () => {
            if (!alive) return;
            const dist = power * 3;
            const targetX = player.x + dist;
            const newPlat = { x: player.x, y: H - 80, w: 80 };
            platforms.push(newPlat);
            // 找落脚点
            const hitPlat = platforms.find(p => targetX > p.x && targetX < p.x + p.w);
            if (hitPlat) {
                player.x = targetX; score++;
                if (score % 5 === 0) { target.w = Math.max(30, target.w - 5); }
                if (score > 10) { target.y -= 4; }
            } else {
                alive = false; opts.onScore && opts.onScore('💀 掉下去了！分数：' + score);
            }
            power = 0; charging = false; draw();
        };
        const onTap = (down) => { if (down) { if (!alive) { alive = true; score = 0; platforms.length = 0; platforms.push({ x: 50, y: H-80, w: 80 }); player = { x: 80, y: H-80, r: 18 }; target = { x: 200, y: H-80, w: 60 }; draw(); return; } charging = true; power = 0; } else { if (charging) jump(); } };
        c.addEventListener('mousedown', () => onTap(true));
        c.addEventListener('mouseup', () => onTap(false));
        c.addEventListener('touchstart', e => { e.preventDefault(); onTap(true); }, { passive: false });
        c.addEventListener('touchend', e => { e.preventDefault(); onTap(false); }, { passive: false });
        const loop = setInterval(step, 30);
        draw();
        MG.hint(container, '按住蓄力，松开跳跃，精准落到平台得分');
        return { stop() { clearInterval(loop); destroy(); } };
    }
};
