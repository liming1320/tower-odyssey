# tower-odyssey 长期项目记忆

## 联机 PvP（MG.pvp）接入铁律
- `MG.pvp.side` 只在 `MG.pvp.begin()` 之后才有值（来自 `_armed.side`），begin 前恒为 0。凡是游戏初始化里读 side 来算 me/myColor/first 的，
  **必须先 begin**；正确范式是只在 `setState`/`commit`/`onOver` 等**回调内部**读 side（回调在收到消息时才执行）。已踩坑：banqi/xiangqi/jungle/mg-chess。
- **`setState` 里绝不能重新赋值 `const` 棋盘/状态**：`_recv` 把 setState 包在 try/catch 里，`TypeError` 被静默吞掉 → 对手棋子永远进不了本地
  （症状：各下各的、互相看不到、还能下同一格）。改法：棋盘用 `let`、原地拷贝、或 `Object.assign(S, m)`。
- 终局防回环：收到对手 `over` 只做**展示**（showResult），不再 `commit`；本地判定才 commit。
- **竞速 race**：`arm(g, side, opp, {race:true})` → `canMove()` 恒 true（不锁回合，双方各自落子）；`NET_GAMES[id].race=true` 由 `_launchNet` 自动透传。
  接入新竞速游戏只需每步 `commit({score,maxL,over,win})` 广播进度。
- `E.def`/`E.defd` 必须 `cfg.id = id`，否则 `shouldBegin(cfg.id)` 恒收 undefined → 联机永不触发。

## 联机中继 ws-relay
- 依赖 `ws`；`server.js` try/catch 包住。**package.json 必须声明 `"ws":"^8.18.0"`**，否则线上 npm install 不装 → 中继不挂 → WS 握手超时。
- 客户端 `mg-net.connect()` 必须等 `onopen` 再发 join（`_pending` 队列冲刷）+ 8s 升级超时明确报错。
- **掉线≠判负**：对局中 ws 断 → 该 peer 标 ghost（`ws=null,gone=true`，**必须保留在 room.peers**，先 filter 掉会导致重连匹配不到座位），
  活人收 `peer_gone`；重连带 `slot`（入座时 genToken 下发）→ 替回原座位 + 下发 `lastState`（客户端 `MG.pvp.resume`）+ 对端收 `peer_back`。
  仅显式 leave/quit 才立即判负（`peer_left`）。超时判负由独立 GC 做（周期 `min(2000,RESUME_MS)`，默认 30000ms，`MG_RESUME_MS` 可覆盖）。
- 快照持久化：进行中房间 debounced(1500ms) 落盘，`SIGINT/server.close` flush，启动 `restoreRooms` 读回成 ghost；`MG_ROOMS_OFF=1` 关闭。
- `_seq` 去重：`MG.net.send` 给 input/state/sync 打 `_seq`（**下划线**，写 `d.seq` 必 mismatch），中继按 `room._seqBySide[side]` 丢弃非递增包。
- 观战：`spectate` → `side=-1` 只读，收 `start(viewer:true,state,seats,opp)`，自身 input 被拦，退出不推 peer_left。
- `WebSocketServer` 已设 `maxPayload:1MB`。

## 联机大厅「桌子」（2026-09-20 改）
- **⚠️ 已修的大坑**：旧 `join{create:true}` 每次无条件 new 房间、且**不把自己从上一个房间摘掉** → 旧房间仍引用同一 ws（peers 非空、永不被回收），
  连点 N 次大厅就堆 N 张同名空桌（用户截图那一幕）。修法：create 前 `detachWaiting(ws)`；且**已在「只有自己的未开战桌」上时直接复用原桌不新开**
  （`fresh:true` 才是明确「换一张新桌」）。
- 三道闸门：①复用原桌（核心）②同 IP 未开战桌上限 `MG_MAX_SOLO_PER_IP`（默认 4，超出带回最早那张；**回环地址放行**，否则本机多套回归脚本互相挤兑）
  ③`MG_MAX_ROOMS`（默认 500）+ gc 回收「无活连接的僵尸桌」与「超 `MG_IDLE_ROOM_MS`（默认 30min）无人加入的空桌」（推 `notice`+`seat_gone`）。
- 客户端：`listTables` 过滤 0 活人桌；大厅列表**过滤掉自己的房间**（`MinigamesView._roomCode`）避免重复展示；新增「粘贴房间码加入」
  （带 `code:true`，码错服务端回 `error` 而非偷建孤儿桌）与「换一张新桌」；`notice/error/seat_gone` 渲染到大厅状态行。
- `joinRoom` 加了「同连接重复入座同一房间 → 直接复座位」守卫；`detachWaiting`/`cleanup` 退出后重排 `side`（不留座位空洞）并清 `_seqBySide`。
- 大厅 UI：卡片 = 一行「短房间码 · 已坐/总座 · 加入」+ 一行座位胶囊（头像圆点+昵称，空位只留 27px 虚线圆）。`.mh-*` 样式全在 main.css。
- 回归闸 `tools/verify-hall.js`（22/0）：连点 3 次只留 1 桌 / fresh 换桌回收旧桌 / 输错码不建孤儿桌 / 同 IP 上限（用 `x-forwarded-for` 伪造公网 IP）/ 重复 join 不叠座位。

