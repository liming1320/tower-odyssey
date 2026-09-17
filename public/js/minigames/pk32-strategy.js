// PK32 独立策略与模拟玩法。此模块不接入当前小游戏的 50 关流程。
(function () {
    'use strict';
    window.PK32Strategy = window.PK32Strategy || {};

    const SPECS = {
        '飞行棋': { id: 'ludo', flow: '掷骰子，按点数移动，先到终点者胜' },
        '前进棋': { id: 'advance', flow: '轮流掷骰子前进，完成原版棋盘流程' },
        '赛马': { id: 'horse-race', flow: '下注后掷骰子推进赛马，首匹到达终点获胜' },
        '轮盘': { id: 'roulette', flow: '选择下注区域后旋转轮盘，结算赔率' },
        '老虎机': { id: 'slot', flow: '拉动摇杆，三列图案按原版回合结算' },
        '神符': { id: 'rune', flow: '按原版帮助文本放置神符：同色/同形相邻、灰石通配、骷髅消除、满行列清除' },
        '原子': { id: 'atom', flow: '原版 300 关；移动彩色原子，组成 2x2 同色区域即可消除；特殊原子能力仍在反汇编' },
        '开心辞典': { id: 'quiz', flow: '逐题答题，使用道具并累计奖金' },
        '开心灯谜': { id: 'riddle', flow: '逐题猜灯谜，答对推进原版题目流程' },
        '七盏灯': { id: 'lights', flow: '点击灯组切换状态，全部点亮完成关卡' },
        '上一百层': { id: 'up100', flow: '掷骰子向上攀登，先到原版终点完成流程' },
        '下一百层': { id: 'down100', flow: '掷骰子向下探索，先到原版终点完成流程' },
    };

    const QUESTIONS = [
        ['中国的首都是哪里？', ['北京', '上海', '广州'], 0],
        ['一年有多少个月？', ['10', '12', '14'], 1],
        ['太阳从哪里升起？', ['东方', '西方', '北方'], 0],
        ['“白日依山尽”的下一句是？', ['黄河入海流', '更上一层楼', '海内存知己'], 0],
    ];
    const RIDDLES = [
        ['一口咬掉牛尾巴，打一字', ['告', '午', '牛'], 0],
        ['远看山有色，近听水无声，打一物', ['画', '书', '镜'], 0],
        ['有面无口，有脚无手，打一物', ['钟', '桌子', '门'], 0],
    ];

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }
    function button(label, fn) {
        const b = el('button', '', label);
        b.type = 'button'; b.addEventListener('click', fn); return b;
    }
    function css() {
        if (document.getElementById('pk32-strategy-style')) return;
        const s = el('style'); s.id = 'pk32-strategy-style';
        s.textContent = '.pk32s{padding:18px;color:#e8eef7;background:#17212b;border-radius:8px;max-width:760px;margin:auto}.pk32s h2{margin:0 0 6px}.pk32s .meta{color:#aab8c8;margin-bottom:14px}.pk32s .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}.pk32s button{cursor:pointer;padding:8px 12px;border:1px solid #536578;border-radius:5px;background:#26394b;color:#fff}.pk32s button:hover{background:#34516a}.pk32s .board{display:grid;gap:6px;margin:14px 0}.pk32s .cell{min-width:42px;min-height:42px;display:grid;place-items:center;border:1px solid #52687d;border-radius:4px;background:#223242;color:#fff}.pk32s .cell.on{background:#d49b3b}.pk32s .cell.off{background:#101820}.pk32s .track{height:26px;background:#304456;border-radius:5px;overflow:hidden}.pk32s .track i{display:block;height:100%;background:#d49b3b;transition:width .2s}.pk32s .msg{min-height:28px;color:#f7d58a;white-space:pre-wrap}.pk32s .choice{display:block;text-align:left;width:100%;margin:6px 0}.pk32s .numbers{font-size:22px;letter-spacing:6px;padding:12px;background:#101820;text-align:center}.pk32s input{padding:8px;background:#101820;color:#fff;border:1px solid #536578;border-radius:4px}';
        document.head.appendChild(s);
    }

    function mount(container, spec, opts) {
        css(); opts = opts || {}; spec = spec || SPECS['飞行棋'];
        let state = { turn: 1, score: 0, ended: false, position: 0, pawns: [0, 0, 0, 0], money: opts.money == null ? 100 : opts.money };
        let cleanup = [];
        container.innerHTML = '';
        const root = el('section', 'pk32s');
        const title = el('h2', '', opts.title || ('PK32 · ' + (opts.name || spec.id)));
        const meta = el('div', 'meta', '原版流程：' + (spec.flow || '独立流程') + '。本模块不使用统一 50 关系统。');
        const status = el('div', 'msg');
        const body = el('div');
        const bar = el('div', 'bar');
        const restart = button('重开', reset);
        const finishButton = button('结束', end);
        bar.append(restart, finishButton); root.append(title, meta, status, bar, body); container.appendChild(root);
        function setMessage(v) { status.textContent = v; }
        function reset() { state = { turn: 1, score: 0, ended: false, position: 0, pawns: [0, 0, 0, 0], players: Array.from({ length: 4 }, function () { return Array(4).fill(-1); }), activePlayer: 0, selectedPawn: -1, lastRoll: 0, money: opts.money == null ? 100 : opts.money, coins: 100, spinning: false, spins: 0, reels: ['?', '?', '?'] }; body.innerHTML = ''; draw(); }
        function end() { state.ended = true; setMessage('本局已结束。'); body.querySelectorAll('button').forEach(b => b.disabled = true); }
        function guard(fn) { return function () { if (!state.ended) fn(); }; }
        function draw() {
            const id = spec.id;
            if (id === 'ludo') drawLudo();
            else if (id === 'advance' || id === 'up100' || id === 'down100' || id === 'horse-race') drawTrack(id);
            else if (id === 'roulette') drawRoulette();
            else if (id === 'slot') drawSlot();
            else if (id === 'rune') drawRune();
            else if (id === 'atom') drawAtom();
            else if (id === 'quiz') drawQuestion(false);
            else if (id === 'riddle') drawNativeRiddles();
            else if (id === 'lights') drawLights();
        }
        function drawLudo() {
            body.innerHTML = '';
            const max = 57;
            const colors = ['#55a7e8', '#e85d75', '#65c878', '#e4b84c'];
            function movable(player, pawn, roll) {
                const position = state.players[player][pawn];
                return position < max && (position < 0 ? roll === 6 : position + roll <= max);
            }
            function globalPosition(player, pawn) {
                const position = state.players[player][pawn];
                return position >= 0 && position < 52 ? (player * 13 + position) % 52 : -1;
            }
            function nextTurn(extra) {
                state.selectedPawn = -1;
                state.activePlayer = extra ? state.activePlayer : (state.activePlayer + 1) % 4;
                state.turn += extra ? 0 : 1;
                drawLudo();
                if (!ended && state.activePlayer !== 0) setTimeout(aiTurn, 300);
            }
            function movePawn(player, pawn, roll) {
                if (!movable(player, pawn, roll)) return;
                const old = state.players[player][pawn];
                state.players[player][pawn] = old < 0 ? 0 : old + roll;
                const landed = globalPosition(player, pawn);
                if (landed >= 0) {
                    state.players.forEach(function (pieces, otherPlayer) {
                        if (otherPlayer === player) return;
                        pieces.forEach(function (position, otherPawn) {
                            if (globalPosition(otherPlayer, otherPawn) === landed) state.players[otherPlayer][otherPawn] = -1;
                        });
                    });
                }
                state.score += roll;
                if (state.players[player].every(function (position) { return position >= max; })) {
                    ended = true;
                    return finish((player === 0 ? '你' : '电脑' + player) + '的四架飞机全部到达终点！');
                }
                setMessage((player === 0 ? '你' : '电脑' + player) + '移动飞机 ' + (pawn + 1) + ' ' + roll + ' 格。');
                nextTurn(roll === 6);
            }
            function aiTurn() {
                if (ended || state.activePlayer === 0) return;
                const roll = 1 + Math.floor(Math.random() * 6);
                state.lastRoll = roll;
                const choices = state.players[state.activePlayer].map(function (_, pawn) { return pawn; }).filter(function (pawn) { return movable(state.activePlayer, pawn, roll); });
                if (!choices.length) {
                    setMessage('电脑' + state.activePlayer + '掷出 ' + roll + ' 点，没有可移动的飞机。');
                    return nextTurn(roll === 6);
                }
                movePawn(state.activePlayer, choices[0], roll);
            }
            const info = el('div', 'meta', '你：' + state.players[0].map(function (p) { return p < 0 ? '未起飞' : p >= max ? '终点' : p + '/' + max; }).join('、') + '　当前回合：' + (state.activePlayer === 0 ? '你' : '电脑' + state.activePlayer) + '　上次骰子：' + (state.lastRoll || '未掷'));
            const track = el('div', 'board');
            track.style.gridTemplateColumns = 'repeat(13, minmax(32px, 1fr))';
            track.style.maxWidth = '560px';
            for (let cell = 0; cell < 52; cell += 1) {
                const occupants = [];
                state.players.forEach(function (pieces, player) { pieces.forEach(function (position, pawn) { if (globalPosition(player, pawn) === cell) occupants.push('' + (player + 1) + '-' + (pawn + 1)); }); });
                const tile = el('div', 'cell', occupants.length ? occupants.join(' ') : String(cell + 1));
                tile.style.borderColor = occupants.length ? colors[Number(occupants[0].split('-')[0]) - 1] : '';
                track.appendChild(tile);
            }
            const roll = button(state.activePlayer === 0 ? '掷骰子' : '电脑回合', guard(function () {
                if (state.activePlayer !== 0) return;
                const n = 1 + Math.floor(Math.random() * 6);
                state.lastRoll = n;
                const choices = state.players[0].map(function (_, pawn) { return pawn; }).filter(function (pawn) { return movable(0, pawn, n); });
                if (!choices.length) {
                    setMessage('你掷出 ' + n + ' 点，没有可移动的飞机。');
                    return nextTurn(n === 6);
                }
                if (choices.length === 1) return movePawn(0, choices[0], n);
                state.selectedPawn = -1;
                setMessage('掷出 ' + n + ' 点，请选择要移动的飞机。');
                drawLudo();
                body.querySelectorAll('[data-ludo-pawn]').forEach(function (node) {
                    node.disabled = choices.indexOf(Number(node.dataset.ludoPawn)) < 0;
                    node.onclick = function () { movePawn(0, Number(node.dataset.ludoPawn), n); };
                });
            }));
            const pieces = el('div', 'bar');
            state.players[0].forEach(function (position, pawn) {
                const piece = button('飞机 ' + (pawn + 1) + ' · ' + (position < 0 ? '灰色' : position >= max ? '旗帜' : position), function () {});
                piece.dataset.ludoPawn = String(pawn);
                piece.disabled = true;
                pieces.appendChild(piece);
            });
            body.append(info, track, roll, pieces, el('div', 'meta', '掷出 6 点起飞；落到其他颜色飞机会将其撞回原点；四架飞机全部到达终点才获胜。'));
            if (!ended && state.activePlayer === 0) setMessage(state.lastRoll ? '轮到你，请掷骰子。' : '请掷骰子。');
        }
        function drawTrack(id) {
            body.innerHTML = ''; const max = id === 'ludo' ? 40 : 100;
            const track = el('div', 'track'); const fill = el('i'); fill.style.width = Math.min(100, state.position / max * 100) + '%'; track.appendChild(fill);
            const info = el('div', 'meta', '位置：' + state.position + ' / ' + max + '　回合：' + state.turn + '　得分：' + state.score);
            const roll = button('掷骰子', guard(function () { const n = 1 + Math.floor(Math.random() * 6); if (state.position + n <= max) state.position += n; state.score += n; state.turn++; if (state.position === max) { state.ended = true; finish('完成原版流程！'); } else setMessage('掷出 ' + n + ' 点。'); drawTrack(id); }));
            body.append(info, track, roll); if (!state.ended) setMessage('请掷骰子。');
        }
        function drawRoulette() {
            body.innerHTML = '';
            const info = el('div', 'meta', '筹码：' + state.money + '　上次结果：' + (state.result == null ? '尚未旋转' : state.result) + '　回合：' + (state.rounds || 0) + ' / 20');
            const type = document.createElement('select');
            [['number', '单个号码（35:1）'], ['red', '红（1:1）'], ['black', '黑（1:1）'], ['odd', '单（1:1）'], ['even', '双（1:1）'], ['low', '低半区 1-18（1:1）'], ['high', '高半区 19-36（1:1）'], ['dozen1', '第一组十二个号码（2:1）'], ['dozen2', '第二组十二个号码（2:1）'], ['dozen3', '第三组十二个号码（2:1）']].forEach(function (item) { const option = document.createElement('option'); option.value = item[0]; option.textContent = item[1]; type.appendChild(option); });
            const choice = document.createElement('input'); choice.type = 'number'; choice.min = 0; choice.max = 36; choice.value = 7; choice.setAttribute('aria-label', '轮盘下注号码');
            const amount = document.createElement('input'); amount.type = 'number'; amount.min = 1; amount.max = Math.max(1, state.money); amount.value = Math.min(10, Math.max(1, state.money)); amount.setAttribute('aria-label', '轮盘下注筹码');
            function matches(kind, value) {
                if (kind === 'number') return Number(choice.value) === value;
                if (value === 0) return false;
                if (kind === 'red') return [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].indexOf(value) >= 0;
                if (kind === 'black') return !matches('red', value);
                if (kind === 'odd') return value % 2 === 1;
                if (kind === 'even') return value % 2 === 0;
                if (kind === 'low') return value >= 1 && value <= 18;
                if (kind === 'high') return value >= 19 && value <= 36;
                if (kind === 'dozen1') return value >= 1 && value <= 12;
                if (kind === 'dozen2') return value >= 13 && value <= 24;
                if (kind === 'dozen3') return value >= 25 && value <= 36;
                return false;
            }
            const spin = button('下注并旋转', guard(function () {
                const bet = Math.max(1, Math.min(state.money, Number(amount.value) || 1));
                if (!bet) { state.ended = true; return finish('筹码耗尽，本局结束。'); }
                state.money -= bet;
                state.result = Math.floor(Math.random() * 37);
                state.rounds = (state.rounds || 0) + 1;
                const payout = type.value === 'number' ? 35 : /^dozen/.test(type.value) ? 2 : 1;
                if (matches(type.value, state.result)) {
                    state.money += bet * (payout + 1);
                    setMessage('结果为 ' + state.result + '，命中，赔率 ' + payout + ':1。');
                } else {
                    setMessage('结果为 ' + state.result + '，未命中。');
                }
                if (state.rounds >= 20) { state.ended = true; return finish('完成 20 回合轮盘流程，最终筹码：' + state.money); }
                drawRoulette();
            }));
            body.append(info, el('div', 'bar', '下注类型：'), type, el('div', 'bar', '号码（仅单号下注使用）：'), choice, el('div', 'bar', '下注筹码：'), amount, spin, el('div', 'meta', '0 为绿色；支持单号、红黑、单双、大小和三组十二号码。'));
        }
        function drawSlot() {
            body.innerHTML = '';
            const symbols = ['樱桃', '铃', '星', '7'];
            const nums = state.reels || ['?', '?', '?'];
            const view = el('div', 'numbers', nums.join(' | '));
            const pull = button('拉动老虎机', guard(function () {
                if (state.coins <= 0) { state.coins = 1; setMessage('筹码用完，免费补发 1 个筹码。'); }
                state.coins -= 1;
                state.reels = [0, 0, 0].map(function () { return symbols[Math.floor(Math.random() * symbols.length)]; });
                state.spins = (state.spins || 0) + 1;
                const same = state.reels[0] === state.reels[1] && state.reels[1] === state.reels[2];
                const pair = state.reels[0] === state.reels[1] || state.reels[1] === state.reels[2] || state.reels[0] === state.reels[2];
                const payout = same ? (state.reels[0] === '7' ? 50 : state.reels[0] === '星' ? 20 : 10) : pair ? 2 : 0;
                state.coins += payout;
                state.score += payout;
                setMessage(payout ? '图案 ' + state.reels.join('、') + '，获得 ' + payout + ' 个筹码。' : '图案 ' + state.reels.join('、') + '，未中奖。');
                if (state.spins >= 30) { state.ended = true; return finish('完成 30 回合老虎机流程，剩余筹码：' + state.coins); }
                drawSlot();
            }));
            body.append(view, pull, el('div', 'meta', '筹码：' + state.coins + '　得分：' + state.score + '　回合：' + (state.spins || 0) + ' / 30'));
        }
        function drawRune() {
            body.innerHTML = '';
            const size = 8;
            const colors = ['红', '蓝', '绿', '黄'];
            const shapes = ['日', '月', '星', '石'];
            function makeRune(forceNormal) {
                const roll = Math.random();
                if (!forceNormal && roll < 0.08) return { type: 'skull', label: '骷髅', color: '黑', shape: '骷' };
                if (!forceNormal && roll < 0.20) return { type: 'gray', label: '灰石', color: '灰', shape: '石' };
                const color = colors[Math.floor(Math.random() * colors.length)];
                const shape = shapes[Math.floor(Math.random() * (shapes.length - 1))];
                return { type: 'normal', label: color + shape, color, shape };
            }
            function sameLine(a, b) {
                return Math.floor(a / size) === Math.floor(b / size) || a % size === b % size;
            }
            function neighbors(index) {
                return [index - size, index + size, index - 1, index + 1].filter(function (target) {
                    return target >= 0 && target < size * size && (Math.abs(target - index) === size || Math.floor(target / size) === Math.floor(index / size));
                });
            }
            function canTouch(rune, cell) {
                if (cell && cell.circle) return true;
                if (!cell || !cell.rune) return false;
                if (rune.type === 'gray' || cell.rune.type === 'gray') return true;
                return rune.color === cell.rune.color || rune.shape === cell.rune.shape;
            }
            function canPlace(index, rune) {
                if (rune.type === 'skull') return !!(state.runeBoard[index] && state.runeBoard[index].rune);
                if (state.runeBoard[index] && state.runeBoard[index].rune) return false;
                const occupied = state.runeBoard.some(function (cell) { return cell && cell.rune; });
                return !occupied || neighbors(index).some(function (target) { return canTouch(rune, state.runeBoard[target]); });
            }
            function clearLines() {
                const clear = new Set();
                for (let y = 0; y < size; y += 1) {
                    const row = Array.from({ length: size }, function (_, x) { return y * size + x; });
                    if (row.every(function (index) { return state.runeBoard[index] && state.runeBoard[index].rune; })) row.forEach(function (index) { clear.add(index); });
                }
                for (let x = 0; x < size; x += 1) {
                    const col = Array.from({ length: size }, function (_, y) { return y * size + x; });
                    if (col.every(function (index) { return state.runeBoard[index] && state.runeBoard[index].rune; })) col.forEach(function (index) { clear.add(index); });
                }
                clear.forEach(function (index) { state.runeBoard[index] = { rune: null, circle: true, visited: true }; });
                return clear.size;
            }
            function playable() {
                return state.runeBoard.some(function (_, index) { return canPlace(index, state.currentRune); });
            }
            state.runeBoard = state.runeBoard || Array.from({ length: size * size }, function () { return { rune: null, circle: false, visited: false }; });
            state.currentRune = state.currentRune || makeRune(true);
            state.runeSwaps = Number.isInteger(state.runeSwaps) ? state.runeSwaps : 10;
            const grid = el('div', 'board');
            grid.style.gridTemplateColumns = 'repeat(' + size + ', minmax(30px, 1fr))';
            state.runeBoard.forEach(function (cell, index) {
                const label = cell.rune ? cell.rune.label : cell.circle ? '○' : '·';
                const b = button(label, guard(function () {
                    const rune = state.currentRune;
                    if (!canPlace(index, rune)) {
                        setMessage(playable() ? '这个位置不符合相同颜色、相同图案或灰石相邻规则。' : '当前神符没有可放位置，请使用换符。');
                        return;
                    }
                    if (rune.type === 'skull') {
                        state.runeBoard[index].rune = null;
                        state.score += 1;
                        setMessage('骷髅神符消去了一个方格。');
                    } else {
                        state.runeBoard[index] = { rune, circle: cell.circle, visited: true };
                        state.score += 2;
                        state.runeSwaps = Math.min(10, state.runeSwaps + 1);
                        const cleared = clearLines();
                        if (cleared) {
                            state.score += cleared;
                            setMessage('满行/满列清除 ' + cleared + ' 格，并转为圆圈方格。');
                        } else {
                            setMessage('放置 ' + rune.label + '。');
                        }
                    }
                    state.currentRune = makeRune(false);
                    if (state.runeBoard.every(function (item) { return item.visited; })) {
                        state.ended = true;
                        return finish('神符流程完成：所有方格都放置过神符。得分：' + state.score);
                    }
                    drawRune();
                }));
                b.className = 'cell ' + (cell.rune ? 'on' : 'off');
                if (!canPlace(index, state.currentRune)) b.style.opacity = '0.58';
                grid.appendChild(b);
            });
            const swap = button('换符', guard(function () {
                if (state.runeSwaps <= 0) { setMessage('换符机会已用完。'); return; }
                state.runeSwaps -= 1;
                state.currentRune = makeRune(false);
                setMessage('已更换神符，剩余换符机会：' + state.runeSwaps);
                drawRune();
            }));
            body.append(el('div', 'meta', '当前神符：' + state.currentRune.label + '　换符机会：' + state.runeSwaps + ' / 10　已覆盖：' + state.runeBoard.filter(function (cell) { return cell.visited; }).length + ' / ' + (size * size)), grid, el('div', 'bar'), swap, el('div', 'meta', '放置规则来自 PK32 帮助文本：同色或同形相邻，灰色神石可邻接任意神符，骷髅消除已有神符，满行或满列会清除并变成圆圈方格。'));
        }
        function drawAtom() {
            body.innerHTML = ''; state.atoms = state.atoms || Array(25).fill(0); const colors = ['红', '蓝', '绿', '黄']; const grid = el('div', 'board'); grid.style.gridTemplateColumns = 'repeat(5,1fr)';
            function clearGroups() { let cleared = 0; for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) { const v = state.atoms[y * 5 + x]; if (v && state.atoms[y * 5 + x + 1] === v && state.atoms[(y + 1) * 5 + x] === v && state.atoms[(y + 1) * 5 + x + 1] === v) { [y * 5 + x, y * 5 + x + 1, (y + 1) * 5 + x, (y + 1) * 5 + x + 1].forEach(i => { state.atoms[i] = 0; cleared += 1; }); } } return cleared; }
            state.atoms.forEach(function (v, i) { const b = button(v ? colors[v - 1] : '+', guard(function () { if (!state.atoms[i]) { state.atoms[i] = 1 + Math.floor(Math.random() * colors.length); } else { const empty = state.atoms.findIndex(x => !x); if (empty >= 0) { state.atoms[empty] = state.atoms[i]; state.atoms[i] = 0; } } const cleared = clearGroups(); state.score += cleared; if (state.score >= 20) { state.ended = true; setMessage('原子消除目标完成！'); } drawAtom(); })); b.className = 'cell ' + (v ? 'on' : 'off'); grid.appendChild(b); }); body.append(grid, el('div', 'meta', '原版 300 关 · 已消除：' + state.score + ' · 点击空位生成原子，点击已有原子移动'));
        }
        function drawNativeRiddles() {
            if (!state.riddleBank && !state.riddleLoading) {
                state.riddleLoading = true;
                fetch('/data/pk32-riddle-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                    state.riddleBank = (data.levels || []).filter(function (item) { return item && item.prompt; });
                    state.riddleLoading = false;
                    drawNativeRiddles();
                }).catch(function () {
                    state.riddleLoading = false;
                    drawQuestion(true);
                });
            }
            body.innerHTML = '';
            if (state.riddleLoading) {
                body.append(el('div', 'meta', '正在读取 PK32 原始灯谜题库'));
                setMessage('题库加载中。');
                return;
            }
            const list = state.riddleBank || [];
            if (!list.length) return drawQuestion(true);
            const index = Math.max(0, Math.min((state.turn || 1) - 1, list.length - 1));
            const item = list[index];
            body.append(el('div', '', item.prompt));
            const bar = el('div', 'bar');
            bar.append(button('上一题', guard(function () { state.turn = Math.max(1, (state.turn || 1) - 1); drawNativeRiddles(); })));
            bar.append(button('下一题', guard(function () { state.turn = Math.min(list.length, (state.turn || 1) + 1); state.score += 1; drawNativeRiddles(); })));
            bar.append(button('标记已读', guard(function () { state.score += 1; setMessage('已记录当前灯谜；谜底映射仍待解码。'); })));
            body.append(bar, el('div', 'meta', '原始灯谜：' + (index + 1) + ' / ' + list.length + '　offset：' + item.offset + '　谜底待解码'));
            setMessage('开心灯谜题库内容已迁移；答案、求助和连续答对计分仍待 p-code 或运行轨迹确认。');
        }
        function drawQuestion(riddle) {
            body.innerHTML = ''; const list = riddle ? RIDDLES : QUESTIONS; const q = list[(state.turn - 1) % list.length]; body.append(el('div', '', q[0]));
            q[1].forEach(function (answer, i) { const choice = button(answer, guard(function () { if (i === q[2]) { state.score += 100; state.turn++; setMessage('回答正确！'); if (state.turn > 5) { state.ended = true; setMessage('题目流程完成！总分：' + state.score); } } else { state.turn++; setMessage('回答错误。'); } drawQuestion(riddle); })); choice.className = 'choice'; body.append(choice); });
            body.append(el('div', 'meta', '题目：' + state.turn + '　奖金/积分：' + state.score));
        }
        function drawLights() {
            body.innerHTML = ''; state.lights = state.lights || Array(7).fill(false); state.lightChances = Number.isInteger(state.lightChances) ? state.lightChances : 7; const grid = el('div', 'board'); grid.style.gridTemplateColumns = 'repeat(7,1fr)';
            state.lights.forEach(function (on, i) { const b = button(on ? '亮' : '灭', guard(function () { if (state.lightChances <= 0 || state.ended) return; state.lightChances--; [i, (i + 1) % 7, (i + 6) % 7].forEach(j => state.lights[j] = !state.lights[j]); if (state.lights.every(Boolean)) { state.ended = true; setMessage('七盏灯全部点亮！'); } else if (state.lightChances === 0) { state.ended = true; setMessage('机会用完，请重新开始。'); } drawLights(); })); b.className = 'cell ' + (on ? 'on' : 'off'); b.disabled = state.lightChances <= 0 || state.ended; grid.appendChild(b); }); body.append(grid, el('div', 'meta', '原版规则：7 次机会内点亮全部灯；剩余机会：' + state.lightChances));
        }
        draw();
        return { restart: reset, end, destroy: function () { cleanup.forEach(fn => fn()); cleanup = []; container.innerHTML = ''; }, getState: function () { return Object.assign({}, state); }, getConfig: function () { return spec; } };
    }

    Object.keys(SPECS).forEach(name => { SPECS[name].name = name; });
    window.PK32Strategy = { SPECS, startGame: function (container, spec, opts) { return mount(container, typeof spec === 'string' ? SPECS[spec] : spec, opts); } };
}());
