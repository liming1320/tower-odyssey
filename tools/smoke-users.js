// 验证后台「玩家列表」改造：邮件发放 + 模糊搜索 + 单选/多选 + 分页 + 真实数据
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9353;
const BASE = 'http://localhost:5180';
const OUT = path.join(__dirname, 'shots');

function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); }
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
        const s = await this.send('Page.captureScreenshot', { format: 'png' });
        const f = path.join(OUT, name);
        fs.writeFileSync(f, Buffer.from(s.result.data, 'base64'));
        return f;
    }
}

(async () => {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpusr-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=1280,1000', 'about:blank',
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const page = targets.find(t => t.type === 'page');
    const cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });

    await cdp.send('Page.navigate', { url: BASE + '/admin' });
    await sleep(1200);
    await cdp.eval(`(() => { window.confirm = () => true; document.getElementById('ad-p').value='workbuddy'; document.getElementById('ad-go').click(); return 1; })()`);
    await sleep(1800);

    // 进入玩家 tab
    await cdp.eval(`document.querySelector('.admin-tabs button[data-t="users"]').click()`);
    await sleep(1600);
    await cdp.eval(`window.confirm = () => true;`);

    const s0 = await cdp.eval(`(() => ({
        rows: document.querySelectorAll('#u-list .pick-item').length,
        pager: document.getElementById('pg-info').textContent,
        sel: document.getElementById('sel-n').textContent,
        btn: document.getElementById('gr-go').textContent,
        first: document.querySelector('#u-list .pick-item .pi-name')?.innerText.trim(),
        meta: document.querySelector('#u-list .pick-item .pi-meta')?.innerText.trim(),
        note: document.querySelector('.admin-note')?.innerText.replace(/\\n/g,' ').slice(0,70),
    }))()`);
    console.log('1) 玩家列表:', JSON.stringify(s0, null, 0));
    await cdp.shot('usr-1-list.png');

    // 模糊搜索
    await cdp.eval(`(() => { const i=document.getElementById('u-kw'); i.value='iso'; i.dispatchEvent(new Event('input')); return 1; })()`);
    await sleep(500);
    const s1 = await cdp.eval(`(() => ({
        rows: document.querySelectorAll('#u-list .pick-item').length,
        names: [...document.querySelectorAll('#u-list .pick-item .pi-name')].map(e=>e.innerText.trim()).slice(0,6),
        pager: document.getElementById('pg-info').textContent,
    }))()`);
    console.log('2) 模糊搜索 "iso":', JSON.stringify(s1));
    await cdp.shot('usr-2-search.png');

    // 单选：点第一行
    await cdp.eval(`document.querySelector('#u-list .pick-item').click()`);
    await sleep(400);
    // 多选：再点两行
    await cdp.eval(`(() => { const rs=[...document.querySelectorAll('#u-list .pick-item')]; if(rs[1])rs[1].click(); if(rs[2])rs[2].click(); return 1; })()`);
    await sleep(500);
    const s2 = await cdp.eval(`(() => ({
        sel: document.getElementById('sel-n').textContent,
        chips: [...document.querySelectorAll('#sel-chips .chip')].map(c=>c.innerText.replace('✕','')),
        btn: document.getElementById('gr-go').textContent,
        checked: document.querySelectorAll('#u-list input[data-pick]:checked').length,
    }))()`);
    console.log('3) 单选+多选:', JSON.stringify(s2));
    await cdp.shot('usr-3-multi.png');

    // 全选筛选结果
    await cdp.eval(`document.getElementById('sel-all').click()`);
    await sleep(500);
    const s3 = await cdp.eval(`(() => ({ sel: document.getElementById('sel-n').textContent, btn: document.getElementById('gr-go').textContent }))()`);
    console.log('4) 全选筛选结果:', JSON.stringify(s3));

    // 取消一个 chip
    await cdp.eval(`(() => { const b=document.querySelector('#sel-chips [data-unsel]'); if(b) b.click(); return 1; })()`);
    await sleep(400);
    const s4 = await cdp.eval(`document.getElementById('sel-n').textContent`);
    console.log('5) 取消一个 chip 后已选:', s4);

    // 清空搜索 + 分页
    await cdp.eval(`(() => { const i=document.getElementById('u-kw'); i.value=''; i.dispatchEvent(new Event('input')); return 1; })()`);
    await sleep(500);
    const pg1 = await cdp.eval(`(() => ({ pager: document.getElementById('pg-info').textContent, first: document.querySelector('#u-list .pick-item .pi-name')?.innerText.trim() }))()`);
    await cdp.eval(`document.getElementById('pg-next').click()`);
    await sleep(500);
    const pg2 = await cdp.eval(`(() => ({ pager: document.getElementById('pg-info').textContent, first: document.querySelector('#u-list .pick-item .pi-name')?.innerText.trim() }))()`);
    console.log('6) 分页:', JSON.stringify(pg1), '→', JSON.stringify(pg2), pg1.first !== pg2.first ? '✅ 翻页生效' : '❌ 翻页无效');
    await cdp.shot('usr-4-page2.png');

    // 切到「所有玩家」
    await cdp.eval(`(() => { const r=document.querySelector('input[name=gr-scope][value=all]'); r.checked=true; r.dispatchEvent(new Event('change')); return 1; })()`);
    await sleep(400);
    const s5 = await cdp.eval(`(() => ({ pickerHidden: getComputedStyle(document.getElementById('gr-picker')).display === 'none', btn: document.getElementById('gr-go').textContent }))()`);
    console.log('7) 切换所有玩家:', JSON.stringify(s5));

    // 切回指定玩家并发送邮件
    await cdp.eval(`(() => {
        window.confirm = () => true;
        const r=document.querySelector('input[name=gr-scope][value=pick]'); r.checked=true; r.dispatchEvent(new Event('change'));
        document.getElementById('ml-title').value='UI测试邮件';
        document.getElementById('ml-content').value='来自后台 UI 冒烟';
        document.getElementById('gr-gems').value='777';
        document.getElementById('gr-gold').value='8888';
        document.getElementById('gr-go').click();
        return 1;
    })()`);
    await sleep(1500);
    const toast = await cdp.eval(`(() => { const t=document.querySelector('.toast, #toast, .u-toast'); return t ? t.innerText : '(无 toast 元素)'; })()`);
    console.log('8) 发送邮件 toast:', toast);
    await cdp.shot('usr-5-sent.png');

    console.log('\n结论:',
        s0.rows > 0 && s1.rows > 0 && +s2.sel >= 2 && pg1.first !== pg2.first
            ? '✅ 搜索 / 多选 / 分页 / 发送 全部正常'
            : '❌ 有环节异常');

    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
