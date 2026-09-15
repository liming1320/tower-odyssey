// PK32 原版迁移：益智、消除、迷宫与手工类玩法的独立适配层。
(function () {
    'use strict';
    window.PK32Puzzle = window.PK32Puzzle || {};

    var NAMES = [
        '同色方块', '五彩连珠', '七彩宝石', '宝石方块', '找不同', '找彩球', '变化彩球',
        '连结电线', '连结电线二', '扩展线路', '移彩球', '数独', '迷宫', '华容道', '推箱子变体',
        '接水管变体', '立体魔方', '七巧板', '汉诺塔', '十字绣', '拼图', '独粒钻石'
    ];
    var ALIASES = {
        '推箱子二': '推箱子变体', '推箱子三': '推箱子变体', '推箱子四': '推箱子变体',
        '接水管二': '接水管变体', '接水管三': '接水管变体', '五彩连珠二': '五彩连珠',
        '宝石方块二': '宝石方块', '七彩宝石二': '七彩宝石'
    };
    var SPECS = {};
    NAMES.forEach(function (name) { SPECS[name] = { name: name, status: 'rules-partial', levelPolicy: 'original-only', levelCount: null, source: 'pk32' }; });

    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function css() {
        if (document.getElementById('pk32-puzzle-style')) return;
        var s = document.createElement('style'); s.id = 'pk32-puzzle-style';
        s.textContent = '.pk32p{max-width:820px;margin:auto;padding:18px;color:#eaf1f8;background:#17212b;border-radius:8px;font-family:system-ui}.pk32p h2{margin:0 0 5px}.pk32p .meta,.pk32p .msg{color:#b8c7d6;margin:8px 0;min-height:24px}.pk32p .bar{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.pk32p button{border:1px solid #60758a;border-radius:4px;background:#263b4c;color:#fff;padding:7px 10px;cursor:pointer}.pk32p button:hover{background:#35566e}.pk32p .grid{display:grid;gap:4px;margin:12px 0}.pk32p .tile{width:42px;height:42px;padding:0;font-size:18px}.pk32p .board{display:grid;place-items:center;gap:3px;background:#0d151c;padding:12px;max-width:max-content}.pk32p input{box-sizing:border-box;background:#0d151c;color:#fff;border:1px solid #60758a;border-radius:3px;padding:7px;text-align:center}.pk32p .selected{outline:3px solid #f3c45b}.pk32p .filled{background:#d08d35}.pk32p .empty{background:#20313f}.pk32p .swatch{width:32px;height:32px;border:2px solid #60758a;border-radius:50%;padding:0}.pk32p .red{background:#e85b55}.pk32p .blue{background:#4e9de8}.pk32p .green{background:#60bd78}.pk32p .yellow{background:#e4c44e}.pk32p .purple{background:#ad78d3}.pk32p .native-board-wrap{max-width:100%;overflow:auto;background:#0d151c;padding:10px;border:1px solid #405466;border-radius:6px}.pk32p .native-grid{display:grid;grid-template-columns:repeat(7,clamp(34px,9vw,52px));gap:3px;width:max-content;margin:auto;padding:10px;background:#7b522e;border:6px solid #b98248;border-radius:5px}.pk32p .native-cell{position:relative;width:clamp(34px,9vw,52px);height:clamp(34px,9vw,52px);padding:0;border:0;border-radius:50%;background:#9a693c;box-shadow:inset 0 1px 2px #d39a5f,0 1px 1px #4a2e1b;cursor:pointer}.pk32p .native-cell[data-code="x"]{visibility:hidden;pointer-events:none}.pk32p .native-cell[data-code="0"]{background:#3d271b;box-shadow:inset 0 2px 4px #1b100a,0 1px 1px #c18a50}.pk32p .native-cell[data-code="1"]::after{content:"";position:absolute;inset:18%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe3a5 0,#d99a4c 22%,#9b5428 62%,#5a2d16 100%);box-shadow:0 1px 2px #3b1b0d}.pk32p .native-cell.native-selected{outline:3px solid #f3c45b;outline-offset:2px}.pk32p .native-cell.native-legal{box-shadow:0 0 0 3px #73c7a5,inset 0 2px 4px #1b100a}.pk32p .native-level{background:#0d151c;color:#fff;border:1px solid #60758a;border-radius:3px;padding:7px 9px;min-height:34px}';
        document.head.appendChild(s);
    }
    function btn(text, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = fn; return b; }
    function mount(container, name, body, reset) {
        css(); container.innerHTML = ''; var root = document.createElement('section'); root.className = 'pk32p';
        var h = document.createElement('h2'); h.textContent = 'PK32 · ' + name; root.appendChild(h);
        var meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = '原版流程模式 · 不使用统一 50 关系统'; root.appendChild(meta);
        var msg = document.createElement('div'); msg.className = 'msg'; root.appendChild(msg);
        var area = document.createElement('div'); root.appendChild(area); container.appendChild(root);
        function status(t) { msg.textContent = t || ''; }
        function redraw() { area.innerHTML = ''; body(area, status, reset, redraw); }
        reset(redraw, status); redraw();
        return { restart: function () { reset(redraw, status); redraw(); }, destroy: function () { container.innerHTML = ''; } };
    }
    function colorGame(area, status, reset, redraw, mode, gameState) {
        var size = mode === 'line' ? 7 : 8, colors = ['red', 'blue', 'green', 'yellow', 'purple'], board = [], selected = -1;
        gameState = gameState || {};
        if (!Array.isArray(gameState.board) || gameState.board.length !== size * size || gameState.mode !== mode) { board = Array.from({ length: size * size }, function () { return colors[Math.floor(Math.random() * colors.length)]; }); gameState.mode = mode; gameState.board = board; } else board = gameState.board;
        function groupAt(start, color) {
            var seen = {}, queue = [start], result = [];
            while (queue.length) {
                var current = queue.shift(); if (seen[current] || board[current] !== color) continue;
                seen[current] = true; result.push(current);
                var row = Math.floor(current / size), col = current % size;
                [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].forEach(function (p) { if (p[0] >= 0 && p[0] < size && p[1] >= 0 && p[1] < size) queue.push(p[0] * size + p[1]); });
            }
            return result;
        }
        area.appendChild(btn('重新开始', function () { gameState.board = null; gameState.mode = null; redraw(); }));
        var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(' + size + ',42px)';
        board.forEach(function (c, i) { var b = btn('', function () {
            if (mode === 'swap' && selected >= 0) { var distance = Math.abs(Math.floor(selected / size) - Math.floor(i / size)) + Math.abs((selected % size) - (i % size)); if (distance === 1) { var t = board[selected]; board[selected] = board[i]; board[i] = t; selected = -1; redraw(); } else { selected = i; redraw(); } return; }
            selected = i; b.classList.add('selected');
            if (mode !== 'line' && c) {
                var same = groupAt(i, c);
                if (same.length >= 3) { same.forEach(function (x) { board[x] = null; }); status(board.every(function (x) { return !x; }) ? '全部清除，完成本局' : '已消除一组同色方块'); redraw(); }
            }
        }); b.className = 'tile ' + (c || 'empty'); b.setAttribute('aria-label', c || '空位'); grid.appendChild(b); }); area.appendChild(grid); status('点击方块操作；移彩球先后点击两个位置');
    }
    function sudoku(area, status, reset, redraw) { var answer = [5,3,4,6,7,8,9,1,2,6,7,2,1,9,5,3,4,8,1,9,8,3,4,2,5,6,7,8,5,9,7,6,1,4,2,3,4,2,6,8,5,3,7,9,1,7,1,3,9,2,4,8,5,6,9,6,1,5,3,7,2,8,4,2,8,7,4,1,9,6,3,5,3,4,5,2,8,6,1,7,9,1,9,6,3,7,2,4,5,8]; var given = [0,1,4,5,6,8,9,11,13,15,17,19,22,24,26,27,30,31,33,35,37,40,42,44,45,48,50,52,54,56,57,60,62,64,66,68,70,72,73,75,77,79,80]; var values = answer.map(function (v, i) { return given.indexOf(i) >= 0 ? String(v) : ''; }); area.appendChild(btn('检查', function () { var ok = values.every(function (v, i) { return String(v) === String(answer[i]); }); status(ok ? '完成：当前数独填写正确' : '还有数字需要修正'); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(9,38px)'; answer.forEach(function (v, i) { var input = document.createElement('input'); input.maxLength = 1; input.value = values[i]; input.disabled = given.indexOf(i) >= 0; input.style.width = '38px'; input.style.height = '38px'; input.oninput = function () { values[i] = input.value.replace(/[^1-9]/g, ''); }; grid.appendChild(input); }); area.appendChild(grid); status('填写空格后点击检查'); }
    function maze(area, status, reset, redraw, state) {
        var n = 9, start = 10, goal = 70;
        var map = ['#########', '#       #', '### ### #', '#   #   #', '# # # # #', '# #   # #', '# ##### #', '#       #', '#########'];
        state = state || { pos: start, done: false };
        if (!Number.isInteger(state.pos) || state.pos < 0 || state.pos >= n * n || map[Math.floor(state.pos / n)][state.pos % n] === '#') state.pos = start;
        state.done = state.pos === goal;
        area.appendChild(btn('重新开始', function () { state.pos = start; state.done = false; redraw(); }));
        var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(9,34px)';
        for (var i = 0; i < n * n; i++) {
            var wall = map[Math.floor(i / n)][i % n] === '#';
            var b = btn(wall ? '' : (i === state.pos ? '●' : (i === goal ? '★' : '')), function () {});
            b.className = 'tile ' + (wall ? 'filled' : (i === state.pos ? 'blue' : 'empty'));
            b.disabled = wall || state.done;
            (function (x) { b.onclick = function () {
                if (state.done) return;
                var row = Math.floor(state.pos / n), col = state.pos % n, nextRow = Math.floor(x / n), nextCol = x % n;
                if (Math.abs(nextRow - row) + Math.abs(nextCol - col) !== 1 || map[nextRow][nextCol] === '#') return;
                state.pos = x; if (state.pos === goal) { state.done = true; status('迷宫完成'); } redraw();
            }; })(i);
            grid.appendChild(b);
        }
        area.appendChild(grid); status(state.done ? '迷宫完成' : '沿通道移动，抵达终点');
    }
    function slide(area, status, reset, redraw, state) {
        var solved = [1, 2, 3, 4, 5, 6, 7, 8, 0];
        var initial = [1, 2, 3, 4, 5, 6, 0, 7, 8];
        state = state || { cells: initial.slice(), done: false, moves: 0 };
        var valid = Array.isArray(state.cells) && state.cells.length === solved.length && state.cells.every(function (v) { return Number.isInteger(v) && v >= 0 && v < solved.length; }) && new Set(state.cells).size === solved.length;
        if (!valid) state.cells = initial.slice();
        state.done = state.done === true && state.cells.every(function (v, i) { return v === solved[i]; });
        state.moves = Number.isInteger(state.moves) && state.moves >= 0 ? state.moves : 0;
        area.appendChild(btn('重新开始', function () { state.cells = initial.slice(); state.done = false; state.moves = 0; redraw(); }));
        var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(3,54px)';
        state.cells.forEach(function (v, i) { var b = btn(v ? String(v) : '空', function () {
            if (state.done) return;
            var z = state.cells.indexOf(0), dx = Math.abs((i % 3) - (z % 3)), dy = Math.abs(Math.floor(i / 3) - Math.floor(z / 3));
            if (dx + dy !== 1) return;
            state.cells[z] = v; state.cells[i] = 0; state.moves++;
            if (state.cells.every(function (x, j) { return x === solved[j]; })) { state.done = true; status('拼图完成'); }
            redraw();
        }); b.className = 'tile ' + (v ? 'filled' : 'empty'); grid.appendChild(b); });
        area.appendChild(grid); status(state.done ? '拼图完成' : '点击空格相邻方块滑动，步数：' + state.moves);
    }
    function hanoi(area, status, reset, redraw, state) { var solved = [[3, 2, 1], [], []]; state = state || { pegs: solved.map(function (peg) { return peg.slice(); }), selected: null, done: false, moves: 0 }; var disks = []; (state.pegs || []).forEach(function (peg) { if (Array.isArray(peg)) disks = disks.concat(peg); }); var valid = Array.isArray(state.pegs) && state.pegs.length === 3 && state.pegs.every(function (peg) { return Array.isArray(peg) && peg.every(function (v) { return Number.isInteger(v) && v >= 1 && v <= 3; }); }) && disks.length === 3 && new Set(disks).size === 3; if (!valid) state.pegs = solved.map(function (peg) { return peg.slice(); }); state.selected = Number.isInteger(state.selected) && state.selected >= 0 && state.selected < 3 ? state.selected : null; state.done = state.done === true && state.pegs[2].join(',') === '3,2,1'; state.moves = Number.isInteger(state.moves) && state.moves >= 0 ? state.moves : 0; function draw() { area.innerHTML = ''; area.appendChild(btn('重新开始', function () { state.pegs = solved.map(function (peg) { return peg.slice(); }); state.selected = null; state.done = false; state.moves = 0; redraw(); })); state.pegs.forEach(function (peg, p) { var box = document.createElement('div'); box.style.display = 'inline-flex'; box.style.flexDirection = 'column-reverse'; box.style.verticalAlign = 'top'; box.style.width = '30%'; box.style.minHeight = '150px'; box.style.margin = '1%'; box.style.background = '#20313f'; box.style.alignItems = 'center'; box.onclick = function () { if (state.done) return; if (state.selected === null && peg.length) state.selected = p; else if (state.selected !== null && state.selected !== p && state.pegs[state.selected].length && (!peg.length || peg[peg.length - 1] > state.pegs[state.selected][state.pegs[state.selected].length - 1])) { peg.push(state.pegs[state.selected].pop()); state.selected = null; state.moves++; if (state.pegs[2].join(',') === '3,2,1') { state.done = true; status('汉诺塔完成'); } redraw(); } else state.selected = null; }; peg.forEach(function (v) { var d = document.createElement('div'); d.textContent = '■'.repeat(v + 1); d.style.color = ['#e85b55', '#e4c44e', '#60bd78'][v - 1]; box.appendChild(d); }); area.appendChild(box); }); status(state.done ? '汉诺塔完成' : (state.selected === null ? '点击柱子选择顶部圆盘，再点击目标柱' : '请选择目标柱')); } draw(); }
    function findDifferent(area, status, reset, redraw) { var cells = Array(25).fill(0); var target = 12; cells[target] = 1; area.appendChild(btn('重新开始', function () { target = Math.floor(Math.random() * 25); cells = Array(25).fill(0); cells[target] = 1; redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(5,42px)'; cells.forEach(function (v, i) { var b = btn('●', function () { if (i === target) status('找到了不同点，完成本局'); else status('不是不同点'); }); b.className = 'tile ' + (i === target ? 'blue' : 'green'); grid.appendChild(b); }); area.appendChild(grid); status('找出唯一不同的图案'); }
    function findBall(area, status, reset, redraw) { var target = 7; area.appendChild(btn('重新开始', function () { target = 1 + Math.floor(Math.random() * 15); redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(5,42px)'; for (var i = 1; i <= 15; i++) { var b = btn('●', function () { if (Number(this.dataset.value) === target) status('找到目标彩球'); else status('继续寻找'); }); b.dataset.value = i; b.className = 'tile ' + ['red','blue','green','yellow','purple'][i % 5]; grid.appendChild(b); } area.appendChild(grid); status('寻找目标彩球：' + target); }
    function tangram(area, status, reset, redraw) { var order = ['三角形', '正方形', '平行四边形', '小三角形', '大三角形']; var selected = []; var target = order.slice().sort(function () { return Math.random() - 0.5; }); area.appendChild(btn('重新开始', function () { selected = []; target = order.slice().sort(function () { return Math.random() - 0.5; }); redraw(); })); var prompt = document.createElement('div'); prompt.textContent = '按目标顺序选择：' + target.join('、'); area.appendChild(prompt); order.forEach(function (piece) { area.appendChild(btn(piece, function () { selected.push(piece); if (selected.length === target.length) status(selected.join('、') === target.join('、') ? '七巧板拼图完成' : '顺序不正确，请重新开始'); })); }); status('选择拼图部件完成目标'); }
    function embroidery(area, status, reset, redraw) { var size = 6, count = 0; area.appendChild(btn('重新开始', function () { redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(6,38px)'; for (var i = 0; i < size * size; i++) { var b = btn('·', function () { if (this.textContent === '·') { this.textContent = '×'; count++; status('已绣 ' + count + ' / ' + (size * size)); if (count === size * size) status('十字绣图案完成'); } }); b.className = 'tile empty'; grid.appendChild(b); } area.appendChild(grid); status('按图案格位完成十字绣'); }
    function sokoban(area, status, reset, redraw, state) {
        var map = ['#######', '#     #', '# .   #', '# $$  #', '#  @  #', '#  .  #', '#######'];
        if (!state || !Array.isArray(state.player) || state.player.length !== 2 || !Array.isArray(state.boxes) || state.boxes.length !== 2 || state.boxes.some(function (p) { return !Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isInteger(p[1]); })) state = { player: [3, 4], boxes: [[2, 3], [3, 3]], moves: 0 };
        state.moves = Number.isInteger(state.moves) && state.moves >= 0 ? state.moves : 0;
        var targets = [[2, 2], [3, 5]], dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        function at(list, x, y) { return list.some(function (p) { return p[0] === x && p[1] === y; }); }
        function draw() {
            area.innerHTML = ''; area.appendChild(btn('重新开始', function () { state.player = [3, 4]; state.boxes = [[2, 3], [3, 3]]; state.moves = 0; redraw(); }));
            var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(7,36px)';
            for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++) {
                var text = map[y][x] === '#' ? '墙' : at(state.boxes, x, y) ? (at(targets, x, y) ? '◎' : '□') : (state.player[0] === x && state.player[1] === y ? '●' : at(targets, x, y) ? '·' : '');
                var cell = btn(text, function () {}); cell.className = 'tile ' + (map[y][x] === '#' ? 'filled' : 'empty'); grid.appendChild(cell);
            }
            area.appendChild(grid); area.appendChild(document.createTextNode('移动次数：' + state.moves));
            [['上', 0, -1], ['下', 0, 1], ['左', -1, 0], ['右', 1, 0]].forEach(function (d) { area.appendChild(btn(d[0], function () { move(d[1], d[2]); })); });
            status(state.boxes.every(function (p) { return at(targets, p[0], p[1]); }) ? '推箱子完成' : '把所有箱子推到目标点');
        }
        function move(dx, dy) {
            var nx = state.player[0] + dx, ny = state.player[1] + dy;
            if (!map[ny] || map[ny][nx] === '#') return;
            var box = state.boxes.findIndex(function (p) { return p[0] === nx && p[1] === ny; });
            if (box >= 0) { var bx = nx + dx, by = ny + dy; if (!map[by] || map[by][bx] === '#' || at(state.boxes, bx, by)) return; state.boxes[box] = [bx, by]; }
            state.player = [nx, ny]; state.moves++; redraw();
        }
        draw();
    }
    function lineGame(area, status, reset, redraw, state) {
        var size = 9, colors = ['red', 'blue', 'green', 'yellow', 'purple'], dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        state = state || {};
        if (!Array.isArray(state.board) || state.board.length !== size * size) {
            state.board = Array(size * size).fill(null);
            [4, 13, 22, 58, 67].forEach(function (index, i) { state.board[index] = colors[i % colors.length]; });
            state.selected = -1; state.done = false; state.moves = 0;
        }
        state.selected = Number.isInteger(state.selected) ? state.selected : -1;
        state.moves = Number.isInteger(state.moves) && state.moves >= 0 ? state.moves : 0;
        function index(row, col) { return row < 0 || row >= size || col < 0 || col >= size ? -1 : row * size + col; }
        function hasPath(from, to) {
            if (from === to || state.board[to]) return false;
            var queue = [from], seen = {}; seen[from] = true;
            while (queue.length) {
                var current = queue.shift(), row = Math.floor(current / size), col = current % size;
                if (current === to) return true;
                [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].forEach(function (point) {
                    var next = index(point[0], point[1]);
                    if (next >= 0 && !seen[next] && (!state.board[next] || next === to)) { seen[next] = true; queue.push(next); }
                });
            }
            return false;
        }
        function lineFrom(start, dr, dc, color) {
            var result = [start], row = Math.floor(start / size) + dr, col = start % size + dc, next;
            while ((next = index(row, col)) >= 0 && state.board[next] === color) { result.push(next); row += dr; col += dc; }
            row = Math.floor(start / size) - dr; col = start % size - dc;
            while ((next = index(row, col)) >= 0 && state.board[next] === color) { result.push(next); row -= dr; col -= dc; }
            return result;
        }
        function clearLines(indexMoved) {
            var color = state.board[indexMoved], cleared = {};
            if (!color) return 0;
            dirs.forEach(function (direction) {
                var line = lineFrom(indexMoved, direction[0], direction[1], color);
                if (line.length >= 5) line.forEach(function (indexInLine) { cleared[indexInLine] = true; });
            });
            Object.keys(cleared).forEach(function (key) { state.board[Number(key)] = null; });
            return Object.keys(cleared).length;
        }
        function addBalls(count) {
            var empty = state.board.map(function (value, indexInBoard) { return value ? -1 : indexInBoard; }).filter(function (value) { return value >= 0; });
            for (var i = empty.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), swap = empty[i]; empty[i] = empty[j]; empty[j] = swap; }
            var added = Math.min(count, empty.length);
            for (var k = 0; k < added; k++) state.board[empty[k]] = colors[Math.floor(Math.random() * colors.length)];
            return added;
        }
        function choose(indexClicked) {
            if (state.done) return;
            if (state.selected < 0) { if (state.board[indexClicked]) { state.selected = indexClicked; redraw(); } return; }
            if (indexClicked === state.selected) { state.selected = -1; redraw(); return; }
            if (state.board[indexClicked]) { state.selected = indexClicked; redraw(); return; }
            if (!hasPath(state.selected, indexClicked)) { status('彩球不能穿过其他彩球'); return; }
            var color = state.board[state.selected]; state.board[state.selected] = null; state.board[indexClicked] = color; state.selected = -1; state.moves++;
            var cleared = clearLines(indexClicked);
            if (cleared) status('消除 ' + cleared + ' 个彩球');
            else status('没有连成五个，增加 ' + addBalls(3) + ' 个彩球');
            state.done = state.board.every(function (value) { return value !== null; });
            redraw();
        }
        area.appendChild(btn('重新开始', function () { state.board = null; state.selected = -1; state.done = false; state.moves = 0; redraw(); }));
        var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(9,34px)';
        state.board.forEach(function (color, indexInBoard) {
            var cell = btn(color ? '' : '·', function () { choose(indexInBoard); });
            cell.className = 'tile ' + (color || 'empty') + (state.selected === indexInBoard ? ' selected' : ''); cell.setAttribute('aria-label', color ? '彩球' : '空位'); grid.appendChild(cell);
        });
        area.appendChild(grid); status(state.done ? '棋盘已填满，本局结束' : '选择彩球，再选择可到达的空位；横竖斜连续五个或以上消除');
    }
    function nativePeg(area, status, reset, redraw, state) {
        state = state || {};
        if (!state.payloads) {
            area.textContent = '正在读取原生棋盘数据';
            if (!state.loading) {
                state.loading = true;
                fetch('/data/pk32-peg-native-boards.json').then(function (response) { return response.json(); }).then(function (data) {
                    state.payloads = (data.levels || []).filter(function (row) { return typeof row.cells === 'string' && /^[x01]{49}$/.test(row.cells); }).map(function (row) { return { name: row.name, caseRva: row.caseRva, value: row.cells }; });
                    state.center = Number.isInteger(data.center) ? data.center : 24;
                    state.level = 0;
                    state.board = null;
                    state.loading = false;
                    redraw();
                }).catch(function () { state.loading = false; status('原生棋盘数据读取失败'); });
            }
            return;
        }
        var payload = state.payloads[state.level] || state.payloads[0];
        if (!payload) { status('没有找到原生棋盘数据'); return; }
        if (!Array.isArray(state.board) || state.board.length !== 49) state.board = payload.value.split('');
        var selected = Number.isInteger(state.selected) ? state.selected : -1;
        state.ended = state.ended === true;
        state.chainActive = state.chainActive === true;
        function occupied(index) { return state.board[index] === '1'; }
        function cell(row, col) { return row < 0 || row >= 7 || col < 0 || col >= 7 ? -1 : row * 7 + col; }
        function hasLegalMove() {
            var directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (var index = 0; index < state.board.length; index++) {
                if (!occupied(index)) continue;
                var row = Math.floor(index / 7), col = index % 7;
                for (var d = 0; d < directions.length; d++) {
                    var middle = cell(row + directions[d][0], col + directions[d][1]);
                    var target = cell(row + directions[d][0] * 2, col + directions[d][1] * 2);
                    if (middle >= 0 && target >= 0 && occupied(middle) && state.board[target] === '0') return true;
                }
            }
            return false;
        }
        function legalTargets(from) {
            var result = [];
            if (from < 0 || !occupied(from)) return result;
            var row = Math.floor(from / 7), col = from % 7;
            [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (direction) {
                var middle = cell(row + direction[0], col + direction[1]);
                var target = cell(row + direction[0] * 2, col + direction[1] * 2);
                if (middle >= 0 && target >= 0 && occupied(middle) && state.board[target] === '0') result.push(target);
            });
            return result;
        }
        function select(index) {
            if (state.ended || state.board[index] === 'x') return;
            if (selected < 0) { if (occupied(index)) { selected = index; state.selected = index; state.chainActive = false; redraw(); } return; }
            if (state.chainActive && index === selected) { selected = -1; state.selected = -1; state.chainActive = false; redraw(); return; }
            var sr = Math.floor(selected / 7), sc = selected % 7, tr = Math.floor(index / 7), tc = index % 7;
            var dr = tr - sr, dc = tc - sc;
            var middle = cell(sr + dr / 2, sc + dc / 2), distance = Math.abs(dr) + Math.abs(dc);
            if (distance === 2 && (dr === 0 || dc === 0) && occupied(selected) && middle >= 0 && occupied(middle) && state.board[index] === '0') {
                if (!state.chainActive) {
                    state.history = Array.isArray(state.history) ? state.history : [];
                    state.history.push({ board: state.board.slice(), moves: state.moves || 0, ended: state.ended });
                    state.moves = (state.moves || 0) + 1;
                }
                var sourceCode = state.board[selected];
                state.board[selected] = '0'; state.board[middle] = '0'; state.board[index] = sourceCode;
                state.ended = !hasLegalMove(); state.chainActive = !state.ended && legalTargets(index).length > 0;
                selected = state.chainActive ? index : -1; state.selected = selected; redraw(); return;
            }
            state.chainActive = false; selected = occupied(index) ? index : -1; state.selected = selected; redraw();
        }
        function changeLevel(level) { state.level = Math.max(0, Math.min(state.payloads.length - 1, level)); state.board = null; state.history = []; state.selected = -1; state.ended = false; state.chainActive = false; state.moves = 0; redraw(); }
        area.appendChild(btn('上一个预设', function () { changeLevel(state.level - 1); }));
        area.appendChild(btn('下一个预设', function () { changeLevel(state.level + 1); }));
        area.appendChild(btn('重置预设', function () { state.board = payload.value.split(''); state.history = []; state.selected = -1; state.ended = false; state.chainActive = false; state.moves = 0; redraw(); }));
        var undo = btn('撤销一步', function () {
            var previous = Array.isArray(state.history) && state.history.pop();
            if (!previous) return;
            state.board = previous.board; state.moves = previous.moves; state.ended = previous.ended === true; state.selected = -1; state.chainActive = false; redraw();
        });
        undo.disabled = !Array.isArray(state.history) || state.history.length === 0;
        area.appendChild(undo);
        var picker = document.createElement('select'); picker.className = 'native-level'; picker.setAttribute('aria-label', '独粒钻石原生棋盘预设'); for (var levelIndex = 0; levelIndex < state.payloads.length; levelIndex++) { var option = document.createElement('option'); option.value = String(levelIndex); option.textContent = (levelIndex + 1) + '．' + state.payloads[levelIndex].name; picker.appendChild(option); } picker.value = String(state.level); picker.onchange = function () { changeLevel(Number(picker.value) || 0); }; area.appendChild(picker);
        var label = document.createElement('span'); label.textContent = payload.name + '（' + (state.level + 1) + ' / ' + state.payloads.length + '）'; label.style.marginLeft = '8px'; area.appendChild(label);
        var wrap = document.createElement('div'); wrap.className = 'native-board-wrap'; var grid = document.createElement('div'); grid.className = 'native-grid';
        var legal = legalTargets(selected); state.board.forEach(function (code, index) { var b = btn('', function () { select(index); }); b.className = 'native-cell' + (selected === index ? ' native-selected' : '') + (legal.indexOf(index) >= 0 ? ' native-legal' : ''); b.dataset.code = code; b.setAttribute('aria-label', code === 'x' ? '棋盘外' : code === '0' ? '空位' : '棋子'); b.disabled = code === 'x'; grid.appendChild(b); }); wrap.appendChild(grid); area.appendChild(wrap);
        var pieces = state.board.filter(function (value) { return value === '1'; }).length; var rating = pieces > 5 ? '不及格' : pieces === 5 ? '及格' : pieces === 4 ? '良好' : pieces === 3 ? '优秀' : pieces === 2 ? '高手' : pieces === 1 && state.board[state.center] === '1' ? '超级大师' : pieces === 1 ? '大师' : '修改高手'; var initialNoMove = (!state.history || state.history.length === 0) && !hasLegalMove(); status(initialNoMove ? '当前原生预设没有横纵合法跳步，其在原版中的用途仍待确认。' : state.ended ? '本局结束；剩余棋子：' + pieces + '；评分：' + rating : (state.chainActive ? '可继续跳，或点击当前棋子结束本步；剩余棋子：' : selected >= 0 ? '请选择发光空位完成跳吃；剩余棋子：' : '选择棋子，再选择发光空位；剩余棋子：') + pieces + '，移动：' + (state.moves || 0));
        if (window.__MG_TEST) window.__pk32PegDebug = { getState: function () { return { board: state.board.slice(), selected: state.selected, chainActive: state.chainActive, moves: state.moves || 0, ended: state.ended }; }, setBoard: function (board) { state.board = board.slice(); state.history = []; state.selected = -1; state.ended = false; state.chainActive = false; state.moves = 0; redraw(); } };
        var gameRoot = area.closest('.pk32p'); if (gameRoot) { if (gameRoot.__pk32PegKeyHandler) gameRoot.removeEventListener('keydown', gameRoot.__pk32PegKeyHandler); gameRoot.tabIndex = 0; gameRoot.__pk32PegKeyHandler = function (event) { if (event.key === ' ') { event.preventDefault(); var previous = Array.isArray(state.history) && state.history.pop(); if (previous) { state.board = previous.board; state.moves = previous.moves; state.ended = previous.ended === true; state.selected = -1; state.chainActive = false; redraw(); } } }; gameRoot.addEventListener('keydown', gameRoot.__pk32PegKeyHandler); }
    }
    function cube(area, status, reset, redraw, state) {
        if (!state || !state.cells) state = { cells: Array(9).fill(false), moves: 0 };
        function draw() { area.innerHTML = ''; area.appendChild(btn('重新开始', function () { state.cells = Array(9).fill(false); state.moves = 0; redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(3,48px)'; state.cells.forEach(function (on, i) { var b = btn(on ? '■' : '□', function () { [i, i - 1, i + 1, i - 3, i + 3].forEach(function (x) { if (x >= 0 && x < 9 && (x === i || Math.floor(x / 3) === Math.floor(i / 3) || x === i - 3 || x === i + 3)) state.cells[x] = !state.cells[x]; }); state.moves++; redraw(); }); b.className = 'tile ' + (on ? 'filled' : 'empty'); grid.appendChild(b); }); area.appendChild(grid); status(state.cells.every(Boolean) ? '立体魔方完成' : '点击方块和相邻面，使九面全部点亮'); }
        draw();
    }
    function moveBalls(area, status, reset, redraw, state) { var size = 5; state = state || { board: Array(25).fill(0), selected: -1, moves: 0, limit: 20 }; if (!state.board.some(Boolean)) { state.board[0] = 1; state.board[24] = 2; } function draw() { area.innerHTML = ''; area.appendChild(btn('重新开始', function () { state.board = Array(25).fill(0); state.board[0] = 1; state.board[24] = 2; state.selected = -1; state.moves = 0; redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(5,42px)'; state.board.forEach(function (v, i) { var b = btn(v ? (v === 1 ? '●' : '○') : '', function () { if (state.selected < 0 && v) { state.selected = i; redraw(); return; } if (state.selected >= 0 && !v) { var sr = Math.floor(state.selected / size), sc = state.selected % size, tr = Math.floor(i / size), tc = i % size; if (Math.abs(sr - tr) + Math.abs(sc - tc) === 1) { state.board[i] = state.board[state.selected]; state.board[state.selected] = 0; state.moves++; state.selected = -1; redraw(); } } }); b.className = 'tile ' + (v ? (v === 1 ? 'red' : 'blue') : 'empty') + (state.selected === i ? ' selected' : ''); grid.appendChild(b); }); area.appendChild(grid); status(state.board[24] && state.board[0] === 0 ? '已连接最左与最右电线；移动：' + state.moves : '原版规则：在限定移动次数内连接最左和最右电线；移动：' + state.moves + ' / ' + state.limit); } draw(); }
    function simple(area, status, reset, redraw, title) { var count = 0; var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(5,44px)'; for (var i = 0; i < 25; i++) { var b = btn('', function () { this.classList.toggle('filled'); count += this.classList.contains('filled') ? 1 : -1; status('已完成 ' + count + ' 个格位'); }); b.className = 'tile empty'; grid.appendChild(b); } area.appendChild(btn('重新开始', function () { redraw(); })); area.appendChild(grid); status(title || '点击格位进行操作'); }
    function dispatch(container, name, opts) { var canonical = ALIASES[name] || name; if (!SPECS[canonical]) throw new Error('未建立 PK32 益智玩法：' + name); var state = null; var factory; if (canonical === '数独') factory = sudoku; else if (canonical === '迷宫') factory = function (a, s, r, d) { state = state || { pos: 10, done: false }; maze(a, s, r, d, state); }; else if (canonical === '华容道' || canonical === '拼图') factory = function (a, s, r, d) { state = state || { cells: [1, 2, 3, 4, 5, 6, 0, 7, 8], done: false, moves: 0 }; slide(a, s, r, d, state); }; else if (canonical === '汉诺塔') factory = function (a, s, r, d) { state = state || { pegs: [[3, 2, 1], [], []], selected: null, done: false, moves: 0 }; hanoi(a, s, r, d, state); }; else if (canonical === '找不同') factory = findDifferent; else if (canonical === '找彩球') factory = findBall; else if (canonical === '七巧板') factory = tangram; else if (canonical === '十字绣') factory = embroidery; else if (canonical === '推箱子变体') factory = function (a, s, r, d) { state = state || {}; sokoban(a, s, r, d, state); }; else if (canonical === '独粒钻石') factory = function (a, s, r, d) { state = state || {}; nativePeg(a, s, r, d, state); }; else if (canonical === '立体魔方') factory = function (a, s, r, d) { state = state || {}; cube(a, s, r, d, state); }; else if (canonical === '五彩连珠') factory = function (a, s, r, d) { state = state || {}; lineGame(a, s, r, d, state); }; else if (canonical === '同色方块' || canonical === '七彩宝石' || canonical === '宝石方块') factory = function (a, s, r, d) { state = state || {}; colorGame(a, s, r, d, 'match', state); }; else if (canonical === '移彩球' || canonical === '变化彩球') factory = function (a, s, r, d) { state = state || {}; colorGame(a, s, r, d, 'swap', state); }; else if (canonical.indexOf('连结电线') === 0 || canonical === '扩展线路' || canonical === '接水管变体') factory = function (a, s, r, d) { state = state || {}; colorGame(a, s, r, d, 'line', state); }; else factory = function (a, s, r, d) { simple(a, s, r, d, canonical + '独立玩法'); }; return mount(container, canonical, factory, function (redraw) { state = null; redraw(); }); }
    function connectWires2(container) {
        var payloads = ['33033035404550550252', '003200000300503004100100331000001000', '000000300404050000010000033100000000'];
        var state = { level: 0, pieces: [], moves: 0 };
        function resetLevel() { var seed = payloads[state.level], count = Math.max(3, Math.min(6, Math.floor(seed.length / 7))); state.pieces = []; for (var i = 0; i < count; i++) state.pieces.push({ kind: i % 2 ? 'V' : 'H', pos: i, lane: i % 2 }); state.pieces.push({ kind: 'W', pos: count + 1, lane: 0 }); state.moves = 0; }
        function move(piece, delta) { var target = piece.pos + delta; if (target < 0 || target > 7 || state.pieces.some(function (other) { return other !== piece && other.lane === piece.lane && other.pos === target; })) return; piece.pos = target; state.moves++; render(); }
        function render() { var root = container.querySelector('.pk32p'), area = root.querySelector('[data-connect-area]'), msg = root.querySelector('.msg'); area.innerHTML = ''; var bar = document.createElement('div'); bar.className = 'bar'; bar.appendChild(btn('上一关', function () { state.level = Math.max(0, state.level - 1); resetLevel(); render(); })); bar.appendChild(btn('下一关', function () { state.level = Math.min(2, state.level + 1); resetLevel(); render(); })); bar.appendChild(btn('重置', function () { resetLevel(); render(); })); area.appendChild(bar); var info = document.createElement('div'); info.textContent = '已定位原生关卡：' + (state.level + 1) + ' / 3（原版声明 60 关）'; area.appendChild(info); state.pieces.forEach(function (piece, index) { var row = document.createElement('div'); row.className = 'bar'; var label = document.createElement('span'); label.textContent = piece.kind === 'W' ? '白箱' : piece.kind === 'H' ? '横箱' : '竖箱'; row.appendChild(label); if (piece.kind !== 'W') { row.appendChild(btn(piece.kind === 'H' ? '左' : '上', function () { move(piece, -1); })); row.appendChild(btn(piece.kind === 'H' ? '右' : '下', function () { move(piece, 1); })); } var pos = document.createElement('span'); pos.textContent = ' 轨道 ' + (piece.lane + 1) + ' · 格 ' + (piece.pos + 1); row.appendChild(pos); area.appendChild(row); }); msg.textContent = state.pieces.some(function (piece) { return piece.kind === 'W' && piece.pos === 7; }) ? '完成：白箱已到最右' : '横箱只能左右移动，竖箱只能上下移动；步数：' + state.moves; }
        resetLevel(); var result = mount(container, '连结电线二', function (area) { area.setAttribute('data-connect-area', ''); }, function () {}); render(); return result;
    }
    window.PK32Puzzle.startGame = function (container, name, opts) { if (String(name || '') === '连结电线二') return connectWires2(container); if (String(name || '') === '移彩球') return mount(container, '移彩球', function (area, status) { moveBalls(area, status, function () {}, function () {}, { board: Array(25).fill(0), selected: -1, moves: 0, limit: 20 }); }, function () {}); return dispatch(container, String(name || NAMES[0]), opts || {}); };
    window.PK32Puzzle.getConfig = function (name) { return SPECS[ALIASES[name] || name] || null; };
    window.PK32Puzzle.names = NAMES.slice();
}());
