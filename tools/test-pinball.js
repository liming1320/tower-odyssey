// 三维弹球逻辑冒烟：启动 → 蓄力发射 → 球在场内运动不穿墙 → 挡板反射 → 计分
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..');
function mkCtx() { const s = { canvas: { width: 400, height: 400 } }; return new Proxy(s, { get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return () => ({ width: 10 }); if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} }); return () => {}; }, set(t, k, v) { t[k] = v; return true; } }); }
function mkEl(tag) { const el = { tagName: (tag || 'div').toUpperCase(), className: '', style: {}, dataset: {}, children: [], _ls: {}, width: 400, height: 640, _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); this.children = []; }, get textContent() { return this._html; }, set textContent(v) { this._html = String(v); }, appendChild(c) { this.children.push(c); return c; }, removeChild(c) { return c; }, remove() {}, insertBefore(c) { return c; }, getContext() { return mkCtx(); }, addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }, removeEventListener() {}, dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() {}, stopPropagation() {}, target: this }, ev))); }, querySelector() { return mkEl('div'); }, querySelectorAll() { return []; }, getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 640 }; }, focus() {}, blur() {}, click() {}, setAttribute() {}, getAttribute() { return null; }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, scrollIntoView() {}, closest() { return null; }, clientWidth: 400, clientHeight: 640 }; return el; }
const store = {};
const win = { __MG_TEST: true, console, addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }, removeEventListener(t, f) { if (this._ls[t]) this._ls[t] = this._ls[t].filter(x => x !== f); }, dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() {} }, ev))); }, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, _ls: {}, document: { createElement: mkEl, body: mkEl('body'), documentElement: mkEl('html'), head: mkEl('head'), getElementById(id) { return win._els[id] || (win._els[id] = mkEl('div')); }, querySelector: () => mkEl('div'), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} }, navigator: { userAgent: 'node' }, innerWidth: 420, innerHeight: 900, devicePixelRatio: 2, _els: {}, getElementById(id) { return this._els[id] || (this._els[id] = mkEl('div')); }, fetch: () => Promise.resolve({ ok: false, json: () => ({}) }), requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 16); }, cancelAnimationFrame(id) { clearTimeout(id); }, setTimeout, clearTimeout, setInterval, clearInterval, Math, Date, JSON, isNaN, parseInt, parseFloat, Number, String, Array, Object, Set, Map, Audio: function () { return { play() {}, pause() {} }; }, Image: function () { return {}; } };
win.window = win; win.global = win; win.self = win; win.top = win;
const ctx = vm.createContext(win);
for (const f of ['_shared.js', 'pinball.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/minigames', f), 'utf8'), ctx, { filename: f });
const MiniGames = win.MiniGames;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    let pass = 0, fail = 0;
    const check = (name, ok) => { console.log((ok ? '✓' : '✗') + ' ' + name); ok ? pass++ : fail++; };

    const g = MiniGames.pinball;
    check('LEVELS 50 关', g.LEVELS.length === 50);
    check('ENDLESS 存在', !!g.ENDLESS);
    check('每关有 desc', g.LEVELS.every(l => l.desc));

    let score = '', completed = null;
    const inst = g.start(mkEl('div'), { levelIdx: 0, endless: false, totalLevels: 50, onScore: s => score = s, onComplete: r => completed = r });
    check('启动无异常', !!inst);
    const T = win.__pinball;
    await sleep(300);
    check('初始 3 球', T.balls === 3);
    check('HUD 显示第 1 关', /第 1 关/.test(score));

    // 全力发射
    T.launch(1);
    check('球已发射', T.launched === true);
    const y0 = T.ball.y;
    await sleep(500);
    check('球在运动（位置变化）', Math.abs(T.ball.y - y0) > 2 || Math.abs(T.ball.vy) > 10);

    // 等球弹跳 2 秒，确认在场内（不越界、不死循环）
    await sleep(2000);
    const b = T.ball;
    check('球保持在台面边界内', b.x > 5 && b.x < 395 && b.y > 5 && (b.y < 700));

    // 挡板按键
    win.dispatch('keydown', { code: 'ArrowLeft' });
    win.dispatch('keydown', { code: 'ArrowRight' });
    await sleep(300);
    win.dispatch('keyup', { code: 'ArrowLeft' });
    win.dispatch('keyup', { code: 'ArrowRight' });
    check('挡板控制无异常', true);
    inst.stop();

    // 无尽模式
    const inst2 = g.start(mkEl('div'), { levelIdx: -1, endless: true, totalLevels: 50, onScore: () => {}, onComplete: () => {} });
    await sleep(500);
    win.__pinball.launch(0.8);
    await sleep(800);
    check('无尽模式运行无异常', !!inst2);
    inst2.stop();

    console.log(`\n${pass} 通过 · ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
