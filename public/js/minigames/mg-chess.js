// 重策略棋类：国际象棋（完整走子 + 简易 AI） / 军棋翻翻棋（军衔吃子 + 炸弹地雷军旗）
(function () {
    const E = MG.eng, U = MG.ui;
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

    // ==================== 国际象棋 ====================
    // 编码：0 空；白 1-6 = P N B R Q K；黑 9-14 = p n b r q k
    const CG = { 1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', 6: '♔', 9: '♟', 10: '♞', 11: '♝', 12: '♜', 13: '♛', 14: '♚' };
    const CV = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100, 9: 1, 10: 3, 11: 3, 12: 5, 13: 9, 14: 100 };
    const cIn = (i, j) => i >= 0 && i < 8 && j >= 0 && j < 8;
    const cWhite = v => v > 0 && v < 8;
    function cBoard() {
        const b = Array.from({ length: 8 }, () => Array(8).fill(0));
        const back = [4, 2, 3, 5, 6, 3, 2, 4];
        for (let j = 0; j < 8; j++) { b[0][j] = back[j] + 8; b[1][j] = 9; b[6][j] = 1; b[7][j] = back[j]; }
        return b;
    }
    function cKing(b, w) {
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (b[i][j] && cWhite(b[i][j]) === w && b[i][j] % 8 === 6) return [i, j];
        return null;
    }
    function cAtt(b, i, j, byW) {
        const pd = byW ? 1 : -1;
        for (const dj of [-1, 1]) { const a = i + pd, c = j + dj; if (cIn(a, c) && b[a][c] === (byW ? 1 : 9)) return true; }
        for (const [di, dj] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
            const a = i + di, c = j + dj; if (cIn(a, c)) { const v = b[a][c]; if (v && cWhite(v) === byW && v % 8 === 2) return true; }
        }
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
            const a = i + di, c = j + dj; if (cIn(a, c)) { const v = b[a][c]; if (v && cWhite(v) === byW && v % 8 === 6) return true; }
        }
        for (const [di, dj] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            let a = i + di, c = j + dj;
            while (cIn(a, c)) { const v = b[a][c]; if (v) { if (cWhite(v) === byW && (v % 8 === 4 || v % 8 === 5)) return true; break; } a += di; c += dj; }
        }
        for (const [di, dj] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
            let a = i + di, c = j + dj;
            while (cIn(a, c)) { const v = b[a][c]; if (v) { if (cWhite(v) === byW && (v % 8 === 3 || v % 8 === 5)) return true; break; } a += di; c += dj; }
        }
        return false;
    }
    function cDo(b, m) {
        const [i, j, a, c] = m;
        let v = b[i][j]; b[i][j] = 0;
        if (v % 8 === 1 && (a === 0 || a === 7)) v = (cWhite(v) ? 0 : 8) + 5;   // 升变后
        b[a][c] = v;
    }
    function cGen(b, w) {
        const out = [];
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
            const v = b[i][j];
            if (!v || cWhite(v) !== w) continue;
            const t = v % 8;
            if (t === 1) {
                const d = w ? -1 : 1;
                if (cIn(i + d, j) && !b[i + d][j]) {
                    out.push([i, j, i + d, j]);
                    if ((w && i === 6) || (!w && i === 1)) if (!b[i + 2 * d][j]) out.push([i, j, i + 2 * d, j]);
                }
                for (const dj of [-1, 1]) { const a = i + d, c = j + dj; if (cIn(a, c) && b[a][c] && cWhite(b[a][c]) !== w) out.push([i, j, a, c]); }
            } else if (t === 2) {
                for (const [di, dj] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
                    const a = i + di, c = j + dj; if (cIn(a, c) && (!b[a][c] || cWhite(b[a][c]) !== w)) out.push([i, j, a, c]);
                }
            } else if (t === 6) {
                for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
                    if (!di && !dj) continue;
                    const a = i + di, c = j + dj; if (cIn(a, c) && (!b[a][c] || cWhite(b[a][c]) !== w)) out.push([i, j, a, c]);
                }
            } else {
                const dirs = t === 3 ? [[-1,-1],[-1,1],[1,-1],[1,1]] : t === 4 ? [[-1,0],[1,0],[0,-1],[0,1]]
                    : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
                for (const [di, dj] of dirs) {
                    let a = i + di, c = j + dj;
                    while (cIn(a, c)) { if (b[a][c]) { if (cWhite(b[a][c]) !== w) out.push([i, j, a, c]); break; } out.push([i, j, a, c]); a += di; c += dj; }
                }
            }
        }
        return out;
    }
    function cLegal(b, w) {
        return cGen(b, w).filter(m => {
            const t = b.map(r => r.slice()); cDo(t, m);
            const k = cKing(t, w);
            return !k || !cAtt(t, k[0], k[1], !w);
        });
    }
    E.def('chess', {
        levels: E.nm(),
        params: (i, t) => ({ mis: +(0.95 - 0.8 * t).toFixed(2) }),
        w: 384, h: 470,
        hint: '白方（你）先行，点击己方棋子再点目标格；将死对方即胜',
        init: () => ({ b: cBoard(), turn: 1, sel: null, moves: [], msg: '你的回合（白）', cap: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a3350', '#1a1730');
            const C = 44, ox = (W - C * 8) / 2, oy = 74;
            for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
                const x = ox + j * C, y = oy + i * C;
                ctx.fillStyle = (i + j) % 2 ? '#6b7fa8' : '#e8e0d0';
                ctx.fillRect(x, y, C, C);
                if (S.sel && S.sel[0] === i && S.sel[1] === j) { ctx.fillStyle = 'rgba(255,213,107,.55)'; ctx.fillRect(x, y, C, C); }
                if (S.moves.some(m => m[2] === i && m[3] === j)) {
                    ctx.beginPath(); ctx.arc(x + C / 2, y + C / 2, 7, 0, 6.284);
                    ctx.fillStyle = 'rgba(60,200,90,.7)'; ctx.fill();
                }
                const v = S.b[i][j];
                if (!v) continue;
                ctx.font = '32px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.lineWidth = 3; ctx.strokeStyle = cWhite(v) ? '#20202c' : '#f0f0f0';
                ctx.strokeText(CG[v], x + C / 2, y + C / 2 + 2);
                ctx.fillStyle = cWhite(v) ? '#fdfdfd' : '#1c1c28';
                ctx.fillText(CG[v], x + C / 2, y + C / 2 + 2);
            }
            E.txt(ctx, S.msg, W / 2, 40, 17, '#ffd56b', true);
            E.txt(ctx, `已吃 ${S.cap} 子`, W / 2, H - 20, 14, '#c8c0e0');
        },
        tap(S, x, y, P, api) {
            if (S.turn !== 1) return;
            const C = 44, ox = (384 - C * 8) / 2, oy = 74;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (!cIn(i, j)) return;
            if (S.sel) {
                const m = S.moves.find(m => m[2] === i && m[3] === j);
                if (m) {
                    if (S.b[i][j]) S.cap += CV[S.b[i][j] % 8] || 0;
                    const wasCap = !!S.b[i][j];
                    cDo(S.b, m); S.sel = null; S.moves = [];
                    try { MG.audio.sfx(wasCap ? 'target' : 'click'); } catch (e) {}
                    if (!cKing(S.b, false)) return api.finish({ win: true, stars: 3, lines: ['将死对方！'] });
                    S.turn = 2; S.msg = '电脑思考…';
                    setTimeout(() => {
                        cAI(S, P.mis);
                        if (!cKing(S.b, true)) { S.msg = '你被将死了'; return api.finish({ win: false, stars: 0, lines: ['白方王被吃'] }); }
                        if (!cLegal(S.b, true).length) return api.finish({ win: false, stars: 0, lines: ['无子可动，困毙'] });
                        S.turn = 1; S.msg = '你的回合（白）';
                    }, 240);
                    return;
                }
            }
            const v = S.b[i][j];
            if (v && cWhite(v)) { S.sel = [i, j]; S.moves = cLegal(S.b, true).filter(m => m[0] === i && m[1] === j); }
            else { S.sel = null; S.moves = []; }
        },
    });
    function cAI(S, mis) {
        const ms = cLegal(S.b, false);
        if (!ms.length) return;
        let pick = null;
        if (Math.random() < mis) pick = ms[ri(0, ms.length - 1)];
        else {
            let bs = -1e9;
            for (const m of ms) {
                const victim = S.b[m[2]][m[3]];
                let s = victim ? CV[victim % 8] * 10 : 0;
                const t = S.b.map(r => r.slice()); cDo(t, m);
                if (cAtt(t, m[2], m[3], true)) s -= CV[S.b[m[0]][m[1]] % 8] * 8;   // 走过去会被吃
                const k = cKing(t, true);
                if (k && cAtt(t, k[0], k[1], false)) s += 60;                        // 将军
                s += Math.random() * 2;
                if (s > bs) { bs = s; pick = m; }
            }
        }
        if (S.b[pick[2]][pick[3]]) S.cap += 0;
        cDo(S.b, pick);
    }

    // ==================== 军棋翻翻棋 ====================
    // 军衔：司令40 军长39 师长38 旅长37 团长36 营长35 连长34 排长33 工兵32 炸弹30 地雷31 军旗29
    const JR = { 40: '司令', 39: '军长', 38: '师长', 37: '旅长', 36: '团长', 35: '营长', 34: '连长', 33: '排长', 32: '工兵', 31: '地雷', 30: '炸弹', 29: '军旗' };
    const jSide = v => (v & 1) ? 1 : 2;           // 低位存阵营：1=我方(蓝) 2=敌方(红)
    const jRank = v => v >> 8;
    const jMake = (side, rank) => (rank << 8) | side;
    function jSetup(n) {
        const rankList = [40, 39, 38, 37, 36, 35, 34, 33, 33, 33, 32, 32, 32, 31, 31, 30, 30, 29];
        const per = Math.max(1, Math.floor(n * n / 2 / rankList.length));
        const pool = [];
        for (const r of rankList) for (let k = 0; k < per; k++) pool.push(r);
        const need = Math.floor(n * n / 2);
        while (pool.length < need) pool.push(33);
        pool.length = need;
        const all = [];
        pool.forEach(r => { all.push(jMake(1, r)); all.push(jMake(2, r)); });
        while (all.length < n * n) all.push(0);
        all.length = n * n;
        MG.shuffle(all);
        const b = [];
        for (let i = 0; i < n; i++) b.push(all.slice(i * n, i * n + n));
        return b;
    }
    E.def('junqi', {
        levels: E.nm(),
        params: (i, t) => ({ n: 5 + Math.min(1, Math.floor(i / 10)), mis: +(0.9 - 0.75 * t).toFixed(2) }),
        w: 380, h: 470,
        hint: '翻开棋子或调动己方棋子，吃光对方或夺取军旗即胜；炸弹同归于尽，地雷只能工兵挖',
        init: P => ({ n: P.n, b: jSetup(P.n), open: Array.from({ length: P.n }, () => Array(P.n).fill(0)), sel: null, msg: '点击暗棋翻开，或点击己方明棋行动' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3d4a2e', '#1e2616');
            const n = S.n, C = Math.min(58, (W - 24) / n), ox = (W - C * n) / 2, oy = 76;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C, v = S.b[i][j];
                if (!v) { ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(x + 1, y + 1, C - 2, C - 2); continue; }
                if (!S.open[i][j]) {
                    E.card(ctx, x + 2, y + 2, C - 4, C - 4, '#8a6a3a', '#5a4020', 6);
                    E.txt(ctx, '?', x + C / 2, y + C / 2, C * 0.5, '#f0e0b0', true);
                } else {
                    const side = jSide(v), r = jRank(v);
                    E.card(ctx, x + 2, y + 2, C - 4, C - 4, side === 1 ? '#3f6fbf' : '#bf3f4f', side === 1 ? '#22406f' : '#6f2028', 6);
                    E.txt(ctx, JR[r] || '?', x + C / 2, y + C / 2 - 6, C * 0.28, '#fff', true);
                    E.txt(ctx, side === 1 ? '我' : '敌', x + C / 2, y + C / 2 + C * 0.28, C * 0.22, side === 1 ? '#bfe0ff' : '#ffd0d0');
                }
                if (S.sel && S.sel[0] === i && S.sel[1] === j) {
                    ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, C - 4, C - 4);
                }
            }
            E.txt(ctx, S.msg, W / 2, 42, 16, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            const n = S.n, C = Math.min(58, (380 - 24) / n), ox = (380 - C * n) / 2, oy = 76;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i >= n || j < 0 || j >= n) return;
            const v = S.b[i][j];
            if (!v) return;
            if (!S.open[i][j]) { S.open[i][j] = 1; try { MG.audio.sfx('click'); } catch (e) {} jqAfter(S, api, P); return; }
            if (S.sel) {
                const [si, sj] = S.sel;
                if (si === i && sj === j) { S.sel = null; return; }
                if (Math.abs(si - i) + Math.abs(sj - j) !== 1) { S.sel = null; return; }
                const mine = S.b[si][sj], foe = v;
                if (jSide(foe) === jSide(mine)) { S.sel = null; return; }
                jqBattle(S, si, sj, i, j); S.sel = null;
                try { MG.audio.sfx('target'); } catch (e) {}
                jqAfter(S, api, P);
                return;
            }
            if (jSide(v) === 1 && jRank(v) !== 31 && jRank(v) !== 29) S.sel = [i, j];
        },
    });
    function jqBattle(S, si, sj, ti, tj) {
        const a = S.b[si][sj], d = S.b[ti][tj];
        const ra = jRank(a), rd = jRank(d);
        if (rd === 29) { S.b[ti][tj] = a; S.b[si][sj] = 0; S.open[si][sj] = 0; return; }   // 夺旗
        if (ra === 30 || rd === 30) { S.b[si][sj] = 0; S.b[ti][tj] = 0; S.open[si][sj] = 0; S.open[ti][tj] = 0; return; }
        if (rd === 31) {
            if (ra === 32) { S.b[ti][tj] = a; S.b[si][sj] = 0; S.open[si][sj] = 0; }        // 工兵挖雷
            else { S.b[si][sj] = 0; S.open[si][sj] = 0; }
            return;
        }
        if (ra > rd) { S.b[ti][tj] = a; S.b[si][sj] = 0; S.open[si][sj] = 0; S.open[ti][tj] = 1; }
        else if (ra === rd) { S.b[si][sj] = 0; S.b[ti][tj] = 0; S.open[si][sj] = 0; S.open[ti][tj] = 0; }
        else { S.open[si][sj] = 1; S.b[si][sj] = 0; }
    }
    function jqAfter(S, api, P) {
        let f1 = false, f2 = false, m1 = 0, m2 = 0;
        for (let i = 0; i < S.n; i++) for (let j = 0; j < S.n; j++) {
            const v = S.b[i][j]; if (!v) continue;
            const s = jSide(v), r = jRank(v);
            if (r === 29) { if (s === 1) f1 = true; else f2 = true; continue; }
            if (r !== 31) { if (s === 1) m1++; else m2++; }
        }
        if (!f2) return api.finish({ win: true, stars: 3, lines: ['夺取敌军旗！'] });
        if (!f1) return api.finish({ win: false, stars: 0, lines: ['我方军旗被夺'] });
        if (!m2) return api.finish({ win: true, stars: 3, lines: ['敌方能动的棋子全灭'] });
        if (!m1) return api.finish({ win: false, stars: 0, lines: ['我方棋子全灭'] });
        // 电脑回合
        setTimeout(() => { jqAI(S, P.mis); jqAfter2(S, api, P); }, 220);
    }
    function jqAfter2(S, api, P) {
        let f1 = false, f2 = false, m1 = 0, m2 = 0;
        for (let i = 0; i < S.n; i++) for (let j = 0; j < S.n; j++) {
            const v = S.b[i][j]; if (!v) continue;
            const s = jSide(v), r = jRank(v);
            if (r === 29) { if (s === 1) f1 = true; else f2 = true; continue; }
            if (r !== 31) { if (s === 1) m1++; else m2++; }
        }
        if (!f2) return api.finish({ win: true, stars: 3, lines: ['敌军旗被吃（电脑误撞）'] });
        if (!f1) return api.finish({ win: false, stars: 0, lines: ['我方军旗被夺'] });
        if (!m1) return api.finish({ win: false, stars: 0, lines: ['我方棋子全灭'] });
        if (!m2) return api.finish({ win: true, stars: 3, lines: ['敌方能动的棋子全灭'] });
    }
    function jqAI(S, mis) {
        const n = S.n;
        const mine = [], hidden = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const v = S.b[i][j]; if (!v) continue;
            if (!S.open[i][j]) { hidden.push([i, j]); continue; }
            if (jSide(v) === 2 && jRank(v) !== 31 && jRank(v) !== 29) mine.push([i, j]);
        }
        if (Math.random() < mis) {
            if (hidden.length && Math.random() < 0.6) { const p = hidden[ri(0, hidden.length - 1)]; S.open[p[0]][p[1]] = 1; return; }
            if (mine.length) { jqRandomMove(S, mine); }
            else if (hidden.length) { const p = hidden[ri(0, hidden.length - 1)]; S.open[p[0]][p[1]] = 1; }
            return;
        }
        // 优先：能吃军旗 / 稳赢的战斗
        for (const [i, j] of mine) {
            for (const [di, dj] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                const a = i + di, c = j + dj;
                if (a < 0 || a >= n || c < 0 || c >= n) continue;
                const t = S.b[a][c];
                if (!t || !S.open[a][c] || jSide(t) === 2) continue;
                const rd = jRank(t), ra = jRank(S.b[i][j]);
                if (rd === 29) { jqBattle(S, i, j, a, c); return; }
                if (rd === 31) { if (ra === 32) { jqBattle(S, i, j, a, c); return; } continue; }
                if (jRank(S.b[i][j]) !== 30 && ra > rd) { jqBattle(S, i, j, a, c); return; }
            }
        }
        if (hidden.length && Math.random() < 0.65) { const p = hidden[ri(0, hidden.length - 1)]; S.open[p[0]][p[1]] = 1; return; }
        if (mine.length) jqRandomMove(S, mine);
        else if (hidden.length) { const p = hidden[ri(0, hidden.length - 1)]; S.open[p[0]][p[1]] = 1; }
    }
    function jqRandomMove(S, mine) {
        const n = S.n, cand = [];
        for (const [i, j] of mine) for (const [di, dj] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const a = i + di, c = j + dj;
            if (a < 0 || a >= n || c < 0 || c >= n) continue;
            const t = S.b[a][c];
            if (!t) cand.push([i, j, a, c, 'm']);
            else if (S.open[a][c] && jSide(t) === 1) cand.push([i, j, a, c, 'a']);
        }
        if (!cand.length) return;
        const p = cand[ri(0, cand.length - 1)];
        if (p[4] === 'm') { S.b[p[2]][p[3]] = S.b[p[0]][p[1]]; S.b[p[0]][p[1]] = 0; S.open[p[2]][p[3]] = 1; S.open[p[0]][p[1]] = 0; }
        else jqBattle(S, p[0], p[1], p[2], p[3]);
    }
})();
