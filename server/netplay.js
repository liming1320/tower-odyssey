// 自建 EmulatorJS nightly netplay 信令中继（集成进主进程，零额外基础设施）
// 目的：把模拟器联机信令留在自家服务器，避免公开大厅里和陌生人挤在一起、跨公网更可控。
//
// 协议严格对齐官方 EmulatorJS-Netplay（main 分支 server.js）：
//   事件：open-room / join-room / leave-room / webrtc-signal / data-message / snapshot / input / disconnect
//   房间按 sessionid 命名；game_id 仅用于 /list 浏览（这里不实现，玩家靠房间号相遇，
//   恰好满足「同一 ROM 的两人」需求——一方创建房间把号发给另一方即可）。
// 客户端（EJS nightly）连接地址 = EJS_netplayServer，默认 socket.io 路径 /socket.io，
// 故前端把 EJS_netplayServer 设为「本站 /netplay/」，本模块挂载在 /netplay/socket.io。
//
// 失败不阻断主服务：socket.io 缺失时仅告警并返回，站点照常运行。
let io = null;

function attach(httpServer) {
    let SocketIO;
    try { SocketIO = require('socket.io'); }
    catch (e) {
        console.warn('[netplay] 未安装 socket.io，模拟器联机信令不可用（npm i socket.io 后自动生效）');
        return null;
    }
    try {
    io = new SocketIO.Server(httpServer, {
        path: '/netplay/socket.io',
        cors: { origin: '*', methods: ['GET', 'POST'], credentials: true },
        allowEIO3: true,            // 兼容较旧的 EJS nightly socket.io 客户端
        maxHttpBufferSize: 1e6,     // 与 ws-relay 对齐（1MB）
    });

    const rooms = {};

    // 每分钟回收空房间，避免长期占用内存
    const gc = setInterval(() => {
        for (const sid in rooms) {
            if (!rooms[sid] || Object.keys(rooms[sid].players).length === 0) delete rooms[sid];
        }
    }, 60000);
    if (gc.unref) gc.unref();

    function playersOf(sid) { return rooms[sid] ? rooms[sid].players : {}; }

    function leave(socket) {
        const sid = socket.sessionId, pid = socket.playerId;
        if (!sid || !pid) return;
        const room = rooms[sid];
        if (room) {
            delete room.players[pid];
            if (Object.keys(room.players).length === 0) {
                delete rooms[sid];
            } else if (socket.id === room.owner) {
                // 房主离开 → 把房主转移给剩下第一个玩家（信令用）
                const rest = Object.keys(room.players);
                if (rest.length) room.owner = room.players[rest[0]].socketId;
            }
            io.to(sid).emit('users-updated', playersOf(sid));
        }
        try { socket.leave(sid); } catch (e) {}
        delete socket.sessionId;
        delete socket.playerId;
    }

    io.on('connection', (socket) => {
        socket.on('open-room', (data, cb) => {
            const extra = (data && data.extra) || {};
            const sessionId = extra.sessionid;
            const playerId = extra.userid || extra.playerId;
            if (!sessionId || !playerId) {
                if (typeof cb === 'function') cb('Invalid data: sessionid and playerId required');
                return;
            }
            if (rooms[sessionId]) {
                if (typeof cb === 'function') cb('Room already exists');
                return;
            }
            rooms[sessionId] = {
                owner: socket.id,
                players: { [playerId]: Object.assign({}, extra, { socketId: socket.id }) },
                roomName: extra.room_name || ('Room ' + sessionId),
                gameId: extra.game_id || 'default',
                domain: extra.domain || 'unknown',
                password: (data && data.password) || null,
                maxPlayers: (data && data.maxPlayers) || 4,
            };
            socket.join(sessionId);
            socket.sessionId = sessionId;
            socket.playerId = playerId;
            io.to(sessionId).emit('users-updated', rooms[sessionId].players);
            if (typeof cb === 'function') cb(null);
        });

        socket.on('join-room', (data, cb) => {
            const extra = (data && data.extra) || {};
            const sessionId = extra.sessionid;
            const playerId = extra.userid;
            if (!sessionId || !playerId) {
                if (typeof cb === 'function') cb('Invalid data: sessionid and playerId required');
                return;
            }
            const room = rooms[sessionId];
            if (!room) { if (typeof cb === 'function') cb('Room not found'); return; }
            const pwd = (data && data.password) || null;
            if (room.password && room.password !== pwd) { if (typeof cb === 'function') cb('Incorrect password'); return; }
            if (Object.keys(room.players).length >= room.maxPlayers) { if (typeof cb === 'function') cb('Room full'); return; }
            room.players[playerId] = Object.assign({}, extra, { socketId: socket.id });
            socket.join(sessionId);
            socket.sessionId = sessionId;
            socket.playerId = playerId;
            io.to(sessionId).emit('users-updated', room.players);
            if (typeof cb === 'function') cb(null, room.players);
        });

        socket.on('leave-room', () => leave(socket));
        socket.on('disconnect', () => leave(socket));

        // WebRTC 信令（P2P 建连用）：按 target 单播转发
        socket.on('webrtc-signal', (data) => {
            try {
                const d = data || {};
                if (d.requestRenegotiate && d.target) {
                    const t = io.sockets.sockets.get(d.target);
                    if (t) t.emit('webrtc-signal', { sender: socket.id, requestRenegotiate: true });
                    return;
                }
                if (!d.target) return;
                io.to(d.target).emit('webrtc-signal', { sender: socket.id, candidate: d.candidate, offer: d.offer, answer: d.answer });
            } catch (e) {}
        });

        // 实时对战数据（输入/存档快照/通用消息）：在房间内广播给其他人
        socket.on('data-message', (d) => { if (socket.sessionId) socket.to(socket.sessionId).emit('data-message', d); });
        socket.on('snapshot', (d) => { if (socket.sessionId) socket.to(socket.sessionId).emit('snapshot', d); });
        socket.on('input', (d) => { if (socket.sessionId) socket.to(socket.sessionId).emit('input', d); });
    });

    console.log('[netplay] 信令中继已挂载：/netplay/socket.io（EmulatorJS nightly netplay 自托管，零额外进程）');
    return io;
    } catch (e) {
        // 任何初始化异常都不能拖垮主服务（参考 ws-relay 的失败不阻断纪律）
        console.error('[netplay] 信令中继初始化失败，已跳过（模拟器联机不可用，站点其余功能正常）：' + (e && e.stack || e));
        io = null;
        return null;
    }
}

module.exports = { attach, getIO: () => io };
