// verify-pvp-e2e.js —— 浏览器无关的「端到端联机对战」回归（真实中继）
// 全流程：建房(lobby+create) → 进棋盘(start→MG.pvp.arm→runGame/net) →
//        落子同步(commit 经真实 WebSocket 转发) → 终局结算(onComplete 我方视角)
// 不依赖浏览器：用 vm 沙箱 + DOM/Canvas 桩跑真实 _engine/mg-pvp/mg-net/游戏代码，
// 真实 WebSocket 连真实 server/ws-relay.js（同进程 http.Server 挂载，仍用生产中继逻辑）。
//
// 用法：node tools/verify-pvp-e2e.js [ludo] [monopoly] [richman]
//       不传参 = 跑全部（monopoly/richman 需先接好 4 人同步，否则会停在“开发中”断言）
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const http = require('http');
const { WebSocket } = require('ws');
const { attach } = require('../server/ws-relay');

const ENGINE_DIR = path.join(__dirname, '..', 'public', 'js', 'minigames', 'engine');
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.on('unhandledRejection', (e) => { console.log('  [UNHANDLED REJECTION]', e && (e.stack || e.message) || e); });

// ---------- DOM / Canvas 桩 ----------
function makeCtx() {
    const st = { canvas: { width: 400, height: 520 }, __mgScale: 1 };
    return new Proxy(st, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { } });
            if (k === 'measureText') return () => ({ width: 10 });
            if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
            return () => undefined;
        },
        set(t, k, v) { t[k] = v; return true; },
    });
}
function makeEl(tag) {
    const style = { setProperty() { }, removeProperty() { } };
    const el = {
        tagName: tag, style, dataset: {}, children: [], __h: {},
        classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
        addEventListener(t, f) { (el.__h[t] = el.__h[t] || []).push(f); },
        removeEventListener(t, f) { const a = el.__h[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
        appendChild(c) { el.children.push(c); return c; },
        append() { for (const c of arguments) el.appendChild(c); },
        replaceChildren() { el.children = Array.prototype.slice.call(arguments); },
        removeChild() { }, remove() { },
        querySelector: () => makeEl('div'), querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 520 }),
        getContext: () => makeCtx(),
        clientWidth: 400, clientHeight: 520, width: 400, height: 520,
        focus() { }, click() { }, value: '', setAttribute() { }, isConnected: true,
        setPointerCapture() { }, releasePointerCapture() { },
        innerHTML: '', textContent: '',
    };
    return el;
}
const localStore = new Map();
const localStorageStub = {
    getItem: k => localStore.has(k) ? localStore.get(k) : null,
    setItem: (k, v) => localStore.set(k, String(v)),
    removeItem: k => localStore.delete(k),
};
const document = {
    createElement: makeEl, getElementById: () => makeEl('div'),
    querySelector: () => makeEl('div'), querySelectorAll: () => [],
    addEventListener() { }, removeEventListener() { }, body: { appendChild() { } }, hidden: false,
};
const gfxStub = {
    scene() { }, panel() { }, text() { }, glow() { }, bar() { }, wood() { },
    rgba: (c) => (typeof c === 'string' ? c : '#000'),
    lighten: (c) => (c || '#000'), darken: (c) => (c || '#000'),
};

