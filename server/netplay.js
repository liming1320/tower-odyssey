// 自建 EmulatorJS nightly netplay 信令中继（独立端口的自包含服务，零额外进程 / 零反向代理）
// 目的：把模拟器联机信令留在自家服务器，避免公开大厅里和陌生人挤在一起、跨公网更可控。
//
// 为什么是「独立端口」而不是挂主服务器 /netplay/socket.io？
//   EmulatorJS 客户端连接 netplay 时，socket.io 端点永远落在 EJS_netplayServer 所指 host 的
//   默认路径 /socket.io（URL 里的子路径只会被当成 socket.io 命名空间，端点仍是 /socket.io）。
//   而本项目的根路径 /socket.io 已被 SillyTavern 网关（server/tavern.js）反向代理占用，
//   若把 netplay 也挂主服务器的 /socket.io 会被 ST 代理截走 → 客户端握手 404、建不了房间。
//   因此按 EmulatorJS 官方自托管拓扑，netplay 信令跑在【独立端口】上、socket.io 用默认 /socket.io，
//   前端把 EJS_netplayServer 指向 http://<本机IP或域名>:<NETPLAY_PORT>/ 即可（默认 5181）。
//   房间列表 /list 也由这个独立服务一并托管（客户端请求 = EJS_netplayServer + 'list'）。
//
// 协议严格对齐官方 EmulatorJS-Netplay（main 分支 server.js）：
//   事件：open-room / join-room / leave-room / webrtc-signal / data-message / snapshot / input / disconnect
//   房间按 sessionid 命名；game_id 仅用于 /list 浏览（按同 ROM 哈希，两人自动相遇）。
//
// 失败不阻断主服务：socket.io 缺失 / 端口占用时仅告警，站点其余功能照常。
const http = require('http');
const url = require('url');

let io = null;
let rooms = {};                 // 模块级：socket.io 处理器与 HTTP /list 接口共享同一份房间表
let httpServer = null;

// HTTP 房间列表接口（供 EmulatorJS 客户端填充「Room Name」下拉 + 另一玩家搜索）。
// 严格对齐官方 EmulatorJS-Netplay 的 app.get('/list')：按 game_id 过滤、返回房间对象表。
// 过滤逻辑抽成纯函数 filterRooms，便于无 socket.io 环境下单测（tools/smoke-netplay-list.js）。
function filterRooms(roomsMap, gameId) {
    const out = {};
    for (const sid in roomsMap) {
        const room = roomsMap[sid];
        if (!room) continue;
        // 只列出未满、且同 game_id 的房间（不同 ROM 的人不会互相串台）
        if (Object.keys(room.players).length >= room.maxPlayers) continue;
        if (String(room.gameId) !== String(gameId)) continue;
        // 房主昵称（与官方一致：取 owner socketId 对应的 player_name）
        let ownerPid = null;
        for (const pid in room.players) {
            if (room.players[pid].socketId === room.owner) { ownerPid = pid; break; }
        }
        const playerName = ownerPid ? (room.players[ownerPid].player_name || 'Unknown') : 'Unknown';
        out[sid] = {
            room_name: room.roomName,
            current: Object.keys(room.players).length,
            max: room.maxPlayers,
            player_name: playerName,
            hasPassword: !!room.password,
        };
    }
    return out;
}

function listRooms(gameId) {
    return filterRooms(rooms, gameId);
}

