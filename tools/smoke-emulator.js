// 模拟器（EmulatorJS + 服务端 ROM 库）端到端冒烟
//   node tools/smoke-emulator.js
// 架构：管理员 HTTP API 上传 ROM → 服务器 data/roms/ 落盘 → 玩家浏览器列表/播放（无导入区）
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://127.0.0.1:5180';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(__dirname, 'shots');
const PORT = 9359;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const assert = (cond, label) => { if (cond) { passed++; console.log('  ✔', label); } else { failed++; console.log('  ✗', label); } };

function req(method, p, body, headers) {
    return new Promise((resolve, reject) => {
        const data = body == null ? null : (Buffer.isBuffer(body) ? body : JSON.stringify(body));
        const h = Object.assign({}, data && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}, headers || {});
        if (data) h['Content-Length'] = data.length;
        const r = http.request(BASE + p, { method, headers: h }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}
function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } }); }).on('error', reject);
    });
}

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } };
        return c;
    }
    send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise(res => this.waiters.set(id, res)); }
    async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
    async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('   📷', path.basename(file), fs.statSync(file).size + ' B'); }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const stamp = Date.now().toString().slice(-8);

    // ① 管理员登录 + 上传测试 ROM
    console.log('\n① 管理员上传 ROM（HTTP API）');
    const ad = await req('POST', '/api/admin/login', { username: 'admin', password: 'workbuddy' });
    const adminToken = JSON.parse(ad.body).token;
    assert(adminToken, '管理员登录成功');
    const romBuf = Buffer.alloc(40976, 7);
    const up = await req('POST', '/api/roms/upload?name=' + encodeURIComponent('smoke-魂斗罗测试.nes') + '&core=nes', romBuf,
        { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/octet-stream' });
    const upJson = JSON.parse(up.body);
    assert(up.status === 200 && upJson.id, 'ROM 上传成功（' + upJson.size + ' 字节落盘）');
    const romId = upJson.id;

    // ② 玩家注册（普通账号，非管理员）
    const reg = await req('POST', '/api/register', { username: 'emutest' + stamp, password: '1234' });
    const playerToken = JSON.parse(reg.body).token;
    assert(playerToken, '玩家注册成功');

    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT,
        '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + path.join(os.tmpdir(), 'emu-smoke-' + stamp),
        '--disable-gpu', '--window-size=420,880', 'about:blank',
    ], { stdio: 'ignore' });
    process.on('exit', () => { try { chrome.kill(); } catch (e) {} });

    let targets = null;
    for (let i = 0; i < 40; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) {}
        await sleep(250);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 880, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1800);
    await cdp.eval(`localStorage.setItem('game-token', ${JSON.stringify(playerToken)})`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(2000);

    // ③ 玩家进入模拟器（设置面板 → 小游戏 → 模拟器卡片）
    console.log('\n② 玩家视角：列表可见 · 无导入区');
    await cdp.eval(`document.getElementById('btn-avatar').click()`);
    await sleep(500);
    await cdp.eval(`document.getElementById('pi-settings').click()`);
    await sleep(500);
    await cdp.eval(`document.querySelector('.set-tile[data-act="mini"]').click()`);
    await sleep(1200);
    const cardOk = await cdp.eval(`(() => {
        const emu = Array.from(document.querySelectorAll('.mini-card')).find(c => c.dataset.id === 'emulator');
        return { found: !!emu, name: emu ? emu.querySelector('.mini-name').textContent : '' };
    })()`);
    assert(cardOk.found, '模拟器卡片在列表中：' + cardOk.name);
    await cdp.eval(`document.querySelector('.mini-card[data-id="emulator"]').click()`);
    await sleep(1000);

    const playerView = await cdp.eval(`(() => ({
        item: !!document.querySelector('.emu-item'),
        name: (document.querySelector('.emu-item-name') || {}).textContent || '',
        meta: (document.querySelector('.emu-item-meta') || {}).textContent || '',
        drop: !!document.querySelector('.emu-drop'),
        del: !!document.querySelector('.emu-btn-del'),
        play: !!document.querySelector('.emu-btn-play'),
    }))()`);
    assert(playerView.item && /魂斗罗测试/.test(playerView.name), '玩家看到管理员上传的 ROM：' + playerView.name);
    assert(/FC/.test(playerView.meta), '核心信息正确：' + playerView.meta);
    assert(!playerView.drop, '玩家端无导入区（仅管理员可见）');
    assert(!playerView.del, '玩家端无删除按钮');
    assert(playerView.play, '玩家有播放按钮');
    await cdp.shot(path.join(OUT, 'emu-player-list.png'));

    // ④ 玩家播放：鉴权下载 → blob → EmulatorJS iframe
    console.log('\n③ 玩家播放（服务端下载 → blob → EmulatorJS）');
    await cdp.eval(`document.querySelector('.emu-btn-play').click()`);
    await sleep(1500);
    const playOk = await cdp.eval(`(() => {
        const f = document.querySelector('.emu-frame');
        return {
            frame: !!f,
            srcdoc: f ? (f.getAttribute('srcdoc') || '') : '',
            bar: !!document.querySelector('.emu-playbar'),
        };
    })()`);
    assert(playOk.frame, '模拟器 iframe 创建');
    assert(/EJS_core="nes"/.test(playOk.srcdoc), 'iframe 配置：EJS_core=nes');
    assert(/EJS_gameUrl="blob:/.test(playOk.srcdoc), 'ROM 经鉴权下载转 blob URL');

    // ⑤ 等 EmulatorJS 引擎加载（联网 ~5-15s）
    console.log('\n④ 等待 EmulatorJS 引擎加载（需联网）…');
    await sleep(12000);
    const engineState = await cdp.eval(`(() => {
        const f = document.querySelector('.emu-frame');
        if (!f || !f.contentDocument) return { doc: false };
        const d = f.contentDocument;
        return { doc: true, canvas: !!d.querySelector('canvas'), menus: d.querySelectorAll('[class*=ejs]').length };
    })()`);
    if (engineState.doc && (engineState.canvas || engineState.menus > 0)) {
        assert(true, 'EmulatorJS 引擎已加载' + (engineState.canvas ? '（canvas 已创建）' : '（UI 已渲染）'));
        await cdp.shot(path.join(OUT, 'emu-player-playing.png'));
    } else {
        console.log('  ℹ 引擎未在 12s 内加载完（无外网或核心下载慢）——iframe 配置已验证');
    }

    // ⑥ 管理员删除 → 玩家刷新后列表变空
    console.log('\n⑤ 管理员删除 → 玩家列表同步');
    const del = await req('POST', '/api/roms/delete', { id: romId }, { Authorization: 'Bearer ' + adminToken });
    assert(del.status === 200, '管理员删除 ROM 成功');
    await cdp.eval(`document.querySelector('.emu-playbar .emu-btn-back').click()`);
    await sleep(1000);
    const afterDel = await cdp.eval(`(() => ({
        items: document.querySelectorAll('.emu-item').length,
        empty: (document.querySelector('.emu-empty') || {}).textContent || '',
        drop: !!document.querySelector('.emu-drop'),
    }))()`);
    assert(afterDel.items === 0, '玩家列表已清空');
    assert(/管理员还没有上传/.test(afterDel.empty), '空态文案正确：' + afterDel.empty.trim().slice(0, 14) + '…');
    assert(!afterDel.drop, '玩家端仍无导入区');
    await cdp.shot(path.join(OUT, 'emu-player-empty.png'));

    console.log(`\n===== 冒烟结果：${passed} 通过 / ${failed} 失败 =====`);
    try { chrome.kill(); } catch (e) {}
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('冒烟异常：', e); process.exit(1); });
