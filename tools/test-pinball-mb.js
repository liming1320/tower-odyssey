// 三维弹球「防球海」回归：多球封顶 / 自动触发冷却 / 新球保护期
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..');
function mkCtx() { const s = { canvas: { width: 400, height: 400 } }; return new Proxy(s, { get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return () => ({ width: 10 }); if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() { } }); return () => { }; }, set(t, k, v) { t[k] = v; return true; } }); }
function mkEl(tag) { const el = { tagName: (tag || 'div').toUpperCase(), className: '', style: {}, dataset: {}, children: [], _ls: {}, width: 400, height: 640, _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); this.children = []; }, get textContent() { return this._html; }, set textContent(v) { this._html = String(v); }, appendChild(c) { this.children.push(c); return c; }, removeChild(c) { return c; }, remove() { }, insertBefore(c) { return c; }, getContext() { return mkCtx(); }, addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }, removeEventListener() { }, dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() { }, stopPropagation() { }, target: this }, ev))); }, querySelector() { return mkEl('div'); }, querySelectorAll() { return []; }, getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 640 }; }, focus() { }, blur() { }, click() { }, setAttribute() { }, getAttribute() { return null; }, classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } }, scrollIntoView() { }, closest() { return null; }, clientWidth: 400, clientHeight: 640 }; return el; }
const store = {};
const win = { __MG_TEST: true, console, addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }, removeEventListener(t, f) { if (this._ls[t]) this._ls[t] = this._ls[t].filter(x => x !== f); }, dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() { } }, ev))); }, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, _ls: {}, document: { createElement: mkEl, body: mkEl('body'), documentElement: mkEl('html'), head: mkEl('head'), getElementById(id) { return win._els[id] || (win._els[id] = mkEl('div')); }, querySelector: () => mkEl('div'), querySelectorAll: () => [], addEventListener() { } }, navigator: { userAgent: 'node' }, innerWidth: 420, innerHeight: 900, devicePixelRatio: 2, _els: {}, getElementById(id) { return this._els[id] || (this._els[id] = mkEl('div')); }, fetch: () => Promise.resolve({ ok: false, json: () => ({ }) }), requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 16); }, cancelAnimationFrame(id) { clearTimeout(id); }, setTimeout, clearTimeout, setInterval, clearInterval, Math, Date, JSON, isNaN, parseInt, parseFloat, Number, String, Array, Object, Set, Map, Audio: function () { return { play() { }, pause() { } }; }, Image: function () { return { }; } };
win.window = win; win.global = win; win.self = win; win.top = win;
const ctx = vm.createContext(win);
for (const f of ['_shared.js', 'pinball.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/minigames', f), 'utf8'), ctx, { filename: f });
const MiniGames = win.MiniGames;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    let pass = 0, fail = 0;
    const check = (name, ok, extra) => { console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  → ' + extra : '')); ok ? pass++ : fail++; };

    const g = MiniGames.pinball;
    const inst = g.start(mkEl('div'), { levelIdx: 0, endless: true, totalLevels: 50, onScore: () => { }, onComplete: () => { } });
    const T = win.__pinball;
    await sleep(200);

    /* ── 1. 前三个任务无多球 ── */
    T.missionHit('bumper', 6);
    T.missionHit('jet', 8);
    T.missionHit('ramp', 3);
    check('推进到第 4 任务（目标练习）', T.mission.name === '目标练习', JSON.stringify(T.mission));
    check('仍为单球', T.liveCount === 1, 'liveCount=' + T.liveCount);

    /* ── 2. 自动多球（mb:2）── */
    T.missionHit('target', 5);
    check('目标练习完成自动开 2 球', T.liveCount === 3, 'liveCount=' + T.liveCount);

    /* ── 3. 冷却期内的后续 mb 任务不再叠球 ── */
    T.missionHit('spin', 6);
    T.missionHit('lane', 4);
    check('推进到徽章收集任务', T.mission.name === '徽章收集', JSON.stringify(T.mission));
    T.missionHit('card', 6);              // mb:3 —— 但冷却期内，应被拦截
    check('冷却期内多球不叠加', T.liveCount === 3, 'liveCount=' + T.liveCount);
    check('任务本身仍正常推进', T.mission.name === '虫洞跳跃', JSON.stringify(T.mission));

    /* ── 4. 球数封顶（直连绕过冷却也最多 4 颗）── */
    T.startMultiball(2);
    check('封顶：最多补到 4 颗', T.liveCount === 4, 'liveCount=' + T.liveCount);
    T.startMultiball(2);
    check('已封顶时不再加球', T.liveCount === 4, 'liveCount=' + T.liveCount);

    /* ── 5. 物理照常运行 ── */
    await sleep(1200);
    check('多球物理运行无异常', T.liveCount >= 1 && T.liveCount <= 4, 'liveCount=' + T.liveCount);
    check('计分正常', T.score > 0, 'score=' + T.score);

    inst.stop();
    console.log(`\n${pass} 通过 · ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
