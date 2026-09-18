// 小游戏引擎 · 局内状态快照续玩（mg-snapshot.js）—— Tier3-7
window.MG = window.MG || {}; var MG = window.MG;
// MG.snapshot.save(id, state)/load(id)/clear(id)：把游戏可序列化状态存 localStorage，
// app 被杀后下次 start 可读取恢复半局。游戏负责在合适时机调用 + 自行反序列化。
MG.snapshot = {
    KEY: 'mg-snap-v1',
    save(id, state) {
        try { const s = (typeof state === 'string') ? state : JSON.stringify(state); localStorage.setItem(this.KEY + ':' + id, s); } catch (e) {}
    },
    load(id) {
        try { const s = localStorage.getItem(this.KEY + ':' + id); if (!s) return null; return (s[0] === '{' || s[0] === '[') ? JSON.parse(s) : s; } catch (e) { return null; }
    },
    clear(id) { try { localStorage.removeItem(this.KEY + ':' + id); } catch (e) {} },
};
