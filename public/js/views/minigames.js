// 小游戏入口：竖版滚动卡片，每张游戏点击进入全屏游戏容器
// 真正的 20 个游戏实现放在 /js/minigames/*.js，由本文件按需加载
const MinigamesView = {
    async open(app) {
        // 先同步服务器进度（登录用户），并拉取后台设置的排序；无排序时按 manifest 原序
        try {
            MG.sync();
            const order = await MG.fetchOrder();
            if (order && order.length) {
                const map = new Map(GAMES.map(g => [g.id, g]));
                const ordered = [];
                order.forEach(id => { if (map.has(id)) { ordered.push(map.get(id)); map.delete(id); } });
                ordered.push(...map.values());   // 新增的未在排序里的追加到末尾
                this._sorted = ordered;
            }
        } catch (e) {}
        this.render(app);
    },
    render(app) {
        const list = this._sorted || GAMES;
        // 切到独立 tab 区域显示
        const root = document.getElementById('page-content');
        root.innerHTML = `
            <div class="section-title">🎮 小游戏<span style="float:right;font-size:12px;color:#b9b3d8;font-weight:normal">共 ${list.length} 款</span></div>
            <div class="mini-hub" id="mini-hub"></div>
        `;
        const hub = document.getElementById('mini-hub');
        list.forEach(g => {
            const stars = MG.totalStars(g.id);
            const card = U.el(`
                <div class="mini-card" data-id="${g.id}">
                    <div class="mini-thumb">${g.thumb}</div>
                    <div class="mini-meta">
                        <div class="mini-name">${g.name}${stars > 0 ? `<span class="mini-stars">⭐ ${stars}</span>` : ''}</div>
                        <div class="mini-desc">${g.desc || ''}</div>
                    </div>
                    <div class="mini-arrow">›</div>
                </div>
            `);
            card.onclick = () => this.launch(g);
            hub.appendChild(card);
        });
    },

    launch(g) {
        // 全屏遮罩容器
        const mask = U.el(`<div class="mini-mask" id="mini-mask">
            <div class="mini-topbar">
                <button class="btn-back" id="mini-back">‹ 返回</button>
                <div class="mini-title">${g.name}</div>
                <div class="mini-score" id="mini-score"></div>
            </div>
            <div class="mini-stage" id="mini-stage"></div>
        </div>`);
        document.body.appendChild(mask);
        const stage = document.getElementById('mini-stage');
        const scoreEl = document.getElementById('mini-score');
        const close = () => {
            mask.remove();
        };
        document.getElementById('mini-back').onclick = close;
        try {
            const game = window.MiniGames && window.MiniGames[g.id];
            if (!game) throw new Error('未加载到该游戏模块');
            // 暗棋保留自己的关卡流程（猜拳→对局），走自己的 start
            if (g.id === 'banqi') {
                const inst = game.start(stage, { onScore: s => scoreEl.textContent = s != null ? s : '' });
                inst && (inst._close = close);
            } else {
                const levels = (game.LEVELS && game.LEVELS.length) ? game.LEVELS : defaultLevels(g);
                MG.runGame(stage, {
                    id: g.id, title: g.name, levels,
                    endless: game.ENDLESS || null,
                    start: (c, opts, lv) => game.start(c, opts, lv),
                    scoreEl,
                });
            }
        } catch (e) {
            stage.innerHTML = `<div style="padding:30px;color:#ff7a8b">启动失败：${e.message}</div>`;
        }
    }
};

// 兜底：没有 LEVELS 配置的游戏也具备 50 关（难度参数自增 0..1）
function defaultLevels(g) {
    const out = [];
    for (let i = 1; i <= 20; i++) {
        out.push({ name: '第' + i + '关', desc: '难度 ' + i + '/20', _fallback: true });
    }
    return out;
}

