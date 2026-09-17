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
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        // 框架 levelIdx 优先（fillLevels 会生成副本对象导致 indexOf 恒为 -1）
        const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? Math.min(idx, this.PARAMS.length - 1) : (opts.endless ? this.PARAMS.length - 1 : 0);
        const [LANES, startSpeed, target] = this.PARAMS[pIdx] || this.PARAMS[0];
        const W = Math.min(container.clientWidth - 16, 380);
        const H = Math.min(window.innerHeight - 200, 480);
        const laneW = W / LANES;
        try { MG.audio && MG.audio.unlock && MG.audio.unlock(); } catch (e) { }
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
            // 钢琴键盘背景：白键列 + 分割线
            let bg = null;
            try { bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2e2a40'); bg.addColorStop(1, '#1a1628'); } catch (e) {}
            ctx.fillStyle = bg || '#241f38'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < LANES; i++) {
                ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)';
                ctx.fillRect(i * laneW, 0, laneW, H);
                ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(i * laneW, 0); ctx.lineTo(i * laneW, H); ctx.stroke();
            }
            // 底部判定线：霓虹红
            ctx.save();
            ctx.shadowColor = '#ff3860'; ctx.shadowBlur = 8;
            ctx.fillStyle = '#ff3860'; ctx.fillRect(0, H - 60, W, 3);
            ctx.restore();
            for (const b of blocks) {
                // 黑键：圆角 + 亮边 + 点击反馈
                MG.ui.rr(ctx, b.x + 3, b.y, laneW - 6, 48, 8);
                ctx.fillStyle = b.hit ? '#3a8a4a' : '#15151e';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = b.hit ? '#7adf7a' : '#4a4862';
                ctx.stroke();
                if (!b.hit) {   // 琴键高光点
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.beginPath(); ctx.arc(b.x + laneW - 14, b.y + 10, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(b.x + 14, b.y + 10, 2.5, 0, Math.PI * 2); ctx.fill();
                }
            }
            opts.onScore && opts.onScore('分数：' + score + ' / ' + target + ' · 速度 ' + speed);
        };
        const NOTES = [523.25, 587.33, 659.25, 698.46, 783.99];
        const onTap = p => {
            if (!alive) return;
            const lane = Math.floor(p.x / laneW);
            for (const b of blocks) {
                if (!b.hit && b.lane === lane && b.y > H - 120 && b.y < H) { b.hit = true; score++; speed = startSpeed + Math.floor(score / 25); try { MG.audio && MG.audio.tone({ freq: NOTES[b.lane % NOTES.length], dur: 0.12, type: 'triangle', gain: 0.18 }); } catch (e) { } draw(); if (score >= target) { alive = false; try { MG.audio && MG.audio.sfx('levelup'); } catch (e) { } opts.onComplete && opts.onComplete({ win: true, stars: 3, lines: ['达成目标 ' + score + ' 分！', lv.desc] }); } return; }
            }
            alive = false;
            try { MG.audio && MG.audio.sfx('fail'); } catch (e) { }
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