## 部署与回归闸
- push → Gitee webhook → `tools/webhook-deploy.js` → `deploy/hooks/deploy.sh`（`git reset --hard` + **仅 package.json 变动才 npm install** + 重启宝塔
  `systemctl restart tower-odyssey`）；ws 缺失直接判失败回滚。普通代码改动只需 push。deploy.sh 开头把自己 cp 到 /tmp 再 exec，故脚本改动**下次部署才生效**。
- **Phase 2.6 部署前回归闸**：`tools/verify-net-gate.js` 串行 9 套（reconnect 14 / 4p 15 / persist 12 / seq 5 / spectate 8 / heartbeat 2 / **hall 22** / net-games 7 / net-new 9），
  任一失败 → `git reset --hard OLD_SHA` + `restore_db` + exit 1（不重启坏代码）。`DEPLOY_SKIP_VERIFY=1` 跳过；本地 `node tools/verify-net-gate.js` 预检。
- `tools/verify-routes.js`：`MG_NO_LISTEN=1` + `MG_DATA_DIR` 临时目录加载 server.js，19/0 通过、路由表 111 个。**每抽完一个域必须跑一次**。

## server.js 模块化约定
- `api['METHOD /path'] = handler` 注册表；新模块 `server/routes/*.js` 用 `require(...)(routeCtx)` 注入共享依赖。
- **routeCtx 单一上下文对象**：`{ api, DB, sendJson, getUserByToken, isAdminToken, save, newId, newToken, <config 常量>, <共享 helper> }`，各模块解构自取。
- 纯数据在 `server/config/*`，由 `index.js`（Object.assign barrel）聚合。
- 已拆 auth/camp/heroes/events/tower/clan/minigame/gift/admin，server.js 由 ~3348 行降到 ~1471 行。踩坑：
  ①admin.js 抽走后 `romAdminOk` 在 server.js 顶层补一份（否则后台 AI 酒馆配置页必 500）
  ②`const { normalizeSkills } = require(...)` 必须声明在 routeCtx **之前**，否则 TDZ ReferenceError。

## 联机覆盖现状
- 棋类：五子棋 gomoku、暗棋 banqi、象棋 xiangqi、国际象棋 mg-chess、军棋 junqi/jungle；4 人桌：大富翁 richman、强手棋 monopoly（cap=4）。不存在围棋 weiqi/go。
- 引擎（MG.eng）：飞行棋 ludo（新增引擎游戏只需声明 `cfg.net`：setup/ser/apply + 行动后 `api.net.commit()`）。
- 状态同步类新游戏：memory、g2048(race)、tankpvp、snakepvp、maze-coop(co-op 协作)；非联网进入时渲染「请从小游戏列表联网分类进入」提示，不静默进单人。

## 工程约束 / 资源约定
- **严禁改动**：`pinball.js`、`pk32*`、`public/vendor/spacecadet/*`、`arcade.js`/`emulator.js` 封装层、`optimized/` 死代码。推包时只 `git add` 自己改的文件，别 `git add -A`。
- 新联机代码全部 opt-in，单人/PvE 零回归。
- 立绘：`tools/gen-hero-art.js` → `public/img/heroes/<id>.svg` + `avatars/<id>.svg`；**改图必须 bump `utils.js` 的 `IMG_V`**（`U.imgSrc` 自动加 `?v=`），
  并同步 index.html 里 battle.js/utils.js 的 `?v=`，否则浏览器吃旧图。
- 无浏览器回归手段：`tools/verify-banqi-pvp.js`、`tools/smoke-battle-polish.js`（stub canvas 驱动 battle.js）。
- **共享打击感底座 `U.fx`（`utils.js`）**：主玩法战斗与 MG 小游戏共用同一套特效——震屏/飘字/粒子/冲击波/全屏闪走 `MG.cam`+`MG.fxPool`（mg-effects.js 启动期已加载，纯 canvas 工具，不依赖 `MG.runGame`）；顿帧用 battle.js 的全局冻结 dt 模型（`U.fx.hitStop`/`consumeHitStop`）。**任何主玩法场景要加打击感都走 `U.fx`，不要再自写随机抖动/独立飘字数组**；MG 缺失时 `U.fx` 自动降级空操作 + 标量抖动兜底。
- **本机有 Chrome**（`C:\Program Files\Google\Chrome\Application\chrome.exe`，另有 Edge、ms-playwright，此前"测试机无 Chrome"的记录有误）。
  UI 改版可做「静态预览 HTML 引用**真实** `public/css/main.css` + 手抄渲染函数产出的 DOM 结构 → 无头 Chrome 截图」肉眼验收，无需起服务：
  `chrome.exe --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=940,1080 --screenshot=out.png file:///E:/...`
  模板见 `tools/hall-preview.html`。注：预览外框要覆盖 `.mini-mask` 的 `position:fixed`（改 `static`）与 `.mini-stage` 的 `overflow/align-items`，否则被裁切。
