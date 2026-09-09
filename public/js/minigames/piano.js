// 别踩白块（钢琴块）：20 关挑战，速度递增 + 目标分递增
window.MiniGames = window.MiniGames || {};
MiniGames.piano = {
    LEVELS: [
        // { name, desc, startSpeed, maxSpeed, target, lanes }
        { name: '散步', desc: '4 列 · 速度 4 · 目标 30 分' },
        { name: '小跑', desc: '4 列 · 速度 5 · 目标 40 分' },
        { name: '快走', desc: '4 列 · 速度 6 · 目标 50 分' },
        { name: '奔跑', desc: '4 列 · 速度 7 · 目标 60 分' },
        { name: '疾步', desc: '4 列 · 速度 8 · 目标 75 分' },
        { name: '冲刺', desc: '4 列 · 速度 10 · 目标 90 分' },
        { name: '加速', desc: '4 列 · 速度 12 · 目标 110 分' },
        { name: '旋风', desc: '4 列 · 速度 14 · 目标 130 分' },
        { name: '狂飙', desc: '4 列 · 速度 16 · 目标 160 分' },
        { name: '风暴', desc: '4 列 · 速度 18 · 目标 190 分' },
        { name: '极限', desc: '4 列 · 速度 21 · 目标 220 分' },
        { name: '地狱', desc: '4 列 · 速度 24 · 目标 260 分' },
        { name: '变态', desc: '5 列 · 速度 22 · 目标 280 分' },
        { name: '魔鬼', desc: '5 列 · 速度 25 · 目标 320 分' },
        { name: '血战', desc: '5 列 · 速度 28 · 目标 380 分' },
        { name: '疯狂', desc: '5 列 · 速度 32 · 目标 440 分' },
        { name: '炼狱', desc: '5 列 · 速度 36 · 目标 500 分' },
        { name: '修罗', desc: '5 列 · 速度 40 · 目标 560 分' },
        { name: '深渊', desc: '5 列 · 速度 45 · 目标 620 分' },
        { name: '钢琴王', desc: '5 列 · 速度 50 · 目标 700 分' },
    ],
    PARAMS: [
        [4, 4, 30], [4, 5, 40], [4, 6, 50], [4, 7, 60], [4, 8, 75],
        [4, 10, 90], [4, 12, 110], [4, 14, 130], [4, 16, 160], [4, 18, 190],
        [4, 21, 220], [4, 24, 260], [5, 22, 280], [5, 25, 320], [5, 28, 380],
        [5, 32, 440], [5, 36, 500], [5, 40, 560], [5, 45, 620], [5, 50, 700],
    ],
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const [LANES, startSpeed, target] = this.PARAMS[idx] || this.PARAMS[0];
        const W = Math.min(container.clientWidth - 16, 380);
        const H = Math.min(window.innerHeight - 200, 480);
        const laneW = W / LANES;
        const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
        let blocks = [], score = 0, alive = true, speed = startSpeed;
        const spawn = () => { blocks.push({ x: MG.ri(0, LANES - 1) * laneW, y: -50, lane: MG.ri(0, LANES - 1), hit: false }); };
        // 预生成首批
        for (let i = 0; i < 4; i++) { spawn(); blocks[blocks.length - 1].y = -i * 100; }
        const step = () => {
            if (!alive) return;
            if (Math.random() < 0.04 + idx * 0.002) spawn();
            for (const b of blocks) b.y += speed;
            blocks = blocks.filter(b => {
                if (b.y > H && !b.hit) {
                    alive = false;
                    const stars = score >= target ? 3 : score >= target * 0.7 ? 2 : score >= target * 0.4 ? 1 : 0;
                    opts.onComplete && opts.onComplete({
                        win: false, stars,
                        lines: ['得分：' + score + ' / 目标 ' + target, lv.desc],
                    });
                    return false;
                }
                if (b.y > H) return false;
                return true;
            });
            draw();
        };
        const draw = () => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#2a2540'; ctx.lineWidth = 1;
            for (let i = 1; i < LANES; i++) { ctx.beginPath(); ctx.moveTo(i * laneW, 0); ctx.lineTo(i * laneW, H); ctx.stroke(); }
            ctx.fillStyle = '#ff5252'; ctx.fillRect(0, H - 60, W, 2);
            for (const b of blocks) {
                ctx.fillStyle = b.hit ? '#888' : '#1a1a1a';
                ctx.fillRect(b.x + 2, b.y, laneW - 4, 48);
                ctx.fillStyle = '#fff';
                ctx.fillRect(b.x + 8, b.y + 8, 4, 4);
                ctx.fillRect(b.x + laneW - 16, b.y + 8, 4, 4);
            }
            opts.onScore && opts.onScore('分数：' + score + ' / ' + target + ' · 速度 ' + speed);
        };
        const onTap = p => {
            if (!alive) return;
            const lane = Math.floor(p.x / laneW);
            for (const b of blocks) {
                if (!b.hit && b.lane === lane && b.y > H - 120 && b.y < H) { b.hit = true; score++; speed = startSpeed + Math.floor(score / 25); draw(); if (score >= target) { alive = false; opts.onComplete && opts.onComplete({ win: true, stars: 3, lines: ['达成目标 ' + score + ' 分！', lv.desc] }); } return; }
            }
            alive = false;
            const stars = score >= target ? 3 : score >= target * 0.7 ? 2 : score >= target * 0.4 ? 1 : 0;
            opts.onComplete && opts.onComplete({
                win: false, stars,
                lines: ['点错了 · ' + score + ' 分', '目标 ' + target, lv.desc],
            });
        };
        MG.bind(c, onTap);
        const loop = setInterval(step, 30);
        draw();
        MG.hint(container, lv.desc + ' · 点击下落的黑块，漏点或点错即结束');
        return { stop() { clearInterval(loop); destroy(); } };
    }
};