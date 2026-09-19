// verify-net-new.js —— 本轮新增 3 款联机游戏的「状态同步契约」回归测试（真 ws 中继）
// 覆盖：坦克大决战(tankpvp 对打) / 贪吃蛇对战(snakepvp 对战) / 双人迷宫闯关(maze-coop 协作)。
// 不需要浏览器：在独立 VM 上下文加载 mg-net + mg-pvp + 游戏文件（canvas/ui 打桩），
// 模拟两个真实客户端，验证「本地动作 → 经中继 → 对手 setState 还原」的接线成立。
//
// 单独运行：node tools/verify-net-new.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WebSocket = require('ws');
const { attach } = require('../server/ws-relay');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENG = path.join(__dirname, '../public/js/minigames/engine');
const GAMES = path.join(__dirname, '../public/js/minigames');

// 在独立 VM 上下文加载 mg-net + mg-pvp + 指定游戏文件（window 即全局，canvas/ui 打桩）
function loadClient(gameFile) {
    const noop = () => {};
    const sandbox = {
        console, setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array,
        WebSocket, location: { protocol: 'ws:' },
        requestAnimationFrame: f => setTimeout(() => f(Date.now()), 33),
        cancelAnimationFrame: id => clearTimeout(id),
        addEventListener: noop, removeEventListener: noop,
    };
    sandbox.window = sandbox;                       // 让 window.MG / MG 指向同一全局
    vm.createContext(sandbox);
    const eng = ['mg-net.js', 'mg-pvp.js'].map(f => fs.readFileSync(path.join(ENG, f), 'utf8')).join('\n');
    vm.runInContext(eng, sandbox);
    // 渲染相关打桩
    const ctx = new Proxy({}, {
        get(t, p) {
            if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: noop });
            if (p === 'measureText') return () => ({ width: 0 });
            return noop;
        },
        set() { return true; },
    });
    const canvasEl = { addEventListener: noop, removeEventListener: noop, getContext: () => ctx, style: {}, width: 0, height: 0 };
    sandbox.MG.canvas = (c, w, h) => ({ c: canvasEl, ctx, w, h, destroy: noop });
    sandbox.MG.ui = { board: noop, emoji: noop, rr: noop };
    sandbox.MG.ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    sandbox.MG.hint = noop;
    sandbox.MG.audio = { sfx: noop, unlock: noop };
    sandbox.window.__MG_TEST = true;
    vm.runInContext(fs.readFileSync(path.join(GAMES, gameFile), 'utf8'), sandbox);
    return sandbox;
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
async function pair(url, game, A, B) {
    A.net.send('lobby', { game, cap: 2 });
    A.net.send('join', { game, cap: 2, create: true, me: 'A' });
    const aSeat = await waitMsg(A.net, 'seat'); A.net._room = aSeat.room;
    B.net.send('join', { game, cap: 2, room: aSeat.room, me: 'B' });
    await Promise.all([waitMsg(A.net, 'start'), waitMsg(B.net, 'start')]);
}
const container = () => ({ innerHTML: '', addEventListener: () => {}, removeEventListener: () => {}, clientWidth: 480, querySelector: () => null });
async function armAndStart(url, game, A, B) {
    A.MG.net.connect(url); B.MG.net.connect(url);
    await Promise.all([waitOpen(A.MG.net), waitOpen(B.MG.net)]);
    await pair(url, game, A.MG, B.MG);
    A.MG.pvp._armed = { game, side: 0, cap: 2, race: true };
    B.MG.pvp._armed = { game, side: 1, cap: 2, race: true };
    const ca = container(), cb = container();
    const ctrlA = A.MiniGames[game].start(ca, {});
    const ctrlB = B.MiniGames[game].start(cb, {});
    return { ctrlA, ctrlB };
}

