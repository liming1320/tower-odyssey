// 103 款小游戏全量体检：静态检查 + 无头运行时冒烟
// 输出：每款游戏的关卡数 / 参数完整性 / 启动异常 / 交互异常
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const say = s => fs.writeSync(1, s + '\n');
const ROOT = path.join(__dirname, '..');

// ---------------- DOM stub ----------------
let rafBudget = 0;
function mkCtx() {
    const store = { canvas: { width: 400, height: 400 } };
    return new Proxy(store, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'measureText') return () => ({ width: 10 });
            if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
            if (k === 'getImageData') return () => ({ data: new Uint8Array(4) });
            if (k === 'createImageData') return () => ({ data: new Uint8Array(4) });
            return () => {};
        },
        set(t, k, v) { t[k] = v; return true; },
    });
}
function mkEl(tag) {
    const el = {
        tagName: (tag || 'div').toUpperCase(), className: '', id: '', style: {}, dataset: {},
        children: [], _ls: {}, parentNode: null,
        width: 400, height: 400, value: '', checked: false, disabled: false,
        _html: '',
        get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = String(v); this.children = []; },
        get textContent() { return this._html; },
        set textContent(v) { this._html = String(v); },
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        removeChild(c) { return c; },
        remove() {}, insertBefore(c) { return c; },
        getContext() { return mkCtx(); },
        addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); },
        removeEventListener(t, f) { if (this._ls[t]) this._ls[t] = this._ls[t].filter(x => x !== f); },
        dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() {}, stopPropagation() {}, target: this }, ev))); },
        querySelector() { return mkEl('div'); },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 }; },
        focus() {}, blur() {}, click() { this.dispatch('click', {}); },
        setAttribute() {}, getAttribute() { return null; }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        scrollIntoView() {}, closest() { return null; },
        clientWidth: 400, clientHeight: 400, offsetWidth: 400, offsetHeight: 400,
    };
    return el;
}
const store = {};
const win = {
    __MG_TEST: true,                 // 让引擎内部异常抛出，便于捕获
    __MG_FAST: 1,
    console,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    _ls: {},
    addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); },
    removeEventListener(t, f) { if (this._ls[t]) this._ls[t] = this._ls[t].filter(x => x !== f); },
    dispatch(type, ev) { (this._ls[type] || []).forEach(f => f(Object.assign({ preventDefault() {} }, ev))); },
    document: {
        createElement: mkEl, body: mkEl('body'), documentElement: mkEl('html'), head: mkEl('head'),
        getElementById(id) { return win._els[id] || (win._els[id] = mkEl('div')); }, querySelector: () => mkEl('div'), querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {},
    },
    navigator: { userAgent: 'node' },
    innerWidth: 400, innerHeight: 800, devicePixelRatio: 2,
    _els: {},
    getElementById(id) { return this._els[id] || (this._els[id] = mkEl('div')); },
    fetch: () => Promise.resolve({ ok: false, json: () => ({}) }),
    requestAnimationFrame(fn) { if (rafBudget-- > 0) return setTimeout(() => fn(Date.now()), 0); return 1; },
    cancelAnimationFrame() {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, Date, JSON, isNaN, parseInt, parseFloat, Number, String, Array, Object, Set, Map,
    Audio: function () { return { play() {}, pause() {} }; },
    Image: function () { return {}; },
};
win.window = win; win.global = win; win.self = win; win.top = win;
const ctx = vm.createContext(win);

// ---------------- 按 index.html 顺序加载所有小游戏脚本 ----------------
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const srcs = [];
html.replace(/<script src="([^"]+)"/g, (m, s) => { srcs.push(s.split('?')[0]); return m; });
const mgFiles = srcs.filter(s => s.indexOf('/js/minigames/') === 0);
// 引擎模块（engine/）必须在最前，顺序与 index.html 一致
const { ENGINE_FILES } = require('./mg-engine-files');
const engPaths = ENGINE_FILES.map(f => '/js/minigames/engine/' + f);
const ordered = engPaths.concat(mgFiles.filter(f => f.indexOf('/js/minigames/engine/') !== 0));
const loaded = [];
for (const f of ordered) {
    const p = path.join(ROOT, 'public', f);
    if (!fs.existsSync(p)) { say('⚠ 缺失脚本 ' + f); continue; }
    try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f }); loaded.push(path.basename(f)); }
    catch (e) { say('❌ 加载失败 ' + f + ' → ' + e.message); }
}
const MG = win.MG, MiniGames = win.MiniGames;

