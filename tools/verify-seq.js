// verify-seq.js —— 联机「落子丢包/乱序防护（seq 去重）」回归测试（真 ws 中继）
// 客户端给 input/state/sync 打单调递增 _seq；服务端按 (room, side) 记录 lastSeq，
// 收到 seq <= last 的重复包（重连发件箱重放）直接丢弃，避免重复落子/状态覆盖。
// 采用事件驱动断言（与 verify-4p 一致），避免 sleep 轮询的时序竞态。
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
        ws, slot: null, room: null, side: null,
        open: () => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); }),
        send(type, data) { ws.send(JSON.stringify({ type, data })); },
        on(type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); },
        waitFor(type, timeout = 3000) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout: ' + type)), timeout); c.on(type, d => { clearTimeout(t); res(d); }); }); },
        // 在 timeout 内等待是否「再收到」指定类型消息；收到则返回消息，超时返回 null（用于验证去重/拦截）
        waitForNone(type, timeout = 800) { return new Promise(res => { const h = d => { clearTimeout(t); res(d); }; const t = setTimeout(() => res(null), timeout); c.on(type, h); }); },
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

    console.log('\n[1] 重复 seq 被服务端去重（防重连重放导致重复落子）');
    const A = makeClient(url), B = makeClient(url);
    await Promise.all([A.open(), B.open()]);
    A.send('lobby', { game: 'gomoku', cap: 2 });
    A.send('join', { game: 'gomoku', cap: 2, create: true, me: 'A' });
    const aSeat = await A.waitFor('seat'); A.room = aSeat.room;
    B.send('join', { game: 'gomoku', cap: 2, room: A.room, me: 'B' });
    const [aStart, bStart] = await Promise.all([A.waitFor('start'), B.waitFor('start')]);
    A.slot = aStart.slot; A.side = aStart.side; B.slot = bStart.slot; B.side = bStart.side;

    let bCount = 0; const bSeqs = [];
    B.on('input', d => { bCount++; bSeqs.push(d && d._seq); });

    // A 第一次落子 seq=1 → 应转发
    A.send('input', { _seq: 1, board: [1], turn: 1 - A.side });
    const b1 = await B.waitFor('input', 3000);
    ok(b1 && b1._seq === 1 && bCount === 1, '首次 seq=1 正常转发给 B（count=1）[bCount=' + bCount + ' bSeqs=' + JSON.stringify(bSeqs) + ']');

    // A 因重连 outbox 重放同一包 seq=1 → 必须被丢弃（B 不应再收到）
    A.send('input', { _seq: 1, board: [1], turn: 1 - A.side });
    const dup = await B.waitForNone('input', 800);
    ok(dup == null && bCount === 1, '重复 seq=1 被去重，B 未收到第二份（count 仍为 1）');

    // A 前进到 seq=2 → 应转发
    A.send('input', { _seq: 2, board: [2], turn: 1 - A.side });
    const b2 = await B.waitFor('input', 3000);
    ok(b2 && b2._seq === 2 && bCount === 2, 'seq=2 正常转发（count=2）[bCount=' + bCount + ' bSeqs=' + JSON.stringify(bSeqs) + ' b2seq=' + (b2 && b2._seq) + ']');

    // 乱序：A 已到 seq=2，旧包 seq=1 迟到 → 仍被丢弃
    A.send('input', { _seq: 1, board: [1], turn: 1 - A.side });
    const late = await B.waitForNone('input', 800);
    ok(late == null && bCount === 2, '迟到旧包 seq=1 仍被丢弃（乱序防护，count 仍为 2）');

    // 不同座位（B）的 seq 互不影响：B 发 seq=1 应转发给 A
    let aCount = 0; A.on('input', () => aCount++);
    B.send('input', { _seq: 1, board: [3], turn: 1 - B.side });
    const aGot = await A.waitFor('input', 3000);
    ok(aGot && aGot._seq === 1 && aCount === 1, '另一座位 B 的 seq=1 正常转发（去重按 side 隔离）');

    A.close(); B.close();
    await sleep(50);
    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    try { server.close(); } catch (e) {}
    setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
