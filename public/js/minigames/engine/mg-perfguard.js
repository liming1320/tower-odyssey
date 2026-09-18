// 小游戏引擎 · 性能预算守卫（mg-perfguard.js）—— 工程 F3
window.MG = window.MG || {}; var MG = window.MG;
// 比 autoQuality 更激进的预算守卫（F3）：持续低于预算帧率就更快降画质，持续富余则缓升。
// 由 _engine.render 每帧调用 MG.perfGuard.tick(perf, quality)。开关：MG.settings.perfGuard（默认关）。
MG.perfGuard = {
    budgetFps: 50,
    enabled: false,
    _low: 0, _high: 0,
    set(v) { this.enabled = !!v; if (MG.settings) MG.settings.perfGuard = this.enabled; },
    tick(perf, quality) {
        if (!this.enabled || !perf) return quality;
        const fps = perf.fps || 0;
        if (fps && fps < this.budgetFps) { this._low++; this._high = 0; }
        else if (fps >= this.budgetFps + 8) { this._high++; this._low = 0; }
        else { this._low = 0; this._high = 0; }
        if (this._low >= 20) { this._low = 0; return Math.max(0.35, quality - 0.05); }
        if (this._high >= 60) { this._high = 0; return Math.min(1, quality + 0.02); }
        return quality;
    },
};
