// 2048 · 葫芦娃妖怪版：11 级妖怪合并（L1+L1→L2，最高 L11）
// 妖怪用系统彩色 Emoji 渲染（Q 版、风格统一），格子为渐变底板 + 名字胶囊 + 等级徽标
// 支持：触屏滑动 / 鼠标拖拽 / 方向键 / WASD
window.MiniGames = window.MiniGames || {};

// ============ 11 只妖怪定义（按用户给的等级表）============
// e: emoji 主体；c1/c2: 底板渐变亮/暗色；bd: 描边+徽标色
const MON = [
    { n: '毒蛇·绿', e: '🐍', c1: '#a8e888', c2: '#4a9a4a', bd: '#2e6e2e' },
    { n: '毒蛇·蓝', e: '🐍', c1: '#9ab8f8', c2: '#4a6ac0', bd: '#2e4a8e' },
    { n: '黄蜂精',  e: '🐝', c1: '#ffe896', c2: '#d0a030', bd: '#8f6a10' },
    { n: '蛤蟆·绿', e: '🐸', c1: '#a8ecA8', c2: '#58a858', bd: '#357035' },
    { n: '蛤蟆·蓝', e: '🐸', c1: '#c4acf8', c2: '#7048c8', bd: '#4a2a8e' },
    { n: '蛤蟆·红', e: '🐸', c1: '#ffa0a0', c2: '#d04848', bd: '#8e2020' },
    { n: '蜈蚣精',  e: '🐛', c1: '#ffcf96', c2: '#c07838', bd: '#8a5015' },
    { n: '蜘蛛精',  e: '🕷️', c1: '#dcbcf8', c2: '#8850c8', bd: '#582a8e' },
    { n: '鳄鱼精',  e: '🐊', c1: '#ffbc80', c2: '#c07028', bd: '#8a4810' },
    { n: '蝎子精',  e: '🦂', c1: '#ffb088', c2: '#c05030', bd: '#8a3010' },
    { n: '蛇精',    e: '🐍', c1: '#d0b0f2', c2: '#6a3aa8', bd: '#3a1a68', crown: true },
];

// 等级 → 妖怪名（level 0 返回空串，用于空棋盘）
const MON_NAME = level => (level > 0 && MON[level - 1]) ? MON[level - 1].n : '';

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// easeOutBack：弹性弹出
const easeOutBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

