// verify-4p.js —— 联机「4 人桌真实同步」回归测试（无需浏览器，真 ws 中继）
// 验证 mg-pvp 已支持 N 人回合轮转 + 中继向所有非自己座位广播：
//   4 个真实客户端（强手棋 4 人桌）走 lobby→create→join×3→start（各得不同 side/slot）
//   → 每人依次落子，断言其余 3 人均实时收到；→ 中途一人掉线，其余收 peer_gone 不判负，
//     掉线者带 slot 重连拿到 resume 续局、其余收 peer_back。
process.env.MG_RESUME_MS = process.env.MG_RESUME_MS || '1500';
process.env.MG_ROOMS_OFF = '1'; // 本测试不关心快照，关闭以免写临时文件

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

    // ---------- 4 人桌：座位分配 + 回合广播 ----------
    console.log('\n[1] 4 人桌开局与座位分配');
    const P = ['A', 'B', 'C', 'D'].map(n => makeClient(url, n));
    await Promise.all(P.map(c => c.open()));
    P[0].send('lobby', { game: 'richman', cap: 4 });
    P[0].send('join', { game: 'richman', cap: 4, create: true, me: 'A' });
    const aSeat = await P[0].waitFor('seat');
    P[0].room = aSeat.room;
    ok(!!P[0].room, 'A 建房得到房间码: ' + P[0].room);
    for (let i = 1; i < 4; i++) P[i].send('join', { game: 'richman', cap: 4, room: P[0].room, me: P[i].name });
    const starts = await Promise.all(P.map(c => c.waitFor('start')));
    P.forEach((c, i) => { c.slot = starts[i].slot; c.side = starts[i].side; });
    ok(starts.every(s => !!s.slot), '4 人 start 均带 slot token');
    const sides = starts.map(s => s.side).sort();
    ok(JSON.stringify(sides) === JSON.stringify([0, 1, 2, 3]), '4 人 side 互不相同且为 0..3: ' + sides.join(','));
    ok(starts[0].seats && starts[0].seats.length === 4, 'start 携带 4 座位快照（seats 长度=4）');
    ok(starts[0].opp && starts[0].opp.length === 3, 'start.opp 为其余 3 名玩家昵称列表（长度=3）');

    // 每人依次落子，其余 3 人应各收到一次
    console.log('\n[2] 回合轮转：每人落子广播给其余 3 人');
    for (let i = 0; i < 4; i++) {
        const received = [0, 1, 2, 3].filter(j => j !== i).map(() => 0);
        const others = [0, 1, 2, 3].filter(j => j !== i);
        const proms = others.map(j => new Promise(res => {
            const h = d => { if (d && d.by === P[i].name) { received[others.indexOf(j)]++; res(); } };
            P[j].on('input', h);
        }));
        P[i].send('input', { by: P[i].name, turn: (i + 1) % 4, board: { step: i } });
        await Promise.all(proms);
        ok(received.every(n => n === 1), `${P[i].name}(side${P[i].side}) 落子后其余 3 人均实时收到（各 1 次）`);
    }

    // 中途 C(side2) 掉线，其余应收 peer_gone 不判负
    console.log('\n[3] 4 人桌掉线重连');
    let leftSeen = {};
    P.forEach(c => c.on('peer_left', d => { leftSeen[d.side] = true; }));
    P[2].close();
    const gone = await Promise.all([P[0], P[1], P[3]].map(c => c.waitFor('peer_gone', 3000).catch(() => null)));
    ok(gone.every(Boolean), 'C 掉线后其余 3 人均收 peer_gone（等待重连，不判负）');
    ok(!leftSeen[2], '重连窗口内无人被误判负');
    await sleep(300);

    // C 带 slot 重连
    const C2 = makeClient(url, 'C');
    await C2.open();
    const cResumeP = C2.waitFor('resume');
    const backP = Promise.all([P[0], P[1], P[3]].map(c => c.waitFor('peer_back', 3000).catch(() => null)));
    C2.send('join', { game: 'richman', cap: 4, room: P[0].room, slot: P[2].slot, me: 'C' });
    const cResume = await cResumeP;
    ok(cResume && cResume.side === P[2].side, 'C 重连后按 slot 还原原 side（' + cResume.side + '）');
    const backs = await backP;
    ok(backs.every(Boolean), '其余 3 人收 peer_back（C 已归来）');
    ok(!leftSeen[2], '整段重连过程中无人被误判负');

    // 续局后 C 落子仍广播给其余 3 人
    const recv2 = [0, 1, 3].map(() => 0);
    const others2 = [0, 1, 3];
    const proms2 = others2.map(j => new Promise(res => {
        const h = d => { if (d && d.by === 'C') { recv2[others2.indexOf(j)]++; res(); } };
        P[j].on('input', h);
    }));
    C2.send('input', { by: 'C', turn: 3, board: { step: 99 } });
    await Promise.all(proms2);
    ok(recv2.every(n => n === 1), '续局后 C 落子仍正常广播给其余 3 人');

    C2.close(); P.forEach(c => c.close());
    await sleep(50);

    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    try { server.close(); } catch (e) {}
    setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
