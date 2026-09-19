// 小游戏入口：竖版滚动卡片，每张游戏点击进入全屏游戏容器
// 真正的 20 个游戏实现放在 /js/minigames/*.js，由本文件按需加载
const MinigamesView = {
    _cat: 'all', _q: '', _versus: false,
    async open(app) {
        // 登录用户昵称暴露给小游戏引擎（顶栏头像的同一来源 app.user.nickname），供 2P 对战 HUD 显示「你(昵称)」
        try { if (app && app.user) MG.me = { nickname: app.user.nickname || app.user.username || '我', displayId: app.user.displayId || '' }; } catch (e) {}
        // 先同步服务器进度（登录用户），并拉取后台设置的排序；无排序时按 manifest 原序
        try {
            MG.sync();
            const order = await MG.fetchOrder();
            if (order && order.length) {
                const map = new Map(GAMES.map(g => [g.id, g]));
                const ordered = [];
                order.forEach(id => { if (map.has(id)) { ordered.push(map.get(id)); map.delete(id); } });
                ordered.push(...map.values());   // 新增的未在排序里的追加到末尾
                this._sorted = ordered;
            }
        } catch (e) {}
        this.render(app);
    },
    render(app) {
        const all = this._sorted || GAMES;
        // 切到独立 tab 区域显示
        const root = document.getElementById('page-content');
        root.innerHTML = `
            <div class="section-title">🎮 小游戏
                <span class="mini-vs-actions">
                    <span style="font-size:12px;color:#b9b3d8;font-weight:normal">共 ${all.length} 款${NET_GAMES_COUNT ? ' · 🌐 ' + NET_GAMES_COUNT + ' 款可联机' : ''}</span>
                </span>
            </div>
            <div class="mini-filter">
                <input class="mini-search" id="mini-search" type="search" placeholder="🔍 搜索游戏名称 / 简介…" />
                <div class="mini-cats" id="mini-cats">
                    ${CATEGORIES.map(([k, label]) => `<button class="mini-cat${k === this._cat ? ' active' : ''}" data-cat="${k}">${label}</button>`).join('')}
                </div>
            </div>
            <div class="mini-hub" id="mini-hub"></div>
        `;
        const search = document.getElementById('mini-search');
        search.value = this._q || '';
        search.addEventListener('input', () => { this._q = search.value.trim().toLowerCase(); this._renderHub(); });
        document.getElementById('mini-cats').addEventListener('click', e => {
            const b = e.target.closest('.mini-cat');
            if (!b) return;
            this._cat = b.dataset.cat;
            document.querySelectorAll('#mini-cats .mini-cat').forEach(x => x.classList.toggle('active', x === b));
            this._renderHub();
        });
        this._renderHub();
    },
    _renderHub() {
        const all = this._sorted || GAMES;
        const q = (this._q || '').toLowerCase();
        const matchQ = g => !q || g.name.toLowerCase().includes(q) || (g.desc || '').toLowerCase().includes(q);
        // 「🌐 联网对战」分类 = 可联机游戏筛选（只显示带「联网对战」按钮的游戏）
        const list = (this._cat === 'versus' ? all.filter(g => NET_GAMES[g.id]) : all.filter(g => this._cat === 'all' || g.cat === this._cat))
            .filter(matchQ);
        const hub = document.getElementById('mini-hub');
        hub.innerHTML = '';
        if (!list.length) {
            hub.innerHTML = `<div style="color:#b9b3d8;padding:24px;text-align:center;font-size:13px">${this._cat === 'versus' ? '暂无可联机的小游戏，换个关键词试试～' : '没有匹配的小游戏，换个关键词或分类试试～'}</div>`;
            return;
        }
        if (this._cat === 'versus') {
            const tip = U.el(`<div style="color:#8fd0ff;padding:6px 4px 10px;font-size:12px">🌐 仅显示支持联网对战的游戏 · 点「联网对战」进入游戏大厅，坐下即匹配对手</div>`);
            hub.appendChild(tip);
        }
        list.forEach(g => hub.appendChild(this._renderCard(g)));
    },
    // 一张游戏卡：默认「进入游戏」（50 关单人）；若游戏支持联机，多一个「联网对战」按钮（进入大厅）
    _renderCard(g) {
        const stars = MG.totalStars(g.id);
        const net = NET_GAMES[g.id];
        const card = U.el(`
            <div class="mini-card" data-id="${g.id}">
                <div class="mini-thumb">${g.thumb}</div>
                <div class="mini-meta">
                    <div class="mini-name">${g.name}${stars > 0 ? `<span class="mini-stars">⭐ ${stars}</span>` : ''}</div>
                    <div class="mini-desc">${g.desc || ''}</div>
                </div>
                <div class="mini-acts">
                    <button class="mini-btn mini-btn-play" data-act="play">▶ 进入游戏</button>
                    ${net ? `<button class="mini-btn mini-btn-net" data-act="net">🌐 联网对战</button>` : ''}
                </div>
            </div>
        `);
        const playBtn = card.querySelector('[data-act="play"]');
        if (playBtn) playBtn.onclick = (e) => { e.stopPropagation(); this.launch(g); };
        const netBtn = card.querySelector('[data-act="net"]');
        if (netBtn) netBtn.onclick = (e) => { e.stopPropagation(); this.openHall(g); };
        card.onclick = () => this.launch(g);   // 点卡片其它区域 = 进入游戏
        return card;
    },

    launch(g) {
        MG._curGame = g.id;   // 供联机/重放等按游戏定位（匹配严格按此隔离）
        // 全屏遮罩容器
        const mask = U.el(`<div class="mini-mask" id="mini-mask">
            <div class="mini-topbar">
                <button class="btn-back" id="mini-back">‹ 返回</button>
                <div class="mini-title">${g.name}</div>
                <div class="mini-score" id="mini-score"></div>
            </div>
            <div class="mini-stage" id="mini-stage"></div>
        </div>`);
        document.body.appendChild(mask);
        const stage = document.getElementById('mini-stage');
        const scoreEl = document.getElementById('mini-score');
        // 本地双人模式：开启 2P 会话，顶栏标题处显示「你(昵称) VS 玩家2」
        if (this._versus) {
            MG.match.begin({ mode: 'local', me: (MG.me && MG.me.nickname) || '我', opp: '玩家2' });
            const titleEl = mask.querySelector('.mini-title');
            if (titleEl) { MG.match._parent = titleEl; MG.match.render(); }
        }
        // 保存当前游戏控制器，关闭时先 stop()（回收 RAF / 键盘监听 / 粒子 / 音频），再移除遮罩，避免性能泄漏（见 issue #3）
        let ctrl = null;
        const close = () => {
            try { ctrl && ctrl.stop && ctrl.stop(); } catch (e) {}
            try { MG.match && MG.match.active && MG.match.end(); } catch (e) {}
            mask.remove();
        };
        document.getElementById('mini-back').onclick = close;
        try {
            const game = window.MiniGames && window.MiniGames[g.id];
            if (!game) throw new Error('未加载到该游戏模块');
            // 暗棋保留自己的关卡流程（猜拳→对局），走自己的 start
            if (g.id === 'banqi') {
                const inst = game.start(stage, { onScore: s => scoreEl.textContent = s != null ? s : '' });
                ctrl = inst;   // banqi 实例自带 stop()
                inst && (inst._close = close);
            } else {
                const levels = (game.LEVELS && game.LEVELS.length) ? game.LEVELS : defaultLevels(g);
                ctrl = MG.runGame(stage, {
                    id: g.id, title: g.name, levels,
                    endless: game.ENDLESS || null,
                    start: (c, opts, lv) => game.start(c, opts, lv),
                    scoreEl,
                });
            }
        } catch (e) {
            stage.innerHTML = `<div style="padding:30px;color:#ff7a8b">启动失败：${MG.escapeHtml(e.message)}</div>`;
        }
    }
};

