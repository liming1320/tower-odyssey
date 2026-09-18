// 小游戏引擎 · 辅助模式（mg-assist.js）—— 玩法 B8
window.MG = window.MG || {}; var MG = window.MG;
// 休闲/儿童向开关：略放慢节奏、加时、无限撤销。引擎与游戏读取 MG.assist.enabled。
MG.assist = {
    enabled: false,
    set(v) { this.enabled = !!v; if (MG.settings) MG.settings.assist = this.enabled; },
    timeScale() { return this.enabled ? 0.82 : 1; },
    extraTime(r) { return this.enabled ? (r || 0) * 1.35 : (r || 0); },
    infiniteUndo() { return this.enabled; },
};
try { if (MG.settings) MG.assist.set(MG.settings.assist); } catch (e) {}
