// 小游戏引擎 · 网络能力脚手架（mg-net.js）—— 体验 E1/E2/E3
// 这是「客户端」封装。要真正可用，需要后端提供以下端点（目前单机游玩完全不受影响，以下全部静默兜底）：
//   E1 真实多人：WebSocket 服务（建议 /ws/minigame），服务端在房间内转发输入/状态
//   E2 云端存档：POST/GET /api/minigame/cloud  body={type:'save'|'load', key, data}
//   E3 排行榜：  POST/GET /api/minigame/leaderboard  body={game, score, name}
window.MG = window.MG || {}; var MG = window.MG;
MG.net = {
    _ws: null, _room: null, _handlers: {},
    // 连接实时房间（需后端 WS 服务）。返回是否发起连接。
    connect(url) {
        if (typeof WebSocket === 'undefined' || !url) return false;
        try {
            this._ws = new WebSocket(url);
            this._ws.onmessage = (e) => { try { const m = JSON.parse(e.data); const h = this._handlers[m.type]; if (h) h(m.data); } catch (_) {} };
            this._ws.onerror = () => {};
            return true;
        } catch (e) { return false; }
    },
    on(type, fn) { this._handlers[type] = fn; },
    send(type, data) { try { if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify({ type, data })); } catch (e) {} },
    join(room) { this._room = room; this.send('join', { room }); },
    leave() { this.send('leave', { room: this._room }); this._room = null; },
};
MG.cloud = {
    // 本地兜底优先（离线也能存），再尝试同步到云端（端点缺失则静默）。
    save(key, data) {
        try { localStorage.setItem('mg-cloud-' + key, JSON.stringify(data)); } catch (e) {}
        try { fetch('/api/minigame/cloud', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'save', key, data }) }).catch(function () {}); } catch (e) {}
        return data;
    },
    load(key) {
        try { const l = localStorage.getItem('mg-cloud-' + key); if (l) return JSON.parse(l); } catch (e) {}
        return null;
    },
    sync(key) {
        try { return fetch('/api/minigame/cloud?type=load&key=' + encodeURIComponent(key)).then(r => r.json()).catch(function () { return null; }); } catch (e) { return Promise.resolve(null); }
    },
};
MG.leaderboard = {
    submit(game, score, name) {
        try { return fetch('/api/minigame/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game, score, name }) }).then(r => r.json()).catch(function () { return null; }); } catch (e) { return Promise.resolve(null); }
    },
    top(game, n) {
        try { return fetch('/api/minigame/leaderboard?game=' + encodeURIComponent(game) + '&n=' + (n || 10)).then(r => r.json()).catch(function () { return []; }); } catch (e) { return Promise.resolve([]); }
    },
};