// 联机对战入口：按所选游戏发起匹配。三种方式（B+C 组合）：
//   快速匹配 —— 服务端在同游戏等待队列凑对手
//   创建房间 —— 生成房间码，复制分享给好友
//   加入房间 —— 好友拿码输入进来
// 匹配成功后由 _launchNet 真正启动该游戏（net 模式：不走 50 关、不走本地双人），
// 游戏内检测 MG.pvp 自动禁用 AI、按回合锁输入、整盘状态同步给对手。
// 联机对战入口（QQ 游戏大厅风格）：进入该游戏的「大厅」，看到一张张桌子，
// 每张桌有 N 个座位（棋类 2 座、强手棋/大富翁 4 座），座位上显示已入座玩家昵称。
// 点「创建新桌」开一桌并自动坐下；或点某张桌「加入」坐下。满座后服务端发 start → 开战。
// 大厅与座位依赖 server/ws-relay.js 的 lobby/tables/seat/start 消息；对战同步复用已有 MG.net 连接。
MinigamesView.openHall = function (g) {
    if (!g || !g.id || !NET_GAMES[g.id]) { U.toast('该游戏暂不支持联机'); return; }
    const cap = NET_GAMES[g.id].seats || 2;
    MG._curGame = g.id;
    MinigamesView._roomCode = null;
    const self = this;
    const mask = U.el(`<div class="mini-mask" id="mini-mask">
        <div class="mini-topbar">
            <button class="btn-back" id="mini-back">‹ 返回</button>
            <div class="mini-title" id="mini-vs-title">🌐 ${g.name} · 联机大厅</div>
            <div class="mini-score" id="mini-score"></div>
        </div>
        <div class="mini-stage" id="mini-stage"></div>
    </div>`);
    document.body.appendChild(mask);
    const titleEl = mask.querySelector('#mini-vs-title');
    const stage = document.getElementById('mini-stage');
    MG.match._parent = titleEl;   // 对战双方昵称 HUD 渲染进顶栏标题

    const clearHallHandlers = () => { MG.net.on('tables', () => {}); MG.net.on('seat', () => {}); MG.net.on('start', () => {}); MG.net.on('peer_left', () => {}); };
    const close = () => {
        try { MG.net && MG.net.leave && MG.net.leave(); } catch (e) {}
        try { if (MG.net && MG.net._ws) MG.net._ws.close(); } catch (e) {}
        clearHallHandlers();
        try { MG.match && MG.match.end(); } catch (e) {}
        MinigamesView._removeLatencyPill();
        if (mask.parentNode) mask.remove();
    };
    document.getElementById('mini-back').onclick = close;
    const setStatus = t => { const el = document.getElementById('mh-status'); if (el) el.textContent = t; };

    const hall = U.el(`<div class="mg-hall">
        <div class="mh-head">🌐 《${g.name}》联机大厅 · <b>${cap}</b> 人桌</div>
        <div class="mh-tip">点「创建新桌」开一桌并自动坐下，或加入下方任意桌子；座位满即开战。</div>
        <button class="mvp-btn mvp-primary" id="mh-create">🪑 创建新桌</button>
        <div class="mh-tables" id="mh-tables"><div class="mh-loading">连接中…</div></div>
        <div class="mh-mine" id="mh-mine"></div>
        <div class="mh-spectate">👁 观战：<input id="mh-spec-code" placeholder="输入房间码" maxlength="40"/><button class="mvp-btn mvp-sm" id="mh-spec-btn">观战</button></div>
        <div class="mh-status" id="mh-status"></div>
    </div>`);
    stage.appendChild(hall);

    MG.net.on('tables', m => { try { self._renderHallTables(g, m && m.tables); } catch (e) {} });
    MG.net.on('seat', m => { try { if (m && m.room) MinigamesView._roomCode = m.room; self._renderHallMine(g, m); } catch (e) {} });
    MG.net.on('peer_left', m => { try { self._renderHallMine(g, m); setStatus('有玩家离开了桌子'); } catch (e) {} });
    MG.net.on('start', m => {
        if (!m || typeof m.side !== 'number') return;
        if (m.room) MinigamesView._roomCode = m.room;
        if (m.viewer) { self._launchNet(g, { side: m.side, room: m.room, opp: (m.opp && m.opp.join('、')) || '', seats: m.seats, slot: m.slot, viewer: true, state: m.state }); return; }
        const opp = (m.opp && m.opp.join('、')) || '对手';
        if (NET_WIRED[g.id]) self._launchNet(g, { side: m.side, room: m.room, opp: opp, seats: m.seats, slot: m.slot });
        else self._showNetDev(g);
    });

    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/minigame';
    const ok = MG.net.connect(url);
    if (!ok) { setStatus('⚠️ 浏览器不支持 WebSocket'); return; }
    MinigamesView._ensureLatencyPill(); MG.net.onPing(rtt => MinigamesView._updateLatency(rtt));   // 大厅内也显示 RTT
    MG.net.send('lobby', { game: g.id, cap });
    hall.querySelector('#mh-create').onclick = () => {
        MG.net.send('join', { game: g.id, cap, create: true, me: (MG.me && MG.me.nickname) || '我' });
        setStatus('🪑 已创建新桌，等待其他人入座…');
    };
    const specBtn = hall.querySelector('#mh-spec-btn');
    if (specBtn) specBtn.onclick = () => {
        const code = (hall.querySelector('#mh-spec-code') || {}).value || '';
        if (!code.trim()) { setStatus('⚠️ 请输入要观战的房间码'); return; }
        MG.net.connect(url);   // 确保已连接（大厅已连，这里幂等）
        MG.net.spectate(code.trim(), (MG.me && MG.me.nickname) || '观战者');
        setStatus('👁 正在进入观战…');
    };
};

// 大厅：渲染桌子列表（每张桌的座位与昵称）
MinigamesView._renderHallTables = function (g, tables) {
    const el = document.getElementById('mh-tables'); if (!el) return;
    if (!tables || !tables.length) { el.innerHTML = `<div class="mh-empty">暂无开放桌子，点「创建新桌」开一桌～</div>`; return; }
    el.innerHTML = '';
    tables.forEach(t => {
        const seats = [];
        for (let i = 0; i < t.cap; i++) { const s = t.seats[i]; seats.push(s ? `<div class="mh-seat taken">${MG.escapeHtml(s.name)}</div>` : `<div class="mh-seat empty">空位</div>`); }
        const card = U.el(`<div class="mh-table">
            <div class="mh-table-cap">${t.cap} 人桌</div>
            <div class="mh-seats">${seats.join('')}</div>
            <button class="mvp-btn mvp-sm mh-join">加入</button>
        </div>`);
        card.querySelector('.mh-join').onclick = () => MG.net.send('join', { game: g.id, room: t.room, cap: t.cap, me: (MG.me && MG.me.nickname) || '我' });
        el.appendChild(card);
    });
};

// 大厅：渲染「我所在的桌子」——高亮我的座位，显示等待/已满状态
MinigamesView._renderHallMine = function (g, m) {
    const el = document.getElementById('mh-mine'); if (!el || !m) return;
    const cap = m.cap || (NET_GAMES[g.id] && NET_GAMES[g.id].seats) || 2;
    const seats = [];
    let taken = 0;
    for (let i = 0; i < cap; i++) {
        const s = m.seats ? m.seats[i] : null;
        if (s) taken++;
        const mine = (m.you === i);
        seats.push(s ? `<div class="mh-seat taken${mine ? ' me' : ''}">${MG.escapeHtml(s.name)}${mine ? '（你）' : ''}</div>` : `<div class="mh-seat empty">空位</div>`);
    }
    const code = MinigamesView._roomCode;
    const codeHtml = code ? `<div class="mh-code">房间码：<b id="mh-code-val">${code}</b> <span class="mh-copy" id="mh-copy">复制</span><div class="mh-code-tip">把房间码发给好友，好友点「加入」输入即可同桌</div></div>` : '';
    el.innerHTML = `<div class="mh-mine-head">我所在的桌子（座位 ${(m.you + 1)} / ${cap}）</div><div class="mh-seats">${seats.join('')}</div>` +
        (m.full ? `<div class="mh-full">座位已满，即将开战…</div>` : `<div class="mh-wait">等待其他玩家入座（${taken}/${cap}）…</div>`) + codeHtml;
    if (code) {
        const copy = el.querySelector('#mh-copy');
        if (copy) copy.onclick = () => { try { navigator.clipboard.writeText(code); if (U.toast) U.toast('房间码已复制：' + code); } catch (e) { if (U.toast) U.toast('房间码：' + code); } };
    }
};

// 4 人桌等尚未接入真实同步的游戏：大厅/座位可用，但满座后提示「开发中」而非假开战
MinigamesView._showNetDev = function (g) {
    const stage = document.getElementById('mini-stage'); if (!stage) return;
    stage.innerHTML = `<div class="mini-result">
        <div class="mr-title">🛠️ 联机对战开发中</div>
        <div class="mr-sub">《${g.name}》的大厅与座位已就绪（${NET_GAMES[g.id].seats} 人桌、昵称同步可用），但该游戏的实时同步对战尚未接入游戏模块，敬请期待。</div>
        <button class="mvp-btn" id="md-back">‹ 返回列表</button>
    </div>`;
    const b = stage.querySelector('#md-back');
    if (b) b.onclick = () => { try { MG.net && MG.net.leave && MG.net.leave(); } catch (e) {} try { if (MG.net && MG.net._ws) MG.net._ws.close(); } catch (e) {} const mask = document.getElementById('mini-mask'); if (mask && mask.parentNode) mask.remove(); };
};

