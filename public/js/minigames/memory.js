// 记忆翻牌：4x4 网格，找出所有配对
window.MiniGames = window.MiniGames || {};
MiniGames.memory = {
    start(container, opts) {
        const COLS = 4, ROWS = 4, S = 70;
        const { c, ctx, w, h, destroy } = MG.canvas(container, COLS*S + 4, ROWS*S + 4);
        const ICONS = ['🍎','🍌','🍇','🍓','🍑','🍒','🥝','🥥'];
        let board = [], flipped = [], matched = 0, moves = 0, busy = false;
        const init = () => {
            const arr = [];
            for (let i = 0; i < 8; i++) arr.push(ICONS[i], ICONS[i]);
            MG.shuffle(arr);
            board = [];
            for (let i = 0; i < ROWS; i++) board.push(arr.slice(i*COLS, (i+1)*COLS));
        };
        const draw = (back) => {
            ctx.fillStyle = '#1a1c2a'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
                const x = 2 + j*S, y = 2 + i*S;
                const isFlipped = flipped.some(f => f[0]===i && f[1]===j) || board[i][j] === null;
                ctx.fillStyle = isFlipped ? '#ffd56b' : '#5a4880';
                ctx.fillRect(x + 4, y + 4, S - 8, S - 8);
                if (isFlipped && board[i][j]) {
                    ctx.font = '32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(board[i][j], x + S/2, y + S/2);
                }
            }
            opts.onScore && opts.onScore('已配对：' + matched + '/8 · 次数：' + moves);
        };
        const onTap = p => {
            if (busy) return;
            const j = Math.floor(p.x / S), i = Math.floor(p.y / S);
            if (i<0||i>=ROWS||j<0||j>=COLS || !board[i][j]) return;
            if (flipped.some(f => f[0]===i && f[1]===j)) return;
            if (flipped.length === 2) return;
            flipped.push([i, j]); draw();
            if (flipped.length === 2) {
                moves++;
                const [a, b] = flipped;
                if (board[a[0]][a[1]] === board[b[0]][b[1]]) {
                    busy = true; setTimeout(() => { board[a[0]][a[1]] = null; board[b[0]][b[1]] = null; flipped = []; matched++; busy = false; draw(); if (matched === 8) opts.onScore && opts.onScore('🏆 全部配对！' + moves + ' 次'); }, 400);
                } else {
                    busy = true; setTimeout(() => { flipped = []; busy = false; draw(); }, 700);
                }
            }
        };
        init(); MG.bind(c, onTap); draw();
        MG.hint(container, '翻开两张相同图案的牌即可消除');
        return { stop() { destroy(); } };
    }
};
