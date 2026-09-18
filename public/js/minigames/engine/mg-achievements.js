// 小游戏引擎 · 成就/里程碑（mg-achievements.js）—— Tier2-5
window.MG = window.MG || {}; var MG = window.MG;
MG.achievements = {
    KEY: 'mg-ach-v1',
    defs: {},      // id -> {name, desc, icon}
    data: {},
    load() { try { this.data = JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch (e) { this.data = {}; } },
    define(id, d) { this.defs[id] = d; },
    has(id) { return !!this.data[id]; },
    unlock(id) {
        if (this.data[id]) return false;
        this.data[id] = Date.now();
        try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
        const d = this.defs[id] || { name: id, desc: '', icon: '🏅' };
        try { MG.toast && MG.toast(document.body, (d.icon || '🏅') + ' 成就解锁：' + d.name, { ms: 2400 }); } catch (e) {}
        const tk = localStorage.getItem('game-token');
        if (tk) try { fetch('/api/minigame/achievement', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }, body: JSON.stringify({ id }) }).catch(() => {}); } catch (e) {}
        return true;
    },
};
MG.achievements.load();
