// 2048：20 关目标挑战（目标方块 + 步数限制 + 岩石障碍）+ 经典无尽模式
window.MiniGames = window.MiniGames || {};
MiniGames.g2048 = {
    LEVELS: [
        { name: '见习', target: 64, moves: 100 }, { name: '学徒', target: 128, moves: 170 },
        { name: '进阶', target: 128, moves: 140 }, { name: '高手', target: 256, moves: 280 },
        { name: '岩石初现', target: 256, moves: 250, rocks: 2 }, { name: '精通', target: 256, moves: 220 },
        { name: '大师', target: 512, moves: 480 }, { name: '乱石阵', target: 512, moves: 430, rocks: 3 },
        { name: '宗师', target: 512, moves: 380 }, { name: '半程试炼', target: 1024, moves: 800 },
        { name: '石林', target: 1024, moves: 700, rocks: 3 }, { name: '超凡', target: 1024, moves: 620 },
        { name: '碎石带', target: 1024, moves: 560, rocks: 4 }, { name: '登峰', target: 2048, moves: 1400 },
        { name: '顽石', target: 2048, moves: 1250, rocks: 4 }, { name: '造极', target: 2048, moves: 1100 },
        { name: '石阵深渊', target: 2048, moves: 980, rocks: 5 }, { name: '传说', target: 4096, moves: 2400 },
        { name: '磐石', target: 4096, moves: 2100, rocks: 4 }, { name: '合体之神', target: 4096, moves: 1800, rocks: 6 },
    ],
    start(container, opts) {
        let alive = true;
        const api = { stop() { alive = false; } };
        const showSelect = () => {
            if (!alive) return;
            const levels = this.LEVELS.map((lv, i) => ({
                name: lv.name || `第 ${i + 1} 关`,
                desc: `${lv.target || 64} · ${lv.moves}步${lv.rocks ? ' · 🪨' + lv.rocks : ''}`,
            }));
            MG.levelSelect(container, {
                game: 'g2048', title: '2048 · 目标挑战', levels,
                extra: [{ label: '∞ 无尽模式（经典玩法）', onClick: () => runRound(0) }],
                onStart: idx => runRound(idx + 1),
            });
        };
        const runRound = level => { if (alive) g2048Round(container, opts, level, api, showSelect, runRound); };
        showSelect();
        return api;
    },
};

