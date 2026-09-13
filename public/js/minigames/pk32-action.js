(function (global) {
  'use strict';

  var games = {
    whackMole: { id: 'whackMole', name: '打地鼠', type: 'whack', width: 480, height: 360 },
    tetris: { id: 'tetris', name: '俄罗斯方块', type: 'tetris', width: 300, height: 600 },
    snake: { id: 'snake', name: '贪吃蛇', type: 'snake', width: 480, height: 360 },
    tankBattle: { id: 'tankBattle', name: '坦克大战', type: 'tank', width: 640, height: 420 },
    breakout: { id: 'breakout', name: '打砖块', type: 'breakout', width: 640, height: 420 },
    dartKing: { id: 'dartKing', name: '飞镖王', type: 'dart', width: 520, height: 420 },
    hundredMeters: { id: 'hundredMeters', name: '飞一百米', type: 'runner', width: 640, height: 360 },
    pacMan: { id: 'pacMan', name: '吃豆子', type: 'pacman', width: 560, height: 420 },
    rocketBattle: { id: 'rocketBattle', name: '火箭大战', type: 'rocket', width: 640, height: 420 }
  };

  var colors = { bg: '#101827', panel: '#1d2b42', text: '#edf4ff', accent: '#ffcf4a', good: '#5de0a2', danger: '#ff6b6b' };
  var pieces = [
    [[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]],
    [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]],
    [[0, 1, 1], [1, 1, 0]], [[1, 1, 0], [0, 1, 1]]
  ];

  function random(max) { return Math.floor(Math.random() * max); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rotate(shape) {
    return shape[0].map(function (_, x) { return shape.map(function (row) { return row[x]; }).reverse(); });
  }
  function specFor(spec) {
    if (typeof spec === 'string') return games[spec] || Object.keys(games).map(function (k) { return games[k]; }).find(function (g) { return g.id === spec; });
    return spec || games.whackMole;
  }
  function text(ctx, value, x, y, size, align) {
    ctx.fillStyle = colors.text; ctx.font = (size || 16) + 'px sans-serif'; ctx.textAlign = align || 'left'; ctx.fillText(value, x, y);
  }

  function startGame(container, input, opts) {
    if (!container) throw new Error('PK32Action.startGame requires a container');
    var spec = specFor(input);
    if (!spec || !spec.type) throw new Error('Unknown PK32 action game');
    opts = opts || {};
    container.innerHTML = '';
    var root = document.createElement('div');
    root.className = 'pk32-action-game';
    var title = document.createElement('div'); title.className = 'pk32-action-title'; title.textContent = spec.name || spec.id;
    var canvas = document.createElement('canvas'); canvas.width = spec.width || 640; canvas.height = spec.height || 420; canvas.tabIndex = 0;
    var controls = document.createElement('div'); controls.className = 'pk32-action-controls';
    var restart = document.createElement('button'); restart.type = 'button'; restart.textContent = '重开';
    var hint = document.createElement('span'); hint.className = 'pk32-action-hint';
    controls.appendChild(restart); controls.appendChild(hint); root.appendChild(title); root.appendChild(canvas); root.appendChild(controls); container.appendChild(root);
    var ctx = canvas.getContext('2d'); var keys = {}; var pressed = {}; var raf = 0; var stopped = false; var ended = false; var score = 0; var last = 0; var state;
    function say(v) { hint.textContent = v; }
    function reset() { ended = false; score = 0; last = 0; keys = {}; pressed = {}; state = makeState(spec.type); say(''); canvas.focus(); }
    function finish(message) { ended = true; say(message + '  得分：' + score + '，点击“重开”再来一次'); }
    function onKey(e) { var key = e.key.toLowerCase(); if (!keys[key]) pressed[key] = true; keys[key] = true; if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(key) >= 0) e.preventDefault(); }
    function offKey(e) { delete keys[e.key.toLowerCase()]; }
    function consume(key) { var hit = !!pressed[key]; delete pressed[key]; return hit; }
    function moveKey() { return { left: keys.arrowleft || keys.a, right: keys.arrowright || keys.d, up: keys.arrowup || keys.w, down: keys.arrowdown || keys.s }; }
    canvas.addEventListener('keydown', onKey); canvas.addEventListener('keyup', offKey); restart.addEventListener('click', reset);
    canvas.addEventListener('pointerdown', function (e) { canvas.focus(); var r = canvas.getBoundingClientRect(); click((e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height); });

    function makeState(type) {
      if (type === 'whack') return { holes: Array.from({ length: 9 }, function (_, i) { return { x: 90 + (i % 3) * 150, y: 105 + Math.floor(i / 3) * 90, mole: false }; }), timer: 0, miss: 0 };
      if (type === 'snake') return { body: [{ x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 7 }], dir: { x: 1, y: 0 }, food: { x: 15, y: 8 }, timer: 0 };
      if (type === 'tetris') return { board: Array.from({ length: 20 }, function () { return Array(10).fill(0); }), piece: null, x: 3, y: 0, timer: 0, lines: 0 };
      if (type === 'breakout') return { ball: { x: 320, y: 300, vx: 170, vy: -170 }, paddle: 270, bricks: Array.from({ length: 30 }, function (_, i) { return { x: 20 + (i % 10) * 62, y: 35 + Math.floor(i / 10) * 24, alive: true }; }) };
      if (type === 'tank') return { player: { x: 320, y: 370, a: -Math.PI / 2 }, bullets: [], enemies: [{ x: 100, y: 70, a: Math.PI / 2 }, { x: 500, y: 100, a: Math.PI / 2 }], timer: 0 };
      if (type === 'dart') return { x: 260, y: 210, time: 30 };
      if (type === 'runner') return { x: 60, y: 280, vy: 0, obstacles: [{ x: 600, y: 280 }], distance: 0 };
      if (type === 'pacman') return { p: { x: 1, y: 1 }, dir: { x: 1, y: 0 }, dots: Array.from({ length: 45 }, function (_, i) { return { x: 2 + i % 9, y: 1 + Math.floor(i / 9) * 2, alive: true }; }) };
      return { ship: { x: 70, y: 210 }, bullets: [], enemies: Array.from({ length: 5 }, function (_, i) { return { x: 430 + i * 40, y: 60 + (i % 3) * 100 }; }), timer: 0 };
    }
    function click(x, y) {
      if (ended) return;
      if (spec.type === 'whack') state.holes.forEach(function (h) { if (h.mole && Math.hypot(x - h.x, y - h.y) < 42) { h.mole = false; score += 10; } });
      if (spec.type === 'dart') { var d = Math.hypot(x - state.x, y - state.y); score += d < 35 ? 100 : d < 80 ? 50 : d < 150 ? 20 : 5; say('命中！'); }
      if (spec.type === 'rocket') { state.bullets.push({ x: state.ship.x + 25, y: state.ship.y, vx: 360, vy: 0 }); }
    }
    function update(dt) {
      var m = moveKey();
      if (spec.type === 'whack') { state.timer -= dt; if (state.timer <= 0) { state.holes[random(9)].mole = true; state.timer = .65; } }
      if (spec.type === 'snake') { state.timer += dt; if (state.timer > .13) { state.timer = 0; var n = { x: state.body[0].x + state.dir.x, y: state.body[0].y + state.dir.y }; if (n.x < 0 || n.y < 0 || n.x >= 24 || n.y >= 18 || state.body.some(function (p) { return p.x === n.x && p.y === n.y; })) return finish('撞到了'); state.body.unshift(n); if (n.x === state.food.x && n.y === state.food.y) { score += 10; state.food = { x: random(24), y: random(18) }; } else state.body.pop(); } if (m.up && state.dir.y === 0) state.dir = { x: 0, y: -1 }; if (m.down && state.dir.y === 0) state.dir = { x: 0, y: 1 }; if (m.left && state.dir.x === 0) state.dir = { x: -1, y: 0 }; if (m.right && state.dir.x === 0) state.dir = { x: 1, y: 0 }; }
      if (spec.type === 'breakout') { state.paddle += (m.left ? -1 : m.right ? 1 : 0) * 300 * dt; state.paddle = clamp(state.paddle, 0, 570); state.ball.x += state.ball.vx * dt; state.ball.y += state.ball.vy * dt; if (state.ball.x < 8 || state.ball.x > 632) state.ball.vx *= -1; if (state.ball.y < 8) state.ball.vy *= -1; if (state.ball.y > 385 && state.ball.x > state.paddle && state.ball.x < state.paddle + 70) state.ball.vy = -Math.abs(state.ball.vy); state.bricks.forEach(function (b) { if (b.alive && Math.abs(state.ball.x - (b.x + 27)) < 32 && Math.abs(state.ball.y - b.y) < 14) { b.alive = false; state.ball.vy *= -1; score += 5; } }); if (state.ball.y > 440) return finish('球掉落'); if (!state.bricks.some(function (b) { return b.alive; })) finish('清屏'); }
      if (spec.type === 'tank' || spec.type === 'rocket') { var s = spec.type === 'tank' ? state.player : state.ship; s.x += (m.right ? 1 : m.left ? -1 : 0) * 180 * dt; s.y += (m.down ? 1 : m.up ? -1 : 0) * 180 * dt; s.x = clamp(s.x, 20, canvas.width - 20); s.y = clamp(s.y, 20, canvas.height - 20); state.timer -= dt; if ((keys[' '] || keys.enter) && state.timer <= 0) { state.bullets.push({ x: s.x + 18, y: s.y, vx: 380, vy: 0 }); state.timer = .3; } state.bullets.forEach(function (b) { b.x += b.vx * dt; b.y += b.vy * dt; }); var targets = spec.type === 'tank' ? state.enemies : state.enemies; state.bullets = state.bullets.filter(function (b) { var hit = targets.find(function (e) { return Math.hypot(e.x - b.x, e.y - b.y) < 22; }); if (hit) { targets.splice(targets.indexOf(hit), 1); score += 20; return false; } return b.x < canvas.width + 20; }); if (!targets.length) finish('全部击破'); }
      if (spec.type === 'runner') { state.distance += 35 * dt; state.vy += 700 * dt; state.y += state.vy * dt; if (state.y > 280) { state.y = 280; state.vy = 0; } if (m.up && state.y === 280) state.vy = -330; state.obstacles.forEach(function (o) { o.x -= 180 * dt; if (o.x < -20) { o.x = canvas.width + random(180); score += 10; } if (Math.abs(o.x - state.x) < 28 && Math.abs(o.y - state.y) < 35) finish('撞到障碍'); }); if (state.distance >= 100) finish('到达一百米'); }
      if (spec.type === 'dart') { state.time -= dt; if (state.time <= 0) finish('时间到'); }
      if (spec.type === 'pacman') { if (m.up) state.dir = { x: 0, y: -1 }; if (m.down) state.dir = { x: 0, y: 1 }; if (m.left) state.dir = { x: -1, y: 0 }; if (m.right) state.dir = { x: 1, y: 0 }; state.timer += dt; if (state.timer > .16) { state.timer = 0; state.p.x = clamp(state.p.x + state.dir.x, 0, 13); state.p.y = clamp(state.p.y + state.dir.y, 0, 9); state.dots.forEach(function (d) { if (d.alive && d.x === state.p.x && d.y === state.p.y) { d.alive = false; score += 5; } }); if (!state.dots.some(function (d) { return d.alive; })) finish('吃完所有豆子'); } }
      if (spec.type === 'tetris') {
        state.timer += dt;
        if (!state.piece) {
          state.piece = pieces[random(pieces.length)].map(function (r) { return r.slice(); }); state.x = Math.floor((10 - state.piece[0].length) / 2); state.y = 0;
          if (collides(state.piece, state.x, state.y)) return finish('方块堆满');
        }
        if (m.left && !collides(state.piece, state.x - 1, state.y)) state.x--;
        if (m.right && !collides(state.piece, state.x + 1, state.y)) state.x++;
        if (consume('arrowup') || consume('w')) { var turned = rotate(state.piece); if (!collides(turned, state.x, state.y)) state.piece = turned; else if (!collides(turned, state.x - 1, state.y)) { state.piece = turned; state.x--; } else if (!collides(turned, state.x + 1, state.y)) { state.piece = turned; state.x++; } }
        var drop = consume(' ') || consume('arrowdown') || consume('s');
        if (drop) while (!collides(state.piece, state.x, state.y + 1)) state.y++;
        if (drop || state.timer > .6) { if (!drop) state.timer = 0; if (!collides(state.piece, state.x, state.y + 1)) state.y++; else lockTetris(); }
      }
    }
    function collides(shape, x, y) {
      return shape.some(function (row, yy) { return row.some(function (value, xx) {
        if (!value) return false;
        var boardY = y + yy, boardX = x + xx;
        return boardX < 0 || boardX >= 10 || boardY < 0 || boardY >= 20 || state.board[boardY][boardX];
      }); });
    }
    function lockTetris() {
      state.piece.forEach(function (row, yy) { row.forEach(function (value, xx) { if (value) state.board[state.y + yy][state.x + xx] = 1; }); });
      var kept = state.board.filter(function (row) { return row.some(function (value) { return !value; }); });
      var cleared = 20 - kept.length;
      while (kept.length < 20) kept.unshift(Array(10).fill(0));
      state.board = kept; state.lines += cleared; score += 10 + cleared * cleared * 20; state.piece = null;
      if (cleared) say('消除 ' + cleared + ' 行，得分：' + score);
    }
    function draw() {
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); text(ctx, '得分 ' + score, 12, 24, 16); if (spec.type === 'whack') { state.holes.forEach(function (h) { ctx.fillStyle = '#513a2d'; ctx.beginPath(); ctx.ellipse(h.x, h.y + 28, 48, 18, 0, 0, Math.PI * 2); ctx.fill(); if (h.mole) { ctx.fillStyle = '#b87952'; ctx.beginPath(); ctx.arc(h.x, h.y, 30, 0, Math.PI * 2); ctx.fill(); text(ctx, '• •', h.x, h.y - 2, 18, 'center'); } }); }
      if (spec.type === 'snake') { ctx.fillStyle = colors.good; state.body.forEach(function (p) { ctx.fillRect(p.x * 20, p.y * 20 + 35, 18, 18); }); ctx.fillStyle = colors.danger; ctx.fillRect(state.food.x * 20, state.food.y * 20 + 35, 18, 18); }
      if (spec.type === 'breakout') { ctx.fillStyle = colors.accent; state.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, 54, 16); }); ctx.fillStyle = colors.good; ctx.fillRect(state.paddle, 395, 70, 10); ctx.beginPath(); ctx.arc(state.ball.x, state.ball.y, 7, 0, Math.PI * 2); ctx.fill(); }
      if (spec.type === 'dart') { ctx.strokeStyle = colors.text; ctx.lineWidth = 8; [150, 105, 60, 25].forEach(function (r, i) { ctx.beginPath(); ctx.arc(state.x, state.y, r, 0, Math.PI * 2); ctx.strokeStyle = i % 2 ? colors.danger : colors.text; ctx.stroke(); }); text(ctx, '剩余 ' + Math.ceil(state.time) + ' 秒', 12, 48); }
      if (spec.type === 'runner') { ctx.fillStyle = colors.good; ctx.fillRect(state.x, state.y - 32, 24, 32); ctx.fillStyle = colors.danger; state.obstacles.forEach(function (o) { ctx.fillRect(o.x, o.y - 30, 22, 30); }); text(ctx, Math.floor(state.distance) + ' / 100 米', 12, 48); }
      if (spec.type === 'pacman') { ctx.fillStyle = colors.accent; state.dots.forEach(function (d) { if (d.alive) { ctx.beginPath(); ctx.arc(d.x * 40 + 20, d.y * 40 + 55, 4, 0, Math.PI * 2); ctx.fill(); } }); ctx.fillStyle = '#ffd34e'; ctx.beginPath(); ctx.arc(state.p.x * 40 + 20, state.p.y * 40 + 55, 15, .25, Math.PI * 2 - .25); ctx.lineTo(state.p.x * 40 + 20, state.p.y * 40 + 55); ctx.fill(); }
      if (spec.type === 'tetris') { var bx = 45, by = 35, size = 26; ctx.strokeStyle = '#30415b'; for (var y = 0; y < 20; y++) for (var x = 0; x < 10; x++) { ctx.strokeRect(bx + x * size, by + y * size, size, size); if (state.board[y][x]) { ctx.fillStyle = colors.accent; ctx.fillRect(bx + x * size + 2, by + y * size + 2, size - 4, size - 4); } } if (state.piece) state.piece.forEach(function (r, yy) { r.forEach(function (v, xx) { if (v) { ctx.fillStyle = colors.good; ctx.fillRect(bx + (state.x + xx) * size + 2, by + (state.y + yy) * size + 2, size - 4, size - 4); } }); }); }
      if (spec.type === 'tank' || spec.type === 'rocket') { var s = spec.type === 'tank' ? state.player : state.ship; ctx.fillStyle = colors.good; ctx.fillRect(s.x - 18, s.y - 12, 36, 24); ctx.fillStyle = colors.danger; state.enemies.forEach(function (e) { ctx.fillRect(e.x - 15, e.y - 12, 30, 24); }); ctx.fillStyle = colors.accent; state.bullets.forEach(function (b) { ctx.fillRect(b.x, b.y - 3, 12, 6); }); }
      if (ended) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height); text(ctx, '本局结束', canvas.width / 2, canvas.height / 2, 28, 'center'); }
    }
    function frame(t) { if (stopped) return; if (!last) last = t; var dt = Math.min(.05, (t - last) / 1000); last = t; if (!ended) update(dt); draw(); if (!stopped) raf = requestAnimationFrame(frame); }
    reset(); raf = requestAnimationFrame(frame);
    return { canvas: canvas, spec: spec, getScore: function () { return score; }, restart: reset, destroy: function () { if (stopped) return; stopped = true; cancelAnimationFrame(raf); canvas.removeEventListener('keydown', onKey); canvas.removeEventListener('keyup', offKey); container.innerHTML = ''; } };
  }

  global.PK32Action = { games: games, startGame: startGame };
})(window);
