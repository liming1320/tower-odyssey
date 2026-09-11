// 小游戏引擎 · 输入模块（mg-input.js）
// 职责：统一指针/触摸/鼠标事件（Pointer Events），并提供坐标换算 helper。
// 旧实现同时挂 mousedown/touchstart 两份监听，混合设备会重复触发、拖拽易丢手势；
// 统一为 pointerdown/move/up/cancel + setPointerCapture，一处监听、零重复。（见 issue #2/#15）
window.MG = window.MG || {};
var MG = window.MG;

// 触摸/鼠标统一事件（Pointer Events 版）
//   get(e) 返回逻辑坐标 {x, y}（已按 HiDPI 还原，落子不跳格），以及 backing 像素坐标 _backing。
//   onTap(x) 首次按下；onMove(x) 移动（可省略）。
MG.bind = function (c, onTap, onMove) {
    const get = (e) => {
        const r = c.getBoundingClientRect();
        const sx = c.width / r.width, sy = c.height / r.height;
        const px = (e.clientX - r.left) * sx, py = (e.clientY - r.top) * sy;
        // HiDPI 还原：MG.canvas 用 devicePixelRatio 放大 backing store，
        // 但 ctx.setTransform 把坐标系缩回逻辑像素；这里必须把 backing 像素再除一次 deviceScale，
        // 否则 dpr≥2 时落子会跳格 / 越界（gomoku/link/match3/mine/memory/piano/reaction 全部受益）
        const ds = (c.__mgScale != null) ? c.__mgScale
            : ((c.__mgW && c.__mgH) ? Math.max(c.width / c.__mgW, c.height / c.__mgH)
                : ((ctx => ctx && ctx.__mgScale || 1)(c.getContext && c.getContext('2d'))));
        return { x: px / ds, y: py / ds, _backing: { x: px, y: py, sx, sy } };
    };
    const down = (e) => {
        try { e.preventDefault(); } catch (_) { }
        try { c.setPointerCapture && c.setPointerCapture(e.pointerId); } catch (_) { }
        onTap(get(e));
    };
    const move = (e) => {
        if (!onMove) return;
        try { e.preventDefault(); } catch (_) { }
        onMove(get(e));
    };
    c.addEventListener('pointerdown', down);
    if (onMove) c.addEventListener('pointermove', move);
    // pointerup / pointercancel 统一：无独立回调，仅用于释放指针捕获
    const up = (e) => { try { c.releasePointerCapture && c.releasePointerCapture(e.pointerId); } catch (_) { } };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
};

// 通用坐标换算 helper：把原生事件换算成「逻辑画布坐标」。
// 供 E.game 之外的自定义输入场景复用（如需要自行 addEventListener 时）。
MG.pointerPos = function (c, e) {
    const r = c.getBoundingClientRect();
    const sx = (c.width || r.width) / r.width, sy = (c.height || r.height) / r.height;
    const px = (e.clientX - r.left) * sx, py = (e.clientY - r.top) * sy;
    const ds = (c.__mgScale != null) ? c.__mgScale
        : ((c.__mgW && c.__mgH) ? Math.max(c.width / c.__mgW, c.height / c.__mgH) : 1);
    return { x: px / ds, y: py / ds };
};
