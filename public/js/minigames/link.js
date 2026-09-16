// 连连看：20 关挑战——棋盘渐大、时限渐紧、岩石挡路；提示/洗牌道具随关卡递减
window.MiniGames = window.MiniGames || {};
MiniGames.link = {
    LEVELS: [
        { name: '热身', cols: 4, rows: 4, time: 90 },
        { name: '入门', cols: 5, rows: 4, time: 120 },
        { name: '上手', cols: 6, rows: 4, time: 140 },
        { name: '进阶', cols: 6, rows: 5, time: 170 },
        { name: '乱石滩', cols: 6, rows: 5, time: 180, rocks: 2 },
        { name: '长廊', cols: 7, rows: 4, time: 160 },
        { name: '开阔地', cols: 8, rows: 4, time: 180 },
        { name: '石径', cols: 8, rows: 5, time: 220, rocks: 2 },
        { name: '限时抢消', cols: 8, rows: 5, time: 190 },
        { name: '半程试炼', cols: 8, rows: 6, time: 240 },
        { name: '乱石岗', cols: 8, rows: 6, time: 240, rocks: 4 },
        { name: '大棋盘', cols: 9, rows: 6, time: 260 },
        { name: '碎石坡', cols: 9, rows: 6, time: 250, rocks: 4 },
        { name: '旷野', cols: 10, rows: 6, time: 280 },
        { name: '巨石阵', cols: 10, rows: 6, time: 280, rocks: 6 },
        { name: '高墙', cols: 10, rows: 7, time: 330, rocks: 4 },
        { name: '迷阵', cols: 10, rows: 7, time: 320, rocks: 6 },
        { name: '一望无际', cols: 10, rows: 8, time: 360 },
        { name: '乱石深渊', cols: 10, rows: 8, time: 350, rocks: 6 },
        { name: '连连看之神', cols: 11, rows: 8, time: 400, rocks: 8 },
    ].concat((function () {
        // 21~50 关：在前 20 关基础上继续加大棋盘、压缩时间、增加岩石
        // （必须在这里带参数生成，否则选关页补足的关卡会缺 cols/rows/time → 棋盘 NaN）
        const POOL = ['登堂', '入室', '观海', '凌云', '穿云', '裂石', '开山', '辟地', '观星', '摘星',
            '踏浪', '逐日', '奔月', '御风', '乘雷', '破军', '定海', '镇岳', '通天', '彻地',
            '洞玄', '知微', '若谷', '归真', '玄武', '朱雀', '白虎', '青龙', '麒麟', '混沌'];
        const out = [];
        for (let i = 20; i < 50; i++) {
            const k = i - 19;
            out.push({
                name: POOL[i - 20],
                cols: Math.min(14, 11 + Math.floor(k / 8)),
                rows: Math.min(10, 8 + Math.floor(k / 14)),
                time: Math.max(260, 400 - k * 4),
                rocks: Math.min(18, 8 + Math.floor(k / 2)),
            });
        }
        return out;
    })()),
    ICONS: ['🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🍒', '🍑', '🥝', '🥥', '🍍', '🥭', '🍅', '🍆', '🥕', '🌽', '🌰', '🍄', '🥬', '🥦', '🌶', '🧄'],
    ENDLESS: { name: '∞ 无尽', desc: '挑战最难棋盘（最大+最紧时限+最多岩石），反复刷新最高消对数' },
    start(container, opts) {
        opts = opts || {};
        let alive = true;
        const api = { stop() { alive = false; } };
        const showSelect = () => {
            if (!alive) return;
            const levels = this.LEVELS.map((lv, i) => ({
                name: lv.name || `第 ${i + 1} 关`,
                desc: `${lv.cols}×${lv.rows} · ${lv.time}s${lv.rocks ? ' · 🪨' + lv.rocks : ''}`,
            }));
            MG.levelSelect(container, {
                game: 'link', title: '连连看 · 50 关挑战', levels,
                onStart: idx => runRound(idx + 1),
            });
        };
        const runRound = level => { if (alive) linkRound(container, opts, level, api, showSelect, runRound); };
        // 无尽模式：直接打最难的最后一关（棋盘最大、时限最紧、岩石最多）
        if (opts.endless) { runRound(MiniGames.link.LEVELS.length); return api; }
        showSelect();
        return api;
    },
};