// 观战模式：只读旁观一张进行中的桌子。不驱动完整游戏引擎（避免 side=-1 索引崩溃），
// 改用轻量 HUD 实时呈现座位与资产（对局每次落子都会广播整盘 state，这里直接解析 players 展示）。
MinigamesView._renderSpectator = function (g, m, stage, close) {
    stage.innerHTML = `<div class="mg-spec">
        <div class="mg-spec-head">👁 观战中 · 《${g.name}》</div>
        <div class="mg-spec-seats" id="mg-spec-seats"></div>
        <div class="mg-spec-state" id="mg-spec-state">连接中，等待对局状态…</div>
        <button class="mvp-btn" id="mg-spec-exit">退出观战</button>
    </div>`;
    const seatsEl = stage.querySelector('#mg-spec-seats');
    const stateEl = stage.querySelector('#mg-spec-state');
    const renderSeats = (seats) => {
        try {
            if (!seats || !seats.length) { seatsEl.innerHTML = ''; return; }
            seatsEl.innerHTML = seats.map(s => s ? `<div class="mg-spec-p">🎮 ${MG.escapeHtml(s.name || '玩家')}</div>` : '').join('');
        } catch (e) {}
    };
    const renderState = (st) => {
        try {
            if (!st) { stateEl.textContent = '（暂无状态）'; return; }
            const players = st.players;
            if (players && players.length) {
                stateEl.innerHTML = '<div class="mg-spec-list">' + players.map((p, i) => {
                    const cash = (p.cash != null) ? ('¥' + p.cash) : '';
                    return `<div class="mg-spec-p">${i + 1}. ${MG.escapeHtml(p.name || ('P' + (i + 1)))} · ${cash} ${p.out ? '<span style="color:#ff7a8b">💀出局</span>' : ''}</div>`;
                }).join('') + '</div>';
            } else {
                stateEl.textContent = '对局进行中' + (st.turn != null ? (' · 轮到 ' + (st.turn + 1) + ' 号') : '');
            }
        } catch (e) { stateEl.textContent = '观战数据接收中…'; }
    };
    renderSeats(m.seats);
    renderState(m.state);
    const onState = (mm) => { try { renderState(mm); } catch (e) {} };
    MG.net.on('input', onState); MG.net.on('state', onState); MG.net.on('sync', onState);
    const exit = stage.querySelector('#mg-spec-exit');
    if (exit) exit.onclick = () => {
        try { MG.net.send('leave', { room: MG.net._room }); } catch (e) {}
        MG.net._spectating = false;
        if (close) close();
    };
};

// 联机对局中的轻量覆盖层（等待重连 / 重连中）：不遮挡棋盘、不结束对局，仅提示网络状态
MinigamesView._showNetOverlay = function (text) {
    const stage = document.getElementById('mini-stage'); if (!stage) return;
    let el = document.getElementById('mh-reconnect');
    if (!el) {
        el = U.el('<div id="mh-reconnect"></div>');
        el.style.cssText = 'position:absolute;left:50%;top:12px;transform:translateX(-50%);background:rgba(18,14,38,.92);color:#ffd86b;padding:8px 14px;border-radius:10px;font-size:13px;z-index:50;box-shadow:0 4px 16px rgba(0,0,0,.45);display:none;max-width:92%;text-align:center;pointer-events:none';
        stage.appendChild(el);
    }
    el.textContent = text; el.style.display = 'block';
};
MinigamesView._hideNetOverlay = function () {
    const el = document.getElementById('mh-reconnect'); if (el) el.style.display = 'none';
};

// 联机延迟小药丸：对局/大厅内常驻显示 RTT（MG.net 心跳测速），让「响应速度」可见
MinigamesView._netLatencyEl = null;
MinigamesView._ensureLatencyPill = function () {
    if (MinigamesView._netLatencyEl && document.body.contains(MinigamesView._netLatencyEl)) return MinigamesView._netLatencyEl;
    const el = document.createElement('div');
    el.id = 'mg-net-latency'; el.className = 'mg-net-latency'; el.textContent = '📶 测速中…';
    document.body.appendChild(el);
    MinigamesView._netLatencyEl = el;
    return el;
};
MinigamesView._updateLatency = function (rtt) {
    const el = MinigamesView._netLatencyEl; if (!el) return;
    if (rtt < 0) { el.textContent = '📶 测速中…'; el.className = 'mg-net-latency'; return; }
    el.textContent = '📶 ' + rtt + 'ms';
    el.className = 'mg-net-latency' + (rtt > 200 ? ' bad' : rtt > 100 ? ' warn' : '');
};
MinigamesView._removeLatencyPill = function () {
    if (MinigamesView._netLatencyEl && MinigamesView._netLatencyEl.parentNode) MinigamesView._netLatencyEl.parentNode.removeChild(MinigamesView._netLatencyEl);
    MinigamesView._netLatencyEl = null;
};

// 真正启动一局联机对战：hall 连接已在房间内，这里只需武装 MG.pvp 并启动游戏
// （MG.pvp.commit → MG.net.send 复用同一连接转发 input/state，无需再连）
MinigamesView._launchNet = function (g, m) {
    MG._curGame = g.id;
    MG.net.on('tables', () => {}); MG.net.on('seat', () => {});   // 对战进行中不再处理大厅消息
    const isViewer = !!(m && m.viewer);
    const cap = (NET_GAMES[g.id] && NET_GAMES[g.id].seats) || 2;
    const race = !!(NET_GAMES[g.id] && NET_GAMES[g.id].race);
    // 武装 MG.pvp：把服务端下发的座位快照（含昵称，按 side 索引）一并传入，供引擎按 side 正确映射对手昵称。
    // 观战者 side=-1：canMove 恒 false（永不轮到），只接收 setState 重绘，不能落子。
    // race：竞速模式（如 2048 竞速），双方独立棋盘均可落子，不按回合锁输入。
    MG.pvp.arm(g.id, (m && m.side) || 0, (m && m.opp) || null, { cap: cap, seats: (m && m.seats) || null, viewer: isViewer, race: race });
    // 记住本局房间/座位 token，供掉线后自动重连续局（mg-net 据此带 slot 重 join）
    MG.net._room = (m && m.room) || null; MG.net._slot = (m && m.slot) || null; MG.net._game = g.id; MG.net._spectating = isViewer;
    MinigamesView._ensureLatencyPill(); MG.net.onPing(rtt => MinigamesView._updateLatency(rtt));   // 对局内常驻显示 RTT
    const mask = document.getElementById('mini-mask');
    const stage = document.getElementById('mini-stage');
    const scoreEl = document.getElementById('mini-score');
    if (stage) stage.innerHTML = '';
    let ctrl = null;
    const close = () => {
        try { MG.net.onDown && MG.net.onDown(null); } catch (e) {}        // 清掉本局注册的断线钩子
        try { MG.net.onReconnectFail && MG.net.onReconnectFail(null); } catch (e) {}
        if (!isViewer) { try { MG.net.leave(); } catch (e) {} }           // 主动离开：服务端立即判负对手（观战者不影响对局）
        else { try { MG.net.send('leave', { room: MG.net._room }); MG.net._spectating = false; } catch (e) {} }
        MinigamesView._hideNetOverlay();
        try { ctrl && ctrl.stop && ctrl.stop(); } catch (e) {}
        try { MG.pvp.end(); } catch (e) {}
        try { MG.match && MG.match.end(); } catch (e) {}
        MinigamesView._removeLatencyPill();
        if (mask && mask.parentNode) mask.remove();
    };
    // 对局进行中掉线收口：避免「对手走了我却还在棋盘干等/还能落子」的悬空态。
    //   peer_left —— 服务端检测到对手 ws close/心跳超时后推送：判我方获胜并结算。
    //   onDown    —— 我方自己 ws 断开（杀进程/断网）：结束本局并提示。
    // 这两类事件此前只被大厅阶段 handler 接收（更新已不存在的座位 UI），等于空响。
    MG.net.on('peer_left', () => {
        if (isViewer) return;   // 观战者不在乎谁离开
        MinigamesView._hideNetOverlay();
        try { MG.pvp.end(); } catch (e) {}
        const who = cap === 2 ? '对手离开了' : '有玩家离开了';
        MinigamesView._pvpResult(g, { win: true, title: '🚪 ' + who, lines: [who + '，本局判你获胜'], score: 0 }, close);
    });
    // 对手断线（服务端保留其座位 RESUME_MS）：显示等待重连覆盖层，不判负、不结束对局
    MG.net.on('peer_gone', () => {
        if (isViewer) return;
        const who = cap === 2 ? '对手网络波动' : '有玩家网络波动';
        MinigamesView._showNetOverlay('🚪 ' + who + '，正在等待重连…（约30秒）');
    });
    // 对手重连归来：清除覆盖层，对局继续
    MG.net.on('peer_back', () => { if (!isViewer) MinigamesView._hideNetOverlay(); });
    // 我方重连成功，服务端下发最近盘面：重建棋盘继续对局
    MG.net.on('resume', mm => { try { MG.pvp.resume(mm && mm.lastState); } catch (e) {} if (!isViewer) MinigamesView._hideNetOverlay(); });
    // 我方意外掉线：先显示「重连中（第 N 次）」，由 mg-net 指数退避自动重连；重连成功会以 resume/peer_back 清层
    MG.net.onDown(() => {
        if (isViewer) { MinigamesView._showNetOverlay('👁 观战连接已断开'); return; }
        const n = Math.min(MG.net._reconnectAttempts + 1, MG.net._reconnectMax);
        MinigamesView._showNetOverlay('📡 网络中断，正在重连…（第 ' + n + '/' + MG.net._reconnectMax + ' 次）');
    });
    MG.net.onReconnectFail(() => {
        if (isViewer) return;
        MinigamesView._hideNetOverlay();
        try { MG.pvp.end(); } catch (e) {}
        MinigamesView._pvpResult(g, { win: false, title: '📡 联机已断开', lines: ['网络中断，对局结束'], score: 0 }, close);
    });
    const back = document.getElementById('mini-back');
    if (back) back.onclick = close;
    try {
        const game = window.MiniGames && window.MiniGames[g.id];
        if (!game) throw new Error('未加载到该游戏模块');
        const opts = { onScore: s => { if (scoreEl) scoreEl.textContent = s != null ? s : ''; }, onComplete: res => this._pvpResult(g, res, close), seats: (m && m.seats) || null };
        if (isViewer) {
            // 观战模式：不驱动完整游戏引擎（避免 side=-1 索引崩溃），改用轻量观战 HUD 实时呈现席位/资产
            this._renderSpectator(g, m, stage, close);
        } else if (g.id === 'banqi') {
            ctrl = game.start(stage, opts);
        } else {
            ctrl = MG.runGame(stage, {
                id: g.id, title: g.name, net: true,
                levels: (game.LEVELS && game.LEVELS.length) ? game.LEVELS : defaultLevels(g),
                endless: game.ENDLESS || null,
                start: (c, o, lv) => game.start(c, o, lv),
                scoreEl, onComplete: res => this._pvpResult(g, res, close),
            });
        }
    } catch (e) {
        if (stage) stage.innerHTML = `<div style="padding:30px;color:#ff7a8b">启动失败：${MG.escapeHtml(e.message)}</div>`;
    }
    this._netCtrl = ctrl; this._netClose = close;
};