// ---------------- 游戏清单（与玩家端一致）----------------
const vjs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'views', 'minigames.js'), 'utf8');
const ids = [];
const re = /(?:sc|sc2|card|g)\(\s*['"]([A-Za-z0-9_-]+)['"]/g;
let m; while ((m = re.exec(vjs))) if (ids.indexOf(m[1]) < 0) ids.push(m[1]);

say('已加载脚本 ' + loaded.length + ' 个 · 游戏清单 ' + ids.length + ' 款');
say('');
// ---------------- 二、运行时冒烟（子进程隔离：单个游戏死循环不会拖垮整体）----------------
if (process.argv[2] === '--child') {
    const id = process.argv[3];
    const g = MiniGames[id];
    if (!g) { process.stdout.write(JSON.stringify({ id, bad: ['未定义'] })); process.exit(0); }
    const levels = MG.fillLevels(g.LEVELS || [], id === 'banqi' ? 15 : 50);
    const probes = [0];
    if (levels.length > 24) probes.push(24);
    if (levels.length > 49) probes.push(49);
    const bad = [];
    for (const pi of probes) {
        rafBudget = 3;
        const box = mkEl('div');
        let err = null, completed = null;
        try {
            const inst = g.start(box, {
                level: levels[pi] || {}, levelIdx: pi, endless: false, totalLevels: levels.length,
                onScore: () => {}, onComplete: r => { completed = r; },
            });
            const canvases = [];
            const collect = e => { if (e.tagName === 'CANVAS') canvases.push(e); (e.children || []).forEach(collect); };
            collect(box);
            const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'w', ' ', 'Enter', 'Escape', '1'];
            for (let i = 0; i < 6 && !err; i++) {
                try {
                    const c = canvases[0];
                    if (c) { c.dispatch('mousedown', { clientX: 20 + (i * 53) % 360, clientY: 20 + (i * 71) % 360 }); c.dispatch('mousemove', { clientX: 100, clientY: 100 }); c.dispatch('mouseup', {}); }
                    win.dispatch('keydown', { key: keys[i % keys.length] });
                } catch (e) { err = e; }
            }
            try { inst && inst.stop && inst.stop(); } catch (e) { err = err || e; }
        } catch (e) { err = e; }
        if (err) {
            const at = (String(err.stack || '').split('\n')[1] || '').trim().replace(/^at\s+/, '');
            bad.push(`第${pi + 1}关 ${err.message}${at ? ' @ ' + at : ''}`);
        }
    }
    process.stdout.write(JSON.stringify({ id, bad }));
    process.exit(0);
}

say('=== 一、关卡与参数完整性 ===');
const issues = [];
const rows = [];
for (const id of ids) {
    const g = MiniGames[id];
    if (!g) { issues.push({ id, type: '缺失', detail: 'MiniGames.' + id + ' 未定义' }); rows.push([id, '-', '-', '❌ 未定义']); continue; }
    const L = g.LEVELS || [];
    const filled = MG.fillLevels(L, id === 'banqi' ? 15 : 50);
    const lv1 = filled[0] || {}, lv21 = filled[20] || {}, lv50 = filled[49] || {};
    const keysOf = o => Object.keys(o).filter(k => k !== 'name' && k !== 'desc');
    const k1 = keysOf(lv1), k21 = keysOf(lv21), k50 = keysOf(lv50);
    let flag = '';
    if (id !== 'banqi' && filled.length < 50) flag += ' 关卡数' + filled.length;
    if (id !== 'banqi' && k21.length < k1.length && k1.length > 0) {
        flag += ' ⚠21关起丢参数[' + k1.join(',') + ']';
        issues.push({ id, type: '参数丢失', detail: `第 1 关参数 [${k1.join(',')}]，第 21 关只剩 [${k21.join(',')}]，第 50 关 [${k50.join(',')}]` });
    }
    if (!L.length) { flag += ' ⚠无LEVELS(走兜底20关)'; issues.push({ id, type: '无关卡表', detail: '游戏没有 LEVELS，玩家端用 defaultLevels 生成 20 关（无游戏参数）' }); }
    rows.push([id, L.length, filled.length, (k1.join(',') || '-') + (flag ? ' |' + flag : '')]);
}
say('游戏\t原关卡\t补齐后\t关卡参数字段');
rows.forEach(r => say(r.join('\t')));

const { spawnSync } = require('child_process');
say('');
say('=== 二、运行时冒烟（第1/25/50关 + 随机交互，每款独立进程 10s 超时）===');
function tryStart(id, levelIdx, levels) {
    const g = MiniGames[id];
    const box = mkEl('div');
    rafBudget = 3;
    let err = null, completed = null;
    const inst = g.start(box, {
        level: levels[levelIdx] || {}, levelIdx, endless: false, totalLevels: levels.length,
        onScore: () => {}, onComplete: r => { completed = r; },
    });
    // 随机交互：鼠标点 + 键盘
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'w', ' ', 'Enter', 'Escape', '1'];
    const canvases = [];
    const collect = e => { if (e.tagName === 'CANVAS') canvases.push(e); (e.children || []).forEach(collect); };
    collect(box);
    for (let i = 0; i < 6 && !err; i++) {
        try {
            const c = canvases[0];
            if (c) c.dispatch('mousedown', { clientX: 20 + (i * 53) % 360, clientY: 20 + (i * 71) % 360 });
            if (c) c.dispatch('mousemove', { clientX: 100, clientY: 100 });
            if (c) c.dispatch('mouseup', {});
            win.dispatch('keydown', { key: keys[i % keys.length] });
        } catch (e) { err = e; }
    }
    try { inst && inst.stop && inst.stop(); } catch (e) { err = err || e; }
    return { err, completed };
}
let crash = 0;
const crashList = [];
const AUDIT_TIMEOUT = { timeout: 10000 };
for (const id of ids) {
    const g = MiniGames[id];
    if (!g) continue;
    const r = spawnSync(process.execPath, [__filename, '--child', id], { encoding: 'utf8', timeout: 12000 });
    let bad = null;
    if (r.error || r.signal) bad = ['超时/进程被杀（疑似死循环或阻塞）'];
    else {
        try {
            // 子进程 stdout 里可能混有加载日志，取最后一个 JSON 行
            const line = (r.stdout || '').trim().split('\n').reverse().find(l => l.trim().indexOf('{') === 0) || '{}';
            const j = JSON.parse(line);
            bad = j.bad && j.bad.length ? j.bad : null;
        } catch (e) { bad = ['输出解析失败: ' + String(r.stdout || '').slice(0, 80)]; }
    }
    if (bad) {
        crash++;
        crashList.push({ id, detail: bad.join(' ｜ ') });
        say(`❌ ${id}\t${bad.join(' ｜ ')}`);
    }
}
say(crash ? `\n共 ${crash} 款在启动/交互时出问题` : '\n✓ 全部可正常启动与交互');

