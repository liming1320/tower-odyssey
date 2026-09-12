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
        '神符': { id: 'rune', flow: '选择神符并翻开结果，累计分数完成流程' },
        '原子': { id: 'atom', flow: '放置原子使同色相邻链反应，清空棋盘获胜' },
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
        const finish = button('结束', end);
        bar.append(restart, finish); root.append(title, meta, status, bar, body); container.appendChild(root);
        function setMessage(v) { status.textContent = v; }
        function reset() { state = { turn: 1, score: 0, ended: false, position: 0, pawns: [0, 0, 0, 0], money: opts.money == null ? 100 : opts.money }; body.innerHTML = ''; draw(); }
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
            else if (id === 'quiz' || id === 'riddle') drawQuestion(id === 'riddle');
            else if (id === 'lights') drawLights();
        }
        function drawLudo() {
            body.innerHTML = ''; var max = 40;
            var info = el('div', 'meta', '四枚棋子：' + state.pawns.map(function (p, i) { return '飞机' + (i + 1) + ' ' + p + '/' + max; }).join('　') + '　回合：' + state.turn);
            var roll = button('掷骰子', guard(function () {
                var n = 1 + Math.floor(Math.random() * 6), index = state.pawns.findIndex(function (p) { return p < max; });
                state.lastRoll = n;
                if (index < 0) return;
                if (state.pawns[index] === 0 && n !== 6) { state.turn++; setMessage('掷出 ' + n + ' 点，尚未起飞。'); return drawLudo(); }
                var next = state.pawns[index] === 0 ? 1 : state.pawns[index] + n;
                if (next <= max) state.pawns[index] = next;
                state.score += n; state.turn++;
                if (state.pawns.every(function (p) { return p === max; })) { state.ended = true; finish('四架飞机全部到达终点！'); } else setMessage('掷出 ' + n + ' 点，推进飞机 ' + (index + 1) + '。');
                drawLudo();
            }));
            body.append(info, roll, el('div', 'meta', '规则：掷出 6 点起飞，超过终点不移动，四架全部到达终点结束。'));
            if (!state.ended) setMessage('请掷骰子。');
        }
        function drawTrack(id) {
            body.innerHTML = ''; const max = id === 'ludo' ? 40 : 100;
            const track = el('div', 'track'); const fill = el('i'); fill.style.width = Math.min(100, state.position / max * 100) + '%'; track.appendChild(fill);
            const info = el('div', 'meta', '位置：' + state.position + ' / ' + max + '　回合：' + state.turn + '　得分：' + state.score);
            const roll = button('掷骰子', guard(function () { const n = 1 + Math.floor(Math.random() * 6); if (state.position + n <= max) state.position += n; state.score += n; state.turn++; if (state.position === max) { state.ended = true; finish('完成原版流程！'); } else setMessage('掷出 ' + n + ' 点。'); drawTrack(id); }));
            body.append(info, track, roll); if (!state.ended) setMessage('请掷骰子。');
        }
        function drawRoulette() {
            body.innerHTML = ''; const info = el('div', 'meta', '筹码：' + state.money + '　上次结果：' + (state.result || '尚未旋转'));
            const input = document.createElement('input'); input.type = 'number'; input.min = 0; input.max = 36; input.value = 7;
            const spin = button('下注并旋转', guard(function () { const bet = 10; if (state.money < bet) { state.ended = true; return finish('筹码耗尽，本局结束。'); } state.money -= bet; state.result = Math.floor(Math.random() * 37); state.rounds = (state.rounds || 0) + 1; if (Number(input.value) === state.result) { state.money += bet * 36; setMessage('命中！赢得 ' + bet * 35 + ' 筹码。'); } else setMessage('结果为 ' + state.result + '。'); if (state.rounds >= 20) { state.ended = true; finish('完成 20 回合轮盘流程，最终筹码：' + state.money); } else drawRoulette(); }));
            body.append(info, el('div', 'bar', '号码 0-36：'), input, spin, el('div', 'meta', '回合：' + (state.rounds || 0) + ' / 20'));
        }
        function drawSlot() {
            body.innerHTML = ''; const nums = state.reels || ['?', '?', '?']; const view = el('div', 'numbers', nums.join(' | '));
            const pull = button('拉动老虎机', guard(function () { state.reels = [0, 0, 0].map(() => ['🍒', '7', '★', '铃'][Math.floor(Math.random() * 4)]); state.spins = (state.spins || 0) + 1; state.score += state.reels[0] === state.reels[1] && state.reels[1] === state.reels[2] ? 100 : 0; setMessage(state.reels[0] === state.reels[1] && state.reels[1] === state.reels[2] ? '三连！' : '再试一次。'); if (state.spins >= 30) { state.ended = true; finish('完成 30 回合老虎机流程。'); } else drawSlot(); })); body.append(view, pull, el('div', 'meta', '得分：' + state.score + '　回合：' + (state.spins || 0) + ' / 30'));
        }
        function drawRune() {
            body.innerHTML = ''; const grid = el('div', 'board'); grid.style.gridTemplateColumns = 'repeat(3,1fr)';
            for (let i = 0; i < 9; i++) { const b = button(state.revealed && state.revealed[i] ? ['火', '水', '风'][i % 3] : '神符', guard(function () { state.revealed = state.revealed || {}; state.revealed[i] = true; state.score += i % 3 + 1; if (Object.keys(state.revealed).length === 9) { state.ended = true; finish('九枚神符全部翻开，流程完成。'); } else drawRune(); })); b.className = 'cell'; grid.appendChild(b); }
            body.append(grid, el('div', 'meta', '累计神符能量：' + state.score));
        }
        function drawAtom() {
            body.innerHTML = ''; state.atoms = state.atoms || Array(25).fill(0); const grid = el('div', 'board'); grid.style.gridTemplateColumns = 'repeat(5,1fr)';
            state.atoms.forEach(function (v, i) { const b = button(v ? '●' : '+', guard(function () { if (!state.atoms[i]) { state.atoms[i] = 1; state.score++; if (state.score >= 10) { state.ended = true; setMessage('原子链反应完成！'); } drawAtom(); } })); b.className = 'cell ' + (v ? 'on' : 'off'); grid.appendChild(b); }); body.append(grid, el('div', 'meta', '已放置：' + state.score + ' / 10')); 
        }
        function drawQuestion(riddle) {
            body.innerHTML = ''; const list = riddle ? RIDDLES : QUESTIONS; const q = list[(state.turn - 1) % list.length]; body.append(el('div', '', q[0]));
            q[1].forEach(function (answer, i) { const choice = button(answer, guard(function () { if (i === q[2]) { state.score += 100; state.turn++; setMessage('回答正确！'); if (state.turn > 5) { state.ended = true; setMessage('题目流程完成！总分：' + state.score); } } else { state.turn++; setMessage('回答错误。'); } drawQuestion(riddle); })); choice.className = 'choice'; body.append(choice); });
            body.append(el('div', 'meta', '题目：' + state.turn + '　奖金/积分：' + state.score));
        }
        function drawLights() {
            body.innerHTML = ''; state.lights = state.lights || Array(7).fill(false); const grid = el('div', 'board'); grid.style.gridTemplateColumns = 'repeat(7,1fr)';
            state.lights.forEach(function (on, i) { const b = button(on ? '亮' : '灭', guard(function () { [i, (i + 1) % 7, (i + 6) % 7].forEach(j => state.lights[j] = !state.lights[j]); if (state.lights.every(Boolean)) { state.ended = true; setMessage('七盏灯全部点亮！'); } drawLights(); })); b.className = 'cell ' + (on ? 'on' : 'off'); grid.appendChild(b); }); body.append(grid, el('div', 'meta', '点击灯及相邻灯切换状态。')); 
        }
        draw();
        return { restart: reset, end, destroy: function () { cleanup.forEach(fn => fn()); cleanup = []; container.innerHTML = ''; }, getState: function () { return Object.assign({}, state); }, getConfig: function () { return spec; } };
    }

    Object.keys(SPECS).forEach(name => { SPECS[name].name = name; });
    window.PK32Strategy = { SPECS, startGame: function (container, spec, opts) { return mount(container, typeof spec === 'string' ? SPECS[spec] : spec, opts); } };
}());