// 联机对战结算：展示胜负 + 再来一局（重新快速匹配）/ 返回列表。不记录关卡星级（避免污染 PvE 进度）
MinigamesView._pvpResult = function (g, res, close) {
    const stage = document.getElementById('mini-stage');
    if (!stage) { if (close) close(); return; }
    try { this._netCtrl && this._netCtrl.stop && this._netCtrl.stop(); } catch (e) {}
    const win = !!(res && res.win);
    const title = win ? '🏆 你赢了！' : (res && res.win === false ? '💥 你输了' : '🤝 平局');
    const lines = (res && res.lines) ? (Array.isArray(res.lines) ? res.lines.join(' · ') : res.lines) : '';
    stage.innerHTML = `<div class="mini-result">
        <div class="mr-title">${title}</div>
        <div class="mr-sub">${MG.escapeHtml(lines || '')}</div>
        <button class="mvp-btn mvp-primary" id="mr-rematch">⚔️ 再来一局</button>
        <button class="mvp-btn" id="mr-back">‹ 返回列表</button>
    </div>`;
    const rm = stage.querySelector('#mr-rematch'); if (rm) rm.onclick = () => { try { MG.pvp.end(); } catch (e) {} if (close) close(); this.openHall(g); };
    const bk = stage.querySelector('#mr-back'); if (bk) bk.onclick = () => { try { MG.pvp.end(); MG.net.leave(); } catch (e) {} if (close) close(); };
};

// 兜底：没有 LEVELS 配置的游戏也具备 50 关（难度参数自增 0..1）
function defaultLevels(g) {
    const out = [];
    for (let i = 1; i <= 20; i++) {
        out.push({ name: '第' + i + '关', desc: '难度 ' + i + '/20', _fallback: true });
    }
    return out;
}

