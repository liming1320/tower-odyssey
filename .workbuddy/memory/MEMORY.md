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
- 棋类：五子棋 gomoku、暗棋 banqi、象棋 xiangqi、国际象棋 mg-chess、军棋 junqi/jungle；4 人桌：强手棋 richman、大富翁 monopoly（cap=4）。不存在围棋 weiqi/go。
- 引擎（MG.eng）：飞行棋 ludo（新增引擎游戏只需声明 `cfg.net`：setup/ser/apply + 行动后 `api.net.commit()`）。
- 状态同步类新游戏：memory、g2048(race)、tankpvp、snakepvp、maze-coop(co-op 协作)；非联网进入时渲染「请从小游戏列表联网分类进入」提示，不静默进单人。

## 工程约束 / 资源约定
- **严禁改动**：`pinball.js`、`pk32*`、`public/vendor/spacecadet/*`、`arcade.js`/`emulator.js` 封装层、`optimized/` 死代码。推包时只 `git add` 自己改的文件，别 `git add -A`。
- 新联机代码全部 opt-in，单人/PvE 零回归。
- 立绘：`tools/gen-hero-art.js` → `public/img/heroes/<id>.svg` + `avatars/<id>.svg`；**改图必须 bump `utils.js` 的 `IMG_V`**（`U.imgSrc` 自动加 `?v=`），
  并同步 index.html 里 battle.js/utils.js 的 `?v=`，否则浏览器吃旧图。
- 无浏览器回归手段：`tools/verify-banqi-pvp.js`、`tools/smoke-battle-polish.js`（stub canvas 驱动 battle.js）。
- **共享打击感底座 `U.fx`（`utils.js`）**：主玩法战斗与 MG 小游戏共用同一套特效——震屏/飘字/粒子/冲击波/全屏闪走 `MG.cam`+`MG.fxPool`（mg-effects.js 启动期已加载，纯 canvas 工具，不依赖 `MG.runGame`）；顿帧用 battle.js 的全局冻结 dt 模型（`U.fx.hitStop`/`consumeHitStop`）。**任何主玩法场景要加打击感都走 `U.fx`，不要再自写随机抖动/独立飘字数组**；MG 缺失时 `U.fx` 自动降级空操作 + 标量抖动兜底。
## 渲染：大富翁 monopoly = 真 Three.js WebGL 3D（2026-09-20，de5d7f8）
- **Three.js 早已自带**：`public/js/lib/three.min.js`（**r149**，有 `sRGBEncoding`/`outputEncoding`，无 `outputColorSpace`），`alienshoot3d.js` 在用 → 做真 3D **零新增依赖**（别再以为「上 Three.js 会破坏零依赖」）。懒加载范式：注入 `script` 指向 `/js/lib/three.min.js?v=20260916a`。
- 大富翁的 **显示层** 已整体换成 WebGL 场景（40 格方盘 + 立体楼房/酒店 + 4 个圆柱身+球头+emoji 脸的小人 + **逐格跳步行走** + 中央广场）；**游戏逻辑（买地/建楼/卡牌/神明/破产/存档/`MG.pvp` 联机）完全未动**——`render()` 只做「状态 S → 视图」同步，改造只动渲染。
- **小人逐格行走范式（2026-09-20 续10）**：每小人 `pawnCell[i]`(当前格)+`pawnStep[i]`(0..1)+`pawnQueue[i]`(待走格序列)。`walk()` 每推进一格即 `push` 入队并 `sleep(55/38)`，**视觉由 `animate()` 按 `HOP_TIME` 逐格消耗队列**（`sin(f·π)` 抛物线弧）；`walk()` 末尾 `while(pawnQueue[i].length) sleep(20)` 等动画播完才 resolve → `await walk(); await onLand()` 顺序天然正确。**非走格移动（卡牌传送/监狱）不入队**，靠 `syncScene()`「队列空且 `pos!==pawnCell` 即吸附」兜底对齐（任意距离，别再用旧的 delta≤6 分支）。
- DOM 结构：`.mgy-board` = WebGL 画布容器（`position:relative/overflow:hidden`，`.mono-canvas` 绝对铺满），顶部 HUD 叠加层 `.mono-center`（轮次/目标/骰子/消息）+ 加载/报错占位 `.mono-emblem` + 右下相机按钮 `.mono-camctl`（均 `pointer-events` 收窄不挡拖拽）。**旧 CSS 伪 3D（perspective/rotateX/billboard 楼房/mono-ct/mgy-pips/mono-crest/mono-deco）已全部删除**。
- 相机：手写控制（指针拖拽 `cam.az/pol`、滚轮+双指 `cam.rad`）+ **按钮 `camZoom/camSpin/camReset`（`.mono-camctl` 5 键，`wireCamButtons` 绑定）**；`fitCam()` 按垂直/水平半视角较小者反算 `rad` 自动取景（初始 + `onResize` 各调），否则方盘对角会被裁、起点角小人出画。
- 3D 装饰 `buildCenter()`：中央广场盘+金环+贴地 logo + 机会/命运牌堆 + 起点金环 + 监狱栅栏（`GL_deco` 计数）。
- `_debug` 暴露 `gl()(含 deco)/blv(i)/visBld()/pawnCell()/pawnQueueLen()/camPos()/raf()/drawCalls()/pawnScreen()` 供无头校验读 3D 内部状态；建楼闪光 `flashBuild(i)`/`fxCount()`、脚步声 `MG.audio.sfx('step')`（mg-audio.js 的 `P={}` 加 `step:` 预设）、竖屏取景 `fitCam()` 按 `window.innerHeight>window.innerWidth` 走 `pol=1.18`+fov60 分支（无头 390×844 实测 8/8 小人在画内）。

