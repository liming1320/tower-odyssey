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
        { id: 'bubble-match', names: ['泡泡彩球', '多彩泡泡', '爆破彩球', '变色彩球', '交换彩球'], family: 'puzzle', mode: 'bubble-match', source: 'pk32' },
        { id: 'bubble-bomb', names: ['爆破彩球二'], family: 'puzzle', mode: 'bubble-bomb', source: 'pk32', levelCount: 106 },
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
            levelCount: name === '推箱子四' ? 23 : spec.id === 'pipe-connect' ? 5 : null,
            saveKey: 'pk32.casual.' + spec.id + '.' + name,
            renderer: 'canvas-2d',
            input: ['pointer', 'keyboard', 'touch'],
            note: name === '推箱子四' ? '原生提示确认 1-23 关；已提取 19 张地图，仍有 4 关待定位' : spec.id === 'pipe-connect' ? '原生提示确认 1-5 关；布局编码还原中' : '独立启动配置；原版关卡与流程核对后接入',
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
        if (mode === 'klondike') return klondike(host, title, session);
        if (mode === 'freecell') return freecell(host, title, session);
        if (mode === 'spider') return spider(host, title, session);
        if (mode === 'minesweeper') return mines(host, title, session);
        if (mode === 'high-low') return highLow(host, title, session);
        if (mode === 'blackjack') return blackjack(host, title, session);
        if (mode === 'sokoban') return config.name === '推箱子四' ? sokobanNative4(host, title, session) : sokoban(host, title, session);
        if (mode === 'pipe-connect') return pipes(host, title, session);
        if (mode === 'bubble-match') return bubbles(host, title, session);
        if (mode === 'bubble-bomb') return bubbleBomb(host, title, session);
        host.innerHTML = title + '<div class="emu-note">该玩法已建立独立入口，正在接入原版规则。</div>';
    }

    function shell(host, title, body, status) {
        host.innerHTML = title + '<div class="emu-note"><span id="pk32-play-status">' + esc(status || '') + '</span></div><div id="pk32-play-area">' + body + '</div>';
        return host.querySelector('#pk32-play-area');
    }

    function cardGame(host, title, session, kind) {
        const suits = ['S', 'H', 'C', 'D'], marks = ['♠', '♥', '♣', '♦'];
        let stock, waste, columns, foundations, freecells, selected = null, over = false;
        function makeDeck() { const d = []; const copies = kind === 'spider' ? 2 : 1; for (let copy = 0; copy < copies; copy++) suits.forEach((s, si) => { for (let r = 1; r <= 13; r++) d.push({ s, r, red: si === 1 || si === 3, copy: copy }); }); return d.sort(() => Math.random() - .5); }
        function text(c) { return c ? marks[suits.indexOf(c.s)] + (c.r === 1 ? 'A' : c.r === 11 ? 'J' : c.r === 12 ? 'Q' : c.r === 13 ? 'K' : c.r) : '空'; }
        function canStack(a, b) { return a && b && a.r === b.r - 1 && (kind === 'spider' || a.red !== b.red); }
        function done() { return foundations.every(x => x === 13) || (kind === 'spider' && columns.every(c => !c.length)); }
        function reset() {
            const d = makeDeck(); stock = []; waste = []; foundations = [0, 0, 0, 0]; freecells = [null, null, null, null]; selected = null; over = false;
            if (kind === 'klondike') { columns = Array.from({ length: 7 }, () => []); for (let col = 0; col < 7; col++) for (let i = 0; i <= col; i++) { const c = d.pop(); c.face = i === col; columns[col].push(c); } stock = d; }
            else if (kind === 'freecell') { columns = Array.from({ length: 8 }, () => []); d.forEach((c, i) => columns[i % 8].push(c)); columns.forEach(c => c.forEach(x => { x.face = true; })); stock = []; }
            else { columns = Array.from({ length: 10 }, () => []); d.slice(0, 54).forEach((c, i) => { c.face = true; columns[i % 10].push(c); }); stock = d.slice(54); }
            draw();
        }
        function draw() {
            const area = shell(host, title, '', kind === 'klondike' ? '接龙：点击牌列，再点击目标列或回收区' : kind === 'freecell' ? '空当接龙：移动牌到空位、牌列或回收区' : '蜘蛛纸牌：按同花色顺序排列并收集完整牌组');
            const top = document.createElement('div'); top.className = 'pk32-card-top';
            const stockBtn = document.createElement('button'); stockBtn.className = 'btn ghost'; stockBtn.textContent = '牌堆 ' + stock.length; stockBtn.disabled = over; stockBtn.onclick = () => { if (!over && stock.length) { waste.push(stock.pop()); draw(); } };
            top.appendChild(stockBtn); const discard = document.createElement('span'); discard.textContent = ' 弃牌：' + (waste.length ? text(waste[waste.length - 1]) : '空'); top.appendChild(discard);
            if (kind === 'freecell') freecells.forEach((c, i) => { const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = '空当 ' + (c ? text(c) : '空'); b.disabled = over; b.onclick = () => { if (selected && typeof selected.from === 'number' && selected.index === columns[selected.from].length - 1 && !freecells[i]) { freecells[i] = columns[selected.from].pop(); selected = null; draw(); } }; top.appendChild(b); });
            foundations.forEach((n, i) => { const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = '回收 ' + marks[i] + ' ' + n; b.disabled = over; b.onclick = () => { if (selected && selected.from === 'waste' && selected.card.s === suits[i] && selected.card.r === n + 1) { waste.pop(); foundations[i]++; selected = null; draw(); } }; top.appendChild(b); });
            area.appendChild(top);
            const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:5px;align-items:flex-start;overflow:auto;margin-top:8px;';
            function canMove(col, index) { if (index < 0 || index >= col.length || !col[index].face) return false; for (let i = index + 1; i < col.length; i++) { if (!col[i].face || !canStack(col[i], col[i - 1]) || (kind === 'spider' && col[i].s !== col[i - 1].s)) return false; } return true; }
            function moveTo(source, target, index) { if (!canMove(source, index)) return false; const moving = source.slice(index); if (kind === 'freecell' && moving.length !== 1) return false; if (target.length && !canStack(moving[0], target[target.length - 1])) return false; target.push(...source.splice(index)); if (kind === 'klondike' && source.length && !source[source.length - 1].face) source[source.length - 1].face = true; return true; }
            columns.forEach((col, ci) => { const box = document.createElement('div'); box.style.cssText = 'min-width:58px;min-height:125px;border:1px dashed #60758a;padding:3px;'; const label = document.createElement('div'); label.textContent = '列 ' + (ci + 1); box.appendChild(label); col.forEach((c, i) => { const b = document.createElement('button'); b.className = 'btn ghost'; b.style.cssText = 'display:block;width:54px;padding:4px 2px;margin-top:2px;color:' + (c.red ? '#ff8a8a' : '#fff'); b.textContent = c.face ? text(c) : '■'; b.disabled = over; b.onclick = () => { if (!c.face) return; if (!selected) { if (!canMove(col, i)) return; selected = { from: ci, index: i, card: c }; b.classList.add('selected'); draw(); return; } if (selected.from !== ci) { const src = columns[selected.from]; if (moveTo(src, col, selected.index)) { selected = null; draw(); } } }; box.appendChild(b); }); box.onclick = () => { if (!over && selected && selected.from !== ci) { const src = columns[selected.from]; if (moveTo(src, col, selected.index)) { selected = null; draw(); } } }; row.appendChild(box); });
            area.appendChild(row);
            const end = document.createElement('button'); end.className = 'btn ghost'; end.textContent = '检查完成'; end.onclick = () => { if (done()) { over = true; setStatus(host, '本局完成'); } else setStatus(host, '仍有牌未完成'); }; area.appendChild(end);
        }
        function setStatus(root, value) { const node = root.querySelector('#pk32-play-status'); if (node) node.textContent = value; }
        session.cleanup = session.cleanup || [];
        session.cleanup.push(() => { selected = null; });
        session.reset = reset; reset();
        return session;
    }
    function klondike(host, title, session) { return cardGame(host, title, session, 'klondike'); }
    function freecell(host, title, session) { return cardGame(host, title, session, 'freecell'); }
    function spider(host, title, session) { return cardGame(host, title, session, 'spider'); }

    function mines(host, title, session) {
        const size = 8, mineCount = 10;
        let board, opened, flags, over, firstReveal;
        function reset() { board = Array.from({ length: size * size }, function () { return false; }); opened = []; flags = []; over = false; firstReveal = true; while (board.filter(Boolean).length < mineCount) { board[Math.floor(Math.random() * board.length)] = true; } draw(); }
        function near(i) { const x = i % size, y = Math.floor(i / size), a = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < size && ny >= 0 && ny < size && (dx || dy)) a.push(ny * size + nx); } return a; }
        function count(i) { return near(i).filter(function (n) { return board[n]; }).length; }
        function reveal(i) {
            if (over || opened[i] || flags[i]) return;
            if (firstReveal) {
                firstReveal = false;
                if (board[i]) {
                    board[i] = false;
                    const replacement = board.findIndex(function (mine, index) { return !mine && index !== i; });
                    if (replacement >= 0) board[replacement] = true;
                }
            }
            opened[i] = true;
            if (board[i]) {
                over = true;
                opened = board.map(function () { return true; });
                setStatus('踩雷，点击“重新开始”再来一局');
            } else if (!count(i)) near(i).forEach(reveal);
            if (!over && opened.filter(Boolean).length >= size * size - mineCount) {
                over = true;
                setStatus('安全区域已全部打开，完成本局');
            }
            draw();
        }
        function setStatus(t) { const s = host.querySelector('#pk32-play-status'); if (s) s.textContent = t; }
        function draw() { const area = host.querySelector('#pk32-play-area'); if (!area) return; area.innerHTML = button('重新开始', 'reset') + '<div class="pk32-grid" style="display:grid;grid-template-columns:repeat(' + size + ',36px);gap:3px;margin-top:10px">' + board.map(function (mine, i) { const show = opened[i], n = count(i); return '<button class="btn ghost" style="width:36px;height:36px;padding:0" data-cell="' + i + '">' + (show ? (mine ? 'X' : (n || '')) : (flags[i] ? '旗' : '■')) + '</button>'; }).join('') + '</div>'; area.querySelector('[data-action="reset"]').onclick = reset; area.querySelectorAll('[data-cell]').forEach(function (b) { b.disabled = over; b.onclick = function (e) { const i = +b.dataset.cell; if (over || opened[i]) return; if (e.shiftKey) { flags[i] = !flags[i]; draw(); } else reveal(i); }; }); }
        shell(host, title, '', '点击方块翻开，Shift+点击标记'); reset();
    }

    function highLow(host, title) { let score = 0, current; function draw() { const area = shell(host, title, button('抽牌', 'draw'), '猜下一张牌比当前大还是小'); area.querySelector('[data-action="draw"]').onclick = function () { current = 1 + Math.floor(Math.random() * 13); area.innerHTML = '<div>当前牌：<b>' + current + '</b></div>' + button('下一张更大', 'up') + button('下一张更小', 'down') + '<div style="margin-top:8px">得分：' + score + '</div>'; area.querySelectorAll('[data-action]').forEach(function (b) { b.onclick = function () { const next = 1 + Math.floor(Math.random() * 13), ok = (b.dataset.action === 'up' ? next > current : next < current); score = ok ? score + 1 : 0; current = next; setTimeout(draw, 0); }; }); }; function setTimeoutDraw() {} } draw(); }

    function blackjack(host, title) { let player, dealer, done; function card() { return 1 + Math.floor(Math.random() * 10); } function total(a) { return a.reduce(function (x, n) { return x + n; }, 0); } function draw() { const area = shell(host, title, button('新局', 'new'), ''); area.querySelector('[data-action="new"]').onclick = function () { player = [card(), card()]; dealer = [card(), card()]; done = false; show(); }; function show() { area.innerHTML = '<div>你的牌：' + player.join('、') + '（' + total(player) + '）</div><div>庄家明牌：' + dealer[0] + '</div>' + (done ? '<div>庄家：' + dealer.join('、') + '（' + total(dealer) + '）</div>' : '') + (done ? button('再来一局', 'new') : button('要牌', 'hit') + button('停牌', 'stand')); area.querySelectorAll('[data-action]').forEach(function (b) { b.onclick = function () { if (b.dataset.action === 'hit') { player.push(card()); if (total(player) >= 21) done = true; } else if (b.dataset.action === 'stand') { done = true; while (total(dealer) < 17) dealer.push(card()); } show(); }; }); } } draw(); }

    function sokoban(host, title, session) { const map = ['#####','# . #','# $ #','# @ #']; let p, box, over; const key = function (e) { if (session.stopped || over || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key) < 0) return; const d = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0] }[e.key]; move(d[0], d[1]); }; document.addEventListener('keydown', key); session.cleanup = session.cleanup || []; session.cleanup.push(function () { document.removeEventListener('keydown', key); }); function draw() { const area = shell(host, title, button('重置', 'reset'), over ? '本局已完成，点击重置再来一局' : '方向键或点击方向移动，把箱子推到目标'); const dirs = [[0,-1,'上'],[0,1,'下'],[-1,0,'左'],[1,0,'右']]; area.innerHTML += '<div id="soko-board" style="font-size:32px;line-height:1.1;margin:12px 0"></div>' + dirs.map(function (d) { return button(d[2], 'd' + d[2]); }).join(''); const b = area.querySelector('#soko-board'); b.textContent = map.map(function (r, y) { return r.split('').map(function (c, x) { if (x === p[0] && y === p[1]) return '🙂'; if (x === box[0] && y === box[1]) return (x === 2 && y === 1) ? '◎' : '□'; return c === '#' ? '墙' : (c === '.' ? '◎' : '　'); }).join(''); }).join('\n'); area.querySelector('[data-action="reset"]').onclick = init; dirs.forEach(function (d) { const btn = area.querySelector('[data-action="d' + d[2] + '"]'); btn.disabled = over; btn.onclick = function () { move(d[0], d[1]); }; }); } function move(dx, dy) { if (session.stopped || over) return; const nx = p[0] + dx, ny = p[1] + dy; if (!map[ny] || map[ny][nx] === '#') return; if (nx === box[0] && ny === box[1]) { const bx = nx + dx, by = ny + dy; if (!map[by] || map[by][bx] === '#' || (bx === p[0] && by === p[1])) return; box = [bx, by]; } p = [nx, ny]; if (box[0] === 2 && box[1] === 1) { over = true; } draw(); } function init() { p = [2, 3]; box = [2, 2]; over = false; draw(); } init(); }
    function sokobanNative4(host, title, session) {
        let levels = [], level = Number.isInteger(session.options.levelIdx) ? session.options.levelIdx : 0, board = [], player = null, boxes = [], targets = [], over = false;
        const dirs = [[0, -1, '上'], [0, 1, '下'], [-1, 0, '左'], [1, 0, '右']];
        function decode(cells, width, height) {
            board = cells.split('').map(Number); player = null; boxes = []; targets = [];
            board.forEach(function (code, i) { const x = i % width, y = Math.floor(i / width); if (code === 1 || code === 6) player = [x, y]; if (code === 2 || code === 4) boxes.push([x, y]); if (code === 3 || code === 4 || code === 6) targets.push([x, y]); });
            over = false;
        }
        function at(list, x, y) { return list.some(function (p) { return p[0] === x && p[1] === y; }); }
        function codeAt(x, y) { return board[y * levels[level].width + x]; }
        function draw() {
            const map = levels[level], area = shell(host, title, button('重置', 'reset'), over ? '第' + (level + 1) + ' 关完成' : '第' + (level + 1) + ' / 23 关：把同色箱子推到目标位置');
            area.innerHTML += '<div class="pk32-soko-levels">' + levels.map(function (_, i) { return button('第' + (i + 1) + '关', 'level' + i, i === level ? 'primary' : 'ghost'); }).join('') + '<span>已提取 ' + levels.length + ' / 23 关</span></div>';
            const grid = document.createElement('div'); grid.className = 'pk32-soko-grid'; grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + map.width + ',minmax(30px,1fr));gap:1px;max-width:100%;overflow:auto;margin:10px 0;';
            for (let i = 0; i < board.length; i += 1) { const x = i % map.width, y = Math.floor(i / map.width), code = board[i], cell = document.createElement('button'); cell.type = 'button'; cell.style.cssText = 'width:30px;height:30px;padding:0;border:1px solid #60758a;background:' + (code === 5 ? '#293746' : '#17212b') + ';color:#fff;font-size:18px'; const isPlayer = player && player[0] === x && player[1] === y, isBox = at(boxes, x, y), isTarget = at(targets, x, y); cell.textContent = isBox ? (isTarget ? '◆' : '■') : isPlayer ? (isTarget ? '◎' : '●') : isTarget ? '·' : code === 5 ? '' : ''; cell.setAttribute('aria-label', isBox ? (isTarget ? '箱子目标' : '箱子') : isPlayer ? '玩家' : isTarget ? '目标' : code === 5 ? '墙' : '地面'); grid.appendChild(cell); }
            area.appendChild(grid); area.innerHTML += dirs.map(function (d) { return button(d[2], 'move' + d[2], 'ghost'); }).join('');
            area.querySelector('[data-action="reset"]').onclick = function () { decode(levels[level].cells, levels[level].width, levels[level].height); draw(); };
            levels.forEach(function (_, i) { area.querySelector('[data-action="level' + i + '"]').onclick = function () { level = i; decode(levels[level].cells, levels[level].width, levels[level].height); draw(); }; });
            dirs.forEach(function (d) { area.querySelector('[data-action="move' + d[2] + '"]').onclick = function () { move(d[0], d[1]); }; });
        }
        function move(dx, dy) { if (over || !player) return; const map = levels[level], nx = player[0] + dx, ny = player[1] + dy; if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height || codeAt(nx, ny) === 5) return; const bi = boxes.findIndex(function (p) { return p[0] === nx && p[1] === ny; }); if (bi >= 0) { const bx = nx + dx, by = ny + dy; if (bx < 0 || by < 0 || bx >= map.width || by >= map.height || codeAt(bx, by) === 5 || at(boxes, bx, by)) return; boxes[bi] = [bx, by]; } player = [nx, ny]; over = boxes.length > 0 && boxes.every(function (p) { return at(targets, p[0], p[1]); }); draw(); }
        const onKey = function (e) { if (session.stopped || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) < 0) return; e.preventDefault(); const d = dirs.find(function (x) { return ('Arrow' + ({ '上': 'Up', '下': 'Down', '左': 'Left', '右': 'Right' }[x[2]])) === e.key; }); if (d) move(d[0], d[1]); };
        document.addEventListener('keydown', onKey); session.cleanup = session.cleanup || []; session.cleanup.push(function () { document.removeEventListener('keydown', onKey); });
        fetch('/data/pk32-sokoban4-levels.json').then(function (r) { return r.json(); }).then(function (data) { levels = data.levels || []; if (!levels.length) throw new Error('没有提取到推箱子四地图'); level = Math.max(0, Math.min(levels.length - 1, level)); decode(levels[level].cells, levels[level].width, levels[level].height); draw(); }).catch(function () { host.innerHTML = title + '<div class="emu-note">原生地图加载失败，未使用随机占位地图。</div>'; });
    }

    function pipes(host, title, session) { let grid, over, level = 0; const size = 4; const levels = [[1,0,3,1,2,3,1,0,0,1,2,3,1,0,3,3],[1,1,0,3,2,3,1,0,0,2,2,3,1,0,3,3],[1,0,0,3,2,3,1,0,0,1,3,3,1,0,2,3],[1,0,3,3,2,3,1,0,0,1,2,3,1,3,3,3],[1,1,0,3,2,3,1,0,0,2,2,3,1,3,2,3]]; function hasBoundaryLeak() { return grid.some(function (r, i) { const x = i % size, y = Math.floor(i / size), out = links(i); return (x === 0 && out.indexOf('L') >= 0) || (x === size - 1 && out.indexOf('R') >= 0) || (y === 0 && out.indexOf('U') >= 0) || (y === size - 1 && out.indexOf('D') >= 0); }); } function init(nextLevel) { level = Number.isInteger(nextLevel) ? Math.max(0, Math.min(levels.length - 1, nextLevel)) : level; grid = levels[level].map(function (r) { return (r + level + 1) % 4; }); over = false; draw(); } function links(i) { const r = grid[i], out = []; if (r === 0 || r === 1) out.push('D'); if (r === 1 || r === 2) out.push('R'); if (r === 2 || r === 3) out.push('U'); if (r === 3 || r === 0) out.push('L'); return out; } function connected() { const seen = new Set([0]), queue = [0]; while (queue.length) { const i = queue.shift(), x = i % size, y = Math.floor(i / size); links(i).forEach(function (dir) { const nx = x + (dir === 'R' ? 1 : dir === 'L' ? -1 : 0), ny = y + (dir === 'D' ? 1 : dir === 'U' ? -1 : 0); if (nx < 0 || ny < 0 || nx >= size || ny >= size) return; const n = ny * size + nx, opposite = { R: 'L', L: 'R', U: 'D', D: 'U' }[dir]; if (links(n).indexOf(opposite) >= 0 && !seen.has(n)) { seen.add(n); queue.push(n); } }); } return seen.has(size * size - 1); } function draw() { const area = shell(host, title, button('重置', 'reset'), over ? '第' + (level + 1) + '关已接通' : '第' + (level + 1) + ' / 5 关：旋转管道，令左上角连接到右下角'); area.innerHTML += '<div class="pk32-pipe-levels">' + levels.map(function (_, i) { return '<button class="btn ghost" data-level="' + i + '"' + (i === level ? ' disabled' : '') + '>第' + (i + 1) + '关</button>'; }).join('') + '</div><div style="display:grid;grid-template-columns:repeat(4,48px);gap:3px;margin-top:10px">' + grid.map(function (r, i) { return '<button class="btn ghost" style="width:48px;height:48px;font-size:24px" data-p="' + i + '">' + ['└','┌','┐','┘'][r] + '</button>'; }).join('') + '</div>'; area.querySelector('[data-action="reset"]').onclick = function () { init(level); }; area.querySelectorAll('[data-level]').forEach(function (b) { b.onclick = function () { init(Number(b.dataset.level)); }; }); area.querySelectorAll('[data-p]').forEach(function (b) { b.disabled = over; b.onclick = function () { if (over) return; grid[+b.dataset.p] = (grid[+b.dataset.p] + 1) % 4; if (connected() && !hasBoundaryLeak()) over = true; draw(); }; }); } init(session && Number.isInteger(session.options.levelIdx) ? session.options.levelIdx : 0); }

    function bubbles(host, title) { let cells, over; const size = 6; function init() { cells = Array.from({ length: size * size }, function () { return Math.floor(Math.random() * 4); }); over = false; draw(); } function groupAt(start) { const color = cells[start], group = [], seen = new Set([start]), queue = [start]; while (queue.length) { const i = queue.shift(); if (cells[i] !== color) continue; group.push(i); const x = i % size, y = Math.floor(i / size); [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (p) { if (p[0] >= 0 && p[0] < size && p[1] < size) { const n = p[1] * size + p[0]; if (p[0] >= 0 && p[0] < size && !seen.has(n)) { seen.add(n); queue.push(n); } } }); } return group; } function collapse() { for (let x = 0; x < size; x++) { const col = cells.filter(function (_, i) { return i % size === x && cells[i] >= 0; }); for (let y = 0; y < size; y++) cells[y * size + x] = y < size - col.length ? -1 : col[y - (size - col.length)]; } let write = 0; for (let x = 0; x < size; x++) { if (cells.slice(x * size, (x + 1) * size).some(function (c) { return c >= 0; })) { if (write !== x) for (let y = 0; y < size; y++) cells[y * size + write * size + y] = cells[y * size + x * size + y]; write += 1; } } for (let x = write; x < size; x++) for (let y = 0; y < size; y++) cells[y * size + x] = -1; } function hasMoves() { return cells.some(function (c, i) { return c >= 0 && [i - 1, i + 1, i - size, i + size].some(function (n) { return n >= 0 && n < cells.length && Math.abs(n % size - i % size) + Math.abs(Math.floor(n / size) - Math.floor(i / size)) === 1 && cells[n] === c; }); }); } function draw() { const area = shell(host, title, button('重置', 'reset'), over ? (cells.some(function (c) { return c >= 0; }) ? '没有可消除的相邻球组，本局结束' : '全部彩球消除，完成本局') : '点击相邻同色球消除，至少两个相连才可消除'); area.innerHTML += '<div style="display:grid;grid-template-columns:repeat(6,38px);gap:4px;margin-top:10px">' + cells.map(function (c, i) { return '<button class="btn ghost" style="width:38px;height:38px;padding:0;background:' + (c < 0 ? '#18232c' : ['#e85d75','#55a7e8','#65c878','#e4b84c'][c]) + '" data-b="' + i + '">' + (c < 0 ? '' : '●') + '</button>'; }).join('') + '</div>'; area.querySelector('[data-action="reset"]').onclick = init; area.querySelectorAll('[data-b]').forEach(function (b) { b.disabled = over || !cells[+b.dataset.b] && cells[+b.dataset.b] !== 0; b.onclick = function () { if (over) return; const i = +b.dataset.b, group = cells[i] < 0 ? [] : groupAt(i); if (group.length > 1) { group.forEach(function (n) { cells[n] = -1; }); collapse(); if (!cells.some(function (c) { return c >= 0; })) over = true; else if (!hasMoves()) over = true; draw(); } }; }); } init(); }

    function bubbleBomb(host, title, session) { let cells, over; const size = 8; const colors = ['红', '蓝', '紫', '灰', '绿', '橙', '黄']; function init() { cells = Array.from({ length: size * size }, function () { return { color: Math.floor(Math.random() * 7), bomb: Math.random() < .08 ? 'color' : '' }; }); over = false; draw(); } function groupAt(start) { const color = cells[start].color, group = [], seen = new Set([start]), queue = [start]; while (queue.length) { const i = queue.shift(); if (cells[i].color !== color) continue; group.push(i); const x = i % size, y = Math.floor(i / size); [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (p) { const n = p[1] * size + p[0]; if (p[0] >= 0 && p[0] < size && p[1] >= 0 && p[1] < size && !seen.has(n) && cells[n]) { seen.add(n); queue.push(n); } }); } return group; } function draw() { const area = shell(host, title, button('重置', 'reset'), over ? '本局结束' : '原版 106 关 · 七色彩球、彩色炸弹和白色炸弹规则接入中'); area.innerHTML += '<div style="display:grid;grid-template-columns:repeat(8,34px);gap:3px;margin-top:10px">' + cells.map(function (c, i) { return '<button class="btn ghost" style="width:34px;height:34px;padding:0;background:' + ['#e85d75','#55a7e8','#a87ad9','#aeb7c2','#65c878','#f39b4a','#e4c44c'][c.color] + '" data-b="' + i + '">' + (c.bomb ? '炸' : colors[c.color]) + '</button>'; }).join('') + '</div>'; area.querySelector('[data-action="reset"]').onclick = init; area.querySelectorAll('[data-b]').forEach(function (b) { b.onclick = function () { if (over) return; const i = +b.dataset.b, c = cells[i], group = groupAt(i); if (c.color >= 5 && !cells.some(function (x) { return x && x.bomb === 'white'; })) return; if (c.bomb === 'color') cells.forEach(function (x) { if (x && x.color === c.color) x.remove = true; }); else if (c.bomb === 'white') cells.forEach(function (x, n) { if (x && Math.abs(n % size - i % size) <= 1 && Math.abs(Math.floor(n / size) - Math.floor(i / size)) <= 1) x.remove = true; }); else if (group.length >= 2) group.forEach(function (n) { cells[n].remove = true; }); else return; cells = cells.filter(function (x) { return !x.remove; }); if (!cells.length) over = true; draw(); }; }); } init(); session.cleanup.push(function () { host.innerHTML = ''; }); }
    function createSession(host, config, opts) {
        const session = opts && opts.session ? opts.session : { config: config, host: host, options: opts || {}, stopped: false };
        session.config = config;
        session.host = host;
        session.options = opts || {};
        session.stopped = false;
        session.cleanup = session.cleanup || [];
        session.stop = function () {
            if (this.stopped) return;
            this.stopped = true;
            this.cleanup.forEach(function (fn) { fn(); });
            this.cleanup = [];
            host.innerHTML = '';
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
            const config = typeof spec === 'string' ? (CONFIGS[spec] || SPECS.reduce(function (found, item) {
                return found || (item.id === spec ? copySpec(item, item.names[0]) : null);
            }, null)) : spec;
            if (!config) throw new Error('Unknown PK32 casual game');
            const session = { config: config, host: container, options: opts || {}, stopped: false };
            session.cleanup = [];
            session.stop = function () { if (session.stopped) return; session.stopped = true; session.cleanup.forEach(function (fn) { fn(); }); session.cleanup = []; container.innerHTML = ''; };
            return createSession(container, config, { session: session });
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
