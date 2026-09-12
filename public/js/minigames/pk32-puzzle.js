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
        s.textContent = '.pk32p{max-width:820px;margin:auto;padding:18px;color:#eaf1f8;background:#17212b;border-radius:8px;font-family:system-ui}.pk32p h2{margin:0 0 5px}.pk32p .meta,.pk32p .msg{color:#b8c7d6;margin:8px 0;min-height:24px}.pk32p .bar{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.pk32p button{border:1px solid #60758a;border-radius:4px;background:#263b4c;color:#fff;padding:7px 10px;cursor:pointer}.pk32p button:hover{background:#35566e}.pk32p .grid{display:grid;gap:4px;margin:12px 0}.pk32p .tile{width:42px;height:42px;padding:0;font-size:18px}.pk32p .board{display:grid;place-items:center;gap:3px;background:#0d151c;padding:12px;max-width:max-content}.pk32p input{box-sizing:border-box;background:#0d151c;color:#fff;border:1px solid #60758a;border-radius:3px;padding:7px;text-align:center}.pk32p .selected{outline:3px solid #f3c45b}.pk32p .filled{background:#d08d35}.pk32p .empty{background:#20313f}.pk32p .swatch{width:32px;height:32px;border:2px solid #60758a;border-radius:50%;padding:0}.pk32p .red{background:#e85b55}.pk32p .blue{background:#4e9de8}.pk32p .green{background:#60bd78}.pk32p .yellow{background:#e4c44e}.pk32p .purple{background:#ad78d3}';
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
        if (!gameState.board || gameState.mode !== mode) { board = Array.from({ length: size * size }, function () { return colors[Math.floor(Math.random() * colors.length)]; }); gameState.mode = mode; gameState.board = board; } else board = gameState.board;
        area.appendChild(btn('重新开始', function () { gameState.board = null; gameState.mode = null; redraw(); }));
        var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(' + size + ',42px)';
        board.forEach(function (c, i) { var b = btn('', function () {
            if (mode === 'swap' && selected >= 0) { var t = board[selected]; board[selected] = board[i]; board[i] = t; selected = -1; redraw(); return; }
            selected = i; b.classList.add('selected');
            if (mode !== 'line' && c) {
                var row = Math.floor(i / size), col = i % size;
                var same = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(function (d) { return [row + d[0], col + d[1]]; }).filter(function (p) { return p[0] >= 0 && p[0] < size && p[1] >= 0 && p[1] < size; }).map(function (p) { return p[0] * size + p[1]; }).filter(function (x) { return board[x] === c; });
                if (same.length >= 2) { same.concat(i).forEach(function (x) { board[x] = null; }); status(board.every(function (x) { return !x; }) ? '全部清除，完成本局' : '已消除一组同色方块'); redraw(); }
            }
        }); b.className = 'tile ' + (c || 'empty'); b.setAttribute('aria-label', c || '空位'); grid.appendChild(b); }); area.appendChild(grid); status('点击方块操作；移彩球先后点击两个位置');
    }
    function sudoku(area, status, reset, redraw) { var answer = [5,3,4,6,7,8,9,1,2,6,7,2,1,9,5,3,4,8,1,9,8,3,4,2,5,6,7,8,5,9,7,6,1,4,2,3,4,2,6,8,5,3,7,9,1,7,1,3,9,2,4,8,5,6,9,6,1,5,3,7,2,8,4,2,8,7,4,1,9,6,3,5,3,4,5,2,8,6,1,7,9,1,9,6,3,7,2,4,5,8]; var given = [0,1,4,5,6,8,9,11,13,15,17,19,22,24,26,27,30,31,33,35,37,40,42,44,45,48,50,52,54,56,57,60,62,64,66,68,70,72,73,75,77,79,80]; var values = answer.map(function (v, i) { return given.indexOf(i) >= 0 ? String(v) : ''; }); area.appendChild(btn('检查', function () { var ok = values.every(function (v, i) { return String(v) === String(answer[i]); }); status(ok ? '完成：当前数独填写正确' : '还有数字需要修正'); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(9,38px)'; answer.forEach(function (v, i) { var input = document.createElement('input'); input.maxLength = 1; input.value = values[i]; input.disabled = given.indexOf(i) >= 0; input.style.width = '38px'; input.style.height = '38px'; input.oninput = function () { values[i] = input.value.replace(/[^1-9]/g, ''); }; grid.appendChild(input); }); area.appendChild(grid); status('填写空格后点击检查'); }
    function maze(area, status, reset, redraw, state) { var n = 9, goal = 80; state = state || { pos: 0 }; area.appendChild(btn('重新开始', function () { state.pos = 0; redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(9,34px)'; for (var i = 0; i < 81; i++) { var b = btn(i === state.pos ? '●' : (i === goal ? '★' : ''), function () {}); b.className = 'tile ' + (i === state.pos ? 'filled' : 'empty'); (function (x) { b.onclick = function () { var dx = Math.abs((x % n) - (state.pos % n)), dy = Math.abs(Math.floor(x / n) - Math.floor(state.pos / n)); if (dx + dy === 1) { state.pos = x; if (state.pos === goal) status('迷宫完成'); redraw(); } }; })(i); grid.appendChild(b); } area.appendChild(grid); status('点击相邻格移动，抵达终点'); }
    function slide(area, status, reset, redraw, state) { state = state || { cells: [1, 2, 3, 4, 5, 6, 7, 8, 0] }; area.appendChild(btn('重新开始', function () { state.cells = [1, 2, 3, 4, 5, 6, 7, 8, 0]; redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(3,54px)'; state.cells.forEach(function (v, i) { var b = btn(v ? String(v) : '空', function () { var z = state.cells.indexOf(0), dx = Math.abs((i % 3) - (z % 3)), dy = Math.abs(Math.floor(i / 3) - Math.floor(z / 3)); if (dx + dy === 1) { state.cells[z] = v; state.cells[i] = 0; if (state.cells.slice(0, 8).every(function (x, j) { return x === j + 1; })) status('华容道完成'); redraw(); } }); b.className = 'tile ' + (v ? 'filled' : 'empty'); grid.appendChild(b); }); area.appendChild(grid); status('点击空格相邻方块滑动'); }
    function hanoi(area, status, reset, redraw, state) { state = state || { pegs: [[3,2,1], [], []], selected: null }; function draw() { area.innerHTML = ''; area.appendChild(btn('重新开始', function () { state.pegs = [[3,2,1], [], []]; state.selected = null; redraw(); })); state.pegs.forEach(function (peg, p) { var box = document.createElement('div'); box.style.display = 'inline-flex'; box.style.flexDirection = 'column-reverse'; box.style.verticalAlign = 'top'; box.style.width = '30%'; box.style.minHeight = '150px'; box.style.margin = '1%'; box.style.background = '#20313f'; box.style.alignItems = 'center'; box.onclick = function () { if (state.selected === null && peg.length) state.selected = p; else if (state.selected !== null && state.selected !== p && (!peg.length || peg[peg.length - 1] > state.pegs[state.selected][state.pegs[state.selected].length - 1])) { peg.push(state.pegs[state.selected].pop()); state.selected = null; if (state.pegs[2].length === 3) status('汉诺塔完成'); redraw(); } else state.selected = null; }; peg.forEach(function (v) { var d = document.createElement('div'); d.textContent = '■'.repeat(v + 1); d.style.color = ['#e85b55','#e4c44e','#60bd78'][v - 1]; box.appendChild(d); }); area.appendChild(box); }); status(state.selected === null ? '点击柱子选择顶部圆盘，再点击目标柱' : '请选择目标柱'); } draw(); }
    function findDifferent(area, status, reset, redraw) { var cells = Array(25).fill(0); var target = 12; cells[target] = 1; area.appendChild(btn('重新开始', function () { target = Math.floor(Math.random() * 25); cells = Array(25).fill(0); cells[target] = 1; redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(5,42px)'; cells.forEach(function (v, i) { var b = btn('●', function () { if (i === target) status('找到了不同点，完成本局'); else status('不是不同点'); }); b.className = 'tile ' + (i === target ? 'blue' : 'green'); grid.appendChild(b); }); area.appendChild(grid); status('找出唯一不同的图案'); }
    function findBall(area, status, reset, redraw) { var target = 7; area.appendChild(btn('重新开始', function () { target = 1 + Math.floor(Math.random() * 15); redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(5,42px)'; for (var i = 1; i <= 15; i++) { var b = btn('●', function () { if (Number(this.dataset.value) === target) status('找到目标彩球'); else status('继续寻找'); }); b.dataset.value = i; b.className = 'tile ' + ['red','blue','green','yellow','purple'][i % 5]; grid.appendChild(b); } area.appendChild(grid); status('寻找目标彩球：' + target); }
    function tangram(area, status, reset, redraw) { var order = ['三角形', '正方形', '平行四边形', '小三角形', '大三角形']; var selected = []; var target = order.slice().sort(function () { return Math.random() - 0.5; }); area.appendChild(btn('重新开始', function () { selected = []; target = order.slice().sort(function () { return Math.random() - 0.5; }); redraw(); })); var prompt = document.createElement('div'); prompt.textContent = '按目标顺序选择：' + target.join('、'); area.appendChild(prompt); order.forEach(function (piece) { area.appendChild(btn(piece, function () { selected.push(piece); if (selected.length === target.length) status(selected.join('、') === target.join('、') ? '七巧板拼图完成' : '顺序不正确，请重新开始'); })); }); status('选择拼图部件完成目标'); }
    function embroidery(area, status, reset, redraw) { var size = 6, count = 0; area.appendChild(btn('重新开始', function () { redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(6,38px)'; for (var i = 0; i < size * size; i++) { var b = btn('·', function () { if (this.textContent === '·') { this.textContent = '×'; count++; status('已绣 ' + count + ' / ' + (size * size)); if (count === size * size) status('十字绣图案完成'); } }); b.className = 'tile empty'; grid.appendChild(b); } area.appendChild(grid); status('按图案格位完成十字绣'); }
    function sokoban(area, status, reset, redraw, state) {
        var map = ['#######', '#     #', '# .   #', '# $$  #', '#  @  #', '#  .  #', '#######'];
        if (!state || !state.player || !state.boxes) state = { player: [3, 4], boxes: [[2, 3], [3, 3]], moves: 0 };
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
            if (map[ny][nx] === '#') return;
            var box = state.boxes.findIndex(function (p) { return p[0] === nx && p[1] === ny; });
            if (box >= 0) { var bx = nx + dx, by = ny + dy; if (map[by][bx] === '#' || at(state.boxes, bx, by)) return; state.boxes[box] = [bx, by]; }
            state.player = [nx, ny]; state.moves++; redraw();
        }
        draw();
    }
    function cube(area, status, reset, redraw, state) {
        if (!state || !state.cells) state = { cells: Array(9).fill(false), moves: 0 };
        function draw() { area.innerHTML = ''; area.appendChild(btn('重新开始', function () { state.cells = Array(9).fill(false); state.moves = 0; redraw(); })); var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(3,48px)'; state.cells.forEach(function (on, i) { var b = btn(on ? '■' : '□', function () { [i, i - 1, i + 1, i - 3, i + 3].forEach(function (x) { if (x >= 0 && x < 9 && (x === i || Math.floor(x / 3) === Math.floor(i / 3) || x === i - 3 || x === i + 3)) state.cells[x] = !state.cells[x]; }); state.moves++; redraw(); }); b.className = 'tile ' + (on ? 'filled' : 'empty'); grid.appendChild(b); }); area.appendChild(grid); status(state.cells.every(Boolean) ? '立体魔方完成' : '点击方块和相邻面，使九面全部点亮'); }
        draw();
    }
    function simple(area, status, reset, redraw, title) { var count = 0; var grid = document.createElement('div'); grid.className = 'grid'; grid.style.gridTemplateColumns = 'repeat(5,44px)'; for (var i = 0; i < 25; i++) { var b = btn('', function () { this.classList.toggle('filled'); count += this.classList.contains('filled') ? 1 : -1; status('已完成 ' + count + ' 个格位'); }); b.className = 'tile empty'; grid.appendChild(b); } area.appendChild(btn('重新开始', function () { redraw(); })); area.appendChild(grid); status(title || '点击格位进行操作'); }
    function dispatch(container, name, opts) { var canonical = ALIASES[name] || name; if (!SPECS[canonical]) throw new Error('未建立 PK32 益智玩法：' + name); var state = null; var factory; if (canonical === '数独') factory = sudoku; else if (canonical === '迷宫') factory = function (a, s, r, d) { state = state || { pos: 0 }; maze(a, s, r, d, state); }; else if (canonical === '华容道' || canonical === '拼图') factory = function (a, s, r, d) { state = state || { cells: [1, 2, 3, 4, 5, 6, 7, 8, 0] }; slide(a, s, r, d, state); }; else if (canonical === '汉诺塔') factory = function (a, s, r, d) { state = state || { pegs: [[3, 2, 1], [], []], selected: null }; hanoi(a, s, r, d, state); }; else if (canonical === '找不同') factory = findDifferent; else if (canonical === '找彩球') factory = findBall; else if (canonical === '七巧板') factory = tangram; else if (canonical === '十字绣') factory = embroidery; else if (canonical === '推箱子变体') factory = function (a, s, r, d) { state = state || {}; sokoban(a, s, r, d, state); }; else if (canonical === '立体魔方') factory = function (a, s, r, d) { state = state || {}; cube(a, s, r, d, state); }; else if (canonical === '同色方块' || canonical === '五彩连珠' || canonical === '七彩宝石' || canonical === '宝石方块' || canonical === '独粒钻石') factory = function (a, s, r, d) { state = state || {}; colorGame(a, s, r, d, 'match', state); }; else if (canonical === '移彩球' || canonical === '变化彩球') factory = function (a, s, r, d) { state = state || {}; colorGame(a, s, r, d, 'swap', state); }; else if (canonical.indexOf('连结电线') === 0 || canonical === '扩展线路' || canonical === '接水管变体') factory = function (a, s, r, d) { state = state || {}; colorGame(a, s, r, d, 'line', state); }; else factory = function (a, s, r, d) { simple(a, s, r, d, canonical + '独立玩法'); }; return mount(container, canonical, factory, function (redraw) { state = null; redraw(); }); }
    window.PK32Puzzle.startGame = function (container, name, opts) { return dispatch(container, String(name || NAMES[0]), opts || {}); };
    window.PK32Puzzle.getConfig = function (name) { return SPECS[ALIASES[name] || name] || null; };
    window.PK32Puzzle.names = NAMES.slice();
}());
