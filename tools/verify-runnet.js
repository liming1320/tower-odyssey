// 验证 MG.runGame 在 net:true 时：跳过选关、直接 start(levelIdx=0)、用 cfg.onComplete（而非关卡结算）
const fs = require('fs');
const JSDOM = null; // 不依赖 jsdom，用极简 DOM 桩
function fakeEl() {
  const el = { children: [], _html: '', classList: { add() {}, remove() {}, toggle() {} }, style: {},
    appendChild(c) { this.children.push(c); }, remove() {}, querySelector() { return null; },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    addEventListener() {}, set onclick(f) {}, set textContent(v) {} };
  return el;
}
global.window = {};
global.document = { createElement: () => fakeEl(), getElementById: () => null, body: fakeEl() };
global.navigator = {};
global.MG = window.MG = {};
// 加载 mg-ui.js（其顶层只做函数赋值，无外部依赖）
const code = fs.readFileSync('E:/WorkSpace/tower-odyssey/public/js/minigames/engine/mg-ui.js', 'utf8');
new Function('window', 'document', 'navigator', 'MG', code)(window, document, navigator, MG);

let levelSelectCalled = false, resultCalled = false, startCalled = false, netOnCompleteCalled = false;
MG.levelSelect = () => { levelSelectCalled = true; };
MG.result = () => { resultCalled = true; };
MG.recordStars = () => {}; MG.setBest = () => {}; MG.getBest = () => 0;
MG.reportScore = () => {}; MG.telemetry = { track() {} };
MG.settings = { gear() {} };

let capturedOnComplete = null;
const container = fakeEl();
MG.runGame(container, {
  id: 'gomoku', title: '五子棋', net: true,
  levels: [{ name: '第1关', params: { a: 1 } }],
  start: (c, opts, lv) => {
    startCalled = true;
    if (opts.levelIdx !== 0) throw new Error('net 模式 levelIdx 应为 0，实为 ' + opts.levelIdx);
    if (lv.name !== '第1关') throw new Error('level 对象未传');
    capturedOnComplete = opts.onComplete;
    return { stop() {} };
  },
  onComplete: (res) => { netOnCompleteCalled = true; },
});

const checks = [];
checks.push(['net 模式跳过选关(levelSelect 未调用)', levelSelectCalled === false]);
checks.push(['net 模式直接 start', startCalled === true]);
checks.push(['关卡结算(result) 未调用', resultCalled === false]);

// 模拟对局结束，应触发 cfg.onComplete（PvP 结算），而非关卡结算
capturedOnComplete && capturedOnComplete({ win: true, lines: ['你赢了'] });
checks.push(['对局结束用 net onComplete(PvP结算)', netOnCompleteCalled === true]);
checks.push(['对局结束未走关卡结算(result)', resultCalled === false]);

let pass = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS: ' : 'FAIL: ') + name); if (ok) pass++; }
console.log('RESULT: ' + (pass === checks.length ? 'ALL PASS (' + pass + ')' : 'FAILED ' + (checks.length - pass)));
process.exit(pass === checks.length ? 0 : 1);