// 100 个小游戏清单（id 与 /js/minigames/*.js 一一对应）
// sc(id, 名称, 简介, 底色1, 底色2, [emoji...]) —— 自动生成场景缩略图
function sc(id, name, desc, c1, c2, emos) {
    const n = emos.length;
    const step = n > 3 ? 21 : 26;
    const size = n > 3 ? 18 : 23;
    const items = emos.map((e, i) => [e, 44 + (i - (n - 1) / 2) * step, 32, size]);
    return { id, name, desc, thumb: sceneThumb(c1, c2, items) };
}
const GAMES = [
    sc('gomoku', '五子棋', '50 关 AI 对战，失误率递减', '#e8c890', '#a87840', ['\u26ab', '\u26aa']),
    sc('g2048', '2048 降妖', '50 关妖怪合并 · 无尽模式', '#5a7a9f', '#2c3e6a', ['\u2733']),
    sc('banqi', '暗棋圣手', '15 关 · 宋金小人 · 必杀技', '#8a5a2f', '#4a2c12', ['\u2694']),
    sc('xiangqi', '中国象棋', '50 关红黑对弈，车马炮冲锋', '#e8b088', '#9a5a28', ['\u265f', '\u265e']),
    sc('link', '连连看', '50 关 · 岩石挡路 · 限时', '#7ad0ff', '#2a6adf', ['\ud83d\udd17', '\ud83e\udea8']),
    sc('match3', '消消乐', '50 关 · 配额目标 · 石块', '#ffb86b', '#e0642a', ['\ud83c\udf6c', '\ud83c\udf6d']),
    sc('snake', '贪吃蛇', '50 关 · 地图与目标递增', '#a0e8a0', '#2e8a3e', ['\ud83d\udc0d', '\ud83c\udf4e']),
    sc('tetris', '俄罗斯方块', '50 关 · 下落提速', '#8aa8ff', '#2a3a8f', ['\ud83d\udfea', '\ud83d\udfe8']),
    sc('mole', '打地鼠', '50 关 · 地洞变多地鼠变快', '#d8a878', '#7a5228', ['\ud83d\udc39', '\ud83d\udd28']),
    sc('mine', '扫雷', '50 关 · 棋盘与雷数递增', '#c8ccd8', '#5a6278', ['\ud83d\udca3', '\ud83d\udea9']),
    sc('memory', '记忆翻牌', '50 关 · 牌对递增', '#d0a8ff', '#5a2ea8', ['\ud83c\udccf', '\u2753']),
    sc('slide15', '数字华容道', '50 关 · 3×3 到 5×5', '#8ac8ff', '#2a5ac0', ['\ud83d\udd22', '\u27a1']),
    sc('bulls', '猜数字', '50 关 · A×B 逻辑推理', '#ffcf8a', '#b06818', ['\ud83d\udd22', '\ud83d\udca1']),
    sc('sudoku6', '迷你数独', '50 关 · 6×6 入门', '#a0e8a0', '#2e8a3e', ['6\ufe0f\u20e3', '\ud83e\udde9']),
    sc('hanoi', '汉诺塔', '50 关 · 3 到 9 层', '#ffd0a0', '#b06030', ['\ud83d\uddfc', '\ud83d\udfe0']),
    sc('piano', '别踩白块', '50 关 · 速度递增', '#e8e8f4', '#8a90a8', ['\ud83c\udfb9', '\ud83c\udfb5']),
    sc('reaction', '反应力测试', '50 关 · 等待时间递减', '#ffe88a', '#c89418', ['\u26a1', '\ud83c\udfaf']),
    sc('breakout', '打砖块', '50 关 · 砖块与球速递增', '#8ad0ff', '#2060b0', ['\ud83e\uddf1', '\ud83c\udfd3']),
    sc('jump', '跳一跳', '50 关 · 平台越来越窄', '#c8f0c8', '#3a9040', ['\ud83e\udd98', '\ud83c\udfaf']),
    sc('shooter', '飞机大战', '50 关 · 敌机与血量递增', '#8a9ad8', '#141c3a', ['\ud83d\ude80', '\ud83d\udc7e']),

    sc('tictactoe', '井字棋', '50 关 · AI 失误率递减', '#7ad0ff', '#2a4a8f', ['\u2715', '\u25cb']),
    sc('connect4', '四子棋', '50 关 · 四子连珠', '#5a7ad0', '#1a2a5f', ['\ud83d\udd34', '\ud83d\udfe1']),
    sc('reversi', '黑白棋', '50 关 · 翻转夹击', '#2e6a4a', '#0f2a1c', ['\u26aa', '\u26ab']),
    sc('nim', '取石子', '50 关 · 博弈必胜策略', '#8a6a3a', '#3a2a14', ['\ud83e\udea8', '\u270b']),
    sc('battleship', '海战棋', '50 关 · 有限炮弹击沉敌舰', '#2a6a9f', '#0e2a4a', ['\ud83d\udef2', '\ud83d\udd25']),
    sc('dots', '点格棋', '50 关 · 围格占领', '#5a4a8f', '#221a3f', ['\u2500', '\u2502']),
    sc('mancala', '非洲棋', '50 关 · 播撒石子入库', '#8a5a2f', '#3a2010', ['\ud83e\udea8', '\ud83c\udff4']),
    sc('queens', 'N 皇后', '50 关 · 5 到 8 皇后', '#6a4a8f', '#2a1a4f', ['\u265b', '\u2655']),
    sc('peg', '孔明棋', '50 关 · 跳吃剩子越少越好', '#8a6a3a', '#2a1c0e', ['\u26aa', '\u2b21']),
    sc('breakthru', '突破棋', '50 关 · 兵阵突破底线', '#4a5878', '#161e30', ['\ud83d\udd35', '\ud83d\udd34']),

    sc('chess', '国际象棋', '50 关 · 完整走子规则', '#6b7fa8', '#2a3450', ['\u2654', '\u265a']),
    sc('junqi', '军棋翻翻棋', '50 关 · 军衔·炸弹·地雷·军旗', '#3d4a2e', '#1e2616', ['\ud83d\udee1', '\ud83d\udea9']),
    sc('jungle', '斗兽棋', '50 关 AI 对战 · 鼠吃象 · 陷阱兽穴', '#c9a06a', '#5c3d1e', ['\ud83d\udc18', '\ud83d\udc01', '\ud83d\udc05']),
    sc('ludo', '飞行棋', '50 关 · 四色飞机 · 撞子归航 · 可本地 1~4 人', '#3a7fd5', '#152a52', ['\u2708', '\ud83c\udfb2', '\ud83d\udee9']),
    sc('advchess', '冒险棋', '50 关 · 掷骰单线 · 前进后退停一轮 · 可本地 1~4 人', '#2f6fa5', '#123049', ['\ud83c\udfb2', '\ud83c\udfc1', '\u26a1']),

    sc('solitaire', '纸牌接龙', '50 关 · Klondike 经典', '#1f5c3a', '#0d2e1d', ['\u2660', '\u2665']),
    sc('spider', '蜘蛛纸牌', '50 关 · K→A 序列消除', '#1f4a5c', '#0d2230', ['\ud83d\udd77', '\u2660']),
    sc('freecell', '空当接龙', '50 关 · 4 空当 52 张归位', '#3a2f52', '#1a1430', ['\ud83c\udccf', '\u2663']),
    sc('pyramid', '金字塔纸牌', '50 关 · 凑 13 消除', '#4a3a26', '#241a10', ['\ud83d\udd0d', '\u2666']),
    sc('blackjack', '21 点', '50 关 + 无尽 · 筹码翻倍', '#1f5c3a', '#0a2418', ['\ud83c\udccf', '\ud83d\udcb0']),
    sc('poker', '五张比牌', '50 关 · 换牌比牌型', '#2f3a52', '#141c2c', ['\u2660', '\u2665', '\u2666']),
    sc('war', '纸牌大战', '50 关 · 点数大者胜', '#3a2f52', '#1a1430', ['\ud83c\udccf', '\u2694']),
    sc('monopoly', '大富翁', '50 关 · 4 人局 · 买地建楼 · 自动存档', '#2f4a3a', '#12241c', ['\ud83c\udfe0', '\ud83c\udfb2', '\ud83d\udcb0']),
    sc('richman', '强手棋', '50 关 + 无尽 · 32 格大地图 · 卡牌/神明/股市/商店', '#4a2f5c', '#1e1230', ['\ud83c\udccf', '\ud83d\udcb0', '\ud83d\udcc8']),
    sc('zuma', '祖玛', '50 关 · 射球三消 · 蛙口弹道', '#8a4a2f', '#3a1c10', ['\ud83d\udc0d', '\ud83d\udc19', '\ud83c\udfaf']),
    sc('bejeweled', '宝石迷阵', '50 关 · 换位三消 · 连锁加成', '#4a6a9f', '#1c2c4a', ['\ud83d\udc8e', '\u2728', '\ud83d\udd31']),
    sc('bubble', '泡泡龙', '50 关 · 瞄准弹射 · 悬空掉落', '#2f5c8a', '#122840', ['\ud83e\udee7', '\ud83c\udfaf', '\ud83c\udf0a']),
    sc('alienshoot', '孤胆枪手', '50 关 · 俯视扫射 · 异形潮 · 首领', '#3a5c3a', '#101c10', ['\ud83d\udd2b', '\ud83d\udc1b', '\ud83d\udca5']),
    sc('alienshoot3d', '孤胆枪手3D', '50 关 · 第一人称射线射击 · 异形', '#2a3a2a', '#0a120a', ['\ud83d\udd2b', '\ud83d\udc1b', '\ud83d\udca5']),
    sc('mummymaze', '木乃伊迷宫', '50 关 · 回合走位 · 木乃伊追踪', '#8a7a3a', '#3a3010', ['\ud83e\udddf', '\u26fd', '\ud83d\udeaa']),
    sc('rocketmania', '疯狂火箭', '50 关 · 转管接引信 · 点火升空', '#5c4a2f', '#241a0a', ['\ud83d\ude80', '\ud83d\udd25', '\ud83d\udd27']),
    sc('jigsaw', '拼图', '导入图片 · 自选 3\u00d73~8\u00d78 切块', '#4a6a5c', '#1a2c24', ['\ud83e\uddfe', '\ud83d\uddbc\ufe0f', '\ud83d\uddbc\ufe0f']),

    sc('maze', '迷宫', '50 关 · 迷宫越来越大', '#2f3a52', '#141c2c', ['\ud83c\udfc1', '\ud83c\udfc3']),
    sc('lightsout', '点灯', '50 关 · 全部熄灭', '#ffe08a', '#3a3452', ['\ud83d\udca1']),
    sc('floodit', '洪水填充', '50 关 · 最少步数同化全盘', '#ff6b7f', '#5cc7ff', ['\ud83c\udf08']),
    sc('pipes', '接水管', '50 关 · 旋转接通水源', '#1e2a3a', '#0e1622', ['\ud83d\udca7', '\ud83d\udeb0']),
    sc('nonogram', '数织', '50 关 · 按提示还原图案', '#5cc7ff', '#2a2440', ['\ud83d\udcd0']),
    sc('sudoku9', '九宫数独', '50 关 · 挖洞数递增', '#22304a', '#0e1626', ['\ud83d\udd22']),
    sc('numberpath', '数字连线', '50 关 · 按序连点', '#26304a', '#12182a', ['1', '2', '3']),
    sc('sokoban', '推箱子', '50 关 · 经典仓库番', '#3a2f22', '#1a1410', ['\ud83d\udce6', '\ud83c\udfaf']),
    sc('blockpuzzle', '方块填充', '50 关 + 无尽 · 消行得分', '#1e2a3a', '#0c141e', ['\ud83d\udfea', '\ud83d\udfe6']),
    sc('mastermind', '色码破译', '50 关 · 红白点提示推理', '#2a2438', '#15121e', ['\ud83d\udd34', '\ud83d\udd35']),

    sc('flappy', '飞扬的小鸟', '50 关 + 无尽 · 穿越管道', '#7ec8f0', '#3a90c0', ['\ud83d\udc24']),
    sc('dodge', '躲避方块', '50 关 + 无尽 · 坚持不中', '#2a2440', '#14102a', ['\ud83d\udeb6', '\ud83d\udfe5']),
    sc('catcher', '接苹果', '50 关 + 无尽 · 别接炸弹', '#3a5a2e', '#16281a', ['\ud83c\udf4e', '\ud83d\udca3']),
    sc('balloonpop', '扎气球', '50 关 + 无尽 · 别让它飞走', '#4a7fd0', '#1a3a70', ['\ud83c\udf88']),
    sc('archery', '射箭', '50 关 + 无尽 · 越近靶心越高', '#5a7a4a', '#22381a', ['\ud83c\udff9', '\ud83c\udfaf']),
    sc('basketball', '投篮', '50 关 + 无尽 · 空心入网', '#8a5a2f', '#3a2412', ['\ud83c\udfc0', '\u26f9']),
    sc('darts', '飞镖', '50 关 + 无尽 · 正中红心', '#3a2f52', '#1a1430', ['\ud83c\udfaf']),
    sc('fishing', '钓鱼', '50 关 + 无尽 · 别钓上鞋子', '#2a6a9f', '#0e2a4a', ['\ud83d\udc1f', '\ud83e\udd7e']),
    sc('helicopter', '直升机', '50 关 + 无尽 · 穿越障碍', '#2a3a5f', '#121c32', ['\ud83d\ude81']),
    sc('stacker', '叠方块', '50 关 + 无尽 · 越叠越高', '#3a2f52', '#1a1430', ['\ud83d\udfe6', '\ud83d\udfea']),

    sc('mathquiz', '速算挑战', '50 关 · 加减乘除混合', '#5cc7ff', '#2a5ac0', ['\u2795', '\u2797']),
    sc('stroop', '色字干扰', '50 关 · 选字体颜色', '#e03a4a', '#3a7fd0', ['\ud83c\udf08']),
    sc('higherlower', '比大小', '50 关 · 猜大还是小', '#ffd56b', '#b06818', ['\u2b06', '\u2b07']),
    sc('oddone', '找不同', '50 关 · 找出不一样的', '#7adf7a', '#2e8a3e', ['\ud83d\udc36', '\ud83d\udc31']),
    sc('idiom', '成语填空', '50 关 · 四字成语补字', '#ffb86b', '#b04818', ['\ud83d\udcd6']),
    sc('trivia', '常识问答', '50 关 · 百科知识', '#b78bff', '#5a2ea8', ['\u2753', '\ud83d\udcda']),
    sc('counting', '数一数', '50 关 · 数量越来越多', '#ff9d5c', '#b04818', ['\ud83d\udd34', '\u2b50']),
    sc('estimate', '眼力估算', '50 关 · 误差范围递减', '#5cc7ff', '#2a6adf', ['\ud83d\udccf']),
    sc('clockread', '读时钟', '50 关 · 认表盘时间', '#2a2440', '#14102a', ['\ud83d\udd57']),
    sc('sequence', '数列推理', '50 关 · 找规律填数', '#7adf7a', '#2e8a3e', ['1', '2', '3', '?']),

    sc('flashnum', '闪记数字', '50 关 · 数字位数递增', '#3a2f52', '#1a1430', ['\ud83d\udd22', '\u26a1']),
    sc('chimp', '猩猩记忆', '50 关 · 位置顺序记忆', '#2f4a3a', '#14241c', ['\ud83e\udd8d', '\ud83d\udd22']),
    sc('simon', '色彩记忆', '50 关 + 无尽 · 照序点亮', '#262038', '#12101e', ['\ud83d\udfe5', '\ud83d\udfe6']),
    sc('cardmem', '记牌', '50 关 · 记住亮过的牌', '#2f4a3a', '#14241c', ['\u2660', '\u2665']),
    sc('wordmem', '记词', '50 关 · 词语闪记', '#ffb86b', '#b04818', ['\ud83d\udcd6']),
    sc('spot', '找隐藏', '50 关 · 图案越来越密', '#3a3350', '#1a1730', ['\ud83d\udd0d', '\u2b50']),
    sc('pathmem', '路径记忆', '50 关 · 顺序点亮格子', '#2a3a52', '#141c2c', ['\ud83d\udfe8', '\u2728']),
    sc('shadowmatch', '影子配对', '50 关 · 剪影辨物', '#5a4a8f', '#221a3f', ['\ud83d\udc36', '\ud83d\udc31']),
    sc('whatmiss', '缺什么', '50 关 · 找出被拿走的', '#7adf7a', '#2e8a3e', ['\u2757', '\ud83c\udf4e']),
    sc('reversenum', '倒背数字', '50 关 · 数字倒序', '#ffd56b', '#b06818', ['\ud83d\udd04', '\ud83d\udd22']),

    sc('coinflip', '抛硬币', '50 关 + 无尽 · 连胜挑战', '#3a2f52', '#1a1430', ['\ud83e\ude99']),
    sc('dicehi', '骰子比大小', '50 关 + 无尽 · 猜大小', '#2f4a3a', '#14241c', ['\ud83c\udfb2']),
    sc('slots', '老虎机', '50 关 + 无尽 · 三连中奖', '#5a2f4a', '#2a1020', ['\ud83c\udfb0', '\ud83d\udc8e']),
    sc('bingo', '宾果', '50 关 · 连成指定线数', '#3a2f52', '#1a1430', ['\ud83d\udd22', '\u2714']),
    sc('spinner', '幸运转盘', '50 关 + 无尽 · 转到高分', '#4a2f52', '#20103a', ['\ud83c\udfaf']),
    sc('rpsgame', '猜拳连胜', '50 关 + 无尽 · 石头剪刀布', '#2f3a52', '#141c2c', ['\u270a', '\u270c', '\u270b']),
    sc('plinko', '弹珠台', '50 关 + 无尽 · 落高分槽', '#1f3a52', '#0c1e2e', ['\ud83d\udfe1', '\ud83c\udfaf']),
    sc('lucky7', '幸运七', '50 关 + 无尽 · 猜两骰之和', '#3a2f22', '#1a1410', ['\ud83c\udfb2', '7']),
    sc('tapburst', '连点挑战', '50 关 + 无尽 · 手速比拼', '#2f4a5f', '#12283a', ['\ud83d\udc46', '\u26a1']),
    sc('gacha', '扭蛋抽卡', '50 关 + 无尽 · 抽 SSR', '#4a2f52', '#20103a', ['\ud83e\udd5a', '\u2b50']),

    sc('towerdef', '迷你塔防', '50 关 + 无尽 · 建塔守家', '#2f4a3a', '#14241c', ['\ud83d\uddfc', '\ud83d\udc7e']),
    sc('idleclick', '放置点击', '50 关 + 无尽 · 挂机赚钱', '#4a3f22', '#241d10', ['\ud83e\ude99', '\u2b06']),
    sc('life', '生命游戏', '50 关 · 细胞演化存活数', '#1f2a3a', '#0c1420', ['\ud83e\uddec', '\ud83d\udfe9']),
    sc('virus', '病毒扩散', '50 关 · 有限次数治愈', '#2a2038', '#140f1e', ['\ud83e\udda0', '\ud83d\udc8a']),
    sc('sandfall', '流沙填充', '50 关 + 无尽 · 填到目标线', '#3a2f22', '#1a1410', ['\ud83c\udfd6', '\ud83d\udca7']),
    sc('ballance', '平衡杆', '50 关 + 无尽 · 别让球掉', '#2f3a52', '#141c2c', ['\ud83d\udd34', '\u2696']),
    sc('rocketland', '火箭着陆', '50 关 + 无尽 · 安全降落', '#0e1430', '#05080f', ['\ud83d\ude80']),
    sc('orbit', '轨道跳跃', '50 关 + 无尽 · 躲开陨石', '#0e1430', '#05080f', ['\ud83d\udef0', '\u2604']),
    sc('traffic', '交通调度', '50 关 · 避免路口相撞', '#2f3a3a', '#141c1c', ['\ud83d\ude97', '\ud83d\uded1']),
    sc('growfarm', '开心农场', '50 关 + 无尽 · 种植收获', '#3a5a2e', '#16281a', ['\ud83c\udf31', '\ud83c\udf3e']),

    // 本轮新增（3 款）
    sc('knife', '鸠摩智转刀', '50 关 + 无尽 · 转盘上插刀避开已有', '#8a5a2f', '#3a2010', ['\ud83d\udd2a', '\ud83c\udfaf']),
    sc('sheep', '羊了个羊', '50 关 + 无尽 · 7 槽堆叠消除', '#fff5d6', '#caa86a', ['\ud83d\udc11', '\ud83d\udc30']),
    sc('pocketarmy', '口袋奇兵', '50 关 + 无尽 · 加减门 / 木桶 / 敌人', '#3a7fd0', '#1a3a70', ['\ud83d\udc66', '\ud83d\udca3']),

    // FC 经典复刻（自研）
    sc('tank', '坦克大战', '50 关 + 无尽 · 本地双人 · 守护基地', '#6a5a2a', '#2a2410', ['\ud83d\udee1', '\ud83e\udea8', '\ud83e\udd85']),
    sc('contra1', '魂斗罗·丛林突击', '50 关 + 无尽 · 本地双人 · 横版跑打', '#2f6a3a', '#12301a', ['\ud83c\udfb2', '\ud83d\udc64', '\ud83d\udc64']),
    sc('contra2', '魂斗罗·工厂渗透', '50 关 + 无尽 · 本地双人 · 机械关', '#3a4460', '#141a2a', ['\ud83e\udd16', '\ud83d\udd2b', '\ud83d\udc64']),
    sc('pinball', '三维弹球', '50 关 + 无尽 · 太空军校生 · 挡板弹射', '#2a2440', '#0e0a1c', ['\ud83d\udccf', '\u2b50', '\ud83d\udca5']),

    // 本轮新增（1 款）
    sc('cookingfever', '烹饪发烧友', '50 关 + 无尽 · 读单做菜 · 托盘凑齐自动上菜', '#e8a04a', '#7a3a12', ['\ud83c\udf74', '\ud83c\udf7f', '\ud83e\udd80', '\ud83c\udf66']),
    sc('danmaku', '弹幕樱华祭', '20 关 + 无尽 · 东方风弹幕 · 躲弹幕击破 BOSS 符卡', '#1a0a2e', '#3a1040', ['\ud83c\udf86', '\u2728', '\ud83e\udd8c']),

    // 魔塔系列（本轮新增 3 款）
    sc('tower50', '魔塔 50 层', '50 层经典魔塔 · 撞怪战斗 · 捡钥匙开门 · 登顶击败魔王', '#26304e', '#34406a', ['\ud83d\uddfc', '\u2694', '\ud83d\udd11']),
    sc('tower24', '魔塔 24 层', '24 层轻松魔塔 · 入门友好 · 节奏明快', '#1f3a28', '#2c5440', ['\ud83d\uddfc', '\ud83d\udef1', '\ud83d\udc8e']),
    sc('newtower56', '新新魔塔 56 层', '56 层高难魔塔 · 守层卫士 + 魔王', '#2a1f3e', '#3e2a56', ['\ud83d\uddfc', '\ud83d\udc51', '\ud83d\udd25']),
];

