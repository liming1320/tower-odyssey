# PK32 原版解包分析（F:\BaiduNetdiskDownload\pk32）

## 结论：原版是 VB5 编译的 EXE，无法像普通素材一样"一次性解包"

原版 PK32 位于 `F:\BaiduNetdiskDownload\pk32`，其全部内容就是：

```
Pk32.exe        5,070,336 字节  ← Visual Basic 5.0 编译产物（MSVBVM50.dll 是 VB5 运行时）
MSVBVM50.dll    2,371,612 字节  ← VB5 运行时
Pk32.ini        游戏配置 / 高分（[PkTop] 节含 Pk1..Pk997 的高分）
Pk32Reg.ini     注册信息
Pk32Save.ini    存档
pk32.rar        6.4MB ← 经 node-unrar-js 解包后，里面只是上面 5 个文件的副本，无额外数据
```

### 关键发现（已实测）
1. `pk32.rar` 解包后 = 与文件夹相同的 5 个文件，**没有任何按游戏拆分的素材/关卡/脚本**。
2. 对 `Pk32.exe` 做字符串扫描（ASCII / UTF-16 / **GBK** 三种编码，含已知游戏名的原始字节序列直接搜索）：
   - GBK 字符串 1444 条、ASCII 字符串 8326 条；
   - **213 个游戏名（跟花/魔塔/强手棋/俄罗斯方块…）在 EXE 中 0 命中**，连 GBK 字节序列都搜不到。
   - 说明：游戏名、玩法逻辑、关卡数据、美术、音效、存档都**编译进了 VB5 的 p-code 与窗体（.frm）二进制资源**里，
     不是明文数据。这与 `public/js/minigames/pk32.js` 注释一致——213 个名字是"运行时从菜单只读提取"的，
     即当初是**真正运行 Pk32.exe 抓取菜单**得到的，而非静态反编译。
3. `Pk32.ini` 的 `[PkTop]` 高分键是 `Pk<id>_0/_1/_2`（如 `Pk925_0=5536`），说明原版用 `Pk1..Pk997+` 编号，与网页的 `pk32-001..213` 顺序编号不是同一套。

### 推论：完整"原版还原"需要什么
- 要拿回**原始美术 + 关卡编码 + 碰撞/AI + 音效 + 存档格式**，必须先 **VB5 反编译**（如 VB Decompiler 类工具）把 p-code 与窗体资源还原成可读形式，再逐游戏手工移植到网页引擎。
- 该反编译工具是 Windows 桌面程序，本开发沙箱（Node/ headless）无法运行；需在本机 Windows 上执行，再把产物交回。
- 不反编译的替代路线：网页主引擎 `public/js/minigames/` 已自带 ~111 款游戏（俄罗斯方块/贪吃蛇/扫雷/黑白棋/五子棋/推箱子/连连看/打砖块/吃豆人/数独/华容道/中国象棋…），
  其中大量与 PK32 目录重名——可把 PK32 目录项**映射到现有网页实现**，使馆内大部分游戏立刻可玩（玩法同品类，但美术是网页自带的，非原版）。

## 工具
- `unpack-rar.js`：用 node-unrar-js（纯 JS，已装到 `C:\Users\li\.workbuddy\binaries\node\workspace\node_modules`）解包 `pk32.rar`，输出到 `E:\WorkSpace\_pk32extract`。
  ```bat
  set NODE_PATH=C:\Users\li\.workbuddy\binaries\node\workspace\node_modules
  node unpack-rar.js
  ```
- `scan-exe.js`：扫描 `Pk32.exe` 的 ASCII / UTF-16 / GBK 字符串，并按游戏名、资源扩展名、窗体名过滤，结果写入 `E:\WorkSpace\_pk32extract\_scan.txt` / `_gbk.txt`。

## 现状（网页端，来自 pk32.js）
- `NAMES` 数组 213 项（已含分组）；`PLAYABLE` 仅 3 项：魔塔(tower)、强手棋(pk32-richman)、推箱子四(pk32-sokoban4)。
- 其余多为 `catalogued` / `rules-partial` 状态，无真实玩法。
