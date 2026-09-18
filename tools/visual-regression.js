/* 视觉回归（F2）：首跑 --baseline 建立基线（8x8 感知哈希 + 截图），
 * 之后默认跑对比当前与基线，报告「画崩」的游戏（哈希汉明距离超阈值）。
 * 用法：
 *   node tools/visual-regression.js --baseline            # 建立基线
 *   node tools/visual-regression.js                        # 全量对比
 *   node tools/visual-regression.js --shot gomoku,snake    # 指定游戏
 */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const WebSocket = require('ws');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9404, BASE = 'http://127.0.0.1:5180';
const OUT = path.join(__dirname, 'shots');
const BASE_DIR = path.join(OUT, 'vreg-baseline');
const CUR_DIR = path.join(OUT, 'vreg-current');
const MANIFEST = path.join(BASE_DIR, 'manifest.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const MODE_BASE = argv.includes('--baseline');
const SHOT_ONLY = (() => { const i = argv.indexOf('--shot'); return i >= 0 ? argv[i + 1] : null; })();
const THRESH = 8; // 64 位哈希中超过 8 位不同即判为「画崩」

function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej)); }
function hamming(a, b) { if (!a || !b || a.length !== b.length) return 99; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; }

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); }
    static async connect(u) { const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); const c = new CDP(ws); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && c.waiters.has(m.id)) { c.waiters.get(m.id)(m); c.waiters.delete(m.id); } }; return c; }
    send(m, p = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method: m, params: p })); return new Promise(r => this.waiters.set(id, r)); }
    async phash(b64) {
        const expr = "(function(){return new Promise(function(res){var img=new Image();img.onload=function(){var c=document.createElement('canvas');c.width=c.height=8;var x=c.getContext('2d');x.drawImage(img,0,0,8,8);var d=x.getImageData(0,0,8,8).data;var h='';for(var i=0;i<d.length;i+=4){h+=((d[i]+d[i+1]+d[i+2])/3>128?'1':'0');}res(h);};img.onerror=function(){res('');};img.src='data:image/png;base64," + b64 + "';});})()";
        const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        const v = r.result && r.result.result ? r.result.result.value : '';
        return v || '';
    }
}

(async () => {
    fs.mkdirSync(CUR_DIR, { recursive: true });
    if (MODE_BASE) fs.mkdirSync(BASE_DIR, { recursive: true });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpvreg-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 40; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json/list`); if (t && t.length) break; } catch (e) {} await sleep(250); }
    const cdp = await CDP.connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 940, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE + '/' }); await sleep(2600);
    let all = [];
    for (let i = 0; i < 40; i++) { all = await cdp.send('Runtime.evaluate', { expression: '(()=>{try{return (typeof GAMES!=="undefined"&&GAMES)?GAMES.map(g=>g.id):[]}catch(e){return[]}})()' }).then(r => r.result && r.result.result ? r.result.result.value : []); if (all.length) break; await sleep(200); }
    if (!all.length) { console.error('❌ 拿不到 GAMES'); proc.kill(); process.exit(1); }
    const targets = SHOT_ONLY ? SHOT_ONLY.split(',').map(s => s.trim()) : all;
    const base = MODE_BASE ? {} : (fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {});
    const cur = {};
    const changed = [], missing = [];
    console.log(`— ${MODE_BASE ? '建立基线' : '对比'}：共 ${all.length} 款，本次 ${targets.length} 款 —\n`);
    for (let i = 0; i < targets.length; i++) {
        const id = targets[i];
        if (i > 0 && i % 25 === 0) { await cdp.send('Page.navigate', { url: BASE + '/?g=pinball' }); await sleep(2400); }
        await cdp.send('Runtime.evaluate', { expression: `(()=>{try{const g=((typeof GAMES!=="undefined"&&GAMES)||[]).find(x=>x.id===${JSON.stringify(id)});if(!g)return;if(window.MinigamesView&&window.MinigamesView.launch)window.MinigamesView.launch(g);else if(window.MiniGames&&window.MiniGames.launch)window.MiniGames.launch(g);else if(window.OpenGame)window.OpenGame(g);}catch(e){}})()` });
        await sleep(900);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        const b64 = shot.result.data;
        const hash = await cdp.phash(b64);
        cur[id] = hash;
        if (MODE_BASE) fs.writeFileSync(path.join(BASE_DIR, `g-${id}.png`), Buffer.from(b64, 'base64'));
        else {
            fs.writeFileSync(path.join(CUR_DIR, `g-${id}.png`), Buffer.from(b64, 'base64'));
            const prev = base[id];
            if (!prev) missing.push(id);
            else { const d = hamming(hash, prev); if (d > THRESH) changed.push([id, d]); }
        }
        process.stdout.write(`[${i + 1}/${targets.length}] ${id.padEnd(18)} ${MODE_BASE ? 'baseline' : (base[id] ? (hamming(hash, base[id]) > THRESH ? '⚠ 画崩 d=' + hamming(hash, base[id]) : '✅') : '· 无基线')}\n`);
    }
    fs.writeFileSync(MODE_BASE ? MANIFEST : path.join(CUR_DIR, 'manifest.json'), JSON.stringify(cur, null, 0));
    if (!MODE_BASE) {
        console.log(`\n=========== 视觉回归汇总 ===========`);
        console.log(`对比：${targets.length} 款　无基线：${missing.length}　画崩：${changed.length}`);
        if (changed.length) { console.log('\n⚠ 画崩清单（汉明距离 > ' + THRESH + '）：'); changed.forEach(([id, d]) => console.log(`   ${id.padEnd(20)} d=${d}`)); }
        else console.log('✅ 无画崩');
    }
    proc.kill();
    process.exit(changed.length ? 1 : 0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
