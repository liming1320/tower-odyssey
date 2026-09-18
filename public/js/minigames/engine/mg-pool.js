// 小游戏引擎 · 通用对象池（mg-pool.js）—— 性能 D2
window.MG = window.MG || {}; var MG = window.MG;
// 避免游戏实体（子弹/方块/敌人）频繁 new/GC 引发的卡顿：复用同一批对象。
// 用法：const p = MG.pool(() => new Bullet(), b => b.reset());
//       const o = p.acquire();  /* 用 o */  p.release(o);  p.each(fn);
MG.pool = function (factory, reset, cap) {
    cap = cap || 512;
    const free = [], live = new Set();
    return {
        cap,
        acquire() {
            let o = free.pop();
            if (!o) { if (live.size >= cap) return null; try { o = factory(); } catch (e) { return null; } }
            if (o) live.add(o);
            return o;
        },
        release(o) {
            if (!o) return;
            live.delete(o);
            if (reset) { try { reset(o); } catch (e) {} }
            if (free.length < cap) free.push(o);
        },
        each(fn) { live.forEach(fn); },
        count() { return live.size; },
        clear() { live.clear(); free.length = 0; },
    };
};
