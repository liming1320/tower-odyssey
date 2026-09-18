// 小游戏引擎 · 分步新手引导（mg-coach.js）—— Tier2-4
window.MG = window.MG || {}; var MG = window.MG;
// MG.coach(parent, steps)：steps=[{get:()=>el|rect, text, arrow?}]
// get() 返回 DOM 元素或 {left,top,width,height}（相对视口）；引导层在 parent 内绘制高亮挖空 + 提示气泡。
MG.coach = function (parent, steps) {
    if (!parent || !steps || !steps.length) return { close() {} };
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const ov = document.createElement('div'); ov.className = 'mg-coach';
    const tip = document.createElement('div'); tip.className = 'mg-coach-tip';
    ov.appendChild(tip); parent.appendChild(ov);
    let i = -1;
    function show() {
        if (i >= steps.length) { ov.remove(); return; }
        const s = steps[i]; let r = null;
        try { r = s.get(); } catch (e) { r = null; }
        if (!r) { i++; show(); return; }
        const rect = (r.getBoundingClientRect ? r.getBoundingClientRect() : r);
        const pr = parent.getBoundingClientRect();
        const cx = rect.left - pr.left + (rect.width || 0) / 2;
        const cy = rect.top - pr.top + (rect.height || 0) / 2;
        ov.style.setProperty('--cx', cx + 'px');
        ov.style.setProperty('--cy', cy + 'px');
        const left = Math.max(8, Math.min(cx - 110, pr.width - 228));
        const top = Math.max(8, cy + (rect.height || 0) / 2 + 10);
        tip.style.left = left + 'px'; tip.style.top = top + 'px';
        tip.innerHTML = '<div class="mg-coach-text">' + (MG.escapeHtml ? MG.escapeHtml(s.text) : s.text) + '</div>' +
            '<div class="mg-coach-nav"><button data-a="prev"' + (i === 0 ? ' disabled' : '') + '>上一步</button>' +
            '<button data-a="next">' + (i === steps.length - 1 ? '完成' : '下一步') + '</button></div>';
        tip.querySelector('[data-a=next]').onclick = () => { i++; show(); };
        const pv = tip.querySelector('[data-a=prev]'); if (pv) pv.onclick = () => { if (i > 0) { i--; show(); } };
    }
    show();
    return { close() { ov.remove(); } };
};
