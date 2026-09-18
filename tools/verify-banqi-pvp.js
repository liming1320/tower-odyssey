// verify-banqi-pvp.js —— 暗棋联机同步逻辑回归测试（无需浏览器）
// 双客户端 + 最小化 DOM 桩 + 内存 relay，跑通真实 banqi.js 的 PvP 代码路径：
//   1) 种子洗牌：双方初始棋盘完全一致（piece id / 种类 / 阵营 / 朝向）
//   2) 翻棋同步：A 翻一枚暗子 → B 收到 setState 后该格翻面且同一个棋子 id
//   3) 终局传播：A 调用 finish(true) → 双方 onComplete 结果相反（A 胜 / B 负）
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const NODE = process.execPath;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'minigames', 'banqi.js'), 'utf8');

// ---------- DOM 桩 ----------
function makeEl(tag) {
    const el = {
        tag, children: [], dataset: {}, _cls: new Set(), _placed: false,
        style: new Proxy({}, { get(t, k) { return k === 'setProperty' ? (kk, v) => { t[kk] = v; } : t[k]; }, set(t, k, v) { t[k] = v; return true; } }),
        innerHTML: '', textContent: '', onclick: null, parentNode: null,
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 300 }; },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        classList: {
            add(...c) { c.forEach(x => el._cls.add(x)); },
            remove(...c) { c.forEach(x => el._cls.delete(x)); },
            toggle(x, f) { if (f === undefined) f = !el._cls.has(x); f ? el._cls.add(x) : el._cls.delete(x); return f; },
            contains(x) { return el._cls.has(x); },
        },
    };
    let cn = '';
    Object.defineProperty(el, 'className', { get() { return cn; }, set(v) { cn = v; (v || '').split(/\s+/).forEach(c => c && el._cls.add(c)); } });
    return el;
}
const document = {
    createElement: tag => makeEl(tag),
    getElementById: () => makeEl('div'),
};

