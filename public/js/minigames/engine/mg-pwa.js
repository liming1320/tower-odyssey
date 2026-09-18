// 小游戏引擎 · PWA / 离线（mg-pwa.js）—— 健壮性 C14
window.MG = window.MG || {}; var MG = window.MG;
// 注册 Service Worker：首次访问后缓存静态资源，之后可离线游玩（stale-while-revalidate）。
MG.pwa = {
    SW: '/sw.js',
    install() {
        try {
            if (!('serviceWorker' in navigator)) return;
            if (window.__MG_TEST) return;
            const h = location.hostname;
            if (location.protocol !== 'https:' && h !== 'localhost' && h !== '127.0.0.1' && h !== '152.136.167.250') return;
            navigator.serviceWorker.register(this.SW).catch(function () {});
        } catch (e) {}
    },
};
function _mgPwaGo() { try { MG.pwa.install(); } catch (e) {} }
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _mgPwaGo);
    else _mgPwaGo();
}
