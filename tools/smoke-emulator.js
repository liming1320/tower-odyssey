// 模拟器（EmulatorJS + ROM 管理器）端到端冒烟
//   node tools/smoke-emulator.js
// 验证：卡片入口 → 管理器渲染 → .nes 导入自动识别核心 → 播放 iframe → zip 核心选择器
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

function postJSON(p, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(p, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } });
        });
        req.on('error', reject); req.write(data); req.end();
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
    const u = 'emutest' + stamp;
    const reg = await postJSON(BASE + '/api/register', { username: u, password: '1234' });
    assert(reg.token, '注册测试账号成功');
    const token = reg.token;

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
    await cdp.eval(`localStorage.setItem('game-token', ${JSON.stringify(token)})`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(2000);

    // ① 通过设置面板进入小游戏页（pi-settings → set-tile data-act="mini"）
    console.log('\n① 通过设置面板进入小游戏');
    await cdp.eval(`document.getElementById('btn-avatar').click()`);
    await sleep(500);
    await cdp.eval(`document.getElementById('pi-settings').click()`);
    await sleep(500);
    await cdp.eval(`document.querySelector('.set-tile[data-act="mini"]').click()`);
    await sleep(1200);
    const cardOk = await cdp.eval(`(() => {
        const cards = Array.from(document.querySelectorAll('.mini-card'));
        const emu = cards.find(c => c.dataset.id === 'emulator');
        return { found: !!emu, name: emu ? emu.querySelector('.mini-name').textContent : '', total: cards.length };
    })()`);
    assert(cardOk.found, `模拟器卡片在列表中（共 ${cardOk.total} 款）`);
    assert(/模拟器/.test(cardOk.name), '卡片名称：' + cardOk.name);

    // ② 点进管理器
    console.log('\n② ROM 管理器渲染');
    await cdp.eval(`document.querySelector('.mini-card[data-id="emulator"]').click()`);
    await sleep(900);
    const mgrOk = await cdp.eval(`(() => ({
        note: !!document.querySelector('.emu-note'),
        drop: !!document.querySelector('.emu-drop'),
        input: !!document.querySelector('.emu-drop input[type=file]'),
        empty: !!document.querySelector('.emu-empty'),
    }))()`);
    assert(mgrOk.note, '说明面板渲染');
    assert(mgrOk.drop && mgrOk.input, '导入区 + 文件选择框');
    assert(mgrOk.empty, '空库提示');
    await cdp.shot(path.join(OUT, 'emu-manager.png'));

    // ③ 导入 .nes（DataTransfer 模拟选文件）→ 自动识别 nes 核心
    console.log('\n③ 导入 demo.nes → 自动识别 FC 核心');
    await cdp.eval(`(() => {
        const input = document.querySelector('.emu-drop input[type=file]');
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(40976)], 'demo.nes'));   // iNES 大小
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
    })()`);
    await sleep(900);
    const itemOk = await cdp.eval(`(() => {
        const items = Array.from(document.querySelectorAll('.emu-item'));
        const it = items[0];
        return {
            count: items.length,
            name: it ? it.querySelector('.emu-item-name').textContent : '',
            meta: it ? it.querySelector('.emu-item-meta').textContent : '',
            play: !!document.querySelector('.emu-btn-play'),
        };
    })()`);
    assert(itemOk.count === 1 && itemOk.name === 'demo.nes', 'ROM 出现在列表：' + itemOk.name);
    assert(/FC/.test(itemOk.meta), '核心自动识别：' + itemOk.meta);
    await cdp.shot(path.join(OUT, 'emu-imported.png'));

    // ④ 持久化验证（IndexedDB）
    const persisted = await cdp.eval(`new Promise(res => {
        const r = indexedDB.open('tower-roms', 1);
        r.onsuccess = () => { const db = r.result; const t = db.transaction('roms').objectStore('roms').getAll(); t.onsuccess = () => { db.close(); res(t.result.length); }; };
    })`);
    assert(persisted === 1, 'ROM 已存入 IndexedDB（刷新后仍在）');

    // ⑤ 播放 → iframe + EmulatorJS 配置
    console.log('\n④ 播放：iframe 内嵌 EmulatorJS');
    await cdp.eval(`document.querySelector('.emu-btn-play').click()`);
    await sleep(600);
    const playOk = await cdp.eval(`(() => {
        const f = document.querySelector('.emu-frame');
        return {
            frame: !!f,
            bar: !!document.querySelector('.emu-playbar'),
            srcdoc: f ? (f.getAttribute('srcdoc') || '') : '',
        };
    })()`);
    assert(playOk.frame, '模拟器 iframe 创建');
    assert(/EJS_core="nes"/.test(playOk.srcdoc), 'iframe 配置：EJS_core=nes');
    assert(/EJS_pathtodata/.test(playOk.srcdoc), 'iframe 配置：CDN 数据路径');
    assert(/EJS_gameUrl="blob:/.test(playOk.srcdoc), 'iframe 配置：ROM 走 blob URL');
    assert(playOk.bar, '返回列表条');

    // 等待 EmulatorJS 引擎从 CDN 加载（联网时 ~5-15s；不联网则跳过）
    console.log('\n⑤ 等待 EmulatorJS 引擎加载（需联网）…');
    await sleep(12000);
    const engineState = await cdp.eval(`(() => {
        const f = document.querySelector('.emu-frame');
        if (!f || !f.contentDocument) return { doc: false };
        const d = f.contentDocument;
        return {
            doc: true,
            gameDiv: !!d.getElementById('game'),
            canvas: !!d.querySelector('canvas'),
            menus: d.querySelectorAll('.ejs_menuBar, [class*=ejs]').length,
        };
    })()`);
    if (engineState.doc && (engineState.canvas || engineState.menus > 0)) {
        assert(true, 'EmulatorJS 引擎已加载' + (engineState.canvas ? '（canvas 已创建）' : '（UI 已渲染）'));
        await cdp.shot(path.join(OUT, 'emu-playing.png'));
    } else {
        console.log('  ℹ 引擎未在 12s 内加载完（无外网或核心下载慢）——iframe 配置已验证，跳过截图');
    }

    // ⑥ 返回列表 + zip 核心选择器
    console.log('\n⑥ zip 导入 → 核心选择器');
    await cdp.eval(`document.querySelector('.emu-playbar .emu-btn-back').click()`);
    await sleep(600);
    await cdp.eval(`(() => {
        const input = document.querySelector('.emu-drop input[type=file]');
        if (!input) return false;
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(2048)], 'game.zip'));
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
        return true;
    })()`);
    await sleep(700);
    const pickerOk = await cdp.eval(`(() => ({
        row: !!document.querySelector('.emu-core-row'),
        btns: document.querySelectorAll('.emu-core-btn').length,
        hot: !!document.querySelector('.emu-core-hot'),
    }))()`);
    assert(pickerOk.row && pickerOk.btns === 9, '核心选择器出现（' + pickerOk.btns + ' 个核心）');
    assert(pickerOk.hot, 'FC 核心默认高亮');
    await cdp.shot(path.join(OUT, 'emu-corepick.png'));

    // ⑦ 选 dosbox 核心 → 入库
    await cdp.eval(`Array.from(document.querySelectorAll('.emu-core-btn')).find(b => b.textContent.indexOf('DOS') >= 0).click()`);
    await sleep(800);
    const dosOk = await cdp.eval(`Array.from(document.querySelectorAll('.emu-item-meta')).map(m => m.textContent)`);
    assert(dosOk.some(t => /DOS/.test(t)), 'zip 以 dosbox 核心入库：' + dosOk.join(' | '));

    // ⑧ 删除清场（避免污染浏览器存储）——此处 headless 临时目录会自动清，仅验证删除按钮
    const delCount = await cdp.eval(`document.querySelectorAll('.emu-btn-del').length`);
    assert(delCount === 2, '两个 ROM 均可删除');

    console.log(`\n===== 冒烟结果：${passed} 通过 / ${failed} 失败 =====`);
    try { chrome.kill(); } catch (e) {}
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('冒烟异常：', e); process.exit(1); });
