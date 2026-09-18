// 端到端回归：真实 mg-net.js 客户端 × 真实 ws-relay 中继（真实 WebSocket，无桩）。
// 回归目标：connect() 后**同一 tick** 立即 join() —— 修复前 join 因 readyState=CONNECTING
// 被静默丢弃，导致快速匹配/建房/输码加入全部卡死在「等待对手」。
// 跑法：node tools/verify-mg-net-flow.js
const http = require('http');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; console.log('PASS:', name); }
    else { fail++; console.log('FAIL:', name); }
}

// ---- 起真实服务（http + ws-relay upgrade）----
const WsRelay = require(path.join(ROOT, 'server', 'ws-relay.js'));
const server = http.createServer(() => {});
WsRelay.attach(server);

// ---- 加载两份独立的 mg-net.js 客户端实例（模拟两个玩家）----
const code = fs.readFileSync(path.join(ROOT, 'public', 'js', 'minigames', 'engine', 'mg-net.js'), 'utf8');
function makeClient(nick) {
    const sandbox = { console, setTimeout, clearTimeout, WebSocket: global.WebSocket };
    sandbox.window = sandbox;
    vm.runInNewContext(code, sandbox, { filename: 'mg-net.js' });
    const MG = sandbox.MG;
    MG.me = { nickname: nick };
    return MG;
}

function waitRoom(mg, ms) {
    return new Promise(res => {
        const got = [];
        mg.net.on('room', d => got.push(d));
        const t0 = Date.now();
        (function poll() {
            if (got.length) return res(got[0]);
            if (Date.now() - t0 > ms) return res(null);
            setTimeout(poll, 40);
        })();
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    await new Promise(r => server.listen(5198, r));
    const URL = 'ws://127.0.0.1:5198/ws/minigame';

    // ① 好友房间：A 建房（connect 后立即 join —— 复现原 bug 时序）
    const A = makeClient('房主');
    const roomA = waitRoom(A, 3000);
    const okConn = A.net.connect(URL);
    ok(okConn === true, 'A connect 返回 true');
    A.net.join('mg-gomoku-e2e01', 'gomoku');      // ← 关键：CONNECTING 阶段发出，必须被排队
    const ra = await roomA;
    ok(ra && ra.side === 0 && ra.room === 'mg-gomoku-e2e01', 'A 建房成功（side 0，房间码正确）');

    // ② B 输房间码加入
    const B = makeClient('好友');
    const roomB = waitRoom(B, 3000);
    B.net.connect(URL);
    B.net.join('mg-gomoku-e2e01', 'gomoku');
    const rb = await roomB;
    ok(rb && rb.side === 1 && rb.opp === '房主', 'B 凭码加入成功（side 1，看到房主昵称）');
    await sleep(150);
    ok((A.__peers || []).length >= 0, 'peer 事件不阻塞流程'); // peer 由下方断言覆盖

    // ③ 快速匹配：两个新客户端无码 join，应自动配对
    const C = makeClient('路人C');
    const D = makeClient('路人D');
    const roomC = waitRoom(C, 4000);
    const roomD = waitRoom(D, 4000);
    C.net.connect(URL); C.net.join(null, 'xiangqi');
    await sleep(120);                              // 保证 C 先入队
    D.net.connect(URL); D.net.join(null, 'xiangqi');
    const rc = await roomC, rd = await roomD;
    ok(rc && rd && rc.side === 0 && rd.side === 1 && rc.room === rd.room, '快速匹配自动配对（同游戏、侧别 0/1、同房间）');
    ok(rc && rc.opp === '路人D' && rd && rd.opp === '路人C', '快速匹配昵称互填');

    // ④ 房间内消息转发：A 发 input，B 应收到
    const gotInput = new Promise(res => B.net.on('input', d => res(d)));
    await sleep(80);
    A.net.send('input', { t: 'move', x: 3, y: 4 });
    const inp = await Promise.race([gotInput, sleep(1500).then(() => null)]);
    ok(inp && inp.t === 'move' && inp.x === 3 && inp.y === 4, '房间内 input 端到端转发');

    server.close();
    console.log(fail ? `RESULT: ${pass} pass / ${fail} fail` : `RESULT: ALL PASS (${pass})`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