function makeClient(game, side, nickname) {
    const ctx = {};
    ctx.window = ctx; ctx.console = console;
    ctx.process = process;   // 沙箱内暴露 process（生产代码不应依赖，但避免无头下 ReferenceError）
    ctx.__MG_TEST = true; ctx.__MG_FAST = 1; ctx.__MG_NORENDER = 1;
    ctx.setTimeout = (fn, ms) => setTimeout(fn, Math.max(0, Math.min(ms || 0, 30)));
    ctx.clearTimeout = clearTimeout;
    ctx.setInterval = setInterval; ctx.clearInterval = clearInterval;
    ctx.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 8);
    ctx.cancelAnimationFrame = id => clearTimeout(id);
    ctx.performance = { now: () => Date.now() };
    ctx.addEventListener = () => { }; ctx.removeEventListener = () => { };
    ctx.document = document;
    ctx.location = { protocol: 'http:', host: '127.0.0.1' };
    ctx.WebSocket = WebSocket;
    ctx.localStorage = localStorageStub;
    let firstCanvas = null, lastCanvas = null;
    const MG = {
        canvas: (container, W, H) => { const c = makeEl('canvas'); if (!firstCanvas) firstCanvas = c; lastCanvas = c; return { c, ctx: makeCtx(), destroy() { } }; },
        gfx: gfxStub, audio: { unlock() { }, sfx() { }, bgm: { stop() { } } }, hint: () => { },
        bg: { on: false }, postfx: { enabled: () => false }, perfGuard: { enabled: false, tick: () => 1 },
        char: undefined, haptics: () => { }, settings: { autoQuality: false },
        fxPool: null, makeTweenPool: null, ui: {}, match: { setOpp() { }, begin() { }, end() { }, active: false },
        onError: (e, info) => { if (e && !/__MG/.test('' + (info || ''))) console.log('  [onError]', info, e && e.message); },
        showGameError() { },
        shuffle: (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
        ri: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
        escapeHtml: s => String(s == null ? '' : s),
        fillLevels: (arr, n) => { const out = arr.slice(); while (out.length < n) out.push({ name: '关' + (out.length + 1) }); return out; },
    };
    ctx.MG = MG; ctx.window.MG = MG;
    vm.createContext(ctx);
    const files = ['_engine.js', 'mg-core.js', 'mg-pvp.js', 'mg-net.js', 'mg-ui.js', 'mg-input.js'].map(f => path.join(ENGINE_DIR, f));
    files.forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
    vm.runInContext(fs.readFileSync(path.join(ENGINE_DIR, '..', game + '.js'), 'utf8'), ctx, { filename: game + '.js' });
    // 调试：包装 _debug.act，观察每次驱动是否真正改变了 phase（据此判断 onAct 输入锁是否拦掉）
    if (process.env.E2E_DEBUG && game !== 'ludo') {
        try {
            const dbg = ctx.MiniGames[game]._debug;
            const origAct = dbg.act;
            dbg.act = function (a) {
                const r = origAct(a);
                if (r && typeof r.catch === 'function') r.catch(e => console.log('  [act rejected ' + nickname + '] ' + (e && (e.stack || e.message))));
                return r;
            };
        } catch (e) { console.log('  [warn] 无法包装 _debug.act:', e.message); }
    }
    const client = {
        ctx, MG, game, side, nickname,
        started: false, mySide: 0, onComplete: [],
        stage: makeEl('div'),
        launchNet(m) {
            MG.pvp.arm(game, m.side, m.opp, m.seats);
            const opts = { onScore: () => { }, onComplete: res => client.onComplete.push(res) };
            // 一律直接 game.start（与 minigames.js _launchNet 的 banqi 分支一致；
            // ludo 是 E.def 引擎游戏，其 start 内部会经 E.game 的 cfg.net 武装并 MG.pvp.begin）。
            // 注意：不要用 MG.runGame，它在无头 vm 下会因选关/RAF 路径卡死。
            if (game === 'ludo') {
                ctx.MiniGames[game].start(client.stage, { level: { need: 1 }, onScore: opts.onScore, onComplete: opts.onComplete });
            } else {
                ctx.MiniGames[game].start(client.stage, opts);
            }
            client.started = true;
            client.mySide = MG.pvp.side;
            client._canvasEl = firstCanvas;   // ludo 棋盘画布（首张）
        if (process.env.E2E_DEBUG) {
            const _recv = MG.pvp._recv.bind(MG.pvp);
            MG.pvp._recv = (m) => { client._inCount = (client._inCount || 0) + 1; const s = m && m.S; console.log('  [recv ' + nickname + '] turn=' + (m && m.turn) + ' S.turn=' + (s && s.turn) + ' ph=' + (s && s.phase) + ' opts=' + (s && s.opts && s.opts.length)); _recv(m); };
        }
        },
        getState() {
            if (game === 'ludo') return ctx.window.__mgS;
            if (game === 'gomoku') return (ctx.window.__gomokuDbg && ctx.window.__gomokuDbg.getState) ? ctx.window.__gomokuDbg.getState() : null;
            const d = ctx.MiniGames[game] && ctx.MiniGames[game]._debug;
            return d ? d.S : null;
        },
    };
    MG.net.on('start', m => { if (m && typeof m.side === 'number') { try { client.launchNet(m); } catch (e) { console.log('  [launchNet ERROR ' + nickname + ']', e && (e.stack || e.message)); } } else if (process.env.E2E_DEBUG) console.log('  [start ignored ' + nickname + '] side=' + (m && m.side)); });
    MG.net.on('seat', m => { if (m && m.room) client.room = m.room; });
    MG.net.on('error', m => { if (process.env.E2E_DEBUG) console.log('  [relay error]', nickname, m); });
    // 诊断：记录每个客户端的 input 收发，定位「丢包」导致的状态分叉
    const _origSend = MG.net.send.bind(MG.net);
    MG.net.send = (type, data) => { if (process.env.E2E_DEBUG && type === 'input') { const s = data && data.S; console.log('  [send ' + nickname + '] turn=' + (data && data.turn) + ' S.turn=' + (s && s.turn) + ' ph=' + (s && s.phase) + ' opts=' + (s && s.opts && s.opts.length)); } _origSend(type, data); };
    const _origConnect = MG.net.connect.bind(MG.net);
    MG.net.connect = (u) => {
        const ok = _origConnect(u);
        const ws = MG.net._ws;
        if (ws && process.env.E2E_DEBUG) {
            ws.onerror = e => console.log('  [ws error]', nickname, e && e.message);
            ws.onclose = () => console.log('  [ws close]', nickname);
        }
        return ok;
    };
    return client;
}

