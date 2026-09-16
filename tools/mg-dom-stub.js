// 共用 DOM / Canvas 桩：让小游戏能在 Node VM 里被真实驱动。
//
// 背景：test-mg-all.js / verify-board-games.js / verify-runtime-lifecycle.js 各写了一份，
// 重复且容易跑偏（缺一个 addEventListener 就是「document.addEventListener is not a function」）。
// 这里统一提供：
//   - 可记录监听的元素桩（fireTap / fireKey 能真实触发游戏回调）
//   - 带 set 持久化的 ctx Proxy（否则 ctx.__mgScale 读回成函数 → toFixed 崩溃）
//   - 定时器追踪集合（用于 stop() 后的泄漏检测）
//   - 按 index.html 顺序加载引擎 + 全部小游戏
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function install() {
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

    global.window = global;
    global.MiniGames = {};
    global.__MG_TEST = true;
    global.addEventListener = () => { };
    global.removeEventListener = () => { };
    global.devicePixelRatio = 1;
    // 用 setTimeout 驱动帧循环：游戏能真正跑起来（而不是空 rAF 直接停机）
    global.requestAnimationFrame = cb => global.setTimeout(() => cb(Date.now()), 16);
    global.cancelAnimationFrame = id => global.clearTimeout(id);

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
        const style = {
            setProperty(name, value) { style[name] = value; },
            removeProperty(name) { delete style[name]; }
        };
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
    global.document = {
        createElement: makeEl, getElementById: () => makeEl('div'),
        querySelector: () => makeEl('div'), querySelectorAll: () => [],
        addEventListener() { }, removeEventListener() { },
        body: { appendChild() { } }, hidden: false,
    };
    global.localStorage = { getItem: () => null, setItem() { } };

    function fire(el, type, ev) {
        const hs = (el && el.__h && el.__h[type]) || [];
        for (const h of hs) h(Object.assign({ preventDefault() { }, stopPropagation() { } }, ev));
        return hs.length;
    }
    return {
        pending, makeEl, makeCtx,
        fireTap: (el, x, y) => fire(el, 'pointerdown', { clientX: x, clientY: y, pointerId: 1 }),
        fireAt: (el, type, ev) => fire(el, type, ev),
        loadEngine() {
            const { engineDir, ENGINE_FILES } = require('./mg-engine-files');
            for (const f of ENGINE_FILES.map(x => path.join(engineDir, x))) {
                vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
            }
            return global.MG;
        },
        loadGameFile(name) {
            const p = path.join(__dirname, '..', 'public', 'js', 'minigames', name);
            vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
        },
    };
}

module.exports = { install };