// ===== 分类（棋牌/益智/休闲/动作/记忆/问答/运气/模拟/魔塔/街机）=====
const CATEGORIES = [
    ['all', '全部'], ['board', '棋牌类'], ['puzzle', '益智类'], ['casual', '休闲类'],
    ['action', '动作类'], ['memory', '记忆类'], ['quiz', '问答类'], ['luck', '运气类'],
    ['sim', '模拟类'], ['tower', '魔塔类'], ['fc', '街机经典'], ['versus', '🌐 联网对战'],
];
const CAT_OF = Object.assign({}, ...[
    ['board', ['gomoku', 'g2048', 'banqi', 'xiangqi', 'tictactoe', 'connect4', 'reversi', 'nim', 'battleship', 'dots', 'mancala', 'queens', 'peg', 'breakthru', 'chess', 'junqi', 'jungle', 'ludo', 'advchess', 'solitaire', 'spider', 'freecell', 'pyramid', 'blackjack', 'poker', 'war', 'monopoly', 'richman']],
    ['puzzle', ['link', 'match3', 'snake', 'tetris', 'mine', 'slide15', 'bulls', 'sudoku6', 'hanoi', 'mummymaze', 'jigsaw', 'maze', 'lightsout', 'floodit', 'pipes', 'nonogram', 'sudoku9', 'numberpath', 'sokoban', 'blockpuzzle', 'mastermind', 'snakepvp', 'maze-coop']],
    ['memory', ['memory', 'flashnum', 'chimp', 'simon', 'cardmem', 'wordmem', 'spot', 'pathmem', 'shadowmatch', 'whatmiss', 'reversenum']],
    ['quiz', ['mathquiz', 'stroop', 'higherlower', 'oddone', 'idiom', 'trivia', 'counting', 'estimate', 'clockread', 'sequence']],
    ['luck', ['coinflip', 'dicehi', 'slots', 'bingo', 'spinner', 'rpsgame', 'plinko', 'lucky7', 'tapburst', 'gacha']],
    ['casual', ['mole', 'piano', 'reaction', 'zuma', 'bejeweled', 'bubble', 'rocketmania', 'sheep', 'cookingfever']],
    ['action', ['breakout', 'jump', 'shooter', 'alienshoot', 'alienshoot3d', 'flappy', 'dodge', 'catcher', 'balloonpop', 'archery', 'basketball', 'darts', 'fishing', 'helicopter', 'stacker', 'knife', 'pocketarmy', 'danmaku']],
    ['sim', ['towerdef', 'idleclick', 'life', 'virus', 'sandfall', 'ballance', 'rocketland', 'orbit', 'traffic', 'growfarm']],
    ['tower', ['tower50', 'tower24', 'newtower56']],
    ['fc', ['tank', 'contra1', 'contra2', 'pinball']],
].map(([c, ids]) => Object.fromEntries(ids.map(id => [id, c])))
);
GAMES.forEach(g => { g.cat = CAT_OF[g.id] || 'other'; });

