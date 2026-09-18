// 小游戏引擎 · 共享 rAF 调度器（mg-ticker.js）—— 性能 D4
window.MG = window.MG || {}; var MG = window.MG;
// 多 canvas / 多游戏可共用一个 rAF 循环，避免每实例各起一个 requestAnimationFrame（减少调度开销）。
// 这是「可选」基础设施，不替换 _engine 内的每游戏循环；游戏/UI 注册轻量回调即可。
// 用法：MG.ticker.add(fn) / MG.ticker.remove(fn)；fn(dt) 收到秒级 delta（已 clamp 到 0.1s）。
MG.ticker = (function () {
    const cbs = new Set();
    let running = false, last = 0, raf = 0;
    const SCH = (typeof requestAnimationFrame === 'function')
        ? requestAnimationFrame
        : (f => setTimeout(() => f((typeof performance !== 'undefined' ? performance.now() : Date.now())), 16));
    function loop(t) {
        const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
        cbs.forEach(fn => { try { fn(dt); } catch (e) { try { MG.onError && MG.onError(e, 'ticker'); } catch (_) {} } });
        if (cbs.size) raf = SCH(loop); else { running = false; }
    }
    return {
        add(fn) { if (!fn) return; cbs.add(fn); if (!running) { running = true; last = 0; raf = SCH(loop); } },
        remove(fn) { cbs.delete(fn); },
        has(fn) { return cbs.has(fn); },
        size() { return cbs.size; },
    };
})();
