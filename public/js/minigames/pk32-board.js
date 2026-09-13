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

    function reversiState() {
        const b = board(8, 8);
        b[3][3] = 2; b[3][4] = 1; b[4][3] = 1; b[4][4] = 2;
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
            [0, 6, 'elephant'], [0, 0, 'lion'], [0, 2, 'tiger'], [1, 5, 'dog'], [1, 1, 'cat'], [2, 6, 'leopard'], [2, 4, 'wolf'], [2, 0, 'rat'],
            [8, 0, 'elephant'], [8, 6, 'lion'], [8, 4, 'tiger'], [7, 1, 'dog'], [7, 5, 'cat'], [6, 0, 'leopard'], [6, 2, 'wolf'], [6, 6, 'rat']
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
            originalFlow: '单局制；七种兽力等级、陷阱、河流和兽穴；进入对方兽穴或吃尽对方获胜', levels: null,
            winCondition: 'den-or-capture', create: animalState
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
        const ownDen = isDen(to[0], to[1]) && ((to[0] === 0 && p.side === 2) || (to[0] === 8 && p.side === 1));
        if (ownDen) return false;
        const rank = { rat: 1, cat: 2, dog: 3, wolf: 4, leopard: 5, tiger: 6, lion: 7, elephant: 8 };
        const pRank = isTrap(from[0], from[1]) ? 0 : (rank[p.rank] || 0);
        const targetRank = target && (isDen(to[0], to[1]) || isTrap(to[0], to[1]) ? 0 : (rank[target.rank] || 0));
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
        restart.type = 'button';
        restart.textContent = '重开';
        title.textContent = session.config.name;
        controls.appendChild(restart);
        rootEl.appendChild(title);
        rootEl.appendChild(status);
        rootEl.appendChild(boardEl);
        rootEl.appendChild(controls);
        container.appendChild(rootEl);

        const valueLabel = value => {
            if (!value) return '';
            if (typeof value === 'object') return value.side === 1 ? '我' : '敌';
            return labels[value] || String(value);
        };
        const cellText = (value, row, col) => {
            if (typeof value === 'object') {
                const names = { elephant: '象', lion: '狮', tiger: '虎', cat: '猫', wolf: '狼', dog: '犬', leopard: '豹', rat: '鼠' };
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
                button.textContent = cellText(value, row, col);
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
