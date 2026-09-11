/* 引擎健壮性修复验证：bestKey 持久化 / escapeHtml / 补间实例隔离 / finish 规范化 / pause-stop 生命周期 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9416, BASE = 'http://127.0.0.1:5180';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function req(method, u) {
  return new Promise((res, rej) => {
    const uu = new URL(u);
    const r = http.request({ hostname: uu.hostname, port: uu.port, path: uu.pathname + uu.search, method }, rs => {
      let d = ''; rs.on('data', c => d += c); rs.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res(null); } });
    });
    r.on('error', rej); r.end();
  });
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
  static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } }; return c; }
  send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
}
let FAILED = 0;
function check(name, ok, extra) { console.log((ok ? '✅' : '❌') + ' ' + name + (extra != null ? '  → ' + extra : '')); if (!ok) FAILED++; }

(async () => {
  const errs = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-e2-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
    `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=400,600', BASE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40; i++) { try { t = await req('GET', `http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) {} await sleep(250); }
  const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  cdp.onEvent = (m, p) => {
    if (m === 'Runtime.exceptionThrown') { const ed = p.exceptionDetails || {}; errs.push(String((ed.exception && (ed.exception.description || ed.exception.value)) || ed.text || 'err')); }
    else if (m === 'Runtime.consoleAPICalled' && p.type === 'error') errs.push('console:' + (p.args || []).map(a => a.value).join(' '));
  };
  await sleep(2500);
  await cdp.eval(`window.__MG_TEST = true;`);   // 让引擎暴露 __mgS 并开启严格错误抛出

  console.log('=== 引擎修复验证 ===');

  // 1) bestKey 持久化（此前 bestKey 未定义 → setBest 静默失败，issue #1）
  const best = await cdp.eval(`(()=>{ try{
    localStorage.removeItem('mg-best-__probe');
    MG.setBest('__probe', 777);
    const g = MG.getBest('__probe');
    const ls = localStorage.getItem('mg-best-__probe');
    return {g, ls};
  }catch(e){return {err:String(e)};} })()`);
  check('bestKey：setBest 真正写入 localStorage', best && best.g === 777 && best.ls === '777', JSON.stringify(best));

  // 2) escapeHtml（issue #7）
  const esc = await cdp.eval(`MG.escapeHtml('<b>x</b>&\\"\\'')`);
  check('escapeHtml 转义特殊字符', esc === '&lt;b&gt;x&lt;/b&gt;&amp;&quot;&#39;', esc);

  // 3) 补间实例隔离（issue #4）：每个游戏独立 pool，且不等于全局默认
  const tw = await cdp.eval(`(()=>{
    const a = MG.makeTweenPool(), b = MG.makeTweenPool();
    a.add({dur:1, onUpdate(){}});
    const inst = (function(){ const d=document.createElement('div'); document.body.appendChild(d);
      const g = MG.eng.game(d, {onComplete(){}}, {w:80,h:80, init:()=>({k:0}), tick:(S,dt)=>{S.k+=dt;}, check:()=>null});
      window.__twInst = g; return g; })();
    return { same: a===b, aCount:a.count, bCount:b.count, apiIsDefault: inst.tw===MG.tw, defaultCount: MG.tw.count };
  })()`);
  check('makeTweenPool 每次返回独立实例', tw && tw.same === false && tw.aCount === 1 && tw.bCount === 0, JSON.stringify(tw));
  check('api.tw 是实例池而非全局默认', tw && tw.apiIsDefault === false, JSON.stringify(tw));

  // 4) finish 规范化（issue #9）：通过真实 check() 返回非法结果，验证引擎归一化
  const fin = await cdp.eval(`(()=>{
    window.__finGot = null;
    const d=document.createElement('div'); document.body.appendChild(d);
    MG.eng.game(d, {onComplete:(r)=>{ window.__finGot = r; }},
      {w:80,h:80, init:()=>({}), check:()=>({stars:99, score:'abc', lines:'single', win:true})});
    return 'started';
  })()`);
  await sleep(300);
  const f = await cdp.eval(`window.__finGot`);
  check('finish 规范化 stars∈[0,3]', f && f.stars === 3, JSON.stringify(f));
  check('finish 规范化 score 有限数', f && f.score === 0, JSON.stringify(f));
  check('finish 规范化 lines 为数组', f && Array.isArray(f.lines) && f.lines.length === 1 && f.lines[0] === 'single', JSON.stringify(f));
  check('finish 规范化 win 推导', f && f.win === true, JSON.stringify(f));

  // 5) pause / resume / stop 生命周期（issue #3/#17）
  await cdp.eval(`(()=>{
    const d=document.createElement('div'); d.style.cssText='position:fixed;inset:0;z-index:1'; document.body.appendChild(d);
    const g = MG.eng.game(d, {onComplete(){}}, {w:80,h:80, init:()=>({k:0}), tick:(S,dt)=>{S.k+=dt;}, check:()=>null});
    window.__life = g; window.__lifeS = window.__mgS;
  })()`);
  await sleep(350);
  const k1 = await cdp.eval(`window.__lifeS.k`);
  const paused = await cdp.eval(`(()=>{ window.__life.pause(); return window.__life.isPaused; })()`);
  await sleep(350);
  const k2 = await cdp.eval(`window.__lifeS.k`);
  const resumed = await cdp.eval(`(()=>{ window.__life.resume(); return window.__life.isPaused; })()`);
  await sleep(350);
  const k3 = await cdp.eval(`window.__lifeS.k`);
  await cdp.eval(`(()=>{ window.__life.stop(); })()`);
  await sleep(350);
  const k4 = await cdp.eval(`window.__lifeS.k`);
  const life = { k1, paused, k2, resumed, k3, k4 };
  check('pause 置 isPaused=true 且暂停期间不推进', paused === true && k2 === k1, JSON.stringify(life));
  check('resume 置 isPaused=false 且恢复推进', resumed === false && k3 > k2, JSON.stringify(life));
  check('stop 后彻底停止推进', k4 === k3, JSON.stringify(life));

  // 过滤无害的振动提示
  const real = errs.filter(e => !/vibrate/i.test(e));
  check('全程无 JS 报错', real.length === 0, real.slice(0, 3).join(' | '));

  console.log('\n=== 结果：' + (FAILED === 0 ? '全部通过 ✅' : (FAILED + ' 项失败 ❌')) + ' ===');
  process.exit(FAILED === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
