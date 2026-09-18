// 小游戏联机中继（server/ws-relay.js）—— 体验 E1 真实多人
// 挂在 server.js 的 upgrade 钩子上，路径 /ws/minigame。
// 职责：按「游戏」分桶的等待队列 + 房间配对 + 房间内 input/state 转发 + 心跳清理。
// 设计要点：
//   1) 单进程内运行，不另起端口/进程；外网经宝塔 Nginx 443 透传 Upgrade 头直达本进程。
//   2) 匹配按 game 隔离——点五子棋只会匹配到等五子棋的人，绝不串到象棋。
//   3) 全程 try/catch，任何坏消息/异常都不允许拖挂主进程（参考 server.js 的容错哲学）。
//   4) 房间容量 2（PvP）；超过的按「房间已满」拒绝。好友邀请走 room 码。

const crypto = require('crypto');

// ws 模块：项目 node_modules 已带；若部署机缺失，attach 直接 no-op 并告警，不阻断服务。
let WebSocketServer = null;
try { ({ WebSocketServer } = require('ws')); } catch (e) { WebSocketServer = null; }

const PATH = '/ws/minigame';

// rooms: id -> { game, cap, started, peers:[{ws,name,side}], createdAt }
const rooms = new Map();
// waiting: game -> [ws]（只存单人，快速匹配时凑对手；QQ 大厅模式下基本不再使用，保留兼容）
const waiting = new Map();
// lobbies: game -> Set(ws)（订阅该游戏桌子列表的浏览器；座位变化/开战时推 tables）
const lobbies = new Map();

function send(ws, type, data) {
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, data })); } catch (e) {}
}
function leaveWaiting(ws) {
    for (const [game, arr] of waiting) {
        const i = arr.indexOf(ws);
        if (i >= 0) { arr.splice(i, 1); if (!arr.length) waiting.delete(game); return; }
    }
}
function genRoom(game) {
    return 'mg-' + (game || 'g') + '-' + crypto.randomBytes(4).toString('hex');
}
// 把同游戏的两个等待者配对成房间（快速匹配遗留路径）
function pair(game, a, b) {
    const id = genRoom(game);
    const room = { game, cap: 2, started: false, peers: [{ ws: a, name: a._name, side: 0 }, { ws: b, name: b._name, side: 1 }], createdAt: Date.now() };
    rooms.set(id, room);
    a._room = id; b._room = id; a._side = 0; b._side = 1;
    send(a, 'room', { room: id, game, side: 0, opp: b._name });
    send(b, 'room', { room: id, game, side: 1, opp: a._name });
}
// 房间座位快照：长度 cap，已占座位为 {name,side}，空位为 null
function seatView(room) {
    const seats = [];
    for (let i = 0; i < room.cap; i++) { const p = room.peers[i]; seats.push(p ? { name: p.name, side: p.side } : null); }
    return seats;
}
// 向房间内所有人广播座位占用
function broadcastSeat(room) {
    const seats = seatView(room);
    const full = room.peers.length >= room.cap;
    room.peers.forEach(p => send(p.ws, 'seat', { seats, cap: room.cap, you: p.side, full, started: room.started }));
}
// 向订阅该游戏大厅的浏览器推送桌子列表（只列未开始且未满的桌）
function broadcastTables(game) {
    const set = lobbies.get(game);
    if (!set || !set.size) return;
    const tables = [];
    for (const [id, room] of rooms) {
        if (room.game !== game) continue;
        if (room.started || room.peers.length >= room.cap) continue;
        tables.push({ room: id, cap: room.cap, seats: seatView(room), full: false });
    }
    set.forEach(ws => send(ws, 'tables', { game, tables }));
}
// 满座 → 开战：给每人发 start（带自己 side 与对手昵称列表）
function startRoom(room) {
    room.started = true;
    const names = room.peers.map(p => p.name);
    room.peers.forEach(p => {
        const opp = names.filter((_, i) => i !== p.side);
        send(p.ws, 'start', { room: p.ws._room, game: room.game, side: p.side, opp, seats: seatView(room) });
    });
    broadcastTables(room.game); // 满桌从等候厅移除
}
// 按房间码加入（好友邀请）：房间不存在则创建（房主）
function joinRoom(ws, roomId, cap) {
    let room = rooms.get(roomId);
    if (!room) { // 房主建房：用该房间码开启一个等待对手的房间
        room = { game: ws._game, cap: cap || 2, started: false, peers: [], createdAt: Date.now() };
        rooms.set(roomId, room);
    }
    if (room.started) { send(ws, 'error', { msg: '对局已开始，无法加入' }); return; }
    if (room.peers.length >= room.cap) { send(ws, 'error', { msg: '房间已满' }); return; }
    const side = room.peers.length; // 0..cap-1，按入座顺序分配座位
    room.peers.push({ ws, name: ws._name, side });
    ws._room = roomId; ws._side = side;
    broadcastSeat(room);
    broadcastTables(room.game);
    if (room.peers.length >= room.cap) startRoom(room);
}
function cleanup(ws) {
    try { leaveWaiting(ws); } catch (e) {}
    // 退出大厅订阅
    if (ws._lobby && ws._game && lobbies.has(ws._game)) {
        const set = lobbies.get(ws._game);
        set.delete(ws);
        if (!set.size) lobbies.delete(ws._game);
    }
    const id = ws._room;
    if (id && rooms.has(id)) {
        const room = rooms.get(id);
        const left = room.peers.find(p => p.ws === ws);
        room.peers = room.peers.filter(p => p.ws !== ws);
        if (room.started) {
            // 对局进行中有人离开：通知剩余玩家，但桌子不再回到等候厅（避免第三者插入）
            room.peers.forEach(p => send(p.ws, 'peer_left', { side: left ? left.side : null }));
        } else {
            broadcastSeat(room);
            if (!room.peers.length) { rooms.delete(id); broadcastTables(room.game); }
            else broadcastTables(room.game);
        }
    }
    try { if (ws.terminate) ws.terminate(); } catch (e) {}
}
// 列出某游戏所有「未满且未开始」的桌子（供大厅展示；空桌不列）
function listTables(game) {
    const tables = [];
    for (const [id, room] of rooms) {
        if (room.game !== game) continue;
        if (room.started || !room.peers.length || room.peers.length >= room.cap) continue;
        tables.push({ room: id, cap: room.cap, seats: seatView(room), full: false });
    }
    return tables;
}
// 找一张同游戏、容量匹配、未满未开始的桌（空桌不自动并入，直接另开）
function findOpenRoom(game, cap) {
    for (const [id, room] of rooms) {
        if (room.game !== game) continue;
        if (room.started || !room.peers.length) continue;
        if (room.cap !== cap) continue;
        if (room.peers.length < room.cap) return id;
    }
    return null;
}

