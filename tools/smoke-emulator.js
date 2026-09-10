// 模拟器 ROM 全链路冒烟（后台管理页 + 玩家端）
//   node tools/smoke-emulator.js
// 链路：/admin 模拟器ROM 标签页上传（.nes 自动识别 / .zip 核心选择）→ 玩家端列表可见可玩 → 后台删除 → 玩家端清空
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'http://127.0.0.1:5180';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(__dirname, 'shots');
const PORT = 9359;
const TAG = 'emu-smoke-';                       // 唯一名前缀，仅清理/断言本测试上传的 ROM
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const assert = (cond, label) => { if (cond) { passed++; console.log('  ✔', label); } else { failed++; console.log('  ✗', label); } };

function postJSON(p, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } });
        });
        req.on('error', reject); req.write(data); req.end();
    });
}
function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } });
        }).on('error', reject);
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

    // ① API 拿令牌（admin-token 与 game-token 是不同 localStorage key，可共存同浏览器）
    console.log('\n① 准备账号');
    const ad = await postJSON('/api/admin/login', { username: 'admin', password: 'workbuddy' });
    assert(ad.token, '管理员登录（API）');
    const reg = await postJSON('/api/register', { username: 'emutest' + stamp, password: '1234' });
    const playerToken = reg.token;
    assert(playerToken, '玩家注册（API）');

    // ①.b 清掉上一轮冒烟残留（仅以 TAG 为前缀的 ROM，玩家手动上传的不动）
    const cleanup = (token) => {
        return new Promise((resolve) => {
            http.get(BASE + '/api/roms', { headers: { Authorization: 'Bearer ' + token } }, res => {
                let d = ''; res.on('data', c => d += c); res.on('end', async () => {
                    try {
                        const list = JSON.parse(d).roms.filter(r => r.name.indexOf(TAG) === 0);
                        for (const r of list) await postJSON('/api/roms/delete', { id: r.id });
                        console.log(`  ℹ 清理上轮残留 ${list.length} 个`);
                    } catch (e) {}
                    resolve();
                });
            }).on('error', () => resolve());
        });
    };
    await cleanup(ad.token);

    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT,
        '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + path.join(os.tmpdir(), 'emu-smoke-' + stamp),
        '--disable-gpu', '--window-size=1100,880', 'about:blank',
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

    // ② 后台：/admin → 模拟器ROM 标签
    console.log('\n② 管理后台：模拟器ROM 标签页');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 880, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: BASE + '/admin' });
    await sleep(1500);
    await cdp.eval(`localStorage.setItem('admin-token', ${JSON.stringify(ad.token)})`);
    await cdp.send('Page.navigate', { url: BASE + '/admin' });
    await sleep(1800);
    const tabOk = await cdp.eval(`(() => ({
        main: !document.getElementById('ad-main').classList.contains('hidden'),
        romTab: !!Array.from(document.querySelectorAll('.admin-tabs button')).find(b => b.dataset.t === 'roms'),
    }))()`);
    assert(tabOk.main, '后台已登录（token 注入）');
    assert(tabOk.romTab, '「模拟器ROM」标签存在');
    await cdp.eval(`Array.from(document.querySelectorAll('.admin-tabs button')).find(b => b.dataset.t === 'roms').click()`);
    await sleep(900);
    const romTab = await cdp.eval(`(() => ({
        drop: !!document.querySelector('#rom-drop'),
        input: !!document.querySelector('#rom-file'),
        list: !!document.querySelector('#rom-list'),
    }))()`);
    assert(romTab.drop && romTab.input, '拖入区 + 文件选择框');
    assert(romTab.list, 'ROM 列表容器');
    await cdp.shot(path.join(OUT, 'emu-admin-tab.png'));

    // ③ 后台上传 .nes（DataTransfer 模拟选文件 → 自动识别 FC 核心）
    const nesName = TAG + 'contra-' + stamp + '.nes';
    console.log('\n③ 后台上传 .nes（自动识别 FC）');
    await cdp.eval(`(() => {
        const input = document.querySelector('#rom-file');
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(40976)], ${JSON.stringify(nesName)}));
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
    })()`);
    await sleep(1200);
    const nesOk = await cdp.eval(`(() => {
        const rows = Array.from(document.querySelectorAll('.emu-item'));
        const mine = rows.find(r => (r.querySelector('.emu-item-name') || {}).textContent === ${JSON.stringify(nesName)});
        return {
            count: document.querySelector('#rom-count').textContent,
            name: mine ? mine.querySelector('.emu-item-name').textContent : '',
            meta: mine ? mine.querySelector('.emu-item-meta').textContent : '',
        };
    })()`);
    assert(nesOk.name === nesName, '列表出现：' + (nesOk.name || '<缺失>'));
    assert(/FC/.test(nesOk.meta), '核心自动识别：' + (nesOk.meta.split('·')[0] || '').trim());
    await cdp.shot(path.join(OUT, 'emu-admin-uploaded.png'));

    // ④ 后台上传 .zip → 核心选择器 → 选 DOS
    const zipName = TAG + 'dos-' + stamp + '.zip';
    console.log('\n④ 后台上传 .zip → 核心选择器 → DOS');
    await cdp.eval(`(() => {
        const input = document.querySelector('#rom-file');
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(2048)], ${JSON.stringify(zipName)}));
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
    })()`);
    await sleep(800);
    const pickerOk = await cdp.eval(`(() => ({
        shown: document.querySelector('#rom-core-pick').style.display !== 'none',
        btns: document.querySelectorAll('.emu-core-btn').length,
    }))()`);
    assert(pickerOk.shown && pickerOk.btns === 9, '核心选择器出现（' + pickerOk.btns + ' 个核心）');
    await cdp.eval(`Array.from(document.querySelectorAll('[data-core]')).find(b => b.textContent.indexOf('DOS') >= 0).click()`);
    await sleep(1200);
    const zipOk = await cdp.eval(`(() => {
        const rows = Array.from(document.querySelectorAll('.emu-item'));
        const mine = rows.find(r => (r.querySelector('.emu-item-name') || {}).textContent === ${JSON.stringify(zipName)});
        return { meta: mine ? mine.querySelector('.emu-item-meta').textContent : '' };
    })()`);
    assert(/DOS/.test(zipOk.meta), 'zip 以 DOS 核心入库：' + (zipOk.meta.split('·')[0] || '').trim());
    await cdp.shot(path.join(OUT, 'emu-admin-zip.png'));

    // ⑤ 玩家端：设置面板 → 经典模拟器（独立入口 · 列表共享 · 无导入区）
    console.log('\n⑤ 玩家端：设置面板独立入口');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 880, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1800);
    await cdp.eval(`localStorage.setItem('game-token', ${JSON.stringify(playerToken)})`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(2000);

    // ⑤.a 先确认小游戏列表已无模拟器卡片
    await cdp.eval(`document.getElementById('btn-avatar').click()`);
    await sleep(500);
    await cdp.eval(`document.getElementById('pi-settings').click()`);
    await sleep(500);
    await cdp.eval(`document.querySelector('.set-tile[data-act="mini"]').click()`);
    await sleep(1400);
    const miniList = await cdp.eval(`(() => ({
        emu: document.querySelectorAll('.mini-card[data-id="emulator"]').length,
        total: document.querySelectorAll('.mini-card').length,
    }))()`);
    assert(miniList.emu === 0, '小游戏列表已无模拟器卡片（共 ' + miniList.total + ' 款）');
    await cdp.eval(`App.switchTab(App.tab)`);
    await sleep(600);

    // ⑤.b 设置面板 → 经典模拟器 tile（应紧挨在小游戏后面）
    await cdp.eval(`document.getElementById('btn-avatar').click()`);
    await sleep(500);
    await cdp.eval(`document.getElementById('pi-settings').click()`);
    await sleep(500);
    const setTiles = await cdp.eval(`(() => {
        const tiles = Array.from(document.querySelectorAll('.set-tile'));
        const idx = tiles.findIndex(t => t.dataset.act === 'mini');
        const emu = tiles.find(t => t.dataset.act === 'emu');
        return { emu: !!emu, afterMini: emu ? tiles.indexOf(emu) === idx + 1 : false };
    })()`);
    assert(setTiles.emu, '设置面板出现「经典模拟器」入口');
    assert(setTiles.afterMini, '入口位于「小游戏」后面');
    await cdp.shot(path.join(OUT, 'emu-settings-tile.png'));
    await cdp.eval(`document.querySelector('.set-tile[data-act="emu"]').click()`);
    await sleep(1200);

    const playerView = await cdp.eval(`(() => {
        const items = Array.from(document.querySelectorAll('.emu-item'));
        return {
            total: items.length,
            mine: items.filter(i => (i.querySelector('.emu-item-name') || {}).textContent && i.querySelector('.emu-item-name').textContent.indexOf(${JSON.stringify(TAG)}) === 0).length,
            names: items.map(i => (i.querySelector('.emu-item-name') || {}).textContent || ''),
            drop: !!document.querySelector('.emu-drop'),
            del: !!document.querySelector('.emu-btn-del'),
            play: document.querySelectorAll('.emu-btn-play').length,
            keys: !!document.querySelector('.emu-keys'),
            mask: !!document.getElementById('emu-mask'),
        };
    })()`);
    assert(playerView.mask, '独立全屏容器（mini-mask）打开');
    assert(playerView.keys, '键位说明区显示');
    assert(playerView.mine === 2 && playerView.names.some(n => n === nesName) && playerView.names.some(n => n === zipName), '玩家看到后台本轮上传的 2 个 ROM（总 ' + playerView.total + '）');
    assert(!playerView.drop, '玩家端无导入区');
    assert(!playerView.del, '玩家端无删除按钮');
    assert(playerView.play === playerView.total, '每个 ROM 一个播放按钮（' + playerView.play + '）');
    await cdp.shot(path.join(OUT, 'emu-player-list.png'));

    // ⑥ 玩家播放 nesName
    console.log('\n⑥ 玩家播放（鉴权下载 → blob → EmulatorJS）');
    await cdp.eval(`(() => {
        const row = Array.from(document.querySelectorAll('.emu-item')).find(i => (i.querySelector('.emu-item-name') || {}).textContent === ${JSON.stringify(nesName)});
        row.querySelector('.emu-btn-play').click();
    })()`);
    await sleep(1500);
    const playOk = await cdp.eval(`(() => {
        const f = document.querySelector('.emu-frame');
        return { frame: !!f, srcdoc: f ? (f.getAttribute('srcdoc') || '') : '' };
    })()`);
    assert(playOk.frame, '模拟器 iframe 创建');
    assert(/EJS_core="nes"/.test(playOk.srcdoc) && /EJS_gameUrl="blob:/.test(playOk.srcdoc), 'EJS_core=nes · ROM 走鉴权 blob');
    await sleep(10000);
    const engine = await cdp.eval(`(() => {
        const f = document.querySelector('.emu-frame');
        if (!f || !f.contentDocument) return { doc: false };
        return { doc: true, canvas: !!f.contentDocument.querySelector('canvas') };
    })()`);
    if (engine.doc && engine.canvas) {
        assert(true, 'EmulatorJS 引擎真实加载（canvas 已创建）');
        await cdp.shot(path.join(OUT, 'emu-player-playing.png'));

        // ⑥.b 验证 iframe 全尺寸 + 控制设置 modal 打开后可见按键行
        const frameSize = await cdp.eval(`(() => {
            const f = document.querySelector('.emu-frame');
            return f ? { w: f.clientWidth, h: f.clientHeight } : null;
        })()`);
        assert(frameSize && frameSize.h > 600, '模拟器 iframe 填满可视区（' + (frameSize ? frameSize.w + 'x' + frameSize.h : '?') + '，之前因 flex 缺 min-height:0 一直只有 150）');

        // 打开控制设置 modal + 切到「键盘」子切换
        await cdp.eval(`(() => {
            const d = document.querySelector('.emu-frame').contentDocument;
            const vis = n => !!(n && n.getClientRects && n.getClientRects().length);
            const item = Array.from(d.querySelectorAll('*')).find(n => vis(n) && (n.textContent || '').trim() === '控制设置');
            if (item) item.click();
        })()`);
        await sleep(1500);
        await cdp.eval(`(() => {
            const d = document.querySelector('.emu-frame').contentDocument;
            const vis = n => !!(n && n.getClientRects && n.getClientRects().length);
            const kb = Array.from(d.querySelectorAll('*')).find(n => vis(n) && (n.textContent || '').trim() === '键盘');
            if (kb) kb.click();
        })()`);
        await sleep(700);
        const modalOk = await cdp.eval(`(() => {
            const d = document.querySelector('.emu-frame').contentDocument;
            const vis = n => !!(n && n.getClientRects && n.getClientRects().length);
            const rows = Array.from(d.querySelectorAll('*')).filter(n => vis(n) && /^(A|B|选择|开始|向上|向下|向左|向右|SWAP|EJECT|快速保存|快速加载|改变状态槽|快进|慢动作|快退)\\s*[:：]/.test((n.textContent || '').trim()) && n.textContent.length < 20);
            // EmulatorJS v4.2.3 设置按钮是 <a class="ejs_control_set_button">
            const setBtns = d.querySelectorAll('a.ejs_control_set_button').length;
            return { rows: rows.length, setBtns };
        })()`);
        assert(modalOk.rows >= 8, '控制设置 modal 可见按键行（A/B/选择/开始/向上…）共 ' + modalOk.rows + ' 行');
        assert(modalOk.setBtns >= 8, '每行右侧【设置】按钮可见 ' + modalOk.setBtns + ' 个（<a class="ejs_control_set_button">，修正 iframe 高度 bug 后全部显示）');
        await cdp.shot(path.join(OUT, 'emu-player-controls.png'));
    } else {
        console.log('  ℹ 引擎未在 10s 内加载完（无外网），iframe 配置已验证');
    }

    // ⑦ 后台删除本轮上传 → 玩家端同步清空
    console.log('\n⑦ 后台删除 → 玩家端同步清空');
    await cdp.eval(`document.querySelector('.emu-playbar .emu-btn-back').click()`);
    await sleep(600);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 880, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: BASE + '/admin' });
    await sleep(1800);
    await cdp.eval(`Array.from(document.querySelectorAll('.admin-tabs button')).find(b => b.dataset.t === 'roms').click()`);
    await sleep(900);
    await cdp.eval(`window.confirm = () => true;`);
    // 仅删本轮 TAG 前缀的
    let delCnt = 0;
    for (const nm of [nesName, zipName]) {
        const ok = await cdp.eval(`(() => {
            const row = Array.from(document.querySelectorAll('.emu-item')).find(i => (i.querySelector('.emu-item-name') || {}).textContent === ${JSON.stringify(nm)});
            if (!row) return false;
            row.querySelector('[data-del]').click();
            return true;
        })()`);
        if (ok) {
            delCnt++;
            // 等到该行从 DOM 中消失（确认删除 + 刷新完成）
            for (let t = 0; t < 20; t++) {
                await sleep(150);
                const still = await cdp.eval(`!!Array.from(document.querySelectorAll('.emu-item')).find(i => (i.querySelector('.emu-item-name') || {}).textContent === ${JSON.stringify(nm)})`);
                if (!still) break;
            }
        }
    }
    const afterDel = await cdp.eval(`(() => {
        const rows = Array.from(document.querySelectorAll('.emu-item'));
        const mine = rows.filter(i => (i.querySelector('.emu-item-name') || {}).textContent && i.querySelector('.emu-item-name').textContent.indexOf(${JSON.stringify(TAG)}) === 0);
        return mine.length;
    })()`);
    assert(afterDel === 0, '本轮 ' + delCnt + ' 个已删除（实际残留 ' + afterDel + '）');
    await cdp.shot(path.join(OUT, 'emu-admin-deleted.png'));

    // 最终清理
    await cleanup(ad.token);

    console.log(`\n===== 冒烟结果：${passed} 通过 / ${failed} 失败 =====`);
    try { chrome.kill(); } catch (e) {}
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('冒烟异常：', e); process.exit(1); });
