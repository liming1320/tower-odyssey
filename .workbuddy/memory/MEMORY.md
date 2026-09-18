# tower-odyssey 长期项目记忆

## 联机 PvP（MG.pvp）接入铁律
- `MG.pvp.side` **只有在 `MG.pvp.begin()` 调用后才被赋值**（来自 `_armed.side`）；begin 之前恒为 0。
- 任何游戏在 `start()` / 游戏初始化里读 `MG.pvp.side` 来算 `me`/`myColor`/`S._my`/`first` 时，
  **必须先调用 `MG.pvp.begin({setState, onOver})`**，否则 side 1（后手）方会全部按 side 0 计算 → 后手无法落子。
- 正确范式（参考 gomoku）：在 `setState`/`commit`/`onOver` 等**回调内部**读取 `MG.pvp.side`
  （回调在收到消息时才执行，此时 begin 早已完成）。
- 已踩坑并修复：`banqi` / `xiangqi` / `jungle` / `mg-chess`(chess+junqi) 原先都在 begin 之前读 side。
- 终局防回环：收到对手 `over` 时只做**展示**（`showResult`），绝不再 `commit`；本地判定才 `commit`。
- **`setState` 里切勿重新赋值 `const` 棋盘/状态**：`MG.pvp._recv` 把 `setState` 包在 `try/catch` 里，
  重赋值 `const` 会抛 `TypeError` 被**静默吞掉** → 对手落子永远进不了本地棋盘（症状：两方各下各的、
  互相看不到对方棋子、还能下同一位置）。gomoku 曾因此炸（board 是 const，`setState` 里 `board = m.board`）。
  **正确做法**：要么 `board` 声明为 `let`（xiangqi/banqi 已如此），要么在 `setState` 原地拷贝
  （gomoku 修法：`for(... ) board[i][j] = m.board[i][j]`），要么 `Object.assign(S, m)`（monopoly/richman/ludo）。

## 工程约束（来自用户/项目）
- `pinball.js` 严禁修改；`pk32*` 系列排除；`arcade.js`/`emulator.js` 封装层与 `optimized/` 死代码跳过。
- 新联机代码全部 opt-in，单人/PvE 行为不变。
- 测试机无 Chrome，无法跑 124 游戏 CDP 全量冒烟；可用 `tools/verify-banqi-pvp.js`
  （双客户端 + DOM 桩 + 内存 relay，纯 Node 跑真实 banqi.js）做无浏览器回归。

## 联机中继（ws-relay）部署铁律
- `server/ws-relay.js` 依赖 `ws` 模块；`server.js` 用 `try{require('./server/ws-relay')}catch` 包住，`WsRelay` 为 null 时不挂中继（静默降级，主服务照常）。
- **`package.json` 必须声明 `"ws":"^8.18.0"`**（dependencies 不能为空），否则线上 `npm install` 不装 ws → 中继永远不挂 → WS 升级握手 6 秒零响应、浏览器「待处理→超时」。
- 线上部署三步缺一不可：`git pull` + **`npm install`**（让 ws 进 node_modules）+ 重启（宝塔 `systemctl restart tower-odyssey`）；随 push 自动部署时确认流水线含 npm install。重启后浏览器 Ctrl+F5 强刷（吃 mg-net.js 的 `?v`）。
- 客户端 mg-net.js：`connect()` 必须等 `onopen` 再发 join（`_pending` 队列排队冲刷），且加 8s 升级超时明确报错；否则 join 在 CONNECTING 被静默丢弃、三条入口全废。

## server.js 模块化约定（按模块拆）
- 路由拆分：用 `api['METHOD /path'] = handler` 注册表；新增路由模块 `server/routes/*.js`，
  通过 `require('./server/routes/xxx')({ api, DB, sendJson, ...ctx })` 注入共享依赖（参考 `server/routes/rom.js`）。
- 纯数据拆分：游戏内容常量（品质/装备/英雄星级天赋/元素/城墙/材料英雄/许愿/锻造/塔与肉鸽/Boss/建筑/资源/展示ID/短信）
  抽到 `server/config/*`，由 `server/config/index.js`（Object.assign barrel）聚合，
  server.js 顶部 `const { ... } = require('./server/config')` 一次性解构引用。
- server.js 现状：~3348 行；ROM/BIOS/云存档路由 + normalizeSkills 已拆到 `server/routes/rom.js` + `server/core/skills.js`。

## 棋类联机覆盖现状
- 已接入联机：五子棋(gomoku)、暗棋(banqi)、象棋(xiangqi)、国际象棋(mg-chess chess)、军棋翻翻棋(junqi/jungle)。
- 不存在：围棋(weiqi/go) 在 124 款中无此游戏。
- 引擎游戏（MG.eng）联机：飞行棋(ludo) 已接入（红 vs 黄 双人对弈，无 AI）。
  接入方式 = 引擎 `E.game()` 内 `cfg.net` opt-in 钩子 + `MG.pvp` 状态同步；新增引擎游戏只需声明 `cfg.net`
  （`setup/ser/apply` + 在本地行动后 `api.net.commit()`），单人/PvE 零影响。
- **注意**：`E.def`/`E.defd` 必须 `cfg.id = id`，否则 `MG.pvp.shouldBegin(cfg.id)` 恒收 undefined、联机永不触发
  （引擎自身 `gameId: cfg.id` 错误上报也因此一直是 undefined，一并修复）。
