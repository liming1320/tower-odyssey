// PK32 强手棋独立迁移版：使用 PK32 棋盘布局和独立存档，不调用项目原强手棋。
(function (global) {
    'use strict';
    var N = 40, SAVE = 'pk32-richman-save-picform13-v2';
    var BOARD_MAP = '03040203101200100100110122113212232204340304120322123033203011201211032304032404233403230424010400021001200011101312141334243234123202120302240413141213221233321434041402041202322230331030011002010302131214132404222432342022103000200100020113031213211133312333042403041303111320113021313033320020010014340414030412023222303210301110211122212423143404240204000211121011200021203130232224330323';
    var CELLS = ['开始', '解放路', '运气', '商业间谍', '所得税', '杭州站', '建设路', '机会', '重庆路', '平安路', '坐牢', '民生路', '电热公司', '黄河路', '西安路', '上海站', '河南路', '运气', '中兴路', '唐山路', '免费住宿', '太平路', '机会', '广场路', '环城路', '福州站', '中山路', '湖滨路', '水电站', '黎明路', '进牢', '中东路', '杭州路', '运气', '公园路', '南京站', '机会', '长生南路', '财产税', '长生北路'];
    var PRICES = [0, 600, 0, 0, 0, 2000, 1000, 0, 1000, 1200, 0, 1400, 2000, 1400, 1600, 2000, 1800, 0, 1800, 2000, 0, 2200, 0, 2200, 2400, 2000, 2600, 2600, 2000, 2800, 0, 3000, 3000, 0, 3200, 2000, 0, 3500, 0, 4000];
    var COLORS = ['#008000', '#808000', '#800080', '#800000'];
    var ART = '/img/pk32/original/sheet-de1b36.png';
    // Native RVA 0x1580532: 40px sprites on a 41px track, inside the printed labels.
    function position(i) {
        if (i < 10) return { x: 534 - i * 41, y: 411 };
        if (i < 20) return { x: 124, y: 411 - (i - 10) * 41 };
        if (i < 30) return { x: 124 + (i - 20) * 41, y: 1 };
        return { x: 534, y: 1 + (i - 30) * 41 };
    }
    // Native RVA 0x1580e4a: ownership/buildings sit outside the printed labels.
    function propertyPosition(i) {
        if (i === 0) return { x: 657, y: 411 };
        if (i < 10) return { x: 493 - (i - 1) * 41, y: 288 };
        if (i <= 20) return { x: 1, y: 411 - (i - 10) * 41 };
        if (i < 30) return { x: 165 + (i - 21) * 41, y: 124 };
        return { x: 657, y: 1 + (i - 30) * 41 };
    }
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
        { text: '前进到民主路，如经过开始得2000元', kind: 'unverifiedAdvance' },
        { text: '直达上海站，如经过开始得2000元', kind: 'advance', target: 15 },
        { text: '前进到环城路，如经过开始得2000元', kind: 'advance', target: 24 },
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
    function initial() { return { round: 1, turn: 0, phase: 'roll', dice: [1, 1], own: Array(N).fill(-1), buildings: Array(N).fill(0), cards: [['buildHouse', 'buildFloor', 'jailFree'], [], [], []], spy: [0, 0, 0, 0], jail: [0, 0, 0, 0], players: COLORS.map(function (color, i) { return { name: ['你', '电脑甲', '电脑乙', '电脑丙'][i], pos: 0, cash: 3000, color: color, out: false }; }), message: '轮到你，掷骰子开始' }; }
    function load() {
        try {
            var s = JSON.parse(localStorage.getItem(SAVE));
            function ints(values, length, min, max) { return Array.isArray(values) && values.length === length && values.every(function (v) { return Number.isInteger(v) && v >= min && v <= max; }); }
            if (!s || !Number.isInteger(s.round) || s.round < 1 || s.turn !== 0 || ['roll', 'buy', 'end', 'over'].indexOf(s.phase) < 0 ||
                !Array.isArray(s.players) || s.players.length !== 4 || s.players.some(function (p) { return !p || !Number.isInteger(p.pos) || p.pos < 0 || p.pos >= N || !Number.isFinite(p.cash) || typeof p.out !== 'boolean'; }) ||
                !ints(s.dice, 2, 1, 6) || !ints(s.own, N, -1, 3) || !ints(s.buildings, N, 0, 4) ||
                !Array.isArray(s.cards) || s.cards.length !== 4 || s.cards.some(function (cards) { return !Array.isArray(cards) || cards.some(function (key) { return !CARDS[key]; }); }) ||
                !ints(s.jail, 4, 0, 100) || !ints(s.spy, 4, 0, 100)) return initial();
            return s;
        } catch (e) { return initial(); }
    }
    function save(s) { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch (e) {} }
    function cellType(i) { if ([2, 7, 17, 22, 33, 36].indexOf(i) >= 0) return CELLS[i]; if (i === 20) return '休息'; if (i === 10 || i === 30) return '监狱'; if (i === 4 || i === 38) return '税'; return PRICES[i] ? '地产' : '特殊'; }
    function start(container, opts) {
        opts = opts || {}; var s = load(), stopped = false, aiTimer = null, assetStatus = 'loading', zoomed = false; container.innerHTML = '';
        var root = el('section', 'pk32-pk-richman'); var head = el('header', 'pk32-rh-head'); var title = el('h2', '', 'PK32 · 强手棋'); var status = el('div', 'pk32-rh-status'); var boardWrap = el('div', 'pk32-rh-board-wrap'); var board = el('div', 'pk32-rh-board'); board.dataset.assetSource = 'picform-13'; board.dataset.assetStatus = 'native-board-mapping'; board.dataset.rulesStatus = 'incomplete'; boardWrap.appendChild(board); var actions = el('div', 'pk32-rh-actions'); var log = el('div', 'pk32-rh-log');
        var canvas = el('canvas', 'pk32-rh-canvas'); canvas.width = 698; canvas.height = 452; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '强手棋棋盘');
        var atlas = document.createElement('img'), selected = s.players[0].pos;
        atlas.onload = function () { if (!stopped) { assetStatus = 'ready'; render(); if (s.phase === 'end') queueAITurns(); } };
        atlas.onerror = function () { if (!stopped) { assetStatus = 'failed'; render(); } };
        atlas.src = ART;
        head.append(title, status); root.append(head, boardWrap, actions, log); container.appendChild(root);
        var style = document.createElement('style'); style.textContent = '.pk32-pk-richman{box-sizing:border-box;width:100%;max-width:730px;margin:auto;padding:12px;background:#c0c0c0;color:#111;font-family:system-ui}.pk32-pk-richman *{box-sizing:border-box}.pk32-rh-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pk32-rh-head h2{margin:0;font-size:18px}.pk32-rh-status{font-size:14px;line-height:1.5;overflow-wrap:anywhere}.pk32-rh-board-wrap{width:100%;max-width:698px;margin:10px auto;overflow-x:auto;overscroll-behavior-x:contain}.pk32-rh-board{position:relative;width:100%;aspect-ratio:698/452;background:#008080}.pk32-rh-canvas{display:block;width:100%;height:100%;image-rendering:pixelated}.pk32-rh-cell{position:absolute;display:block;padding:0;border:0;border-radius:0;background:transparent;cursor:pointer;min-width:0;min-height:0;touch-action:manipulation}.pk32-rh-cell:hover,.pk32-rh-cell:focus-visible{outline:2px solid #fff;outline-offset:-2px}.pk32-rh-actions,.pk32-rh-hand{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.pk32-rh-actions button,.pk32-rh-hand button,.pk32-rh-actions select{padding:8px 10px;min-height:40px;border:1px solid #777;border-radius:2px;background:#eee;color:#111;cursor:pointer}.pk32-rh-actions button:disabled,.pk32-rh-hand button:disabled{color:#777;cursor:default}.pk32-rh-log{min-height:42px;padding:8px;border-top:1px solid #999;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}.pk32-rh-panel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}.pk32-rh-player{padding:6px 0;border-top:4px solid;white-space:pre-line;overflow-wrap:anywhere;font-size:13px}.pk32-rh-player[data-active=true]{font-weight:700}@media(max-width:480px){.pk32-pk-richman{padding:6px}.pk32-rh-panel{grid-template-columns:repeat(2,minmax(0,1fr))}.pk32-rh-actions button{flex:1 1 100px}}'; root.appendChild(style);
        function drawBoard() {
            var ctx = canvas.getContext('2d');
            if (!ctx || !atlas.complete || !atlas.naturalWidth) return;
            ctx.imageSmoothingEnabled = false;
            function copy(sx, sy, width, height, x, y) { ctx.drawImage(atlas, sx, sy, width, height, x, y, width, height); }
            // Native RVA 0x157c401: board starts at atlas row 195, not 196.
            copy(0, 195, 698, 452, 0, 0);
            for (var i = 0; i < N; i++) {
                var p = position(i), house = propertyPosition(i), owner = s.own[i];
                copy(1067, 195, 40, 40, p.x, p.y);
                copy(698 + (owner + 1) * 41, 196 + (owner < 0 ? 0 : s.buildings[i]) * 41, 40, 40, house.x, house.y);
            }
            // Native RVA 0x157f3e9: replace the atlas's sample digits with the actual balances.
            s.players.forEach(function (player, id) {
                var x = id === 0 ? 448 : 243, y = id === 0 ? 179 : 179 + (id - 1) * 41;
                var digits = Math.min(99999999, Math.max(0, Math.floor(player.cash))).toString().padStart(8, ' ');
                for (var n = 0; n < 8; n++) copy(985 + (digits[n] === ' ' ? 10 : Number(digits[n])) * 8, 360 + id * 13, 8, 13, x + n * 8, y);
            });
            [[333, 169], [333, 210], [333, 251], [374, 210]].forEach(function (p) { copy(1077, 203, 32, 32, p[0], p[1]); });
            for (var d = 0; d < 2; d++) copy(1077, 203 + s.dice[d] * 32, 32, 32, 333 + d * 41, 210);
            // Native RVA 0x1580696: four directional columns and four character rows.
            var order = s.players.map(function (_, id) { return id; }).filter(function (id) { return id !== s.turn; }).concat(s.turn);
            order.forEach(function (id) {
                var player = s.players[id]; if (player.out) return;
                var p = position(player.pos);
                copy(903 + Math.floor(player.pos / 10) * 41, 196 + id * 41, 40, 40, p.x, p.y);
            });
            canvas.dataset.ready = 'true';
        }
        function button(label, fn) { var b = el('button', '', label); b.type = 'button'; b.onclick = fn; return b; }
        function cancelAI() { clearTimeout(aiTimer); aiTimer = null; }
        function queueAITurns() { cancelAI(); aiTimer = setTimeout(function () { aiTimer = null; aiTurns(); }, 20); }
        function reset() { cancelAI(); s = initial(); selected = 0; save(s); render(); }
        function gameOver() {
            s.players.forEach(function (p) { if (p.cash <= 0) p.out = true; });
            if (s.players[0].out || s.players.filter(function (p) { return !p.out; }).length <= 1) {
                cancelAI(); s.phase = 'over'; s.turn = 0;
                s.message = s.players[0].out ? '你已破产，本局结束' : '你获胜，本局结束'; return true;
            }
            return false;
        }
        function note(t) { s.message = t; if (assetStatus === 'ready') status.textContent = t; log.textContent = s.players.map(function (p) { return p.name + ' 位置' + p.pos + ' 现金' + money(p.cash) + (p.out ? ' 破产' : ''); }).join('\n'); }
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
            status.textContent = assetStatus === 'loading' ? '正在加载棋盘' : assetStatus === 'failed' ? '棋盘图片加载失败' : s.message;
            board.innerHTML = ''; board.style.width = zoomed ? '1396px' : '100%'; board.appendChild(canvas); drawBoard();
            for (var i = 0; i < N; i += 1) {
                var c = el('button', 'pk32-rh-cell'), p = position(i); c.type = 'button'; c.dataset.cell = i;
                c.style.left = (p.x / 698 * 100) + '%'; c.style.top = (p.y / 452 * 100) + '%'; c.style.width = (40 / 698 * 100) + '%'; c.style.height = (40 / 452 * 100) + '%';
                c.title = CELLS[i] + ' · ' + (PRICES[i] ? money(PRICES[i]) : cellType(i)); c.setAttribute('aria-label', c.title);
                c.onclick = (function (index) { return function () { selected = index; showCell(); }; }(i)); board.appendChild(c);
            }
            var oldPanel = root.querySelector('.pk32-rh-panel'); if (oldPanel) oldPanel.remove(); var panel = el('div', 'pk32-rh-panel'); s.players.forEach(function (p, i) { var row = el('div', 'pk32-rh-player', p.name + '\n' + CELLS[p.pos] + '\n现金 ' + money(p.cash) + (p.out ? '\n破产' : '') + (s.jail[i] ? '\n监狱停留 ' + s.jail[i] + ' 回合' : '') + (s.spy[i] ? '\n间谍状态 ' + s.spy[i] + ' 圈' : '')); row.style.borderColor = COLORS[i]; row.dataset.active = String(i === s.turn); panel.appendChild(row); }); root.appendChild(panel);
            var oldHand = root.querySelector('.pk32-rh-hand'); if (oldHand) oldHand.remove(); var hand = el('div', 'pk32-rh-hand', '你的卡片：'); s.cards[0].forEach(function (key, index) { var card = button(CARDS[key].name, function () { useCard(index); }); card.title = CARDS[key].desc; hand.appendChild(card); }); root.appendChild(hand);
            actions.innerHTML = ''; actions.appendChild(button('掷骰子', function () { if (assetStatus !== 'ready' || stopped || s.phase !== 'roll' || s.turn !== 0) return; movePlayer(0); })); actions.appendChild(button('购买当前地产', function () { if (s.phase !== 'buy' || s.turn !== 0 || s.spy[0]) return; buy(0); })); actions.appendChild(button('放弃购买', endBuyPhase)); actions.appendChild(button('建造', function () { if (s.turn !== 0 || s.spy[0]) return; build(0); })); actions.appendChild(button('重开', reset)); actions.appendChild(button('存档', function () { save(s); note('PK32 强手棋进度已保存'); }));
            var controls = actions.children, current = s.players[0];
            controls[0].disabled = assetStatus !== 'ready' || stopped || s.phase !== 'roll' || s.turn !== 0 || current.out;
            controls[1].disabled = assetStatus !== 'ready' || s.phase !== 'buy' || s.turn !== 0 || !!s.spy[0] || current.cash < PRICES[current.pos];
            controls[2].disabled = assetStatus !== 'ready' || s.phase !== 'buy' || s.turn !== 0;
            controls[3].disabled = assetStatus !== 'ready' || s.phase === 'over' || s.turn !== 0 || !!s.spy[0] || s.own[current.pos] !== 0 || s.buildings[current.pos] >= 4 || current.cash < 100;
            var zoom = button(zoomed ? '-' : '+', function () { zoomed = !zoomed; render(); });
            zoom.title = zoomed ? '缩小棋盘' : '放大棋盘'; zoom.setAttribute('aria-label', zoom.title); actions.appendChild(zoom);
            var location = el('select'); location.setAttribute('aria-label', '选择地块');
            CELLS.forEach(function (name, index) { var option = el('option', '', name); option.value = index; option.selected = selected === index; location.appendChild(option); });
            location.onchange = function () { selected = Number(location.value); showCell(); }; actions.appendChild(location);
            if (assetStatus === 'failed') actions.appendChild(button('重试加载', function () { assetStatus = 'loading'; render(); atlas.src = ART; }));
            showCell();
            if (opts.onScore) opts.onScore('PK32 强手棋 · 第 ' + s.round + ' 轮');
        }
        function showCell() { var location = actions.querySelector('select'); if (location) location.value = String(selected); var owner = s.own[selected]; log.textContent = CELLS[selected] + (PRICES[selected] ? ' · 地价 ' + money(PRICES[selected]) : '') + (owner >= 0 ? '\n业主：' + s.players[owner].name + ' · 建筑 ' + s.buildings[selected] + ' 级' : '') + '\n' + s.players.filter(function (p) { return p.pos === selected && !p.out; }).map(function (p) { return p.name; }).join('、'); }
        function endBuyPhase() { if (s.turn !== 0 || s.phase !== 'buy') return; s.phase = 'end'; s.message = '放弃购买，结束本回合'; render(); queueAITurns(); }
        function useCard(index) { if (assetStatus !== 'ready' || s.phase === 'over' || s.turn !== 0 || s.phase === 'roll' && s.spy[0]) return; var key = s.cards[0][index], p = s.players[0], i = p.pos; if (!key) return; if (key === 'jailFree') { s.message = '免罪卡已保留，进入监狱时自动使用'; } else if (key === 'buildHouse' || key === 'buildFloor' || key === 'buildStreet') { if (s.own[i] !== 0) return note('当前地产不属于你'); s.cards[0].splice(index, 1); s.buildings[i] = Math.min(4, s.buildings[i] + 1); s.message = '使用' + CARDS[key].name + '，' + CELLS[i] + '建筑等级提升'; } else if (key === 'spy') { s.cards[0].splice(index, 1); s.spy[0] = 1; s.message = '已进入商业间谍状态，本圈不能买地或盖房'; } else return note(CARDS[key].desc); render(); save(s); }
        function land(pi) { var p = s.players[pi], i = p.pos; if (PRICES[i] && s.own[i] >= 0 && s.own[i] !== pi) { var rent = 50 + s.buildings[i] * 80; p.cash -= rent; s.players[s.own[i]].cash += rent; if (p.cash <= 0) p.out = true; s.message = p.name + ' 支付 ' + money(rent) + ' 过路费'; } else if (PRICES[i] && s.own[i] < 0 && !s.spy[pi]) { s.phase = 'buy'; s.message = '到达 ' + CELLS[i] + '，可购买 ' + money(PRICES[i]); return; } else if ([2, 7, 17, 22, 33, 36].indexOf(i) >= 0) { applyEvent(pi); } else if (i === 4 || i === 38) { p.cash -= i === 4 ? 2000 : 1000; s.message = p.name + ' 缴纳税款'; } else if (i === 30) { if (s.cards[pi].indexOf('jailFree') >= 0) { s.cards[pi].splice(s.cards[pi].indexOf('jailFree'), 1); s.message = '免罪卡生效，没有入狱'; } else { p.pos = 10; s.jail[pi] = 1; s.message = p.name + ' 进入监狱，暂停行动一回合'; } } else if (i === 3) { s.spy[pi] = 1; s.message = p.name + ' 进入商业间谍状态'; } s.phase = 'end'; }
        function movePlayer(pi) { var p = s.players[pi]; if (s.jail[pi] > 0) { s.jail[pi] -= 1; s.phase = 'end'; s.message = p.name + ' 在监狱中，跳过本回合'; render(); if (pi === 0) queueAITurns(); return; } var d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6), d = d1 + d2; s.dice = [d1, d2]; p.pos = (p.pos + d) % N; if (p.pos < d) { p.cash += 2000; if (s.spy[pi] > 0) s.spy[pi] -= 1; } land(pi); if (pi === 0) selected = p.pos; gameOver(); render(); if (pi === 0 && s.phase === 'end') { queueAITurns(); } }
        function buy(pi) { var p = s.players[pi], i = p.pos; if (!PRICES[i] || s.own[i] >= 0 || p.cash < PRICES[i]) return; p.cash -= PRICES[i]; s.own[i] = pi; s.phase = 'end'; s.message = p.name + ' 买下 ' + CELLS[i]; gameOver(); render(); if (pi === 0 && s.phase === 'end') queueAITurns(); }
        function build(pi) { var p = s.players[pi], i = p.pos; if (s.own[i] === pi && p.cash >= 100 && s.buildings[i] < 4) { p.cash -= 100; s.buildings[i] += 1; s.message = p.name + ' 在 ' + CELLS[i] + ' 建造第 ' + s.buildings[i] + ' 级房屋'; gameOver(); render(); } }
        function aiTurns() {
            if (stopped || s.phase !== 'end') return;
            for (var pi = 1; pi < s.players.length; pi++) {
                if (s.players[pi].out) continue;
                s.turn = pi; s.phase = 'roll'; movePlayer(pi);
                if (s.phase === 'buy') { buy(pi); if (s.phase !== 'over') s.phase = 'end'; }
                if (s.phase === 'end' && s.own[s.players[pi].pos] === pi) build(pi);
                if (gameOver()) { render(); save(s); return; }
            }
            s.turn = 0; s.round += 1; s.phase = 'roll'; s.message = '第 ' + s.round + ' 轮，轮到你'; render(); save(s);
        }
        render();
        return { getState: function () { return JSON.parse(JSON.stringify(s)); }, stop: function () { stopped = true; cancelAI(); save(s); }, restart: reset, destroy: function () { stopped = true; cancelAI(); save(s); container.innerHTML = ''; } };
    }
    global.PK32Richman = { start: start, CELLS: CELLS, BOARD_MAP: BOARD_MAP, EVENTS: EVENTS, prices: PRICES, position: position, propertyPosition: propertyPosition };
}(window));