function attach(server) {
    if (!WebSocketServer) {
        console.warn('[ws-relay] 未安装 ws 模块（npm i ws），联机对战不可用；其余服务正常');
        return;
    }
    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', (ws) => {
        ws._name = '对手'; ws._room = null; ws._game = null; ws._side = null; ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', (buf) => {
            let m; try { m = JSON.parse((buf && buf.toString) ? buf.toString() : '{}'); } catch (e) { return; }
            if (!m || typeof m !== 'object') return;
            const d = m.data || {};
            try {
                if (m.type === 'lobby') {
                    // QQ 游戏大厅：订阅某游戏的桌子列表（座位/昵称实时更新）
                    ws._game = d.game || 'unknown';
                    const cap = d.cap || 2;
                    if (!lobbies.has(ws._game)) lobbies.set(ws._game, new Set());
                    lobbies.get(ws._game).add(ws);
                    ws._lobby = true;
                    send(ws, 'tables', { game: ws._game, tables: listTables(ws._game) });
                } else if (m.type === 'join') {
                    ws._name = (d.me && String(d.me).slice(0, 24)) || '对手';
                    ws._game = d.game || 'unknown';
                    const cap = d.cap || 2;
                    if (d.room) { joinRoom(ws, String(d.room), cap); return; }
                    if (d.create) { // 创建新桌：总是开一张空桌（即使已有空桌也另开）
                        const id = genRoom(ws._game);
                        const room = { game: ws._game, cap, started: false, peers: [], createdAt: Date.now() };
                        rooms.set(id, room);
                        joinRoom(ws, id, cap);
                        return;
                    }
                    // 快速加入：找一张同游戏未满未开始的桌并入座；没有则自动开一张新桌
                    const open = findOpenRoom(ws._game, cap);
                    if (open) joinRoom(ws, open, cap);
                    else { const id = genRoom(ws._game); rooms.set(id, { game: ws._game, cap, started: false, peers: [], createdAt: Date.now() }); joinRoom(ws, id, cap); }
                } else if (m.type === 'input' || m.type === 'state' || m.type === 'sync') {
                    const room = ws._room && rooms.get(ws._room);
                    if (room) room.peers.forEach(p => { if (p.ws !== ws) send(p.ws, m.type, d); });
                } else if (m.type === 'leave' || m.type === 'quit') {
                    cleanup(ws);
                }
            } catch (e) { /* 单连接异常不影响进程 */ }
        });

        ws.on('close', () => cleanup(ws));
        ws.on('error', () => cleanup(ws));
    });

    // 心跳：15s 清理死连接（断网/切后台/进电梯/切 WiFi 的僵尸连接）。
    // 手机掉线多为「网络黑洞」（不 FIN 不 RST），只能靠心跳发现；30s→15s 把
    // 检测窗口从 ~60s 缩到 ~30s，对手掉线后另一端能更快收到 peer_left。
    const hb = setInterval(() => {
        wss.clients.forEach(ws => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false; try { ws.ping(); } catch (e) {}
        });
    }, 15000);
    wss.on('close', () => clearInterval(hb));

    server.on('upgrade', (req, socket, head) => {
        const u = String(req.url || '');
        if (u.indexOf(PATH) !== 0) return; // 不是联机路径，交给 Tavern 等其他钩子
        try {
            wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
        } catch (e) {
            try { socket.destroy(); } catch (_) {}
        }
    });

    console.log('[ws-relay] 联机中继已挂载：' + PATH + '（按游戏匹配 + 房间转发）');
}

module.exports = { attach, PATH };
