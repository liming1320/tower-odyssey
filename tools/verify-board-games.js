// 棋类新游专项验证：斗兽棋 / 飞行棋 / 冒险棋
//  · 50 关全部能构造 + 绘制
//  · 真实驱动：模拟点击把一局跑起来（掷骰 / 选子 / 移动 / AI 回合）
//  · 生命周期：stop() 后不再有悬挂定时器（验证引擎 api.later 自动回收）
// 用法：node tools/verify-board-games.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const errors = [];
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- 定时器追踪（泄漏检测） ----------------
const pending = new Set();
const realST = setTimeout, realCT = clearTimeout, realSI = setInterval, realCI = clearInterval;
global.setTimeout = function (fn, ms) {
    const args = Array.prototype.slice.call(arguments, 2);
    let id;
    id = realST(function () { pending.delete(id); fn.apply(null, args); }, ms);
    pending.add(id);
    return id;
};
global.clearTimeout = function (id) { pending.delete(id); return realCT(id); };
global.setInterval = function (fn, ms) {
    const args = Array.prototype.slice.call(arguments, 2);
    const id = realSI(function () { fn.apply(null, args); }, ms);
    pending.add(id);
    return id;
};
global.clearInterval = function (id) { pending.delete(id); return realCI(id); };

// ---------------- DOM / Canvas 桩 ----------------
global.window = global;
global.MiniGames = {};
global.__MG_TEST = true;
global.addEventListener = () => { };
global.removeEventListener = () => { };
global.requestAnimationFrame = cb => global.setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = id => global.clearTimeout(id);
global.devicePixelRatio = 1;

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
    const el = {
        tagName: tag, style: {}, dataset: {}, children: [], __h: {},
        classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
        addEventListener(t, f) { (el.__h[t] = el.__h[t] || []).push(f); },
        removeEventListener(t, f) { const a = el.__h[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
        appendChild(c) { el.children.push(c); return c; },
        removeChild() { }, remove() { },
        querySelector: () => makeEl('div'), querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 520 }),
        getContext: () => makeCtx(),
        clientWidth: 400, clientHeight: 520, width: 400, height: 520,
        focus() { }, click() { }, value: '', setAttribute() { }, isConnected: true,
        setPointerCapture() { },
    };
    return el;
}
global.document = {
    createElement: makeEl, getElementById: () => makeEl('div'),
    querySelector: () => makeEl('div'), querySelectorAll: () => [],
    addEventListener() { }, removeEventListener() { },
    body: { appendChild() { } }, hidden: false,
};
global.localStorage = { getItem: () => null, setItem() { } };

// ---------------- 加载引擎 + 三款新棋 ----------------
const { engineDir, ENGINE_FILES } = require('./mg-engine-files');
for (const f of ENGINE_FILES.map(x => path.join(engineDir, x))) {
    vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
}
const MG = global.MG;
MG.onError = (e, info) => { errors.push((info && info.phase ? info.phase + ': ' : '') + e.message); };
for (const f of ['jungle.js', 'ludo.js', 'advchess.js']) {
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'minigames', f), 'utf8'), { filename: f });
}
const M = global.MiniGames;

function fireTap(el, x, y) {
    const hs = (el && el.__h && el.__h.pointerdown) || [];
    if (!hs.length) return false;
    for (const h of hs) h({ clientX: x, clientY: y, pointerId: 1, preventDefault() { }, stopPropagation() { } });
    return true;
}
function opts(id, i, endless) {
    const g = M[id];
    return {
        level: endless ? g.ENDLESS : g.LEVELS[i], levelIdx: endless ? -1 : i,
        endless: !!endless, totalLevels: g.LEVELS.length,
        onScore: () => { }, onComplete: () => { }, onBack: () => { },
    };
}

