// 浏览器端验证：后台管理（新 tabs）+ 英雄详情页
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9346;
const BASE = 'http://localhost:5180';
const OUT = path.join(__dirname, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.errors = []; }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); }
            else if (m.method === 'Runtime.exceptionThrown') c.errors.push(JSON.stringify(m.params));
            else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') c.errors.push(m.params.entry.text);
        };
        return c;
    }
    send(method, params) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
        return new Promise(res => this.waiters.set(id, res));
    }
    async eval(expr) {
        const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
        return r.result && r.result.result && r.result.result.value;
    }
}

let pass = 0, fail = 0;
function check(ok, label) {
    if (ok) { pass++; console.log('✅', label); }
    else    { fail++; console.log('❌', label); }
}

(async () => {
    // 启动 Chrome
    const tmpDir = path.join(os.tmpdir(), 'cdp-equip-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const ch = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmpDir}`,
        '--window-size=420,820', 'about:blank',
    ], { stdio: 'ignore' });
    await sleep(2000);
    process.on('exit', () => { try { ch.kill('SIGKILL'); } catch (e) {} });

    // 拿调试 URL（找 page 类型，避开 chrome-extension 背景页）
    const list = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json`, r => {
            let buf = ''; r.on('data', c => buf += c); r.on('end', () => res(JSON.parse(buf)));
        }).on('error', rej);
    });
    const page = list.find(t => t.type === 'page' && t.url && !t.url.startsWith('chrome-extension')) || list.find(t => t.type === 'page') || list[0];
    const wsUrl = page.webSocketDebuggerUrl;
    const c = await CDP.connect(wsUrl);    await c.send('Page.enable');
    await c.send('Runtime.enable');

    // 先打开主域，否则 fetch 跨域；并确认实际到达后再继续
    await c.send('Page.navigate', { url: BASE + '/' });
    await sleep(2500);
    let href = await c.eval('location.href');
    if (!href || !href.includes('5180')) {
        await c.send('Page.navigate', { url: BASE + '/' });
        await sleep(2000);
        href = await c.eval('location.href');
    }
    console.log('  浏览器已打开', href);

    // 1. 注册新用户
    const rnd = Math.random().toString(36).slice(2, 6);
    const user = `ui${rnd}`;
    const reg = await c.eval(`fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'${user}',password:'1234'})}).then(r=>r.json())`);
    check(!!reg.token, `注册 ${user} 成功`);
    await c.eval(`localStorage.setItem('game-token', '${reg.token}')`);

    // 2. 买 10 张许愿卡 + 抽 5 个英雄
    await sleep(300);
    const buy = await c.eval(`fetch('/api/shop/buy-wish',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ${reg.token}'},body:JSON.stringify({count:10})}).then(r=>r.text()).then(t=>{try{return JSON.parse(t)}catch(e){return{raw:t}}})`);
    check(buy && buy.count === 10, `买许愿卡 ${buy && buy.count} 张（${(buy && buy.error) || ''}）`);
    const wish = await c.eval(`fetch('/api/wish',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ${reg.token}'},body:JSON.stringify({count:5})}).then(r=>r.text()).then(t=>{try{return JSON.parse(t)}catch(e){return{raw:t}}})`);
    check(wish && wish.items && wish.items.length === 5, `抽到 ${(wish && wish.items || []).length} 个英雄（${(wish && wish.error) || ''}）`);
    const myUid = wish.items[0].hero.uid;
    // 上阵第一个
    await c.eval(`fetch('/api/hero/equip',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ${reg.token}'},body:JSON.stringify({uid:'${myUid}'})})`);

    // 3. 重新加载首页并等待 App 就绪
    await c.send('Page.navigate', { url: BASE + '/' });
    await sleep(2500);
    const ready = await c.eval(`typeof App !== 'undefined' && typeof HeroView !== 'undefined' && typeof HeroDetail !== 'undefined' && typeof AdminView !== 'undefined'`);
    check(ready, '前端脚本加载就绪');
    // 重新登录
    await c.eval(`localStorage.setItem('game-token', '${reg.token}')`);
    await c.eval(`App.init && App.init()`);
    await sleep(800);

    // 4. 切到「英雄」tab → 打开图鉴
    await c.eval(`App.switchTab('hero')`);
    await sleep(800);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'equip-图鉴.png'), Buffer.from(r.result.data, 'base64'));
    });

    // 5. 切到「背包」
    await c.eval(`HeroView.tab='bag'; HeroView.render(document.getElementById('page-content'), App)`);
    await sleep(800);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'equip-背包.png'), Buffer.from(r.result.data, 'base64'));
    });

    // 6. 点击「详情」打开英雄详情（弹窗）
    await c.eval(`HeroDetail.open('${myUid}', App)`);
    await sleep(1000);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'equip-详情-升级.png'), Buffer.from(r.result.data, 'base64'));
    });
    const hasUpgradeBtn = await c.eval(`!!document.querySelector('#hd-up')`);
    check(hasUpgradeBtn, '英雄详情页：升级 tab 有按钮');

    // 7. 切到「升星」tab
    await c.eval(`HeroDetail.tab='star'; HeroDetail._render(App)`);
    await sleep(500);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'equip-详情-升星.png'), Buffer.from(r.result.data, 'base64'));
    });
    const hasStarBtn = await c.eval(`!!document.querySelector('#hd-star')`);
    check(hasStarBtn, '英雄详情页：升星 tab 有按钮');

    // 8. 切到「神器」tab
    await c.eval(`HeroDetail.tab='artifact'; HeroDetail._render(App)`);
    await sleep(500);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'equip-详情-神器.png'), Buffer.from(r.result.data, 'base64'));
    });
    const artList = await c.eval(`document.querySelectorAll('[data-equip]').length`);
    check(artList > 0, `神器库 ${artList} 件可装备`);

    // 9. 切到「宝石」tab
    await c.eval(`HeroDetail.tab='gem'; HeroDetail._render(App)`);
    await sleep(500);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'equip-详情-宝石.png'), Buffer.from(r.result.data, 'base64'));
    });
    const gemList = await c.eval(`document.querySelectorAll('[data-equip-gem]').length`);
    check(gemList > 0, `宝石库 ${gemList} 颗可镶嵌`);

    // 10. 切到「装备/戒指」tab
    await c.eval(`HeroDetail.tab='equip'; HeroDetail._render(App)`);
    await sleep(500);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'equip-详情-装备.png'), Buffer.from(r.result.data, 'base64'));
    });
    const eqList = await c.eval(`document.querySelectorAll('[data-eq]').length`);
    const ringList = await c.eval(`document.querySelectorAll('[data-rn]').length`);
    check(eqList > 0, `装备库 ${eqList} 件`);
    check(ringList > 0, `戒指库 ${ringList} 个`);

    // 11. 关掉弹窗
    await c.eval(`U.closeModal()`);
    await sleep(300);

    // 12. 进后台（先用 admin 账号登录让 App.user.isAdmin=true）
    const admLogin = await c.eval(`fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'workbuddy'})}).then(r=>r.json())`);
    await c.eval(`localStorage.setItem('game-token', '${admLogin.token}')`);
    await c.eval(`(async()=>{ const r=await fetch('/api/me',{headers:{'Authorization':'Bearer ${admLogin.token}'}}); const j=await r.json(); App.user=j.user; })()`);
    await sleep(500);
    await c.eval(`document.getElementById('btn-menu').click()`);
    await sleep(400);
    await c.eval(`document.querySelector('#menu-admin').click()`);
    await sleep(1200);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'admin-概览.png'), Buffer.from(r.result.data, 'base64'));
    });
    const tabNames = await c.eval(`Array.from(document.querySelectorAll('.admin-tabs button')).map(b=>b.textContent)`);
    check(tabNames.length >= 6, `后台 tab 数 ${tabNames.length}（${tabNames.join('、')}）`);

    // 13. 切到「英雄管理」
    await c.eval(`AdminView.tab='hero'; AdminView.show(App)`);
    await sleep(800);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'admin-英雄管理.png'), Buffer.from(r.result.data, 'base64'));
    });
    const hasDesc = await c.eval(`!!document.querySelector('#h-desc')`);
    const hasPortrait = await c.eval(`!!document.querySelector('#h-portrait')`);
    const hasFx = await c.eval(`!!document.querySelector('#h-skill-fx')`);
    check(hasDesc, '英雄管理：描述字段');
    check(hasPortrait, '英雄管理：半身像字段');
    check(hasFx, '英雄管理：技能特效字段');

    // 14. 切到「城墙管理」
    await c.eval(`AdminView.tab='wall'; AdminView.show(App)`);
    await sleep(800);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'admin-城墙管理.png'), Buffer.from(r.result.data, 'base64'));
    });
    const hasWallForm = await c.eval(`!!document.querySelector('#w-name') && !!document.querySelector('#w-desc')`);
    check(hasWallForm, '城墙管理：名称+技能描述');

    // 15. 切到「活动管理」
    await c.eval(`AdminView.tab='event'; AdminView.show(App)`);
    await sleep(800);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'admin-活动管理.png'), Buffer.from(r.result.data, 'base64'));
    });
    const hasEvForm = await c.eval(`!!document.querySelector('#ev-name') && !!document.querySelector('#ev-rewards') || !!document.querySelector('#ev-gold')`);
    check(hasEvForm, '活动管理：名称+奖励字段');

    // 16. 切到「玩家列表」
    await c.eval(`AdminView.tab='users'; AdminView.show(App)`);
    await sleep(800);
    await c.send('Page.captureScreenshot').then(r => {
        if (r.result) fs.writeFileSync(path.join(OUT, 'admin-玩家列表.png'), Buffer.from(r.result.data, 'base64'));
    });
    const hasGrant = await c.eval(`!!document.querySelector('#gr-gems') && !!document.querySelector('#gr-go')`);
    check(hasGrant, '玩家列表：发钻/发资源表单');

    // 17. 错误日志
    if (c.errors.length) {
        console.log('⚠️ 浏览器错误：', c.errors.length);
        c.errors.slice(0, 3).forEach(e => console.log('  -', e.slice(0, 200)));
    }
    check(c.errors.length === 0, '无 JS 报错');

    console.log(`\n==== UI 测试 ${pass} 通过 / ${fail} 失败 ====`);
    process.exit(fail ? 1 : 0);
})();
