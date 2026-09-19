// verify-reconnect.js —— 联机「断线重连 / 续局」回归测试（无需浏览器，真 ws 中继）
// 用 ws 模块在临时端口起真中继，两个真实 ws 客户端走：
//   lobby → create → join(满座) → start（带 slot） → A 落子(input) → 模拟 A 掉线(terminate)
//   → 断言 B 收 peer_gone（非 peer_left，不判负）→ A 带 slot 重连 → A 收 resume(lastState) + B 收 peer_back
//   → 断言 B 始终未收到 peer_left、A 续局盘面 == 掉线前最近一步
// 另测：对局中掉线且超过重连窗口未归 → 对方收 peer_left（判负）。
//
// MG_RESUME_MS 控制重连窗口；测试内设为较短值以加速超时用例。
process.env.MG_RESUME_MS = process.env.MG_RESUME_MS || '1500';

const http = require('http');
const WebSocket = require('ws');
const { attach } = require('../server/ws-relay');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeClient(url, name) {
    const ws = new WebSocket(url);
    const handlers = {};
    const c = {
        ws, name, slot: null, room: null, side: null,
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
    ws.on('message', buf => {
        let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
        (handlers[m.type] || []).forEach(h => h(m.data));
    });
    return c;
}

(async () => {
    const server = http.createServer();
    attach(server);
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const url = `ws://127.0.0.1:${port}/ws/minigame`;
    console.log('[relay] 监听于', url, 'RESUME_MS=', process.env.MG_RESUME_MS);

    // ---------- 用例 1：掉线 → 重连续局 ----------
    console.log('\n[1] 断线重连续局');
    const A = makeClient(url, 'A'); const B = makeClient(url, 'B');
    await Promise.all([A.open(), B.open()]);

    A.send('lobby', { game: 'gomoku', cap: 2 });
    A.send('join', { game: 'gomoku', cap: 2, create: true, me: 'A' });
    const aSeat = await A.waitFor('seat');
    A.room = (aSeat && aSeat.room) || null;
    ok(!!A.room, 'A 建房得到房间码: ' + A.room);

    B.send('join', { game: 'gomoku', cap: 2, room: A.room, me: 'B' });
    const [aStart, bStart] = await Promise.all([A.waitFor('start'), B.waitFor('start')]);
    A.slot = aStart.slot; B.slot = bStart.slot; A.side = aStart.side; B.side = bStart.side;
    ok(!!A.slot && !!B.slot, '双方 start 消息均带 slot token（A=' + A.slot + ' B=' + B.slot + '）');
    ok(aStart.side !== bStart.side, '双方 side 不同（A=' + aStart.side + ' B=' + bStart.side + '）');

    // A 落一步，B 应收到 input（转发），服务端记录 lastState
    const move = { board: [1, 2, 3, 4], turn: 1 - A.side };
    const bInputP = B.waitFor('input');
    A.send('input', move);
    const bInput = await bInputP;
    ok(JSON.stringify(bInput.board) === JSON.stringify(move.board), 'B 实时收到 A 的落子（状态转发正常）');

    // 模拟 A 网络黑洞掉线（terminate 触发服务端 close）
    let bPeerLeft = false; B.on('peer_left', () => { bPeerLeft = true; });
    A.close();

    // B 应收到 peer_gone（等待重连），且短时间内不应收到 peer_left
    const bGone = await B.waitFor('peer_gone', 3000).catch(() => null);
    ok(!!bGone, 'A 掉线后 B 收到 peer_gone（等待重连），而非直接判负');
    ok(bPeerLeft === false, '重连窗口内 B 未收到 peer_left（对局继续）');
    await sleep(300); // 远小于 RESUME_MS(1500)
    ok(bPeerLeft === false, '窗口内持续未判负');

    // A 带 slot 重连
    const A2 = makeClient(url, 'A');
    await A2.open();
    const aResumeP = A2.waitFor('resume');
    const bBackP = B.waitFor('peer_back');
    A2.send('join', { game: 'gomoku', cap: 2, room: A.room, slot: A.slot, me: 'A' });
    const aResume = await aResumeP;
    ok(aResume && aResume.side === A.side, 'A 重连后服务端按 slot 还原原 side（' + aResume.side + '）');
    ok(aResume && JSON.stringify(aResume.lastState && aResume.lastState.board) === JSON.stringify(move.board),
        'A 收到 resume 携带掉线前最近盘面（续局状态一致）');
    const bBack = await bBackP;
    ok(!!bBack && bBack.side === A.side, 'B 收到 peer_back（对手已归来，覆盖层可清除）');
    ok(bPeerLeft === false, '整段重连过程中 B 从未被误判负');

    // 续局后再走一步，验证双向仍通
    const move2 = { board: [5, 6, 7, 8], turn: 1 - A.side };
    const bInput2P = B.waitFor('input');
    A2.send('input', move2);
    const bInput2 = await bInput2P;
    ok(JSON.stringify(bInput2.board) === JSON.stringify(move2.board), '续局后 A 落子仍正常转发给 B');

    A2.close(); B.close();
    await sleep(50);

    // ---------- 用例 2：掉线超窗口未归 → 判负 ----------
    console.log('\n[2] 掉线超窗口未归判负');
    const C = makeClient(url, 'C'); const D = makeClient(url, 'D');
    await Promise.all([C.open(), D.open()]);
    C.send('lobby', { game: 'xiangqi', cap: 2 });
    C.send('join', { game: 'xiangqi', cap: 2, create: true, me: 'C' });
    const cSeat = await C.waitFor('seat'); C.room = cSeat.room;
    D.send('join', { game: 'xiangqi', cap: 2, room: C.room, me: 'D' });
    const [cStart, dStart] = await Promise.all([C.waitFor('start'), D.waitFor('start')]);
    console.log('   C/D 开局，C 掉线，等待 > RESUME_MS(' + process.env.MG_RESUME_MS + 'ms)');
    const dLeftP = D.waitFor('peer_left', 5000);
    C.close();
    const dLeft = await dLeftP;
    ok(!!dLeft, '对局中掉线且超窗口未归 → 对方收 peer_left（判负）');
    ok(dLeft.side === cStart.side, 'peer_left 携带掉线方 side（' + dLeft.side + '），客户端据此判对方胜');

    C.close(); D.close();
    await sleep(50);

    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    try { server.close(); } catch (e) {}
    setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