// ---------- 驱动（按游戏分派） ----------
function fireTapCanvas(client, x, y) {
    const cv = client._canvasEl;
    if (!cv) return;
    const hs = (cv.__h && cv.__h['pointerdown']) || [];
    for (const h of hs) h({ clientX: x, clientY: y, pointerId: 1, preventDefault() { }, stopPropagation() { } });
}
function planePixel(client, S, k) {
    const D = client.ctx.window.__ludoDbg, g = S._geo, p = S.turn, a = S.pl[p][k];
    const absOf = (pp, rel) => (D.startOf(pp) + rel) % D.RING;
    let q;
    if (a.rel < 0) q = D.basePos(p, k, g);
    else if (a.rel >= D.RING) q = D.homePos(p, a.rel - D.RING, g);
    else q = D.ringPos(absOf(p, a.rel), g);
    return { x: q.x + g.cs / 2, y: q.y + g.cs / 2 };
}
function driveLudo(client) {
    const S = client.getState();
    if (!S || S.winner >= 0) return;
    if (S.rolling) return;                                   // 掷骰动画中，等 settle
    if (S.turn !== client.mySide) return;                    // 只驱动当前行动方（避免双端同回合重复 tap → 状态回环）
    if (S.phase === 'roll') {
        const b = S._btn; if (!b) return;
        fireTapCanvas(client, b.x + b.w / 2, b.y + b.h / 2);
    } else if (S.phase === 'pick') {
        const opts = S.opts || []; if (!opts.length) return;
        // 单选项且非 6 时游戏会自动走（ludo.js doRoll 内 api.later 380ms），这里不要再 tap，
        // 否则自动走 + 手动 tap 双落子，pl 状态分叉 → 两端各判自己获胜（真实联机硬 bug）。
        if (opts.length === 1 && S.dice !== 6) return;
        const q = planePixel(client, S, opts[0]);
        fireTapCanvas(client, q.x, q.y);
    }
}
function driveBoard(client) {
    // monopoly / richman：通过真实 _debug.act 驱动（按钮是 innerHTML 桩，无法 click）
    const S = client.getState();
    if (!S || S.over) return;
    if (S.turn !== client.mySide) return;       // 没轮到就不动（等对手 commit）
    const p = S.players[S.turn];
    const dbg = client.ctx.MiniGames[client.game]._debug;
    if (S.phase === 'rolling' || S.phase === 'moving') return;
    if (S.phase === 'decide') {
        if (p.cash >= S.price[p.pos]) dbg.act('buy'); else dbg.act('skip');
        return;
    }
    if (S.phase === 'shopwait') { dbg.act('shopdone'); return; }
    if (S.phase === 'jail') { dbg.act('roll'); return; }
    if (S.phase === 'idle') {
        dbg.act('roll'); return;   // 直接掷骰（建楼为可选手动操作，harness 不测，不影响同步）
    }
    if (S.phase === 'end') { dbg.act('next'); return; }
}
function driveGomoku(client) {
    // 五子棋：通过真实 MG.bind 注册的 pointerdown 处理器驱动（棋盘是 canvas，落子靠点击）。
    // 每回合找第一个空格落子即可（整盘状态经 MG.pvp.commit 全量同步，终局自然收敛）。
    const S = client.getState();
    if (!S || S.over) return;
    if (!client.MG.pvp.canMove()) return;        // 没轮到就不动（等对手 commit）
    const b = S.board; if (!b) return;
    let bx = -1, by = -1;
    for (let i = 0; i < 15 && bx < 0; i++) for (let j = 0; j < 15; j++) if (!b[i][j]) { bx = i; by = j; break; }
    if (bx < 0) return;
    // 反向换算成画布像素坐标（gomoku: board.x ← p.y、board.y ← p.x；OFF=8, S=28）
    fireTapCanvas(client, 8 + by * 28, 8 + bx * 28);
}

