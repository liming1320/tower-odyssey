// 解谜 10 款：迷宫 · 点灯 · 洪水填充 · 接水管 · 数织 · 九宫数独 · 数字连线 · 推箱子 · 方块填充 · 色码破译
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

    // ============ 1. 迷宫 ============
    E.def('maze', {
        levels: E.nm(),
        params: (i, t) => ({ n: 7 + Math.floor(i / 2) }),
        w: 380, h: 470,
        hint: '点击方向按钮或按方向键走出迷宫，到达 🏁 即胜',
        init: P => {
            const n = P.n, cells = [];
            for (let i = 0; i < n; i++) { cells.push([]); for (let j = 0; j < n; j++) cells[i].push({ r: true, d: true, v: false }); }
            const st = [[0, 0]]; cells[0][0].v = true;
            while (st.length) {
                const [i, j] = st[st.length - 1];
                const nb = [];
                if (i > 0 && !cells[i - 1][j].v) nb.push([i - 1, j, 'u']);
                if (j > 0 && !cells[i][j - 1].v) nb.push([i, j - 1, 'l']);
                if (i < n - 1 && !cells[i + 1][j].v) nb.push([i + 1, j, 'd']);
                if (j < n - 1 && !cells[i][j + 1].v) nb.push([i, j + 1, 'r']);
                if (!nb.length) { st.pop(); continue; }
                const [a, b2, d] = nb[ri(0, nb.length - 1)];
                if (d === 'u') cells[i - 1][j].d = false;
                if (d === 'l') cells[i][j - 1].r = false;
                if (d === 'd') cells[i][j].d = false;
                if (d === 'r') cells[i][j].r = false;
                cells[a][b2].v = true; st.push([a, b2]);
            }
            return { n, cells, p: [0, 0], steps: 0 };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f3a52', '#141c2c');
            const n = S.n, C = Math.min(38, (W - 30) / n), ox = (W - C * n) / 2, oy = 70;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C, c = S.cells[i][j];
                ctx.fillStyle = '#1e2a40'; ctx.fillRect(x, y, C, C);
                ctx.strokeStyle = '#8aa8d8'; ctx.lineWidth = 2;
                ctx.beginPath();
                if (c.r) { ctx.moveTo(x + C, y); ctx.lineTo(x + C, y + C); }
                if (c.d) { ctx.moveTo(x, y + C); ctx.lineTo(x + C, y + C); }
                ctx.stroke();
            }
            ctx.strokeStyle = '#8aa8d8'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, C * n, C * n);
            U.emoji(ctx, '🏁', ox + (n - 1) * C + C / 2, oy + (n - 1) * C + C / 2, C * 0.6);
            U.emoji(ctx, '🏃', ox + S.p[1] * C + C / 2, oy + S.p[0] * C + C / 2, C * 0.6);
            E.txt(ctx, `步数 ${S.steps}`, W / 2, 36, 17, '#ffd56b', true);
            for (const [k, d, dx, dy] of [['↑', 'u', 1, 0], ['↓', 'd', 1, 2], ['←', 'l', 0, 1], ['→', 'r', 2, 1]]) {
                E.btnBox(ctx, 60 + dx * 90, H - 150 + dy * 0, 70, 52, k, '#4a5a8f', '#2a3a5f');
            }
            E.btnBox(ctx, 60 + 90, H - 84, 70, 52, '↓', '#4a5a8f', '#2a3a5f');
        },
        key(S, k, P, api) {
            const map = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r' };
            if (map[k]) mzMove(S, map[k], api);
        },
        tap(S, x, y, P, api) {
            const H = 470;
            if (E.hit(x, y, 150, H - 150, 70, 52)) return mzMove(S, 'u', api);
            if (E.hit(x, y, 150, H - 84, 70, 52)) return mzMove(S, 'd', api);
            if (E.hit(x, y, 60, H - 150, 70, 52)) return mzMove(S, 'l', api);
            if (E.hit(x, y, 240, H - 150, 70, 52)) return mzMove(S, 'r', api);
        },
    });
    function mzMove(S, d, api) {
        const [i, j] = S.p, c = S.cells[i][j];
        if (d === 'u' && i > 0 && !S.cells[i - 1][j].d) S.p = [i - 1, j];
        else if (d === 'd' && !c.d) S.p = [i + 1, j];
        else if (d === 'l' && j > 0 && !S.cells[i][j - 1].r) S.p = [i, j - 1];
        else if (d === 'r' && !c.r) S.p = [i, j + 1];
        else return;
        S.steps++;
        if (S.p[0] === S.n - 1 && S.p[1] === S.n - 1) api.finish({ win: true, stars: S.steps <= S.n * 3 ? 3 : 2, lines: [`${S.steps} 步走出迷宫`] });
    }

    // ============ 2. 点灯 ============
    E.def('lightsout', {
        levels: E.nm(),
        params: (i, t) => ({ n: Math.min(7, 3 + Math.floor(i / 5)) }),
        w: 380, h: 470,
        hint: '点击格子会翻转它和上下左右，把全部灯熄灭即胜',
        init: P => {
            const n = P.n, b = Array.from({ length: n }, () => Array(n).fill(0));
            const times = Math.max(2, Math.round(n * 1.2));
            for (let k = 0; k < times; k++) loToggle(b, ri(0, n - 1), ri(0, n - 1), n);
            if (b.flat().every(v => !v)) loToggle(b, 0, 0, n);
            return { n, b, moves: 0 };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#262038', '#12101e');
            const n = S.n, C = Math.min(58, (W - 40) / n), ox = (W - C * n) / 2, oy = 90;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C;
                if (S.b[i][j]) { E.card(ctx, x + 3, y + 3, C - 6, C - 6, '#ffe08a', '#e0a020', 10); U.emoji(ctx, '💡', x + C / 2, y + C / 2, C * 0.5); }
                else E.card(ctx, x + 3, y + 3, C - 6, C - 6, '#3a3452', '#262038', 10);
            }
            E.txt(ctx, `步数 ${S.moves} · 全部熄灭即胜`, W / 2, 44, 17, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            const n = S.n, C = Math.min(58, (380 - 40) / n), ox = (380 - C * n) / 2, oy = 90;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i >= n || j < 0 || j >= n) return;
            loToggle(S.b, i, j, n); S.moves++;
            if (S.b.flat().every(v => !v)) api.finish({ win: true, stars: S.moves <= n * n ? 3 : 2, lines: [`${S.moves} 步全部熄灭`] });
        },
    });
    function loToggle(b, i, j, n) {
        const t = [[i, j], [i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
        t.forEach(([a, c]) => { if (a >= 0 && a < n && c >= 0 && c < n) b[a][c] = b[a][c] ? 0 : 1; });
    }

    // ============ 3. 洪水填充 ============
    const FLC = ['#ff6b7f', '#ffd56b', '#5cd65c', '#5cc7ff', '#b78bff', '#ff9d5c'];
    E.def('floodit', {
        levels: E.nm(),
        params: (i, t) => ({ n: Math.min(11, 5 + Math.floor(i / 3)), c: Math.min(6, 3 + Math.floor(i / 5)) }),
        w: 380, h: 470,
        hint: '点击下方颜色，从左上角开始「洪水」同化，用最少步数让全盘同色',
        init: P => {
            const n = P.n, b = [];
            for (let i = 0; i < n; i++) { b.push([]); for (let j = 0; j < n; j++) b[i].push(ri(0, P.c - 1)); }
            b[0][0] = ri(0, P.c - 1);
            return { n, b, col: P.c, moves: 0, max: Math.round(n * 1.9) };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2a2438', '#15121e');
            const n = S.n, C = Math.min(40, (W - 30) / n), ox = (W - C * n) / 2, oy = 66;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                ctx.fillStyle = FLC[S.b[i][j]]; ctx.fillRect(ox + j * C + 1, oy + i * C + 1, C - 2, C - 2);
            }
            E.txt(ctx, `步数 ${S.moves}/${S.max}`, W / 2, 36, 17, '#ffd56b', true);
            for (let k = 0; k < S.col; k++) {
                const bw = Math.min(52, (W - 20) / S.col);
                ctx.fillStyle = FLC[k];
                U.rr(ctx, 10 + k * bw + 3, H - 78, bw - 6, 54, 8); ctx.fill();
            }
        },
        tap(S, x, y, P, api) {
            const H = 470, bw = Math.min(52, (380 - 20) / S.col);
            for (let k = 0; k < S.col; k++) {
                if (!E.hit(x, y, 10 + k * bw + 3, H - 78, bw - 6, 54)) continue;
                if (k === S.b[0][0]) continue;
                const old = S.b[0][0];
                const seen = Array.from({ length: S.n }, () => Array(S.n).fill(false));
                const st = [[0, 0]];
                seen[0][0] = true;
                while (st.length) {
                    const [i, j] = st.pop(); S.b[i][j] = k;
                    for (const [a, c] of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]]) {
                        if (a >= 0 && a < S.n && c >= 0 && c < S.n && !seen[a][c] && S.b[a][c] === old) { seen[a][c] = true; st.push([a, c]); }
                    }
                }
                S.moves++;
                let uni = true;
                for (let i = 0; i < S.n; i++) for (let j = 0; j < S.n; j++) if (S.b[i][j] !== S.b[0][0]) uni = false;
                if (uni) return api.finish({ win: true, stars: S.moves <= S.max * 0.7 ? 3 : 2, lines: [`${S.moves} 步完成`] });
                if (S.moves >= S.max) return api.finish({ win: false, stars: 0, lines: [`步数用尽（${S.max}）`] });
                return;
            }
        },
    });

    // ============ 4. 接水管 ============
    E.def('pipes', {
        levels: E.nm(),
        params: (i, t) => ({ n: Math.min(7, 4 + Math.floor(i / 4)) }),
        w: 380, h: 470,
        hint: '点击管道旋转，把左上角的水引到右下角出口',
        init: P => {
            const n = P.n, type = Array.from({ length: n }, () => Array(n).fill(0));
            const rot = Array.from({ length: n }, () => Array(n).fill(0));
            // 生成一条从 (0,0) 到 (n-1,n-1) 的路径
            const path = [[0, 0]], vis = Array.from({ length: n }, () => Array(n).fill(false));
            vis[0][0] = true;
            let ci = 0, cj = 0, guard = 0;
            while ((ci !== n - 1 || cj !== n - 1) && guard++ < 500) {
                const opts = [];
                if (ci + 1 < n && !vis[ci + 1][cj]) opts.push([ci + 1, cj]);
                if (cj + 1 < n && !vis[ci][cj + 1]) opts.push([ci, cj + 1]);
                if (!opts.length) break;
                const [a, b] = opts[ri(0, opts.length - 1)];
                vis[a][b] = true; path.push([a, b]); ci = a; cj = b;
            }
            const need = {};
            for (let k = 0; k < path.length; k++) {
                const [i, j] = path[k];
                const dirs = [];
                if (k > 0) { const p = path[k - 1]; dirs.push(p[0] < i ? 'U' : p[1] < j ? 'L' : p[1] > j ? 'R' : 'D'); }
                if (k < path.length - 1) { const p = path[k + 1]; dirs.push(p[0] > i ? 'D' : p[0] < i ? 'U' : p[1] > j ? 'R' : 'L'); }
                need[i + ',' + j] = dirs;
            }
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const d = need[i + ',' + j];
                if (!d) { type[i][j] = 1; rot[i][j] = ri(0, 3); continue; }
                const set = new Set(d);
                if (set.size === 1) { type[i][j] = 3; rot[i][j] = 0; }
                else if (set.has('U') && set.has('D')) { type[i][j] = 1; rot[i][j] = 0; }
                else if (set.has('L') && set.has('R')) { type[i][j] = 1; rot[i][j] = 1; }
                else { type[i][j] = 2; rot[i][j] = 0; }
                // 记录正确朝向
                type[i][j] = type[i][j];
                S_need(i, j, set);
            }
            // 打乱朝向
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) rot[i][j] = (rot[i][j] + ri(1, 3)) % 4;
            return { n, type, rot, moves: 0, sol: S_SOL };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#1e2a3a', '#0e1622');
            const n = S.n, C = Math.min(60, (W - 30) / n), ox = (W - C * n) / 2, oy = 80;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C;
                E.card(ctx, x + 1, y + 1, C - 2, C - 2, '#2e4a66', '#1c3048', 5);
                ppPipe(ctx, x + C / 2, y + C / 2, C, S.type[i][j], S.rot[i][j], i === 0 && j === 0, i === n - 1 && j === n - 1);
            }
            E.txt(ctx, `旋转 ${S.moves} 次`, W / 2, 40, 17, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            const n = S.n, C = Math.min(60, (380 - 30) / n), ox = (380 - C * n) / 2, oy = 80;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i >= n || j < 0 || j >= n) return;
            S.rot[i][j] = (S.rot[i][j] + 1) % 4; S.moves++;
            if (ppConnected(S)) api.finish({ win: true, stars: S.moves <= n * n ? 3 : 2, lines: [`${S.moves} 次旋转接通`] });
        },
    });
    let S_SOL = null, S_need = () => {};
    function ppPipe(ctx, cx, cy, C, t, r, isS, isE) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(r * Math.PI / 2);
        ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = C * 0.16; ctx.lineCap = 'round';
        const L = C / 2;
        if (t === 1) { ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke(); }
        else if (t === 2) { ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.lineTo(0, L); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.moveTo(0, 0); ctx.lineTo(0, L); ctx.stroke(); }
        ctx.restore();
        if (isS) U.emoji(ctx, '💧', cx, cy, C * 0.4);
        if (isE) U.emoji(ctx, '🚰', cx, cy, C * 0.4);
    }
    function ppConnected(S) {
        const n = S.n;
        const dirs = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
        const open = (i, j, d) => {
            const t = S.type[i][j], r = S.rot[i][j];
            const base = t === 1 ? ['L', 'R'] : t === 2 ? ['L', 'D'] : ['L', 'R', 'D'];
            const rotMap = { U: 'R', R: 'D', D: 'L', L: 'U' };
            let set = base.slice();
            for (let k = 0; k < r; k++) set = set.map(x => rotMap[x]);
            return set.includes(d);
        };
        const seen = Array.from({ length: n }, () => Array(n).fill(false));
        const st = [[0, 0]]; seen[0][0] = true;
        while (st.length) {
            const [i, j] = st.pop();
            if (i === n - 1 && j === n - 1) return true;
            for (const d in dirs) {
                const [di, dj] = dirs[d]; const a = i + di, c = j + dj;
                if (a < 0 || a >= n || c < 0 || c >= n || seen[a][c]) continue;
                const opp = { U: 'D', D: 'U', L: 'R', R: 'L' }[d];
                if (open(i, j, d) && open(a, c, opp)) { seen[a][c] = true; st.push([a, c]); }
            }
        }
        return false;
    }

    // ============ 5. 数织（Nonogram）============
    E.def('nonogram', {
        levels: E.nm(),
        params: (i, t) => ({ n: Math.min(7, 4 + Math.floor(i / 5)) }),
        w: 390, h: 470,
        hint: '根据行列提示点亮格子，还原隐藏图案（点错会标红）',
        init: P => {
            const n = P.n, sol = [];
            for (let i = 0; i < n; i++) { sol.push([]); for (let j = 0; j < n; j++) sol[i].push(Math.random() < 0.55 ? 1 : 0); }
            const rows = sol.map(r => nnClue(r)), cols = [];
            for (let j = 0; j < n; j++) cols.push(nnClue(sol.map(r => r[j])));
            return { n, sol, rows, cols, b: Array.from({ length: n }, () => Array(n).fill(0)) };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2a2438', '#15121e');
            const n = S.n, C = Math.min(42, (W - 90) / n), ox = 84, oy = 84;
            S.rows.forEach((cl, i) => {
                E.txt(ctx, cl.join(' ') || '0', ox - 8, oy + i * C + C / 2, 13, '#ffd56b');
            });
            S.cols.forEach((cl, j) => {
                cl.forEach((v, k) => E.txt(ctx, v, ox + j * C + C / 2, oy - 10 - (cl.length - 1 - k) * 13, 12, '#ffd56b'));
            });
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C;
                if (S.b[i][j] === 1) { ctx.fillStyle = '#5cc7ff'; ctx.fillRect(x + 1, y + 1, C - 2, C - 2); }
                else if (S.b[i][j] === 2) { ctx.fillStyle = '#7a3040'; ctx.fillRect(x + 1, y + 1, C - 2, C - 2); E.txt(ctx, '✕', x + C / 2, y + C / 2, C * 0.4, '#ff9aa8', true); }
                else { ctx.fillStyle = '#38304f'; ctx.fillRect(x + 1, y + 1, C - 2, C - 2); }
            }
            E.txt(ctx, '左键点亮 / 右键（或再点两次）标 ✕', W / 2, H - 20, 13, '#c8c0e0');
        },
        tap(S, x, y, P, api) {
            const n = S.n, C = Math.min(42, (390 - 90) / n), ox = 84, oy = 84;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i >= n || j < 0 || j >= n) return;
            S.b[i][j] = (S.b[i][j] + 1) % 3;
            let ok = true, done = true;
            for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) {
                const want = S.sol[a][c], got = S.b[a][c];
                if (got === 1 && !want) ok = false;
                if (got === 2 && want) ok = false;
                if (want && got !== 1) done = false;
            }
            if (done && ok) api.finish({ win: true, stars: 3, lines: ['图案还原成功！'] });
        },
    });
    function nnClue(arr) {
        const out = []; let c = 0;
        arr.forEach(v => { if (v) c++; else if (c) { out.push(c); c = 0; } });
        if (c) out.push(c);
        return out.length ? out : [0];
    }

    // ============ 6. 九宫数独 ============
    E.def('sudoku9', {
        levels: E.nm(),
        params: (i, t) => ({ holes: 30 + Math.floor(i * 0.8) }),
        w: 396, h: 480,
        hint: '点击空格后按数字键 1-9 填入（再点一次清除）',
        init: P => {
            const b = Array.from({ length: 9 }, () => Array(9).fill(0));
            sdFill(b, 0);
            const sol = b.map(r => r.slice());
            const init = b.map(r => r.slice());
            let removed = 0, guard = 0, miss = 0;
            while (removed < P.holes && guard++ < 900 && miss < 200) {
                const i = ri(0, 8), j = ri(0, 8);
                if (!init[i][j]) continue;
                const backup = init[i][j]; init[i][j] = 0;
                if (sdCount(init) !== 1) { init[i][j] = backup; miss++; } else { removed++; miss = 0; }
            }
            return { b: init.map(r => r.slice()), sol, init, sel: null };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#22304a', '#0e1626');
            const C = 38, ox = (W - C * 9) / 2, oy = 60;
            for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
                const x = ox + j * C, y = oy + i * C;
                const fixed = S.init[i][j];
                if (S.sel && S.sel[0] === i && S.sel[1] === j) { ctx.fillStyle = 'rgba(255,213,107,.35)'; ctx.fillRect(x, y, C, C); }
                else if (!fixed) { ctx.fillStyle = '#2c3d5a'; ctx.fillRect(x + 1, y + 1, C - 2, C - 2); }
                else { ctx.fillStyle = '#1c2942'; ctx.fillRect(x + 1, y + 1, C - 2, C - 2); }
                const v = S.b[i][j];
                if (v) E.txt(ctx, v, x + C / 2, y + C / 2, 20, fixed ? '#dfe8f8' : '#ffd56b', true);
            }
            ctx.strokeStyle = '#7fa0d8'; ctx.lineWidth = 1;
            for (let k = 0; k <= 9; k++) {
                ctx.beginPath(); ctx.moveTo(ox, oy + k * C); ctx.lineTo(ox + 9 * C, oy + k * C);
                ctx.moveTo(ox + k * C, oy); ctx.lineTo(ox + k * C, oy + 9 * C); ctx.stroke();
            }
            ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 2.5;
            for (let k = 0; k <= 9; k += 3) {
                ctx.beginPath(); ctx.moveTo(ox, oy + k * C); ctx.lineTo(ox + 9 * C, oy + k * C);
                ctx.moveTo(ox + k * C, oy); ctx.lineTo(ox + k * C, oy + 9 * C); ctx.stroke();
            }
            E.txt(ctx, '点空格后按 1-9 填数', W / 2, 30, 15, '#cfe0f8');
        },
        tap(S, x, y, P, api) {
            const C = 38, ox = (396 - C * 9) / 2, oy = 60;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i > 8 || j < 0 || j > 8) return;
            if (S.init[i][j]) { S.sel = null; return; }
            if (S.sel && S.sel[0] === i && S.sel[1] === j) { S.b[i][j] = 0; S.sel = null; return; }
            S.sel = [i, j];
        },
        key(S, k, P, api) {
            if (!S.sel || !/^[1-9]$/.test(k)) return;
            const [i, j] = S.sel;
            S.b[i][j] = +k;
            let full = true;
            for (let a = 0; a < 9; a++) for (let c = 0; c < 9; c++) if (!S.b[a][c]) full = false;
            if (full && sdValid(S.b)) api.finish({ win: true, stars: 3, lines: ['数独完成！'] });
        },
    });
    function sdValid(b) {
        for (let i = 0; i < 9; i++) {
            const r = new Set(b[i]), c = new Set(b.map(x => x[i]));
            if (r.size !== 9 || c.size !== 9) return false;
        }
        for (let bi = 0; bi < 9; bi += 3) for (let bj = 0; bj < 9; bj += 3) {
            const s = new Set();
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s.add(b[bi + i][bj + j]);
            if (s.size !== 9) return false;
        }
        return true;
    }
    function sdFill(b, pos) {
        if (pos === 81) return true;
        const i = (pos / 9) | 0, j = pos % 9;
        const nums = MG.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const v of nums) {
            let ok = true;
            for (let k = 0; k < 9; k++) if (b[i][k] === v || b[k][j] === v) ok = false;
            const bi = i - i % 3, bj = j - j % 3;
            for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) if (b[bi + a][bj + c] === v) ok = false;
            if (!ok) continue;
            b[i][j] = v;
            if (sdFill(b, pos + 1)) return true;
            b[i][j] = 0;
        }
        return false;
    }
    function sdCount(b) {
        let n = 0;
        const rec = pos => {
            if (n > 1) return;
            if (pos === 81) { n++; return; }
            const i = (pos / 9) | 0, j = pos % 9;
            if (b[i][j]) return rec(pos + 1);
            for (let v = 1; v <= 9; v++) {
                let ok = true;
                for (let k = 0; k < 9; k++) if (b[i][k] === v || b[k][j] === v) ok = false;
                const bi = i - i % 3, bj = j - j % 3;
                for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) if (b[bi + a][bj + c] === v) ok = false;
                if (!ok) continue;
                b[i][j] = v; rec(pos + 1); b[i][j] = 0;
                if (n > 1) return;
            }
        };
        rec(0);
        return n;
    }

    // ============ 7. 数字连线（按序点亮）============
    E.def('numberpath', {
        levels: E.nm(),
        params: (i, t) => ({ n: Math.min(9, 4 + Math.floor(i / 4)), len: 6 + i }),
        w: 380, h: 470,
        hint: '从 1 开始按顺序点击相邻的数字（含斜向），连完即胜',
        init: P => {
            const n = P.n, len = Math.min(P.len, n * n);
            const grid = Array.from({ length: n }, () => Array(n).fill(0));
            let ci = ri(0, n - 1), cj = ri(0, n - 1), used = new Set([ci + ',' + cj]);
            let v = 1; grid[ci][cj] = v++;
            let guard = 0;
            while (v <= len && guard++ < 500) {
                const opts = [];
                for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
                    const a = ci + di, c = cj + dj;
                    if (a < 0 || a >= n || c < 0 || c >= n || used.has(a + ',' + c)) continue;
                    opts.push([a, c]);
                }
                if (!opts.length) break;
                const [a, c] = opts[ri(0, opts.length - 1)];
                ci = a; cj = c; used.add(a + ',' + c); grid[a][c] = v++;
            }
            return { n, grid, next: 1, max: v - 1, wrong: 0 };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#26304a', '#12182a');
            const n = S.n, C = Math.min(52, (W - 40) / n), ox = (W - C * n) / 2, oy = 84;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C, v = S.grid[i][j];
                if (!v) continue;
                if (v < S.next) { E.card(ctx, x + 2, y + 2, C - 4, C - 4, '#2f7f4a', '#1a4a2a', 8); E.txt(ctx, v, x + C / 2, y + C / 2, C * 0.4, 'rgba(255,255,255,.45)', true); }
                else if (v === S.next) { E.card(ctx, x + 2, y + 2, C - 4, C - 4, '#ffd56b', '#e0a020', 8); E.txt(ctx, v, x + C / 2, y + C / 2, C * 0.44, '#3a2a00', true); }
                else { E.card(ctx, x + 2, y + 2, C - 4, C - 4, '#4a5a8f', '#2a3a5f', 8); E.txt(ctx, v, x + C / 2, y + C / 2, C * 0.4, '#fff', true); }
            }
            E.txt(ctx, `下一个：${S.next} / ${S.max}　失误 ${S.wrong}`, W / 2, 40, 17, '#ffd56b', true);
        },
        tap(S, x, y, P, api) {
            const n = S.n, C = Math.min(52, (380 - 40) / n), ox = (380 - C * n) / 2, oy = 84;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            if (i < 0 || i >= n || j < 0 || j >= n) return;
            const v = S.grid[i][j];
            if (!v) return;
            if (v === S.next) { S.next++; if (S.next > S.max) api.finish({ win: true, stars: S.wrong === 0 ? 3 : 2, lines: [`连完 ${S.max} 个数字，失误 ${S.wrong}`] }); }
            else S.wrong++;
        },
    });

    // ============ 8. 推箱子 ============
    const SKB = [
        '#######|#..O..#|#.@B..#|#..O..#|#######',
        '########|#.....#|#.O$B.#|#.O..#|#..B..#|########',
        '#######|#..O..#|#.BB..#|#..O..#|#.@...#|#######',
        '########|#..O..#|#.@BO.#|#..O..#|#.B...#|########',
        '#######|#O...O#|#.@B..#|#..BB.#|#######',
        '########|#.....#|#.OB..#|#.B..O#|#.@...#|########',
        '#######|#.O.O.#|#..@..#|#.BB..#|#.....#|#######',
        '########|#..O..#|#.@BO.#|#.B.O.#|#..B..#|########',
        '#######|#O..O.#|#.@BB.#|#..O..#|#######',
        '########|#.....#|#.OBB.#|#.O..O#|#..@..#|########',
    ];
    E.def('sokoban', {
        levels: E.nm(),
        params: (i) => ({ idx: i % SKB.length }),
        desc: (i, t, p) => '推箱子 · 地图 #' + (p.idx + 1),
        w: 380, h: 470,
        hint: '方向键或点击方向按钮推动箱子（📦）到目标点（🎯）',
        init: P => {
            const rows = SKB[P.idx].split('|');
            const h = rows.length, w = Math.max(...rows.map(r => r.length));
            const b = [], boxes = [], goals = [];
            let pl = [1, 1];
            for (let i = 0; i < h; i++) {
                b.push([]);
                for (let j = 0; j < w; j++) {
                    const ch = rows[i][j] || ' ';
                    b[i].push(ch === '#' ? 1 : 0);
                    if (ch === 'O') goals.push([i, j]);
                    if (ch === 'B') boxes.push([i, j]);
                    if (ch === '$') { boxes.push([i, j]); goals.push([i, j]); }
                    if (ch === '@') pl = [i, j];
                }
            }
            return { b, boxes, goals, pl, w, h, moves: 0 };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f22', '#1a1410');
            const C = Math.min(46, (W - 30) / S.w), ox = (W - C * S.w) / 2, oy = 76;
            for (let i = 0; i < S.h; i++) for (let j = 0; j < S.w; j++) {
                const x = ox + j * C, y = oy + i * C;
                if (S.b[i][j]) { E.card(ctx, x, y, C, C, '#8a7458', '#42382a', 4); }
                else { ctx.fillStyle = '#2c2418'; ctx.fillRect(x, y, C, C); }
                // 目标点：发光的琥珀色菱形框（一眼可见），不用小尺寸 emoji
                if (S.goals.some(g => g[0] === i && g[1] === j)) {
                    const gx = x + C / 2, gy = y + C / 2, r = C * 0.3;
                    ctx.save();
                    ctx.shadowColor = '#ffb84d'; ctx.shadowBlur = 8;
                    ctx.fillStyle = 'rgba(255,184,77,0.28)';
                    ctx.strokeStyle = '#ffb84d'; ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.moveTo(gx, gy - r); ctx.lineTo(gx + r, gy); ctx.lineTo(gx, gy + r); ctx.lineTo(gx - r, gy);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.restore();
                    ctx.fillStyle = '#ffcf7d';
                    ctx.beginPath(); ctx.arc(gx, gy, 3, 0, Math.PI * 2); ctx.fill();
                }
            }
            // 箱子：立体木箱（木板 + 铆钉 + 高对比描边），推进目标变绿并打光
            S.boxes.forEach(([i, j]) => {
                const on = S.goals.some(g => g[0] === i && g[1] === j);
                const bx = ox + j * C + 3, by = oy + i * C + 3, bs = C - 6;
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
                const bg2 = ctx.createLinearGradient(bx, by, bx, by + bs);
                if (on) { bg2.addColorStop(0, '#8fe0a0'); bg2.addColorStop(1, '#3a9a55'); }
                else { bg2.addColorStop(0, '#d8a860'); bg2.addColorStop(1, '#9a6a30'); }
                ctx.fillStyle = bg2;
                ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bs, bs, 5) : ctx.rect(bx, by, bs, bs); ctx.fill();
                ctx.restore();
                ctx.lineWidth = 2.5; ctx.strokeStyle = on ? '#2a7a42' : '#5a3a14'; ctx.stroke();
                // 木板横缝 + 对角交叉加固条
                ctx.strokeStyle = on ? 'rgba(20,80,40,0.55)' : 'rgba(70,42,10,0.55)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(bx + 2, by + bs / 3); ctx.lineTo(bx + bs - 2, by + bs / 3);
                ctx.moveTo(bx + 2, by + bs * 2 / 3); ctx.lineTo(bx + bs - 2, by + bs * 2 / 3);
                ctx.moveTo(bx + 3, by + 3); ctx.lineTo(bx + bs - 3, by + bs - 3);
                ctx.moveTo(bx + bs - 3, by + 3); ctx.lineTo(bx + 3, by + bs - 3);
                ctx.stroke();
                // 四角铆钉
                ctx.fillStyle = on ? '#eafff0' : '#f0d8a8';
                [[4, 4], [bs - 4, 4], [4, bs - 4], [bs - 4, bs - 4]].forEach(([dx, dy]) => {
                    ctx.beginPath(); ctx.arc(bx + dx, by + dy, 2, 0, Math.PI * 2); ctx.fill();
                });
                // 顶部高光
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.fillRect(bx + 3, by + 2, bs - 6, 3);
                if (on) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold ' + Math.round(bs * 0.5) + 'px sans-serif';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText('✓', bx + bs / 2, by + bs / 2 + 1);
                }
            });
            // 玩家：Q 版小人（圆脸 + 身体 + 推的方向感），比单纯 emoji 头像醒目
            {
                const px = ox + S.pl[1] * C + C / 2, py = oy + S.pl[0] * C + C / 2, pr = C * 0.34;
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
                ctx.fillStyle = '#4a90d9';
                ctx.beginPath(); ctx.arc(px, py + pr * 0.5, pr * 0.85, 0, Math.PI); ctx.fill();  // 身体
                const fg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.4, 1, px, py, pr);
                fg.addColorStop(0, '#ffe0b0'); fg.addColorStop(1, '#e8a860');
                ctx.fillStyle = fg;
                ctx.beginPath(); ctx.arc(px, py - pr * 0.25, pr, 0, Math.PI * 2); ctx.fill();   // 头
                ctx.restore();
                ctx.strokeStyle = '#7a5018'; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = '#222';
                ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.35, pr * 0.13, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(px + pr * 0.35, py - pr * 0.35, pr * 0.13, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#a05a28'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(px, py - pr * 0.05, pr * 0.35, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
            }
            E.txt(ctx, `步数 ${S.moves}`, W / 2, 40, 17, '#ffd56b', true);
            E.btnBox(ctx, 150, H - 148, 70, 50, '↑', '#5a4a32', '#3a2f22');
            E.btnBox(ctx, 60, H - 88, 70, 50, '←', '#5a4a32', '#3a2f22');
            E.btnBox(ctx, 150, H - 88, 70, 50, '↓', '#5a4a32', '#3a2f22');
            E.btnBox(ctx, 240, H - 88, 70, 50, '→', '#5a4a32', '#3a2f22');
        },
        key(S, k, P, api) {
            const m = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] };
            if (m[k]) skMove(S, m[k][0], m[k][1], api);
        },
        tap(S, x, y, P, api) {
            const H = 470;
            if (E.hit(x, y, 150, H - 148, 70, 50)) return skMove(S, -1, 0, api);
            if (E.hit(x, y, 60, H - 88, 70, 50)) return skMove(S, 0, -1, api);
            if (E.hit(x, y, 150, H - 88, 70, 50)) return skMove(S, 1, 0, api);
            if (E.hit(x, y, 240, H - 88, 70, 50)) return skMove(S, 0, 1, api);
        },
    });
    function skMove(S, di, dj, api) {
        const [i, j] = S.pl, a = i + di, c = j + dj;
        if (S.b[a] && S.b[a][c]) return;
        const bi = S.boxes.findIndex(b2 => b2[0] === a && b2[1] === c);
        if (bi >= 0) {
            const na = a + di, nc = c + dj;
            if ((S.b[na] && S.b[na][nc]) || S.boxes.some(b2 => b2[0] === na && b2[1] === nc)) return;
            S.boxes[bi] = [na, nc];
        }
        S.pl = [a, c]; S.moves++;
        if (S.boxes.every(b2 => S.goals.some(g => g[0] === b2[0] && g[1] === b2[1])))
            api.finish({ win: true, stars: S.moves <= 40 ? 3 : 2, lines: [`${S.moves} 步完成推箱子`] });
    }

    // ============ 9. 方块填充（无尽友好）============
    const BPS = [
        [[1, 1, 1, 1]],
        [[1, 1], [1, 1]],
        [[1, 1, 1], [0, 1, 0]],
        [[1, 1, 1], [1, 0, 0]],
        [[1, 1, 1], [0, 0, 1]],
        [[1, 1], [1, 0]],
        [[1, 1, 1], [1, 1, 1]],
        [[1, 0], [1, 1]],
        [[0, 1], [1, 1]],
    ];
    const BPC = ['#ff6b7f', '#ffd56b', '#5cd65c', '#5cc7ff', '#b78bff', '#ff9d5c', '#7adf7a'];
    E.def('blockpuzzle', {
        levels: E.nm(),
        params: (i, t) => ({ n: 8, goal: 300 + i * 120 }),
        endless: { n: 8, goal: 0 },
        w: 380, h: 500,
        hint: '把下方方块拖到棋盘（先点方块再点位置），填满整行/整列即消除',
        init: P => ({
            n: P.n, b: Array.from({ length: P.n }, () => Array(P.n).fill(0)),
            pieces: [bpPiece(), bpPiece(), bpPiece()], sel: 0, score: 0, goal: P.goal,
        }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#1e2a3a', '#0c141e');
            const n = S.n, C = Math.min(38, (W - 30) / n), ox = (W - C * n) / 2, oy = 66;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const x = ox + j * C, y = oy + i * C;
                if (S.b[i][j]) { E.card(ctx, x + 1, y + 1, C - 2, C - 2, BPC[(S.b[i][j] - 1) % 7], '#1c2a3a', 4); }
                else { ctx.fillStyle = '#1a2434'; ctx.fillRect(x + 1, y + 1, C - 2, C - 2); }
            }
            E.txt(ctx, S.goal ? `分数 ${S.score}/${S.goal}` : `分数 ${S.score}（无尽）`, W / 2, 36, 17, '#ffd56b', true);
            S.pieces.forEach((p, k) => {
                if (!p) return;
                const bx = 20 + k * 116, by = H - 116, s = 22;
                if (k === S.sel) { ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.strokeRect(bx - 6, by - 6, p[0].length * s + 12, p.length * s + 12); }
                for (let i = 0; i < p.length; i++) for (let j = 0; j < p[0].length; j++) {
                    if (!p[i][j]) continue;
                    E.card(ctx, bx + j * s, by + i * s, s - 2, s - 2, BPC[k % 7], '#1c2a3a', 3);
                }
            });
        },
        tap(S, x, y, P, api) {
            const H = 500;
            for (let k = 0; k < 3; k++) if (S.pieces[k] && E.hit(x, y, 20 + k * 116 - 6, H - 122, 90, 90)) { S.sel = k; return; }
            const n = S.n, C = Math.min(38, (380 - 30) / n), ox = (380 - C * n) / 2, oy = 66;
            const j = Math.floor((x - ox) / C), i = Math.floor((y - oy) / C);
            const p = S.pieces[S.sel];
            if (!p || i < 0 || j < 0 || i + p.length > n || j + p[0].length > n) return;
            for (let a = 0; a < p.length; a++) for (let c = 0; c < p[0].length; c++) if (p[a][c] && S.b[i + a][j + c]) return;
            for (let a = 0; a < p.length; a++) for (let c = 0; c < p[0].length; c++) if (p[a][c]) S.b[i + a][j + c] = S.sel + 1;
            S.pieces[S.sel] = null;
            S.score += p.flat().filter(v => v).length;
            // 消除
            let lines = 0;
            for (let a = 0; a < n; a++) {
                if (S.b[a].every(v => v)) { S.b[a] = Array(n).fill(0); lines++; }
            }
            for (let c = 0; c < n; c++) {
                let full = true;
                for (let a = 0; a < n; a++) if (!S.b[a][c]) full = false;
                if (full) { for (let a = 0; a < n; a++) S.b[a][c] = 0; lines++; }
            }
            if (lines) S.score += lines * 30;
            if (S.pieces.every(q => !q)) S.pieces = [bpPiece(), bpPiece(), bpPiece()];
            if (S.goal && S.score >= S.goal) return api.finish({ win: true, stars: 3, score: S.score, lines: [`得分 ${S.score}`] });
            let stuck = true;
            for (let k = 0; k < 3 && stuck; k++) {
                const q = S.pieces[k]; if (!q) continue;
                for (let a = 0; a + q.length <= n && stuck; a++) for (let c = 0; c + q[0].length <= n; c++) {
                    let ok = true;
                    for (let x2 = 0; x2 < q.length; x2++) for (let y2 = 0; y2 < q[0].length; y2++) if (q[x2][y2] && S.b[a + x2][c + y2]) ok = false;
                    if (ok) { stuck = false; break; }
                }
            }
            if (stuck) api.finish({ win: false, stars: 1, score: S.score, lines: [`无处可放，得分 ${S.score}`] });
        },
    });
    function bpPiece() { return BPS[ri(0, BPS.length - 1)].map(r => r.slice()); }

    // ============ 10. 色码破译（Mastermind）============
    const MMC = ['#ff6b7f', '#ffd56b', '#5cd65c', '#5cc7ff', '#b78bff', '#ff9d5c'];
    E.def('mastermind', {
        levels: E.nm(),
        params: (i, t) => ({ len: Math.min(5, 3 + Math.floor(i / 7)), col: Math.min(6, 4 + Math.floor(i / 6)), tries: Math.max(6, 12 - Math.floor(i / 3)) }),
        w: 380, h: 480,
        hint: '点击色块填入猜测位，再点「提交」；红点=位置对，白点=颜色对位置错',
        init: P => ({
            len: P.len, col: P.col, tries: P.tries,
            secret: Array.from({ length: P.len }, () => ri(0, P.col - 1)),
            guess: Array(P.len).fill(-1), cur: 0, hist: [], msg: '开始猜！',
        }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2a2438', '#15121e');
            E.txt(ctx, `剩余 ${S.tries - S.hist.length} 次 · ${S.msg}`, W / 2, 30, 16, '#ffd56b', true);
            S.hist.slice(-6).forEach((h, k) => {
                const y = 56 + k * 34;
                h.g.forEach((v, i) => { ctx.fillStyle = MMC[v]; ctx.beginPath(); ctx.arc(40 + i * 34, y, 13, 0, 6.284); ctx.fill(); });
                E.txt(ctx, '●'.repeat(h.a) + '○'.repeat(h.b), 300, y, 18, h.a ? '#ff7a8b' : '#c8c0e0', true);
            });
            S.guess.forEach((v, i) => {
                const x = 40 + i * 34, y = H - 190;
                ctx.fillStyle = v >= 0 ? MMC[v] : '#3a3452';
                ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.284); ctx.fill();
                ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 2; ctx.stroke();
            });
            for (let k = 0; k < S.col; k++) {
                ctx.fillStyle = MMC[k];
                U.rr(ctx, 20 + k * 56, H - 130, 46, 46, 8); ctx.fill();
            }
            E.btnBox(ctx, 130, H - 68, 120, 44, '提交', '#2f7f4a', '#1a4a2a');
        },
        tap(S, x, y, P, api) {
            const H = 480;
            for (let k = 0; k < S.col; k++) {
                if (E.hit(x, y, 20 + k * 56, H - 130, 46, 46)) {
                    S.guess[S.cur % S.len] = k; S.cur = (S.cur + 1) % S.len; return;
                }
            }
            if (E.hit(x, y, 130, H - 68, 120, 44)) {
                if (S.guess.some(v => v < 0)) { S.msg = '还有空位'; return; }
                let a = 0, b = 0;
                const sg = S.secret.slice(), gg = S.guess.slice();
                for (let i = 0; i < S.len; i++) if (sg[i] === gg[i]) { a++; sg[i] = -1; gg[i] = -2; }
                for (let i = 0; i < S.len; i++) { const k = sg.indexOf(gg[i]); if (k >= 0) { b++; sg[k] = -1; } }
                S.hist.push({ g: S.guess.slice(), a, b });
                if (a === S.len) return api.finish({ win: true, stars: S.hist.length <= S.tries * 0.5 ? 3 : 2, lines: [`${S.hist.length} 次猜中`] });
                if (S.hist.length >= S.tries) return api.finish({ win: false, stars: 0, lines: ['次数用尽，答案是 ' + S.secret.map(v => v + 1).join('')] });
                S.guess = Array(S.len).fill(-1); S.msg = `${a} 个位置对，${b} 个颜色对`;
            }
        },
    });
})();
