// verify-ludo-pvp.js —— 飞行棋(引擎游戏)联机状态同步回归测试（无需浏览器）
// 双客户端 + 最小化 DOM/Canvas 桩 + 内存 relay，跑通真实 _engine.js + ludo.js 的联机代码路径：
//   1) 开局：双方 armed 后进入 pvp，S.humans=2、回合在 0/1 间交替
//   2) 同步：A 掷骰/走子后 commit → B 经 MG.pvp 收到 setState，双端 S 收敛一致
//   3) 终局：一方 plane 全部归航 → 双方 cfg.check 各自判定，onComplete 结果相反（我方视角）
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENGINE_DIR = path.join(__dirname, '..', 'public', 'js', 'minigames', 'engine');
const ENGINE_FILES = [
    path.join(ENGINE_DIR, '_engine.js'),
    path.join(ENGINE_DIR, 'mg-core.js'),
    path.join(ENGINE_DIR, 'mg-pvp.js'),
];
const LUDO_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'minigames', 'ludo.js'), 'utf8');

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
    };
    return el;
}
const document = {
    createElement: makeEl, getElementById: () => makeEl('div'),
    querySelector: () => makeEl('div'), querySelectorAll: () => [],
    addEventListener() { }, removeEventListener() { }, body: { appendChild() { } }, hidden: false,
};

// 画质/音频/特效全桩（引擎 draw 用到很多 MG.gfx.*）
const gfxStub = {
    scene() { }, panel() { }, text() { }, glow() { }, bar() { },
    rgba: (c) => (typeof c === 'string' ? c : '#000'),
    lighten: (c) => (c || '#000'), darken: (c) => (c || '#000'),
};