// ---------- 状态比较 ----------
function stripState(game, S) {
    if (!S) return null;
    const o = JSON.parse(JSON.stringify(S, (k, v) => (k.charCodeAt(0) === 95 ? undefined : v)));
    if (game === 'ludo') { delete o.t; delete o.rnd; }
    else { delete o.hop; delete o.targeting; }
    return o;
}
// 逻辑状态（仅比对「会决定胜负/落子」的字段）：cosmetic 字段（msg/dice/rolling/extra/six）
// 在对局过程中会随动画窗口瞬时分叉，不属于需要同步的游戏状态，比较时剔除避免误报。
function logicState(game, S) {
    if (!S) return null;
    if (game === 'ludo') {
        return { pl: S.pl, turn: S.turn, winner: S.winner, humans: S.humans, need: S.need, phase: S.phase };
    }
    if (game === 'gomoku') {
        return { board: S.board, turn: S.turn, over: S.over, winLine: S.winLine };
    }
    return { turn: S.turn, phase: S.phase, over: S.over, winner: S.winner, players: S.players };
}
// 收敛检查用的耐久状态：每次 commit 都携带整盘状态，所以「棋盘/玩家」永不滞后；
// 只有 turn/phase 会因中继传播晚一跳（瞬时分叉）。比对时剔除 turn/phase，避免把
// 真实中继的异步延迟误报成状态分叉（真实分叉必然体现在 pl/players 上）。
// 另外剔除 cosmetic 字段（name/e/c/me）：每位客户端按自己视角把本座位叫「你」、
// 昵称不同，这是展示层差异而非游戏状态，比对时忽略，否则会把视角差异误报成分叉。
function durableState(game, S) {
    if (!S) return null;
    if (game === 'ludo') return { pl: S.pl, winner: S.winner, humans: S.humans, need: S.need };
    if (game === 'gomoku') return { board: S.board };   // 整盘棋盘全量同步，收敛即两方看到同一盘棋
    const normPlayers = (S.players || []).map(p => {
        const o = {};
        for (const k in p) { if (k === 'name' || k === 'e' || k === 'c' || k === 'me') continue; o[k] = p[k]; }
        return o;
    });
    return { players: normPlayers, over: S.over, winner: S.winner };
}