// 启动一个监听在 host 上的信令服务。
//   先试 0.0.0.0（直连：云安全组/防火墙放行 TCP 该端口即可，零反代）；
//   若端口被占用（通常是 5181 上挂了反向代理 / nginx / 宝塔站点），自动改绑 127.0.0.1，
//   并提示把那个反代的上游改成 127.0.0.1:<port> —— 这样保留反代也能直接通，无需改前端。
function createServer(portOverride) {
    let SocketIO;
    try { SocketIO = require('socket.io'); }
    catch (e) {
        console.warn('[netplay] 未安装 socket.io，模拟器联机信令不可用（npm i socket.io 后自动生效）');
        return null;
    }
    const port = (typeof portOverride === 'number' && portOverride > 0)
        ? portOverride
        : (process.env.NETPLAY_PORT ? parseInt(process.env.NETPLAY_PORT, 10) : 5181);

    let booted = false;

    function boot(host) {
        // 独立 HTTP 服务：/list 返回房间表，其余 404（socket.io 接管 /socket.io）
        const srv = http.createServer((req, res) => {
            const u = url.parse(req.url, true);
            if (u.pathname === '/list') {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
                const gid = u.query && u.query.game_id;
                res.writeHead(200);
                res.end(JSON.stringify(listRooms(gid)));
                return;
            }
            res.writeHead(404);
            res.end('not found');
        });

        const sio = new SocketIO.Server(srv, {
            path: '/socket.io',          // 默认路径 —— 客户端（EJS_netplayServer）恰好连这里
            cors: { origin: '*', methods: ['GET', 'POST'], credentials: true },
            allowEIO3: true,            // 兼容较旧的 EJS nightly socket.io 客户端
            maxHttpBufferSize: 1e6,     // 与 ws-relay 对齐（1MB）
        });

        rooms = {};

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
                sio.to(sid).emit('users-updated', playersOf(sid));
            }
            try { socket.leave(sid); } catch (e) {}
            delete socket.sessionId;
            delete socket.playerId;
        }

        sio.on('connection', (socket) => {
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
                sio.to(sessionId).emit('users-updated', rooms[sessionId].players);
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
                sio.to(sessionId).emit('users-updated', room.players);
                if (typeof cb === 'function') cb(null, room.players);
            });

            socket.on('leave-room', () => leave(socket));
            socket.on('disconnect', () => leave(socket));

            // WebRTC 信令（P2P 建连用）：按 target 单播转发
            socket.on('webrtc-signal', (data) => {
                try {
                    const d = data || {};
                    if (d.requestRenegotiate && d.target) {
                        const t = sio.sockets.sockets.get(d.target);
                        if (t) t.emit('webrtc-signal', { sender: socket.id, requestRenegotiate: true });
                        return;
                    }
                    if (!d.target) return;
                    sio.to(d.target).emit('webrtc-signal', { sender: socket.id, candidate: d.candidate, offer: d.offer, answer: d.answer });
                } catch (e) {}
            });

            // 实时对战数据（输入/存档快照/通用消息）：在房间内广播给其他人
            socket.on('data-message', (d) => { if (socket.sessionId) socket.to(socket.sessionId).emit('data-message', d); });
            socket.on('snapshot', (d) => { if (socket.sessionId) socket.to(socket.sessionId).emit('snapshot', d); });
            socket.on('input', (d) => { if (socket.sessionId) socket.to(socket.sessionId).emit('input', d); });
        });

        srv.once('error', (e) => {
            if (!booted && e && e.code === 'EADDRINUSE' && host !== '127.0.0.1') {
                console.warn('[netplay] 端口 ' + port + ' 已被占用（大概率 5181 上挂了反向代理 / nginx / 宝塔站点，上游指错才 502）。' +
                    '自动改绑 127.0.0.1:' + port + ' —— 请把该反代的上游改成 127.0.0.1:' + port +
                    '（信令进程现在就监听在这里），或干脆删掉这个反代、只开防火墙即可（设计本就零反代）。');
                try { clearInterval(gc); } catch (_) {}
                try { sio.close(); } catch (_) {}
                try { srv.close(); } catch (_) {}
                boot('127.0.0.1');
                return;
            }
            console.error('[netplay] 端口 ' + port + ' 监听失败（可能被占用，或云安全组/防火墙未放行该端口）：' + (e && e.message ? e.message : e));
            io = null;
        });

        srv.listen(port, host, () => {
            booted = true;
            httpServer = srv;
            io = sio;
            console.log('[netplay] 信令中继已启动：' + (host === '127.0.0.1' ? '127.0.0.1' : '*') + ':' + port + '/socket.io（EmulatorJS nightly netplay 自托管，独立端口）');
            console.log('[netplay] 前端 EJS_netplayServer 应指向 http://<本机IP或域名>:' + port + '/ ；若改端口，emulator.js 里的 ' + port + ' 同步改');
        });
    }

    try {
        boot(process.env.NETPLAY_BIND || '0.0.0.0');
    } catch (e) {
        // 任何初始化异常都不能拖垮主服务（参考 ws-relay 的失败不阻断纪律）
        console.error('[netplay] 信令中继初始化失败，已跳过（模拟器联机不可用，站点其余功能正常）：' + (e && e.stack || e));
        io = null;
        return null;
    }
    return io;
}

function getPort() {
    if (httpServer && httpServer.address && httpServer.address()) return httpServer.address().port;
    return process.env.NETPLAY_PORT ? parseInt(process.env.NETPLAY_PORT, 10) : 5181;
}

module.exports = { createServer, getIO: () => io, listRooms, filterRooms, getPort };
