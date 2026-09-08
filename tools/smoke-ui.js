// 浏览器端验证：营地页产出展示 / 冒险页 200 层导航 / 许愿页钻石商城
// 用 Node 内置 WebSocket 直连本机 Chrome（CDP），零依赖。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9345;
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
    send(method, params = {}) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise(res => this.waiters.set(id, res));
    }
    async eval(expr) {
        const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.result && r.result.exceptionDetails) {
            const d = r.result.exceptionDetails;
            throw new Error('页面 JS 异常: ' + ((d.exception && d.exception.description) || d.text));
        }
        return r.result && r.result.result ? r.result.result.value : undefined;
    }
    async shot(name) {
        const r = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
    }
}

const ok = [], bad = [];
const check = (c, m) => (c ? ok : bad).push(m);

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpui-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=430,900', 'about:blank',
    ], { stdio: 'ignore' });

    let target = null;
    for (let i = 0; i < 40; i++) {
        try {
            const list = await new Promise((res, rej) => {
                http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
                    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
                }).on('error', rej);
            });
            target = list.find(t => t.type === 'page');
            if (target) break;
        } catch (e) { /* retry */ }
        await sleep(300);
    }
    if (!target) throw new Error('无法连接 Chrome');

    const cdp = await CDP.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });

    // 注册并登录
    const user = 'ui' + Date.now().toString(36);
    await cdp.send('Page.navigate', { url: BASE + '/?v=' + Date.now() });
    await sleep(1500);
    await cdp.eval(`
        (async () => {
            let r = await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
                body: JSON.stringify({username:'${user}',password:'1234'})});
            let j = await r.json();
            localStorage.setItem('game-token', j.token);
            // 抽 10 个英雄（新号自带 10 张许愿卡）并上阵 5 个
            r = await fetch('/api/wish',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+j.token},body:JSON.stringify({count:10})});
            j = await r.json();
            const h = await (await fetch('/api/heroes',{headers:{'Authorization':'Bearer '+localStorage.getItem('game-token')}})).json();
            for (const o of h.owned.slice(0,5)) {
                await fetch('/api/hero/equip',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('game-token')},body:JSON.stringify({uid:o.uid})});
            }
            return true;
        })()
    `);
    await cdp.send('Page.navigate', { url: BASE + '/?v=' + Date.now() });
    await sleep(2500);

    // ---------- 顶栏钻石 ----------
    const gem = await cdp.eval(`document.getElementById('r-gem') && document.getElementById('r-gem').textContent`);
    check(gem && gem.replace(/,/g, '') === '100000', `顶栏钻石显示：${gem}`);

    // ---------- 营地页 ----------
    await cdp.eval(`App.switchTab('camp')`);
    await sleep(1200);
    const camp = await cdp.eval(`(() => {
        const cards = [...document.querySelectorAll('#building-grid .building')];
        return {
            count: cards.length,
            first: cards[0] ? cards[0].innerText.replace(/\\n/g, ' | ') : '',
            collect: !!document.getElementById('btn-collect'),
            summary: (document.getElementById('camp-summary')||{}).innerText || '',
        };
    })()`);
    console.log('\n营地页卡片示例：\n  ' + camp.first);
    console.log('  总览：' + camp.summary.replace(/\n/g, ' | '));
    check(camp.count === 5, `营地显示 ${camp.count} 个建筑`);
    check(/木材 \d/.test(camp.first) && /升级后/.test(camp.first), '建筑卡片展示当前产出与升级后产出');
    check(/消耗/.test(camp.first), '建筑卡片展示升级消耗');
    check(camp.collect, '营地有「领取挂机收益」按钮');
    await cdp.shot('营地-产出明细.png');

    // ---------- 冒险页 200 层 ----------
    await cdp.eval(`App.switchTab('tower')`);
    await sleep(1500);
    const tower = await cdp.eval(`(() => {
        const btns = [...document.querySelectorAll('#floor-list .floor-btn')];
        return {
            count: btns.length,
            labels: btns.map(b => b.innerText.replace(/\\n/g,' ')),
            chapters: [...document.querySelectorAll('#chapter-bar .ch-btn')].length,
            nav: [...document.querySelectorAll('.floor-nav .btn')].map(b => b.innerText),
            head: (document.querySelector('.page-content .card')||{}).innerText || '',
        };
    })()`);
    console.log('\n冒险页：' + tower.head.replace(/\n/g, ' | '));
    console.log('  层数按钮：' + tower.labels.join(' / '));
    console.log('  导航：' + tower.nav.join(' | ') + '　章节按钮 ' + tower.chapters + ' 个');
    check(tower.count >= 10, `层数列表显示 ${tower.count} 个楼层按钮`);
    check(tower.chapters === 10, `章节快捷条有 ${tower.chapters} 个章节`);
    check(tower.nav.length === 4, '层数导航含上一页/当前层/下一页/BOSS 跳转');
    await cdp.shot('冒险-200层导航.png');

    // 跳到最后一章
    await cdp.eval(`document.querySelectorAll('#chapter-bar .ch-btn')[9].click()`);
    await sleep(600);
    const lastChap = await cdp.eval(`[...document.querySelectorAll('#floor-list .floor-btn')].map(b=>b.innerText.replace(/\\n/g,' ')).join(' / ')`);
    console.log('  跳转到混沌神殿：' + lastChap);
    check(/19\d|200/.test(lastChap), '可跳转到第 10 章（181-200 层）');
    await cdp.shot('冒险-混沌神殿.png');

    // ---------- 许愿页钻石商城 ----------
    await cdp.eval(`App.switchTab('hero'); HeroView.tab='wish'; HeroView.render(document.getElementById('page-content'), App);`);
    await sleep(1500);
    const wish = await cdp.eval(`(() => {
        const t = document.getElementById('hero-body').innerText;
        return {
            text: t.replace(/\\n/g, ' | '),
            buy1: !!document.getElementById('btn-buy1'),
            buy10: !!document.getElementById('btn-buy10'),
            buy100: !!document.getElementById('btn-buy100'),
            gem: (document.getElementById('gem-cnt')||{}).textContent,
        };
    })()`);
    console.log('\n许愿页：' + wish.text);
    check(wish.buy1 && wish.buy10 && wish.buy100, '许愿页有 1/10/100 张三档钻石购买按钮');
    check(/100,000/.test(wish.gem || ''), `许愿页钻石余额显示：${wish.gem}`);
    await cdp.shot('许愿-钻石商城.png');

    // 点一次购买
    await cdp.eval(`document.getElementById('btn-buy10').click()`);
    await sleep(1200);
    const afterBuy = await cdp.eval(`({
        gem: (document.getElementById('gem-cnt')||{}).textContent,
        card: (document.getElementById('wish-cnt')||{}).textContent,
        top: (document.getElementById('r-gem')||{}).textContent
    })`);
    console.log('  购买 10 张后：钻石 ' + afterBuy.gem + '，许愿卡 ' + afterBuy.card + '，顶栏 ' + afterBuy.top);
    check(afterBuy.gem === '99,000' && afterBuy.card === '10', '钻石购买许愿卡生效（1000 钻 → 10 张）');

    check(cdp.errors.length === 0, `页面无 JS 报错${cdp.errors.length ? '：' + cdp.errors.slice(0, 3).join(' ;; ') : ''}`);

    console.log('\n===== 通过 ' + ok.length + ' 项 =====');
    ok.forEach(m => console.log('  ✅ ' + m));
    if (bad.length) {
        console.log('\n===== 失败 ' + bad.length + ' 项 =====');
        bad.forEach(m => console.log('  ❌ ' + m));
    }
    console.log('\n截图目录：' + OUT);
    proc.kill();
    process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('测试异常：', e.message); process.exit(1); });
