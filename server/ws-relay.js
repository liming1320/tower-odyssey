// 小游戏联机中继（server/ws-relay.js）—— 体验 E1 真实多人
// 挂在 server.js 的 upgrade 钩子上，路径 /ws/minigame。
// 职责：按「游戏」分桶的等待队列 + 房间配对 + 房间内 input/state 转发 + 心跳清理。
// 设计要点：
//   1) 单进程内运行，不另起端口/进程；外网经宝塔 Nginx 443 透传 Upgrade 头直达本进程。
//   2) 匹配按 game 隔离——点五子棋只会匹配到等五子棋的人，绝不串到象棋。
//   3) 全程 try/catch，任何坏消息/异常都不允许拖挂主进程（参考 server.js 的容错哲学）。
//   4) 房间容量 2（PvP）；超过的按「房间已满」拒绝。好友邀请走 room 码。

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ws 模块：项目 node_modules 已带；若部署机缺失，attach 直接 no-op 并告警，不阻断服务。
let WebSocketServer = null;
try { ({ WebSocketServer } = require('ws')); } catch (e) { WebSocketServer = null; }

const PATH = '/ws/minigame';

// 断线重连窗口：对局进行中某方掉线后，其座位保留该时长（默认 30s），期间对方收到 peer_gone（等待重连）而非直接判负；
// 掉线方在此窗口内用 slot token 重连即可续局（服务端下发最近一次状态 lastState）。超时未归由心跳 GC 判负（peer_left）。
// MG_RESUME_MS 环境变量可覆盖（主要供自动化测试用更短窗口）。
const RESUME_MS = Number(process.env.MG_RESUME_MS) || 30000;
function genToken() { return crypto.randomBytes(6).toString('hex'); }

