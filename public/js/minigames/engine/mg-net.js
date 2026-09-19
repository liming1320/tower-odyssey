// 小游戏引擎 · 网络能力脚手架（mg-net.js）—— 体验 E1/E2/E3
// 这是「客户端」封装。要真正可用，需要后端提供以下端点（目前单机游玩完全不受影响，以下全部静默兜底）：
//   E1 真实多人：WebSocket 服务（建议 /ws/minigame），服务端在房间内转发输入/状态
//   E2 云端存档：POST/GET /api/minigame/cloud  body={type:'save'|'load', key, data}
//   E3 排行榜：  POST/GET /api/minigame/leaderboard  body={game, score, name}
window.MG = window.MG || {}; var MG = window.MG;
MG.net = {
    _ws: null, _room: null, _slot: null, _game: null, _me: null,
    _handlers: {}, _pending: [],
    _intentional: false,            // 主动离开（返回/再来一局）时不重连
    _reconnectTimer: null, _reconnectAttempts: 0, _reconnectMaxDelay: 8000, _reconnectMax: 8,
    _url: null, _onDown: null, _onReconnectFail: null,
    // 连接实时房间（需后端 WS 服务）。返回是否发起连接。
    // 注意：new WebSocket 后 socket 处于 CONNECTING，必须把 join/send 排队，
    // 等 onopen 后再冲刷——否则第一条 join 永远被静默丢弃（快速匹配/建房/输码加入全废）。
    connect(url) {
        if (typeof WebSocket === 'undefined') return false;
        if (url) this._url = url;
        if (!this._url) return false;
        this._intentional = false;   // 任何一次（重）连接都代表「我有意在线」
        try {
            const ws = new WebSocket(this._url);
            this._ws = ws;
            this._pending = [];
            // 升级超时保护：若 N 秒内连不上（服务器没挂中继 / 网络不可达 / 反代没透传 Upgrade），
            // 立刻给出明确报错，而不是干等到浏览器自身超时（表现为「待处理→超时」）。
            const tOpen = setTimeout(() => {
                try { if (this._onDown) this._onDown('联机服务无响应（服务器未开启 WebSocket 中继，或网络/反代未透传 Upgrade）'); } catch (e) {}
                try { ws.terminate && ws.terminate(); } catch (_) {}
            }, 8000);
            ws.onopen = () => {
                clearTimeout(tOpen);
                this._reconnectAttempts = 0;   // 连上了，重置退避计数
                // 连接就绪：冲刷排队中的消息（join / 掉线期间缓存的落子等）
                const q = this._pending; this._pending = [];
                q.forEach(m => { try { ws.send(m); } catch (e) {} });
            };
            ws.onclose = () => { clearTimeout(tOpen); this._onSocketClose(); };
            ws.onerror = () => {};
            ws.onmessage = (e) => { try { const m = JSON.parse(e.data); const h = this._handlers[m.type]; if (h) h(m.data); } catch (_) {} };
            return true;
        } catch (e) { return false; }
    },
    _onSocketClose() {
        // 主动离开（返回/再来一局）或仅浏览大厅：不触发 onDown / 不重连
        if (this._intentional || !this._room) return;
        try { if (this._onDown) this._onDown(); } catch (e) {}   // 意外掉线：上层显示「重连中」覆盖层
        this._scheduleReconnect();
    },
    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        if (this._reconnectAttempts >= this._reconnectMax) {
            // 重试耗尽（通常已超过服务端 RESUME_MS 判负窗口）：通知上层判负结束
            if (this._onReconnectFail) { try { this._onReconnectFail(); } catch (e) {} }
            return;
        }
        const delay = Math.min(this._reconnectMaxDelay, 1000 * Math.pow(2, this._reconnectAttempts));
        this._reconnectAttempts++;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            const ok = this.connect(this._url);     // connect 会重置 _intentional=false
            if (ok && this._room) this.join(this._room, this._game, this._slot); // onopen 冲刷该 join
            if (!ok) this._scheduleReconnect();     // 连不上则按更大退避再试
        }, delay);
    },
    on(type, fn) { this._handlers[type] = fn; },
    onDown(fn) { this._onDown = fn; },
    onReconnectFail(fn) { this._onReconnectFail = fn; },
    _raw(str) {
        const ws = this._ws;
        if (ws && ws.readyState === 1) { try { ws.send(str); } catch (e) {} }
        else if (!this._intentional) { this._pending.push(str); }   // 关闭/连接中：进发件箱，重连后冲刷（避免静默丢落子）
    },
    send(type, data) { try { this._raw(JSON.stringify({ type, data })); } catch (e) {} },
    join(room, game, slot) {
        this._room = room || this._room; this._game = game || this._game; if (slot) this._slot = slot;
        this.send('join', { room: this._room || '', game: this._game || (MG._curGame) || 'unknown', me: (MG.me && MG.me.nickname) || '我', slot: this._slot || undefined });
    },
    leave() {
        this._intentional = true;   // 主动离开：socket 关闭后不再自动重连
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        this._reconnectAttempts = 0;
        this.send('leave', { room: this._room });
        this._room = null; this._slot = null; this._pending = [];
    },
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

