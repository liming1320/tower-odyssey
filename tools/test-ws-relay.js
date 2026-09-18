// 联机中继回归测试（tools/test-ws-relay.js）
// 起临时 http 服务挂 server/ws-relay，用 ws 客户端模拟玩家，
// 验证：按游戏匹配不串游戏 / 房间码邀请建房 / 房间内 input 转发 / 房间已满。
// 运行：node tools/test-ws-relay.js   （退出码 0 = 全过）
const http = require('http');
const WebSocket = require('ws');
const WsRelay = require('../server/ws-relay');

const PORT = 5199;
const server = http.createServer();
WsRelay.attach(server);

function client() {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws/minigame');
  ws._q = [];
  ws.on('message', b => {
    const m = JSON.parse(b.toString());
    ws._q.push(m);
    if (ws._waiters && ws._waiters[m.type]) { const w = ws._waiters[m.type]; delete ws._waiters[m.type]; w(m.data); }
  });
  return ws;
}
function wait(ws, type, ms = 2000) {
  return new Promise((res, rej) => {
    const got = ws._q.find(m => m.type === type);
    if (got) { ws._q = ws._q.filter(m => m !== got); return res(got.data); }
    ws._waiters = ws._waiters || {};
    ws._waiters[type] = res;
    setTimeout(() => rej(new Error('timeout ' + type)), ms);
  });
}
function send(ws, type, data) { ws.send(JSON.stringify({ type, data })); }
function assert(c, msg) { if (!c) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('PASS: ' + msg); }
const open = ws => new Promise(r => ws.on('open', r));

server.listen(PORT, '127.0.0.1', async () => {
  try {
    const A = client(); const B = client();
    await open(A); await open(B);
    send(A, 'join', { game: 'gomoku', me: '小明' });
    await wait(A, 'waiting');
    send(B, 'join', { game: 'gomoku', me: '小红' });
    const rA = await wait(A, 'room');
    const rB = await wait(B, 'room');
    assert(rA.opp === '小红' && rB.opp === '小明', '同游戏快速匹配 + 昵称互填 (A↔B)');
    assert(rA.side === 0 && rB.side === 1, '双方侧别 0/1');

    const C = client(); await open(C);
    send(C, 'join', { game: 'xiangqi', me: '阿强' });
    const wC = await wait(C, 'waiting');
    assert(wC.game === 'xiangqi', '不同游戏不串匹配（C 仅留 xiangqi 队列）');

    const ip = new Promise(r => { B.on('message', function h(b){ const m=JSON.parse(b.toString()); if(m.type==='input'){ B.removeListener('message',h); r(m.data);} }); });
    send(A, 'input', { x: 5, y: 3 });
    const got = await ip;
    assert(got.x === 5, '房间内 input 转发到对手 (B 收到 A 落子)');

    const D = client(); const E = client();
    await open(D); await open(E);
    send(D, 'join', { game: 'gomoku', room: 'R1', me: '房主' });
    const rD = await wait(D, 'room');
    assert(rD.side === 0 && rD.room === 'R1', '房主建房 R1 (side 0)');
    send(E, 'join', { game: 'gomoku', room: 'R1', me: '客人' });
    const pE = await wait(E, 'peer');
    const rE = await wait(E, 'room');
    assert(rE.side === 1 && rE.opp === '房主', '客人凭房间码加入 + 拿到房主昵称');
    assert(pE.nickname === '房主' || pE.nickname === '客人', '建房后双方收到 peer 更新');

    const F = client(); await open(F);
    send(F, 'join', { game: 'gomoku', room: 'R1' });
    const err = await wait(F, 'error');
    assert(err.msg && /已满/.test(err.msg), '房间已满时返回友好错误');

    [A, B, C, D, E, F].forEach(w => { try { w.close(); } catch (e) {} });
    server.close();
    console.log(process.exitCode ? 'RELAY_TEST_FAILED' : 'RELAY_TEST_ALL_PASS');
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  } catch (e) {
    console.error('TEST_ERROR', e.message);
    server.close();
    process.exit(1);
  }
});
