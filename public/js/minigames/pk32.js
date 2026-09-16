// PK32 原版迁移馆：独立于当前小游戏的关卡、星级和存档系统。
// 名称来自对 Pk32.exe 运行时菜单的只读提取；未完成重写的项目明确显示迁移状态。
(function () {
    window.MiniGames = window.MiniGames || {};

    const NAMES = (
        '跟花|丰收|锄大地|拱猪|十点半|钓鱼|争上游|抽乌龟|梭哈|牌九|扑克麻将|百智牌|FF8卡片|比大小|移动|接龙|争夺|同花|三打三|记忆|变幻牌|挑选|暗牌|扑克扫雷|24点|追逐|炮牌|记数|转换|配对|连击|猜数|连珠牌|幸运|读心术|梭哈二|井字牌|憋七|FF9卡片|7鬼523|斗地主|拖拉机-升级|纸牌魔法阵|别棍|纸牌|空当接龙|蜘蛛纸牌|14点|考眼力|21点|读心术二|13点|24点二|扎金花|纸牌算命|抽乌龟二|排数字|变色龙|抽乌龟三|接水管|读心术三|超级99|重合|梭哈三|桥桥|桥牌|梭哈四|读心术四|21点二|塔罗牌|梭哈五|抽乌龟四|幸运数字|40点|抽乌龟五|梭哈六|数字魔方|三张牌|梭哈七|魔力纸牌|跟花二|接龙二|扫雷|赛马|俄罗斯方块|飞行棋|贪吃蛇|独粒钻石|推箱子|火箭大战|打地鼠|黑白棋|同色方块|同步移动|摘花朵|平面魔方|激光坦克|华容道|强手棋|五彩连珠|跳棋|中国象棋|五子棋|围棋|象棋-暗棋|国际象棋|军棋|斗兽棋|迷宫|正方形棋|军棋-暗棋|麻将|极品飞车|六子连珠|拼图|天地棋|七彩宝石|宝石方块|连结电线|魔塔|开心辞典|开心灯谜|冒泡大战|剪刀石头布|海盗船|神符|原子|木乃伊|记忆考验|反应测试|海豚骰|汉诺塔|魔力珠宝|前进棋|智商测试|轮盘|老虎机|五连板|白手起家|连连看|扫雷二|泡泡彩球|跳跃棋|像素岛|找不同|找彩球|变化彩球|捡棋子|成语填字|邻居|麻将王|麻将王二|麻将王三|魔塔二|多彩泡泡|魔塔三|过河|电磁彩球|绿洲|魅力之球|魔塔四|推箱子二|圈地|推箱子三|推箱子四|推箱子五|连结电线二|移彩球|数独|智慧之光|禅宗花园|骰子王|数谜|航海迷题|魔法城堡|弹力连珠|魔法城堡二|潜艇大战|绝妙飞行|跳棋二|推箱子六|拼疑犯|十字绣|变色彩球|扩展线路|禅宗迷宫|飞镖王|马跳棋盘|打砖块|爆破彩球|爆破彩球二|花式九球|美式落袋|斯诺克|七盏灯|交换彩球|上一百层|下一百层|宇宙黑洞|飞一百米|七巧板|坦克大战|海底寻宝|碰撞彩球|四子棋|立体魔方|彩球迷宫|反射镜|企鹅|立体魔方二|吃豆子|彩球连线|建筑制造'
    ).split('|');

    const EVIDENCE = {
        '魔塔': '22 层原版地图与美术已还原；剧情、商店和机关仍在迁移',
        '独粒钻石': '17 个原生初始化棋盘、横纵连续跳吃与中心终局评分已接入；原生绘制和演示仍待确认',
        '同色方块': '3 张 12×16 原生盘面与至少两个连续同色消除规则已接入；原版关数和美术仍待确认',
        '强手棋': '原版棋盘、四名角色和地产美术已还原；完整规则仍在迁移',
        '接水管': '12×8 原生棋盘、难度 1-5、60 秒倒计时、随机管件与扣时规则已接入；6 条原始载荷待继续解码',
        '同步移动': '261 条原生载荷已提取；坐标分组与白黑棋状态规则待核对',
        '木乃伊': '222 条原生载荷、宽高和坐标序列已提取；人物、木乃伊与出口映射待核对',
        '电磁彩球': '160 个 16×16 原生盘面和移动彩球/固定球规则已接入；原版美术仍待绑定',
        '建筑制造': '已确认 29 组 16×12 盘面与 6×6/29 字符描述成对出现；方块、炸弹和传感器状态机待逆向',
    };
    // 只有明确存在对应实现的项目才提供启动按钮；按钮文案刻意标明适配状态。
    const PLAYABLE = {
        '魔塔': { gameId: 'tower', label: '魔塔原图版', note: '22 层原版地图；剧情和机关尚未全部还原' },
        '强手棋': { gameId: 'pk32-richman', label: 'PK32 强手棋原版迁移', note: '使用 PK32 独立棋盘、资产和存档' },
        '推箱子四': { gameId: 'pk32-sokoban4', label: 'PK32 推箱子四原版迁移', note: '使用原生 23 关、原始图块和演示' },
        '智慧之光': { gameId: 'pk32-light', label: 'PK32 智慧之光原版迁移', note: '使用原版棋盘编码、精灵图与 20 段演示回放验证' },
    };
    const MODULE_CONFIG = {
        '五子棋': { family: 'board', id: 'gomoku' }, '四子棋': { family: 'board', id: 'connect4' },
        '黑白棋': { family: 'board', id: 'reversi' }, '跳棋': { family: 'board', id: 'checkers' },
        '井字牌': { family: 'board', id: 'tictactoe' }, '斗兽棋': { family: 'board', id: 'jungle' },
    };
    const CASUAL_CONFIG = {
        '接龙': 'solitaire', '接龙二': 'solitaire', '空当接龙': 'freecell', '蜘蛛纸牌': 'spider',
        '21点': 'blackjack', '21点二': 'blackjack', '比大小': 'highlow', '扫雷': 'minesweeper',
        '扫雷二': 'minesweeper', '扑克扫雷': 'minesweeper', '连连看': 'mahjong-connect',
        '推箱子': 'sokoban', '推箱子二': 'sokoban', '推箱子三': 'sokoban',
        '推箱子五': 'sokoban', '推箱子六': 'sokoban',
        '泡泡彩球': 'bubble-match', '多彩泡泡': 'bubble-match',
        '爆破彩球二': 'bubble-match', '变色彩球': 'bubble-match', '交换彩球': 'bubble-match',
    };
    const ACTION_CONFIG = {
        '打地鼠': 'whackMole', '俄罗斯方块': 'tetris', '贪吃蛇': 'snake',
        '飞镖王': 'dartKing', '飞一百米': 'hundredMeters', '吃豆子': 'pacMan',
        '火箭大战': 'rocketBattle', '绝妙飞行': 'flight',
    };
    const STRATEGY_CONFIG = {};
    ['飞行棋', '前进棋', '赛马', '轮盘', '老虎机', '神符', '原子', '开心辞典', '开心灯谜', '七盏灯', '上一百层', '下一百层'].forEach(name => { STRATEGY_CONFIG[name] = name; });
    ['七盏灯', '上一百层', '下一百层'].forEach(name => { delete STRATEGY_CONFIG[name]; });
    const CARD_CONFIG = {};
    const CARD_NAMES = '跟花|丰收|拱猪|十点半|钓鱼|争上游|抽乌龟|梭哈|牌九|扑克麻将|百智牌|FF8卡片|移动|争夺|同花|三打三|记忆|变幻牌|挑选|暗牌|24点|炮牌|猜数|幸运|读心术|斗地主|拖拉机-升级|纸牌魔法阵|别棍|14点|考眼力|13点|扎金花|纸牌算命|桥牌|塔罗牌|数字魔方|三张牌|魔力纸牌|梭哈二|纸牌|抽乌龟二|抽乌龟三|读心术三|梭哈三|梭哈四|读心术四|梭哈五|抽乌龟四|抽乌龟五|梭哈六|梭哈七|跟花二'.split('|');
    CARD_NAMES.forEach(name => { CARD_CONFIG[name] = name; });
    '梭哈二|梭哈三|梭哈四|梭哈五|梭哈六|梭哈七|抽乌龟二|抽乌龟三|抽乌龟四|抽乌龟五|读心术三|读心术四|跟花二|纸牌|21点二|24点二'.split('|').forEach(name => { CARD_CONFIG[name] = name; });
    const PUZZLE_CONFIG = {};
    '五彩连珠|七彩宝石|宝石方块|找不同|找彩球|变化彩球|连结电线|连结电线二|移彩球|数独|迷宫|推箱子二|推箱子三|推箱子四|推箱子五|推箱子六|扩展线路|立体魔方|七巧板|汉诺塔|十字绣|拼图|独粒钻石'.split('|').forEach(name => { PUZZLE_CONFIG[name] = name; });
    const VARIANT_CONFIG = {};
    delete PUZZLE_CONFIG['推箱子四'];
    '锄大地|追逐|记数|转换|配对|连击|连珠牌|憋七|FF9卡片|7鬼523|读心术二|24点二|排数字|变色龙|超级99|重合|幸运数字|40点|数字魔方|同色方块|同色方块变体|同步移动|摘花朵|平面魔方|激光坦克|中国象棋|围棋|象棋-暗棋|国际象棋|军棋|正方形棋|军棋-暗棋|麻将|极品飞车|六子连珠|天地棋|冒泡大战|剪刀石头布|海盗船|木乃伊|记忆考验|反应测试|海豚骰|魔力珠宝|智商测试|五连板|白手起家|跳跃棋|像素岛|捡棋子|成语填字|邻居|麻将王|麻将王二|麻将王三|过河|电磁彩球|爆破彩球|绿洲|魅力之球|圈地|禅宗花园|骰子王|数谜|航海迷题|魔法城堡|弹力连珠|魔法城堡二|潜艇大战|跳棋二|拼疑犯|禅宗迷宫|马跳棋盘|花式九球|美式落袋|斯诺克|七盏灯|宇宙黑洞|飞一百米|打砖块|海底寻宝|碰撞彩球|彩球迷宫|反射镜|企鹅|立体魔方二|彩球连线|建筑制造|上一百层|下一百层|魔塔二|魔塔三|魔塔四|桥桥'.split('|').forEach(name => { VARIANT_CONFIG[name] = name; });
    VARIANT_CONFIG['坦克大战'] = '坦克大战';
    VARIANT_CONFIG['华容道'] = '华容道';
    VARIANT_CONFIG['接水管'] = '接水管';
    delete VARIANT_CONFIG['斗兽棋'];
    ['井字牌', '黑白棋', '跳棋', '五子棋', '斗兽棋', '四子棋'].forEach(name => { delete VARIANT_CONFIG[name]; });
    const GROUPS = [
        [0, 80, '扑克与纸牌'], [80, 147, '棋类与益智'], [147, 196, '休闲与解谜'], [196, NAMES.length, '其他原版游戏'],
    ];
    const STRUCTURED_VARIANT_NAMES = '考眼力|24点二|21点二|梭哈六|三张牌|接龙二|平面魔方|激光坦克|开心辞典|记忆考验|反应测试|海豚骰|汉诺塔|老虎机|跳跃棋|找不同|找彩球|变化彩球|推箱子二|移彩球|数独|跳棋二|拼疑犯|扩展线路|马跳棋盘|彩球迷宫|吃豆子|彩球连线'.split('|');
    const DEDICATED_VARIANT_NAMES = '接水管|同色方块|同步移动|木乃伊|电磁彩球|建筑制造|航海迷题|立体魔方二|反射镜|交换彩球|爆破彩球|坦克大战|海底寻宝|七盏灯|推箱子五|禅宗迷宫|禅宗花园|像素岛|跟花二|魔法城堡二|魔法城堡|连结电线二|七巧板|宇宙黑洞|下一百层|上一百层|飞一百米|打砖块|魔塔二|魔塔三|魔塔四'.split('|');
    STRUCTURED_VARIANT_NAMES.forEach(name => { VARIANT_CONFIG[name] = name; });
    DEDICATED_VARIANT_NAMES.forEach(name => { VARIANT_CONFIG[name] = name; });
    const DEDICATED_NAMES = new Set([
        ...Object.keys(PLAYABLE), ...Object.keys(MODULE_CONFIG), '独粒钻石', ...STRUCTURED_VARIANT_NAMES, ...DEDICATED_VARIANT_NAMES,
    ]);

    function esc(s) {
        return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    }
    function groupOf(index) {
        const hit = GROUPS.find(g => index >= g[0] && index < g[1]);
        return hit ? hit[2] : '未分类';
    }
    function statusTags(record) {
        const migrationText = record.migrationComplete ? '内容迁移完成'
            : record.migrationPhase === 'partial-content-migration' ? '内容部分迁移'
            : record.migrationPhase === 'payload-migration' ? '原始载荷已绑定'
            : record.status === 'structured-assignment-review' ? '结构已解析，归属待复核'
            : record.status === 'payload-assignment-review' ? '载荷归属待复核'
            : '内容待迁移';
        const verificationText = record.verificationComplete ? '原版验证完成' : '原版待验证';
        const resourceText = record.resources && record.resources.resourcePackageBound ? '<span class="emu-tag" style="color:#8fd8ff;border-color:rgba(143,216,255,.35)">原始资源包已绑定</span>' : '';
        return resourceText + '<span class="emu-tag" style="color:#ffd56b;border-color:rgba(255,213,107,.35)">' + esc(migrationText) + '</span>' +
            '<span class="emu-tag" style="color:' + (record.verificationComplete ? '#84e6ad' : '#b8c0cc') + ';border-color:' + (record.verificationComplete ? 'rgba(132,230,173,.35)' : 'rgba(184,192,204,.25)') + '">' + esc(verificationText) + '</span>';
    }
    function looksLikeRawPayloadText(text) {
        const value = String(text || '').trim();
        if (value.length < 8 || /[\u4e00-\u9fff]/.test(value) || !/^[0-9A-Z]+$/i.test(value)) return false;
        if (value.length >= 32) return true;
        const digits = (value.match(/\d/g) || []).length;
        return digits / value.length >= 0.5;
    }
    function firstReadableHelp(list) {
        if (!Array.isArray(list)) return '';
        return list.find(text => {
            const value = String(text || '').trim();
            return value.length >= 4 && !looksLikeRawPayloadText(value);
        }) || '';
    }
    function records() {
        return NAMES.map((name, index) => ({
            id: 'pk32-' + String(index + 1).padStart(3, '0'),
            name, index: index + 1, group: groupOf(index),
            status: DEDICATED_NAMES.has(name) ? 'rules-partial' : 'evidence-bound',
            dedicated: DEDICATED_NAMES.has(name),
            dedicatedLauncher: PLAYABLE[name] ? 'playable' : MODULE_CONFIG[name] ? 'module' : name === '独粒钻石' ? 'puzzle' : DEDICATED_NAMES.has(name) ? 'variant' : null,
            originalComplete: false,
            levelText: name === '魔塔' ? '原版地图：22 层' : name === '强手棋' ? '原版棋盘：40 格' : name === '接水管' ? '原版关数：5（原生提示）' : '原版关数：待核对',
            evidence: EVIDENCE[name] || '已从 PK32 原版菜单识别，等待资源与规则迁移',
            playable: PLAYABLE[name] || null,
            module: MODULE_CONFIG[name] || null,
            casual: CASUAL_CONFIG[name] || null,
            action: ACTION_CONFIG[name] || null,
            strategy: STRATEGY_CONFIG[name] || null,
            card: CARD_CONFIG[name] || null,
            puzzle: PUZZLE_CONFIG[name] || null,
            variant: VARIANT_CONFIG[name] || null,
        }));
    }

    let CATALOG = records();
    function applyNativeCatalog(data) {
        const rows = data && Array.isArray(data.records) ? data.records : [];
        CATALOG.forEach(record => {
            const native = rows.find(row => row.id === record.id);
            if (!native) return;
            record.native = native;
            if (native.levelCount != null) record.levelText = '原版关数：' + native.levelCount;
            else if (native.payloadCount) record.levelText = '原版数据串：' + native.payloadCount + ' 条，关数待核对';
            if (!record.dedicated) {
                record.status = record.structured
                    ? 'structured-assignment-review'
                    : native.payloadCount && native.payloadAssignment && native.payloadAssignment.confidence === 'low'
                    ? 'payload-assignment-review'
                    : native.payloadProfile && /^(dimension-prefix|compact-dimension)/.test(native.payloadProfile.dominantFamily || '')
                        ? 'structured-assignment-review'
                    : native.payloadCount ? 'payload-awaiting-adapter' : 'evidence-bound';
            }
            const readableHelp = firstReadableHelp(native.help);
            if (readableHelp && record.name !== '魔塔' && record.name !== '强手棋') {
                record.evidence = readableHelp;
            }
        });
    }
    function applyStructuredCatalog(data) {
        const rows = data && Array.isArray(data.games) ? data.games : [];
        rows.forEach(structured => {
            const record = CATALOG.find(item => item.id === structured.id);
            if (!record) return;
            record.structured = structured;
            if (!record.dedicated) record.status = 'structured-assignment-review';
        });
    }
    function applyMigrationStatus(data) {
        const rows = data && Array.isArray(data.records) ? data.records : [];
        rows.forEach(status => {
            const record = CATALOG.find(item => item.id === status.id);
            if (!record) return;
            record.migration = status.migration;
            record.verification = status.verification;
            record.migrationComplete = status.migrationComplete === true;
            record.verificationComplete = status.verificationComplete === true;
            record.migrationEvidence = status.migrationEvidence;
            record.migrationPhase = status.migrationPhase;
            record.originalComplete = status.originalComplete === true;
        });
    }
    function applyResourceManifest(data) {
        const rows = data && Array.isArray(data.records) ? data.records : [];
        rows.forEach(resource => {
            const record = CATALOG.find(item => item.id === resource.id);
            if (record) record.resources = resource;
        });
    }
    // 按后台保存的顺序重排目录（顺序以 id 数组给定；未出现的排末尾）
    function applyOrder(ids) {
        if (!Array.isArray(ids) || !ids.length) return;
        const rank = new Map();
        ids.forEach((id, i) => rank.set(id, i));
        CATALOG.sort((a, b) => {
            const ra = rank.has(a.id) ? rank.get(a.id) : 1e9;
            const rb = rank.has(b.id) ? rank.get(b.id) : 1e9;
            return ra - rb;
        });
        CATALOG.forEach((rec, i) => { rec.index = i + 1; });
    }
    const api = {
        CATALOG,
        LEVELS: [],
        start(container, opts) {
            opts = opts || {};
            let alive = true;
            let activeSession = null;
            const all = CATALOG;
            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.className = 'emu-wrap';
            wrap.style.maxWidth = '1000px';
            wrap.innerHTML =
                '<div class="emu-note"><b>PK32 原版迁移馆</b><br>' +
                '这里独立维护 PK32 的原版流程、关卡数量、资源和存档，不套用当前小游戏的 50 关模板。' +
                '<br><span class="emu-tip">当前已收录 ' + all.length + ' 项；“原版关数”只在完成数据核对后填写。</span></div>' +
                '<div class="emu-toolbar"><input id="pk32-q" placeholder="搜索 PK32 游戏名"><select id="pk32-group"><option value="">全部分类</option>' +
                [...new Set(all.map(x => x.group))].map(x => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('') +
                '</select><span class="emu-toolbar-count" id="pk32-count"></span></div>' +
                '<div class="emu-list" id="pk32-list"></div>';
            wrap.querySelector('#pk32-q').setAttribute('aria-label', '搜索 PK32 游戏名');
            container.appendChild(wrap);
            const q = wrap.querySelector('#pk32-q');
            const group = wrap.querySelector('#pk32-group');
            const list = wrap.querySelector('#pk32-list');
            const count = wrap.querySelector('#pk32-count');

            function stopActiveSession() {
                if (!activeSession) return;
                const current = activeSession;
                activeSession = null;
                current.disposed = true;
                try {
                    if (current.session && typeof current.session.destroy === 'function') current.session.destroy();
                    else if (current.session && typeof current.session.stop === 'function') current.session.stop();
                } catch (e) {}
                if (current.host) current.host.innerHTML = '';
            }

            function render() {
                if (!alive || activeSession) return;
                wrap.classList.remove('pk32-playing');
                const keyword = q.value.trim().toLowerCase();
                const filtered = all.filter(x => (!keyword || x.name.toLowerCase().includes(keyword)) && (!group.value || x.group === group.value));
                count.textContent = filtered.length + ' / ' + all.length + ' 项';
                list.innerHTML = filtered.map(x =>
                    '<div class="emu-item" data-pk32-id="' + esc(x.id) + '">' +
                    '<div class="emu-item-info"><div class="emu-item-name">' + esc(x.index + '. ' + x.name) + '</div>' +
                    '<div class="emu-item-meta">' + esc(x.group) + ' · ' + esc(x.levelText) + '</div>' +
                    '<div class="emu-item-meta">' + esc(x.evidence) + '</div></div>' +
            (x.dedicatedLauncher === 'playable' ? '<button class="btn ghost pk32-launch" data-pk32-launch="' + esc(x.id) + '">' + esc(x.playable.label) + '</button>' : '') +
                    (x.dedicatedLauncher === 'module' ? '<button class="btn ghost pk32-module-launch" data-pk32-module="' + esc(x.id) + '">独立启动</button>' : '') +
                    (x.dedicatedLauncher === 'puzzle' ? '<button class="btn ghost pk32-puzzle-launch" data-pk32-puzzle="' + esc(x.id) + '">独立启动</button>' : '') +
                    (x.dedicatedLauncher === 'variant' ? '<button class="btn ghost pk32-variant-launch" data-pk32-variant="' + esc(x.id) + '">独立启动</button>' : '') +
                    '<button class="btn ghost pk32-evidence-launch" data-pk32-evidence="' + esc(x.id) + '">原始迁移资料</button>' +
                    statusTags(x) + '</div>'
                ).join('');
                list.querySelectorAll('[data-pk32-launch]').forEach(btn => btn.onclick = () => launch(all.find(x => x.id === btn.dataset.pk32Launch)));
                list.querySelectorAll('[data-pk32-module]').forEach(btn => btn.onclick = () => launchModule(all.find(x => x.id === btn.dataset.pk32Module)));
                list.querySelectorAll('[data-pk32-casual]').forEach(btn => btn.onclick = () => launchCasual(all.find(x => x.id === btn.dataset.pk32Casual)));
                list.querySelectorAll('[data-pk32-action]').forEach(btn => btn.onclick = () => launchAction(all.find(x => x.id === btn.dataset.pk32Action)));
                list.querySelectorAll('[data-pk32-strategy]').forEach(btn => btn.onclick = () => launchStrategy(all.find(x => x.id === btn.dataset.pk32Strategy)));
                list.querySelectorAll('[data-pk32-card]').forEach(btn => btn.onclick = () => launchCard(all.find(x => x.id === btn.dataset.pk32Card)));
                list.querySelectorAll('[data-pk32-puzzle]').forEach(btn => btn.onclick = () => launchPuzzle(all.find(x => x.id === btn.dataset.pk32Puzzle)));
                list.querySelectorAll('[data-pk32-variant]').forEach(btn => btn.onclick = () => launchVariant(all.find(x => x.id === btn.dataset.pk32Variant)));
                list.querySelectorAll('[data-pk32-evidence]').forEach(btn => btn.onclick = () => launchEvidence(all.find(x => x.id === btn.dataset.pk32Evidence)));
            }
            function mount(record, title, start, note) {
                stopActiveSession();
                opts.onCatalogState && opts.onCatalogState(false);
                wrap.classList.add('pk32-playing');
                list.innerHTML = '<div class="emu-note"><b>' + esc(record.name) + ' · ' + esc(title) + '</b><br>' + esc(note || '独立 PK32 迁移玩法；不使用 50 关模板。') + '</div>';
                const host = document.createElement('div'); host.style.cssText = 'min-height:420px;margin-top:12px;'; list.appendChild(host);
                const back = document.createElement('button'); back.className = 'btn ghost'; back.textContent = '返回 PK32 目录'; back.style.marginTop = '10px'; back.onclick = () => { stopActiveSession(); render(); opts.onCatalogState && opts.onCatalogState(true); }; list.appendChild(back);
                const entry = { session: null, host: host, disposed: false };
                const isCurrent = () => alive && !entry.disposed && activeSession === entry;
                const registerSession = session => {
                    if (!session) return null;
                    if (!isCurrent()) {
                        try { if (typeof session.destroy === 'function') session.destroy(); else if (typeof session.stop === 'function') session.stop(); } catch (e) {}
                        return null;
                    }
                    if (entry.session && entry.session !== session) {
                        try { if (typeof entry.session.destroy === 'function') entry.session.destroy(); else if (typeof entry.session.stop === 'function') entry.session.stop(); } catch (e) {}
                    }
                    entry.session = session;
                    return session;
                };
                activeSession = entry;
                try {
                    registerSession(start(host, registerSession, isCurrent));
                } catch (e) { entry.disposed = true; activeSession = null; host.innerHTML = '<div style="padding:20px;color:#ff7a8b">启动失败：' + esc(e.message) + '</div>'; }
            }
            function launchModule(record) {
                const mod = window.PK32Board, spec = record && record.module;
                if (!mod || !mod.startUI) return;
                if (spec && spec.id === 'reversi') {
                    mount(record, '黑白棋原始开局版', (host, registerSession, isCurrent) => {
                        const controller = typeof AbortController === 'function' ? new AbortController() : null;
                        fetch('/data/pk32-reversi-levels.json', controller ? { signal: controller.signal } : undefined).then(response => response.json()).then(data => {
                            if (!isCurrent()) return;
                            const picker = document.createElement('select');
                            picker.setAttribute('aria-label', '黑白棋原始开局');
                            (data.levels || []).forEach((level, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = '原始开局 ' + (index + 1); picker.appendChild(option); });
                            host.appendChild(picker);
                            let gameHost = document.createElement('div'); host.appendChild(gameHost);
                            let gameSession = null;
                            function startLevel() { if (!isCurrent()) return; gameHost.innerHTML = ''; const level = data.levels && data.levels[Number(picker.value) || 0]; gameSession = registerSession(mod.startUI(gameHost, spec.id, { onScore: opts.onScore, nativeCells: level && level.cells })); }
                            picker.onchange = startLevel;
                            startLevel();
                        }).catch(error => { if (!isCurrent() || error.name === 'AbortError') return; registerSession(mod.startUI(host, spec.id, { onScore: opts.onScore })); });
                        return { destroy() { if (controller) controller.abort(); } };
                    });
                    return;
                }
                mount(record, '棋类独立版', host => mod.startUI(host, spec.id, { onScore: opts.onScore }));
            }
            function launchCasual(record) {
                const mod = window.PK32Casual, spec = record && record.casual;
                if (!mod || !mod.startGame) return;
                mount(record, '纸牌/益智独立版', host => mod.startGame(host, spec, { onScore: opts.onScore }));
            }
            function launchAction(record) {
                if (record && record.name === '飞一百米') { launchVariant(record); return; }
                const mod = window.PK32Action, spec = record && record.action;
                if (!mod || !mod.startGame) return;
                mount(record, '动作独立版', host => mod.startGame(host, spec, { onScore: opts.onScore }));
            }
            function launchStrategy(record) {
                const mod = window.PK32Strategy, spec = record && record.strategy;
                if (!mod || !mod.startGame) return;
                mount(record, '策略独立版', host => mod.startGame(host, spec, { onScore: opts.onScore }));
            }
            function launchCard(record) {
                if (window.PK32Card) mount(record, '纸牌独立版', host => window.PK32Card.startGame(host, record.card, { onScore: opts.onScore }));
            }
            function launchPuzzle(record) {
                if (record && (record.name === '接水管' || record.name === '七巧板')) { launchVariant(record); return; }
                if (window.PK32Puzzle) mount(record, '益智独立版', host => window.PK32Puzzle.startGame(host, record.puzzle, { onScore: opts.onScore }));
            }
            function launchVariant(record) {
                if (record && /^魔塔[二三四]$/.test(record.name) && window.PK32Tower) {
                    mount(record, record.name + '独立版', host => window.PK32Tower.startUI(host, { set: record.name, layer: 0 }));
                    return;
                }
                if (window.PK32Variants) mount(record, 'PK32 独立版', host => window.PK32Variants.startGame(host, record.variant || record.name, { onScore: opts.onScore }));
            }
            function launchEvidence(record) {
                if (!record || !window.PK32Evidence) return;
                mount(record, '原始迁移资料', host => window.PK32Evidence.start(host, record), '只读展示原始名称、文本、载荷和关卡证据；不执行未验证规则。');
            }
            function launch(record) {
                const spec = record && record.playable;
                if (spec && spec.gameId === 'tower') {
                    mount(record, '魔塔原版独立版', host => window.PK32Tower.startUI(host, { onScore: opts.onScore }));
                    return;
                }
                if (spec && spec.gameId === 'pk32-richman') {
                    mount(record, '强手棋原版独立版', host => window.PK32Richman.start(host, { onScore: opts.onScore }));
                    return;
                }
                if (spec && spec.gameId === 'pk32-sokoban4' && window.PK32Sokoban4) {
                    mount(record, '推箱子四原版独立版', host => window.PK32Sokoban4.start(host, { levelIdx: 0 }));
                    return;
                }
                if (spec && spec.gameId === 'pk32-light' && window.PK32Light) {
                    mount(record, '智慧之光原版独立版', host => window.PK32Light.start(host, { onScore: opts.onScore }));
                    return;
                }
                const game = spec && window.MiniGames && window.MiniGames[spec.gameId];
                if (!game) {
                    opts.onScore && opts.onScore('该适配模块尚未加载');
                    return;
                }
                mount(record, spec.label, host => game.start(host, { onScore: opts.onScore, levelIdx: 0, level: game.LEVELS && game.LEVELS[0] }), spec.note);
            }
            q.oninput = render;
            group.onchange = render;
            render();
            opts.onScore && opts.onScore(all.length + ' 项');
            if (window.__MG_TEST) window.__pk32Dbg = { catalog: all, records, groupOf };
            fetch('/data/pk32-native-catalog.json').then(response => response.ok ? response.json() : null).then(data => {
                if (!data || !alive) return;
                applyNativeCatalog(data);
                if (!activeSession) render();
                if (window.__MG_TEST) window.__pk32Dbg = { catalog: all, records, groupOf };
            }).catch(() => {});
            fetch('/data/pk32-structured-payloads.json').then(response => response.ok ? response.json() : null).then(data => {
                if (!data || !alive) return;
                applyStructuredCatalog(data);
                if (!activeSession) render();
            }).catch(() => {});
            fetch('/data/pk32-migration-status.json').then(response => response.ok ? response.json() : null).then(data => {
                if (!data || !alive) return;
                applyMigrationStatus(data);
                if (!activeSession) render();
            }).catch(() => {});
            fetch('/data/pk32-resource-manifest.json').then(response => response.ok ? response.json() : null).then(data => {
                if (!data || !alive) return;
                applyResourceManifest(data);
                if (!activeSession) render();
            }).catch(() => {});
            // 后台 PK32 排序：拉到顺序后重排目录，玩家端展示顺序与后台一致
            if (typeof fetch === 'function') {
                fetch('/api/pk32/order').then(r => r.ok ? r.json() : null).then(d => {
                    if (!d || !alive) return;
                    const ids = (d.full || d.order || []).slice();
                    if (!ids.length) return;
                    applyOrder(ids);
                    if (!activeSession) render();
                    if (window.__MG_TEST) window.__pk32Dbg = { catalog: all, records, groupOf };
                }).catch(() => {});
            }
            return { stop() { alive = false; stopActiveSession(); } };
        },
    };
    window.MiniGames.pk32 = api;
    window.PK32Catalog = CATALOG;
})();
