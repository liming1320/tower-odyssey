// 斗兽棋（Jungle Chess / 动物棋）
// 规则：7×9 棋盘，双方各 8 只动物。象8 狮7 虎6 豹5 狼4 狗3 猫2 鼠1。
//   · 大吃小或同级相吃；鼠能吃象，象不能吃鼠
//   · 只有鼠能下水；狮虎可横/纵跳过整条河（中间无子时）
//   · 落入对方陷阱的棋子等级归零；进入对方兽穴即获胜；己方兽穴不可入
window.MiniGames = window.MiniGames || {};
(function () {
    const E = MG.eng;
    const COLS = 7, ROWS = 9;
    const GLYPH = { 1: '鼠', 2: '猫', 3: '狗', 4: '狼', 5: '豹', 6: '虎', 7: '狮', 8: '象' };
    // 动物棋子：彩色 emoji 头像（canvas 原生渲染，无外部资源）
    const FACE = { 1: '🐭', 2: '🐱', 3: '🐶', 4: '🐺', 5: '🐆', 6: '🐯', 7: '🦁', 8: '🐘' };
    const DENS = [{ x: 3, y: 0 }, { x: 3, y: 8 }];
    const TRAPS = [
        { x: 2, y: 0, o: 0 }, { x: 4, y: 0, o: 0 }, { x: 3, y: 1, o: 0 },
        { x: 2, y: 8, o: 1 }, { x: 4, y: 8, o: 1 }, { x: 3, y: 7, o: 1 },
    ];
    const ix = (x, y) => y * COLS + x;
    const inBoard = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;
    const isWater = (x, y) => (y >= 3 && y <= 5) && (x === 1 || x === 2 || x === 4 || x === 5);
    function trapOwner(x, y) {
        for (const t of TRAPS) if (t.x === x && t.y === y) return t.o;
        return -1;
    }

    // 初始布局：黑（上，AI）在上三路，红（下，玩家）在下三路
    function newBoard() {
        const B = new Array(COLS * ROWS).fill(null);
        const put = (x, y, s, r) => { B[ix(x, y)] = { s, r }; };
        put(0, 0, 0, 7); put(6, 0, 0, 6);                     // 狮 虎
        put(1, 1, 0, 3); put(5, 1, 0, 2);                     // 狗 猫
        put(0, 2, 0, 1); put(2, 2, 0, 5); put(4, 2, 0, 4); put(6, 2, 0, 8);  // 鼠 豹 狼 象
        put(0, 8, 1, 7); put(6, 8, 1, 6);
        put(1, 7, 1, 3); put(5, 7, 1, 2);
        put(0, 6, 1, 1); put(2, 6, 1, 5); put(4, 6, 1, 4); put(6, 6, 1, 8);
        return B;
    }

    // 生成某格棋子的全部合法走法
    function movesFor(B, x, y) {
        const p = B[ix(x, y)];
        if (!p) return [];
        const side = p.s, rank = p.r;
        const out = [];
        const tryTo = (nx, ny) => {
            if (!inBoard(nx, ny)) return;
            const t = B[ix(nx, ny)];
            if (t && t.s === side) return;                                  // 不吃自己人
            if (nx === DENS[side].x && ny === DENS[side].y) return;         // 己方兽穴不可入
            const toWater = isWater(nx, ny), fromWater = isWater(x, y);
            if (toWater && rank !== 1) return;                              // 只有鼠能下水
            if (t && fromWater !== toWater) return;                         // 水陆之间不能互吃
            if (t) {
                const to = trapOwner(nx, ny) === -1 ? t.r : (trapOwner(nx, ny) === t.s ? t.r : 0);
                let can = rank >= to || (rank === 1 && to === 8);
                if (rank === 8 && to === 1) can = false;                    // 象怕鼠
                if (!can) return;
            }
            out.push({ x: nx, y: ny });
        };
        tryTo(x + 1, y); tryTo(x - 1, y); tryTo(x, y + 1); tryTo(x, y - 1);

        // 狮虎跳河：横向跨越 c1-c2 / c4-c5，纵向跨越 r3-r5，路径上不能有子
        if (rank === 7 || rank === 6) {
            const clearV = (cx, a, b) => {
                const lo = Math.min(a, b), hi = Math.max(a, b);
                for (let r = lo + 1; r < hi; r++) if (B[ix(cx, r)]) return false;
                return true;
            };
            const clearH = (cy, a, b) => {
                const lo = Math.min(a, b), hi = Math.max(a, b);
                for (let cxx = lo + 1; cxx < hi; cxx++) if (B[ix(cxx, cy)]) return false;
                return true;
            };
            if (y >= 3 && y <= 5) {
                if (x === 0 && clearH(y, 0, 3)) tryTo(3, y);
                if (x === 3 && clearH(y, 0, 3)) tryTo(0, y);
                if (x === 3 && clearH(y, 3, 6)) tryTo(6, y);
                if (x === 6 && clearH(y, 3, 6)) tryTo(3, y);
            }
            if (x === 1 || x === 2 || x === 4 || x === 5) {
                if (y === 2 && clearV(x, 2, 6)) tryTo(x, 6);
                if (y === 6 && clearV(x, 2, 6)) tryTo(x, 2);
            }
        }
        return out;
    }
    function allMoves(B, side) {
        const out = [];
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const p = B[ix(x, y)];
            if (!p || p.s !== side) continue;
            for (const m of movesFor(B, x, y)) out.push({ fx: x, fy: y, tx: m.x, ty: m.y });
        }
        return out;
    }
    function apply(B, mv) {
        const from = ix(mv.fx, mv.fy), to = ix(mv.tx, mv.ty);
        const captured = B[to];
        B[to] = B[from]; B[from] = null;
        return captured;
    }
    function undo(B, mv, captured) {
        const from = ix(mv.fx, mv.fy), to = ix(mv.tx, mv.ty);
        B[from] = B[to]; B[to] = captured;
    }
    // 胜负：进对方兽穴 / 一方棋子被吃光。返回 1=玩家(红)胜，0=AI(黑)胜，-1=未结束
    function winnerOf(B) {
        if (B[ix(DENS[0].x, DENS[0].y)]) return 1;   // 红进了黑的穴
        if (B[ix(DENS[1].x, DENS[1].y)]) return 0;   // 黑进了红的穴
        let has0 = false, has1 = false;
        for (let i = 0; i < B.length; i++) {
            const p = B[i];
            if (!p) continue;
            if (p.s === 0) has0 = true; else has1 = true;
        }
        if (!has0) return 1;
        if (!has1) return 0;
        return -1;
    }

    // ---------------- AI：Alpha-Beta 搜索 ----------------
    const MAT = { 1: 8, 2: 12, 3: 20, 4: 32, 5: 48, 6: 70, 7: 100, 8: 90 };
    function evaluate(B) {
        let sc = 0;
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const p = B[ix(x, y)];
            if (!p) continue;
            let v = MAT[p.r] || 10;
            // 逼近对方兽穴加分
            const den = DENS[1 - p.s];
            const dist = Math.abs(x - den.x) + Math.abs(y - den.y);
            v += (16 - dist) * 2;
            if (trapOwner(x, y) !== -1 && trapOwner(x, y) !== p.s) v -= 40;   // 踩对方陷阱
            sc += (p.s === 0 ? -v : v);       // AI 是 0（黑），玩家是 1（红）
        }
        return sc;
    }
    function search(B, depth, alpha, beta, side) {
        const w = winnerOf(B);
        if (w === 0) return -100000 - depth;
        if (w === 1) return 100000 + depth;
        if (depth <= 0) return evaluate(B);
        const moves = allMoves(B, side);
        if (!moves.length) return side === 0 ? -100000 : 100000;   // 无路可走
        if (side === 0) {   // AI 求最小（因为 evaluate 里 AI 为负）
            let best = Infinity;
            for (const m of moves) {
                const cap = apply(B, m);
                const v = search(B, depth - 1, alpha, beta, 1);
                undo(B, m, cap);
                if (v < best) best = v;
                if (best < beta) beta = best;
                if (beta <= alpha) break;
            }
            return best;
        }
        let best = -Infinity;
        for (const m of moves) {
            const cap = apply(B, m);
            const v = search(B, depth - 1, alpha, beta, 0);
            undo(B, m, cap);
            if (v > best) best = v;
            if (best > alpha) alpha = best;
            if (beta <= alpha) break;
        }
        return best;
    }
    function pickAI(B, depth, err, rnd) {
        const moves = allMoves(B, 0);
        if (!moves.length) return null;
        // 有吃子先按价值粗排，减少搜索分支
        moves.sort((a, b) => {
            const va = B[ix(a.tx, a.ty)] ? (MAT[B[ix(a.tx, a.ty)].r] || 0) : 0;
            const vb = B[ix(b.tx, b.ty)] ? (MAT[B[ix(b.tx, b.ty)].r] || 0) : 0;
            return vb - va;
        });
        const top = moves.slice(0, Math.max(8, Math.ceil(moves.length * 0.6)));
        if (rnd() < err) return top[Math.floor(rnd() * top.length)];   // 失误：随机走一步
        let best = null, bestV = Infinity;
        for (const m of top) {
            const cap = apply(B, m);
            const v = search(B, depth - 1, -Infinity, Infinity, 1);
            undo(B, m, cap);
            if (v < bestV) { bestV = v; best = m; }
        }
        return best || top[0];
    }

    // 测试钩子：只在自动化验证（window.__MG_TEST）下暴露，方便脚本直接走一步合法棋
    if (window.__MG_TEST) {
        window.__jungleDbg = { movesFor, allMoves, apply, undo, winnerOf, newBoard, ix, DENS };
    }

    // ---------------- 视图 ----------------
    // 静态层缓存：藤蔓 + 木框棋盘 + 草地 + 河流 + 兽穴/陷阱，全部画进一张离屏 canvas，
    // 每帧一次 drawImage（尺寸/格径变化才重建）。动态的棋子、选中高亮仍逐帧画。
    let _cv = null, _cvKey = '';
    function staticLayer(ctx, cell, x0, y0, bw, bh, W, H) {
        const key = W + 'x' + H + '|' + cell;
        if (_cvKey === key && _cv) return ctx.drawImage(_cv, 0, 0, W, H);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, W); cv.height = Math.max(1, H);
        const c = cv.getContext('2d');
        const G = MG.gfx;
        // 确定性随机：装饰每局一致，不闪
        let seed = 20260912;
        const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

        // —— 丛林藤蔓剪影（顶层垂下 + 两侧叶簇）
        const leaf = (lx, ly, len, ang, col) => {
            c.save(); c.translate(lx, ly); c.rotate(ang);
            c.beginPath(); c.ellipse(0, len / 2, len * 0.16, len / 2, 0, 0, Math.PI * 2);
            c.fillStyle = col; c.fill(); c.restore();
        };
        for (let i = 0; i < 9; i++) {
            const vx = (W / 9) * i + rnd() * 18, vl = 26 + rnd() * 52;
            c.strokeStyle = 'rgba(14,42,27,.6)'; c.lineWidth = 2.2;
            c.beginPath(); c.moveTo(vx, 0);
            c.quadraticCurveTo(vx + (rnd() - .5) * 26, vl * .6, vx + (rnd() - .5) * 18, vl);
            c.stroke();
            for (let k = 0; k < 4; k++) leaf(vx + (rnd() - .5) * 14, vl * (0.25 + k * 0.2), 10 + rnd() * 9, (rnd() - .5) * 2.4, 'rgba(18,52,32,.55)');
        }
        for (let i = 0; i < 6; i++) {   // 左右两侧探出的叶簇
            const side = i % 2 ? 1 : -1, ex = side < 0 ? 6 : W - 6, ey = 80 + rnd() * (H - 140);
            for (let k = 0; k < 3; k++) leaf(ex, ey + (k - 1) * 12, 20 + rnd() * 16, side * (0.5 + rnd() * 0.5), 'rgba(16,48,30,.5)');
        }

        // —— 木框棋盘
        G.panel(c, x0 - 9, y0 - 9, bw + 18, bh + 18, '#a5713a', '#5e3a1a', 12);
        c.strokeStyle = 'rgba(58,34,14,.8)'; c.lineWidth = 2;
        c.strokeRect(x0 - 3.5, y0 - 3.5, bw + 7, bh + 7);
        // 木纹：几条淡色纵向纹理
        c.strokeStyle = 'rgba(60,36,16,.18)'; c.lineWidth = 1.5;
        for (let i = 0; i < 10; i++) {
            const tx = x0 - 7 + rnd() * (bw + 14);
            c.beginPath(); c.moveTo(tx, y0 - 7);
            c.quadraticCurveTo(tx + (rnd() - .5) * 8, y0 + bh / 2, tx + (rnd() - .5) * 6, y0 + bh + 7);
            c.stroke();
        }
        // 四角铜钉
        for (const [nx, ny] of [[x0 - 6, y0 - 6], [x0 + bw + 6, y0 - 6], [x0 - 6, y0 + bh + 6], [x0 + bw + 6, y0 + bh + 6]]) {
            c.beginPath(); c.arc(nx, ny, 3, 0, Math.PI * 2);
            c.fillStyle = '#e8c069'; c.fill();
            c.strokeStyle = '#7a5518'; c.lineWidth = 1; c.stroke();
        }

        // —— 格子：草地 / 河流
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            const px = x0 + x * cell, py = y0 + y * cell;
            if (isWater(x, y)) {
                const g = c.createLinearGradient(px, py, px, py + cell);
                g.addColorStop(0, '#5fc0ec'); g.addColorStop(.5, '#2f8fc9'); g.addColorStop(1, '#1a5f96');
                c.fillStyle = g; c.fillRect(px, py, cell, cell);
                // 波浪 + 高光
                c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.4;
                for (let k = 0; k < 2; k++) {
                    const yy = py + cell * (0.34 + k * 0.34);
                    c.beginPath(); c.moveTo(px + 5, yy);
                    c.quadraticCurveTo(px + cell / 2, yy - 4.5, px + cell - 5, yy);
                    c.stroke();
                }
                c.strokeStyle = 'rgba(255,255,255,.14)';
                c.beginPath(); c.moveTo(px + 6, py + 3.5); c.lineTo(px + cell - 6, py + 3.5); c.stroke();
            } else {
                c.fillStyle = ((x + y) & 1) ? '#84ba5c' : '#77ad50';
                c.fillRect(px, py, cell, cell);
                // 草簇 / 小花
                const n = Math.floor(rnd() * 2.4);
                for (let k = 0; k < n; k++) {
                    const gx = px + 6 + rnd() * (cell - 12), gy = py + 7 + rnd() * (cell - 12);
                    if (rnd() < 0.18) {   // 小花
                        c.fillStyle = 'rgba(255,224,138,.85)';
                        c.beginPath(); c.arc(gx, gy, 1.6, 0, Math.PI * 2); c.fill();
                    } else {              // 三叶草簇
                        c.strokeStyle = 'rgba(46,94,42,.5)'; c.lineWidth = 1.1;
                        c.beginPath();
                        c.moveTo(gx, gy); c.lineTo(gx - 2.4, gy - 4);
                        c.moveTo(gx, gy); c.lineTo(gx, gy - 5);
                        c.moveTo(gx, gy); c.lineTo(gx + 2.4, gy - 4);
                        c.stroke();
                    }
                }
            }
        }
        // 网格线
        c.strokeStyle = 'rgba(52,88,40,.4)'; c.lineWidth = 1;
        for (let x = 0; x <= COLS; x++) { c.beginPath(); c.moveTo(x0 + x * cell + .5, y0); c.lineTo(x0 + x * cell + .5, y0 + bh); c.stroke(); }
        for (let y = 0; y <= ROWS; y++) { c.beginPath(); c.moveTo(x0, y0 + y * cell + .5); c.lineTo(x0 + bw, y0 + y * cell + .5); c.stroke(); }
        // 中界小旗
        G.text(c, '⚔️', x0 + bw / 2, y0 + bh / 2, cell * 0.5, '#fff');

        // —— 兽穴：石圈洞穴
        for (let s = 0; s < 2; s++) {
            const d = DENS[s];
            const cx = x0 + d.x * cell + cell / 2, cy = y0 + d.y * cell + cell / 2;
            const g = c.createRadialGradient(cx, cy - 2, 2, cx, cy, cell * 0.44);
            g.addColorStop(0, '#06080c');
            g.addColorStop(.75, s === 0 ? '#23406e' : '#7c3232');
            g.addColorStop(1, s === 0 ? '#31507f' : '#94443f');
            c.beginPath(); c.arc(cx, cy, cell * 0.44, 0, Math.PI * 2); c.fillStyle = g; c.fill();
            for (let k = 0; k < 9; k++) {   // 石圈
                const a = (k / 9) * Math.PI * 2 + 0.3;
                c.beginPath(); c.arc(cx + Math.cos(a) * cell * 0.44, cy + Math.sin(a) * cell * 0.44, cell * 0.075, 0, Math.PI * 2);
                c.fillStyle = '#9aa0a8'; c.fill();
                c.strokeStyle = 'rgba(40,44,50,.7)'; c.lineWidth = .8; c.stroke();
            }
            G.text(c, '穴', cx, cy + 1, cell * 0.26, s === 0 ? '#bcd0ff' : '#ffd6c8', { bold: true });
        }
        // —— 陷阱：捕兽网
        for (const t of TRAPS) {
            const px = x0 + t.x * cell, py = y0 + t.y * cell;
            const cx = px + cell / 2, cy = py + cell / 2, rad = cell * 0.36;
            c.save();
            c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.clip();
            c.strokeStyle = 'rgba(140,58,46,.85)'; c.lineWidth = 1;
            for (let k = -6; k <= 6; k++) {
                c.beginPath(); c.moveTo(cx + k * cell / 6 - rad, cy + rad); c.lineTo(cx + k * cell / 6 + rad, cy - rad); c.stroke();
                c.beginPath(); c.moveTo(cx + k * cell / 6 - rad, cy - rad); c.lineTo(cx + k * cell / 6 + rad, cy + rad); c.stroke();
            }
            c.restore();
            c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2);
            c.strokeStyle = 'rgba(120,44,36,.9)'; c.lineWidth = 1.6; c.stroke();
            for (let k = 0; k < 4; k++) {   // 四角地桩
                const a = Math.PI / 4 + k * Math.PI / 2;
                c.beginPath(); c.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 1.8, 0, Math.PI * 2);
                c.fillStyle = '#6e342a'; c.fill();
            }
        }
        _cv = cv; _cvKey = key;
        ctx.drawImage(_cv, 0, 0, W, H);
    }

    // 单个棋子：动物头像盘（红=玩家暖金 / 黑=AI 靛蓝），带投影、金环、高光与等级徽章
    function piece(ctx, p, cx, cy, cell) {
        const G = MG.gfx;
        const r = cell * 0.40, evil = p.s === 0;
        // 落地投影
        ctx.save(); ctx.translate(cx, cy + r * 0.78); ctx.scale(1, 0.42);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,.30)'; ctx.fill(); ctx.restore();
        // 盘体
        const g = ctx.createRadialGradient(cx - r * .35, cy - r * .4, r * .15, cx, cy, r);
        if (evil) { g.addColorStop(0, '#cfdcf9'); g.addColorStop(.55, '#5b75b8'); g.addColorStop(1, '#22305a'); }
        else { g.addColorStop(0, '#ffe6bc'); g.addColorStop(.55, '#e2894a'); g.addColorStop(1, '#9c3d16'); }
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = evil ? '#101a36' : '#6a2408'; ctx.lineWidth = 1.6; ctx.stroke();
        // 内环
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = evil ? 'rgba(196,214,255,.55)' : 'rgba(255,222,150,.65)'; ctx.lineWidth = 1.2; ctx.stroke();
        // 顶部高光弧
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, -2.35, -0.75);
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
        // 动物头像
        ctx.save();
        ctx.font = `${Math.round(cell * 0.46)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(FACE[p.r], cx, cy + cell * 0.03);
        ctx.restore();
        // 等级徽章
        const bx = cx + r * 0.68, by = cy - r * 0.68, br = cell * 0.145;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = evil ? '#1b2748' : '#7a2d08'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.stroke();
        G.text(ctx, String(p.r), bx, by + 0.5, cell * 0.19, evil ? '#bcd0ff' : '#ffd56b', { bold: true });
    }
    E.def('jungle', {
        w: 440, h: 596,
        levels: E.nm(),
        hint: '点击己方棋子选中，再点高亮格移动 · 鼠能吃象、象怕鼠 · 进对方兽穴即胜',
        params(i, t) {
            return {
                depth: 1 + Math.min(3, Math.floor(t * 3.99)),                 // AI 搜索深度 1→4
                err: Math.max(0.02, 0.55 - t * 0.53),                          // 失误率 55%→2%
            };
        },
        desc(i, t, p) { return `AI 深度 ${p.depth} · 失误率 ${Math.round(p.err * 100)}%`; },
        init(P) {
            return {
                B: newBoard(),
                turn: 1,            // 1=玩家（红，下） 0=AI（黑，上）
                sel: null,
                winner: -1,
                busy: false,
                msg: '你执红（下方），点击棋子开始',
                last: null,
                rnd: null,
                score: 0,
            };
        },
        draw(ctx, S, P, W, H, api) {
            if (!S.rnd) S.rnd = api.rng(20260911);
            const G = MG.gfx;
            G.scene(ctx, W, H, '#1c3a26', '#08150d');
            const cell = Math.floor(Math.min((W - 44) / COLS, (H - 124) / ROWS));
            const bw = cell * COLS, bh = cell * ROWS;
            const x0 = Math.round((W - bw) / 2), y0 = 66;
            S._geo = { cell, x0, y0 };

            // 顶部状态
            const turnTxt = S.winner >= 0
                ? (S.winner === 1 ? '🏆 你赢了！' : '💀 AI 获胜')
                : (S.turn === 1 ? '轮到你（红）' : 'AI 思考中…（黑）');
            G.panel(ctx, 10, 10, W - 20, 46, '#2f6a44', '#143321', 12);
            G.text(ctx, turnTxt, W / 2, 33, 16, S.winner === 1 ? '#ffd56b' : (S.winner === 0 ? '#ff8a8a' : '#eafff0'), { bold: true });

            // 静态层：藤蔓 + 木框棋盘 + 草地/河流 + 兽穴/陷阱
            staticLayer(ctx, cell, x0, y0, bw, bh, W, H);

            // 上一步痕迹
            if (S.last) {
                for (const q of [S.last.from, S.last.to]) {
                    const px = x0 + q.x * cell, py = y0 + q.y * cell;
                    ctx.strokeStyle = 'rgba(255,213,107,.9)'; ctx.lineWidth = 2;
                    ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);
                }
            }
            // 选中 + 可走点
            if (S.sel) {
                const ms = movesFor(S.B, S.sel.x, S.sel.y);
                for (const m of ms) {
                    const px = x0 + m.x * cell, py = y0 + m.y * cell;
                    const t = S.B[ix(m.x, m.y)];
                    ctx.beginPath();
                    ctx.arc(px + cell / 2, py + cell / 2, cell * (t ? 0.42 : 0.17), 0, Math.PI * 2);
                    ctx.fillStyle = t ? 'rgba(255,90,90,.30)' : 'rgba(140,255,190,.55)';
                    ctx.fill();
                    if (t) { ctx.strokeStyle = '#ff6a6a'; ctx.lineWidth = 2; ctx.stroke(); }
                }
                const px = x0 + S.sel.x * cell, py = y0 + S.sel.y * cell;
                ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3;
                ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);
            }
            // 棋子
            for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
                const p = S.B[ix(x, y)];
                if (!p) continue;
                piece(ctx, p, x0 + x * cell + cell / 2, y0 + y * cell + cell / 2, cell);
            }
            // 底部提示
            G.text(ctx, S.msg, W / 2, y0 + bh + 26, 12, '#c9d8bd');
            G.text(ctx, '象＞狮＞虎＞豹＞狼＞狗＞猫＞鼠 · 鼠吃象 · 象怕鼠', W / 2, y0 + bh + 46, 10.5, '#7f9a76');
        },
        tap(S, x, y, P, api) {
            if (S.winner >= 0 || S.turn !== 1 || S.busy) return;
            const g = S._geo; if (!g) return;
            const cx = Math.floor((x - g.x0) / g.cell), cy = Math.floor((y - g.y0) / g.cell);
            if (!inBoard(cx, cy)) return;
            const p = S.B[ix(cx, cy)];
            if (S.sel) {
                const ok = movesFor(S.B, S.sel.x, S.sel.y).some(m => m.x === cx && m.y === cy);
                if (ok) {
                    const mv = { fx: S.sel.x, fy: S.sel.y, tx: cx, ty: cy };
                    const cap = S.B[ix(cx, cy)];
                    apply(S.B, mv);
                    S.last = { from: { x: mv.fx, y: mv.fy }, to: { x: cx, y: cy } };
                    S.score += cap ? (MAT[cap.r] || 10) * 2 : 0;
                    S.msg = cap ? `吃掉 ${GLYPH[cap.r]}！` : '移动';
                    S.sel = null;
                    const w = winnerOf(S.B);
                    if (w >= 0) { S.winner = w; return; }
                    S.turn = 0; S.busy = true;
                    api.later(() => {
                        if (S.winner >= 0) { S.busy = false; return; }
                        const mv2 = pickAI(S.B, P.depth || 2, P.err || 0.2, S.rnd || Math.random);
                        if (mv2) {
                            const cap2 = S.B[ix(mv2.tx, mv2.ty)];
                            apply(S.B, mv2);
                            S.last = { from: { x: mv2.fx, y: mv2.fy }, to: { x: mv2.tx, y: mv2.ty } };
                            if (cap2) S.msg = `AI 吃掉了你的 ${GLYPH[cap2.r]}`;
                        }
                        const w2 = winnerOf(S.B);
                        if (w2 >= 0) S.winner = w2;
                        S.turn = 1; S.busy = false;
                    }, 320);
                    return;
                }
            }
            S.sel = (p && p.s === 1) ? { x: cx, y: cy } : null;
            if (S.sel) S.msg = '已选中，点击高亮格移动';
        },
        score(S) { return S.score; },
        check(S) {
            if (S.winner === 1) return { win: true, stars: 3, score: 1000 + S.score, lines: ['攻入兽穴！'] };
            if (S.winner === 0) return { win: false, stars: 0, score: S.score, lines: ['AI 攻入了你的兽穴'] };
            return null;
        },
    });
})();
