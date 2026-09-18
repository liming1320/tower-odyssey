// 小游戏引擎 · 错误聚合上报（mg-reporterror.js）—— 工程 F4
window.MG = window.MG || {}; var MG = window.MG;
// 把崩溃/异常聚合到后端（端点缺失静默）。由 _engine 崩溃恢复（C11）在 MG.onFatal 上挂载；
// 游戏也可主动调用 MG.reportError(err, ctx)。
MG.reportError = function (err, ctx) {
    let msg = (err && (err.message || err.description)) || String(err);
    try { console.error('[MG.error]' + (ctx ? ' ' + ctx : ''), err); } catch (e) {}
    try {
        fetch('/api/minigame/error', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ msg: msg, ctx: ctx || '', ua: (typeof navigator !== 'undefined' ? navigator.userAgent : ''), t: Date.now() }),
        }).catch(function () {});
    } catch (e) {}
    return err;
};
// 自动挂载到 _engine 崩溃恢复（C11）：既上报又保留可见错误界面（工程 F4）
try {
    const _show = MG.showGameError;
    if (!MG.onFatal) MG.onFatal = function (err) { try { MG.reportError(err, 'fatal'); } catch (e) {} try { if (_show) _show(err); } catch (e) {} };
} catch (e) {}
