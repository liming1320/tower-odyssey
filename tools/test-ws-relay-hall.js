// 联机大厅中继测试：覆盖 lobby / tables / seat / start（2 人桌 + 4 人桌）+ 离座回收
// 用真实 ws 模块跑真实的 server/ws-relay.js（attach 到临时 http server）。
const http = require('http');
const { WebSocket } = require('ws');
const path = require('path');
const relay = require(path.join(__dirname, '..', 'server', 'ws-relay'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeClient(name) {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws/minigame');
    const c = { ws, name, types: {}, last: {}, open: false };
    ws.on('open', () => { c.open = true; });
    ws.on('message', buf => {
        let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
        c.last[m.type] = m.data; c.types[m.type] = (c.types[m.type] || 0) + 1;
    });
    c.send = (type, data) => ws.send(JSON.stringify({ type, data }));
    return c;
}
async function open(c) { for (let i = 0; i < 50 && !c.open; i++) await sleep(20); return c.open; }
async function waitType(c, type, n = 1) { for (let i = 0; i < 100; i++) { if ((c.types[type] || 0) >= n) return true; await sleep(20); } return false; }

let PORT = 0;
async function run() {
    // ---- 2 人桌：创建 → 大厅可见 → 加入 → 满座开战 ----
    console.log('[2 人桌 · gomoku]');
    const A = makeClient('甲方'); await open(A);
    A.send('lobby', { game: 'gomoku', cap: 2 });
    await waitType(A, 'tables');
    ok((A.last.tables.tables || []).length === 0, '初始大厅无桌子');

    A.send('join', { game: 'gomoku', cap: 2, create: true, me: '甲方' });
    await waitType(A, 'seat');
    ok(A.last.seat.you === 0, '创建者坐到座位 0');
    ok(A.last.seat.seats[0] && A.last.seat.seats[0].name === '甲方', '座位 0 显示昵称「甲方」');
    await waitType(A, 'tables', 2);
    ok((A.last.tables.tables || []).length === 1, '大厅出现 1 张开放桌子');

    const B = makeClient('乙方'); await open(B);
    B.send('lobby', { game: 'gomoku', cap: 2 });
    await waitType(B, 'tables', 1);
    const tables = B.last.tables.tables || [];
    ok(tables.length === 1, '乙方大厅看到 1 张桌子');
    ok(tables[0].seats[0] && tables[0].seats[0].name === '甲方' && tables[0].seats[1] === null, '桌子显示甲方已坐、座位1空');

    B.send('join', { game: 'gomoku', room: tables[0].room, cap: 2, me: '乙方' });
    await waitType(B, 'seat');
    ok(B.last.seat.you === 1, '乙方坐到座位 1');
    const startedA = await waitType(A, 'start');
    const startedB = await waitType(B, 'start');
    ok(startedA && startedB, '双方都收到 start（满座开战）');
    ok(A.last.start.side === 0 && B.last.start.side === 1, 'start 分配 side 0/1 正确');
    ok((A.last.tables.tables || []).length === 0, '开战后桌子从大厅移除');

    // 房间内 input/state 转发（对战同步的基础）
    A.send('input', { kind: 'move', x: 5 });
    await waitType(B, 'input');
    ok(B.last.input && B.last.input.kind === 'move' && B.last.input.x === 5, '房间内 input 转发到对手');
    A.send('state', { board: 'abc' });
    await waitType(B, 'state');
    ok(B.last.state && B.last.state.board === 'abc', '房间内 state 转发到对手');

    // ---- 离座回收：新桌只甲方，甲方断开 → 桌子消失 ----
    console.log('[离座回收]');
    const C = makeClient('丙方'); await open(C);
    C.send('join', { game: 'gomoku', cap: 2, create: true, me: '丙方' });
    await waitType(C, 'seat');
    const D = makeClient('丁方'); await open(D);
    D.send('lobby', { game: 'gomoku', cap: 2 });
    await waitType(D, 'tables', 1);
    ok((D.last.tables.tables || []).length === 1, '丁方看到丙方开的桌');
    C.ws.close();
    // 等 relay 心跳/清理：依赖 close 事件即时 broadcastTables
    let removed = false;
    for (let i = 0; i < 100; i++) { if ((D.last.tables.tables || []).length === 0) { removed = true; break; } await sleep(20); }
    ok(removed, '丙方断开后桌子从大厅消失');

    // ---- 4 人桌：强手棋 4 座位满座开战 ----
    console.log('[4 人桌 · richman]');
    const p = [];
    for (let i = 0; i < 4; i++) { p[i] = makeClient('P' + i); await open(p[i]); }
    p[0].send('join', { game: 'richman', cap: 4, create: true, me: 'P0' });
    await waitType(p[0], 'seat');
    ok(p[0].last.seat.you === 0, 'P0 坐座位 0');
    for (let i = 1; i < 4; i++) {
        const t = await getOpenTable(p[i], 'richman', 4);
        p[i].send('join', { game: 'richman', room: t, cap: 4, me: 'P' + i });
        await waitType(p[i], 'seat');
        ok(p[i].last.seat.you === i, 'P' + i + ' 坐座位 ' + i);
    }
    let allStart = true;
    for (let i = 0; i < 4; i++) { if (!(await waitType(p[i], 'start'))) allStart = false; }
    ok(allStart, '4 人全部收到 start');
    for (let i = 0; i < 4; i++) ok(p[i].last.start.side === i, 'P' + i + ' side=' + i);

    p.forEach(x => x.ws.close());
    A.ws.close(); B.ws.close(); D.ws.close();
}

async function getOpenTable(c, game, cap) {
    c.send('lobby', { game, cap });
    for (let i = 0; i < 100; i++) { const t = (c.last.tables && c.last.tables.tables) || []; if (t.length) return t[0].room; await sleep(20); }
    return null;
}

const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
relay.attach(server);
server.listen(0, () => {
    PORT = server.address().port;
    run().then(() => {
        console.log('\n结果：PASS ' + pass + ' / FAIL ' + fail);
        process.exit(fail ? 1 : 0);
    }).catch(e => { console.error('测试异常', e); process.exit(2); });
});
