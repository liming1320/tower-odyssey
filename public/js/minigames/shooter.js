// 飞机大战：20 关挑战，敌机数/HP 递增
window.MiniGames = window.MiniGames || {};
MiniGames.shooter = {
    LEVELS: [
        // { name, desc, maxEnemies, enemyHP, target, duration }
        { name: '巡航', desc: '1 敌 · HP 1 · 60s 击落 20 架' },
        { name: '巡航 II', desc: '1 敌 · HP 1 · 60s 击落 25 架' },
        { name: '扫荡', desc: '1-2 敌 · HP 1 · 60s 击落 30 架' },
        { name: '扫荡 II', desc: '1-2 敌 · HP 1 · 60s 击落 35 架' },
        { name: '清剿', desc: '2 敌 · HP 1 · 60s 击落 40 架' },
        { name: '清剿 II', desc: '2 敌 · HP 2 · 60s 击落 35 架' },
        { name: '突击', desc: '2 敌 · HP 2 · 60s 击落 40 架' },
        { name: '突击 II', desc: '2 敌 · HP 2 · 60s 击落 45 架' },
        { name: '突袭', desc: '2-3 敌 · HP 2 · 60s 击落 50 架' },
        { name: '突袭 II', desc: '2-3 敌 · HP 3 · 60s 击落 45 架' },
        { name: '空战', desc: '3 敌 · HP 2 · 60s 击落 50 架' },
        { name: '空战 II', desc: '3 敌 · HP 3 · 60s 击落 45 架' },
        { name: '激战', desc: '3-4 敌 · HP 2 · 60s 击落 55 架' },
        { name: '激战 II', desc: '3-4 敌 · HP 3 · 60s 击落 50 架' },
        { name: '血战', desc: '4 敌 · HP 3 · 60s 击落 55 架' },
        { name: '血战 II', desc: '4 敌 · HP 3 · 60s 击落 60 架' },
        { name: '鏖战', desc: '4-5 敌 · HP 3 · 60s 击落 65 架' },
        { name: '鏖战 II', desc: '5 敌 · HP 4 · 60s 击落 60 架' },
        { name: '风暴', desc: '5-6 敌 · HP 4 · 60s 击落 70 架' },
        { name: '王牌飞行员', desc: '6 敌 · HP 5 · 60s 击落 80 架 · 终极' },
    ],
    PARAMS: [
        [1, 1, 20, 60], [1, 1, 25, 60], [2, 1, 30, 60], [2, 1, 35, 60], [2, 1, 40, 60],
        [2, 2, 35, 60], [2, 2, 40, 60], [2, 2, 45, 60], [3, 2, 50, 60], [3, 3, 45, 60],
        [3, 2, 50, 60], [3, 3, 45, 60], [4, 2, 55, 60], [4, 3, 50, 60], [4, 3, 55, 60],
        [4, 3, 60, 60], [5, 3, 65, 60], [5, 4, 60, 60], [6, 4, 70, 60], [6, 5, 80, 60],
    ],
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        // 框架 levelIdx 优先（fillLevels 会生成副本对象导致 indexOf 恒为 -1）
        const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? Math.min(idx, this.PARAMS.length - 1) : (opts.endless ? this.PARAMS.length - 1 : 0);
        const [maxEnemies, hpBase, target, duration] = this.PARAMS[pIdx] || this.PARAMS[0];
        const W = Math.min(container.clientWidth - 16, 400);
        const H = Math.min(window.innerHeight - 200, 500);
        const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
        let ship = { x: W / 2, y: H - 50, w: 28, h: 30 };
        let bullets = [], enemies = [], score = 0, kills = 0, alive = true, lvUp = 1, enemyT = 0, timeLeft = duration;
        const finalize = (win) => {
            const stars = win ? (kills >= target * 1.3 ? 3 : kills >= target ? 2 : 0) : 0;
            opts.onComplete && opts.onComplete({
                win, stars,
                lines: ['击落：' + kills + ' / 目标 ' + target, lv.desc],
            });
        };
        // 星空背景（固定种子，避免每帧闪烁）
        const stars = Array.from({ length: 46 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.4, a: Math.random() * 0.6 + 0.2 }));
        const draw = () => {
            // 深空渐变
            let bg = null;
            try { bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#101a3a'); bg.addColorStop(1, '#060812'); } catch (e) {}
            ctx.fillStyle = bg || '#0a0e1a'; ctx.fillRect(0, 0, w, h);
            // 星星
            for (const s of stars) {
                ctx.fillStyle = `rgba(255,255,255,${s.a})`;
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
            }
            // 玩家：火箭 emoji（朝上）
            MG.ui.emoji(ctx, '🚀', ship.x, ship.y + 2, 34);
            // 子弹：光弹
            for (const b of bullets) {
                ctx.save();
                ctx.shadowColor = '#ffe870'; ctx.shadowBlur = 8;
                let g = null;
                try { g = ctx.createLinearGradient(0, b.y - 8, 0, b.y + 6); g.addColorStop(0, '#fff'); g.addColorStop(1, '#ffb020'); } catch (e) {}
                ctx.fillStyle = g || '#ffd56b';
                MG.ui.rr(ctx, b.x - 2.5, b.y - 8, 5, 14, 2.5); ctx.fill();
                ctx.restore();
            }
            // 敌机：外星人 emoji
            enemies.forEach(e => MG.ui.emoji(ctx, '👾', e.x, e.y, e.w + 8));
            opts.onScore && opts.onScore('击落：' + kills + ' / ' + target + ' · 剩余 ' + timeLeft + 's');
        };
        const step = () => {
            if (!alive) return;
            enemyT++;
            const spawnRate = Math.max(6, 30 - kills / 4);
            if (enemyT > spawnRate) {
                enemyT = 0;
                const count = MG.ri(1, maxEnemies);
                for (let i = 0; i < count; i++) enemies.push({ x: MG.ri(20, W - 20), y: -20, w: 22, h: 22, hp: hpBase + Math.floor(kills / 80) });
            }
            for (const b of bullets) b.y -= 9;
            bullets = bullets.filter(b => b.y > 0);
            for (const e of enemies) e.y += 1.5 + idx * 0.1;
            for (const b of bullets) for (const e of enemies) {
                if (b.x > e.x - e.w / 2 && b.x < e.x + e.w / 2 && b.y > e.y - e.h / 2 && b.y < e.y + e.h / 2) {
                    b.y = -10; e.hp--;
                    if (e.hp <= 0) { e.y = H + 100; score += 10; kills++; try { MG.audio && MG.audio.sfx('coin'); } catch (e) { } if (kills % 30 === 0) lvUp = Math.min(5, lvUp + 1); }
                    break;
                }
            }
            enemies = enemies.filter(e => e.y < H + 50);
            for (const e of enemies) if (Math.abs(ship.x - e.x) < ship.w / 2 + e.w / 2 && Math.abs(ship.y - e.y) < ship.h / 2 + e.h / 2) { alive = false; draw(); finalize(false); return; }
            draw();
        };
        const fire = () => { for (let k = 0; k < lvUp; k++) bullets.push({ x: ship.x + (k - (lvUp - 1) / 2) * 8, y: ship.y - 10 }); };
        const kbd = e => { if (e.key === ' ' || e.key === 'j') fire(); };
        window.addEventListener('keydown', kbd);
        const onTap = p => { ship.x = Math.max(15, Math.min(W - 15, p.x)); };
        let dragging = false;
        c.addEventListener('mousedown', e => { dragging = true; onTap({ x: e.clientX - c.getBoundingClientRect().left }); });
        c.addEventListener('mousemove', e => { if (dragging) onTap({ x: e.clientX - c.getBoundingClientRect().left }); });
        c.addEventListener('touchstart', e => { dragging = true; const t = e.touches[0]; onTap({ x: t.clientX - c.getBoundingClientRect().left }); }, { passive: true });
        c.addEventListener('touchmove', e => { if (dragging) { const t = e.touches[0]; onTap({ x: t.clientX - c.getBoundingClientRect().left }); } }, { passive: true });
        c.addEventListener('touchend', () => { dragging = false; fire(); });
        const loop = setInterval(step, 30);
        const fireLoop = setInterval(fire, 280);
        const timer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) { alive = false; draw(); finalize(kills >= target); }
        }, 1000);
        draw();
        MG.hint(container, lv.desc + ' · 拖动飞机自动射击，空格手动开火');
        return { stop() { clearInterval(loop); clearInterval(fireLoop); clearInterval(timer); window.removeEventListener('keydown', kbd); destroy(); } };
    }
};