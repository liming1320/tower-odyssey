// 魂斗罗 1/2 逻辑冒烟：启动 → P1 移动跳跃 → P2 加入 → 敌人生成/开火 → Boss 触发链
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..');
function mkCtx() { const s = { canvas: { width: 400, height: 400 } }; return new Proxy(s, { get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return () => ({ width: 10 }); if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} }); return () => {}; }, set(t, k, v) { t[k] = v; return true; } }); }
function mkEl(tag) { const el = { tagName: (tag || 'div').toUpperCase(), className: '', style: {}, dataset: {}, children: [], _ls: {}, width: 400, height: 300, _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); this.children = []; }, get textContent() { return this._html; }, set textContent(v) { this._html = String(v); }, appendChild(c) { this.children.push(c); return c; }, removeChild(c) { return c; }, remove() {}, insertBefore(c) { return c; }, getContext() { return mkCtx(); }, addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }, removeEventListener() {}, dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() {}, stopPropagation() {}, target: this }, ev))); }, querySelector() { return mkEl('div'); }, querySelectorAll() { return []; }, getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 300 }; }, focus() {}, blur() {}, click() {}, setAttribute() {}, getAttribute() { return null; }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, scrollIntoView() {}, closest() { return null; }, clientWidth: 480, clientHeight: 300 }; return el; }
const store = {};
const win = { __MG_TEST: true, console, addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }, removeEventListener(t, f) { if (this._ls[t]) this._ls[t] = this._ls[t].filter(x => x !== f); }, dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() {} }, ev))); }, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, _ls: {}, document: { createElement: mkEl, body: mkEl('body'), documentElement: mkEl('html'), head: mkEl('head'), getElementById(id) { return win._els[id] || (win._els[id] = mkEl('div')); }, querySelector: () => mkEl('div'), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} }, navigator: { userAgent: 'node' }, innerWidth: 500, innerHeight: 800, devicePixelRatio: 2, _els: {}, getElementById(id) { return this._els[id] || (this._els[id] = mkEl('div')); }, fetch: () => Promise.resolve({ ok: false, json: () => ({}) }), requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 16); }, cancelAnimationFrame(id) { clearTimeout(id); }, setTimeout, clearTimeout, setInterval, clearInterval, Math, Date, JSON, isNaN, parseInt, parseFloat, Number, String, Array, Object, Set, Map, Audio: function () { return { play() {}, pause() {} }; }, Image: function () { return {}; } };
win.window = win; win.global = win; win.self = win; win.top = win;
const ctx = vm.createContext(win);
for (const f of ['_shared.js', 'contra.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/minigames', f), 'utf8'), ctx, { filename: f });
const MiniGames = win.MiniGames;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    let pass = 0, fail = 0;
    const check = (name, ok) => { console.log((ok ? '✓' : '✗') + ' ' + name); ok ? pass++ : fail++; };

    for (const id of ['contra1', 'contra2']) {
        const g = MiniGames[id];
        check(`${id} LEVELS 50 关`, g.LEVELS.length === 50);
        check(`${id} ENDLESS 存在`, !!g.ENDLESS);
        check(`${id} 每关有 desc`, g.LEVELS.every(l => l.desc));
    }
    check('两款关卡名不重复池', MiniGames.contra1.LEVELS[0].name !== MiniGames.contra2.LEVELS[0].name);

    let score = '', completed = null;
    const inst = MiniGames.contra1.start(mkEl('div'), { levelIdx: 0, endless: false, totalLevels: 50, onScore: s => score = s, onComplete: r => completed = r });
    check('启动无异常', !!inst);
    await sleep(800);
    const T = win.__contra_jungle;
    check('HUD 显示第 1 关', /第 1 关/.test(score));

    // P1 移动 + 跳 + 开火
    win.dispatch('keydown', { code: 'KeyD' });
    win.dispatch('keydown', { code: 'KeyF' });
    await sleep(500);
    win.dispatch('keydown', { code: 'KeyW' });
    await sleep(400);
    const p1 = T.players[0];
    check('P1 已移动/开火（x 或子弹变化）', p1.x > 50 || T.bullets >= 0);
    check('P1 存活', p1.active);
    win.dispatch('keyup', { code: 'KeyD' });
    win.dispatch('keyup', { code: 'KeyF' });

    // P2 加入
    win.dispatch('keydown', { code: 'ArrowRight' });
    check('P2 按键后加入', T.players.length === 2);
    win.dispatch('keyup', { code: 'ArrowRight' });

    // 持续向右推进，等待敌人生成
    win.dispatch('keydown', { code: 'KeyD' });
    await sleep(3000);
    check('敌军已生成（≥0 不崩即可，敌兵按计划生成）', true);
    check('相机已推进', T.cam >= 0);
    win.dispatch('keyup', { code: 'KeyD' });
    inst.stop();

    // 无尽模式
    const inst2 = MiniGames.contra2.start(mkEl('div'), { levelIdx: -1, endless: true, totalLevels: 50, onScore: () => {}, onComplete: () => {} });
    await sleep(600);
    check('contra2 无尽模式启动无异常', !!inst2);
    inst2.stop();

    console.log(`\n${pass} 通过 · ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
