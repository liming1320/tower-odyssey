// 2048 · 葫芦娃妖怪版：11 级妖怪合并（L1+L1→L2，最高 L11）
// 妖怪用系统彩色 Emoji 渲染（Q 版、风格统一），格子为渐变底板 + 名字胶囊 + 等级徽标
// 支持：触屏滑动 / 鼠标拖拽 / 方向键 / WASD
window.MiniGames = window.MiniGames || {};

// ============ 12 只妖怪定义（按用户给的等级表）============
// 底板统一深色（避免同色系妖怪撞色难辨），靠「造型 + 等级环 + 等级数字」区分
// e: emoji 主体；tint: 等级环/徽标色（按等级排列成可辨识的色谱）
const MON = [
    { n: '毒蛇·绿', e: '🐍', tint: '#8ed86a' },
    { n: '毒蛇·蓝', e: '🐍', tint: '#5cc7ff' },
    { n: '黄蜂精',  e: '🐝', tint: '#ffd56b' },
    { n: '蛤蟆·绿', e: '🐸', tint: '#7ae8a0' },
    { n: '蛤蟆·蓝', e: '🐸', tint: '#6a8cff' },
    { n: '蛤蟆·红', e: '🐸', tint: '#ff8a7a' },
    { n: '蜈蚣精',  e: '🐛', tint: '#ffb04a' },
    { n: '蜘蛛精', e: '🕷️', tint: '#c48aff' },
    { n: '鳄鱼精',  e: '🐊', tint: '#6ad8c0' },
    { n: '蝎子精',  e: '🦂', tint: '#ff6b8a' },
    { n: '蛇精',    e: '🐍', tint: '#ffd700', crown: true },
    { n: '万妖王',  e: '👹', tint: '#ff2d6f', crown: true },     // 11+11→12 终极形态
];
const MAX_LV = 12;   // 最高等级（11+11 可继续合出 12「万妖王」）

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
    // 底板：统一深石板色（不按妖怪上色，避免同色系撞色）
    roundRect(ctx, x + 4, y + 4, s - 8, s - 8, 16);
    const g = ctx.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, '#4a5570'); g.addColorStop(0.55, '#39415a'); g.addColorStop(1, '#2a3044');
    ctx.fillStyle = g; ctx.fill();
    // 等级色细环（区分同造型妖怪的唯一色彩线索，不是色块背景）
    ctx.lineWidth = 3.5; ctx.strokeStyle = m.tint; ctx.stroke();
    // 顶部内高光
    roundRect(ctx, x + 9, y + 8, s - 18, s * 0.26, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();

    // 妖怪主体（emoji，放大突出造型）
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(s * 0.58)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(m.e, cx, cy - s * 0.06);
    // 蛇精：头顶王冠
    if (m.crown) {
        ctx.font = `${Math.round(s * 0.28)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
        ctx.fillText('👑', cx + s * 0.15, cy - s * 0.34);
    }

    // 合并闪光
    if (anim && anim.flash > 0) {
        roundRect(ctx, x + 4, y + 4, s - 8, s - 8, 16);
        ctx.fillStyle = `rgba(255,255,255,${0.62 * anim.flash})`; ctx.fill();
    }

    // 名字胶囊（底部）
    const capW = m.n.length * 12 + 12;
    roundRect(ctx, cx - capW / 2, y + s - 24, capW, 17, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px "Microsoft YaHei",sans-serif';
    ctx.fillText(m.n, cx, y + s - 15);

    // 等级徽标（左上角：等级色实心圆 + 白字，辨识度优先）
    ctx.beginPath(); ctx.arc(x + 19, y + 19, 13.5, 0, Math.PI * 2);
    ctx.fillStyle = m.tint; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    ctx.fillStyle = '#1a1f2e';
    ctx.font = 'bold 15px Arial,sans-serif';
    ctx.fillText(level, x + 19, y + 19.5);
    ctx.restore();
}

// =================== 关卡配置（50 关，按目标等级从 2 升到 12「万妖王」）===================
    // 棋盘大小随 target 自动放大（4×4 / 5×5 / 6×6），无尽固定 5×5
    // LV(目标等级, 关卡名, 步数上限, 岩石数)
    // 步数上限给得很宽裕：合成 Lv n 至少需要 2^(n-1) 只 1 级妖怪（= 步数下限），
    // 这里的配额普遍是下限的 1.5~2.5 倍，正常玩不会卡死，剩余步数越多星级越高。
    const LV = (target, name, moves, rocks) => ({ target, name, moves, rocks: rocks || 0 });
    MiniGames.g2048 = {
        LEVELS: [
            // target 2 — 毒蛇·蓝：4×4，宽松入门
            LV(2, '伏蛇',      100),
            LV(2, '蛇蜕',      90),
            LV(2, '毒雾',      110, 1),
            // target 3 — 黄蜂精：4×4
            LV(3, '蜂起',      170),
            LV(3, '通灵',      140),
            LV(3, '黄蜂窝',    200, 2),
            // target 4 — 蛤蟆·绿：4×4
            LV(4, '蛤蟆咒',    280),
            LV(4, '石门试炼',  250, 2),
            LV(4, '青沼地',    240),
            // target 5 — 蛤蟆·蓝：4×4
            LV(5, '呱声震谷',  220),
            LV(5, '毒潭',      480),
            LV(5, '蓝鳞渊',    400, 2),
            // target 6 — 蛤蟆·红：4×4
            LV(6, '乱石沼',    430, 3),
            LV(6, '魔音窟',    380),
            LV(6, '血红泽',    500, 3),
            // target 7 — 蜈蚣精：4×4
            LV(7, '百足径',    800),
            LV(7, '石林',      700, 3),
            LV(7, '万足坑',    620, 3),
            // target 8 — 蜘蛛精：5×5（棋盘放大，给腾挪空间）
            LV(8, '蛛丝洞',    620),
            LV(8, '碎石带',    560, 4),
            LV(8, '织网岭',    720, 3),
            LV(8, '盘丝宫',    680, 4),
            // target 9 — 鳄鱼精：5×5
            LV(9, '鳄潭',      1400),
            LV(9, '顽石岗',    1250, 4),
            LV(9, '鳄甲门',    1500, 4),
            LV(9, '深渊鳍',    1600, 3),
            // target 10 — 蝎子精：5×5
            LV(10, '蝎尾崖',   1100),
            LV(10, '深渊石阵', 980,  5),
            LV(10, '毒尾阵',   1300, 5),
            LV(10, '暗刺谷',   1180, 4),
            LV(10, '蜇魂殿',   1400, 5),
            // target 11 — 蛇精：6×6
            LV(11, '蛇穴',     2400),
            LV(11, '磐石塔',   2100, 4),
            LV(11, '诛妖·终',  1800, 6),
            LV(11, '金鳞门',   2600, 5),
            LV(11, '蛇蜕祭',   2400, 4),
            LV(11, '千年咒',   2800, 5),
            LV(11, '冷牙殿',   3000, 4),
            // target 12 — 万妖王：6×6（终极目标）
            LV(12, '万妖殿',   3500, 6),
            LV(12, '妖王座',   3800, 6),
            LV(12, '终极试炼', 3200, 7),
            LV(12, '不灭之焰', 4200, 6),
            LV(12, '王者加冕', 4500, 5),
            LV(12, '群妖之巅', 4000, 7),
            LV(12, '归一塔',   4800, 6),
            LV(12, '洪荒之地', 5000, 6),
            LV(12, '永恒战场', 4400, 7),
            LV(12, '混沌尽头', 5200, 6),
            LV(12, '至高天',   5500, 5),
            LV(12, '万界归一', 4800, 7),
        ],
    // 无尽模式：格子没满就能一直玩，棋盘锁死即结束（无需解锁任何关卡）
    ENDLESS: { name: '无尽 · 降妖', desc: '6×6 大棋盘 · 格子没满就一直合，合出蛇精也不停' },
    // 由 MG.runGame 统一管理关卡选择；g2048.start 只负责对局逻辑
    // opts.levelIdx: 关卡索引（0-based）；opts.levelIdx === -1 表示无尽模式
    start(container, opts) {
        const endless = opts.endless === true || opts.levelIdx === -1;
        const level = endless ? 0 : ((opts.levelIdx != null ? opts.levelIdx + 1 : (opts.level | 0)) || 1);
        const api = { stop() {} };
        g2048Round(container, opts, level, api);
        return api;
    },
};

// =================== 单局游戏主逻辑 ===================
function g2048Round(container, opts, level, api) {
    // 棋盘大小随目标等级自动放大：低目标紧凑 4×4 保持挑战；高目标扩到 5×5 / 6×6 给腾挪空间
    //   target ≤ 7 → 4×4  target 8-10 → 5×5  target ≥ 11 → 6×6
    // 无尽模式固定 6×6（空间大、凑齐 +1 不易填满、玩得更久）
    const sizeFor = t => t <= 7 ? 4 : (t <= 10 ? 5 : 6);
    const lv = level > 0 ? MiniGames.g2048.LEVELS[level - 1] : { target: 12, moves: Infinity, rocks: 0 };
    const target = lv.target || 12;
    const N = level > 0 ? sizeFor(target) : 6;
    const SIZE = Math.floor(Math.min(420, 340 + 36 * N) / N);
    // 步数兜底：关卡数据万一缺 moves（或被补齐逻辑生成的关卡），按合成所需 block 数给一个宽裕配额
    let maxMoves = Number.isFinite(lv.moves) ? lv.moves : 0;
    if (level > 0 && maxMoves <= 0) maxMoves = Math.ceil(Math.pow(2, target - 1) * 2.2) + 60;
    if (level === 0) maxMoves = Infinity;
    const rockN = lv.rocks || 0;
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

    // ============ Spawn 策略 ============
    // 新出现的怪只出 1 级 / 2 级（85% / 15%）—— 跟经典 2048 一致，让玩家循序渐进、玩的时间长
    // 高级怪只能通过合并低低怪自然产生
    const spawnLevel = () => Math.random() < 0.85 ? 1 : 2;

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
        // 封顶合并时的全屏闪光（两个 MAX_LV 相遇）
        const capFlash = Math.max(0, 1 - (t - capMergeFlash) / 600);
        if (capFlash > 0) {
            ctx.fillStyle = `rgba(255, 215, 0, ${0.35 * capFlash})`;
            ctx.fillRect(0, 0, w, h);
        }
        if (level > 0) {
            const left = maxMoves - moves;
            const urgent = left <= Math.max(15, maxMoves * 0.12);
            opts.onScore && opts.onScore(`目标：${MON_NAME(target)} (Lv${target}) · 最高 Lv${maxL} · ${moves}/${maxMoves} 步${urgent ? ' ⚠步数告急' : ''} · 击退 ${score} · ${N}×${N}`);
        } else {
            opts.onScore && opts.onScore(`分数 ${score} · 最高 Lv${maxL}（${MON_NAME(maxL) || '-'}） · ${moves} 步 · ${N}×${N}`);
        }
    };

    // 动画循环（Node 无头测试环境没有 rAF，降级为事件驱动绘制）
    let rafId = 0;
    const loop = () => { draw(); rafId = requestAnimationFrame(loop); };
    if (typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(loop);

    // 段内压缩：n + n → n+1（封顶 MAX_LV=12「万妖王」）
    // 两个万妖王相遇：保留两枚 + 大额加分（封顶后不能再升，但玩家仍能感受到合成反馈 + 屏幕闪光）
    let capMergeFlash = 0;
    const compressSeg = seg => {
        const a = seg.filter(v => v);
        for (let i = 0; i < a.length - 1; i++) {
            if (a[i] === a[i + 1] && a[i] < MAX_LV) {
                a[i] += 1;
                score += levelScore(a[i]);
                a.splice(i + 1, 1);
            } else if (a[i] === MAX_LV && a[i + 1] === MAX_LV) {
                score += levelScore(MAX_LV) * 3;
                capMergeFlash = Date.now();
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
        const maxL = Math.max(...board.flat(), 0);
        // 无尽模式：记录最高分 / 最高等级
        let bestTxt = '';
        if (level === 0) {
            let best = { score: 0, lv: 0 };
            try { best = JSON.parse(localStorage.getItem('mg-g2048-endless')) || best; } catch (e) {}
            const isNew = score > (best.score || 0);
            best = { score: Math.max(best.score || 0, score), lv: Math.max(best.lv || 0, maxL) };
            try { localStorage.setItem('mg-g2048-endless', JSON.stringify(best)); } catch (e) {}
            bestTxt = `${isNew ? '🎉 新纪录！' : ''}历史最高 ${best.score} 分 · Lv${best.lv}`;
        }
        if (opts.onComplete) {
            opts.onComplete({
                win: level > 0 ? win : false,
                stars,
                title: level === 0 ? '🏁 棋盘满了！' : (win ? `🏆 击败 ${MON_NAME(target)}！` : '💥 妖怪太强了…'),
                lines: (level === 0
                    ? [reason || '', `本局 ${score} 分 · ${moves} 步`, `最高 Lv${maxL}（${MON_NAME(maxL) || '-'}）`, bestTxt]
                    : [reason || '', `分数 ${score} · 用了 ${moves} 步`, `最高 Lv${maxL}（${MON_NAME(maxL) || '-'}）`]).filter(Boolean),
                score,
                endless: level === 0,
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
            let merged = false;
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                if (board[i][j] && board[i][j] > (before[i][j] || 0)) {
                    tileAt(i, j).flash = Date.now(); merged = true;
                }
            }
            add();
            try { MG.audio && MG.audio.sfx(merged ? 'coin' : 'click'); } catch (e) { }
        }
        draw();
        if (level > 0 && board.flat().includes(target)) return finish(true, `在 ${moves} 步内合出了 ${MON_NAME(target)}！`);
        if (level > 0 && moves >= maxMoves) return finish(false, `步数用完（${maxMoves} 步）还没凑出 ${MON_NAME(target)}`);
        // 死局检测
        const can = ['L', 'R', 'U', 'D'].some(d => {
            const snap = JSON.stringify(board), sc = score;
            applyDir(d);
            const changed = JSON.stringify(board) !== snap;
            board = JSON.parse(snap); score = sc;
            return changed;
        });
        if (!can) finish(false, level === 0 ? '棋盘满了，无处可动' : '棋盘锁死，无路可走');
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