// 房间快照持久化（应对「服务端重启丢房间」）：进行中对局 debounced 写 JSON 文件，
// 重启后读回并把所有座位置为 ghost（ws=null、gone=true），客户端在 RESUME_MS 内带 slot 重连即可续局。
// MG_ROOMS_FILE 可覆盖路径；MG_ROOMS_OFF=1 关闭（纯内存，行为与旧版一致）。
const ROOMS_FILE = process.env.MG_ROOMS_FILE || path.join(os.tmpdir(), 'tower-odyssey-mg-rooms.json');
const ROOMS_OFF = process.env.MG_ROOMS_OFF === '1';
let _snapTimer = null;
function snapshotRooms() {
    if (ROOMS_OFF) return;
    const arr = [];
    for (const [id, room] of rooms) {
        if (!room.started) continue;            // 仅持久化进行中对局（等待桌无重连价值）
        const peers = room.peers.filter(p => !p.viewer).map(p => ({ name: p.name, side: p.side, slot: p.slot, gone: true }));
        if (!peers.length) continue;
        arr.push({ id, game: room.game, cap: room.cap, started: true, createdAt: room.createdAt, lastState: room.lastState, peers });
    }
    try { fs.writeFileSync(ROOMS_FILE, JSON.stringify(arr)); } catch (e) {}
}
function scheduleSnapshot() { if (ROOMS_OFF || _snapTimer) return; _snapTimer = setTimeout(() => { _snapTimer = null; snapshotRooms(); }, 1500); }
function flushRooms() { if (_snapTimer) { clearTimeout(_snapTimer); _snapTimer = null; } snapshotRooms(); }
function restoreRooms() {
    if (ROOMS_OFF) return;
    try {
        if (!fs.existsSync(ROOMS_FILE)) return;
        const arr = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
        for (const r of (arr || [])) {
            const room = { game: r.game, cap: r.cap || 2, started: true, createdAt: r.createdAt || Date.now(), lastState: r.lastState || null, peers: [] };
            room._id = r.id;
            (r.peers || []).forEach(pr => room.peers.push({ name: pr.name, side: pr.side, slot: pr.slot, ws: null, gone: true, goneAt: Date.now(), forfeited: false }));
            rooms.set(r.id, room);
        }
    } catch (e) {}
}

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
    const ta = genToken(), tb = genToken();
    const room = { game, cap: 2, started: false, lastState: null, peers: [{ ws: a, name: a._name, side: 0, slot: ta }, { ws: b, name: b._name, side: 1, slot: tb }], createdAt: Date.now() };
    room._id = id; rooms.set(id, room);
    a._room = id; b._room = id; a._side = 0; b._side = 1; a._slot = ta; b._slot = tb;
    send(a, 'room', { room: id, game, side: 0, opp: b._name });
    send(b, 'room', { room: id, game, side: 1, opp: a._name });
}
// 房间座位快照：长度 cap，已占座位为 {name,side}，空位为 null
function seatView(room) {
    const seats = [];
    for (let i = 0; i < room.cap; i++) { const p = room.peers[i]; seats.push(p ? { name: p.name, side: p.side, slot: p.slot, gone: !!p.gone } : null); }
    return seats;
}
// 向房间内所有人广播座位占用（含 room 码，供创建者分享给好友 / 客户端记录以便重连）
function broadcastSeat(room) {
    const seats = seatView(room);
    const full = room.peers.length >= room.cap;
    room.peers.forEach(p => send(p.ws, 'seat', { room: room._id, seats, cap: room.cap, you: p.side, full, started: room.started }));
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
        send(p.ws, 'start', { room: p.ws._room, game: room.game, side: p.side, slot: p.slot, opp, seats: seatView(room) });
    });
    broadcastTables(room.game); // 满桌从等候厅移除
    scheduleSnapshot();        // 进行中对局：写入快照，服务端重启可续
}
// 按房间码加入（好友邀请）：房间不存在则创建（房主）
function joinRoom(ws, roomId, cap) {
    let room = rooms.get(roomId);
    if (!room) { // 房主建房：用该房间码开启一个等待对手的房间
        room = { game: ws._game, cap: cap || 2, started: false, lastState: null, peers: [], createdAt: Date.now() };
        room._id = roomId; rooms.set(roomId, room);
    }
    if (room.started) { send(ws, 'error', { msg: '对局已开始，无法加入' }); return; }
    if (room.peers.length >= room.cap) { send(ws, 'error', { msg: '房间已满' }); return; }
    const side = room.peers.length; // 0..cap-1，按入座顺序分配座位
    const token = genToken();
    room.peers.push({ ws, name: ws._name, side, slot: token });
    ws._room = roomId; ws._side = side; ws._slot = token;
    broadcastSeat(room);
    broadcastTables(room.game);
    if (room.peers.length >= room.cap) startRoom(room);
    else scheduleSnapshot();   // 座位变化也记录（重连/重启后可识别房间码）
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
        if (room.started) {
            // 观战者离开：直接移出，不通知玩家、不判负
            if (left && left.viewer) { room.peers = room.peers.filter(p => p !== left); return; }
            // 对局进行中掉线：保留该座位为 ghost（RESUME_MS 内可重连续局），不将掉线方移出 room.peers
            if (left) { left.gone = true; left.goneAt = Date.now(); left.ws = null; }
            const liveLeft = room.peers.filter(p => p && !p.gone);
            liveLeft.forEach(p => send(p.ws, 'peer_gone', { side: left ? left.side : null }));
            // 若已无活人（双方都掉了），交给心跳 GC 清理房间；仍有活人则保留房间等待重连
            scheduleSnapshot();   // 掉线后更新快照（ghost 状态），服务端重启仍可续局
        } else {
            room.peers = room.peers.filter(p => p.ws !== ws);
            broadcastSeat(room);
            if (!room.peers.length) { rooms.delete(id); broadcastTables(room.game); }
            else broadcastTables(room.game);
            scheduleSnapshot();
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
    restoreRooms();   // 读回上次运行持久化的进行中对局（座位置为 ghost，供客户端带 slot 重连续局）
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 }); // 单条消息上限 1MB，防异常/恶意大 state 撑爆内存

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
                } else if (m.type === 'ping') {
                    // 应用层心跳回包：携带客户端发来的时间戳 t，客户端据此算 RTT；不转发、不进房间逻辑
                    send(ws, 'pong', { t: d.t || 0 });
                } else if (m.type === 'join') {
                    ws._name = (d.me && String(d.me).slice(0, 24)) || '对手';
                    ws._game = d.game || 'unknown';
                    const cap = d.cap || 2;
                    if (d.room) {
                        // 断连续局：携带 slot token 且房间内有对应掉线座位 → 替回原座位并下发最近状态续局
                        const room = rooms.get(String(d.room));
                        if (room && room.started && d.slot) {
                            const slot = String(d.slot);
                            const ghost = room.peers.find(p => p && p.gone && p.slot === slot);
                            if (ghost) {
                                ghost.ws = ws; ghost.name = ws._name; ghost.gone = false; ghost.forfeited = false; ghost.goneAt = 0;
                                ws._room = String(d.room); ws._side = ghost.side; ws._slot = slot;
                                send(ws, 'resume', { room: String(d.room), game: room.game, side: ghost.side, slot, lastState: room.lastState || null });
                                room.peers.forEach(p => { if (p && p.ws && p !== ghost) send(p.ws, 'peer_back', { side: ghost.side }); });
                                return;
                            }
                        }
                        joinRoom(ws, String(d.room), cap); return;
                    }
                    if (d.create) { // 创建新桌：总是开一张空桌（即使已有空桌也另开）
                        const id = genRoom(ws._game);
                        const room = { game: ws._game, cap, started: false, lastState: null, peers: [], createdAt: Date.now() };
                        room._id = id; rooms.set(id, room);
                        joinRoom(ws, id, cap);
                        return;
                    }
                    // 快速加入：找一张同游戏未满未开始的桌并入座；没有则自动开一张新桌
                    const open = findOpenRoom(ws._game, cap);
                    if (open) joinRoom(ws, open, cap);
                    else { const id = genRoom(ws._game); const room = { game: ws._game, cap, started: false, lastState: null, peers: [], createdAt: Date.now() }; room._id = id; rooms.set(id, room); joinRoom(ws, id, cap); }
                } else if (m.type === 'spectate') {
                    // 观战：只读旁观一张进行中的桌子，接收 state 广播但不能落子（side=-1 在 input 处理中被拦截）
                    const room = rooms.get(String(d.room));
                    if (!room) { send(ws, 'error', { msg: '房间不存在，无法观战' }); return; }
                    if (!room.started) { send(ws, 'error', { msg: '该对局尚未开始，暂不可观战' }); return; }
                    const token = genToken();
                    const v = { ws, name: (d.me && String(d.me).slice(0, 24)) || '观战者', side: -1, slot: token, viewer: true, gone: false, forfeited: false };
                    room.peers.push(v);
                    ws._room = String(d.room); ws._side = -1; ws._slot = token; ws._game = room.game;
                    send(ws, 'start', { room: String(d.room), game: room.game, side: -1, slot: token, viewer: true, state: room.lastState || null, seats: seatView(room), opp: room.peers.filter(p => !p.viewer).map(p => p.name) });
                } else if (m.type === 'input' || m.type === 'state' || m.type === 'sync') {
                    const room = ws._room && rooms.get(ws._room);
                    if (room) {
                        if (ws._side === -1) return;   // 观战者不能发送操作
                        // 去重：同一座位序号非递增（重连 outbox 重放）直接丢弃，避免重复落子/状态覆盖
                        room._seqBySide = room._seqBySide || {};
                        if (d._seq != null) {
                            const last = room._seqBySide[ws._side];
                            if (last != null && d._seq <= last) return;
                            room._seqBySide[ws._side] = d._seq;
                        }
                        room.lastState = d; // 记录房间最近一次整盘状态，供断线方重连续局时下发
                        room.peers.forEach(p => { if (p.ws && p.ws !== ws && !p.gone) send(p.ws, m.type, d); });
                        scheduleSnapshot();   // 盘面变化入快照（防服务端重启丢进度）
                    }
                } else if (m.type === 'leave' || m.type === 'quit') {
                    // 显式离开（点返回/认输）：对局进行中立即判负，不保留座位等重连
                    const room = ws._room && rooms.get(ws._room);
                    if (room && room.started) {
                        const left = room.peers.find(p => p.ws === ws);
                        if (left && left.viewer) { room.peers = room.peers.filter(p => p !== left); return; } // 观战者退出不影响对局
                        if (left) room.peers.forEach(q => { if (q !== left && q.ws) send(q.ws, 'peer_left', { side: left.side }); });
                        room.peers = room.peers.filter(p => p.ws !== ws);
                        if (!room.peers.length) rooms.delete(ws._room);
                        scheduleSnapshot();
                    } else {
                        cleanup(ws);
                    }
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
    // 断线重连窗口 GC：独立于 15s 心跳，以更短周期及时把超时未归的掉线方判负（peer_left）并清理空桌；
    // 周期取 min(2s, RESUME_MS)，保证重连窗口一过期就在 ~2s 内判负，而非拖到 15s 心跳。
    const gc = setInterval(() => {
        const now = Date.now();
        for (const [id, room] of rooms) {
            if (!room.started) continue;
            let forfeited = false;
            room.peers.forEach(p => {
                if (p && p.gone && !p.forfeited && now - (p.goneAt || 0) > RESUME_MS) {
                    p.forfeited = true; forfeited = true;
                    room.peers.forEach(q => { if (q && q.ws && !q.gone) send(q.ws, 'peer_left', { side: p.side }); });
                }
            });
            // 房间内无活人（全部掉线/判负）→ 删除，避免内存泄漏
            if (forfeited && room.peers.every(p => !p || p.gone || p.forfeited)) {
                rooms.delete(id); broadcastTables(room.game);
            }
        }
    }, Math.min(2000, RESUME_MS));
    wss.on('close', () => { clearInterval(hb); clearInterval(gc); flushRooms(); });

    // 进程退出/主服务关闭前 flush 房间快照，最大化「重启可续局」成功率
    const onExit = () => { try { flushRooms(); } catch (e) {} };
    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);
    server.on('close', onExit);

    server.on('upgrade', (req, socket, head) => {
        const u = String(req.url || '');
        if (u.indexOf(PATH) !== 0) return; // 不是联机路径，交给 Tavern 等其他钩子
        try {
            wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
        } catch (e) {
            try { socket.destroy(); } catch (_) {}
        }
    });

    console.log('[ws-relay] 联机中继已挂载：' + PATH + '（按游戏匹配 + 房间转发 + 重连 + 快照续局）');
}

// 测试钩子：便于 verify 脚本在无 HTTP 服务器的情况下直接驱动房间快照/读回与重连断言
module.exports = {
    attach, PATH,
    _rooms: rooms,
    _snapshotRooms: snapshotRooms,
    _restoreRooms: restoreRooms,
    _reset() { rooms.clear(); try { if (fs.existsSync(ROOMS_FILE)) fs.unlinkSync(ROOMS_FILE); } catch (e) {} },
    _ROOMS_FILE: ROOMS_FILE,
};
