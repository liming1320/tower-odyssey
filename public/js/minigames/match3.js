// 消消乐：50 关挑战——目标分数 + 颜色配额 + 石块障碍 + 步数限制
window.MiniGames = window.MiniGames || {};
MiniGames.match3 = {
    LEVELS: [
        { name: '初试', score: 500, moves: 12 },
        { name: '入门', score: 800, moves: 14 },
        { name: '顺手', score: 1200, moves: 16 },
        { name: '进阶', score: 1600, moves: 18 },
        { name: '集红令', score: 2000, moves: 20, quotas: { 0: 10 } },
        { name: '顽石阵', score: 2400, moves: 20, rocks: 2 },
        { name: '双色令', score: 3000, moves: 22, quotas: { 0: 12, 1: 12 } },
        { name: '碎石带', score: 3600, moves: 22, rocks: 3 },
        { name: '红绿令', score: 4200, moves: 24, quotas: { 0: 15, 2: 15 } },
        { name: '半程试炼', score: 5000, moves: 25 },
        { name: '巨石阵', score: 6000, moves: 26, rocks: 4 },
        { name: '三色令', score: 7000, moves: 26, quotas: { 0: 15, 1: 15, 2: 15 } },
        { name: '乱石坡', score: 8000, moves: 28, rocks: 5 },
        { name: '疾风', score: 9000, moves: 28 },
        { name: '四色令', score: 10000, moves: 30, quotas: { 0: 20, 1: 20, 2: 20, 3: 20 } },
        { name: '磐石', score: 11500, moves: 30, rocks: 5 },
        { name: '狂热', score: 13000, moves: 32 },
        { name: '五彩令', score: 15000, moves: 32, quotas: { 0: 25, 1: 25, 2: 25, 3: 25, 4: 25 } },
        { name: '乱石深渊', score: 17000, moves: 34, rocks: 6 },
        { name: '消消乐之神', score: 20000, moves: 36, quotas: { 0: 20, 1: 20, 2: 20, 3: 20, 4: 20 }, rocks: 4 },
    ].concat((function () {
        // 21~50 关：目标分数持续走高、步数收紧、穿插颜色配额与石块
        // （必须带参数生成，否则选关页补足的关卡会缺 score/moves → 目标 NaN）
        const POOL = ['登堂', '入室', '观海', '凌云', '穿云', '裂石', '开山', '辟地', '观星', '摘星',
            '踏浪', '逐日', '奔月', '御风', '乘雷', '破军', '定海', '镇岳', '通天', '彻地',
            '洞玄', '知微', '若谷', '归真', '玄武', '朱雀', '白虎', '青龙', '麒麟', '混沌'];
        const out = [];
        for (let i = 20; i < 50; i++) {
            const k = i - 19;
            const lv = { name: POOL[i - 20], score: Math.round(20000 + k * 2600), moves: Math.min(46, 36 + Math.floor(k / 3)) };
            if (k % 3 === 0) lv.quotas = { 0: 25 + k, 1: 25 + k, 2: 20 + k, 3: 20 + k, 4: 15 + k };
            if (k % 4 === 0) lv.rocks = Math.min(10, 4 + Math.floor(k / 4));
            out.push(lv);
        }
        return out;
    })()),
    COLNAME: ['红', '黄', '绿', '蓝', '紫'],
    start(container, opts) {
        let alive = true;
        const api = { stop() { alive = false; } };
        const showSelect = () => {
            if (!alive) return;
            const levels = this.LEVELS.map((lv, i) => ({
                name: lv.name || `第 ${i + 1} 关`,
                desc: `${lv.score}分/${lv.moves}步${lv.rocks ? ' · 🪨' + lv.rocks : ''}${lv.quotas ? ' · 🎯' + Object.keys(lv.quotas).length + '色' : ''}`,
            }));
            MG.levelSelect(container, {
                game: 'match3', title: '消消乐 · 50 关挑战', levels,
                onStart: idx => runRound(idx + 1),
            });
        };
        const runRound = level => { if (alive) match3Round(container, opts, level, api, showSelect, runRound); };
        showSelect();
        return api;
    },
};

