// 小游戏引擎 · 连击/分数倍率 helper（mg-combo.js）—— Tier3-10
window.MG = window.MG || {}; var MG = window.MG;
// MG.combo()：连击计数 + 衰减 + 倍率。动作类游戏调用 hit() 累加，每帧 tick(dt) 衰减。
MG.combo = function (opt) {
    opt = opt || {};
    const decay = opt.decay != null ? opt.decay : 2.2;   // 秒，无操作则清零
    const step = opt.step != null ? opt.step : 1;
    const per = opt.per || 5;                            // 每 per 连击升一档
    const mult = opt.mult != null ? opt.mult : 0.5;      // 每档加成
    let n = 0, t = 0, best = 0;
    return {
        hit() { n += step; t = decay; if (n > best) best = n; return n; },
        tick(dt) { if (t > 0) { t -= dt; if (t <= 0) n = 0; } return n; },
        get count() { return n; },
        get best() { return best; },
        multiplier() { return 1 + Math.floor(n / per) * mult; },
        reset() { n = 0; t = 0; },
    };
};