// ================= 2P 对战会话（本地双人 / 真实联机 共用）=================
// MG.match 持有当前对战双方信息；游戏顶栏 HUD（MG.matchBar）从这里读昵称。
// 本地双人：由 MinigamesView 直接 begin；真实联机：由 MG.net.versus 在收到 room/peer 消息时填充 opp。
// 我方昵称来自顶栏头像的 app.user.nickname（MinigamesView.open 时写入 MG.me）。
MG.match = {
    active: false, mode: 'local',          // mode: 'local' 同设备轮流 | 'net' 真实联机
    me: null, opp: null, side: 0, room: null, _parent: null, _sMe: null, _sOpp: null,
    begin(o) {
        o = o || {};
        this.active = true;
        this.mode = o.mode || 'local';
        this.me = o.me || (MG.me && MG.me.nickname) || '我';
        this.opp = o.opp || '对手';
        this.side = o.side || 0;
        this.room = o.room || null;
        this.render();
        return this;
    },
    setOpp(n) { if (n) this.opp = n; this.render(); },
    setSide(s) { this.side = s; this.render(); },
    setScore(me, opp) { this._sMe = me; this._sOpp = opp; this.render(); },
    snapshot() { return { me: this.me, opp: this.opp, side: this.side, scoreMe: this._sMe, scoreOpp: this._sOpp }; },
    render() { if (this._parent) { try { this._parent.innerHTML = ''; MG.matchBar(this._parent, this.snapshot()); } catch (e) {} } },
    end() { this.active = false; this.mode = 'local'; this.opp = null; this.room = null; this._parent = null; this._sMe = this._sOpp = null; try { MG.net && MG.net.leave(); } catch (e) {} },
};

// 真实联机对战入口：连接后端 WS 中继 /ws/minigame，按「游戏」匹配（绝不串游戏），等待对手加入。
// opts: { game, room?, me?, url? }
//   - 不带 room：快速匹配（服务端在同游戏等待队列里凑对手）
//   - 带 room：好友邀请（创建者先建房，好友拿房间码加入）
// 端点缺失则 MG.net.connect 返回 false，调用方静默降级提示。
MG.net.versus = function (opts) {
    opts = opts || {};
    const game = opts.game || (MG._curGame) || 'unknown';
    const url = opts.url || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/minigame');
    const room = opts.room || null;            // 有房间码=好友邀请；无=快速匹配
    const me = (MG.me && MG.me.nickname) || opts.me || '我';
    MG.net.on('room', m => { try { MG.match.begin({ mode: 'net', me: me, opp: (m && m.opp) || '对手', room: (m && m.room) || room, side: (m && m.side) || 0 }); } catch (e) {} });
    MG.net.on('peer', m => { try { MG.match.setOpp((m && m.nickname) || '对手'); if (typeof m.side === 'number') MG.match.setSide(m.side); } catch (e) {} });
    MG.net.on('side', m => { try { MG.match.setSide((m && m.side) || 0); } catch (e) {} });
    MG.net.on('waiting', () => { try { if (MG._onVersusWaiting) MG._onVersusWaiting(game); } catch (e) {} });
    MG.net.on('peer_left', () => { try { MG.match.end(); if (MG._onVersusPeerLeft) MG._onVersusPeerLeft(); } catch (e) {} });
    MG.net.on('error', m => { try { if (MG._onVersusError) MG._onVersusError((m && m.msg) || '联机出错'); } catch (e) {} });
    MG.net.onDown(() => { try { if (MG._onVersusError) MG._onVersusError('联机连接已断开（服务未启动或网络中断）'); } catch (e) {} });
    const ok = MG.net.connect(url);
    if (ok) MG.net.join(room, game);
    return { ok: ok, room: room, url: url, game: game };
};
