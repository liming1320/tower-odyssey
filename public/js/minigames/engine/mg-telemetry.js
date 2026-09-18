// 小游戏引擎 · 玩法埋点（mg-telemetry.js）—— Tier3-8
window.MG = window.MG || {}; var MG = window.MG;
// MG.telemetry.track(gameId, event, data)：本地队列，满 20 条或 beforeunload 批量上报 /api/minigame/telemetry
MG.telemetry = {
    queue: [],
    track(gameId, event, data) {
        try { this.queue.push({ g: gameId, e: event, d: data || {}, t: Date.now() }); } catch (e) {}
        if (this.queue.length >= 20) this.flush();
    },
    flush() {
        if (!this.queue.length) return;
        const body = this.queue.splice(0);
        const tk = localStorage.getItem('game-token');
        try {
            fetch('/api/minigame/telemetry', {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, tk ? { 'Authorization': 'Bearer ' + tk } : {}),
                body: JSON.stringify({ events: body }),
            }).catch(() => {});
        } catch (e) {}
    },
};
try { window.addEventListener('beforeunload', () => { try { MG.telemetry && MG.telemetry.flush(); } catch (e) {} }); } catch (e) {}
