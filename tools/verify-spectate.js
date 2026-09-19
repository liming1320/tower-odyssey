// verify-spectate.js —— 联机「观战模式（只读）」回归测试（真 ws 中继）
// 验证 spectate 消息：旁观者 side=-1，收到 start(viewer:true)+最近盘面；可接收玩家的 state 广播，
// 但自己发送的 input 被服务端拦截（不转发给玩家）；退出观战不通知玩家（无 peer_left）。
process.env.MG_RESUME_MS = process.env.MG_RESUME_MS || '1500';
process.env.MG_ROOMS_OFF = '1';

const http = require('http');
const WebSocket = require('ws');
const { attach } = require('../server/ws-relay');

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
        waitFor(type, timeout = 3000) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout: ' + type)), timeout); c.on(type, d => { clearTimeout(t); res(d); }); }); },
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

    console.log('\n[1] 观战者进入进行中桌子');
    const A = makeClient(url), B = makeClient(url);
    await Promise.all([A.open(), B.open()]);
    A.send('lobby', { game: 'gomoku', cap: 2 });
    A.send('join', { game: 'gomoku', cap: 2, create: true, me: 'A' });
    const aSeat = await A.waitFor('seat'); A.room = aSeat.room;
    B.send('join', { game: 'gomoku', cap: 2, room: A.room, me: 'B' });
    const [aStart, bStart] = await Promise.all([A.waitFor('start'), B.waitFor('start')]);
    A.slot = aStart.slot; A.side = aStart.side;

    // 玩家先落一步，产生 lastState
    const lastBoard = [42, 43];
    const bIn = B.waitFor('input');
    A.send('input', { _seq: 1, board: lastBoard, turn: 1 - A.side });
    await bIn;

    // 观战者进入
    const V = makeClient(url);
    await V.open();
    const vStartP = V.waitFor('start');
    V.send('spectate', { room: A.room, me: '观众' });
    const vStart = await vStartP;
    ok(vStart && vStart.viewer === true, '观战者收到 start(viewer:true)');
    ok(vStart.side === -1, '观战者 side=-1（不占用玩家座位）');
    ok(JSON.stringify(vStart.state && vStart.state.board) === JSON.stringify(lastBoard), '观战者进入即拿到最近盘面（可实时围观）');
    ok(vStart.seats && vStart.seats.length === 2, '观战者拿到 2 座位快照');

    // 玩家落子 → 观战者应收到广播
    console.log('\n[2] 观战者接收广播，但自身落子被拦截');
    let vCount = 0; V.on('input', () => vCount++);
    let aGotFromV = false; A.on('input', () => { aGotFromV = true; });
    V.send('input', { _seq: 9, board: [999], turn: 1 }); // 观战者尝试落子
    await sleep(250);
    ok(vCount === 0, '观战者自身落子被服务端拦截，未回传给自己');
    ok(aGotFromV === false, '服务端未把观战者 input 转发给玩家（只读）');

    // 玩家落子 → 观战者收到
    const vInP = new Promise(r => { const h = () => r(true); V.on('input', h); });
    A.send('input', { _seq: 2, board: [7, 7], turn: 1 - A.side });
    const got = await Promise.race([vInP, sleep(1500).then(() => false)]);
    ok(got === true, '玩家落子实时广播给观战者（围观生效）');

    // 观战者退出：玩家不应被通知（无 peer_left）
    console.log('\n[3] 观战者退出不影响对局');
    let aLeft = false; A.on('peer_left', () => { aLeft = true; });
    V.send('leave', { room: A.room });
    await sleep(200);
    ok(aLeft === false, '观战者退出未向玩家推送 peer_left（不判负）');

    V.close(); A.close(); B.close();
    await sleep(50);
    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    try { server.close(); } catch (e) {}
    setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
