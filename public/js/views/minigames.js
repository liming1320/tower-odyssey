// 小游戏入口：竖版滚动卡片，每张游戏点击进入全屏游戏容器
// 真正的 20 个游戏实现放在 /js/minigames/*.js，由本文件按需加载
const MinigamesView = {
    open(app) {
        // 切到独立 tab 区域显示
        const root = document.getElementById('page-content');
        root.innerHTML = `
            <div class="section-title">🎮 小游戏<span style="float:right;font-size:12px;color:#b9b3d8;font-weight:normal">共 ${GAMES.length} 款</span></div>
            <div class="mini-hub" id="mini-hub"></div>
        `;
        const hub = document.getElementById('mini-hub');
        GAMES.forEach(g => {
            const card = U.el(`
                <div class="mini-card" data-id="${g.id}">
                    <div class="mini-thumb">${g.thumb}</div>
                    <div class="mini-meta">
                        <div class="mini-name">${g.name}</div>
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
            try { instance && instance.stop && instance.stop(); } catch (e) {}
            mask.remove();
        };
        document.getElementById('mini-back').onclick = close;
        let instance = null;
        try {
            const game = window.MiniGames && window.MiniGames[g.id];
            if (!game) throw new Error('未加载到该游戏模块');
            instance = game.start(stage, { onScore: s => scoreEl.textContent = s != null ? s : '' });
        } catch (e) {
            stage.innerHTML = `<div style="padding:30px;color:#ff7a8b">启动失败：${e.message}</div>`;
        }
    }
};

// 20 个小游戏清单
// thumb: 小型 SVG 缩略图（88x60），在卡片左侧展示
// 各 id 与 /js/minigames/<id>.js 的实现一一对应
const GAMES = [
    { id: 'gomoku',   name: '五子棋',     desc: '经典 15×15 对战，挑战 AI', thumb: thumbGrid('五子棋', '#5cd65c') },
    { id: 'g2048',    name: '2048',        desc: '滑动合并方块，挑战 2048!',   thumb: thumbGrid('2048', '#ffd56b') },
    { id: 'banqi',    name: '暗棋圣手',    desc: '翻棋吃子，DOS 经典重现',     thumb: thumbGrid('暗棋', '#b78bff') },
    { id: 'xiangqi',  name: '中国象棋',     desc: '红黑对弈，车马炮冲锋',       thumb: thumbGrid('象棋', '#ff7a8b') },
    { id: 'link',     name: '连连看',       desc: '找出相同图案，限 3 次折线',  thumb: thumbGrid('连连看', '#5cc7ff') },
    { id: 'match3',   name: '消消乐',       desc: '三消合成，挑战连击',         thumb: thumbGrid('消消乐', '#ff9d5c') },
    { id: 'snake',    name: '贪吃蛇',       desc: '方向键控制，吃豆长大',       thumb: thumbGrid('贪吃蛇', '#7adf7a') },
    { id: 'tetris',   name: '俄罗斯方块',   desc: '经典方块，消除得分',         thumb: thumbGrid('方块', '#5b8cff') },
    { id: 'mole',     name: '打地鼠',       desc: '限时敲击地鼠',               thumb: thumbGrid('地鼠', '#c4a07a') },
    { id: 'mine',     name: '扫雷',         desc: '9×9 经典 10 雷',             thumb: thumbGrid('扫雷', '#888') },
    { id: 'memory',   name: '记忆翻牌',     desc: '找出所有配对',               thumb: thumbGrid('记忆', '#b78bff') },
    { id: 'slide15',  name: '数字华容道',   desc: '1-15 滑动排序',              thumb: thumbGrid('华容道', '#5cc7ff') },
    { id: 'bulls',    name: '猜数字',       desc: 'A×B 逻辑推理',               thumb: thumbGrid('猜数', '#ff9d5c') },
    { id: 'sudoku6',  name: '迷你数独',     desc: '6×6 入门题',                 thumb: thumbGrid('数独', '#5cd65c') },
    { id: 'hanoi',    name: '汉诺塔',       desc: 'N 层盘子三柱移动',           thumb: thumbGrid('汉诺', '#ff7a8b') },
    { id: 'piano',    name: '别踩白块',     desc: '只点黑块，反应速度',         thumb: thumbGrid('白块', '#cfcfcf') },
    { id: 'reaction', name: '反应力测试',   desc: '颜色变化就点',               thumb: thumbGrid('反应', '#ffd56b') },
    { id: 'breakout', name: '打砖块',       desc: '弹球消砖经典',               thumb: thumbGrid('砖块', '#5cc7ff') },
    { id: 'jump',     name: '跳一跳',       desc: '蓄力跳跃，精准定距',         thumb: thumbGrid('跳跃', '#7adf7a') },
    { id: 'shooter',  name: '飞机大战',     desc: '射击陨石升级',               thumb: thumbGrid('飞机', '#ff5252') },
];

// 缩略图生成器：纯 SVG 文本，24x16 网格风格
function thumbGrid(name, color) {
    return `<svg viewBox="0 0 88 60" width="100%" height="100%">
        <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.4"/><stop offset="1" stop-color="${color}" stop-opacity="0.1"/></linearGradient></defs>
        <rect width="88" height="60" fill="url(#tg)"/>
        <rect x="2" y="2" width="84" height="56" fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.5" rx="6"/>
        <text x="44" y="36" text-anchor="middle" font-size="14" font-weight="bold" fill="${color}" font-family="Microsoft YaHei, sans-serif">${name}</text>
    </svg>`;
}

window.MinigamesView = MinigamesView;