// ---------------- 二·五、参数值健康检查 & 可优化项 ----------------
say('');
say('=== 二·五、参数值健康 / 可优化项 ===');
const optItems = [];
for (const id of ids) {
    const g = MiniGames[id];
    if (!g) continue;
    const levels = MG.fillLevels(g.LEVELS || [], id === 'banqi' ? 15 : 50);
    const badNum = [];
    levels.forEach((lv, i) => Object.keys(lv).forEach(k => {
        const v = lv[k];
        if (k === 'name' || k === 'desc') return;
        if (typeof v === 'number' && !Number.isFinite(v)) badNum.push(`第${i + 1}关 ${k}=${v}`);
        else if (v === undefined) badNum.push(`第${i + 1}关 ${k}=undefined`);
    }));
    if (badNum.length) optItems.push({ id, type: '参数非法值', detail: badNum.slice(0, 3).join('，') + (badNum.length > 3 ? ` 等 ${badNum.length} 处` : '') });
    // 关卡名重复
    const names = levels.map(l => l.name);
    const dup = names.length - new Set(names).size;
    if (dup > 0) optItems.push({ id, type: '关卡名重复', detail: `${dup} 个关卡名重复（名池补足导致）` });
    // 关卡描述为空
    const noDesc = levels.filter(l => !l.desc).length;
    if (noDesc === levels.length && levels.length) optItems.push({ id, type: '关卡无描述', detail: '全部关卡 desc 为空，选关页看不到难度信息' });
    // 没有无尽模式
    if (!g.ENDLESS) optItems.push({ id, type: '无无尽模式', detail: '没有 ENDLESS，选关页不显示「∞ 无尽模式」入口' });
}

// ---------------- 三、汇总 ----------------
say('');
say('=== 三、问题汇总 ===');
const byType = {};
issues.concat(crashList.map(c => ({ id: c.id, type: '运行时异常', detail: c.detail }))).forEach(i => {
    (byType[i.type] = byType[i.type] || []).push(i);
});
Object.keys(byType).forEach(t => {
    say(`\n【${t}】${byType[t].length} 款`);
    byType[t].slice(0, 40).forEach(i => say(`  · ${i.id} — ${i.detail}`));
    if (byType[t].length > 40) say(`  …还有 ${byType[t].length - 40} 款`);
});

say('');
say('=== 四、可优化项（供决策，不自动改）===');
const byOpt = {};
optItems.forEach(i => (byOpt[i.type] = byOpt[i.type] || []).push(i));
Object.keys(byOpt).sort((a, b) => byOpt[b].length - byOpt[a].length).forEach(t => {
    say(`\n【${t}】${byOpt[t].length} 款`);
    say('  ' + byOpt[t].map(i => i.id).join('、'));
});
process.exit(0);
