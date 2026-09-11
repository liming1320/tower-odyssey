/* 弹幕樱华祭：移动手感专项验证
   1) 触摸 1:1 高速跟手（原 bug：自动 focus 限速到 ~100px/s，怎么滑都慢）
   2) 精准按钮：点击可切换 focus，且不触发人物移动
   3) 炸弹按钮：点击放炸弹，不移动人物
   4) 全程无 JS 报错 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9416, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function req(method, u) {
  return new Promise((res, rej) => {
    const uu = new URL(u);
    const r = http.request({ hostname: uu.hostname, port: uu.port, path: uu.pathname + uu.search, method }, rs => {
      let d = ''; rs.on('data', c => d += c); rs.on('end', () => { try { res({ code: rs.statusCode, json: d ? JSON.parse(d) : null }); } catch (e) { res({ code: rs.statusCode, json: null }); } });
    });
    r.on('error', rej); r.end();
  });
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.onEvent = () => {}; }
  static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } if (m.method) c.onEvent(m.method, m.params || {}); }; return c; }
  send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
  async bitmap(f) { const u = await this.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); return c?c.toDataURL('image/png'):''})()`); if (!u) { console.log('   ⚠ 无 canvas'); return; } fs.writeFileSync(f, Buffer.from(u.split(',')[1], 'base64')); console.log('   🖼', path.basename(f), fs.statSync(f).size + 'B'); }
  async tap(lx, ly) {
    const r = await this.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); if(!c) return null; const b=c.getBoundingClientRect(); return {left:b.left,top:b.top,width:b.width,height:b.height};})()`);
    if (!r) return;
    const x = r.left + lx / 360 * r.width, y = r.top + ly / 560 * r.height;
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}
let FAILED = 0;
function check(name, ok, extra) { console.log((ok ? '✅' : '❌') + ' ' + name + (extra != null ? '  ' + extra : '')); if (!ok) FAILED++; }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const errs = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpdm-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
    `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40; i++) { try { t = await req('GET', `http://127.0.0.1:${PORT}/json/list`).then(r => r.json); if (t && t.length) break; } catch (e) { } await sleep(250); }
  const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Input.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 940, deviceScaleFactor: 2, mobile: true });
  cdp.onEvent = (m, p) => { if (m === 'Runtime.exceptionThrown') { const ed = p.exceptionDetails || {}; const d = ed.exception && (ed.exception.description || ed.exception.value) || ed.text || 'err'; errs.push(String(d)); } if (m === 'Runtime.consoleAPICalled' && p.type === 'error') errs.push('console:' + (p.args || []).map(a => a.value).join(' ')); };
  const nav = async (tag) => { await cdp.send('Page.navigate', { url: BASE + '/?cb=' + Date.now() + '-' + tag }); await sleep(2700); await cdp.eval('(()=>{window.__MG_TEST=true; return 1})()'); };
  const launch = async (id) => {
    await cdp.eval(`(()=>{try{const g=GAMES.find(x=>x.id==='${id}'); if(window.MinigamesView&&window.MinigamesView.launch) window.MinigamesView.launch(g); return 'ok';}catch(e){return 'throw:'+e.message}})()`);
    await sleep(900);
    await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage .mg-ls-cell:not(.locked)'); if(c)c.click(); return !!c})()`);
    await sleep(1600);
  };

  console.log('\n=== 弹幕樱华祭 移动手感 ===');
  await nav('dan'); await launch('danmaku');
  await sleep(300);

  // 起始位置
  const start = await cdp.eval(`(()=>{const S=window.__mgS; return S?{x:S.px,y:S.py,focus:S.focus,bombs:S.bombs}:null})()`);
  console.log('   起始:', JSON.stringify(start));

  // 1) 触摸 1:1 跟手：把手指放到远处 (300,120)
  await cdp.tap(300, 120);
  await sleep(150);   // ~9 帧
  const afterTouch = await cdp.eval(`(()=>{const S=window.__mgS; return {x:Math.round(S.px),y:Math.round(S.py)};})()`);
  const dist = Math.hypot(afterTouch.x - 300, afterTouch.y - 120);
  console.log('   触摸(300,120)后:', JSON.stringify(afterTouch), '距目标', dist.toFixed(1));
  // 原逻辑 150ms 仅移动 ~15px；新逻辑应逼近目标（<40px）
  check('弹幕：手指放置后自机高速逼近目标（跟手）', dist < 40, 'dist=' + dist.toFixed(1));

  // 继续跟随：再给 200ms 应几乎到达
  await sleep(200);
  const settled = await cdp.eval(`(()=>{const S=window.__mgS; return {x:Math.round(S.px),y:Math.round(S.py),touch:S.touch?1:0};})()`);
  const dist2 = Math.hypot(settled.x - 300, settled.y - 120);
  console.log('   再 200ms 后:', JSON.stringify(settled), '距目标', dist2.toFixed(1));
  check('弹幕：自机最终贴合手指位置', dist2 < 8, 'dist=' + dist2.toFixed(1));

  // 2) 精准按钮：点击 (38,522) 切换 focus，且人物不应移动
  const before = await cdp.eval(`(()=>{const S=window.__mgS; return {x:S.px,y:S.py,focus:S.focus};})()`);
  await cdp.tap(38, 522);
  await sleep(120);
  const afterFocus = await cdp.eval(`(()=>{const S=window.__mgS; return {x:Math.round(S.px),y:Math.round(S.py),focus:S.focus};})()`);
  const moved = Math.hypot(afterFocus.x - before.x, afterFocus.y - before.y);
  console.log('   点精准前:', JSON.stringify(before), ' 点后:', JSON.stringify(afterFocus), ' 位移', moved.toFixed(1));
  check('弹幕：精准按钮切换 focus 状态', afterFocus.focus !== before.focus, JSON.stringify(afterFocus));
  check('弹幕：点精准按钮不移动人物', moved < 2, 'moved=' + moved.toFixed(1));

  // 3) 炸弹按钮：点击 (322,522) 放炸弹，不移动人物
  const beforeBomb = await cdp.eval(`(()=>{const S=window.__mgS; return {x:S.px,y:S.py,bombs:S.bombs};})()`);
  await cdp.tap(322, 522);
  await sleep(120);
  const afterBomb = await cdp.eval(`(()=>{const S=window.__mgS; return {x:Math.round(S.px),y:Math.round(S.py),bombs:S.bombs,bombFx:S.bombFx>0};})()`);
  const movedB = Math.hypot(afterBomb.x - beforeBomb.x, afterBomb.y - beforeBomb.y);
  console.log('   点炸弹前:', JSON.stringify(beforeBomb), ' 点后:', JSON.stringify(afterBomb), ' 位移', movedB.toFixed(1));
  check('弹幕：炸弹按钮消耗炸弹并触发特效', afterBomb.bombs === beforeBomb.bombs - 1 && afterBomb.bombFx, JSON.stringify(afterBomb));
  check('弹幕：点炸弹按钮不移动人物', movedB < 2, 'moved=' + movedB.toFixed(1));

  await cdp.bitmap(path.join(OUT, 'danmaku-move.png'));
  check('弹幕：全程无 JS 报错', errs.length === 0, errs.slice(0, 3).join(' | '));

  await proc.kill('SIGKILL');
  console.log('\n' + (FAILED === 0 ? '🎉 全部通过' : `❌ ${FAILED} 项未通过`));
  process.exit(FAILED === 0 ? 0 : 1);
})().catch(e => { console.error('脚本异常', e); process.exit(2); });
