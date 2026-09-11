// 宝石迷阵：交换相邻宝石三消，连锁加成，限定步数内冲目标分
window.MiniGames = window.MiniGames || {};
(function () {
    const GEMS = ['💎', '🔥', '🌟', '🍃', '💧', '🔮', '⚡'];
    const NAMES = ['初试身手', '宝石猎人', '连锁反应', '大师之路'];
    const lv = [];
    for (let i = 0; i < 50; i++) {
        const colors = i < 15 ? 5 : i < 32 ? 6 : 7;
        const target = 320 + i * 55;
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `目标 ${target} 分 · ${colors} 种宝石` });
    }

    MiniGames.bejeweled = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const nColors = idx < 15 ? 5 : idx < 32 ? 6 : 7;
            const target = 320 + idx * 55;
            const N = 8, MOVES = 30;
            let board = [], score = 0, moves = MOVES, sel = null, busy = false, over = false;

            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:8px;';
            const grid = document.createElement('div');
            const cell = Math.floor(Math.min((container.clientWidth - 24 || 380) / N, (window.innerHeight - 170 || 460) / N, 56));
            grid.style.cssText = `display:grid;grid-template-columns:repeat(${N},${cell}px);gap:3px;background:rgba(20,26,52,.65);padding:8px;border-radius:12px;`;
            const cells = [];
            for (let i = 0; i < N * N; i++) {
                const d = document.createElement('div');
                d.style.cssText = `width:${cell}px;height:${cell}px;display:flex;align-items:center;justify-content:center;font-size:${cell * 0.6}px;`
                    + `background:rgba(255,255,255,.05);border-radius:8px;cursor:pointer;user-select:none;transition:transform .12s;`;
                d.addEventListener('pointerdown', () => tap(i));
                grid.appendChild(d); cells.push(d);
            }
            wrap.appendChild(grid);
            container.appendChild(wrap);

    const at = (x, y) => board[y * N + x];
    const rndC = () => MG.ri(0, nColors - 1);
    window.__bjDbg = { findMatches, hasMove, trySwap };
            function findMatches(b) {
                const mark = new Set();
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const c = b[y * N + x];
                    if (c < 0) continue;
                    if (x + 2 < N && c === b[y * N + x + 1] && c === b[y * N + x + 2]) for (let k = 0; k < 3 && x + k < N && b[y * N + x + k] === c; k++) mark.add(y * N + x + k);
                    if (y + 2 < N && c === b[(y + 1) * N + x] && c === b[(y + 2) * N + x]) for (let k = 0; k < 3 && y + k < N && b[(y + k) * N + x] === c; k++) mark.add((y + k) * N + x);
                }
                return mark;
            }
            function newBoard() {
                do {
                    board = Array.from({ length: N * N }, rndC);
                } while (findMatches(board).size || !hasMove(board));
            }
            function hasMove(b) {
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    if (x + 1 < N && trySwap(b, x, y, x + 1, y, true)) return true;
                    if (y + 1 < N && trySwap(b, x, y, x, y + 1, true)) return true;
                }
                return false;
            }
            function trySwap(b, x1, y1, x2, y2, dry) {
                const i1 = y1 * N + x1, i2 = y2 * N + x2;
                [b[i1], b[i2]] = [b[i2], b[i1]];
                const ok = findMatches(b).size > 0;
                [b[i1], b[i2]] = [b[i2], b[i1]];
                return ok;
            }
            function resolve() {
                let chainN = 0;
                for (;;) {
                    const m = findMatches(board);
                    if (!m.size) break;
                    chainN++;
                    score += 10 * m.size * chainN;
                    m.forEach(i => { board[i] = -1; cells[i].textContent = '✨'; });
                    // 下落 + 补充
                    for (let x = 0; x < N; x++) {
                        let write = N - 1;
                        for (let y = N - 1; y >= 0; y--) {
                            const v = at(x, y);
                            if (v >= 0) { board[write * N + x] = v; if (write !== y) board[y * N + x] = -1; write--; }
                        }
                        for (let y = write; y >= 0; y--) board[y * N + x] = rndC();
                    }
                }
                if (chainN > 1) opts.onScore && opts.onScore(`连锁 ×${chainN}！`);
                if (!hasMove(board)) { // 死局洗牌
                    do { board = Array.from({ length: N * N }, rndC); } while (findMatches(board).size || !hasMove(board));
                    MG.toast && MG.toast(container, '无可消步，自动洗牌');
                }
                render();
                checkEnd();
            }
            function render() {
                for (let i = 0; i < N * N; i++) {
                    const c = board[i];
                    cells[i].textContent = c >= 0 ? GEMS[c] : '';
                    cells[i].style.background = sel === i ? 'rgba(255,213,107,.35)' : 'rgba(255,255,255,.05)';
                    cells[i].style.transform = sel === i ? 'scale(1.12)' : '';
                }
                opts.onScore && opts.onScore(`得分 ${score}/${target} · 剩余 ${moves} 步`);
            }
            function tap(i) {
                if (busy || over) return;
                if (sel == null) { sel = i; render(); return; }
                if (sel === i) { sel = null; render(); return; }
                const x1 = sel % N, y1 = Math.floor(sel / N), x2 = i % N, y2 = Math.floor(i / N);
                if (Math.abs(x1 - x2) + Math.abs(y1 - y2) !== 1) { sel = i; render(); return; }
                busy = true;
                const tmp = board[sel]; board[sel] = board[i]; board[i] = tmp;
                if (findMatches(board).size) {
                    moves--; sel = null;
                    render(); setTimeout(() => { resolve(); busy = false; }, 180);
                } else {
                    const t = board[sel]; board[sel] = board[i]; board[i] = t;
                    sel = null; render(); busy = false;
                    MG.toast && MG.toast(container, '不能消，换回去');
                }
            }
            function checkEnd() {
                if (over) return;
                if (score >= target) {
                    over = true;
                    opts.onComplete && opts.onComplete({ win: true, stars: moves >= 12 ? 3 : moves >= 6 ? 2 : 1, lines: ['达标！剩余 ' + moves + ' 步', '得分 ' + score] });
                } else if (moves <= 0) {
                    over = true;
                    opts.onComplete && opts.onComplete({ win: false, stars: 0, lines: ['步数用尽', '得分 ' + score + '/' + target] });
                }
            }
            newBoard(); render();
            return { stop() {} };
        },
    };
})();