### Canvas/WebGL 渲染层验收铁律（血泪）
- **`catch` 包住的初始化异常会伪装成成功**：曾把初始化尾部写在 `start3D().catch()` 里，某行抛 `TypeError` 被静默接住 → 场景/对象都建好了但**渲染循环从未启动 → 整盘黑屏**。
- 故验收断言**必须包含**：①渲染循环在跑（`raf()!==0` / 帧计数）②真的产生 draw call（`renderer.info.render.calls>0`）③错误占位文案为空。只断言「DOM/对象存在」会以「全绿黑屏」形式放行（已踩）。
- **无头 WebGL 必须软件渲染**：Chrome 加 `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`，**绝不能加 `--disable-gpu`**（会直接废掉 WebGL）。参考 `tools/shot-monopoly.js`（15 项断言 + 截图）。
- **fs 补丁脚本锚点必须按文件真实缩进**：`monopoly.js` 的 `start3D` 函数体（在 `ensureThree().then(T=>{ … })` 内）是 **12 空格缩进**，不是 8；锚点写错缩进会 `未找到` 失败。改前用 `node -e` 打印 `l.slice(0,12)` 确认。
- **部署核对别在 `monopoly.js` 里找 `?v=` 版本串**：版本串只写在 `index.html` 的 `<script src=...?v=>` 里，`monopoly.js` 自身不含自己的版本号。判部署改查 `GL_turnRing`/`ACESFilmicToneMapping`/`buildMarks`/`inspectCell` 等新标记。
- **异步动画类断言要「等稳态再采样」**：曾断言"行走队列已排空"却报残留 `[2,0,0,0]`——其实是**采样时对手的行走动画刚播到一半**（并非 bug）。凡断言"最终状态"，先轮询到稳定（如 `pawnQueueLen()` 全 0 或超时）再取值。
- **本机有 Chrome**（`C:\Program Files\Google\Chrome\Application\chrome.exe`，另有 Edge、ms-playwright，此前"测试机无 Chrome"的记录有误）。
  UI 改版可做「静态预览 HTML 引用**真实** `public/css/main.css` + 手抄渲染函数产出的 DOM 结构 → 无头 Chrome 截图」肉眼验收，无需起服务：
  `chrome.exe --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=940,1080 --screenshot=out.png file:///E:/...`
  模板见 `tools/hall-preview.html`。注：预览外框要覆盖 `.mini-mask` 的 `position:fixed`（改 `static`）与 `.mini-stage` 的 `overflow/align-items`，否则被裁切。

