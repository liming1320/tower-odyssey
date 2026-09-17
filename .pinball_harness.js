// Headless harness: stub canvas + MG, run pinball.start() and several frames to catch runtime throws.
const fs = require('fs');

function makeCtx() {
  const noop = () => {};
  const grad = { addColorStop() {} };
  const target = {
    canvas: null,
    measureText: () => ({ width: 8 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop,
    getContext: () => target,
  };
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'symbol') return undefined;
      return noop;
    },
    set() { return true; },
  });
}

function makeCanvas() {
  const ctx = makeCtx();
  const canvas = {
    width: 620, height: 700, style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 620, height: 700 }),
    addEventListener: () => {}, removeEventListener: () => {},
    appendChild: () => {},
  };
  ctx.canvas = canvas;
  return canvas;
}

const rafCbs = [];
const raf = (cb) => { rafCbs.push(cb); return rafCbs.length; };
const caf = () => {};

const documentStub = { createElement: () => makeCanvas() };

const windowStub = {
  MiniGames: {},
  addEventListener: () => {}, removeEventListener: () => {},
  __MG_TEST: true,
};
global.window = windowStub;
global.MiniGames = windowStub.MiniGames; // browser makes window.MiniGames a global; emulate that

const MG = {
  canvas: (container, w, h) => {
    const c = makeCanvas(); c.width = w; c.height = h;
    return { c, ctx: c.getContext('2d'), w, h, destroy() {} };
  },
  audio: {
    sfx() {}, unlock() { return true; }, toggleMuted() {}, muted: false,
    bgm: { start() {}, stop() {} },
  },
};

const log = (...a) => process.stdout.write(a.join(' ') + '\n');

const code = fs.readFileSync('E:/WorkSpace/tower-odyssey/public/js/minigames/pinball.js', 'utf8');
let api;
try {
  const fn = new Function('window', 'document', 'MG', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', code);
  fn(windowStub, documentStub, MG, raf, caf, setTimeout);
  api = windowStub.MiniGames['pinball'];
} catch (e) {
  log('INIT THROW:', e && e.stack || e);
  throw e;
}

const container = { appendChild() {}, style: {}, clientWidth: 620, clientHeight: 700 };
let scoreCalls = 0, completeCalls = 0;
try {
  api.start(container, {
    levelIdx: 0, endless: true,
    onScore: () => { scoreCalls++; },
    onComplete: () => { completeCalls++; },
  });
} catch (e) {
  log('START THROW:', e && e.stack || e);
  throw e;
}

function runFrames(n) {
  for (let i = 0; i < n; i++) {
    const cb = rafCbs.shift();
    if (!cb) { log('no raf cb at frame', i); return; }
    try { cb(16 * (i + 1)); }
    catch (e) { log('FRAME THROW at frame', i, '\n', (e && e.stack) || e); throw e; }
  }
}

runFrames(5);

const P = windowStub.__pinball;
// 超空间探针（纯净态，不做发射，避免发射轨道状态干扰）：直接把球放到虫洞口后跑帧
try {
  P.putBallAt(102, 212, 3, 3);
  runFrames(2);
  log('warp probe: warpHold=' + P.warpHold + ' live=' + P.liveCount);
  runFrames(60);
  log('after warp1: hyperStage=' + P.hyperStage + ' score=' + P.score);
  for (let i = 0; i < 6; i++) { P.putBallAt(102, 212, 4, 4); runFrames(70); log('warp ' + (i + 1) + ': hyperStage=' + P.hyperStage + ' score=' + P.score); }
} catch (e) { log('WARP THROW:', e && e.stack || e); throw e; }

// 倾斜系统：发射 → 连推 3 次（每次间隔清空 1.2s 冷却）→ 第 3 次应触发 TILT 失球
try {
  P.launch(0.95);
  for (let n = 0; n < 12 && P.liveCount > 0; n++) {
    P.nudge();
    if (P.tiltWarn >= 3) break;
    runFrames(80);
  }
  log('tilt test: tiltWarn=' + P.tiltWarn);
} catch (e) { log('NUDGE THROW:', e && e.stack || e); throw e; }

log('OK: scoreCalls=' + scoreCalls + ', liveBalls=' + P.liveCount + ', finalScore=' + P.score);
