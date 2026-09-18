// 棋类小游戏 10 款：井字棋 / 四子棋 / 黑白棋 / 取石子 / 海战棋 / 点格棋 / 非洲棋 / N皇后 / 孔明棋 / 突破棋
(function () {
    const _eng = MG.eng, U = MG.ui;
    const E = Object.assign({}, _eng);
    (function () {
        const w = (orig) => (id, cfg) => {
            if (cfg && cfg.tap) {
                const t = cfg.tap;
                cfg.tap = (S, x, y, P, api) => { try { MG.audio.unlock(); MG.audio.sfx('click'); } catch (e) {} return t(S, x, y, P, api); };
            }
            return orig(id, cfg);
        };
        if (_eng.def) E.def = w(_eng.def);
        if (_eng.defd) E.defd = w(_eng.defd);
    })();
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

    // ============ 1. 井字棋 ============
    E.def('tictactoe', {
        levels: E.nm(),
        params: (i, t) => ({ mis: +(0.6 - 0.45 * t).toFixed(2) }),
        w: 360, h: 470,
        hint: '点击格子落子，三子连成一线即胜',
        init: () => ({ b: Array(9).fill(0), turn: 1, res: '' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2e4666', '#16233a');
            const C = 96, ox = (W - C * 3) / 2, oy = 92;
            E.broom(ctx, ox, oy, C * 3, C * 3, { felt: '#2a4d78', frame: '#b0885a', frame2: '#7a5a34', seed: 11 });
            for (let k = 0; k < 9; k++) {
                const x = ox + (k % 3) * C, y = oy + ((k / 3) | 0) * C;
                U.rr(ctx, x + 5, y + 5, C - 10, C - 10, 9);
                ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fill();
                ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.stroke();
                if (S.b[k] === 1) E.txt(ctx, '✕', x + C / 2, y + C / 2 + 1, 48, '#ff8a9b', true);
                if (S.b[k] === 2) E.txt(ctx, '○', x + C / 2, y + C / 2 + 1, 48, '#6cd7ff', true);
            }
            E.txt(ctx, S.res || (S.turn === 1 ? '你的回合 ✕' : '电脑思考…'), W / 2, 46, 19, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            if (S.res) return;
            const C = 96, ox = (360 - C * 3) / 2, oy = 92;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i > 2 || j < 0 || j > 2) return;
            const k = i * 3 + j;
            if (S.b[k]) return;
            S.b[k] = 1;
            if (tttEnd(S)) return api.finish(tttRes(S));
            S.turn = 2;
            tttAI(S, P.mis);
            if (tttEnd(S)) api.finish(tttRes(S));
        },
    });
    const TL = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    function tttWin(b, p) { return TL.some(l => l.every(k => b[k] === p)); }
    function tttEnd(S) {
        if (tttWin(S.b, 1)) { S.res = '你赢了！'; return true; }
        if (tttWin(S.b, 2)) { S.res = '电脑赢了'; return true; }
        if (S.b.every(v => v)) { S.res = '平局'; return true; }
        return false;
    }
    function tttRes(S) {
        if (S.res === '你赢了！') return { win: true, stars: 3, lines: ['三子连珠！'] };
        if (S.res === '平局') return { win: true, stars: 2, lines: ['打平，势均力敌'] };
        return { win: false, stars: 0, lines: ['被电脑连成一线'] };
    }
    function tttAI(S, mis) {
        const emp = S.b.map((v, i) => v ? -1 : i).filter(i => i >= 0);
        if (!emp.length) return;
        let pick = null;
        if (Math.random() < mis) pick = emp[ri(0, emp.length - 1)];
        else {
            for (const k of emp) { S.b[k] = 2; const w = tttWin(S.b, 2); S.b[k] = 0; if (w) { pick = k; break; } }
            if (pick == null) for (const k of emp) { S.b[k] = 1; const w = tttWin(S.b, 1); S.b[k] = 0; if (w) { pick = k; break; } }
            if (pick == null && !S.b[4]) pick = 4;
            if (pick == null) pick = emp[ri(0, emp.length - 1)];
        }
        S.b[pick] = 2; S.turn = 1;
    }

    // ============ 2. 四子棋（Connect 4）============
    E.def('connect4', {
        levels: E.nm(),
        params: (i, t) => ({ mis: +(0.7 - 0.55 * t).toFixed(2) }),
        w: 350, h: 430,
        hint: '点击列放入棋子，四子连成一线（横/竖/斜）即胜',
        init: () => ({ b: Array.from({ length: 6 }, () => Array(7).fill(0)), turn: 1, res: '' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#1b3a6b', '#0d1e3a');
            const C = 46, ox = 9, oy = 70;
            E.broom(ctx, ox, oy, C * 7, C * 6, { felt: '#1c4a8f', frame: '#e0a838', frame2: '#a06f18', seed: 22, r: 16, frameW: 13 });
            for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) {
                const x = ox + j * C, y = oy + i * C;
                // 空洞：深色凹坑（径向渐变，中心更暗）
                const hx = x + C / 2, hy = y + C / 2, hr = C / 2 - 3;
                let hg = null;
                try { hg = ctx.createRadialGradient(hx, hy - hr * 0.3, hr * 0.2, hx, hy, hr); hg.addColorStop(0, '#0d2c5e'); hg.addColorStop(1, '#081c40'); } catch (e) { }
                ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 6.284);
                ctx.fillStyle = hg || '#0d2c5e'; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
                if (S.b[i][j]) E.piece(ctx, hx, hy, C / 2 - 5, S.b[i][j] === 1 ? '#ff6b7f' : '#ffd56b', S.b[i][j] === 1 ? '#b02438' : '#c89020');
            }
            E.txt(ctx, S.res || (S.turn === 1 ? '你的回合（红）' : '电脑思考…'), W / 2, 38, 18, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            if (S.res) return;
            const j = Math.floor((x - 9) / 46);
            if (j < 0 || j > 6 || S.b[0][j]) return;
            c4put(S, j, 1);
            if (c4win(S, 1)) { S.res = '你赢了！'; return api.finish({ win: true, stars: 3, lines: ['四子连珠！'] }); }
            if (S.b[0].every(v => v)) return api.finish({ win: false, stars: 1, lines: ['棋盘满了，平局'] });
            c4ai(S, P.mis);
            if (c4win(S, 2)) { S.res = '电脑赢了'; return api.finish({ win: false, stars: 0, lines: ['被电脑连成四子'] }); }
        },
    });
    function c4put(S, j, p) { for (let i = 5; i >= 0; i--) if (!S.b[i][j]) { S.b[i][j] = p; return i; } return -1; }
    function c4win(S, p) {
        const b = S.b;
        for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) {
            if (b[i][j] !== p) continue;
            for (const [di, dj] of [[0,1],[1,0],[1,1],[1,-1]]) {
                let n = 0, x = i, y = j;
                while (x >= 0 && x < 6 && y >= 0 && y < 7 && b[x][y] === p) { n++; x += di; y += dj; }
                if (n >= 4) return true;
            }
        }
        return false;
    }
    function c4ai(S, mis) {
        const emp = [];
        for (let j = 0; j < 7; j++) if (!S.b[0][j]) emp.push(j);
        if (!emp.length) return;
        let pick = null;
        if (Math.random() < mis) pick = emp[ri(0, emp.length - 1)];
        else {
            for (const j of emp) { if (c4put(S, j, 2) >= 0) { const w = c4win(S, 2); S.b[c4top(S, j)][j] = 0; if (w) { pick = j; break; } } }
            if (pick == null) for (const j of emp) { if (c4put(S, j, 1) >= 0) { const w = c4win(S, 1); S.b[c4top(S, j)][j] = 0; if (w) { pick = j; break; } } }
            if (pick == null) pick = emp[Math.floor(emp.length / 2)];
        }
        c4put(S, pick, 2);
    }
    function c4top(S, j) { for (let i = 0; i < 6; i++) if (S.b[i][j]) return i; return 5; }

    // ============ 3. 黑白棋（Reversi）============
    E.def('reversi', {
        levels: E.nm(),
        params: (i, t) => ({ mis: +(0.75 - 0.6 * t).toFixed(2) }),
        w: 380, h: 450,
        hint: '点击空格落子，夹住对方棋子即可翻转，结束时子多者胜',
        init: () => {
            const b = Array.from({ length: 8 }, () => Array(8).fill(0));
            b[3][3] = 2; b[4][4] = 2; b[3][4] = 1; b[4][3] = 1;
            return { b, turn: 1, pass: 0, msg: '你的回合（白）' };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#1f5c3a', '#0e2e1d');
            const C = 44, ox = (W - C * 8) / 2, oy = 62;
            E.broom(ctx, ox, oy, C * 8, C * 8, { felt: '#2e6e48', frame: '#8a6234', frame2: '#5a3c1c', seed: 33 });
            for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
                const x = ox + j * C, y = oy + i * C;
                ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(x + 1, y + 1, C - 2, C - 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.strokeRect(x + 1.5, y + 1.5, C - 3, C - 3);
                const v = S.b[i][j];
                if (!v) continue;
                E.piece(ctx, x + C / 2, y + C / 2, C / 2 - 4, v === 1 ? '#f4f4f8' : '#3a3a4c', v === 1 ? '#b8b8c8' : '#101018', v === 1 ? 'rgba(120,120,140,0.6)' : 'rgba(0,0,0,0.55)');
            }
            if (S.turn === 1) rvHints(ctx, S, C, ox, oy);
            const c1 = S.b.flat().filter(v => v === 1).length, c2 = S.b.flat().filter(v => v === 2).length;
            E.txt(ctx, `白 ${c1} : ${c2} 黑`, W / 2, 34, 18, '#ffd56b', true);
            E.txt(ctx, S.msg, W / 2, H - 22, 14, '#cfe8d8');
        },
        tap(S, x, y, P, api) {
            if (S.turn !== 1) return;
            const C = 44, ox = (380 - C * 8) / 2, oy = 62;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i > 7 || j < 0 || j > 7) return;
            const f = rvFlips(S.b, i, j, 1);
            if (!f.length) return;
            S.b[i][j] = 1; f.forEach(([a, b2]) => S.b[a][b2] = 1);
            if (!rvAfter(S, api)) { S.turn = 2; S.msg = '电脑思考…'; setTimeout(() => { rvAI(S, P.mis); rvAfter(S, api); }, 260); }
        },
    });
    const RVD = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    function rvFlips(b, i, j, p) {
        if (b[i][j]) return [];
        const out = [];
        for (const [di, dj] of RVD) {
            const line = []; let x = i + di, y = j + dj;
            while (x >= 0 && x < 8 && y >= 0 && y < 8 && b[x][y] === 3 - p) { line.push([x, y]); x += di; y += dj; }
            if (line.length && x >= 0 && x < 8 && y >= 0 && y < 8 && b[x][y] === p) out.push(...line);
        }
        return out;
    }
    function rvMoves(b, p) { const m = []; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (rvFlips(b, i, j, p).length) m.push([i, j]); return m; }
    function rvHints(ctx, S, C, ox, oy) {
        ctx.fillStyle = 'rgba(255,213,107,.35)';
        rvMoves(S.b, 1).forEach(([i, j]) => { ctx.beginPath(); ctx.arc(ox + j * C + C / 2, oy + i * C + C / 2, 4, 0, 6.284); ctx.fill(); });
    }
    function rvAfter(S, api) {
        const c1 = S.b.flat().filter(v => v === 1).length, c2 = S.b.flat().filter(v => v === 2).length;
        if (!rvMoves(S.b, 1).length && !rvMoves(S.b, 2).length) {
            api.finish(c1 > c2 ? { win: true, stars: 3, lines: [`白 ${c1} : ${c2} 黑`] }
                : c1 === c2 ? { win: true, stars: 2, lines: [`平局 ${c1} : ${c2}`] }
                    : { win: false, stars: 0, lines: [`白 ${c1} : ${c2} 黑`] });
            return true;
        }
        return false;
    }
    function rvAI(S, mis) {
        const m = rvMoves(S.b, 2);
        if (!m.length) { S.turn = 1; S.msg = '电脑无子可下，你继续'; return; }
        let pick = null;
        if (Math.random() < mis) pick = m[ri(0, m.length - 1)];
        else {
            let best = -1e9;
            const W = [[0,0,3,2,2,2,3,0],[0,3,1,1,1,1,3,0],[3,1,2,2,2,2,1,3]];
            const wgt = (i, j) => (i === 0 || i === 7) && (j === 0 || j === 7) ? 12 : (i === 0 || i === 7 || j === 0 || j === 7) ? 3 : 1;
            for (const [i, j] of m) {
                const f = rvFlips(S.b, i, j, 2);
                let v = f.length + wgt(i, j) * 2;
                if (best < v) { best = v; pick = [i, j]; }
            }
        }
        S.b[pick[0]][pick[1]] = 2;
        rvFlips(S.b, pick[0], pick[1], 2).forEach(([a, b]) => S.b[a][b] = 2);
        S.turn = 1; S.msg = '你的回合（白）';
    }

    // ============ 4. 取石子（Bash 博弈）============
    E.def('nim', {
        levels: E.nm(),
        params: (i, t) => ({ n: 12 + i * 2, max: 3, mis: +(0.7 - 0.6 * t).toFixed(2) }),
        w: 360, h: 400,
        hint: '每次取 1-3 颗，拿到最后一颗者胜',
        init: P => ({ n: P.n, turn: 1, msg: '你先手，选 1/2/3', res: false }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#4a3a26', '#241a10');
            E.txt(ctx, `剩余 ${S.n} 颗`, W / 2, 40, 22, '#ffd56b', true);
            E.broom(ctx, 14, 62, W - 28, 156, { felt: '#33261a', frame: '#a9825a', frame2: '#6f4e2c', seed: 44, frameW: 12 });
            let x = 30, y = 96;
            for (let k = 0; k < Math.min(S.n, 60); k++) {
                E.piece(ctx, x, y, 10, '#d2b288', '#8a683c', 'rgba(60,40,18,0.6)');
                x += 26; if (x > W - 26) { x = 30; y += 27; }
            }
            for (let k = 1; k <= 3; k++) E.btnBox(ctx, 30 + (k - 1) * 105, H - 110, 90, 52, '取 ' + k, '#8a5a2f', '#5a3a1c');
            E.txt(ctx, S.msg, W / 2, H - 34, 16, '#f0e0c8');
        },
        tap(S, x, y, P, api) {
            if (S.res || S.turn !== 1) return;
            for (let k = 1; k <= 3; k++) {
                if (E.hit(x, y, 30 + (k - 1) * 105, 400 - 110, 90, 52) && S.n >= k) {
                    S.n -= k;
                    if (S.n === 0) { S.res = true; return api.finish({ win: true, stars: 3, lines: ['你拿到了最后一颗！'] }); }
                    S.turn = 2; S.msg = '电脑思考…';
                    setTimeout(() => {
                        let take = ((S.n - 1) % 4);
                        if (take === 0) take = 1;
                        if (Math.random() < P.mis) take = ri(1, Math.min(3, S.n));
                        take = Math.min(take, S.n);
                        S.n -= take;
                        if (S.n === 0) { S.res = true; api.finish({ win: false, stars: 0, lines: ['电脑拿到了最后一颗'] }); }
                        else { S.turn = 1; S.msg = `电脑取了 ${take} 颗`; }
                    }, 300);
                    return;
                }
            }
        },
    });

    // ============ 5. 海战棋 ============
    E.def('battleship', {
        levels: E.nm(),
        params: (i, t) => ({ n: Math.min(9, 5 + Math.floor(i / 4)), ships: [3, 2, 2, 1].slice(0, 2 + Math.floor(i / 7)), shots: Math.round((36 + i * 6) * 1.6) }),
        w: 392, h: 470,
        hint: '点击格子开炮，击沉全部敌舰即胜（炮数有限）',
        init: P => {
            const n = P.n, b = Array.from({ length: n }, () => Array(n).fill(0));
            (P.ships || [3, 2]).forEach(len => {
                for (let att = 0; att < 200; att++) {
                    const hor = Math.random() < 0.5;
                    const i = ri(0, n - (hor ? 1 : len)), j = ri(0, n - (hor ? len : 1));
                    let ok = true;
                    for (let k = 0; k < len; k++) { const a = hor ? i : i + k, c = hor ? j + k : j; if (b[a][c]) ok = false; }
                    if (!ok) continue;
                    for (let k = 0; k < len; k++) { const a = hor ? i : i + k, c = hor ? j + k : j; b[a][c] = 1; }
                    break;
                }
            });
            return { b, n, seen: Array.from({ length: n }, () => Array(n).fill(0)), shots: P.shots, hits: 0, total: b.flat().filter(v => v).length };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#0e2a4a', '#061626');
            const n = S.n, C = Math.min(38, (W - 20) / n), ox = (W - C * n) / 2, oy = 76;
            E.broom(ctx, ox, oy, C * n, C * n, { felt: '#0f3557', frame: '#7a8ca0', frame2: '#46586c', seed: 55, frameW: 11 });
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C, s = S.seen[i][j];
                if (!s) {
                    U.rr(ctx, x + 1, y + 1, C - 2, C - 2, 5);
                    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
                    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(160,210,255,0.16)'; ctx.stroke();
                }
                else if (s === 1) { U.rr(ctx, x + 1, y + 1, C - 2, C - 2, 5); ctx.fillStyle = 'rgba(0,10,25,0.55)'; ctx.fill(); U.emoji(ctx, '💧', x + C / 2, y + C / 2, C * 0.5); }
                else { U.rr(ctx, x + 1, y + 1, C - 2, C - 2, 5); ctx.fillStyle = 'rgba(140,25,20,0.75)'; ctx.fill(); U.emoji(ctx, '🔥', x + C / 2, y + C / 2, C * 0.55); }
            }
            E.txt(ctx, `剩余炮弹 ${S.shots} · 命中 ${S.hits}/${S.total}`, W / 2, 40, 18, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            const n = S.n, C = Math.min(38, (392 - 20) / n), ox = (392 - C * n) / 2, oy = 76;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i >= n || j < 0 || j >= n || S.seen[i][j]) return;
            S.seen[i][j] = S.b[i][j] ? 2 : 1;
            if (S.b[i][j]) S.hits++;
            S.shots--;
            if (S.hits >= S.total) return api.finish({ win: true, stars: S.shots > P.shots * 0.4 ? 3 : 2, lines: [`全部击沉！剩余炮弹 ${S.shots}`] });
            if (S.shots <= 0) return api.finish({ win: false, stars: 0, lines: [`炮弹用尽，命中 ${S.hits}/${S.total}`] });
        },
    });

    // ============ 6. 点格棋（占领方格）============
    E.def('dots', {
        levels: E.nm(),
        params: (i, t) => ({ n: Math.min(7, 3 + Math.floor(i / 4)), mis: +(0.8 - 0.65 * t).toFixed(2) }),
        w: 380, h: 470,
        hint: '点击两点之间连线，围成方格得分并可继续',
        init: P => {
            const n = P.n;
            return {
                n, h: Array.from({ length: n + 1 }, () => Array(n).fill(0)),
                v: Array.from({ length: n }, () => Array(n + 1).fill(0)),
                own: Array.from({ length: n }, () => Array(n).fill(0)), turn: 1,
            };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2b2545', '#151130');
            const n = S.n, C = Math.min(44, (W - 60) / n), ox = (W - C * n) / 2, oy = 80;
            E.broom(ctx, ox - 14, oy - 14, C * n + 28, C * n + 28, { felt: '#37305c', frame: '#8a7aa8', frame2: '#4e4070', seed: 77, frameW: 11, nail: false });
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                if (S.own[i][j]) {
                    E.card(ctx, ox + j * C + 4, oy + i * C + 4, C - 8, C - 8, S.own[i][j] === 1 ? '#3a7adf' : '#c85a4a', S.own[i][j] === 1 ? '#1f4a9a' : '#8a2f28', 6);
                    E.txt(ctx, S.own[i][j] === 1 ? '我' : '敌', ox + j * C + C / 2, oy + i * C + C / 2, C * 0.42, '#fff', true);
                }
            }
            for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
                ctx.beginPath(); ctx.arc(ox + j * C, oy + i * C, 4, 0, 6.284); ctx.fillStyle = '#ffd56b'; ctx.fill();
            }
            for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) {
                if (!S.h[i][j]) continue;
                ctx.strokeStyle = S.h[i][j] === 1 ? '#5cc7ff' : '#ff7a8b'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(ox + j * C, oy + i * C); ctx.lineTo(ox + (j + 1) * C, oy + i * C); ctx.stroke();
            }
            for (let i = 0; i < n; i++) for (let j = 0; j <= n; j++) {
                if (!S.v[i][j]) continue;
                ctx.strokeStyle = S.v[i][j] === 1 ? '#5cc7ff' : '#ff7a8b'; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(ox + j * C, oy + i * C); ctx.lineTo(ox + j * C, oy + (i + 1) * C); ctx.stroke();
            }
            const a = S.own.flat().filter(v => v === 1).length, b = S.own.flat().filter(v => v === 2).length;
            E.txt(ctx, `我 ${a} : ${b} 敌`, W / 2, 40, 18, '#ffd56b', true);
            E.txt(ctx, S.turn === 1 ? '你的回合' : '电脑回合', W / 2, H - 20, 14, '#c8c0e0');
        },
        tap(S, x, y, P, api) {
            if (S.turn !== 1) return;
            const n = S.n, C = Math.min(44, (380 - 60) / n), ox = (380 - C * n) / 2, oy = 80;
            let best = null, bd = 14;
            for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) {
                if (S.h[i][j]) continue;
                const my = oy + i * C, d = Math.abs(y - my);
                if (d < bd && x > ox + j * C - 6 && x < ox + (j + 1) * C + 6) { bd = d; best = ['h', i, j]; }
            }
            for (let i = 0; i < n; i++) for (let j = 0; j <= n; j++) {
                if (S.v[i][j]) continue;
                const mx = ox + j * C, d = Math.abs(x - mx);
                if (d < bd && y > oy + i * C - 6 && y < oy + (i + 1) * C + 6) { bd = d; best = ['v', i, j]; }
            }
            if (!best) return;
            if (best[0] === 'h') S.h[best[1]][best[2]] = 1; else S.v[best[1]][best[2]] = 1;
            if (!dtClose(S, 1)) S.turn = 2;
            dtAI(S, P.mis);
            dtCheck(S, api);
        },
    });
    function dtClose(S, p) {
        let got = false;
        for (let i = 0; i < S.n; i++) for (let j = 0; j < S.n; j++) {
            if (S.own[i][j]) continue;
            if (S.h[i][j] && S.h[i + 1][j] && S.v[i][j] && S.v[i][j + 1]) { S.own[i][j] = p; got = true; }
        }
        return got;
    }
    function dtAI(S, mis) {
        for (let g = 0; g < 4; g++) {
            const opts = [];
            for (let i = 0; i <= S.n; i++) for (let j = 0; j < S.n; j++) if (!S.h[i][j]) opts.push(['h', i, j]);
            for (let i = 0; i < S.n; i++) for (let j = 0; j <= S.n; j++) if (!S.v[i][j]) opts.push(['v', i, j]);
            if (!opts.length) break;
            let pick = null;
            if (Math.random() < mis) pick = opts[ri(0, opts.length - 1)];
            else {
                for (const o of opts) {
                    if (o[0] === 'h') { S.h[o[1]][o[2]] = 2; const c = dtClose(S, 2); S.h[o[1]][o[2]] = 0; if (c) { pick = o; break; } }
                    else { S.v[o[1]][o[2]] = 2; const c = dtClose(S, 2); S.v[o[1]][o[2]] = 0; if (c) { pick = o; break; } }
                }
                if (!pick) for (const o of opts) {
                    if (o[0] === 'h') { S.h[o[1]][o[2]] = 2; const c = dtClose(S, 1); S.h[o[1]][o[2]] = 0; if (c) continue; pick = pick || o; }
                }
                if (!pick) pick = opts[ri(0, opts.length - 1)];
            }
            if (pick[0] === 'h') S.h[pick[1]][pick[2]] = 2; else S.v[pick[1]][pick[2]] = 2;
            if (!dtClose(S, 2)) break;
        }
        S.turn = 1;
    }
    function dtCheck(S, api) {
        let full = true;
        for (let i = 0; i <= S.n; i++) for (let j = 0; j < S.n; j++) if (!S.h[i][j]) full = false;
        for (let i = 0; i < S.n; i++) for (let j = 0; j <= S.n; j++) if (!S.v[i][j]) full = false;
        if (!full) return;
        const a = S.own.flat().filter(v => v === 1).length, b = S.own.flat().filter(v => v === 2).length;
        api.finish(a > b ? { win: true, stars: 3, lines: [`我 ${a} : ${b} 敌`] }
            : a === b ? { win: true, stars: 2, lines: ['平局'] } : { win: false, stars: 0, lines: [`我 ${a} : ${b} 敌`] });
    }

    // ============ 7. 非洲棋（Mancala）============
    E.def('mancala', {
        levels: E.nm(),
        params: (i, t) => ({ seed: 3 + (i % 3), mis: +(0.8 - 0.65 * t).toFixed(2) }),
        w: 396, h: 420,
        hint: '点击自己下方的坑（0-5）播撒石子，最终入库多者胜',
        init: P => ({ p: [P.seed, P.seed, P.seed, P.seed, P.seed, P.seed, 0, P.seed, P.seed, P.seed, P.seed, P.seed, P.seed, 0], turn: 1, msg: '你的回合（下方 6 坑）' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#7a4a26', '#3a2010');
            E.broom(ctx, 62, 96, W - 124, 246, { felt: '#4a2c14', frame: '#c9955a', frame2: '#7a5228', seed: 66, frameW: 12, nail: false });
            // 两端仓库：凹坑质感
            const pit = (px, py, pw, ph) => {
                U.rr(ctx, px, py, pw, ph, 14);
                let pg = null;
                try { pg = ctx.createRadialGradient(px + pw / 2, py + ph / 2 - 8, 4, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.7); pg.addColorStop(0, '#1c0e04'); pg.addColorStop(1, '#4a2a10'); } catch (e) { }
                ctx.fillStyle = pg || '#2a1808'; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
                ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,220,170,0.15)'; ctx.stroke();
            };
            pit(6, 120, 56, 180);
            E.txt(ctx, S.p[6], 34, 210, 26, '#ffd56b', true);
            pit(W - 62, 120, 56, 180);
            E.txt(ctx, S.p[13], W - 34, 210, 26, '#ffd56b', true);
            for (let k = 0; k < 6; k++) {
                const x = 76 + k * 54;
                pit(x, 250, 46, 56);
                E.txt(ctx, S.p[k], x + 23, 278, 18, '#fff', true);
                E.txt(ctx, k, x + 23, 320, 12, '#d8c0a0');
            }
            for (let k = 0; k < 6; k++) {
                const x = 76 + (5 - k) * 54;
                pit(x, 120, 46, 56);
                E.txt(ctx, S.p[7 + k], x + 23, 148, 18, '#fff', true);
            }
            E.txt(ctx, S.msg, W / 2, 66, 17, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            if (S.turn !== 1) return;
            for (let k = 0; k < 6; k++) {
                if (E.hit(x, y, 76 + k * 54, 250, 46, 56) && S.p[k] > 0) {
                    const again = mcSow(S, k, 1);
                    if (mcOver(S)) return mcEnd(S, api);
                    if (!again) { S.turn = 2; S.msg = '电脑思考…'; setTimeout(() => { mcAI(S, P.mis); if (mcOver(S)) mcEnd(S, api); else S.msg = '你的回合'; }, 300); }
                    return;
                }
            }
        },
    });
    function mcSow(S, k, p) {
        let n = S.p[k]; S.p[k] = 0;
        let i = k;
        while (n > 0) {
            i = (i + 1) % 14;
            if (p === 1 && i === 13) continue;
            if (p === 2 && i === 6) continue;
            S.p[i]++; n--;
        }
        if (p === 1 && i >= 0 && i <= 5 && S.p[i] === 1) { S.p[6] += S.p[12 - i] || 0; S.p[6] += S.p[i]; S.p[12 - i] = 0; S.p[i] = 0; }
        if (p === 2 && i >= 7 && i <= 12 && S.p[i] === 1) { S.p[13] += S.p[12 - i] || 0; S.p[13] += S.p[i]; S.p[12 - i] = 0; S.p[i] = 0; }
        return (p === 1 && i === 6) || (p === 2 && i === 13);
    }
    function mcOver(S) { return S.p.slice(0, 6).every(v => !v) || S.p.slice(7, 13).every(v => !v); }
    function mcEnd(S, api) {
        S.p[6] += S.p.slice(0, 6).reduce((a, b) => a + b, 0);
        S.p[13] += S.p.slice(7, 13).reduce((a, b) => a + b, 0);
        for (let k = 0; k < 6; k++) { S.p[k] = 0; S.p[7 + k] = 0; }
        S.turn = 0;
        const a = S.p[6], b = S.p[13];
        api.finish(a > b ? { win: true, stars: 3, lines: [`你 ${a} : ${b} 电脑`] }
            : a === b ? { win: true, stars: 2, lines: ['平局'] } : { win: false, stars: 0, lines: [`你 ${a} : ${b} 电脑`] });
    }
    function mcAI(S, mis) {
        let again = true, guard = 0;
        while (again && guard++ < 20) {
            const opts = [];
            for (let k = 7; k <= 12; k++) if (S.p[k]) opts.push(k);
            if (!opts.length) break;
            let pick = null;
            if (Math.random() < mis) pick = opts[ri(0, opts.length - 1)];
            else {
                for (const k of opts) { if (k + S.p[k] === 13 || ((k + S.p[k]) % 14) === 13) { pick = k; break; } }
                if (pick == null) { let best = -1; for (const k of opts) if (S.p[k] > best) { best = S.p[k]; pick = k; } }
            }
            again = mcSow(S, pick, 2);
            if (mcOver(S)) break;
        }
        S.turn = 1;
    }

    // ============ 8. N 皇后 ============
    E.def('queens', {
        levels: E.nm(),
        params: (i) => ({ n: 5 + Math.min(3, Math.floor(i / 6)) }),
        w: 380, h: 470,
        hint: '在棋盘上放 N 个皇后，使它们互不攻击（点已放的皇后可撤销）',
        init: P => ({ n: P.n, q: Array.from({ length: P.n }, () => Array(P.n).fill(0)), moves: 0 }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f52', '#1c1630');
            const n = S.n, C = Math.min(52, (W - 40) / n), ox = (W - C * n) / 2, oy = 84;
            E.broom(ctx, ox - 10, oy - 10, C * n + 20, C * n + 20, { felt: '#453868', frame: '#9a7ab8', frame2: '#573f78', seed: 88, frameW: 10, nail: false });
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C;
                ctx.fillStyle = (i + j) % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.05)';
                ctx.fillRect(x + 1, y + 1, C - 2, C - 2);
                if (S.q[i][j]) {
                    ctx.beginPath(); ctx.arc(x + C / 2, y + C / 2, C * 0.42, 0, 6.284);
                    ctx.fillStyle = 'rgba(255,213,107,0.14)'; ctx.fill();
                    U.emoji(ctx, '♛', x + C / 2, y + C / 2 + 1, C * 0.6);
                }
            }
            const cnt = S.q.flat().filter(v => v).length;
            E.txt(ctx, `已放置 ${cnt}/${n} 个皇后`, W / 2, 44, 18, '#ffd56b', true);
            E.txt(ctx, qqBad(S) ? '⚠ 有皇后互相攻击' : (cnt === n ? '✅ 全部安全！' : '继续放置'), W / 2, H - 24, 15, cnt === n && !qqBad(S) ? '#7adf7a' : '#d8c8f0');
        },
        tap(S, x, y, P, api) {
            const n = S.n, C = Math.min(52, (380 - 40) / n), ox = (380 - C * n) / 2, oy = 84;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i >= n || j < 0 || j >= n) return;
            S.q[i][j] = S.q[i][j] ? 0 : 1; S.moves++;
            const cnt = S.q.flat().filter(v => v).length;
            if (cnt === n && !qqBad(S)) api.finish({ win: true, stars: S.moves <= n + 4 ? 3 : 2, lines: [`${n} 皇后全部安全！用了 ${S.moves} 次点击`] });
        },
    });
    function qqBad(S) {
        const n = S.n, ps = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (S.q[i][j]) ps.push([i, j]);
        for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
            if (ps[a][0] === ps[b][0] || ps[a][1] === ps[b][1] || Math.abs(ps[a][0] - ps[b][0]) === Math.abs(ps[a][1] - ps[b][1])) return true;
        }
        return false;
    }

    // ============ 9. 孔明棋（独立钻石）============
    E.def('peg', {
        levels: E.nm(),
        params: (i, t) => ({ goal: Math.max(1, 8 - Math.floor(i / 3)) }),
        w: 380, h: 470,
        hint: '点击棋子跳过相邻棋子吃子（被跳过的棋子消失），剩得越少越好',
        init: P => {
            const b = Array.from({ length: 7 }, () => Array(7).fill(-1));
            for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
                if ((i < 2 || i > 4) && (j < 2 || j > 4)) continue;
                b[i][j] = 1;
            }
            b[3][3] = 0;
            return { b, sel: null, goal: P.goal };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#4a3a26', '#241a10');
            const C = 50, ox = (W - C * 7) / 2, oy = 70;
            E.broom(ctx, ox - 8, oy - 8, C * 7 + 16, C * 7 + 16, { felt: '#3d2d1a', frame: '#b0885a', frame2: '#6f4e2c', seed: 99, frameW: 12 });
            for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
                if (S.b[i][j] < 0) continue;
                const x = ox + j * C + C / 2, y = oy + i * C + C / 2;
                // 凹坑（所有有效格都画，空位显示坑）
                ctx.beginPath(); ctx.arc(x, y + 2, 15, 0, 6.284);
                let hg = null;
                try { hg = ctx.createRadialGradient(x, y - 4, 3, x, y + 2, 15); hg.addColorStop(0, '#140c04'); hg.addColorStop(1, '#3a2a16'); } catch (e) { }
                ctx.fillStyle = hg || '#241808'; ctx.fill();
                ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
                if (S.b[i][j]) E.piece(ctx, x, y, 16, '#f0e0b0', '#a8813f', 'rgba(90,60,20,0.7)');
                if (S.sel && S.sel[0] === i && S.sel[1] === j) {
                    ctx.beginPath(); ctx.arc(x, y, 21, 0, 6.284); ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.stroke();
                }
            }
            const left = S.b.flat().filter(v => v === 1).length;
            E.txt(ctx, `剩余 ${left} 颗 · 目标 ≤${S.goal}`, W / 2, 42, 18, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            const C = 50, ox = (380 - C * 7) / 2, oy = 70;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i > 6 || j < 0 || j > 6 || S.b[i][j] < 0) return;
            if (S.sel) {
                const [si, sj] = S.sel;
                const di = i - si, dj = j - sj;
                if (Math.abs(di) + Math.abs(dj) === 0) { S.sel = null; return; }
                if ((Math.abs(di) === 2 && dj === 0) || (Math.abs(dj) === 2 && di === 0)) {
                    const mi = si + di / 2, mj = sj + dj / 2;
                    if (S.b[i][j] === 0 && S.b[mi][mj] === 1) {
                        S.b[si][sj] = 0; S.b[mi][mj] = 0; S.b[i][j] = 1; S.sel = null;
                        const left = S.b.flat().filter(v => v === 1).length;
                        if (left <= S.goal) return api.finish({ win: true, stars: left <= 1 ? 3 : left <= 2 ? 3 : 2, lines: [`剩余 ${left} 颗，目标达成！`] });
                        if (!pgMove(S)) api.finish({ win: false, stars: Math.max(1, 3 - Math.floor((left - S.goal) / 3)), lines: [`无子可动，剩余 ${left} 颗`] });
                        return;
                    }
                }
                S.sel = S.b[i][j] ? [i, j] : null; return;
            }
            if (S.b[i][j]) S.sel = [i, j];
        },
    });
    function pgMove(S) {
        for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
            if (S.b[i][j] !== 1) continue;
            for (const [di, dj] of [[0,2],[0,-2],[2,0],[-2,0]]) {
                const a = i + di, b2 = j + dj, mi = i + di / 2, mj = j + dj / 2;
                if (a >= 0 && a < 7 && b2 >= 0 && b2 < 7 && S.b[a][b2] === 0 && S.b[mi][mj] === 1) return true;
            }
        }
        return false;
    }

    // ============ 10. 突破棋（Breakthrough）============
    E.def('breakthru', {
        levels: E.nm(),
        params: (i, t) => ({ n: 5 + Math.min(3, Math.floor(i / 7)), mis: +(0.8 - 0.65 * t).toFixed(2) }),
        w: 380, h: 470,
        hint: '蓝兵向上走，斜吃敌兵，先走到对方底线即胜',
        init: P => {
            const n = P.n, b = Array.from({ length: n }, () => Array(n).fill(0));
            for (let j = 0; j < n; j++) { b[0][j] = 2; b[1][j] = 2; b[n - 1][j] = 1; b[n - 2][j] = 1; }
            return { b, n, sel: null, turn: 1 };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f3a52', '#161e30');
            const n = S.n, C = Math.min(60, (W - 30) / n), ox = (W - C * n) / 2, oy = 76;
            E.broom(ctx, ox - 10, oy - 10, C * n + 20, C * n + 20, { felt: '#3c4a68', frame: '#8a94ac', frame2: '#4e5870', seed: 111, frameW: 10, nail: false });
            // 双方底线标记（蓝方目标在上、红方目标在下）
            ctx.fillStyle = 'rgba(110,190,255,0.10)'; ctx.fillRect(ox, oy, C * n, C);
            ctx.fillStyle = 'rgba(255,110,120,0.10)'; ctx.fillRect(ox, oy + C * (n - 1), C * n, C);
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C;
                ctx.fillStyle = (i + j) % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.035)';
                ctx.fillRect(x + 1, y + 1, C - 2, C - 2);
                if (S.sel && S.sel[0] === i && S.sel[1] === j) { ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, C - 4, C - 4); }
                if (!S.b[i][j]) continue;
                E.piece(ctx, x + C / 2, y + C / 2, C * 0.32, S.b[i][j] === 1 ? '#5cb8ff' : '#ff7a86', S.b[i][j] === 1 ? '#1a5a9a' : '#a02030');
            }
            E.txt(ctx, S.turn === 1 ? '你的回合（蓝）' : '电脑思考…', W / 2, 42, 18, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            if (S.turn !== 1) return;
            const n = S.n, C = Math.min(60, (380 - 30) / n), ox = (380 - C * n) / 2, oy = 76;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i >= n || j < 0 || j >= n) return;
            if (S.sel) {
                const [si, sj] = S.sel;
                if (btCan(S, si, sj, i, j, 1)) {
                    S.b[i][j] = 1; S.b[si][sj] = 0; S.sel = null;
                    if (i === 0) return api.finish({ win: true, stars: 3, lines: ['蓝兵突破成功！'] });
                    if (!S.b.flat().includes(2)) return api.finish({ win: true, stars: 3, lines: ['吃光了所有敌兵！'] });
                    S.turn = 2;
                    setTimeout(() => {
                        btAI(S, P.mis);
                        if (S.b[0].every(v => v !== 2) || !S.b.flat().includes(1)) api.finish({ win: false, stars: 0, lines: ['电脑突破或被吃光'] });
                        else S.turn = 1;
                    }, 260);
                } else S.sel = S.b[i][j] === 1 ? [i, j] : null;
                return;
            }
            if (S.b[i][j] === 1) S.sel = [i, j];
        },
    });
    function btCan(S, si, sj, i, j, p) {
        if (S.b[i][j] === p) return false;
        const d = p === 1 ? -1 : 1;
        if (j === sj && i === si + d && !S.b[i][j]) return true;
        if (Math.abs(j - sj) === 1 && i === si + d && S.b[i][j] === 3 - p) return true;
        return false;
    }
    function btAI(S, mis) {
        const n = S.n, opts = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            if (S.b[i][j] !== 2) continue;
            for (const [a, b] of [[i + 1, j], [i + 1, j - 1], [i + 1, j + 1]]) {
                if (a >= 0 && a < n && b >= 0 && b < n && btCan(S, i, j, a, b, 2)) opts.push([i, j, a, b]);
            }
        }
        if (!opts.length) return;
        let pick = null;
        if (Math.random() < mis) pick = opts[ri(0, opts.length - 1)];
        else {
            for (const o of opts) if (o[2] === n - 1) { pick = o; break; }
            if (!pick) for (const o of opts) if (S.b[o[2]][o[3]] === 1) { pick = o; break; }
            if (!pick) pick = opts[ri(0, opts.length - 1)];
        }
        S.b[pick[2]][pick[3]] = 2; S.b[pick[0]][pick[1]] = 0;
    }
})();
