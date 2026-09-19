---
name: minigame-net-add
description: >-
  This skill should be used when adding a new networked (online PvP / co-op) minigame to the
  tower-odyssey game collection, OR when the user asks for more联网对战/双人闯关/对打小游戏.
  It encodes the MG.pvp state-sync contract, the three proven sync patterns (real-time echo,
  shared-board broadcast, seed-built co-op), the menu/router registration, and the真 ws 中继
  regression harness (tools/verify-net-new.js + the 8-suite verify-net-gate.js). Use it to avoid
  re-deriving the opt-in net-game wiring and the two known footguns (seed-before-begin, draw-shadowing).
agent_created: true
---

# 新增联机小游戏（tower-odyssey）

## Overview

为 tower-odyssey 小游戏集合新增一款**联网**小游戏（对打 / 竞速 / 双人协作），复用已有的 `MG.pvp`
状态同步引擎与 `ws-relay` 中继。所有新增联机必须 **opt-in**：单人/PvE 进入时给明确提示，不影响原行为。
完整代码模板见 `references/templates.md`。

## 铁律（继承自项目约定）

- **禁止触碰**：`pinball.js`、`pk32*` 系列文件。
- `MG.pvp.side` 只有在 `MG.pvp.begin()` 调用后才赋值；读 side 必须在 `setState`/`onOver` 回调内部。
- `setState` 内**切勿重新赋值 `const` 棋盘**（会抛 TypeError 被 `try/catch` 静默吞掉 → 看不到对手）。
- 终局防回环：收到对手 `over` 只做**展示**，本地判定才 `commit`。

## 状态同步契约（MG.pvp）

- 进入：`const net = MG.pvp.shouldBegin('game-id')`；falsy ⇒ 非联网，渲染专属提示并 return。
- 注册：`MG.pvp.begin({ setState: applyRemote, onOver(r){ finish(!!r); } })`。
- 广播：`MG.pvp.commit(state)`（每帧/每步）；`!active` 时早退——**必须在 begin 之后才发首包**。
- 对手消息：经 `setState(m)` 进入；`m` 即对方 `commit` 的对象。
- **结果语义（取反映射）**：约定 `over` 表示**发送方**视角——`0`=发送方负/`1`=发送方胜/`2`=平局。
  接收方：`finish(m.over===0?1 : m.over===1?0 : 2)`。
- `race` 模式：`NET_GAMES[id].race=true` ⇒ `_launchNet` 透传 `arm({race:true})` ⇒ `canMove()` 恒 true（实时/竞速不锁回合）。

## 三步落地

1. **游戏文件** `public/js/minigames/<id>.js`
   - `start(container)` 内 `net = MG.pvp.shouldBegin('<id>')`；房主负责生成并广播初始状态（食物/种子/牌阵）。
   - 实时类（坦克）每帧 `commit({自身状态, hit:0})`；命中由**拥有者**发 `hit:1`，对手本地扣血并去重。
   - 同盘类（蛇）房主首 `commit` 下发共享元素（食物+蛇身）；撞墙/自身/对手身体即亡，头对头同归 `draw=2`。
   - 协作类（迷宫）房主 `Math.random` 出 `seed`→`buildLevel(seed)`，`commit` 下发 seed（**begin 之后**），双端一致重建。
   - 非联网：`container.innerHTML = '🎯 <name> 为联机对战专属…请从小游戏列表🌐联网对战分类进入'`。
   - 暴露测试钩子 `window.__<id> = { ... }` 供回归脚本驱动。
2. **菜单/路由注册** `public/js/views/minigames.js`
   - `GAMES` 末尾加卡 `sc('<id>','显示名','联机…描述',...)`.
   - `NET_GAMES` 加 `'<id>': { seats: 2, race: true }`.
   - `NET_WIRED` 加 `'<id>': 1`.
   - `CAT_OF`：对打进 `fc` 数组，协作/竞速进 `puzzle` 数组。
3. **index.html 接入** `public/index.html`
   - 在既有 `<script src=".../tank.js?v=...">` 后追加 `<script src="js/minigames/<id>.js?v=2026XXXXc"></script>`。
   - 把 `views/minigames.js` 的缓存戳 `?v=...` bump 一档（如 `20260919c`→下一档）。

## 两类必踩的真实 bug（务必规避）

1. **seed 在 begin 之前广播**：`commit` 在 `!active` 早退，队友永远拿不到种子/初始态。
   修复：把首包（种子/食物/牌阵）的 `commit/sendNet` 放到 `begin()` 之后，或在 `setState` 首包里带。
2. **局部变量遮蔽 `draw()` 渲染函数**：`step()` 里 `let draw = false` 会遮蔽同名渲染函数 → 每步抛
   "draw is not a function"。修复：重命名局部变量（如 `tied`/`isDraw`）。

## 回归测试（无浏览器、真 ws 中继）

- `tools/verify-net-new.js`：vm 隔离上下文加载 `mg-net + mg-pvp + 游戏文件`，`WebSocket` 用 `require('ws')`，
  `attach(server)` 起真中继，`pair()` 走 lobby→create→join 凑满座，断言 `commit` 经中继到达对手 `setState`。
  新增游戏时复制一个 `case`：`armAndStart(url,'<id>',A,B)` → 断言首包同步 + 一次状态同步。
  sandbox 需打桩：`addEventListener/removeEventListener: ()=>{}`、`requestAnimationFrame: f=>setTimeout(()=>f(Date.now()),33)`、
  `MG.canvas` 返回 `{c,ctx:Proxy,w,h,destroy}`、`window` 指向 sandbox。
- `tools/verify-net-gate.js`：串行跑 8 套（reconnect/4p/persist/seq/spectate/heartbeat/net-games/**net-new**），
  任一非 0 → 整体 exit 1，`deploy.sh` Phase 2.6 在重启前跑，失败回滚。**新增游戏后把 `<id>` 用例加进 net-new 并确认 SUITES 含 'net-new'**。

## 验收

本地 `node tools/verify-net-new.js` 该游戏全绿；`node tools/verify-net-gate.js` 全 8 套绿；
提交后 push 触发 webhook 自动部署；线上 `curl` 根路径与 `/js/minigames/<id>.js?v=...` 均 200（注意服务器静态根是 `public/`，直连 `/public/...` 会 404，正确路径是 `/js/...`）。
