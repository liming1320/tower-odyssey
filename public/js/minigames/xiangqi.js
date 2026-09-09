// 中国象棋（简化）：9x10 棋盘，仅走子不吃判断，无 AI，玩家自娱（可双人对战）
window.MiniGames = window.MiniGames || {};
MiniGames.xiangqi = {
    start(container, opts) {
        const C = 9, R = 10, S = 46;
        const INIT = [
            ['车','马','相','仕','帅','仕','相','马','车'],
            ['','','','','','','','',''],
            ['','炮','','','','','','炮',''],
            ['兵','',  '兵','','兵','','兵','','兵'],
            ['','',  '','','','','','',''],
            ['','',  '','','','','','',''],
            ['卒','',  '卒','','卒','','卒','','卒'],
            ['','炮','','','','','','炮',''],
            ['','','','','','','','',''],
            ['车','马','象','士','将','士','象','马','车'],
        ];
        const RED = 1, BLACK = 2;
        const NAMES = { 1: '红', 2: '黑' };
        const initBoard = () => {
            const b = [];
            for (let i = 0; i < R; i++) {
                b[i] = [];
                for (let j = 0; j < C; j++) {
                    const ch = INIT[i][j];
                    if (!ch) { b[i][j] = null; continue; }
                    const color = i < 5 ? BLACK : RED;
                    b[i][j] = { ch, color };
                }
            }
            return b;
        };
        const isInPalace = (c, i, j) => {
            if (c === RED) return i >= 7 && j >= 3 && j <= 5;
            return i <= 2 && j >= 3 && j <= 5;
        };
        const isCrossedRiver = (c, i) => c === RED ? i <= 4 : i >= 5;
        const at = (board, i, j) => (i<0||i>=R||j<0||j>=C) ? null : board[i][j];
        const canMove = (board, fi, fj, ti, tj) => {
            const p = board[fi][fj], t = at(board, ti, tj);
            if (!p) return false;
            if (t && t.color === p.color) return false;
            const dx = ti - fi, dy = tj - fj, adx = Math.abs(dx), ady = Math.abs(dy);
            const c = p.color;
            const ch = p.ch;
            const between = (i1, j1, i2, j2) => {
                if (i1 === i2) { const lo = Math.min(j1,j2), hi = Math.max(j1,j2); for (let x = lo+1; x < hi; x++) if (board[i1][x]) return true; }
                else if (j1 === j2) { const lo = Math.min(i1,i2), hi = Math.max(i1,i2); for (let x = lo+1; x < hi; x++) if (board[x][j1]) return true; }
                return false;
            };
            switch (ch) {
                case '帅': case '将':
                    if (!isInPalace(c, ti, tj)) return false;
                    if (adx + ady !== 1) return false;
                    // 对面将帅不能直接见面（中间无子）
                    if (c === RED && t && t.ch === '将' && fj === tj && !between(fi, fj, ti, tj)) return false;
                    if (c === BLACK && t && t.ch === '帅' && fj === tj && !between(fi, fj, ti, tj)) return false;
                    return true;
                case '仕': case '士':
                    if (!isInPalace(c, ti, tj)) return false;
                    return adx === 1 && ady === 1;
                case '相': case '象':
                    if (isCrossedRiver(c, ti)) return false;
                    if (adx !== 2 || ady !== 2) return false;
                    // 象眼不能有子
                    return !at(board, fi + dx/2, fj + dy/2);
                case '马':
                    if (!((adx === 1 && ady === 2) || (adx === 2 && ady === 1))) return false;
                    const mx = adx === 2 ? fi + dx/2 : fi;
                    const my = ady === 2 ? fj + dy/2 : fj;
                    return !at(board, mx, my);
                case '车':
                    if (fi !== ti && fj !== tj) return false;
                    return !between(fi, fj, ti, tj);
                case '炮':
                    if (fi !== ti && fj !== tj) return false;
                    const blocks = between(fi, fj, ti, tj);
                    if (!t) return !blocks;
                    return blocks; // 翻山打子
                case '兵': case '卒':
                    if (c === RED) {
                        if (dx > 0) return false; // 红兵不能往上走
                        if (isCrossedRiver(c, fi)) return adx + ady === 1;
                        return adx === 1 && ady === 0;
                    } else {
                        if (dx < 0) return false;
                        if (isCrossedRiver(c, fi)) return adx + ady === 1;
                        return adx === 1 && ady === 0;
                    }
            }
            return false;
        };
        let board = initBoard(), turn = RED, sel = null;
        const { c, ctx, w, h, destroy } = MG.canvas(container, C*S + 20, R*S + 20);
        const draw = () => {
            ctx.fillStyle = '#d4a76a'; ctx.fillRect(0, 0, w, h);
            // 网格
            ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1;
            for (let i = 0; i < R; i++) {
                ctx.beginPath(); ctx.moveTo(10, 10 + i*S); ctx.lineTo(10 + (C-1)*S, 10 + i*S); ctx.stroke();
            }
            for (let j = 0; j < C; j++) {
                if (j === 0 || j === C-1 || (j === 3 || j === 5)) {
                    ctx.beginPath(); ctx.moveTo(10 + j*S, 10); ctx.lineTo(10 + j*S, 10 + (R-1)*S); ctx.stroke();
                }
            }
            // 河界
            ctx.fillStyle = '#5a3a1c'; ctx.font = '14px serif'; ctx.textAlign = 'center';
            ctx.fillText('楚 河          汉 界', 10 + 4*S, 10 + 4.5*S);
            // 九宫格斜线
            ctx.beginPath(); ctx.moveTo(10+3*S, 10); ctx.lineTo(10+5*S, 10+2*S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10+5*S, 10); ctx.lineTo(10+3*S, 10+2*S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10+3*S, 10+7*S); ctx.lineTo(10+5*S, 10+9*S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10+5*S, 10+7*S); ctx.lineTo(10+3*S, 10+9*S); ctx.stroke();
            // 棋子
            for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
                const p = board[i][j];
                if (!p) continue;
                const x = 10 + j*S, y = 10 + i*S;
                ctx.fillStyle = '#f0d8a0'; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = p.color === RED ? '#a02828' : '#1a1a1a';
                ctx.font = 'bold 18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(p.ch, x, y);
                if (sel && sel[0]===i && sel[1]===j) { ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.stroke(); }
            }
            opts.onScore && opts.onScore(NAMES[turn] + '方走棋');
        };
        const onTap = p => {
            const j = Math.round((p.x - 10) / S), i = Math.round((p.y - 10) / S);
            if (i<0||i>=R||j<0||j>=C) return;
            const cur = board[i][j];
            if (!sel) {
                if (cur && cur.color === turn) sel = [i, j];
            } else {
                if (sel[0]===i && sel[1]===j) { sel = null; }
                else if (canMove(board, sel[0], sel[1], i, j)) {
                    const moved = board[sel[0]][sel[1]];
                    if (cur && (cur.ch === '帅' || cur.ch === '将')) { opts.onScore && opts.onScore('🏆 ' + NAMES[turn] + '方胜利！'); }
                    board[i][j] = moved; board[sel[0]][sel[1]] = null;
                    sel = null; turn = 3 - turn;
                } else if (cur && cur.color === turn) { sel = [i, j]; }
            }
            draw();
        };
        MG.bind(c, onTap);
        draw();
        MG.hint(container, '点击己方棋子 → 点击目标位置。红黑轮流走，吃掉将帅获胜。');
        return { stop() { destroy(); } };
    }
};
