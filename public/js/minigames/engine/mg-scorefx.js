// 小游戏引擎 · 分数演出（mg-scorefx.js）—— 玩法 B9
window.MG = window.MG || {}; var MG = window.MG;
// 在连击之上补充分数飘字 / 判定（PERFECT/GREAT/GOOD/MISS）/ 里程碑震屏。
// 全部复用 api.pop / api.shake（已有 fx 池），零新增底层对象。
MG.scorefx = {
    popup(api, x, y, text, opt) {
        try { if (api && api.pop) api.pop(x, y, text, Object.assign({ size: 20, color: '#ffd56b', vy: -28, life: 0.85 }, opt)); } catch (e) {}
    },
    judge(api, kind) {
        const map = { perfect: ['PERFECT', '#7adf7a'], great: ['GREAT', '#ffd56b'], good: ['GOOD', '#9ad0ff'], miss: ['MISS', '#ff7a8b'] };
        const j = map[kind] || ['', '#fff'];
        try {
            if (api && api.pop) api.pop(api.W / 2, api.H * 0.32, j[0], { size: 30, color: j[1], vy: -10, life: 0.7, bold: true });
            if (api && api.shake && kind === 'perfect') api.shake(4, 0.2);
        } catch (e) {}
    },
    milestone(api, score) {
        try {
            if (api && api.shake) api.shake(6, 0.25);
            if (api && api.pop) api.pop(api.W / 2, api.H * 0.4, '里程碑 ' + score, { size: 24, color: '#ffd56b', vy: -14, life: 0.9, bold: true });
        } catch (e) {}
    },
};