// 100 个小游戏清单（id 与 /js/minigames/*.js 一一对应）
// sc(id, 名称, 简介, 底色1, 底色2, [emoji...]) —— 自动生成场景缩略图
function sc(id, name, desc, c1, c2, emos) {
    const n = emos.length;
    const step = n > 3 ? 21 : 26;
    const size = n > 3 ? 18 : 23;
    const items = emos.map((e, i) => [e, 44 + (i - (n - 1) / 2) * step, 32, size]);
    return { id, name, desc, thumb: sceneThumb(c1, c2, items) };
}
const GAMES = [
    sc('gomoku', '五子棋', '50 关 AI 对战，失误率递减', '#e8c890', '#a87840', ['\u26ab', '\u26aa']),
    sc('g2048', '2048 降妖', '50 关妖怪合并 · 无尽模式', '#5a7a9f', '#2c3e6a', ['\u2733']),
    sc('banqi', '暗棋圣手', '15 关 · 宋金小人 · 必杀技', '#8a5a2f', '#4a2c12', ['\u2694']),
    sc('xiangqi', '中国象棋', '50 关红黑对弈，车马炮冲锋', '#e8b088', '#9a5a28', ['\u265f', '\u265e']),
    sc('link', '连连看', '50 关 · 岩石挡路 · 限时', '#7ad0ff', '#2a6adf', ['\ud83d\udd17', '\ud83e\udea8']),
    sc('match3', '消消乐', '50 关 · 配额目标 · 石块', '#ffb86b', '#e0642a', ['\ud83c\udf6c', '\ud83c\udf6d']),
    sc('snake', '贪吃蛇', '50 关 · 地图与目标递增', '#a0e8a0', '#2e8a3e', ['\ud83d\udc0d', '\ud83c\udf4e']),
    sc('tetris', '俄罗斯方块', '50 关 · 下落提速', '#8aa8ff', '#2a3a8f', ['\ud83d\udfea', '\ud83d\udfe8']),
    sc('mole', '打地鼠', '50 关 · 地洞变多地鼠变快', '#d8a878', '#7a5228', ['\ud83d\udc39', '\ud83d\udd28']),
    sc('mine', '扫雷', '50 关 · 棋盘与雷数递增', '#c8ccd8', '#5a6278', ['\ud83d\udca3', '\ud83d\udea9']),
    sc('memory', '记忆翻牌', '50 关 · 牌对递增', '#d0a8ff', '#5a2ea8', ['\ud83c\udccf', '\u2753']),
    sc('slide15', '数字华容道', '50 关 · 3×3 到 5×5', '#8ac8ff', '#2a5ac0', ['\ud83d\udd22', '\u27a1']),
    sc('bulls', '猜数字', '50 关 · A×B 逻辑推理', '#ffcf8a', '#b06818', ['\ud83d\udd22', '\ud83d\udca1']),
    sc('sudoku6', '迷你数独', '50 关 · 6×6 入门', '#a0e8a0', '#2e8a3e', ['6\ufe0f\u20e3', '\ud83e\udde9']),
    sc('hanoi', '汉诺塔', '50 关 · 3 到 9 层', '#ffd0a0', '#b06030', ['\ud83d\uddfc', '\ud83d\udfe0']),
    sc('piano', '别踩白块', '50 关 · 速度递增', '#e8e8f4', '#8a90a8', ['\ud83c\udfb9', '\ud83c\udfb5']),
    sc('reaction', '反应力测试', '50 关 · 等待时间递减', '#ffe88a', '#c89418', ['\u26a1', '\ud83c\udfaf']),
    sc('breakout', '打砖块', '50 关 · 砖块与球速递增', '#8ad0ff', '#2060b0', ['\ud83e\uddf1', '\ud83c\udfd3']),
    sc('jump', '跳一跳', '50 关 · 平台越来越窄', '#c8f0c8', '#3a9040', ['\ud83e\udd98', '\ud83c\udfaf']),
    sc('shooter', '飞机大战', '50 关 · 敌机与血量递增', '#8a9ad8', '#141c3a', ['\ud83d\ude80', '\ud83d\udc7e']),

    sc('tictactoe', '井字棋', '50 关 · AI 失误率递减', '#7ad0ff', '#2a4a8f', ['\u2715', '\u25cb']),
    sc('connect4', '四子棋', '50 关 · 四子连珠', '#5a7ad0', '#1a2a5f', ['\ud83d\udd34', '\ud83d\udfe1']),
    sc('reversi', '黑白棋', '50 关 · 翻转夹击', '#2e6a4a', '#0f2a1c', ['\u26aa', '\u26ab']),
    sc('nim', '取石子', '50 关 · 博弈必胜策略', '#8a6a3a', '#3a2a14', ['\ud83e\udea8', '\u270b']),
    sc('battleship', '海战棋', '50 关 · 有限炮弹击沉敌舰', '#2a6a9f', '#0e2a4a', ['\ud83d\udef2', '\ud83d\udd25']),
    sc('dots', '点格棋', '50 关 · 围格占领', '#5a4a8f', '#221a3f', ['\u2500', '\u2502']),
    sc('mancala', '非洲棋', '50 关 · 播撒石子入库', '#8a5a2f', '#3a2010', ['\ud83e\udea8', '\ud83c\udff4']),
    sc('queens', 'N 皇后', '50 关 · 5 到 8 皇后', '#6a4a8f', '#2a1a4f', ['\u265b', '\u2655']),
    sc('peg', '孔明棋', '50 关 · 跳吃剩子越少越好', '#8a6a3a', '#2a1c0e', ['\u26aa', '\u2b21']),
    sc('breakthru', '突破棋', '50 关 · 兵阵突破底线', '#4a5878', '#161e30', ['\ud83d\udd35', '\ud83d\udd34']),

    sc('chess', '国际象棋', '50 关 · 完整走子规则', '#6b7fa8', '#2a3450', ['\u2654', '\u265a']),
    sc('junqi', '军棋翻翻棋', '50 关 · 军衔·炸弹·地雷·军旗', '#3d4a2e', '#1e2616', ['\ud83d\udee1', '\ud83d\udea9']),

    sc('solitaire', '纸牌接龙', '50 关 · Klondike 经典', '#1f5c3a', '#0d2e1d', ['\u2660', '\u2665']),
    sc('spider', '蜘蛛纸牌', '50 关 · K→A 序列消除', '#1f4a5c', '#0d2230', ['\ud83d\udd77', '\u2660']),
    sc('freecell', '空当接龙', '50 关 · 4 空当 52 张归位', '#3a2f52', '#1a1430', ['\ud83c\udccf', '\u2663']),
    sc('pyramid', '金字塔纸牌', '50 关 · 凑 13 消除', '#4a3a26', '#241a10', ['\ud83d\udd0d', '\u2666']),
    sc('blackjack', '21 点', '50 关 + 无尽 · 筹码翻倍', '#1f5c3a', '#0a2418', ['\ud83c\udccf', '\ud83d\udcb0']),
    sc('poker', '五张比牌', '50 关 · 换牌比牌型', '#2f3a52', '#141c2c', ['\u2660', '\u2665', '\u2666']),
    sc('war', '纸牌大战', '50 关 · 点数大者胜', '#3a2f52', '#1a1430', ['\ud83c\udccf', '\u2694']),
    sc('monopoly', '大富翁', '50 关 · 4 人局 · 买地建楼 · 自动存档', '#2f4a3a', '#12241c', ['\ud83c\udfe0', '\ud83c\udfb2', '\ud83d\udcb0']),

    sc('maze', '迷宫', '50 关 · 迷宫越来越大', '#2f3a52', '#141c2c', ['\ud83c\udfc1', '\ud83c\udfc3']),
    sc('lightsout', '点灯', '50 关 · 全部熄灭', '#ffe08a', '#3a3452', ['\ud83d\udca1']),
    sc('floodit', '洪水填充', '50 关 · 最少步数同化全盘', '#ff6b7f', '#5cc7ff', ['\ud83c\udf08']),
    sc('pipes', '接水管', '50 关 · 旋转接通水源', '#1e2a3a', '#0e1622', ['\ud83d\udca7', '\ud83d\udeb0']),
    sc('nonogram', '数织', '50 关 · 按提示还原图案', '#5cc7ff', '#2a2440', ['\ud83d\udcd0']),
    sc('sudoku9', '九宫数独', '50 关 · 挖洞数递增', '#22304a', '#0e1626', ['\ud83d\udd22']),
    sc('numberpath', '数字连线', '50 关 · 按序连点', '#26304a', '#12182a', ['1', '2', '3']),
    sc('sokoban', '推箱子', '50 关 · 经典仓库番', '#3a2f22', '#1a1410', ['\ud83d\udce6', '\ud83c\udfaf']),
    sc('blockpuzzle', '方块填充', '50 关 + 无尽 · 消行得分', '#1e2a3a', '#0c141e', ['\ud83d\udfea', '\ud83d\udfe6']),
    sc('mastermind', '色码破译', '50 关 · 红白点提示推理', '#2a2438', '#15121e', ['\ud83d\udd34', '\ud83d\udd35']),

    sc('flappy', '飞扬的小鸟', '50 关 + 无尽 · 穿越管道', '#7ec8f0', '#3a90c0', ['\ud83d\udc24']),
    sc('dodge', '躲避方块', '50 关 + 无尽 · 坚持不中', '#2a2440', '#14102a', ['\ud83d\udeb6', '\ud83d\udfe5']),
    sc('catcher', '接苹果', '50 关 + 无尽 · 别接炸弹', '#3a5a2e', '#16281a', ['\ud83c\udf4e', '\ud83d\udca3']),
    sc('balloonpop', '扎气球', '50 关 + 无尽 · 别让它飞走', '#4a7fd0', '#1a3a70', ['\ud83c\udf88']),
    sc('archery', '射箭', '50 关 + 无尽 · 越近靶心越高', '#5a7a4a', '#22381a', ['\ud83c\udff9', '\ud83c\udfaf']),
    sc('basketball', '投篮', '50 关 + 无尽 · 空心入网', '#8a5a2f', '#3a2412', ['\ud83c\udfc0', '\u26f9']),
    sc('darts', '飞镖', '50 关 + 无尽 · 正中红心', '#3a2f52', '#1a1430', ['\ud83c\udfaf']),
    sc('fishing', '钓鱼', '50 关 + 无尽 · 别钓上鞋子', '#2a6a9f', '#0e2a4a', ['\ud83d\udc1f', '\ud83e\udd7e']),
    sc('helicopter', '直升机', '50 关 + 无尽 · 穿越障碍', '#2a3a5f', '#121c32', ['\ud83d\ude81']),
    sc('stacker', '叠方块', '50 关 + 无尽 · 越叠越高', '#3a2f52', '#1a1430', ['\ud83d\udfe6', '\ud83d\udfea']),

    sc('mathquiz', '速算挑战', '50 关 · 加减乘除混合', '#5cc7ff', '#2a5ac0', ['\u2795', '\u2797']),
    sc('stroop', '色字干扰', '50 关 · 选字体颜色', '#e03a4a', '#3a7fd0', ['\ud83c\udf08']),
    sc('higherlower', '比大小', '50 关 · 猜大还是小', '#ffd56b', '#b06818', ['\u2b06', '\u2b07']),
    sc('oddone', '找不同', '50 关 · 找出不一样的', '#7adf7a', '#2e8a3e', ['\ud83d\udc36', '\ud83d\udc31']),
    sc('idiom', '成语填空', '50 关 · 四字成语补字', '#ffb86b', '#b04818', ['\ud83d\udcd6']),
    sc('trivia', '常识问答', '50 关 · 百科知识', '#b78bff', '#5a2ea8', ['\u2753', '\ud83d\udcda']),
    sc('counting', '数一数', '50 关 · 数量越来越多', '#ff9d5c', '#b04818', ['\ud83d\udd34', '\u2b50']),
    sc('estimate', '眼力估算', '50 关 · 误差范围递减', '#5cc7ff', '#2a6adf', ['\ud83d\udccf']),
    sc('clockread', '读时钟', '50 关 · 认表盘时间', '#2a2440', '#14102a', ['\ud83d\udd57']),
    sc('sequence', '数列推理', '50 关 · 找规律填数', '#7adf7a', '#2e8a3e', ['1', '2', '3', '?']),

    sc('flashnum', '闪记数字', '50 关 · 数字位数递增', '#3a2f52', '#1a1430', ['\ud83d\udd22', '\u26a1']),
    sc('chimp', '猩猩记忆', '50 关 · 位置顺序记忆', '#2f4a3a', '#14241c', ['\ud83e\udd8d', '\ud83d\udd22']),
    sc('simon', '色彩记忆', '50 关 + 无尽 · 照序点亮', '#262038', '#12101e', ['\ud83d\udfe5', '\ud83d\udfe6']),
    sc('cardmem', '记牌', '50 关 · 记住亮过的牌', '#2f4a3a', '#14241c', ['\u2660', '\u2665']),
    sc('wordmem', '记词', '50 关 · 词语闪记', '#ffb86b', '#b04818', ['\ud83d\udcd6']),
    sc('spot', '找隐藏', '50 关 · 图案越来越密', '#3a3350', '#1a1730', ['\ud83d\udd0d', '\u2b50']),
    sc('pathmem', '路径记忆', '50 关 · 顺序点亮格子', '#2a3a52', '#141c2c', ['\ud83d\udfe8', '\u2728']),
    sc('shadowmatch', '影子配对', '50 关 · 剪影辨物', '#5a4a8f', '#221a3f', ['\ud83d\udc36', '\ud83d\udc31']),
    sc('whatmiss', '缺什么', '50 关 · 找出被拿走的', '#7adf7a', '#2e8a3e', ['\u2757', '\ud83c\udf4e']),
    sc('reversenum', '倒背数字', '50 关 · 数字倒序', '#ffd56b', '#b06818', ['\ud83d\udd04', '\ud83d\udd22']),

    sc('coinflip', '抛硬币', '50 关 + 无尽 · 连胜挑战', '#3a2f52', '#1a1430', ['\ud83e\ude99']),
    sc('dicehi', '骰子比大小', '50 关 + 无尽 · 猜大小', '#2f4a3a', '#14241c', ['\ud83c\udfb2']),
    sc('slots', '老虎机', '50 关 + 无尽 · 三连中奖', '#5a2f4a', '#2a1020', ['\ud83c\udfb0', '\ud83d\udc8e']),
    sc('bingo', '宾果', '50 关 · 连成指定线数', '#3a2f52', '#1a1430', ['\ud83d\udd22', '\u2714']),
    sc('spinner', '幸运转盘', '50 关 + 无尽 · 转到高分', '#4a2f52', '#20103a', ['\ud83c\udfaf']),
    sc('rpsgame', '猜拳连胜', '50 关 + 无尽 · 石头剪刀布', '#2f3a52', '#141c2c', ['\u270a', '\u270c', '\u270b']),
    sc('plinko', '弹珠台', '50 关 + 无尽 · 落高分槽', '#1f3a52', '#0c1e2e', ['\ud83d\udfe1', '\ud83c\udfaf']),
    sc('lucky7', '幸运七', '50 关 + 无尽 · 猜两骰之和', '#3a2f22', '#1a1410', ['\ud83c\udfb2', '7']),
    sc('tapburst', '连点挑战', '50 关 + 无尽 · 手速比拼', '#2f4a5f', '#12283a', ['\ud83d\udc46', '\u26a1']),
    sc('gacha', '扭蛋抽卡', '50 关 + 无尽 · 抽 SSR', '#4a2f52', '#20103a', ['\ud83e\udd5a', '\u2b50']),

    sc('towerdef', '迷你塔防', '50 关 + 无尽 · 建塔守家', '#2f4a3a', '#14241c', ['\ud83d\uddfc', '\ud83d\udc7e']),
    sc('idleclick', '放置点击', '50 关 + 无尽 · 挂机赚钱', '#4a3f22', '#241d10', ['\ud83e\ude99', '\u2b06']),
    sc('life', '生命游戏', '50 关 · 细胞演化存活数', '#1f2a3a', '#0c1420', ['\ud83e\uddec', '\ud83d\udfe9']),
    sc('virus', '病毒扩散', '50 关 · 有限次数治愈', '#2a2038', '#140f1e', ['\ud83e\udda0', '\ud83d\udc8a']),
    sc('sandfall', '流沙填充', '50 关 + 无尽 · 填到目标线', '#3a2f22', '#1a1410', ['\ud83c\udfd6', '\ud83d\udca7']),
    sc('ballance', '平衡杆', '50 关 + 无尽 · 别让球掉', '#2f3a52', '#141c2c', ['\ud83d\udd34', '\u2696']),
    sc('rocketland', '火箭着陆', '50 关 + 无尽 · 安全降落', '#0e1430', '#05080f', ['\ud83d\ude80']),
    sc('orbit', '轨道跳跃', '50 关 + 无尽 · 躲开陨石', '#0e1430', '#05080f', ['\ud83d\udef0', '\u2604']),
    sc('traffic', '交通调度', '50 关 · 避免路口相撞', '#2f3a3a', '#141c1c', ['\ud83d\ude97', '\ud83d\uded1']),
    sc('growfarm', '开心农场', '50 关 + 无尽 · 种植收获', '#3a5a2e', '#16281a', ['\ud83c\udf31', '\ud83c\udf3e']),

    // 本轮新增（3 款）
    sc('knife', '鸠摩智转刀', '50 关 + 无尽 · 转盘上插刀避开已有', '#8a5a2f', '#3a2010', ['\ud83d\udd2a', '\ud83c\udfaf']),
    sc('sheep', '羊了个羊', '50 关 + 无尽 · 7 槽堆叠消除', '#fff5d6', '#caa86a', ['\ud83d\udc11', '\ud83d\udc30']),
    sc('pocketarmy', '口袋奇兵', '50 关 + 无尽 · 加减门 / 木桶 / 敌人', '#3a7fd0', '#1a3a70', ['\ud83d\udc66', '\ud83d\udca3']),

    // FC 经典复刻（自研）
    sc('tank', '坦克大战', '50 关 + 无尽 · 本地双人 · 守护基地', '#6a5a2a', '#2a2410', ['\ud83d\udee1', '\ud83e\udea8', '\ud83e\udd85']),
    sc('contra1', '魂斗罗·丛林突击', '50 关 + 无尽 · 本地双人 · 横版跑打', '#2f6a3a', '#12301a', ['\ud83c\udfb2', '\ud83d\udc64', '\ud83d\udc64']),
    sc('contra2', '魂斗罗·工厂渗透', '50 关 + 无尽 · 本地双人 · 机械关', '#3a4460', '#141a2a', ['\ud83e\udd16', '\ud83d\udd2b', '\ud83d\udc64']),
    sc('pinball', '三维弹球', '50 关 + 无尽 · 太空军校生 · 挡板弹射', '#2a2440', '#0e0a1c', ['\ud83d\udccf', '\u2b50', '\ud83d\udca5']),

    // 本轮新增（1 款）
    sc('cookingfever', '烹饪发烧友', '50 关 + 无尽 · 读单做菜 · 托盘凑齐自动上菜', '#e8a04a', '#7a3a12', ['\ud83c\udf74', '\ud83c\udf7f', '\ud83e\udd80', '\ud83c\udf66']),
    sc('danmaku', '弹幕樱华祭', '20 关 + 无尽 · 东方风弹幕 · 躲弹幕击破 BOSS 符卡', '#1a0a2e', '#3a1040', ['\ud83c\udf86', '\u2728', '\ud83e\udd8c']),
];

