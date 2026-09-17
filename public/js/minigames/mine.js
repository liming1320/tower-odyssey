// 扫雷：20 关挑战，棋盘尺寸/雷数递增
//
// 交互（2026-09-15 重做，原来有三个实打实的 bug）：
//   ① 长按必炸：MG.bind 是 **pointerdown 立即触发**，按下就翻开，长按标记那条分支
//      永远走不到（引擎也不提供 p.longTap），于是「长按」= 当场翻格 = 踩雷。
//      → 改成自己按 pointerdown/up 计时：短按翻开，按住 420ms 标旗（到点即标，不必抬手）。
//   ② 右键没反应：contextmenu 里写死了 onTap({x:0,y:0})，永远只作用于左上角那一格。
//      → 用 MG.pointerPos 换算真实格子。
//   ③ 失败没交代：踩雷后立刻弹结算，玩家看不到自己踩在哪、雷都在哪。
//      → 失败演出：踩中的格子爆开红圈 → 其余雷按距离由近到远依次揭示 → 停 0.7s 再结算；
//        标错的旗子打红叉，正确标记的雷保留 🚩。
window.MiniGames = window.MiniGames || {};
MiniGames.mine = {
    LEVELS: [
        // { name, desc, rows, cols, mines }
        { name: '入门', desc: '5×5 · 4 雷' },
        { name: '入门 II', desc: '6×6 · 5 雷' },
        { name: '基础', desc: '6×6 · 8 雷' },
        { name: '基础 II', desc: '7×7 · 9 雷' },
        { name: '练习', desc: '7×7 · 12 雷' },
        { name: '练习 II', desc: '8×8 · 12 雷' },
        { name: '经典', desc: '9×9 · 10 雷' },
        { name: '经典 II', desc: '9×9 · 14 雷' },
        { name: '进阶', desc: '10×10 · 16 雷' },
        { name: '进阶 II', desc: '10×10 · 20 雷' },
        { name: '进阶 III', desc: '10×10 · 25 雷' },
        { name: '高阶', desc: '12×12 · 25 雷' },
        { name: '高阶 II', desc: '12×12 · 30 雷' },
        { name: '高手', desc: '12×14 · 30 雷' },
        { name: '高手 II', desc: '14×14 · 35 雷' },
        { name: '硬核', desc: '14×14 · 45 雷' },
        { name: '硬核 II', desc: '14×16 · 50 雷' },
        { name: '大师', desc: '16×16 · 50 雷' },
        { name: '大师 II', desc: '16×16 · 60 雷' },
        { name: '扫雷王', desc: '16×16 · 70 雷 · 终极' },
    ],
    PARAMS: [
        [5, 5, 4], [6, 6, 5], [6, 6, 8], [7, 7, 9], [7, 7, 12],
        [8, 8, 12], [9, 9, 10], [9, 9, 14], [10, 10, 16], [10, 10, 20],
        [10, 10, 25], [12, 12, 25], [12, 12, 30], [12, 14, 30],
        [14, 14, 35], [14, 14, 45], [14, 16, 50], [16, 16, 50],
        [16, 16, 60], [16, 16, 70],
    ],
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        // 框架 levelIdx 优先（fillLevels 会生成副本对象导致 indexOf 恒为 -1）
        const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? Math.min(idx, this.PARAMS.length - 1) : (opts.endless ? this.PARAMS.length - 1 : 0);
        const [ROWS, COLS, MINES] = this.PARAMS[pIdx] || this.PARAMS[0];
        const maxW = Math.min(container.clientWidth - 16, 480);
        const maxH = Math.min(window.innerHeight - 200, 560);
        const S = Math.max(18, Math.floor(Math.min(maxW / COLS, maxH / ROWS, 44)));
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS * S + 4, ROWS * S + 4);
        try { MG.audio && MG.audio.unlock && MG.audio.unlock(); } catch (_) { }
        let board = [], revealed = [], flagged = [], over = false, win = false;
        let hit = null;                    // 踩中的那颗雷（失败演出用）
        let flash = 0, ring = 0;           // 爆炸动画
        let alive = true, raf = 0, timers = [];
        const later = (fn, ms) => { const t = setTimeout(() => { if (alive) fn(); }, ms); timers.push(t); return t; };
        const clearTimers = () => { timers.forEach(clearTimeout); timers = []; if (raf) cancelAnimationFrame(raf); raf = 0; };

        const init = () => {
            board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
            revealed = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
            flagged = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
            let placed = 0;
            while (placed < MINES) {
                const x = MG.ri(0, COLS - 1), y = MG.ri(0, ROWS - 1);
                if (board[y][x] !== -1) { board[y][x] = -1; placed++; }
            }
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                if (board[i][j] === -1) continue;
                let n = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    if (!dy && !dx) continue;
                    const ni = i + dy, nj = j + dx;
                    if (ni >= 0 && ni < ROWS && nj >= 0 && nj < COLS && board[ni][nj] === -1) n++;
                }
                board[i][j] = n;
            }
        };
        const flood = (i, j) => {
            if (i < 0 || i >= ROWS || j < 0 || j >= COLS || revealed[i][j] || flagged[i][j]) return;
            revealed[i][j] = true;
            if (board[i][j] === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dy || dx) flood(i + dy, j + dx);
        };
        const checkWin = () => {
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                if (board[i][j] !== -1 && !revealed[i][j]) return false;
            }
            return true;
        };

        const draw = () => {
            MG.ui.board(ctx, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const x = 2 + j * S, y = 2 + i * S;
                const isHit = hit && hit.i === i && hit.j === j;
                if (revealed[i][j]) {
                    MG.ui.rr(ctx, x + 1, y + 1, S - 3, S - 3, 5);
                    ctx.fillStyle = isHit ? '#7d2233' : '#2e2a48';
                    ctx.fill();
                    if (board[i][j] === -1) {
                        MG.ui.emoji(ctx, isHit ? '💥' : '💣', x + S / 2, y + S / 2, S * 0.62);
                    } else if (board[i][j] > 0) {
                        ctx.fillStyle = ['#5cc7ff', '#5cd65c', '#ff5252', '#b78bff', '#ff9d5c', '#5cc7ff', '#888', '#888'][board[i][j] - 1];
                        ctx.font = 'bold ' + (S * 0.52) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(board[i][j], x + S / 2, y + S / 2 + 1);
                    }
                } else {
                    // 未翻格：紫色渐变凸起按钮
                    MG.ui.tile(ctx, x, y, S, '#7a68b0', '#52427e', '#3a2f5c', 6);
                    if (flagged[i][j]) {
                        MG.ui.emoji(ctx, '🚩', x + S / 2, y + S / 2 - 1, S * 0.55);
                        // 标错了（不是雷）：盖个红叉
                        if (over && board[i][j] !== -1) {
                            ctx.strokeStyle = '#ff5252'; ctx.lineWidth = Math.max(2, S * 0.1);
                            ctx.beginPath();
                            ctx.moveTo(x + S * 0.28, y + S * 0.28); ctx.lineTo(x + S * 0.72, y + S * 0.72);
                            ctx.moveTo(x + S * 0.72, y + S * 0.28); ctx.lineTo(x + S * 0.28, y + S * 0.72);
                            ctx.stroke();
                        }
                    }
                }
            }
            if (hit && flash > 0.01) {
                const cx = 2 + hit.j * S + S / 2, cy = 2 + hit.i * S + S / 2;
                ctx.save();
                ctx.fillStyle = 'rgba(255,60,60,' + (flash * 0.16).toFixed(3) + ')';
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = 'rgba(255,150,60,' + Math.min(1, flash).toFixed(3) + ')';
                ctx.lineWidth = Math.max(2, S * 0.13);
                ctx.beginPath(); ctx.arc(cx, cy, S * (0.55 + ring * 0.6), 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }
        };

        // 爆炸/扩散动画：只在失败时跑，自然衰减后自停
        const animate = () => {
            if (!alive) return;
            flash *= 0.9; ring += 0.5;
            draw();
            if (flash > 0.01 || ring < 12) raf = requestAnimationFrame(animate);
            else raf = 0;
        };

        const finish = (won) => {
            draw();
            opts.onComplete && opts.onComplete(won
                ? { win: true, stars: 3, lines: ['🏆 全部排雷！', lv.desc] }
                : { win: false, stars: 0, lines: ['💥 踩雷了！', '红圈是你踩中的那颗，💣 是其余的雷', '❌ 是标错的位置'] });
        };

        // 失败演出：先爆踩中的，再由近及远揭示其余雷，最后才结算
        const boom = (i, j) => {
            over = true; win = false; hit = { i, j };
            revealed[i][j] = true;
            flash = 1; ring = 0;
            animate();
            try { navigator.vibrate && navigator.vibrate(60); } catch (e) { }
            const rest = [];
            for (let a = 0; a < ROWS; a++) for (let b = 0; b < COLS; b++) {
                // 标对的雷保留 🚩（不再揭示），只揭示没标出来的
                if (board[a][b] === -1 && !(a === i && b === j) && !flagged[a][b]) rest.push([a, b]);
            }
            rest.sort((p1, p2) => Math.hypot(p1[0] - i, p1[1] - j) - Math.hypot(p2[0] - i, p2[1] - j));
            let k = 0;
            const step = () => {
                for (let n = 0; n < 2 && k < rest.length; n++, k++) revealed[rest[k][0]][rest[k][1]] = true;
                draw();
                if (k < rest.length) later(step, 45);
                else later(() => finish(false), 750);
            };
            later(step, 300);
        };

        const inBoard = (i, j) => i >= 0 && i < ROWS && j >= 0 && j < COLS;
        const toggleFlag = (i, j) => {
            if (over || !inBoard(i, j) || revealed[i][j]) return;
            flagged[i][j] = !flagged[i][j];
            try { MG.audio && MG.audio.sfx && MG.audio.sfx('click'); } catch (_) { }
            draw();
            try { navigator.vibrate && navigator.vibrate(12); } catch (e) { }
        };
        const open = (i, j) => {
            if (over || !inBoard(i, j) || flagged[i][j] || revealed[i][j]) return;
            if (board[i][j] === -1) { boom(i, j); return; }
            flood(i, j);
            try { MG.audio && MG.audio.sfx && MG.audio.sfx('click'); } catch (_) { }
            if (checkWin()) {
                win = true; over = true;
                for (let a = 0; a < ROWS; a++) for (let b = 0; b < COLS; b++) if (board[a][b] === -1) flagged[a][b] = true;
                draw();
                later(() => finish(true), 420);
                return;
            }
            draw();
        };

        // ---- 输入：短按翻开 / 长按(420ms)或右键标旗 ----
        const cellAt = (p) => ({ i: Math.floor(p.y / S), j: Math.floor(p.x / S) });
        let down = null, longTimer = 0;
        c.addEventListener('contextmenu', e => e.preventDefault());
        c.addEventListener('pointerdown', e => {
            try { e.preventDefault(); } catch (_) { }
            const { i, j } = cellAt(MG.pointerPos(c, e));
            // 右键（或 Ctrl+左键）：立刻标旗，和桌面扫雷一致
            if (e.button === 2 || e.ctrlKey) { toggleFlag(i, j); return; }
            down = { i, j, x: e.clientX, y: e.clientY };
            clearTimeout(longTimer);
            longTimer = setTimeout(() => {
                if (!down) return;
                const a = down.i, b = down.j; down = null;
                toggleFlag(a, b);
            }, 420);
        });
        c.addEventListener('pointermove', e => {
            // 手指挪开了就取消这次长按（避免滑到别的格子误标）
            if (!down) return;
            if (Math.abs(e.clientX - down.x) > 12 || Math.abs(e.clientY - down.y) > 12) {
                clearTimeout(longTimer); down = null;
            }
        });
        const release = (e) => {
            clearTimeout(longTimer);
            if (!down) return;
            const d = down; down = null;
            const { i, j } = (e && e.clientX != null) ? cellAt(MG.pointerPos(c, e)) : d;
            // 抬起时若已滑出原格，按原格处理更稳（避免误开）
            open(d.i === i ? i : d.i, d.j === j ? j : d.j);
        };
        c.addEventListener('pointerup', release);
        c.addEventListener('pointercancel', () => { clearTimeout(longTimer); down = null; });

        init(); draw();
        MG.hint(container, lv.desc + ' · 点击翻开，长按或右键标雷');
        return {
            stop() {
                alive = false;
                clearTimeout(longTimer);
                clearTimers();
                destroy();
            }
        };
    }
};
