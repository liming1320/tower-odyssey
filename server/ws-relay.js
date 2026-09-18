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

// rooms: id -> { game, peers:[{ws,name,side}], createdAt }
const rooms = new Map();
// waiting: game -> [ws]（只存单人，配对后建 room 互推）
const waiting = new Map();

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
// 把同游戏的两个等待者配对成房间
function pair(game, a, b) {
    const id = genRoom(game);
    const room = { game, peers: [{ ws: a, name: a._name, side: 0 }, { ws: b, name: b._name, side: 1 }], createdAt: Date.now() };
    rooms.set(id, room);
    a._room = id; b._room = id; a._side = 0; b._side = 1;
    send(a, 'room', { room: id, game, side: 0, opp: b._name });
    send(b, 'room', { room: id, game, side: 1, opp: a._name });
}
// 按房间码加入（好友邀请）：房间不存在则创建（房主），存在则加入
function joinRoom(ws, roomId) {
    let room = rooms.get(roomId);
    if (!room) { // 房主建房：用该房间码开启一个等待对手的房间
        room = { game: ws._game, peers: [], createdAt: Date.now() };
        rooms.set(roomId, room);
    }
    if (room.peers.length >= 2) { send(ws, 'error', { msg: '房间已满' }); return; }
    const side = room.peers.length; // 0 或 1
    room.peers.push({ ws, name: ws._name, side });
    ws._room = roomId; ws._side = side;
    const other = room.peers.find(p => p.ws !== ws);
    room.peers.forEach(p => send(p.ws, 'peer', { nickname: p.name, side: p.side }));
    send(ws, 'room', { room: roomId, game: room.game, side, opp: other ? other.name : null });
}
function cleanup(ws) {
    try { leaveWaiting(ws); } catch (e) {}
    const id = ws._room;
    if (id && rooms.has(id)) {
        const room = rooms.get(id);
        const left = room.peers.find(p => p.ws === ws);
        room.peers = room.peers.filter(p => p.ws !== ws);
        room.peers.forEach(p => send(p.ws, 'peer_left', { side: left ? left.side : null }));
        if (!room.peers.length) rooms.delete(id);
    }
    try { if (ws.terminate) ws.terminate(); } catch (e) {}
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
                if (m.type === 'join') {
                    ws._name = (d.me && String(d.me).slice(0, 24)) || '对手';
                    ws._game = d.game || 'unknown';
                    if (d.room) { joinRoom(ws, String(d.room)); return; }
                    // 快速匹配：同游戏等待队列里找一个活人配对
                    const q = waiting.get(ws._game) || [];
                    const other = q.shift();
                    if (!q.length) waiting.delete(ws._game);
                    if (other && other.readyState === 1) { pair(ws._game, other, ws); }
                    else { q.push(ws); waiting.set(ws._game, q); send(ws, 'waiting', { game: ws._game }); }
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

    // 心跳：30s 清理死连接（断网/切后台不关 Tab 的僵尸），释放 waiting 与 room
    const hb = setInterval(() => {
        wss.clients.forEach(ws => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false; try { ws.ping(); } catch (e) {}
        });
    }, 30000);
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
