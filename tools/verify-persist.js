// verify-persist.js —— 联机「服务端重启丢房间」回归测试（无需浏览器，真 ws 中继）
// 模拟：进行中对局 → 房间快照写盘（debounced/flush）→ 服务端内存房间清空（模拟重启丢失）
//   → 重启读回快照（座位置为 ghost）→ 客户端带 slot 重连拿到 resume(lastState) 续局。
// 另验：未开始的等待桌不应被持久化（无重连价值）。
const os = require('os'); const path = require('path'); const fs = require('fs');
const tmp = path.join(os.tmpdir(), 'tower-odyssey-verify-persist-' + Date.now() + '.json');
process.env.MG_ROOMS_FILE = tmp;
process.env.MG_ROOMS_OFF = '0';
process.env.MG_RESUME_MS = '8000'; // 放大窗口，避免 GC 在测试内把读回的 ghost 房间误判负

const http = require('http');
const WebSocket = require('ws');
const relay = require('../server/ws-relay');
const { attach, _rooms, _snapshotRooms, _restoreRooms, _ROOMS_FILE } = relay;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeClient(url) {
    const ws = new WebSocket(url);
    const handlers = {};
    const c = {
        ws, slot: null, room: null,
        open: () => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); }),
        send(type, data) { ws.send(JSON.stringify({ type, data })); },
        on(type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); },
        waitFor(type, timeout = 3000) {
            return new Promise((res, rej) => {
                const t = setTimeout(() => rej(new Error('timeout waiting: ' + type)), timeout);
                c.on(type, d => { clearTimeout(t); res(d); });
            });
        },
        close() { try { ws.terminate(); } catch (e) {} },
    };
    ws.on('message', buf => { let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; } (handlers[m.type] || []).forEach(h => h(m.data)); });
    return c;
}

(async () => {
    const server = http.createServer();
    attach(server);
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const url = `ws://127.0.0.1:${port}/ws/minigame`;
    console.log('[relay] 监听于', url, 'ROOMS_FILE=', _ROOMS_FILE);

    // ---------- 进行中对局并落子（产生 lastState） ----------
    console.log('\n[1] 进行中对局 + 快照写盘');
    const A = makeClient(url), B = makeClient(url);
    await Promise.all([A.open(), B.open()]);
    A.send('lobby', { game: 'gomoku', cap: 2 });
    A.send('join', { game: 'gomoku', cap: 2, create: true, me: 'A' });
    const aSeat = await A.waitFor('seat'); A.room = aSeat.room;
    B.send('join', { game: 'gomoku', cap: 2, room: A.room, me: 'B' });
    const [aStart, bStart] = await Promise.all([A.waitFor('start'), B.waitFor('start')]);
    A.slot = aStart.slot; B.slot = bStart.slot; A.side = aStart.side;
    const lastBoard = [9, 8, 7, 6];
    const bIn = B.waitFor('input');
    A.send('input', { board: lastBoard, turn: 1 - A.side });
    await bIn;
    console.log('   落子已下发，触发快照 flush…');
    _snapshotRooms(); // 触发写盘（模拟 debounce/退出 flush）
    await sleep(100);
    ok(fs.existsSync(_ROOMS_FILE), '快照文件已写入: ' + _ROOMS_FILE);
    const snap = JSON.parse(fs.readFileSync(_ROOMS_FILE, 'utf8'));
    ok(Array.isArray(snap) && snap.length === 1, '快照含 1 个进行中房间');
    const r0 = snap[0];
    ok(r0.id === A.room && r0.game === 'gomoku' && r0.started === true, '房间 id/game/started 正确');
    ok(r0.peers.length === 2 && r0.peers.every(p => p.name && p.side != null && p.slot), '2 个座位均持久化（含 side/slot/昵称）');
    ok(r0.peers.every(p => p.gone === true && !('ws' in p)), '持久化座位为 ghost（不含 ws 句柄）');
    ok(JSON.stringify(r0.lastState && r0.lastState.board) === JSON.stringify(lastBoard), '快照保留最近盘面 lastState（重启后可续局）');

    // ---------- 模拟「服务端重启」：清空内存房间，读回快照 ----------
    console.log('\n[2] 模拟重启：清空内存 → 读回快照 → 客户端带 slot 重连续局');
    _rooms.clear(); // 模拟进程内存丢失
    ok(_rooms.size === 0, '重启前内存房间已清空（size=0）');
    _restoreRooms(); // attach 内也会调用；这里显式验证读回逻辑
    ok(_rooms.size === 1, '读回快照后内存恢复 1 个房间');
    const restored = _rooms.get(A.room);
    ok(!!restored && restored.peers.length === 2 && restored.peers.every(p => p.ws === null && p.gone === true), '读回房间座位为 ghost（ws=null），等待客户端重连');
    // 注意：attach 已在本进程调用过 restoreRooms（读的是同一文件），此处再清再读仅为单元测试验证；
    // 下面用「新客户端带 slot 重连」验证端到端续局能力（房间在 attach 时已读回）。
    const A2 = makeClient(url);
    await A2.open();
    const aResumeP = A2.waitFor('resume');
    A2.send('join', { game: 'gomoku', cap: 2, room: A.room, slot: A.slot, me: 'A' });
    const aResume = await aResumeP;
    ok(aResume && aResume.side === A.side, '重启后客户端带 slot 重连，服务端还原原 side（' + aResume.side + '）');
    ok(JSON.stringify(aResume.lastState && aResume.lastState.board) === JSON.stringify(lastBoard), '重启后续局盘面 == 掉线前最近状态（不丢进度）');

    // ---------- 等待桌不应被持久化 ----------
    console.log('\n[3] 未开始等待桌不持久化');
    const W = makeClient(url);
    await W.open();
    W.send('lobby', { game: 'ludo', cap: 2 });
    W.send('join', { game: 'ludo', cap: 2, create: true, me: 'W' });
    const wSeat = await W.waitFor('seat'); W.room = wSeat.room;
    _snapshotRooms();
    await sleep(50);
    const snap2 = JSON.parse(fs.readFileSync(_ROOMS_FILE, 'utf8'));
    ok(!snap2.some(r => r.id === W.room), '未开始的等待桌未写入快照（仅进行中对局持久化）');

    A2.close(); B.close(); W.close();
    try { fs.unlinkSync(_ROOMS_FILE); } catch (e) {}
    try { server.close(); } catch (e) {}
    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
