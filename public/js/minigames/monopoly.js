// 大富翁（2026-09-09 完整重制）
// 1 名玩家 + 3 名 AI · 买地 / 集齐同色街区建楼 · 机会 & 命运卡牌 · 自动存档（退出即存，回来续玩）
window.MiniGames = window.MiniGames || {};
(function () {
    const MG = window.MG || {};
    // __MG_FAST=1（自动模拟/测试）时跳过所有动画等待
    const fast = () => typeof window !== 'undefined' && !!window.__MG_FAST;
    const sleep = ms => new Promise(r => setTimeout(r, fast() ? 0 : ms));
    const later = (fn, ms) => setTimeout(fn, fast() ? 0 : ms);
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const money = v => '¥' + Math.max(0, Math.round(v));
    const SAVE_KEY = 'mg-monopoly-save-v2';

    // ---------------- 街区（同色集齐才能建楼）----------------
    const GROUPS = {
        brown:  { name: '市井', color: '#8b5a2b', house: 50 },
        cyan:   { name: '茶坊', color: '#2f9bc4', house: 50 },
        pink:   { name: '药香', color: '#cf5f95', house: 100 },
        orange: { name: '匠作', color: '#dd8537', house: 100 },
        red:    { name: '金银', color: '#d44a41', house: 150 },
    };

    // 24 格棋盘：14 块地皮 + 起点 / 监狱 / 免费停 / 去坐牢 / 税 ×2 / 机会 ×2 / 命运 ×2
    const CELLS = [
        { n: '起点',    t: 'go',       e: '🏁' },
        { n: '布庄',    t: 'prop', e: '🧵', g: 'brown',  p: 60,  r: [4, 20, 60, 180, 320, 450] },
        { n: '米行',    t: 'prop', e: '🌾', g: 'brown',  p: 60,  r: [4, 20, 60, 180, 320, 450] },
        { n: '机会',    t: 'chance',   e: '❓' },
        { n: '茶馆',    t: 'prop', e: '🍵', g: 'cyan',   p: 100, r: [6, 30, 90, 270, 400, 550] },
        { n: '印花税',  t: 'tax',      e: '📜', v: 75 },
        { n: '酒楼',    t: 'prop', e: '🍶', g: 'cyan',   p: 100, r: [6, 30, 90, 270, 400, 550] },
        { n: '镖局',    t: 'prop', e: '🛡️', g: 'cyan',   p: 120, r: [8, 40, 100, 300, 450, 600] },
        { n: '监狱',    t: 'jail',     e: '🚔' },
        { n: '药铺',    t: 'prop', e: '🌿', g: 'pink',   p: 140, r: [10, 50, 150, 450, 625, 750] },
        { n: '当铺',    t: 'prop', e: '💍', g: 'pink',   p: 140, r: [10, 50, 150, 450, 625, 750] },
        { n: '命运',    t: 'chest',    e: '🎴' },
        { n: '马市',    t: 'prop', e: '🐎', g: 'pink',   p: 160, r: [12, 60, 180, 500, 700, 900] },
        { n: '铁匠铺',  t: 'prop', e: '🔨', g: 'orange', p: 180, r: [14, 70, 200, 550, 750, 950] },
        { n: '免费停',  t: 'park',     e: '🅿️' },
        { n: '木作坊',  t: 'prop', e: '🪵', g: 'orange', p: 180, r: [14, 70, 200, 550, 750, 950] },
        { n: '染坊',    t: 'prop', e: '🎨', g: 'orange', p: 200, r: [16, 80, 220, 600, 800, 1000] },
        { n: '机会',    t: 'chance',   e: '❓' },
        { n: '钱庄',    t: 'prop', e: '💰', g: 'red',    p: 220, r: [18, 90, 250, 700, 875, 1050] },
        { n: '奢侈税',  t: 'tax',      e: '💸', v: 100 },
        { n: '银号',    t: 'prop', e: '🏦', g: 'red',    p: 220, r: [18, 90, 250, 700, 875, 1050] },
        { n: '金楼',    t: 'prop', e: '🏯', g: 'red',    p: 240, r: [20, 100, 300, 750, 925, 1100] },
        { n: '去坐牢',  t: 'gotojail', e: '👮' },
        { n: '命运',    t: 'chest',    e: '🎴' },
    ];
    const N = CELLS.length;
    const GROUP_CELLS = {};
    CELLS.forEach((c, i) => { if (c.t === 'prop') (GROUP_CELLS[c.g] = GROUP_CELLS[c.g] || []).push(i); });
    const JAIL = CELLS.findIndex(c => c.t === 'jail');
    const SALARY = 200;

    // 7×7 外圈坐标：底行右→左，左列下→上，顶行左→右，右列上→下
    function cellPos(i) {
        if (i <= 6) return { r: 7, c: 7 - i };
        if (i <= 12) return { r: 7 - (i - 6), c: 1 };
        if (i <= 18) return { r: 1, c: 1 + (i - 12) };
        return { r: 1 + (i - 18), c: 7 };
    }

    // ---------------- 卡牌 ----------------
    const CHANCE = [
        { txt: '商会急召：直奔起点领工资',      f: (p, S) => goto(p, 0, true) },
        { txt: '快马加鞭：前进 3 步',           f: (p, S) => step(p, 3) },
        { txt: '迷路折返：后退 2 步',           f: (p, S) => step(p, -2) },
        { txt: '被捕！直接进监狱',              f: (p, S) => sendJail(p) },
        { txt: '律师相助：获得【免罪卡】',      f: (p, S) => { p.card = true; return '获得免罪卡'; } },
        { txt: '银行分红：收 ¥150',             f: (p, S) => gain(p, 150) },
        { txt: '超速罚款：付 ¥75',              f: (p, S) => gain(p, -75) },
        { txt: '房产税：每间房 ¥40 / 每座酒店 ¥115', f: (p, S) => houseTax(p, 40, 115) },
        { txt: '商队引路：前往【金楼】',        f: (p, S) => goto(p, CELLS.findIndex(c => c.n === '金楼'), true) },
        { txt: '茶友相邀：前往【茶馆】',        f: (p, S) => goto(p, CELLS.findIndex(c => c.n === '茶馆'), true) },
        { txt: '地契股息：每块地 ¥60',          f: (p, S) => {
            const n = S.own.filter(o => o === p.id && !S.mort[S.own.indexOf(o)]).length;
            const v = S.own.reduce((a, o, i) => a + (o === p.id && !S.mort[i] ? 60 : 0), 0);
            p.cash += v; return `+${v}`;
        } },
        { txt: '当选会长：付给每位对手 ¥50',    f: (p, S) => each(p, S, -50) },
    ];
    const CHEST = [
        { txt: '生日快乐：每位对手送你 ¥50',    f: (p, S) => each(p, S, 50) },
        { txt: '远方遗产：继承 ¥300',           f: (p, S) => gain(p, 300) },
        { txt: '医药账单：付 ¥120',             f: (p, S) => gain(p, -120) },
        { txt: '子女学费：付 ¥150',             f: (p, S) => gain(p, -150) },
        { txt: '退税到账：收 ¥100',             f: (p, S) => gain(p, 100) },
        { txt: '股票分红：收 ¥80',              f: (p, S) => gain(p, 80) },
        { txt: '马车维修：付 ¥60',              f: (p, S) => gain(p, -60) },
        { txt: '官司缠身：直接进监狱',          f: (p, S) => sendJail(p) },
        { txt: '贵人搭救：获得【免罪卡】',      f: (p, S) => { p.card = true; return '获得免罪卡'; } },
        { txt: '城外歇脚：前往【免费停】',      f: (p, S) => goto(p, CELLS.findIndex(c => c.t === 'park'), true) },
        { txt: '衣锦还乡：回到起点',            f: (p, S) => goto(p, 0, true) },
        { txt: '书法夺魁：奖金 ¥200',           f: (p, S) => gain(p, 200) },
    ];
    function gain(p, v) { p.cash += v; return (v >= 0 ? '+' : '') + v; }
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

    // ---------------- 联机同步辅助 ----------------
    // 整盘 S 序列化后 commit 给对手（剔除下划线字段/函数；over 仅在对局结束时带上）。
    // 状态同步模型：本地任意改变（掷骰/买地/建楼/过路费/卡牌/破产/换回合）后整盘广播，
    // 对手 Object.assign 重绘；回合用 S.turn(0..3) 在 4 人间顺序轮转，_turn 即「当前该走方」。
    function serialize(s) { return JSON.parse(JSON.stringify(s, (k, v) => (k.charCodeAt(0) === 95 ? undefined : v))); }
    function commitNet() {
        if (!net) return;
        try { const d = serialize(S); d.turn = S.turn; d.over = S.over || undefined; MG.pvp.commit(d); } catch (e) {}
    }

    // ---------------- 50 关 ----------------
    const NAMES = ['初入市井','布庄开张','米行小试','茶馆听风','镖局走镖','药铺问药','当铺典当','马市相马','铁铺打铁','木作营生',
        '染坊染色','钱庄存银','银号汇兑','金楼赌石','商街初成','富甲一坊','通衢要道','百货云集','码头集市','盐铁专营',
        '茶马古道','丝路驼铃','漕运枢纽','会馆林立','票号天下','南来北往','货通南北','日进斗金','商铺连城','商贾云集',
        '富商大贾','腰缠万贯','陶朱遗风','富甲一方','铜山金穴','堆金积玉','金玉满堂','富贵逼人','钟鸣鼎食','锦衣玉食',
        '朱门绣户','富埒王侯','赀财巨万','富可敌国','财倾天下','金山银海','万贯家财','富甲天下','商界神话','财富之巅'];
    // 难度曲线（由 tools/sim-monopoly.js baseline 实测校准）：
    // 脚本玩家跑满轮次的净资产中位数约 2400~3800，且 AI 越强玩家赚得越少；
    // 因此目标只缓慢递增（2500→3774），难度主要靠「轮次变少 + AI 变强」来提升。
    const LEVELS = NAMES.map((name, i) => {
        const t = i / (NAMES.length - 1);
        const mul = +(1 + t * 1.0).toFixed(2);                 // 地价/租金倍率 1 → 2.0
        const goal = Math.round(2400 + i * 16);                // 2400 → 3184
        const rounds = Math.round(36 - t * 10);                // 36 → 26 轮
        return { name, desc: `目标 ${goal} · ${rounds} 轮`, start: 1500, goal, rounds, ai: +(0.10 + t * 0.75).toFixed(2), mul };
    });
    const ENDLESS = { name: '无尽', desc: '150 轮超长局，比拼净资产', start: 1600, goal: Infinity, rounds: 150, ai: 0.8, mul: 1.25 };

    const AI_SKIN = [
        { e: '🤖', n: '铁算盘', c: '#5cc7ff' },
        { e: '🐱', n: '钱掌柜', c: '#ffd56b' },
        { e: '🐼', n: '胖东家', c: '#9ee87a' },
    ];

    // ================= 主体 =================
    let S = null, el = {}, dead = false, opts = null, cfgLevel = null, levelIdx = 0, endless = false;
    let net = false, mySide = 0;   // 联机模式：net=true 时 4 名玩家均为真人，mySide 为我方座位(0..3)

    function newState(lv) {
        const mk = (id, e, n, c, me) => ({ id, me, name: n, e, c, cash: lv.start, pos: 0, jail: 0, card: false, out: false });
        const pls = [mk(1, '🧑', '你', '#ffd56b', true)];
        AI_SKIN.forEach((s, i) => pls.push(mk(i + 2, s.e, s.n, s.c, false)));
        return {
            players: pls,
            own: new Array(N).fill(0),            // 0 无主 / 1 玩家 / 2~4 AI
            lv: new Array(N).fill(0),             // 0 空地 / 1-4 房 / 5 酒店
            mort: new Array(N).fill(false),
            price: CELLS.map(c => c.p ? Math.round(c.p * lv.mul / 10) * 10 : 0),
            rent: CELLS.map(c => c.p ? c.r.map(v => Math.round(v * lv.mul / 5) * 5) : null),
            hcost: Object.keys(GROUPS).reduce((o, k) => (o[k] = Math.round(GROUPS[k].house * lv.mul / 10) * 10, o), {}),
            turn: 0, round: 1, phase: 'idle', msg: '', dices: [1, 1], log: [],
            over: false, aiLv: lv.ai, goal: lv.goal, maxRound: lv.rounds, doubles: 0,
        };
    }

    const cur = () => S.players[S.turn];
    const netWorth = p => p.cash + S.own.reduce((a, o, i) =>
        a + (o === p.id && !S.mort[i] ? Math.round(S.price[i] * (S.mort[i] ? 0 : 1)) + S.lv[i] * (CELLS[i].g ? S.hcost[CELLS[i].g] : 0) : 0), 0);
    const ownsGroup = (id, g) => GROUP_CELLS[g].every(i => S.own[i] === id && !S.mort[i]);
    const rentOf = i => {
        const o = S.own[i];
        if (!o || S.mort[i]) return 0;
        let r = S.rent[i][S.lv[i]];
        if (S.lv[i] === 0 && ownsGroup(o, CELLS[i].g)) r *= 2;   // 集齐街区且未建房 → 租金翻倍
        return Math.round(r);
    };

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

        let html = `<div class="mgy-center">
            <div class="mgy-logo">💰<span>大富翁</span></div>
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
                else if (S.lv[i] === 5) badge = '🏨';
                else if (S.lv[i] > 0) badge = '🏠'.repeat(S.lv[i]);
                else badge = o ? '✔' : money(S.price[i]);
            } else if (c.t === 'tax') badge = '-' + c.v;
            else if (c.t === 'go') badge = '+200';
            const oc = o ? ((S.players.find(p => p.id === o) || {}).c || '#fff') : '';
            html += `<div class="mgy-cell ${c.t}${S.mort[i] ? ' mort' : ''}" style="grid-area:${pos.r}/${pos.c}">
                ${g ? `<div class="mgy-gbar" style="background:${g.color}"></div>` : ''}
                <div class="mgy-ce">${c.e}</div>
                <div class="mgy-cn">${c.n}</div>
                <div class="mgy-cb" style="color:${oc || '#e8e0c0'}">${badge}</div>
                <div class="mgy-pips">${pips.map(p => `<b style="background:${p.c}">${p.e}</b>`).join('')}</div>
            </div>`;
        }
        el.board.innerHTML = html;
        el.dice = el.board.querySelector('#mgy-dice');
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
            if (p.cash >= 50) acts += `<button class="mg-btn" data-a="fine">💸 付 ¥50 出狱</button>`;
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
            if (S.own[i] !== p.id || S.mort[i] || S.lv[i] >= 5) continue;
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
            p.cash -= S.price[i]; S.own[i] = p.id;
            try { MG.audio.sfx('coin'); } catch (e) {}
            log(`🧑 买下【${CELLS[i].n}】-${money(S.price[i])}`, p.c);
            S.phase = 'end';
            S.msg = `买下 ${CELLS[i].n}${ownsGroup(p.id, CELLS[i].g) ? '，街区集齐，可建楼！' : ''}`;
            save(); render(); commitNet();
        } else if (a === 'skip') {
            S.phase = 'end'; S.msg = '放弃这块地'; save(); render(); commitNet();
        } else if (a === 'build') showBuild(p);
        else if (a === 'next') nextTurn();
        else if (a === 'card') {
            p.card = false; p.jail = 0; S.phase = 'idle';
            try { MG.audio.sfx('click'); } catch (e) {}
            log('🎫 使用免罪卡出狱', p.c); S.msg = '重获自由，掷骰吧'; save(); render(); commitNet();
        } else if (a === 'fine') {
            p.cash -= 50; p.jail = 0; S.phase = 'idle';
            try { MG.audio.sfx('click'); } catch (e) {}
            log('💸 缴纳 ¥50 出狱', p.c); S.msg = '交钱走人'; save(); render(); commitNet();
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

    async function jailTry(p) {
        const d1 = ri(1, 6), d2 = ri(1, 6);
        await animDice(d1, d2);
        if (dead) return;
        if (d1 === d2) { p.jail = 0; S.phase = 'idle'; log(`🎲 ${d1}+${d2} 对子！出狱`, p.c); S.msg = '掷出对子，出狱！'; }
        else if (--p.jail <= 0) {
            p.cash -= 50; p.jail = 0; S.phase = 'idle';
            log('💸 三次未掷出对子，付 ¥50 出狱', p.c); S.msg = '付 ¥50 出狱';
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

    // 移动中的格子高亮（.mgy-hopping），玩家 320ms/格、AI 180ms/格 —— 原速 110/70 太快看不清走到哪
    async function walk(p, steps) {
        const pace = p.me ? 320 : 180;
        for (let k = 0; k < steps; k++) {
            p.pos = (p.pos + 1) % N;
            if (p.pos === 0) { p.cash += SALARY; log(`🏁 ${p.name} 经过起点 +${SALARY}`, p.c); }
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
            log(`👮 ${p.name} 被押进监狱`, '#ff7a8b'); S.msg = `${p.name} 进监狱了`; return;
        }
        if (c.t === 'tax') { p.cash -= c.v; log(`📜 ${p.name} 缴纳${c.n} -${c.v}`, '#ff9f6b'); S.msg = `缴纳${c.n} ${money(c.v)}`; }
        else if (c.t === 'park') S.msg = '免费停车，歇口气';
        else if (c.t === 'jail') S.msg = '只是路过探监';
        else if (c.t === 'go') S.msg = '回到起点';
        else if (c.t === 'chance' || c.t === 'chest') {
            const deck = c.t === 'chance' ? CHANCE : CHEST;
            const card = deck[ri(0, deck.length - 1)];
            const before = p.pos;
            const res = card.f(p, S) || '';
            log(`🎴 ${p.name} 抽到${c.t === 'chance' ? '机会' : '命运'}：${card.txt}${res ? ' → ' + res : ''}`, '#ffd56b');
            S.msg = `${card.txt}${res ? '（' + res + '）' : ''}`;
            if (p.pos !== before && !dead) { render(); await sleep(260); }
            const nc = CELLS[p.pos];
            if (nc.t === 'prop' || nc.t === 'tax') return onLand(p);   // 卡牌移动后继续结算
        } else if (c.t === 'prop') {
            const o = S.own[i];
            if (!o) {
                if (p.me) { S.phase = 'decide'; S.msg = `空地【${c.n}】售价 ${money(S.price[i])}，租金 ${money(S.rent[i][0])}，买不买？`; return; }
                aiBuy(p, i);
            } else if (o === p.id) {
                S.msg = `回到自己的${c.n}${ownsGroup(p.id, c.g) && S.lv[i] < 5 ? '（街区集齐，可建楼）' : ''}`;
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
        const keep = Math.round(150 + 400 * (1 - S.aiLv) * 0.6);
        const c = CELLS[i];
        const have = GROUP_CELLS[c.g].filter(k => S.own[k] === p.id).length;
        const near = have >= GROUP_CELLS[c.g].length - 1 ? 1.5 : 1;    // 差一块就集齐 → 更想买
        const good = (S.rent[i][0] / price) * near;                     // 回报率
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
            while (p.cash < 0 && guard++ < 80) {           // 自救：先卖楼（半价），再抵押地皮
                let did = false;
                for (let i = 0; i < N; i++) {
                    if (S.own[i] !== p.id) continue;
                    if (S.lv[i] > 0) { p.cash += Math.round(S.hcost[CELLS[i].g] / 2); S.lv[i]--; did = true; break; }
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

    // 终局结算（仅触发一次）：联机下 me 取「我方座位」，结算后整盘广播 over 给对手。
    function completeOnce() {
        if (S._done) return;
        S._done = true;
        const me = S.players[net ? mySide : 0];
        const alive = S.players.filter(p => !p.out);
        const nw = netWorth(me);
        let win = false, stars = 0;
        if (me.out) { win = false; stars = 0; }
        else if (endless) { win = alive.length <= 1; stars = win ? 3 : (nw >= 6000 ? 2 : 1); }
        else if (alive.length <= 1) { win = true; stars = 3; }                 // 熬到所有对手破产
        else if (nw >= S.goal) {
            win = true;
            const early = S.round <= S.maxRound * 0.6;                          // 提前达标 → 3★
            const crush = alive.length <= 2;                                    // 干掉 2 个对手 → 3★
            stars = (nw >= S.goal * 1.25 || early || crush) ? 3 : 2;
        } else if (nw >= S.goal * 0.7) stars = 1;
        clearSave();
        if (opts && opts.onComplete) opts.onComplete({
            win, stars, score: Math.round(nw),
            title: me.out ? '💀 破产收场' : (win ? '🏆 商界神话' : '⌛ 回合耗尽'),
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
            }
        } while (S.players[S.turn].out && guard++ < 20);
        const p = cur();
        S.doubles = 0;
        S.phase = p.jail > 0 ? 'jail' : 'idle';
        S.msg = p.me ? (p.jail > 0 ? '你在监狱里，掷对子 / 付 ¥50 / 用免罪卡' : '轮到你了，掷骰吧') : '';
        save(); render(); commitNet();
        if (!p.me && !net) later(aiTurn, 380);
    }

    // ---------------- AI 回合 ----------------
    async function aiTurn() {
        if (net) return;                 // 联机：4 人均为真人，绝不自动代打
        const p = cur();
        if (dead || S.over || p.me || p.out) return;
        await sleep(260);
        if (dead || S.over) return;
        if (p.jail > 0) {
            if (p.card) { p.card = false; p.jail = 0; log(`🎫 ${p.name} 用免罪卡出狱`, p.c); }
            else if (p.cash > 260 && Math.random() < 0.5 + S.aiLv * 0.4) { p.cash -= 50; p.jail = 0; log(`💸 ${p.name} 付 ¥50 出狱`, p.c); }
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
        if (Math.random() < 0.5 + S.aiLv * 0.45) {          // 建楼
            const list = buildList(p).sort((a, b) => b.lv - a.lv);
            if (list.length) {
                const n = Math.random() < S.aiLv ? Math.min(list.length, 1 + ri(0, 1)) : 1;
                for (let k = 0; k < n; k++) {
                    const b = list[k];
                    if (p.cash - b.cost < 180 * (1.1 - S.aiLv)) break;
                    p.cash -= b.cost; S.lv[b.i]++;
                    log(`🏠 ${p.name} 在【${CELLS[b.i].n}】建到 Lv${S.lv[b.i]}`, p.c);
                }
                render();
                await sleep(160);
            }
        }
        if (dead || S.over) return;
        await doRoll(p);
        if (dead || S.over) return;
        await sleep(300);
        if (dead || S.over) return;
        nextTurn();
    }

    // ---------------- 存档 ----------------
    function save() {
        if (S.over) return;
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({
                v: 2, levelIdx, endless, t: Date.now(),
                s: {
                    players: S.players, own: S.own, lv: S.lv, mort: S.mort, price: S.price, rent: S.rent, hcost: S.hcost,
                    turn: S.turn, round: S.round, phase: 'idle', msg: S.msg, dices: S.dices, log: S.log.slice(0, 10),
                    over: false, aiLv: S.aiLv, goal: S.goal === Infinity ? null : S.goal, maxRound: S.maxRound, doubles: 0,
                },
            }));
        } catch (e) {}
    }
    function loadSave() {
        try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return (d && d.v === 2) ? d : null; } catch (e) { return null; }
    }
    function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

    // ================= 入口 =================
    MiniGames.monopoly = {
        LEVELS, ENDLESS,
        start(c, o) {
            opts = o; dead = false;
            net = !!(MG.pvp && MG.pvp.shouldBegin && MG.pvp.shouldBegin('monopoly'));
            // MG.pvp.side 只在 MG.pvp.begin() 内部赋值（begin 在本函数后面才调用），此处须从
            // _armed.side 读取真实座位，否则 4 人局所有客户端都误算成 side 0 → 输入锁锁死 → 死锁。
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
                    // 忽略过期 commit：中继异步投递可能把上一回合的 commit 在轮到本端之后才送达，
                    // 直接 Object.assign 会覆盖本端刚走的棋 → 多端分叉。整盘快照中 turn 更小即已过期，安全丢弃。
                    setState: (m) => { try { if (m && m.turn != null && m.turn < S.turn) return; Object.assign(S, m); render(); } catch (e) {} },
                    onOver: () => completeOnce(),
                });
            }

            const wrap = document.createElement('div');
            wrap.className = 'mgy-wrap';
            wrap.innerHTML = `
                <div class="mgy-plays" id="mgy-plays"></div>
                <div class="mgy-board" id="mgy-board"></div>
                <div class="mgy-panel" id="mgy-panel"></div>
                <div class="mgy-acts" id="mgy-acts"></div>
                <div class="mgy-log" id="mgy-log"></div>
                <div class="mgy-tip">💡 集齐同色街区即可建楼收高租 · 退出自动存档，下次进来接着玩</div>`;
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
            if (!p.me && !net) later(aiTurn, 500);

            return { stop() { dead = true; save(); } };
        },
    };
    // 调试 / 自动模拟用
    MiniGames.monopoly._debug = {
        get S() { return S; }, CELLS, GROUPS, LEVELS, ENDLESS, netWorth, rentOf,
        cur, act: onAct, nextTurn, buildList, newState,
    };
})();