// 场景缩略图生成器：渐变底 + 圆角边框 + 装饰光斑 + emoji 组合
// items: [emoji, x, y, size]
function sceneThumb(c1, c2, items) {
    const id = 'st' + Math.abs(hashStr(c1 + c2 + items.map(i => i[0]).join('')));
    return `<svg viewBox="0 0 88 60" width="100%" height="100%">
        <defs>
            <linearGradient id="${id}" x1="0" y1="0" x2="0.7" y2="1">
                <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
            </linearGradient>
        </defs>
        <rect width="88" height="60" rx="10" fill="url(#${id})"/>
        <circle cx="12" cy="50" r="16" fill="#fff" opacity="0.10"/>
        <circle cx="80" cy="8" r="12" fill="#fff" opacity="0.12"/>
        <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.4"/>
        ${items.map(([e, x, y, s]) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${s}">${e}</text>`).join('')}
    </svg>`;
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// 暗棋圣手专属缩略图：宋国小人（长翅幞头）vs 金国小人（皮草帽），Q 版对峙
function banqiThumb() {
    return `<svg viewBox="0 0 88 60" width="100%" height="100%">
        <defs>
            <linearGradient id="tgbq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#8a5a2f"/><stop offset="1" stop-color="#4a2c12"/>
            </linearGradient>
            <linearGradient id="tgbqr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#e8634f"/><stop offset="1" stop-color="#a52a2a"/>
            </linearGradient>
            <linearGradient id="tgbqb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#5d6f9e"/><stop offset="1" stop-color="#2c3a56"/>
            </linearGradient>
        </defs>
        <rect width="88" height="60" fill="url(#tgbq)"/>
        <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="#ffd56b" stroke-width="1.2" stroke-opacity="0.55"/>
        <!-- 宋国小人（左，红） -->
        <g>
            <path d="M20 32 Q28 29 36 32 L40 52 Q28 56 16 52 Z" fill="url(#tgbqr)"/>
            <circle cx="28" cy="24" r="9" fill="#ffe3c8"/>
            <ellipse cx="25" cy="24" rx="1.7" ry="2.1" fill="#1c1c28"/>
            <ellipse cx="31" cy="24" rx="1.7" ry="2.1" fill="#1c1c28"/>
            <path d="M25 29 Q28 31 31 29" stroke="#a04848" stroke-width="1.2" fill="none" stroke-linecap="round"/>
            <path d="M20.5 18 Q28 12 35.5 18 L35.5 20.5 Q28 17.5 20.5 20.5 Z" fill="#2e2e42"/>
            <line x1="20.5" y1="17.5" x2="9" y2="16" stroke="#2e2e42" stroke-width="2" stroke-linecap="round"/>
            <line x1="35.5" y1="17.5" x2="47" y2="16" stroke="#2e2e42" stroke-width="2" stroke-linecap="round"/>
            <circle cx="28" cy="12.5" r="1.8" fill="#ffd56b"/>
        </g>
        <!-- 金国小人（右，蓝） -->
        <g>
            <path d="M52 32 Q60 29 68 32 L72 52 Q60 56 48 52 Z" fill="url(#tgbqb)"/>
            <circle cx="60" cy="24" r="9" fill="#f5cfa3"/>
            <ellipse cx="57" cy="24" rx="1.7" ry="2.1" fill="#1c1c28"/>
            <ellipse cx="63" cy="24" rx="1.7" ry="2.1" fill="#1c1c28"/>
            <path d="M55 21.5 L59 23 M61 23 L65 21.5" stroke="#1c1c28" stroke-width="1.1" stroke-linecap="round"/>
            <path d="M57 29 Q60 27.6 63 29" stroke="#a04848" stroke-width="1.2" fill="none" stroke-linecap="round"/>
            <ellipse cx="60" cy="14.5" rx="8.4" ry="4.2" fill="#7a839a"/>
            <circle cx="54.5" cy="17" r="1.9" fill="#e9ecf4"/>
            <circle cx="65.5" cy="17" r="1.9" fill="#e9ecf4"/>
            <path d="M69 17 q3.5 4 2 8" stroke="#2a2a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        </g>
        <!-- VS -->
        <text x="44" y="34" text-anchor="middle" font-size="13" font-weight="900" fill="#ffd56b" stroke="#40260f" stroke-width="2.5" paint-order="stroke" font-family="Arial Black, sans-serif">VS</text>
    </svg>`;
}

// 2048 专属缩略图：绿毒蛇 + 蓝毒蛇 + 蛇精对峙（葫芦娃妖怪风）
function g2048Thumb() {
    return `<svg viewBox="0 0 88 60" width="100%" height="100%">
        <defs>
            <linearGradient id="tg2048" x1="0" y1="0" x2="0.6" y2="1">
                <stop offset="0" stop-color="#5a7a9f"/><stop offset="1" stop-color="#2c3e6a"/>
            </linearGradient>
        </defs>
        <rect width="88" height="60" fill="url(#tg2048)"/>
        <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="#ffd56b" stroke-width="1.2" stroke-opacity="0.55"/>
        <!-- L1 绿蛇（左下） -->
        <g transform="translate(8 26)">
            <path d="M0 12 Q5 8 10 12 Q15 16 20 8" stroke="#5a8a3a" stroke-width="4" fill="none" stroke-linecap="round"/>
            <ellipse cx="20" cy="8" rx="4.5" ry="3.5" fill="#7adf7a" stroke="#5a8a3a" stroke-width="0.8"/>
            <circle cx="22" cy="7" r="1.4" fill="#fff"/><circle cx="22.2" cy="7" r="0.7" fill="#000"/>
            <circle cx="6.5" cy="9" r="2.4" fill="#fff"/><text x="6.5" y="10" text-anchor="middle" font-size="3" font-weight="bold" fill="#3a7a3a">1</text>
        </g>
        <!-- L2 蓝蛇（中上） -->
        <g transform="translate(28 8)">
            <path d="M0 10 Q4 4 8 8 Q12 14 18 6" stroke="#3a4d8f" stroke-width="4" fill="none" stroke-linecap="round"/>
            <ellipse cx="18" cy="6" rx="4.8" ry="3.5" fill="#a8b8f0" stroke="#3a4d8f" stroke-width="0.8" transform="rotate(-15 18 6)"/>
            <path d="M16 5 L21 4 L17.5 7 Z" fill="#3a4d8f"/>
            <circle cx="20" cy="5" r="1.4" fill="#fff"/><circle cx="20.2" cy="5" r="0.7" fill="#000"/>
            <circle cx="6.5" cy="6" r="2.4" fill="#fff"/><text x="6.5" y="7" text-anchor="middle" font-size="3" font-weight="bold" fill="#3a4d8f">2</text>
        </g>
        <!-- L11 蛇精（右上 + 王冠） -->
        <g transform="translate(54 12)">
            <path d="M0 22 Q-4 14 4 10 Q12 6 18 14" stroke="#3a1a5f" stroke-width="4" fill="none" stroke-linecap="round"/>
            <ellipse cx="20" cy="14" rx="5.5" ry="4" fill="#b59cd8" stroke="#3a1a5f" stroke-width="0.8"/>
            <path d="M16 9 L18 6 L20 9 L22 5 L24 9" stroke="#ffd56b" stroke-width="1.2" fill="none" stroke-linecap="round"/>
            <ellipse cx="19" cy="13.5" rx="1.2" ry="0.6" fill="#ff5050" transform="rotate(20 19 13.5)"/>
            <ellipse cx="22" cy="14.5" rx="1.2" ry="0.6" fill="#ff5050" transform="rotate(-15 22 14.5)"/>
            <circle cx="6" cy="11" r="3" fill="#fff"/><text x="6" y="12" text-anchor="middle" font-size="3.6" font-weight="bold" fill="#3a1a5f">11</text>
        </g>
        <!-- 标题 -->
        <text x="44" y="52" text-anchor="middle" font-size="6.5" font-weight="bold" fill="#ffd56b" font-family="Microsoft YaHei, sans-serif" stroke="#1a2a4a" stroke-width="1.5" paint-order="stroke">降妖伏魔</text>
    </svg>`;
}

    // 烹饪发烧友专属缩略图：厨师帽 + 汉堡薯条饮料
    function cookingThumb() {
        return `<svg viewBox="0 0 88 60" width="100%" height="100%">
            <defs>
                <linearGradient id="tcook" x1="0" y1="0" x2="0.6" y2="1">
                    <stop offset="0" stop-color="#e8a04a"/><stop offset="1" stop-color="#7a3a12"/>
                </linearGradient>
            </defs>
            <rect width="88" height="60" fill="url(#tcook)"/>
            <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="#ffe0a8" stroke-width="1.2" stroke-opacity="0.55"/>
            <!-- 厨师帽 -->
            <g transform="translate(20 8)">
                <ellipse cx="10" cy="14" rx="13" ry="8" fill="#fff"/>
                <rect x="2" y="13" width="16" height="11" rx="3" fill="#fff"/>
                <rect x="2" y="21" width="16" height="2.5" fill="#e8a04a"/>
            </g>
            <!-- 盘子 -->
            <ellipse cx="58" cy="40" rx="22" ry="8" fill="#fff" opacity="0.85"/>
            <ellipse cx="58" cy="39" rx="16" ry="5.5" fill="#e8d6b0"/>
            <text x="49" y="40" text-anchor="middle" font-size="12">\ud83c\udf74</text>
            <text x="61" y="40" text-anchor="middle" font-size="12">\ud83c\udf7f</text>
            <text x="72" y="40" text-anchor="middle" font-size="12">\ud83e\udd80</text>
            <text x="44" y="56" text-anchor="middle" font-size="7" font-weight="bold" fill="#ffe0a8" font-family="Microsoft YaHei, sans-serif">现做现卖</text>
        </svg>`;
    }

    function danmakuThumb() {
        // 巫女剪影 + 放射状弹幕
        let bullets = '';
        for (let i = 0; i < 16; i++) {
            const a = i / 16 * Math.PI * 2, r1 = 16, r2 = 26 + (i % 3) * 5;
            bullets += `<circle cx="${(44 + Math.cos(a) * r2).toFixed(1)}" cy="${(30 + Math.sin(a) * r2).toFixed(1)}" r="2.2" fill="#ff6fae"/>`;
            bullets += `<line x1="${(44 + Math.cos(a) * r1).toFixed(1)}" y1="${(30 + Math.sin(a) * r1).toFixed(1)}" x2="${(44 + Math.cos(a) * r2).toFixed(1)}" y2="${(30 + Math.sin(a) * r2).toFixed(1)}" stroke="rgba(255,111,174,.5)" stroke-width="1"/>`;
        }
        return `<svg viewBox="0 0 88 60" width="100%" height="100%">
            <defs><linearGradient id="dk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a0a2e"/><stop offset="1" stop-color="#3a1040"/></linearGradient></defs>
            <rect width="88" height="60" rx="10" fill="url(#dk)"/>
            <circle cx="44" cy="30" r="22" fill="#ff6fae" opacity="0.10"/>
            ${bullets}
            <g transform="translate(44,30)">
                <path d="M-7,10 L7,10 L4,-1 L-4,-1 Z" fill="#f4f0ff"/>
                <circle cx="0" cy="-7" r="5" fill="#ffe0c4"/>
                <path d="M-5,-8 A5,5 0 0 1 5,-8 Z" fill="#3a2b4a"/>
                <circle cx="-6" cy="-9" r="1.6" fill="#e23b5a"/><circle cx="6" cy="-9" r="1.6" fill="#fff"/>
            </g>
            <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.4"/>
        </svg>`;
    }

    // 2048 / 暗棋 / 烹饪 / 弹幕 使用专属手绘缩略图
    (function () {
        const g2 = GAMES.find(g => g.id === 'g2048'); if (g2) g2.thumb = g2048Thumb();
        const g3 = GAMES.find(g => g.id === 'banqi'); if (g3) g3.thumb = banqiThumb();
        const g4 = GAMES.find(g => g.id === 'cookingfever'); if (g4) g4.thumb = cookingThumb();
        const g5 = GAMES.find(g => g.id === 'danmaku'); if (g5) g5.thumb = danmakuThumb();
    })();

window.MinigamesView = MinigamesView;
