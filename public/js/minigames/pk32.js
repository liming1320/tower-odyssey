// PK32 原版迁移馆：独立于当前小游戏的关卡、星级和存档系统。
// 名称来自对 Pk32.exe 运行时菜单的只读提取；未完成重写的项目明确显示迁移状态。
(function () {
    window.MiniGames = window.MiniGames || {};

    const NAMES = (
        '跟花|丰收|锄大地|拱猪|十点半|钓鱼|争上游|抽乌龟|梭哈|牌九|扑克麻将|百智牌|FF8卡片|比大小|移动|接龙|争夺|同花|三打三|记忆|变幻牌|挑选|暗牌|扑克扫雷|24点|追逐|炮牌|记数|转换|配对|连击|猜数|连珠牌|幸运|读心术|梭哈二|井字牌|憋七|FF9卡片|7鬼523|斗地主|拖拉机-升级|纸牌魔法阵|别棍|纸牌|空当接龙|蜘蛛纸牌|14点|考眼力|21点|读心术二|13点|24点二|扎金花|纸牌算命|抽乌龟二|排数字|变色龙|抽乌龟三|接水管|读心术三|超级99|重合|梭哈三|桥牌|????|梭哈四|读心术四|21点二|塔罗牌|梭哈五|抽乌龟四|幸运数字|40点|抽乌龟五|梭哈六|数字魔方|三张牌|梭哈七|魔力纸牌|跟花二|接龙二|扫雷|赛马|俄罗斯方块|飞行棋|贪吃蛇|独粒钻石|推箱子|火箭大战|打地鼠|黑白棋|同色方块|同步移动|摘花朵|平面魔方|激光坦克|华容道|强手棋|五彩连珠|跳棋|中国象棋|五子棋|围棋|象棋-暗棋|国际象棋|军棋|斗兽棋|迷宫|正方形棋|军棋-暗棋|麻将|极品飞车|六子连珠|拼图|天地棋|七彩宝石|宝石方块|连结电线|魔塔|开心辞典|开心灯谜|冒泡大战|剪刀石头布|海盗船|神符|原子|木乃伊|记忆考验|反应测试|海豚骰|汉诺塔|魔力珠宝|前进棋|智商测试|轮盘|老虎机|五连板|白手起家|连连看|扫雷二|泡泡彩球|跳跃棋|像素岛|找不同|找彩球|变化彩球|捡棋子|成语填字|邻居|麻将王|麻将王二|麻将王三|魔塔二|多彩泡泡|魔塔三|过河|电磁彩球|绿洲|魅力之球|魔塔四|推箱子二|圈地|推箱子三|推箱子四|推箱子五|连结电线二|移彩球|数独|智慧之光|禅宗花园|骰子王|数谜|航海迷题|魔法城堡|弹力连珠|魔法城堡二|潜艇大战|绝妙飞行|跳棋二|推箱子六|拼疑犯|十字绣|变色彩球|扩展线路|禅宗迷宫|飞镖王|马跳棋盘|打砖块|爆破彩球|爆破彩球二|花式九球|美式落袋|斯诺克|七盏灯|交换彩球|上一百层|下一百层|宇宙黑洞|飞一百米|七巧板|坦克大战|海底寻宝|碰撞彩球|四子棋|立体魔方|彩球迷宫|反射镜|企鹅|立体魔方二|吃豆子|彩球连线|建筑制造'
    ).split('|');

    const EVIDENCE = {
        '魔塔': '已提取 22 个地图串、剧情、道具和图集',
        '强手棋': '已提取规则文字、卡片说明和棋盘图集',
        '木乃伊': '已识别名称与相关资源，规则待核对',
    };
    // 只有明确存在对应实现的项目才提供启动按钮；按钮文案刻意标明适配状态。
    const PLAYABLE = {
        '强手棋': { gameId: 'richman', label: '强手棋适配预览', note: '当前使用独立强手棋实现，PK32 原版规则仍在复核' },
    };
    const MODULE_CONFIG = {
        '五子棋': { family: 'board', id: 'gomoku' }, '四子棋': { family: 'board', id: 'connect4' },
        '黑白棋': { family: 'board', id: 'reversi' }, '跳棋': { family: 'board', id: 'checkers' },
        '井字牌': { family: 'board', id: 'tictactoe' }, '斗兽棋': { family: 'board', id: 'animal-chess' },
    };
    const CASUAL_CONFIG = {
        '接龙': 'solitaire', '接龙二': 'solitaire', '空当接龙': 'freecell', '蜘蛛纸牌': 'spider',
        '21点': 'blackjack', '21点二': 'blackjack', '比大小': 'highlow', '扫雷': 'minesweeper',
        '扫雷二': 'minesweeper', '扑克扫雷': 'minesweeper', '连连看': 'mahjong-connect',
        '推箱子': 'sokoban', '推箱子二': 'sokoban', '推箱子三': 'sokoban', '推箱子四': 'sokoban',
        '推箱子五': 'sokoban', '推箱子六': 'sokoban', '接水管': 'pipe-connect',
        '泡泡彩球': 'bubble-match', '多彩泡泡': 'bubble-match', '爆破彩球': 'bubble-match',
        '爆破彩球二': 'bubble-match', '变色彩球': 'bubble-match', '交换彩球': 'bubble-match',
    };
    const GROUPS = [
        [0, 80, '扑克与纸牌'], [80, 147, '棋类与益智'], [147, 196, '休闲与解谜'], [196, NAMES.length, '其他原版游戏'],
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    }
    function groupOf(index) {
        const hit = GROUPS.find(g => index >= g[0] && index < g[1]);
        return hit ? hit[2] : '未分类';
    }
    function records() {
        return NAMES.map((name, index) => ({
            id: 'pk32-' + String(index + 1).padStart(3, '0'),
            name, index: index + 1, group: groupOf(index),
            status: PLAYABLE[name] || MODULE_CONFIG[name] ? 'rules-partial' : 'catalogued',
            levelText: '原版关数：待核对',
            evidence: EVIDENCE[name] || '已从 PK32 原版菜单识别，等待资源与规则迁移',
            playable: PLAYABLE[name] || null,
            module: MODULE_CONFIG[name] || null,
            casual: CASUAL_CONFIG[name] || null,
        }));
    }

    const CATALOG = records();
    const api = {
        CATALOG,
        LEVELS: [],
        start(container, opts) {
            opts = opts || {};
            let alive = true;
            const all = CATALOG;
            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.className = 'emu-wrap';
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

            function render() {
                if (!alive) return;
                const keyword = q.value.trim().toLowerCase();
                const filtered = all.filter(x => (!keyword || x.name.toLowerCase().includes(keyword)) && (!group.value || x.group === group.value));
                count.textContent = filtered.length + ' / ' + all.length + ' 项';
                list.innerHTML = filtered.map(x =>
                    '<div class="emu-item" data-pk32-id="' + esc(x.id) + '">' +
                    '<div class="emu-item-info"><div class="emu-item-name">' + esc(x.index + '. ' + x.name) + '</div>' +
                    '<div class="emu-item-meta">' + esc(x.group) + ' · ' + esc(x.levelText) + '</div>' +
                    '<div class="emu-item-meta">' + esc(x.evidence) + '</div></div>' +
            (x.playable ? '<button class="btn ghost pk32-launch" data-pk32-launch="' + esc(x.id) + '">' + esc(x.playable.label) + '</button>' : '') +
                    (x.module ? '<button class="btn ghost pk32-module-launch" data-pk32-module="' + esc(x.id) + '">独立启动</button>' : '') +
                    (x.casual ? '<button class="btn ghost pk32-casual-launch" data-pk32-casual="' + esc(x.id) + '">独立启动</button>' : '') +
                    '<span class="emu-tag" style="color:#ffd56b;border-color:rgba(255,213,107,.35)">' + esc(x.status === 'rules-partial' ? '规则接入中' : '迁移中') + '</span></div>'
                ).join('');
                list.querySelectorAll('[data-pk32-launch]').forEach(btn => btn.onclick = () => launch(all.find(x => x.id === btn.dataset.pk32Launch)));
                list.querySelectorAll('[data-pk32-module]').forEach(btn => btn.onclick = () => launchModule(all.find(x => x.id === btn.dataset.pk32Module)));
                list.querySelectorAll('[data-pk32-casual]').forEach(btn => btn.onclick = () => launchCasual(all.find(x => x.id === btn.dataset.pk32Casual)));
            }
            function mount(record, title, start) {
                list.innerHTML = '<div class="emu-note"><b>' + esc(record.name) + ' · ' + esc(title) + '</b><br>独立 PK32 迁移玩法；不使用 50 关模板。</div>';
                const host = document.createElement('div'); host.style.cssText = 'min-height:420px;margin-top:12px;'; list.appendChild(host);
                const back = document.createElement('button'); back.className = 'btn ghost'; back.textContent = '返回 PK32 目录'; back.style.marginTop = '10px'; back.onclick = render; list.appendChild(back);
                try { start(host); } catch (e) { host.innerHTML = '<div style="padding:20px;color:#ff7a8b">启动失败：' + esc(e.message) + '</div>'; }
            }
            function launchModule(record) {
                const mod = window.PK32Board, spec = record && record.module;
                if (!mod || !mod.startUI) return;
                mount(record, '棋类独立版', host => mod.startUI(host, spec.id, { onScore: opts.onScore }));
            }
            function launchCasual(record) {
                const mod = window.PK32Casual, spec = record && record.casual;
                if (!mod || !mod.startGame) return;
                mount(record, '纸牌/益智独立版', host => mod.startGame(host, spec, { onScore: opts.onScore }));
            }
            function launch(record) {
                const spec = record && record.playable;
                const game = spec && window.MiniGames && window.MiniGames[spec.gameId];
                if (!game) {
                    opts.onScore && opts.onScore('该适配模块尚未加载');
                    return;
                }
                list.innerHTML = '<div class="emu-note"><b>' + esc(record.name) + ' · ' + esc(spec.label) + '</b><br>' + esc(spec.note) + '</div>';
                const host = document.createElement('div');
                host.style.cssText = 'min-height:420px;margin-top:12px;';
                list.appendChild(host);
                const back = document.createElement('button');
                back.className = 'btn ghost'; back.textContent = '返回 PK32 目录'; back.style.marginTop = '10px';
                back.onclick = render;
                list.appendChild(back);
                try {
                    const inst = game.start(host, { onScore: opts.onScore, levelIdx: 0, level: game.LEVELS && game.LEVELS[0] });
                    if (inst && inst.stop) {
                        const oldStop = inst.stop;
                        inst.stop = () => { try { oldStop.call(inst); } catch (e) {} };
                    }
                } catch (e) {
                    host.innerHTML = '<div style="padding:20px;color:#ff7a8b">启动失败：' + esc(e.message) + '</div>';
                }
            }
            q.oninput = render;
            group.onchange = render;
            render();
            opts.onScore && opts.onScore(all.length + ' 项');
            if (window.__MG_TEST) window.__pk32Dbg = { catalog: all, records, groupOf };
            return { stop() { alive = false; } };
        },
    };
    window.MiniGames.pk32 = api;
    window.PK32Catalog = CATALOG;
})();
