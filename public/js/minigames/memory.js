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
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        // 直接从等级序列索引计算（1→4, 2→4, 3→5, 4→5, 5→6, 6→6, 7→7, 8→7, 9→8, 10→8,
        // 11→9, 12→9, 13→10, 14→10, 15→11, 16→11, 17→12, 18→12, 19→13, 20→13）
        // 框架 levelIdx 优先（fillLevels 会生成副本对象导致 indexOf 恒为 -1）；memory 无 PARAMS，用 LEVELS 长度
        const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? Math.min(idx, this.LEVELS.length - 1) : (opts.endless ? this.LEVELS.length - 1 : 0);
        const realPairs = Math.min(13, 4 + Math.floor(pIdx * 0.45));
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
        // 联机：共享牌面、按回合锁输入（房主生成牌阵首包下发，对手等待 setState 还原；配对成功留回合、否则让对手）
        const net = !!(MG.pvp && MG.pvp.shouldBegin && MG.pvp.shouldBegin('memory'));
        const mySide = net ? (MG.pvp._armed ? MG.pvp._armed.side : (MG.pvp.side || 0)) : 0;
        let scores = [0, 0], turn = 0;
        const init = () => {
            if (net && mySide !== 0) return;   // 非房主不本地生成牌面，等房主首包下发
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
            opts.onScore && opts.onScore((net ? ('你 ' + scores[mySide] + ' · 对手 ' + scores[1 - mySide] + ' · ') : '') + '已配对：' + matched + '/' + realPairs + ' · 次数：' + moves);
        };
        // 联机：把当前盘面（牌面+翻牌+比分+回合）整盘广播给对手
        const commitNet = () => { if (!net) return; try { MG.pvp.commit({ board: board.map(r => r.slice()), flipped: flipped.map(f => f.slice()), matched, scores: scores.slice(), moves, turn, over: null }); } catch (e) {} };
        const onTap = p => {
            if (busy || won) return;
            if (net && !MG.pvp.canMove()) return;   // 没轮到我方就锁输入
            const j = Math.floor(p.x / S), i = Math.floor(p.y / S);
            if (i < 0 || i >= ROWS || j < 0 || j >= COLS || !board[i][j]) return;
            if (flipped.some(f => f[0] === i && f[1] === j)) return;
            if (flipped.length === 2) return;
            flipped.push([i, j]); draw();
            try { MG.audio && MG.audio.sfx('click'); } catch (e) { }
            if (net) commitNet();   // 让对手实时看到翻开的牌
            if (flipped.length === 2) {
                moves++;
                if (net) commitNet();
                const [a, b] = flipped;
                if (board[a[0]][a[1]] === board[b[0]][b[1]]) {
                    busy = true; setTimeout(() => {
                        board[a[0]][a[1]] = null; board[b[0]][b[1]] = null;
                        flipped = []; matched++; scores[mySide]++; busy = false; draw();
                        try { MG.audio && MG.audio.sfx('coin'); } catch (e) { }
                        if (matched === realPairs) {
                            won = true;
                            if (net) MG.pvp.commit({ board: board.map(r => r.slice()), flipped: [], matched, scores: scores.slice(), moves, turn: mySide, over: mySide });
                            opts.onComplete && opts.onComplete({ win: true, stars: 3, lines: ['用 ' + moves + ' 步', realPairs + ' 对全部配对', lv.desc] });
                        } else if (net) { turn = mySide; commitNet(); }   // 配对成功，留回合继续
                    }, 320);
                } else {
                    busy = true; setTimeout(() => { flipped = []; busy = false; draw(); if (net) { turn = 1 - mySide; commitNet(); } }, 620);
                }
            }
        };
        // 联机：注册状态同步适配器（对手的落子/翻牌经 relay 转发到此还原；over 触发本端结算）
        if (net) {
            MG.pvp.begin({
                setState(m) {
                    if (!m) return;
                    if (m.board) board = m.board;
                    if (m.flipped) flipped = m.flipped;
                    if (typeof m.matched === 'number') matched = m.matched;
                    if (Array.isArray(m.scores)) scores = m.scores;
                    if (typeof m.moves === 'number') moves = m.moves;
                    if (typeof m.turn === 'number') turn = m.turn;
                    draw();
                    if (m.over != null) {
                        won = true;
                        const iWin = m.over === mySide;
                        opts.onComplete && opts.onComplete({ win: iWin, stars: iWin ? 3 : 0, lines: [iWin ? '你配对了所有卡牌！' : '对手先完成了配对', realPairs + ' 对全部配对'] });
                    }
                },
                onOver() {}
            });
        }
        init();
        if (net && mySide === 0) commitNet();   // 房主首发牌面，对手据此还原（含空翻牌/初始回合）
        MG.bind(c, onTap); draw();
        MG.hint(container, net ? '🌐 联机记忆翻牌 · 轮到你时翻两张相同图案配对（配对成功可连翻）' : (lv.desc + ' · 翻两张相同图案配对消除'));
        return { stop() { destroy(); } };
    }
};