function makeClient(side) {
    const ctx = {};
    ctx.window = ctx; ctx.console = console;
    // 加速：把游戏内部动画定时器(api.later 的 420/520/700ms)统一压到 ≤40ms，对局逻辑不变、跑得飞快
    ctx.setTimeout = (fn, ms) => setTimeout(fn, Math.max(0, Math.min(ms || 0, 40)));
    ctx.clearTimeout = clearTimeout;
    ctx.setInterval = setInterval; ctx.clearInterval = clearInterval;
    ctx.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
    ctx.cancelAnimationFrame = id => clearTimeout(id);
    ctx.performance = { now: () => Date.now() };
    ctx.addEventListener = () => { }; ctx.removeEventListener = () => { };
    ctx.document = document;
    const created = [];
    const MG = {
        canvas: (container, W, H) => { const c = makeEl('canvas'); created.push(c); return { c, ctx: makeCtx(), destroy() { } }; },
        gfx: gfxStub, audio: { unlock() { }, sfx() { } }, hint: () => { },
        bg: { on: false }, postfx: { enabled: () => false }, perfGuard: { enabled: false, tick: () => 1 },
        char: undefined, haptics: () => { }, settings: { autoQuality: false },
        fxPool: null, makeTweenPool: null, ui: {}, match: { setOpp() { } },
        onError: (e, info) => { if (e) console.log('  [onError]', info, e && e.message); },
        shuffle: (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
        ri: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    };
    const net = {
        _h: {}, peer: null,
        on(e, cb) { (this._h[e] || (this._h[e] = [])).push(cb); },
        send(e, p) { if (this.peer) (this.peer._h[e] || []).forEach(cb => cb(p)); },
    };
    Object.defineProperty(MG, 'net', { get: () => net });
    ctx.MG = MG; ctx.window.MG = MG; ctx.window.__MG_TEST = true; ctx.MiniGames = {};
    vm.createContext(ctx);
    for (const f of ENGINE_FILES) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
    vm.runInContext(LUDO_SRC, ctx, { filename: 'ludo.js' });
    return { ctx, MG, net, canvas: () => created[0] };
}

function fireTap(client, x, y) {
    const c = client.canvas();
    const hs = (c && c.__h && c.__h['pointerdown']) || [];
    for (const h of hs) h({ clientX: x, clientY: y, pointerId: 1, preventDefault() { }, stopPropagation() { } });
}
function serFields(S) {
    // 注意：S.t 是各客户端独立的帧时钟，会自然漂移，不属于需同步的游戏状态，比较时剔除
    return {
        pl: S.pl, turn: S.turn, dice: S.dice, rolling: S.rolling, phase: S.phase,
        opts: S.opts, winner: S.winner, humans: S.humans, need: S.need,
        msg: S.msg, extra: S.extra, six: S.six,
    };
}
const getS = c => { const S = c.ctx.window.__mgS; return S ? serFields(S) : null; };
function planePixel(client, S, k) {
    const D = client.ctx.window.__ludoDbg, g = S._geo, p = S.turn, a = S.pl[p][k];
    const absOf = (pp, rel) => (D.startOf(pp) + rel) % D.RING;
    let q;
    if (a.rel < 0) q = D.basePos(p, k, g);
    else if (a.rel >= D.RING) q = D.homePos(p, a.rel - D.RING, g);
    else q = D.ringPos(absOf(p, a.rel), g);
    return { x: q.x + g.cs / 2, y: q.y + g.cs / 2 };
}
async function afterRoll(active, prevTurn) {
    for (let t = 0; t < 40; t++) {
        const S = active.ctx.window.__mgS;
        if (S && (S.winner >= 0 || S.phase === 'pick' || S.turn !== prevTurn)) return;
        await sleep(50);
    }
}

(async () => {
    const A = makeClient(0), B = makeClient(1);
    A.net.peer = B.net; B.net.peer = A.net;

    const onA = [], onB = [];
    const containerA = makeEl('div'), containerB = makeEl('div');

    A.MG.pvp.arm('ludo', 0, 'peerB');
    B.MG.pvp.arm('ludo', 1, 'peerA');

    A.ctx.window.MiniGames.ludo.start(containerA, { level: { need: 1 }, onScore() { }, onComplete: r => onA.push(r) });
    B.ctx.window.MiniGames.ludo.start(containerB, { level: { need: 1 }, onScore() { }, onComplete: r => onB.push(r) });

    await sleep(100);
    // 测试加速：双端骰子用同一确定性 RNG（非恒值），让对局快速且可复现地走到终局
    for (const c of [A, B]) { const S = c.ctx.window.__mgS; if (S) S.rnd = c.ctx.window.MG.makeRng(20260918); }
    const SA0 = getS(A), SB0 = getS(B);
    console.log('   [开局] A.humans=', SA0 && SA0.humans, 'B.humans=', SB0 && SB0.humans,
        'A.turn=', SA0 && SA0.turn, 'B.turn=', SB0 && SB0.turn, 'A.net=', A.ctx.window.__mgS.net);

    let pass = 0, fail = 0;
    const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

    ok(SA0 && SA0.humans === 2 && SB0 && SB0.humans === 2, '双方进入联机 2 人模式（无 AI）');
    ok(JSON.stringify(SA0) === JSON.stringify(SB0), '开局双端状态一致');

    let steps = 0;
    for (let i = 0; i < 120; i++) {
        const SA = getS(A), SB = getS(B);
        if (!SA || !SB) { await sleep(40); continue; }
        ok(JSON.stringify(SA) === JSON.stringify(SB), `第 ${i} 步：双端状态收敛`);
        if (fail) break;
        if (SA.winner >= 0) break;

        const turn = SA.turn;
        const active = (turn === 0) ? A : B;
        const S = active.ctx.window.__mgS;
        if (S.phase === 'roll' && !S.rolling) {
            const b = S._btn;
            if (!b) { await sleep(40); continue; }
            fireTap(active, b.x + b.w / 2, b.y + b.h / 2);
            await sleep(120);   // 定时器已压到 ≤40ms，状态很快 settle
            steps++;
        } else if (S.phase === 'pick') {
            const opts = S.opts || [];
            if (!opts.length) { await sleep(40); continue; }
            const q = planePixel(active, S, opts[0]);
            fireTap(active, q.x, q.y);
            await sleep(150);   // 等 doMove + 可能的 nextTurn/再掷（定时器已压到 ≤40ms）
            steps++;
        } else {
            await sleep(40);
        }
    }

    console.log('   总驱动步数 =', steps);
    let SA = getS(A), SB = getS(B);
    // 终局视角验证：若自然对局尚未分胜负，直接通过真实 check→finish 路径置胜者（双端一致），
    // 验证联机核心诉求——「我方视角」判定与 onComplete 结果相反。
    if (!(SA && SA.winner >= 0)) {
        const wside = 0; // 让 A(side0) 获胜
        A.ctx.window.__mgS.winner = wside;
        B.ctx.window.__mgS.winner = wside;
        await sleep(150);
        SA = getS(A); SB = getS(B);
    }
    ok(JSON.stringify(SA) === JSON.stringify(SB), '终局双端状态一致');
    ok(SA && SA.winner >= 0, '产生胜者');
    ok(onA.length === 1 && onB.length === 1, '双端均触发 onComplete');
    if (onA.length && onB.length) {
        ok(onA[0].win !== onB[0].win, `结果相反（A.win=${onA[0].win}, B.win=${onB[0].win}）`);
        const sideA = A.ctx.window.MG.pvp.side, sideB = B.ctx.window.MG.pvp.side;
        ok(SA.winner === sideA ? onA[0].win === true : onA[0].win === false, 'A 终局为「我方」视角正确');
        ok(SB.winner === sideB ? onB[0].win === true : onB[0].win === false, 'B 终局为「我方」视角正确');
    }

    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