function match3Round(container, opts, level, api, onBack, onReplay) {
    const COLS = 8, ROWS = 8, NCOLORS = 5;
    const cellW = 50, cellH = 50;
    const lv = MiniGames.match3.LEVELS[level - 1];
    const COL = ['#ff5252', '#ffd56b', '#5cd65c', '#5cc7ff', '#b78bff'];
    const { c, ctx, w, h, destroy } = MG.canvas(container, COLS * cellW + 4, ROWS * cellH + 4);

    let board = [], sel = null, score = 0, busy = false, over = false;
    let moves = lv.moves;
    const quota = {};   // 色号 -> 剩余数
    if (lv.quotas) for (const k in lv.quotas) quota[k] = lv.quotas[k];

    const ROCK = -2, EMPTY = -1;
    const inB = (i, j) => i >= 0 && i < ROWS && j >= 0 && j < COLS;

    // ---- 初始化（石块固定 + 避免开局即有消除）----
    const init = () => {
        const rocks = new Set();
        if (lv.rocks) {
            const cells = [];
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) cells.push([i, j]);
            MG.shuffle(cells);
            for (let k = 0; k < lv.rocks; k++) rocks.add(cells[k][0] * COLS + cells[k][1]);
        }
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            if (rocks.has(i * COLS + j)) { board[i][j] = ROCK; continue; }
            let v, tries = 0;
            do {
                v = MG.ri(0, NCOLORS - 1); tries++;
            } while (tries < 20 && (
                (j >= 2 && board[i][j - 1] === v && board[i][j - 2] === v) ||
                (i >= 2 && board[i - 1][j] === v && board[i - 2][j] === v)));
            board[i][j] = v;
        }
    };
    init();

    // ---- 匹配检测 ----
    const findMatches = () => {
        const match = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS - 2; j++) {
            if (board[i][j] >= 0 && board[i][j] === board[i][j + 1] && board[i][j] === board[i][j + 2]) {
                match[i][j] = match[i][j + 1] = match[i][j + 2] = true;
                let k = j + 3; while (k < COLS && board[i][k] === board[i][j]) match[i][k++] = true;
            }
        }
        for (let j = 0; j < COLS; j++) for (let i = 0; i < ROWS - 2; i++) {
            if (board[i][j] >= 0 && board[i][j] === board[i + 1][j] && board[i][j] === board[i + 2][j]) {
                match[i][j] = match[i + 1][j] = match[i + 2][j] = true;
                let k = i + 3; while (k < ROWS && board[k][j] === board[i][j]) match[k++][j] = true;
            }
        }
        return match;
    };
    const hasMatch = () => findMatches().some(r => r.some(x => x));

    // ---- 消除 + 石块联动 + 下落 ----
    const collapse = async () => {
        busy = true;
        let match = findMatches();
        while (match.some(r => r.some(x => x))) {
            let cnt = 0;
            const clearedColors = {};
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) if (match[i][j]) {
                const v = board[i][j];
                if (v >= 0) { cnt++; clearedColors[v] = (clearedColors[v] || 0) + 1; }
                board[i][j] = EMPTY;
            }
            score += cnt * 10;
            for (const k in clearedColors) if (quota[k] != null) quota[k] = Math.max(0, quota[k] - clearedColors[k]);
            // 石块联动：与本次消除相邻的石块被击碎
            let rockCnt = 0;
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                if (board[i][j] !== ROCK) continue;
                const near = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([di, dj]) =>
                    inB(i + di, j + dj) && match[i + di][j + dj]);
                if (near) { board[i][j] = EMPTY; rockCnt++; }
            }
            if (rockCnt) score += rockCnt * 80;
            draw();
            await new Promise(r => setTimeout(r, 240));
            // 下落（石块也随重力下落）
            for (let j = 0; j < COLS; j++) {
                let write = ROWS - 1;
                for (let i = ROWS - 1; i >= 0; i--) if (board[i][j] !== EMPTY) { board[write--][j] = board[i][j]; board[i][j] = EMPTY; }
                for (let i = write; i >= 0; i--) board[i][j] = MG.ri(0, NCOLORS - 1);
            }
            draw();
            await new Promise(r => setTimeout(r, 150));
            match = findMatches();
        }
        busy = false;
        draw();
    };

    // ---- 胜负 ----
    const objectivesDone = () => score >= lv.score && Object.values(quota).every(v => v <= 0);
    const finish = (win, reason) => {
        if (over) return;
        over = true;
        let stars = 0;
        if (win) {
            const ratio = score / lv.score;
            stars = ratio >= 1.5 ? 3 : ratio >= 1.2 ? 2 : 1;
            MG.recordStars('match3', level, stars);
        }
        MG.result(container, {
            win, stars,
            title: win ? `🏆 第 ${level} 关达成目标！` : '💥 步数用完',
            lines: [
                reason || '',
                `得分 ${score}/${lv.score}`,
                quotaText(),
                win && stars < 3 ? '分数达到目标 1.5 倍可得 ★★★' : '',
            ].filter(Boolean),
            hasNext: win && level < MiniGames.match3.LEVELS.length,
            onRetry: () => { destroy(); onReplay(level); },
            onNext: () => { destroy(); onReplay(level + 1); },
            onBack,
        });
        draw();
    };
    const quotaText = () => Object.keys(quota).length
        ? '配额 ' + Object.keys(quota).map(k => `${MiniGames.match3.COLNAME[k]} ${lv.quotas[k] - quota[k]}/${lv.quotas[k]}`).join(' · ')
        : '';

    // ---- 渲染 ----
    const draw = () => {
        MG.ui.board(ctx, w, h);
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const v = board[i][j];
            const x = 2 + j * cellW, y = 2 + i * cellH;
            if (v === ROCK) {  // 石块
                MG.ui.rr(ctx, x + 3, y + 3, cellW - 8, cellH - 8, 8);
                ctx.fillStyle = '#4a4438'; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = '#26221a'; ctx.stroke();
                MG.ui.emoji(ctx, '🪨', x + cellW / 2, y + cellH / 2, Math.min(cellW, cellH) * 0.58);
            } else if (v >= 0) {
                // 糖果：径向渐变球 + 高光 + 描边 + 投影
                const cx = x + cellW / 2, cy = y + cellH / 2, r = Math.min(cellW, cellH) * 0.36;
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
                let g = null;
                try { g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r); g.addColorStop(0, '#fff'); g.addColorStop(0.35, COL[v]); g.addColorStop(1, 'rgba(0,0,0,0.25)'); } catch (e) {}
                ctx.fillStyle = g || COL[v];
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.lineWidth = 2; ctx.strokeStyle = COL[v];
                ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.beginPath(); ctx.ellipse(cx - r * 0.32, cy - r * 0.42, r * 0.26, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
            }
            if (sel && sel[0] === i && sel[1] === j) {
                ctx.save();
                ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 10;
                ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3;
                MG.ui.rr(ctx, x + 3, y + 3, cellW - 8, cellH - 8, 9); ctx.stroke();
                ctx.restore();
            }
        }
        const q = Object.keys(quota).map(k => `${MiniGames.match3.COLNAME[k]}${quota[k]}`).join(' ');
        opts.onScore && opts.onScore(`第 ${level} 关 · ${score}/${lv.score}分 · 剩${moves}步${q ? ' · 🎯' + q : ''}`);
    };

    // ---- 交互 ----
    const onTap = async p => {
        if (busy || over) return;
        const j = Math.floor((p.x - 2) / cellW), i = Math.floor((p.y - 2) / cellH);
        if (!inB(i, j) || board[i][j] < 0) return;   // 空格/石块不可选
        if (!sel) { sel = [i, j]; draw(); return; }
        if (sel[0] === i && sel[1] === j) { sel = null; draw(); return; }
        const di = Math.abs(sel[0] - i), dj = Math.abs(sel[1] - j);
        if (di + dj !== 1 || board[i][j] < 0) { sel = [i, j]; draw(); return; }
        const [si, sj] = sel;
        sel = null;
        // 交换 → 不产生消除则换回
        [board[si][sj], board[i][j]] = [board[i][j], board[si][sj]];
        if (hasMatch()) {
            moves--;
            draw();
            await collapse();
            if (objectivesDone()) return finish(true, '目标全部达成！');
            if (moves <= 0) return finish(false, '步数用完，目标未达成');
        } else {
            [board[si][sj], board[i][j]] = [board[i][j], board[si][sj]];
        }
        draw();
    };
    MG.bind(c, onTap);
    draw();
    MG.hint(container, `第 ${level} 关：${lv.moves} 步内拿到 ${lv.score} 分${lv.quotas ? '并集齐颜色配额' : ''}${lv.rocks ? '（石块需相邻消除击碎）' : ''}`);
    return api;
}
