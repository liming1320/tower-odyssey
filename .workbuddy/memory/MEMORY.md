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
- **自动部署已自愈（2026-09-18 改 `deploy/hooks/deploy.sh`）**：`tools/webhook-deploy.js` 收 Gitee push → 跑 `deploy.sh`，但原脚本只 `git reset --hard`+重启、**从不 npm install**。已加「仅当 `package.json` 变动才 `npm install`」分支，且 **ws 缺失直接判失败回滚**（不让无 ws 的版本上线）。效果：纯代码 push 自动部署依旧即用；改依赖时自动同步，不再依赖「上次手动装过 ws 还在」的运气。所以**普通代码改动只需 push，无需手动 npm install**。
- 客户端 mg-net.js：`connect()` 必须等 `onopen` 再发 join（`_pending` 队列排队冲刷），且加 8s 升级超时明确报错；否则 join 在 CONNECTING 被静默丢弃、三条入口全废。

## server.js 模块化约定（按模块拆）
- 路由拆分：用 `api['METHOD /path'] = handler` 注册表；新增路由模块 `server/routes/*.js`，
  通过 `require('./server/routes/xxx')(routeCtx)` 注入共享依赖（参考 `server/routes/rom.js`）。
- **routeCtx 单一上下文对象**（在首个路由模块位置定义，随抽取逐步 `Object.assign` 追加 helper/config）：
  `{ api, DB, sendJson, getUserByToken, isAdminToken, save, newId, newToken, <config常量>, <共享helper> }`；
  各模块 `const { ... } = ctx` 解构自己需要的，handler 连同其私有 helper 一起搬进模块。
- **回归闸门 `tools/verify-routes.js`**：`MG_NO_LISTEN=1`（不绑端口）+ `MG_DATA_DIR`（临时数据目录，不污染真实 db）
  加载 server.js，断言 `api` 路由表齐全、实跑几个 GET handler 不抛错。**每抽完一个域必须跑一次**。
  实现：server.js 末尾 `if (process.env.MG_NO_LISTEN) module.exports = { api, DB };`；`startListen()` 首行 `if (process.env.MG_NO_LISTEN) return;`。
- 纯数据拆分：游戏内容常量（品质/装备/英雄星级天赋/元素/城墙/材料英雄/许愿/锻造/塔与肉鸽/Boss/建筑/资源/展示ID/短信）
  抽到 `server/config/*`，由 `server/config/index.js`（Object.assign barrel）聚合，
  server.js 顶部 `const { ... } = require('./server/config')` 一次性解构引用。
- 进度（2026-09-18 起，增量拆）：已抽 `camp.js`(6) + `heroes.js`(GET+15 POST，含 4 私有 helper) +
  `tower.js`(tower/info/level/clear/start/choice/finish + world/world/gather，buildBattleHeroes/getWallInfo 搬入，
  heroCombatStats/chapterOf/bossForFloor/floorHpScale/floorAtkScale/mulberry32/enemyPoolFor 留 server.js 经 ctx 注入) +
  `events.js`(events+event/claim+wish+wish/reward+shop/buy-wish，eventState/drawOneHero 搬入) +
  `clan.js`(clans/clan.create/join/mine + user/set-nickname + chat + mail) +
  `minigame.js`(minigame 注册表+report/progress/score/rank/order + pk32 注册表+order + admin/minigame/order + admin/pk32/order) +
  `gift.js`(gift/redeem) + `admin.js`(admin/login/mail + account/delete + admin/gift/* + admin/tavern/{config,test,handles,scan}
  + admin/user/{delete,grant} + admin/hero/{add,update,delete,reload} + admin/wall/{update,delete} + admin/event/{save,delete}
  + admin/overview + admin/sms-codes + free + tavern/{ticket,status})。
  每次 verify-routes 均 **6/0 通过**；2026-09-19 加固后 **19/0 通过，路由表 111 个零缺失**（额外实跑 admin/overview/sms-codes/
  gift/list/tavern/config/minigame/order/pk32/order + tower/level + register→login→me 链路，并加「admin 无 token→403」「login 错密码→401」负向断言）。
  server.js 由 ~3348 行降到 **1471 行**（9 个 require('./server/routes/*')：auth/camp/heroes/events/tower/clan/minigame/gift/admin）。
- **抽 admin 时修复的既有 bug**：server.js 原 `GET /api/admin/tavern/*` 直接调用 `romAdminOk(req)`，但该函数只在
  `server/routes/rom.js` 模块内定义 → 运行时 ReferenceError（后台 AI 酒馆配置页必 500）。修复：在 server.js 顶层补一份
  `romAdminOk`（双通道：独立管理员令牌 `__admin__` 或玩家 isAdmin），经 routeCtx 注入 admin.js；rom.js 保留自己的副本。
- **TDZ 坑（已修）**：`normalizeSkills` 用 `const { normalizeSkills } = require('./server/core/skills')` 声明在 routeCtx
  **之后**，被 routeCtx 引用时触发 `Cannot access 'normalizeSkills' before initialization`。已把该 require 上移到 routeCtx 之前。
- **抽 auth 域（2026-09-19 收尾）**：`server/routes/auth.js` 迁出 register/login/sms/send/phone/login、user/bind-phone/set-password/logout/me
  （8 个）+ 私有 helper `publicUser`；依赖经 ctx 注入（hashPassword/verifyPassword/validPhone/maskPhone/genDefaultNickname/
  defaultUserState/touchLogin/SMS/validNickname/newId/newToken/newDisplayId）。`displayName` 因被 clan.js 经 ctx 引用而**留在 server.js**；
  auth.js 自行 `require('crypto')`。唯一残留内联路由仅 `GET /api/health`（引导/分发核心）。
- **`server/config` 扩装备/戒指/宝石/技能纯数据：经核查已非必要**——用户列举的 铁剑/银刃/蓝晶戒/玄铁法杖/黄玉/翠玉/藤蔓缠绕/潮汐涌动/烈焰爆裂
  等实际都存于 `data/db.json` / `data/heroes.json` 等运行时数据文件；server.js 内只剩生成逻辑用的小名字池（7 项/组，属生成逻辑本身），无需搬。
- **verify-routes 闸门已加固**（2026-09-19）：临时 db 里造 `ADMIN_TOKEN`（写 `__admin__`）+ 测试玩家（带 state + 上阵英雄 h_verify）
  与 `USER_TOKEN`，实跑上述 admin GET 与 `tower/level`，捕捉「ctx 漏注入 → ReferenceError/TypeError」类回归；
  前置 `if (process.env.MG_NO_LISTEN) return;` 在 `startListen()` 首行保证不绑端口。

## 棋类联机覆盖现状
- 已接入联机：五子棋(gomoku)、暗棋(banqi)、象棋(xiangqi)、国际象棋(mg-chess chess)、军棋翻翻棋(junqi/jungle)。
- 不存在：围棋(weiqi/go) 在 124 款中无此游戏。
- 引擎游戏（MG.eng）联机：飞行棋(ludo) 已接入（红 vs 黄 双人对弈，无 AI）。
  接入方式 = 引擎 `E.game()` 内 `cfg.net` opt-in 钩子 + `MG.pvp` 状态同步；新增引擎游戏只需声明 `cfg.net`
  （`setup/ser/apply` + 在本地行动后 `api.net.commit()`），单人/PvE 零影响。
- **注意**：`E.def`/`E.defd` 必须 `cfg.id = id`，否则 `MG.pvp.shouldBegin(cfg.id)` 恒收 undefined、联机永不触发
  （引擎自身 `gameId: cfg.id` 错误上报也因此一直是 undefined，一并修复）。
