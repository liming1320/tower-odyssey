// PK32 变体与专有玩法。独立于 MiniGames 的关卡、星级和通用流程。
(function () {
    window.PK32Variants = window.PK32Variants || {};

    const NAMES = '锄大地|追逐|记数|转换|配对|连击|连珠牌|憋七|FF9卡片|7鬼523|读心术二|24点二|排数字|变色龙|超级99|重合|幸运数字|40点|数字魔方|同色方块变体|同步移动|摘花朵|平面魔方|激光坦克|中国象棋|围棋|象棋-暗棋|国际象棋|军棋|正方形棋|军棋-暗棋|麻将|极品飞车|六子连珠|天地棋|冒泡大战|剪刀石头布|海盗船|木乃伊|记忆考验|反应测试|海豚骰|魔力珠宝|智商测试|五连板|白手起家|跳跃棋|像素岛|捡棋子|成语填字|邻居|麻将王|麻将王二|麻将王三|过河|电磁彩球|绿洲|魅力之球|圈地|智慧之光|禅宗花园|骰子王|数谜|航海迷题|魔法城堡|弹力连珠|魔法城堡二|潜艇大战|跳棋二|拼疑犯|禅宗迷宫|马跳棋盘|花式九球|美式落袋|斯诺克|宇宙黑洞|飞一百米|打砖块|海底寻宝|碰撞彩球|彩球迷宫|反射镜|企鹅|立体魔方二|彩球连线|建筑制造|上一百层|下一百层'.split('|');

    const BOARD = new Set('中国象棋|围棋|象棋-暗棋|国际象棋|军棋|正方形棋|军棋-暗棋|六子连珠|天地棋|跳跃棋|跳棋二|圈地|五连板'.split('|'));
    const NUMBERS = new Set('记数|转换|排数字|超级99|幸运数字|40点|24点二|骰子王|数谜|智商测试|海豚骰|成语填字'.split('|'));
    const MEMORY = new Set('配对|读心术二|记忆考验|拼疑犯|邻居|摘花朵'.split('|'));
    const REACTION = new Set('追逐|连击|反应测试|剪刀石头布|冒泡大战|激光坦克|潜艇大战|宇宙黑洞|海盗船|极品飞车'.split('|'));
    const BALLS = new Set('连珠牌|同色方块变体|电磁彩球|魅力之球|弹力连珠|碰撞彩球|彩球迷宫|彩球连线|绿洲|魔力珠宝'.split('|'));
    const MAZES = new Set('过河|木乃伊|禅宗迷宫|平面魔方|数字魔方|立体魔方二|像素岛|魔法城堡|魔法城堡二|航海迷题|反射镜|企鹅|建筑制造|白手起家|智慧之光'.split('|'));
    const CARDS = new Set('锄大地|憋七|FF9卡片|7鬼523|麻将|麻将王|麻将王二|麻将王三|花式九球|美式落袋|斯诺克'.split('|'));
    const CHINESE_CHESS = new Set('中国象棋|象棋-暗棋'.split('|'));
    const GO = new Set(['围棋']);
    const CHESS = new Set(['国际象棋']);
    const MILITARY = new Set('军棋|军棋-暗棋'.split('|'));
    const MAHJONG = new Set('麻将|麻将王|麻将王二|麻将王三'.split('|'));
    const BILLIARDS = new Set('花式九球|美式落袋|斯诺克'.split('|'));
    const BUBBLE = new Set('连珠牌|同色方块变体|电磁彩球|魅力之球|弹力连珠|碰撞彩球|彩球迷宫|彩球连线|绿洲|魔力珠宝'.split('|'));
    const MUMMY = new Set(['木乃伊']);
    const ELECTROMAGNETIC = new Set(['电磁彩球']);
    const PIXEL_ISLAND = new Set(['像素岛']);
    const ZEN_GARDEN = new Set(['禅宗花园']);

    ['魔塔二', '魔塔三', '魔塔四', '????'].forEach(function (name) { if (NAMES.indexOf(name) < 0) NAMES.push(name); });

    function modeFor(name) {
        if (ELECTROMAGNETIC.has(name)) return 'electromagnetic';
        if (PIXEL_ISLAND.has(name)) return 'pixel-island';
        if (ZEN_GARDEN.has(name)) return 'zen-garden';
        if (CHINESE_CHESS.has(name)) return 'chinese-chess';
        if (GO.has(name)) return 'go';
        if (CHESS.has(name)) return 'chess';
        if (MILITARY.has(name)) return 'military';
        if (MAHJONG.has(name)) return 'mahjong';
        if (BILLIARDS.has(name)) return 'billiards';
        if (BUBBLE.has(name)) return 'bubble';
        if (MUMMY.has(name)) return 'mummy';
        if (BOARD.has(name)) return 'board';
        if (NUMBERS.has(name)) return 'number';
        if (MEMORY.has(name)) return 'memory';
        if (REACTION.has(name)) return 'reaction';
        if (BALLS.has(name)) return 'balls';
        if (MAZES.has(name)) return 'maze';
        if (CARDS.has(name)) return 'cards';
        return 'action';
    }
    const CONFIG = {};
    NAMES.forEach(function (name, index) {
        CONFIG[name] = {
            id: 'pk32-variant-' + String(index + 1).padStart(3, '0'),
            mode: modeFor(name),
            title: name + '（PK32 独立版）',
            originalFlow: 'original-only',
            levelPolicy: 'preserve-original',
            sourceIndex: index + 1,
            status: 'rules-partial'
        };
    });
    CONFIG['数谜'].levelCount = 140;
    CONFIG['数谜'].nativePayloadCount = 97;
    CONFIG['魔法城堡'].levelCount = 100;
    CONFIG['魔法城堡'].nativePayloadCount = 70;
    CONFIG['魔法城堡二'].levelCount = 40;
    CONFIG['魔法城堡二'].nativePayloadCount = 37;
    CONFIG['同步移动'].nativePayloadCount = 261;
    CONFIG['宇宙黑洞'].levelCount = 30;
    CONFIG['宇宙黑洞'].nativePayloadCount = 41;

    function el(tag, attrs, text) {
        const node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (key) { node[key] = attrs[key]; });
        if (text != null) node.textContent = text;
        return node;
    }
    function button(text, fn) {
        const b = el('button', { type: 'button', className: 'pk32v-btn' }, text);
        b.addEventListener('click', fn);
        return b;
    }
    function randomInt(n) { return Math.floor(Math.random() * n); }

    function startGame(container, name, opts) {
        opts = opts || {};
        const config = CONFIG[name];
        if (!config) throw new Error('未建立 PK32 变体玩法：' + name);
        let ended = false;
        let score = 0;
        let cleanups = [];
        container.innerHTML = '';
        container.className = (container.className || '') + ' pk32-variants-surface';
        const root = el('section', { className: 'pk32v-game' });
        const head = el('header', { className: 'pk32v-head' });
        const title = el('h2', { className: 'pk32v-title' }, config.title);
        const status = el('p', { className: 'pk32v-status' }, '原版流程：独立模式；当前迁移状态：规则接入中');
        const scoreText = el('strong', { className: 'pk32v-score' }, '得分 0');
        const body = el('div', { className: 'pk32v-body' });
        const toolbar = el('div', { className: 'pk32v-toolbar' });
        head.append(title, status, scoreText);
        toolbar.append(button('重开', function () { api.restart(); }), button('结束', function () { api.end(); }));
        root.append(head, body, toolbar);
        container.appendChild(root);

        function setScore(value) { score = value; scoreText.textContent = '得分 ' + score; }
        function finish(message) { if (ended) return; ended = true; status.textContent = message; body.querySelectorAll('button').forEach(function (b) { b.disabled = true; }); }
        function addCleanup(fn) { cleanups.push(fn); }
        function renderAction() {
            let hits = 0;
            const limit = /海盗船|潜艇大战|宇宙黑洞|极品飞车|反射镜|企鹅/.test(config.name) ? 12 : 10;
            const prompt = el('p', { className: 'pk32v-prompt' }, '完成本局目标：0 / ' + limit);
            const target = button('目标', function () {
                if (ended) return;
                hits += 1;
                setScore(score + 10);
                prompt.textContent = '完成本局目标：' + hits + ' / ' + limit;
                target.textContent = hits === limit ? '完成' : '继续';
                if (hits >= limit) finish('本局目标完成。');
            });
            body.append(prompt, target);
        }
        function renderReaction() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '等待目标出现后立即点击。');
            const target = button('等待…', function () {});
            body.append(prompt, target);
            let timer = null;
            function ready() { if (!ended) { target.dataset.ready = '1'; target.textContent = '点击！'; } }
            function schedule(delay) { if (timer) clearTimeout(timer); timer = setTimeout(ready, delay); }
            schedule(650 + randomInt(900));
            target.onclick = function () { if (target.dataset.ready === '1' && !ended) { setScore(score + 20); target.dataset.ready = '0'; target.textContent = '等待…'; schedule(500); } };
            addCleanup(function () { if (timer) clearTimeout(timer); });
        }
        function renderNumber() {
            let target = 1 + randomInt(9); const total = config.levelCount || 1; let level = 0; const prompt = el('p', { className: 'pk32v-prompt' }, (config.name === '数谜' ? '原版关卡：第 1 / ' + total + ' 关；当前已确认原生数据串 ' + config.nativePayloadCount + ' 条。' : '') + '找出目标数字：' + target); const grid = el('div', { className: 'pk32v-grid' });
            const controls = el('div', { className: 'pk32v-toolbar' });
            function update() { prompt.textContent = (config.name === '数谜' ? '原版关卡：第 ' + (level + 1) + ' / ' + total + ' 关；当前已确认原生数据串 ' + config.nativePayloadCount + ' 条。' : '') + '找出目标数字：' + target; }
            if (config.name === '数谜') {
                controls.append(button('上一关', function () { level = Math.max(0, level - 1); target = 1 + randomInt(9); update(); }), button('下一关', function () { level = Math.min(total - 1, level + 1); target = 1 + randomInt(9); update(); }), button('重置本关', function () { target = 1 + randomInt(9); update(); }));
                body.append(controls);
            }
            for (let i = 1; i <= 9; i += 1) grid.appendChild(button(String(i), function () { if (Number(this.textContent) === target) { setScore(score + 10); target = 1 + randomInt(9); update(); } }));
            body.append(prompt, grid);
        }
        function renderMemory() {
            const values = ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D'].sort(function () { return Math.random() - 0.5; }); let open = [], matched = 0; const grid = el('div', { className: 'pk32v-grid memory' });
            values.forEach(function (value) { const b = button('？', function () { if (b.disabled || open.indexOf(b) >= 0) return; b.textContent = value; open.push(b); if (open.length === 2) { if (open[0].textContent === open[1].textContent) { open.forEach(function (x) { x.disabled = true; }); matched += 2; setScore(score + 15); if (matched === values.length) finish('全部配对完成。'); } else { const pair = open.slice(); const timer = setTimeout(function () { pair.forEach(function (x) { x.textContent = '？'; }); }, 450); addCleanup(function () { clearTimeout(timer); }); } open = []; } }); grid.appendChild(b); }); body.append(grid);
        }
        function renderCards() {
            const hand = el('div', { className: 'pk32v-hand' });
            const info = el('p', { className: 'pk32v-prompt' }, '按原版单局节奏逐张处理牌面：0 / 5');
            let played = 0;
            const cards = Array.from({ length: 5 }, function (_, i) { return { suit: i % 4, rank: 2 + randomInt(12) }; });
            cards.forEach(function (card, index) {
                const text = ['黑桃', '红桃', '梅花', '方块'][card.suit] + card.rank;
                const b = button(text, function () {
                    if (ended || b.disabled) return;
                    b.disabled = true;
                    played += 1;
                    setScore(score + (config.name === '憋七' && card.rank === 7 ? 20 : 5));
                    info.textContent = '已处理 ' + played + ' / 5 张牌';
                    if (played === cards.length) finish('本局牌面处理完成。');
                });
                hand.appendChild(b);
            });
            body.append(info, hand);
        }
        function renderBalls() {
            const size = 5, colors = ['红', '黄', '蓝', '绿'], values = Array.from({ length: 25 }, function () { return colors[randomInt(colors.length)]; }); const grid = el('div', { className: 'pk32v-grid balls' });
            function group(start) { const color = values[start], found = [], seen = new Set([start]), q = [start]; while (q.length) { const i = q.shift(); if (values[i] !== color) continue; found.push(i); const x = i % size, y = Math.floor(i / size); [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (p) { if (p[0] >= 0 && p[0] < size && p[1] >= 0 && p[1] < size) { const n = p[1] * size + p[0]; if (!seen.has(n)) { seen.add(n); q.push(n); } } }); } return found; }
            values.forEach(function (value, i) { const b = button(value, function () { const hit = group(i); if (hit.length < 2) return; hit.forEach(function (n) { values[n] = ''; }); setScore(score + hit.length * 3); b.textContent = ''; if (!values.some(Boolean)) finish('彩球全部消除。'); }); grid.appendChild(b); });
            body.append(el('p', { className: 'pk32v-prompt' }, '点击相邻同色球组，至少两个相连才可消除。'), grid);
        }
        function renderMaze() {
            const size = 5; const walls = new Set([1, 3, 6, 8, 11, 13, 17, 19]); let pos = 0; const grid = el('div', { className: 'pk32v-grid maze' }); const cells = [];
            for (let i = 0; i < size * size; i += 1) { const b = button(walls.has(i) ? '■' : (i === 0 ? '●' : (i === size * size - 1 ? '★' : '')), function () {}); b.disabled = walls.has(i); cells.push(b); grid.appendChild(b); }
            function move(delta) { const next = pos + delta; if (next < 0 || next >= cells.length || walls.has(next) || (delta === 1 && next % size === 0) || (delta === -1 && pos % size === 0)) return; cells[pos].textContent = ''; pos = next; cells[pos].textContent = '●'; if (pos === cells.length - 1) { setScore(score + 50); finish('完成本局路线。'); } }
            const controls = el('div', { className: 'pk32v-controls' }); [['上', -size], ['下', size], ['左', -1], ['右', 1]].forEach(function (x) { controls.appendChild(button(x[0], function () { move(x[1]); })); });
            function key(e) { const map = { ArrowUp: -size, ArrowDown: size, ArrowLeft: -1, ArrowRight: 1 }; if (map[e.key] != null) move(map[e.key]); }
            document.addEventListener('keydown', key); addCleanup(function () { document.removeEventListener('keydown', key); }); body.append(grid, controls);
        }
        function renderNativeTangram() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载七巧板原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-tangram-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0; const select = el('select', { 'aria-label': '七巧板原生数据' });
                data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '已定位数据 ' + (index + 1))); });
                function draw() { panel.innerHTML = ''; const nav = el('div', { className: 'pk32v-toolbar' }); nav.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select); panel.appendChild(nav); const item = data.levels[level]; const width = item.cells.length === 150 ? 15 : 19; const grid = el('pre', { className: 'pk32v-native-grid' }, item.cells.match(new RegExp('.{1,' + width + '}', 'g')).join('\n')); panel.appendChild(grid); prompt.textContent = '原版声明 80 关；当前定位数据 ' + (level + 1) + ' / ' + data.levels.length + '，每关连续拼出 10 张图。几何编码解析中。'; }
                select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw();
            }).catch(function () { prompt.textContent = '七巧板原生载荷加载失败'; });
        }
        function renderNativeSyncMove() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载同步移动原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-sync-move-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0; const select = el('select', { 'aria-label': '同步移动原生数据' });
                data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '已定位数据 ' + (index + 1))); });
                function draw() { panel.innerHTML = ''; const nav = el('div', { className: 'pk32v-toolbar' }); nav.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select); panel.appendChild(nav); const item = data.levels[level]; panel.appendChild(el('pre', { className: 'pk32v-native-grid' }, item.cells)); prompt.textContent = '原版总关卡数未知；当前定位数据 ' + (level + 1) + ' / ' + data.levels.length + '。已知提示：白棋无棋可下时黑棋继续。规则解析中。'; }
                select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw();
            }).catch(function () { prompt.textContent = '同步移动原生载荷加载失败'; });
        }
        function renderNativeBlackHole() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载宇宙黑洞原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-black-hole-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0; const select = el('select', { 'aria-label': '宇宙黑洞原生数据' }); data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '已定位数据 ' + (index + 1))); });
                function draw() { panel.innerHTML = ''; const nav = el('div', { className: 'pk32v-toolbar' }); nav.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select); panel.appendChild(nav); const item = data.levels[level]; const width = item.cells.length === 676 ? 26 : item.cells.length === 168 ? 14 : item.cells.length === 36 ? 6 : item.cells.length; panel.appendChild(el('pre', { className: 'pk32v-native-grid' }, item.cells.match(new RegExp('.{1,' + width + '}', 'g')).join('\n'))); prompt.textContent = '原版 30 关；当前定位数据 ' + (level + 1) + ' / ' + data.levels.length + '。26×26 原生盘面和打捞规则解析中。'; }
                select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw();
            }).catch(function () { prompt.textContent = '宇宙黑洞原生载荷加载失败'; });
        }
        function renderNativeNextHundred() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '下一百层 · 交换彩球'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            let values = ['L', 'L', 'L', '', 'R', 'R', 'R']; let seconds = 15; let timer, nativeLevel = 0, nativeData = null, nativeSelect = null;
            cleanups.push(function () { clearInterval(timer); });
            function startTimer() { clearInterval(timer); timer = setInterval(function () { seconds -= 1; if (seconds <= 0) { seconds = 0; clearInterval(timer); } draw(); }, 1000); }
            function draw() { panel.innerHTML = ''; const line = el('div', { className: 'pk32v-toolbar' }); values.forEach(function (value, index) { const b = button(value === 'L' ? '左球' : value === 'R' ? '右球' : '空位', function () { if (!value || seconds <= 0) return; const targets = value === 'L' ? [index + 1, index + 2] : [index - 1, index - 2]; const target = targets.find(function (x) { return x >= 0 && x < values.length && values[x] === '' && (Math.abs(x - index) === 1 || values[index + (x - index) / 2]); }); if (target == null) return; values[target] = value; values[index] = ''; draw(); if (values.join('') === 'RRRLLL') finish('交换完成！'); }); b.disabled = !value || seconds <= 0; line.appendChild(b); }); panel.appendChild(line); const reset = button('重置 15 秒', function () { values = ['L', 'L', 'L', '', 'R', 'R', 'R']; seconds = 15; startTimer(); draw(); }); panel.appendChild(reset); if (nativeSelect) { nativeSelect.value = String(nativeLevel); panel.appendChild(nativeSelect); } prompt.textContent = '原版规则：左侧彩球向右、右侧彩球向左，可移动一格或越过一个彩球；剩余 ' + seconds + ' 秒。当前使用规则原型，原生 4 条盘面仍待解码。'; }
            fetch('/data/pk32-next-hundred-levels.json').then(function (response) { return response.json(); }).then(function (data) { nativeData = data; nativeSelect = el('select', { 'aria-label': '下一百层原生载荷' }); data.levels.forEach(function (item, index) { nativeSelect.appendChild(el('option', { value: String(index) }, '原生数据 ' + (index + 1))); }); nativeSelect.onchange = function () { nativeLevel = Number(nativeSelect.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '原生载荷加载失败，使用规则验证盘面。'; }); startTimer(); draw();
        }
        function renderNativePreviousHundred() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载上一百层原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-previous-hundred-levels.json').then(function (response) { return response.json(); }).then(function (data) { const item = data.levels[0]; panel.appendChild(el('pre', { className: 'pk32v-native-grid' }, item.cells.match(/.{1,12}/g).join('\n'))); prompt.textContent = '原版数据已定位 1 条；总关卡数和玩法规则仍在解析中。'; }).catch(function () { prompt.textContent = '上一百层原生载荷加载失败'; });
        }
        function renderNativeFlyHundred() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载飞一百米原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-fly-hundred-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '飞一百米原生数据' }); data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '已定位数据 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const nav = el('div', { className: 'pk32v-toolbar' }); nav.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select); panel.appendChild(nav); panel.appendChild(el('pre', { className: 'pk32v-native-grid' }, data.levels[level].cells)); prompt.textContent = '原生数据 ' + (level + 1) + ' / ' + data.levels.length + '；飞行碰撞与关卡规则解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '飞一百米原生载荷加载失败'; });
        }
        function renderNativeBreakout() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载打砖块原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-breakout-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '打砖块原生数据' }); data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '已定位数据 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const nav = el('div', { className: 'pk32v-toolbar' }); nav.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select); panel.appendChild(nav); panel.appendChild(el('pre', { className: 'pk32v-native-grid' }, data.levels[level].cells.match(/.{1,15}/g).join('\n'))); prompt.textContent = '原生数据 ' + (level + 1) + ' / ' + data.levels.length + '；挡板、小球和特殊砖块规则解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '打砖块原生载荷加载失败'; });
        }
        function renderNativeCube2() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载立体魔方二原生关卡…');
            const panel = el('div', { className: 'pk32v-native-data' });
            body.append(prompt, panel);
            fetch('/data/pk32-cube2-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0;
                const select = el('select', { 'aria-label': '立体魔方二原生关卡' });
                data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '第 ' + (index + 1) + ' 关 · ' + item.length + ' 位编码')); });
                function draw() {
                    panel.innerHTML = '';
                    const nav = el('div', { className: 'pk32v-toolbar' });
                    nav.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select);
                    panel.appendChild(nav);
                    const item = data.levels[level];
                    panel.appendChild(el('pre', { className: 'pk32v-native-grid' }, item.cells.match(/.{1,2}/g).join(' ')));
                    prompt.textContent = '原生关卡 ' + (level + 1) + ' / ' + data.levels.length + '；编码长度 ' + item.length + '，立体坐标解析中。';
                }
                select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw();
            }).catch(function () { prompt.textContent = '立体魔方二原生数据加载失败'; });
        }
        function renderNativeMirror() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载反射镜原生关卡…');
            const panel = el('div', { className: 'pk32v-native-data' });
            body.append(prompt, panel);
            fetch('/data/pk32-mirror-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                const item = data.levels[0], width = 17, cells = item.cells.split('');
                const grid = renderGrid(width, 6, 'maze');
                cells.forEach(function (_, i) { grid.appendChild(button('', function () { cells[i] = cells[i] === '0' ? '1' : cells[i] === '1' ? '2' : '0'; paint(); })); });
                function paint(path) { cells.forEach(function (value, i) { grid.children[i].textContent = path && path.indexOf(i) >= 0 ? '·' : value === '1' ? '/' : value === '2' ? '\\' : value === '3' ? '●' : value === '4' ? '★' : ''; }); }
                const controls = el('div', { className: 'pk32v-controls' }); controls.append(button('发射光线', function () { let x = 0, y = 0, dx = 1, dy = 0, path = [], hit = false; for (let step = 0; step < width * 6; step += 1) { if (x < 0 || x >= width || y < 0 || y >= 6) break; const i = y * width + x; path.push(i); if (cells[i] === '4') { hit = true; break; } if (cells[i] === '1') { const t = dx; dx = -dy; dy = -t; } else if (cells[i] === '2') { const t = dx; dx = dy; dy = t; } x += dx; y += dy; } paint(path); setScore(hit ? score + 50 : score); prompt.textContent = hit ? '光线命中目标，本关完成。' : '光线未命中目标，请调整镜面方向。'; if (hit) finish('反射成功。'); }), button('重置镜面', function () { cells.fill('0'); paint(); }));
                panel.append(grid, controls); paint(); prompt.textContent = '原版 1 关；原生载荷已加载，点击格子切换两种斜镜方向。';
            }).catch(function () { prompt.textContent = '反射镜原生数据加载失败'; });
        }
        function renderNativeSwapBalls() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载交换彩球原生盘面…');
            const panel = el('div', { className: 'pk32v-native-data' });
            body.append(prompt, panel);
            fetch('/data/pk32-swap-balls-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                const raw = data.levels[0].cells, width = 16, values = raw.match(/.{1,16}/g).map(function (row) { return row.split(''); });
                const grid = renderGrid(width, values.length, 'bubble-board');
                let selected = null;
                function groups() { const found = []; function same(a, b) { return a && b && (a === b || a === '4' || b === '4'); } for (let y = 0; y < values.length; y += 1) for (let x = 0; x < width - 2; x += 1) if (same(values[y][x], values[y][x + 1]) && same(values[y][x + 1], values[y][x + 2])) found.push([[x, y], [x + 1, y], [x + 2, y]]); for (let y = 0; y < values.length - 2; y += 1) for (let x = 0; x < width; x += 1) if (same(values[y][x], values[y + 1][x]) && same(values[y + 1][x], values[y + 2][x])) found.push([[x, y], [x, y + 1], [x, y + 2]]); return found; }
                function draw() { grid.innerHTML = ''; values.forEach(function (row, y) { row.forEach(function (value, x) { const b = button(value === '0' ? '' : value, function () { if (!value) return; if (!selected) { selected = [x, y]; b.dataset.selected = 'true'; return; } if (Math.abs(selected[0] - x) + Math.abs(selected[1] - y) !== 1) { selected = [x, y]; draw(); return; } const other = values[selected[1]][selected[0]]; values[selected[1]][selected[0]] = value; values[y][x] = other; selected = null; let removed = 0, chain = 0, matched; do { matched = groups(); matched.forEach(function (group) { group.forEach(function (p) { if (values[p[1]][p[0]] !== '0') { values[p[1]][p[0]] = '0'; removed += 1; } }); }); if (matched.length) { chain += 1; for (let cx = 0; cx < width; cx += 1) { const kept = values.map(function (r) { return r[cx]; }).filter(function (v) { return v !== '0'; }); for (let cy = values.length - 1; cy >= 0; cy -= 1) values[cy][cx] = kept.pop() || '0'; } } } while (matched.length); if (removed) setScore(score + removed * 3 + Math.max(0, chain - 1) * 5); draw(); }); if (selected && selected[0] === x && selected[1] === y) b.dataset.selected = 'true'; grid.appendChild(b); }); }); prompt.textContent = '原版盘面：相邻交换，三连消除并自动连锁下落；当前得分 ' + score + '。'; }
                draw(); panel.appendChild(grid);
            }).catch(function () { prompt.textContent = '交换彩球原生数据加载失败'; });
        }
        function renderBuilding() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '建筑制造：引爆炸弹、激活传感器并到达出口。');
            const panel = el('div', { className: 'pk32v-native-data' });
            let width = 6, height = 6;
            let level = 0;
            let levels = [
                ['P..B..', '.##...', '..S...', '...#..', '..B.S.', '.....E'],
                ['P.#B..', '...#..', '.S....', '.###..', '..B.S.', '.....E'],
                ['P...B.', '.###..', '..S...', '..#...', 'B...S.', '.....E']
            ];
            function draw() {
                panel.innerHTML = '';
                width = levels[level][0].length;
                height = levels[level].length;
                const nav = el('div', { className: 'pk32v-toolbar' });
                nav.append(button('上一关', function () { level = Math.max(0, level - 1); draw(); }), button('下一关', function () { level = Math.min(levels.length - 1, level + 1); draw(); }));
                panel.appendChild(nav);
                const cells = levels[level].map(function (row) { return row.split(''); }).flat();
                let pos = cells.indexOf('P'), bombs = cells.filter(function (x) { return x === 'B'; }).length, sensors = cells.filter(function (x) { return x === 'S'; }).length;
                const grid = renderGrid(width, height, 'maze');
                function paint() { cells.forEach(function (value, i) { grid.children[i].textContent = i === pos ? '●' : value === '#' ? '■' : value === 'B' ? '💣' : value === 'S' ? '◎' : value === 'E' ? '出口' : ''; }); }
                function move(delta) {
                    const next = pos + delta;
                    if (next < 0 || next >= cells.length || (delta === 1 && next % width === 0) || (delta === -1 && pos % width === 0) || cells[next] === '#') return;
                    if (cells[next] === 'B') { cells[next] = '.'; bombs -= 1; }
                    if (cells[next] === 'S') { cells[next] = '.'; sensors -= 1; }
                    pos = next; paint();
                    if (cells[pos] === 'E' && bombs === 0 && sensors === 0) { setScore(score + 50); finish('本关完成：炸弹和传感器全部处理。'); }
                    else prompt.textContent = '第 ' + (level + 1) + ' 关：炸弹 ' + bombs + '，传感器 ' + sensors + '；出口需要全部目标完成。';
                }
                cells.forEach(function (_, i) { grid.appendChild(button('', function () { if (i === pos - width) move(-width); else if (i === pos + width) move(width); else if (i === pos - 1) move(-1); else if (i === pos + 1) move(1); })); });
                paint();
                const controls = el('div', { className: 'pk32v-controls' }); [['上', -width], ['下', width], ['左', -1], ['右', 1]].forEach(function (item) { controls.appendChild(button(item[0], function () { move(item[1]); })); });
                panel.append(grid, controls); prompt.textContent = '原版 53 条盘面载荷已定位；当前展示规则验证盘面 ' + (level + 1) + ' / ' + levels.length + '。';
            }
            body.append(prompt, panel); draw();
            fetch('/data/pk32-building-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                levels = data.levels.map(function (item) {
                    const width = item.width || Math.round(Math.sqrt(item.cells.length));
                    return item.cells.match(new RegExp('.{1,' + width + '}', 'g')).map(function (row) { return row.replace(/0/g, '.').replace(/1/g, '#').replace(/2/g, 'B').replace(/3/g, 'S').replace(/4/g, 'E').replace(/5/g, '.').replace(/6/g, '.').replace(/7/g, '.').replace(/9/g, '.'); });
                }).filter(function (rows) { return rows.length && rows.every(function (row) { return row.length === rows[0].length; }); });
                if (levels.length) { level = 0; draw(); prompt.textContent = '原版 53 条盘面已加载；当前原生盘面 ' + (level + 1) + ' / ' + levels.length + '。'; }
            }).catch(function () { prompt.textContent = '原版盘面加载失败，当前显示规则验证盘面。'; });
        }
        function renderBoard() {
            const size = config.name === '六子连珠' ? 8 : 6;
            const need = config.name === '五连板' ? 5 : (config.name === '六子连珠' ? 6 : 4);
            let turn = 0; const cells = Array(size * size).fill(''); const grid = renderGrid(size, size, 'board');
            function hasLine(player) {
                for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) for (const pair of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
                    let count = 0;
                    for (let n = 0; n < need; n += 1) { const rr = r + pair[0] * n, cc = c + pair[1] * n; if (rr < 0 || rr >= size || cc < 0 || cc >= size || cells[rr * size + cc] !== player) break; count += 1; }
                    if (count === need) return true;
                }
                return false;
            }
            cells.forEach(function (_, i) { const b = button('', function () { if (ended || cells[i]) return; const player = turn % 2 ? '○' : '●'; cells[i] = player; b.textContent = player; turn += 1; setScore(score + 1); if (hasLine(player)) finish(player + '方连成' + need + '子。'); else if (turn === cells.length) finish('棋盘填满，本局和棋。'); }); grid.appendChild(b); });
            body.append(el('p', { className: 'pk32v-prompt' }, '轮流落子；' + need + '子横、竖或斜线相连即胜。'), grid);
        }
        function renderGrid(width, height, className) {
            const grid = el('div', { className: 'pk32v-grid ' + (className || '') });
            grid.style.gridTemplateColumns = 'repeat(' + width + ', minmax(28px, 1fr))';
            grid.style.maxWidth = Math.min(560, width * 54) + 'px';
            return grid;
        }
        function renderChineseChess() {
            const width = 9; const height = 10; const pieces = {};
            const back = ['车', '马', '象', '士', '将', '士', '象', '马', '车'];
            back.forEach(function (p, x) { pieces[x] = { text: '黑' + p, side: 'black' }; pieces[(height - 1) * width + x] = { text: '红' + p, side: 'red' }; });
            [1, 7].forEach(function (x) { pieces[width + x] = { text: '黑炮', side: 'black' }; pieces[(height - 2) * width + x] = { text: '红炮', side: 'red' }; });
            [0, 2, 4, 6, 8].forEach(function (x) { pieces[2 * width + x] = { text: '黑卒', side: 'black' }; pieces[7 * width + x] = { text: '红兵', side: 'red' }; });
            let side = 'red'; let selected = -1; const grid = renderGrid(width, height, 'chinese-chess');
            function pos(i) { return { x: i % width, y: Math.floor(i / width) }; }
            function between(a, b) { const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y); let x = a.x + dx, y = a.y + dy, n = 0; while (x !== b.x || y !== b.y) { if (pieces[y * width + x]) n++; x += dx; y += dy; } return n; }
            function palace(p, x, y) { return x >= 3 && x <= 5 && (p.side === 'red' ? y >= 7 : y <= 2); }
            function legal(from, to, p, target) {
                const a = pos(from), b = pos(to), dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
                if (target && target.side === p.side) return false;
                if (p.text.indexOf('车') >= 0) return (dx === 0 || dy === 0) && between(a, b) === 0;
                if (p.text.indexOf('炮') >= 0) return (dx === 0 || dy === 0) && between(a, b) === (target ? 1 : 0);
                if (p.text.indexOf('马') >= 0) { if (!((dx === 1 && dy === 2) || (dx === 2 && dy === 1))) return false; const leg = dx === 2 ? { x: (a.x + b.x) / 2, y: a.y } : { x: a.x, y: (a.y + b.y) / 2 }; return !pieces[leg.y * width + leg.x]; }
                if (p.text.indexOf('象') >= 0) return dx === 2 && dy === 2 && (p.side === 'red' ? b.y >= 5 : b.y <= 4) && !pieces[((a.y + b.y) / 2) * width + ((a.x + b.x) / 2)];
                if (p.text.indexOf('士') >= 0) return dx === 1 && dy === 1 && palace(p, b.x, b.y);
                if (p.text.indexOf('将') >= 0) return dx + dy === 1 && palace(p, b.x, b.y);
                const crossed = p.side === 'red' ? a.y <= 4 : a.y >= 5;
                return dx + dy === 1 && (b.y - a.y === (p.side === 'red' ? -1 : 1) || (crossed && dx === 1));
            }
            function draw() { grid.innerHTML = ''; for (let i = 0; i < width * height; i += 1) { const p = pieces[i]; const b = button(p ? p.text : '·', function () { if (selected < 0 && p && p.side === side) { selected = i; draw(); return; } if (selected >= 0 && i !== selected) { const old = pieces[selected]; if (p && p.side === side) { selected = i; draw(); return; } if (!legal(selected, i, old, p)) { status.textContent = '该棋子不能这样走'; return; } pieces[i] = old; delete pieces[selected]; selected = -1; if (p && p.text.indexOf('将') >= 0) return finish((side === 'red' ? '红方' : '黑方') + '获胜'); side = side === 'red' ? 'black' : 'red'; setScore(score + (p ? 2 : 1)); status.textContent = '轮到' + (side === 'red' ? '红方' : '黑方'); draw(); } }); if (selected === i) b.classList.add('selected'); if (p && p.side !== side) b.classList.add('opponent'); grid.appendChild(b); } }
            body.append(el('p', { className: 'pk32v-prompt' }, '九路十线棋盘；点击己方棋子，再点击目标格完成回合。'), grid); draw();
        }
        function renderGo() {
            const size = 9; const cells = Array(size * size).fill(0); let turn = 1, passes = 0; const history = new Set([cells.join('')]); const grid = renderGrid(size, size, 'go-board');
            function neighbors(i) { const x = i % size, y = Math.floor(i / size), out = []; if (x) out.push(i - 1); if (x < size - 1) out.push(i + 1); if (y) out.push(i - size); if (y < size - 1) out.push(i + size); return out; }
            function group(start, board) { const color = board[start], seen = new Set([start]), stones = [], liberties = new Set(), queue = [start]; while (queue.length) { const i = queue.shift(); stones.push(i); neighbors(i).forEach(function (n) { if (!board[n]) liberties.add(n); else if (board[n] === color && !seen.has(n)) { seen.add(n); queue.push(n); } }); } return { stones: stones, liberties: liberties }; }
            function draw() { grid.innerHTML = ''; cells.forEach(function (v, i) { const b = button(v === 1 ? '●' : v === 2 ? '○' : '·', function () { if (v || ended) return; const copy = cells.slice(); copy[i] = turn; neighbors(i).filter(function (n) { return copy[n] === 3 - turn; }).forEach(function (n) { const g = group(n, copy); if (!g.liberties.size) g.stones.forEach(function (x) { copy[x] = 0; }); }); const own = group(i, copy); if (!own.liberties.size) return status.textContent = '禁着：不能自杀'; const position = copy.join(''); if (history.has(position)) return status.textContent = '禁着：劫争局面不能立即重复'; cells.splice(0, cells.length); copy.forEach(function (x) { cells.push(x); }); history.add(position); passes = 0; turn = 3 - turn; setScore(score + 1); status.textContent = '围棋九路棋盘，轮到' + (turn === 1 ? '黑' : '白') + '方'; draw(); }); grid.appendChild(b); }); }
            const pass = button('停着', function () { if (ended) return; passes++; turn = 3 - turn; if (passes >= 2) { const black = cells.filter(function (x) { return x === 1; }).length; const white = cells.filter(function (x) { return x === 2; }).length; setScore(Math.max(0, black - white)); return finish('双方连续停着，本局结束；黑 ' + black + ' 子，白 ' + white + ' 子。'); } status.textContent = '停着后轮到' + (turn === 1 ? '黑' : '白') + '方'; });
            body.append(el('p', { className: 'pk32v-prompt' }, '九路围棋：轮流落子，提掉无气棋块；不能自杀，双方连续停着结束。'), grid, pass); draw();
        }
        function renderChess() {
            const files = ['车', '马', '象', '后', '王', '象', '马', '车']; const grid = renderGrid(8, 8, 'chess-board'); let turn = '白'; let selected = -1; const pieces = Array(64).fill(null);
            function setup(side, row, pawnRow) { files.forEach(function (type, x) { pieces[row * 8 + x] = { side: side, type: type }; pieces[pawnRow * 8 + x] = { side: side, type: '兵' }; }); }
            setup('黑', 0, 1); setup('白', 7, 6);
            function pos(i) { return { x: i % 8, y: Math.floor(i / 8) }; }
            function clearPath(a, b) { const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y); let x = a.x + dx, y = a.y + dy; while (x !== b.x || y !== b.y) { if (pieces[y * 8 + x]) return false; x += dx; y += dy; } return true; }
            function legal(from, to) { const p = pieces[from], target = pieces[to]; if (!p || (target && target.side === p.side)) return false; const a = pos(from), b = pos(to), dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y); if (p.type === '马') return (dx === 1 && dy === 2 || dx === 2 && dy === 1) && !pieces[(a.y + (dy === 2 ? Math.sign(b.y - a.y) : 0)) * 8 + a.x + (dx === 2 ? Math.sign(b.x - a.x) : 0)]; if (p.type === '车') return (dx === 0 || dy === 0) && clearPath(a, b); if (p.type === '象') return dx === dy && clearPath(a, b); if (p.type === '后') return (dx === 0 || dy === 0 || dx === dy) && clearPath(a, b); if (p.type === '王') return dx <= 1 && dy <= 1 && (dx + dy > 0); const direction = p.side === '白' ? -1 : 1, step = b.y - a.y; if (dx === 0 && !target && step === direction) return true; if (dx === 0 && !target && step === direction * 2 && a.y === (p.side === '白' ? 6 : 1)) return !pieces[(a.y + direction) * 8 + a.x]; return dx === 1 && step === direction && !!target; }
            function draw() { grid.innerHTML = ''; pieces.forEach(function (p, i) { const b = button(p ? p.side + p.type : '·', function () { if (selected < 0) { if (p && p.side === turn) selected = i; } else if (i !== selected) { if (p && p.side === turn) selected = i; else if (legal(selected, i)) { const captured = pieces[i]; pieces[i] = pieces[selected]; pieces[selected] = null; selected = -1; setScore(score + 1); if (captured && captured.type === '王') return finish(turn + '方吃掉王，获得胜利。'); turn = turn === '白' ? '黑' : '白'; status.textContent = '轮到' + turn + '方'; } } draw(); }); if (selected === i) b.classList.add('selected'); grid.appendChild(b); }); }
            body.append(el('p', { className: 'pk32v-prompt' }, '标准八乘八初始布局；按车、马、象、后、王和兵的走法移动，路径有阻挡时不能通过。'), grid); draw();
        }
        function renderMilitary() {
            const size = 6; const grid = renderGrid(size, size, 'military-board'); let turn = 0; let selected = -1; const pieces = Array(36).fill(null); const ranks = [0, 9, 8, 7, 6, 5, 4, 3, 2, 1, 2, 1];
            for (let i = 0; i < 12; i += 1) { pieces[i] = { side: '蓝', rank: ranks[i], face: false }; pieces[24 + i] = { side: '红', rank: ranks[i], face: false }; }
            function text(p) { return !p ? '·' : p.face ? (p.rank === 0 ? '军旗' : p.rank + '') : '？'; }
            function currentSide() { return turn ? '蓝' : '红'; }
            function draw() { grid.innerHTML = ''; pieces.forEach(function (p, i) { const b = button(text(p), function () { if (ended) return; const own = selected >= 0 ? pieces[selected] : null; if (!p) { if (!own || own.side !== currentSide()) return; const dx = Math.abs(i % size - selected % size), dy = Math.abs(Math.floor(i / size) - Math.floor(selected / size)); if (dx + dy !== 1) { selected = -1; draw(); return; } pieces[i] = own; pieces[selected] = null; selected = -1; turn = 1 - turn; setScore(score + 1); status.textContent = '轮到' + currentSide() + '方'; draw(); return; } if (!p.face) { p.face = true; selected = -1; turn = 1 - turn; status.textContent = '翻开了' + p.side + '方棋子；轮到' + currentSide() + '方'; draw(); return; } if (selected < 0) { if (p.side === currentSide()) selected = i; draw(); return; } if (!own || own.side !== currentSide()) { selected = p.side === currentSide() ? i : -1; draw(); return; } if (p.side === own.side) { selected = i; draw(); return; } const dx = Math.abs(i % size - selected % size), dy = Math.abs(Math.floor(i / size) - Math.floor(selected / size)); if (dx + dy !== 1) { selected = -1; draw(); return; } const wins = own.rank !== 0 && (p.rank === 0 || own.rank >= p.rank); if (wins) pieces[i] = own; pieces[selected] = wins ? null : (own.rank === p.rank ? null : p); selected = -1; if (p.rank === 0 && wins) return finish(own.side + '方夺取军旗，获得胜利。'); turn = 1 - turn; setScore(score + 1); status.textContent = '轮到' + currentSide() + '方'; draw(); }); if (selected === i) b.classList.add('selected'); grid.appendChild(b); }); }
            body.append(el('p', { className: 'pk32v-prompt' }, '双方棋子初始隐藏；先翻牌再移动，按棋力比较吃子，夺取对方军旗获胜。'), grid); draw();
        }
        function renderMahjong() {
            const labels = ['一万', '二万', '三万', '四万', '五万', '六万', '七万', '八万', '九万', '一条', '二条', '三条', '四条', '五条', '六条', '七条', '八条', '九条', '一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒', '东', '南', '西', '北', '中', '发', '白'];
            const deck = []; labels.forEach(function (_, i) { for (let n = 0; n < 4; n += 1) deck.push(i); }); deck.sort(function () { return Math.random() - 0.5; });
            let hand = deck.splice(0, 13); const handEl = el('div', { className: 'pk32v-hand' }); const info = el('p', { className: 'pk32v-prompt' }, '起手十三张；摸一张后打出一张，组成四组面子和一对将即可和牌。'); const drawBtn = button('摸牌', function () { if (hand.length !== 13 || !deck.length || ended) return; hand.push(deck.pop()); setScore(score + 1); draw(); if (isWinning(hand)) finish('胡牌，完成本局麻将。'); });
            const winBtn = button('检查胡牌', function () { if (hand.length === 14) finish(isWinning(hand) ? '胡牌，完成本局麻将。' : '当前牌型未满足基本和牌条件。'); });
            function isWinning(values) { if (values.length !== 14) return false; const counts = Array(34).fill(0); values.forEach(function (v) { counts[v] += 1; }); function melds(left) { let first = -1; for (let i = 0; i < 34; i += 1) if (left[i]) { first = i; break; } if (first < 0) return true; if (left[first] >= 3) { left[first] -= 3; if (melds(left)) return true; left[first] += 3; } if (first < 27 && first % 9 <= 6 && left[first + 1] && left[first + 2]) { left[first] -= 1; left[first + 1] -= 1; left[first + 2] -= 1; if (melds(left)) return true; left[first] += 1; left[first + 1] += 1; left[first + 2] += 1; } return false; } for (let pair = 0; pair < 34; pair += 1) if (counts[pair] >= 2) { counts[pair] -= 2; if (melds(counts)) return true; counts[pair] += 2; } return false; }
            function draw() { handEl.innerHTML = ''; hand.forEach(function (tile, i) { handEl.appendChild(button(labels[tile], function () { if (hand.length !== 14 || ended) return; hand.splice(i, 1); info.textContent = '已打出' + labels[tile] + '；手牌 ' + hand.length + '/14；请继续摸牌'; draw(); })); }); info.textContent = '牌堆剩余 ' + deck.length + ' 张；当前手牌 ' + hand.length + '/14'; }
            body.append(info, drawBtn, winBtn, handEl); draw();
        }
        function renderBilliards() {
            const grid = renderGrid(6, 4, 'billiards-table'); let balls = 9; const targetButtons = []; const cue = button('击球', function () { if (!balls || ended) return; balls -= 1; targetButtons.forEach(function (b, i) { b.textContent = i < balls ? '●' : '○'; }); setScore(score + 10); status.textContent = config.title + '：剩余目标球 ' + balls; if (!balls) finish('清台完成，本局结束。'); });
            body.append(el('p', { className: 'pk32v-prompt' }, '独立台球流程：选择击球并逐个清台；不同名称保留不同目标球数。'), grid, cue);
            for (let i = 0; i < 24; i += 1) { const target = button(i < balls ? '●' : '○', function () {}); targetButtons.push(target); grid.appendChild(target); }
        }
        function renderBubble() {
            const size = 8; const colors = ['红', '黄', '蓝', '绿', '紫']; const grid = renderGrid(size, size, 'bubble-board'); const prompt = el('p', { className: 'pk32v-prompt' }, config.name === '魔法城堡' ? '原版关卡：第 1 / ' + config.levelCount + ' 关；已定位原生数据串 ' + config.nativePayloadCount + ' 条。规则还原中。' : '彩球连锁流程：点击相邻同色球组，至少两个相连才可消除。'); const values = Array.from({ length: size * size }, function () { return colors[randomInt(colors.length)]; });
            function neighbors(i) { const x = i % size, y = Math.floor(i / size); return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(function (p) { return p[0] >= 0 && p[0] < size && p[1] >= 0 && p[1] < size; }).map(function (p) { return p[1] * size + p[0]; }); }
            function group(start) { const color = values[start], found = [], seen = new Set([start]), queue = [start]; while (queue.length) { const i = queue.shift(); if (values[i] !== color) continue; found.push(i); neighbors(i).forEach(function (n) { if (values[n] === color && !seen.has(n)) { seen.add(n); queue.push(n); } }); } return found; }
            function collapse() { for (let x = 0; x < size; x += 1) { const column = []; for (let y = size - 1; y >= 0; y -= 1) if (values[y * size + x]) column.push(values[y * size + x]); for (let y = size - 1; y >= 0; y -= 1) values[y * size + x] = column[size - 1 - y] || ''; } }
            function hasMoves() { return values.some(function (v, i) { return v && neighbors(i).some(function (n) { return values[n] === v; }); }); }
            function draw() { grid.innerHTML = ''; values.forEach(function (value, i) { const b = button(value || '·', function () { if (!value || ended) return; const hit = group(i); if (hit.length < 2) return; hit.forEach(function (n) { values[n] = ''; }); collapse(); setScore(score + hit.length * 3); draw(); if (!values.some(Boolean)) return finish('彩球全部消除，本局结束。'); if (!hasMoves()) finish('没有可消除的相邻球组，本局结束。'); }); b.disabled = !value; grid.appendChild(b); }); prompt.textContent = '当前得分 ' + score + '；点击相邻同色球组消除'; }
            body.append(prompt, grid); if (config.name === '魔法城堡二') prompt.textContent = '原版关卡：第 1 / 40 关；已定位原生地图数据 37 条。蓝色方块创建规则、红色不可消除方块和传送门规则还原中。'; draw();
        }
        function renderNativeCastle2() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载魔法城堡二原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-castle2-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '魔法城堡二原生关卡' }); data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '原生数据 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level]; const width = item.cells.length === 192 ? 16 : item.cells.length === 36 ? 6 : item.cells.length; panel.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, el('pre', { className: 'pk32v-native-grid' }, item.cells.match(new RegExp('.{1,' + width + '}', 'g')).join('\n'))); prompt.textContent = '原版 40 关；当前原生盘面 ' + (level + 1) + ' / ' + data.levels.length + '，规则解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '魔法城堡二原生数据加载失败'; });
        }
        function renderNativeCastle() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载魔法城堡原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-castle-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '魔法城堡原生关卡' }); data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '原生数据 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level], width = item.cells.length === 192 ? 16 : item.cells.length === 36 ? 6 : item.cells.length; panel.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, el('pre', { className: 'pk32v-native-grid' }, item.cells.match(new RegExp('.{1,' + width + '}', 'g')).join('\n'))); prompt.textContent = '原版 100 关；当前原生数据 ' + (level + 1) + ' / ' + data.levels.length + '，规则解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '魔法城堡原生数据加载失败'; });
        }
        function renderNativeLight() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载智慧之光原生数据…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-light-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '智慧之光原生数据' }); data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '原生数据 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level], width = item.cells.length === 192 ? 16 : item.cells.length === 36 ? 6 : item.cells.length; panel.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, el('pre', { className: 'pk32v-native-grid' }, item.cells.match(new RegExp('.{1,' + width + '}', 'g')).join('\n'))); prompt.textContent = '智慧之光：原生数据 ' + (level + 1) + ' / ' + data.levels.length + '，灯光规则解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '智慧之光原生数据加载失败'; });
        }
        function renderNativeBurst() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载爆破彩球原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-burst-balls-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '爆破彩球原生关卡' }); data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const raw = data.levels[level].cells, width = 12, rows = raw.match(/.{1,12}/g), grid = renderGrid(width, rows.length, 'bubble-board'); rows.join('').split('').forEach(function (value, index) { grid.appendChild(button(value === '0' ? '·' : value, function () { if (value !== '0') { this.disabled = true; this.textContent = '·'; setScore(score + 3); } })); }); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, grid); prompt.textContent = '原版关卡数未知；原生数据 ' + (level + 1) + ' / ' + data.levels.length + '，相邻两个以上同色彩球可消除。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '爆破彩球原生数据加载失败'; });
        }
        function renderNativeTank() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载坦克大战原生盘面…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-tank-battle-levels.json').then(function (response) { return response.json(); }).then(function (data) { const width = 15, height = 10, cells = data.levels[0].cells.split(''), grid = renderGrid(width, height, 'maze'); let pos = width * (height - 1) + 1; cells.forEach(function (value, index) { grid.appendChild(button(index === pos ? '坦' : value === '0' ? '·' : '■', function () { if (Math.abs(index - pos) === 1 || Math.abs(index - pos) === width) { pos = index; draw(); } })); }); function draw() { cells.forEach(function (value, index) { grid.children[index].textContent = index === pos ? '坦' : value === '0' ? '·' : '■'; }); } const controls = el('div', { className: 'pk32v-controls' }); [['上', -width], ['下', width], ['左', -1], ['右', 1]].forEach(function (item) { controls.appendChild(button(item[0], function () { const next = pos + item[1]; if (next >= 0 && next < cells.length && (item[1] === width || item[1] === -width || Math.floor(next / width) === Math.floor(pos / width))) { pos = next; draw(); } })); }); panel.append(grid, controls); prompt.textContent = '原版盘面：15×10；坦克移动交互已接入，射击和敌方 AI 规则解析中。'; }).catch(function () { prompt.textContent = '坦克大战原生数据加载失败'; });
        }
        function renderNativeSeaTreasure() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载海底寻宝原生盘面…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-sea-treasure-levels.json').then(function (response) { return response.json(); }).then(function (data) { const width = 15, height = 10, cells = data.levels[0].cells.split(''), grid = renderGrid(width, height, 'maze'); let left = width * (height - 1) + 1, right = width * (height - 1) + width - 2; function draw() { grid.innerHTML = ''; cells.forEach(function (value, index) { grid.appendChild(button(index === left ? '左坦' : index === right ? '右坦' : value === '2' ? '·' : '■', function () {})); }); } function move(which, delta) { let p = which === 'left' ? left : right, next = p + delta; if (next < 0 || next >= cells.length || (delta === 1 || delta === -1) && Math.floor(next / width) !== Math.floor(p / width) || cells[next] === '2') return; if (which === 'left') left = next; else right = next; draw(); } const controls = el('div', { className: 'pk32v-controls' }); [['左坦上', 'left', -width], ['左坦下', 'left', width], ['左坦左', 'left', -1], ['左坦右', 'left', 1], ['右坦上', 'right', -width], ['右坦下', 'right', width], ['右坦左', 'right', -1], ['右坦右', 'right', 1]].forEach(function (item) { controls.appendChild(button(item[0], function () { move(item[1], item[2]); })); }); panel.append(grid, controls); prompt.textContent = '原版控制：左坦克 ASDW/J，右坦克方向键/小键盘 0；当前已加载原生 15×10 盘面，炮击规则解析中。'; draw(); }).catch(function () { prompt.textContent = '海底寻宝原生数据加载失败'; });
        }
        function renderNativeLamps() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载七盏灯原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-seven-lamps-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0, chances = 7; const select = el('select', { 'aria-label': '七盏灯原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const raw = data.levels[level].cells, width = 10, cells = raw.slice(-100).split(''), grid = renderGrid(width, 10, 'bubble-board'); cells.forEach(function (value, index) { const b = button(value === '0' ? '·' : '灯', function () { if (!chances) return; chances -= 1; [index, index - 1, index + 1, index - width, index + width].forEach(function (target) { if (target >= 0 && target < cells.length && (target === index || target === index - width || target === index + width || Math.floor(target / width) === Math.floor(index / width))) cells[target] = cells[target] === '0' ? '4' : '0'; }); if (!cells.some(function (v) { return v !== '0'; })) finish('七盏灯全部点亮。'); draw(); }); b.disabled = !chances; grid.appendChild(b); }); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); chances = 7; draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); chances = 7; draw(); }), select, grid); prompt.textContent = '原生数据 ' + (level + 1) + ' / ' + data.levels.length + '；剩余操作 ' + chances + ' 次，点击会切换自身及上下左右相邻灯。'; } select.onchange = function () { level = Number(select.value) || 0; chances = 7; draw(); }; draw(); }).catch(function () { prompt.textContent = '七盏灯原生数据加载失败'; });
        }
        function renderNativeSokoban5() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载推箱子五原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-sokoban5-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; function draw() { panel.innerHTML = ''; const raw = data.levels[level].cells.split(''), width = 6, height = 6, player = raw.indexOf('1'), boxes = raw.map(function (v, i) { return v === '3' ? i : -1; }).filter(function (i) { return i >= 0; }), goals = raw.map(function (v, i) { return v === '4' || v === '5' ? i : -1; }).filter(function (i) { return i >= 0; }), grid = renderGrid(width, height, 'maze'); function paint() { raw.forEach(function (v, i) { grid.children[i].textContent = i === player ? '人' : boxes.indexOf(i) >= 0 ? '箱' : goals.indexOf(i) >= 0 ? '◎' : v === '0' ? '·' : '墙'; }); } function move(delta) { const next = player + delta, beyond = next + delta; if (next < 0 || next >= raw.length || raw[next] === '0') return; if (boxes.indexOf(next) >= 0) { if (beyond < 0 || beyond >= raw.length || raw[beyond] === '0' || boxes.indexOf(beyond) >= 0) return; boxes[boxes.indexOf(next)] = beyond; } if (next >= 0) { raw[player] = '2'; player = next; raw[player] = '1'; paint(); if (boxes.every(function (i) { return goals.indexOf(i) >= 0; })) finish('推箱子五第 ' + (level + 1) + ' 关完成。'); } } raw.forEach(function (_, i) { grid.appendChild(button('', function () { const d = i - player; if (d === 1 || d === -1 || d === width || d === -width) move(d); })); }); paint(); const controls = el('div', { className: 'pk32v-controls' }); [['上', -width], ['下', width], ['左', -1], ['右', 1]].forEach(function (item) { controls.appendChild(button(item[0], function () { move(item[1]); })); }); const select = el('select', { 'aria-label': '推箱子五关卡' }); data.levels.forEach(function (_, i) { select.appendChild(el('option', { value: String(i) }, '第 ' + (i + 1) + ' 关')); }); select.value = String(level); select.onchange = function () { level = Number(select.value) || 0; draw(); }; panel.append(button('上一关', function () { level = Math.max(0, level - 1); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); draw(); }), select, grid, controls); prompt.textContent = '原生关卡 ' + (level + 1) + ' / ' + data.levels.length + '；推动所有箱子到目标点。'; } draw(); }).catch(function () { prompt.textContent = '推箱子五原生数据加载失败'; });
        }
        function renderNativeSokoban4() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载推箱子四原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-sokoban4-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '推箱子四原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level], grid = el('pre', { className: 'pk32v-native-grid' }, item.cells.match(new RegExp('.{1,' + item.width + '}', 'g')).join('\n')); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, grid); prompt.textContent = '原版声明 23 关；已提取原生关卡 ' + (level + 1) + ' / ' + data.levels.length + '（' + item.width + '×' + item.height + '），箱子编码解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '推箱子四原生数据加载失败'; });
        }
        function renderNativeZenMaze() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载禅宗迷宫原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-zen-maze-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0, points = 100; const select = el('select', { 'aria-label': '禅宗迷宫原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生数据 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level]; panel.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, button('跳跃（-20）', function () { if (points >= data.jumpCost) { points -= data.jumpCost; setScore(score + 5); draw(); } }), el('pre', { className: 'pk32v-native-grid' }, item.cells.match(/.{1,24}/g).join('\n'))); prompt.textContent = '原版 24 关；当前原生数据 ' + (level + 1) + ' / ' + data.levels.length + '；跳跃消耗 ' + data.jumpCost + ' 点，剩余 ' + points + ' 点。'; } select.onchange = function () { level = Number(select.value) || 0; points = 100; draw(); }; draw(); }).catch(function () { prompt.textContent = '禅宗迷宫原生数据加载失败'; });
        }
        function renderNativeGenhua2() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载跟花二原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-genhua2-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '跟花二原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level]; panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, el('pre', { className: 'pk32v-native-grid' }, item.cells.match(/.{1,6}/g).join('\n'))); prompt.textContent = '跟花二原生关卡 ' + (level + 1) + ' / ' + data.levels.length + '；6×6 牌面编码，规则解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '跟花二原生数据加载失败'; });
        }
        function renderNativeWires2() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载连结电线二原生盘面…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-connect-wires2-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '连结电线二原生盘面' }); data.confirmedLevels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生盘面 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const raw = data.confirmedLevels[level], width = raw.length === 36 ? 6 : 10, cells = raw.split(''); const grid = renderGrid(width, Math.ceil(cells.length / width), 'maze'); cells.forEach(function (value, index) { grid.appendChild(button(value === '0' ? '·' : value, function () { cells[index] = String((Number(cells[index]) + 1) % 6); this.textContent = cells[index] === '0' ? '·' : cells[index]; })); }); panel.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.confirmedLevels.length - 1, level + 1); select.value = String(level); draw(); }), select, grid); prompt.textContent = '原版声明 60 关；当前已确认原生盘面 ' + (level + 1) + ' / ' + data.confirmedLevels.length + '，连线方向解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '连结电线二原生数据加载失败'; });
        }
        function renderMummy() {
            const size = 7; const map = ['#######', '#     #', '# ### #', '#   # #', '### # #', '#     #', '#######']; let pos = 8; let mummy = 24; let keys = 0; const keyCells = new Set([12, 15]); const exit = 33; const grid = renderGrid(size, size, 'mummy-board'); const cells = [];
            function open(i) { return i >= 0 && i < size * size && map[Math.floor(i / size)][i % size] !== '#'; }
            function step(i, delta) { const next = i + delta; if ((delta === 1 || delta === -1) && Math.floor(next / size) !== Math.floor(i / size)) return i; return open(next) ? next : i; }
            function draw() { grid.innerHTML = ''; for (let i = 0; i < size * size; i += 1) { const b = button(map[Math.floor(i / size)][i % size] === '#' ? '墙' : i === pos ? '人' : i === mummy ? '追' : i === exit ? '门' : keyCells.has(i) ? '钥' : '·', function () {}); b.disabled = map[Math.floor(i / size)][i % size] === '#'; cells[i] = b; grid.appendChild(b); } }
            function chase() { const candidates = [-size, size, -1, 1].map(function (d) { return step(mummy, d); }).filter(function (i) { return i !== mummy; }); candidates.sort(function (a, b) { return Math.abs(Math.floor(a / size) - Math.floor(pos / size)) + Math.abs(a % size - pos % size) - (Math.abs(Math.floor(b / size) - Math.floor(pos / size)) + Math.abs(b % size - pos % size)); }); if (candidates.length) mummy = candidates[0]; if (mummy === pos) finish('被木乃伊追上，本局失败。'); }
            function move(delta) { if (ended) return; const next = step(pos, delta); if (next === pos) return; pos = next; if (keyCells.has(pos)) { keys += 1; keyCells.delete(pos); } if (pos === exit) { if (!keys) { status.textContent = '找到钥匙后才能打开出口'; return; } return finish('木乃伊迷宫通关。'); } chase(); setScore(score + 1); status.textContent = '已收集钥匙 ' + keys + ' 把；继续寻找出口。'; draw(); }
            const controls = el('div', { className: 'pk32v-controls' }); [['上', -size], ['下', size], ['左', -1], ['右', 1]].forEach(function (x) { controls.appendChild(button(x[0], function () { move(x[1]); })); });
            body.append(el('p', { className: 'pk32v-prompt' }, '木乃伊迷宫：穿过墙体布局，收集钥匙并躲开逐步追击的木乃伊。'), grid, controls); draw();
        }
        function renderElectromagnetic() {
            const wrap = el('div', { className: 'pk32v-native-electromagnetic' });
            const info = el('p', { className: 'pk32v-prompt' }, '正在读取原生盘面');
            const controls = el('div', { className: 'pk32v-controls' });
            const grid = renderGrid(16, 16, 'electromagnetic-board');
            grid.style.overflow = 'auto'; grid.style.maxWidth = '100%';
            const selector = el('select', { ariaLabel: '选择原版关卡' });
            let levels = [], level = 0;
            function draw() {
                grid.innerHTML = '';
                const raw = levels[level] && levels[level].cells || '';
                selector.value = String(level);
                raw.split('').forEach(function (value, index) {
                    const b = button(value, function () { b.classList.toggle('selected'); });
                    b.dataset.cell = String(index); b.dataset.value = value; b.setAttribute('aria-label', '原生格 ' + (index + 1) + '，编码 ' + value); grid.appendChild(b);
                });
                info.textContent = levels.length ? '原版关卡：第 ' + (level + 1) + ' / 160 关；原生 16×16 盘面；规则还原中' : '正在读取原生盘面';
            }
            function load() { fetch('/data/pk32-electromagnetic-levels.json').then(r => r.json()).then(d => { levels = d.levels || []; draw(); }).catch(() => { info.textContent = '原生盘面加载失败'; }); }
            selector.addEventListener('change', function () { level = Number(selector.value) || 0; draw(); });
            controls.append(button('上一关', function () { if (level > 0) { level -= 1; draw(); } }), button('下一关', function () { if (level + 1 < levels.length) { level += 1; draw(); } }), selector, button('清除选择', function () { grid.querySelectorAll('.selected').forEach(function (b) { b.classList.remove('selected'); }); }));
            wrap.append(info, controls, grid, el('p', { className: 'pk32v-prompt' }, '已保留原生 256 格编码。电磁连接、彩球移动和过关判定待完成规则反汇编后接入。')); body.append(wrap); fetch('/data/pk32-electromagnetic-levels.json').then(r => r.json()).then(d => { levels = d.levels || []; levels.forEach(function (_, i) { const option = el('option', {}, '第 ' + (i + 1) + ' 关'); option.value = String(i); selector.appendChild(option); }); draw(); }).catch(() => { info.textContent = '原生盘面加载失败'; });
        }
        function renderPixelIsland() {
            const wrap = el('div', { className: 'pk32v-native-pixel-island' });
            const info = el('p', { className: 'pk32v-prompt' }, '正在读取原生盘面');
            const controls = el('div', { className: 'pk32v-controls' });
            const grid = renderGrid(5, 5, 'pixel-island-board');
            const selector = el('select', { ariaLabel: '选择已提取原生盘面' });
            let records = [], record = 0;
            function draw() {
                grid.innerHTML = '';
                const raw = records[record] && records[record].cells || '';
                for (let i = 0; i < 25; i += 1) {
                    const value = raw.slice(i * 4, i * 4 + 4) || '0000';
                    const b = button(value, function () { b.classList.toggle('selected'); });
                    b.dataset.cell = String(i); b.dataset.rawState = value; b.setAttribute('aria-label', '原生第 ' + (i + 1) + ' 格，编码 ' + value); grid.appendChild(b);
                }
                selector.value = String(record);
                info.textContent = records.length ? '原版关卡声明：213 关；当前原生盘面记录 ' + (record + 1) + ' / ' + records.length + '；5×5 四字符状态；规则还原中' : '正在读取原生盘面';
            }
            function load() { fetch('/data/pk32-pixel-island-levels.json').then(r => r.json()).then(d => { records = (d.levels || []).filter(x => x.length === 100); records.forEach(function (_, i) { const option = el('option', {}, '原生盘面 ' + (i + 1)); option.value = String(i); selector.appendChild(option); }); draw(); }).catch(() => { info.textContent = '原生盘面加载失败'; }); }
            selector.addEventListener('change', function () { record = Number(selector.value) || 0; draw(); });
            controls.append(selector, button('清除选择', function () { grid.querySelectorAll('.selected').forEach(function (b) { b.classList.remove('selected'); }); }));
            wrap.append(info, controls, grid, el('p', { className: 'pk32v-prompt' }, '原生帮助确认：5×5 格子中的彩球会随选择发生变化，目标是让所有彩球消失。当前保留已定位的三条 5×5 状态串，状态转移规则待反汇编确认。')); body.append(wrap); load();
        }
        function renderZenGarden() {
            const wrap = el('div', { className: 'pk32v-native-zen' });
            const controls = el('div', { className: 'pk32v-controls' });
            const board = renderGrid(10, 15, 'zen-garden-board');
            const info = el('p', { className: 'pk32v-prompt' }, '正在读取原生关卡');
            let levels = [], level = 0, pos = 0, visited = new Set(), active = false;
            function dimensions(raw) { const width = 10; return { width: width, height: Math.max(1, Math.ceil(raw.length / width)) }; }
            function draw() {
                board.innerHTML = '';
                const raw = levels[level] && levels[level].cells || '';
                const shape = dimensions(raw);
                board.style.gridTemplateColumns = 'repeat(' + shape.width + ', minmax(24px, 1fr))';
                for (let i = 0; i < shape.width * shape.height; i += 1) {
                    const value = raw[i] || '0';
                    const road = value !== '0';
                    const b = button(road ? (i === pos ? '●' : visited.has(i) ? '·' : '路') : '', function () {
                        if (!active || !road || visited.has(i)) return;
                        const px = pos % shape.width, py = Math.floor(pos / shape.width), x = i % shape.width, y = Math.floor(i / shape.width);
                        if (Math.abs(px - x) + Math.abs(py - y) !== 1) return;
                        pos = i; visited.add(i); draw();
                        if (visited.size === [...raw].filter(c => c !== '0').length) { active = false; setScore(score + 20); finish('原生道路全部走过，本关完成。'); }
                    });
                    b.dataset.cell = String(i); b.dataset.value = value; b.classList.toggle('road', road); b.classList.toggle('visited', visited.has(i)); board.appendChild(b);
                }
                info.textContent = levels.length ? '第 ' + (level + 1) + ' / 64 关；已提取 ' + levels.length + ' 关；已走 ' + visited.size + ' / ' + [...raw].filter(c => c !== '0').length + ' 格' : '正在读取原生关卡';
            }
            function load() { fetch('/data/pk32-zen-garden-levels.json').then(r => r.json()).then(d => { levels = d.levels || []; active = levels.length > 0; reset(); }).catch(() => { info.textContent = '原生关卡加载失败'; }); }
            function reset() { const raw = levels[level] && levels[level].cells || ''; pos = [...raw].findIndex(c => c !== '0'); if (pos < 0) pos = 0; visited = new Set(pos >= 0 ? [pos] : []); active = true; draw(); }
            controls.append(button('上一关', function () { if (level > 0) { level -= 1; reset(); } }), button('下一关', function () { if (level + 1 < levels.length) { level += 1; reset(); } }), button('重置本关', reset));
            const keys = el('div', { className: 'pk32v-controls' }); [['上', -10], ['下', 10], ['左', -1], ['右', 1]].forEach(function (x) { keys.appendChild(button(x[0], function () { const raw = levels[level] && levels[level].cells || ''; const next = pos + x[1]; const sameRow = x[1] === -1 ? pos % 10 > 0 : x[1] === 1 ? pos % 10 < 9 : true; if (next >= 0 && next < raw.length && sameRow && raw[next] && raw[next] !== '0') board.children[next].click(); })); });
            wrap.append(info, controls, board, keys, el('p', { className: 'pk32v-prompt' }, '原版目标：把所有的路都走一遍。当前只显示已从原生程序定位的 23 条布局串，未伪造其余 41 关。')); body.append(wrap); load();
        }
        function renderShips() {
            const wrap = el('div', { className: 'pk32v-native-ships' });
            const controls = el('div', { className: 'pk32v-controls' });
            const board = el('div', { className: 'pk32v-ships-board' }); const grid = renderGrid(10, 10, 'ships-board'); const svg = el('svg', { className: 'pk32v-ships-lines' }); svg.setAttribute('viewBox', '0 0 10 10'); svg.setAttribute('aria-hidden', 'true'); board.append(svg, grid);
            let levels = [], level = 0, selected = null, links = [];
            function draw() {
                grid.innerHTML = '';
                const raw = levels[level] && levels[level].cells || '';
                const cells = Array.from({ length: 100 }, () => []);
                for (let i = 0, pair = 0; i + 3 < raw.length; i += 4, pair += 1) { const a = parseInt(raw.slice(i, i + 2), 10), b = parseInt(raw.slice(i + 2, i + 4), 10), ax = a % 10, ay = Math.floor(a / 10), bx = b % 10, by = Math.floor(b / 10); if ([ax, ay, bx, by].every(n => n >= 0 && n < 10)) { cells[ay * 10 + ax].push({ pair: pair, end: 0 }); cells[by * 10 + bx].push({ pair: pair, end: 1 }); } }
                for (let i = 0; i < 100; i += 1) {
                    const endpoint = cells[i][0]; const b = button(endpoint ? (endpoint.end ? '海怪' : '船') : '', function () { if (!endpoint) return; if (selected == null) selected = i; else if (selected !== i) { const a = selected, x = i, first = cells[a][0]; if (first && first.pair === endpoint.pair && first.end !== endpoint.end && !links.some(p => p.pair === endpoint.pair)) links.push({ a: a, b: x, pair: endpoint.pair }); selected = null; draw(); } });
                    b.dataset.cell = String(i); if (selected === i) b.classList.add('selected'); if (endpoint) b.classList.add(endpoint.end ? 'monster' : 'ship'); grid.appendChild(b);
                }
                svg.innerHTML = ''; links.forEach(function (p) { const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); line.setAttribute('x1', p.a % 10 + .5); line.setAttribute('y1', Math.floor(p.a / 10) + .5); line.setAttribute('x2', p.b % 10 + .5); line.setAttribute('y2', Math.floor(p.b / 10) + .5); line.setAttribute('stroke', '#f4c95d'); line.setAttribute('stroke-width', '.16'); svg.appendChild(line); });
                status.textContent = levels.length ? '第 ' + (level + 1) + ' / 52 关；已定位 ' + levels.length + ' 关；路径 ' + links.length + ' 条' : '正在读取原生关卡';
            }
            function load() { fetch('/data/pk32-ships-puzzle-levels.json').then(r => r.json()).then(d => { levels = d.levels || []; draw(); }).catch(() => { status.textContent = '原生关卡加载失败'; }); }
            controls.append(button('上一关', function () { if (level > 0) { level -= 1; links = []; draw(); } }), button('下一关', function () { if (level + 1 < levels.length) { level += 1; links = []; draw(); } }), button('清除连线', function () { links = []; selected = null; draw(); }));
            wrap.append(el('p', { className: 'pk32v-prompt' }, '原版规则：连接相同颜色的船与海怪，绕过旋涡且连线不能交叉。当前保留原始坐标串。'), controls, board); body.append(wrap); load();
        }
        function render() { body.innerHTML = ''; setScore(0); ended = false; const renderer = config.name === '航海迷题' ? renderShips : config.name === '建筑制造' ? renderBuilding : config.name === '立体魔方二' ? renderNativeCube2 : config.name === '反射镜' ? renderNativeMirror : config.name === '交换彩球' ? renderNativeSwapBalls : config.name === '爆破彩球' ? renderNativeBurst : config.name === '坦克大战' ? renderNativeTank : config.name === '海底寻宝' ? renderNativeSeaTreasure : config.name === '七盏灯' ? renderNativeLamps : config.name === '推箱子五' ? renderNativeSokoban5 : config.name === '推箱子四' ? renderNativeSokoban4 : config.name === '禅宗迷宫' ? renderNativeZenMaze : config.name === '跟花二' ? renderNativeGenhua2 : config.name === '魔法城堡二' ? renderNativeCastle2 : config.name === '魔法城堡' ? renderNativeCastle : config.name === '智慧之光' ? renderNativeLight : config.name === '连结电线二' ? renderNativeWires2 : config.name === '七巧板' ? renderNativeTangram : config.name === '同步移动' ? renderNativeSyncMove : config.name === '宇宙黑洞' ? renderNativeBlackHole : config.name === '下一百层' ? renderNativeNextHundred : config.name === '上一百层' ? renderNativePreviousHundred : config.name === '飞一百米' ? renderNativeFlyHundred : config.name === '打砖块' ? renderNativeBreakout : ({ action: renderAction, reaction: renderReaction, number: renderNumber, memory: renderMemory, cards: renderCards, balls: renderBalls, maze: renderMaze, 'zen-garden': renderZenGarden, electromagnetic: renderElectromagnetic, 'pixel-island': renderPixelIsland, board: renderBoard, 'chinese-chess': renderChineseChess, go: renderGo, chess: renderChess, military: renderMilitary, mahjong: renderMahjong, billiards: renderBilliards, bubble: renderBubble, mummy: renderMummy }[config.mode] || renderAction); renderer(); }
        const api = {
            config: config,
            restart: function () { cleanups.forEach(function (fn) { fn(); }); cleanups = []; render(); },
            end: function () { if (!ended) finish('本局已结束。'); },
            destroy: function () { cleanups.forEach(function (fn) { fn(); }); cleanups = []; container.innerHTML = ''; },
            getScore: function () { return score; },
            getState: function () { return { name: name, mode: config.mode, score: score, ended: ended }; }
        };
        render();
        return api;
    }

    const api = { NAMES: NAMES, CONFIG: CONFIG, startGame: startGame, getConfig: function (name) { return CONFIG[name] || null; } };
    window.PK32Variants = api;
}());