async function runGame(game, cap) {
    console.log(`\n=== [${game}] ${cap} 人真实中继对战回归 ===`);
    // 看门狗：中继 ws-relay 自带 30s 心跳 setInterval 会保持事件循环，正常流程靠 process.exit 退出；
    // 兜底防止任何异常卡死导致进程永不结束（CI 友好）。
    const watchdog = setTimeout(() => { console.log('  ✗ 看门狗超时（120s 未结束），强制退出'); process.exit(3); }, 120000);
    // 1) 启动真实中继（同进程 http.Server，仍用生产 server/ws-relay.js 逻辑）
    const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    attach(server);
    const url = `ws://127.0.0.1:${port}/ws/minigame`;
    await sleep(50);

    // 2) 造 cap 个无头客户端，各自连真实 WebSocket。
    //    预先生成确定性房间码：全部客户端发 join{room}（首到者建房、其余并入同一桌）。
    //    不依赖 seat 消息回传房间号（server/ws-relay 的 seat 不含 room 字段）。
    const names = ['甲', '乙', '丙', '丁'];
    const testRoom = 'mg-e2e-' + game + '-' + process.pid + '-' + Date.now();
    const clients = [];
    for (let i = 0; i < cap; i++) {
        const c = makeClient(game, i, names[i]);
        c.MG.me = { nickname: names[i] };
        c.MG.net.connect(url);
        c.MG.net.send('lobby', { game, cap });
        c.MG.net.send('join', { game, cap, room: testRoom, me: names[i] });
        clients.push(c);
    }

    // 4) 等所有客户端收到 start 并进入对局
    for (let t = 0; t < 120; t++) { await sleep(25); if (clients.every(c => c.started)) break; }
    const allStarted = clients.every(c => c.started);
    console.log(`  建房→进棋盘：${allStarted ? '✓ 全部 ' + cap + ' 人已进棋盘' : '✗ 仅 ' + clients.filter(c => c.started).length + '/' + cap}`);
    if (!allStarted) { clearTimeout(watchdog); server.close(); return false; }

    // ludo：用确定性 RNG 播种，让无头对局快速且可复现地走到终局（参考 verify-ludo-pvp.js）
    if (game === 'ludo') {
        clients.forEach(c => { try { const S = c.ctx.window.__mgS; if (S && c.ctx.MG.makeRng) S.rnd = c.ctx.MG.makeRng(20260918); } catch (e) {} });
    }

    // 记录开局状态（ludo 需 humans=2；board 需 4 真玩家）
    const s0 = clients[0].getState();
    console.log(`  开局状态：turn=${s0 && s0.turn} over=${s0 && s0.over} players=${s0 && s0.players && s0.players.length}`);

    // 5) 驱动对局直到终局
    // ludo 终局 = S.winner >= 0（无布尔 over 字段）；board 游戏终局 = S.over === true
    const isOver = (g, S) => g === 'ludo' ? (S && S.winner >= 0) : (S && S.over === true);
    let steps = 0, convergeOk = true;
    const drv = game === 'ludo' ? driveLudo : (game === 'gomoku' ? driveGomoku : driveBoard);
    for (let t = 0; t < 20000; t++) {
        const states = clients.map(c => c.getState());
        if (states.every(s => isOver(game, s))) break;
        // 收敛检查（每 20 步、且所有客户端已 settle 时）：动画窗口(rolling)内状态本就分叉，跳过
        if (t % 20 === 0) {
            const ss = states.filter(Boolean);
            if (ss.length === cap && ss.every(s => !s.rolling)) {
                // 仅在所有客户端 S.turn 一致时才比对：turn 一致 = 都收到了同一份最新 commit
                // （commit 总是携带整盘状态 + turn），此时 players 应当完全相同；turn 不一致只说明
                // 中继异步投递晚一跳（某客户端刚 commit、其余尚未收到），属良性延迟，跳过避免误报。
                const turns = ss.map(s => s.turn);
                if (turns.every(x => x === turns[0])) {
                    const j = ss.map(s => JSON.stringify(durableState(game, s)));
                    if (!j.every(x => x === j[0])) {
                        convergeOk = false;
                        if (process.env.E2E_DEBUG && !clients[0]._divDumped) {
                            clients[0]._divDumped = true;
                            console.log('  [DIVERGED @t' + t + '] ' + j.map((x, i) => 'C' + i + '=' + x).join(' | '));
                        }
                    }
                }
            }
        }
        for (const c of clients) { if (c.started) drv(c); }
        if (game === 'ludo' && process.env.E2E_DEBUG && t % 200 === 0) {
            const ss = clients.map(c => { const s = c.getState(); return `my${c.mySide}:turn=${s && s.turn} ph=${s && s.phase} roll=${s && s.rolling} win=${s && s.winner} pvpT=${c.MG.pvp._turn} act=${c.MG.pvp.active}`; });
            console.log('  [dbg t' + t + ']', ss.join(' | '));
        }
        if (game !== 'ludo' && process.env.E2E_DEBUG && t % 200 === 0) {
            const ss = clients.map(c => { const s = c.getState(); const p = s && s.players && s.players[s.turn]; return `my${c.mySide}:turn=${s && s.turn} ph=${s && s.phase} over=${s && s.over} can=${c.MG.pvp.canMove()} in=${(c._inCount||0)}`; });
            console.log('  [dbg t' + t + ']', ss.join(' | '));
        }
        await sleep(4);
        steps++;
    }
    await sleep(60);

    // 6) 断言
    let pass = 0, fail = 0;
    const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
    const finalStates = clients.map(c => stripState(game, c.getState()));
    const finalLogic = clients.map(c => JSON.stringify(logicState(game, c.getState())));
    ok(finalStates.every(Boolean), '全部客户端产生终局状态');
    ok(finalStates.every(s => isOver(game, s)), '全部客户端已终局（对局结束）');
    ok(finalLogic.every(x => x === finalLogic[0]), '终局双端/多端逻辑状态完全一致（落子同步收敛）');
    ok(convergeOk, '对局过程中状态始终保持收敛（无分叉）');
    if (game === 'gomoku') {
        // 关键断言：两方棋盘都含「黑白双方」的棋子 —— 即「互相看得到对方棋子」，直接对应本次 bug。
        const hasBoth = (S) => { let a = false, b = false; for (const row of S.board) for (const v of row) { if (v === 1) a = true; if (v === 2) b = true; } return a && b; };
        ok(finalStates.every(s => hasBoth(s)), '双方棋盘均含黑白两色棋子（互相看得到对方落子）');
        ok(finalStates.every(s => JSON.stringify(s.board) === JSON.stringify(finalStates[0].board)), '双方棋盘逐格完全一致（无「各下各的」）');
    }
    const wins = clients.map(c => c.onComplete.length ? !!c.onComplete[0].win : null);
    ok(clients.every(c => c.onComplete.length >= 1), `全部 ${cap} 人触发 onComplete（各 ${clients.map(c => c.onComplete.length).join('/')}）`);
    if (cap === 2) {
        // 零和胜负（甲胜乙负 / 乙胜甲负）或和棋（双方皆负）均合法；唯一非法是「双方皆胜」。
        ok(wins[0] !== null && wins[1] !== null && !(wins[0] && wins[1]), `结果一致（甲.win=${wins[0]} 乙.win=${wins[1]}，非双胜）`);
    } else {
        // 棋牌类 4 人局：胜负判定由同一终局状态推导，win 计数视规则而定（可能 0~多名胜出）。
        // 关键断言是「终局状态完全收敛」+「各端均产生胜负判定」，此处仅汇报计数。
        const nWin = wins.filter(w => w === true).length;
        ok(wins.every(w => w === true || w === false), `4 人局各端均产生胜负判定（win=${nWin}/${cap}）`);
    }
    // 关闭
    clients.forEach(c => { try { c.MG.pvp.end(); } catch (e) {} try { if (c.MG.net._ws) c.MG.net._ws.close(); } catch (e) {} });
    if (process.env.E2E_DEBUG) console.log('  [recv counts] ' + clients.map(c => c.nickname + '=' + (c._inCount || 0)).join(' '));
    await sleep(30); server.close();
    console.log(`  驱动步数=${steps} · PASS ${pass} / FAIL ${fail}`);
    return fail === 0;
}

