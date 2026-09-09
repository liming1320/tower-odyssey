// 暗棋（banqi）简化版：4x8 棋盘，棋子两两成对（红/黑），翻开/吃子/翻棋
window.MiniGames = window.MiniGames || {};
MiniGames.banqi = {
    start(container, opts) {
        const COLS = 8, ROWS = 4;
        const PIECES = [
            ['帅', 7], ['仕', 6], ['仕', 6], ['相', 5], ['相', 5], ['车', 4], ['车', 4], ['马', 3], ['马', 3],
            ['炮', 2], ['炮', 2], ['兵', 1], ['兵', 1], ['兵', 1], ['兵', 1], ['兵', 1]
        ];
        const RANKS = { 帅:7, 仕:6, 相:5, 车:4, 马:3, 炮:2, 兵:1 };
        const NAMES = ['', '', '', '马', '车', '相', '仕', '帅'];
        const initBoard = () => {
            const reds = PIECES.map(([n,r]) => ({ n, r, color: 1 }));
            const blacks = PIECES.map(([n,r]) => ({ n, r, color: 2 }));
            const all = MG.shuffle([...reds, ...blacks]);
            const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
            let k = 0;
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                b[i][j] = { ...all[k++], faceUp: false };
            }
            return b;
        };
        let board = initBoard();
        let turn = 1, sel = null;
        const cellW = 50, cellH = 56;
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS*cellW + 4, ROWS*cellH + 4);
        const draw = () => {
            ctx.fillStyle = '#6b4226'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const p = board[i][j];
                const x = 2 + j*cellW, y = 2 + i*cellH;
                ctx.fillStyle = (i+j) % 2 ? '#a87a4a' : '#c8a070';
                ctx.fillRect(x, y, cellW-2, cellH-2);
                if (sel && sel[0]===i && sel[1]===j) { ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.strokeRect(x+1, y+1, cellW-4, cellH-4); }
                if (!p) continue;
                if (!p.faceUp) {
                    ctx.fillStyle = '#3a2010'; ctx.beginPath();
                    ctx.arc(x + cellW/2, y + cellH/2, 20, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#8a5732'; ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText('棋', x + cellW/2, y + cellH/2);
                } else {
                    const isRed = p.color === 1;
                    ctx.fillStyle = isRed ? '#a02828' : '#1a1a1a';
                    ctx.beginPath(); ctx.arc(x + cellW/2, y + cellH/2, 22, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = isRed ? '#fff' : '#e0c050';
                    ctx.font = 'bold 20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(p.n, x + cellW/2, y + cellH/2);
                }
            }
        };
        const adj = (i, j) => [[i-1,j],[i+1,j],[i,j-1],[i,j+1]];
        const canCapture = (a, b) => {
            if (a.color === b.color) return false;
            // 炮吃子规则简化：普通棋子等级高的吃低的；炮可隔一子吃任意
            if (a.n === '炮') {
                // 炮必须翻一条直线中间恰好一子
                return false; // 简化：暂不让炮吃子
            }
            if (b.n === '炮') return false; // 不能吃炮
            if (b.n === '帅' && a.n === '兵') return true; // 兵可吃帅
            if (a.n === '帅' && b.n === '兵') return false; // 帅不能吃兵
            return a.r >= b.r;
        };
        const onTap = p => {
            const j = Math.floor(p.x / cellW), i = Math.floor(p.y / cellH);
            if (i<0||i>=ROWS||j<0||j>=COLS) return;
            const cur = board[i][j];
            if (!sel) {
                if (cur && cur.faceUp && cur.color === turn) sel = [i, j];
                else if (cur && !cur.faceUp) { cur.faceUp = true; sel = null; turn = 3 - turn; }
            } else {
                if (sel[0]===i && sel[1]===j) { sel = null; }
                else if (cur && cur.faceUp) {
                    const a = board[sel[0]][sel[1]];
                    if (a.color === cur.color) { sel = [i, j]; }
                    else if (canCapture(a, cur)) {
                        board[i][j] = a; board[sel[0]][sel[1]] = null; sel = null; turn = 3 - turn;
                    }
                } else if (adj(sel[0], sel[1]).some(([x,y]) => x===i && y===j) && !cur) {
                    board[i][j] = board[sel[0]][sel[1]]; board[sel[0]][sel[1]] = null; sel = null; turn = 3 - turn;
                } else if (cur && !cur.faceUp && adj(sel[0], sel[1]).some(([x,y]) => x===i && y===j)) {
                    const a = board[sel[0]][sel[1]];
                    // 邻位翻开：若翻出的子能被吃则吃之
                    cur.faceUp = true;
                    if (canCapture(a, cur)) {
                        board[i][j] = a; board[sel[0]][sel[1]] = null;
                    }
                    sel = null; turn = 3 - turn;
                }
            }
            draw();
        };
        MG.bind(c, onTap);
        draw();
        MG.hint(container, '点击己方棋子选中；点击空格移动；点暗子翻开（轮到己方时）');
        return { stop() { destroy(); } };
    }
};