(async () => {
    for (const id of ['jungle', 'ludo', 'advchess']) {
        console.log('\n【' + id + '】');
        const g = M[id];
        check('已注册', !!g);
        check('LEVELS = 50', g.LEVELS.length === 50, String(g.LEVELS && g.LEVELS.length));
        check('有关卡描述', !!g.LEVELS[0].desc, g.LEVELS[0].desc);

        // 1) 全 50 关构造 + 绘制
        let allOk = true, firstErr = '';
        for (let i = 0; i < 50; i++) {
            const c = makeEl('div');
            let inst = null;
            try { inst = g.start(c, opts(id, i, false)); } catch (e) { allOk = false; firstErr = 'L' + i + ' ' + e.message; break; }
            try { inst && inst.stop && inst.stop(); } catch (e) { allOk = false; firstErr = 'L' + i + ' stop ' + e.message; break; }
        }
        check('50 关构造 + 绘制无异常', allOk, firstErr);

        // 2) 无尽模式
        if (g.ENDLESS) {
            try { const inst = g.start(makeEl('div'), opts(id, 0, true)); inst && inst.stop && inst.stop(); check('无尽模式可构造', true); }
            catch (e) { check('无尽模式可构造', false, e.message); }
        }

        // 3) 真实驱动一局
        const before = errors.length;
        const basePending = pending.size;
        const c = makeEl('div');
        let inst = null;
        try { inst = g.start(c, opts(id, 0, false)); } catch (e) { check('启动成功', false, e.message); continue; }
        const canvas = c.children[0];
        check('创建了画布', !!canvas);
        const S = global.__mgS;

        let acted = 0;
        for (let step = 0; step < 90 && errors.length === before; step++) {
            await sleep(60);
            if (!S) break;
            if (S.winner >= 0) break;
            if (id === 'jungle') {
                if (S.turn === 1 && !S.busy && global.__jungleDbg) {
                    const mv = global.__jungleDbg.allMoves(S.B, 1);
                    if (!mv.length) break;
                    const m = mv[Math.floor(Math.random() * mv.length)];
                    const geo = S._geo || { cell: 44, x0: 46, y0: 66 };
                    const cx = i => geo.x0 + i * geo.cell + geo.cell / 2;
                    const cy = j => geo.y0 + j * geo.cell + geo.cell / 2;
                    fireTap(canvas, cx(m.fx), cy(m.fy));
                    fireTap(canvas, cx(m.tx), cy(m.ty));
                    acted++;
                }
            } else if (id === 'ludo') {
                if (S.turn < S.humans && !S.rolling && global.__ludoDbg) {
                    if (S.phase === 'roll' && S._btn) { fireTap(canvas, S._btn.x + 10, S._btn.y + 10); acted++; }
                    else if (S.phase === 'pick' && S.opts.length) {
                        const d = global.__ludoDbg, gg = d.geo(400, 520), k = S.opts[0], a = S.pl[S.turn][k];
                        let q;
                        if (a.rel < 0) q = d.basePos(S.turn, k, gg);
                        else if (a.rel >= d.RING) q = d.homePos(S.turn, a.rel - d.RING, gg);
                        else q = d.ringPos(d.startOf(S.turn) + a.rel, gg);
                        fireTap(canvas, q.x + gg.cs / 2, q.y + gg.cs / 2);
                        acted++;
                    }
                }
            } else {
                if (S.turn < S.humans && !S.busy && !S.rolling && S._btn) {
                    fireTap(canvas, S._btn.x + 10, S._btn.y + 10);
                    acted++;
                }
            }
        }
        check('模拟操作被接受（点击生效）', acted > 0, 'acted=' + acted);
        check('运行期间无引擎错误', errors.length === before, errors.slice(before).join(' | '));

        // 4) stop() 后无悬挂定时器
        try { inst.stop(); inst.stop(); check('stop() 幂等不抛错', true); }
        catch (e) { check('stop() 幂等不抛错', false, e.message); }
        await sleep(900);
        const leak = pending.size - basePending;
        check('stop() 后无悬挂定时器', leak <= 1, '残留 ' + leak + ' 个');
    }

    console.log('\n运行期间捕获到的引擎错误：' + (errors.length ? errors.join(' | ') : '无'));
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
