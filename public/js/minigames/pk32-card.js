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
    '扑克麻将': 'poker-mahjong', '百智牌': 'battle-card', 'FF8卡片': 'ff8-card', '移动': 'move-card',
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
      if (mode === 'suit') return followSuit();
      if (mode === 'collect') return harvestCards();
      if (mode === 'fishing') return fishing();
      if (mode === 'climb') return climb();
      if (mode === 'showhand') return showhand();
      if (mode === 'bridge') return bridge();
      if (mode === 'pig') return pig();
      if (mode === 'half') return halfPoint();
      if (mode === 'old-maid') return oldMaid();
      if (mode === 'memory') return memory();
      if (mode === 'pair') return pairCards();
      if (mode === 'guess-number') return guessNumber();
      if (mode === 'guess-number' || mode === 'number-cube' || mode === '24-point') return numberGame();
      if (mode === 'remove-stick') return pokerMahjong(true);
      if (mode === 'spot-card') return spot();
      if (mode === 'mind-read') return mindRead();
      if (mode === 'quiz-card') return quiz();
      if (mode === 'battle-card') return battleCard();
      if (mode === 'ff8-card') return ff8Card();
      if (mode === 'poker-mahjong') return pokerMahjong(false);
      if (mode === 'pai-gow') return paiGow();
      if (mode === 'move-card') return moveCard();
      if (mode === 'duel-card' || mode === 'three-v-three') return duelCard(mode === 'three-v-three' ? 3 : 1);
      if (mode === 'wild-card') return wildCard();
      if (mode === 'cannon-card') return cannonCard();
      if (mode === 'magic-array') return magicArray();
      if (mode === 'flush') return flushRound();
      if (mode === 'pick-card') return pickCard();
      if (mode === 'hidden-card') return hiddenCard();
      if (mode === 'lucky-draw') return luckyDraw();
      if (mode === 'tarot') return tarot();
      if (mode === 'fortune-card') return fortune();
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
    function followSuit() {
      var d = deck(), hands = [[], [], [], []], trick = 0, won = [0, 0], leadSuit = null;
      d.forEach(function (c, i) { hands[i % 4].push(c); });
      hands.forEach(function (h) { h.sort(function (a, b) { return a.s - b.s || a.r - b.r; }); });
      function next() {
        if (ended) return;
        if (!hands[0].length) return finish('跟花结束：你方 ' + won[0] + ' 墩，电脑方 ' + won[1] + ' 墩');
        renderHand(hands[0], play, function (c) { return leadSuit == null || c.s === leadSuit || !hands[0].some(function (x) { return x.s === leadSuit; }); });
        controls.innerHTML = ''; controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
        say('第 ' + (trick + 1) + ' 墩：必须跟出首牌花色，无法跟花才可垫牌。');
      }
      function aiCard(hand, suit) { var i = hand.findIndex(function (c) { return c.s === suit; }); if (i < 0) i = 0; return hand.splice(i, 1)[0]; }
      function play(i) {
        var first = hands[0].splice(i, 1)[0], played = [first]; leadSuit = first.s;
        for (var p = 1; p < 4; p++) played.push(aiCard(hands[p], leadSuit));
        var winner = played.reduce(function (best, c, ix) { return c.s === leadSuit && c.r > played[best].r ? ix : best; }, 0);
        won[winner % 2] += 1; trick += 1; leadSuit = null; score = won[0] * 10; next();
      }
      next();
    }
    function harvestCards() {
      var d = deck(), hand = d.splice(0, 8), basket = [], target = 4;
      say('丰收：收集同点数四张牌，凑满一组即完成本局。');
      function countRanks(cards) { var map = {}; cards.forEach(function (c) { map[c.r] = (map[c.r] || 0) + 1; }); return map; }
      function draw() {
        renderHand(hand, function (i) {
          var c = hand.splice(i, 1)[0]; basket.push(c);
          if (d.length) hand.push(d.pop());
          var counts = countRanks(basket), complete = Object.keys(counts).some(function (rank) { return counts[rank] >= target; });
          score = basket.length * 5;
          if (complete) return finish('丰收完成：收齐一组同点数牌。');
          if (!hand.length) return finish('牌堆耗尽，已收集 ' + basket.length + ' 张。');
          draw();
        }, function () { return true; });
        controls.innerHTML = ''; controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
        say('点击手牌放入粮仓；粮仓：' + basket.map(label).join(' ') + (d.length ? '；牌堆剩余 ' + d.length : ''));
      }
      draw();
    }
    function fishing() {
      var d = deck(), table = d.splice(0, 4), hand = d.splice(0, 6), ai = d.splice(0, 6), captured = [0, 0];
      function capture(player, card) {
        var matches = table.filter(function (c) { return c.r === card.r; });
        table = table.filter(function (c) { return c.r !== card.r; });
        if (matches.length) captured[player] += matches.length + 1;
        else table.push(card);
      }
      function aiTurn() {
        if (ai.length) capture(1, ai.shift());
        if (d.length) ai.push(d.pop());
      }
      function draw() {
        if (!hand.length && !ai.length) { score = captured[0] * 10; return finish('钓鱼结束：你钓到 ' + captured[0] + ' 张，电脑 ' + captured[1] + ' 张。'); }
        renderHand(hand, function (i) {
          capture(0, hand.splice(i, 1)[0]);
          if (d.length) hand.push(d.pop());
          aiTurn(); draw();
        }, function () { return true; });
        board.appendChild(el('div', '桌面：' + table.map(label).join(' ')));
        controls.innerHTML = ''; controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
        say('钓鱼：出同点数牌可收走桌面同点数牌。你 ' + captured[0] + ' 张，电脑 ' + captured[1] + ' 张。');
      }
      draw();
    }
    function climb() {
      var d = deck(), human = d.splice(0, 17), ai = d.splice(0, 17), lastRank = 0, passes = 0;
      human.sort(function (a, b) { return a.r - b.r; }); ai.sort(function (a, b) { return a.r - b.r; });
      function rank(c) { return c.r === 1 ? 14 : c.r; }
      function draw() {
        renderHand(human, function (i) {
          var card = human[i];
          if (lastRank && rank(card) <= lastRank) return say('必须出比上家更大的单牌，或选择不要。');
          human.splice(i, 1); lastRank = rank(card); passes = 0; score += 5;
          if (!human.length) return finish('争上游完成：你的牌先出完。');
          aiTurn(); draw();
        }, function (c) { return !lastRank || rank(c) > lastRank; });
        controls.innerHTML = ''; controls.appendChild(button('不要', function () { passes += 1; aiTurn(); draw(); })); controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
        say('争上游：按单牌点数压上家；当前需要大于 ' + (lastRank || '任意') + '。电脑剩余 ' + ai.length + ' 张。');
      }
      function aiTurn() {
        var i = ai.findIndex(function (c) { return !lastRank || rank(c) > lastRank; });
        if (i >= 0) { lastRank = rank(ai.splice(i, 1)[0]); passes = 0; }
        else passes += 1;
        if (!ai.length) return finish('电脑先出完牌。');
        if (passes >= 2) { lastRank = 0; passes = 0; }
      }
      draw();
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
    function pairCards() {
      var values = shuffle([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9]);
      var chosen = [], removed = 0;
      say('配对：选择两张点数相同的牌即可消去');
      function draw() {
        board.innerHTML = '';
        values.forEach(function (value, index) {
          var b = button(value == null ? ' ' : String(value), function () {
            if (ended || value == null || chosen.indexOf(index) >= 0) return;
            chosen.push(index);
            b.classList.add('selected');
            if (chosen.length === 2) {
              var a = chosen[0], c = chosen[1];
              if (values[a] === values[c]) {
                values[a] = null; values[c] = null; removed += 2; score += 10; chosen = [];
                if (removed === values.length) return finish('恭喜！您过关了！');
                draw();
              } else {
                say('这两张牌不能消去');
                chosen = [];
                draw();
              }
            }
          });
          b.className += ' pk32-card';
          b.disabled = value == null;
          board.appendChild(b);
        });
      }
      controls.appendChild(button('重排', function () { values = shuffle(values.filter(function (value) { return value != null; })).concat(Array(removed).fill(null)); chosen = []; draw(); }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      draw();
    }
    function guessNumber() {
      var digits = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4), tries = 0, best = 0;
      say('猜数：输入 4 个不重复数字，系统提示数字和位置命中情况');
      var input = document.createElement('input'); input.type = 'text'; input.maxLength = 4; input.placeholder = '例如 1234'; board.appendChild(input);
      var log = el('div', '', 'pk32-card-log'); board.appendChild(log);
      controls.appendChild(button('提交', function () {
        if (ended) return;
        var raw = String(input.value || '').replace(/\D/g, '');
        if (raw.length !== 4 || new Set(raw.split('')).size !== 4) return say('请输入 4 个不重复数字');
        tries += 1;
        var guess = raw.split('').map(Number), exact = 0, misplaced = 0;
        guess.forEach(function (value, index) { if (digits[index] === value) exact += 1; else if (digits.indexOf(value) >= 0) misplaced += 1; });
        best = Math.max(best, exact + misplaced);
        var line = el('div', raw + '：' + exact + ' 个数字位置正确，' + misplaced + ' 个数字但位置不正确');
        log.appendChild(line);
        input.value = '';
        score = Math.max(0, 100 - tries * 5 + exact * 10 + misplaced * 3);
        if (exact === 4) finish('恭喜！您一共点击了 ' + tries + ' 次，最多连续点击 ' + best + ' 次');
        else if (tries >= 12) finish('哈！正确数字是 ' + digits.join(''));
      }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
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
    function halfPoint() {
      var d = deck(), mine = [d.pop(), d.pop()], dealer = [d.pop(), d.pop()];
      function value(c) { return c.r > 10 ? 0.5 : c.r; }
      function total(hand) { return hand.reduce(function (sum, c) { return sum + value(c); }, 0); }
      function show(reveal) {
        board.innerHTML = '';
        board.appendChild(el('div', '你的牌：' + mine.map(label).join(' ') + ' = ' + total(mine)));
        board.appendChild(el('div', '庄家牌：' + (reveal ? dealer.map(label).join(' ') + ' = ' + total(dealer) : label(dealer[0]) + ' ■')));
      }
      function settle() {
        while (total(dealer) < 7 && d.length) dealer.push(d.pop());
        var a = total(mine), b = total(dealer);
        score = a <= 10.5 && (b > 10.5 || a >= b) ? 100 : 0;
        show(true);
        finish(a > 10.5 ? '你爆牌' : b > 10.5 ? '庄家爆牌，你赢了' : a >= b ? '你赢了' : '庄家赢了');
      }
      say('十点半：J/Q/K 算半点，其余按点数；尽量接近 10.5 点，爆牌即输。');
      controls.appendChild(button('要牌', function () { if (ended) return; mine.push(d.pop()); show(false); if (total(mine) > 10.5) settle(); }));
      controls.appendChild(button('停牌', function () { if (!ended) settle(); }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      show(false);
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
    function mindRead() {
      var first = deck().slice(0, 6), second = deck().filter(function (c) { return !first.some(function (x) { return x.s === c.s && x.r === c.r; }); }).slice(0, 5);
      say('读心术：请在心里记住下面任意一张牌，然后点击揭示。');
      first.forEach(function (c) { board.appendChild(cardButton(c, function () {}, false)); });
      controls.appendChild(button('揭示', function () {
        board.innerHTML = '';
        second.forEach(function (c) { board.appendChild(cardButton(c, function () {}, false)); });
        score = 20;
        finish('刚才您记住的牌已经被偷偷拿掉了。');
      }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function battleCard() {
      var d = doubleDeck(), hand = d.splice(0, 5), life = 20, enemy = 24, shield = 0;
      say('百智牌：黑桃进攻，方块防守，红桃加命，梅花攻防，小王翻倍，大王三倍。');
      function power(c) { return c.r >= 14 ? c.r - 12 : Math.min(10, c.r); }
      function draw() {
        renderHand(hand, function (i) {
          var c = hand.splice(i, 1)[0], p = power(c), mult = c.r === 14 ? 2 : c.r === 15 ? 3 : 1;
          if (c.s === 0) enemy -= p * mult;
          else if (c.s === 1) life += Math.ceil(p / 2) * mult;
          else if (c.s === 2) { enemy -= Math.ceil(p / 2) * mult; shield += Math.ceil(p / 2) * mult; }
          else shield += p * mult;
          var hit = Math.max(0, 4 + Math.floor(Math.random() * 5) - shield);
          shield = Math.max(0, shield - 3);
          life -= hit;
          if (d.length) hand.push(d.pop());
          score = Math.max(0, 20 - enemy) + life;
          if (enemy <= 0) return finish('百智牌胜利：敌方生命归零。');
          if (life <= 0) return finish('百智牌失败：生命归零。');
          draw();
        }, function () { return true; });
        board.appendChild(el('div', '你的生命 ' + life + '，敌方生命 ' + enemy + '，防守 ' + shield));
      }
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      draw();
    }
    function ff8Card() {
      var cells = ['R', 'B', 'R', 'B', 'R', 'B', 'R', 'B', 'R'], moves = 0;
      say('FF8卡片：红黑交替移动，把两种颜色转换为一种颜色。');
      function flip(i) { cells[i] = cells[i] === 'R' ? 'B' : 'R'; }
      function draw() {
        board.innerHTML = '';
        cells.forEach(function (value, i) {
          var b = button(value === 'R' ? '红' : '黑', function () {
            flip(i); if (i > 0) flip(i - 1); if (i + 1 < cells.length) flip(i + 1);
            moves += 1; score = Math.max(0, 100 - moves * 5);
            if (cells.every(function (x) { return x === cells[0]; })) return finish('全部转换为一种颜色。');
            draw();
          });
          b.className += ' pk32-card';
          b.dataset.color = value;
          board.appendChild(b);
        });
        board.appendChild(el('div', '步数：' + moves));
      }
      controls.appendChild(button('重开', function () { cells = ['R', 'B', 'R', 'B', 'R', 'B', 'R', 'B', 'R']; moves = 0; draw(); }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      draw();
    }
    function pokerMahjong(stickMode) {
      var d = deck(), hand = d.splice(0, 10), discard = null, turns = 0;
      function counts() { var m = {}; hand.forEach(function (c) { m[c.r] = (m[c.r] || 0) + 1; }); return m; }
      function hasWin() { var m = counts(); return Object.keys(m).some(function (rank) { return m[rank] >= 3; }); }
      function draw() {
        renderHand(hand, function (i) {
          discard = hand.splice(i, 1)[0];
          if (d.length) hand.push(d.pop());
          turns += 1; score = turns * 3;
          if (hasWin()) return finish((stickMode ? '别棍' : '扑克麻将') + '和牌。');
          if (!d.length || turns >= 18) return finish('牌堆用尽，本局平局。');
          draw();
        }, function () { return true; });
        board.appendChild(el('div', (discard ? '上张弃牌：' + label(discard) + '；' : '') + '选择一张打出，摸一张新牌；三张同点数可和牌。'));
      }
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      draw();
    }
    function paiGow() {
      var mine = deck().slice(0, 4), opp = deck().slice(4, 8), chosen = [];
      say('牌九：四张牌分成前后两墩，分别按点数个位比较。');
      renderHand(mine, function (i) {
        if (chosen.indexOf(i) >= 0) return;
        chosen.push(i); board.children[i].classList.add('selected');
        if (chosen.length === 2) settle();
      }, function () { return true; });
      function pairValue(cards) { return cards.reduce(function (sum, c) { return sum + Math.min(c.r, 10); }, 0) % 10; }
      function settle() {
        var a1 = chosen.map(function (i) { return mine[i]; }), a2 = mine.filter(function (_, i) { return chosen.indexOf(i) < 0; });
        var b1 = opp.slice(0, 2), b2 = opp.slice(2);
        var win = (pairValue(a1) >= pairValue(b1) ? 1 : 0) + (pairValue(a2) >= pairValue(b2) ? 1 : 0);
        score = win * 50;
        finish(win === 2 ? '两墩胜。' : win === 1 ? '一胜一负。' : '两墩负。');
      }
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function moveCard() {
      var piles = [deck().slice(0, 5), deck().slice(5, 10), deck().slice(10, 15), deck().slice(15, 20)], foundations = [0, 0, 0, 0];
      say('移动：右键思路转换为按钮操作，把 A 起逐步移到右上角空位。');
      function draw() {
        board.innerHTML = '';
        piles.forEach(function (pile, p) {
          var c = pile[pile.length - 1], text = c ? label(c) : '空列';
          board.appendChild(button(text, function () {
            if (!c) return;
            if (c.r === foundations[c.s] + 1) { foundations[c.s] = c.r; pile.pop(); score += 5; }
            else say('只能把同花色下一张移到右上角空位。');
            if (foundations.every(function (v) { return v >= 5; })) return finish('右上角空位整理完成。');
            draw();
          }));
        });
        board.appendChild(el('div', '右上角：' + foundations.map(function (v, s) { return ['♠', '♥', '♣', '♦'][s] + v; }).join(' ')));
      }
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      draw();
    }
    function duelCard(teamSize) {
      var d = deck(), mine = d.splice(0, teamSize), opp = d.splice(0, teamSize), round = 0, wins = 0;
      say((teamSize === 3 ? '三打三' : '争夺') + '：逐张派牌，比点数争夺本轮。');
      function draw() {
        renderHand(mine, function (i) {
          var a = mine.splice(i, 1)[0], b = opp.shift();
          if ((a.r === 1 ? 14 : a.r) >= (b.r === 1 ? 14 : b.r)) wins += 1;
          round += 1; score = wins * 30;
          if (!mine.length) return finish('争夺结束：胜 ' + wins + ' / ' + teamSize + ' 轮。');
          draw();
        }, function () { return true; });
        board.appendChild(el('div', '剩余对手牌：' + opp.length + '；已胜 ' + wins + ' 轮。'));
      }
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      draw();
    }
    function wildCard() {
      var hand = deck().slice(0, 5), wild = 1 + Math.floor(Math.random() * 13);
      say('变幻牌：本局变幻点数为 ' + wild + '，可当任意点数组成对子或三条。');
      renderHand(hand, function () {}, function () { return true; });
      controls.appendChild(button('结算', function () {
        var counts = {}, wilds = 0;
        hand.forEach(function (c) { if (c.r === wild) wilds += 1; else counts[c.r] = (counts[c.r] || 0) + 1; });
        var best = Math.max.apply(null, [wilds].concat(Object.keys(counts).map(function (r) { return counts[r] + wilds; })));
        score = best >= 3 ? 100 : best >= 2 ? 50 : 10;
        finish(best >= 3 ? '变幻组三条。' : best >= 2 ? '变幻组成对子。' : '没有成组。');
      }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function cannonCard() {
      var mine = deck().slice(0, 6), enemy = deck().slice(6, 12), shots = 0;
      say('炮牌：上方六张为电脑，下方六张为玩家，选择下方牌炮击同列电脑牌。');
      function draw() {
        board.innerHTML = '';
        enemy.forEach(function (c) { board.appendChild(cardButton(c, function () {}, !c)); });
        mine.forEach(function (c, i) {
          board.appendChild(cardButton(c, function () {
            if (!c || !enemy[i]) return;
            shots += 1;
            if ((c.r === 1 ? 14 : c.r) >= (enemy[i].r === 1 ? 14 : enemy[i].r)) { enemy[i] = null; score += 15; }
            else mine[i] = null;
            if (!enemy.some(Boolean)) return finish('电脑六张牌全部被炮掉。');
            if (!mine.some(Boolean) || shots >= 10) return finish('炮牌本局结束。');
            draw();
          }, false));
        });
      }
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      draw();
    }
    function magicArray() {
      var nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]), placed = [];
      say('纸牌魔法阵：依次放入九张点数牌，使每条线尽量接近 15。');
      function total(a, b, c) { return (placed[a] || 0) + (placed[b] || 0) + (placed[c] || 0); }
      nums.forEach(function (n) { controls.appendChild(button(String(n), function () { if (placed.length < 9) { placed.push(n); draw(); } })); });
      function draw() {
        board.innerHTML = '';
        for (var i = 0; i < 9; i++) board.appendChild(el('button', placed[i] || '·', 'btn ghost pk32-card'));
        if (placed.length === 9) {
          var lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
          var ok = lines.filter(function (line) { return total(line[0], line[1], line[2]) === 15; }).length;
          score = ok * 15; finish('魔法阵完成：' + ok + ' 条线等于 15。');
        }
      }
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
      draw();
    }
    function flushRound() {
      var hand = deck().slice(0, 7), chosen = [];
      say('同花：从七张牌中挑出五张同花牌。');
      renderHand(hand, function (i) {
        var at = chosen.indexOf(i);
        if (at >= 0) chosen.splice(at, 1); else if (chosen.length < 5) chosen.push(i);
        board.children[i].classList.toggle('selected');
      }, function () { return true; });
      controls.appendChild(button('提交', function () {
        if (chosen.length !== 5) return say('请选择五张牌。');
        var suit = hand[chosen[0]].s, ok = chosen.every(function (i) { return hand[i].s === suit; });
        score = ok ? 100 : 0; finish(ok ? '同花成立。' : '不是同一花色。');
      }));
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function pickCard() {
      var cards = deck().slice(0, 12), target = cards[Math.floor(Math.random() * cards.length)];
      say('挑选：找出目标牌 ' + label(target));
      cards.forEach(function (c) { board.appendChild(cardButton(c, function () { score = c.s === target.s && c.r === target.r ? 100 : 0; finish(score ? '挑选正确。' : '挑选错误，目标是 ' + label(target)); }, false)); });
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function hiddenCard() {
      var values = shuffle([1, 1, 7, 7, 10, 10, 13, 13]), open = [], matched = 0;
      say('暗牌：翻开两张同点数暗牌即可消去。');
      values.forEach(function (_, i) { board.appendChild(cardButton({ r: '?', s: 0 }, function () {
        if (ended || open.indexOf(i) >= 0 || values[i] == null) return;
        board.children[i].textContent = String(values[i]); open.push(i);
        if (open.length === 2) {
          if (values[open[0]] === values[open[1]]) { values[open[0]] = null; values[open[1]] = null; matched += 2; score += 10; open = []; if (matched === values.length) finish('暗牌全部配对。'); }
          else { var pair = open.slice(); open = []; timers.push(setTimeout(function () { pair.forEach(function (n) { if (board.children[n]) board.children[n].textContent = '■'; }); }, 450)); }
        }
      }, true)); });
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function luckyDraw() {
      var d = deck(), card = null;
      say('幸运：先选择押注，再抽一张牌结算。');
      ['红色', '黑色', '大牌', '小牌'].forEach(function (choice) {
        controls.appendChild(button(choice, function () {
          if (ended) return;
          card = d.pop(); board.textContent = '抽到：' + label(card);
          var red = card.s === 1 || card.s === 3, big = card.r === 1 || card.r >= 8;
          var ok = choice === '红色' ? red : choice === '黑色' ? !red : choice === '大牌' ? big : !big;
          score = ok ? 100 : 0; finish(ok ? '押中。' : '未押中。');
        }));
      });
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function tarot() {
      var cards = [
        ['愚者', '新的开始、冒险和自由'], ['魔术师', '行动力、创造和掌控'], ['女祭司', '直觉、秘密和等待'], ['皇后', '丰饶、照顾和成长'],
        ['皇帝', '秩序、责任和权威'], ['教皇', '传统、学习和指引'], ['恋人', '选择、关系和结合'], ['战车', '胜利、意志和推进'],
        ['力量', '勇气、耐心和内在力量'], ['隐者', '思考、寻找和独处'], ['命运之轮', '转折、机会和循环'], ['正义', '判断、平衡和因果'],
        ['倒吊人', '暂停、牺牲和换位思考'], ['死神', '结束、改变和重生'], ['节制', '协调、节制和疗愈'], ['恶魔', '欲望、束缚和诱惑'],
        ['塔', '突变、崩塌和清醒'], ['星星', '希望、疗愈和远景'], ['月亮', '迷雾、梦境和不安'], ['太阳', '喜悦、清晰和成功'],
        ['审判', '召唤、复盘和觉醒'], ['世界', '完成、整合和圆满']
      ];
      say('塔罗牌：选择下面的塔罗牌查看名称和本意。');
      cards.forEach(function (item) {
        board.appendChild(button(item[0], function () {
          board.innerHTML = '';
          board.appendChild(el('div', item[0] + '：' + item[1]));
          score = 10;
          finish('塔罗牌解读完成。');
        }));
      });
      controls.appendChild(button('结束本局', function () { finish('主动结束'); }));
    }
    function fortune() { var cards = ['太阳', '月亮', '星星', '命运之轮', '力量']; say('点击抽取一张牌'); controls.appendChild(button('抽牌', function () { var c = cards[Math.floor(Math.random() * cards.length)]; board.textContent = c; score = 10; finish('抽到：' + c); })); controls.appendChild(button('结束本局', function () { finish('主动结束'); })); }
    controls.appendChild(button('重开', reset)); reset();
    return { config: config, restart: reset, end: function () { finish('主动结束'); }, getScore: function () { return score; }, destroy: function () { stopped = true; timers.forEach(clearTimeout); timers = []; container.innerHTML = ''; }, isStopped: function () { return stopped; } };
  }

  global.PK32Card = { names: names, configs: configs, get: function (name) { return configs[name] || null; }, list: function () { return names.map(function (name) { return configs[name]; }); }, startGame: startGame };
})(window);
