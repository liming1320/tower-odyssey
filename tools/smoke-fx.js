// 零依赖 CDP 验证：
//  1) 战斗画面是否真的铺满全屏
//  2) 小怪是否从上往下走、怪物种类是否变多
//  3) 21 种英雄技能特效是否都能正常绘制（逐个强制触发，检查不报错）
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9341;
const BASE = 'http://localhost:5180';

function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.events = []; }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const c = new CDP(ws);
        ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); }
            else if (m.method) c.events.push(m);
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
}

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpfx-'));
    const proc = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`,
        '--window-size=420,900', 'about:blank',
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 70; i++) {
        try { targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (targets && targets.length) break; } catch (e) { }
        await sleep(250);
    }
    const page = targets.find(t => t.type === 'page');
    const cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');

    const errors = [];
    const origPush = cdp.events.push.bind(cdp.events);
    cdp.events.push = m => {
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            errors.push('[exception] ' + ((d.exception && d.exception.description) || d.text).split('\n')[0]);
        }
        return origPush(m);
    };

    // 注册并登录
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1200);
    await cdp.eval(`(async () => {
        const r = await (await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:'fx' + Date.now().toString().slice(-6), password:'1234'})})).json();
        localStorage.setItem('game-token', r.token);
        return 'ok';
    })()`);
    await cdp.send('Page.navigate', { url: BASE });
    await sleep(1500);

    // 抽 5 个英雄并全部上阵
    await cdp.eval(`(async () => {
        const T = localStorage.getItem('game-token');
        const H = { 'Content-Type':'application/json', Authorization:'Bearer ' + T };
        await fetch('/api/wish',{method:'POST',headers:H,body:JSON.stringify({count:10})});
        const h = await (await fetch('/api/heroes',{headers:H})).json();
        for (const o of h.owned.slice(0,5)) await fetch('/api/hero/equip',{method:'POST',headers:H,body:JSON.stringify({uid:o.uid})});
        return h.owned.length;
    })()`);

    // 记录战斗中被触发的技能特效
    await cdp.eval(`(() => {
        window.__fxLog = [];
        const orig = Battle.addFx.bind(Battle);
        Battle.addFx = (o) => { window.__fxLog.push(o.type); return orig(o); };
        return 'hooked';
    })()`);

    await cdp.eval(`document.querySelector('.bottomnav button[data-tab="tower"]').click()`);
    await sleep(1800);
    await cdp.eval(`(() => { const b=[...document.querySelectorAll('.floor-btn')].find(x=>!x.disabled); b.click(); return 1; })()`);
    await sleep(900);

    // ---- 1) 全屏检查 ----
    const screen = await cdp.eval(`(() => {
        const layer = document.getElementById('battle-layer');
        const c = document.querySelector('#battle-canvas');
        const r = layer.getBoundingClientRect();
        return {
            层可见: !layer.classList.contains('hidden'),
            层尺寸: Math.round(r.width) + 'x' + Math.round(r.height),
            视口: window.innerWidth + 'x' + window.innerHeight,
            画布显示: c.clientWidth + 'x' + c.clientHeight,
            画布占比: Math.round(c.clientHeight / window.innerHeight * 100) + '%',
            topY: Math.round(Battle.topY), groundY: Math.round(Battle.groundY),
            英雄数: Battle.heroes.length,
        };
    })()`);
    console.log('【全屏】', JSON.stringify(screen, null, 0));

    // ---- 2) 怪物下行 + 种类 ----
    console.log('【怪物】');
    const shapes = new Set();
    for (let i = 0; i < 6; i++) {
        const s = await cdp.eval(`(() => ({
            怪数: Battle.enemies.length,
            y: Battle.enemies.map(e => Math.round(e.y)).join(','),
            形状: Battle.enemies.map(e => e.shape).join(','),
        }))()`);
        s.形状.split(',').forEach(x => x && shapes.add(x));
        console.log('  ', JSON.stringify(s));
        await sleep(500);
    }

    const kinds = await cdp.eval(`(() => {
        const set = new Set();
        for (const w of Battle.waves) for (const e of w.enemies) set.add(e.shape);
        return [...set];
    })()`);
    console.log('  本关怪物形状种类:', kinds.join(' '));

    // 等技能 CD 走完，期间自动点掉「增益三选一」，直到通关或超时
    for (let i = 0; i < 70; i++) {
        await cdp.eval(`(() => {
            const a = document.querySelector('#buff-area');
            if (a && !a.classList.contains('hidden')) {
                const b = a.querySelector('.buff-item');
                if (b) { b.click(); return 'picked'; }
            }
            return 'none';
        })()`);
        await sleep(500);
        if (i % 4 === 0) {
            const hp = await cdp.eval(`(() => {
                const hs = Battle.heroes || [];
                if (!hs.length) return null;
                const tot = hs.reduce((s,h)=>s+h.maxHp,0);
                const cur = hs.reduce((s,h)=>s+Math.max(0,h.hp),0);
                return { 波: Battle.waveIdx+1, 怪: Battle.enemies.length,
                         我方血量: Math.round(cur/tot*100)+'%', 存活: hs.filter(h=>!h.dead).length };
            })()`);
            if (hp) console.log('   ', JSON.stringify(hp));
        }
        const done = await cdp.eval(`(() => {
            const layer = document.getElementById('battle-layer');
            return (layer && layer.classList.contains('hidden')) ? 'finished' : 'running';
        })()`);
        if (done === 'finished') break;
    }
    const fired = await cdp.eval(`[...new Set(window.__fxLog || [])]`);
    const fxCount = await cdp.eval(`(window.__fxLog || []).length`);
    console.log('【实战触发的特效】共', fxCount, '次 ·', fired.join(' ') || '(无)');
    const heroFx = await cdp.eval(`(Battle.heroes||[]).map(h => h.name + ':' + h.fx).join(' ')`);
    console.log('  上阵英雄特效:', heroFx);

    // ---- 4) 逐个强制触发 21 种特效，确认绘制都不崩 ----
    const all = ['slash', 'water', 'tidal', 'freeze', 'ice', 'heal', 'bloom', 'meteor', 'fire',
        'burn', 'dark', 'summon', 'thunder', 'bolt', 'laser', 'holy', 'shield', 'buff',
        'sound', 'wind', 'quake', 'paint'];
    const before = errors.length;
    for (const t of all) {
        await cdp.eval(`(() => {
            Battle.addFx({ type: '${t}', tint: '#ffd56b', dur: 0.5, impactAt: 0.1,
                src: { x: Battle.W/2, y: Battle.groundY - 40 },
                targets: Battle.enemies.slice(0, 2), onImpact: () => {} });
            return 1;
        })()`);
        await sleep(90);
    }
    await sleep(700);
    const fxErr = errors.length - before;
    console.log(`【特效巡检】共 ${all.length} 种，逐帧绘制 ${fxErr === 0 ? '全部正常，无异常' : fxErr + ' 个报错'}`);

    // ---- 5) 结算弹窗 ----
    const result = await cdp.eval(`(() => {
        const m = document.querySelector('#modal-root .modal h3');
        if (m) return m.textContent.trim();
        const layer = document.getElementById('battle-layer');
        return (layer && !layer.classList.contains('hidden')) ? '(战斗仍在进行)' : '(无结算)';
    })()`);
    console.log('【结算】', result);

    // ---- 6) 截图 ----
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const out = path.join('C:\\Users\\li\\Desktop', '战斗全屏特效核对.png');
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    console.log('截图已保存:', out);

    console.log('\n=== JS 报错 ===');
    console.log(errors.length ? errors.slice(0, 12).join('\n') : '无');

    cdp.ws.close(); proc.kill();
    setTimeout(() => process.exit(errors.length ? 1 : 0), 300);
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
