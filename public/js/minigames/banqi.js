// 暗棋圣手：致敬 DOS 经典（1995·至通）
// 15 关闯关 · 猜拳定先手 · 道具秘技（吃子赚金币购买）· AI 难度随关卡递增
// 规则：将士象车马炮卒，等级大的吃小的；卒可吃将、将不能吃卒；炮隔一子跳吃任意
window.MiniGames = window.MiniGames || {};
MiniGames.banqi = {
    LEVELS: [
        { name: '初出茅庐' }, { name: '棋摊学徒' }, { name: '街头好手' }, { name: '茶馆常客' },
        { name: '县城新锐' }, { name: '府城名宿' }, { name: '棋社教头' }, { name: '京城乡试' },
        { name: '翰林待诏' }, { name: '宫中伴驾' }, { name: '国手挑战' }, { name: '南北擂台' },
        { name: '棋坛盟主' }, { name: '御前圣战' }, { name: '暗棋圣手' },
    ],
    ITEMS: [
        { id: 'peek', icon: '🔍', name: '透视镜', cost: 30,  desc: '偷看一枚暗子' },
        { id: 'wing', icon: '🪽', name: '羽翼',   cost: 80,  desc: '己方棋子飞到任意空格' },
        { id: 'soup', icon: '🍲', name: '大补粥', cost: 120, desc: '复活一枚被吃的己方棋子' },
    ],

    start(container, opts) {
        let alive = true;
        const api = { stop() { alive = false; } };
        const showSelect = () => {
            if (!alive) return;
            MG.levelSelect(container, {
                game: 'banqi', title: '暗棋圣手 · 15 关闯关',
                levels: this.LEVELS,
                onStart: idx => MG.rps(container, first => play(idx, first)),
            });
        };
        const play = (levelIdx, first) => {
            if (!alive) return;
            gameRound(container, opts, levelIdx + 1, first, api, showSelect, play);
        };
        showSelect();
        return api;
    },
};

