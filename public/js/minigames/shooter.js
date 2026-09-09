// 飞机大战：玩家飞机射击陨石，升级武器
window.MiniGames = window.MiniGames || {};
MiniGames.shooter = {
    start(container, opts) {
        const W = 380, H = 500;
        const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
        let ship = { x: W/2, y: H-50, w: 28, h: 30 };
        let bullets = [], enemies = [], score = 0, alive = true, lv = 1, enemyT = 0;
        const draw = () => {
            ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, w, h);
            // 玩家飞机
            ctx.fillStyle = '#5cc7ff';
            ctx.beginPath();
            ctx.moveTo(ship.x, ship.y - ship.h/2);
            ctx.lineTo(ship.x - ship.w/2, ship.y + ship.h/2);
            ctx.lineTo(ship.x, ship.y + ship.h/3);
            ctx.lineTo(ship.x + ship.w/2, ship.y + ship.h/2);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ffd56b'; ctx.fillRect(ship.x - 3, ship.y - ship.h/2, 6, 8);
            // 子弹
            ctx.fillStyle = '#ffd56b';
            bullets.forEach(b => ctx.fillRect(b.x-2, b.y-6, 4, 12));
            // 敌人
            enemies.forEach(e => { ctx.fillStyle = '#ff5252'; ctx.fillRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h); });
            opts.onScore && opts.onScore('分数：' + score + ' · 武器 Lv' + lv);
        };
        const step = () => {
            if (!alive) return;
            enemyT++;
            if (enemyT > Math.max(8, 30 - score/100)) { enemyT = 0; enemies.push({ x: MG.ri(20, W-20), y: -20, w: 22, h: 22, hp: 1 + Math.floor(score/100) }); }
            // 子弹
            for (const b of bullets) b.y -= 8;
            bullets = bullets.filter(b => b.y > 0);
            // 敌人
            for (const e of enemies) e.y += 1.5;
            // 碰撞
            for (const b of bullets) for (const e of enemies) {
                if (b.x > e.x - e.w/2 && b.x < e.x + e.w/2 && b.y > e.y - e.h/2 && b.y < e.y + e.h/2) {
                    b.y = -10; e.hp--;
                    if (e.hp <= 0) { e.y = H+100; score += 10; if (score % 50 === 0) lv = Math.min(5, lv + 1); }
                }
            }
            enemies = enemies.filter(e => e.y < H + 50);
            // 玩家碰撞
            for (const e of enemies) if (Math.abs(ship.x - e.x) < ship.w/2 + e.w/2 && Math.abs(ship.y - e.y) < ship.h/2 + e.h/2) { alive = false; opts.onScore && opts.onScore('💥 撞机！分数：' + score); return; }
            draw();
        };
        const fire = () => { for (let k = 0; k < lv; k++) bullets.push({ x: ship.x + (k - (lv-1)/2) * 8, y: ship.y - 10 }); };
        const kbd = e => { if (e.key === ' ' || e.key === 'j') fire(); };
        window.addEventListener('keydown', kbd);
        const onTap = p => { ship.x = Math.max(15, Math.min(W-15, p.x)); };
        let dragging = false, lastFire = 0;
        c.addEventListener('mousedown', e => { dragging = true; onTap({ x: e.clientX - c.getBoundingClientRect().left }); });
        c.addEventListener('mousemove', e => { if (dragging) onTap({ x: e.clientX - c.getBoundingClientRect().left }); });
        c.addEventListener('touchstart', e => { dragging = true; const t = e.touches[0]; onTap({ x: t.clientX - c.getBoundingClientRect().left }); }, { passive: true });
        c.addEventListener('touchmove', e => { if (dragging) { const t = e.touches[0]; onTap({ x: t.clientX - c.getBoundingClientRect().left }); } }, { passive: true });
        c.addEventListener('touchend', () => { dragging = false; fire(); });
        const loop = setInterval(step, 30);
        const fireLoop = setInterval(fire, 280);
        draw();
        MG.hint(container, '按住移动飞机，自动射击（PC 空格/鼠标点击发射）');
        return { stop() { clearInterval(loop); clearInterval(fireLoop); window.removeEventListener('keydown', kbd); destroy(); } };
    }
};