// =================== 怪物格子渲染 ===================
// anim: { scale: 弹出缩放, dy: 闲置浮动偏移, flash: 0-1 合并闪光强度 }
function drawMonsterCell(ctx, level, x, y, s, anim) {
    const m = MON[level - 1]; if (!m) return;
    const scale = anim && anim.scale != null ? anim.scale : 1;
    const dy = (anim && anim.dy) || 0;
    const cx = x + s / 2, cy = y + s / 2 + dy;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);

    // 投影
    roundRect(ctx, x + 6, y + 8, s - 12, s - 12, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    // 底板渐变
    roundRect(ctx, x + 4, y + 4, s - 8, s - 8, 16);
    const g = ctx.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, m.c1); g.addColorStop(1, m.c2);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = m.bd; ctx.stroke();
    // 顶部内高光
    roundRect(ctx, x + 9, y + 8, s - 18, s * 0.26, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.fill();

    // 妖怪主体（emoji）
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(s * 0.52)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(m.e, cx, cy - s * 0.05);
    // 蛇精：头顶王冠
    if (m.crown) {
        ctx.font = `${Math.round(s * 0.26)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
        ctx.fillText('👑', cx + s * 0.14, cy - s * 0.32);
    }

    // 合并闪光
    if (anim && anim.flash > 0) {
        roundRect(ctx, x + 4, y + 4, s - 8, s - 8, 16);
        ctx.fillStyle = `rgba(255,255,255,${0.62 * anim.flash})`; ctx.fill();
    }

    // 名字胶囊（底部）
    const capW = m.n.length * 12 + 12;
    roundRect(ctx, cx - capW / 2, y + s - 24, capW, 17, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px "Microsoft YaHei",sans-serif';
    ctx.fillText(m.n, cx, y + s - 15);

    // 等级徽标（左上角：白底彩字圆徽）
    ctx.beginPath(); ctx.arc(x + 18, y + 18, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = m.bd; ctx.stroke();
    ctx.fillStyle = m.bd;
    ctx.font = 'bold 13px Arial,sans-serif';
    ctx.fillText(level, x + 18, y + 18.5);
    ctx.restore();
}

// =================== 关卡配置（20 关，目标 = 凑出指定等级怪物）===================
MiniGames.g2048 = {
    LEVELS: [
        { name: '伏蛇',     target: 2,  moves: 100, desc: '击败 毒蛇·蓝 · 100 步' },
        { name: '蜂起',     target: 3,  moves: 170, desc: '击败 黄蜂精 · 170 步' },
        { name: '通灵',     target: 3,  moves: 140, desc: '击败 黄蜂精 · 140 步' },
        { name: '蛤蟆咒',   target: 4,  moves: 280, desc: '击败 蛤蟆·绿 · 280 步' },
        { name: '石门试炼', target: 4,  moves: 250, rocks: 2, desc: '击败 蛤蟆·绿 · 250 步 · 🪨2' },
        { name: '呱声震谷', target: 5,  moves: 220, desc: '击败 蛤蟆·蓝 · 220 步' },
        { name: '毒潭',     target: 5,  moves: 480, desc: '击败 蛤蟆·蓝 · 480 步' },
        { name: '乱石沼',   target: 6,  moves: 430, rocks: 3, desc: '击败 蛤蟆·红 · 430 步 · 🪨3' },
        { name: '魔音窟',   target: 6,  moves: 380, desc: '击败 蛤蟆·红 · 380 步' },
        { name: '百足径',   target: 7,  moves: 800, desc: '击败 蜈蚣精 · 800 步' },
        { name: '石林',     target: 7,  moves: 700, rocks: 3, desc: '击败 蜈蚣精 · 700 步 · 🪨3' },
        { name: '蛛丝洞',   target: 8,  moves: 620, desc: '击败 蜘蛛精 · 620 步' },
        { name: '碎石带',   target: 8,  moves: 560, rocks: 4, desc: '击败 蜘蛛精 · 560 步 · 🪨4' },
        { name: '鳄潭',     target: 9,  moves: 1400, desc: '击败 鳄鱼精 · 1400 步' },
        { name: '顽石岗',   target: 9,  moves: 1250, rocks: 4, desc: '击败 鳄鱼精 · 1250 步 · 🪨4' },
        { name: '蝎尾崖',   target: 10, moves: 1100, desc: '击败 蝎子精 · 1100 步' },
        { name: '深渊石阵', target: 10, moves: 980,  rocks: 5, desc: '击败 蝎子精 · 980 步 · 🪨5' },
        { name: '蛇穴',     target: 11, moves: 2400, desc: '击败 蛇精 · 2400 步' },
        { name: '磐石塔',   target: 11, moves: 2100, rocks: 4, desc: '击败 蛇精 · 2100 步 · 🪨4' },
        { name: '诛妖·终',  target: 11, moves: 1800, rocks: 6, desc: '击败 蛇精 · 1800 步 · 🪨6' },
    ],
    // 由 MG.runGame 统一管理关卡选择；g2048.start 只负责对局逻辑
    // opts.levelIdx: 关卡索引（0-based）；opts.level === 0 表示无尽模式
    start(container, opts) {
        const level = opts.levelIdx != null ? opts.levelIdx + 1 : (opts.level | 0);
        const api = { stop() {} };
        g2048Round(container, opts, level, api);
        return api;
    },
};

// =================== 单局游戏主逻辑 ===================
function g2048Round(container, opts, level, api) {
    const N = 4, SIZE = 100;
    const lv = level > 0 ? MiniGames.g2048.LEVELS[level - 1] : { target: 11, moves: Infinity, rocks: 0 };
    const target = lv.target || 11, maxMoves = lv.moves || Infinity, rockN = lv.rocks || 0;
    const { c, ctx, w, h, destroy } = MG.canvas(container, N * SIZE + 20, N * SIZE + 20);

    let board = Array.from({ length: N }, () => Array(N).fill(0));
    let score = 0, moves = 0, over = false, stopped = false;

    // 岩石障碍（避开初始 2×2）
    const rocks = new Set();
    const rockKey = (i, j) => i * N + j;
    if (rockN) {
        const cells = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cells.push([i, j]);
        MG.shuffle(cells);
        for (const [i, j] of cells) {
            if (rocks.size >= rockN) break;
            if (!(i < 2 && j < 2)) rocks.add(rockKey(i, j));
        }
    }

    // ============ 动画状态：每格 { pop: 弹出时刻, flash: 闪光时刻 } ============
    const tiles = {};
    const tileAt = (i, j) => tiles[i + ',' + j] || (tiles[i + ',' + j] = { pop: 0, flash: 0 });

    // 等级 → 分数
    const levelScore = l => l * l * 5;

    // 加权 spawn：根据目标等级动态调整
    const spawnLevel = () => {
        const maxSpawn = Math.min(11, Math.max(2, target));
        if (maxSpawn <= 2) return Math.random() < 0.85 ? 1 : 2;
        if (maxSpawn <= 4) {
            const r = Math.random();
            if (r < 0.7) return 1;
            if (r < 0.92) return 2;
            return MG.ri(3, maxSpawn);
        }
        if (maxSpawn <= 7) {
            const r = Math.random();
            if (r < 0.55) return 1;
            if (r < 0.78) return 2;
            if (r < 0.9) return 3;
            return MG.ri(4, maxSpawn);
        }
        const r = Math.random();
        if (r < 0.4) return 1;
        if (r < 0.65) return 2;
        if (r < 0.82) return 3;
        return MG.ri(4, maxSpawn);
    };

    const add = () => {
        const empty = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
            if (!board[i][j] && !rocks.has(rockKey(i, j))) empty.push([i, j]);
        if (!empty.length) return;
        const [x, y] = MG.pick(empty);
        board[x][y] = spawnLevel();
        tileAt(x, y).pop = Date.now();
    };

    // ============ 渲染（time 缺省取当前时刻；无 rAF 的环境降级为事件驱动）============
    const draw = (time) => {
        const t = time || Date.now();
        // 棋盘底：深蓝渐变 + 圆角
        roundRect(ctx, 0, 0, w, h, 16);
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#3d5a80'); bg.addColorStop(1, '#243a55');
        ctx.fillStyle = bg; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#1a2c44'; ctx.stroke();

        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
            const x = 10 + j * SIZE, y = 10 + i * SIZE;
            if (rocks.has(rockKey(i, j))) {
                // 岩石格
                roundRect(ctx, x + 5, y + 5, SIZE - 10, SIZE - 10, 14);
                ctx.fillStyle = '#4a4a56'; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = '#26262e'; ctx.stroke();
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.font = `${Math.round(SIZE * 0.5)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
                ctx.fillText('🪨', x + SIZE / 2, y + SIZE / 2);
                continue;
            }
            const v = board[i][j];
            if (v) {
                const tl = tileAt(i, j);
                const p = Math.min(1, (t - tl.pop) / 200);
                const scale = tl.pop ? easeOutBack(p) : 1;
                const dy = Math.sin(t / 460 + i * 1.7 + j * 1.3) * 2;   // 闲置浮动
                const flash = Math.max(0, 1 - (t - tl.flash) / 240);
                drawMonsterCell(ctx, v, x, y, SIZE, { scale, dy, flash });
            } else {
                roundRect(ctx, x + 6, y + 6, SIZE - 12, SIZE - 12, 14);
                ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
            }
        }
        const maxL = Math.max(...board.flat(), 0);
        if (level > 0) {
            opts.onScore && opts.onScore(`目标：${MON_NAME(target)} (Lv${target}) · 最高 Lv${maxL} · ${moves}/${maxMoves} 步 · 击退 ${score}`);
        } else {
            opts.onScore && opts.onScore(`分数 ${score} · 最高 Lv${maxL}（${MON_NAME(maxL) || '-'}） · ${moves} 步`);
        }
    };

    // 动画循环（Node 无头测试环境没有 rAF，降级为事件驱动绘制）
    let rafId = 0;
    const loop = () => { draw(); rafId = requestAnimationFrame(loop); };
    if (typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(loop);

    // 段内压缩：n + n → n+1（封顶 11）
    const compressSeg = seg => {
        const a = seg.filter(v => v);
        for (let i = 0; i < a.length - 1; i++) {
            if (a[i] === a[i + 1] && a[i] < 11) {
                a[i] += 1;
                score += levelScore(a[i]);
                a.splice(i + 1, 1);
            }
        }
        while (a.length < seg.length) a.push(0);
        return a;
    };
    const compressRow = row => {
        const out = []; let seg = [];
        for (const v of row) {
            if (v === -1) { out.push(...compressSeg(seg), -1); seg = []; }
            else seg.push(v);
        }
        out.push(...compressSeg(seg));
        return out;
    };
    const getRow = i => board[i].map((v, j) => rocks.has(rockKey(i, j)) ? -1 : v);
    const setRow = (i, r) => { board[i] = r.map(v => v === -1 ? 0 : v); };
    const getCol = j => board.map((r, i) => rocks.has(rockKey(i, j)) ? -1 : r[j]);
    const setCol = (j, cl) => { cl.forEach((v, i) => { if (v !== -1) board[i][j] = v; }); };

    const finish = (win, reason) => {
        if (over) return;
        over = true;
        let stars = 0;
        if (level > 0) {
            const ratio = (maxMoves - moves) / maxMoves;
            stars = win ? (ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1) : 0;
        }
        if (opts.onComplete) {
            const maxL = Math.max(...board.flat(), 0);
            opts.onComplete({
                win,
                stars,
                title: win ? `🏆 击败 ${MON_NAME(target)}！` : '💥 妖怪太强了…',
                lines: [reason || '', `分数 ${score} · 用了 ${moves} 步`, `最高 Lv${maxL}（${MON_NAME(maxL) || '-'}）`].filter(Boolean),
                score,
            });
        } else {
            MG.recordStars('g2048', level, stars);   // 无框架调用时兜底记录
            MG.result(container, {
                win, stars,
                title: win ? `🏆 击败 ${MON_NAME(target)}！` : '💥 妖怪太强了…',
                lines: [reason || '', `分数 ${score} · 用了 ${moves} 步`].filter(Boolean),
                onRetry: () => { destroy(); g2048Round(container, opts, level, api); },
                onBack: () => { destroy(); opts.onBack && opts.onBack(); },
            });
        }
        draw();
    };

    const applyDir = dir => {
        if (dir === 'L') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i)));
        if (dir === 'R') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i).reverse()).reverse());
        if (dir === 'U') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j)));
        if (dir === 'D') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j).reverse()).reverse());
    };

    const move = dir => {
        if (over) return;
        const before = JSON.parse(JSON.stringify(board));
        applyDir(dir);
        if (JSON.stringify(board) !== before) {
            moves++;
            // 标记升级格（闪光）与移动格（重置闲置相位）
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                if (board[i][j] && board[i][j] > (before[i][j] || 0)) {
                    tileAt(i, j).flash = Date.now();
                }
            }
            add();
        }
        draw();
        if (board.flat().includes(target)) return finish(true, `在 ${moves} 步内合出了 ${MON_NAME(target)}！`);
        if (level > 0 && moves >= maxMoves) return finish(false, `步数用完（${maxMoves} 步）还没凑出 ${MON_NAME(target)}`);
        // 死局检测
        const can = ['L', 'R', 'U', 'D'].some(d => {
            const snap = JSON.stringify(board), sc = score;
            applyDir(d);
            const changed = JSON.stringify(board) !== snap;
            board = JSON.parse(snap); score = sc;
            return changed;
        });
        if (!can) finish(level === 0, '棋盘锁死，无路可走');
    };

    // ============ 输入：键盘（方向键 + WASD）============
    const kbd = e => {
        const k = ({ ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D', a: 'L', d: 'R', w: 'U', s: 'D' })[(e.key || '').toLowerCase()];
        if (k) { e.preventDefault(); move(k); }
    };
    window.addEventListener('keydown', kbd);

    // ============ 输入：鼠标拖拽（按下 → 松开判定方向）============
    let mdX = 0, mdY = 0, dragging = false;
    const md = e => { dragging = true; mdX = e.clientX; mdY = e.clientY; e.preventDefault(); };
    const mu = e => {
        if (!dragging) return;
        dragging = false;
        const dx = e.clientX - mdX, dy = e.clientY - mdY;
        if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;   // 视为点击，忽略
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L');
        else move(dy > 0 ? 'D' : 'U');
    };
    c.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);

    // ============ 输入：触屏滑动 ============
    let tsX = 0, tsY = 0;
    const ts = e => { const t = e.touches[0]; tsX = t.clientX; tsY = t.clientY; };
    const te = e => {
        const t = e.changedTouches[0]; const dx = t.clientX - tsX, dy = t.clientY - tsY;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L'); else move(dy > 0 ? 'D' : 'U');
    };
    c.addEventListener('touchstart', ts, { passive: true });
    c.addEventListener('touchend', te, { passive: true });

    const origStop = api.stop;
    api.stop = function () {
        stopped = true;
        if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
        window.removeEventListener('keydown', kbd);
        c.removeEventListener('mousedown', md);
        window.removeEventListener('mouseup', mu);
        c.removeEventListener('touchstart', ts);
        c.removeEventListener('touchend', te);
        origStop();
    };

    add(); add(); draw();
    MG.hint(container, level > 0
        ? `第 ${level} 关：${maxMoves} 步内击败 ${MON_NAME(target)}${rockN ? '（🪨岩石无法移动）' : ''} · 拖动 / 方向键 / WASD`
        : '拖动（或方向键 / WASD）合并妖怪：两只同级 → 升一级，最高 Lv11 蛇精！');

    // 测试钩子（无头测试用）
    if (typeof window !== 'undefined' && window.__MG_TEST) {
        window.__g2048 = {
            get board() { return board; }, get moves() { return moves; }, get over() { return over; },
            get score() { return score; },
            move, target, maxMoves, rocks,
            N, SIZE, add, drawMonsterCell, MON,
        };
    }
    return api;
}