// 一局对弈（闭包，避免实例间状态串扰）
function gameRound(container, opts, level, first, api, onBack, onReplay) {
    const COLS = 8, ROWS = 4;
    const PIECES = [
        ['帥', 7, 1], ['仕', 6, 2], ['仕', 6, 2], ['相', 5, 2], ['相', 5, 2], ['車', 4, 2], ['車', 4, 2],
        ['馬', 3, 2], ['馬', 3, 2], ['砲', 2, 2], ['砲', 2, 2], ['卒', 1, 5], ['卒', 1, 5], ['卒', 1, 5], ['卒', 1, 5], ['卒', 1, 5],
    ];
    const cellW = 50, cellH = 56;
    const { c, ctx, w, h, destroy } = MG.canvas(container, COLS * cellW + 4, ROWS * cellH + 4);

    // ---- 状态 ----
    let board, turn, sel = null, over = false, coins = 0, itemMode = null, lastAI = null;
    let capturedMine = [];   // 我方被吃（供大补粥复活）
    let stats = { flips: 0 };
    let idlePlies = 0;       // 连续无吃子的手数（持久战判定用）
    let totalPlies = 0;      // 总手数（防拉锯保险丝）
    let lastResultRef = null;
    const init = () => {
        const reds = PIECES.map(([n, r]) => ({ n, r, color: 1 }));
        const blacks = PIECES.map(([n, r]) => ({ n, r, color: 2 }));
        const all = MG.shuffle([...reds, ...blacks]);
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
        let k = 0;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) board[i][j] = { ...all[k++], faceUp: false };
    };
    init();
    turn = first === 'player' ? 1 : 2;

    // ---- 规则 ----
    const inB = (i, j) => i >= 0 && i < ROWS && j >= 0 && j < COLS;
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const canCapAdj = (a, b) => {  // a 邻吃 b
        if (a.color === b.color) return false;
        if (a.n === '砲') return false;            // 炮不能邻吃
        if (a.n === '卒' && b.n === '帥') return true;  // 卒吃帅
        if (a.n === '帥' && b.n === '卒') return false; // 帅不能吃卒
        return a.r >= b.r;
    };
    const jumpTargets = (i, j) => {  // 炮的隔子跳吃目标（只能吃翻开的明子）
        const out = [];
        for (const [di, dj] of DIRS) {
            let x = i + di, y = j + dj, screened = false;
            while (inB(x, y)) {
                const p = board[x][y];
                if (p) {
                    if (!screened) screened = true;     // 第一枚 = 炮架（明暗皆可）
                    else { if (p.color !== board[i][j].color && p.faceUp) out.push([x, y]); break; }
                }
                x += di; y += dj;
            }
        }
        return out;
    };
    const legalMoves = color => {  // [{t:'flip'|'m', ...}]
        const ms = [];
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const p = board[i][j];
            if (!p) continue;
            if (!p.faceUp) { ms.push({ t: 'flip', i, j }); continue; }
            if (p.color !== color) continue;
            for (const [di, dj] of DIRS) {
                const x = i + di, y = j + dj;
                if (!inB(x, y)) continue;
                const q = board[x][y];
                if (!q) ms.push({ t: 'm', fi: i, fj: j, ti: x, tj: y });
                else if (q.faceUp && canCapAdj(p, q)) ms.push({ t: 'm', fi: i, fj: j, ti: x, tj: y });
            }
            if (p.n === '砲') for (const [x, y] of jumpTargets(i, j)) ms.push({ t: 'm', fi: i, fj: j, ti: x, tj: y });
        }
        return ms;
    };
    const applyMove = m => {
        if (m.t === 'flip') { board[m.i][m.j].faceUp = true; stats.flips++; }
        else {
            const a = board[m.fi][m.fj], b = board[m.ti][m.tj];
            board[m.ti][m.tj] = a; board[m.fi][m.fj] = null;
            if (b) return b;   // 返回被吃子
        }
        return null;
    };
    const pieceCount = color => {
        let n = 0;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const p = board[i][j]; if (p && p.color === color) n++;
        }
        return n;
    };

    // ---- AI（难度 1-15 递增）----
    const aiDifficulty = level; // 1..15
    const evalCellDanger = (i, j, color) => {  // (i,j) 处 color 子被对方邻吃的风险
        const p = board[i][j]; if (!p) return 0;
        let risk = 0;
        for (const [di, dj] of DIRS) {
            const x = i + di, y = j + dj;
            if (!inB(x, y)) continue;
            const q = board[x][y];
            if (q && q.faceUp && q.color !== color && canCapAdj(q, p)) risk += p.r * 10 + 5;
        }
        return risk;
    };
    const scoreAI = m => {
        let s = 0;
        if (m.t === 'flip') {
            s = 6 + MG.ri(0, 3);
        } else {
            const a = board[m.fi][m.fj], b = board[m.ti][m.tj];
            if (b) {
                s += b.r * 12;
                if (b.n === '帥') s += 10000;               // 吃帅直接赢
                if (b.color === 1) s += 3;                  // 略偏好主动进攻
            } else s += MG.ri(0, 2);
            // 落点安全 / 机会（虚拟落子后评估）
            const save = [board[m.fi][m.fj], board[m.ti][m.tj]];
            board[m.ti][m.tj] = a; board[m.fi][m.fj] = null;
            s -= evalCellDanger(m.ti, m.tj, 2) * 1.2;
            for (const [di, dj] of DIRS) {
                const x = m.ti + di, y = m.tj + dj;
                if (!inB(x, y)) continue;
                const q = board[x][y];
                if (q && q.faceUp && q.color === 1 && canCapAdj(a, q)) s += 8;      // 威胁敌方
                if (q && !q.faceUp) s += 2;                                          // 逼角暗子
            }
            if (a.n === '帥') s -= 12;   // 帅少动
            board[m.fi][m.fj] = save[0]; board[m.ti][m.tj] = save[1];
        }
        // 高难度：考虑对手最佳回应（吃回）
        if (aiDifficulty >= 8 && m.t === 'm') {
            const save = [board[m.fi][m.fj], board[m.ti][m.tj]];
            board[m.ti][m.tj] = save[0]; board[m.fi][m.fj] = null;
            const replies = legalMoves(1).filter(r => r.t === 'm' && r.ti === m.ti && r.tj === m.tj && board[r.fi][r.fj]);
            let worst = 0;
            for (const r of replies) {
                const victim = board[r.ti][r.tj];
                const v = victim ? (victim.n === '帥' ? 10000 : victim.r * 12) : 0;
                if (v > worst) worst = v;
            }
            s -= worst * 0.85;
            board[m.fi][m.fj] = save[0]; board[m.ti][m.tj] = save[1];
        }
        return s;
    };
    const aiTurn = () => {
        if (over || turn !== 2) return;
        const ms = legalMoves(2);
        if (!ms.length) return finish(true, '对方无子可动');
        let m;
        const randChance = Math.max(0, 0.45 - aiDifficulty * 0.03);
        if (Math.random() < randChance) {
            m = MG.pick(ms);
        } else {
            let best = -Infinity;
            const noise = Math.max(1, 8 - aiDifficulty * 0.5);
            for (const x of ms) {
                const sc = scoreAI(x) + MG.ri(0, noise);
                if (sc > best) { best = sc; m = x; }
            }
        }
        const victim = applyMove(m);
        lastAI = m;
        totalPlies++;
        idlePlies = victim ? 0 : idlePlies + 1;
        if (victim && victim.color === 1) {
            capturedMine.push(victim);
            if (victim.n === '帥') return finish(false, '你的帥被吃了');
        }
        turn = 1; draw();
        afterTurnChecks();
    };

    // ---- 持久战判定：连续 50 手无吃子 → 按子力判胜负，避免避战死循环 ----
    const materialSum = color => {
        let s = 0;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const p = board[i][j]; if (p && p.color === color) s += p.r;
        }
        return s;
    };

    // ---- 胜负判定 ----
    const finish = (win, reason) => {
        if (over) return;
        over = true;
        lastResultRef = { win, reason };
        const mine = pieceCount(1);
        const stars = win ? (mine >= 5 ? 3 : mine >= 3 ? 2 : 1) : 0;
        if (win) MG.recordStars('banqi', level, stars);
        MG.result(container, {
            win, stars,
            title: win ? (level >= 15 ? '👑 暗棋圣手！' : `🏆 第 ${level} 关通过`) : '💥 挑战失败',
            lines: [
                reason || '',
                `我方剩余棋子 ${mine} 枚 · 本局金币 🪙${coins}`,
                win && stars < 3 ? '剩 5 枚以上棋子可得 ★★★' : '',
                win && level >= 15 ? '你已通关全部 15 关，成为真正的暗棋圣手！' : '',
            ].filter(Boolean),
            hasNext: win && level < 15,
            onRetry: () => { destroy(); gameRound(container, opts, level, first, api, onBack, onReplay); },
            onNext: () => { destroy(); gameRound(container, opts, level + 1, 'player', api, onBack, onReplay); },
            onBack,
        });
        draw();
    };
    const afterTurnChecks = () => {
        if (over) return;
        // 持久战判定：30 手无交战或总手数超 300 → 子力定胜负，杜绝避战死循环
        if (idlePlies >= 30 || totalPlies >= 300) {
            const a = materialSum(1), b = materialSum(2);
            const why = idlePlies >= 30 ? '长期无交战' : '鏖战超 150 回合';
            return finish(a >= b, a >= b ? `${why} · 子力判定你获胜` : `${why} · 子力判定电脑获胜`);
        }
        if (turn === 1) {
            if (!pieceCount(2)) return finish(true, '敌方全军覆没');
            if (!legalMoves(1).length) return finish(false, '你无子可动');
        } else {
            if (!pieceCount(1)) return finish(false, '我方全军覆没');
            setTimeout(() => { if (!over && apiAlive) aiTurn(); }, 650);
        }
    };
    let apiAlive = true;
    const origStop = api.stop;
    api.stop = function () { apiAlive = false; origStop(); };

    // ---- 道具 ----
    const itembar = document.createElement('div');
    itembar.className = 'mg-itembar';
    const renderItems = () => {
        itembar.innerHTML = `<span class="mg-coins">🪙 ${coins}</span>` + MiniGames.banqi.ITEMS.map(it => {
            const ok = coins >= it.cost;
            return `<button class="mg-item ${ok ? '' : 'off'} ${itemMode === it.id ? 'armed' : ''}"
                data-item="${it.id}" title="${it.desc}">${it.icon}${it.name} <b>${it.cost}</b></button>`;
        }).join('');
        itembar.querySelectorAll('[data-item]').forEach(b => b.onclick = () => {
            const it = MiniGames.banqi.ITEMS.find(x => x.id === b.dataset.item);
            if (coins < it.cost || over || turn !== 1) return;
            if (it.id === 'soup') {   // 立即生效：复活最强被吃子
                if (!capturedMine.length) return flashHint('没有可复活的棋子');
                coins -= it.cost;
                const best = capturedMine.sort((a, b2) => b2.r - a.r)[0];
                capturedMine = capturedMine.filter(x => x !== best);
                const empties = [];
                for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) if (!board[i][j]) empties.push([i, j]);
                const [x, y] = MG.pick(empties);
                board[x][y] = { ...best, faceUp: true };
                itemMode = null; renderItems(); draw();
                flashHint(`🍲 大补粥复活了 ${best.n}！`);
                return;
            }
            itemMode = itemMode === it.id ? null : it.id;
            sel = null;
            renderItems(); draw();
            flashHint(itemMode ? `${it.icon}${it.name}已启用：` + (it.id === 'peek' ? '点击一枚暗子查看' : '先点己方棋子，再点任意空格') : '');
        });
    };
    const flashHint = t => { opts.onScore && opts.onScore(t); };
    container.appendChild(itembar);
    renderItems();

    // ---- 渲染 ----
    const draw = () => {
        ctx.fillStyle = '#6b4226'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const p = board[i][j];
            const x = 2 + j * cellW, y = 2 + i * cellH;
            ctx.fillStyle = (i + j) % 2 ? '#a87a4a' : '#c8a070';
            ctx.fillRect(x, y, cellW - 2, cellH - 2);
            if (lastAI && ((lastAI.t === 'flip' && lastAI.i === i && lastAI.j === j) ||
                (lastAI.t === 'm' && lastAI.ti === i && lastAI.tj === j))) {
                ctx.strokeStyle = 'rgba(255,122,139,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, cellW - 6, cellH - 6);
            }
            if (sel && sel[0] === i && sel[1] === j) { ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.strokeRect(x + 1, y + 1, cellW - 4, cellH - 4); }
            if (!p) continue;
            if (!p.faceUp) {
                ctx.fillStyle = itemMode === 'peek' ? '#4a2a60' : '#3a2010';
                ctx.beginPath(); ctx.arc(x + cellW / 2, y + cellH / 2, 20, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#8a5732'; ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('棋', x + cellW / 2, y + cellH / 2);
            } else {
                const isRed = p.color === 1;
                ctx.fillStyle = isRed ? '#a02828' : '#1a1a1a';
                ctx.beginPath(); ctx.arc(x + cellW / 2, y + cellH / 2, 21, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = isRed ? '#ffb0a0' : '#e0c050'; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = isRed ? '#fff' : '#e0c050';
                ctx.font = 'bold 20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(p.n, x + cellW / 2, y + cellH / 2);
            }
        }
        // 选中炮的跳吃目标提示
        if (sel) {
            const p = board[sel[0]][sel[1]];
            if (p && p.n === '砲') for (const [x, y] of jumpTargets(sel[0], sel[1])) {
                ctx.strokeStyle = '#5cd65c'; ctx.lineWidth = 2;
                ctx.strokeRect(4 + y * cellW, 4 + x * cellH, cellW - 6, cellH - 6);
            }
        }
    };

    // ---- 玩家交互 ----
    const onTap = p => {
        if (over || turn !== 1) return;
        const j = Math.floor((p.x - 2) / cellW), i = Math.floor((p.y - 2) / cellH);
        if (!inB(i, j)) return;
        const cur = board[i][j];
        // 道具模式
        if (itemMode === 'peek') {
            if (cur && !cur.faceUp) {
                coins -= 30; cur.faceUp = true; itemMode = null;
                renderItems(); draw(); flashHint(`🔍 傍观：这是一枚「${cur.n}」`);
            }
            return;
        }
        if (itemMode === 'wing') {
            if (cur && cur.faceUp && cur.color === 1) { sel = [i, j]; draw(); return; }
            if (!cur && sel) {
                board[i][j] = board[sel[0]][sel[1]]; board[sel[0]][sel[1]] = null;
                coins -= 80; itemMode = null; sel = null;
                renderItems(); draw(); flashHint('🪽 羽翼飞行成功（不消耗步数）');
            }
            return;
        }
        if (!sel) {
            if (cur && cur.faceUp && cur.color === 1) { sel = [i, j]; }
            else if (cur && !cur.faceUp) {
                cur.faceUp = true; stats.flips++; idlePlies = 0; totalPlies++;
                turn = 2; draw(); afterTurnChecks();
            }
            draw(); return;
        }
        const a = board[sel[0]][sel[1]];
        if (sel[0] === i && sel[1] === j) { sel = null; draw(); return; }
        if (cur && cur.faceUp && cur.color === 1) { sel = [i, j]; draw(); return; }
        // 移动 / 吃子
        const adj = DIRS.some(([di, dj]) => sel[0] + di === i && sel[1] + dj === j);
        let ok = false;
        if (adj && !cur) ok = true;
        else if (adj && cur && cur.faceUp && canCapAdj(a, cur)) ok = true;
        else if (a.n === '砲' && cur && cur.faceUp && jumpTargets(sel[0], sel[1]).some(([x, y]) => x === i && y === j)) ok = true;
        if (ok) {
            const victim = applyMove({ t: 'm', fi: sel[0], fj: sel[1], ti: i, tj: j });
            totalPlies++;
            idlePlies = victim ? 0 : idlePlies + 1;
            if (victim) {
                coins += victim.r * 10;
                if (victim.n === '帥') { renderItems(); return finish(true, '你吃掉了敌方主帥！'); }
            }
            sel = null; turn = 2;
            renderItems(); draw(); afterTurnChecks();
        } else { sel = null; draw(); }
    };
    MG.bind(c, onTap);

    draw();
    const lvlName = MiniGames.banqi.LEVELS[level - 1].name;
    MG.hint(container, `第 ${level} 关 · ${lvlName} · 点击暗子翻开 / 点己方子选中，邻格移动或吃子（炮隔一子跳吃）`);
    opts.onScore && opts.onScore(`第 ${level} 关 · ${lvlName} · ${turn === 1 ? '🟢 你先行' : '🔴 电脑先行'}`);
    if (turn === 2) afterTurnChecks();
    // 测试钩子（仅测试模式）
    if (typeof window !== 'undefined' && window.__MG_TEST) {
        window.__banqi = {
            get board() { return board; }, get turn() { return turn; }, get over() { return over; },
            get idlePlies() { return idlePlies; }, get lastResult() { return lastResultRef; },
            legalMoves, applyMove, aiTurn, afterTurnChecks, finish,
        };
    }
}