function g2048Round(container, opts, level, api, onBack, onReplay) {
    const N = 4, SIZE = 100;
    const lv = level > 0 ? MiniGames.g2048.LEVELS[level - 1] : { target: Infinity, moves: Infinity, rocks: 0 };
    const target = lv.target || 64, maxMoves = lv.moves || 40, rockN = lv.rocks || 0;
    const { c, ctx, w, h, destroy } = MG.canvas(container, N * SIZE + 20, N * SIZE + 20);
    const COLORS = { 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e', 4096: '#3cff9e' };
    const TXTCOLOR = { 2: '#776e65', 4: '#776e65' };

    let board = Array.from({ length: N }, () => Array(N).fill(0));
    let score = 0, moves = 0, over = false;
    // 岩石障碍：随机放置，避开初始两格
    const rocks = new Set();
    const rockKey = (i, j) => i * N + j;
    if (rockN) {
        const cells = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cells.push([i, j]);
        MG.shuffle(cells);
        for (const [i, j] of cells) {
            if (rocks.size >= rockN) break;
            if (!(i < 2 && j < 2)) rocks.add(rockKey(i, j)); // 保护初始区域
        }
    }
    const add = () => {
        const empty = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
            if (!board[i][j] && !rocks.has(rockKey(i, j))) empty.push([i, j]);
        if (!empty.length) return;
        const [x, y] = MG.pick(empty);
        board[x][y] = Math.random() < 0.9 ? 2 : 4;
    };
    const draw = () => {
        ctx.fillStyle = '#bbada0'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
            const x = 10 + j * SIZE + 4, y = 10 + i * SIZE + 4;
            if (rocks.has(rockKey(i, j))) {  // 岩石
                ctx.fillStyle = '#5a5448'; ctx.fillRect(x, y, SIZE - 8, SIZE - 8);
                ctx.fillStyle = '#6e685a';
                ctx.beginPath(); ctx.arc(x + SIZE * 0.38, y + SIZE * 0.36, SIZE * 0.16, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + SIZE * 0.62, y + SIZE * 0.58, SIZE * 0.2, 0, Math.PI * 2); ctx.fill();
                continue;
            }
            const v = board[i][j];
            ctx.fillStyle = COLORS[v] || (v ? '#2ee6a8' : '#1a1c2a');
            ctx.fillRect(x, y, SIZE - 8, SIZE - 8);
            if (v) {
                ctx.fillStyle = TXTCOLOR[v] || '#fff';
                ctx.font = `${v >= 1000 ? 28 : v >= 100 ? 36 : 44}px bold sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(v, x + (SIZE - 8) / 2, y + (SIZE - 8) / 2);
            }
        }
        if (level > 0) {
            opts.onScore && opts.onScore(`目标 ${target} · 已用 ${moves}/${maxMoves} 步 · 分数 ${score}`);
        } else {
            opts.onScore && opts.onScore(`分数：${score}`);
        }
    };
    // 带岩石的行压缩：按岩石分段，段内滑动合并
    const compressSeg = seg => {
        const a = seg.filter(v => v);
        for (let i = 0; i < a.length - 1; i++) {
            if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); }
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
        if (win && level > 0) {
            const ratio = (maxMoves - moves) / maxMoves;
            stars = ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
            MG.recordStars('g2048', level, stars);
        }
        if (level > 0) {
            MG.result(container, {
                win, stars,
                title: win ? `🏆 第 ${level} 关达成 ${target}！` : '💥 挑战失败',
                lines: [reason || '', `分数 ${score} · 用了 ${moves} 步`].filter(Boolean),
                hasNext: win && level < MiniGames.g2048.LEVELS.length,
                onRetry: () => { destroy(); onReplay(level); },
                onNext: () => { destroy(); onReplay(level + 1); },
                onBack,
            });
        } else {
            MG.result(container, {
                win: true, title: '本局结束',
                lines: [`分数 ${score}`, `最大方块 ${Math.max(...board.flat().filter(v => v > 0), 0)}`],
                onRetry: () => { destroy(); onReplay(0); }, onBack,
            });
        }
        draw();
    };
    const move = dir => {
        if (over) return;
        const before = JSON.stringify(board);
        if (dir === 'L') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i)));
        if (dir === 'R') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i).reverse()).reverse());
        if (dir === 'U') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j)));
        if (dir === 'D') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j).reverse()).reverse());
        if (JSON.stringify(board) !== before) { moves++; add(); }
        draw();
        if (board.flat().includes(target)) return finish(true, `在 ${moves} 步内合出了 ${target}！`);
        if (level > 0 && moves >= maxMoves) return finish(false, `步数用完（${maxMoves} 步）还没合出 ${target}`);
        // 死局检测：任何方向都无法移动
        const can = ['L', 'R', 'U', 'D'].some(d => {
            const snap = JSON.stringify(board), sc = score;
            if (d === 'L') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i)));
            if (d === 'R') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i).reverse()).reverse());
            if (d === 'U') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j)));
            if (d === 'D') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j).reverse()).reverse());
            const changed = JSON.stringify(board) !== snap;
            board = JSON.parse(snap); score = sc;
            return changed;
        });
        if (!can) finish(level === 0, '棋盘锁死，无路可走');
    };
    const kbd = e => {
        const k = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }[e.key];
        if (k) { e.preventDefault(); move(k); }
    };
    window.addEventListener('keydown', kbd);
    let startX, startY;
    const ts = e => { const t = e.touches[0]; startX = t.clientX; startY = t.clientY; };
    const te = e => {
        const t = e.changedTouches[0]; const dx = t.clientX - startX, dy = t.clientY - startY;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L'); else move(dy > 0 ? 'D' : 'U');
    };
    c.addEventListener('touchstart', ts);
    c.addEventListener('touchend', te);

    const origStop = api.stop;
    api.stop = function () { window.removeEventListener('keydown', kbd); c.removeEventListener('touchstart', ts); c.removeEventListener('touchend', te); origStop(); };

    add(); add(); draw();
    MG.hint(container, level > 0
        ? `第 ${level} 关：${maxMoves} 步内合出 ${target}${rockN ? '（🪨岩石无法移动）' : ''}`
        : '滑动屏幕（或方向键）合并方块，挑战 2048！');
    // 测试钩子（仅测试模式）
    if (typeof window !== 'undefined' && window.__MG_TEST) {
        window.__g2048 = {
            get board() { return board; }, get score() { return score; }, get moves() { return moves; }, get over() { return over; },
            move, target, maxMoves, rocks,
        };
    }
    return api;
}
