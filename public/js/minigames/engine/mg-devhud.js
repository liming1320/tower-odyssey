// 小游戏引擎 · 开发期性能 HUD（mg-devhud.js）—— Tier3-10
window.MG = window.MG || {}; var MG = window.MG;
// MG.devHud(container, getPerf)：右上角实时显示 FPS / 帧数 / 粒子数。仅调试用。
MG.devHud = function (container, getPerf) {
    if (!container) return { stop() {} };
    const el = document.createElement('div'); el.className = 'mg-devhud';
    container.appendChild(el);
    let raf = 0, alive = true;
    const tick = () => {
        if (!alive) return;
        try {
            const p = getPerf ? getPerf() : (MG._lastPerf || null);
            el.textContent = p ? ('FPS ' + Math.round(p.fps || 0) + ' · f' + (p.frames || 0) + (p.count != null ? ' · p' + p.count : '')) : 'HUD';
        } catch (e) {}
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return { stop() { alive = false; if (raf) cancelAnimationFrame(raf); try { el.remove(); } catch (e) {} } };
};
