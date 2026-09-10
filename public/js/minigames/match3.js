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
    ENDLESS: { name: '∞ 无尽', desc: '挑战最难关卡（目标分最高+步数最紧+石块配额），反复刷新最高得分' },
    start(container, opts) {
        opts = opts || {};
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
        // 无尽模式：直接打最难的最后一关（目标分最高、步数最紧、石块/配额最多）
        if (opts.endless) { runRound(MiniGames.match3.LEVELS.length); return api; }
        showSelect();
        return api;
    },
};

function match3Round(container, opts, level, api, onBack, onReplay) {
    const COLS = 8, ROWS = 8, NCOLORS = 5;
    const cellW = 50, cellH = 50;
    const lv = MiniGames.match3.LEVELS[level - 1];
    const COL = ['#ff4d6d', '#ffb020', '#3ddc84', '#29b6f6', '#b06cf0'];   // 草莓/橙糖/青苹果/蓝莓/葡萄
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

    // ---- 消除 + 石块联动 + 下落（先播 260ms 缩放消失动画，不再突然空一格）----
    const collapse = async () => {
        busy = true;
        let match = findMatches();
        while (match.some(r => r.some(x => x))) {
            const clearCells = [];
            let cnt = 0;
            const clearedColors = {};
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) if (match[i][j]) {
                clearCells.push([i, j, board[i][j], false]);
                const v = board[i][j];
                if (v >= 0) { cnt++; clearedColors[v] = (clearedColors[v] || 0) + 1; }
            }
            // 石块联动：与本次消除相邻的石块一起碎
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                if (board[i][j] !== ROCK) continue;
                const near = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([di, dj]) =>
                    inB(i + di, j + dj) && match[i + di][j + dj]);
                if (near) clearCells.push([i, j, ROCK, true]);
            }
            // 动画帧：球缩小打转 + 白色闪光
            anim.clear = { cells: clearCells, t0: performance.now(), dur: 260 };
            await new Promise(r => setTimeout(r, 260));
            anim.clear = null;
            // 应用结果
            let rockCnt = 0;
            clearCells.forEach(([i, j, v, isRock]) => {
                board[i][j] = EMPTY;
                if (isRock) rockCnt++;
                else burst(2 + j * cellW + cellW / 2, 2 + i * cellH + cellH / 2, COL[v] || '#fff');
            });
            score += cnt * 10;
            for (const k in clearedColors) if (quota[k] != null) quota[k] = Math.max(0, quota[k] - clearedColors[k]);
            if (rockCnt) score += rockCnt * 80;
            // 下落（石块也随重力下落）
            for (let j = 0; j < COLS; j++) {
                let write = ROWS - 1;
                for (let i = ROWS - 1; i >= 0; i--) if (board[i][j] !== EMPTY) { board[write--][j] = board[i][j]; board[i][j] = EMPTY; }
                for (let i = write; i >= 0; i--) board[i][j] = MG.ri(0, NCOLORS - 1);
            }
            await new Promise(r => setTimeout(r, 140));
            match = findMatches();
        }
        busy = false;
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
        if (opts.endless) {
            // 无尽模式：以「当前得分」记最高分，重试由框架回到无尽入口
            opts.onComplete && opts.onComplete({
                win, stars: win ? stars : 0,
                title: win ? `🏆 第 ${level} 关达成目标！` : '💥 步数用完',
                lines: [reason || '', `得分 ${score}/${lv.score}`].filter(Boolean),
                score,
            });
            return;
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
            onRetry: () => { stopLoop(); destroy(); onReplay(level); },
            onNext: () => { stopLoop(); destroy(); onReplay(level + 1); },
            onBack: () => { stopLoop(); onBack(); },
        });
        draw();
    };
    const quotaText = () => Object.keys(quota).length
        ? '配额 ' + Object.keys(quota).map(k => `${MiniGames.match3.COLNAME[k]} ${lv.quotas[k] - quota[k]}/${lv.quotas[k]}`).join(' · ')
        : '';

    // ---- 动画状态与粒子 ----
    const anim = { swap: null, shake: null, clear: null };
    const sparks = [];   // {x,y,vx,vy,life,col}
    const burst = (x, y, col) => {
        for (let k = 0; k < 6; k++) {
            const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 130;
            sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.45 + Math.random() * 0.2, t: 0, col });
        }
    };

    // ---- 糖果绘制：果冻条纹糖 ----
    const candy = (cx, cy, r, v) => {
        const col = COL[v];
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
        // 糖体：径向渐变果冻
        let g = null;
        try { g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, col); g.addColorStop(1, shade(col, -0.35)); } catch (e) {}
        ctx.fillStyle = g || col;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // 斜条纹（裁剪进糖体）
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.34)';
        ctx.lineWidth = r * 0.28;
        for (let k = -1; k <= 2; k++) {
            ctx.beginPath();
            ctx.moveTo(cx - r + k * r * 0.62 - r * 0.2, cy + r);
            ctx.lineTo(cx - r + k * r * 0.62 + r * 0.35, cy - r);
            ctx.stroke();
        }
        ctx.restore();
        // 描边 + 糖霜高光
        ctx.lineWidth = 2; ctx.strokeStyle = shade(col, -0.45);
        ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.ellipse(cx - r * 0.34, cy - r * 0.44, r * 0.3, r * 0.18, -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(cx + r * 0.3, cy + r * 0.35, r * 0.14, 0, Math.PI * 2); ctx.fill();
    };
    const shade = (hex, amt) => {
        const n = parseInt(hex.slice(1), 16);
        let r = (n >> 16) & 255, g2 = (n >> 8) & 255, b = n & 255;
        const f = amt < 0 ? (1 + amt) : 1, add = amt > 0 ? 255 * amt : 0;
        r = Math.round(r * f + add); g2 = Math.round(g2 * f + add); b = Math.round(b * f + add);
        return `rgb(${Math.min(255, r)},${Math.min(255, g2)},${Math.min(255, b)})`;
    };

    // ---- 渲染（每帧；支持 交换/摇摆/消除 三种动画态）----
    const now = () => performance.now();
    const draw = () => {
        MG.ui.board(ctx, w, h);
        const tSwap = anim.swap ? Math.min(1, (now() - anim.swap.t0) / anim.swap.dur) : -1;
        const tShake = anim.shake ? (now() - anim.shake.t0) / anim.shake.dur : -1;
        const clearMap = {};
        let tClear = -1;
        if (anim.clear) {
            tClear = Math.min(1, (now() - anim.clear.t0) / anim.clear.dur);
            anim.clear.cells.forEach(([i, j]) => clearMap[i * COLS + j] = true);
        }
        const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const v = board[i][j];
            let x = 2 + j * cellW, y = 2 + i * cellH;
            let sx = 0, scale = 1, alpha = 1, rot = 0;
            const key = i * COLS + j;
            // 消除动画：缩小 + 打转 + 淡出
            if (clearMap[key]) {
                const k = tClear;
                scale = 1 - k; alpha = 1 - k * k; rot = k * 2.4;
            }
            // 摇摆动画（无效交换）
            if (tShake >= 0 && anim.shake && ((anim.shake.a[0] === i && anim.shake.a[1] === j) || (anim.shake.b[0] === i && anim.shake.b[1] === j))) {
                sx = Math.sin(tShake * Math.PI * 6) * 4 * (1 - tShake);
            }
            // 交换动画：两格球位置插值
            if (anim.swap) {
                const e = easeInOut(tSwap);
                const { a, b, back } = anim.swap;
                if (a[0] === i && a[1] === j) { x += (b[1] - a[1]) * cellW * (back ? 1 - e : e); y += (b[0] - a[0]) * cellH * (back ? 1 - e : e); }
                if (b[0] === i && b[1] === j) { x += (a[1] - b[1]) * cellW * (back ? 1 - e : e); y += (a[0] - b[0]) * cellH * (back ? 1 - e : e); }
            }
            if (v === ROCK) {
                ctx.save(); ctx.globalAlpha = alpha;
                ctx.translate(x + cellW / 2 + sx, y + cellH / 2); ctx.rotate(rot); ctx.translate(-(x + cellW / 2), -(y + cellH / 2));
                MG.ui.rr(ctx, x + 3, y + 3, cellW - 8, cellH - 8, 8);
                ctx.fillStyle = '#6a6152'; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = '#3a342a'; ctx.stroke();
                MG.ui.emoji(ctx, '🪨', x + cellW / 2, y + cellH / 2, Math.min(cellW, cellH) * 0.58);
                ctx.restore();
            } else if (v >= 0) {
                const cx = x + cellW / 2 + sx, cy = y + cellH / 2;
                ctx.save(); ctx.globalAlpha = alpha;
                if (rot) { ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx, -cy); }
                if (scale !== 1) { ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy); }
                candy(cx, cy, Math.min(cellW, cellH) * 0.38, v);
                ctx.restore();
            }
            if (sel && sel[0] === i && sel[1] === j) {
                const pulse = 0.6 + 0.4 * Math.sin(now() / 130);
                ctx.save();
                ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 12;
                ctx.strokeStyle = `rgba(255,213,107,${pulse})`; ctx.lineWidth = 3.5;
                MG.ui.rr(ctx, x + 3, y + 3, cellW - 8, cellH - 8, 9); ctx.stroke();
                ctx.restore();
            }
        }
        // 粒子层
        for (let k = sparks.length - 1; k >= 0; k--) {
            const sp = sparks[k];
            ctx.globalAlpha = Math.max(0, 1 - sp.t / sp.life);
            ctx.fillStyle = sp.col;
            ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const q = Object.keys(quota).map(k => `${MiniGames.match3.COLNAME[k]}${quota[k]}`).join(' ');
        opts.onScore && opts.onScore(`第 ${level} 关 · ${score}/${lv.score}分 · 剩${moves}步${q ? ' · 🎯' + q : ''}`);
    };

    // ---- 主循环：rAF 每帧重绘（动画期间也在推进粒子）----
    let raf = null, roundAlive = true;
    const stopLoop = () => { roundAlive = false; if (raf) cancelAnimationFrame(raf); raf = null; };
    const lastT = { v: now() };
    const loop = () => {
        if (roundAlive === false) return;
        const t = now(), dt = Math.min(0.05, (t - lastT.v) / 1000); lastT.v = t;
        for (let k = sparks.length - 1; k >= 0; k--) {
            const sp = sparks[k];
            sp.t += dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 380 * dt;
            if (sp.t >= sp.life) sparks.splice(k, 1);
        }
        draw();
        raf = requestAnimationFrame(loop);
    };
    loop();

    // ---- 交互（交换 → 滑动动画；无效 → 摇摆反馈，不再静默）----
    const onTap = async p => {
        if (busy || over) return;
        const j = Math.floor((p.x - 2) / cellW), i = Math.floor((p.y - 2) / cellH);
        if (!inB(i, j) || board[i][j] < 0) return;   // 空格/石块不可选
        if (!sel) { sel = [i, j]; return; }
        if (sel[0] === i && sel[1] === j) { sel = null; return; }
        const di = Math.abs(sel[0] - i), dj = Math.abs(sel[1] - j);
        if (di + dj !== 1 || board[i][j] < 0) { sel = [i, j]; return; }
        const [si, sj] = sel;
        sel = null;
        busy = true;
        // 交换 → 不产生消除则滑回并摇摆
        [board[si][sj], board[i][j]] = [board[i][j], board[si][sj]];
        if (hasMatch()) {
            moves--;
            anim.swap = { a: [si, sj], b: [i, j], t0: now(), dur: 150, back: false };
            await new Promise(r => setTimeout(r, 150));
            anim.swap = null;
            await collapse();
            if (objectivesDone()) { finish(true, '目标全部达成！'); return; }
            if (moves <= 0) { finish(false, '步数用完，目标未达成'); return; }
        } else {
            anim.swap = { a: [si, sj], b: [i, j], t0: now(), dur: 140, back: true };  // 滑过去…
            await new Promise(r => setTimeout(r, 140));
            [board[si][sj], board[i][j]] = [board[i][j], board[si][sj]];              // …滑回来
            anim.swap = null;
            anim.shake = { a: [si, sj], b: [i, j], t0: now(), dur: 300 };             // 摇头：这两个不能消
            await new Promise(r => setTimeout(r, 300));
            anim.shake = null;
        }
        busy = false;
    };
    MG.bind(c, onTap);
    MG.hint(container, `第 ${level} 关：${lv.moves} 步内拿到 ${lv.score} 分${lv.quotas ? '并集齐颜色配额' : ''}${lv.rocks ? '（石块需相邻消除击碎）' : ''}`);
    const _oldStop = api.stop.bind(api);
    api.stop = () => { stopLoop(); _oldStop(); };
    return api;
}
