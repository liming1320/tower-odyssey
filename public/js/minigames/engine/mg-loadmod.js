// 小游戏引擎 · 按需懒加载（mg-loadmod.js）—— 工程 F1
window.MG = window.MG || {}; var MG = window.MG;
// 首屏不必全加载：用到某引擎模块/游戏脚本时再注入（F1）。
// 用法：MG.loadModule('/js/minigames/engine/mg-atlas.js').then(() => MG.atlas()...);
//       同一 url 只加载一次（返回同一 promise）。
MG._modCache = MG._modCache || {};
MG.loadModule = function (url) {
    if (MG._modCache[url]) return MG._modCache[url];
    MG._modCache[url] = new Promise(function (res, rej) {
        const s = document.createElement('script');
        s.src = url; s.async = true;
        s.onload = function () { res(window.MG); };
        s.onerror = function () { rej(new Error('load-fail:' + url)); };
        (document.head || document.body || document.documentElement).appendChild(s);
    });
    return MG._modCache[url];
};
