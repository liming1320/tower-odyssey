// 三维弹球 任务系统 / 军衔晋升 / 多球 冒烟测试（纯 Node mock 环境，无需浏览器）
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

const sleep2 = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    let pass = 0, fail = 0;
    const check = (name, ok, extra) => {
        console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  → ' + extra : ''));
        ok ? pass++ : fail++;
    };

    const g = MiniGames.pinball;
    let score = '', completed = null;
    const inst = g.start(mkEl('div'), {
        levelIdx: 0, endless: false, totalLevels: 50,
        onScore: s => score = s, onComplete: r => completed = r,
    });
    const T = win.__pinball;
    await sleep2(300);

    /* ── 1. 任务系统 ── */
    check('初始任务 = 基础训练', T.mission.name === '基础训练', JSON.stringify(T.mission));
    check('初始军衔 = 学员', T.mission.rank === '学员');
    check('初始为单球', T.liveCount === 1);

    // 与当前任务无关的事件不应推进
    T.missionHit('ramp', 3);
    check('无关事件不推进任务', T.mission.prog === 0 && T.mission.name === '基础训练', 'prog=' + T.mission.prog);

    // 未完成量不推进
    T.missionHit('bumper', 3);
    check('未达标不完成', T.mission.name === '基础训练' && T.mission.prog === 3, 'prog=' + T.mission.prog);

    // 达标 → 完成并晋升
    T.missionHit('bumper', 3);
    check('达标后推进到下一任务', T.mission.name === '引擎试车', JSON.stringify(T.mission));
    check('军衔晋升为少尉', T.mission.rank === '少尉');

    /* ── 2. 多球 ── */
    T.startMultiball(2);
    check('多球开启后 3 颗球', T.liveCount === 3, 'liveCount=' + T.liveCount);

    T.launch(1);
    await sleep2(1600);
    check('多球物理运行无异常', T.liveCount >= 1, 'liveCount=' + T.liveCount);
    check('多球期间正常计分', T.score > 0, 'score=' + T.score);

    /* ── 3. 后续任务与军衔 ── */
    T.missionHit('jet', 8);
    check('第二任务完成 → 中尉', T.mission.rank === '中尉' && T.mission.name === '轨道练习', JSON.stringify(T.mission));

    T.missionHit('ramp', 3);
    check('第三任务完成（轨道练习）', T.mission.name === '目标练习', JSON.stringify(T.mission));

    T.missionHit('target', 5);
    check('第四任务完成自动开多球', T.mission.name === '旋转突击', JSON.stringify(T.mission));

    /* ── 4. 长时间运行稳定性 ── */
    await sleep2(2000);
    check('持续运行 3.6s 无崩溃', true);
    check('HUD 仍在更新', /分/.test(score), score.slice(0, 46));

    /* ── 5. 结算信息含军衔 ── */
    T.finish(true);
    check('结算含军衔行', completed && completed.lines.some(l => /军衔/.test(l)),
        completed ? completed.lines.filter(l => /军衔|多球/.test(l)).join(' | ') : 'no result');

    inst.stop();
    console.log(`\n${pass} 通过 · ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