// ---------- 引擎工具桩（与线上实现一致）----------
function makeRng(seed) {
    let s = (Number(seed) || 0) >>> 0; if (!s) s = 0x9e3779b9;
    const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    r.shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    return r;
}
const MG_base = {
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
    makeSeed(str) { let h = 2166136261 >>> 0; str = String(str); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
    makeRng, pick: a => a[Math.floor(Math.random() * a.length)],
    ri: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    audio: { unlock() {}, sfx() {} },
    levelSelect() {}, rps() {}, result() {}, recordStars() {}, getBest() { return 0; }, setBest() {},
};

// ---------- 极简 pvp（复刻 mg-pvp.js 行为）----------
function makePvp(net) {
    let armed = null, adapter = null, active = false, side = 0, turn = 0;
    return {
        get active() { return active; }, get side() { return side; },
        arm(game, sd, opp) { armed = { game, side: sd || 0, opp: opp || null }; },
        shouldBegin(g) { return !!(armed && armed.game === g); },
        begin(ad) { if (!armed) return false; active = true; side = armed.side; turn = 0; adapter = ad || null; const self = this; net.on('input', function (m) { self._recv(m || {}); }); return true; },
        canMove() { return !active || turn === side; },
        commit(state) { if (!active) return; turn = state && state.turn != null ? state.turn : (1 - side); try { net.send('input', state); } catch (e) {} },
        _recv(m) { if (!active || !m) return; if (m.turn != null) turn = m.turn; try { if (adapter && adapter.setState) adapter.setState(m); } catch (e) { console.log('setState err', e.message); } if (m.over != null && adapter && adapter.onOver) { try { adapter.onOver(m.over); } catch (e) {} } },
        end() { active = false; adapter = null; armed = null; turn = 0; },
    };
}

function makeClient(side) {
    const ctx = {};
    ctx.window = ctx;
    ctx.document = document;
    ctx.console = console;
    ctx.setTimeout = setTimeout;
    ctx.clearTimeout = clearTimeout;
    const MG = Object.assign({}, MG_base);
    const net = { _h: {}, _room: 'TESTROOM', peer: null, on(e, cb) { (this._h[e] || (this._h[e] = [])).push(cb); }, send(e, p) { if (this.peer) (this.peer._h[e] || []).forEach(cb => cb(p)); } };
    const pvp = makePvp(net);
    Object.defineProperty(MG, 'pvp', { get: () => pvp });
    Object.defineProperty(MG, 'net', { get: () => net });
    ctx.MG = MG;
    ctx.window.MG = MG;
    ctx.window.__MG_TEST = true;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return { ctx, MG, pvp, net };
}

(async () => {
    const A = makeClient(0);
    const B = makeClient(1);
    A.net.peer = B.net; B.net.peer = A.net;

    const onCompleteA = [], onCompleteB = [];
    const spyA = r => { console.log('   >> A onComplete', JSON.stringify({ win: r && r.win, title: r && r.title, lines: r && r.lines })); onCompleteA.push(r); };
    const spyB = r => { console.log('   >> B onComplete', JSON.stringify({ win: r && r.win, title: r && r.title, lines: r && r.lines })); onCompleteB.push(r); };
    const containerA = makeEl('div'), containerB = makeEl('div');

    A.pvp.arm('banqi', 0, 'peerB');
    B.pvp.arm('banqi', 1, 'peerA');

    // 启动两局（net 模式）
    A.ctx.window.MiniGames.banqi.start(containerA, { onScore() {}, onComplete: spyA });
    B.ctx.window.MiniGames.banqi.start(containerB, { onScore() {}, onComplete: spyB });

    await sleep(50);
    const ba = A.ctx.window.__banqi, bb = B.ctx.window.__banqi;
    console.log('   [post-start] A.over=', ba.over, 'B.over=', bb.over, 'A.turn=', ba.turn, 'B.turn=', bb.turn);
    const boardA = ba.board.map(r => r.map(p => p ? { id: p.id, n: p.n, r: p.r, color: p.color, faceUp: p.faceUp } : null));
    const boardB = bb.board.map(r => r.map(p => p ? { id: p.id, n: p.n, r: p.r, color: p.color, faceUp: p.faceUp } : null));

    let pass = 0, fail = 0;
    const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

    console.log('[1] 种子洗牌：双方初始棋盘一致');
    ok(JSON.stringify(boardA) === JSON.stringify(boardB), 'A/B 初始棋盘（id/种类/阵营/朝向）完全相同');

    console.log('[2] 翻棋同步：A 翻 (0,0) → B 收到后该格翻面且同一 id');
    const id00 = boardA[0][0].id;
    ba.tap(0, 0);
    await sleep(450); // 等翻牌动画 + commit + setState
    const bAfter = bb.board[0][0];
    ok(bAfter && bAfter.faceUp === true, 'B 的 (0,0) 已翻面');
    ok(bAfter && bAfter.id === id00, 'B 的 (0,0) 仍是同一棋子 id（elMap 重链正确）');
    ok(bb.turn === 2, 'B 的 turn 切到我方(2)可走');

    console.log('[3] 反向同步：B 翻 (0,1) → A 收到');
    const id01 = boardA[0][1].id;
    bb.tap(0, 1);
    await sleep(450);
    const aAfter = ba.board[0][1];
    ok(aAfter && aAfter.faceUp === true, 'A 的 (0,1) 已翻面');
    ok(aAfter && aAfter.id === id01, 'A 的 (0,1) 同一棋子 id');

    console.log('[4] 终局传播：A 直接 finish(true) → 双方结果相反');
    ba.finish(true, '测试终局');
    await sleep(50);
    ok(onCompleteA.length === 1 && onCompleteA[0].win === true, 'A onComplete 收到 win=true');
    ok(onCompleteB.length === 1 && onCompleteB[0].win === false, 'B 收到对手终局，win=false');
    ok(ba.over === true && bb.over === true, '双方 over 标记均为 true');

    console.log('[5] 终局后锁输入：A/B 再 tap 不应改变棋盘');
    const stripEl = p => p ? { id: p.id, n: p.n, r: p.r, color: p.color, faceUp: p.faceUp } : null;
    const before = JSON.stringify(bb.board[1][1] && stripEl(bb.board[1][1]));
    ba.tap(1, 1); bb.tap(1, 1);
    await sleep(50);
    ok(JSON.stringify(bb.board[1][1] && stripEl(bb.board[1][1])) === before, 'over 后 tap 被忽略');

    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
