// PK32 强手棋独立迁移版：使用 PK32 棋盘布局和独立存档，不调用项目原强手棋。
(function (global) {
    'use strict';
    var N = 40, SAVE = 'pk32-richman-save-v1';
    var BOARD_MAP = '03040203101200100100110122113212232204340304120322123033203011201211032304032404233403230424010400021001200011101312141334243234123202120302240413141213221233321434041402041202322230331030011002010302131214132404222432342022103000200100020113031213211133312333042403041303111320113021313033320020010014340414030412023222303210301110211122212423143404240204000211121011200021203130232224330323';
    var CELLS = ['起点', '唐山路', '中兴路', '运气', '河南路', '上海站', '西安路', '黄河路', '休息区', '中东路', '杭州路', '南京路', '机会', '长生南路', '开封路', '财产税', '民生路', '坐牢', '免费住宿', '中杰路', '机会', '广州路', '福州路', '武汉路', '建房卡', '重庆路', '成都路', '运气', '昆明路', '西宁路', '进牢', '济南路', '青岛路', '机会', '大连路', '天津路', '房产税', '哈尔滨路', '沈阳路', '回到起点'];
    var GROUPS = ['#55b7d8', '#e36b74', '#e7c64a', '#7ac47a', '#b47bd2', '#ef9e48'];
    var PRICES = [0, 220, 260, 0, 280, 300, 320, 340, 0, 360, 380, 400, 0, 420, 440, 0, 460, 0, 0, 480, 0, 500, 520, 540, 0, 560, 580, 0, 600, 620, 0, 640, 660, 0, 680, 700, 0, 720, 740, 0];
    var COLORS = ['#ffd86b', '#5bb9ff', '#f08080'];
    var CARDS = {
        buildHouse: { name: '建房卡', desc: '在自己的地产上建一栋房屋' }, buildFloor: { name: '建楼卡', desc: '在自己的房屋上增加一层' }, buildStreet: { name: '建街卡', desc: '在同色街区上扩建街道' },
        removeHouse: { name: '拆房卡', desc: '拆除目标地产一栋房屋' }, removeFloor: { name: '拆楼卡', desc: '拆除目标地产一层建筑' }, removeStreet: { name: '拆街卡', desc: '拆除目标街区建筑' },
        steal: { name: '抢夺卡', desc: '抢夺一名玩家的一张卡片' }, buyLand: { name: '购地卡', desc: '购买当前未拥有的土地' }, equalize: { name: '均富卡', desc: '将参与者资金平均分配' }, jailFree: { name: '免罪卡', desc: '进入监狱前自动免罪' }, spy: { name: '间谍卡', desc: '一圈内不能买地和盖房，但仍可收取过路费' }
    };
    var EVENTS = [
        { text: '今天是您的生日，向每人收取礼金100元', kind: 'collectEach', value: 100 },
        { text: '选美大赛获亚军，得100元', kind: 'gain', value: 100 },
        { text: '当棉被一条，得500元', kind: 'gain', value: 500 },
        { text: '卖黄牛，得1000元', kind: 'gain', value: 1000 },
        { text: '拾金不昧，失主酬劳，得1000元', kind: 'gain', value: 1000 },
        { text: '人民大学奖学金，得1000元', kind: 'gain', value: 1000 },
        { text: '工作努力得奖金，得2000元', kind: 'gain', value: 2000 },
        { text: '爱国奖券中奖，得2000元', kind: 'gain', value: 2000 },
        { text: '付保险费500元', kind: 'loss', value: 500 },
        { text: '医院药费付1000元', kind: 'loss', value: 1000 },
        { text: '慈善集资捐款1000元', kind: 'loss', value: 1000 },
        { text: '小偷光顾损失1000元', kind: 'loss', value: 1000 },
        { text: '修理自己所有房屋，房屋每栋付250元，旅馆每栋付1000元', kind: 'repair' },
        { text: '不小心在房屋旁捡得建房卡一张', kind: 'card', card: 'buildHouse' },
        { text: '不小心在旅馆前捡得建楼卡一张', kind: 'card', card: 'buildFloor' },
        { text: '不小心在马路边捡得建街卡一张', kind: 'card', card: 'buildStreet' },
        { text: '不小心在房屋的楼顶捡得拆房卡一张', kind: 'card', card: 'removeHouse' },
        { text: '银行付您利息500元', kind: 'gain', value: 500 },
        { text: '积极缴纳税款得奖金1000元', kind: 'gain', value: 1000 },
        { text: '运动会跳水冠军得奖金1000元', kind: 'gain', value: 1000 },
        { text: '经营小本生意获利1000元', kind: 'gain', value: 1000 },
        { text: '行车超速罚款150元', kind: 'loss', value: 150 },
        { text: '酗酒闹事罚款200元', kind: 'loss', value: 200 },
        { text: '前进到民主路，如经过开始得2000元', kind: 'advance', target: 21 },
        { text: '直达上海站，如经过开始得2000元', kind: 'advance', target: 5 },
        { text: '前进到环城路，如经过开始得2000元', kind: 'advance', target: 31 },
        { text: '付房产税，房屋每栋400元，旅馆每栋1200元', kind: 'propertyTax' },
        { text: '福神给您均富卡一张', kind: 'card', card: 'equalize' },
        { text: '财神给您抢钱卡一张', kind: 'card', card: 'steal' },
        { text: '从别人那里讨得抢夺卡一张', kind: 'card', card: 'steal' },
        { text: '土地公公给您购地卡一张', kind: 'card', card: 'buyLand' },
        { text: '天上掉下来免罪卡一张', kind: 'card', card: 'jailFree' },
        { text: '007给您间谍卡一张', kind: 'card', card: 'spy' }
    ];
    var EVENT_TEXT = EVENTS.map(function (event) { return event.text; });
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function money(v) { return '￥' + Math.max(0, Math.round(v)); }
    function initial() { return { round: 1, turn: 0, phase: 'roll', dice: [1, 1], own: Array(N).fill(-1), buildings: Array(N).fill(0), cards: [['buildHouse', 'buildFloor', 'jailFree'], [], []], spy: [0, 0, 0], jail: [0, 0, 0], players: [{ name: '你', pos: 0, cash: 3000, color: COLORS[0], out: false }, { name: '电脑甲', pos: 0, cash: 3000, color: COLORS[1], out: false }, { name: '电脑乙', pos: 0, cash: 3000, color: COLORS[2], out: false }], message: '轮到你，掷骰子开始' }; }
    function load() { try { var s = JSON.parse(localStorage.getItem(SAVE)); if (!s || !Array.isArray(s.players) || s.players.length !== 3 || !Array.isArray(s.own) || s.own.length !== N || !Array.isArray(s.buildings) || s.buildings.length !== N || !Array.isArray(s.cards) || s.cards.length !== 3) return initial(); if (!Array.isArray(s.jail) || s.jail.length !== 3) s.jail = [0, 0, 0]; return s; } catch (e) { return initial(); } }
    function save(s) { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch (e) {} }
    function cellType(i) { if ([3, 12, 20, 27, 33].indexOf(i) >= 0) return '机会'; if ([8, 18].indexOf(i) >= 0) return '休息'; if (i === 17 || i === 30) return '监狱'; if ([15, 36].indexOf(i) >= 0) return '税'; return PRICES[i] ? '地产' : '特殊'; }
    function start(container, opts) {
        opts = opts || {}; var s = load(), stopped = false; container.innerHTML = '';
        var root = el('section', 'pk32-pk-richman'); var head = el('header', 'pk32-rh-head'); var title = el('h2', '', 'PK32 · 强手棋原版迁移'); var status = el('div', 'pk32-rh-status'); var boardWrap = el('div', 'pk32-rh-board-wrap'); var board = el('div', 'pk32-rh-board'); board.dataset.pk32Layout = BOARD_MAP; boardWrap.appendChild(board); var actions = el('div', 'pk32-rh-actions'); var log = el('div', 'pk32-rh-log');
        head.append(title, status); root.append(head, boardWrap, actions, log); container.appendChild(root);
        var style = document.createElement('style'); style.textContent = '.pk32-pk-richman{box-sizing:border-box;width:100%;max-width:1040px;margin:auto;padding:14px;background:#073b3d;color:#f8f2d8;border:3px solid #c99843;font-family:system-ui;overflow:hidden}.pk32-rh-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.pk32-rh-head h2{margin:0;line-height:1.25}.pk32-rh-status{color:#ffe08a;max-width:100%;overflow-wrap:anywhere}.pk32-rh-board-wrap{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain}.pk32-rh-board{position:relative;display:grid;grid-template-columns:repeat(12,minmax(44px,1fr));grid-template-rows:repeat(12,58px);gap:2px;margin:12px auto;padding:10px;background:#0b5554;max-width:1000px;min-width:620px;min-height:720px;box-sizing:border-box}.pk32-rh-center{position:absolute;inset:25% 25%;display:grid;place-items:center;text-align:center;white-space:pre-line;color:#f8e9af;background:#0a4648;border:2px solid #b8944c;box-shadow:inset 0 0 0 4px #0e5b5b;pointer-events:none;font-size:clamp(14px,2vw,22px);font-weight:700}.pk32-rh-cell{position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:4px;background:#12615f;border:1px solid #d8c782;color:#fff;font-size:11px;text-align:center;cursor:pointer;min-width:0}.pk32-rh-cell .bar{height:6px;margin:-4px -4px 2px;background:#777}.pk32-rh-cell .price{color:#ffe08a}.pk32-rh-pips{display:flex;justify-content:center;gap:2px;min-height:22px;flex-wrap:wrap}.pk32-rh-pip{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;color:#102b2c;border:2px solid #fff;font-size:12px}.pk32-rh-actions{display:flex;gap:8px;flex-wrap:wrap}.pk32-rh-actions button{padding:8px 13px;background:#155e60;color:#fff;border:1px solid #d8c782;border-radius:4px;cursor:pointer;min-height:38px}.pk32-rh-log{min-height:54px;margin-top:10px;padding:8px;background:rgba(0,0,0,.2);white-space:pre-wrap;overflow-wrap:anywhere}.pk32-rh-panel{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:10px 0}.pk32-rh-player{padding:6px;border:1px solid #628d83;background:rgba(0,0,0,.15);white-space:pre-line;overflow-wrap:anywhere}.pk32-rh-hand{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.pk32-rh-hand button{padding:6px 9px;background:#145e60;color:#fff;border:1px solid #d8c782;border-radius:4px;cursor:pointer;min-height:36px}@media (max-width:600px){.pk32-pk-richman{padding:10px;border-width:2px}.pk32-rh-board{width:100%;min-width:0;min-height:0;margin:10px 0;padding:6px;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(12,42px)}.pk32-rh-cell{padding:2px;font-size:9px}.pk32-rh-cell .bar{height:4px;margin:-2px -2px 1px}.pk32-rh-pips{min-height:14px}.pk32-rh-pip{width:14px;height:14px;border-width:1px;font-size:9px}.pk32-rh-panel{grid-template-columns:1fr}.pk32-rh-actions button,.pk32-rh-hand button{flex:1 1 130px}.pk32-rh-center{inset:27% 25%;font-size:13px}}'; root.appendChild(style);
        function pos(i) { if (i < 10) return { r: 12, c: 11 - i }; if (i < 20) return { r: 11 - (i - 10), c: 1 }; if (i < 30) return { r: 1, c: 2 + (i - 20) }; return { r: 2 + (i - 30), c: 12 }; }
        function button(label, fn) { var b = el('button', '', label); b.type = 'button'; b.onclick = fn; return b; }
        function note(t) { s.message = t; status.textContent = t; log.textContent = s.players.map(function (p) { return p.name + ' 位置' + p.pos + ' 现金' + money(p.cash) + (p.out ? ' 破产' : ''); }).join('\n'); }
        function applyEvent(pi) {
            var p = s.players[pi], event = EVENTS[Math.floor(Math.random() * EVENTS.length)], amount = event.value || 0;
            if (event.kind === 'collectEach') { s.players.forEach(function (other, oi) { if (oi !== pi && !other.out) { other.cash -= amount; p.cash += amount; } }); }
            else if (event.kind === 'gain') p.cash += amount;
            else if (event.kind === 'loss') p.cash -= amount;
            else if (event.kind === 'repair') s.buildings.forEach(function (level, i) { if (s.own[i] === pi && level) p.cash -= level >= 4 ? 1000 : 250; });
            else if (event.kind === 'propertyTax') s.buildings.forEach(function (level, i) { if (s.own[i] === pi && level) p.cash -= level >= 4 ? 1200 : 400; });
            else if (event.kind === 'card' && event.card) s.cards[pi].push(event.card);
            else if (event.kind === 'advance') { if (event.target < p.pos) p.cash += 2000; p.pos = event.target; }
            s.message = event.text;
        }
        function render() {
            status.textContent = s.message; board.innerHTML = ''; board.appendChild(el('div', 'pk32-rh-center', '强手棋\n第' + s.round + '轮'));
            for (var i = 0; i < N; i += 1) { var c = el('button', 'pk32-rh-cell'); var p = pos(i); c.style.gridRow = p.r; c.style.gridColumn = p.c; c.title = CELLS[i] + ' · ' + cellType(i); var bar = el('span', 'bar'); bar.style.background = PRICES[i] ? GROUPS[Math.floor((i % 10) / 2) % GROUPS.length] : '#547b78'; c.appendChild(bar); c.appendChild(el('strong', '', CELLS[i])); if (PRICES[i]) c.appendChild(el('span', 'price', money(PRICES[i]))); else c.appendChild(el('span', 'price', cellType(i))); var pip = el('span', 'pk32-rh-pips'); s.players.forEach(function (pl, pi) { if (pl.pos === i && !pl.out) pip.appendChild(el('b', 'pk32-rh-pip', String(pi + 1))); }); c.appendChild(pip); c.onclick = function () {}; board.appendChild(c); }
            var oldPanel = root.querySelector('.pk32-rh-panel'); if (oldPanel) oldPanel.remove(); var panel = el('div', 'pk32-rh-panel'); s.players.forEach(function (p, i) { panel.appendChild(el('div', 'pk32-rh-player', (i + 1) + '. ' + p.name + '\n位置 ' + p.pos + '\n现金 ' + money(p.cash) + (s.jail[i] ? '\n监狱停留 ' + s.jail[i] + ' 回合' : '') + (s.spy[i] ? '\n间谍状态 ' + s.spy[i] + ' 圈' : ''))); }); root.appendChild(panel);
            var oldHand = root.querySelector('.pk32-rh-hand'); if (oldHand) oldHand.remove(); var hand = el('div', 'pk32-rh-hand', '你的卡片：'); s.cards[0].forEach(function (key, index) { var card = button(CARDS[key].name, function () { useCard(index); }); card.title = CARDS[key].desc; hand.appendChild(card); }); root.appendChild(hand);
            actions.innerHTML = ''; actions.appendChild(button('掷骰子', function () { if (stopped || s.phase !== 'roll' || s.turn !== 0) return; movePlayer(0); })); actions.appendChild(button('购买当前地产', function () { if (s.phase !== 'buy' || s.turn !== 0 || s.spy[0]) return; buy(0); })); actions.appendChild(button('放弃购买', endBuyPhase)); actions.appendChild(button('建造', function () { if (s.turn !== 0 || s.spy[0]) return; build(0); })); actions.appendChild(button('重开', function () { s = initial(); save(s); render(); })); actions.appendChild(button('存档', function () { save(s); note('PK32 强手棋进度已保存'); }));
            if (opts.onScore) opts.onScore('PK32 强手棋 · 第 ' + s.round + ' 轮');
        }
        function endBuyPhase() { if (s.turn !== 0 || s.phase !== 'buy') return; s.phase = 'end'; s.message = '放弃购买，结束本回合'; render(); setTimeout(aiTurns, 20); }
        function useCard(index) { if (s.turn !== 0 || s.phase === 'roll' && s.spy[0]) return; var key = s.cards[0][index], p = s.players[0], i = p.pos; if (!key) return; if (key === 'jailFree') { s.message = '免罪卡已保留，进入监狱时自动使用'; } else if (key === 'buildHouse' || key === 'buildFloor' || key === 'buildStreet') { if (s.own[i] !== 0) return note('当前地产不属于你'); s.cards[0].splice(index, 1); s.buildings[i] = Math.min(4, s.buildings[i] + 1); s.message = '使用' + CARDS[key].name + '，' + CELLS[i] + '建筑等级提升'; } else if (key === 'spy') { s.cards[0].splice(index, 1); s.spy[0] = 1; s.message = '已进入商业间谍状态，本圈不能买地或盖房'; } else return note(CARDS[key].desc); render(); save(s); }
        function land(pi) { var p = s.players[pi], i = p.pos; if (s.spy[pi] > 0) s.spy[pi] -= 1; if (PRICES[i] && s.own[i] >= 0 && s.own[i] !== pi) { var rent = 50 + s.buildings[i] * 80; p.cash -= rent; s.players[s.own[i]].cash += rent; if (p.cash <= 0) p.out = true; s.message = p.name + ' 支付 ' + money(rent) + ' 过路费'; } else if (PRICES[i] && s.own[i] < 0 && !s.spy[pi]) { s.phase = 'buy'; s.message = '到达 ' + CELLS[i] + '，可购买 ' + money(PRICES[i]); return; } else if (i === 3 || i === 12 || i === 20 || i === 27 || i === 33) { applyEvent(pi); } else if (i === 15 || i === 36) { p.cash -= 180; s.message = p.name + ' 缴纳税款'; } else if (i === 17 || i === 30) { if (s.cards[pi].indexOf('jailFree') >= 0) { s.cards[pi].splice(s.cards[pi].indexOf('jailFree'), 1); s.message = '免罪卡生效，没有入狱'; } else { p.pos = 17; s.jail[pi] = 1; s.message = p.name + ' 进入监狱，暂停行动一回合'; } } s.phase = 'end'; }
        function movePlayer(pi) { var p = s.players[pi]; if (s.jail[pi] > 0) { s.jail[pi] -= 1; s.phase = 'end'; s.message = p.name + ' 在监狱中，跳过本回合'; render(); if (pi === 0) setTimeout(aiTurns, 20); return; } var d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6), d = d1 + d2; s.dice = [d1, d2]; p.pos = (p.pos + d) % N; if (p.pos < d) p.cash += 200; land(pi); render(); if (pi === 0 && s.phase === 'end') { setTimeout(aiTurns, 20); } }
        function buy(pi) { var p = s.players[pi], i = p.pos; if (!PRICES[i] || s.own[i] >= 0 || p.cash < PRICES[i]) return; p.cash -= PRICES[i]; s.own[i] = pi; s.phase = 'end'; s.message = p.name + ' 买下 ' + CELLS[i]; render(); if (pi === 0) setTimeout(aiTurns, 20); }
        function build(pi) { var p = s.players[pi], i = p.pos; if (s.own[i] === pi && p.cash >= 100 && s.buildings[i] < 4) { p.cash -= 100; s.buildings[i] += 1; s.message = p.name + ' 在 ' + CELLS[i] + ' 建造第 ' + s.buildings[i] + ' 级房屋'; render(); } }
        function aiTurns() { if (stopped || s.phase !== 'end') return; for (var pi = 1; pi < 3; pi += 1) { if (!s.players[pi].out) { s.turn = pi; s.phase = 'roll'; movePlayer(pi); if (s.phase === 'buy') buy(pi); if (s.phase === 'end' && s.own[s.players[pi].pos] === pi) build(pi); } } s.turn = 0; s.round += 1; s.phase = 'roll'; s.message = '第 ' + s.round + ' 轮，轮到你'; render(); save(s); }
        render();
        return { getState: function () { return JSON.parse(JSON.stringify(s)); }, stop: function () { stopped = true; save(s); }, restart: function () { s = initial(); render(); }, destroy: function () { stopped = true; save(s); container.innerHTML = ''; } };
    }
    global.PK32Richman = { start: start, CELLS: CELLS, BOARD_MAP: BOARD_MAP, EVENTS: EVENTS };
}(window));
