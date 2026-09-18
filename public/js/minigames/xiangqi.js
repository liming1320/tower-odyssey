// 中国象棋：50 关挑战，AI 失误率递减（贪心选择 + 随机失误）
window.MiniGames = window.MiniGames || {};
MiniGames.xiangqi = {
    LEVELS: [
        // { name, desc, mistakeRate, depth (1=贪心) }
        { name: '学步', desc: 'AI 随机率 60% · 贪心' },
        { name: '入门', desc: 'AI 随机率 50%' },
        { name: '小成', desc: 'AI 随机率 40%' },
        { name: '熟练', desc: 'AI 随机率 30%' },
        { name: '稳健', desc: 'AI 随机率 24%' },
        { name: '进阶', desc: 'AI 随机率 18%' },
        { name: '进阶 II', desc: 'AI 随机率 14%' },
        { name: '挑战', desc: 'AI 随机率 10%' },
        { name: '挑战 II', desc: 'AI 随机率 7%' },
        { name: '高手', desc: 'AI 随机率 5%' },
        { name: '高手 II', desc: 'AI 随机率 3.5%' },
        { name: '冲刺', desc: 'AI 随机率 2.5%' },
        { name: '冲刺 II', desc: 'AI 随机率 1.8%' },
        { name: '宗匠', desc: 'AI 随机率 1.2%' },
        { name: '宗匠 II', desc: 'AI 随机率 0.8%' },
        { name: '大师', desc: 'AI 随机率 0.5%' },
        { name: '大师 II', desc: 'AI 随机率 0.3%' },
        { name: '鬼手', desc: 'AI 随机率 0.15%' },
        { name: '神机', desc: 'AI 随机率 0.05%' },
        { name: '棋圣', desc: 'AI 随机率 0% · 终极' },
    ].concat((function () {
        // 21~50 关：AI 失误率继续递减到 0（必须在这里生成，否则补齐关卡会回落成最弱档）
        const POOL = ['登堂', '入室', '观海', '凌云', '穿云', '裂石', '开山', '辟地', '观星', '摘星',
            '踏浪', '逐日', '奔月', '御风', '乘雷', '破军', '定海', '镇岳', '通天', '彻地',
            '洞玄', '知微', '若谷', '归真', '玄武', '朱雀', '白虎', '青龙', '棋神', '无极'];
        const out = [];
        for (let i = 20; i < 50; i++) {
            const t = i / 49;
            const mr = +(0.6 * Math.pow(1 - t, 2.2)).toFixed(5);
            out.push({ name: POOL[i - 20], desc: `AI 随机率 ${(mr * 100).toFixed(2)}%` });
        }
        return out;
    })()),
    // 50 关的 AI 失误率：0.6 → 0 平滑递减（与 LEVELS 一一对应）
    PARAMS: (function () {
        const out = [];
        for (let i = 0; i < 50; i++) {
            const t = i / 49;
            out.push([i >= 49 ? 0 : +(0.6 * Math.pow(1 - t, 2.2)).toFixed(5)]);
        }
        return out;
    })(),
    ENDLESS: { name: "∞ 无尽", desc: "最高难度持续挑战，直到失败/通关为止" },
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        // 框架 levelIdx 优先（fillLevels 会生成副本对象导致 indexOf 恒为 -1）
        const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : this.LEVELS.indexOf(lv);
        const pIdx = idx >= 0 ? Math.min(idx, this.PARAMS.length - 1) : (opts.endless ? this.PARAMS.length - 1 : 0);
        const [mistakeRate] = this.PARAMS[pIdx] || this.PARAMS[0];
        const C = 9, R = 10, S = 44;
        const INIT = [
            ['车', '马', '相', '仕', '帅', '仕', '相', '马', '车'],
            ['', '', '', '', '', '', '', '', ''],
            ['', '炮', '', '', '', '', '', '炮', ''],
            ['兵', '', '兵', '', '兵', '', '兵', '', '兵'],
            ['', '', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', '', ''],
            ['卒', '', '卒', '', '卒', '', '卒', '', '卒'],
            ['', '炮', '', '', '', '', '', '炮', ''],
            ['', '', '', '', '', '', '', '', ''],
            ['车', '马', '象', '士', '将', '士', '象', '马', '车'],
        ];
        const RED = 1, BLACK = 2;
        const NAMES = { 1: '红', 2: '黑' };
        const VALUE = { 帅: 10000, 将: 10000, 车: 900, 马: 400, 炮: 450, 相: 200, 象: 200, 仕: 200, 士: 200, 兵: 100, 卒: 100 };
        const clone = (b) => b.map(r => r.map(c => c ? { ch: c.ch, color: c.color } : null));
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
        const at = (board, i, j) => (i < 0 || i >= R || j < 0 || j >= C) ? null : board[i][j];
        const canMove = (board, fi, fj, ti, tj) => {
            const p = board[fi][fj], t = at(board, ti, tj);
            if (!p) return false;
            if (t && t.color === p.color) return false;
            const dx = ti - fi, dy = tj - fj, adx = Math.abs(dx), ady = Math.abs(dy);
            const c = p.color;
            const ch = p.ch;
            const between = (i1, j1, i2, j2) => {
                if (i1 === i2) { const lo = Math.min(j1, j2), hi = Math.max(j1, j2); for (let x = lo + 1; x < hi; x++) if (board[i1][x]) return true; }
                else if (j1 === j2) { const lo = Math.min(i1, i2), hi = Math.max(i1, i2); for (let x = lo + 1; x < hi; x++) if (board[x][j1]) return true; }
                return false;
            };
            switch (ch) {
                case '帅': case '将':
                    if (!isInPalace(c, ti, tj)) return false;
                    if (adx + ady !== 1) return false;
                    if (c === RED && t && t.ch === '将' && fj === tj && !between(fi, fj, ti, tj)) return false;
                    if (c === BLACK && t && t.ch === '帅' && fj === tj && !between(fi, fj, ti, tj)) return false;
                    return true;
                case '仕': case '士':
                    if (!isInPalace(c, ti, tj)) return false;
                    return adx === 1 && ady === 1;
                case '相': case '象':
                    if (isCrossedRiver(c, ti)) return false;
                    if (adx !== 2 || ady !== 2) return false;
                    return !at(board, fi + dx / 2, fj + dy / 2);
                case '马':
                    if (!((adx === 1 && ady === 2) || (adx === 2 && ady === 1))) return false;
                    const mx = adx === 2 ? fi + dx / 2 : fi;
                    const my = ady === 2 ? fj + dy / 2 : fj;
                    return !at(board, mx, my);
                case '车':
                    if (fi !== ti && fj !== tj) return false;
                    return !between(fi, fj, ti, tj);
                case '炮':
                    if (fi !== ti && fj !== tj) return false;
                    const blocks = between(fi, fj, ti, tj);
                    if (!t) return !blocks;
                    return blocks;
                case '兵': case '卒':
                    if (c === RED) {
                        if (dx > 0) return false;
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
        const allMoves = (board, color) => {
            const moves = [];
            for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
                const p = board[i][j];
                if (!p || p.color !== color) continue;
                for (let ti = 0; ti < R; ti++) for (let tj = 0; tj < C; tj++) {
                    if (canMove(board, i, j, ti, tj)) moves.push({ fi: i, fj: j, ti, tj });
                }
            }
            return moves;
        };
        const evalBoard = (board, color) => {
            let my = 0, op = 0;
            for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
                const p = board[i][j];
                if (!p) continue;
                const v = VALUE[p.ch] || 0;
                if (p.color === color) my += v; else op += v;
            }
            return my - op;
        };
        const aiChoose = (board, color) => {
            const moves = allMoves(board, color);
            if (!moves.length) return null;
            const list = [];
            for (const m of moves) {
                const snap = clone(board);
                snap[m.ti][m.tj] = snap[m.fi][m.fj]; snap[m.fi][m.fj] = null;
                list.push({ m, s: evalBoard(snap, color) });
            }
            list.sort((a, b) => b.s - a.s);
            const cut = Math.max(1, Math.floor(list.length * (1 - mistakeRate)));
            const pool = list.slice(0, cut);
            return pool[MG.ri(0, pool.length - 1)].m;
        };
        const findKing = (board, ch) => {
            for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
                if (board[i][j] && board[i][j].ch === ch) return [i, j];
            }
            return null;
        };
        let board = initBoard(), turn = RED, sel = null, aiBusy = false, finished = false;
        // 联机对战（状态同步，opt-in）：side 0 执红(RED)先手，side 1 执黑(BLACK)后手。
        let pvp = null, myColor = RED;
        if (MG.pvp && MG.pvp.shouldBegin('xiangqi')) {
            // 必须先 begin 再读取 side（MG.pvp.side 仅在 begin 后写入），否则 side 1 方会按 side 0 计算 myColor
            pvp = MG.pvp.begin({
                setState(m) {
                    board = m.board;
                    turn = m.turn;
                    sel = null;
                    if (m.over != null) {
                        finished = true;
                        const win = (m.over === myColor);
                        opts.onComplete && opts.onComplete({ win, stars: win ? 3 : 0, lines: [win ? '你赢了！' : '对手赢了', lv.desc] });
                    }
                },
            });
            myColor = MG.pvp.side === 0 ? RED : BLACK;
        }
        const { c, ctx, w, h, destroy } = MG.canvas(container, C * S + 20, R * S + 20);
        const finalize = (win) => {
            if (finished) return;
            finished = true;
            const stars = win ? 3 : 0;
            opts.onComplete && opts.onComplete({
                win, stars,
                lines: [win ? NAMES[turn] + '方胜利！' : '电脑吃掉你的将帅', lv.desc],
            });
        };
        // 联机终局：winnerColor 为取胜方（RED/BLACK），整盘同步给对手并展示结果。
        const pvpFinish = (winnerColor) => {
            if (finished) return;
            finished = true;
            const win = (winnerColor === myColor);
            if (pvp) MG.pvp.commit({ board: clone(board), turn: 3 - winnerColor, over: winnerColor });
            opts.onComplete && opts.onComplete({ win, stars: win ? 3 : 0, lines: [win ? '你赢了！' : '对手赢了', lv.desc] });
        };
        const draw = () => {
            // 木纹棋盘：MG.gfx.wood 一次性画完底色+年轮纹+节疤+边框高光
            MG.gfx.wood(ctx, 0, 0, w, h, '#e8c088', '#b88458', 42);
            // 整体加深一圈描边，让棋盘看起来是"嵌"在外框里
            ctx.lineWidth = 4; ctx.strokeStyle = '#5a3a1c';
            ctx.strokeRect(2, 2, w - 4, h - 4);
            // 网格线
            ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1;
            for (let i = 0; i < R; i++) {
                ctx.beginPath(); ctx.moveTo(10, 10 + i * S); ctx.lineTo(10 + (C - 1) * S, 10 + i * S); ctx.stroke();
            }
            for (let j = 0; j < C; j++) {
                const x = 10 + j * S;
                if (j === 0 || j === C - 1) {
                    // 边线上下贯通
                    ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 10 + (R - 1) * S); ctx.stroke();
                } else {
                    // 中间各列在"楚河汉界"处断开（标准棋盘画法）
                    ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 10 + 4 * S); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(x, 10 + 5 * S); ctx.lineTo(x, 10 + (R - 1) * S); ctx.stroke();
                }
            }
            // 楚河汉界：用立体文字
            MG.gfx.text(ctx, '楚 河          汉 界', 10 + 4 * S, 10 + 4.5 * S, 14, '#3a2410', { stroke: false, weight: 'bold' });
            // 九宫格对角线（将/帅区）
            ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(10 + 3 * S, 10); ctx.lineTo(10 + 5 * S, 10 + 2 * S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10 + 5 * S, 10); ctx.lineTo(10 + 3 * S, 10 + 2 * S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10 + 3 * S, 10 + 7 * S); ctx.lineTo(10 + 5 * S, 10 + 9 * S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10 + 5 * S, 10 + 7 * S); ctx.lineTo(10 + 3 * S, 10 + 9 * S); ctx.stroke();
            for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
                const p = board[i][j];
                if (!p) continue;
                const x = 10 + j * S, y = 10 + i * S;
                // 棋子：木纹 + 投影 + 双圈 + 中央字
                ctx.save();
                // 1) 投影
                ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
                // 2) 棋子主体：木质底色（与棋盘同色系但更亮、更饱和）
                let pg = null;
                try { pg = ctx.createRadialGradient(x - 4, y - 5, 3, x, y, 17); pg.addColorStop(0, '#fbe8bc'); pg.addColorStop(0.7, '#e8c890'); pg.addColorStop(1, '#b88458'); } catch (e) {}
                ctx.fillStyle = pg || '#f0d8a0'; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                // 3) 双圈描边（外圈粗木色，内圈按阵营染色）
                ctx.strokeStyle = '#6a4220'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath(); ctx.arc(x, y, 12.5, 0, Math.PI * 2);
                ctx.strokeStyle = p.color === RED ? 'rgba(160,40,40,0.6)' : 'rgba(30,30,40,0.6)';
                ctx.lineWidth = 1; ctx.stroke();
                // 4) 棋子上的字：立体文字
                MG.gfx.text(ctx, p.ch, x, y, 18, p.color === RED ? '#a02828' : '#1a1a1a', { stroke: false, weight: 'bold' });
                if (sel && sel[0] === i && sel[1] === j) {
                    ctx.save();
                    ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 12;
                    ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                }
            }
            opts.onScore && opts.onScore(NAMES[turn] + '方走棋');
        };
        const aiTurn = () => {
            if (finished) return;
            aiBusy = true;
            setTimeout(() => {
                const m = aiChoose(board, turn);
                if (!m) { aiBusy = false; finalize(turn === BLACK); return; }
                const moved = board[m.fi][m.fj];
                const target = board[m.ti][m.tj];
                if (target && (target.ch === '帅' || target.ch === '将')) {
                    board[m.ti][m.tj] = moved; board[m.fi][m.fj] = null;
                    draw();
                    finalize(turn === BLACK);
                    return;
                }
                board[m.ti][m.tj] = moved; board[m.fi][m.fj] = null;
                turn = 3 - turn;
                aiBusy = false;
                draw();
                // 检查玩家是否被将死
                if (!findKing(board, '帅') || !findKing(board, '将')) {
                    finalize(true);
                }
            }, 350);
        };
        const onTap = p => {
            if (finished || aiBusy || turn !== (pvp ? myColor : RED)) return;
            const j = Math.round((p.x - 10) / S), i = Math.round((p.y - 10) / S);
            if (i < 0 || i >= R || j < 0 || j >= C) return;
            const cur = board[i][j];
            if (!sel) {
                if (cur && cur.color === turn) sel = [i, j];
            } else {
                if (sel[0] === i && sel[1] === j) { sel = null; }
                else if (canMove(board, sel[0], sel[1], i, j)) {
                    const moved = board[sel[0]][sel[1]];
                    const target = board[i][j];
                    if (target && (target.ch === '帅' || target.ch === '将')) {
                        board[i][j] = moved; board[sel[0]][sel[1]] = null;
                        try { MG.audio.sfx('target'); } catch (e) {}
                        draw();
                        if (pvp) { pvpFinish(turn); return; }
                        finalize(true);
                        return;
                    }
                    board[i][j] = moved; board[sel[0]][sel[1]] = null;
                    try { MG.audio.sfx(target ? 'target' : 'click'); } catch (e) {}
                    sel = null; turn = 3 - turn;
                    draw();
                    if (pvp) {
                        MG.pvp.commit({ board: clone(board), turn, over: null });
                    } else {
                        aiTurn();
                    }
                } else if (cur && cur.color === turn) { sel = [i, j]; }
            }
            draw();
        };
        MG.bind(c, onTap);
        draw();
        MG.hint(container, (pvp ? (myColor === RED ? '你执红（先手）' : '你执黑（后手）') : '红方（你）') + ' vs ' + (pvp ? '对手' : '电脑（黑）') + ' · 点击己方棋子 → 点击目标位置');
        return { stop() { destroy(); } };
    }
};