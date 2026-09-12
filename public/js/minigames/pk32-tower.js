(function (global) {
  'use strict';

  var MAPS = [
    '03040404041204040404030304040404020404040403030404040400040404040303040404040004040404030304040404000404040403030404040400040404040303030404040004040403030303030303060303030303050305030072000305030505050505050105050505050505050505000505050505',
    '12021639383900000000000303030303030303030300200045060003201620030016453003000320162003000306030300030303400300164600030006523942030034001703000303030303000306030300000000000000004600030308030303060320211603180100031649172025160300110003161616',
    '11030065000330341618030103340321033034161703000316031603303416640300031603160303030306030003000300000006000003000306030306030306030300100000000003006400030003060303070309030903000316032120030003000302031603212003000300031203300321200374037503',
    '31381603131415030303033816000300000003004200164500030306030300030003060303004500031603380000000303030003160342390300423842000316033839030303030300000003000000000000030306030300030303034203380038030003000000000334421603021101030303033021160312',
    '00400003007300030040000603060300000003060306000300030309030300030000034503434443034503004203200334433403200342420320030308030320034238032003495649032003380003000330493003000300000300030307030300030002030003160016030003011203004000000040000311',
    '19032003215200005216170003300352000000005216430300034600030306030300065203354603004946754303000303030300000046300300000042450000000034030340030303030000000074034003000000495600030303420306030703060301000300034203340602031100420000000316031203',
    '23470334031641290321214716033003001641035121164407000744001603005100000356030000000350000303030803030303030603000053001616160053000000030303030303030303030003430643000000000003000306030603030303070300034303020003030001030000000312000606001103',
    '12020000000000000303030303004403070347000303030044340355033047000300000303030903030300000000075509280955070000000303030309030303030000032030035503342003000003162003070320160300000303171721171703030000000303030803030300000300000611010006000003',
    '11030000000003001647000103000303060306030300000300030000070000033000030003600303034303404303000320031202000340440334032003030303030043034003000000030044000003400303035603060303000300470003470300000000030303060300030303000000600000030041554100',
    '27160003030300000003001600500600000003000647030603030003030300031600000003000301000003160000000800031103000320030703030003030300030334613003600312030003200306030300000206000316472047030307030300031617472003516051030006473217470621512103000300',
    '00030334500350300303000000030306030603030051000000000003000000512100030003030303030003034303000016161600000316440300030303030603031643030009011103000644000003030303030306030300000320343003004400031602032034300860036003161203203430031703170320',
    '20031603170318032136212003160317031803565656200316031703180300560006030603060306030307030000000000030000000000060303070303030703030634030057216221570003303403500303030303500330340350031314150350033003030803200020030803031101000000000000000212',
    '75340300646564000321263000030003060300030021000003000365030003000000620300031603000366006259030003160300035466030703000320030003070300000000032003000000000303030003030300030303346206575758575706623003030303030703030303031202000000000000000111',
    '00620000000000030059000003030303030603000300000300005700000300030021030803030300030003006403000059035703300300650300480903580330030064035909740357033003340003030303030003000334006400030000005900033403030003210303030303001101000702120324480600',
    '03006619120200000000030300210303030303210003030003030303030303000303000303032203030300030300030303090303030003030020030359030320000303000404034803040400030300040403590304040003030004040307030404000303575857070107575857030303030303110303030303',
    '00000001110412020000000004040404040404040400000404030303030304040000040303740375030304000004030334033403030400000403033003300303040000040403000300030404000004040306030603040400000404040000000404040000040404040804040404000000000000000000000000',
    '04040404040111040404040404040404000404040404040404040400040404040404040404030803040404040404040303000303040404040404030367030304040404040403030203030404040404040303120303040404040404040303030404040404040404040404040404040404040404040404040404',
    '04664800000000000000660448040404040404040400040004660000000000006604000400040404040404040400040004660000006604040004660000040404000404000404040404660066040448040404110400040404046648006301046600006604040404040404040404001202630000000000000066',
    '04040404040404040404040404040404040404040404040404040404040404040404040404030303040404040404040303710303040404040404030309030304040404040403030803030404040404040403080304040404040404040404040404040404040404040404040404041101000000000000000000',
    '00000000000000000000000004000404040404000400000400040404040400040000040004041204040004000004000404020404000400000468040400040468040000040904046904040904000004330404000404370400000404040400040404040000040404040004040404000000000000000000000111',
    '63305520481848205530632104160417041704160421043455006600660055340420041604001100041604204817660000010000661748180400040004000400041848176600000200006617482004160400120004160420043455006600660055340421041604170417041604216330552048184820553063',
    '04040404040404040404040404007104700473000404040000040454040400000404000000045404000000040404000000000000000404040400000001000000040404040400000400000404040404040410111004040404040404040404040404040404040404040404040404040404040404040404040404'
  ];
  var WIDTH = 11;
  var HEIGHT = 11;
  var SAVE_KEY = 'pk32-tower-save-v1';
  var WALLS = { '03': 1, '04': 1, '40': 1, '66': 1 };
  var COLORS = { floor: '#f4ead0', wall: '#39434f', door: '#a64b37', key: '#e3b341', enemy: '#713c74', exit: '#2d8c72', player: '#2374a8' };

  function codeAt(map, x, y) { return map.slice((y * WIDTH + x) * 2, (y * WIDTH + x + 1) * 2); }
  function isWall(code) { return !!WALLS[code]; }
  function isDoor(code) { return code === '12' || code === '16' || code === '17' || code === '18'; }
  function isKey(code) { return code === '20' || code === '21' || code === '22' || code === '23'; }
  function isEnemy(code) { var n = parseInt(code, 10); return n >= 30 && n < 90 && code !== '40' && code !== '66'; }
  function makeLayer(map, index) {
    var cells = [];
    for (var i = 0; i < WIDTH * HEIGHT; i += 1) cells.push(map.slice(i * 2, i * 2 + 2));
    var start = cells.indexOf('11');
    if (start < 0) start = cells.indexOf('01');
    if (start < 0) start = WIDTH * (HEIGHT - 2) + 1;
    return { index: index, cells: cells, start: { x: start % WIDTH, y: Math.floor(start / WIDTH) } };
  }
  var LAYERS = MAPS.map(makeLayer);

  function cloneState(layerIndex) {
    var layer = LAYERS[layerIndex];
    return { layer: layerIndex, x: layer.start.x, y: layer.start.y, hp: 100, attack: 10, defense: 5, gold: 0, keys: { red: 0, blue: 0, yellow: 0 }, defeated: {}, won: false, lost: false };
  }
  function Tower(container, opts) {
    opts = opts || {};
    this.container = container;
    this.state = cloneState(Math.max(0, Math.min(LAYERS.length - 1, Number(opts.layer) || 0)));
    this.handlers = [];
    this.render();
  }
  Tower.prototype.on = function (el, type, fn) { el.addEventListener(type, fn); this.handlers.push([el, type, fn]); };
  Tower.prototype.save = function () { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); this.note('已保存当前楼层和状态'); } catch (e) { this.note('存档不可用'); } };
  Tower.prototype.load = function () { try { var s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (!s || s.layer < 0 || s.layer >= LAYERS.length || s.x < 0 || s.x >= WIDTH || s.y < 0 || s.y >= HEIGHT || !s.keys || typeof s.keys.red !== 'number' || typeof s.keys.blue !== 'number' || typeof s.keys.yellow !== 'number' || !s.defeated || typeof s.defeated !== 'object') throw new Error('invalid save'); this.state = s; this.render(); this.note('已读取存档'); } catch (e) { this.note('存档无效或不可用'); } };
  Tower.prototype.restart = function () { this.state = cloneState(this.state.layer); this.render(); };
  Tower.prototype.note = function (message) { var el = this.container.querySelector('[data-role=message]'); if (el) el.textContent = message; };
  Tower.prototype.move = function (dx, dy) {
    if (this.state.won || this.state.lost) return;
    var nx = this.state.x + dx, ny = this.state.y + dy;
    if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) return;
    var i = ny * WIDTH + nx, code = LAYERS[this.state.layer].cells[i];
    if (isWall(code)) return this.note('墙壁无法通过');
    if (isDoor(code)) { var color = code === '12' ? 'red' : code === '16' ? 'blue' : 'yellow'; if (!this.state.keys[color]) return this.note('需要' + color + '钥匙'); this.state.keys[color] -= 1; }
    if (isEnemy(code) && !this.state.defeated[i]) { var power = Math.max(1, parseInt(code, 10) - 25); this.state.hp -= Math.max(1, power - this.state.defense); if (this.state.hp <= 0) { this.state.lost = true; this.note('战斗失败，请重开'); this.render(); return; } this.state.gold += power; this.state.defeated[i] = true; }
    if (isKey(code)) { var key = code === '20' ? 'red' : code === '21' ? 'blue' : 'yellow'; this.state.keys[key] += 1; this.state.gold += 5; }
    this.state.x = nx; this.state.y = ny;
    if (code === '72' || (this.state.layer === LAYERS.length - 1 && nx === WIDTH - 2 && ny === 1)) { if (this.state.layer < LAYERS.length - 1) { this.state.layer += 1; var next = LAYERS[this.state.layer].start; this.state.x = next.x; this.state.y = next.y; this.note('进入第' + (this.state.layer + 1) + '层'); } else { this.state.won = true; this.note('恭喜通关 PK32 魔塔'); } }
    this.render();
  };
  Tower.prototype.render = function () {
    var self = this, layer = LAYERS[this.state.layer];
    this.handlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2]); }); this.handlers = []; this.keyBound = false;
    this.container.innerHTML = '<div data-role="pk32-tower" style="font-family:system-ui;max-width:760px;margin:auto;color:#20252b"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><strong>PK32 魔塔原版迁移</strong><label>地图 <select data-role="layer"></select></label><button data-role="restart">重开</button><button data-role="save">存档</button><button data-role="load">读档</button></div><div data-role="message" style="min-height:28px;padding:8px 0">第' + (this.state.layer + 1) + '层</div><div data-role="stats"></div><div data-role="grid" style="display:grid;grid-template-columns:repeat(11,minmax(28px,1fr));gap:1px;max-width:420px;touch-action:none"></div><div style="display:flex;justify-content:center;gap:8px;margin-top:10px"><button data-dir="up">上</button><button data-dir="left">左</button><button data-dir="down">下</button><button data-dir="right">右</button></div></div>';
    var select = this.container.querySelector('[data-role=layer]'); LAYERS.forEach(function (_, i) { var o = document.createElement('option'); o.value = i; o.textContent = '第' + (i + 1) + '层'; o.selected = i === self.state.layer; select.appendChild(o); });
    var grid = this.container.querySelector('[data-role=grid]'); layer.cells.forEach(function (code, i) { var b = document.createElement('button'), x = i % WIDTH, y = Math.floor(i / WIDTH), text = code; b.type = 'button'; b.title = '编码 ' + code; b.style.cssText = 'aspect-ratio:1;border:0;padding:0;font-size:10px;background:' + (isWall(code) ? COLORS.wall : isDoor(code) ? COLORS.door : isKey(code) ? COLORS.key : isEnemy(code) && !self.state.defeated[i] ? COLORS.enemy : code === '72' ? COLORS.exit : COLORS.floor) + ';color:' + (isWall(code) || isEnemy(code) ? '#fff' : '#20252b'); if (self.state.x === x && self.state.y === y) { text = '◆'; b.style.background = COLORS.player; b.style.color = '#fff'; } else if (self.state.defeated[i]) text = '·'; else if (isKey(code)) text = '钥'; else if (isEnemy(code)) text = '敌'; else if (code === '72') text = '门'; b.textContent = text; self.on(b, 'click', function () { if (Math.abs(self.state.x - x) + Math.abs(self.state.y - y) === 1) self.move(x - self.state.x, y - self.state.y); }); grid.appendChild(b); });
    this.container.querySelector('[data-role=stats]').textContent = '生命 ' + this.state.hp + '　攻击 ' + this.state.attack + '　防御 ' + this.state.defense + '　金币 ' + this.state.gold + '　钥匙：红 ' + this.state.keys.red + ' 蓝 ' + this.state.keys.blue + ' 黄 ' + this.state.keys.yellow;
    this.on(select, 'change', function () { self.state = cloneState(Number(select.value)); self.render(); }); this.on(this.container.querySelector('[data-role=restart]'), 'click', function () { self.restart(); }); this.on(this.container.querySelector('[data-role=save]'), 'click', function () { self.save(); }); this.on(this.container.querySelector('[data-role=load]'), 'click', function () { self.load(); });
    [['up', 0, -1], ['left', -1, 0], ['down', 0, 1], ['right', 1, 0]].forEach(function (d) { self.on(self.container.querySelector('[data-dir=' + d[0] + ']'), 'click', function () { self.move(d[1], d[2]); }); });
    if (!this.keyBound) { this.keyBound = true; this.on(this.container, 'keydown', function (e) { var k = { ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0], w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] }[e.key]; if (k) { e.preventDefault(); self.move(k[0], k[1]); } }); } this.container.tabIndex = 0;
  };
  Tower.prototype.destroy = function () { this.handlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2]); }); this.container.innerHTML = ''; };
  global.PK32Tower = { maps: MAPS, layers: LAYERS, startUI: function (container, opts) { return new Tower(container, opts); }, create: function (opts) { return new Tower(opts.container, opts); } };
}(window));
