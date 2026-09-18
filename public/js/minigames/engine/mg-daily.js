// 小游戏引擎 · 每日挑战 / 种子（mg-daily.js）—— 玩法 B6
window.MG = window.MG || {}; var MG = window.MG;
// 由字符串生成确定性 32 位种子（FNV-1a），配合已有的 MG.makeRng 得到可复现布局。
// 用法：api.rng(MG.daily.seed())  → 当天固定出题，全服一致、可分享、可复现。
MG.makeSeed = function (str) {
    let h = 2166136261 >>> 0; str = '' + str;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
};
MG.daily = {
    key(d) {
        const n = new Date();
        const m = ('0' + (n.getMonth() + 1)).slice(-2), day = ('0' + n.getDate()).slice(-2);
        return '' + n.getFullYear() + '-' + m + '-' + day + (d ? '-' + d : '');
    },
    seed(d) { return MG.makeSeed(this.key(d)); },   // 当天固定种子
    today() { return this.key(); },
};
