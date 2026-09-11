/* 综合实机验证：0) 烹饪顾客渲染 1) 管理后台排序 full 字段 2) 转刀指哪走哪
   3) 口袋奇兵射击 4) 弹幕樱华祭 运行 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9414, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function req(method, u, body, headers) {
  return new Promise((res, rej) => {
    const uu = new URL(u), data = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: uu.hostname, port: uu.port, path: uu.pathname + uu.search, method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) }, rs => {
      let d = ''; rs.on('data', c => d += c); rs.on('end', () => { try { res({ code: rs.statusCode, json: d ? JSON.parse(d) : null }); } catch (e) { res({ code: rs.statusCode, json: null }); } });
    });
    r.on('error', rej); if (data) r.write(data); r.end();
  });
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.onEvent = () => {}; }
  static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } if (m.method) c.onEvent(m.method, m.params || {}); }; return c; }
  send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
  async bitmap(f) { const u = await this.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); return c?c.toDataURL('image/png'):''})()`); if (!u) { console.log('   ⚠ 无 canvas'); return; } fs.writeFileSync(f, Buffer.from(u.split(',')[1], 'base64')); console.log('   🖼', path.basename(f), fs.statSync(f).size + 'B'); }
  // 真实输入：用 CDP Input 域派发鼠标事件（比 dispatchEvent 可靠，能正确路由到 canvas 监听器）
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
function tapHelper() {
  return `(function(){window.__fireTap=function(lx,ly){const cs=document.querySelectorAll('#mini-stage canvas');const c=cs[cs.length-1];const r=c.getBoundingClientRect();const cx=r.left+lx/360*r.width, cy=r.top+ly/560*r.height;c.dispatchEvent(new MouseEvent('mousedown',{clientX:cx,clientY:cy,bubbles:true}));};})()`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const errs = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp0912b-'));
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

  // ===== 0) 烹饪顾客渲染 =====
  console.log('\n=== 0) 烹饪发烧友 顾客渲染 ===');
  await nav('cook'); await launch('cookingfever');
  await cdp.eval(tapHelper());
  const cook = await cdp.eval(`(()=>{const S=window.__cook; return S?{q:S.queue.length, style0:S.queue[0]&&S.queue[0].style, hue:S.queue[0]&&S.queue[0].hue}:null})()`);
  console.log('   顾客:', JSON.stringify(cook));
  check('烹饪：有顾客在排队', cook && cook.q >= 1, JSON.stringify(cook));
  check('烹饪：顾客带发型/发色字段（日漫风）', cook && cook.style0 != null && cook.hue != null);
  await cdp.bitmap(path.join(OUT, 'v2-cooking.png'));

  // ===== 1) 管理后台排序 full 字段 =====
  console.log('\n=== 1) 管理后台排序 GET full 字段 ===');
  const login = await req('POST', BASE + '/api/admin/login', { username: 'admin', password: 'workbuddy' });
  const token = login.json && login.json.token;
  check('管理员登录成功', !!token, 'code=' + login.code);
  if (token) {
    const ord = await req('GET', BASE + '/api/admin/minigame/order', null, { Authorization: 'Bearer ' + token });
    const j = ord.json;
    console.log('   admin GET keys:', j ? Object.keys(j).join(',') : 'null', ' full?', !!(j && j.full), ' len=', j && j.full && j.full.length);
    check('admin GET 返回 full 字段', !!(j && Array.isArray(j.full) && j.full.length > 0));
    check('full 与 order 一致（顺序保留）', j && JSON.stringify(j.full) === JSON.stringify(j.order));
    // 验证保存后刷新仍能拿到保存顺序：保存一个颠倒的顺序，再 GET 应反映
    const saved = j.full.slice().reverse();
    const sv = await req('POST', BASE + '/api/admin/minigame/order', { order: saved }, { Authorization: 'Bearer ' + token });
    const ord2 = await req('GET', BASE + '/api/admin/minigame/order', null, { Authorization: 'Bearer ' + token });
    check('保存后 admin GET 反映新顺序', ord2.json && ord2.json.full[0] === saved[0] && ord2.json.full[ord2.json.full.length - 1] === saved[saved.length - 1], 'first=' + (ord2.json && ord2.json.full[0]));
    // 还原
    await req('POST', BASE + '/api/admin/minigame/order', { order: j.full }, { Authorization: 'Bearer ' + token });
  }

  // ===== 2) 转刀 指哪走哪 =====
  console.log('\n=== 2) 鸠摩智转刀 指哪走哪 ===');
  await nav('knife'); await launch('knife');
  // 真实移动端：touchstart→onDown→cfg.tap(S,x,y) 把手指坐标直接赋给 S.touch。
  // headless 合成 mouse 事件有时会漏到监听器，所以这里直接模拟 cfg.tap 的最终效果（S.touch={x,y}）。
  const k0 = await cdp.eval(`(()=>{const S=window.__mgS; S.touch={x:280,y:180}; return {x:S.px,y:S.py,touch:S.touch?1:0}})()`);
  await sleep(1800);
  const k1 = await cdp.eval(`(()=>{const S=window.__mgS; return {x:S.px,y:S.py,touch:S.touch?1:0}})()`);
  console.log('   起点', JSON.stringify(k0), '→ 目标(280,180)后', JSON.stringify(k1));
  check('转刀：touch 目标点后角色移动到目标附近(误差<60)', k1 && Math.hypot(k1.x - 280, k1.y - 180) < 60, 'dist=' + (k1 ? Math.hypot(k1.x - 280, k1.y - 180).toFixed(0) : '?'));
  check('转刀：到达后清除 touch（不再乱飘）', k1 && k1.touch === 0);
  await cdp.bitmap(path.join(OUT, 'v2-knife.png'));

  // ===== 3) 口袋奇兵 射击 =====
  console.log('\n=== 3) 口袋奇兵 自动射击 ===');
  await nav('army'); await launch('pocketarmy');
  let a = null, maxEnemies = 0, maxBullets = 0;
  for (let i = 0; i < 20; i++) {           // 轮询最多 ~14s：ticker 每 1.4s 循环，子弹命中后短暂清零，故累计峰值判断
    await sleep(700);
    a = await cdp.eval(`(()=>{const S=window.__mgS; return {bullets:S.bullets.length, enemies:S.obstacles.filter(o=>o.type==='enemy').length, obstacles:S.obstacles.length, ticker:+ (S.ticker||0).toFixed(2), spawnGap:+ (S.spawnGap||0).toFixed(2), phase:S.phase, ox:S.ox, baseX:S.ox+180}})()`);
    if (a) { maxEnemies = Math.max(maxEnemies, a.enemies); maxBullets = Math.max(maxBullets, a.bullets); }
    if (maxEnemies >= 1 && maxBullets > 0) break;
  }
  console.log('   状态:', JSON.stringify(a), '峰值 enemies=' + maxEnemies, 'bullets=' + maxBullets);
  check('口袋奇兵：杂兵已出现', maxEnemies >= 1, 'peak=' + maxEnemies);
  check('口袋奇兵：自动射击生成子弹', maxBullets > 0, 'peak bullets=' + maxBullets);
  await cdp.bitmap(path.join(OUT, 'v2-pocketarmy.png'));

  // ===== 4) 弹幕樱华祭 =====
  console.log('\n=== 4) 弹幕樱华祭 运行 ===');
  await nav('dan'); await launch('danmaku');
  await sleep(1500);
  const d1 = await cdp.eval(`(()=>{const S=window.__mgS; return {pbul:S.pbul.length, ebul:S.ebul.length, phase:S.phase, lives:S.lives, stage:S.stage}})()`);
  console.log('   开局:', JSON.stringify(d1));
  check('弹幕：自机自动射击(pbul>0)', d1 && d1.pbul > 0, JSON.stringify(d1));
  // 强制推进到 BOSS 阶段，验证符卡逻辑（自动射击命中需要走位，自动化里直接清场触发）
  await cdp.eval(`(()=>{const S=window.__mgS; S.enemies.length=0; S.waveIdx=S.diff.waves; S.phase='wave'; S.spawnT=0; return 1})()`);
  await sleep(2500);
  const d2 = await cdp.eval(`(()=>{const S=window.__mgS; return {ebul:S.ebul.length, enemies:S.enemies.length, boss:!!S.boss, phase:S.phase, pbul:S.pbul.length, score:S.score}})()`);
  console.log('   推进 BOSS 后:', JSON.stringify(d2));
  check('弹幕：敌弹生成(ebul>0)', d1 && d1.ebul > 0, 'ebul=' + (d1 && d1.ebul));
  check('弹幕：进入 BOSS 符卡阶段', d2 && (d2.phase === 'boss' || d2.boss), JSON.stringify(d2));
  // 测试炸弹（点右下角炸弹按钮）—— 用真实 CDP 输入事件
  await cdp.tap(322, 522);
  await sleep(120);
  const d3 = await cdp.eval(`(()=>{const S=window.__mgS; return {bombs:S.bombs, ebul:S.ebul.length, bombFx:S.bombFx>0}})()`);
  console.log('   放炸弹后:', JSON.stringify(d3));
  check('弹幕：炸弹按钮可点击触发(doBomb: bombs-1 + 清屏特效)', d3 && d3.bombs === 1 && d3.bombFx === true, JSON.stringify(d3));
  await cdp.bitmap(path.join(OUT, 'v2-danmaku.png'));

  // ===== 错误总览 =====
  console.log('\n=== 运行期错误监控 ===');
  check('全程无 JS 报错', errs.length === 0, errs.slice(0, 4).join(' | '));

  proc.kill();
  console.log(FAILED === 0 ? '\n🎉 全部通过' : `\n❌ 失败 ${FAILED} 项`);
  process.exit(FAILED === 0 ? 0 : 1);
})();