// 掉线监测回归：模拟一名玩家掉线（主动 close / 断网无 FIN 两种手机场景），
// 验证服务端 ws-relay 能检测到并向其余玩家推送 peer_left（即「留在棋盘的人能察觉对手走了」）。
// 对应真实问题：手机浏览器锁屏/杀进程/进电梯/切 WiFi↔4G 时，对手是否还能被感知。
async function verifyDrop(game, cap) {
    console.log(`\n=== [${game}] 掉线监测回归（${cap} 人局，逐一关掉 1 人验证其余收到 peer_left）===`);
    const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    attach(server);
    const url = `ws://127.0.0.1:${port}/ws/minigame`;
    await sleep(50);
    const names = ['甲', '乙', '丙', '丁'];
    const mk = async (room) => {
        const cs = [];
        for (let i = 0; i < cap; i++) {
            const c = makeClient(game, i, names[i]);
            c.MG.me = { nickname: names[i] };
            c.MG.net.connect(url);
            c.MG.net.send('lobby', { game, cap });
            c.MG.net.send('join', { game, cap, room, me: names[i] });
            cs.push(c);
        }
        for (let t = 0; t < 120; t++) { await sleep(25); if (cs.every(c => c.started)) break; }
        return cs;
    };
    const reg = (cs) => { for (let i = 1; i < cap; i++) { cs[i]._peerLeft = 0; cs[i].MG.net.on('peer_left', () => { cs[i]._peerLeft = (cs[i]._peerLeft || 0) + 1; }); } };
    const waitPeerLeft = async (cs, ms) => { for (let t = 0; t < ms / 25; t++) { await sleep(25); if (cs.slice(1).every(c => c._peerLeft >= 1)) return true; } return false; };
    let pass = 0, fail = 0;
    const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

    // 场景 A：甲主动关 Tab（ws.close → 服务端 close 即时）
    const roomA = 'mg-dropA-' + game + '-' + process.pid + '-' + Date.now();
    const a = await mk(roomA);
    ok(a.every(c => c.started), `建房→进棋盘：✓ ${cap} 人`);
    reg(a);
    console.log('  [场景A] 甲主动 close（模拟关 Tab / 杀进程）');
    try { a[0].MG.net._ws.close(); } catch (e) {}
    const gotA = await waitPeerLeft(a, 5000);
    ok(gotA, `其余 ${cap - 1} 人秒级收到 peer_left（对手掉线被实时监测到）`);
    ok(a.slice(1).every(c => c._peerLeft === 1), '每位存活玩家恰好收到 1 次（无重复/漏发）');
    a.forEach(c => { try { c.MG.net._ws && c.MG.net._ws.close(); } catch (e) {} });

    // 场景 B：甲断网（_socket.destroy → 无 FIN 的异常断开，模拟切 WiFi/进电梯）
    const roomB = 'mg-dropB-' + game + '-' + process.pid + '-' + Date.now();
    const b = await mk(roomB);
    ok(b.every(c => c.started), `建房→进棋盘：✓ ${cap} 人`);
    reg(b);
    console.log('  [场景B] 甲 _socket.destroy（模拟断网/切网络，无优雅 close）');
    try { if (b[0].MG.net._ws && b[0].MG.net._ws._socket) b[0].MG.net._ws._socket.destroy(); } catch (e) {}
    const gotB = await waitPeerLeft(b, 8000);
    ok(gotB, `断网场景下其余 ${cap - 1} 人收到 peer_left（服务端 socket 异常→close→通知）`);
    b.forEach(c => { try { c.MG.net._ws && c.MG.net._ws.close(); } catch (e) {} });

    await sleep(30); server.close();
    console.log(`  掉线监测：PASS ${pass} / FAIL ${fail}`);
    return fail === 0;
}

(async () => {
    const args = process.argv.slice(2);
    const caps = { ludo: 2, gomoku: 2, monopoly: 4, richman: 4 };
    if (args[0] === 'drop') {
        const g = args[1] || 'gomoku';
        if (!caps[g]) { console.log('未知游戏：' + g); process.exit(1); }
        const ok = await verifyDrop(g, caps[g]);
        console.log(`\n==== 掉线监测：${ok ? '通过 ✅' : '失败 ❌'} ====`);
        process.exit(ok ? 0 : 1);
    }
    const games = args.length ? args : ['ludo', 'gomoku', 'monopoly', 'richman'];
    let allOk = true;
    for (const g of games) {
        if (!caps[g]) { console.log('未知游戏：' + g); continue; }
        const ok = await runGame(g, caps[g]);
        allOk = allOk && ok;
    }
    console.log(`\n==== 总计：${allOk ? '全部通过 ✅' : '存在失败 ❌'} ====`);
    process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
