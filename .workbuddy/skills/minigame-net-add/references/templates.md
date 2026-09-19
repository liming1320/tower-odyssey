# 联机小游戏代码模板（tower-odyssey / MG.pvp）

下列三个骨架对应已落地的真实游戏：`tankpvp.js`（实时回声）、`snakepvp.js`（同盘广播）、`maze-coop.js`（种子协作）。
复制后把 `<id>` 换成游戏名，按注释填状态字段即可。

---

## 通用头（三个范式共用）

```js
window.MiniGames = window.MiniGames || {};
MiniGames.<id> = {
  id: '<id>', name: '显示名', cat: 'fc' /* 或 puzzle */, icon: '🎯',
  start(container) { startNet(container); },
  // 单人/PvE 不被强制——非联网时给专属提示后 return
};

let canvas, ctx, net, mySide, opp = null, over = false;
function startNet(container) {
  net = MG.pvp.shouldBegin('<id>');
  if (!net) { container.innerHTML = '🎯 <显示名> 为联机对战专属…请从小游戏列表🌐联网对战分类进入'; return; }
  // canvas 初始化 ...
  const A = MG.pvp.arm('<id>', /*side*/0, /*opp*/null, { race: true });
  MG.pvp.begin({ setState: applyRemote, onOver(r) { finish(!!r); } });
  // 房主生成并广播初始态（begin 之后！）
  if (MG.pvp.side === 0) MG.pvp.commit(/* 首包 */);
  draw();
  // 非联网不进入；opt-in 完成
}
function finish(win) { over = true; /* 展示结果，不再 commit */ }
function applyRemote(m) { /* 取反映射：见下方各范式 over 处理 */ }
```

---

## 范式 A：实时回声同步（坦克类——每帧广播自身，命中由拥有者发）

适用：双方各自状态独立、需要"你打我我扣血"的实时对抗。

```js
function sendNet() {
  if (over) return;
  MG.pvp.commit({ tk: { x: me.x, y: me.y, dir: me.dir, lives: me.lives, shield: me.shield },
                  b: myBullets.filter(b => !b.dead).map(b => ({ x: b.x, y: b.y, dx: b.dx, dy: b.dy })),
                  hit: 0 });
}
function fire() { /* 生成子弹，0.35s CD */ myBullets.push({...}); }
function loop() { // rAF 驱动
  // 移动 me；子弹前进；己方子弹命中墙/砖；命中对手且 opp.lives>0 → 由拥有者广播：
  if (hitOpponent) MG.pvp.commit({ tk:{...}, b:[...], hit: 1 });
  sendNet();
  if (me.lives <= 0) { MG.pvp.commit({ tk:{...lives:0}, b:[], hit:0, over: 0 }); finish(false); }
}
function applyRemote(m) {
  opp = m.tk; oppBullets = m.b || [];
  if (m.hit) { me.lives--; /* 去重：consumed set 防重放 */ if (me.lives<=0) finish(false); }
  if (m.over !== undefined) finish(m.over === 0 ? true : m.over === 1 ? false : false); // 取反映射
}
```

---

## 范式 B：同盘状态广播（蛇类——共享一个棋盘，房主首发共享元素）

适用：双方在同一棋盘上、状态强一致（食物位置、蛇身）。

```js
function step() {
  if (over) return;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  let dead = false, tied = false; // ⚠️ 局部变量别叫 draw（会遮蔽 draw()）
  if (head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS) dead = true;
  else if (snake.some(s=>s.x===head.x&&s.y===head.y)) dead = true;
  else if (opp.snake.some(s=>s.x===head.x&&s.y===head.y)) dead = true;
  if (!dead && opp.snake[0] && opp.snake[0].x===head.x && opp.snake[0].y===head.y) { dead = true; tied = true; }
  if (dead) { over = true; MG.pvp.commit({ snake, score, food, over: tied ? 2 : 0 }); finish(tied ? 2 : 0); return; }
  // 吃食物 / 前进 / 广播
  MG.pvp.commit({ snake, score, food });
}
function applyRemote(m) {
  opp.snake = m.snake; opp.score = m.score;
  if (m.food) food = m.food; // 吃到方广播新位置，双端一致
  if (m.over !== undefined) finish(m.over === 0 ? 1 : m.over === 1 ? 0 : 2); // 取反映射
}
// 房主首发：begin 后 if(mySide===0) MG.pvp.commit({ snake, score:0, food });
```

---

## 范式 C：种子协作（迷宫类——房主 seed 建图，双端一致重建）

适用：双人协作闯关，需要完全相同的关卡布局 + 收集/陷阱状态共享。

```js
function startNet(container) {
  net = MG.pvp.shouldBegin('maze-coop');
  if (!net) { container.innerHTML = '🤝 双人迷宫闯关为联机协作专属…'; return; }
  // canvas 初始化 ...
  MG.pvp.begin({ setState: applyRemote, onOver(r){ finish(!!r); } });
  // ⚠️ seed 必须在 begin 之后广播（commit 在 !active 早退）
  if (MG.pvp.side === 0) {
    seedVal = (Math.floor(Math.random()*1e9)>>>0) || 1;
    L = buildLevel(seedVal);
    pos = L.start0; oppPos = L.start1;
    // 首包即通过 applyRemote 下发 seed，不要单独 sendNet({}) 在 begin 前
  }
  draw();
}
function move(dx, dy) {
  if (over) return;
  const nx = pos.x+dx, ny = pos.y+dy;
  if (L.m[ny][nx] === 1) return; // 撞墙拦截
  pos = { x: nx, y: ny };
  if (L.m[ny][nx] === 3) { keys.add(L.keyAt(nx,ny)); sendNet({ key: ki }); } // 捡钥匙
  if (L.m[ny][nx] === 4) { finish(false); sendNet({ over: 0 }); return; }   // 踩陷阱🔥 双双失败
  if (allKeys() && L.m[ny][nx] === 2 && oppAtExit) { finish(true); sendNet({ over: 1 }); return; } // 同达终点
  sendNet({ pos });
}
function applyRemote(m) {
  if (m.seed && !L) { L = buildLevel(m.seed); /* 重建 */ }
  if (m.key) keys.add(m.key);
  if (m.pos) oppPos = m.pos;
  if (m.over !== undefined) finish(m.over === 1); // 发送方 over:1=发送方胜→我负
}
```

---

## 菜单注册片段（minigames.js）

```js
// GAMES 末尾
sc('<id>', '显示名', '联机对战 · 一句话描述', '<icon>', 'fc' /* 或 puzzle */);
// NET_GAMES
'<id>': { seats: 2, race: true },
// NET_WIRED
'<id>': 1,
// CAT_OF：对打 → fc 数组；协作/竞速 → puzzle 数组
```

## index.html

```html
<script src="js/minigames/<id>.js?v=2026XXXXc"></script>
<!-- 并把 views/minigames.js 的 ?v= 戳 bump 一档 -->
```
