// 强手棋（Richman，2026-09-12 新作）—— 大富翁保留不动，这是独立的新游戏
// 特色：32 格大地图 · 8 种卡牌道具 · 神明附身 · 股票交易 · 道具商店
// 基本盘：掷骰走路 / 买地收租 / 集齐同色街区建楼 / 破产出局 / 自动存档
// 纯 DOM 实现（不依赖 MG 引擎），便于 tools/sim-richman.js 无头校准
window.MiniGames = window.MiniGames || {};
(function () {
    const fast = () => typeof window !== 'undefined' && !!window.__MG_FAST;
    const sleep = ms => new Promise(r => setTimeout(r, fast() ? 0 : ms));
    const later = (fn, ms) => setTimeout(fn, fast() ? 0 : ms);
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const money = v => '¥' + Math.max(0, Math.round(v));
    const SAVE_KEY = 'mg-richman-save-v1';

    // ---------------- 街区（同色集齐才能建楼）----------------
    const GROUPS = {
        brown: { name: '市井', color: '#8b5a2b', house: 50 },
        cyan:  { name: '风雅', color: '#2f9bc4', house: 60 },
        pink:  { name: '杏林', color: '#cf5f95', house: 80 },
        orange:{ name: '百工', color: '#dd8537', house: 100 },
        gold:  { name: '金玉', color: '#d4a438', house: 130 },
        blue:  { name: '通商', color: '#4a7fd0', house: 160 },
    };
    // 租金 = 地价 × 系数（0~3 楼 + 酒店），街区集齐且空地 ×2
    const RENT_MUL = [1, 2.4, 5, 9, 16];

    // 32 格棋盘：17 地产（6 街区）+ 起点/商店×2/事件×2/命运/卡片阁/神庙×2/股交所/监狱/警察/税×2/免费停
    const CELLS = [
        { n: '起点',   t: 'go',      e: '🏁' },
        { n: '闲居',   t: 'prop', e: '🏚️', g: 'brown', p: 60 },
        { n: '茅屋',   t: 'prop', e: '🛖', g: 'brown', p: 80 },
        { n: '机会',   t: 'chance',  e: '❓' },
        { n: '茶楼',   t: 'prop', e: '🍵', g: 'cyan', p: 100 },
        { n: '商店',   t: 'shop',    e: '🏪' },
        { n: '绸缎庄', t: 'prop', e: '🧵', g: 'cyan', p: 120 },
        { n: '瓷器行', t: 'prop', e: '🏺', g: 'cyan', p: 140 },
        { n: '监狱',   t: 'jail',    e: '🚔' },
        { n: '药铺',   t: 'prop', e: '🌿', g: 'pink', p: 140 },
        { n: '卡片阁', t: 'card',    e: '🎁' },
        { n: '当铺',   t: 'prop', e: '💍', g: 'pink', p: 160 },
        { n: '神庙',   t: 'temple',  e: '⛩️' },
        { n: '马场',   t: 'prop', e: '🐎', g: 'pink', p: 180 },
        { n: '免费停', t: 'park',    e: '🅿️' },
        { n: '铁匠铺', t: 'prop', e: '🔨', g: 'orange', p: 180 },
        { n: '印花税', t: 'tax',     e: '📜', v: 100 },
        { n: '染坊',   t: 'prop', e: '🎨', g: 'orange', p: 200 },
        { n: '命运',   t: 'chest',   e: '🎴' },
        { n: '船坞',   t: 'prop', e: '⛵', g: 'orange', p: 220 },
        { n: '商店',   t: 'shop',    e: '🏪' },
        { n: '钱庄',   t: 'prop', e: '💰', g: 'gold', p: 220 },
        { n: '银号',   t: 'prop', e: '🏦', g: 'gold', p: 240 },
        { n: '股交所', t: 'stock',   e: '📈' },
        { n: '金楼',   t: 'prop', e: '🏯', g: 'gold', p: 260 },
        { n: '警察',   t: 'gotojail', e: '👮' },
        { n: '机会',   t: 'chance',  e: '❓' },
        { n: '码头',   t: 'prop', e: '⚓', g: 'blue', p: 260 },
        { n: '神庙',   t: 'temple',  e: '⛩️' },
        { n: '仓库',   t: 'prop', e: '📦', g: 'blue', p: 280 },
        { n: '奢侈税', t: 'tax',     e: '💸', v: 150 },
        { n: '商埠',   t: 'prop', e: '🚢', g: 'blue', p: 300 },
    ];
    const N = CELLS.length;                    // 32
    const GROUP_CELLS = {};
    CELLS.forEach((c, i) => { if (c.t === 'prop') (GROUP_CELLS[c.g] = GROUP_CELLS[c.g] || []).push(i); });
    const JAIL = CELLS.findIndex(c => c.t === 'jail');
    const SALARY = 220;

    // 9×9 外圈坐标：底行右→左(0-8)，左列下→上(9-15)，顶行左→右(16-24 含右上角)，右列上→下(25-31)
    function cellPos(i) {
        if (i <= 8) return { r: 9, c: 9 - i };
        if (i <= 15) return { r: 8 - (i - 9), c: 1 };
        if (i <= 24) return { r: 1, c: 1 + (i - 16) };
        return { r: 2 + (i - 25), c: 9 };
    }

    // ---------------- 卡牌（8 种）----------------
    // need: none=即用 / cell=选格子 / jail=狱中使用
    const CARDS = {
        boost:     { n: '加速',   e: '🚀', need: 'none', desc: '立刻再掷一次骰子', price: 220 },
        barricade: { n: '路障',   e: '🚧', need: 'cell', desc: '放在任意格，路过者被迫停下', price: 260 },
        monster:   { n: '怪兽',   e: '👹', need: 'cell', desc: '拆掉一格的一级建筑', price: 300 },
        rob:       { n: '抢夺',   e: '💸', need: 'none', desc: '抢现金最多对手 ¥250', price: 320 },
        equal:     { n: '均富',   e: '💰', need: 'none', desc: '所有玩家现金平均', price: 420 },
        shield:    { n: '护身',   e: '🛡️', need: 'none', desc: '本轮下一次过路费全免', price: 240 },
        jailfree:  { n: '免罪',   e: '🎫', need: 'jail', desc: '立刻出狱', price: 180 },
        audit:     { n: '查税',   e: '📋', need: 'none', desc: '最富对手缴 5% 资产税（上限¥500）', price: 350 },
    };
    const CARD_KEYS = Object.keys(CARDS);

    // ---------------- 神明（附身 2 回合）----------------
    const GODS = {
        wealth: { n: '财神', e: '💰', desc: '收入×2' },
        luck:   { n: '福神', e: '🧧', desc: '每回合 +¥80' },
        doom:   { n: '衰神', e: '😈', desc: '支出×2' },
    };

    // ---------------- 股票（4 支，每轮随机游走）----------------
    const STOCKS = [
        { n: '茶马商行', e: '🫖' },
        { n: '盐铁官营', e: '⚙️' },
        { n: '漕运船队', e: '🚢' },
        { n: '绸缎庄号', e: '🧵' },
    ];

    // ---------------- 事件（机会/命运共用池，强手棋风格更狠一点）----------------
    const EVENTS = [
        { txt: '商队急召：直奔起点领工资',      f: (p, S) => goto(p, 0, true) },
        { txt: '快马加鞭：前进 3 步',           f: (p, S) => step(p, 3) },
        { txt: '迷路折返：后退 3 步',           f: (p, S) => step(p, -3) },
        { txt: '被捕！直接进监狱',              f: (p, S) => sendJail(p) },
        { txt: '银行分红：收 ¥200',             f: (p, S) => gain(p, 200) },
        { txt: '苛捐杂税：付 ¥150',             f: (p, S) => gain(p, -150) },
        { txt: '房塌桥断：你每级建筑修 ¥45',    f: (p, S) => houseTax(p, 45) },
        { txt: '天降横财：继承 ¥350',           f: (p, S) => gain(p, 350) },
        { txt: '商会会长：每位对手给你 ¥60',    f: (p, S) => each(p, S, 60) },
        { txt: '打点官府：付每位对手 ¥60',      f: (p, S) => each(p, S, -60) },
        { txt: '地契股息：每块地收 ¥70',        f: (p, S) => perProps(p, S, 70) },
        { txt: '拾金不昧：获得一张随机卡',      f: (p, S) => giveCard(p) },
        { txt: '误入歧途：失去一张随机卡',      f: (p, S) => loseCard(p) },
        { txt: '漕运通畅：前进 5 步',           f: (p, S) => step(p, 5) },
    ];

    function gain(p, v) {
        if (v > 0 && p.god && p.god.k === 'wealth') v *= 2;
        if (v < 0 && p.god && p.god.k === 'doom') v *= 2;
        p.cash += v; return (v >= 0 ? '+' : '') + Math.round(v);
    }
    function houseTax(p, per) {
        let h = 0, v = 0;
        S.lv.forEach((l, i) => { if (S.own[i] === p.id) { h += l; } });
        v = h * per; p.cash -= v; return `房${h}级 -${v}`;
    }
    function each(p, S, v) {
        const others = S.players.filter(x => x.id !== p.id && !x.out);
        if (v > 0 && p.god && p.god.k === 'wealth') v *= 2;
        if (v < 0 && p.god && p.god.k === 'doom') v *= 2;
        p.cash += v * others.length; others.forEach(o => o.cash -= v);
        return (v >= 0 ? '+' : '-') + Math.abs(v * others.length);
    }
    function perProps(p, S, per) {
        const n = S.own.filter(o => o === p.id).length;
        return gain(p, n * per);
    }
    function sendJail(p) { p.pos = JAIL; p.jail = 3; return '进了监狱'; }
    function goto(p, t, pay) { if (pay && t < p.pos) p.cash += SALARY; p.pos = t; return '移动到 ' + CELLS[t].n; }
    function step(p, d) { p.pos = (p.pos + d + N) % N; return (d >= 0 ? '前进 ' : '后退 ') + Math.abs(d) + ' 步'; }
    function giveCard(p) {
        if (p.hand.length >= 6) return '手牌已满';
        const k = CARD_KEYS[ri(0, CARD_KEYS.length - 1)];
        p.hand.push(k); return `获得【${CARDS[k].n}】`;
    }
    function loseCard(p) {
        if (!p.hand.length) return '没有卡可失去';
        const k = p.hand.splice(ri(0, p.hand.length - 1), 1)[0];
        return `失去【${CARDS[k].n}】`;
    }

    // ---------------- 50 关 ----------------
    const NAMES = ['初出茅庐','小本经营','沿街叫卖','茶楼掌柜','瓷器生意','杏林春暖','马市新贵','铁铺东家','染坊斑斓','船坞起航',
        '钱庄学徒','银号跑街','金楼贵客','码头风云','商埠新秀','集市大亨','车马盈门','货栈连排','票号初立','汇通天下',
        '股海弄潮','神明庇佑','卡片在手','路障连绵','怪兽出没','均富济世','查税大人','商战老手','垄断初成','街区的王',
        '富甲一坊','通衢要道','日进斗金','腰缠万贯','陶朱遗风','铜山金穴','堆金积玉','金玉满堂','富贵逼人','钟鸣鼎食',
        '富埒王侯','赀财巨万','富可敌国','财倾天下','金山银海','万贯家财','富甲天下','商界神话','点石成金','强手之巅'];
    // 难度曲线：目标/轮数由 tools/sim-richman.js baseline 实测校准（2026-09-12）
    const LEVELS = NAMES.map((name, i) => {
        const t = i / (NAMES.length - 1);
        const mul = +(1 + t * 1.0).toFixed(2);
        // 目标由 sim-richman.js baseline 实测校准（脚本玩家净资产中位数约 2900）：2300 → 2890 线性
        const goal = Math.round((2300 + i * 12) / 50) * 50;
        const rounds = Math.round(34 - t * 8);                 // 34 → 26 轮
        return { name, desc: `目标 ${goal} · ${rounds} 轮`, start: 1600, goal, rounds, ai: +(0.10 + t * 0.75).toFixed(2), mul };
    });
    const ENDLESS = { name: '无尽', desc: '150 轮超长局，比拼净资产', start: 1700, goal: Infinity, rounds: 150, ai: 0.8, mul: 1.25 };

    const AI_SKIN = [
        { e: '🦊', n: '贾聪明', c: '#5cc7ff' },
        { e: '🐯', n: '钱多多的', c: '#ffd56b' },
        { e: '🐻', n: '金实诚', c: '#9ee87a' },
    ];

    // ---------------- 联机同步辅助 ----------------
    // 整盘 S 序列化后 commit 给对手（剔除下划线字段/函数；over 仅在对局结束时带上）。
    // 状态同步模型：本地任意改变（掷骰/买地/建楼/过路费/卡牌/破产/换回合）后整盘广播，
    // 对手 Object.assign 重绘；回合用 S.turn(0..3) 在 4 人间顺序轮转，_turn 即「当前该走方」。
    function serialize(s) { return JSON.parse(JSON.stringify(s, (k, v) => (k.charCodeAt(0) === 95 ? undefined : v))); }
    function commitNet() {
        if (!net) return;
        try { const d = serialize(S); delete d.hop; d.turn = S.turn; d.over = S.over || undefined; MG.pvp.commit(d); } catch (e) {}
    }

    // ================= 主体 =================
    let S = null, el = {}, dead = false, opts = null, cfgLevel = null, levelIdx = 0, endless = false;
    let net = false, mySide = 0;   // 联机模式：net=true 时 4 名玩家均为真人，mySide 为我方座位(0..3)

    function newState(lv) {
        const mk = (id, e, n, c, me) => ({ id, me, name: n, e, c, cash: lv.start, pos: 0, jail: 0, hand: [], god: null, shield: false, out: false });
        const pls = [mk(1, '🧑', '你', '#ffd56b', true)];
        AI_SKIN.forEach((s, i) => pls.push(mk(i + 2, s.e, s.n, s.c, false)));
        return {
            players: pls,
            own: new Array(N).fill(0),
            lv: new Array(N).fill(0),
            mort: new Array(N).fill(false),
            barr: new Array(N).fill(false),
            price: CELLS.map(c => c.p ? Math.round(c.p * lv.mul / 10) * 10 : 0),
            hcost: Object.keys(GROUPS).reduce((o, k) => (o[k] = Math.round(GROUPS[k].house * lv.mul / 10) * 10, o), {}),
            stk: { p: STOCKS.map(() => 100), h: pls.map(() => STOCKS.map(() => 0)) },
            turn: 0, round: 1, phase: 'idle', msg: '', dices: [1, 1], log: [],
            over: false, aiLv: lv.ai, goal: lv.goal, maxRound: lv.rounds, doubles: 0,
            targeting: null,   // {card} 选目标格中
        };
    }

    const cur = () => S.players[S.turn];
    const rentBase = i => Math.round(S.price[i] * 0.12 / 5) * 5;
    const rentOf = i => {
        const o = S.own[i];
        if (!o || S.mort[i]) return 0;
        let r = Math.round(rentBase(i) * RENT_MUL[S.lv[i]]);
        if (S.lv[i] === 0 && ownsGroup(o, CELLS[i].g)) r *= 2;
        return r;
    };
    const stockValue = p => S.stk.h[p.id - 1].reduce((a, h, k) => a + h * S.stk.p[k], 0);
    const netWorth = p => p.cash + stockValue(p) + S.own.reduce((a, o, i) =>
        a + (o === p.id && !S.mort[i] ? S.price[i] + S.lv[i] * (CELLS[i].g ? S.hcost[CELLS[i].g] : 0) : 0), 0);
    const ownsGroup = (id, g) => GROUP_CELLS[g].every(i => S.own[i] === id && !S.mort[i]);

    function log(txt, color) {
        S.log.unshift({ t: txt, c: color || '#cfe0f5' });
        if (S.log.length > 30) S.log.pop();
        if (el.log && !window.__MG_NORENDER) el.log.innerHTML = S.log.slice(0, 10).map(l => `<div style="color:${l.c}">${l.t}</div>`).join('');
    }

    // ---------------- 渲染 ----------------
    function render() {
        if (dead || !el.board) return;
        if (window.__MG_NORENDER) return;
        el.plays.innerHTML = S.players.map((p, i) => `
            <div class="mgy-pcard${i === S.turn && !S.over ? ' active' : ''}${p.out ? ' out' : ''}" style="${i === S.turn ? `border-color:${p.c};box-shadow:0 0 0 1px ${p.c}55` : ''}">
                <div class="mgy-pav" style="background:${p.c}22;color:${p.c}">${p.e}${p.god ? `<i class="rman-god" title="${GODS[p.god.k].n}：${GODS[p.god.k].desc}">${GODS[p.god.k].e}</i>` : ''}</div>
                <div class="mgy-pinfo">
                    <div class="mgy-pname">${p.name}${p.jail > 0 ? ' 🚔' : ''}${p.shield ? ' 🛡️' : ''}</div>
                    <div class="mgy-pcash">${money(p.cash)}</div>
                </div>
                <div class="mgy-pest">${p.out ? '<span style="color:#ff7a8b">破产</span>' : money(netWorth(p))}</div>
            </div>`).join('');

        let html = `<div class="mgy-center">
            <div class="mgy-logo">🎴<span>强手棋</span></div>
            <div class="mgy-round">第 ${Math.min(S.round, S.maxRound)}/${S.maxRound} 轮</div>
            <div class="mgy-goal">目标 ${S.goal === Infinity ? '∞' : money(S.goal)}</div>
            <div class="mgy-dice" id="mgy-dice"><i>${S.dices[0]}</i><i>${S.dices[1]}</i></div>
        </div>`;
        for (let i = 0; i < N; i++) {
            const c = CELLS[i], pos = cellPos(i), o = S.own[i], g = c.g ? GROUPS[c.g] : null;
            const pips = S.players.filter(p => p.pos === i && !p.out);
            let badge = '';
            if (c.t === 'prop') {
                if (S.mort[i]) badge = '抵押';
                else if (S.lv[i] === 4) badge = '🏨';
                else if (S.lv[i] > 0) badge = '🏠'.repeat(S.lv[i]);
                else badge = o ? '✔' : money(S.price[i]);
            } else if (c.t === 'tax') badge = '-' + c.v;
            else if (c.t === 'go') badge = '+' + SALARY;
            const oc = o ? ((S.players.find(p => p.id === o) || {}).c || '#fff') : '';
            html += `<div class="mgy-cell ${c.t}${S.mort[i] ? ' mort' : ''}${S.targeting && cellTargetable(i) ? ' rman-target' : ''}" data-cell="${i}" style="grid-area:${pos.r}/${pos.c}">
                ${g ? `<div class="mgy-gbar" style="background:${g.color}"></div>` : ''}
                <div class="mgy-ce">${c.e}</div>
                <div class="mgy-cn">${c.n}</div>
                <div class="mgy-cb" style="color:${oc || '#e8e0c0'}">${badge}</div>
                ${S.barr[i] ? '<div class="rman-barr">🚧</div>' : ''}
                <div class="mgy-pips">${pips.map(p => `<b style="background:${p.c}">${p.e}</b>`).join('')}</div>
            </div>`;
        }
        el.board.innerHTML = html;
        el.dice = el.board.querySelector('#mgy-dice');
        el.board.querySelectorAll('[data-cell]').forEach(d => d.onclick = () => onCellTap(+d.dataset.cell));
        renderHand();
        renderPanel();
        if (opts && opts.onScore) opts.onScore(`第 ${Math.min(S.round, S.maxRound)}/${S.maxRound} 轮 · 净资产 ${money(netWorth(S.players[0]))} · 目标 ${S.goal === Infinity ? '∞' : money(S.goal)}`);
    }

    // ---------------- 手牌栏 ----------------
    function renderHand() {
        if (!el.hand) return;
        const p = S.players[0];
        el.hand.innerHTML = `<div class="rman-handlabel">🂠 手牌 ${p.hand.length}/6</div>` +
            p.hand.map((k, idx) => {
                const c = CARDS[k];
                const usable = !S.over && S.turn === 0 && (c.need !== 'jail' || p.jail > 0) && S.phase !== 'rolling' && S.phase !== 'moving';
                return `<button class="rman-card${usable ? '' : ' dis'}" data-h="${idx}" title="${c.desc}">
                    <span class="rman-ce">${c.e}</span><span class="rman-cn">${c.n}</span></button>`;
            }).join('') +
            `<button class="rman-stockbtn" id="rman-stock">📈 股市<br><span>${money(stockValue(p))}</span></button>`;
        el.hand.querySelectorAll('[data-h]').forEach(b => b.onclick = () => useCard(+b.dataset.h));
        const sb = el.hand.querySelector('#rman-stock');
        if (sb) sb.onclick = showStockPanel;
    }

    function renderPanel() {
        const p = cur();
        if (S.over) { el.panel.innerHTML = '<div class="mgy-msg">本局结束</div>'; el.acts.innerHTML = ''; return; }
        if (S.targeting) { el.panel.innerHTML = `<div class="mgy-msg">🎯 点击棋盘上高亮的格子放下【${CARDS[S.targeting.card].n}】</div>`; el.acts.innerHTML = `<button class="mg-btn" data-a="cancelt">取消</button>`; el.acts.querySelectorAll('button').forEach(b => b.onclick = () => { S.targeting = null; render(); }); return; }
        el.panel.innerHTML = `<div class="mgy-msg">${S.msg || (p.me ? '轮到你了' : p.name + ' 的回合')}</div>`;
        if (!p.me) { el.acts.innerHTML = `<div class="mgy-wait">${p.e} ${p.name} 思考中…</div>`; return; }
        let acts = '';
        if (S.phase === 'rolling' || S.phase === 'moving') acts = '<div class="mgy-wait">…</div>';
        else if (S.phase === 'decide') {
            const c = CELLS[p.pos];
            acts = `<button class="mg-btn primary" data-a="buy">💰 买下 ${c.n}（${money(S.price[p.pos])}）</button>
                    <button class="mg-btn" data-a="skip">放弃</button>`;
        } else if (S.phase === 'shopwait') {
            acts = '<div class="mgy-wait">逛商店中…</div>';
        } else if (S.phase === 'jail') {
            acts = `<button class="mg-btn primary" data-a="roll">🎲 掷骰求对子</button>`;
            if (p.hand.includes('jailfree')) acts += `<button class="mg-btn" data-a="usejf">🎫 用免罪卡</button>`;
            if (p.cash >= 60) acts += `<button class="mg-btn" data-a="fine">💸 付 ¥60 出狱</button>`;
        } else {
            if (S.phase === 'idle') acts += `<button class="mg-btn primary" data-a="roll">🎲 掷骰</button>`;
            const bl = buildList(p);
            if (bl.length && S.phase !== 'rolling') acts += `<button class="mg-btn" data-a="build">🏠 建楼 (${bl.length})</button>`;
            if (S.phase === 'end') acts += `<button class="mg-btn primary" data-a="next">结束回合 ›</button>`;
        }
        el.acts.innerHTML = acts;
        el.acts.querySelectorAll('button').forEach(b => b.onclick = () => onAct(b.dataset.a));
    }

    function buildList(p) {
        const out = [];
        for (let i = 0; i < N; i++) {
            if (S.own[i] !== p.id || S.mort[i] || S.lv[i] >= 4) continue;
            const g = GROUPS[CELLS[i].g];
            if (!ownsGroup(p.id, CELLS[i].g)) continue;
            const cost = S.hcost[CELLS[i].g];
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
            p.cash -= priceAfterGod(p, S.price[i]); S.own[i] = p.id;
            try { MG.audio.sfx('coin'); } catch (e) {}
            log(`🧑 买下【${CELLS[i].n}】-${money(S.price[i])}`, p.c);
            S.phase = 'end';
            S.msg = `买下 ${CELLS[i].n}${ownsGroup(p.id, CELLS[i].g) ? '，街区集齐，可建楼！' : ''}`;
            save(); render(); commitNet();
        } else if (a === 'skip') {
            S.phase = 'end'; S.msg = '放弃这块地'; save(); render(); commitNet();
        } else if (a === 'build') showBuild(p);
        else if (a === 'next') nextTurn();
        else if (a === 'usejf') {
            const k = p.hand.indexOf('jailfree');
            if (k < 0) return;
            p.hand.splice(k, 1); p.jail = 0; S.phase = 'idle';
            log('🎫 使用免罪卡出狱', p.c); S.msg = '重获自由，掷骰吧'; save(); render(); commitNet();
        } else if (a === 'fine') {
            p.cash -= 60; p.jail = 0; S.phase = 'idle';
            log('💸 缴纳 ¥60 出狱', p.c); S.msg = '交钱走人'; save(); render(); commitNet();
        } else if (a === 'shopdone') {
            // 商店面板关闭的统一路径（按钮 / 自动模拟共用），phase 卡死保护
            const box = el.wrap.querySelector('.mgy-build');
            if (box) box.remove();
            if (S.phase === 'shopwait') { S.phase = 'end'; save(); render(); commitNet(); }
        }
    }
    // 土地公式优惠位（财神只加倍收入，不折价；这里给财神买地 95 折作为小彩蛋）
    function priceAfterGod(p, price) { return p.god && p.god.k === 'wealth' ? Math.round(price * 0.95) : price; }

    function cellTargetable(i) {
        if (!S.targeting) return false;
        if (S.targeting.card === 'barricade') return !S.barr[i];
        if (S.targeting.card === 'monster') return S.lv[i] > 0;
        return false;
    }
    function onCellTap(i) {
        if (!S.targeting) return;
        if (net && (!MG.pvp.canMove() || S.turn !== mySide)) return;   // 联机：没轮到就锁输入
        const card = S.targeting.card, p = S.players[0];
        if (!cellTargetable(i)) { S.msg = '这格不能选'; render(); return; }
        S.targeting = null;
        p.hand.splice(p.hand.indexOf(card), 1);
        if (card === 'barricade') { S.barr[i] = true; log(`🚧 你在【${CELLS[i].n}】放了路障`, p.c); S.msg = '路障已放置'; }
        if (card === 'monster') {
            const owner = S.players.find(x => x.id === S.own[i]);
            S.lv[i] = Math.max(0, S.lv[i] - 1);
            log(`👹 怪兽拆了【${CELLS[i].n}】的建筑${owner ? '（' + owner.name + '）' : ''}`, p.c);
            S.msg = '怪兽破坏成功！';
        }
        save(); render(); commitNet();
    }

    // ---------------- 出牌 ----------------
    function useCard(idx) {
        if (dead || S.over) return;
        const p = S.players[net ? mySide : 0];
        if (S.turn !== (net ? mySide : 0)) { S.msg = '还没轮到你'; render(); return; }
        const k = p.hand[idx]; if (!k) return;
        const c = CARDS[k];
        if (c.need === 'jail' && p.jail <= 0) { S.msg = '免罪卡要在监狱里用'; render(); return; }
        if (S.phase === 'rolling' || S.phase === 'moving' || S.phase === 'shopwait') return;

        if (c.need === 'cell') { S.targeting = { card: k }; S.msg = `选择目标格`; render(); return; }

        // 即用型
        p.hand.splice(idx, 1);
        if (k === 'boost') {
            log('🚀 使用加速卡，再掷一次！', p.c);
            S.phase = 'idle'; S.msg = '加速！'; save(); render(); commitNet();
            later(() => doRoll(p), 200);
        } else if (k === 'shield') {
            p.shield = true; log('🛡️ 护身卡生效，本轮过路费全免', p.c); S.msg = '护身生效'; save(); render(); commitNet();
        } else if (k === 'jailfree') {
            p.jail = 0; S.phase = 'idle'; log('🎫 免罪卡出狱', p.c); S.msg = '自由了，掷骰吧'; save(); render(); commitNet();
        } else if (k === 'rob') {
            const t = S.players.filter(x => x !== p && !x.out).sort((a, b) => b.cash - a.cash)[0];
            const v = Math.min(250, t.cash);
            t.cash -= v; p.cash += v;
            log(`💸 抢夺了 ${t.name} ${money(v)}`, p.c); S.msg = `抢到 ${money(v)}！`;
            checkBroke(); save(); render(); commitNet();
        } else if (k === 'equal') {
            const alive = S.players.filter(x => !x.out);
            const avg = Math.round(alive.reduce((a, x) => a + x.cash, 0) / alive.length);
            alive.forEach(x => x.cash = avg);
            log(`💰 均富卡！所有人现金变为 ${money(avg)}`, p.c); S.msg = '天下大同';
            save(); render(); commitNet(); return;
        } else if (k === 'audit') {
            const t = S.players.filter(x => x !== p && !x.out).sort((a, b) => netWorth(b) - netWorth(a))[0];
            const v = Math.min(500, Math.round(t.cash * 0.05));
            t.cash -= v; p.cash += v;
            log(`📋 查税 ${t.name}，补缴 ${money(v)}`, p.c); S.msg = `税银 ${money(v)} 到账`;
            checkBroke(); save(); render(); commitNet();
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
                <span class="mgy-bcost">${b.lv === 4 ? '🏨 酒店' : '🏠 Lv' + b.lv} · ${money(b.cost)}</span></button>`).join('')}</div>
            <button class="mg-btn" data-close>关闭</button></div>`;
        el.wrap.appendChild(box);
        box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
            const i = +b.dataset.i, cost = S.hcost[CELLS[i].g];
            if (p.cash < cost || S.lv[i] >= 4) return;
            p.cash -= cost; S.lv[i]++;
            log(`🏠 ${p.name} 在【${CELLS[i].n}】建到 Lv${S.lv[i]}`, p.c);
            box.remove(); save(); render(); commitNet();
        });
        box.querySelector('[data-close]').onclick = () => { box.remove(); if (S.phase === 'shopwait') { S.phase = 'end'; render(); } };
        box.onclick = e => { if (e.target === box) { box.remove(); if (S.phase === 'shopwait') { S.phase = 'end'; render(); } } };
    }

    async function jailTry(p) {
        const d1 = ri(1, 6), d2 = ri(1, 6);
        await animDice(d1, d2);
        if (dead) return;
        if (d1 === d2) { p.jail = 0; S.phase = 'idle'; log(`🎲 ${d1}+${d2} 对子！出狱`, p.c); S.msg = '掷出对子，出狱！'; }
        else if (--p.jail <= 0) {
            p.cash -= 60; p.jail = 0; S.phase = 'idle';
            log('💸 三次未掷出对子，付 ¥60 出狱', p.c); S.msg = '付 ¥60 出狱';
        }         else { S.phase = 'end'; S.msg = `未掷出对子，还剩 ${p.jail} 次机会`; }
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
        if (dead || S.over || S.phase === 'decide' || S.phase === 'shopwait') { save(); render(); commitNet(); return; }
        if (dbl && !p.jail && !p.out) { S.phase = 'idle'; S.msg = '掷出对子，再来一次！'; }
        else S.phase = 'end';
        save(); render(); commitNet();
    }

    async function walk(p, steps) {
        const pace = p.me ? 300 : 170;
        for (let k = 0; k < steps; k++) {
            p.pos = (p.pos + 1) % N;
            if (p.pos === 0) { const g = gain(p, SALARY); log(`🏁 ${p.name} 经过起点，工资 ${g}`, p.c); }
            if (S.barr[p.pos]) {
                S.barr[p.pos] = false;
                log(`🚧 ${p.name} 撞上路障，停在【${CELLS[p.pos].n}】`, '#ffb066');
                break;
            }
            S.hop = p.id;
            render();
            markHop();
            if (dead) { S.hop = -1; return; }
            await sleep(pace);
        }
        S.hop = -1;
        render();
    }
    function markHop() {
        if (!el.board) return;
        el.board.querySelectorAll('.mgy-hopping').forEach(x => x.classList.remove('mgy-hopping'));
        const p = S.players.find(q => q.id === S.hop);
        if (p) {
            const cell = el.board.querySelectorAll('.mgy-cell')[p.pos];
            if (cell) cell.classList.add('mgy-hopping');
        }
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
            p.pos = JAIL; p.jail = 3;
            log(`👮 ${p.name} 被押进监狱`, '#ff7a8b'); S.msg = `${p.name} 进监狱了`; checkBroke(); return;
        }
        if (c.t === 'tax') {
            const v = p.god && p.god.k === 'doom' ? c.v * 2 : c.v;
            p.cash -= v; log(`📜 ${p.name} 缴纳${c.n} -${v}`, '#ff9f6b'); S.msg = `缴纳${c.n} ${money(v)}`;
        }
        else if (c.t === 'park') S.msg = '免费停车，歇口气';
        else if (c.t === 'jail') S.msg = '只是路过探监';
        else if (c.t === 'go') S.msg = '回到起点';
        else if (c.t === 'temple') {
            if (Math.random() < 0.4) S.msg = '神庙清净，佛系路过';
            else {
                const keys = Object.keys(GODS);
                const k = keys[ri(0, keys.length - 1)];
                p.god = { k, left: 2 };
                log(`${GODS[k].e} ${GODS[k].n}附身 ${p.name}：${GODS[k].desc}（2 回合）`, '#e8c8ff');
                S.msg = `${GODS[k].n}附身！${GODS[k].desc}`;
            }
        }
        else if (c.t === 'card') {
            const res = giveCard(p);
            log(`🎁 ${p.name} 在卡片阁：${res}`, '#ffd56b'); S.msg = res;
        }
        else if (c.t === 'shop') {
            if (p.me) { openShop(p); return; }
            aiShop(p);
        }
        else if (c.t === 'stock') {
            const k = ri(0, STOCKS.length - 1);
            const chg = (ri(15, 35) / 100) * (Math.random() < 0.5 ? -1 : 1);
            S.stk.p[k] = Math.max(20, Math.min(500, Math.round(S.stk.p[k] * (1 + chg))));
            const up = chg > 0;
            log(`📈 股交所：${STOCKS[k].e}${STOCKS[k].n} ${up ? '大涨' : '大跌'} ${Math.round(Math.abs(chg) * 100)}% → ¥${S.stk.p[k]}`, up ? '#7ad86a' : '#ff7a8b');
            S.msg = `${STOCKS[k].n}${up ? '暴涨' : '暴跌'}！`;
        }
        else if (c.t === 'chance' || c.t === 'chest') {
            const card = EVENTS[ri(0, EVENTS.length - 1)];
            const before = p.pos;
            const res = card.f(p, S) || '';
            log(`🎴 ${p.name}：${card.txt}${res ? ' → ' + res : ''}`, '#ffd56b');
            S.msg = `${card.txt}${res ? '（' + res + '）' : ''}`;
            if (p.pos !== before && !dead) { render(); await sleep(260); }
            const nc = CELLS[p.pos];
            if (nc.t === 'prop' || nc.t === 'tax' || nc.t === 'shop' || nc.t === 'card' || nc.t === 'temple' || nc.t === 'stock') return onLand(p);
        } else if (c.t === 'prop') {
            const o = S.own[i];
            if (!o) {
                if (p.me) { S.phase = 'decide'; S.msg = `空地【${c.n}】售价 ${money(S.price[i])}，基础租金 ${money(rentBase(i))}，买不买？`; return; }
                aiBuy(p, i);
            } else if (o === p.id) {
                S.msg = `回到自己的${c.n}${ownsGroup(p.id, c.g) && S.lv[i] < 4 ? '（街区集齐，可建楼）' : ''}`;
            } else {
                const owner = S.players.find(x => x.id === o);
                if (S.mort[i]) S.msg = `${c.n} 已抵押，免租`;
                else if (p.shield) { p.shield = false; log(`🛡️ ${p.name} 护身卡生效，免租！`, p.c); S.msg = '护身卡免租！'; }
                else {
                    let r = rentOf(i);
                    if (owner.god && owner.god.k === 'wealth') r *= 2;
                    r = Math.round(r);
                    p.cash -= r; owner.cash += r;
                    try { MG.audio.sfx('target'); } catch (e) {}
                    log(`💸 ${p.name} 在【${c.n}】付租 ${money(r)} → ${owner.name}`, owner.c);
                    S.msg = `${p.name} 付租 ${money(r)} 给 ${owner.name}`;
                }
            }
        }
        checkBroke();
    }

    // ---------------- 商店 ----------------
    function openShop(p) {
        S.phase = 'shopwait'; S.msg = '欢迎光临道具商店';
        const picks = [];
        for (let k = 0; k < 3; k++) picks.push(CARD_KEYS[ri(0, CARD_KEYS.length - 1)]);
        const box = document.createElement('div');
        box.className = 'mgy-build';
        box.innerHTML = `<div class="mgy-build-card">
            <div class="mgy-bt">🏪 道具商店　现金 ${money(p.cash)}　（手牌 ${p.hand.length}/6）</div>
            <div class="mgy-blist">${picks.map((k, idx) => `<button data-k="${idx}" ${p.cash < CARDS[k].price || p.hand.length >= 6 ? 'disabled style="opacity:.45"' : ''}>
                <span>${CARDS[k].e} ${CARDS[k].n} <i style="font-style:normal;font-size:10px;color:#9fb4d8">${CARDS[k].desc}</i></span>
                <span class="mgy-bcost">${money(CARDS[k].price)}</span></button>`).join('')}</div>
            <button class="mg-btn" data-close>离开（结束回合）</button></div>`;
        el.wrap.appendChild(box);
        box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
            const k = picks[+b.dataset.k], cost = CARDS[k].price;
            if (p.cash < cost || p.hand.length >= 6) return;
            p.cash -= cost; p.hand.push(k);
            log(`🏪 购入【${CARDS[k].n}】-${money(cost)}`, p.c);
            box.remove(); S.phase = 'end'; save(); render(); commitNet();
        });
        box.querySelector('[data-close]').onclick = () => { box.remove(); S.phase = 'end'; save(); render(); commitNet(); };
        render();
    }
    function aiShop(p) {
        if (p.cash > 500 && p.hand.length < 5 && Math.random() < 0.55 + S.aiLv * 0.35) {
            const k = CARD_KEYS[ri(0, CARD_KEYS.length - 1)];
            if (p.cash >= CARDS[k].price) {
                p.cash -= CARDS[k].price; p.hand.push(k);
                log(`🏪 ${p.name} 购入【${CARDS[k].n}】`, p.c);
                S.msg = `${p.name} 买了道具`;
            }
        } else S.msg = `${p.name} 逛了逛商店，啥也没买`;
    }

    // ---------------- 股票面板 ----------------
    function showStockPanel() {
        if (S.over) return;
        const p = S.players[net ? mySide : 0];
        const hk = net ? mySide : 0;   // 我方持股索引（玩家 id=mySide+1 → h[mySide]）
        const box = document.createElement('div');
        box.className = 'mgy-build';
        const renderRows = () => STOCKS.map((st, k) => {
            const hold = S.stk.h[hk][k], pr = S.stk.p[k];
            return `<div class="rman-srow">
                <span class="rman-sname">${st.e} ${st.n}</span>
                <span class="rman-sprice">¥${pr}</span>
                <span class="rman-shold">持 ${hold} 手</span>
                <button data-buy="${k}" ${p.cash < pr ? 'disabled style="opacity:.4"' : ''}>买</button>
                <button data-sell="${k}" ${hold <= 0 ? 'disabled style="opacity:.4"' : ''}>卖</button>
            </div>`;
        }).join('');
        box.innerHTML = `<div class="mgy-build-card">
            <div class="mgy-bt">📈 股票交易所　现金 ${money(p.cash)}</div>
            <div class="rman-slist">${renderRows()}</div>
            <div style="font-size:10.5px;color:#8fa0c0;margin:6px 0">股价每轮波动 · 踩到股交所会有暴涨暴跌 · 净资产计入持股市值</div>
            <button class="mg-btn" data-close>关闭</button></div>`;
        el.wrap.appendChild(box);
        const bind = () => {
            box.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
                const k = +b.dataset.buy;
                if (p.cash < S.stk.p[k]) return;
                p.cash -= S.stk.p[k]; S.stk.h[hk][k]++; try { MG.audio.sfx('coin'); } catch (e) {}
                log(`📈 买入 ${STOCKS[k].n} 1手 -${money(S.stk.p[k])}`, p.c);
                refresh(); commitNet();
            });
            box.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
                const k = +b.dataset.sell;
                if (S.stk.h[hk][k] <= 0) return;
                S.stk.h[hk][k]--; p.cash += S.stk.p[k]; try { MG.audio.sfx('coin'); } catch (e) {}
                log(`📉 卖出 ${STOCKS[k].n} 1手 +${money(S.stk.p[k])}`, p.c);
                refresh(); commitNet();
            });
        };
        const refresh = () => {
            box.querySelector('.rman-slist').innerHTML = renderRows();
            box.querySelector('.mgy-bt').innerHTML = `📈 股票交易所　现金 ${money(p.cash)}`;
            bind(); save(); render();
        };
        bind();
        box.querySelector('[data-close]').onclick = () => box.remove();
        box.onclick = e => { if (e.target === box) box.remove(); };
    }

    function aiBuy(p, i) {
        const price = S.price[i];
        const keep = Math.round(160 + 420 * (1 - S.aiLv) * 0.6);
        const c = CELLS[i];
        const have = GROUP_CELLS[c.g].filter(k => S.own[k] === p.id).length;
        const near = have >= GROUP_CELLS[c.g].length - 1 ? 1.5 : 1;
        const good = (rentBase(i) / price) * near;
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
            while (p.cash < 0 && guard++ < 80) {           // 自救：卖股票 → 卖楼（半价）→ 抵押地皮
                const h = S.stk.h[p.id - 1];
                const si = h.findIndex(x => x > 0);
                if (si >= 0) { h[si]--; p.cash += Math.round(S.stk.p[si] * 0.6); continue; }
                let did = false;
                for (let i = 0; i < N; i++) {
                    if (S.own[i] !== p.id) continue;
                    if (S.lv[i] > 0) { p.cash += Math.round(S.hcost[CELLS[i].g] / 2); S.lv[i]--; did = true; break; }
                    if (!S.mort[i]) { p.cash += Math.round(S.price[i] / 2); S.mort[i] = true; did = true; break; }
                }
                if (!did) break;
            }
            if (p.cash < 0) {
                p.out = true; p.god = null; p.hand = [];
                S.own.forEach((o, i) => { if (o === p.id) { S.own[i] = 0; S.lv[i] = 0; S.mort[i] = false; } });
                S.barr.forEach((b, i) => { if (b && p.id) {} });
                log(`💀 ${p.name} 破产出局！`, '#ff7a8b');
            }
        });
        const alive = S.players.filter(p => !p.out);
        if (alive.length <= 1 || S.players[net ? mySide : 0].out) finish();
    }

    // 终局结算（仅触发一次）：联机下 me 取「我方座位」，结算后整盘广播 over 给对手。
    function completeOnce() {
        if (S._done) return;
        S._done = true;
        const me = S.players[net ? mySide : 0];
        const alive = S.players.filter(p => !p.out);
        const nw = netWorth(me);
        let win = false, stars = 0;
        if (me.out) { win = false; stars = 0; }
        else if (endless) { win = alive.length <= 1; stars = win ? 3 : (nw >= 7000 ? 2 : 1); }
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
            title: me.out ? '💀 破产收场' : (win ? '🏆 强手降临' : '⌛ 回合耗尽'),
            lines: [
                `净资产 ${money(nw)} / 目标 ${S.goal === Infinity ? '∞' : money(S.goal)}`,
                `地产 ${S.own.filter(o => o === me.id).length} 块 · 建筑 ${S.lv.reduce((a, b, i) => a + (S.own[i] === me.id ? b : 0), 0)} 级 · 股票 ${money(stockValue(me))} · 现金 ${money(me.cash)}`,
                S.players.filter(p => p.id !== me.id).map(p => `${p.e}${p.name} ${p.out ? '破产' : money(netWorth(p))}`).join(' · '),
            ],
        });
        render();
    }
    function finish() {
        if (S.over) return;
        S.over = true;
        if (net) commitNet();            // 广播终局，对手收到 over 后各自结算
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
                swingStocks();
            }
        } while (S.players[S.turn].out && guard++ < 20);
        const p = cur();
        // 神明计时：新回合开始时减；福神发钱
        S.players.forEach(x => {
            if (x.god) {
                if (x.god.k === 'luck') { x.cash += 80; }
                x.god.left--;
                if (x.god.left <= 0) { if (!window.__MG_NORENDER) log(`${GODS[x.god.k].e} 神明离开了 ${x.name}`, '#b8a8d8'); x.god = null; }
            }
        });
        S.doubles = 0;
        S.phase = p.jail > 0 ? 'jail' : 'idle';
        S.msg = p.me ? (p.jail > 0 ? '你在监狱里：掷对子 / 付 ¥60 / 用免罪卡' : '轮到你了，掷骰吧') : '';
        save(); render(); commitNet();
        if (!p.me && !net) later(aiTurn, 380);   // 联机：4 人均为真人，绝不自动代打
    }

    function swingStocks() {
        STOCKS.forEach((st, k) => {
            const chg = 0.82 + Math.random() * 0.42;   // -18% ~ +24%
            S.stk.p[k] = Math.max(20, Math.min(500, Math.round(S.stk.p[k] * chg)));
        });
    }

    // ---------------- AI 回合 ----------------
    async function aiTurn() {
        if (net) return;                 // 联机：4 人均为真人，绝不自动代打
        const p = cur();
        if (dead || S.over || p.me || p.out) return;
        await sleep(240);
        if (dead || S.over) return;
        // 狱中
        if (p.jail > 0) {
            const jf = p.hand.indexOf('jailfree');
            if (jf >= 0) { p.hand.splice(jf, 1); p.jail = 0; log(`🎫 ${p.name} 用免罪卡出狱`, p.c); }
            else if (p.cash > 300 && Math.random() < 0.5 + S.aiLv * 0.4) { p.cash -= 60; p.jail = 0; log(`💸 ${p.name} 付 ¥60 出狱`, p.c); }
            else {
                const d1 = ri(1, 6), d2 = ri(1, 6);
                await animDice(d1, d2);
                if (d1 === d2) { p.jail = 0; log(`🎲 ${p.name} 掷出对子出狱`, p.c); }
                else p.jail--;
            }
            render();
            if (dead || S.over) return;
            if (p.jail > 0) { S.phase = 'end'; save(); render(); return later(nextTurn, 400); }
        }
        // AI 出牌（简单但合理）
        if (Math.random() < 0.35 + S.aiLv * 0.4 && p.hand.length) {
            aiPlayCard(p);
            render();
            if (dead || S.over) return;
        }
        // AI 股票：低买高卖
        if (Math.random() < 0.3 + S.aiLv * 0.3) {
            S.stk.p.forEach((pr, k) => {
                if (pr < 85 && p.cash > pr + 300 && Math.random() < 0.5) { p.cash -= pr; S.stk.h[p.id - 1][k]++; }
                else if (pr > 135 && S.stk.h[p.id - 1][k] > 0 && Math.random() < 0.5) { S.stk.h[p.id - 1][k]--; p.cash += pr; }
            });
        }
        // AI 建楼
        if (Math.random() < 0.5 + S.aiLv * 0.45) {
            const list = buildList(p).sort((a, b) => b.lv - a.lv);
            if (list.length) {
                const n = Math.random() < S.aiLv ? Math.min(list.length, 1 + ri(0, 1)) : 1;
                for (let k = 0; k < n; k++) {
                    const b = list[k];
                    if (p.cash - b.cost < 200 * (1.1 - S.aiLv)) break;
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

    function aiPlayCard(p) {
        const foes = S.players.filter(x => x !== p && !x.out);
        if (!foes.length) return;
        const use = k => { p.hand.splice(p.hand.indexOf(k), 1); log(`🂠 ${p.name} 使用【${CARDS[k].n}】`, p.c); };
        // 狱中免罪在 jailTry 分支已处理；这里处理进攻/功能牌
        if (p.hand.includes('equal')) {
            const others = foes.reduce((a, x) => a + x.cash, 0) / foes.length;
            if (p.cash < others * 0.75) { use('equal'); S.players.filter(x => !x.out).forEach(x => x.cash = Math.round((p.cash + foes.reduce((a, x) => a + x.cash, 0)) / (foes.length + 1))); S.msg = `${p.name} 打出均富卡！`; return; }
        }
        if (p.hand.includes('rob')) {
            const t = foes.sort((a, b) => b.cash - a.cash)[0];
            const v = Math.min(250, t.cash);
            t.cash -= v; p.cash += v; use('rob');
            log(`💸 ${p.name} 抢夺 ${t.name} ${money(v)}`, p.c); S.msg = `${p.name} 抢了 ${money(v)}`;
            checkBroke(); return;
        }
        if (p.hand.includes('audit')) {
            const t = foes.sort((a, b) => netWorth(b) - netWorth(a))[0];
            const v = Math.min(500, Math.round(t.cash * 0.05));
            t.cash -= v; p.cash += v; use('audit');
            log(`📋 ${p.name} 查税 ${t.name}，收 ${money(v)}`, p.c); S.msg = `${t.name} 被查税`;
            checkBroke(); return;
        }
        // 怪兽：拆威胁最大的高楼
        if (p.hand.includes('monster')) {
            let best = -1, bv = 0;
            for (let i = 0; i < N; i++) {
                if (S.own[i] && S.own[i] !== p.id && S.lv[i] > bv) { bv = S.lv[i]; best = i; }
            }
            if (best >= 0 && bv >= 2) {
                S.lv[best]--; use('monster');
                log(`👹 ${p.name} 的怪兽拆了【${CELLS[best].n}】`, p.c); S.msg = '怪兽破坏！';
                return;
            }
        }
        // 路障：放在对手身后 1-3 格
        if (p.hand.includes('barricade')) {
            const t = foes.sort((a, b) => b.cash - a.cash)[0];
            const spot = (t.pos + ri(1, 3)) % N;
            if (!S.barr[spot]) { S.barr[spot] = true; use('barricade'); log(`🚧 ${p.name} 在【${CELLS[spot].n}】放了路障`, p.c); S.msg = '路障已放置'; return; }
        }
        // 护身：残血时用
        if (p.hand.includes('shield') && p.cash < 400) { p.shield = true; use('shield'); S.msg = `${p.name} 挂起护身符`; return; }
    }

    // ---------------- 存档 ----------------
    function save() {
        if (S.over) return;
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({
                v: 1, levelIdx, endless, t: Date.now(),
                s: {
                    players: S.players, own: S.own, lv: S.lv, mort: S.mort, barr: S.barr, price: S.price, hcost: S.hcost,
                    stk: S.stk, turn: S.turn, round: S.round, phase: 'idle', msg: S.msg, dices: S.dices, log: S.log.slice(0, 10),
                    over: false, aiLv: S.aiLv, goal: S.goal === Infinity ? null : S.goal, maxRound: S.maxRound, doubles: 0,
                },
            }));
        } catch (e) {}
    }
    function loadSave() {
        try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return (d && d.v === 1) ? d : null; } catch (e) { return null; }
    }
    function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

    // ================= 入口 =================
    MiniGames.richman = {
        LEVELS, ENDLESS,
        start(c, o) {
            opts = o; dead = false;
            net = !!(MG.pvp && MG.pvp.shouldBegin && MG.pvp.shouldBegin('richman'));
            // 关键：MG.pvp.side 只在 MG.pvp.begin() 内部被赋值；begin 在本函数后面才调用，
            // 所以此处必须从 _armed.side 读取真实座位（arm 阶段已由服务端下发），否则 4 人局
            // 所有客户端都误算成 side 0 → onAct 输入锁 S.turn!==mySide 把非 0 号玩家全部锁死 → 死锁。
            mySide = net ? (MG.pvp._armed ? MG.pvp._armed.side : (MG.pvp.side || 0)) : 0;
            levelIdx = o.levelIdx == null ? 0 : o.levelIdx;
            endless = !!o.endless;
            cfgLevel = endless ? ENDLESS : (o.level || LEVELS[0]);

            const sv = loadSave();
            let resumed = false;
            if (sv && sv.levelIdx === levelIdx && sv.endless === endless && sv.s && sv.s.players) {
                S = sv.s;
                S.goal = S.goal == null ? Infinity : S.goal;
                Object.assign(S.players[0], { name: '你', e: '🧑', c: '#ffd56b', me: true });
                S.players.forEach(p => { if (p.id !== 1) p.me = false; });
                resumed = true;
            } else {
                S = newState(cfgLevel);
                clearSave();
            }

            // 联机：4 名玩家全部为真人，我方置于 mySide（昵称取对手列表），并武装 MG.pvp 状态同步
            if (net) {
                const oppNames = (MG.pvp._armed && MG.pvp._armed.opp) || [];
                S.players.forEach((p, i) => {
                    p.me = (i === mySide);
                    if (i === mySide) { p.name = '你'; p.e = '🧑'; p.c = '#ffd56b'; }
                    else { p.name = oppNames[i] || p.name; }
                });
                S._done = false;
                MG.pvp.begin({
                    // 忽略「过期」commit：中继异步投递可能把上一回合的 commit 在轮到本端之后才送达，
                    // 若直接 Object.assign 会把本端刚走出的棋覆盖回旧状态 → 多端分叉。
                    // 状态同步每份 commit 都是整盘快照，turn 更小即已被本端当前状态取代，故安全丢弃。
                    setState: (m) => { try { if (m && m.turn != null && m.turn < S.turn) return; Object.assign(S, m); render(); } catch (e) {} },
                    onOver: () => completeOnce(),
                });
            }

            const wrap = document.createElement('div');
            wrap.className = 'mgy-wrap';
            wrap.innerHTML = `
                <div class="mgy-plays" id="mgy-plays"></div>
                <div class="mgy-board rman-board" id="mgy-board"></div>
                <div class="rman-hand" id="rman-hand"></div>
                <div class="mgy-panel" id="mgy-panel"></div>
                <div class="mgy-acts" id="mgy-acts"></div>
                <div class="mgy-log" id="mgy-log"></div>
                <div class="mgy-tip">💡 集齐同色街区建楼 · 踩神庙得神明 · 股市低买高卖 · 卡牌点击即用 · 退出自动存档</div>`;
            c.innerHTML = '';
            c.appendChild(wrap);
            try { MG.audio.unlock(); } catch (e) {}
            el = {
                wrap,
                plays: wrap.querySelector('#mgy-plays'),
                board: wrap.querySelector('#mgy-board'),
                hand: wrap.querySelector('#rman-hand'),
                panel: wrap.querySelector('#mgy-panel'),
                acts: wrap.querySelector('#mgy-acts'),
                log: wrap.querySelector('#mgy-log'),
                dice: null,
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
            const p = cur();
            if (!p.me && !net) later(aiTurn, 500);   // 联机：当前若非我方回合，不自动代打

            return { stop() { dead = true; save(); } };
        },
    };
    // 调试 / 自动模拟用
    MiniGames.richman._debug = {
        get S() { return S; }, CELLS, GROUPS, CARDS, GODS, STOCKS, LEVELS, ENDLESS,
        netWorth, rentOf, rentBase, stockValue, cur, act: onAct, nextTurn, buildList, newState,
        useCard, aiPlayCard, cellPos,
    };
})();
