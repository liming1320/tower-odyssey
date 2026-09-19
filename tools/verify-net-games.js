// verify-net-games.js —— 新增联机游戏「状态同步契约」回归测试（真 ws 中继）
// 不需要浏览器：在独立 VM 上下文加载 mg-net + mg-pvp 各一份，模拟两个真实客户端，
// 验证 memory（共享牌面回合制）与 g2048（竞速）的整盘状态能经中继正确转发给对手。
// 这覆盖了两个新游戏接入 MG.pvp 的同步形状（避免改游戏渲染逻辑，只测协议层）。
//
// 单独运行：node tools/verify-net-games.js
process.env.MG_RESUME_MS = process.env.MG_RESUME_MS || '1500';

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WebSocket = require('ws');
const { attach } = require('../server/ws-relay');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 在独立 VM 上下文加载 mg-net + mg-pvp（自带 window/WebSocket/location），返回该上下文的 MG
function loadMG() {
    const win = { MG: {} };
    const sandbox = { window: win, WebSocket, location: { protocol: 'ws:' }, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array };
    vm.createContext(sandbox);
    const code = ['mg-net.js', 'mg-pvp.js']
        .map(f => fs.readFileSync(path.join(__dirname, '../public/js/minigames/engine', f), 'utf8'))
        .join('\n');
    vm.runInContext(code, sandbox);
    win.MG.me = { nickname: 'T' };
    return win.MG;
}
function waitOpen(net, t = 3000) {
    return new Promise((res, rej) => {
        const iv = setInterval(() => { if (net._ws && net._ws.readyState === 1) { clearInterval(iv); res(); } }, 15);
        setTimeout(() => { clearInterval(iv); rej(new Error('open timeout')); }, t);
    });
}
function waitMsg(net, type, t = 3000) {
    return new Promise((res, rej) => {
        const iv = setTimeout(() => rej(new Error('timeout ' + type)), t);
        net.on(type, d => { clearTimeout(iv); res(d); });
    });
}
// 走 lobby→create→join 把两个客户端凑进同一房间（中继转发需要满座房间）
async function pair(url, game, A, B) {
    A.net.send('lobby', { game, cap: 2 });
    A.net.send('join', { game, cap: 2, create: true, me: 'A' });
    const aSeat = await waitMsg(A.net, 'seat'); A.net._room = aSeat.room;
    B.net.send('join', { game, cap: 2, room: aSeat.room, me: 'B' });
    await Promise.all([waitMsg(A.net, 'start'), waitMsg(B.net, 'start')]);
}

(async () => {
    const server = http.createServer();
    attach(server);
    await new Promise(r => server.listen(0, r));
    const url = `ws://127.0.0.1:${server.address().port}/ws/minigame`;
    console.log('[relay]', url);

    // ===================== memory：共享牌面 + 回合制 =====================
    console.log('\n[1] memory（记忆翻牌）联机同步');
    const A = loadMG(), B = loadMG();
    const bStates = [];
    A.pvp.arm('memory', 0, null, { cap: 2 }); A.pvp.begin({ setState: m => bStates.push(m), onOver() {} });
    B.pvp.arm('memory', 1, null, { cap: 2 }); B.pvp.begin({ setState: m => bStates.push(m), onOver() {} });
    A.net.connect(url); B.net.connect(url);
    await Promise.all([waitOpen(A.net), waitOpen(B.net)]);
    await pair(url, 'memory', A, B);

    const board = [['🍎', '🍎'], ['🍌', '🍌']];
    bStates.length = 0;
    A.pvp.commit({ board, flipped: [], matched: 0, scores: [0, 0], moves: 0, turn: 0, over: null });
    await sleep(120);
    ok(bStates.length > 0 && JSON.stringify(bStates[bStates.length - 1].board) === JSON.stringify(board), '房主牌面经中继转发给对手（共享牌面还原）');

    A.pvp.commit({ board, flipped: [[0, 0], [0, 1]], matched: 1, scores: [1, 0], moves: 1, turn: 1, over: null });
    await sleep(120);
    const last = bStates[bStates.length - 1];
    ok(last.turn === 1 && last.matched === 1 && last.scores[0] === 1, '配对成功：留回合(turn→1)/比分同步给对手');
    ok(A.pvp.canMove() === false && B.pvp.canMove() === true, '回合锁生效：房主落子后轮到对手（canMove 正确）');

    // 终局 over → 对手 setState 收到 over
    bStates.length = 0;
    A.pvp.commit({ board: [[null, null], [null, null]], flipped: [], matched: 2, scores: [2, 0], moves: 1, turn: 0, over: 0 });
    await sleep(120);
    ok(bStates[bStates.length - 1].over === 0, '终局 over 同步给对手（对手据此结算）');

    // ===================== g2048：竞速进度同步 =====================
    console.log('\n[2] g2048（2048 竞速）联机同步');
    const C = loadMG(), D = loadMG();
    const dStates = [];
    C.pvp.arm('g2048', 0, null, { cap: 2, race: true }); C.pvp.begin({ setState: m => dStates.push(m), onOver() {} });
    D.pvp.arm('g2048', 1, null, { cap: 2, race: true }); D.pvp.begin({ setState: m => dStates.push(m), onOver() {} });
    C.net.connect(url); D.net.connect(url);
    await Promise.all([waitOpen(C.net), waitOpen(D.net)]);
    await pair(url, 'g2048', C, D);

    dStates.length = 0;
    C.pvp.commit({ score: 120, maxL: 4, over: 0, win: 0 });   // 每步广播进度
    await sleep(120);
    ok(dStates.length > 0 && dStates[dStates.length - 1].score === 120 && dStates[dStates.length - 1].maxL === 4, '进度(分数/最高等级)经中继同步给对手');
    ok(C.pvp.canMove() === true && D.pvp.canMove() === true, '竞速不锁回合：双方均可落子（canMove 恒 true）');

    C.pvp.commit({ score: 300, maxL: 6, over: 1, win: 1 });   // 终局
    await sleep(120);
    ok(dStates[dStates.length - 1].over === 1 && dStates[dStates.length - 1].win === 1, '终局 over/win 同步（对手据此判负/判胜）');

    try { server.close(); } catch (e) {}
    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
