// verify-heartbeat.js —— 联机「心跳 / RTT 测速 / 死连看门狗」回归测试（真 ws 中继）
// 不需要浏览器：
//   [1] 应用层心跳往返：客户端发 ping → 中继回 pong（带回显 t），客户端算出 RTT
//   [2] 死连看门狗：服务端「网络黑洞」（接受连接但永不回应/不关闭）时，
//       客户端超过 watchdogMs 未收到任何消息 → 主动 ws.close() 触发重连（onDown 被调用）
//
// 单独运行：node tools/verify-heartbeat.js
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
        ws, name,
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
    // ===================== 中继（用于 ping/pong 往返） =====================
    const relay = http.createServer();
    attach(relay);
    await new Promise(r => relay.listen(0, r));
    const rurl = `ws://127.0.0.1:${relay.address().port}/ws/minigame`;
    console.log('[relay]', rurl);

    // ---------- 用例 1：ping/pong 往返 + RTT ----------
    console.log('\n[1] 应用层心跳 ping → pong');
    const A = makeClient(rurl, 'A');
    await A.open();
    let pongT = null, pongSeen = false;
    A.on('pong', d => { pongSeen = true; pongT = d && d.t; });
    A.send('ping', { t: 123456 });
    const pong = await A.waitFor('pong', 3000).catch(() => null);
    ok(pongSeen && pong && pong.t === 123456, '客户端 ping 收到中继 pong 且回显 t 一致（' + JSON.stringify(pong) + '）');

    // ---------- 用例 2：死连看门狗（独立静默服务端 + VM 内 mg-net） ----------
    console.log('\n[2] 客户端死连看门狗（网络黑洞检测）');
    const silent = http.createServer();
    const swss = new WebSocket.Server({ noServer: true });
    swss.on('connection', () => { /* 永不回应、永不关闭：模拟运营商网络黑洞 */ });
    silent.on('upgrade', (req, socket, head) => { try { swss.handleUpgrade(req, socket, head, ws => swss.emit('connection', ws)); } catch (e) { socket.destroy(); } });
    await new Promise(r => silent.listen(0, r));
    const surl = `ws://127.0.0.1:${silent.address().port}/ws/minigame`;

    // 在独立 VM 上下文加载 mg-net（自带 window/WebSocket/location），避免污染主进程
    const vm = require('vm'); const fs = require('fs'); const path = require('path');
    const code = fs.readFileSync(path.join(__dirname, '../public/js/minigames/engine/mg-net.js'), 'utf8');
    const win = { MG: {} };
    const sandbox = { window: win, WebSocket, location: { protocol: 'ws:' }, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    const MG = win.MG;
    MG.me = { nickname: 'T' };
    // 缩短看门狗参数以加速测试（默认 25s 太久）
    MG.net._watchdogMs = 500; MG.net._hbMs = 200;
    // 模拟「对局进行中」：_room 非空，看门狗触发时才会走 onDown 重连路径
    MG.net._room = 'r-test'; MG.net._game = 'memory';
    let downCalled = false, downMsg = null;
    MG.net.onDown(m => { downCalled = true; downMsg = m; });

    MG.net.connect(surl);
    await sleep(900);   // > watchdogMs(500) + 心跳窗口
    ok(downCalled, '网络黑洞下客户端看门狗在 watchdogMs 内触发 onDown（主动断开 → 指数退避重连）');

    A.close();
    try { relay.close(); } catch (e) {}
    try { silent.close(); } catch (e) {}
    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
