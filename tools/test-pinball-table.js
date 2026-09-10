// 三维弹球「台面复刻」冒烟：左侧 3 引擎 / 左上涡轮虫洞 / 左侧火箭管道 / 翻牌 ×3 / 右侧落下靶
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..');
function mkCtx() { const s = { canvas: { width: 400, height: 400 } }; return new Proxy(s, { get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return () => ({ width: 10 }); if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() { } }); return () => { }; }, set(t, k, v) { t[k] = v; return true; } }); }
function mkEl(tag) { const el = { tagName: (tag || 'div').toUpperCase(), className: '', style: {}, dataset: {}, children: [], _ls: {}, width: 400, height: 640, _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); this.children = []; }, get textContent() { return this._html; }, set textContent(v) { this._html = String(v); }, appendChild(c) { this.children.push(c); return c; }, removeChild(c) { return c; }, remove() { }, insertBefore(c) { return c; }, getContext() { return mkCtx(); }, addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }, removeEventListener() { }, dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() { }, stopPropagation() { }, target: this }, ev))); }, querySelector() { return mkEl('div'); }, querySelectorAll() { return []; }, getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 640 }; }, focus() { }, blur() { }, click() { }, setAttribute() { }, getAttribute() { return null; }, classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } }, scrollIntoView() { }, closest() { return null; }, clientWidth: 400, clientHeight: 640 }; return el; }
const store = {};
const win = { __MG_TEST: true, console, addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }, removeEventListener(t, f) { if (this._ls[t]) this._ls[t] = this._ls[t].filter(x => x !== f); }, dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() { } }, ev))); }, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, _ls: {}, document: { createElement: mkEl, body: mkEl('body'), documentElement: mkEl('html'), head: mkEl('head'), getElementById(id) { return win._els[id] || (win._els[id] = mkEl('div')); }, querySelector: () => mkEl('div'), querySelectorAll: () => [], addEventListener() { }, removeEventListener() { } }, navigator: { userAgent: 'node' }, innerWidth: 420, innerHeight: 900, devicePixelRatio: 2, _els: {}, getElementById(id) { return this._els[id] || (this._els[id] = mkEl('div')); }, fetch: () => Promise.resolve({ ok: false, json: () => ({ }) }), requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 16); }, cancelAnimationFrame(id) { clearTimeout(id); }, setTimeout, clearTimeout, setInterval, clearInterval, Math, Date, JSON, isNaN, parseInt, parseFloat, Number, String, Array, Object, Set, Map, Audio: function () { return { play() { }, pause() { } }; }, Image: function () { return { }; } };
win.window = win; win.global = win; win.self = win; win.top = win;
const ctx = vm.createContext(win);
for (const f of ['_shared.js', 'pinball.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/minigames', f), 'utf8'), ctx, { filename: f });
const MiniGames = win.MiniGames;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    let pass = 0, fail = 0;
    const check = (name, ok, extra) => { console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  → ' + extra : '')); ok ? pass++ : fail++; };

    const g = MiniGames.pinball;
    let score = '';
    const inst = g.start(mkEl('div'), { levelIdx: 0, endless: true, totalLevels: 50, onScore: s => score = s, onComplete: () => { } });
    const T = win.__pinball;
    await sleep(200);
    T.launch(0.5);                       // 先发射，进入物理模式
    await sleep(700);

    /* ── 1. 左侧涡轮引擎（3 只）── */
    let s0 = T.score;
    T.putBallAt(76, 344 - 60, 0, 700);   // 砸向左侧第 2 只引擎
    await sleep(320);
    check('左侧引擎命中得分', T.score > s0, `+${T.score - s0}`);
    s0 = T.score;
    T.putBallAt(76, 396 - 60, 0, 700);   // 第 3 只
    await sleep(320);
    check('左侧 3 只引擎均可命中', T.score > s0, `+${T.score - s0}`);

    /* ── 2. 左上角涡轮虫洞 → 左侧火箭管道 ── */
    T.putBallAt(102, 212, 0, 0);
    await sleep(80);
    check('球进入虫洞即被吸入', T.warpHold > 0, 'warpHold=' + T.warpHold.toFixed(2));
    await sleep(900);
    check('吸入后进入火箭管道（railMode=2）', T.railMode === 2, 'railMode=' + T.railMode);
    await sleep(700);
    const b = T.ball;
    check('从左上出口喷回台面（回到上半场）', b.y < 340, `ball=(${b.x.toFixed(0)},${b.y.toFixed(0)})`);

    /* ── 3. 翻牌 ×3 ── */
    check('翻牌初始全为背面', T.cards.join() === '0,0,0', T.cards.join());
    T.putBallAt(140, 392, 0, 30);
    await sleep(200);
    check('第 1 张翻牌翻转', T.cards[0] === 1, T.cards.join());
    T.putBallAt(176, 392, 0, 30);
    await sleep(200);
    T.putBallAt(212, 392, 0, 30);
    await sleep(250);
    check('3 张翻牌全部翻开', T.cards.join() === '1,1,1', T.cards.join());
    check('集齐后开启多球', T.liveCount >= 2, 'liveCount=' + T.liveCount);
    T.putBallAt(374, 300, 0, 0);          // 把球挪出卡片区，避免滚动中又翻牌
    await sleep(1400);
    check('大奖后翻牌自动翻回背面', T.cards.join() === '0,0,0', T.cards.join());

    /* ── 4. 右侧落下靶 ── */
    let s1 = T.score;
    T.putBallAt(240, 346, 620, 0);
    await sleep(220);
    check('右侧落下靶可击落', T.score > s1, `+${T.score - s1}`);

    /* ── 5. warp() 手动接口 ── */
    T.putBallAt(200, 300, 0, 0);
    await sleep(40);
    check('warp() 手动触发可用', T.warp() === true);
    await sleep(1600);

    /* ── 6. 稳定性 ── */
    await sleep(2500);
    const bb = T.ball;
    check('长时间运行球不出界', bb.x > 5 && bb.x < 400 && bb.y > 5 && bb.y < 700,
        `ball=(${bb.x.toFixed(0)},${bb.y.toFixed(0)})`);
    check('HUD 正常更新', /分/.test(score), score.slice(0, 40));

    inst.stop();
    console.log(`\n${pass} 通过 · ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