## 模拟器联机信令（EmulatorJS nightly netplay，**本站自建 · 独立端口 5181**）
- **架构（2026-09-21 重大修正）**：netplay 信令是**独立端口的自包含服务**，`server/netplay.js` 用 `http.createServer` 监听 `NETPLAY_PORT`（默认 **5181**），socket.io 用**默认 `/socket.io`**、房间列表 `GET /list` 也由该服务托管。`server.js` 调 `Netplay.createServer()`（不再 `attach` 到主服务器）。
- **为什么必须独立端口（血泪）**：EmulatorJS 客户端连 netplay 时，socket.io 端点**永远落在 `EJS_netplayServer` 所指 host 的默认 `/socket.io`**（URL 子路径只当命名空间，不改变端点）。而主服务器根的 `/socket.io` 已被 `server/tavern.js` 反向代理到 SillyTavern → 客户端握手 `/socket.io` 被代理到 ST → 404 → 建不了房间。最初挂在主服务器 `/netplay/socket.io` 也连不上（客户端压根不敲那个路径）。故按官方自托管拓扑，netplay 跑独立端口、socket.io 用默认路径。
- **`EJS_netplayServer` = `location.protocol + '//' + location.hostname + ':5181/'`**（`emulator.js` 的 `SELF_NETPLAY`）。若改了服务端 `NETPLAY_PORT` 环境变量，`emulator.js` 里的 `5181` 必须同步改。公开服务器 `https://netplay.emulatorjs.org/` 仅作兜底注释。
- 协议对齐官方 `EmulatorJS-Netplay`：`open-room`/`join-room`/`leave-room`/`webrtc-signal`/`data-message`/`snapshot`/`input`/`disconnect`，房间按 `sessionid`；`game_id` = 前端 `emuGameId(romId)` 稳定哈希，用于 `/list` 浏览（同 ROM 两人自动相遇）。
- **房间列表 `/list`**：客户端请求 `EJS_netplayServer + 'list?game_id=<EJS_gameID>'` → 独立服务的 `GET /list?game_id=...`，返回 `{<sessionId>:{room_name,current,max,player_name,hasPassword}}`（对齐官方字段）。`filterRooms(roomsMap,gameId)` 纯函数按 `gameId` 且 `players<max` 过滤。
- **⚠️ 部署必做：云安全组/防火墙放行 5181 入站**。否则服务能起，但浏览器从外连不上 → 仍建不了房间。线上探活：① `TCP 152.136.167.250:5181` 应连上（非 TIMEOUT）② `GET /list?game_id=1` 返回 `{}`(200,json) ③ `GET /socket.io/?EIO=4&transport=polling` 返回 `0{"sid":...}` 握手。**实测 2026-09-21：先 TIMEOUT（云 SG 未放行）→ 放行后变 `502 Bad Gateway`，说明 5181 上有反代/监听器占了端口、上游却是失效地址（多半是宝塔建的反向代理/站点，或旧 `setup-netplay.sh` 残留 nginx）。netplay.js 现已在 `EADDRINUSE` 时自动改绑 `127.0.0.1:5181` 并打印指引。用户侧二选一：①删掉 5181 上的反代、只开防火墙（设计本就零反代）②保留反代但把上游改成 `127.0.0.1:5181`。修好后 `curl 127.0.0.1:5181/list` 应返回 `{}`，浏览器 CORS 报错随之消失（502 的连带症状）。**
- **`package.json` 必须声明 `"socket.io":"^4.7.5"`**，否则线上 npm install 不装 → 独立服务起不来 → 联机挂不上。
- `createServer` 整段 try/catch + `httpServer.on('error')` 包裹：socket.io 缺失/`EADDRINUSE` 自动改绑 `127.0.0.1` 重试/绑定彻底失败均仅告警不拖垮主服务（`[netplay] 端口 5181 监听失败…`）。
- 联机流程：点「👥 联机」→ 核心就绪后 ≡ 菜单 → Netplay → 一方创建房间（出现在列表/得房间号）→ 好友进同 ROM 点联机 → 下拉选房或输号加入 → 两人同房间即开战。**nightly 版联机偶发掉线/desync 属正常**（FC/NES 最稳）。联机时自动用站点昵称（`app.user.nickname`/`MG.me.nickname`）填 EmulatorJS 的「名字/房间名」（`installNetplayNameDefault`，prompt 与输入框两种兜底，最多填 30s）。
- 回归：`tools/smoke-netplay-list.js`（filterRooms 15 项断言）、`tools/smoke-netplay-standalone.js`（独立服务 HTTP 探活 /list + /socket.io 握手 + 404；⚠️ 本地需先 `npm i socket.io`，沙箱拦 wsl 装不了，故本地跑不了、只能线上验证）。
- **架构坑**：socket.io 默认 path 是 `/socket.io` 且客户端不可改（URL 子路径只当命名空间）——这是一切 netplay 自托管路径坑的根源。ST `/socket.io`(代理) 与 netplay `/socket.io`(5181) 靠端口区分；ws-relay `/ws/minigame` 独立。