(async () => {
    const server = http.createServer();
    attach(server);
    await new Promise(r => server.listen(0, r));
    const url = `ws://127.0.0.1:${server.address().port}/ws/minigame`;
    console.log('[relay]', url);

    // ===================== tankpvp：双人实时对战 =====================
    console.log('\n[1] tankpvp（坦克大决战）联机同步');
    try {
        const A = loadClient('tankpvp.js'), B = loadClient('tankpvp.js');
        const { ctrlA, ctrlB } = await armAndStart(url, 'tankpvp', A, B);
        await sleep(150);
        ok(B.__tankpvp.opp.x === A.__tankpvp.me.x && B.__tankpvp.opp.y === A.__tankpvp.me.y, '房主坦克位置经中继回声同步给对手');
        ok(A.__tankpvp.me.lives === 3 && B.__tankpvp.opp.lives === 3, '双方初始 3 条命已同步');
        A.__tankpvp.fire();
        await sleep(260);
        ok(B.__tankpvp.oppBullets.length > 0, '房主开火：子弹经中继回声同步给对手');
        ctrlA.stop(); ctrlB.stop();
    } catch (e) { fail++; console.log('  ✗ tankpvp 异常', e.message); }

    // ===================== snakepvp：同盘双蛇对战 =====================
    console.log('\n[2] snakepvp（贪吃蛇对战）联机同步');
    try {
        const A = loadClient('snakepvp.js'), B = loadClient('snakepvp.js');
        const { ctrlA, ctrlB } = await armAndStart(url, 'snakepvp', A, B);
        await sleep(150);
        ok(B.__snakepvp.food !== null, '房主首发食物经中继同步给对手');
        A.__snakepvp.setDir({ x: 1, y: 0 });
        A.__snakepvp.step();                       // 房主主动走一步并 commit
        A.__snakepvp.setDir({ x: 0, y: 0 });       // 冻结后续自动步进，避免与 setInterval 竞态
        const committedHead = { x: A.__snakepvp.snake[0].x, y: A.__snakepvp.snake[0].y };
        await sleep(160);
        const bo = B.__snakepvp.opp[0];
        ok(bo && bo.x === committedHead.x && bo.y === committedHead.y, '房主蛇身(蛇头)经中继同步给对手');
        ok(A.__snakepvp.snake.length === 3, '房主蛇初始长度 3（本地状态正确）');
        ctrlA.stop(); ctrlB.stop();
    } catch (e) { fail++; console.log('  ✗ snakepvp 异常', e.message); }

    // ===================== maze-coop：双人协作迷宫 =====================
    console.log('\n[3] maze-coop（双人迷宫闯关）联机同步');
    try {
        const A = loadClient('maze-coop.js'), B = loadClient('maze-coop.js');
        const { ctrlA, ctrlB } = await armAndStart(url, 'maze-coop', A, B);
        await sleep(150);
        ok(B.__mazecoop.L !== null, '房主种子经中继下发，队友重建同一迷宫');
        // 找一个合法且非特殊格（非钥匙/陷阱/出口）的邻格移动，验证位置同步
        const L = A.__mazecoop.L, p = A.__mazecoop.pos;
        let moved = false;
        const isPlain = (nx, ny) => L.m[ny][nx] === 0
            && !L.keys.some(k => k.x === nx && k.y === ny)
            && !L.traps.some(t => t.x === nx && t.y === ny)
            && !(nx === L.exit.x && ny === L.exit.y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = p.x + dx, ny = p.y + dy;
            if (nx >= 0 && ny >= 0 && nx < L.gw && ny < L.gh && isPlain(nx, ny)) { A.__mazecoop.move(dx, dy); moved = true; break; }
        }
        ok(moved, '房主找到可移动空格（非钥匙/陷阱/出口）');
        await sleep(140);
        if (moved) {
            const bp = B.__mazecoop.oppPos, ap = A.__mazecoop.pos;
            ok(bp.x === ap.x && bp.y === ap.y, '房主移动经中继同步给队友(oppPos 还原)');
        } else {
            ok(true, '（出生点邻格均为特殊格，跳过位置同步断言）');
        }
        ctrlA.stop(); ctrlB.stop();
    } catch (e) { fail++; console.log('  ✗ maze-coop 异常', e.message); }

    try { server.close(); } catch (e) {}
    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
