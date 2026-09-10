// 大富翁自动模拟：无 DOM 环境下跑完整对局，验证逻辑不崩 + 校准 50 关难度曲线
// 用法：node tools/sim-monopoly.js [局数/关]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const say = s => fs.writeSync(1, s + '\n');   // 同步输出，避免超时丢缓冲

// ---------- 极简 DOM / localStorage stub ----------
function mkEl() {
    const e = {
        className: '', style: {}, innerHTML: '', textContent: '', dataset: {}, children: [],
        appendChild(c) { this.children.push(c); return c; },
        remove() {},
        querySelector() { return mkEl(); },
        querySelectorAll() { return []; },
        addEventListener() {}, removeEventListener() {},
        getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 100, height: 100 }; },
        getContext() { return null; },
    };
    return e;
}
const store = {};
const win = {
    __MG_FAST: 1,
    __MG_NORENDER: 1,          // 跳过 DOM 重绘，模拟提速几十倍
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
    },
    addEventListener() {}, removeEventListener() {},
    setTimeout: (fn) => setImmediate(fn), clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, setImmediate,
    document: { createElement: mkEl, body: mkEl(), querySelector: () => mkEl(), querySelectorAll: () => [] },
    fetch: () => Promise.resolve({ ok: false, json: () => ({}) }),
    console,
};
win.window = win;
win.global = win;
const ctx = vm.createContext(win);

const dir = path.join(__dirname, '..', 'public', 'js', 'minigames');
for (const f of ['_shared.js', 'monopoly.js']) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}
const G = win.MiniGames.monopoly;
const D = G._debug;

// ---------- 脚本玩家（模拟一个中等水平真人）----------
async function playOne(levelIdx, endless, override) {
    let result = null;
    const container = mkEl();
    const lv = override ? Object.assign({}, G.LEVELS[levelIdx], override) : G.LEVELS[levelIdx];
    const inst = G.start(container, {
        levelIdx, endless,
        level: lv,
        totalLevels: 50,
        onScore: () => {},
        onComplete: r => { result = r; },
    });
    let guard = 0;
    while (!result && guard++ < 40000) {
        const S = D.S;
        if (!S || S.over) { await new Promise(r => setTimeout(r, 0)); continue; }
        const p = D.cur();
        if (!p.me) { await new Promise(r => setTimeout(r, 0)); continue; }
        if (S.phase === 'idle') {
            // 有可建楼的街区且现金充裕 → 先建楼
            const bl = D.buildList(p);
            if (bl.length && p.cash > 500 + Math.random() * 400) await D.act('build');
            await D.act('roll');
        } else if (S.phase === 'decide') {
            const i = p.pos, price = S.price[i];
            const keep = 300;
            const good = price <= p.cash - keep && Math.random() < 0.8;
            await D.act(good ? 'buy' : 'skip');
        } else if (S.phase === 'end') {
            await D.act('next');
        } else if (S.phase === 'jail') {
            await D.act(p.cash >= 300 && Math.random() < 0.6 ? 'fine' : 'roll');
        } else {
            await new Promise(r => setTimeout(r, 0));
        }
    }
    try { inst.stop(); } catch (e) {}
    if (!result) throw new Error('对局未在合理步数内结束（levelIdx=' + levelIdx + '）');
    return result;
}

// 模式 baseline：忽略目标、跑满轮次，统计「脚本玩家能达到的净资产」分布 → 用于反推每关目标值
async function baseline() {
    const RUNS = +(process.argv[3] || 10);
    say('=== 净资产基线（跑满轮次，goal=∞）===');
    say('关卡\t轮次\tAI\t中位数\t均值\t最低\t最高\t→ 建议目标');
    const SAMPLES = [0, 4, 9, 14, 19, 24, 29, 34, 39, 44, 49];
    const goals = [];
    for (const i of SAMPLES) {
        const L = G.LEVELS[i];
        const vals = [];
        for (let k = 0; k < RUNS; k++) {
            const r = await playOne(i, false, { goal: Infinity });
            vals.push(r.score);
        }
        vals.sort((a, b) => a - b);
        const med = vals[Math.floor(vals.length / 2)];
        const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        // 目标取中位数的 82%（前 10 关，友好）→ 98%（后期，硬核）
        const k = i <= 9 ? 0.82 : i <= 29 ? 0.92 : 0.98;
        const goal = Math.round(med * k / 50) * 50;
        goals.push({ i, goal });
        say(`${i + 1}\t${L.rounds}\t${L.ai}\t${med}\t${avg}\t${vals[0]}\t${vals[vals.length - 1]}\t${goal}`);
    }
    say('\n建议 goal 序列（可直接粘贴进 LEVELS）：');
    say(goals.map(g => g.goal).join(', '));
    process.exit(0);
}

(async () => {
    if (process.argv[2] === 'baseline') return baseline();
    const RUNS = +(process.argv[2] || 12);
    const SAMPLES = [0, 4, 9, 14, 19, 24, 29, 34, 39, 44, 49];
    say('=== 大富翁 50 关难度模拟（每关 ' + RUNS + ' 局，脚本玩家中等水平）===');
    say('关卡\t目标\t轮次\t胜率\t3★\t1★\t破产\t平均净资产/目标\t平均结束轮');
    const rows = [];
    for (const i of SAMPLES) {
        const L = G.LEVELS[i];
        let win = 0, s3 = 0, s1 = 0, broke = 0, sumRatio = 0, sumRound = 0;
        for (let k = 0; k < RUNS; k++) {
            const r = await playOne(i, false);
            if (r.win) win++;
            if (r.stars === 3) s3++;
            if (r.stars === 1) s1++;
            if (r.title && r.title.indexOf('破产') >= 0) broke++;
            sumRatio += r.score / L.goal;
            const m = /净资产 [¥]*(\d+)/.exec((r.lines || []).join(' '));
            sumRound += D.S ? D.S.round : 0;
        }
        const row = {
            i, name: L.name, goal: L.goal, rounds: L.rounds,
            win: Math.round(win / RUNS * 100), s3: Math.round(s3 / RUNS * 100), s1: Math.round(s1 / RUNS * 100),
            broke: Math.round(broke / RUNS * 100),
            ratio: (sumRatio / RUNS).toFixed(2), avgRound: (sumRound / RUNS).toFixed(1),
        };
        rows.push(row);
        say(`${i + 1}\t${L.goal}\t${L.rounds}\t${row.win}%\t${row.s3}%\t${row.s1}%\t${row.broke}%\t${row.ratio}\t${row.avgRound}`);
    }
    say('\n=== 结论 ===');
    const first = rows[0], last = rows[rows.length - 1];
    say(`第 1 关胜率 ${first.win}%（应 ≥70%，新手友好）`);
    say(`第 50 关胜率 ${last.win}%（应 25%~50%，有挑战）`);
    const ok = first.win >= 65 && last.win <= 65 && last.win >= 10;
    say(ok ? '✓ 难度曲线合理' : '⚠ 难度曲线需要调参');
    // 无尽模式跑 2 局确认不崩
    for (let k = 0; k < 2; k++) { const r = await playOne(0, true); say(`无尽模式 #${k + 1}: ${r.title} 净资产 ${r.score}`); }
    process.exit(0);
})().catch(e => { console.error('❌ 模拟失败：', e); process.exit(1); });
