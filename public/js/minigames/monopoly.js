// 大富翁（2026-09-20 重制：《大富翁4》风格 · 40 格方盘 · 神明 + 卡牌）
// 1 名玩家 + 3 名 AI（阿土伯 / 钱夫人 / 孙小美 / 大老千）· 买地 / 集齐同色街区建楼 · 车站 / 水电 ·
// 机会 & 命运卡牌 · 神明（福神/财神/穷神/衰神/幸运星/土地公/天使/恶魔）· 自动存档（退出即存，回来续玩）
// 说明：原版《大富翁4》美术/立绘受版权保护，此处用干净的 CSS/emoji 还原其"观感与玩法"，非 1:1 复制。
window.MiniGames = window.MiniGames || {};
(function () {
    const MG = window.MG || {};
    // __MG_FAST=1（自动模拟/测试）时跳过所有动画等待
    const fast = () => typeof window !== 'undefined' && !!window.__MG_FAST;
    const sleep = ms => new Promise(r => setTimeout(r, fast() ? 0 : ms));
    const later = (fn, ms) => setTimeout(fn, fast() ? 0 : ms);
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const money = v => '¥' + Math.max(0, Math.round(v));
    const SAVE_KEY = 'mg-monopoly-save-v3';   // v3：40 格方盘，与旧 24 格存档不兼容

    // ---------------- 街区（同色集齐才能建楼）----------------
    const GROUPS = {
        brown:  { name: '老街', color: '#8b5a2b', house: 500 },
        cyan:   { name: '河畔', color: '#2f9bc4', house: 500 },
        pink:   { name: '闹市', color: '#cf5f95', house: 700 },
        orange: { name: '港埠', color: '#dd8537', house: 700 },
        red:    { name: '金坊', color: '#d44a41', house: 900 },
        yellow: { name: '学府', color: '#d8b62f', house: 900 },
        green:  { name: '科技', color: '#2f9d5b', house: 1100 },
        blue:   { name: '豪宅', color: '#3d6fd6', house: 1200 },
    };

    // 40 格方盘（11×11 外圈）：四角 = 起点(0) / 监狱(10) / 免费停车(20) / 进监狱(30)
    // 车站 ×4（i=5,15,24,35）· 水电 ×2（i=12,28）· 机会 ×4 / 命运 ×3 · 税 ×2 · 神明 ×4
    // 租金档位 [空地, 1房, 2房, 3房, 4房, 酒店]
    const CELLS = [
        { n: '起点',    t: 'go',       e: '🚩' },
        { n: '重庆南路', t: 'prop', e: '🏘️', g: 'brown',  p: 600,  r: [40, 200, 600, 1800, 3200, 4500] },
        { n: '机会',    t: 'chance',   e: '❓' },
        { n: '中华路',   t: 'prop', e: '🏘️', g: 'brown',  p: 600,  r: [40, 200, 600, 1800, 3200, 4500] },
        { n: '所得税',   t: 'tax',      e: '📜', v: 2000 },
        { n: '台北车站', t: 'station',  e: '🚉', p: 2000 },
        { n: '淡水河滨', t: 'prop', e: '🏞️', g: 'cyan',   p: 1000, r: [60, 300, 900, 2700, 4000, 5500] },
        { n: '命运',    t: 'fortune',  e: '🎴' },
        { n: '基隆河岸', t: 'prop', e: '🌊', g: 'cyan',   p: 1000, r: [60, 300, 900, 2700, 4000, 5500] },
        { n: '土地公庙', t: 'god',      e: '🏮' },
        { n: '监狱',    t: 'jail',     e: '🚔' },
        { n: '西门町',   t: 'prop', e: '🛍️', g: 'pink',   p: 1200, r: [80, 400, 1100, 3300, 5000, 7000] },
        { n: '电力公司', t: 'utility',  e: '💡', p: 1500 },
        { n: '忠孝东路', t: 'prop', e: '🏙️', g: 'pink',   p: 1400, r: [100, 500, 1500, 4500, 6250, 7500] },
        { n: '机会',    t: 'chance',   e: '❓' },
        { n: '台中车站', t: 'station',  e: '🚉', p: 2000 },
        { n: '高雄港',   t: 'prop', e: '⚓', g: 'orange', p: 1400, r: [100, 500, 1500, 4500, 6250, 7500] },
        { n: '城隍庙',   t: 'god',      e: '⛩️' },
        { n: '基隆港',   t: 'prop', e: '🛳️', g: 'orange', p: 1600, r: [120, 600, 1800, 5000, 7000, 9000] },
        { n: '命运',    t: 'fortune',  e: '🎴' },
        { n: '免费停车', t: 'park',     e: '🅿️' },
        { n: '金银岛',   t: 'prop', e: '🏝️', g: 'red',    p: 1800, r: [140, 700, 2000, 5500, 7500, 9500] },
        { n: '珠宝街',   t: 'prop', e: '💎', g: 'red',    p: 1800, r: [140, 700, 2000, 5500, 7500, 9500] },
        { n: '机会',    t: 'chance',   e: '❓' },
        { n: '台南车站', t: 'station',  e: '🚉', p: 2000 },
        { n: '大学城',   t: 'prop', e: '🎓', g: 'yellow', p: 2000, r: [160, 800, 2200, 6000, 8000, 10000] },
        { n: '书香路',   t: 'prop', e: '📚', g: 'yellow', p: 2200, r: [180, 900, 2500, 7000, 8750, 10500] },
        { n: '财神庙',   t: 'god',      e: '🧧' },
        { n: '自来水公司', t: 'utility', e: '🚰', p: 1500 },
        { n: '新竹科技', t: 'prop', e: '🔬', g: 'green',  p: 2200, r: [180, 900, 2500, 7000, 8750, 10500] },
        { n: '进监狱',   t: 'gotojail', e: '👮' },
        { n: '软件园',   t: 'prop', e: '💻', g: 'green',  p: 2400, r: [200, 1000, 3000, 7500, 9250, 11000] },
        { n: '命运',    t: 'fortune',  e: '🎴' },
        { n: '信义豪宅', t: 'prop', e: '🏛️', g: 'blue',   p: 2600, r: [220, 1100, 3200, 8000, 9750, 11500] },
        { n: '阳明山庄', t: 'prop', e: '⛰️', g: 'blue',   p: 2800, r: [240, 1200, 3400, 8500, 10250, 12000] },
        { n: '高雄车站', t: 'station',  e: '🚉', p: 2000 },
        { n: '机会',    t: 'chance',   e: '❓' },
        { n: '幸运神殿', t: 'god',      e: '🌟' },
        { n: '奢侈税',   t: 'tax',      e: '💸', v: 3000 },
        { n: '仁爱豪宅', t: 'prop', e: '🏰', g: 'blue',   p: 3000, r: [260, 1300, 3600, 9000, 11000, 13000] },
    ];
    const N = CELLS.length;                    // 40
    const GROUP_CELLS = {};
    CELLS.forEach((c, i) => { if (c.t === 'prop') (GROUP_CELLS[c.g] = GROUP_CELLS[c.g] || []).push(i); });
    const STATION_IDX = CELLS.map((c, i) => c.t === 'station' ? i : -1).filter(i => i >= 0);
    const UTILITY_IDX = CELLS.map((c, i) => c.t === 'utility' ? i : -1).filter(i => i >= 0);
    const JAIL = CELLS.findIndex(c => c.t === 'jail');
    const SALARY = 2000;                        // 经过起点工资
    const STATION_RENT = [0, 400, 1000, 2000, 4000];   // 按持有车站数

    // 11×11 方盘坐标：起点(0)在右下角，逆时针 底行右→左 / 左列下→上 / 顶行左→右 / 右列上→下
    function cellPos(i) {
        if (i <= 9)  return { r: 11, c: 11 - i };          // 底行：i=0→(11,11) 右下角
        if (i <= 19) return { r: 11 - (i - 10), c: 1 };    // 左列
        if (i <= 29) return { r: 1, c: 1 + (i - 20) };     // 顶行
        return { r: 1 + (i - 30), c: 11 };                 // 右列
    }

    // ---------------- 角色（《大富翁4》）----------------
    const CHARS = [
        { e: '👴', n: '阿土伯', c: '#6dd36d' },
        { e: '💃', n: '钱夫人', c: '#c07be8' },
        { e: '👧', n: '孙小美', c: '#ff8fc0' },
        { e: '🎩', n: '大老千', c: '#5cc7ff' },
    ];

    // ---------------- 神明（一次性效果）----------------
    const GODS = [
        { n: '福神',     e: '🧧', f: (p) => gain(p, 1500),                       txt: '福神降临：红包 +¥1500' },
        { n: '财神',     e: '💰', f: (p) => gain(p, 2500),                       txt: '财神附体：横财 +¥2500' },
        { n: '穷神',     e: '💀', f: (p) => gain(p, -1200),                      txt: '穷神缠身：破财 -¥1200' },
        { n: '衰神',     e: '☠️', f: (p) => gain(p, -800),                       txt: '衰神路过：倒霉 -¥800' },
        { n: '幸运星',   e: '⭐', f: (p, S) => { gain(p, 1000); giveCard(p, ri(1, 1)); }, txt: '幸运星：得 ¥1000 并获得一张卡牌' },
        { n: '土地公公', e: '🏮', f: (p) => gain(p, 800),                        txt: '土地公庇佑：+¥800' },
        { n: '天使',     e: '😇', f: (p, S) => { p.card = true; gain(p, 600); },  txt: '天使眷顾：获免罪卡 +¥600' },
        { n: '恶魔',     e: '😈', f: (p, S) => { const o = richestOther(p, S); p.cash -= 1000; if (o) o.cash += 1000; }, txt: '恶魔作祟：-¥1000 转给对手' },
    ];

    // ---------------- 卡牌（入手 + 使用）----------------
    const CARDS = {
        buyLand:   { n: '购地卡',   e: '📜', d: '半价买下你所在的空地' },
        buildHouse:{ n: '建房卡',   e: '🏠', d: '在自己集齐的街区免费建一级' },
        jailFree:  { n: '免罪卡',   e: '🎫', d: '立即出狱（自动生效）' },
        equalize:  { n: '均富卡',   e: '⚖️', d: '所有未破产玩家现金平均分配' },
        remoteDice:{ n: '遥控骰子', e: '🎲', d: '立即前进 6 步' },
    };
    const CARD_KEYS = Object.keys(CARDS);

    // ---------------- 机会 / 命运（中文文案）----------------
    const CHANCE = [
        { txt: '商会急召：直奔起点领工资',      f: (p, S) => goto(p, 0, true) },
        { txt: '快马加鞭：前进 3 步',           f: (p, S) => step(p, 3) },
        { txt: '迷路折返：后退 2 步',           f: (p, S) => step(p, -2) },
        { txt: '被警察逮到！直接进监狱',        f: (p, S) => sendJail(p) },
        { txt: '律师相助：获得【免罪卡】',      f: (p, S) => { p.card = true; return '获得免罪卡'; } },
        { txt: '银行分红：收 ¥1500',            f: (p, S) => gain(p, 1500) },
        { txt: '行车超速：罚款 ¥750',           f: (p, S) => gain(p, -750) },
        { txt: '房屋大修：每间房 ¥400 / 每座酒店 ¥1150', f: (p, S) => houseTax(p, 400, 1150) },
        { txt: '商队引路：前往【仁爱豪宅】',    f: (p, S) => goto(p, CELLS.findIndex(c => c.n === '仁爱豪宅'), true) },
        { txt: '茶友相邀：前往【西门町】',      f: (p, S) => goto(p, CELLS.findIndex(c => c.n === '西门町'), true) },
        { txt: '地契股息：每块地 ¥600',         f: (p, S) => {
            let v = 0; S.own.forEach((o, i) => { if (o === p.id && !S.mort[i]) v += 600; }); p.cash += v; return `+${v}`;
        } },
        { txt: '当选商会会长：付给每位对手 ¥500', f: (p, S) => each(p, S, -500) },
    ];
    const FORTUNE = [
        { txt: '生日快乐：每位对手送你 ¥500',   f: (p, S) => each(p, S, 500) },
        { txt: '远方遗产：继承 ¥3000',          f: (p, S) => gain(p, 3000) },
        { txt: '医药账单：付 ¥1200',            f: (p, S) => gain(p, -1200) },
        { txt: '子女学费：付 ¥1500',            f: (p, S) => gain(p, -1500) },
        { txt: '退税到账：收 ¥1000',            f: (p, S) => gain(p, 1000) },
        { txt: '股票分红：收 ¥800',             f: (p, S) => gain(p, 800) },
        { txt: '马车维修：付 ¥600',             f: (p, S) => gain(p, -600) },
        { txt: '官司缠身：直接进监狱',          f: (p, S) => sendJail(p) },
        { txt: '贵人搭救：获得【免罪卡】',      f: (p, S) => { p.card = true; return '获得免罪卡'; } },
        { txt: '城外歇脚：前往【免费停车】',    f: (p, S) => goto(p, CELLS.findIndex(c => c.t === 'park'), true) },
        { txt: '衣锦还乡：回到起点',            f: (p, S) => goto(p, 0, true) },
        { txt: '书法夺魁：奖金 ¥2000',          f: (p, S) => gain(p, 2000) },
    ];
    function gain(p, v) { p.cash += v; return (v >= 0 ? '+' : '') + v; }
    function richestOther(p, S) { let best = null; S.players.forEach(x => { if (x.id !== p.id && !x.out && (!best || x.cash > best.cash)) best = x; }); return best; }
    function houseTax(p, ph, hh) {
        let h = 0, t = 0;
        S.own.forEach((o, i) => { if (o === p.id) { if (S.lv[i] === 5) t++; else h += S.lv[i]; } });
        const v = h * ph + t * hh; p.cash -= v; return `房${h}店${t} -${v}`;
    }
    function each(p, S, v) {
        const others = S.players.filter(x => x.id !== p.id && !x.out);
        p.cash += v * others.length; others.forEach(o => o.cash -= v);
        return (v >= 0 ? '+' : '-') + Math.abs(v * others.length);
    }
    function sendJail(p) { p.pos = JAIL; p.jail = 3; return '进了监狱'; }
    function goto(p, t, pay) { if (pay && t < p.pos) p.cash += SALARY; p.pos = t; return '移动到 ' + CELLS[t].n; }
    function step(p, d) { p.pos = (p.pos + d + N) % N; return (d >= 0 ? '前进 ' : '后退 ') + Math.abs(d) + ' 步'; }
    function giveCard(p, n) { for (let k = 0; k < n; k++) { const k2 = CARD_KEYS[ri(0, CARD_KEYS.length - 1)]; if (p.hand.length < 6) p.hand.push(k2); } }

    // ---------------- 联机同步辅助 ----------------
    // 整盘 S 序列化后 commit 给对手（剔除下划线字段/函数；over 仅在对局结束时带上）。
    function serialize(s) { return JSON.parse(JSON.stringify(s, (k, v) => (k.charCodeAt(0) === 95 ? undefined : v))); }
    function commitNet() {
        if (!net) return;
        try { const d = serialize(S); d.turn = S.turn; d.over = S.over || undefined; MG.pvp.commit(d); } catch (e) {}
    }

    // ---------------- 关卡 ----------------
    const NAMES = ['初入市井','老街开张','河畔小试','闹市听风','港埠走货','学府问道','金坊典当','车站通达','科技新贵','豪宅初见',
        '地产起步','富甲一坊','通衢要道','百货云集','码头集市','盐铁专营','茶马古道','丝路驼铃','漕运枢纽','会馆林立',
        '票号天下','南来北往','货通南北','日进斗金','商铺连城','商贾云集','富商大贾','腰缠万贯','陶朱遗风','富甲一方',
        '铜山金穴','堆金积玉','金玉满堂','富贵逼人','钟鸣鼎食','锦衣玉食','朱门绣户','富埒王侯','富可敌国','财富之巅',
        '商海扬帆','财源广进','家资渐丰','殷实小康','富户新贵','豪商崛起','巨贾峥嵘','财倾一方','富甲八荒','登峰造极'];
    // 50 关：每关目标/轮次由 tools/sim-monopoly.js baseline 校准（新手友好 → 后期硬核）
    const TOTAL = 50;
    const LEVELS = [];
    for (let i = 0; i < TOTAL; i++) {
        const t = i / (TOTAL - 1);
        const mul = +(0.6 + t * 0.9).toFixed(2);                 // 地价/租金倍率 0.6 → 1.5
        const goal = Math.round(24000 + i * 200);                // 24000 → 34000（baseline 校准：净资产不随关数暴涨，难度靠 AI+轮数）
        const rounds = Math.round(46 - t * 16);                  // 46 → 30 轮
        const name = NAMES[Math.min(i, NAMES.length - 1)];
        LEVELS.push({ name, desc: `目标 ${goal} · ${rounds} 轮`, start: 20000, goal, rounds, ai: +(0.10 + t * 0.75).toFixed(2), mul });
    }
    const ENDLESS = { name: '无尽', desc: '150 轮超长局，比拼净资产', start: 22000, goal: Infinity, rounds: 150, ai: 0.8, mul: 1.1 };

    // ================= 主体 =================
    let S = null, el = {}, dead = false, opts = null, cfgLevel = null, levelIdx = 0, endless = false;
    let net = false, mySide = 0;   // 联机模式：net=true 时 4 名玩家均为真人，mySide 为我方座位(0..3)

    function newState(lv) {
        const mk = (i) => {
            const c = CHARS[i];
            return { id: i + 1, me: i === 0, name: c.n, e: c.e, c: c.c, cash: lv.start, pos: 0, jail: 0, card: false, out: false, hand: [] };
        };
        const pls = [mk(0), mk(1), mk(2), mk(3)];
        const st = {
            players: pls,
            own: new Array(N).fill(0),            // 0 无主 / 1 玩家 / 2~4 AI
            lv: new Array(N).fill(0),             // 0 空地 / 1-4 房 / 5 酒店
            mort: new Array(N).fill(false),
            price: CELLS.map(c => c.p ? Math.round(c.p * lv.mul / 100) * 100 : 0),
            rent: CELLS.map(c => c.r ? c.r.map(v => Math.round(v * lv.mul / 50) * 50) : null),
            hcost: Object.keys(GROUPS).reduce((o, k) => (o[k] = Math.round(GROUPS[k].house * lv.mul / 100) * 100, o), {}),
            turn: 0, round: 1, phase: 'idle', msg: '', dices: [1, 1], log: [],
            over: false, aiLv: lv.ai, goal: lv.goal, maxRound: lv.rounds, doubles: 0, mul: lv.mul,
        };
        return st;
    }

    const cur = () => S.players[S.turn];
    const netWorth = p => p.cash + S.own.reduce((a, o, i) => {
        if (o !== p.id || S.mort[i]) return a;
        let v = S.price[i] + S.lv[i] * (CELLS[i].g ? S.hcost[CELLS[i].g] : 0);
        return a + v;
    }, 0);
    const ownsGroup = (id, g) => GROUP_CELLS[g].every(i => S.own[i] === id && !S.mort[i]);
    function rentOf(i) {
        const o = S.own[i];
        if (!o || S.mort[i]) return 0;
        const c = CELLS[i];
        if (c.t === 'station') { let n = 0; STATION_IDX.forEach(k => { if (S.own[k] === o && !S.mort[k]) n++; }); return Math.round(STATION_RENT[Math.min(4, n)] * S.mul); }
        if (c.t === 'utility') { let n = 0; UTILITY_IDX.forEach(k => { if (S.own[k] === o && !S.mort[k]) n++; }); const d = (S.dices[0] + S.dices[1]) || 7; return Math.round(d * (n >= 2 ? 10 : 4) * S.mul); }
        let r = S.rent[i][S.lv[i]];
        if (S.lv[i] === 0 && ownsGroup(o, c.g)) r *= 2;   // 集齐街区且未建房 → 租金翻倍
        return Math.round(r);
    }

    function log(txt, color) {
        S.log.unshift({ t: txt, c: color || '#cfe0f5' });
        if (S.log.length > 30) S.log.pop();
        if (el.log) el.log.innerHTML = S.log.slice(0, 10).map(l => `<div style="color:${l.c}">${l.t}</div>`).join('');
    }

    // ---------------- 渲染 ----------------
    function render() {
        if (dead || !el.board) return;
        if (window.__MG_NORENDER) return;      // 自动模拟时跳过 DOM 重绘（大幅提速）
        el.plays.innerHTML = S.players.map((p, i) => `
            <div class="mgy-pcard${i === S.turn && !S.over ? ' active' : ''}${p.out ? ' out' : ''}" style="${i === S.turn ? `border-color:${p.c};box-shadow:0 0 0 1px ${p.c}55` : ''}">
                <div class="mgy-pav" style="background:${p.c}22;color:${p.c}">${p.e}</div>
                <div class="mgy-pinfo">
                    <div class="mgy-pname">${p.name}${p.jail > 0 ? ' 🚔' : ''}${p.card ? ' 🎫' : ''}</div>
                    <div class="mgy-pcash">${money(p.cash)}</div>
                </div>
                <div class="mgy-pest">${p.out ? '<span style="color:#ff7a8b">破产</span>' : money(netWorth(p))}</div>
            </div>`).join('');

        // 3D 场景叠加层（中央信息），由 syncScene 同步建筑/棋子，文字在此更新
        if (el.round) el.round.textContent = `第 ${Math.min(S.round, S.maxRound)}/${S.maxRound} 轮`;
        if (el.goal) el.goal.textContent = `目标 ${S.goal === Infinity ? '∞' : money(S.goal)}`;
        if (el.cmsg) el.cmsg.textContent = S.msg ? String(S.msg).slice(0, 40) : '';
        syncScene();
        renderPanel();
        if (opts && opts.onScore) opts.onScore(`第 ${Math.min(S.round, S.maxRound)}/${S.maxRound} 轮 · 净资产 ${money(netWorth(S.players[0]))} · 目标 ${S.goal === Infinity ? '∞' : money(S.goal)}`);
    }

    function renderPanel() {
        const p = cur();
        if (S.over) { el.panel.innerHTML = '<div class="mgy-msg">本局结束</div>'; el.acts.innerHTML = ''; return; }
        el.panel.innerHTML = `<div class="mgy-msg">${S.msg || (p.me ? '轮到你了' : p.name + ' 的回合')}</div>`;
        if (!p.me) { el.acts.innerHTML = `<div class="mgy-wait">${p.e} ${p.name} 思考中…</div>`; return; }
        let acts = '';
        if (S.phase === 'rolling' || S.phase === 'moving') acts = '<div class="mgy-wait">…</div>';
        else if (S.phase === 'decide') {
            const c = CELLS[p.pos];
            acts = `<button class="mg-btn primary" data-a="buy">💰 买下 ${c.n}（${money(S.price[p.pos])}）</button>
                    <button class="mg-btn" data-a="skip">放弃</button>`;
        } else if (S.phase === 'jail') {
            acts = `<button class="mg-btn primary" data-a="roll">🎲 掷骰求对子</button>`;
            if (p.card) acts += `<button class="mg-btn" data-a="card">🎫 用免罪卡</button>`;
            if (p.cash >= 500) acts += `<button class="mg-btn" data-a="fine">💸 付 ¥500 出狱</button>`;
        } else {
            if (S.phase === 'idle') acts += `<button class="mg-btn primary" data-a="roll">🎲 掷骰</button>`;
            const bl = buildList(p);
            if (bl.length && S.phase !== 'rolling') acts += `<button class="mg-btn" data-a="build">🏠 建楼 (${bl.length})</button>`;
            if (p.hand.length) acts += `<button class="mg-btn" data-a="cards">🃏 用卡 (${p.hand.length})</button>`;
            if (S.phase === 'end') acts += `<button class="mg-btn primary" data-a="next">结束回合 ›</button>`;
        }
        el.acts.innerHTML = acts;
        el.acts.querySelectorAll('button').forEach(b => b.onclick = () => onAct(b.dataset.a));
    }

    function buildList(p) {
        const out = [];
        for (let i = 0; i < N; i++) {
            if (S.own[i] !== p.id || S.mort[i] || S.lv[i] >= 5) continue;
            const g = CELLS[i].g;
            if (!g || !ownsGroup(p.id, g)) continue;
            const cost = S.hcost[g];
            if (p.cash >= cost) out.push({ i, cost, name: CELLS[i].n, lv: S.lv[i] + 1 });
        }
        return out.sort((a, b) => a.i - b.i);
    }

    // ---------------- 玩家操作 ----------------
    async function onAct(a) {
        if (dead || S.over) return;
        if (net && (!MG.pvp.canMove() || S.turn !== mySide)) return;   // 联机：没轮到就锁输入
        const p = cur();
        if (a === 'roll') {
            if (S.phase === 'jail') return jailTry(p);
            await doRoll(p);
        } else if (a === 'buy') {
            const i = p.pos;
            if (p.cash < S.price[i]) { S.msg = '现金不足'; render(); return; }
            p.cash -= S.price[i]; S.own[i] = p.id;
            try { MG.audio.sfx('coin'); } catch (e) {}
            log(`🧑 买下【${CELLS[i].n}】-${money(S.price[i])}`, p.c);
            S.phase = 'end';
            S.msg = `买下 ${CELLS[i].n}${CELLS[i].g && ownsGroup(p.id, CELLS[i].g) ? '，街区集齐，可建楼！' : ''}`;
            save(); render(); commitNet();
        } else if (a === 'skip') {
            S.phase = 'end'; S.msg = '放弃这块地'; save(); render(); commitNet();
        } else if (a === 'build') showBuild(p);
        else if (a === 'cards') showCards(p);
        else if (a === 'next') nextTurn();
        else if (a === 'card') {
            p.card = false; p.jail = 0; S.phase = 'idle';
            try { MG.audio.sfx('click'); } catch (e) {}
            log('🎫 使用免罪卡出狱', p.c); S.msg = '重获自由，掷骰吧'; save(); render(); commitNet();
        } else if (a === 'fine') {
            p.cash -= 500; p.jail = 0; S.phase = 'idle';
            try { MG.audio.sfx('click'); } catch (e) {}
            log('💸 缴纳 ¥500 出狱', p.c); S.msg = '交钱走人'; save(); render(); commitNet();
        }
    }

    function showBuild(p) {
        const list = buildList(p);
        if (!list.length) return;
        const box = document.createElement('div');
        box.className = 'mgy-build';
        box.innerHTML = `<div class="mgy-build-card">
            <div class="mgy-bt">🏠 建楼　现金 ${money(p.cash)}</div>
            <div class="mgy-blist">${list.map(b => `<button data-i="${b.i}">
                <span>${CELLS[b.i].e} ${b.name}</span>
                <span class="mgy-bcost">${b.lv === 5 ? '🏨 酒店' : '🏠 Lv' + b.lv} · ${money(b.cost)}</span></button>`).join('')}</div>
            <button class="mg-btn" data-close>关闭</button></div>`;
        el.wrap.appendChild(box);
        box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
            const i = +b.dataset.i, cost = S.hcost[CELLS[i].g];
            if (p.cash < cost || S.lv[i] >= 5) return;
            p.cash -= cost; S.lv[i]++;
            try { MG.audio.sfx('coin'); } catch (e) {}
            log(`🏠 ${p.name} 在【${CELLS[i].n}】建到 Lv${S.lv[i]}`, p.c);
            box.remove(); save(); render(); commitNet();
        });
        box.querySelector('[data-close]').onclick = () => box.remove();
        box.onclick = e => { if (e.target === box) box.remove(); };
    }

    function showCards(p) {
        if (!p.hand.length) return;
        const box = document.createElement('div');
        box.className = 'mgy-build';
        const rows = p.hand.map((k, idx) => {
            const cd = CARDS[k] || { n: k, e: '🃏', d: '' };
            const ok = canUseCard(p, k);
            return `<button data-h="${idx}" ${ok ? '' : 'disabled'}><span>${cd.e} ${cd.n}</span><span class="mgy-bcost">${cd.d}</span></button>`;
        }).join('');
        box.innerHTML = `<div class="mgy-build-card">
            <div class="mgy-bt">🃏 手牌　现金 ${money(p.cash)}</div>
            <div class="mgy-blist">${rows}</div>
            <button class="mg-btn" data-close>关闭</button></div>`;
        el.wrap.appendChild(box);
        box.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
            const idx = +b.dataset.h, k = p.hand[idx];
            if (!k || !canUseCard(p, k)) return;
            applyCard(p, k, idx);
            box.remove(); save(); render(); commitNet();
        });
        box.querySelector('[data-close]').onclick = () => box.remove();
        box.onclick = e => { if (e.target === box) box.remove(); };
    }

    function canUseCard(p, k) {
        if (k === 'buyLand') { const i = p.pos; return CELLS[i].t === 'prop' && !S.own[i] && p.cash >= Math.round(S.price[i] / 2); }
        if (k === 'buildHouse') { const i = p.pos; return CELLS[i].t === 'prop' && S.own[i] === p.id && S.lv[i] < 5 && CELLS[i].g && ownsGroup(p.id, CELLS[i].g); }
        if (k === 'jailFree') return p.jail > 0 || p.card;
        if (k === 'equalize') return true;
        if (k === 'remoteDice') return S.phase === 'idle';
        return false;
    }
    function applyCard(p, k, idx) {
        const i = p.pos;
        if (k === 'buyLand') {
            const price = Math.round(S.price[i] / 2);
            p.cash -= price; S.own[i] = p.id; S.phase = 'end';
            log(`📜 购地卡：半价买下【${CELLS[i].n}】-${money(price)}`, p.c); S.msg = `购地卡买下 ${CELLS[i].n}`;
        } else if (k === 'buildHouse') {
            S.lv[i]++; log(`🏠 建房卡：${CELLS[i].n} 升到 Lv${S.lv[i]}`, p.c); S.msg = `建房卡升级 ${CELLS[i].n}`;
        } else if (k === 'jailFree') {
            p.card = false; p.jail = 0; if (S.phase === 'jail') S.phase = 'idle';
            log('🎫 免罪卡生效', p.c); S.msg = '免罪卡出狱';
        } else if (k === 'equalize') {
            const alive = S.players.filter(x => !x.out);
            const avg = Math.floor(alive.reduce((s, x) => s + x.cash, 0) / alive.length);
            alive.forEach(x => x.cash = avg);
            log('⚖️ 均富卡：现金平均分配', p.c); S.msg = '均富卡生效';
        } else if (k === 'remoteDice') {
            S.phase = 'moving';
            log('🎲 遥控骰子：前进 6 步', p.c); S.msg = '遥控骰子前进 6 步';
            walk(p, 6).then(() => onLand(p)).then(() => { if (!dead && !S.over && S.phase !== 'decide') S.phase = 'end'; save(); render(); commitNet(); });
            p.hand.splice(idx, 1);
            return;
        }
        p.hand.splice(idx, 1);
    }

    async function jailTry(p) {
        const d1 = ri(1, 6), d2 = ri(1, 6);
        await animDice(d1, d2);
        if (dead) return;
        if (d1 === d2) { p.jail = 0; S.phase = 'idle'; log(`🎲 ${d1}+${d2} 对子！出狱`, p.c); S.msg = '掷出对子，出狱！'; }
        else if (--p.jail <= 0) {
            p.cash -= 500; p.jail = 0; S.phase = 'idle';
            log('💸 三次未掷出对子，付 ¥500 出狱', p.c); S.msg = '付 ¥500 出狱';
        } else { S.phase = 'end'; S.msg = `未掷出对子，还剩 ${p.jail} 次机会`; }
        checkBroke(); save(); render(); commitNet();
    }

    // ---------------- 掷骰 & 移动 ----------------
    async function doRoll(p) {
        S.phase = 'rolling'; S.msg = '掷骰中…'; renderPanel();
        try { MG.audio.sfx('click'); } catch (e) {}
        const d1 = ri(1, 6), d2 = ri(1, 6);
        await animDice(d1, d2);
        if (dead) return;
        const sum = d1 + d2, dbl = d1 === d2;
        S.doubles = dbl ? S.doubles + 1 : 0;
        if (S.doubles >= 3) {
            log('🎲 连续三次对子：涉嫌作弊，押送监狱', '#ff7a8b');
            p.pos = JAIL; p.jail = 3; S.doubles = 0; S.phase = 'end';
            save(); render(); commitNet(); return;
        }
        log(`🎲 ${p.name} 掷出 ${d1}+${d2}=${sum}`, p.c);
        S.phase = 'moving';
        await walk(p, sum);
        if (dead) return;
        await onLand(p);
        if (dead || S.over || S.phase === 'decide') { save(); render(); commitNet(); return; }
        if (dbl && !p.jail && !p.out) { S.phase = 'idle'; S.msg = '掷出对子，再来一次！'; }
        else S.phase = 'end';
        save(); render(); commitNet();
    }

    async function walk(p, steps) {
        const i = p.id - 1;
        for (let k = 0; k < steps; k++) {
            p.pos = (p.pos + 1) % N;
            if (p.pos === 0) { p.cash += SALARY; log(`🚩 ${p.name} 经过起点 +${SALARY}`, p.c); }
            pawnQueue[i].push(p.pos);          // 入队：animate 逐格播放跳步动画
            S.hop = p.id;
            render();
            if (dead) { S.hop = -1; pawnQueue[i].length = 0; return; }
            await sleep(p.me ? 55 : 38);        // 逻辑节奏；视觉由 animate 按 HOP_TIME 播放
        }
        S.hop = -1;
        let guard = 0;
        while (!dead && pawnQueue[i].length && guard++ < 2000) await sleep(20);  // 等动画播完再结算落点
        render();
    }
    function markHop() {
        // 3D 下小人移动由 animate 的 pawnVis 插值表现（带走路起伏），无需 DOM 高亮
    }

    async function animDice(d1, d2) {
        for (let k = 0; k < 6; k++) {
            S.dices = [ri(1, 6), ri(1, 6)];
            if (el.dice) el.dice.innerHTML = `<i>${S.dices[0]}</i><i>${S.dices[1]}</i>`;
            if (dead) return;
            await sleep(50);
        }
        S.dices = [d1, d2];
        if (el.dice) el.dice.innerHTML = `<i>${d1}</i><i>${d2}</i>`;
    }

    // ---------------- 落点结算 ----------------
    async function onLand(p) {
        const i = p.pos, c = CELLS[i];
        if (c.t === 'gotojail') {
            if (p.card) { p.card = false; log(`🎫 ${p.name} 用免罪卡免于入狱`, p.c); S.msg = '免罪卡生效'; return; }
            p.pos = JAIL; p.jail = 3;
            log(`👮 ${p.name} 被押进监狱`, '#ff7a8b'); S.msg = `${p.name} 进监狱了`; return;
        }
        if (c.t === 'tax') { p.cash -= c.v; log(`📜 ${p.name} 缴纳${c.n} -${c.v}`, '#ff9f6b'); S.msg = `缴纳${c.n} ${money(c.v)}`; }
        else if (c.t === 'park') S.msg = '免费停车，歇口气';
        else if (c.t === 'jail') S.msg = '只是路过探监';
        else if (c.t === 'go') S.msg = '回到起点';
        else if (c.t === 'god') {
            const g = GODS[ri(0, GODS.length - 1)];
            g.f(p, S);
            log(`🏮 ${p.name} 遇到【${g.n}】${g.e}`, '#ffd56b');
            S.msg = g.txt;
        }
        else if (c.t === 'chance' || c.t === 'fortune') {
            const deck = c.t === 'chance' ? CHANCE : FORTUNE;
            const card = deck[ri(0, deck.length - 1)];
            const before = p.pos;
            const res = card.f(p, S) || '';
            if (Math.random() < 0.3) giveCard(p, 1);
            log(`🎴 ${p.name} 抽到${c.t === 'chance' ? '机会' : '命运'}：${card.txt}${res ? ' → ' + res : ''}`, '#ffd56b');
            S.msg = `${card.txt}${res ? '（' + res + '）' : ''}`;
            if (p.pos !== before && !dead) { render(); await sleep(260); }
            const nc = CELLS[p.pos];
            if (nc.t === 'prop' || nc.t === 'tax' || nc.t === 'station' || nc.t === 'utility' || nc.t === 'god') return onLand(p);   // 卡牌移动后继续结算
        } else if (c.t === 'prop' || c.t === 'station' || c.t === 'utility') {
            const o = S.own[i];
            if (!o) {
                if (p.me) {
                    S.phase = 'decide';
                    S.msg = c.t === 'prop'
                        ? `空地【${c.n}】售价 ${money(S.price[i])}，租金 ${money(S.rent[i][0])}，买不买？`
                        : `【${c.n}】售价 ${money(S.price[i])}，买不买？`;
                    return;
                }
                aiBuy(p, i);
            } else if (o === p.id) {
                S.msg = `回到自己的${c.n}${CELLS[i].g && ownsGroup(p.id, CELLS[i].g) && S.lv[i] < 5 ? '（街区集齐，可建楼）' : ''}`;
            } else {
                const owner = S.players.find(x => x.id === o);
                if (S.mort[i]) S.msg = `${c.n} 已抵押，免租`;
                else {
                    const r = rentOf(i);
                    p.cash -= r; owner.cash += r;
                    try { MG.audio.sfx('target'); } catch (e) {}
                    log(`💸 ${p.name} 在【${c.n}】付租 ${money(r)} → ${owner.name}`, owner.c);
                    S.msg = `${p.name} 付租 ${money(r)} 给 ${owner.name}`;
                }
            }
        }
        checkBroke();
    }

    function aiBuy(p, i) {
        const price = S.price[i];
        const keep = Math.round(2500 + 6000 * (1 - S.aiLv) * 0.6);
        const c = CELLS[i];
        let near = 1;
        if (c.t === 'prop' && c.g) {
            const have = GROUP_CELLS[c.g].filter(k => S.own[k] === p.id).length;
            near = have >= GROUP_CELLS[c.g].length - 1 ? 1.5 : 1;    // 差一块就集齐 → 更想买
        }
        const base = c.t === 'prop' ? (S.rent[i][0] / price) : 0.12;
        const good = base * near;
        const want = (0.35 + S.aiLv * 0.5) * near + good * 2;
        if (price <= p.cash - keep && Math.random() < Math.min(0.95, want)) {
            p.cash -= price; S.own[i] = p.id;
            log(`🦾 ${p.name} 买下【${c.n}】-${money(price)}`, p.c);
            S.msg = `${p.name} 买下了 ${c.n}`;
        } else S.msg = `${p.name} 没有买 ${c.n}`;
    }

    // ---------------- 破产 / 回合流转 ----------------
    function checkBroke() {
        S.players.forEach(p => {
            if (p.out || p.cash >= 0) return;
            let guard = 0;
            while (p.cash < 0 && guard++ < 120) {
                let did = false;
                for (let i = 0; i < N; i++) {
                    if (S.own[i] !== p.id) continue;
                    if (S.lv[i] > 0) { p.cash += Math.round((CELLS[i].g ? S.hcost[CELLS[i].g] : 200) / 2); S.lv[i]--; did = true; break; }
                    if (!S.mort[i]) { p.cash += Math.round(S.price[i] / 2); S.mort[i] = true; did = true; break; }
                }
                if (!did) break;
            }
            if (p.cash < 0) {
                p.out = true;
                S.own.forEach((o, i) => { if (o === p.id) { S.own[i] = 0; S.lv[i] = 0; S.mort[i] = false; } });
                log(`💀 ${p.name} 破产出局！`, '#ff7a8b');
            }
        });
        const alive = S.players.filter(p => !p.out);
        const meOut = net ? S.players[mySide].out : S.players[0].out;
        if (alive.length <= 1 || meOut) finish();
    }

    function completeOnce() {
        if (S._done) return;
        S._done = true;
        const me = S.players[net ? mySide : 0];
        const alive = S.players.filter(p => !p.out);
        const nw = netWorth(me);
        let win = false, stars = 0;
        if (me.out) { win = false; stars = 0; }
        else if (endless) { win = alive.length <= 1; stars = win ? 3 : (nw >= 120000 ? 2 : 1); }
        else if (alive.length <= 1) { win = true; stars = 3; }
        else if (nw >= S.goal) {
            win = true;
            const early = S.round <= S.maxRound * 0.6;
            const crush = alive.length <= 2;
            stars = (nw >= S.goal * 1.25 || early || crush) ? 3 : 2;
        } else if (nw >= S.goal * 0.7) stars = 1;
        clearSave();
        if (opts && opts.onComplete) opts.onComplete({
            win, stars, score: Math.round(nw),
            title: me.out ? '💀 破产收场' : (win ? '🏆 大富翁' : '⌛ 回合耗尽'),
            lines: [
                `净资产 ${money(nw)} / 目标 ${S.goal === Infinity ? '∞' : money(S.goal)}`,
                `地产 ${S.own.filter(o => o === me.id).length} 块 · 建筑 ${S.lv.reduce((a, b, i) => a + (S.own[i] === me.id ? b : 0), 0)} 级 · 现金 ${money(me.cash)}`,
                S.players.filter(p => p.id !== me.id).map(p => `${p.e}${p.name} ${p.out ? '破产' : money(netWorth(p))}`).join(' · '),
            ],
        });
        render();
    }
    function finish() {
        if (S.over) return;
        S.over = true;
        if (net) commitNet();
        completeOnce();
    }

    function nextTurn() {
        if (S.over) return;
        const me = S.players[net ? mySide : 0];
        if (!endless && !me.out && netWorth(me) >= S.goal) return finish();
        let guard = 0;
        do {
            S.turn = (S.turn + 1) % S.players.length;
            if (S.turn === 0) {
                S.round++;
                if (S.round > S.maxRound) return finish();
            }
        } while (S.players[S.turn].out && guard++ < 20);
        const p = cur();
        S.doubles = 0;
        S.phase = p.jail > 0 ? 'jail' : 'idle';
        S.msg = p.me ? (p.jail > 0 ? '你在监狱里，掷对子 / 付 ¥500 / 用免罪卡' : '轮到你了，掷骰吧') : '';
        save(); render(); commitNet();
        if (!p.me && !net) later(aiTurn, 380);
    }

    // ---------------- AI 回合 ----------------
    async function aiTurn() {
        if (net) return;
        const p = cur();
        if (dead || S.over || p.me || p.out) return;
        await sleep(240);
        if (dead || S.over) return;
        if (p.jail > 0) {
            if (p.card) { p.card = false; p.jail = 0; log(`🎫 ${p.name} 用免罪卡出狱`, p.c); }
            else if (p.cash > 4000 && Math.random() < 0.5 + S.aiLv * 0.4) { p.cash -= 500; p.jail = 0; log(`💸 ${p.name} 付 ¥500 出狱`, p.c); }
            else {
                const d1 = ri(1, 6), d2 = ri(1, 6);
                await animDice(d1, d2);
                if (d1 === d2) { p.jail = 0; log(`🎲 ${p.name} 掷出对子出狱`, p.c); }
                else p.jail--;
            }
            render();
            if (dead || S.over) return;
            if (p.jail > 0) { S.phase = 'end'; save(); render(); return later(nextTurn, 420); }
        }
        if (p.hand.length && Math.random() < 0.5 + S.aiLv * 0.3) {
            for (let k = 0; k < p.hand.length; k++) { if (canUseCard(p, p.hand[k]) && (p.hand[k] === 'buildHouse' || p.hand[k] === 'buyLand' || p.hand[k] === 'equalize')) { applyCard(p, p.hand[k], k); break; } }
        }
        if (Math.random() < 0.5 + S.aiLv * 0.45) {
            const list = buildList(p).sort((a, b) => b.lv - a.lv);
            if (list.length) {
                const n = Math.random() < S.aiLv ? Math.min(list.length, 1 + ri(0, 1)) : 1;
                for (let k = 0; k < n; k++) {
                    const b = list[k];
                    if (p.cash - b.cost < 2500 * (1.1 - S.aiLv)) break;
                    p.cash -= b.cost; S.lv[b.i]++;
                    log(`🏠 ${p.name} 在【${CELLS[b.i].n}】建到 Lv${S.lv[b.i]}`, p.c);
                }
                render();
                await sleep(150);
            }
        }
        if (dead || S.over) return;
        await doRoll(p);
        if (dead || S.over) return;
        await sleep(280);
        if (dead || S.over) return;
        nextTurn();
    }

    // ---------------- 存档 ----------------
    function save() {
        if (S.over) return;
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({
                v: 3, levelIdx, endless, t: Date.now(),
                s: {
                    players: S.players, own: S.own, lv: S.lv, mort: S.mort, price: S.price, rent: S.rent, hcost: S.hcost,
                    turn: S.turn, round: S.round, phase: 'idle', msg: S.msg, dices: S.dices, log: S.log.slice(0, 10),
                    over: false, aiLv: S.aiLv, goal: S.goal === Infinity ? null : S.goal, maxRound: S.maxRound, doubles: 0, mul: S.mul,
                },
            }));
        } catch (e) {}
    }
    function loadSave() {
        try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return (d && d.v === 3) ? d : null; } catch (e) { return null; }
    }
    function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

    // ================= 3D 渲染层（Three.js · 仿《大富翁4》）=================
    // 仅替换显示：保留全部游戏逻辑（S / cellPos / doRoll / walk / onLand / nextTurn / 联机同步）。
    let THREE = null, THREE_LOADING = null, GL_resize = null;
    const TILE = 1.0, ROOF = 0x7a5a2a;
    let GL_scene, GL_camera, GL_renderer, GL_raf = 0, GL_board;
    let GL_tiles = [], GL_pawns = [], GL_blv = [], GL_owner = [];
    let pawnCell = [0, 0, 0, 0];          // 小人当前所在格（整数）
    let pawnStep = [0, 0, 0, 0];          // 0..1：当前这一跳的进度
    const pawnQueue = [[], [], [], []];   // 待走格序列（整数，已取模），由 animate 逐格消耗
    const HOP_TIME = 0.20, HOP_H = 0.24; // 每格跳跃耗时(秒) / 跳跃高度
    let GL_deco = [];                     // 中央装饰（logo / 机会命运牌堆 / 起点监狱标记）
    const CW = [];
    for (let i = 0; i < N; i++) { const p = cellPos(i); CW[i] = { x: (p.c - 6) * TILE, z: (p.r - 6) * TILE }; }
    const cam = { az: -Math.PI / 4, pol: 0.95, rad: 13, tx: 0, ty: 0.5, tz: 0 };

    function ensureThree() {
        if (THREE) return Promise.resolve(THREE);
        if (THREE_LOADING) return THREE_LOADING;
        THREE_LOADING = new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = '/js/lib/three.min.js?v=20260916a';
            s.onload = () => res(window.THREE);
            s.onerror = () => rej(new Error('Three.js 加载失败'));
            document.head.appendChild(s);
        });
        THREE_LOADING.then(t => { THREE = t; }).catch(() => {});
        return THREE_LOADING;
    }

    function tileTexture(c, i) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const x = cv.getContext('2d');
        x.fillStyle = '#efe2c2'; x.fillRect(0, 0, 128, 128);
        const g = c.g ? GROUPS[c.g] : null;
        if (g) { x.fillStyle = g.color; x.fillRect(0, 0, 128, 22); }
        x.textAlign = 'center'; x.font = '42px sans-serif'; x.fillStyle = '#2b241a';
        x.fillText(c.e || '', 64, 62);
        x.font = 'bold 15px sans-serif'; x.fillStyle = '#3a2f20'; x.fillText(c.n, 64, 94);
        if (c.t === 'prop') { x.font = '13px sans-serif'; x.fillStyle = '#5a6'; x.fillText(money(S.price[i]), 64, 116); }
        const t = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        return t;
    }

    function buildTiles() {
        for (let i = 0; i < N; i++) {
            const c = CELLS[i], w = CW[i];
            const grp = new THREE.Group(); grp.position.set(w.x, 0, w.z);
            const base = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.16, 0.94), new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 }));
            base.position.y = 0.08; base.receiveShadow = true; grp.add(base);
            const g = c.g ? GROUPS[c.g] : null;
            if (g) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.17, 0.18), new THREE.MeshStandardMaterial({ color: new THREE.Color(g.color), roughness: 0.7 })); bar.position.set(0, 0.085, 0.38); grp.add(bar); }
            const top = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tileTexture(c, i) }));
            top.rotation.x = -Math.PI / 2; top.position.y = 0.165; grp.add(top);
            const own = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
            own.position.set(0.34, 0.2, -0.34); own.visible = false; grp.add(own);
            GL_board.add(grp); GL_tiles.push(grp); GL_owner.push(own);
        }
    }

    function buildBuildings() {
        for (let i = 0; i < N; i++) {
            const c = CELLS[i]; if (c.t !== 'prop') { GL_blv.push(null); continue; }
            const w = CW[i], g = GROUPS[c.g], col = new THREE.Color(g.color);
            const grp = new THREE.Group(); grp.position.set(w.x, 0.16, w.z);
            const slots = [];
            for (let k = 0; k < 4; k++) {
                const h = new THREE.Group();
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
                body.position.y = 0.15; body.castShadow = true;
                const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 4), new THREE.MeshStandardMaterial({ color: ROOF, roughness: 0.6 }));
                roof.position.y = 0.38; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
                h.add(body); h.add(roof); h.position.set((k - 1.5) * 0.24, 0, 0); h.visible = false; grp.add(h); slots.push(h);
            }
            const hotel = new THREE.Group();
            const hb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
            hb.position.y = 0.35; hb.castShadow = true;
            const hr = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.54), new THREE.MeshStandardMaterial({ color: ROOF, roughness: 0.6 }));
            hr.position.y = 0.78; hr.castShadow = true;
            hotel.add(hb); hotel.add(hr); hotel.visible = false; grp.add(hotel);
            GL_board.add(grp); GL_blv.push({ slots, hotel });
        }
    }

    function emojiSprite(e) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const x = cv.getContext('2d'); x.font = '44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, 32, 34);
        const tex = new THREE.CanvasTexture(cv); if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
        spr.scale.set(0.5, 0.5, 0.5); spr.position.y = 0.92; return spr;
    }

    function buildPawns() {
        for (let i = 0; i < 4; i++) {
            const ch = CHARS[i], grp = new THREE.Group();
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.4, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color(ch.c), roughness: 0.5 }));
            body.position.y = 0.2; body.castShadow = true;
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffe0c0, roughness: 0.6 }));
            head.position.y = 0.52; head.castShadow = true;
            grp.add(body); grp.add(head); grp.add(emojiSprite(ch.e));
            GL_board.add(grp); GL_pawns.push(grp);
            pawnCell[i] = S.players[i].pos; pawnStep[i] = 0; pawnQueue[i].length = 0;
        }
    }

    function setupControls(cv) {
        let dragId = null, lx = 0, ly = 0; const pts = new Map();
        cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (x) {} pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) { dragId = e.pointerId; lx = e.clientX; ly = e.clientY; } });
        cv.addEventListener('pointermove', e => {
            if (!pts.has(e.pointerId)) return;
            const p = pts.get(e.pointerId), px = e.clientX, py = e.clientY;
            if (pts.size >= 2) { const ids = [...pts.keys()], a = pts.get(ids[0]), b = pts.get(ids[1]); const d = Math.hypot(a.x - b.x, a.y - b.y); if (cv._pd) cam.rad = Math.max(7, Math.min(22, cam.rad * (cv._pd / d))); cv._pd = d; }
            else if (e.pointerId === dragId) { const dx = px - lx, dy = py - ly; lx = px; ly = py; cam.az -= dx * 0.006; cam.pol = Math.max(0.25, Math.min(1.35, cam.pol - dy * 0.006)); }
            p.x = px; p.y = py;
        });
        const up = e => { pts.delete(e.pointerId); cv._pd = 0; if (e.pointerId === dragId) dragId = null; };
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
        cv.addEventListener('wheel', e => { e.preventDefault(); cam.rad = Math.max(7, Math.min(22, cam.rad * (1 + e.deltaY * 0.001))); }, { passive: false });
    }

    function camZoom(f) { cam.rad = Math.max(7, Math.min(30, cam.rad * f)); }
    function camSpin(d) { cam.az += d; }
    function camReset() { cam.az = -Math.PI / 4; cam.pol = 0.95; fitCam(); }
    function wireCamButtons(board) {
        if (!board) return;
        board.querySelectorAll('.mono-camctl button').forEach(b => {
            b.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                const a = b.dataset.a;
                if (a === 'zin') camZoom(0.82);
                else if (a === 'zout') camZoom(1.22);
                else if (a === 'rl') camSpin(-0.35);
                else if (a === 'rr') camSpin(0.35);
                else if (a === 'reset') camReset();
            });
        });
    }

    function syncScene() {
        if (!GL_board) return;
        for (let i = 0; i < N; i++) {
            const b = GL_blv[i]; if (!b) continue;
            const lv = S.lv[i];
            if (lv >= 5) { b.hotel.visible = true; b.slots.forEach(s => s.visible = false); }
            else { b.hotel.visible = false; b.slots.forEach((s, k) => s.visible = k < lv); }
        }
        for (let i = 0; i < N; i++) {
            const o = GL_owner[i], own = S.own[i];
            if (own) { const pl = S.players.find(p => p.id === own); o.visible = true; o.material.color.set(pl ? pl.c : '#ffffff'); }
            else o.visible = false;
        }
        // 小人：仅当队列为空且逻辑位置已漂移（卡牌传送 / 监狱等）时吸附对齐；行走由 animate 逐格播放
        for (let i = 0; i < 4; i++) {
            const pos = S.players[i].pos; if (pos == null) continue;
            if (!pawnQueue[i].length && pos !== pawnCell[i]) { pawnCell[i] = pos; pawnStep[i] = 0; }
        }
    }

    function animate() {
        if (dead || !GL_renderer) { GL_raf = 0; return; }
        GL_raf = requestAnimationFrame(animate);
        const now = performance.now(), dt = Math.min(0.05, (now - (animate._last || now)) / 1000); animate._last = now;
        const cp = Math.cos(cam.pol), sp = Math.sin(cam.pol);
        GL_camera.position.set(cam.tx + cam.rad * sp * Math.sin(cam.az), cam.ty + cam.rad * cp, cam.tz + cam.rad * sp * Math.cos(cam.az));
        GL_camera.lookAt(cam.tx, cam.ty, cam.tz);
        for (let i = 0; i < 4; i++) {
            const p = S.players[i];
            if (!p || p.out) { GL_pawns[i].visible = false; continue; }
            GL_pawns[i].visible = true;
            let from = pawnCell[i], to = from, f = 1;
            const q = pawnQueue[i];
            if (q.length) {
                to = q[0];
                pawnStep[i] += dt / HOP_TIME;
                if (pawnStep[i] >= 1) {
                    pawnStep[i] = 0;
                    pawnCell[i] = q.shift();
                    from = pawnCell[i];
                    if (q.length) { to = q[0]; f = 0; }
                    else { to = from; f = 1; }
                } else f = pawnStep[i];
            }
            const a = CW[from], b = CW[to];
            const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
            const ang = i * Math.PI / 2, ox = Math.cos(ang) * 0.16, oz = Math.sin(ang) * 0.16;
            const hop = (f > 0.001 && f < 0.999) ? Math.sin(f * Math.PI) * HOP_H : 0;
            GL_pawns[i].position.set(x + ox, hop, z + oz);
        }
        GL_renderer.render(GL_scene, GL_camera);
    }

    // 自动取景：让 11×11 方盘完整落在视口内（按垂直/水平半视角取较小者）
    function fitCam() {
        if (!GL_renderer || !GL_camera) return;
        const W = GL_renderer.domElement.clientWidth || 612, H = GL_renderer.domElement.clientHeight || 612;
        const aspect = W / H;
        const halfV = (GL_camera.fov * Math.PI / 180) / 2;
        const halfH = Math.atan(Math.tan(halfV) * aspect);
        const R = 8.0;                                   // 方盘对角半径（含小人高度冗余）
        const need = R / Math.tan(Math.min(halfV, halfH));
        cam.rad = Math.max(7, Math.min(30, need * 1.02));
    }

    function buildCenter() {
        // 中央广场圆盘 + 金边
        const plaza = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.7, 0.12, 56),
            new THREE.MeshStandardMaterial({ color: 0x123021, roughness: 0.95 }));
        plaza.position.y = 0.02; plaza.receiveShadow = true; GL_board.add(plaza); GL_deco.push(plaza);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(4.55, 0.06, 8, 64),
            new THREE.MeshStandardMaterial({ color: 0xd9a52a, roughness: 0.5, metalness: 0.3 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.09; GL_board.add(ring); GL_deco.push(ring);
        // 中央 logo 贴地
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const x = cv.getContext('2d');
        const g = x.createRadialGradient(128, 110, 10, 128, 128, 130);
        g.addColorStop(0, '#ffe9a8'); g.addColorStop(1, '#caa12e');
        x.fillStyle = g; x.beginPath(); x.arc(128, 128, 96, 0, 7); x.fill();
        x.fillStyle = '#5a3d10'; x.textAlign = 'center'; x.font = 'bold 60px serif'; x.fillText('🎲', 128, 116);
        x.font = 'bold 38px sans-serif'; x.fillText('大富翁', 128, 192);
        const tex = new THREE.CanvasTexture(cv); if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        const logo = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        logo.rotation.x = -Math.PI / 2; logo.position.set(0, 0.10, 0); GL_board.add(logo); GL_deco.push(logo);
        // 机会 / 命运 牌堆（中央两侧）
        [['❓', '机会', -3.3, 0x4a8fd8], ['🎴', '命运', 3.3, 0xd86a8f]].forEach(([e, nm, px, col]) => {
            const grp = new THREE.Group(); grp.position.set(px, 0.16, 0);
            for (let k = 0; k < 4; k++) {
                const card = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 1.0),
                    new THREE.MeshStandardMaterial({ color: 0xf3ecd6, roughness: 0.7 }));
                card.position.y = 0.04 + k * 0.075; card.castShadow = true; grp.add(card);
            }
            const top = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 1.02),
                new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
            top.position.y = 0.04 + 4 * 0.075; grp.add(top);
            const sp = emojiSprite(e); sp.position.y = 0.55; grp.add(sp);
            GL_board.add(grp); GL_deco.push(grp);
        });
        // 起点金环 + 监狱栅栏 标记
        const start = CW[0], jc = CW[JAIL];
        const sRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 32),
            new THREE.MeshStandardMaterial({ color: 0xffd86b, emissive: 0x6a4e00, roughness: 0.4 }));
        sRing.rotation.x = Math.PI / 2; sRing.position.set(start.x, 0.20, start.z); GL_board.add(sRing); GL_deco.push(sRing);
        for (let s = 0; s < 4; s++) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
                new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.4, metalness: 0.6 }));
            bar.position.set(jc.x + (s % 2 ? 0.18 : -0.18), 0.3, jc.z + (s < 2 ? 0.18 : -0.18)); GL_board.add(bar); GL_deco.push(bar);
        }
    }

    function start3D(container) {
        return ensureThree().then(T => {
            if (dead) return; THREE = T;
            const em = container.querySelector('.mono-emblem'); if (em) em.innerHTML = '';
            const W = container.clientWidth || 640, H = container.clientHeight || 640;
            GL_renderer = new THREE.WebGLRenderer({ antialias: true });
            GL_renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            GL_renderer.setSize(W, H, false);
            if (THREE.sRGBEncoding) GL_renderer.outputEncoding = THREE.sRGBEncoding;
            GL_renderer.shadowMap.enabled = true; GL_renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            GL_renderer.domElement.className = 'mono-canvas';
            GL_renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;background:#0e1622;';
            container.appendChild(GL_renderer.domElement);
            GL_scene = new THREE.Scene(); GL_scene.background = new THREE.Color(0x0e1622);
            GL_camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
            GL_scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x40342a, 0.85));
            const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(8, 16, 6); sun.castShadow = true;
            sun.shadow.mapSize.set(1024, 1024);
            const sc = sun.shadow.camera; sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 50; sun.shadow.bias = -0.0006;
            GL_scene.add(sun);
            fitCam();                                    // 初始取景：整盘入镜
            GL_board = new THREE.Group(); GL_scene.add(GL_board);
            const base = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.3, 11.6), new THREE.MeshStandardMaterial({ color: 0x16331f, roughness: 0.95 }));
            base.position.y = -0.15; base.receiveShadow = true; GL_board.add(base);
            buildTiles(); buildBuildings(); buildPawns(); buildCenter();
            setupControls(GL_renderer.domElement);
            wireCamButtons(container);
            const onResize = () => { if (!GL_renderer) return; const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return; GL_renderer.setSize(w, h, false); GL_camera.aspect = w / h; GL_camera.updateProjectionMatrix(); fitCam(); };
            window.addEventListener('resize', onResize); GL_resize = onResize;
            syncScene(); animate();
        }).catch(err => {
            const em = container.querySelector('.mono-emblem');
            if (em) em.innerHTML = '<div style="color:#ffb3b3;padding:20px;text-align:center">3D 引擎加载失败：' + (err && err.message) + '</div>';
        });
    }

    // ================= 入口 =================
    MiniGames.monopoly = {
        LEVELS, ENDLESS,
        start(c, o) {
            opts = o; dead = false;
            net = !!(MG.pvp && MG.pvp.shouldBegin && MG.pvp.shouldBegin('monopoly'));
            mySide = net ? (MG.pvp._armed ? MG.pvp._armed.side : (MG.pvp.side || 0)) : 0;
            levelIdx = o.levelIdx == null ? 0 : o.levelIdx;
            endless = !!o.endless;
            cfgLevel = endless ? ENDLESS : (o.level || LEVELS[0]);

            const sv = loadSave();
            let resumed = false;
            if (sv && sv.levelIdx === levelIdx && sv.endless === endless && sv.s && sv.s.players) {
                S = sv.s;
                S.goal = S.goal == null ? Infinity : S.goal;
                Object.assign(S.players[0], { name: CHARS[0].n, e: CHARS[0].e, c: CHARS[0].c, me: true });
                S.players.forEach(p => { if (p.id !== 1) p.me = false; if (!Array.isArray(p.hand)) p.hand = []; });
                resumed = true;
            } else {
                S = newState(cfgLevel);
                clearSave();
            }

            if (net) {
                const seats = (MG.pvp._armed && MG.pvp._armed.seats) || null;
                const oppNames = (MG.pvp._armed && MG.pvp._armed.opp) || [];
                S.players.forEach((p, i) => {
                    p.me = (i === mySide);
                    if (i === mySide) { p.name = '你'; p.e = CHARS[0].e; p.c = CHARS[0].c; }
                    else { p.name = (seats && seats[i] && seats[i].name) ? seats[i].name : (oppNames[i] || p.name); }
                });
                S._done = false;
                MG.pvp.begin({
                    setState: (m) => { try { if (m && m.turn != null && m.turn < S.turn) return; Object.assign(S, m); render(); } catch (e) {} },
                    onOver: () => completeOnce(),
                });
            }

            const wrap = document.createElement('div');
            wrap.className = 'mgy-wrap mono';
            wrap.innerHTML = `
                <div class="mgy-plays" id="mgy-plays"></div>
                <div class="mgy-board" id="mgy-board">
                    <div class="mono-center">
                        <div class="mgy-round" id="mgy-round"></div>
                        <div class="mgy-goal" id="mgy-goal"></div>
                        <div class="mgy-dice" id="mgy-dice"></div>
                        <div class="mgy-cmsg" id="mgy-cmsg"></div>
                    </div>
                    <div class="mono-emblem" id="mono-emblem">🎲 正在加载 3D 棋盘…</div>
                    <div class="mono-camctl">
                        <button data-a="zin" title="放大">＋</button>
                        <button data-a="zout" title="缩小">－</button>
                        <button data-a="rl" title="左转视角">↺</button>
                        <button data-a="rr" title="右转视角">↻</button>
                        <button data-a="reset" title="复位视角">⟲</button>
                    </div>
                </div>
                <div class="mgy-panel" id="mgy-panel"></div>
                <div class="mgy-acts" id="mgy-acts"></div>
                <div class="mgy-log" id="mgy-log"></div>
                <div class="mgy-tip">💡 拖动旋转视角 · 滚轮缩放 · 右下角按钮也可控制 · 集齐同色街区即可建楼收高租 · 踩到庙宇遇神明 · 退出自动存档</div>`;
            c.innerHTML = '';
            c.appendChild(wrap);
            try { MG.audio.unlock(); } catch (e) {}
            el = {
                wrap,
                plays: wrap.querySelector('#mgy-plays'),
                board: wrap.querySelector('#mgy-board'),
                panel: wrap.querySelector('#mgy-panel'),
                acts: wrap.querySelector('#mgy-acts'),
                log: wrap.querySelector('#mgy-log'),
                round: wrap.querySelector('#mgy-round'),
                goal: wrap.querySelector('#mgy-goal'),
                cmsg: wrap.querySelector('#mgy-cmsg'),
                dice: wrap.querySelector('#mgy-dice'),
            };

            if (resumed) {
                S.phase = cur().me ? (cur().jail > 0 ? 'jail' : 'idle') : 'idle';
                S.msg = '📂 已载入上局存档，继续游戏';
                log('📂 载入存档', '#7ad86a');
            } else {
                log(`开局：目标 ${S.goal === Infinity ? '∞' : money(S.goal)} · ${S.maxRound} 轮`, '#7ad86a');
                S.msg = '轮到你了，掷骰开始';
            }
            render();
            start3D(el.board);
            const p = cur();
            if (!p.me && !net) later(aiTurn, 500);

            return { stop() { dead = true; save(); } };
        },
    };
    // 调试 / 自动模拟用
    MiniGames.monopoly._debug = {
        get S() { return S; }, CELLS, GROUPS, CARDS, GODS, LEVELS, ENDLESS, netWorth, rentOf,
        cur, act: onAct, nextTurn, buildList, newState, render,
        gl: () => ({ tiles: GL_tiles.length, pawns: GL_pawns.length, hasBoard: !!GL_board, three: !!THREE,
            threeRev: THREE ? (THREE.REVISION || '?') : null, deco: GL_deco.length }),
        blv: (i) => { const b = GL_blv[i]; return b ? { hotel: b.hotel.visible, slots: b.slots.map(s => s.visible) } : null; },
        visBld: () => GL_blv.reduce((a, b) => a + (b ? (b.hotel.visible ? 1 : 0) + b.slots.filter(s => s.visible).length : 0), 0),
        pawnCell: () => pawnCell.slice(),
        pawnQueueLen: () => pawnQueue.map(q => q.length),
        pawnTarget: () => pawnCell.slice(),
        camPos: () => ({ az: cam.az, pol: cam.pol, rad: cam.rad }),
        raf: () => GL_raf,
        drawCalls: () => (GL_renderer && GL_renderer.info) ? GL_renderer.info.render.calls : -1,
        pawnScreen: () => {
            if (!GL_camera || !GL_renderer) return [];
            const W = GL_renderer.domElement.clientWidth, H = GL_renderer.domElement.clientHeight;
            return GL_pawns.map(g => {
                const v = g.position.clone(); v.y += 0.5; v.project(GL_camera);
                return { vis: g.visible, x: Math.round((v.x * 0.5 + 0.5) * W), y: Math.round((-v.y * 0.5 + 0.5) * H),
                    wx: +g.position.x.toFixed(2), wz: +g.position.z.toFixed(2) };
            });
        },
    };
})();
