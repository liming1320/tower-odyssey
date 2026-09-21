// 自建 netplay 信令中继 —— 逻辑级端到端冒烟测试（无需真实安装 socket.io）
// 通过 Module._load 注入一个内存版 socket.io mock，严格区分两条通道：
//   客户端→服务端（inbound）：socket.on 注册，由 _fire 触发（模拟客户端发包）
//   服务端→客户端（outbound）：socket.emit 触发，由 onRecv 观察（模拟客户端收包）
// 复刻 socket.io 关键语义：每个 socket 自动加入「以自身 id 命名」的房间；
//   io.to(id) 单播全网、socket.to(room) 排除自己广播。
// 驱动 server/netplay 的 open-room/join-room/webrtc-signal/data-message/input/snapshot/disconnect，
// 断言中继转发、房间作用域、users-updated、断线清理均正确。
// 用法：node tools/smoke-netplay.js
const Module = require('module');
const path = require('path');
const http = require('http');

let nextId = 1;
const allSockets = new Map();
class MockSocket {
    constructor(server) {
        this.id = 'sock' + (nextId++);
        this._server = server;
        this.sessionId = null;
        this.playerId = null;
        this._in = {};   // inbound 监听器（客户端→服务端）
        this._out = {};  // outbound 监听器（服务端→客户端，测试用 onRecv 观察）
        this._rooms = new Set();
        this._rooms.add(this.id); server._roomAdd(this.id, this.id); // 自动加入自身 id 房间
        allSockets.set(this.id, this);
    }
    on(ev, cb) { (this._in[ev] = this._in[ev] || []).push(cb); return this; }       // 注册 inbound 处理
    onRecv(ev, cb) { (this._out[ev] = this._out[ev] || []).push(cb); return this; } // 观察 outbound
    _fire(ev, ...args) { (this._in[ev] || []).forEach(cb => cb(...args)); }         // 模拟客户端发包
    emit(ev, ...args) { (this._out[ev] || []).forEach(cb => cb(...args)); }         // 服务端→客户端
    join(room) { this._rooms.add(room); this._server._roomAdd(room, this.id); }
    leave(room) { this._rooms.delete(room); this._server._roomDel(room, this.id); }
    to(room) {
        const server = this._server;
        return { emit: (ev, ...args) => server._roomMembers(room).forEach(id => {
            if (id !== this.id) { const s = allSockets.get(id); if (s) s.emit(ev, ...args); }
        }) };
    }
}
class MockServer {
    constructor() { this._rooms = {}; this._connCbs = []; this.sockets = { sockets: { get: id => allSockets.get(id) } }; }
    on(ev, cb) { if (ev === 'connection') this._connCbs.push(cb); return this; }
    _roomAdd(r, id) { (this._rooms[r] = this._rooms[r] || new Set()).add(id); }
    _roomDel(r, id) { if (this._rooms[r]) { this._rooms[r].delete(id); if (!this._rooms[r].size) delete this._rooms[r]; } }
    _roomMembers(r) { return this._rooms[r] ? Array.from(this._rooms[r]) : []; }
    to(room) {
        const server = this;
        return { emit: (ev, ...args) => server._roomMembers(room).forEach(id => { const s = allSockets.get(id); if (s) s.emit(ev, ...args); }) };
    }
    _connect() { const s = new MockSocket(this); this._connCbs.forEach(cb => cb(s)); return s; }
}
const MockIO = { Server: MockServer };

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'socket.io') return MockIO;
    return origLoad.apply(this, arguments);
};

const netplay = require(path.join(__dirname, '..', 'server', 'netplay'));

let failed = 0;
function assert(cond, msg) { if (!cond) { console.error('✗ ' + msg); failed++; } else { console.log('✓ ' + msg); } }

const server = http.createServer((req, res) => res.end('ok'));
const io = netplay.attach(server);
assert(!!io, 'netplay.attach 返回 socket.io 服务实例（未抛错）');

const a = io._connect();
const b = io._connect();
const SID = 'R' + Date.now();

let aSig = null, aData = null, aInput = null, aSnap = null, aUsers = null;
a.onRecv('webrtc-signal', d => { aSig = d; });
a.onRecv('data-message', d => { aData = d; });
a.onRecv('input', d => { aInput = d; });
a.onRecv('snapshot', d => { aSnap = d; });
a.onRecv('users-updated', p => { aUsers = p; });

// 甲创建房间
a._fire('open-room', { extra: { sessionid: SID, userid: 'p1', game_id: 4242 } }, (err) => {
    assert(err == null, '甲 open-room 成功（callback=null），err=' + JSON.stringify(err));
    // 乙加入
    b._fire('join-room', { extra: { sessionid: SID, userid: 'p2' } }, (jerr, players) => {
        assert(jerr == null, '乙 join-room 成功（callback=null），err=' + JSON.stringify(jerr));
        assert(players && players.p1 && players.p2, 'join 后房间含 p1、p2 两人');
        // 乙 → 甲 转发 webrtc-signal（按 socket id 单播）
        b._fire('webrtc-signal', { target: a.id, candidate: { x: 1 } });
        // 乙 → 甲 转发对战数据（按房间广播、排除自己）
        b._fire('data-message', { hello: 'wm' });
        b._fire('input', { frame: 7, keys: [1, 0] });
        b._fire('snapshot', { state: 's' });
        setTimeout(() => {
            assert(aSig && aSig.sender === b.id && aSig.candidate && aSig.candidate.x === 1, '甲收到 webrtc-signal（sender=乙、candidate 透传）');
            assert(aData && aData.hello === 'wm', '甲收到 data-message 透传');
            assert(aInput && aInput.frame === 7 && aInput.keys[0] === 1, '甲收到 input 透传');
            assert(aSnap && aSnap.state === 's', '甲收到 snapshot 透传');
            // renegotiate 分支
            b._fire('webrtc-signal', { target: a.id, requestRenegotiate: true });
            setTimeout(() => {
                assert(aSig && aSig.requestRenegotiate === true && aSig.sender === b.id, '甲收到 renegotiate 信令');
                // 乙断线 → 甲收到 users-updated（只剩 p1）
                b._fire('disconnect');
                setTimeout(() => {
                    assert(aUsers && aUsers.p1 && !aUsers.p2, '乙断线后甲收到 users-updated（房间只剩 p1）');
                    // 错误参数：缺 sessionid
                    const c = io._connect();
                    let badCb = null;
                    c._fire('open-room', { extra: {} }, (err2) => { badCb = err2; });
                    assert(typeof badCb === 'string', 'open-room 缺 sessionid/userid 时返回错误字符串（不静默成功）');
                    console.log(failed ? ('\n✗ 共 ' + failed + ' 项失败') : '\n✓ 全部通过');
                    process.exit(failed ? 1 : 0);
                }, 200);
            }, 200);
        }, 200);
    });
});

setTimeout(() => { console.error('✗ 超时'); process.exit(1); }, 8000);
