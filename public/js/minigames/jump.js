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
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const [basePlatformW, targetScore] = this.PARAMS[idx] || this.PARAMS[0];
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
            ctx.fillStyle = '#f0e8d8'; ctx.fillRect(0, 0, w, h);
            platforms.forEach(p => { ctx.fillStyle = '#8a5732'; ctx.fillRect(p.x, p.y + 18, p.w, 5); });
            ctx.fillStyle = '#5b8cff'; ctx.fillRect(target.x, target.y, target.w, 20);
            ctx.fillStyle = '#ff5252'; ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillRect(player.x - 5, player.y - 16, 10, 12);
            if (charging) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(10, 50, 50, 200);
                ctx.fillStyle = power > 100 ? '#ff5252' : '#5cd65c';
                ctx.fillRect(10, 250 - power * 2, 50, power * 2);
                ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText('蓄力', 35, 30);
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