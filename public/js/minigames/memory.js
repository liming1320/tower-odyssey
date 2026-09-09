// 记忆翻牌：20 关挑战，牌数递增 + 步数限制评分
window.MiniGames = window.MiniGames || {};
MiniGames.memory = {
    LEVELS: [
        { name: '启航', desc: '4 对 · 简单' }, { name: '萌芽', desc: '4 对 · 标准' },
        { name: '试炼', desc: '5 对' }, { name: '寻觅', desc: '5 对' },
        { name: '小成', desc: '6 对' }, { name: '进阶', desc: '6 对' },
        { name: '熟巧', desc: '7 对' }, { name: '巧手', desc: '7 对' },
        { name: '稳健', desc: '8 对' }, { name: '敏锐', desc: '8 对' },
        { name: '精熟', desc: '9 对' }, { name: '沉着', desc: '9 对' },
        { name: '心明', desc: '10 对' }, { name: '细致', desc: '10 对' },
        { name: '高手', desc: '11 对' }, { name: '匠心', desc: '11 对' },
        { name: '宗匠', desc: '12 对' }, { name: '鬼手', desc: '12 对' },
        { name: '传奇', desc: '13 对' }, { name: '记忆王', desc: '13 对 · 终极' },
    ],
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const pairs = Math.min(13, 3 + Math.floor((lv.name && this.LEVELS.indexOf(lv)) / 1.6));
        // 直接从等级序列索引计算（1→4, 2→4, 3→5, 4→5, 5→6, 6→6, 7→7, 8→7, 9→8, 10→8,
        // 11→9, 12→9, 13→10, 14→10, 15→11, 16→11, 17→12, 18→12, 19→13, 20→13）
        const idx = this.LEVELS.indexOf(lv);
        const realPairs = Math.min(13, 4 + Math.floor(idx * 0.45));
        const COLS = realPairs <= 8 ? 4 : 5;
        const ROWS = Math.ceil((realPairs * 2) / COLS);
        const ICONS = ['🍎','🍌','🍇','🍓','🍑','🍒','🥝','🥥','🥑','🍐','🍋','🍉','🌽','🥕'];
        // canvas 自适应：根据牌数选择尺寸
        const maxW = Math.min(container.clientWidth - 16, 480);
        const maxH = Math.min(window.innerHeight - 200, 560);
        const S = Math.floor(Math.min(maxW / COLS, maxH / ROWS, 90));
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS * S + 4, ROWS * S + 4);
        const useIcons = ICONS.slice(0, realPairs);
        let board = [], flipped = [], matched = 0, moves = 0, busy = false, won = false;
        const init = () => {
            const arr = [];
            for (let i = 0; i < realPairs; i++) arr.push(useIcons[i], useIcons[i]);
            MG.shuffle(arr);
            board = [];
            for (let i = 0; i < ROWS; i++) board.push(arr.slice(i * COLS, (i + 1) * COLS));
            while (board.length < ROWS) { board.push([]); while (board[board.length - 1].length < COLS) board[board.length - 1].push(null); }
        };
        const draw = () => {
            MG.ui.board(ctx, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const x = 2 + j * S, y = 2 + i * S;
                const isFlipped = flipped.some(f => f[0] === i && f[1] === j) || board[i][j] === null;
                if (isFlipped) {
                    // 正面：米黄渐变 + emoji
                    MG.ui.tile(ctx, x, y, S, '#fff0c8', '#e8c060', '#a08020', 12);
                    if (board[i][j]) MG.ui.emoji(ctx, board[i][j], x + S / 2, y + S / 2 - 2, S * 0.5);
                } else {
                    // 背面：紫色渐变 + ❓
                    MG.ui.tile(ctx, x, y, S, '#9068d8', '#5a3a9a', '#3a2470', 12);
                    MG.ui.emoji(ctx, '❓', x + S / 2, y + S / 2 - 2, S * 0.42);
                }
            }
            opts.onScore && opts.onScore('已配对：' + matched + '/' + realPairs + ' · 次数：' + moves);
        };
        const onTap = p => {
            if (busy || won) return;
            const j = Math.floor(p.x / S), i = Math.floor(p.y / S);
            if (i < 0 || i >= ROWS || j < 0 || j >= COLS || !board[i][j]) return;
            if (flipped.some(f => f[0] === i && f[1] === j)) return;
            if (flipped.length === 2) return;
            flipped.push([i, j]); draw();
            if (flipped.length === 2) {
                moves++;
                const [a, b] = flipped;
                if (board[a[0]][a[1]] === board[b[0]][b[1]]) {
                    busy = true; setTimeout(() => {
                        board[a[0]][a[1]] = null; board[b[0]][b[1]] = null;
                        flipped = []; matched++; busy = false; draw();
                        if (matched === realPairs) {
                            won = true;
                            // 评分：完成+步数（步数 ≤ 配对数×2.2 = 3★，×2.8 = 2★，否则 1★）
                            const perfect = moves <= realPairs * 2.2;
                            const good = moves <= realPairs * 2.8;
                            const stars = perfect ? 3 : good ? 2 : 1;
                            opts.onComplete && opts.onComplete({
                                win: true, stars,
                                lines: ['用 ' + moves + ' 步', realPairs + ' 对全部配对', lv.desc],
                            });
                        }
                    }, 320);
                } else {
                    busy = true; setTimeout(() => { flipped = []; busy = false; draw(); }, 620);
                }
            }
        };
        init(); MG.bind(c, onTap); draw();
        MG.hint(container, lv.desc + ' · 翻两张相同图案配对消除');
        return { stop() { destroy(); } };
    }
};