function linkRound(container, opts, level, api, onBack, onReplay) {
    const lv = MiniGames.link.LEVELS[level - 1];
    const COLS = lv.cols, ROWS = lv.rows, ROCKS = lv.rocks || 0, TIME = lv.time;
    const cellW = 50, cellH = 50;
    const { c, ctx, w, h, destroy } = MG.canvas(container, COLS * cellW + 4, ROWS * cellH + 4);

    let board, sel = null, path = null, cleared = 0, totalPairs, timeLeft = TIME;
    let hints = Math.max(1, 3 - Math.floor(level / 7)), shuffles = 2;
    let over = false, rocks = new Set();

    const init = () => {
        rocks = new Set();
        if (ROCKS) {
            const cells = [];
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) cells.push([i, j]);
            MG.shuffle(cells);
            for (let k = 0; k < Math.min(ROCKS, cells.length - 4); k++) rocks.add(cells[k][0] * COLS + cells[k][1]);
        }
        const free = ROWS * COLS - rocks.size;
        totalPairs = Math.floor(free / 2);
        const arr = [];
        for (let i = 0; i < totalPairs; i++) {
            const ico = MiniGames.link.ICONS[i % MiniGames.link.ICONS.length];
            arr.push(ico, ico);
        }
        MG.shuffle(arr);
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
        let k = 0;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            if (rocks.has(i * COLS + j)) continue;
            board[i][j] = arr[k++] || '';
        }
    };
    init();

    // ---- 路径搜索（≤2 折，外圈可绕行；岩石阻挡路径）----
    const isBlocked = (i, j) => {
        if (i < 0 || i >= ROWS || j < 0 || j >= COLS) return false; // 棋盘外可通行
        return !!board[i][j] || rocks.has(i * COLS + j);
    };
    const lineOK = (x1, y1, x2, y2) => {  // 网格坐标，中间必须全空
        if (x1 === x2) { const lo = Math.min(y1, y2), hi = Math.max(y1, y2); for (let y = lo + 1; y < hi; y++) if (isBlocked(x1, y)) return false; return true; }
        if (y1 === y2) { const lo = Math.min(x1, x2), hi = Math.max(x1, x2); for (let x = lo + 1; x < hi; x++) if (isBlocked(x, y1)) return false; return true; }
        return false;
    };
    const searchPath = (a, b) => {  // a/b = [i,j]
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        // 0 折
        if (lineOK(a[0], a[1], b[0], b[1])) return [a, b];
        // 1-2 折：从 a 出发沿 4 方向扫描所有可达空点（含外圈），再连 b
        const open = [];
        for (const [di, dj] of dirs) {
            let x = a[0] + di, y = a[1] + dj;
            while (x >= -1 && x <= ROWS && y >= -1 && y <= COLS) {
                if (isBlocked(x, y)) break;  // 被挡住 → 不能作为转角
                open.push([x, y]);
                x += di; y += dj;
            }
        }
        for (const [cx, cy] of open) {
            if (lineOK(a[0], a[1], cx, cy) && lineOK(cx, cy, b[0], b[1])) {
                if (cx === b[0] && cy === b[1]) continue;
                return [a, [cx, cy], b];
            }
        }
        // 2 折：open 点再延伸一步
        for (const [cx, cy] of open) {
            if (cx === a[0] && cy === a[1]) continue;
            for (const [di, dj] of dirs) {
                let x = cx + di, y = cy + dj;
                while (x >= -1 && x <= ROWS && y >= -1 && y <= COLS) {
                    if (x === b[0] && y === b[1] && lineOK(cx, cy, x, y)) return [a, [cx, cy], [x, y], b];
                    if (isBlocked(x, y)) break;
                    if (lineOK(cx, cy, x, y)) {
                        if (lineOK(x, y, b[0], b[1])) return [a, [cx, cy], [x, y], b];
                    }
                    x += di; y += dj;
                }
            }
        }
        return null;
    };
    const canConnect = (a, b) => {
        const saved = [board[a[0]][a[1]], board[b[0]][b[1]]];
        board[a[0]][a[1]] = ''; board[b[0]][b[1]] = '';
        const p = searchPath(a, b);
        board[a[0]][a[1]] = saved[0]; board[b[0]][b[1]] = saved[1];
        return p;
    };
    const findAllPairs = () => {
        const byIcon = {};
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const v = board[i][j]; if (!v) continue;
            (byIcon[v] = byIcon[v] || []).push([i, j]);
        }
        const pairs = [];
        for (const k in byIcon) {
            const list = byIcon[k];
            for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
                if (canConnect(list[a], list[b])) { pairs.push([list[a], list[b]]); return pairs; }
            }
        }
        return pairs;
    };
    const autoShuffle = () => {
        const vals = [];
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) if (board[i][j]) vals.push(board[i][j]);
        MG.shuffle(vals);
        let k = 0;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) if (board[i][j]) board[i][j] = vals[k++];
        opts.onScore && opts.onScore('🔄 场上无可连对，已自动重排！');
    };

    // ---- 道具栏 ----
    const itembar = document.createElement('div');
    itembar.className = 'mg-itembar';
    const renderItems = () => {
        itembar.innerHTML =
            `<button class="mg-item ${hints > 0 ? '' : 'off'}" data-a="hint">💡提示 <b>×${hints}</b></button>` +
            `<button class="mg-item ${shuffles > 0 ? '' : 'off'}" data-a="shuf">🔄打乱 <b>×${shuffles}</b></button>` +
            `<span class="mg-coins">⏱ ${Math.ceil(timeLeft)}s</span>`;
        itembar.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
            if (over) return;
            if (b.dataset.a === 'hint' && hints > 0) {
                const pairs = findAllPairs();
                if (!pairs.length) return;
                hints--; sel = pairs[0][0]; draw();
                setTimeout(() => { sel = null; draw(); }, 900);
            } else if (b.dataset.a === 'shuf' && shuffles > 0) {
                shuffles--; autoShuffle(); draw();
            }
            renderItems();
        });
    };
    container.appendChild(itembar);

    // ---- 计时 ----
    const timer = setInterval(() => {
        if (over) return;
        timeLeft -= 1;
        if (timeLeft <= 0) { timeLeft = 0; finish(false, '时间到！'); }
        renderItems(); draw();
    }, 1000);
    const origStop = api.stop;
    api.stop = function () { clearInterval(timer); origStop(); };

    const finish = (win, reason) => {
        if (over) return;
        over = true; clearInterval(timer);
        const stars = win ? (timeLeft / TIME >= 0.5 ? 3 : timeLeft / TIME >= 0.25 ? 2 : 1) : 0;
        if (win) MG.recordStars('link', level, stars);
        if (opts.endless) {
            // 无尽模式：以「已消除对数」记最高分，重试由框架回到无尽入口
            opts.onComplete && opts.onComplete({
                win, stars: win ? 3 : 0,
                title: win ? `🏆 第 ${level} 关清空！` : '💥 挑战失败',
                lines: [reason || '', `本局消除 ${cleared}/${totalPairs} 对`].filter(Boolean),
                score: cleared,
            });
            return;
        }
        MG.result(container, {
            win, stars,
            title: win ? `🏆 第 ${level} 关清空！` : '💥 挑战失败',
            lines: [reason || '', `剩余时间 ${Math.ceil(timeLeft)}s`].filter(Boolean),
            hasNext: win && level < MiniGames.link.LEVELS.length,
            onRetry: () => { destroy(); onReplay(level); },
            onNext: () => { destroy(); onReplay(level + 1); },
            onBack,
        });
        draw();
    };

    // ---- 渲染 ----
    const draw = () => {
        MG.ui.board(ctx, w, h);
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const x = 2 + j * cellW, y = 2 + i * cellH;
            if (rocks.has(i * COLS + j)) {  // 岩石：挡路不可消
                MG.ui.rr(ctx, x + 2, y + 2, cellW - 4, cellH - 4, 8);
                ctx.fillStyle = '#4a4438'; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = '#26221a'; ctx.stroke();
                MG.ui.emoji(ctx, '🪨', x + cellW / 2, y + cellH / 2, Math.min(cellW, cellH) * 0.6);
                continue;
            }
            // 棋盘格底色（柔和双色）
            MG.ui.rr(ctx, x + 1, y + 1, cellW - 3, cellH - 3, 8);
            ctx.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)';
            ctx.fill();
            if (board[i][j]) {
                MG.ui.rr(ctx, x + 3, y + 3, cellW - 6, cellH - 6, 9);
                ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
                MG.ui.emoji(ctx, board[i][j], x + cellW / 2, y + cellH / 2 - 1, Math.min(cellW, cellH) * 0.66);
            }
            if (sel && sel[0] === i && sel[1] === j) {
                ctx.save();
                ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 10;
                ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3;
                MG.ui.rr(ctx, x + 2, y + 2, cellW - 4, cellH - 4, 9); ctx.stroke();
                ctx.restore();
            }
        }
        if (path) {
            ctx.save();
            ctx.shadowColor = '#5cd65c'; ctx.shadowBlur = 8;
            ctx.strokeStyle = '#8ae87a'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.setLineDash([10, 7]);
            ctx.beginPath();
            ctx.moveTo(path[0][1] * cellW + cellW / 2, path[0][0] * cellH + cellH / 2);
            for (let k = 1; k < path.length; k++) ctx.lineTo(path[k][1] * cellW + cellW / 2, path[k][0] * cellH + cellH / 2);
            ctx.stroke();
            ctx.restore();
        }
        opts.onScore && opts.onScore(`第 ${level} 关 · 已消 ${cleared}/${totalPairs} 对 · ⏱${Math.ceil(timeLeft)}s`);
    };

    const onTap = p => {
        if (over) return;
        const j = Math.floor((p.x - 2) / cellW), i = Math.floor((p.y - 2) / cellH);
        if (i < 0 || i >= ROWS || j < 0 || j >= COLS) return;
        if (rocks.has(i * COLS + j)) return;
        const cur = board[i][j];
        if (!cur) return;
        if (!sel) { sel = [i, j]; path = null; }
        else if (sel[0] === i && sel[1] === j) { sel = null; path = null; }
        else if (board[sel[0]][sel[1]] === cur) {
            const pth = canConnect(sel, [i, j]);
            if (pth) {
                path = pth;
                board[i][j] = ''; board[sel[0]][sel[1]] = '';
                cleared++; sel = null;
                draw();
                setTimeout(() => { path = null; draw(); }, 260);
                if (cleared >= totalPairs) return finish(true);
                if (!findAllPairs().length) autoShuffle();  // 死局自动重排
            } else { sel = [i, j]; path = null; }
        } else { sel = [i, j]; path = null; }
        draw();
    };
    MG.bind(c, onTap);
    renderItems(); draw();
    MG.hint(container, `第 ${level} 关 ${COLS}×${ROWS}${ROCKS ? ' · 🪨岩石会挡住连线' : ''} · 折点 ≤2 可消除`);
    return api;
}
