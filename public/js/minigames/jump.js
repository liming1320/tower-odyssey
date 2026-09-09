// 跳一跳：20 关挑战，平台宽度递减 + 目标分递增
window.MiniGames = window.MiniGames || {};
MiniGames.jump = {
    LEVELS: [
        // { name, desc, platformW, target }
        { name: '散步', desc: '平台宽 90 · 目标 5 个' },
        { name: '小跑', desc: '平台宽 80 · 目标 6 个' },
        { name: '入门', desc: '平台宽 70 · 目标 8 个' },
        { name: '熟练', desc: '平台宽 65 · 目标 10 个' },
        { name: '小成', desc: '平台宽 60 · 目标 12 个' },
        { name: '稳健', desc: '平台宽 55 · 目标 14 个' },
        { name: '进阶', desc: '平台宽 50 · 目标 16 个' },
        { name: '进阶 II', desc: '平台宽 45 · 目标 18 个' },
        { name: '挑战', desc: '平台宽 40 · 目标 20 个' },
        { name: '挑战 II', desc: '平台宽 38 · 目标 22 个' },
        { name: '高手', desc: '平台宽 36 · 目标 25 个' },
        { name: '高手 II', desc: '平台宽 34 · 目标 28 个' },
        { name: '冲刺', desc: '平台宽 32 · 目标 32 个' },
        { name: '疾速', desc: '平台宽 30 · 目标 36 个' },
        { name: '魔鬼', desc: '平台宽 28 · 目标 40 个' },
        { name: '魔鬼 II', desc: '平台宽 26 · 目标 45 个' },
        { name: '宗匠', desc: '平台宽 24 · 目标 50 个' },
        { name: '宗匠 II', desc: '平台宽 22 · 目标 55 个' },
        { name: '极限', desc: '平台宽 20 · 目标 60 个' },
        { name: '跳一跳王', desc: '平台宽 18 · 目标 65 个 · 终极' },
    ],
    PARAMS: [
        [90, 5], [80, 6], [70, 8], [65, 10], [60, 12],
        [55, 14], [50, 16], [45, 18], [40, 20], [38, 22],
        [36, 25], [34, 28], [32, 32], [30, 36], [28, 40],
        [26, 45], [24, 50], [22, 55], [20, 60], [18, 65],
    ],
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        // 框架 levelIdx 优先（fillLevels 会生成副本对象导致 indexOf 恒为 -1）
        const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? Math.min(idx, this.PARAMS.length - 1) : (opts.endless ? this.PARAMS.length - 1 : 0);
        const [basePlatformW, targetScore] = this.PARAMS[pIdx] || this.PARAMS[0];
        const W = Math.min(container.clientWidth - 16, 400);
        const H = Math.min(window.innerHeight - 200, 500);
        const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
        let player = { x: 60, y: H - 60, r: 14 };
        let target = { x: 150, y: H - 60, w: basePlatformW };
        let power = 0, charging = false, score = 0, alive = true;
        const platforms = [{ x: 30, y: H - 60, w: 60 }];
        const finalize = (win) => {
            const stars = win ? (score >= targetScore + 5 ? 3 : score >= targetScore ? 2 : 0) : 0;
            opts.onComplete && opts.onComplete({
                win, stars,
                lines: ['得分：' + score + ' / 目标 ' + targetScore, lv.desc],
            });
        };
        const draw = () => {
            // 天空渐变背景
            let bg = null;
            try { bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#aee2ff'); bg.addColorStop(0.7, '#e8f6ff'); bg.addColorStop(1, '#d8e8c8'); } catch (e) {}
            ctx.fillStyle = bg || '#e8f4fc'; ctx.fillRect(0, 0, w, h);
            // 远山装饰
            ctx.fillStyle = 'rgba(120,180,140,0.35)';
            ctx.beginPath(); ctx.moveTo(0, H - 50); ctx.quadraticCurveTo(W * 0.25, H - 130, W * 0.5, H - 50); ctx.quadraticCurveTo(W * 0.75, H - 110, W, H - 50); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
            // 平台：草绿渐变顶面 + 土色支柱
            platforms.forEach(p => {
                ctx.fillStyle = '#8a6a42'; ctx.fillRect(p.x + p.w * 0.2, p.y + 18, 6, 26);
                ctx.fillStyle = '#8a6a42'; ctx.fillRect(p.x + p.w * 0.72, p.y + 18, 6, 26);
                let g = null;
                try { g = ctx.createLinearGradient(0, p.y, 0, p.y + 18); g.addColorStop(0, '#8ae07a'); g.addColorStop(1, '#3a9a3a'); } catch (e) {}
                MG.ui.rr(ctx, p.x, p.y, p.w, 18, 6);
                ctx.fillStyle = g || '#5cd65c'; ctx.fill();
                ctx.lineWidth = 1.5; ctx.strokeStyle = '#2e7a2e'; ctx.stroke();
                MG.ui.rr(ctx, p.x + 3, p.y + 2, p.w - 6, 5, 3);
                ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
            });
            // 目标平台：金色发光提示
            ctx.save();
            ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 14;
            let tg = null;
            try { tg = ctx.createLinearGradient(0, target.y, 0, target.y + 20); tg.addColorStop(0, '#ffe896'); tg.addColorStop(1, '#d0a020'); } catch (e) {}
            MG.ui.rr(ctx, target.x, target.y, target.w, 20, 6);
            ctx.fillStyle = tg || '#ffd56b'; ctx.fill();
            ctx.restore();
            ctx.lineWidth = 2; ctx.strokeStyle = '#8f6a10';
            MG.ui.rr(ctx, target.x, target.y, target.w, 20, 6); ctx.stroke();
            // 玩家：Q 版红色弹球小人（渐变+高光+眼睛）
            let pg = null;
            try { pg = ctx.createRadialGradient(player.x - 4, player.y - 5, 2, player.x, player.y, player.r); pg.addColorStop(0, '#ff9a8a'); pg.addColorStop(1, '#d02828'); } catch (e) {}
            ctx.fillStyle = pg || '#ff5252';
            ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(player.x - 4, player.y - 4, 3.6, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(player.x + 4, player.y - 4, 3.6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#1a1a28';
            ctx.beginPath(); ctx.arc(player.x - 3.4, player.y - 3.4, 1.8, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(player.x + 4.6, player.y - 3.4, 1.8, 0, Math.PI * 2); ctx.fill();
            // 蓄力条
            if (charging) {
                MG.ui.rr(ctx, 10, 50, 22, 200, 8);
                ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
                const ph = Math.min(power, 120) * 1.6;
                MG.ui.rr(ctx, 12, 248 - ph, 18, ph - 2, 6);
                let cg = null;
                try { cg = ctx.createLinearGradient(0, 248 - ph, 0, 248); cg.addColorStop(0, power > 100 ? '#ff5252' : '#8ae87a'); cg.addColorStop(1, power > 100 ? '#a02020' : '#2a8a30'); } catch (e) {}
                ctx.fillStyle = cg || '#5cd65c'; ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
                ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.strokeText('蓄力', 21, 40); ctx.fillText('蓄力', 21, 40);
            }
            opts.onScore && opts.onScore('分数：' + score + ' / 目标 ' + targetScore);
        };
        const step = () => { if (charging && power < 120) { power += 2.5; draw(); } };
        const jump = () => {
            if (!alive) return;
            const dist = power * 2.5;
            const targetX = player.x + dist;
            platforms.push({ x: targetX - target.w / 2, y: H - 60, w: target.w });
            const hitPlat = platforms.find(p => targetX > p.x + 8 && targetX < p.x + p.w - 8);
            if (hitPlat) {
                player.x = targetX; score++;
                if (score >= targetScore) { alive = false; draw(); finalize(true); return; }
                target.x = player.x + 100 + Math.random() * 60;
                target.w = Math.max(18, basePlatformW - Math.floor(score / 3));
            } else {
                alive = false; draw(); finalize(false); return;
            }
            power = 0; charging = false; draw();
        };
        const onTap = (down) => { if (down) { if (!alive) { alive = true; score = 0; platforms.length = 0; platforms.push({ x: 30, y: H - 60, w: 60 }); player = { x: 60, y: H - 60, r: 14 }; target = { x: 150, y: H - 60, w: basePlatformW }; draw(); return; } charging = true; power = 0; } else { if (charging) jump(); } };
        c.addEventListener('mousedown', () => onTap(true));
        c.addEventListener('mouseup', () => onTap(false));
        c.addEventListener('touchstart', e => { e.preventDefault(); onTap(true); }, { passive: false });
        c.addEventListener('touchend', e => { e.preventDefault(); onTap(false); }, { passive: false });
        const loop = setInterval(step, 30);
        draw();
        MG.hint(container, lv.desc + ' · 按住蓄力，松开跳跃，精准落点得分');
        return { stop() { clearInterval(loop); destroy(); } };
    }
};