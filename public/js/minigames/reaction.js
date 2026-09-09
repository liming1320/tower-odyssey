// 反应力测试：3 轮，色变到绿立即点击，5 次平均
window.MiniGames = window.MiniGames || {};
MiniGames.reaction = {
    start(container, opts) {
        const { c, ctx, w, h, destroy } = MG.canvas(container, 400, 300);
        const states = ['准备', '等绿色', '点击!', '过早!', '完成'];
        let phase = 0, startT = 0, greenT = 0, results = [], round = 0, maxRound = 5;
        const waitTimer = 800 + Math.random() * 2500;
        const draw = (color, text) => {
            ctx.fillStyle = color || '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(text, w/2, h/2 - 10);
            ctx.font = '14px sans-serif'; ctx.fillText(`第 ${round+1}/${maxRound} 轮 · 已用：${results.length} 次`, w/2, h/2 + 30);
        };
        const start = () => {
            phase = 1; draw('#333', '等绿色...');
            setTimeout(() => {
                phase = 2; greenT = performance.now();
                draw('#5cd65c', '点击!');
            }, waitTimer);
        };
        const onTap = () => {
            if (phase === 0) start();
            else if (phase === 1) { phase = 3; draw('#ff5252', '过早! 点击继续'); setTimeout(start, 1200); }
            else if (phase === 2) {
                const r = performance.now() - greenT;
                results.push(r);
                phase = 4; round++;
                draw('#ffd56b', Math.round(r) + ' ms');
                if (round >= maxRound) {
                    const avg = Math.round(results.reduce((a,b)=>a+b)/results.length);
                    setTimeout(() => {
                        draw('#5b8cff', `平均 ${avg} ms`);
                        opts.onScore && opts.onScore('🏆 平均反应 ' + avg + 'ms');
                    }, 1000);
                } else { setTimeout(start, 1500); }
            }
        };
        MG.bind(c, onTap);
        draw('#1a1c2a', '点击开始');
        MG.hint(container, '屏幕变绿就立刻点！5 轮测试你的反应速度');
        return { stop() { destroy(); } };
    }
};
