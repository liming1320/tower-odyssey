// 反应力测试：20 关挑战，轮数/等待时长递减（更难判断）
window.MiniGames = window.MiniGames || {};
MiniGames.reaction = {
    LEVELS: [
        // { name, desc, rounds, waitMin, waitMax, star3, star2, star1 }
        { name: '热身', desc: '5 轮 · 等待 1-3s' },
        { name: '入门', desc: '5 轮 · 等待 0.8-2.5s' },
        { name: '初阶', desc: '6 轮 · 等待 0.8-2.5s' },
        { name: '熟练', desc: '6 轮 · 等待 0.7-2.2s' },
        { name: '稳健', desc: '7 轮 · 等待 0.7-2.2s' },
        { name: '进阶', desc: '7 轮 · 等待 0.6-2s' },
        { name: '提速', desc: '8 轮 · 等待 0.6-2s' },
        { name: '高手', desc: '8 轮 · 等待 0.5-1.8s' },
        { name: '冲刺', desc: '9 轮 · 等待 0.5-1.8s' },
        { name: '闪电', desc: '9 轮 · 等待 0.5-1.6s' },
        { name: '疾速', desc: '10 轮 · 等待 0.4-1.5s' },
        { name: '闪电 II', desc: '10 轮 · 等待 0.4-1.4s' },
        { name: '敏捷', desc: '11 轮 · 等待 0.4-1.4s' },
        { name: '精敏', desc: '11 轮 · 等待 0.3-1.3s' },
        { name: '心明', desc: '12 轮 · 等待 0.3-1.2s' },
        { name: '眼疾', desc: '12 轮 · 等待 0.3-1.1s' },
        { name: '鬼手', desc: '13 轮 · 等待 0.3-1.1s' },
        { name: '闪电 III', desc: '14 轮 · 等待 0.2-1s' },
        { name: '神速', desc: '15 轮 · 等待 0.2-0.9s' },
        { name: '反应王', desc: '20 轮 · 等待 0.2-0.8s · 终极' },
    ],
    PARAMS: [
        [5, 1000, 3000, 350, 400, 500],
        [5, 800, 2500, 320, 380, 480],
        [6, 800, 2500, 320, 380, 480],
        [6, 700, 2200, 310, 370, 470],
        [7, 700, 2200, 300, 360, 460],
        [7, 600, 2000, 300, 360, 460],
        [8, 600, 2000, 290, 350, 450],
        [8, 500, 1800, 290, 350, 450],
        [9, 500, 1800, 280, 340, 440],
        [9, 500, 1600, 280, 340, 440],
        [10, 400, 1500, 270, 330, 430],
        [10, 400, 1400, 270, 330, 430],
        [11, 400, 1400, 260, 320, 420],
        [11, 300, 1300, 260, 320, 420],
        [12, 300, 1200, 250, 310, 410],
        [12, 300, 1100, 250, 310, 410],
        [13, 300, 1100, 240, 300, 400],
        [14, 200, 1000, 240, 300, 400],
        [15, 200, 900, 230, 290, 390],
        [20, 200, 800, 220, 280, 380],
    ],
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        // 框架 levelIdx 优先（fillLevels 会生成副本对象导致 indexOf 恒为 -1）
        const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? Math.min(idx, this.PARAMS.length - 1) : (opts.endless ? this.PARAMS.length - 1 : 0);
        const [maxRound, waitMin, waitMax, s3, s2, s1] = this.PARAMS[pIdx] || this.PARAMS[0];
        const W = Math.min(container.clientWidth - 16, 400);
        const H = Math.min(window.innerHeight - 200, 360);
        try { MG.audio && MG.audio.unlock && MG.audio.unlock(); } catch (e) { }
        const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
        let phase = 0, startT = 0, greenT = 0, results = [], round = 0, finished = false;
        const draw = (color, text, emoji) => {
            // 大色块圆角 + 渐变（保留原色系，加质感）
            let c1 = color, c2 = color;
            if (color === '#5cd65c') { c1 = '#8ae87a'; c2 = '#3aa830'; }
            else if (color === '#ff5252') { c1 = '#ff7a6a'; c2 = '#c02828'; }
            else if (color === '#ffd56b') { c1 = '#ffe896'; c2 = '#d0a020'; }
            else if (color === '#333' || color === '#1a1c2a') { c1 = '#3a3650'; c2 = '#1e1a30'; }
            MG.ui.rr(ctx, 0, 0, w, h, 18);
            let g = null;
            try { g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, c1); g.addColorStop(1, c2); } catch (e) {}
            ctx.fillStyle = g || c1; ctx.fill();
            ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
            if (emoji) MG.ui.emoji(ctx, emoji, w / 2, h / 2 - 56, 52);
            ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.floor(H * 0.15) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6;
            ctx.fillText(text, w / 2, h / 2 + 14);
            ctx.shadowBlur = 0;
            ctx.font = Math.floor(H * 0.07) + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillText(`第 ${round + 1}/${maxRound} 轮 · 已完成：${results.length}`, w / 2, h / 2 + 58);
        };
        const start = () => {
            phase = 1; draw('#333', '等绿色...', '⏳');
            const wait = waitMin + Math.random() * (waitMax - waitMin);
            setTimeout(() => {
                phase = 2; greenT = performance.now();
                draw('#5cd65c', '点击!', '✅');
            }, wait);
        };
        const finish = () => {
            finished = true;
            const avg = Math.round(results.reduce((a, b) => a + b) / results.length);
            const stars = avg <= s3 ? 3 : avg <= s2 ? 2 : avg <= s1 ? 1 : 0;
            opts.onComplete && opts.onComplete({
                win: true, stars,
                lines: ['平均反应 ' + avg + 'ms', '三星阈值 ' + s3 + 'ms', lv.desc],
            });
        };
        const onTap = () => {
            if (finished) return;
            if (phase === 0) start();
            else if (phase === 1) { phase = 3; draw('#ff5252', '过早!', '❌'); setTimeout(start, 1200); }
            else if (phase === 2) {
                const r = performance.now() - greenT;
                results.push(r);
                try { MG.audio && MG.audio.sfx('click'); } catch (e) { }
                phase = 4; round++;
                draw('#ffd56b', Math.round(r) + ' ms', '⚡');
                if (round >= maxRound) setTimeout(finish, 800);
                else setTimeout(start, 1300);
            }
        };
        MG.bind(c, onTap);
        draw('#1a1c2a', '点击开始', '🎯');
        MG.hint(container, lv.desc + ' · 屏幕变绿就立刻点！');
        return { stop() { destroy(); } };
    }
};