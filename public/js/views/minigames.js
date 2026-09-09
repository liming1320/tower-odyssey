// 小游戏入口：竖版滚动卡片，每张游戏点击进入全屏游戏容器
// 真正的 20 个游戏实现放在 /js/minigames/*.js，由本文件按需加载
const MinigamesView = {
    open(app) {
        // 先同步服务器进度（登录用户），再渲染卡片
        const render = () => this.render(app);
        try { MG.sync().then(render, render); } catch (e) { render(); }
    },
    render(app) {
        // 切到独立 tab 区域显示
        const root = document.getElementById('page-content');
        root.innerHTML = `
            <div class="section-title">🎮 小游戏<span style="float:right;font-size:12px;color:#b9b3d8;font-weight:normal">共 ${GAMES.length} 款</span></div>
            <div class="mini-hub" id="mini-hub"></div>
        `;
        const hub = document.getElementById('mini-hub');
        GAMES.forEach(g => {
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
            // 暗棋保留自己的关卡流程（猜拳→对局），其他统一走 20 关框架
            if (g.id === 'banqi') {
                const inst = game.start(stage, { onScore: s => scoreEl.textContent = s != null ? s : '' });
                inst && (inst._close = close);
            } else {
                const levels = (game.LEVELS && game.LEVELS.length) ? game.LEVELS : defaultLevels(g);
                MG.runGame(stage, {
                    id: g.id, title: g.name, levels,
                    start: (c, opts, lv) => game.start(c, opts, lv),
                    scoreEl,
                });
            }
        } catch (e) {
            stage.innerHTML = `<div style="padding:30px;color:#ff7a8b">启动失败：${e.message}</div>`;
        }
    }
};

// 兜底：没有 LEVELS 配置的游戏也具备 20 关（难度参数自增 0..1）
function defaultLevels(g) {
    const out = [];
    for (let i = 1; i <= 20; i++) {
        out.push({ name: '第' + i + '关', desc: '难度 ' + i + '/20', _fallback: true });
    }
    return out;
}

// 20 个小游戏清单
// thumb: 小型 SVG 缩略图（88x60），在卡片左侧展示
// 各 id 与 /js/minigames/<id>.js 的实现一一对应
const GAMES = [
    { id: 'gomoku',   name: '五子棋',     desc: '经典 15×15 对战，挑战 AI', thumb: thumbGrid('五子棋', '#5cd65c', '⚫') },
    { id: 'g2048',    name: '2048',        desc: '20 关目标挑战 + 无尽模式', thumb: thumbGrid('2048', '#ffd56b', '2️⃣') },
    { id: 'banqi',    name: '暗棋圣手',    desc: '15 关闯关 · 宋金小人 · 必杀技', thumb: banqiThumb() },
    { id: 'xiangqi',  name: '中国象棋',     desc: '红黑对弈，车马炮冲锋',       thumb: thumbGrid('象棋', '#ff7a8b', '♟️') },
    { id: 'link',     name: '连连看',       desc: '20 关挑战 · 岩石挡路',       thumb: thumbGrid('连连看', '#5cc7ff', '🔗') },
    { id: 'match3',   name: '消消乐',       desc: '20 关挑战 · 配额与石块',     thumb: thumbGrid('消消乐', '#ff9d5c', '🍬') },
    { id: 'snake',    name: '贪吃蛇',       desc: '方向键控制，吃豆长大',       thumb: thumbGrid('贪吃蛇', '#7adf7a', '🐍') },
    { id: 'tetris',   name: '俄罗斯方块',   desc: '经典方块，消除得分',         thumb: thumbGrid('方块', '#5b8cff', '🟪') },
    { id: 'mole',     name: '打地鼠',       desc: '限时敲击地鼠',               thumb: thumbGrid('地鼠', '#c4a07a', '🔨') },
    { id: 'mine',     name: '扫雷',         desc: '9×9 经典 10 雷',             thumb: thumbGrid('扫雷', '#9aa2b5', '💣') },
    { id: 'memory',   name: '记忆翻牌',     desc: '找出所有配对',               thumb: thumbGrid('记忆', '#b78bff', '🃏') },
    { id: 'slide15',  name: '数字华容道',   desc: '1-15 滑动排序',              thumb: thumbGrid('华容道', '#5cc7ff', '🔀') },
    { id: 'bulls',    name: '猜数字',       desc: 'A×B 逻辑推理',               thumb: thumbGrid('猜数', '#ff9d5c', '🔢') },
    { id: 'sudoku6',  name: '迷你数独',     desc: '6×6 入门题',                 thumb: thumbGrid('数独', '#5cd65c', '🧩') },
    { id: 'hanoi',    name: '汉诺塔',       desc: 'N 层盘子三柱移动',           thumb: thumbGrid('汉诺', '#ff7a8b', '🗼') },
    { id: 'piano',    name: '别踩白块',     desc: '只点黑块，反应速度',         thumb: thumbGrid('白块', '#cfd2e2', '🎹') },
    { id: 'reaction', name: '反应力测试',   desc: '颜色变化就点',               thumb: thumbGrid('反应', '#ffd56b', '⚡') },
    { id: 'breakout', name: '打砖块',       desc: '弹球消砖经典',               thumb: thumbGrid('砖块', '#5cc7ff', '🧱') },
    { id: 'jump',     name: '跳一跳',       desc: '蓄力跳跃，精准定距',         thumb: thumbGrid('跳跃', '#7adf7a', '🦘') },
    { id: 'shooter',  name: '飞机大战',     desc: '射击陨石升级',               thumb: thumbGrid('飞机', '#ff5252', '🚀') },
];

// 缩略图生成器：渐变底 + 装饰圆点 + 大图形符号
function thumbGrid(name, color, glyph) {
    return `<svg viewBox="0 0 88 60" width="100%" height="100%">
        <defs>
            <linearGradient id="tg-${name}" x1="0" y1="0" x2="0.6" y2="1">
                <stop offset="0" stop-color="${color}" stop-opacity="0.45"/>
                <stop offset="1" stop-color="${color}" stop-opacity="0.08"/>
            </linearGradient>
        </defs>
        <rect width="88" height="60" fill="url(#tg-${name})"/>
        <circle cx="14" cy="48" r="18" fill="${color}" stop-opacity="0.6" opacity="0.18"/>
        <circle cx="78" cy="10" r="14" fill="${color}" opacity="0.14"/>
        <rect x="2.5" y="2.5" width="83" height="55" rx="8" fill="none" stroke="${color}" stroke-width="1.2" stroke-opacity="0.55"/>
        <text x="44" y="37" text-anchor="middle" font-size="24">${glyph}</text>
    </svg>`;
}

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

window.MinigamesView = MinigamesView;
