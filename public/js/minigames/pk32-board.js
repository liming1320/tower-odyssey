// PK32 棋类/棋盘独立内核。
// 该文件不依赖 MG，不使用 50 关、星级或通用小游戏存档流程。
(function (root) {
    'use strict';

    const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const ORTHOGONAL = [[-1, 0], [0, -1], [0, 1], [1, 0]];

    const clone = value => JSON.parse(JSON.stringify(value));
    const inside = (r, c, rows, cols) => r >= 0 && r < rows && c >= 0 && c < cols;
    const key = (r, c) => r + ':' + c;

    function board(rows, cols, fill) {
        return Array.from({ length: rows }, () => Array(cols).fill(fill || 0));
    }

    function lineWinner(cells, rows, cols, target, needed) {
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            if (cells[r][c] !== target) continue;
            for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
                let n = 1;
                while (inside(r + dr * n, c + dc * n, rows, cols) && cells[r + dr * n][c + dc * n] === target) n++;
                if (n >= needed) return true;
            }
        }
        return false;
    }

    function tictactoeState() {
        return { type: 'tictactoe', rows: 3, cols: 3, board: board(3, 3), turn: 1, moveCount: 0, phase: 'playing' };
    }

    function gomokuState() {
        return { type: 'gomoku', rows: 15, cols: 15, board: board(15, 15), turn: 1, moveCount: 0, phase: 'playing' };
    }

    function connect4State() {
        return { type: 'connect4', rows: 6, cols: 7, board: board(6, 7), turn: 1, moveCount: 0, phase: 'playing' };
    }

    function reversiState(options) {
        const b = board(8, 8);
        const native = options && typeof options.nativeCells === 'string' ? options.nativeCells.match(/.{2}/g) : null;
        if (native && native.length >= 2 && native.every(value => /^\d{2}$/.test(value) && Number(value) >= 1 && Number(value) <= 64)) {
            native.forEach((value, index) => { const square = Number(value) - 1; b[Math.floor(square / 8)][square % 8] = index % 2 ? 2 : 1; });
        } else {
            b[3][3] = 2; b[3][4] = 1; b[4][3] = 1; b[4][4] = 2;
        }
        return { type: 'reversi', rows: 8, cols: 8, board: b, turn: 1, moveCount: 0, passCount: 0, phase: 'playing' };
    }

    function checkersState() {
        const b = board(8, 8);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2) b[r][c] = 2;
        for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2) b[r][c] = 1;
        return { type: 'checkers', rows: 8, cols: 8, board: b, turn: 1, moveCount: 0, phase: 'playing', selected: null };
    }

    function animalState() {
        const b = board(9, 7);
        const pieces = [
            [0, 0, 'lion'], [0, 6, 'tiger'], [1, 1, 'dog'], [1, 5, 'cat'], [2, 0, 'rat'], [2, 2, 'leopard'], [2, 4, 'wolf'], [2, 6, 'elephant'],
            [8, 6, 'lion'], [8, 0, 'tiger'], [7, 5, 'dog'], [7, 1, 'cat'], [6, 6, 'rat'], [6, 4, 'leopard'], [6, 2, 'wolf'], [6, 0, 'elephant']
        ];
        pieces.forEach((p, i) => { b[p[0]][p[1]] = { side: i < 8 ? 2 : 1, rank: p[2] }; });
        return {
            type: 'animal-chess', rows: 9, cols: 7, board: b, turn: 1, moveCount: 0, phase: 'playing', selected: null,
            traps: [[0, 2], [0, 4], [1, 3], [7, 3], [8, 2], [8, 4]], dens: [[0, 3], [8, 3]]
        };
    }

    const CONFIGS = {
        tictactoe: {
            id: 'tictactoe', name: '井字棋', kind: 'board', rows: 3, cols: 3, players: 2,
            originalFlow: '单局制；三子成线即胜；棋盘填满且无人连线为和棋', levels: null,
            winCondition: 'three-in-a-row', create: tictactoeState
        },
        connect4: {
            id: 'connect4', name: '四子棋', kind: 'board', rows: 6, cols: 7, players: 2,
            originalFlow: '单局制；棋子自底部落下；四子横、竖或斜线相连即胜', levels: null,
            winCondition: 'four-in-a-row', create: connect4State
        },
        reversi: {
            id: 'reversi', name: '黑白棋', kind: 'board', rows: 8, cols: 8, players: 2,
            originalFlow: '单局制；无合法步时跳过回合；双方均无合法步后按棋子数判定', levels: null,
            winCondition: 'most-discs', create: reversiState
        },
        checkers: {
            id: 'checkers', name: '跳棋', kind: 'board', rows: 8, cols: 8, players: 2,
            originalFlow: '单局制；斜向移动和连续跳吃；抵达底线升变；吃尽或无合法步判负', levels: null,
            winCondition: 'capture-or-block', create: checkersState
        },
        gomoku: {
            id: 'gomoku', name: '五子棋', kind: 'board', rows: 15, cols: 15, players: 2,
            originalFlow: '单局制；黑先；五子横、竖或斜线相连即胜', levels: null,
            winCondition: 'five-in-a-row', create: gomokuState
        },
        jungle: {
            id: 'jungle', name: '斗兽棋', kind: 'board', rows: 9, cols: 7, players: 2,
            originalFlow: '单局制；七种兽力等级、陷阱、河流和兽穴；进入对方兽穴、吃尽对方或令对方无合法步获胜', levels: null,
            winCondition: 'den-or-capture-or-block', create: animalState
        }
    };

    function legalReversi(state, player) {
        const moves = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            if (flips(state, r, c, player).length) moves.push({ row: r, col: c });
        }
        return moves;
    }

    function flips(state, row, col, player) {
        if (!inside(row, col, 8, 8) || state.board[row][col]) return [];
        const result = [];
        for (const [dr, dc] of DIRECTIONS) {
            const path = []; let r = row + dr; let c = col + dc;
            while (inside(r, c, 8, 8) && state.board[r][c] === 3 - player) { path.push([r, c]); r += dr; c += dc; }
            if (path.length && inside(r, c, 8, 8) && state.board[r][c] === player) result.push(...path);
        }
        return result;
    }

    function legalConnect4(state, col) {
        return col >= 0 && col < 7 && state.board[0][col] === 0;
    }

    function legalGomoku(state, row, col) {
        return inside(row, col, 15, 15) && state.board[row][col] === 0;
    }

    function checkersMoves(state, row, col) {
        const piece = state.board[row] && state.board[row][col];
        if (!piece || piece.side !== state.turn) return [];
        const dirs = piece.king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : (piece.side === 1 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
        const moves = [];
        for (const [dr, dc] of dirs) {
            const r = row + dr, c = col + dc;
            if (inside(r, c, 8, 8) && !state.board[r][c]) moves.push({ from: [row, col], to: [r, c], capture: null });
            const jr = row + dr * 2, jc = col + dc * 2;
            if (inside(r, c, 8, 8) && inside(jr, jc, 8, 8) && state.board[r][c] && state.board[r][c].side !== state.turn && !state.board[jr][jc]) {
                moves.push({ from: [row, col], to: [jr, jc], capture: [r, c] });
            }
        }
        const captures = moves.filter(x => x.capture);
        if (captures.length) return captures;
        if (state.mustContinue) return [];
        const anyCapture = allCheckersMoves(state).some(x => x.capture);
        return anyCapture ? [] : moves;
    }

    function allCheckersMoves(state) {
        const result = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const piece = state.board[r][c];
            if (!piece || piece.side !== state.turn) continue;
            const dirs = piece.king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : (piece.side === 1 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
            dirs.forEach(([dr, dc]) => {
                const mr = r + dr, mc = c + dc, jr = r + dr * 2, jc = c + dc * 2;
                if (inside(jr, jc, 8, 8) && state.board[mr][mc] && state.board[mr][mc].side !== state.turn && !state.board[jr][jc]) result.push({ from: [r, c], to: [jr, jc], capture: [mr, mc] });
            });
        }
        return result;
    }

    function animalCanMove(state, from, to) {
        const p = state.board[from[0]] && state.board[from[0]][from[1]];
        if (!p || p.side !== state.turn || !inside(to[0], to[1], 9, 7)) return false;
        const dr = Math.abs(to[0] - from[0]), dc = Math.abs(to[1] - from[1]);
        const target = state.board[to[0]][to[1]];
        if (target && target.side === p.side) return false;
        const isRiver = (r, c) => r >= 3 && r <= 5 && (c === 1 || c === 2 || c === 4 || c === 5);
        const isDen = (r, c) => state.dens.some(d => d[0] === r && d[1] === c);
        const isTrap = (r, c) => state.traps.some(t => t[0] === r && t[1] === c);
        const enemyTrap = (r, c, side) => isTrap(r, c) && ((r < 4 && side === 1) || (r > 4 && side === 2));
        const ownDen = isDen(to[0], to[1]) && ((to[0] === 0 && p.side === 2) || (to[0] === 8 && p.side === 1));
        if (ownDen) return false;
        const rank = { rat: 1, cat: 2, dog: 3, wolf: 4, leopard: 5, tiger: 6, lion: 7, elephant: 8 };
        const pRank = enemyTrap(from[0], from[1], p.side) ? 0 : (rank[p.rank] || 0);
        const targetRank = target && (enemyTrap(to[0], to[1], target.side) ? 0 : (rank[target.rank] || 0));
        if (p.rank === 'elephant' && target && target.rank === 'rat') return false;
        if (p.rank === 'rat' && isRiver(from[0], from[1]) && target && (!isRiver(to[0], to[1]) || target.rank !== 'rat')) return false;
        const canCapture = !target || pRank >= targetRank || (p.rank === 'rat' && target.rank === 'elephant');
        if (!canCapture) return false;
        if (p.rank !== 'rat' && isRiver(to[0], to[1])) return false;
        if (dr + dc === 1) return true;
        if ((p.rank !== 'lion' && p.rank !== 'tiger') || (dr !== 0 && dc !== 0)) return false;
        const stepR = Math.sign(to[0] - from[0]), stepC = Math.sign(to[1] - from[1]);
        let r = from[0] + stepR, c = from[1] + stepC, jumpedRiver = false;
        while (r !== to[0] || c !== to[1]) { if (isRiver(r, c)) jumpedRiver = true; if (state.board[r][c] && state.board[r][c].rank === 'rat') return false; r += stepR; c += stepC; }
        return jumpedRiver;
    }

    function move(state, action) {
        action = action || {};
        if (!state || state.phase !== 'playing') return { ok: false, reason: 'game-over' };
        const p = state.turn;
        if (state.type === 'tictactoe' || state.type === 'gomoku') {
            if (!(state.type === 'tictactoe' ? inside(action.row, action.col, 3, 3) : legalGomoku(state, action.row, action.col))) return { ok: false, reason: 'illegal-square' };
            if (state.board[action.row][action.col]) return { ok: false, reason: 'occupied' };
            state.board[action.row][action.col] = p; state.moveCount++; state.turn = 3 - p;
        } else if (state.type === 'connect4') {
            if (!legalConnect4(state, action.col)) return { ok: false, reason: 'illegal-column' };
            let row = 5; while (state.board[row][action.col]) row--;
            state.board[row][action.col] = p; state.moveCount++; state.turn = 3 - p;
        } else if (state.type === 'reversi') {
            const fs = flips(state, action.row, action.col, p);
            if (!fs.length) return { ok: false, reason: 'no-flip' };
            state.board[action.row][action.col] = p; fs.forEach(x => { state.board[x[0]][x[1]] = p; });
            state.moveCount++; state.turn = 3 - p;
            if (!legalReversi(state, state.turn)) { state.passCount++; state.turn = 3 - state.turn; }
        } else if (state.type === 'checkers') {
            if (state.mustContinue && (state.mustContinue[0] !== action.row || state.mustContinue[1] !== action.col)) return { ok: false, reason: 'continue-capture' };
            const options = checkersMoves(state, action.row, action.col);
            const chosen = options.find(x => x.to[0] === action.toRow && x.to[1] === action.toCol);
            if (!chosen) return { ok: false, reason: 'illegal-move' };
            const piece = state.board[action.row][action.col]; state.board[action.row][action.col] = 0; state.board[chosen.to[0]][chosen.to[1]] = piece;
            if (chosen.capture) state.board[chosen.capture[0]][chosen.capture[1]] = 0;
            if ((piece.side === 1 && chosen.to[0] === 0) || (piece.side === 2 && chosen.to[0] === 7)) piece.king = true;
            state.moveCount++;
            const continuationState = Object.assign({}, state, { mustContinue: null });
            if (chosen.capture && checkersMoves(continuationState, chosen.to[0], chosen.to[1]).some(x => x.capture)) state.mustContinue = chosen.to;
            else { state.mustContinue = null; state.turn = 3 - p; }
        } else if (state.type === 'animal-chess') {
            if (!Array.isArray(action.from) || !Array.isArray(action.to) || action.from.length < 2 || action.to.length < 2) return { ok: false, reason: 'illegal-move' };
            if (!animalCanMove(state, action.from, action.to)) return { ok: false, reason: 'illegal-move' };
            const piece = state.board[action.from[0]][action.from[1]]; state.board[action.from[0]][action.from[1]] = 0; state.board[action.to[0]][action.to[1]] = piece;
            state.moveCount++; state.turn = 3 - p;
        } else return { ok: false, reason: 'unsupported-game' };
        const result = outcome(state, p);
        if (result) state.phase = 'finished';
        return { ok: true, result: result || null, state };
    }

    function outcome(state, lastPlayer) {
        const b = state.board;
        if (state.type === 'tictactoe' && lineWinner(b, 3, 3, lastPlayer, 3)) return { winner: lastPlayer, reason: 'three-in-a-row' };
        if (state.type === 'gomoku' && lineWinner(b, 15, 15, lastPlayer, 5)) return { winner: lastPlayer, reason: 'five-in-a-row' };
        if (state.type === 'connect4') {
            for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) if (b[r][c] === lastPlayer) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
                let n = 0, rr = r, cc = c; while (inside(rr, cc, 6, 7) && b[rr][cc] === lastPlayer) { n++; rr += dr; cc += dc; }
                if (n >= 4) return { winner: lastPlayer, reason: 'four-in-a-row' };
            }
            if (b[0].every(Boolean)) return { winner: 0, reason: 'draw' };
        }
        if (state.type === 'tictactoe' && state.moveCount === 9) return { winner: 0, reason: 'draw' };
        if (state.type === 'reversi' && (!legalReversi(state, 1).length && !legalReversi(state, 2).length || state.passCount >= 2)) {
            const a = b.flat().filter(x => x === 1).length, z = b.flat().filter(x => x === 2).length;
            return { winner: a === z ? 0 : a > z ? 1 : 2, reason: 'most-discs', score: { 1: a, 2: z } };
        }
        if (state.type === 'checkers') {
            if (state.mustContinue) return null;
            const opponent = 3 - lastPlayer;
            const probe = Object.assign({}, state, { turn: opponent, mustContinue: null });
            let pieceCount = 0, hasMove = false;
            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                if (b[r][c] && b[r][c].side === opponent) { pieceCount++; if (checkersMoves(probe, r, c).length) hasMove = true; }
            }
            if (!pieceCount || !hasMove) return { winner: lastPlayer, reason: 'capture-or-block' };
        }
        if (state.type === 'animal-chess' && state.dens.some(d => b[d[0]][d[1]] && b[d[0]][d[1]].side === lastPlayer)) return { winner: lastPlayer, reason: 'den' };
        if (state.type === 'animal-chess' && !b.flat().some(x => x && x.side === 3 - lastPlayer)) return { winner: lastPlayer, reason: 'capture' };
        if (state.type === 'animal-chess') {
            const opponent = 3 - lastPlayer;
            let hasMove = false;
            for (let row = 0; row < 9 && !hasMove; row++) for (let col = 0; col < 7 && !hasMove; col++) {
                const piece = b[row][col];
                if (!piece || piece.side !== opponent) continue;
                for (let toRow = 0; toRow < 9 && !hasMove; toRow++) for (let toCol = 0; toCol < 7; toCol++) {
                    if (animalCanMove(state, [row, col], [toRow, toCol])) { hasMove = true; break; }
                }
            }
            if (!hasMove) return { winner: lastPlayer, reason: 'no-legal-move' };
        }
        return null;
    }

    function start(id, options) {
        const config = CONFIGS[id];
        if (!config) throw new Error('Unknown PK32 board game: ' + id);
        return { config: clone(config), state: config.create(options || {}) };
    }

    function startUI(container, id, options) {
        if (!container || typeof container.appendChild !== 'function') throw new Error('A DOM container is required');
        const opts = options || {};
        let session = start(id, opts);
        let selected = null;
        let finalResult = null;
        const rootEl = document.createElement('section');
        const title = document.createElement('h2');
        const status = document.createElement('p');
        const boardEl = document.createElement('div');
        const controls = document.createElement('div');
        const restart = document.createElement('button');
        const playerNames = opts.playerNames || { 1: '玩家 1', 2: '玩家 2' };
        const labels = opts.labels || { 1: '黑', 2: '白' };

        rootEl.className = 'pk32-board-ui';
        boardEl.className = 'pk32-board-grid';
        controls.className = 'pk32-board-controls';
        const boardShell = document.createElement('div');
        boardShell.className = 'pk32-board-scroll';
        boardShell.appendChild(boardEl);
        const style = document.createElement('style');
        style.textContent = '.pk32-board-ui{box-sizing:border-box;max-width:100%;overflow:hidden}.pk32-board-scroll{width:100%;max-width:100%;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y}.pk32-board-grid{width:max-content;min-width:100%;gap:2px;touch-action:pan-x pan-y}.pk32-board-grid button{box-sizing:border-box;min-width:52px;min-height:52px;padding:3px;touch-action:manipulation}.pk32-board-grid:has(.pk32-animal-cell){min-width:378px;gap:0;border:5px solid #765126;background:#6f9f48;box-shadow:0 4px 12px rgba(0,0,0,.35)}.pk32-animal-cell{position:relative;display:grid;place-items:center;min-width:54px;min-height:54px;border:1px solid rgba(42,78,34,.45);background:#83b85c;color:#315d35}.pk32-animal-cell:nth-child(odd){background:#8abc62}.pk32-animal-cell[data-terrain="river"]{background:repeating-linear-gradient(0deg,rgba(255,255,255,.2) 0 2px,transparent 2px 15px),linear-gradient(#54b5dd,#2689bd);color:#164e63}.pk32-animal-cell[data-terrain="trap"]{background:radial-gradient(circle,transparent 0 28%,rgba(135,55,43,.8) 29% 32%,transparent 33%),repeating-linear-gradient(45deg,transparent 0 7px,rgba(135,55,43,.55) 7px 9px),repeating-linear-gradient(-45deg,transparent 0 7px,rgba(135,55,43,.55) 7px 9px),#91bd5d;color:#693529}.pk32-animal-cell[data-terrain="den"]{background:radial-gradient(circle,#172535 0 35%,#3e5264 36% 47%,#9ba8a8 48% 51%,#445766 52% 100%);color:#fff}.pk32-animal-cell[data-terrain="den"]::after{content:"穴";font-size:18px;font-weight:700;text-shadow:0 1px 2px #000}.pk32-animal-cell[data-terrain="trap"]::after{content:"";position:absolute;inset:15%;border:1px solid rgba(106,47,36,.8);border-radius:50%}.pk32-animal-piece{position:relative;display:grid;place-items:center;width:44px;height:44px;margin:auto;border:2px solid rgba(255,255,255,.85);border-radius:50%;font-size:20px;font-weight:700;background:#e5b05e;color:#fff;text-shadow:0 1px 2px #222;box-shadow:0 2px 4px rgba(0,0,0,.45),inset 0 0 0 3px rgba(0,0,0,.2)}.pk32-animal-piece::before{display:none}.pk32-animal-piece[data-side="1"]{background:#d8893c;border-color:#ffd18a}.pk32-animal-piece[data-side="2"]{background:#557bb6;border-color:#c9dcff}';
        style.textContent += '.pk32-animal-piece{display:block;position:absolute;left:50%;top:50%;width:66px;height:53px;margin:0;border:0;border-radius:0;background-color:transparent;background-image:url("/img/pk32/jungle-original.png");background-repeat:no-repeat;background-size:661px 465px;color:transparent!important;font-size:0;text-shadow:none;box-shadow:none;transform:translate(-50%,-50%) scale(.74);transform-origin:center}.pk32-animal-piece[data-side="1"]{background-position:-530px var(--pk32-jungle-y)}.pk32-animal-piece[data-side="2"]{background-position:-464px var(--pk32-jungle-y)}.pk32-animal-cell:has(.pk32-animal-piece)::after{display:none}.pk32-board-ui{width:100%;min-height:0;overflow:visible}.pk32-board-scroll{min-height:0;max-height:calc(100dvh - 166px);overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:contain;touch-action:pan-y}@media (max-width:420px){.pk32-board-grid button{min-width:0;min-height:40px}.pk32-board-grid:has(.pk32-animal-cell){width:100%;min-width:0}.pk32-animal-grid,.pk32-board-grid:has(.pk32-animal-cell){width:100%;min-width:0}.pk32-animal-cell{min-width:0;min-height:clamp(44px,13vw,54px);overflow:visible}}';
        rootEl.appendChild(style);
        restart.type = 'button';
        restart.textContent = '重开';
        title.textContent = session.config.name;
        controls.appendChild(restart);
        rootEl.appendChild(title);
        rootEl.appendChild(status);
        rootEl.appendChild(boardShell);
        rootEl.appendChild(controls);
        container.appendChild(rootEl);

        const valueLabel = value => {
            if (!value) return '';
            if (typeof value === 'object') return value.side === 1 ? '我' : '敌';
            return labels[value] || String(value);
        };
        const cellText = (value, row, col) => {
            if (typeof value === 'object') {
                const names = { elephant: '象', lion: '狮', tiger: '虎', cat: '猫', wolf: '狼', dog: '狗', leopard: '豹', rat: '鼠' };
                return (value.side === 1 ? '我' : '敌') + (names[value.rank] || '兽');
            }
            if (value) return valueLabel(value);
            if (session.state.type === 'reversi' && flips(session.state, row, col, session.state.turn).length) return '·';
            return '';
        };
        const announce = result => {
            if (!result) {
                status.textContent = '回合：' + (playerNames[session.state.turn] || ('玩家 ' + session.state.turn));
                return;
            }
            status.textContent = result.winner === 0 ? '和棋' : (playerNames[result.winner] || ('玩家 ' + result.winner)) + '胜出';
        };
        const finishOrRender = result => { if (result) finalResult = result; render(); };
        const clickCell = (row, col) => {
            if (session.state.phase !== 'playing') return;
            let result;
            if (session.state.type === 'checkers' || session.state.type === 'animal-chess') {
                const current = session.state.board[row][col];
                if (selected) {
                    result = session.state.type === 'checkers'
                        ? move(session.state, { row: selected[0], col: selected[1], toRow: row, toCol: col })
                        : move(session.state, { from: selected, to: [row, col] });
                    if (result.ok) selected = null;
                    else if (current && (session.state.type === 'checkers' ? current.side === session.state.turn : current.side === session.state.turn)) selected = [row, col];
                } else if (current && (session.state.type === 'checkers' ? current.side === session.state.turn : current.side === session.state.turn)) selected = [row, col];
            } else if (session.state.type === 'connect4') result = move(session.state, { col });
            else result = move(session.state, { row, col });
            if (result && result.ok) finishOrRender(result.result);
            else render();
        };
        const render = () => {
            boardEl.replaceChildren();
            boardEl.style.display = 'grid';
            boardEl.style.gridTemplateColumns = 'repeat(' + session.state.cols + ', minmax(28px, 1fr))';
            boardEl.setAttribute('role', 'grid');
            for (let row = 0; row < session.state.rows; row++) for (let col = 0; col < session.state.cols; col++) {
                const button = document.createElement('button');
                const value = session.state.board[row][col];
                button.type = 'button';
                const text = cellText(value, row, col);
                if (session.state.type === 'animal-chess') {
                    const river = row >= 3 && row <= 5 && [1, 2, 4, 5].includes(col);
                    const trap = session.state.traps.some(point => point[0] === row && point[1] === col);
                    const den = session.state.dens.some(point => point[0] === row && point[1] === col);
                    button.className = 'pk32-animal-cell';
                    button.dataset.originalBoard = 'pk32-jungle-9x7';
                    button.dataset.terrain = den ? 'den' : trap ? 'trap' : river ? 'river' : 'land';
                    if (!value) button.setAttribute('aria-label', den ? '兽穴' : trap ? '陷阱' : river ? '河流' : '空地');
                }
                if (typeof value === 'object' && session.state.type === 'animal-chess') {
                    const piece = document.createElement('span');
                    piece.className = 'pk32-animal-piece';
                    piece.dataset.side = String(value.side);
                    piece.dataset.rank = String({ rat: 1, cat: 2, dog: 3, wolf: 4, leopard: 5, tiger: 6, lion: 7, elephant: 8 }[value.rank] || 0);
                    const jungleY = (-53 * (({ rat: 1, cat: 2, dog: 3, wolf: 4, leopard: 5, tiger: 6, lion: 7, elephant: 8 }[value.rank] || 1) - 1)) + 'px';
                    if (piece.style && typeof piece.style.setProperty === 'function') piece.style.setProperty('--pk32-jungle-y', jungleY);
                    else if (piece.style) piece.style['--pk32-jungle-y'] = jungleY;
                    if (piece.style) {
                        piece.style.backgroundImage = 'url("/img/pk32/jungle-original.png")';
                        piece.style.backgroundRepeat = 'no-repeat';
                        piece.style.backgroundSize = '661px 465px';
                        piece.style.backgroundPosition = (value.side === 1 ? '-530px ' : '-464px ') + jungleY;
                    }
                    piece.textContent = text.replace(/^(我|敌)/, '');
                    piece.dataset.assetSource = 'jungle-original.png';
                    piece.setAttribute('aria-label', text);
                    button.appendChild(piece);
                    button.setAttribute('aria-label', text);
                } else button.textContent = text;
                button.dataset.row = row;
                button.dataset.col = col;
                button.setAttribute('role', 'gridcell');
                if (selected && selected[0] === row && selected[1] === col) button.dataset.selected = 'true';
                button.disabled = session.state.phase !== 'playing';
                button.addEventListener('click', () => clickCell(row, col));
                boardEl.appendChild(button);
            }
            announce(session.state.phase === 'finished' ? finalResult : null);
        };
        restart.addEventListener('click', () => { session = start(id, opts); selected = null; finalResult = null; render(); });
        render();
        return {
            getState: () => session.state,
            getConfig: () => session.config,
            restart: () => restart.click(),
            destroy: () => rootEl.remove()
        };
    }

    root.PK32Board = { CONFIGS, list: () => Object.values(CONFIGS).map(clone), start, startUI, move, outcome, legalReversi, checkersMoves, animalCanMove };
})(typeof window !== 'undefined' ? window : globalThis);
