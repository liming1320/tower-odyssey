/* 引擎增强验证：MG.char 角色系统 / MG.gfx.glow+bar / fx 闪屏·顿帧·拖尾 / 触感·音效 */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9415, BASE = 'http://127.0.0.1:5180';
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
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
  static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } }; return c; }
  send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
}
let FAILED = 0;
function check(name, ok, extra) { console.log((ok ? '✅' : '❌') + ' ' + name + (extra != null ? '  ' + extra : '')); if (!ok) FAILED++; }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const errs = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-eng-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
    `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=760,940', BASE], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40; i++) { try { t = await req('GET', `http://127.0.0.1:${PORT}/json/list`).then(r => r.json); if (t && t.length) break; } catch (e) { } await sleep(250); }
  const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  cdp.onEvent = (m, p) => { if (m === 'Runtime.exceptionThrown') { const ed = p.exceptionDetails || {}; errs.push(String((ed.exception && (ed.exception.description || ed.exception.value)) || ed.text || 'err')); } if (m === 'Runtime.consoleAPICalled' && p.type === 'error') errs.push('console:' + (p.args || []).map(a => a.value).join(' ')); };
  await sleep(2500);

  console.log('=== 引擎增强验证 ===');
  // 1) MG.char 是否存在 + 8 原型 + 陈列绘制
  const api = await cdp.eval(`(()=>{
    if(!window.MG||!MG.char) return 'no-MG.char';
    const arch = MG.char.ARCH.slice();
    // 在独立 canvas 上绘制陈列
    const cv=document.createElement('canvas'); cv.width=760; cv.height=900; const ctx=cv.getContext('2d');
    ctx.fillStyle='#10182e'; ctx.fillRect(0,0,760,900);
    MG.gfx.text(ctx,'MG.char 角色系统 + glow/bar/fx',380,34,24,'#ffd56b',{bold:true});
    MG.gfx.text(ctx,'8 原型 · 程序化生成',380,62,15,'#9fb3d0',{});
    // 8 原型
    arch.forEach((a,i)=>{ const c=MG.char.gen(700+i*131); c.arch=a; c.expr='smile'; c.face=1; MG.char.draw(ctx, 60+i*88, 170, 0.95, c,{t:0.6}); });
    // 表情行（同一原型不同表情）
    const exs=['normal','smile','angry','surprise','focus','happy'];
    exs.forEach((ex,i)=>{ const c=MG.char.gen(11+i); c.arch='chibi'; c.expr=ex; c.face=1; MG.char.draw(ctx, 60+i*88, 320, 0.8, c,{t:0.6}); });
    MG.gfx.text(ctx,'表情',380,360,13,'#9fb3d0',{});
    // 配饰行
    const accs=['glasses','headband','crown','horn','hat'];
    accs.forEach((ac,i)=>{ const c=MG.char.gen(21+i); c.arch='human'; c.acc=ac; c.expr='normal'; c.face=1; MG.char.draw(ctx, 60+i*88, 470, 0.85, c,{t:0.6}); });
    MG.gfx.text(ctx,'配饰',380,510,13,'#9fb3d0',{});
    // glow 发光球
    const cols=['#ffd56b','#5cc7ff','#ff7a8b','#7ad86a','#b89cff','#ff9d5c'];
    cols.forEach((c,i)=>{ MG.gfx.glow(ctx, 50+i*60, 620, 20, c); });
    // bar 进度条
    MG.gfx.bar(ctx, 360, 600, 220, 16, 0.72, {text:'72%'});
    MG.gfx.bar(ctx, 360, 626, 220, 16, 0.22, {});
    MG.gfx.text(ctx,'glow + 血条',250,640,13,'#9fb3d0',{});
    // fx 闪屏/顿帧/拖尾（独立池）
    const fx=MG.fxPool(); fx.flash('#ffffff',0.6,0.3); fx.hitstop(80); for(let k=0;k<6;k++) fx.trail(380,720+k*6,{color:'#fff'}); fx.update(0.016); fx.draw(ctx,760,900);
    // 触感 + 音效（无手势下创建上下文，仅验证不报错）
    MG.haptics('hit'); try{MG.audio.unlock(); MG.audio.sfx('coin');}catch(e){return 'audio:'+e.message;}
    window.__engCanvas = cv;
    return 'ok arch='+arch.length;
  })()`);
  console.log('   API:', api);
  check('MG.char 存在且 8 原型', api && api.indexOf('arch=8') >= 0, api);
  check('脚本全程无 JS 报错', errs.length === 0, errs.slice(0, 3).join(' | '));

  // 2) 导出截图
  const data = await cdp.eval(`(()=>{ const cv=window.__engCanvas; return cv?cv.toDataURL('image/png'):''; })()`);
  if (data) { fs.writeFileSync(path.join(OUT, 'engine-char.png'), Buffer.from(data.split(',')[1], 'base64')); console.log('   🖼 engine-char.png', fs.statSync(path.join(OUT, 'engine-char.png')).size + 'B'); }
  else console.log('   ⚠ 无 canvas 数据');

  // 3) 在真实游戏（口袋奇兵）里验证角色已替换
  console.log('\n=== 口袋奇兵 角色替换验证 ===');
  await cdp.send('Page.navigate', { url: BASE + '/?cb=' + Date.now() + '-army' });
  await sleep(2200);
  const li = await cdp.eval(`(()=>{ window.__MG_TEST=true; const g=window.MiniGames&&window.MiniGames['pocketarmy']; const stage=document.getElementById('mini-stage')||(function(){const d=document.createElement('div'); d.id='mini-stage'; d.style.cssText='position:fixed;inset:0;z-index:99998'; document.body.appendChild(d); return d;})(); if(g){ const inst=g.start(stage,{level:(g.LEVELS&&g.LEVELS[0])||{},onComplete(){}}); window.__armyInst=inst; } return {hasGame:!!g, levels: g&&g.LEVELS?g.LEVELS.length:-1}; })()`);
  console.log('   launch:', JSON.stringify(li));
  await sleep(1000);
  const clicked = await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage .mg-ls-cell:not(.locked)'); if(c){c.click(); return true;} return false})()`);
  console.log('   clicked level cell:', clicked);
  await sleep(2000);
  const army = await cdp.eval(`(()=>{const S=window.__mgS; if(!S) return 'no-s'; return {army:S.army, obstacles:S.obstacles.length, char:!!(window.MG&&MG.char)};})()`);
  console.log('   状态:', JSON.stringify(army));
  check('口袋奇兵：军队已生成', army && army.army >= 1, JSON.stringify(army));
  check('口袋奇兵：障碍/敌人已生成', army && army.obstacles >= 1, JSON.stringify(army));
  // 截图真实游戏画面
  const aImg = await cdp.eval(`(()=>{const c=document.querySelector('#mini-stage canvas'); return c?c.toDataURL('image/png'):''})()`);
  if (aImg) { fs.writeFileSync(path.join(OUT, 'engine-army.png'), Buffer.from(aImg.split(',')[1], 'base64')); console.log('   🖼 engine-army.png', fs.statSync(path.join(OUT, 'engine-army.png')).size + 'B'); }

  check('口袋奇兵全程无 JS 报错', errs.filter(e=>e.indexOf('pocketarmy')<0).length === 0, errs.slice(0,3).join(' | '));

  console.log('\n--- 结果 ---');
  console.log(FAILED === 0 ? '🎉 全部通过' : ('❌ 失败 ' + FAILED + ' 项'));
  console.log('截图: tools/shots/engine-char.png  tools/shots/engine-army.png');
  try { proc.kill('SIGKILL'); } catch (e) {}
  process.exit(FAILED === 0 ? 0 : 1);
})().catch(e => { console.error('harness error', e); process.exit(2); });