// ===== 联机对战注册表 =====
// 仅这些游戏显示「联网对战」按钮（其余如三维弹球等无）。seats = 该游戏一张桌的座位数。
// NET_WIRED：游戏模块已真正接入状态同步（整盘广播 + 按回合锁输入），满座即真实开战。
//   棋类 2 人桌、强手棋/大富翁 4 人桌均已落地（mg-pvp 已支持 N 人回合轮转）。
const NET_GAMES = {
    gomoku: { seats: 2 }, banqi: { seats: 2 }, xiangqi: { seats: 2 }, chess: { seats: 2 },
    junqi: { seats: 2 }, jungle: { seats: 2 }, ludo: { seats: 2 }, advchess: { seats: 2 },
    monopoly: { seats: 4 }, richman: { seats: 4 },
    memory: { seats: 2 }, g2048: { seats: 2, race: true },
};
const NET_WIRED = { gomoku: 1, banqi: 1, xiangqi: 1, chess: 1, junqi: 1, jungle: 1, ludo: 1, monopoly: 1, richman: 1, memory: 1, g2048: 1, tankpvp: 1, snakepvp: 1, 'maze-coop': 1 };
const NET_GAMES_COUNT = Object.keys(NET_GAMES).length;

// 场景缩略图生成器：渐变底 + 圆角边框 + 装饰光斑 + emoji 组合
// items: [emoji, x, y, size]
function sceneThumb(c1, c2, items) {
    const id = 'st' + Math.abs(hashStr(c1 + c2 + items.map(i => i[0]).join('')));
    return `<svg viewBox="0 0 88 60" width="100%" height="100%">
        <defs>
            <linearGradient id="${id}" x1="0" y1="0" x2="0.7" y2="1">
                <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
            </linearGradient>
        </defs>
        <rect width="88" height="60" rx="10" fill="url(#${id})"/>
        <circle cx="12" cy="50" r="16" fill="#fff" opacity="0.10"/>
        <circle cx="80" cy="8" r="12" fill="#fff" opacity="0.12"/>
        <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.4"/>
        ${items.map(([e, x, y, s]) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${s}">${e}</text>`).join('')}
    </svg>`;
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// 暗棋圣手专属缩略图：宋国小人（长翅幞头）vs 金国小人（皮草帽），Q 版对峙
function banqiThumb() {
    return `<svg viewBox="0 0 88 60" width="100%" height="100%">
        <defs>
            <linearGradient id="tgbq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#8a5a2f"/><stop offset="1" stop-color="#4a2c12"/>
            </linearGradient>
            <linearGradient id="tgbqr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#e8634f"/><stop offset="1" stop-color="#a52a2a"/>
            </linearGradient>
            <linearGradient id="tgbqb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#5d6f9e"/><stop offset="1" stop-color="#2c3a56"/>
            </linearGradient>
        </defs>
        <rect width="88" height="60" fill="url(#tgbq)"/>
        <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="#ffd56b" stroke-width="1.2" stroke-opacity="0.55"/>
        <!-- 宋国小人（左，红） -->
        <g>
            <path d="M20 32 Q28 29 36 32 L40 52 Q28 56 16 52 Z" fill="url(#tgbqr)"/>
            <circle cx="28" cy="24" r="9" fill="#ffe3c8"/>
            <ellipse cx="25" cy="24" rx="1.7" ry="2.1" fill="#1c1c28"/>
            <ellipse cx="31" cy="24" rx="1.7" ry="2.1" fill="#1c1c28"/>
            <path d="M25 29 Q28 31 31 29" stroke="#a04848" stroke-width="1.2" fill="none" stroke-linecap="round"/>
            <path d="M20.5 18 Q28 12 35.5 18 L35.5 20.5 Q28 17.5 20.5 20.5 Z" fill="#2e2e42"/>
            <line x1="20.5" y1="17.5" x2="9" y2="16" stroke="#2e2e42" stroke-width="2" stroke-linecap="round"/>
            <line x1="35.5" y1="17.5" x2="47" y2="16" stroke="#2e2e42" stroke-width="2" stroke-linecap="round"/>
            <circle cx="28" cy="12.5" r="1.8" fill="#ffd56b"/>
        </g>
        <!-- 金国小人（右，蓝） -->
        <g>
            <path d="M52 32 Q60 29 68 32 L72 52 Q60 56 48 52 Z" fill="url(#tgbqb)"/>
            <circle cx="60" cy="24" r="9" fill="#f5cfa3"/>
            <ellipse cx="57" cy="24" rx="1.7" ry="2.1" fill="#1c1c28"/>
            <ellipse cx="63" cy="24" rx="1.7" ry="2.1" fill="#1c1c28"/>
            <path d="M55 21.5 L59 23 M61 23 L65 21.5" stroke="#1c1c28" stroke-width="1.1" stroke-linecap="round"/>
            <path d="M57 29 Q60 27.6 63 29" stroke="#a04848" stroke-width="1.2" fill="none" stroke-linecap="round"/>
            <ellipse cx="60" cy="14.5" rx="8.4" ry="4.2" fill="#7a839a"/>
            <circle cx="54.5" cy="17" r="1.9" fill="#e9ecf4"/>
            <circle cx="65.5" cy="17" r="1.9" fill="#e9ecf4"/>
            <path d="M69 17 q3.5 4 2 8" stroke="#2a2a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        </g>
        <!-- VS -->
        <text x="44" y="34" text-anchor="middle" font-size="13" font-weight="900" fill="#ffd56b" stroke="#40260f" stroke-width="2.5" paint-order="stroke" font-family="Arial Black, sans-serif">VS</text>
    </svg>`;
}

// 2048 专属缩略图：绿毒蛇 + 蓝毒蛇 + 蛇精对峙（葫芦娃妖怪风）
function g2048Thumb() {
    return `<svg viewBox="0 0 88 60" width="100%" height="100%">
        <defs>
            <linearGradient id="tg2048" x1="0" y1="0" x2="0.6" y2="1">
                <stop offset="0" stop-color="#5a7a9f"/><stop offset="1" stop-color="#2c3e6a"/>
            </linearGradient>
        </defs>
        <rect width="88" height="60" fill="url(#tg2048)"/>
        <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="#ffd56b" stroke-width="1.2" stroke-opacity="0.55"/>
        <!-- L1 绿蛇（左下） -->
        <g transform="translate(8 26)">
            <path d="M0 12 Q5 8 10 12 Q15 16 20 8" stroke="#5a8a3a" stroke-width="4" fill="none" stroke-linecap="round"/>
            <ellipse cx="20" cy="8" rx="4.5" ry="3.5" fill="#7adf7a" stroke="#5a8a3a" stroke-width="0.8"/>
            <circle cx="22" cy="7" r="1.4" fill="#fff"/><circle cx="22.2" cy="7" r="0.7" fill="#000"/>
            <circle cx="6.5" cy="9" r="2.4" fill="#fff"/><text x="6.5" y="10" text-anchor="middle" font-size="3" font-weight="bold" fill="#3a7a3a">1</text>
        </g>
        <!-- L2 蓝蛇（中上） -->
        <g transform="translate(28 8)">
            <path d="M0 10 Q4 4 8 8 Q12 14 18 6" stroke="#3a4d8f" stroke-width="4" fill="none" stroke-linecap="round"/>
            <ellipse cx="18" cy="6" rx="4.8" ry="3.5" fill="#a8b8f0" stroke="#3a4d8f" stroke-width="0.8" transform="rotate(-15 18 6)"/>
            <path d="M16 5 L21 4 L17.5 7 Z" fill="#3a4d8f"/>
            <circle cx="20" cy="5" r="1.4" fill="#fff"/><circle cx="20.2" cy="5" r="0.7" fill="#000"/>
            <circle cx="6.5" cy="6" r="2.4" fill="#fff"/><text x="6.5" y="7" text-anchor="middle" font-size="3" font-weight="bold" fill="#3a4d8f">2</text>
        </g>
        <!-- L11 蛇精（右上 + 王冠） -->
        <g transform="translate(54 12)">
            <path d="M0 22 Q-4 14 4 10 Q12 6 18 14" stroke="#3a1a5f" stroke-width="4" fill="none" stroke-linecap="round"/>
            <ellipse cx="20" cy="14" rx="5.5" ry="4" fill="#b59cd8" stroke="#3a1a5f" stroke-width="0.8"/>
            <path d="M16 9 L18 6 L20 9 L22 5 L24 9" stroke="#ffd56b" stroke-width="1.2" fill="none" stroke-linecap="round"/>
            <ellipse cx="19" cy="13.5" rx="1.2" ry="0.6" fill="#ff5050" transform="rotate(20 19 13.5)"/>
            <ellipse cx="22" cy="14.5" rx="1.2" ry="0.6" fill="#ff5050" transform="rotate(-15 22 14.5)"/>
            <circle cx="6" cy="11" r="3" fill="#fff"/><text x="6" y="12" text-anchor="middle" font-size="3.6" font-weight="bold" fill="#3a1a5f">11</text>
        </g>
        <!-- 标题 -->
        <text x="44" y="52" text-anchor="middle" font-size="6.5" font-weight="bold" fill="#ffd56b" font-family="Microsoft YaHei, sans-serif" stroke="#1a2a4a" stroke-width="1.5" paint-order="stroke">降妖伏魔</text>
    </svg>`;
}

    // 烹饪发烧友专属缩略图：厨师帽 + 汉堡薯条饮料
    function cookingThumb() {
        return `<svg viewBox="0 0 88 60" width="100%" height="100%">
            <defs>
                <linearGradient id="tcook" x1="0" y1="0" x2="0.6" y2="1">
                    <stop offset="0" stop-color="#e8a04a"/><stop offset="1" stop-color="#7a3a12"/>
                </linearGradient>
            </defs>
            <rect width="88" height="60" fill="url(#tcook)"/>
            <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="#ffe0a8" stroke-width="1.2" stroke-opacity="0.55"/>
            <!-- 厨师帽 -->
            <g transform="translate(20 8)">
                <ellipse cx="10" cy="14" rx="13" ry="8" fill="#fff"/>
                <rect x="2" y="13" width="16" height="11" rx="3" fill="#fff"/>
                <rect x="2" y="21" width="16" height="2.5" fill="#e8a04a"/>
            </g>
            <!-- 盘子 -->
            <ellipse cx="58" cy="40" rx="22" ry="8" fill="#fff" opacity="0.85"/>
            <ellipse cx="58" cy="39" rx="16" ry="5.5" fill="#e8d6b0"/>
            <text x="49" y="40" text-anchor="middle" font-size="12">\ud83c\udf74</text>
            <text x="61" y="40" text-anchor="middle" font-size="12">\ud83c\udf7f</text>
            <text x="72" y="40" text-anchor="middle" font-size="12">\ud83e\udd80</text>
            <text x="44" y="56" text-anchor="middle" font-size="7" font-weight="bold" fill="#ffe0a8" font-family="Microsoft YaHei, sans-serif">现做现卖</text>
        </svg>`;
    }

    function danmakuThumb() {
        // 巫女剪影 + 放射状弹幕
        let bullets = '';
        for (let i = 0; i < 16; i++) {
            const a = i / 16 * Math.PI * 2, r1 = 16, r2 = 26 + (i % 3) * 5;
            bullets += `<circle cx="${(44 + Math.cos(a) * r2).toFixed(1)}" cy="${(30 + Math.sin(a) * r2).toFixed(1)}" r="2.2" fill="#ff6fae"/>`;
            bullets += `<line x1="${(44 + Math.cos(a) * r1).toFixed(1)}" y1="${(30 + Math.sin(a) * r1).toFixed(1)}" x2="${(44 + Math.cos(a) * r2).toFixed(1)}" y2="${(30 + Math.sin(a) * r2).toFixed(1)}" stroke="rgba(255,111,174,.5)" stroke-width="1"/>`;
        }
        return `<svg viewBox="0 0 88 60" width="100%" height="100%">
            <defs><linearGradient id="dk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a0a2e"/><stop offset="1" stop-color="#3a1040"/></linearGradient></defs>
            <rect width="88" height="60" rx="10" fill="url(#dk)"/>
            <circle cx="44" cy="30" r="22" fill="#ff6fae" opacity="0.10"/>
            ${bullets}
            <g transform="translate(44,30)">
                <path d="M-7,10 L7,10 L4,-1 L-4,-1 Z" fill="#f4f0ff"/>
                <circle cx="0" cy="-7" r="5" fill="#ffe0c4"/>
                <path d="M-5,-8 A5,5 0 0 1 5,-8 Z" fill="#3a2b4a"/>
                <circle cx="-6" cy="-9" r="1.6" fill="#e23b5a"/><circle cx="6" cy="-9" r="1.6" fill="#fff"/>
            </g>
            <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.4"/>
        </svg>`;
    }

    function towerThumb(c1, c2) {
        const id = 'tw' + ((towerThumb._n = (towerThumb._n || 0) + 1));
        return `<svg viewBox="0 0 88 60" width="100%" height="100%">
            <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
            <rect width="88" height="60" rx="10" fill="url(#${id})"/>
            <g transform="translate(44,54)">
                <rect x="-10" y="-32" width="20" height="32" fill="#ece4d2" opacity="0.94"/>
                <rect x="-7" y="-42" width="14" height="12" fill="#d8c8a8"/>
                <rect x="-4" y="-50" width="8" height="10" fill="#c8b890"/>
                <polygon points="0,-56 4,-50 -4,-50" fill="#ffd56b"/>
                <rect x="-13" y="-20" width="4" height="20" fill="#2a2740"/>
                <rect x="9" y="-20" width="4" height="20" fill="#2a2740"/>
                <circle cx="-5" cy="-18" r="2.2" fill="#ffd56b"/>
                <circle cx="5" cy="-18" r="2.2" fill="#ffd56b"/>
            </g>
            <text x="18" y="18" text-anchor="middle" font-size="13">\ud83d\udd11</text>
            <text x="70" y="18" text-anchor="middle" font-size="13">\u2694</text>
            <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.4"/>
        </svg>`;
    }

    // 2048 / 暗棋 / 烹饪 / 弹幕 / 魔塔 使用专属手绘缩略图
    (function () {
        const g2 = GAMES.find(g => g.id === 'g2048'); if (g2) g2.thumb = g2048Thumb();
        const g3 = GAMES.find(g => g.id === 'banqi'); if (g3) g3.thumb = banqiThumb();
        const g4 = GAMES.find(g => g.id === 'cookingfever'); if (g4) g4.thumb = cookingThumb();
        const g5 = GAMES.find(g => g.id === 'danmaku'); if (g5) g5.thumb = danmakuThumb();
        const g6 = GAMES.find(g => g.id === 'tower50'); if (g6) g6.thumb = towerThumb('#26304e', '#34406a');
        const g7 = GAMES.find(g => g.id === 'tower24'); if (g7) g7.thumb = towerThumb('#1f3a28', '#2c5440');
        const g8 = GAMES.find(g => g.id === 'newtower56'); if (g8) g8.thumb = towerThumb('#2a1f3e', '#3e2a56');
    })();

window.MinigamesView = MinigamesView;
