// PK32 变体与专有玩法。独立于 MiniGames 的关卡、星级和通用流程。
(function () {
    window.PK32Variants = window.PK32Variants || {};

    const NAMES = '锄大地|追逐|记数|转换|配对|连击|连珠牌|憋七|FF9卡片|7鬼523|读心术二|24点二|排数字|变色龙|超级99|重合|幸运数字|40点|数字魔方|同色方块变体|同步移动|摘花朵|平面魔方|激光坦克|中国象棋|围棋|象棋-暗棋|国际象棋|军棋|正方形棋|军棋-暗棋|麻将|极品飞车|六子连珠|天地棋|冒泡大战|剪刀石头布|海盗船|木乃伊|记忆考验|反应测试|海豚骰|魔力珠宝|智商测试|五连板|白手起家|跳跃棋|像素岛|捡棋子|成语填字|邻居|麻将王|麻将王二|麻将王三|过河|电磁彩球|爆破彩球|绿洲|魅力之球|圈地|禅宗花园|骰子王|数谜|航海迷题|魔法城堡|弹力连珠|魔法城堡二|潜艇大战|跳棋二|拼疑犯|禅宗迷宫|马跳棋盘|花式九球|美式落袋|斯诺克|宇宙黑洞|飞一百米|打砖块|海底寻宝|碰撞彩球|彩球迷宫|反射镜|企鹅|立体魔方二|彩球连线|建筑制造|上一百层|下一百层'.split('|');

    NAMES.push(...'跟花|丰收|拱猪|十点半|钓鱼|争上游|抽乌龟|梭哈|牌九|扑克麻将|百智牌|FF8卡片|比大小|移动|接龙|争夺|同花|三打三|记忆|变幻牌|挑选|暗牌|扑克扫雷|24点|炮牌|猜数|幸运|读心术|梭哈二|井字牌|斗地主|拖拉机-升级|纸牌魔法阵|别棍|纸牌|空当接龙|蜘蛛纸牌|14点|考眼力|21点|13点|扎金花|纸牌算命|抽乌龟二|抽乌龟三|接水管|读心术三|梭哈三|桥桥|桥牌|梭哈四|读心术四|21点二|塔罗牌|梭哈五|抽乌龟四|抽乌龟五|梭哈六|三张牌|梭哈七|魔力纸牌|跟花二|接龙二|扫雷|赛马|俄罗斯方块|飞行棋|贪吃蛇|独粒钻石|推箱子|火箭大战|打地鼠|黑白棋|同色方块|华容道|强手棋|五彩连珠|跳棋|五子棋|斗兽棋|迷宫|拼图|七彩宝石|宝石方块|连结电线|魔塔|开心辞典|开心灯谜|神符|原子|汉诺塔|前进棋|轮盘|老虎机|连连看|扫雷二|泡泡彩球|找不同|找彩球|变化彩球|魔塔二|多彩泡泡|魔塔三|推箱子二|推箱子三|移彩球|数独|绝妙飞行|推箱子六|十字绣|变色彩球|扩展线路|飞镖王|爆破彩球二|七盏灯|交换彩球|四子棋|立体魔方|吃豆子|推箱子四|推箱子五|连结电线二|七巧板'.split('|').filter(function (name) { return NAMES.indexOf(name) < 0; }));
    const BOARD = new Set('中国象棋|围棋|象棋-暗棋|国际象棋|军棋|正方形棋|军棋-暗棋|六子连珠|天地棋|跳跃棋|跳棋二|圈地|五连板'.split('|'));
    const NUMBERS = new Set('记数|转换|排数字|超级99|幸运数字|40点|24点二|骰子王|数谜|智商测试|海豚骰|成语填字'.split('|'));
    const MEMORY = new Set('配对|读心术二|记忆考验|拼疑犯|邻居|摘花朵'.split('|'));
    const REACTION = new Set('追逐|连击|反应测试|剪刀石头布|冒泡大战|激光坦克|潜艇大战|宇宙黑洞|海盗船|极品飞车'.split('|'));
    const BALLS = new Set('连珠牌|同色方块变体|电磁彩球|魅力之球|弹力连珠|碰撞彩球|彩球迷宫|彩球连线|绿洲|魔力珠宝'.split('|'));
    const MAZES = new Set('过河|木乃伊|禅宗迷宫|平面魔方|数字魔方|立体魔方二|像素岛|魔法城堡|魔法城堡二|航海迷题|反射镜|企鹅|建筑制造|白手起家'.split('|'));
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

    ['魔塔二', '魔塔三', '魔塔四', '坦克大战', '桥桥'].forEach(function (name) { if (NAMES.indexOf(name) < 0) NAMES.push(name); });

    function modeFor(name) {
        if (name === '接水管') return 'pipe-connect';
        if (ELECTROMAGNETIC.has(name)) return 'electromagnetic';
        if (PIXEL_ISLAND.has(name)) return 'pixel-island';
        if (ZEN_GARDEN.has(name)) return 'zen-garden';
        if (name === '华容道') return 'huarong';
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
            name: name,
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
    const STRUCTURED_PAYLOAD_NAMES = new Set('考眼力|24点二|21点二|梭哈六|三张牌|接龙二|平面魔方|激光坦克|开心辞典|记忆考验|反应测试|海豚骰|汉诺塔|老虎机|跳跃棋|找不同|找彩球|变化彩球|推箱子二|移彩球|数独|跳棋二|拼疑犯|扩展线路|马跳棋盘|彩球迷宫|吃豆子|彩球连线'.split('|'));

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
        if (name === '坦克大战') status.textContent = '原版流程：15×10 原生盘面；地形编码已接入，炮击与敌方 AI 校核中';
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
            if (config.name === '华容道') return renderNativeHuarong();
            if (config.name === '接水管') return renderNativePipeConnect();
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
        function renderNativePipeConnect() {
            const width = 12, height = 8, total = width * height;
            const prompt = el('p', { className: 'pk32v-prompt' });
            const controls = el('div', { className: 'pk32v-controls' });
            const grid = renderGrid(width, height, 'pipe-connect-native-board');
            const difficulty = el('select', { ariaLabel: '接水管难度' });
            let board = [], source = 0, water = 0, heading = 0, remaining = 60, required = 30, passed = 0, timer = null;
            const direction = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            const pipes = { 4: [0, 3], 5: [3, 2], 6: [2, 1], 7: [1, 0] };
            const frames = { 4: 0, 5: 2, 6: 4, 7: 6 };

            for (let level = 1; level <= 5; level += 1) difficulty.appendChild(el('option', { value: String(level) }, '难度 ' + level));
            controls.append(difficulty, button('重新开始', reset));
            body.append(prompt, controls, grid);
            addCleanup(function () { if (timer) clearInterval(timer); });

            function pipeExit(code, travel) {
                const joins = pipes[code % 100];
                if (!joins) return -1;
                const entrance = (travel + 2) % 4;
                if (joins[0] === entrance) return joins[1];
                if (joins[1] === entrance) return joins[0];
                return -1;
            }
            function updatePrompt(message) {
                prompt.textContent = '原版运行模型：12×8 格，剩余 ' + remaining.toFixed(1) + ' 秒，目标 ' + passed + ' / ' + required + '。' + (message || '左键随机放置管件；右键取消并扣 10 秒。');
            }
            function drawCell(cell, index) {
                const code = board[index];
                cell.className = 'pk32v-btn pipe-connect-tile';
                cell.textContent = '';
                cell.disabled = ended;
                cell.dataset.nativeCode = String(code);
                cell.dataset.cell = String(index);
                cell.style.removeProperty('--pipe-sheet-x');
                cell.style.removeProperty('--pipe-sheet-y');
                if (code >= 4) {
                    cell.classList.add('pipe-connect-placed');
                    cell.style.setProperty('--pipe-sheet-x', frames[code % 100] * 100 / 7 + '%');
                    cell.style.setProperty('--pipe-sheet-y', code >= 100 ? '37.5%' : '0%');
                }
                if (index === source) cell.classList.add('pipe-connect-source');
                if (index === source || index === water) cell.classList.add('pipe-connect-water');
            }
            function draw() {
                grid.innerHTML = '';
                for (let index = 0; index < total; index += 1) {
                    const cell = button('', function () {
                        if (ended || index === source || board[index] >= 0) return;
                        board[index] = 4 + randomInt(4);
                        draw();
                    });
                    cell.title = '坐标 ' + (index % width + 1) + '，' + (Math.floor(index / width) + 1);
                    cell.oncontextmenu = function (event) {
                        event.preventDefault();
                        if (ended || index === source || board[index] < 0) return;
                        board[index] = -1;
                        remaining = Math.max(0, remaining - 10);
                        if (!remaining) return lose('时间到，请重新开始。');
                        draw();
                        updatePrompt();
                    };
                    drawCell(cell, index);
                    grid.appendChild(cell);
                }
                grid.dataset.width = String(width);
                grid.dataset.height = String(height);
                grid.dataset.required = String(required);
            }
            function lose(message) {
                if (timer) clearInterval(timer);
                updatePrompt(message);
                finish(message);
            }
            function step() {
                if (ended) return;
                remaining = Math.max(0, remaining - .5);
                if (!remaining) return lose('时间到，请重新开始。');
                const exit = pipeExit(board[water], heading);
                if (exit < 0) return lose('水流中断，请重新开始。');
                if (board[water] < 100) {
                    board[water] += 100;
                    passed += 1;
                    if (passed >= required) {
                        draw();
                        updatePrompt('恭喜！您过关了！');
                        return finish('恭喜！您过关了！');
                    }
                }
                const point = direction[exit], x = water % width + point[0], y = Math.floor(water / width) + point[1];
                if (x < 0 || x >= width || y < 0 || y >= height) return lose('水流离开棋盘，请重新开始。');
                water = y * width + x;
                heading = exit;
                draw();
                updatePrompt();
            }
            function reset() {
                if (timer) clearInterval(timer);
                ended = false;
                remaining = 60;
                required = Number(difficulty.value) * 10 + 20;
                passed = 0;
                board = Array(total).fill(-1);
                source = (2 + randomInt(8)) + (2 + randomInt(4)) * width;
                heading = randomInt(4);
                water = source;
                const entrance = (heading + 2) % 4;
                const sourceCodes = Object.keys(pipes).map(Number).filter(function (code) { return pipes[code].indexOf(entrance) >= 0; });
                board[source] = sourceCodes[randomInt(sourceCodes.length)];
                draw();
                updatePrompt();
                timer = setInterval(step, 500);
            }
            difficulty.addEventListener('change', reset);
            reset();
        }
        function renderStructuredPayloads() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载' + config.name + '原始结构化载荷…');
            const panel = el('div', { className: 'pk32v-native-data' });
            body.append(prompt, panel);
            fetch('/data/pk32-structured-payloads.json').then(function (response) { return response.json(); }).then(function (data) {
                const game = (data.games || []).find(function (item) { return item.name === config.name; });
                if (!game || !game.payloads || !game.payloads.length) {
                    prompt.textContent = config.name + '暂无可绑定的结构化载荷。';
                    return;
                }
                let level = 0;
                const select = el('select', { 'aria-label': config.name + '原始载荷' });
                game.payloads.forEach(function (payload, index) {
                    select.appendChild(el('option', { value: String(index) }, '原始载荷 ' + (index + 1) + ' / ' + game.payloads.length + '，长度 ' + payload.length));
                });
                function chooseShape(payload) {
                    const structure = payload.structure || {};
                    if (structure.width && structure.height) return { width: structure.width, height: structure.height };
                    const shapes = structure.candidateShapes || [];
                    const single = shapes.find(function (shape) { return shape.cellWidth === 1 && shape.width <= 20 && shape.height <= 20; }) || shapes[0];
                    if (single) return { width: single.width, height: single.height };
                    if (payload.family === 'paired-code-candidate') return { width: 12, height: Math.ceil((payload.units || []).length / 12) };
                    if (payload.family === 'three-digit-index-candidate') return { width: 9, height: Math.ceil((payload.units || []).length / 9) };
                    if (payload.family === 'legacy-100-stream') return { width: 10, height: Math.ceil((payload.units || []).length / 10) };
                    return { width: Math.min(16, Math.max(1, Math.ceil(Math.sqrt((payload.units || []).length || 1)))), height: 0 };
                }
                function colorFor(value) {
                    const n = Number(value);
                    const colors = ['#0f172a', '#334155', '#2563eb', '#16a34a', '#eab308', '#dc2626', '#7c3aed', '#0891b2', '#f97316', '#be123c'];
                    if (Number.isFinite(n)) return colors[Math.abs(n) % colors.length];
                    return '#475569';
                }
                function colorKey(value) {
                    const code = Number(value);
                    if (!Number.isFinite(code)) return null;
                    if (code >= 20) return code % 10;
                    if ([2, 3, 4, 6, 8, 9].indexOf(code) >= 0) return code;
                    return null;
                }
                function renderExtendLines(payload, nav, detail) {
                    const width = payload.structure.width, height = payload.structure.height, original = (payload.units || []).map(Number);
                    let cells = original.slice();
                    const palette = [2, 4, 6, 8, 9];
                    const fillable = function (code) { return code === 0 || code === 1 || code === 10; };
                    function clueInfo(code) { return code >= 20 ? { target: Math.floor(code / 10), color: code % 10 } : null; }
                    function neighborIndexes(index) {
                        const x = index % width, y = Math.floor(index / width), result = [];
                        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
                            if (!dx && !dy) continue;
                            const nx = x + dx, ny = y + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
                        }
                        return result;
                    }
                    function clueCount(index, clue) {
                        return 1 + neighborIndexes(index).filter(function (target) { return colorKey(cells[target]) === clue.color; }).length;
                    }
                    function solved() {
                        return cells.every(function (code, index) { const clue = clueInfo(original[index]); return !clue || clueCount(index, clue) === clue.target; });
                    }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const grid = renderGrid(width, height, 'pk32-structured-payload-board');
                        cells.forEach(function (code, index) {
                            const clue = clueInfo(original[index]);
                            const text = clue ? String(clue.target) : (fillable(original[index]) && !colorKey(code) ? '' : String(code));
                            const cell = button(text, function () {
                                if (!fillable(original[index])) return;
                                const current = palette.indexOf(Number(cells[index]));
                                cells[index] = current < 0 ? palette[0] : current + 1 < palette.length ? palette[current + 1] : 0;
                                drawBoard();
                            });
                            const clueOk = clue && clueCount(index, clue) === clue.target;
                            cell.dataset.code = String(code); cell.dataset.originalCode = String(original[index]); cell.dataset.cell = String(index);
                            cell.style.cssText = 'min-width:28px;min-height:28px;padding:0;background:' + colorFor(clue ? clue.color : code) + ';color:#fff;font-size:12px;font-weight:700;line-height:1.1;overflow:hidden;outline:' + (clue ? (clueOk ? '2px solid #84e6ad' : '2px solid #ff7a8b') : 'none');
                            if (fillable(original[index])) cell.title = '点击循环补入彩球颜色';
                            else cell.disabled = true;
                            grid.appendChild(cell);
                        });
                        const actions = el('div', { className: 'pk32v-toolbar' });
                        actions.append(button('清空补球', function () { cells = original.slice(); drawBoard(); }), button('检查本关', function () { if (solved()) finish('本关数字彩球约束全部满足。'); else prompt.textContent = '仍有数字彩球周围数量不匹配，继续补完缺少的彩球。'; }));
                        panel.append(nav, grid, actions, detail);
                        prompt.textContent = config.name + '：第 ' + (level + 1) + ' / ' + game.payloads.length + ' 关；点击空格补彩球，数字彩球显示周围同色数量要求。';
                    }
                    drawBoard();
                }
                function renderKnightBoard(payload, nav, detail) {
                    const width = (payload.structure && payload.structure.width) || chooseShape(payload).width, height = (payload.structure && payload.structure.height) || chooseShape(payload).height;
                    const original = (payload.units || []).map(Number);
                    let cells = original.slice(), player = Math.max(0, cells.indexOf(5)), points = Number(payload.trailer || 0) || 50, facing = 0;
                    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
                    function walkable(code) { return [1, 4, 5, 7, 8, 9].indexOf(code) >= 0; }
                    function stoneCost(code) { return code === 6 || code >= 20 && code < 40 ? 5 : code === 10 || code >= 40 ? 7 : 0; }
                    function addPoints(code) { return code === 8 ? 10 : code === 9 ? 20 : 0; }
                    function move(dx, dy, jump) {
                        if (ended || points <= 0) return;
                        const x = player % width, y = Math.floor(player / width), nx = x + dx, ny = y + dy;
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
                        const next = ny * width + nx, code = cells[next], cost = stoneCost(code);
                        if (jump) {
                            const landX = x + dx * 2, landY = y + dy * 2, land = landY * width + landX;
                            if (!cost || landX < 0 || landX >= width || landY < 0 || landY >= height || !walkable(cells[land]) || points < 20) return;
                            points -= 20; player = land;
                        } else if (cost) {
                            const pushX = nx + dx, pushY = ny + dy, push = pushY * width + pushX;
                            if (pushX < 0 || pushX >= width || pushY < 0 || pushY >= height || !walkable(cells[push]) || points < cost) return;
                            cells[push] = code; cells[next] = 1; points -= cost; player = next;
                        } else {
                            if (!walkable(code) || points < 1) return;
                            points -= 1; player = next;
                        }
                        const bonus = addPoints(cells[player]);
                        if (bonus) { points += bonus; cells[player] = 1; }
                        if (cells[player] === 4) finish('到达深树叶终点，本关完成。');
                        else if (points <= 0) finish('移动点数用完了，请重新开始本关。');
                        drawBoard();
                    }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const grid = renderGrid(width, height, 'pk32-structured-payload-board');
                        cells.slice(0, width * height).forEach(function (code, index) {
                            const label = index === player ? '人' : code === 0 ? '' : code === 4 ? '终' : code === 6 ? '石' : code === 10 ? '塔' : code === 8 || code === 9 ? '宝' : code >= 20 ? String(Math.floor(code / 10)) : code >= 40 ? String(Math.floor(code / 10)) : '';
                            const cell = button(label, function () { const dx = index % width - player % width, dy = Math.floor(index / width) - Math.floor(player / width); if (Math.abs(dx) + Math.abs(dy) === 1) move(dx, dy, false); });
                            cell.dataset.code = String(code); cell.dataset.cell = String(index);
                            cell.style.cssText = 'min-width:28px;min-height:28px;padding:0;background:' + (index === player ? '#facc15' : code === 0 ? '#0f172a' : code === 4 ? '#16a34a' : code === 6 || code >= 20 ? '#78716c' : code === 10 || code >= 40 ? '#57534e' : code === 8 || code === 9 ? '#38bdf8' : '#334155') + ';color:#fff;font-size:12px;font-weight:700;line-height:1.1;overflow:hidden';
                            grid.appendChild(cell);
                        });
                        const controls = el('div', { className: 'pk32v-controls' });
                        [['上', 0, -1], ['下', 0, 1], ['左', -1, 0], ['右', 1, 0]].forEach(function (item, index) { controls.append(button(item[0], function () { facing = index; move(item[1], item[2], false); })); });
                        controls.append(button('跳跃', function () { const dir = dirs[facing]; move(dir[0], dir[1], true); }), button('重置本关', function () { cells = original.slice(); player = Math.max(0, cells.indexOf(5)); points = Number(payload.trailer || 0) || 50; ended = false; drawBoard(); }));
                        panel.append(nav, grid, controls, detail);
                        prompt.textContent = config.name + '：第 ' + (level + 1) + ' / ' + game.payloads.length + ' 关；移动点数 ' + points + '。方向移动，推石块/石塔或跳过障碍。';
                    }
                    drawBoard();
                }
                function renderSudoku(payload, nav, detail) {
                    const original = (payload.units || []).map(Number), size = original.length >= 81 ? 9 : 6, boxW = 3, boxH = size === 9 ? 3 : 2;
                    let cells = original.slice(0, size * size).map(function (value) { return Number(value) || 0; });
                    function validGroup(values) { const seen = values.filter(Boolean); return seen.length === new Set(seen).size && seen.every(function (value) { return value >= 1 && value <= size; }); }
                    function solved() {
                        for (let y = 0; y < size; y += 1) if (!validGroup(cells.slice(y * size, y * size + size)) || cells.slice(y * size, y * size + size).some(function (value) { return !value; })) return false;
                        for (let x = 0; x < size; x += 1) if (!validGroup(Array.from({ length: size }, function (_, y) { return cells[y * size + x]; }))) return false;
                        for (let by = 0; by < size; by += boxH) for (let bx = 0; bx < size; bx += boxW) { const values = []; for (let y = 0; y < boxH; y += 1) for (let x = 0; x < boxW; x += 1) values.push(cells[(by + y) * size + bx + x]); if (!validGroup(values)) return false; }
                        return true;
                    }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const grid = renderGrid(size, size, 'pk32-structured-payload-board');
                        cells.forEach(function (value, index) { const fixed = original[index] > 0; const cell = button(value ? String(value) : '', function () { if (fixed) return; cells[index] = (cells[index] % size) + 1; drawBoard(); }); cell.dataset.code = String(value); cell.dataset.fixed = String(fixed); cell.style.cssText = 'min-width:34px;min-height:34px;padding:0;background:' + (fixed ? '#334155' : '#0f172a') + ';color:#fff;font-size:15px;font-weight:700;line-height:1.1;border-color:' + ((index % size) % boxW === 0 || Math.floor(index / size) % boxH === 0 ? '#eab308' : '#475569'); grid.appendChild(cell); });
                        const actions = el('div', { className: 'pk32v-toolbar' });
                        actions.append(button('检查本关', function () { if (solved()) finish('数独本关完成。'); else prompt.textContent = '数独：仍有行、列或宫格重复/空格。'; }), button('重置本关', function () { cells = original.slice(0, size * size).map(function (value) { return Number(value) || 0; }); drawBoard(); }));
                        panel.append(nav, grid, actions, detail);
                        prompt.textContent = config.name + '：第 ' + (level + 1) + ' / ' + game.payloads.length + ' 关；点击空格循环填写 1-' + size + '，检查行、列和宫格。';
                    }
                    drawBoard();
                }
                function renderFlatCube(payload, nav, detail) {
                    const shape = chooseShape(payload), width = shape.width, height = shape.height || Math.ceil((payload.units || []).length / shape.width);
                    let cells = (payload.units || []).slice(0, width * height).map(Number);
                    function rotateRow(row, dir) { const start = row * width, values = cells.slice(start, start + width); if (dir > 0) values.unshift(values.pop()); else values.push(values.shift()); values.forEach(function (value, index) { cells[start + index] = value; }); drawBoard(); }
                    function rotateCol(col, dir) { const values = Array.from({ length: height }, function (_, y) { return cells[y * width + col]; }); if (dir > 0) values.unshift(values.pop()); else values.push(values.shift()); values.forEach(function (value, y) { cells[y * width + col] = value; }); drawBoard(); }
                    function solved() { return Array.from({ length: height }, function (_, y) { const row = cells.slice(y * width, y * width + width).filter(function (value) { return value !== 0 && value !== 2; }); return row.length === 0 || row.every(function (value) { return value === row[0]; }); }).every(Boolean); }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const grid = renderGrid(width, height, 'pk32-structured-payload-board');
                        cells.forEach(function (value, index) { const cell = button(String(value), function () { rotateRow(Math.floor(index / width), 1); }); cell.dataset.code = String(value); cell.style.cssText = 'min-width:22px;min-height:22px;padding:0;background:' + colorFor(value) + ';color:#fff;font-size:10px;font-weight:700;line-height:1.1;overflow:hidden'; grid.appendChild(cell); });
                        const actions = el('div', { className: 'pk32v-toolbar' });
                        actions.append(button('左移首行', function () { rotateRow(0, -1); }), button('右移首行', function () { rotateRow(0, 1); }), button('上移首列', function () { rotateCol(0, -1); }), button('下移首列', function () { rotateCol(0, 1); }), button('检查', function () { if (solved()) finish('所有行图案已一致。'); else prompt.textContent = '平面魔方：继续旋转行列，使每一行图案相同。'; }));
                        panel.append(nav, grid, actions, detail);
                        prompt.textContent = config.name + '：第 ' + (level + 1) + ' / ' + game.payloads.length + ' 关；点击任意格会右移该行，也可用按钮旋转首行/首列。';
                    }
                    drawBoard();
                }
                function renderPacDots(payload, nav, detail) {
                    const shape = chooseShape(payload), width = shape.width, height = shape.height || Math.ceil((payload.units || []).length / shape.width);
                    let cells = (payload.units || []).slice(0, width * height).map(Number), player = cells.findIndex(function (value) { return value >= 3 && value <= 6; });
                    if (player < 0) player = cells.findIndex(function (value) { return value !== 1; });
                    if (player < 0) player = 0;
                    function dot(code) { return code === 0 || code === 8 || code === 9; }
                    function wall(code) { return code === 1; }
                    function move(delta) { if (ended) return; const next = player + delta; if (next < 0 || next >= cells.length) return; if ((delta === 1 || delta === -1) && Math.floor(next / width) !== Math.floor(player / width)) return; if (wall(cells[next])) return; if (dot(cells[next])) { setScore(score + (cells[next] === 0 ? 1 : 5)); cells[next] = 2; } player = next; drawBoard(); if (!cells.some(dot)) finish('豆子全部吃完，本关完成。'); }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const grid = renderGrid(width, height, 'pk32-structured-payload-board');
                        cells.forEach(function (value, index) { const cell = button(index === player ? '豆' : wall(value) ? '墙' : dot(value) ? '·' : '', function () { const delta = index - player; if ([1, -1, width, -width].indexOf(delta) >= 0) move(delta); }); cell.dataset.code = String(value); cell.dataset.cell = String(index); cell.style.cssText = 'min-width:24px;min-height:24px;padding:0;background:' + (index === player ? '#facc15' : wall(value) ? '#1d4ed8' : dot(value) ? '#0f172a' : '#334155') + ';color:#fff;font-size:10px;font-weight:700;line-height:1.1;overflow:hidden'; grid.appendChild(cell); });
                        const controls = el('div', { className: 'pk32v-controls' });
                        [['上', -width], ['下', width], ['左', -1], ['右', 1]].forEach(function (item) { controls.append(button(item[0], function () { move(item[1]); })); });
                        panel.append(nav, grid, controls, detail);
                        prompt.textContent = config.name + '：第 ' + (level + 1) + ' / ' + game.payloads.length + ' 关；方向移动并吃完所有豆子。';
                    }
                    drawBoard();
                }
                function renderColorLinks(payload, nav, detail) {
                    const units = (payload.units || []).map(Number).filter(Number.isFinite), edges = [];
                    for (let index = 0; index + 1 < units.length; index += 2) edges.push([units[index], units[index + 1]]);
                    const nodes = Array.from(new Set(edges.flat())).sort(function (a, b) { return a - b; });
                    let current = null, used = new Set();
                    function edgeKey(a, b) { return [Math.min(a, b), Math.max(a, b)].join('-'); }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const board = el('div', { className: 'pk32v-grid pk32-structured-payload-board' });
                        board.style.gridTemplateColumns = 'repeat(' + Math.max(2, Math.min(5, nodes.length)) + ', minmax(44px, 1fr))';
                        nodes.forEach(function (node) {
                            const cell = button(String(node), function () {
                                if (current == null) { current = node; drawBoard(); return; }
                                const key = edgeKey(current, node);
                                if (current !== node && edges.some(function (edge) { return edgeKey(edge[0], edge[1]) === key; }) && !used.has(key)) {
                                    used.add(key); current = node; setScore(used.size * 10);
                                    if (used.size === edges.length) finish('彩球连线全部消去，本关完成。');
                                }
                                drawBoard();
                            });
                            const remain = edges.filter(function (edge) { return !used.has(edgeKey(edge[0], edge[1])) && (edge[0] === node || edge[1] === node); }).length;
                            cell.dataset.node = String(node); cell.dataset.current = String(current === node);
                            cell.style.cssText = 'min-width:44px;min-height:44px;padding:0;border-radius:50%;background:' + colorFor(node) + ';color:#fff;font-size:16px;font-weight:700;outline:' + (current === node ? '3px solid #facc15' : 'none');
                            cell.title = '剩余连线 ' + remain + ' 条';
                            board.appendChild(cell);
                        });
                        const edgesPanel = el('div', { className: 'pk32v-toolbar' });
                        edges.forEach(function (edge) {
                            const key = edgeKey(edge[0], edge[1]), item = el('span', { className: 'pk32v-status' }, edge[0] + ' - ' + edge[1]);
                            item.style.cssText = 'opacity:' + (used.has(key) ? '.35' : '1') + ';padding:4px 8px;border:1px solid #475569;border-radius:6px';
                            edgesPanel.appendChild(item);
                        });
                        const actions = el('div', { className: 'pk32v-toolbar' });
                        actions.append(button('重置本关', function () { current = null; used = new Set(); setScore(0); drawBoard(); }));
                        panel.append(nav, board, edgesPanel, actions, detail);
                        prompt.textContent = config.name + '：原始成对连线 ' + edges.length + ' 条；从任一彩球开始，沿未消去的连线依次点击端点。';
                    }
                    drawBoard();
                }
                function renderMoveBalls(payload, nav, detail) {
                    const shape = chooseShape(payload), width = shape.width, height = shape.height || Math.ceil((payload.units || []).length / shape.width);
                    const original = (payload.units || []).slice(0, width * height).map(Number);
                    let cells = original.slice(), moves = 0, maxMoves = Math.max(12, original.filter(Boolean).length * 2);
                    const directions = [[-1, 0, 1], [0, 1, 2], [1, 0, 4], [0, -1, 8]];
                    function rotateMask(mask) {
                        return directions.reduce(function (value, item) { return (mask & item[2]) ? value | directions[(directions.indexOf(item) + 1) % 4][2] : value; }, 0);
                    }
                    function connected() {
                        const queue = [], seen = new Set();
                        for (let y = 0; y < height; y += 1) {
                            const index = y * width;
                            if (cells[index] & 1) { queue.push(index); seen.add(index); }
                        }
                        while (queue.length) {
                            const index = queue.shift(), x = index % width, y = Math.floor(index / width), mask = cells[index];
                            if (x === width - 1 && mask & 2) return true;
                            directions.forEach(function (item) {
                                if (!(mask & item[2])) return;
                                const nx = x + item[1], ny = y + item[0];
                                if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
                                const next = ny * width + nx, opposite = directions[(directions.indexOf(item) + 2) % 4][2];
                                if ((cells[next] & opposite) && !seen.has(next)) { seen.add(next); queue.push(next); }
                            });
                        }
                        return false;
                    }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const grid = renderGrid(width, height, 'pk32-structured-payload-board');
                        cells.forEach(function (value, index) {
                            const cell = button(value ? String(value) : '', function () {
                                if (ended || !value) return;
                                cells[index] = rotateMask(cells[index]); moves += 1; setScore(Math.max(0, maxMoves - moves));
                                drawBoard();
                                if (connected()) finish('左右电线已经连通，本关完成。');
                                else if (moves >= maxMoves) finish('移动次数用完，请重置本关。');
                            });
                            cell.dataset.code = String(value);
                            cell.dataset.cell = String(index);
                            cell.style.cssText = 'min-width:34px;min-height:34px;padding:0;background:' + (value ? colorFor(value) : '#0f172a') + ';color:#fff;font-size:13px;font-weight:700;line-height:1.1;overflow:hidden';
                            cell.title = value ? '点击顺时针旋转电线，方向码 ' + value : '空格';
                            grid.appendChild(cell);
                        });
                        const actions = el('div', { className: 'pk32v-toolbar' });
                        actions.append(button('重置本关', function () { cells = original.slice(); moves = 0; setScore(maxMoves); ended = false; drawBoard(); }));
                        panel.append(nav, grid, actions, detail);
                        prompt.textContent = config.name + '：第 ' + (level + 1) + ' / ' + game.payloads.length + ' 关；在 ' + maxMoves + ' 次移动内把最左和最右的电线连通，剩余 ' + Math.max(0, maxMoves - moves) + ' 次。';
                    }
                    setScore(maxMoves);
                    drawBoard();
                }
                function renderCheckers2(payload, nav, detail) {
                    const size = 8;
                    let cells = Array(size * size).fill(null), selected = -1, turn = 'black';
                    for (let y = 0; y < 3; y += 1) for (let x = 0; x < size; x += 1) if ((x + y) % 2) cells[y * size + x] = { side: 'black', king: false };
                    for (let y = 5; y < size; y += 1) for (let x = 0; x < size; x += 1) if ((x + y) % 2) cells[y * size + x] = { side: 'white', king: false };
                    function pos(index) { return { x: index % size, y: Math.floor(index / size) }; }
                    function dirs(piece) {
                        if (piece.king) return [[-1, -1], [1, -1], [-1, 1], [1, 1]];
                        return piece.side === 'black' ? [[-1, 1], [1, 1]] : [[-1, -1], [1, -1]];
                    }
                    function legalMoves(index) {
                        const piece = cells[index], p = pos(index), result = [];
                        if (!piece) return result;
                        dirs(piece).forEach(function (dir) {
                            const nx = p.x + dir[0], ny = p.y + dir[1], step = ny * size + nx;
                            if (nx >= 0 && nx < size && ny >= 0 && ny < size && !cells[step]) result.push({ to: step, capture: -1 });
                            const jx = p.x + dir[0] * 2, jy = p.y + dir[1] * 2, mid = (p.y + dir[1]) * size + p.x + dir[0], jump = jy * size + jx;
                            if (jx >= 0 && jx < size && jy >= 0 && jy < size && cells[mid] && cells[mid].side !== piece.side && !cells[jump]) result.push({ to: jump, capture: mid });
                        });
                        return result;
                    }
                    function sideCanMove(side) {
                        return cells.some(function (piece, index) { return piece && piece.side === side && legalMoves(index).length; });
                    }
                    function choose(index) {
                        if (ended) return;
                        const piece = cells[index];
                        if (selected < 0) { if (piece && piece.side === turn) selected = index; drawBoard(); return; }
                        const move = legalMoves(selected).find(function (item) { return item.to === index; });
                        if (!move) { selected = piece && piece.side === turn ? index : -1; drawBoard(); return; }
                        cells[index] = cells[selected]; cells[selected] = null;
                        if (move.capture >= 0) cells[move.capture] = null;
                        if (cells[index].side === 'black' && pos(index).y === size - 1 || cells[index].side === 'white' && pos(index).y === 0) cells[index].king = true;
                        selected = -1; turn = turn === 'black' ? 'white' : 'black'; setScore(score + 1);
                        drawBoard();
                        if (!cells.some(function (piece) { return piece && piece.side === turn; }) || !sideCanMove(turn)) finish((turn === 'black' ? '白方' : '黑方') + '获胜。');
                    }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const grid = renderGrid(size, size, 'pk32-structured-payload-board');
                        cells.forEach(function (piece, index) {
                            const dark = (pos(index).x + pos(index).y) % 2 === 1;
                            const cell = button(piece ? (piece.side === 'black' ? '黑' : '白') + (piece.king ? '王' : '') : '', function () { choose(index); });
                            cell.dataset.cell = String(index); cell.dataset.side = piece ? piece.side : '';
                            cell.style.cssText = 'min-width:34px;min-height:34px;padding:0;background:' + (selected === index ? '#facc15' : dark ? '#475569' : '#cbd5e1') + ';color:' + (piece && piece.side === 'black' ? '#111827' : '#fff') + ';font-size:12px;font-weight:700;line-height:1.1;overflow:hidden;border-color:' + (dark ? '#0f172a' : '#94a3b8');
                            grid.appendChild(cell);
                        });
                        const actions = el('div', { className: 'pk32v-toolbar' });
                        actions.append(button('重置本局', function () { ended = false; renderCheckers2(payload, nav, detail); }));
                        panel.append(nav, grid, actions, detail);
                        prompt.textContent = config.name + '：按原帮助文本接入跳棋规则；当前轮到' + (turn === 'black' ? '黑方' : '白方') + '，斜走或跳吃，到底线加冕。原始载荷 ' + (payload.units || []).length + ' 个单位已绑定。';
                    }
                    drawBoard();
                }
                function renderJumpChess(payload, nav, detail) {
                    const size = 15, total = size * size;
                    const units = (payload.units || []).map(Number).filter(function (value) { return Number.isFinite(value) && value >= 0 && value < total; });
                    const traps = new Set(units);
                    const redCells = new Set(game.payloads.reduce(function (all, item) {
                        return all.concat((item.units || []).map(Number).filter(function (value) { return Number.isFinite(value) && value >= 0 && value < total; }));
                    }, []));
                    let cells = Array(total).fill(null), selected = -1, turn = 'human', dice = [roll(), roll()], dieIndex = 0, moved = 0;
                    for (let x = 2; x < 12; x += 1) { cells[(size - 1) * size + x] = { side: 'human' }; cells[x] = { side: 'ai' }; }
                    function roll() { return 1 + randomInt(6); }
                    function addBasePiece(side) {
                        const row = side === 'human' ? size - 1 : 0;
                        for (let x = 2; x < 12; x += 1) {
                            const index = row * size + x;
                            if (!cells[index]) { cells[index] = { side: side }; return true; }
                        }
                        return false;
                    }
                    function direction(side) { return side === 'human' ? -1 : 1; }
                    function pos(index) { return { x: index % size, y: Math.floor(index / size) }; }
                    function pathBetween(from, to) {
                        const a = pos(from), b = pos(to), dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
                        if (a.x !== b.x && a.y !== b.y && Math.abs(b.x - a.x) !== Math.abs(b.y - a.y)) return [];
                        const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)), path = [];
                        for (let step = 1; step < steps; step += 1) path.push((a.y + dy * step) * size + a.x + dx * step);
                        return path;
                    }
                    function legalMoves(index) {
                        const piece = cells[index], p = pos(index), steps = dice[dieIndex] || 1, result = [];
                        if (!piece || piece.side !== turn) return result;
                        [[0, direction(piece.side)], [-1, direction(piece.side)], [1, direction(piece.side)]].forEach(function (dir) {
                            const x = p.x + dir[0] * steps, y = p.y + dir[1] * steps, to = y * size + x;
                            if (x >= 0 && x < size && y >= 0 && y < size && (!cells[to] || cells[to].red)) result.push(to);
                        });
                        return result;
                    }
                    function finishTurn() {
                        selected = -1; dieIndex = 0; moved = 0; turn = turn === 'human' ? 'ai' : 'human'; dice = [roll(), roll()];
                        drawBoard();
                        if (turn === 'ai') setTimeout(aiMove, 350);
                    }
                    function sideCount(side) { return cells.filter(function (piece) { return piece && piece.side === side && !piece.red; }).length; }
                    function moveTo(index) {
                        if (ended || selected < 0 || legalMoves(selected).indexOf(index) < 0) return;
                        const piece = cells[selected], jumped = pathBetween(selected, index).filter(function (cell) { return cells[cell] && cells[cell].side !== piece.side && !cells[cell].red; });
                        jumped.forEach(function (cell) { cells[cell] = { red: true }; redCells.add(cell); });
                        if (traps.has(index)) { cells[selected] = null; selected = -1; }
                        else {
                            if (cells[index] && cells[index].red) addBasePiece(piece.side);
                            redCells.delete(index); cells[index] = piece; cells[selected] = null; selected = index;
                        }
                        setScore(score + 1); moved += 1; dieIndex += 1;
                        if (!sideCount('human') || !sideCount('ai')) return finish((sideCount('human') ? '玩家' : '电脑') + '获胜。');
                        if (moved >= 2) finishTurn(); else drawBoard();
                    }
                    function choose(index) {
                        if (ended || turn !== 'human') return;
                        const piece = cells[index];
                        if (selected < 0) { if (piece && piece.side === turn) selected = index; drawBoard(); return; }
                        if (legalMoves(selected).indexOf(index) >= 0) moveTo(index);
                        else { selected = piece && piece.side === turn ? index : -1; drawBoard(); }
                    }
                    function aiMove() {
                        if (ended || turn !== 'ai') return;
                        const pieces = cells.map(function (piece, index) { return piece && piece.side === 'ai' ? index : -1; }).filter(function (index) { return index >= 0; });
                        const candidate = pieces.map(function (index) { return { from: index, moves: legalMoves(index) }; }).find(function (item) { return item.moves.length; });
                        if (!candidate) return finish('玩家获胜。');
                        selected = candidate.from; moveTo(candidate.moves[0]);
                        if (turn === 'ai') setTimeout(aiMove, 250);
                    }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const grid = renderGrid(size, size, 'pk32-structured-payload-board');
                        const legal = selected >= 0 ? legalMoves(selected) : [];
                        for (let index = 0; index < total; index += 1) {
                            const piece = cells[index], trap = traps.has(index), red = redCells.has(index) || piece && piece.red;
                            const label = piece && piece.red ? '红' : piece ? (piece.side === 'human' ? '我' : '对') : trap ? '陷' : red ? '红' : '';
                            const cell = button(label, function () { choose(index); });
                            cell.dataset.cell = String(index); cell.dataset.trap = String(trap); cell.dataset.red = String(red); cell.dataset.side = piece && piece.side || '';
                            cell.style.cssText = 'min-width:24px;min-height:24px;padding:0;background:' + (selected === index ? '#facc15' : legal.indexOf(index) >= 0 ? '#16a34a' : piece && piece.side === 'human' ? '#2563eb' : piece && piece.side === 'ai' ? '#7c3aed' : red ? '#dc2626' : trap ? '#57534e' : '#0f172a') + ';color:#fff;font-size:10px;font-weight:700;line-height:1.1;overflow:hidden';
                            grid.appendChild(cell);
                        }
                        const actions = el('div', { className: 'pk32v-toolbar' });
                        actions.append(button('重掷本局', function () { ended = false; renderJumpChess(payload, nav, detail); }));
                        panel.append(nav, grid, actions, detail);
                        prompt.textContent = config.name + '：第 ' + (level + 1) + ' / ' + game.payloads.length + ' 条原始载荷；' + (turn === 'human' ? '玩家' : '电脑') + '回合，骰点 ' + dice.join('、') + '，正在移动第 ' + (dieIndex + 1) + ' 子。跃过对方变红，踩陷阱损失，落到红棋补回底线。';
                    }
                    drawBoard();
                    if (turn === 'ai') setTimeout(aiMove, 350);
                }
                function renderSuspectSokoban(payload, nav, detail) {
                    const units = (payload.units || []).map(Number).filter(Number.isFinite);
                    const paired = payload.family === 'paired-code-candidate';
                    const width = paired && units.length >= 50 ? 10 : Math.round(Math.sqrt(units.length));
                    const height = paired && units.length >= 50 ? 5 : width;
                    const baseCount = Math.min(width * height, units.length);
                    const raw = units.slice(0, baseCount);
                    const tail = paired ? units.slice(baseCount).filter(function (value) { return value >= 0 && value < 100; }) : [];
                    let player = raw.findIndex(function (value) { return value === 9; });
                    if (player < 0) player = raw.findIndex(function (value) { return value === 0 || value === 90 || value % 10 === 9; });
                    if (player < 0) player = 0;
                    const boxes = new Map(), goals = new Map();
                    raw.forEach(function (value, index) {
                        if (value > 0 && value < 90 && value % 10 === 9) goals.set(index, Math.floor(value / 10) || 0);
                        if (value === 90) goals.set(index, 0);
                        if (value > 0 && value < 90 && value % 10 === 0) boxes.set(index, Math.floor(value / 10) || 0);
                    });
                    tail.forEach(function (value, index) {
                        const x = value % 10, y = Math.floor(value / 10), pos = y * width + x;
                        if (x >= 0 && x < width && y >= 0 && y < height && raw[pos] !== 99 && !boxes.has(pos)) boxes.set(pos, index + 1);
                    });
                    function wall(index) { return raw[index] === 99; }
                    function sameRow(a, b) { return Math.floor(a / width) === Math.floor(b / width); }
                    function solved() {
                        if (!boxes.size || !goals.size) return false;
                        return Array.from(boxes).every(function (entry) {
                            const goal = goals.get(entry[0]);
                            return goal != null && (goal === 0 || goal === entry[1]);
                        });
                    }
                    function move(delta) {
                        if (ended) return;
                        const next = player + delta, beyond = next + delta;
                        if (next < 0 || next >= baseCount || wall(next)) return;
                        if ((delta === 1 || delta === -1) && !sameRow(player, next)) return;
                        if (boxes.has(next)) {
                            if (beyond < 0 || beyond >= baseCount || wall(beyond) || boxes.has(beyond)) return;
                            if ((delta === 1 || delta === -1) && !sameRow(next, beyond)) return;
                            const color = boxes.get(next); boxes.delete(next); boxes.set(beyond, color);
                        }
                        player = next; setScore(score + 1); drawBoard();
                        if (solved()) finish('所有箱子已经推到相同颜色花朵上。');
                    }
                    function drawBoard() {
                        panel.innerHTML = '';
                        const grid = renderGrid(width, height, 'pk32-structured-payload-board');
                        for (let index = 0; index < baseCount; index += 1) {
                            const box = boxes.get(index), goal = goals.get(index), isWall = wall(index);
                            const label = index === player ? '人' : box != null ? '箱' + box : goal != null ? '花' + goal : isWall ? '墙' : '';
                            const cell = button(label, function () { const delta = index - player; if ([1, -1, width, -width].indexOf(delta) >= 0) move(delta); });
                            cell.dataset.code = String(raw[index]); cell.dataset.box = box == null ? '' : String(box); cell.dataset.goal = goal == null ? '' : String(goal);
                            cell.style.cssText = 'min-width:30px;min-height:30px;padding:0;background:' + (index === player ? '#facc15' : box != null ? colorFor(box) : goal != null ? '#065f46' : isWall ? '#1f2937' : '#0f172a') + ';color:#fff;font-size:10px;font-weight:700;line-height:1.1;overflow:hidden';
                            grid.appendChild(cell);
                        }
                        const controls = el('div', { className: 'pk32v-controls' });
                        [['上', -width], ['下', width], ['左', -1], ['右', 1]].forEach(function (item) { controls.append(button(item[0], function () { move(item[1]); })); });
                        panel.append(nav, grid, controls, detail);
                        prompt.textContent = config.name + '：按原帮助文本接入推箱子规则；第 ' + (level + 1) + ' / ' + game.payloads.length + ' 条载荷，推动箱子到相同颜色花朵。';
                    }
                    drawBoard();
                }
                function renderMemoryPairsNative(payload, nav, detail) {
                    const units = (payload.units || []).map(Number).filter(Number.isFinite);
                    const pairCount = Math.max(6, Math.min(18, Math.floor(((payload.structure && payload.structure.headerValue) || units.length || 24) / 4)));
                    const base = Array.from({ length: pairCount }, function (_, index) { return (Math.abs(units[index] || index) % 16) + 1; });
                    let cards = base.concat(base).map(function (value, index) { return { value: value, open: false, done: false, seed: units[index % Math.max(1, units.length)] || index }; });
                    cards.sort(function (a, b) { return a.seed - b.seed || a.value - b.value; });
                    let opened = [], misses = 0;
                    function drawBoard() {
                        panel.innerHTML = '';
                        const width = Math.ceil(Math.sqrt(cards.length));
                        const grid = renderGrid(width, Math.ceil(cards.length / width), 'pk32-structured-payload-board');
                        cards.forEach(function (card, index) {
                            const visible = card.open || card.done;
                            const cell = button(visible ? String(card.value) : '?', function () {
                                if (ended || card.done || card.open || opened.length >= 2) return;
                                card.open = true; opened.push(index); drawBoard();
                                if (opened.length === 2) {
                                    const a = cards[opened[0]], b = cards[opened[1]];
                                    if (a.value === b.value) {
                                        a.done = true; b.done = true; opened = []; setScore(score + 20);
                                        if (cards.every(function (item) { return item.done; })) finish('所有相同图案已经消去。');
                                        else drawBoard();
                                    } else {
                                        misses += 1; setScore(Math.max(0, score - 1));
                                        setTimeout(function () { a.open = false; b.open = false; opened = []; drawBoard(); }, 450);
                                    }
                                }
                            });
                            cell.dataset.value = String(card.value);
                            cell.style.cssText = 'min-width:38px;min-height:38px;padding:0;background:' + (card.done ? '#065f46' : visible ? colorFor(card.value) : '#1f2937') + ';color:#fff;font-size:14px;font-weight:700;line-height:1.1;overflow:hidden';
                            grid.appendChild(cell);
                        });
                        const actions = el('div', { className: 'pk32v-toolbar' });
                        actions.append(button('重置本关', function () { ended = false; cards.forEach(function (card) { card.open = false; card.done = false; }); opened = []; misses = 0; setScore(0); drawBoard(); }));
                        panel.append(nav, grid, actions, detail);
                        prompt.textContent = config.name + '：按原帮助文本接入翻牌配对消除；第 ' + (level + 1) + ' / ' + game.payloads.length + ' 条载荷，错误 ' + misses + ' 次。';
                    }
                    drawBoard();
                }
                function draw() {
                    panel.innerHTML = '';
                    const payload = game.payloads[level], units = payload.units || [], shape = chooseShape(payload);
                    const width = Math.max(1, shape.width || 1), height = shape.height || Math.ceil(units.length / width);
                    const nav = el('div', { className: 'pk32v-toolbar' });
                    nav.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(game.payloads.length - 1, level + 1); select.value = String(level); draw(); }), select);
                    const grid = renderGrid(width, height, 'pk32-structured-payload-board');
                    units.slice(0, width * height).forEach(function (value, index) {
                        const cell = button(String(value == null ? '' : value), function () { cell.classList.toggle('pk32-structured-selected'); });
                        cell.dataset.code = String(value == null ? '' : value);
                        cell.dataset.cell = String(index);
                        cell.title = '偏移 ' + payload.offset + '，格 ' + (index + 1) + '，值 ' + cell.dataset.code;
                        cell.style.cssText = 'min-width:24px;min-height:24px;padding:0;background:' + colorFor(value) + ';color:#fff;font-size:10px;line-height:1.1;overflow:hidden';
                        grid.appendChild(cell);
                    });
                    const detail = el('details', {});
                    detail.append(el('summary', {}, '查看载荷结构'), el('pre', { className: 'pk32v-native-grid' }, JSON.stringify({
                        family: payload.family,
                        confidence: payload.confidence,
                        offset: payload.offset,
                        length: payload.length,
                        unitCount: payload.unitCount,
                        structure: payload.structure,
                        prefix: payload.prefix,
                        trailer: payload.trailer,
                        semanticsVerified: payload.semanticsVerified
                    }, null, 2)));
                    if (config.name === '扩展线路' && /^dimension-prefix-paired-cell/.test(payload.family)) return renderExtendLines(payload, nav, detail);
                    if (config.name === '马跳棋盘' && /^dimension-prefix-/.test(payload.family)) return renderKnightBoard(payload, nav, detail);
                    if (config.name === '数独' && payload.family === 'fixed-area-candidate') return renderSudoku(payload, nav, detail);
                    if (config.name === '平面魔方' && payload.family === 'fixed-area-candidate') return renderFlatCube(payload, nav, detail);
                    if (config.name === '吃豆子' && payload.family === 'fixed-area-candidate') return renderPacDots(payload, nav, detail);
                    if (config.name === '彩球连线' && payload.family === 'paired-code-candidate') return renderColorLinks(payload, nav, detail);
                    if (config.name === '移彩球' && payload.family === 'fixed-area-candidate') return renderMoveBalls(payload, nav, detail);
                    if (config.name === '跳跃棋' && payload.family === 'three-digit-index-candidate') return renderJumpChess(payload, nav, detail);
                    if (config.name === '跳棋二' && payload.family === 'paired-code-candidate') return renderCheckers2(payload, nav, detail);
                    if (config.name === '拼疑犯' && (payload.family === 'paired-code-candidate' || payload.family === 'numeric-mixed')) return renderSuspectSokoban(payload, nav, detail);
                    if (config.name === '反应测试' && payload.family === 'legacy-100-stream') return renderMemoryPairsNative(payload, nav, detail);
                    panel.append(nav, grid, detail);
                    prompt.textContent = config.name + '：已绑定原始结构化载荷 ' + (level + 1) + ' / ' + game.payloads.length + '；当前只是内容迁移适配层，规则语义仍待按原程序确认。';
                }
                select.onchange = function () { level = Number(select.value) || 0; draw(); };
                draw();
            }).catch(function () { prompt.textContent = config.name + '结构化载荷加载失败'; });
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
            if (config.name === '摘花朵') return renderNativePickFlowers();
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
            if (config.name === '华容道') return renderNativeHuarong();
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
                  function draw() { panel.innerHTML = ''; const nav = el('div', { className: 'pk32v-toolbar' }); nav.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select); const item = data.levels[level], width = item.cells.length === 150 ? 15 : 19, chunks = item.cells.match(new RegExp('.{1,' + width + '}', 'g')) || [], grid = renderGrid(width, chunks.length, 'pk32-tangram-board'); chunks.join('').split('').forEach(function (value) { const cell = button(value === '0' ? '' : value, function () { cell.classList.toggle('pk32-tangram-selected'); }); cell.dataset.code = value; cell.style.cssText = 'min-width:22px;min-height:22px;padding:0;background:' + (value === '0' ? '#0f172a' : value === '1' ? '#ef4444' : value === '2' ? '#f59e0b' : value === '3' ? '#eab308' : value === '4' ? '#22c55e' : value === '5' ? '#38bdf8' : '#a78bfa') + ';color:#111;font-size:10px'; grid.appendChild(cell); }); panel.appendChild(nav); panel.appendChild(grid); prompt.textContent = '七巧板：原版声明 80 关；当前原始载荷 ' + (level + 1) + ' / ' + data.levels.length + '，每条载荷含 10 个图形；几何规则仍在校核。'; }
                select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw();
            }).catch(function () { prompt.textContent = '七巧板原生载荷加载失败'; });
        }
        function renderNativeSyncMove() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载同步移动原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-sync-move-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0; const select = el('select', { 'aria-label': '同步移动原生数据' });
                data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '已定位数据 ' + (index + 1))); });
                  function draw() { panel.innerHTML = ''; const nav = el('div', { className: 'pk32v-toolbar' }); nav.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select); const item = data.levels[level], width = item.cells.length >= 140 ? 14 : 9, cells = item.cells.split(''), grid = renderGrid(width, Math.ceil(cells.length / width), 'pk32-sync-board'); cells.forEach(function (value, index) { const cell = button(value === '0' ? '' : value === '7' ? '白' : value === '8' ? '黑' : '·', function () { if (value === '0') return; cell.dataset.selected = 'true'; }); cell.dataset.code = value; cell.style.cssText = 'min-width:28px;min-height:28px;padding:0;border-radius:50%;background:' + (value === '7' ? '#f8fafc;color:#111' : value === '8' ? '#111827;color:#fff' : '#64748b;color:#fff') + ';font-size:11px'; grid.appendChild(cell); }); panel.appendChild(nav); panel.appendChild(grid); prompt.textContent = '同步移动：原生数据 ' + (level + 1) + ' / ' + data.levels.length + '；白棋无棋可下时黑棋继续。棋盘编码和落子规则正在校核。'; }
                select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw();
            }).catch(function () { prompt.textContent = '同步移动原生载荷加载失败'; });
        }
        function renderNativeBlackHole() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载宇宙黑洞原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-black-hole-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                const playableLevels = data.levels.slice(0, data.nativeLevelCount || data.levels.length);
                let level = 0; const select = el('select', { 'aria-label': '宇宙黑洞原生数据' }); playableLevels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '原版关卡 ' + (index + 1))); });
                function draw() { panel.innerHTML = ''; const nav = el('div', { className: 'pk32v-toolbar' }); nav.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(playableLevels.length - 1, level + 1); select.value = String(level); draw(); }), select); panel.appendChild(nav); const item = playableLevels[level]; const width = item.cells.length === 676 ? 26 : item.cells.length === 168 ? 14 : item.cells.length === 36 ? 6 : item.cells.length; const rows = item.cells.match(new RegExp('.{1,' + width + '}', 'g')) || [], grid = renderGrid(width, rows.length, 'pk32-black-hole-board'); rows.join('').split('').forEach(function (value) { const cell = button(value === '0' ? '' : value, function () { cell.classList.toggle('pk32-black-hole-selected'); }); cell.dataset.code = value; cell.style.cssText = 'min-width:24px;min-height:24px;padding:0;background:' + (value === '0' ? '#0f172a' : value === '1' ? '#38bdf8' : value === '2' ? '#f59e0b' : value === '5' ? '#ef4444' : '#64748b') + ';color:#fff;font-size:10px'; grid.appendChild(cell); }); panel.appendChild(grid); prompt.textContent = '宇宙黑洞：原版 30 关；原生关卡 ' + (level + 1) + ' / ' + playableLevels.length + '。另有 ' + Math.max(0, data.levels.length - playableLevels.length) + ' 条待确认载荷未开放，物品碰撞规则仍在校核。'; }
                select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw();
            }).catch(function () { prompt.textContent = '宇宙黑洞原生载荷加载失败'; });
        }
        function renderNativeNextHundred() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '下一百层 · 交换彩球'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            let values = ['L', 'L', 'L', '', 'R', 'R', 'R']; let seconds = 15; let timer, nativeLevel = 0, nativeData = null, nativeSelect = null;
            cleanups.push(function () { clearInterval(timer); });
            function startTimer() { clearInterval(timer); timer = setInterval(function () { seconds -= 1; if (seconds <= 0) { seconds = 0; clearInterval(timer); } draw(); }, 1000); }
              function draw() { panel.innerHTML = ''; const line = el('div', { className: 'pk32v-toolbar' }); values.forEach(function (value, index) { const b = button(value === 'L' ? '左球' : value === 'R' ? '右球' : '空位', function () { if (!value || seconds <= 0) return; const targets = value === 'L' ? [index + 1, index + 2] : [index - 1, index - 2]; const target = targets.find(function (x) { return x >= 0 && x < values.length && values[x] === '' && (Math.abs(x - index) === 1 || values[index + (x - index) / 2]); }); if (target == null) return; values[target] = value; values[index] = ''; draw(); if (values.join('') === 'RRRLLL') finish('交换完成！'); }); b.disabled = !value || seconds <= 0; line.appendChild(b); }); panel.appendChild(line); const reset = button('重置 15 秒', function () { values = ['L', 'L', 'L', '', 'R', 'R', 'R']; seconds = 15; startTimer(); draw(); }); panel.appendChild(reset); if (nativeSelect) { nativeSelect.value = String(nativeLevel); panel.appendChild(nativeSelect); } prompt.textContent = '原版规则：左侧彩球向右、右侧彩球向左，可移动一格或越过一个彩球；剩余 ' + seconds + ' 秒。当前规则盘面，原生 4 条数据已定位。'; }
            fetch('/data/pk32-next-hundred-levels.json').then(function (response) { return response.json(); }).then(function (data) { nativeData = data; nativeSelect = el('select', { 'aria-label': '下一百层原生载荷' }); data.levels.forEach(function (item, index) { nativeSelect.appendChild(el('option', { value: String(index) }, '原生数据 ' + (index + 1))); }); nativeSelect.onchange = function () { nativeLevel = Number(nativeSelect.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '原生载荷加载失败，使用规则验证盘面。'; }); startTimer(); draw();
        }
          function renderNativePreviousHundred() {
              const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载上一百层原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
              fetch('/data/pk32-previous-hundred-levels.json').then(function (response) { return response.json(); }).then(function (data) { const item = data.levels[0], width = 12, cells = item.cells.split(''), grid = renderGrid(width, Math.ceil(cells.length / width), 'pk32-previous-hundred-board'); cells.forEach(function (value) { const cell = button(value, function () { cell.classList.toggle('pk32-previous-hundred-selected'); }); cell.dataset.code = value; cell.style.cssText = 'min-width:24px;min-height:24px;padding:0;background:' + (value === '1' ? '#38bdf8' : value === '2' ? '#facc15' : value === '3' ? '#ef4444' : value === '4' ? '#4ade80' : '#64748b') + ';color:#111;font-size:10px'; grid.appendChild(cell); }); panel.appendChild(grid); prompt.textContent = '上一百层：已定位原生盘面 1 条，12×' + Math.ceil(cells.length / width) + '；关卡规则仍在解析。'; }).catch(function () { prompt.textContent = '上一百层原生载荷加载失败'; });
          }
        function renderNativeFlyHundred() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载飞一百米原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-fly-hundred-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '飞一百米原生数据' }); data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '原生盘面 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level], header = item.cells.slice(0, 4).match(/.{2}/g), width = Number(header[0]), height = Number(header[1]), cells = item.cells.slice(4).split(''), grid = renderGrid(width, height, 'pk32-fly-hundred-board'); cells.forEach(function (value) { const cell = button(value === '0' ? '' : value, function () { cell.classList.toggle('pk32-fly-hundred-hit'); }); cell.dataset.code = value; cell.style.cssText = 'min-width:22px;min-height:22px;padding:0;background:' + (value === '0' ? '#0f172a' : value === '4' ? '#facc15' : value === '9' ? '#ef4444' : value === '1' ? '#38bdf8' : '#64748b') + ';color:#fff;font-size:10px'; grid.appendChild(cell); }); panel.append(button('上一条', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一条', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, grid); prompt.textContent = '飞一百米：原生盘面 ' + (level + 1) + ' / ' + data.levels.length + '，尺寸 ' + width + '×' + height + '；障碍与飞行碰撞规则校核中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '飞一百米原生载荷加载失败'; });
        }
        function renderNativeBreakout() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载打砖块原生载荷…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-breakout-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0, timer = null, cells = [], paddle = 6, ball = { x: 7.5, y: 8.7, dx: 0.08, dy: -0.12 };
                const select = el('select', {}); select.setAttribute('aria-label', '打砖块原生关卡'); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); });
                cleanups.push(function () { if (timer) cancelAnimationFrame(timer); });
                function move(delta) { paddle = Math.max(0, Math.min(12, paddle + delta)); draw(); }
                function reset() { if (timer) cancelAnimationFrame(timer); timer = null; ended = false; cells = data.levels[level].cells.split('').map(Number); paddle = 6; ball = { x: 7.5, y: 8.7, dx: 0.08, dy: -0.12 }; draw(); animate(); }
                function draw() { panel.innerHTML = ''; const nav = el('div', { className: 'pk32v-toolbar' }); nav.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); reset(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); reset(); }), button('重开本关', reset), select); const stage = el('div', { className: 'pk32-breakout-stage', style: 'position:relative;width:min(100%,450px);aspect-ratio:3/2;background:#18212b;overflow:hidden' }); cells.forEach(function (value, index) { if (!value) return; stage.appendChild(el('span', { style: 'position:absolute;left:' + (index % 15 * 6.66) + '%;top:' + (Math.floor(index / 15) * 7) + '%;width:6.2%;height:6%;background:hsl(' + (value * 42) + ' 70% 52%);border:1px solid #fff8' })); }); const bat = el('span', { style: 'position:absolute;bottom:4%;width:20%;height:3%;background:#f4d35e' }), dot = el('span', { style: 'position:absolute;width:3%;aspect-ratio:1;border-radius:50%;background:#fff' }); stage.append(bat, dot); const controls = el('div', { className: 'pk32v-controls' }); controls.append(button('向左', function () { move(-1); }), button('向右', function () { move(1); })); panel.append(nav, stage, controls); bat.style.left = paddle * 6.66 + '%'; dot.style.left = ball.x * 6.66 + '%'; dot.style.top = ball.y * 10 + '%'; prompt.textContent = '原版关卡：第 ' + (level + 1) + ' / ' + data.levels.length + '；15×10 砖块盘面，左右移动挡板。'; }
                function animate() { if (ended) return; ball.x += ball.dx; ball.y += ball.dy; if (ball.x <= 0 || ball.x >= 14.5) ball.dx *= -1; if (ball.y <= 0) ball.dy *= -1; if (ball.y >= 8.9 && ball.x >= paddle - 0.5 && ball.x <= paddle + 3.5) ball.dy = -Math.abs(ball.dy); const row = Math.floor(ball.y), col = Math.floor(ball.x); if (row >= 0 && row < 10 && col >= 0 && col < 15 && cells[row * 15 + col]) { cells[row * 15 + col] = 0; ball.dy *= -1; setScore(score + 1); if (!cells.some(Boolean)) { finish('打砖块第 ' + (level + 1) + ' 关完成。'); return; } } if (ball.y > 10) { prompt.textContent = '小球落出场外，点击重开继续本关。'; return; } draw(); timer = requestAnimationFrame(animate); }
                select.onchange = function () { level = Number(select.value) || 0; reset(); }; reset();
            }).catch(function () { prompt.textContent = '打砖块原生载荷加载失败'; });
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
                    prompt.textContent = '原生关卡 ' + (level + 1) + ' / ' + data.levels.length + '；编码长度 ' + item.cells.length + '，立体坐标解析中。';
                }
                select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw();
            }).catch(function () { prompt.textContent = '立体魔方二原生数据加载失败'; });
        }
        function renderNativeMirror() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载反射镜原生关卡…');
            const panel = el('div', { className: 'pk32v-native-data' });
            body.append(prompt, panel);
            fetch('/data/pk32-mirror-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                  const item = data.levels[0], width = 17; let cells = item.cells.split(''); const initialCells = cells.slice();
                  const grid = renderGrid(width, 6, 'pk32-mirror-board');
                  cells.forEach(function (_, i) { grid.appendChild(button('', function () { cells[i] = cells[i] === '0' ? '1' : cells[i] === '1' ? '2' : '0'; paint(); })); });
                function paint(path) { cells.forEach(function (value, i) { grid.children[i].textContent = path && path.indexOf(i) >= 0 ? '·' : value === '1' ? '/' : value === '2' ? '\\' : value === '3' ? '●' : value === '4' ? '★' : ''; }); }
                  const controls = el('div', { className: 'pk32v-controls' }); controls.append(button('发射光线', function () { let x = 0, y = 0, dx = 1, dy = 0, path = [], hit = false; for (let step = 0; step < width * 6; step += 1) { if (x < 0 || x >= width || y < 0 || y >= 6) break; const i = y * width + x; path.push(i); if (cells[i] === '4') { hit = true; break; } if (cells[i] === '1') { const t = dx; dx = -dy; dy = -t; } else if (cells[i] === '2') { const t = dx; dx = dy; dy = t; } x += dx; y += dy; } paint(path); setScore(hit ? score + 50 : score); prompt.textContent = hit ? '光线命中目标，本关完成。' : '光线未命中目标，请调整镜面方向。'; if (hit) finish('反射成功。'); }), button('重置镜面', function () { cells = initialCells.slice(); ended = false; paint(); }));
                  panel.append(grid, controls); paint(); prompt.textContent = '原始载荷 1 条；关数尚未确认。当前仅提供斜镜方向与光线演示，原始坐标编码仍在解析。';
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
                function groups() { const found = [], seen = new Set(); function same(a, b) { return a && b && (a === b || a === '4' || b === '4'); } for (let y = 0; y < values.length; y += 1) for (let x = 0; x < width; x += 1) { const key = x + ':' + y; if (seen.has(key) || !values[y][x] || values[y][x] === '0') continue; const group = [], queue = [[x, y]]; seen.add(key); while (queue.length) { const point = queue.shift(), px = point[0], py = point[1]; group.push(point); [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]].forEach(function (next) { const nx = next[0], ny = next[1], nk = nx + ':' + ny; if (nx >= 0 && nx < width && ny >= 0 && ny < values.length && !seen.has(nk) && same(values[py][px], values[ny][nx])) { seen.add(nk); queue.push(next); } }); } const colors = group.filter(function (point) { return values[point[1]][point[0]] !== '4'; }); if (colors.length >= 3 || (group.some(function (point) { return values[point[1]][point[0]] === '4'; }) && colors.length >= 2)) found.push(group); } return found; }
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
                nav.append(button('上一关', function () { ended = false; level = Math.max(0, level - 1); draw(); }), button('下一关', function () { ended = false; level = Math.min(levels.length - 1, level + 1); draw(); }));
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
                    const raw = item.cells.length === width * width + 4 ? item.cells.slice(4) : item.cells;
                    return raw.match(new RegExp('.{1,' + width + '}', 'g')).map(function (row) { return row.replace(/0/g, '.').replace(/1/g, '#').replace(/2/g, 'B').replace(/3/g, 'S').replace(/4/g, 'E').replace(/5/g, '.').replace(/6/g, '.').replace(/7/g, '.').replace(/9/g, '.'); });
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
            if (config.name === '碰撞彩球') return renderNativeCollisionBalls();
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
            fetch('/data/pk32-castle2-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0, selected = 2; const select = el('select', { 'aria-label': '魔法城堡二原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function shape(length) { let width = Math.ceil(Math.sqrt(length)); while (width < length && length % width !== 0) width += 1; return { width: width, height: Math.ceil(length / width) }; } function draw() { panel.innerHTML = ''; const item = data.levels[level], size = shape(item.cells.length), grid = renderGrid(size.width, size.height, 'pk32-castle2-board'); item.cells.split('').forEach(function (value, index) { const cell = button('', function () { if (value === '0') { cell.dataset.player = 'true'; } }); cell.dataset.cell = String(index); cell.dataset.value = value; cell.style.cssText = 'min-width:28px;min-height:28px;padding:0;border-radius:2px;background:' + ({ '0': '#1e293b', '1': '#64748b', '2': '#2563eb', '3': '#dc2626', '4': '#b91c1c' }[value] || '#a855f7') + ';color:#fff;font-size:12px'; cell.textContent = value === '0' ? '' : value === '2' ? '蓝' : value === '3' ? '红门' : value === '4' ? '红' : value; grid.appendChild(cell); }); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, grid); prompt.textContent = '魔法城堡二：原版 40 关；原生盘面 ' + (level + 1) + ' / ' + data.levels.length + '。蓝色方块可创建，红色方块不可消除，蓝门传送到红门，走到出口过关。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '魔法城堡二原生数据加载失败'; });
        }
        function renderNativeCastle() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载魔法城堡原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-castle-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0, selected = 28, balls = [];
                const select = el('select', { 'aria-label': '魔法城堡原生关卡' });
                data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); });
                function parse(item) { const cells = []; for (let i = 0; i + 5 < item.cells.length; i += 6) cells.push({ x: Number(item.cells.slice(i, i + 2)), y: Number(item.cells.slice(i + 2, i + 4)), color: Number(item.cells.slice(i + 4, i + 6)) }); return cells; }
                function line(group) { const required = group[0] && group[0].color === 39 ? 4 : 3; if (group.length < required) return false; const sameY = group.every(function (b) { return b.y === group[0].y; }), sameX = group.every(function (b) { return b.x === group[0].x; }); return sameX || sameY; }
                function resolve(placed) { const matches = [], axes = [[1, 0], [0, 1]]; axes.forEach(function (axis) { const group = [placed]; [-1, 1].forEach(function (direction) { let x = placed.x + axis[0] * direction, y = placed.y + axis[1] * direction, next; while ((next = balls.find(function (ball) { return ball.x === x && ball.y === y && ball.color === placed.color; }))) { group.push(next); x += axis[0] * direction; y += axis[1] * direction; } }); if (line(group)) group.forEach(function (ball) { if (!matches.includes(ball)) matches.push(ball); }); }); if (!matches.length) return false; const axis = matches.every(function (ball) { return ball.y === placed.y; }) ? [1, 0] : [0, 1]; const direction = [placed.x + axis[0], placed.y + axis[1]]; const pushed = balls.find(function (ball) { return ball.x === direction[0] && ball.y === direction[1] && ball !== placed; }); if (pushed) { const nx = pushed.x + axis[0], ny = pushed.y + axis[1]; if (nx >= 0 && nx < 20 && ny >= 0 && ny < 12 && !balls.some(function (ball) { return ball.x === nx && ball.y === ny; })) { pushed.x = nx; pushed.y = ny; } } matches.forEach(function (ball) { const index = balls.indexOf(ball); if (index >= 0) balls.splice(index, 1); }); setScore(score + matches.length * 10); return true; }
                function draw() { panel.innerHTML = ''; const item = data.levels[level], board = renderGrid(20, 12, 'pk32-castle-board'); board.style.maxWidth = '560px'; for (let index = 0; index < 240; index += 1) { const x = index % 20, y = Math.floor(index / 20), ball = balls.find(function (value) { return value.x === x && value.y === y; }), b = button('', function () { if (!ball) { const placed = { x: x, y: y, color: selected }; balls.push(placed); if (resolve(placed)) { prompt.textContent = '已按原版规则消除直线彩球并推动相邻彩球。'; } draw(); if (!balls.length) finish('所有彩球已消除，本关完成。'); } }); b.style.cssText = 'grid-column:' + (x + 1) + ';grid-row:' + (y + 1) + ';min-width:26px;min-height:26px;padding:0;border-radius:50%;background:' + (ball ? ({ 28: '#e74c3c', 29: '#35a853', 30: '#3b82f6', 39: '#888' }[ball.color] || '#f1c40f') : 'transparent') + ';color:transparent'; b.disabled = !!ball; board.appendChild(b); }
                    const colors = [28, 29, 30, 39].map(function (color) { const b = button('●', function () {}); b.style.cssText = 'min-width:42px;min-height:42px;border-radius:50%;background:' + ({ 28: '#e74c3c', 29: '#35a853', 30: '#3b82f6', 39: '#888' }[color]) + ';color:transparent;outline:' + (selected === color ? '3px solid #111' : 'none'); b.onclick = function () { selected = color; colors.forEach(function (item) { item.style.outline = 'none'; }); b.style.outline = '3px solid #111'; draw(); }; return b; });
                    const controls = el('div', { className: 'pk32v-toolbar' }); controls.append.apply(controls, colors); panel.append(button('上一关', function () { ended = false; level = Math.max(0, level - 1); select.value = String(level); reset(); }), button('下一关', function () { ended = false; level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); reset(); }), select, controls, board); prompt.textContent = '魔法城堡：原版 100 关；当前已提取 ' + data.levels.length + ' 关，当前第 ' + (level + 1) + ' 关。选择颜色后点击空格放置彩球；三球直线（灰球四球）消除。'; }
                function reset() { balls = parse(data.levels[level]); draw(); }
                select.onchange = function () { ended = false; level = Number(select.value) || 0; reset(); }; reset();
            }).catch(function () { prompt.textContent = '魔法城堡原生数据加载失败'; });
        }
        // 智慧之光已迁移为独立模块 public/js/minigames/pk32-light.js（经 20 段原版演示回放验证），
        // 由 pk32.js 的 PLAYABLE 路由直接启动，不再走本文件的旧版实现。

        function renderNativeBurst() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载爆破彩球原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-burst-balls-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '爆破彩球原生关卡' }); data.levels.forEach(function (item, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const raw = data.levels[level].cells, width = 12, rows = raw.match(/.{1,12}/g), grid = renderGrid(width, rows.length, 'bubble-board'); rows.join('').split('').forEach(function (value, index) { grid.appendChild(button(value === '0' ? '·' : value, function () { if (value !== '0') { this.disabled = true; this.textContent = '·'; setScore(score + 3); } })); }); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, grid); prompt.textContent = '原版关卡数未知；原生数据 ' + (level + 1) + ' / ' + data.levels.length + '，相邻两个以上同色彩球可消除。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '爆破彩球原生数据加载失败'; });
        }
        function renderNativeBurstOriginal(gameName, dataUrl) {
            gameName = gameName || '爆破彩球'; dataUrl = dataUrl || '/data/pk32-burst-balls-levels.json';
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载' + gameName + '原生盘面…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch(dataUrl).then(function (response) { return response.json(); }).then(function (data) {
                let level = 0, cells = [], width = 12, height = 0;
                const select = el('select', { 'aria-label': gameName + '原生盘面' });
                data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); });
                function connected(start) {
                    const value = cells[start]; if (value === '0') return [];
                    const found = [], queue = [start], seen = new Set([start]);
                    while (queue.length) { const index = queue.shift(); found.push(index); const x = index % width, y = Math.floor(index / width); [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (point) { if (point[0] < 0 || point[0] >= width || point[1] < 0 || point[1] >= height) return; const next = point[1] * width + point[0]; if (!seen.has(next) && cells[next] === value) { seen.add(next); queue.push(next); } }); }
                    return found;
                }
                function hasMove() { return cells.some(function (value, index) { return value !== '0' && connected(index).length >= 2; }); }
                function compact() {
                    for (let x = 0; x < width; x += 1) { const column = []; for (let y = height - 1; y >= 0; y -= 1) if (cells[y * width + x] !== '0') column.push(cells[y * width + x]); for (let y = height - 1; y >= 0; y -= 1) cells[y * width + x] = column[height - 1 - y] || '0'; }
                    for (let x = 0; x < width;) { let empty = true; for (let y = 0; y < height; y += 1) if (cells[y * width + x] !== '0') empty = false; if (!empty) { x += 1; continue; } let next = x + 1; while (next < width) { let hasValue = false; for (let y = 0; y < height; y += 1) if (cells[y * width + next] !== '0') hasValue = true; if (hasValue) break; next += 1; } if (next === width) break; for (let from = next; from < width; from += 1) for (let y = 0; y < height; y += 1) cells[y * width + from - 1] = cells[y * width + from]; for (let y = 0; y < height; y += 1) cells[y * width + width - 1] = '0'; }
                    if (!ended && cells.some(function (value) { return value !== '0'; }) && !hasMove()) finish('没有可选择的彩球了，请重新开始本关。');
                }
                function draw() { panel.innerHTML = ''; const grid = renderGrid(width, height, 'bubble-board'); cells.forEach(function (value, index) { const b = button(value === '0' ? '' : '●', function () { if (ended || value === '0') return; const group = connected(index); if (group.length < 2) { prompt.textContent = '请选择两个以上上下左右连续相同颜色的彩球。'; return; } group.forEach(function (cell) { cells[cell] = '0'; }); compact(); setScore(score + group.length * 3); if (!cells.some(function (cell) { return cell !== '0'; })) { ended = true; draw(); finish('所有彩球已消除，本关完成。'); return; } draw(); }); b.dataset.cell = String(index); b.dataset.value = value; b.setAttribute('aria-label', value === '0' ? '空格' : '彩球 ' + value); b.disabled = ended || value === '0'; grid.appendChild(b); }); panel.append(button('上一关', function () { level = Math.max(0, level - 1); reset(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); reset(); }), select, grid); prompt.textContent = '原版关卡：第 ' + (level + 1) + ' / ' + data.levels.length + '；选择两个以上上下左右连续相同的彩球消除。'; }
                function reset() { const raw = data.levels[level].cells; width = raw.length === 192 ? 12 : raw.length === 40 ? 8 : 6; height = Math.ceil(raw.length / width); cells = raw.padEnd(width * height, '0').slice(0, width * height).split(''); ended = false; draw(); if (cells.some(function (value) { return value !== '0'; }) && !hasMove()) finish('没有可选择的彩球了，请重新开始本关。'); }
                select.onchange = function () { level = Number(select.value) || 0; reset(); }; reset();
            }).catch(function () { prompt.textContent = gameName + '原生数据加载失败'; });
        }
        function renderNativeTank() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载坦克大战原生盘面…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
              fetch('/data/pk32-tank-battle-levels.json').then(function (response) { return response.json(); }).then(function (data) { const width = 15, height = 10, cells = data.levels[0].cells.split(''), grid = renderGrid(width, height, 'pk32-tank-board'); let pos = width * (height - 1) + 1, shots = 0; function open(index) { return index >= 0 && index < cells.length && cells[index] !== '3'; } function draw() { grid.innerHTML = ''; cells.forEach(function (value, index) { const cell = button(index === pos ? '坦' : value === '3' ? '■' : '·', function () { if (index === pos) { shots += 1; setScore(score + 1); prompt.textContent = '已发射 ' + shots + ' 发炮弹；敌方 AI 和碰撞规则仍在校核。'; } else if (open(index) && (Math.abs(index - pos) === 1 || Math.abs(index - pos) === width)) { pos = index; draw(); } }); cell.dataset.code = value; cell.style.cssText = 'min-width:24px;min-height:24px;padding:0;background:' + (index === pos ? '#22c55e' : value === '3' ? '#7c2d12' : '#0f172a') + ';color:#fff'; grid.appendChild(cell); }); } const controls = el('div', { className: 'pk32v-controls' }); [['上', -width], ['下', width], ['左', -1], ['右', 1]].forEach(function (item) { controls.appendChild(button(item[0], function () { const next = pos + item[1]; if (open(next) && (item[1] === width || item[1] === -width || Math.floor(next / width) === Math.floor(pos / width))) { pos = next; draw(); } })); }); panel.append(grid, controls); prompt.textContent = '坦克大战：原生 15×10 盘面；点击坦克发射，方向键/按钮移动。敌方 AI 与碰撞规则仍在校核。'; draw(); }).catch(function () { prompt.textContent = '坦克大战原生数据加载失败'; });
        }
        function renderNativeSeaTreasure() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载海底寻宝原生盘面…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-sea-treasure-levels.json').then(function (response) { return response.json(); }).then(function (data) { const width = 15, height = 10, cells = data.levels[0].cells.split(''), grid = renderGrid(width, height, 'maze'); let left = width * (height - 1) + 1, right = width * (height - 1) + width - 2; function draw() { grid.innerHTML = ''; cells.forEach(function (value, index) { grid.appendChild(button(index === left ? '左坦' : index === right ? '右坦' : value === '2' ? '·' : '■', function () {})); }); } function move(which, delta) { let p = which === 'left' ? left : right, next = p + delta; if (next < 0 || next >= cells.length || (delta === 1 || delta === -1) && Math.floor(next / width) !== Math.floor(p / width) || cells[next] === '2') return; if (which === 'left') left = next; else right = next; draw(); } const controls = el('div', { className: 'pk32v-controls' }); [['左坦上', 'left', -width], ['左坦下', 'left', width], ['左坦左', 'left', -1], ['左坦右', 'left', 1], ['右坦上', 'right', -width], ['右坦下', 'right', width], ['右坦左', 'right', -1], ['右坦右', 'right', 1]].forEach(function (item) { controls.appendChild(button(item[0], function () { move(item[1], item[2]); })); }); const keyHandler = function (event) { const key = event.key.toLowerCase(); const leftKeys = { w: -width, s: width, a: -1, d: 1 }; const rightKeys = { arrowup: -width, arrowdown: width, arrowleft: -1, arrowright: 1 }; if (Object.prototype.hasOwnProperty.call(leftKeys, key)) { move('left', leftKeys[key]); event.preventDefault(); } else if (Object.prototype.hasOwnProperty.call(rightKeys, key)) { move('right', rightKeys[key]); event.preventDefault(); } }; document.addEventListener('keydown', keyHandler); addCleanup(function () { document.removeEventListener('keydown', keyHandler); }); panel.append(grid, controls); prompt.textContent = '原版控制：左坦克 ASDW/J，右坦克方向键/小键盘 0；当前已加载原生 15×10 盘面，炮击规则解析中。'; draw(); }).catch(function () { prompt.textContent = '海底寻宝原生数据加载失败'; });
        }
        function renderNativeLampsLegacy() {
const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载七盏灯原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-seven-lamps-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0, chances = 7; const select = el('select', { 'aria-label': '七盏灯原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const raw = data.levels[level].cells, width = 10, cells = raw.slice(-100).split(''), grid = renderGrid(width, 10, 'bubble-board'); cells.forEach(function (value, index) { const b = button(value === '0' ? '·' : '灯', function () { if (!chances) return; chances -= 1; [index, index - 1, index + 1, index - width, index + width].forEach(function (target) { if (target >= 0 && target < cells.length && (target === index || target === index - width || target === index + width || Math.floor(target / width) === Math.floor(index / width))) cells[target] = cells[target] === '0' ? '4' : '0'; }); if (!cells.some(function (v) { return v !== '0'; })) finish('七盏灯全部点亮。'); draw(); }); b.disabled = !chances; grid.appendChild(b); }); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); chances = 7; draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); chances = 7; draw(); }), select, grid); prompt.textContent = '原生数据 ' + (level + 1) + ' / ' + data.levels.length + '；剩余操作 ' + chances + ' 次，点击会切换自身及上下左右相邻灯。'; } select.onchange = function () { level = Number(select.value) || 0; chances = 7; draw(); }; draw(); }).catch(function () { prompt.textContent = '七盏灯原生数据加载失败'; });
        }
        function renderNativeLamps() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载七盏灯原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-seven-lamps-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0, chances = 7; const select = el('select', { 'aria-label': '七盏灯原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const raw = data.levels[level].cells, width = Number(raw.slice(0, 2)), height = Number(raw.slice(2, 4)), cells = raw.slice(4, 4 + width * height).split(''), grid = renderGrid(width, height, 'bubble-board'); cells.forEach(function (value, index) { const b = button(value === '0' ? '·' : '灯', function () { if (!chances) return; chances -= 1; [index, index - 1, index + 1, index - width, index + width].forEach(function (target) { if (target >= 0 && target < cells.length && (target === index || target === index - width || target === index + width || Math.floor(target / width) === Math.floor(index / width))) cells[target] = cells[target] === '0' ? '4' : '0'; }); if (!cells.some(function (v) { return v !== '0'; })) finish('七盏灯全部点亮。'); draw(); }); b.disabled = !chances; grid.appendChild(b); }); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); chances = 7; draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); chances = 7; draw(); }), select, grid); prompt.textContent = '七盏灯：原生盘面 ' + width + '×' + height + '；数据 ' + (level + 1) + ' / ' + data.levels.length + '；剩余操作 ' + chances + ' 次。'; } select.onchange = function () { level = Number(select.value) || 0; chances = 7; draw(); }; draw(); }).catch(function () { prompt.textContent = '七盏灯原生数据加载失败'; });
        }
        // Keep the candidate isolated until its native tile meanings are confirmed.
        function renderNativeLampsCandidate() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载七盏灯原生关卡…');
            const panel = el('div', { className: 'pk32v-native-data' });
            body.append(prompt, panel);
            fetch('/data/pk32-seven-lamps-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0, chances = 7, cells = [];
                const select = el('select', { 'aria-label': '七盏灯原生关卡' });
                data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); });
                function resetLevel() { const raw = data.levels[level].cells; const width = Number(raw.slice(0, 2)), height = Number(raw.slice(2, 4)); cells = raw.slice(4, 4 + width * height).split(''); chances = 7; return { width: width, height: height }; }
                function draw() {
                    panel.innerHTML = '';
                    const raw = data.levels[level].cells, width = Number(raw.slice(0, 2)), height = Number(raw.slice(2, 4));
                    if (cells.length !== width * height) resetLevel();
                    const grid = renderGrid(width, height, 'bubble-board');
                    cells.forEach(function (value, index) { const b = button(value === '0' ? '·' : '灯', function () { if (!chances || (cells[index] !== '0' && cells[index] !== '4')) return; chances -= 1; [index, index - 1, index + 1, index - width, index + width].forEach(function (target) { const sameRow = target === index || target === index - width || target === index + width || Math.floor(target / width) === Math.floor(index / width); if (target >= 0 && target < cells.length && sameRow && (cells[target] === '0' || cells[target] === '4')) cells[target] = cells[target] === '0' ? '4' : '0'; }); if (!cells.some(function (v) { return v !== '0' && v !== '4'; })) finish('七盏灯全部点亮。'); draw(); }); b.disabled = !chances; grid.appendChild(b); });
                    panel.append(button('上一关', function () { ended = false; level = Math.max(0, level - 1); select.value = String(level); resetLevel(); draw(); }), button('下一关', function () { ended = false; level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); resetLevel(); draw(); }), select, grid);
                    prompt.textContent = '七盏灯：原生盘面 ' + width + '×' + height + '；数据 ' + (level + 1) + ' / ' + data.levels.length + '；剩余操作 ' + chances + ' 次。';
                }
                select.onchange = function () { ended = false; level = Number(select.value) || 0; resetLevel(); draw(); };
                resetLevel(); draw();
            }).catch(function () { prompt.textContent = '七盏灯原生数据加载失败'; });
        }
        function renderNativeSokoban5Candidate() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载推箱子五原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-sokoban5-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; function draw() { panel.innerHTML = ''; const raw = data.levels[level].cells.split(''), width = 6, height = 6, player = raw.indexOf('1'), boxes = raw.map(function (v, i) { return v === '3' ? i : -1; }).filter(function (i) { return i >= 0; }), goals = raw.map(function (v, i) { return v === '4' || v === '5' ? i : -1; }).filter(function (i) { return i >= 0; }), grid = renderGrid(width, height, 'maze'); let currentPlayer = player; function paint() { raw.forEach(function (v, i) { grid.children[i].textContent = i === currentPlayer ? '人' : boxes.indexOf(i) >= 0 ? '箱' : goals.indexOf(i) >= 0 ? '◎' : v === '0' ? '·' : '墙'; }); } function move(delta) { const next = currentPlayer + delta, beyond = next + delta; if (next < 0 || next >= raw.length || raw[next] === '0') return; if ((delta === 1 || delta === -1) && Math.floor(next / width) !== Math.floor(currentPlayer / width)) return; if (boxes.indexOf(next) >= 0) { if (beyond < 0 || beyond >= raw.length || raw[beyond] === '0' || boxes.indexOf(beyond) >= 0) return; boxes[boxes.indexOf(next)] = beyond; } raw[currentPlayer] = '2'; currentPlayer = next; raw[currentPlayer] = '1'; paint(); if (boxes.every(function (i) { return goals.indexOf(i) >= 0; })) finish('推箱子五第 ' + (level + 1) + ' 关完成。'); } raw.forEach(function (_, i) { grid.appendChild(button('', function () { const d = i - currentPlayer; if (d === 1 || d === -1 || d === width || d === -width) move(d); })); }); paint(); const controls = el('div', { className: 'pk32v-controls' }); [['上', -width], ['下', width], ['左', -1], ['右', 1]].forEach(function (item) { controls.appendChild(button(item[0], function () { move(item[1]); })); }); const select = el('select', { 'aria-label': '推箱子五关卡' }); data.levels.forEach(function (_, i) { select.appendChild(el('option', { value: String(i) }, '第 ' + (i + 1) + ' 关')); }); select.value = String(level); select.onchange = function () { level = Number(select.value) || 0; draw(); }; panel.append(button('上一关', function () { level = Math.max(0, level - 1); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); draw(); }), select, grid, controls); prompt.textContent = '原生关卡 ' + (level + 1) + ' / ' + data.levels.length + '；推动所有箱子到目标点。'; } draw(); }).catch(function () { prompt.textContent = '推箱子五原生数据加载失败'; });
        }
        function renderNativeSokoban5() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载推箱子五原生关卡…');
            const panel = el('div', { className: 'pk32v-native-data' });
            body.append(prompt, panel);
            fetch('/data/pk32-sokoban5-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0, player = 0, board = [];
                const select = el('select', { 'aria-label': '推箱子五关卡' });
                data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '第 ' + (index + 1) + ' 关')); });
                function reset() { board = data.levels[level].cells.split(''); player = board.indexOf('5'); }
                function draw() {
                    panel.innerHTML = '';
                    const width = 6, grid = renderGrid(width, 6, 'maze');
                    board.forEach(function (value, index) {
                        const cell = button(value === '1' ? '墙' : index === player ? '人' : value === '3' ? '箱' : value === '2' ? '箱◎' : value === '4' ? '◎' : '·', function () {
                            if (ended) return;
                            const delta = index - player;
                            if (![1, -1, width, -width].includes(delta)) return;
                            if ((delta === 1 || delta === -1) && Math.floor(index / width) !== Math.floor(player / width)) return;
                            const next = index, beyond = next + delta, movingBox = board[next] === '3' || board[next] === '2';
                            if (board[next] === '1' || (movingBox && (beyond < 0 || beyond >= board.length || board[beyond] === '1' || board[beyond] === '3' || board[beyond] === '2'))) return;
                            if (movingBox) board[beyond] = board[beyond] === '4' ? '2' : '3';
                            board[next] = movingBox ? (board[next] === '2' ? '4' : '0') : board[next];
                            player = next;
                            if (board.every(function (value) { return value !== '3'; })) finish('推箱子五第 ' + (level + 1) + ' 关完成。');
                            draw();
                        });
                        cell.dataset.code = value;
                        grid.appendChild(cell);
                    });
                    const controls = el('div', { className: 'pk32v-controls' });
                    [['上', -width], ['下', width], ['左', -1], ['右', 1]].forEach(function (item) { controls.appendChild(button(item[0], function () { const target = player + item[1]; if (target >= 0 && target < board.length && grid.children[target]) grid.children[target].click(); })); });
                    panel.append(button('上一关', function () { ended = false; level = Math.max(0, level - 1); select.value = String(level); reset(); draw(); }), button('下一关', function () { ended = false; level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); reset(); draw(); }), select, grid, controls);
                    prompt.textContent = '推箱子五：原生关卡 ' + (level + 1) + ' / ' + data.levels.length + '；编码候选映射，规则核对中。';
                }
                select.onchange = function () { ended = false; level = Number(select.value) || 0; reset(); draw(); };
                reset(); draw();
            }).catch(function () { prompt.textContent = '推箱子五原生数据加载失败'; });
        }
          function renderNativeSokoban4Legacy() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载推箱子四原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-sokoban4-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '推箱子四原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level], grid = el('pre', { className: 'pk32v-native-grid' }, item.cells.match(new RegExp('.{1,' + item.width + '}', 'g')).join('\n')); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, grid); prompt.textContent = '原版声明 23 关；已提取原生关卡 ' + (level + 1) + ' / ' + data.levels.length + '（' + item.width + '×' + item.height + '），箱子编码解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '推箱子四原生数据加载失败'; });
        }
        function renderNativeZenMaze() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载禅宗迷宫原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
              fetch('/data/pk32-zen-maze-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0, points = 501; const select = el('select', { 'aria-label': '禅宗迷宫原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生数据 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level], width = 10, cells = item.cells.split(''), grid = renderGrid(width, Math.ceil(cells.length / width), 'pk32-zen-maze-board'); cells.forEach(function (value, index) { const cell = button(value, function () { const cost = Number(value); if (Number.isFinite(cost) && cost > 0 && cost <= points) { points -= cost; setScore(501 - points); if (!points) finish('分数刚好减到0分，本关完成。'); draw(); } }); cell.dataset.code = value; cell.style.cssText = 'min-width:24px;min-height:24px;padding:0;background:' + (value === '0' ? '#0f172a' : value === '1' ? '#334155' : value === '2' ? '#38bdf8' : value === '3' ? '#facc15' : value === '4' ? '#fb7185' : '#64748b') + ';color:#fff;font-size:10px'; grid.appendChild(cell); }); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); points = 501; draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); points = 501; draw(); }), select, button('跳跃（-20）', function () { if (points >= data.jumpCost) { points -= data.jumpCost; draw(); } }), grid); prompt.textContent = '禅宗迷宫：原版 24 关；当前原生数据 ' + (level + 1) + ' / ' + data.levels.length + '；初始分数 501，每次命中扣除对应分值，必须恰好减到0。'; } select.onchange = function () { level = Number(select.value) || 0; points = 501; draw(); }; draw(); }).catch(function () { prompt.textContent = '禅宗迷宫原生数据加载失败'; });
        }
        function renderNativeGenhua2() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载跟花二原生关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-genhua2-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const select = el('select', { 'aria-label': '跟花二原生关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const item = data.levels[level]; panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); select.value = String(level); draw(); }), select, el('pre', { className: 'pk32v-native-grid' }, item.cells.match(/.{1,6}/g).join('\n'))); prompt.textContent = '跟花二原生关卡 ' + (level + 1) + ' / ' + data.levels.length + '；6×6 牌面编码，规则解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '跟花二原生数据加载失败'; });
        }
        function renderNativeWires2() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载连结电线二原生箱体关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-connect-wires2-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; const levels = data.levels || (data.confirmedLevels || []).map(function (cells, index) { return { number: index + 1, cells: cells }; }); const select = el('select', { 'aria-label': '连结电线二原生箱体关卡' }); levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原生关卡 ' + (index + 1))); }); function draw() { panel.innerHTML = ''; const raw = levels[level].cells, width = raw.length === 36 ? 6 : 10, cells = raw.split(''), grid = renderGrid(width, Math.ceil(cells.length / width), 'pk32-wires2-board'); cells.forEach(function (value, index) { const cell = button(value === '0' ? '' : value === '1' ? '□' : value === '2' ? '▣' : value === '3' ? '■' : '·', function () {}); cell.dataset.code = value; cell.style.cssText = 'min-width:30px;min-height:30px;padding:0;background:' + (value === '0' ? '#172033' : value === '1' ? '#f8fafc' : '#64748b') + ';color:' + (value === '1' ? '#111' : '#fff') + ';font-size:16px;font-weight:700'; grid.appendChild(cell); }); panel.append(button('上一关', function () { level = Math.max(0, level - 1); select.value = String(level); draw(); }), button('下一关', function () { level = Math.min(levels.length - 1, level + 1); select.value = String(level); draw(); }), select, grid); prompt.textContent = '连结电线二：原版 ' + data.nativeLevelCount + ' 关；目标是将白色箱子移到最右边。当前已确认原生编码 ' + (level + 1) + ' / ' + levels.length + '，箱体尺寸与移动规则解析中。'; } select.onchange = function () { level = Number(select.value) || 0; draw(); }; draw(); }).catch(function () { prompt.textContent = '连结电线二原生数据加载失败'; });
        }
        function renderNativeHuarong() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载华容道原版棋局…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-huarong-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0, selectedId = null, moves = 0, pieces = [];
                const colors = { '00': '#b45309', '01': '#2563eb', '02': '#0f766e', '03': '#7c3aed', '04': '#be123c', '05': '#15803d', '06': '#0369a1', '07': '#a21caf', '08': '#c2410c', '09': '#4f46e5', '10': '#166534', '11': '#9f1239', '12': '#1d4ed8', '13': '#047857', '14': '#9333ea' };
                const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
                function parseLayout(layout) {
                    const tokens = (layout || '').match(/.{2}/g) || [], groups = {};
                    if (tokens.length !== 20) return [];
                    tokens.forEach(function (id, index) {
                        if (id === '15') return;
                        if (!groups[id]) groups[id] = { id: id, cells: [] };
                        groups[id].cells.push({ row: Math.floor(index / 4), col: index % 4 });
                    });
                    return Object.keys(groups).map(function (id) {
                        const group = groups[id], rows = group.cells.map(function (cell) { return cell.row; }), cols = group.cells.map(function (cell) { return cell.col; });
                        group.row = Math.min.apply(null, rows); group.col = Math.min.apply(null, cols);
                        group.height = Math.max.apply(null, rows) - group.row + 1; group.width = Math.max.apply(null, cols) - group.col + 1;
                        return group;
                    });
                }
                function occupancy(ignoreId) {
                    const occupied = Array(20).fill(null);
                    pieces.forEach(function (piece) {
                        if (piece.id === ignoreId) return;
                        for (let row = piece.row; row < piece.row + piece.height; row += 1) for (let col = piece.col; col < piece.col + piece.width; col += 1) occupied[row * 4 + col] = piece.id;
                    });
                    return occupied;
                }
                function canMove(piece, delta) {
                    const row = piece.row + delta[0], col = piece.col + delta[1];
                    if (row < 0 || col < 0 || row + piece.height > 5 || col + piece.width > 4) return false;
                    const occupied = occupancy(piece.id);
                    for (let y = row; y < row + piece.height; y += 1) for (let x = col; x < col + piece.width; x += 1) if (occupied[y * 4 + x]) return false;
                    return true;
                }
                function move(piece, delta) {
                    if (ended || !piece || !canMove(piece, delta)) return false;
                    piece.row += delta[0]; piece.col += delta[1]; moves += 1; setScore(moves); selectedId = piece.id; draw();
                    if (piece.id === '00' && piece.row === 3 && piece.col === 1) finish('曹操已到达棋盘底部中间，本局完成。');
                    return true;
                }
                function moveToCell(index) {
                    if (ended || selectedId == null) return;
                    const piece = pieces.find(function (item) { return item.id === selectedId; });
                    if (!piece) return;
                    const row = Math.floor(index / 4), col = index % 4;
                    Object.keys(directions).some(function (key) {
                        const delta = directions[key], nextRow = piece.row + delta[0], nextCol = piece.col + delta[1];
                        if (row < nextRow || row >= nextRow + piece.height || col < nextCol || col >= nextCol + piece.width) return false;
                        return move(piece, delta);
                    });
                }
                function resetLevel() { pieces = parseLayout(data.levels[level].layout); selectedId = null; moves = 0; ended = false; draw(); }
                function draw() {
                    panel.innerHTML = '';
                    const item = data.levels[level], nav = el('div', { className: 'pk32v-toolbar' }), grid = el('div', { className: 'huarong-board' });
                    grid.style.cssText = 'position:relative;width:min(100%,420px);max-width:100%;aspect-ratio:4/5;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(5,1fr);background:#334155;border:4px solid #0f172a;box-sizing:border-box;touch-action:manipulation';
                    for (let index = 0; index < 20; index += 1) {
                        const cell = el('button', { type: 'button', className: 'huarong-cell' });
                        cell.style.cssText = 'min-width:0;min-height:0;padding:0;border:1px solid #64748b;background:#1e293b;box-sizing:border-box';
                        cell.dataset.cell = String(index); cell.addEventListener('click', function () { moveToCell(index); }); grid.appendChild(cell);
                    }
                    pieces.forEach(function (piece) {
                        const label = piece.id === '00' ? '曹操' : piece.width * piece.height === 2 ? '将' : '兵', pieceButton = button(label, function () { if (!ended) { selectedId = selectedId === piece.id ? null : piece.id; draw(); } });
                        pieceButton.dataset.nativePiece = piece.id; pieceButton.dataset.row = String(piece.row); pieceButton.dataset.col = String(piece.col); pieceButton.setAttribute('aria-label', label + '，点击选择');
                        pieceButton.style.cssText = 'position:absolute;left:' + (piece.col * 25) + '%;top:' + (piece.row * 20) + '%;width:' + (piece.width * 25) + '%;height:' + (piece.height * 20) + '%;padding:0;border:3px solid ' + (selectedId === piece.id ? '#f8fafc' : '#0f172a') + ';border-radius:6px;background:' + (colors[piece.id] || '#475569') + ';color:#fff;font-weight:700;font-size:clamp(14px,4vw,22px);z-index:2;box-sizing:border-box;touch-action:manipulation';
                        grid.appendChild(pieceButton);
                    });
                    const select = el('select', { 'aria-label': '华容道原版棋局' });
                    data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原版棋局 ' + (index + 1))); });
                    select.value = String(level); select.onchange = function () { level = Number(select.value) || 0; resetLevel(); };
                    nav.append(button('上一局', function () { level = Math.max(0, level - 1); resetLevel(); }), button('下一局', function () { level = Math.min(data.levels.length - 1, level + 1); resetLevel(); }), select, button('重置本局', resetLevel));
                    const details = el('details', {}), summary = el('summary', {}, '查看原始取证载荷'); details.append(summary, el('pre', { className: 'pk32v-native-grid' }, item.cells));
                    const controls = el('div', { className: 'huarong-direction-pad' }); controls.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(56px,76px));gap:6px;justify-content:center;margin-top:10px';
                    [['', null], ['上', [-1, 0]], ['', null], ['左', [0, -1]], ['下', [1, 0]], ['右', [0, 1]]].forEach(function (item) { const control = button(item[0], function () { const piece = pieces.find(function (entry) { return entry.id === selectedId; }); if (piece && item[1]) move(piece, item[1]); }); control.disabled = !item[0]; control.style.visibility = item[0] ? 'visible' : 'hidden'; control.style.minHeight = '44px'; controls.appendChild(control); });
                    panel.append(nav, grid, controls, details); prompt.textContent = '华容道原版棋局：第 ' + (level + 1) + ' / ' + data.count + '；步数 ' + moves + '。点击棋子后点击相邻空位，或使用方向键移动。';
                }
                function keydown(event) { const delta = directions[event.key], piece = pieces.find(function (item) { return item.id === selectedId; }); if (!delta || !piece || ended) return; event.preventDefault(); move(piece, delta); }
                document.addEventListener('keydown', keydown); addCleanup(function () { document.removeEventListener('keydown', keydown); });
                if (window.__MG_TEST) window.__pk32HuarongDebug = { getState: function () { return { level: level, moves: moves, selectedId: selectedId, pieces: pieces.map(function (piece) { return { id: piece.id, row: piece.row, col: piece.col, width: piece.width, height: piece.height }; }), layout: data.levels[level].layout }; }, select: function (id) { selectedId = id; draw(); }, move: function (id, delta) { const piece = pieces.find(function (item) { return item.id === id; }); return move(piece, delta); }, reset: resetLevel };
                resetLevel();
            }).catch(function () { prompt.textContent = '华容道原版数据加载失败'; });
        }
        function renderNativePickFlowers() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载摘花朵原版关卡…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-pick-flowers-levels.json').then(function (response) { return response.json(); }).then(function (data) { let level = 0; function draw() { panel.innerHTML = ''; const item = data.levels[level], width = level === 0 ? 15 : 10, height = Math.ceil(item.cells.length / width), grid = renderGrid(width, height, 'pick-flowers-board'); item.cells.split('').forEach(function (value, index) { const cell = button(value, function () {}); cell.dataset.nativeCode = value; cell.style.cssText = 'min-width:26px;min-height:26px;padding:0;background:' + ({ '0': '#172033', '1': '#64748b', '2': '#22c55e', '3': '#ef4444', '4': '#eab308', '5': '#3b82f6', '6': '#a855f7' }[value] || '#334155') + ';color:#fff;font-size:11px'; grid.appendChild(cell); }); const select = el('select', { 'aria-label': '摘花朵原版关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原版关卡 ' + (index + 1))); }); select.value = String(level); select.onchange = function () { level = Number(select.value) || 0; draw(); }; panel.append(button('上一关', function () { level = Math.max(0, level - 1); draw(); }), button('下一关', function () { level = Math.min(data.count - 1, level + 1); draw(); }), select, grid); prompt.textContent = '摘花朵原版数据：第 ' + (level + 1) + ' / ' + data.count + '；已保留原始指令编码，守卫追击和黑洞传送规则解析中。'; } draw(); }).catch(function () { prompt.textContent = '摘花朵原版数据加载失败'; });
        }
        function renderMummy() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载木乃伊原版盘面…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-mummy-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0;
                function draw() {
                    panel.innerHTML = ''; const item = data.levels[level]; const pairs = item.cells.match(/\d{2}/g) || []; const grid = renderGrid(item.width, item.height, 'mummy-board');
                    for (let index = 0; index < item.width * item.height; index++) {
                        const row = Math.floor(index / item.width), col = index % item.width;
                        const hits = pairs.map(function (pair, pairIndex) { const value = Number(pair); return Math.floor(value / 10) === row && value % 10 === col ? pairIndex + 1 : 0; }).filter(Boolean);
                        const cell = button('', function () {}); cell.dataset.nativeCode = hits.length ? pairs[hits[0] - 1] : '00'; cell.title = '原版坐标 ' + row + ',' + col + (hits.length ? '；序号 ' + hits.join(',') : '');
                        cell.style.cssText = 'min-width:32px;min-height:32px;padding:0;color:#fff;font-size:11px;font-weight:700;background:' + (hits.length ? (hits.length > 1 ? '#b45309' : '#2563eb') : '#172033');
                        cell.textContent = hits.length ? (hits.length > 1 ? String(hits.length) : '·') : ''; grid.appendChild(cell);
                    }
                    const select = el('select', { 'aria-label': '木乃伊原版关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原版关卡 ' + (index + 1))); }); select.value = String(level); select.onchange = function () { level = Number(select.value) || 0; draw(); };
                    panel.append(button('上一关', function () { level = Math.max(0, level - 1); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); draw(); }), select, grid);
                    prompt.textContent = '木乃伊原版盘面：第 ' + (level + 1) + ' / ' + data.count + '；' + item.width + '×' + item.height + '，已按原生坐标串绘制；重复坐标与尾部控制字节仍待语义确认。';
                }
                draw();
            }).catch(function () { prompt.textContent = '木乃伊原版数据加载失败'; });
        }
        function renderNativeCollisionBalls() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载碰撞彩球原版盘面…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-collision-balls-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0, selected = -1, cells = [];
                function reset() { cells = data.levels[level].cells.split(''); selected = cells.findIndex(function (value) { return value !== '0'; }); draw(); }
                function move(delta) {
                    if (ended || selected < 0) return;
                    const width = data.levels[level].width, row = Math.floor(selected / width), next = selected + delta;
                    if (delta !== -1 && delta !== 1 || next < 0 || next >= cells.length || Math.floor(next / width) !== row) return;
                    let end = selected;
                    while (true) { const probe = end + delta; if (probe < 0 || probe >= cells.length || Math.floor(probe / width) !== row) return; if (cells[probe] === '0') break; end = probe; }
                    for (let index = end; index !== selected; index -= delta) cells[index] = cells[index - delta];
                    cells[selected] = '0'; selected += delta;
                    const moving = cells[selected], neighbors = [selected - 1, selected + 1].filter(function (index) { return index >= 0 && index < cells.length && Math.floor(index / width) === row && cells[index] !== '0'; });
                    if (moving === '2' && neighbors.some(function (index) { return cells[index] === '2'; })) { ended = true; finish('粉红彩球相撞，本关完成。'); }
                    else { const group = neighbors.filter(function (index) { return cells[index] === moving; }); if (moving !== '2' && group.length) { group.forEach(function (index) { cells[index] = '0'; }); cells[selected] = '0'; } setScore(score + 1); }
                    draw();
                }
                function draw() { panel.innerHTML = ''; const item = data.levels[level], grid = renderGrid(item.width, item.height, 'collision-balls-board'); cells.forEach(function (value, index) { const cell = button(value === '0' ? '' : value, function () { if (value !== '0') selected = index; draw(); }); cell.dataset.nativeCode = value; cell.dataset.selected = String(index === selected); cell.style.cssText = 'min-width:32px;min-height:32px;padding:0;background:' + ({ '0': '#111827', '1': '#ef4444', '2': '#ec4899', '3': '#22c55e', '4': '#3b82f6', '5': '#eab308' }[value] || '#a855f7') + ';color:#fff;font-weight:700;outline:' + (index === selected ? '3px solid #fff' : 'none'); grid.appendChild(cell); }); const controls = el('div', { className: 'pk32v-controls' }); controls.append(button('左', function () { move(-1); }), button('右', function () { move(1); })); const select = el('select', { 'aria-label': '碰撞彩球原版关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原版关卡 ' + (index + 1))); }); select.value = String(level); select.onchange = function () { level = Number(select.value) || 0; ended = false; reset(); }; panel.append(select, grid, controls); prompt.textContent = '碰撞彩球：第 ' + (level + 1) + ' / ' + data.count + '；选择彩球后只能左右移动。'; }
                reset();
                const keyHandler = function (event) { if (config.name !== '碰撞彩球' || ended) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); } };
                document.addEventListener('keydown', keyHandler); addCleanup(function () { document.removeEventListener('keydown', keyHandler); });
            }).catch(function () { prompt.textContent = '碰撞彩球原版数据加载失败'; });
        }
        function renderNativeCollisionBallsLegacy() {
            const prompt = el('p', { className: 'pk32v-prompt' }, '正在加载碰撞彩球原版盘面…'); const panel = el('div', { className: 'pk32v-native-data' }); body.append(prompt, panel);
            fetch('/data/pk32-collision-balls-levels.json').then(function (response) { return response.json(); }).then(function (data) {
                let level = 0;
                function draw() { panel.innerHTML = ''; const item = data.levels[level]; const grid = renderGrid(item.width, item.height, 'collision-balls-board'); item.cells.split('').forEach(function (value) { const cell = button(value, function () {}); cell.dataset.nativeCode = value; cell.style.cssText = 'min-width:32px;min-height:32px;padding:0;background:' + ({ '0': '#111827', '1': '#ef4444', '2': '#22c55e', '3': '#3b82f6', '4': '#eab308', '5': '#a855f7' }[value] || '#64748b') + ';color:#fff;font-weight:700'; grid.appendChild(cell); }); const select = el('select', { 'aria-label': '碰撞彩球原版关卡' }); data.levels.forEach(function (_, index) { select.appendChild(el('option', { value: String(index) }, '原版关卡 ' + (index + 1))); }); select.value = String(level); select.onchange = function () { level = Number(select.value) || 0; draw(); }; panel.append(button('上一关', function () { level = Math.max(0, level - 1); draw(); }), button('下一关', function () { level = Math.min(data.levels.length - 1, level + 1); draw(); }), select, grid); prompt.textContent = '碰撞彩球原版盘面：第 ' + (level + 1) + ' / ' + data.count + '；已保留原始编码，碰撞规则解析中。'; }
                draw();
            }).catch(function () { prompt.textContent = '碰撞彩球原版数据加载失败'; });
        }
        function renderElectromagnetic() {
            const wrap = el('div', { className: 'pk32v-native-electromagnetic' });
            const info = el('p', { className: 'pk32v-prompt' }, '正在读取原生盘面');
            const controls = el('div', { className: 'pk32v-controls' });
            const grid = renderGrid(16, 16, 'electromagnetic-board');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(16,minmax(0,1fr));gap:1px;width:min(100%,496px);aspect-ratio:1;margin:0 auto;background:#050505;overflow:hidden';
            grid.dataset.board = 'electromagnetic';
            const selector = el('select', { ariaLabel: '选择原版关卡' });
            const direction = el('div', { className: 'pk32v-controls' });
            let levels = [], level = 0, cells = [], history = [];
            const colors = { '1': true, '2': true, '3': true, '4': true };
            function groups(source) {
                const seen = new Set(), result = [];
                source.forEach(function (value, index) {
                    if (!colors[value] || seen.has(index)) return;
                    const group = [], queue = [index]; seen.add(index);
                    while (queue.length) {
                        const current = queue.shift(); group.push(current);
                        const x = current % 16, y = Math.floor(current / 16);
                        [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (point) {
                            if (point[0] < 0 || point[0] >= 16 || point[1] < 0 || point[1] >= 16) return;
                            const next = point[1] * 16 + point[0];
                            if (!seen.has(next) && source[next] === value) { seen.add(next); queue.push(next); }
                        });
                    }
                    result.push(group);
                });
                return result;
            }
            function complete() {
                const byColor = {};
                cells.forEach(function (value) { if (colors[value]) byColor[value] = (byColor[value] || 0) + 1; });
                const colorNames = Object.keys(byColor);
                return colorNames.length > 0 && colorNames.every(function (value) {
                    const first = cells.indexOf(value); if (first < 0) return true;
                    const connected = groups(cells).filter(function (group) { return group.indexOf(first) >= 0; })[0] || [];
                    return connected.length === byColor[value];
                });
            }
            function shift(source, dx, dy) {
                const components = groups(source), owner = new Map(), state = [], movable = [];
                components.forEach(function (component, componentIndex) { component.forEach(function (index) { owner.set(index, componentIndex); }); });
                function canMove(componentIndex) {
                    if (state[componentIndex] === 2) return movable[componentIndex];
                    if (state[componentIndex] === 1) return true;
                    state[componentIndex] = 1;
                    const component = components[componentIndex];
                    const allowed = component.every(function (index) {
                        const x = index % 16, y = Math.floor(index / 16), nextX = x + dx, nextY = y + dy;
                        if (nextX < 0 || nextX >= 16 || nextY < 0 || nextY >= 16) return false;
                        const destination = nextY * 16 + nextX, value = source[destination];
                        if (value === '5') return false;
                        if (value === '0') return true;
                        const dependency = owner.get(destination);
                        return dependency === componentIndex || (dependency != null && canMove(dependency));
                    });
                    state[componentIndex] = 2; movable[componentIndex] = allowed;
                    return allowed;
                }
                components.forEach(function (_, index) { canMove(index); });
                const next = source.slice();
                components.forEach(function (component, index) { if (movable[index]) component.forEach(function (cell) { next[cell] = '0'; }); });
                components.forEach(function (component, index) {
                    if (!movable[index]) return;
                    component.forEach(function (cell) {
                        const x = cell % 16, y = Math.floor(cell / 16), destination = (y + dy) * 16 + x + dx;
                        next[destination] = source[cell];
                    });
                });
                return next;
            }
            function move(dx, dy) {
                if (!cells.length || ended) return false;
                const next = shift(cells, dx, dy);
                if (next.join('') === cells.join('')) return false;
                history.push(cells.slice()); cells = next; draw();
                if (complete()) {
                    ended = true; setScore(score + 100); status.textContent = '恭喜！您过关了！';
                    info.textContent = '同色彩球已经全部连通。';
                    info.appendChild(button('确定', function () { level = (level + 1) % levels.length; reset(); }));
                }
                return true;
            }
            function draw() {
                grid.innerHTML = '';
                selector.value = String(level);
                cells.forEach(function (value, index) {
                    const cell = el('span', { className: 'value-' + value });
                    cell.dataset.cell = String(index); cell.dataset.value = value;
                    cell.style.cssText = 'display:block;min-width:0;min-height:0;aspect-ratio:1;background-color:#050505;background-repeat:no-repeat;';
                    if (value !== '0') {
                        const sourceY = 100 + Number(value) * 30;
                        cell.style.backgroundImage = 'url("/img/pk32/original/sheet-d3525b.png")';
                        cell.style.backgroundSize = (544 / 30 * 100) + '% ' + (433 / 30 * 100) + '%';
                        cell.style.backgroundPosition = (380 / (544 - 30) * 100) + '% ' + (sourceY / (433 - 30) * 100) + '%';
                    }
                    cell.setAttribute('aria-label', value === '0' ? '空位' : value === '5' ? '固定球' : '可移动球 ' + value);
                    grid.appendChild(cell);
                });
                info.textContent = levels.length ? '原版关卡：第 ' + (level + 1) + ' / ' + levels.length + '；方向键会同时移动全部彩球' : '正在读取原生盘面';
            }
            function reset() { cells = (levels[level] && levels[level].cells || '').slice(0, 256).split(''); history = []; ended = false; status.textContent = '原版流程：160 关；原始规则与图集已接入'; draw(); }
            function previous() { if (level > 0) { level -= 1; reset(); } }
            function next() { if (level + 1 < levels.length) { level += 1; reset(); } }
            function undo() { if (history.length) { cells = history.pop(); ended = false; draw(); } }
            function keydown(event) { if (ended) return; const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }; const moveBy = moves[event.key]; if (!moveBy) return; event.preventDefault(); move(moveBy[0], moveBy[1]); }
            document.addEventListener('keydown', keydown); addCleanup(function () { document.removeEventListener('keydown', keydown); });
            selector.addEventListener('change', function () { level = Number(selector.value) || 0; reset(); });
            controls.append(button('上一关', previous), button('下一关', next), selector, button('撤销上一步', undo));
            if (window.__MG_TEST) window.__pk32ElectromagneticDebug = { getState: function () { return { level: level, cells: cells.slice(), history: history.length, ended: ended }; }, move: move, shift: shift, reset: reset };
            direction.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(54px,1fr));gap:6px;max-width:220px;margin:8px auto 0';
            direction.append(el('span', {}), button('上', function () { move(0, -1); }), el('span', {}), button('左', function () { move(-1, 0); }), el('span', {}), button('右', function () { move(1, 0); }), el('span', {}), button('下', function () { move(0, 1); }), el('span', {}));
            wrap.append(info, controls, grid, direction); body.append(wrap);
            fetch('/data/pk32-electromagnetic-levels.json').then(function (r) { return r.json(); }).then(function (d) { levels = d.levels || []; levels.forEach(function (_, i) { const option = el('option', {}, '第 ' + (i + 1) + ' 关'); option.value = String(i); selector.appendChild(option); }); reset(); }).catch(function () { info.textContent = '原生盘面加载失败'; });
        }
        function renderPixelIsland() {
            const wrap = el('div', { className: 'pk32v-native-pixel-island' });
            const info = el('p', { className: 'pk32v-prompt' }, '正在读取原生盘面');
            const controls = el('div', { className: 'pk32v-controls' });
            const grid = renderGrid(5, 5, 'pixel-island-board');
            const selector = el('select', { ariaLabel: '选择已提取原生盘面' });
            let records = [], record = 0, cells = [], moves = 0;
            function reset() {
                const raw = records[record] && records[record].cells || '';
                cells = (raw.match(/.{4}/g) || []).slice(0, 25).map(function (value) { return value === '0000' ? 0 : 1; });
                moves = 0;
                ended = false;
                draw();
            }
            function toggle(index) {
                if (ended || !cells.length) return;
                const x = index % 5, y = Math.floor(index / 5);
                [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (point) {
                    if (point[0] >= 0 && point[0] < 5 && point[1] >= 0 && point[1] < 5) {
                        const target = point[1] * 5 + point[0];
                        cells[target] = cells[target] ? 0 : 1;
                    }
                });
                moves += 1;
                draw();
                if (!cells.some(function (value) { return value; })) finish('本局完成：25 格彩球全部消失。');
            }
            function solveCurrent() {
                const start = cells.map(function (value) { return value ? 1 : 0; });
                for (let firstRow = 0; firstRow < 32; firstRow += 1) {
                    const board = start.slice(), presses = [];
                    function press(index) { presses.push(index); const x = index % 5, y = Math.floor(index / 5); [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (point) { if (point[0] >= 0 && point[0] < 5 && point[1] >= 0 && point[1] < 5) { const target = point[1] * 5 + point[0]; board[target] = board[target] ? 0 : 1; } }); }
                    for (let x = 0; x < 5; x += 1) if (firstRow & (1 << x)) press(x);
                    for (let y = 1; y < 5; y += 1) for (let x = 0; x < 5; x += 1) if (board[(y - 1) * 5 + x]) press(y * 5 + x);
                    if (!board.some(function (value) { return value; })) return presses;
                }
                return null;
            }
            function draw() {
                grid.innerHTML = '';
                const raw = records[record] && records[record].cells || '';
                const chunks = raw.match(/.{4}/g) || [];
                for (let i = 0; i < 25; i += 1) {
                    const value = cells[i] || 0;
                    const b = button(value ? '●' : '·', function () { toggle(i); });
                    b.dataset.cell = String(i); b.dataset.value = String(value); b.dataset.rawState = chunks[i] || '0000';
                    b.setAttribute('aria-label', '第 ' + (i + 1) + ' 格，' + (value ? '有彩球' : '空格'));
                    b.style.cssText = value ? 'color:#f4c95d;background:#263653;min-width:44px;min-height:44px;padding:0;font-size:22px' : 'color:#64748b;background:#111827;min-width:44px;min-height:44px;padding:0;font-size:22px';
                    b.disabled = ended;
                    grid.appendChild(b);
                }
                selector.value = String(record);
                info.textContent = records.length ? '原版关卡声明：213 关；当前已定位盘面 ' + (record + 1) + ' / ' + records.length + '；第 ' + moves + ' 步。点击一格会翻转自身及上下左右相邻格。' : '正在读取原生盘面';
            }
            function load() { fetch('/data/pk32-pixel-island-levels.json').then(r => r.json()).then(d => { records = (d.levels || []).filter(x => x.cells && x.cells.length === 100 && /^[01]+$/.test(x.cells)); records.forEach(function (_, i) { const option = el('option', {}, '原生盘面 ' + (i + 1)); option.value = String(i); selector.appendChild(option); }); reset(); }).catch(() => { info.textContent = '原生盘面加载失败'; }); }
            selector.addEventListener('change', function () { record = Number(selector.value) || 0; reset(); });
            controls.append(selector, button('重置本关', reset));
            wrap.dataset.rulesStatus = 'unverified';
            wrap.append(info, controls, grid, el('p', { className: 'pk32v-prompt' }, '原生帮助确认：5×5 格子中的彩球会随选择发生变化，目标是让所有彩球消失。当前保留 3 条原始 4 字符状态串；点击变化规则和其余原版关卡仍待从宿主程序确认。')); body.append(wrap); load();
            if (window.__MG_TEST) window.__pk32PixelIslandDebug = { getState: function () { return { record: record, cells: cells.slice(), moves: moves, ended: ended }; }, toggle: toggle, reset: reset, solveSimpleBoard: function () { const solution = solveCurrent(); if (!solution) return false; solution.forEach(toggle); return !cells.some(function (value) { return value; }); } };
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
            wrap.append(info, controls, board, keys, el('p', { className: 'pk32v-prompt' }, '原版目标：把所有的路都走一遍。当前仅显示已从原生程序定位的布局串，未伪造其余关卡。')); body.append(wrap); load();
        }
        function renderShips() {
            const wrap = el('div', { className: 'pk32v-native-ships' });
            const controls = el('div', { className: 'pk32v-controls' });
            const board = el('div', { className: 'pk32v-ships-board' }); const grid = renderGrid(10, 10, 'ships-board'); const svg = el('svg', { className: 'pk32v-ships-lines' }); svg.setAttribute('viewBox', '0 0 10 10'); svg.setAttribute('aria-hidden', 'true'); board.append(svg, grid);
            let levels = [], layouts = [], level = 0, selected = null, links = [];
            function orientation(a, b, c) { const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); return value > 0 ? 1 : value < 0 ? -1 : 0; }
            function intersects(a, b, c, d) { const ab1 = orientation(a, b, c), ab2 = orientation(a, b, d), cd1 = orientation(c, d, a), cd2 = orientation(c, d, b); return ab1 * ab2 < 0 && cd1 * cd2 < 0; }
            function onSegment(a, b, p) { return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y); }
            function draw() {
                grid.innerHTML = '';
                const raw = levels[level] && levels[level].cells || '';
                const layout = layouts[level] || { width: 10, height: 10, cells: '' };
                const offsetX = Math.floor((10 - layout.width) / 2), offsetY = Math.floor((10 - layout.height) / 2);
                const layoutAt = function (x, y) { const lx = x - offsetX, ly = y - offsetY; return lx >= 0 && lx < layout.width && ly >= 0 && ly < layout.height ? layout.cells[ly * layout.width + lx] || '0' : '0'; };
                const points = (raw.match(/.{2}/g) || []).map(function (value) { return { x: Number(value[0]), y: Number(value[1]) }; });
                const cells = Array.from({ length: 100 }, () => []), byColor = {};
                points.forEach(function (point) { const color = layoutAt(point.x, point.y), index = point.y * 10 + point.x; if (color !== '0') { (byColor[color] = byColor[color] || []).push({ index: index, color: color }); } else cells[index].push({ kind: 'vortex' }); });
                Object.keys(byColor).forEach(function (color) { const group = byColor[color]; group.forEach(function (point, index) { const pair = color + '-' + Math.floor(index / 2); cells[point.index].push({ kind: 'endpoint', pair: pair, color: color, end: index % 2 }); }); });
                const totalPairs = new Set(cells.flat().filter(function (item) { return item.kind === 'endpoint'; }).map(function (item) { return item.pair; })).size;
                const occupied = new Set(links.flatMap(function (link) { return link.cells || [link.a, link.b]; }));
                function findPath(start, end) {
                    const previous = Array(100).fill(-2), queue = [start]; previous[start] = -1;
                    for (let head = 0; head < queue.length; head += 1) {
                        const current = queue[head]; if (current === end) break;
                        const x = current % 10, y = Math.floor(current / 10);
                        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                            const nx = x + dx, ny = y + dy, next = ny * 10 + nx;
                            if (nx < 0 || nx >= 10 || ny < 0 || ny >= 10 || previous[next] !== -2) continue;
                            if (next !== start && next !== end && (cells[next].length || occupied.has(next))) continue;
                            previous[next] = current; queue.push(next);
                        }
                    }
                    if (previous[end] === -2) return null;
                    const path = []; for (let current = end; current !== -1; current = previous[current]) path.push(current);
                    return path.reverse();
                }
                grid.dataset.layoutWidth = String(layout.width); grid.dataset.layoutHeight = String(layout.height);
                grid.dataset.endpointCount = String(cells.flat().filter(function (item) { return item.kind === 'endpoint'; }).length);
                grid.dataset.vortexCount = String(cells.flat().filter(function (item) { return item.kind === 'vortex'; }).length);
                for (let i = 0; i < 100; i += 1) {
                    const endpoint = cells[i].find(function (item) { return item.kind === 'endpoint'; }), vortex = cells[i].some(function (item) { return item.kind === 'vortex'; });
                    const b = button(endpoint ? '' : vortex ? '旋涡' : '', function () { if (!endpoint) return; if (selected == null) { selected = i; draw(); return; } if (selected !== i) { const a = selected, first = cells[a].find(function (item) { return item.kind === 'endpoint'; }); const path = first && first.pair === endpoint.pair && first.end !== endpoint.end && !links.some(function (link) { return link.pair === endpoint.pair; }) ? findPath(a, i) : null; if (path) links.push({ a: a, b: i, pair: endpoint.pair, cells: path }); } selected = null; draw(); });
                    b.dataset.cell = String(i); if (selected === i) b.classList.add('selected'); if (endpoint) { b.classList.add(endpoint.end ? 'monster' : 'ship'); b.dataset.color = endpoint.color; b.dataset.assetSource = 'sheet-8c5aa6.png'; const sprite = el('span', { className: 'pk32-ship-sprite' }); const column = Math.max(0, Number(endpoint.color) - 1); const spriteX = (column * -35) + 'px'; const spriteY = (endpoint.end ? -25 : 0) + 'px'; sprite.style.setProperty('--pk32-ship-x', spriteX); sprite.style.setProperty('--pk32-ship-y', spriteY); sprite.style.backgroundImage = "url('/img/pk32/ships-original.png')"; sprite.style.backgroundRepeat = 'no-repeat'; sprite.style.backgroundSize = '280px 290.5px'; sprite.style.backgroundPosition = spriteX + ' ' + spriteY; sprite.dataset.kind = endpoint.end ? 'monster' : 'ship'; sprite.dataset.color = endpoint.color; sprite.dataset.assetSource = 'ships-original.png'; sprite.setAttribute('aria-hidden', 'true'); b.appendChild(sprite); b.setAttribute('aria-label', (endpoint.end ? '海怪 ' : '船 ') + endpoint.color); } if (vortex) b.classList.add('vortex'); grid.appendChild(b);
                }
                svg.innerHTML = ''; links.forEach(function (p) { const path = p.cells || [p.a, p.b], line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); line.setAttribute('points', path.map(function (index) { return (index % 10 + .5) + ',' + (Math.floor(index / 10) + .5); }).join(' ')); line.dataset.pair = p.pair; line.dataset.pathLength = String(path.length); line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#f4c95d'); line.setAttribute('stroke-width', '.16'); line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round'); svg.appendChild(line); });
                status.textContent = levels.length ? '第 ' + (level + 1) + ' / 52 关；已定位 ' + levels.length + ' 关；路径 ' + links.length + ' / ' + totalPairs + ' 条' : '正在读取原生关卡';
                if (links.length === totalPairs && totalPairs > 0) finish('航海迷题第 ' + (level + 1) + ' 关完成。');
            }
            function load() { fetch('/data/pk32-ships-puzzle-levels.json').then(r => r.json()).then(d => { levels = d.levels || []; layouts = d.layouts || []; draw(); }).catch(() => { status.textContent = '原生关卡加载失败'; }); }
            controls.append(button('上一关', function () { if (level > 0) { level -= 1; links = []; selected = null; ended = false; draw(); } }), button('下一关', function () { if (level + 1 < levels.length) { level += 1; links = []; selected = null; ended = false; draw(); } }), button('清除连线', function () { links = []; selected = null; ended = false; draw(); }));
            wrap.append(el('p', { className: 'pk32v-prompt' }, '原版规则：连接相同颜色的船与海怪，绕过旋涡且连线不能交叉。当前保留原始坐标串。'), controls, board); body.append(wrap); load();
        }
        function render() { body.innerHTML = ''; setScore(0); ended = false; const renderer = config.name === '航海迷题' ? renderShips : config.name === '建筑制造' ? renderBuilding : config.name === '立体魔方二' ? renderNativeCube2 : config.name === '反射镜' ? renderNativeMirror : config.name === '交换彩球' ? renderNativeSwapBalls : config.name === '同色方块' ? function () { renderNativeBurstOriginal('同色方块', '/data/pk32-same-color-levels.json'); } : config.name === '爆破彩球' ? renderNativeBurstOriginal : config.name === '坦克大战' ? renderNativeTank : config.name === '海底寻宝' ? renderNativeSeaTreasure : config.name === '七盏灯' ? renderNativeLampsCandidate : config.name === '推箱子五' ? renderNativeSokoban5 : config.name === '推箱子四' ? renderNativeSokoban4 : config.name === '禅宗迷宫' ? renderNativeZenMaze : config.name === '跟花二' ? renderNativeGenhua2 : config.name === '魔法城堡二' ? renderNativeCastle2 : config.name === '魔法城堡' ? renderNativeCastle : config.name === '连结电线二' ? renderNativeWires2 : config.name === '七巧板' ? renderNativeTangram : config.name === '同步移动' ? renderNativeSyncMove : config.name === '宇宙黑洞' ? renderNativeBlackHole : config.name === '下一百层' ? renderNativeNextHundred : config.name === '上一百层' ? renderNativePreviousHundred : config.name === '飞一百米' ? renderNativeFlyHundred : config.name === '打砖块' ? renderNativeBreakout : STRUCTURED_PAYLOAD_NAMES.has(config.name) ? renderStructuredPayloads : ({ action: renderAction, reaction: renderReaction, number: renderNumber, memory: renderMemory, cards: renderCards, balls: renderBalls, maze: renderMaze, 'zen-garden': renderZenGarden, electromagnetic: renderElectromagnetic, 'pixel-island': renderPixelIsland, board: renderBoard, 'chinese-chess': renderChineseChess, go: renderGo, chess: renderChess, military: renderMilitary, mahjong: renderMahjong, billiards: renderBilliards, bubble: renderBubble, mummy: renderMummy }[config.mode] || renderAction); renderer(); }
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
