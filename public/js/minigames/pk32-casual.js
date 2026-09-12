// PK32 休闲玩法适配层：每个项目拥有独立启动配置，不接入当前小游戏关卡系统。
(function () {
    window.MiniGames = window.MiniGames || {};

    const SPECS = [
        { id: 'solitaire', names: ['接龙', '接龙二'], family: 'card', mode: 'klondike', source: 'pk32' },
        { id: 'freecell', names: ['空当接龙'], family: 'card', mode: 'freecell', source: 'pk32' },
        { id: 'spider', names: ['蜘蛛纸牌'], family: 'card', mode: 'spider', source: 'pk32' },
        { id: 'blackjack', names: ['21点', '21点二'], family: 'card', mode: 'blackjack', source: 'pk32' },
        { id: 'highlow', names: ['比大小'], family: 'card', mode: 'high-low', source: 'pk32' },
        { id: 'minesweeper', names: ['扫雷', '扫雷二', '扑克扫雷'], family: 'puzzle', mode: 'minesweeper', source: 'pk32' },
        { id: 'mahjong-connect', names: ['连连看'], family: 'puzzle', mode: 'link-pair', source: 'pk32' },
        { id: 'sokoban', names: ['推箱子', '推箱子二', '推箱子三', '推箱子四', '推箱子五', '推箱子六'], family: 'puzzle', mode: 'sokoban', source: 'pk32' },
        { id: 'pipe-connect', names: ['接水管'], family: 'puzzle', mode: 'pipe-connect', source: 'pk32' },
        { id: 'bubble-match', names: ['泡泡彩球', '多彩泡泡', '爆破彩球', '爆破彩球二', '变色彩球', '交换彩球'], family: 'puzzle', mode: 'bubble-match', source: 'pk32' },
    ];

    function copySpec(spec, name) {
        return {
            id: 'pk32-' + spec.id + '-' + name,
            name: name,
            family: spec.family,
            mode: spec.mode,
            source: spec.source,
            status: 'rules-partial',
            levelPolicy: 'original-only',
            levelCount: null,
            saveKey: 'pk32.casual.' + spec.id + '.' + name,
            renderer: 'canvas-2d',
            input: ['pointer', 'keyboard', 'touch'],
            note: '独立启动配置；原版关卡与流程核对后接入',
        };
    }

    const CONFIGS = SPECS.reduce(function (all, spec) {
        spec.names.forEach(function (name) { all[name] = copySpec(spec, name); });
        return all;
    }, {});

    function esc(value) {
        return String(value == null ? '' : value).replace(/[<>&"]/g, function (char) {
            return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char];
        });
    }

    function button(label, action, cls) {
        return '<button class="btn ' + (cls || 'ghost') + '" data-action="' + action + '">' + esc(label) + '</button>';
    }

    function playSession(host, config, session) {
        const mode = config.mode;
        const title = '<div class="emu-note"><b>' + esc(config.name) + '</b><br><span class="emu-tip">PK32 独立玩法 · 原版流程模式</span></div>';
        if (mode === 'minesweeper') return mines(host, title, session);
        if (mode === 'high-low') return highLow(host, title, session);
        if (mode === 'blackjack') return blackjack(host, title, session);
        if (mode === 'sokoban') return sokoban(host, title, session);
        if (mode === 'pipe-connect') return pipes(host, title, session);
        if (mode === 'bubble-match') return bubbles(host, title, session);
        host.innerHTML = title + '<div class="emu-note">该玩法已建立独立入口，正在接入原版规则。</div>';
    }

    function shell(host, title, body, status) {
        host.innerHTML = title + '<div class="emu-note"><span id="pk32-play-status">' + esc(status || '') + '</span></div><div id="pk32-play-area">' + body + '</div>';
        return host.querySelector('#pk32-play-area');
    }

    function mines(host, title, session) {
        const size = 8, mineCount = 10;
        let board, opened, flags, over;
        function reset() { board = Array.from({ length: size * size }, function () { return false; }); opened = []; flags = []; over = false; while (board.filter(Boolean).length < mineCount) { board[Math.floor(Math.random() * board.length)] = true; } draw(); }
        function near(i) { const x = i % size, y = Math.floor(i / size), a = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < size && ny >= 0 && ny < size && (dx || dy)) a.push(ny * size + nx); } return a; }
        function count(i) { return near(i).filter(function (n) { return board[n]; }).length; }
        function reveal(i) { if (over || opened[i] || flags[i]) return; opened[i] = true; if (board[i]) { over = true; opened = board.map(function () { return true; }); setStatus('踩雷，点击“重新开始”再来一局'); } else if (!count(i)) near(i).forEach(reveal); draw(); }
        function setStatus(t) { const s = host.querySelector('#pk32-play-status'); if (s) s.textContent = t; }
        function draw() { const area = host.querySelector('#pk32-play-area'); if (!area) return; area.innerHTML = button('重新开始', 'reset') + '<div class="pk32-grid" style="display:grid;grid-template-columns:repeat(' + size + ',36px);gap:3px;margin-top:10px">' + board.map(function (mine, i) { const show = opened[i], n = count(i); return '<button class="btn ghost" style="width:36px;height:36px;padding:0" data-cell="' + i + '">' + (show ? (mine ? 'X' : (n || '')) : (flags[i] ? '旗' : '■')) + '</button>'; }).join('') + '</div>'; area.querySelector('[data-action="reset"]').onclick = reset; area.querySelectorAll('[data-cell]').forEach(function (b) { b.onclick = function (e) { const i = +b.dataset.cell; if (e.shiftKey) { flags[i] = !flags[i]; draw(); } else reveal(i); }; }); }
        shell(host, title, '', '点击方块翻开，Shift+点击标记'); reset();
    }

    function highLow(host, title) { let score = 0, current; function draw() { const area = shell(host, title, button('抽牌', 'draw'), '猜下一张牌比当前大还是小'); area.querySelector('[data-action="draw"]').onclick = function () { current = 1 + Math.floor(Math.random() * 13); area.innerHTML = '<div>当前牌：<b>' + current + '</b></div>' + button('下一张更大', 'up') + button('下一张更小', 'down') + '<div style="margin-top:8px">得分：' + score + '</div>'; area.querySelectorAll('[data-action]').forEach(function (b) { b.onclick = function () { const next = 1 + Math.floor(Math.random() * 13), ok = (b.dataset.action === 'up' ? next > current : next < current); score = ok ? score + 1 : 0; current = next; setTimeout(draw, 0); }; }); }; function setTimeoutDraw() {} } draw(); }

    function blackjack(host, title) { let player, dealer, done; function card() { return 1 + Math.floor(Math.random() * 10); } function total(a) { return a.reduce(function (x, n) { return x + n; }, 0); } function draw() { const area = shell(host, title, button('新局', 'new'), ''); area.querySelector('[data-action="new"]').onclick = function () { player = [card(), card()]; dealer = [card(), card()]; done = false; show(); }; function show() { area.innerHTML = '<div>你的牌：' + player.join('、') + '（' + total(player) + '）</div><div>庄家明牌：' + dealer[0] + '</div>' + (done ? '<div>庄家：' + dealer.join('、') + '（' + total(dealer) + '）</div>' : '') + (done ? button('再来一局', 'new') : button('要牌', 'hit') + button('停牌', 'stand')); area.querySelectorAll('[data-action]').forEach(function (b) { b.onclick = function () { if (b.dataset.action === 'hit') { player.push(card()); if (total(player) >= 21) done = true; } else if (b.dataset.action === 'stand') { done = true; while (total(dealer) < 17) dealer.push(card()); } show(); }; }); } } draw(); }

    function sokoban(host, title) { const map = ['#####','# . #','# $ #','# @ #','#####']; let p, box; function draw() { const area = shell(host, title, button('重置', 'reset'), '方向键或点击方向移动，把箱子推到目标'); const dirs = [[0,-1,'上'],[0,1,'下'],[-1,0,'左'],[1,0,'右']]; area.innerHTML += '<div id="soko-board" style="font-size:32px;line-height:1.1;margin:12px 0"></div>' + dirs.map(function (d) { return button(d[2], 'd' + d[2]); }).join(''); const b = area.querySelector('#soko-board'); b.textContent = map.map(function (r, y) { return r.split('').map(function (c, x) { if (x === p[0] && y === p[1]) return '🙂'; if (x === box[0] && y === box[1]) return (x === 2 && y === 1) ? '◎' : '□'; return c === '#' ? '墙' : (c === '.' ? '◎' : '　'); }).join(''); }).join('\n'); area.querySelector('[data-action="reset"]').onclick = init; dirs.forEach(function (d) { const btn = area.querySelector('[data-action="d' + d[2] + '"]'); btn.onclick = function () { move(d[0], d[1]); }; }); } function move(dx, dy) { const nx = p[0] + dx, ny = p[1] + dy; if (map[ny][nx] === '#') return; if (nx === box[0] && ny === box[1]) { const bx = nx + dx, by = ny + dy; if (map[by][bx] === '#' || (bx === p[0] && by === p[1])) return; box = [bx, by]; } p = [nx, ny]; draw(); if (box[0] === 2 && box[1] === 1) { const s = host.querySelector('#pk32-play-status'); if (s) s.textContent = '完成本局'; } } function init() { p = [2, 3]; box = [2, 2]; draw(); } document.addEventListener('keydown', function (e) { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key) >= 0) { const d = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0] }[e.key]; move(d[0], d[1]); } }); init(); }

    function pipes(host, title) { let grid; function init() { grid = Array.from({ length: 16 }, function () { return Math.floor(Math.random() * 4); }); draw(); } function draw() { const area = shell(host, title, button('重置', 'reset'), '点击旋转水管，连接左上角到右下角'); area.innerHTML += '<div style="display:grid;grid-template-columns:repeat(4,48px);gap:3px;margin-top:10px">' + grid.map(function (r, i) { return '<button class="btn ghost" style="width:48px;height:48px;font-size:24px" data-p="' + i + '">' + ['└','┌','┐','┘'][r] + '</button>'; }).join('') + '</div>'; area.querySelector('[data-action="reset"]').onclick = init; area.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { grid[+b.dataset.p] = (grid[+b.dataset.p] + 1) % 4; draw(); }; }); } init(); }

    function bubbles(host, title) { let cells; function init() { cells = Array.from({ length: 36 }, function () { return Math.floor(Math.random() * 4); }); draw(); } function draw() { const area = shell(host, title, button('重置', 'reset'), '点击相邻同色球消除，至少两个相连才可消除'); area.innerHTML += '<div style="display:grid;grid-template-columns:repeat(6,38px);gap:4px;margin-top:10px">' + cells.map(function (c, i) { return '<button class="btn ghost" style="width:38px;height:38px;padding:0;background:' + ['#e85d75','#55a7e8','#65c878','#e4b84c'][c] + '" data-b="' + i + '">●</button>'; }).join('') + '</div>'; area.querySelector('[data-action="reset"]').onclick = init; area.querySelectorAll('[data-b]').forEach(function (b) { b.onclick = function () { const i = +b.dataset.b, c = cells[i], group = [i]; [i-1,i+1,i-6,i+6].forEach(function (n) { if (n >= 0 && n < 36 && cells[n] === c && Math.abs((n % 6) - (i % 6)) <= 1) group.push(n); }); if (group.length > 1) { group.forEach(function (n) { cells[n] = -1; }); draw(); } }; }); } init(); }

    function createSession(host, config, opts) {
        const session = {
            config: config,
            host: host,
            options: opts || {},
            stopped: false,
            stop: function () {
                this.stopped = true;
                host.innerHTML = '';
            },
        };
        playSession(host, config, session);
        return session;
    }

    const api = {
        SPECS: SPECS,
        CONFIGS: CONFIGS,
        get(name) { return CONFIGS[name] || null; },
        list() { return Object.keys(CONFIGS).map(function (name) { return CONFIGS[name]; }); },
        startGame(container, spec, opts) {
            const config = typeof spec === 'string' ? CONFIGS[spec] : spec;
            if (!config) throw new Error('Unknown PK32 casual game');
            const session = { config: config, host: container, options: opts || {}, stopped: false };
            session.stop = function () { session.stopped = true; container.innerHTML = ''; };
            createSession(container, config, session);
            return session;
        },
        start(container, opts) {
            opts = opts || {};
            let active = true;
            const names = Object.keys(CONFIGS);
            container.innerHTML = '<div class="emu-note"><b>PK32 纸牌与益智</b><br>' +
                '独立维护纸牌和益智玩法；不套用当前小游戏的 50 关、星级或无尽模式。</div>' +
                '<div class="emu-toolbar"><input id="pk32-casual-q" placeholder="搜索玩法" aria-label="搜索 PK32 纸牌与益智玩法"><span class="emu-toolbar-count" id="pk32-casual-count"></span></div>' +
                '<div class="emu-list" id="pk32-casual-list"></div>';
            const query = container.querySelector('#pk32-casual-q');
            const list = container.querySelector('#pk32-casual-list');
            const count = container.querySelector('#pk32-casual-count');
            function render() {
                if (!active) return;
                const q = query.value.trim().toLowerCase();
                const visible = names.filter(function (name) { return !q || name.toLowerCase().indexOf(q) >= 0; });
                count.textContent = visible.length + ' / ' + names.length + ' 项';
                list.innerHTML = visible.map(function (name) {
                    const config = CONFIGS[name];
                    return '<div class="emu-item"><div class="emu-item-info"><div class="emu-item-name">' + esc(name) + '</div>' +
                        '<div class="emu-item-meta">' + esc(config.family) + ' · ' + esc(config.mode) + ' · 原版关卡数量待核对</div></div>' +
                        '<button class="btn ghost" data-pk32-casual="' + esc(name) + '">独立启动</button>' +
                        '<span class="emu-tag" style="color:#ffd56b;border-color:rgba(255,213,107,.35)">规则接入中</span></div>';
                }).join('');
                list.querySelectorAll('[data-pk32-casual]').forEach(function (button) {
                    button.onclick = function () { launch(CONFIGS[button.dataset.pk32Casual]); };
                });
            }
            function launch(config) {
                list.innerHTML = '';
                const host = document.createElement('div');
                host.style.minHeight = '360px';
                list.appendChild(host);
                createSession(host, config, opts);
                const back = document.createElement('button');
                back.className = 'btn ghost';
                back.textContent = '返回 PK32 纸牌与益智';
                back.style.marginTop = '10px';
                back.onclick = render;
                list.appendChild(back);
                opts.onScore && opts.onScore(config.name + ' · 独立配置');
            }
            query.oninput = render;
            render();
            opts.onScore && opts.onScore(names.length + ' 项独立配置');
            return { stop() { active = false; container.innerHTML = ''; } };
        },
    };

    window.MiniGames.pk32Casual = api;
    window.PK32Casual = api;
})();
