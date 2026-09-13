(function (global) {
  'use strict';

  var names = [
    '跟花', '丰收', '拱猪', '十点半', '钓鱼', '争上游', '抽乌龟', '梭哈', '牌九',
    '扑克麻将', '百智牌', 'FF8卡片', '移动', '争夺', '同花', '三打三', '记忆', '变幻牌',
    '挑选', '暗牌', '24点', '炮牌', '猜数', '幸运', '读心术', '斗地主', '拖拉机-升级',
    '纸牌魔法阵', '别棍', '14点', '考眼力', '13点', '扎金花', '纸牌算命', '桥牌', '塔罗牌',
    '数字魔方', '三张牌', '魔力纸牌'
  ];

  var modes = {
    '跟花': 'suit', '丰收': 'collect', '拱猪': 'pig', '十点半': 'half', '钓鱼': 'fishing',
    '争上游': 'climb', '抽乌龟': 'old-maid', '梭哈': 'showhand', '牌九': 'pai-gow',
    '扑克麻将': 'poker-mahjong', '百智牌': 'quiz-card', 'FF8卡片': 'ff8-card', '移动': 'move-card',
    '争夺': 'duel-card', '同花': 'flush', '三打三': 'three-v-three', '记忆': 'memory',
    '变幻牌': 'wild-card', '挑选': 'pick-card', '暗牌': 'hidden-card', '24点': '24-point',
    '炮牌': 'cannon-card', '猜数': 'guess-number', '幸运': 'lucky-draw', '读心术': 'mind-read',
    '斗地主': 'landlord', '拖拉机-升级': 'tractor', '纸牌魔法阵': 'magic-array', '别棍': 'remove-stick',
    '14点': 'fourteen', '考眼力': 'spot-card', '13点': 'thirteen', '扎金花': 'three-card-poker',
    '纸牌算命': 'fortune-card', '桥牌': 'bridge', '塔罗牌': 'tarot', '数字魔方': 'number-cube',
    '三张牌': 'three-cards', '魔力纸牌': 'magic-card'
  };

  ['梭哈二', '梭哈三', '梭哈四', '梭哈五', '梭哈六', '梭哈七'].forEach(function (name) { names.push(name); modes[name] = 'showhand'; });
  ['抽乌龟二', '抽乌龟三', '抽乌龟四', '抽乌龟五'].forEach(function (name) { names.push(name); modes[name] = 'old-maid'; });
  ['读心术三', '读心术四'].forEach(function (name) { names.push(name); modes[name] = 'mind-read'; });
  ['跟花二'].forEach(function (name) { names.push(name); modes[name] = 'suit'; });
  ['纸牌', '21点二', '24点二'].forEach(function (name) { names.push(name); modes[name] = name === '21点二' ? 'blackjack' : name === '24点二' ? '24-point' : 'standard'; });

  var configs = {};
  names.forEach(function (name) {
    configs[name] = { id: 'pk32-card-' + name, name: name, mode: modes[name], source: 'pk32',
      levelPolicy: 'original-only', status: 'rules-partial', levelCount: null };
  });
  configs['跟花二'].levelCount = 28;
  configs['跟花二'].nativePayloadCount = 28;

  function el(tag, text, cls) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(text, fn) { var b = el('button', text, 'btn ghost'); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function deck() { var d = []; for (var s = 0; s < 4; s++) for (var r = 1; r <= 13; r++) d.push({ s: s, r: r }); return shuffle(d); }
  function doubleDeck() {
    var d = deck().concat(deck());
    for (var i = 0; i < 4; i++) d.push({ s: 4, r: 14 + (i % 2) });
    return shuffle(d);
  }
  function label(c) { return c.r === 0 ? '乌龟' : ['♠', '♥', '♣', '♦'][c.s] + c.r; }

  function startGame(container, name, opts) {
    if (!container) throw new Error('PK32Card.startGame requires a container');
    var config = typeof name === 'string' ? configs[name] : name;
    if (!config || !config.name) throw new Error('Unknown PK32 card game');
    opts = opts || {};
    container.innerHTML = '';
    var root = el('div', '', 'pk32-card-game');
    var title = el('div', config.name + ' · PK32 原版流程模式' + (config.levelCount ? ' · 原版 ' + config.levelCount + ' 局' : ''), 'pk32-card-title');
    var status = el('div', '准备开始', 'pk32-card-status');
    var board = el('div', '', 'pk32-card-board');
    var controls = el('div', '', 'pk32-card-controls');
    root.appendChild(title); root.appendChild(status); root.appendChild(board); root.appendChild(controls); container.appendChild(root);
    var stopped = false, ended = false, score = 0, current = [], selected = [], state = {}, timers = [];
    function say(v) { status.textContent = v; }
    function finish(v) {
      if (ended) return;
      ended = true;
      timers.forEach(clearTimeout); timers = [];
      Array.prototype.forEach.call(root.querySelectorAll('button, input'), function (node) { node.disabled = true; });
      say(v + ' · 得分 ' + score);
    }
    function clear() { board.innerHTML = ''; controls.innerHTML = ''; }
    function cardButton(c, fn, hidden) { var b = button(hidden ? '■' : label(c), fn); b.className += ' pk32-card'; return b; }
    function reset() {
      timers.forEach(clearTimeout); timers = []; ended = false; score = 0; current = []; selected = []; state = {}; clear();
      var mode = config.mode;
      if (mode === 'landlord') return landlord();
      if (mode === 'showhand') return showhand();
      if (mode === 'bridge') return bridge();
      if (mode === 'pig') return pig();
      if (mode === 'old-maid') return oldMaid();
      if (mode === 'memory') return memory();
      if (mode === 'guess-number' || mode === 'number-cube' || mode === '24-point') return numberGame();
      if (mode === 'remove-stick') return sticks();
      if (mode === 'spot-card') return spot();
      if (mode === 'mind-read') return mind();
      if (mode === 'quiz-card') return quiz();
      if (mode === 'tarot' || mode === 'fortune-card') return fortune();
      if (mode === 'blackjack') return targetPoints(21);
      if (mode === 'fourteen' || mode === 'thirteen') return targetPoints(mode === 'fourteen' ? 14 : 13);
      if (mode === 'three-card-poker' || mode === 'three-cards') return threeCardRound();
      return cards();
    }
    function cards() {
      current = deck(); var count = config.mode === 'three-cards' || config.mode === 'three-card-poker' ? 3 : 5;
      say('点击发牌或选择牌，完成本局后可重开');
      var deal = button('发牌', function () { if (ended) return; board.innerHTML = ''; selected = []; for (var i = 0; i < count; i++) board.appendChild(cardButton(current[i], select, false)); say('点击牌进行选择，再点击“结束本局”'); });
      var end = button('结束本局', function () { if (!current.length) return say('请先发牌'); score = selected.length ? selected.length * 10 : Math.floor(Math.random() * 50) + 10; finish('本局结束'); });
      controls.appendChild(deal); controls.appendChild(end); deal.click();
      function select(e) { if (ended) return; var b = e.currentTarget; b.classList.toggle('selected'); var i = Array.prototype.indexOf.call(board.children, b); var at = selected.indexOf(i); if (at >= 0) selected.splice(at, 1); else selected.push(i); say('已选 ' + selected.length + ' 张'); }
    }
    function playCardButton(c, fn) { return cardButton(c, fn, false); }
    function renderHand(hand, click, legal) {
      board.innerHTML = '';
      hand.forEach(function (c, i) {
        var b = playCardButton(c, function () { click(i); });
        if (legal && !legal(c, i)) b.disabled = true;
        board.appendChild(b);
      });
    }
    function landlord() {
      var d = doubleDeck();
      var hands = [d.slice(0, 25), d.slice(25, 50), d.slice(50, 75)], landlordIndex = 0;
      var human = hands[0], turn = 0, lastRank = 0, lastCount = 0, passes = 0;
      hands.forEach(function (h) { h.sort(function (a, b) { return b.r - a.r; }); });
      say('三人两副牌：你是 1 号农民，轮到叫地主');
      var call = button('叫地主', function () { if (ended) return; landlordIndex = 0; turn = 0; say('你是地主，选择三张底牌后出牌'); show(); });
      var passCall = button('不叫', function () { if (ended) return; landlordIndex = 1; turn = 0; say('电脑成为地主，你是农民'); show(); });
      controls.appendChild(call); controls.appendChild(passCall);
      function show() {
        controls.innerHTML = '';
        renderHand(human, choose, function (c) { return lastCount === 0 || c.r === lastRank; });
        controls.appendChild(button('出牌', play)); controls.appendChild(button('不要', pass)); controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
        say((turn === 0 ? '你的回合' : '电脑出牌中') + ' · 上手牌型：' + (lastCount ? lastCount + ' 张' : '无'));
      }
      function choose(i) { if (ended || turn !== 0) return; var b = board.children[i]; b.classList.toggle('selected'); var p = selected.indexOf(i); if (p >= 0) selected.splice(p, 1); else selected.push(i); }
      function play() {
        if (ended || turn !== 0) return; if (!selected.length) return say('至少选择一张牌');
        var chosen = selected.map(function (i) { return human[i]; });
        if (lastCount && (chosen.length !== lastCount || chosen.some(function (c) { return c.r !== lastRank; }))) return say('本简化规则要求跟出相同张数和点数');
        chosen.forEach(function (c) { human.splice(human.indexOf(c), 1); }); lastRank = chosen[0].r; lastCount = chosen.length; selected = []; passes = 0; score += chosen.length;
        if (!human.length) return finish('农民获胜'); turn = 1; show(); aiTurn();
      }
      function pass() { if (ended || turn !== 0) return; passes++; selected = []; turn = 1; show(); aiTurn(); }
      function aiTurn() { timers.push(setTimeout(function () { if (ended) return; var h = hands[turn], ix = h.findIndex(function (c) { return !lastCount || (c.r === lastRank); }); if (ix < 0) { passes++; } else { var c = h.splice(ix, 1)[0]; lastRank = c.r; lastCount = 1; passes = 0; } if (!h.length) return finish('电脑获胜'); turn = (turn + 1) % 3; if (passes >= 2) { lastRank = 0; lastCount = 0; passes = 0; } if (turn === 0) show(); else aiTurn(); }, 260)); }
    }
    function showhand() {
      var mine = [], opp = [], d = deck().filter(function (c) { return c.r === 1 || c.r >= 8; }); for (var i = 0; i < 5; i++) { mine.push(d.pop()); opp.push(d.pop()); }
      say('梭哈：五张牌牌型比较'); renderHand(mine, function () {}, function () { return true; });
      board.appendChild(el('div', '你的牌：' + mine.map(label).join(' ')));
      controls.appendChild(button('比较牌型', function () { var a = handValue(mine), b = handValue(opp), compared = compareValue(a, b); score = compared > 0 ? 100 : 0; finish((compared === 0 ? '平局' : compared > 0 ? '你赢了' : '电脑赢了') + ' · 对手牌型 ' + a[2] + '/' + b[2]); }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      function compareValue(a, b) { for (var i = 0; i < Math.max(a[0].length, b[0].length); i++) { var av = a[0][i] || 0, bv = b[0][i] || 0; if (av !== bv) return av > bv ? 1 : -1; } return 0; }
      function handValue(h) {
        var counts = {}; h.forEach(function (c) { counts[c.r] = (counts[c.r] || 0) + 1; });
        var rawVals = Object.keys(counts).map(Number).sort(function (x, y) { return y - x; });
        var vals = rawVals.map(function (v) { return v === 1 ? 14 : v; });
        var groups = rawVals.map(function (v) { return { count: counts[v], value: v === 1 ? 14 : v }; }).sort(function (a, b) { return b.count - a.count || b.value - a.value; });
        var flush = h.every(function (c) { return c.s === h[0].s; }), straightHigh = 0;
        if (vals.length === 5) { if (vals[0] - vals[4] === 4) straightHigh = vals[0]; else if (vals.join(',') === '14,5,4,3,2') straightHigh = 5; }
        var rank = straightHigh && flush ? 8 : groups[0].count === 4 ? 7 : groups[0].count === 3 && groups[1].count === 2 ? 6 : flush ? 5 : straightHigh ? 4 : groups[0].count === 3 ? 3 : groups[0].count === 2 && groups[1].count === 2 ? 2 : groups[0].count === 2 ? 1 : 0;
        var vector = rank === 8 || rank === 4 ? [rank, straightHigh] : [rank].concat(groups.map(function (g) { return g.value; }));
        return [vector, vals[0], ['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'][rank]];
      }
    }
    function bridge() {
      var d = deck(), hands = [[], [], [], []], tricks = [0, 0], lead = 0, trick = 0;
      d.forEach(function (c, i) { hands[i % 4].push(c); }); hands.forEach(function (h) { h.sort(function (a, b) { return a.r - b.r; }); });
      say('桥牌简化流程：四方轮流出牌，完成 13 墩'); next();
      function next() { if (ended) return; if (hands[0].length === 0) return finish('桥牌结束：你方 ' + tricks[0] + ' 墩，电脑方 ' + tricks[1] + ' 墩'); renderHand(hands[0], play, function (c) { return state.suit == null || c.s === state.suit || !hands[0].some(function (x) { return x.s === state.suit; }); }); controls.innerHTML = ''; controls.appendChild(button('结束本局', function () { finish('主动结束'); })); say('第 ' + (trick + 1) + ' 墩 · 你的回合，首牌花色 ' + (state.suit == null ? '待定' : label({ s: state.suit, r: 1 }).charAt(0))); }
      function play(i) { var c = hands[0].splice(i, 1)[0]; state.suit = c.s; var played = [c]; for (var p = 1; p < 4; p++) { var h = hands[p], ix = h.findIndex(function (x) { return x.s === state.suit; }); if (ix < 0) ix = 0; played.push(h.splice(ix, 1)[0]); } var winner = played.reduce(function (best, x, j) { return x.s === state.suit && x.r > played[best].r ? j : best; }, 0); tricks[winner % 2]++; trick++; state.suit = null; next(); }
    }
    function pig() {
      var d = deck(), hands = [[], [], [], []], lead = 0, points = [0, 0, 0, 0]; d.forEach(function (c, i) { hands[i % 4].push(c); }); hands.forEach(function (h) { h.sort(function (a, b) { return a.r - b.r; }); }); say('拱猪：红桃计分，黑桃 Q 为猪；跟随首门'); turn();
      function turn() { if (ended) return; if (!hands[0].length) { score = Math.max(0, 100 - points[0]); return finish('本局结束，你得分 ' + points[0]); } renderHand(hands[0], play, function (c) { return state.suit == null || c.s === state.suit || !hands[0].some(function (x) { return x.s === state.suit; }); }); controls.innerHTML = ''; controls.appendChild(button('结束本局', function () { finish('主动结束'); })); say('你的回合 · 当前累计：' + points[0]); }
      function play(i) { var c = hands[0][i]; if (state.suit != null && c.s !== state.suit && hands[0].some(function (x) { return x.s === state.suit; })) return; hands[0].splice(i, 1); points[0] += c.s === 1 ? 1 : (c.s === 2 && c.r === 12 ? 13 : 0); state.suit = c.s; for (var p = 1; p < 4; p++) { var h = hands[p], ix = h.findIndex(function (x) { return x.s === state.suit; }); if (ix < 0) ix = 0; h.splice(ix, 1); } state.suit = null; turn(); }
    }
    function oldMaid() {
      var cards = deck(); cards.push({ s: 4, r: 0 }); shuffle(cards); var hand = [], computer = [], pairs = 0;
      cards.forEach(function (c, i) { (i % 2 ? computer : hand).push(c); });
      function removePairs(list) { var changed = true; while (changed) { changed = false; for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) if (list[i].r && list[i].r === list[j].r) { list.splice(j, 1); list.splice(i, 1); pairs++; changed = true; break; } if (changed) break; } }
      removePairs(hand); removePairs(computer);
      function drawHand() {
        if (ended) return;
        selected = []; renderHand(hand, function () {}, function () { return true; }); controls.innerHTML = '';
        controls.appendChild(button('抽电脑一张牌', function () {
          if (ended || !computer.length) return;
          hand.push(computer.splice(Math.floor(Math.random() * computer.length), 1)[0]); removePairs(hand);
          if (!hand.length) return finish('全部配对，你获胜');
          computerTurn();
        }));
        controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
        if (!computer.length) finish('电脑手牌已空，你留下乌龟，电脑获胜'); else say('抽乌龟：从电脑手牌抽一张，自动配对');
      }
      function computerTurn() {
        if (ended) return;
        timers.push(setTimeout(function () {
          if (ended || !hand.length) return finish('你手牌已空，你获胜');
          computer.push(hand.splice(Math.floor(Math.random() * hand.length), 1)[0]); removePairs(computer);
          if (!computer.length) return finish('电脑全部配对，你留下乌龟，电脑获胜');
          drawHand();
        }, 300));
      }
      drawHand();
    }
    function memory() {
      var values = shuffle([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]); var open = [], matched = [];
      say('翻开两张相同的牌'); values.forEach(function (_, i) { board.appendChild(cardButton({ r: '?', s: 0 }, function () {
        if (ended || matched.indexOf(i) >= 0 || open.indexOf(i) >= 0) return; open.push(i); board.children[i].textContent = values[i];
        if (open.length === 2) { if (values[open[0]] === values[open[1]]) { matched.push(open[0], open[1]); score += 10; open = []; if (matched.length === values.length) finish('全部配对'); }
          else { var pair = open.slice(); open = []; timers.push(setTimeout(function () { pair.forEach(function (n) { if (board.children[n]) board.children[n].textContent = '■'; }); }, 450)); } }
      }, true)); }); controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function evaluateTwentyFour(expression, numbers) {
      var tokens = String(expression || '').replace(/\s+/g, '').match(/\d+|[()+\-*/]/g);
      if (!tokens || tokens.join('') !== String(expression || '').replace(/\s+/g, '') || tokens.some(function (token) { return /^\d+$/.test(token) && token.length !== 1; })) return false;
      var available = numbers.slice();
      tokens.forEach(function (token) { if (/^\d$/.test(token)) { var i = available.indexOf(Number(token)); if (i < 0) return; available.splice(i, 1); } });
      if (available.length || tokens.filter(function (token) { return /^\d$/.test(token); }).length !== numbers.length) return false;
      var at = 0;
      function parseExpression() { var value = parseTerm(); while (tokens[at] === '+' || tokens[at] === '-') { var op = tokens[at++], right = parseTerm(); value = op === '+' ? value + right : value - right; } return value; }
      function parseTerm() { var value = parseFactor(); while (tokens[at] === '*' || tokens[at] === '/') { var op = tokens[at++], right = parseFactor(); if (op === '/' && right === 0) return NaN; value = op === '*' ? value * right : value / right; } return value; }
      function parseFactor() { if (tokens[at] === '(') { at++; var value = parseExpression(); if (tokens[at++] !== ')') return NaN; return value; } var value = Number(tokens[at++]); return Number.isFinite(value) ? value : NaN; }
      var result = parseExpression();
      return at === tokens.length && Number.isFinite(result) && Math.abs(result - 24) < 1e-9;
    }
    function numberGame() {
      var mode = config.mode, target = mode === '24-point' ? 24 : 1 + Math.floor(Math.random() * 99), nums = mode === '24-point' ? [1 + Math.floor(Math.random() * 9), 1 + Math.floor(Math.random() * 9), 1 + Math.floor(Math.random() * 9), 1 + Math.floor(Math.random() * 9)] : [];
      say(mode === '24-point' ? '使用四张牌各一次组成 24' : '输入或点击数字进行猜测');
      var input = document.createElement('input'); input.type = mode === '24-point' ? 'text' : 'number'; input.placeholder = mode === '24-point' ? '例如 6/(1-3/4)*4' : '输入答案'; board.appendChild(input);
      if (nums.length) { var line = el('div', nums.join('  ')); board.appendChild(line); }
      controls.appendChild(button('提交', function () { var valid = mode === '24-point' ? evaluateTwentyFour(input.value, nums) : Number(input.value) === target; score = valid ? 100 : 0; finish(valid ? '答对' : (mode === '24-point' ? '表达式不满足四张牌各一次且结果为 24' : '答案是 ' + target)); }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function targetPoints(target) {
      var hand = [], d = deck();
      say('抽取牌面，使点数尽量接近 ' + target + '；超过目标即输');
      function total() { return hand.reduce(function (sum, c) { return sum + Math.min(c.r, 10); }, 0); }
      function show() { board.innerHTML = ''; hand.forEach(function (c) { board.appendChild(playCardButton(c, function () {})); }); board.appendChild(el('div', '当前点数：' + total())); }
      controls.appendChild(button('要牌', function () { if (ended) return; hand.push(d.pop()); show(); if (total() > target) finish('超过 ' + target + ' 点'); }));
      controls.appendChild(button('停牌结算', function () { if (ended) return; score = Math.max(0, 100 - Math.abs(target - total()) * 10); finish('结算：' + total() + ' 点'); }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      hand.push(d.pop(), d.pop()); show();
    }
    function threeCardRound() {
      var mine = deck().slice(0, 3), opponent = deck().slice(3, 6);
      function rank(hand) {
        var raw = hand.map(function (c) { return c.r; }).sort(function (x, y) { return y - x; }), a = raw.map(function (v) { return v === 1 ? 14 : v; });
        var counts = {}; raw.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
        var same = hand.every(function (c) { return c.s === hand[0].s; }), high = 0;
        if (a[0] - a[2] === 2 && new Set(a).size === 3) high = a[0]; else if (a.join(',') === '14,3,2') high = 3;
        var pair = Object.keys(counts).map(Number).filter(function (v) { return counts[v] === 2; }).map(function (v) { return v === 1 ? 14 : v; }).sort(function (x, y) { return y - x; });
        return { vector: [same && high ? 3 : same ? 2 : high ? 1 : pair.length ? 0.5 : 0, high || pair[0] || a[0], pair.length ? a.filter(function (v) { return v !== pair[0]; })[0] : a[1], a[2]], name: same && high ? '同花顺' : same ? '同花' : high ? '顺子' : pair.length ? '对子' : '高牌' };
      }
      say('三张牌：比较同花顺、同花、顺子、对子和高牌'); renderHand(mine, function () {}, function () { return true; }); controls.appendChild(button('比较牌型', function () { var a = rank(mine), b = rank(opponent), compared = a.vector.reduce(function (v, x, i) { return v || (x > b.vector[i] ? 1 : x < b.vector[i] ? -1 : 0); }, 0); score = compared > 0 ? 100 : 0; finish(compared === 0 ? '平局' : compared > 0 ? '你赢了' : '电脑赢了'); })); controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function sticks() { var n = 21; say('点击移除 1-3 根，拿到最后一根获胜'); var out = el('div', '剩余纸牌棍：' + n); board.appendChild(out); for (var i = 1; i <= 3; i++) controls.appendChild(button('移除 ' + i, function () { if (ended) return; var amount = Number(this.textContent.slice(-1)); if (amount > n) return say('剩余不足 ' + amount + ' 根'); n -= amount; if (n === 0) return finish('你拿到最后一根'); out.textContent = '剩余纸牌棍：' + n; })); controls.appendChild(button('结束本局', function () { finish('主动结束'); })); }
    function spot() { var answer = Math.floor(Math.random() * 4), choices = ['♠', '♥', '♣', '♦']; say('找出与目标相同的花色'); board.appendChild(el('div', '目标：' + choices[answer])); choices.forEach(function (v, i) { board.appendChild(button(v, function () { score = i === answer ? 100 : 0; finish(i === answer ? '观察正确' : '选择错误'); })); }); controls.appendChild(button('结束本局', function () { finish('主动结束'); })); }
    function mind() { say('在心里选一个 1 到 10 的数字'); var input = document.createElement('input'); input.type = 'number'; input.min = 1; input.max = 10; board.appendChild(input); controls.appendChild(button('揭示', function () { score = 10; finish('你的数字是 ' + (input.value || '7')); })); controls.appendChild(button('结束本局', function () { finish('主动结束'); })); }
    function quiz() { var q = el('div', '这张牌的点数是否大于 7？'); board.appendChild(q); ['是', '否'].forEach(function (v, i) { board.appendChild(button(v, function () { score = i === 0 ? 10 : 0; finish('答题结束'); })); }); controls.appendChild(button('结束本局', function () { finish('主动结束'); })); }
    function fortune() { var cards = ['太阳', '月亮', '星星', '命运之轮', '力量']; say('点击抽取一张牌'); controls.appendChild(button('抽牌', function () { var c = cards[Math.floor(Math.random() * cards.length)]; board.textContent = c; score = 10; finish('抽到：' + c); })); controls.appendChild(button('结束本局', function () { finish('主动结束'); })); }
    controls.appendChild(button('重开', reset)); reset();
    return { config: config, restart: reset, end: function () { finish('主动结束'); }, getScore: function () { return score; }, destroy: function () { stopped = true; timers.forEach(clearTimeout); timers = []; container.innerHTML = ''; }, isStopped: function () { return stopped; } };
  }

  global.PK32Card = { names: names, configs: configs, get: function (name) { return configs[name] || null; }, list: function () { return names.map(function (name) { return configs[name]; }); }, startGame: startGame };
})(window);
