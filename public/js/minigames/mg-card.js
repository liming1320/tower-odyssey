// 纸牌 / 策略 8 款：纸牌接龙 · 蜘蛛纸牌 · 空当接龙 · 金字塔 · 21点 · 五张比牌 · 纸牌大战 · 大富翁
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
    const SU = ['♠', '♥', '♦', '♣'], RK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const isRed = s => s === 1 || s === 2;
    const lab = c => RK[c.r] + SU[c.s];
    function deck(sets) {
        const d = [];
        for (let k = 0; k < (sets || 1); k++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ r, s, up: false });
        return MG.shuffle(d);
    }
    function paint(ctx, x, y, w, h, c, hidden) {
        if (hidden) {
            // 牌背：深蓝渐变 + 白色内框 + 斜纹 lattice + 中心徽标
            E.card(ctx, x, y, w, h, '#4a7cc9', '#22406f', 6);
            U.rr(ctx, x + 4, y + 4, w - 8, h - 8, 4);
            ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 1.4; ctx.stroke();
            ctx.save();
            U.rr(ctx, x + 4, y + 4, w - 8, h - 8, 4); ctx.clip();
            ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1;
            ctx.beginPath();
            for (let s = -h; s < w; s += 6) { ctx.moveTo(x + s, y); ctx.lineTo(x + s + h, y + h); ctx.moveTo(x + s + h, y); ctx.lineTo(x + s, y + h); }
            ctx.stroke();
            ctx.restore();
            U.emoji(ctx, '✦', x + w / 2, y + h / 2 + 1, w * 0.34);
            return;
        }
        E.card(ctx, x, y, w, h, '#fdfdf5', '#d8d4c8', 6);
        const col = isRed(c.s) ? '#d03040' : '#20202c';
        // 角标：点数 + 花色（左上正排、右下倒排）
        const fs = Math.max(9, Math.round(w * 0.26));
        ctx.fillStyle = col;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = 'bold ' + fs + 'px "Segoe UI","Microsoft YaHei",sans-serif';
        ctx.fillText(RK[c.r], x + 4, y + 3);
        ctx.font = fs + 'px "Segoe UI Symbol","Segoe UI",sans-serif';
        ctx.fillText(SU[c.s], x + 4, y + 4 + fs * 1.02);
        ctx.save();
        ctx.translate(x + w - 4, y + h - 3); ctx.rotate(Math.PI);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = 'bold ' + fs + 'px "Segoe UI","Microsoft YaHei",sans-serif';
        ctx.fillText(RK[c.r], 0, 0);
        ctx.font = fs + 'px "Segoe UI Symbol","Segoe UI",sans-serif';
        ctx.fillText(SU[c.s], 0, 1 + fs * 1.02);
        ctx.restore();
        // 中心大花色
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = Math.round(w * 0.52) + 'px "Segoe UI Symbol","Segoe UI",sans-serif';
        ctx.fillText(SU[c.s], x + w / 2, y + h / 2 + 1);
    }
    const hitc = (x, y, cx, cy, cw, ch) => E.hit(x, y, cx, cy, cw, ch);

    // ============ 1. 纸牌接龙（Klondike）============
    E.def('solitaire', {
        levels: E.nm(),
        params: (i, t) => ({ draw: i < 10 ? 1 : 3 }),
        desc: (i, t, p) => '翻牌 ' + p.draw + ' 张',
        w: 392, h: 500,
        hint: '点牌堆翻牌；先点选一张明牌（或一叠），再点目标列 / 基础区放置；再点一次原牌可取消',
        init: P => {
            const d = deck();
            const tab = [[], [], [], [], [], [], []];
            for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) { const c = d.pop(); c.up = (j === i); tab[j].push(c); }
            return { stock: d, waste: [], fnd: [0, 0, 0, 0], tab, msg: '开始吧！' };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#1f5c3a', '#0d2e1d');
            const CW = 50, CH = 70;
            E.card(ctx, 12, 16, CW, CH, '#4a7fbf', '#22406f', 6);
            E.txt(ctx, S.stock.length ? '牌堆' + S.stock.length : '↻', 12 + CW / 2, 16 + CH / 2, 16, '#fff', true);
            if (S.waste.length) { paint(ctx, 70, 16, CW, CH, S.waste[S.waste.length - 1]); if (S.sel && S.sel.from === 'waste') hl(ctx, 70, 16, CW, CH); }
            else { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.strokeRect(70, 16, CW, CH); }
            for (let k = 0; k < 4; k++) {
                const x = 136 + k * 62;
                if (S.fnd[k]) paint(ctx, x, 16, CW, CH, { r: S.fnd[k], s: k });
                else { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.strokeRect(x, 16, CW, CH); E.txt(ctx, SU[k], x + CW / 2, 51, 22, 'rgba(255,255,255,.35)', true); }
            }
            for (let k = 0; k < 7; k++) {
                const x = 12 + k * 54;
                for (let n = 0; n < S.tab[k].length; n++) {
                    paint(ctx, x, 100 + n * 24, CW, CH, S.tab[k][n], !S.tab[k][n].up);
                    if (S.sel && S.sel.from === k && n >= S.sel.n) hl(ctx, x, 100 + n * 24, CW, n === S.tab[k].length - 1 ? CH : 24);
                }
                // 空列虚线框：有选中时提示可放置
                if (!S.tab[k].length && S.sel) { ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,213,107,.7)'; ctx.lineWidth = 2; ctx.strokeRect(x, 100, CW, CH); ctx.restore(); }
            }
            E.txt(ctx, S.msg, W / 2, H - 16, 14, '#cfe8d8');
        },
        tap(S, x, y, P, api) {
            const CW = 50, CH = 70;
            // 1) 牌堆：翻牌 / 回收，并清掉选中
            if (hitc(x, y, 12, 16, CW, CH)) {
                if (S.stock.length) { for (let k = 0; k < (P.draw || 1) && S.stock.length; k++) { const c = S.stock.pop(); c.up = true; S.waste.push(c); } }
                else { while (S.waste.length) { const c = S.waste.pop(); c.up = false; S.stock.push(c); } }
                S.sel = null; S.msg = '点选一张明牌，再点目的地';
                return;
            }
            // 2) 基础区（放牌目标）
            for (let k = 0; k < 4; k++) {
                const fx = 136 + k * 62;
                if (hitc(x, y, fx, 16, CW, CH)) {
                    if (!S.sel) { S.msg = '先点选一张牌'; return; }
                    if (S.sel.from === 'waste') {
                        const c = S.waste[S.waste.length - 1];
                        if (c && tryFnd(S, c, 'waste')) { S.sel = null; S.msg = '✔ 归位！'; return chkWin(S, api); }
                    } else {
                        const col = S.tab[S.sel.from];
                        if (col.length === S.sel.n + 1 && tryFnd(S, col[col.length - 1], S.sel.from)) { S.sel = null; S.msg = '✔ 归位！'; return chkWin(S, api); }
                    }
                    S.msg = '❌ 这张牌放不上基础区（需同花色 A→K 递增）';
                    return;
                }
            }
            // 3) 七列牌区
            for (let k = 0; k < 7; k++) {
                const col = S.tab[k], bx = 12 + k * 54;
                const maxY = 100 + Math.max(col.length, 1) * 24 + 46;
                if (x < bx || x > bx + CW || y < 100 || y > maxY) continue;
                // 空列：只能放 K 开头的序列
                if (!col.length) {
                    if (!S.sel) { S.msg = '先点选一张牌'; return; }
                    const seq = takeSeq(S);
                    if (seq && seq[0].r === 13) { S.tab[k].push(...seq); cutSource(S); S.sel = null; S.msg = '✔ 移到空列'; return chkWin(S, api); }
                    S.msg = '❌ 只有 K（或以 K 开头的一叠）能放空列';
                    return;
                }
                // 点到列中的哪张牌
                let hit = -1;
                for (let n = 0; n < col.length; n++) {
                    const cy = 100 + n * 24;
                    const inCell = (n === col.length - 1) ? hitc(x, y, bx, cy, CW, CH) : (y >= cy && y <= cy + 24);
                    if (inCell) { hit = n; break; }
                }
                if (hit < 0) return;
                // 无选中 → 选择
                if (!S.sel) {
                    if (!col[hit].up) { if (hit === col.length - 1) { col[hit].up = true; S.msg = '翻开一张'; } return; }
                    S.sel = { from: k, n: hit };
                    S.msg = hit === col.length - 1 ? '已选中，点目标列 / 基础区放置' : '已选中一叠，点目标列放置';
                    return;
                }
                // 点同列 → 取消或改选
                if (S.sel.from === k) {
                    if (hit === S.sel.n) { S.sel = null; S.msg = '已取消'; return; }
                    if (!col[hit].up) { if (hit === col.length - 1) { col[hit].up = true; } return; }
                    S.sel = { from: k, n: hit }; S.msg = '改选'; return;
                }
                // 移动：颜色交替 + 点数递减才放
                const seq = takeSeq(S);
                const t = col[col.length - 1];
                if (seq && t.up && t.r === seq[0].r + 1 && isRed(t.s) !== isRed(seq[0].s)) {
                    col.push(...seq); cutSource(S); S.sel = null; S.msg = '✔'; return chkWin(S, api);
                }
                S.msg = '❌ 放不上去（需颜色交替、点数比目标小 1）';
                return;
            }
        },
    });
    // —— solitaire 两段式移动的辅助 ——
    function takeSeq(S) {
        if (!S.sel) return null;
        if (S.sel.from === 'waste') { const c = S.waste[S.waste.length - 1]; return c ? [c] : null; }
        const col = S.tab[S.sel.from];
        if (S.sel.n == null || S.sel.n >= col.length) return null;
        return col.slice(S.sel.n);
    }
    function cutSource(S) {
        if (S.sel.from === 'waste') { S.waste.pop(); return; }
        const col = S.tab[S.sel.from];
        col.length = S.sel.n;
        if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true;
    }
    function hl(ctx, x, y, w, h) {
        ctx.save();
        ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 9;
        ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.restore();
    }
    function tryFnd(S, c, from) {
        if (S.fnd[c.s] !== c.r - 1) return false;
        S.fnd[c.s] = c.r;
        if (from === 'waste') S.waste.pop(); else S.tab[from].pop();
        return true;
    }
    function tryTab(S, c, from) {
        for (let k = 0; k < 7; k++) {
            const col = S.tab[k];
            if (!col.length) { if (c.r === 13) { col.push(c); if (from === 'waste') S.waste.pop(); else S.tab[from].pop(); return true; } continue; }
            const t = col[col.length - 1];
            if (t.up && t.r === c.r + 1 && isRed(t.s) !== isRed(c.s)) {
                col.push(c); if (from === 'waste') S.waste.pop(); else S.tab[from].pop(); return true;
            }
        }
        return false;
    }
    function trySeq(S, seq, from) {
        const head = seq[0];
        for (let k = 0; k < 7; k++) {
            if (k === from) continue;
            const col = S.tab[k];
            if (!col.length) continue;
            const t = col[col.length - 1];
            if (t.up && t.r === head.r + 1 && isRed(t.s) !== isRed(head.s)) {
                col.push(...seq); S.tab[from].length -= seq.length;
                if (S.tab[from].length && !S.tab[from][S.tab[from].length - 1].up) S.tab[from][S.tab[from].length - 1].up = true;
                return true;
            }
        }
        return tryTab(S, head, from);
    }
    function chkWin(S, api) {
        if (S.fnd.every(v => v === 13)) api.finish({ win: true, stars: 3, lines: ['全部归位，接龙成功！'] });
    }

    // ============ 2. 蜘蛛纸牌（拖拽 + 点击自动移动）============
    E.def('spider', {
        levels: E.nm(),
        params: (i, t) => ({ strict: i > 9, cols: 8 }),
        w: 396, h: 500,
        hint: '拖动牌串放到目标列（松手自动落位）；也可点牌自动移动。凑齐 K→A 整条即消除',
        init: P => {
            const d = deck(1).slice(0, 48);   // 48 张：8 列 × 4 张 + 16 张牌库
            const cols = Array.from({ length: 8 }, () => []);
            for (let n = 0; n < 4; n++) for (let k = 0; k < 8; k++) { const c = d.pop(); c.up = (n === 3); cols[k].push(c); }
            return { cols, stock: d, done: 0, msg: '开始！点牌库发一排', drag: null };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#1f4a5c', '#0d2230');
            const CW = 44, CH = 60;
            E.card(ctx, 8, 12, CW, CH, '#4a7fbf', '#22406f', 6);
            E.txt(ctx, '发' + S.stock.length, 8 + CW / 2, 42, 14, '#fff', true);
            const dragging = S.drag && S.drag.moved;
            for (let k = 0; k < 8; k++) {
                const col = S.cols[k], x = 8 + k * 48;
                // 拖起的牌串不再画在原位
                const lim = (dragging && S.drag.from === k) ? S.drag.n : col.length;
                for (let n = 0; n < lim; n++) paint(ctx, x, 88 + n * 20, CW, CH, col[n], !col[n].up);
                // 目标列高亮（松手可放的列）
                if (dragging && S.drag.from !== k && col.length) {
                    const top = col[col.length - 1], seq0 = S.cols[S.drag.from][S.drag.n];
                    if (seq0 && top && top.r === seq0.r + 1 && (!P.strict || top.s === seq0.s)) {
                        ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 2.5;
                        ctx.strokeRect(x - 2, 88 + (col.length - 1) * 20 - 2, CW + 4, CH + 4);
                    }
                }
            }
            // 拖拽中的牌串：跟随指针 + 浮起阴影
            if (dragging) {
                const col = S.cols[S.drag.from];
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 10;
                for (let i = S.drag.n; i < col.length; i++) {
                    paint(ctx, S.drag.x - CW / 2, S.drag.y - 26 + (i - S.drag.n) * 20, CW, CH, col[i]);
                }
                ctx.restore();
            }
            E.txt(ctx, `已消除 ${S.done} 条 · ${S.msg}`, W / 2, H - 14, 14, '#cfe8f0');
        },
        // 按下：牌库立即发牌；明牌串则记录拖拽起点（松手未拖动 → 走点击自动移动）
        tap(S, x, y, P, api) {
            const CW = 44, CH = 60;
            S.drag = null;
            if (hitc(x, y, 8, 12, CW, CH)) {
                if (S.stock.length >= 8 && S.cols.every(c => c.length)) {
                    for (let k = 0; k < 8; k++) { const c = S.stock.pop(); c.up = true; S.cols[k].push(c); }
                } else S.msg = '每列都要有牌才能发';
                return;
            }
            for (let k = 0; k < 8; k++) {
                const col = S.cols[k], bx = 8 + k * 48;
                for (let n = 0; n < col.length; n++) {
                    const cy = 88 + n * 20;
                    const isTop = n === col.length - 1;
                    if (isTop ? hitc(x, y, bx, cy, CW, CH) : (x >= bx && x <= bx + CW && y >= cy && y <= cy + 20)) {
                        if (!col[n].up) return;
                        // 检查 [n..] 是否为合法降序串
                        let ok = true;
                        for (let m = n; m < col.length - 1; m++) {
                            if (col[m].r !== col[m + 1].r + 1) { ok = false; break; }
                            if (P.strict && col[m].s !== col[m + 1].s) { ok = false; break; }
                        }
                        if (!ok) return;
                        S.drag = { from: k, n, x0: x, y0: y, x, y, moved: false };
                        return;
                    }
                }
            }
        },
        drag(S, x, y, P, api, dx, dy) {
            if (!S.drag) return;
            if (!S.drag.moved && Math.hypot(dx, dy) > 6) S.drag.moved = true;
            S.drag.x = x; S.drag.y = y;
        },
        // 松手：拖动过 → 按指针所在列落位（非法弹回）；未拖动 → 点击自动移动
        dragend(S, x, y, P, api) {
            const d = S.drag;
            if (!d) return;
            S.drag = null;
            const px = x != null ? x : d.x;
            const col = S.cols[d.from];
            if (d.moved) {
                const t = Math.max(0, Math.min(7, Math.floor((px - 8) / 48)));
                if (t !== d.from) {
                    const tc = S.cols[t];
                    const top = tc[tc.length - 1];
                    const seq = col.slice(d.n);
                    if (top && top.r === seq[0].r + 1 && (!P.strict || top.s === seq[0].s)) {
                        tc.push(...seq); col.length = d.n;
                        if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true;
                        spClear(S); return chkSp(S, api);
                    }
                }
                return;   // 非法落点：弹回原位
            }
            // 点击（未拖动）：自动找最佳目标列
            const seq = col.slice(d.n);
            for (let t = 0; t < 8; t++) {
                if (t === d.from) continue;
                const tc = S.cols[t];
                const top = tc[tc.length - 1];
                if (!tc.length || !top) continue;
                if (top.r === seq[0].r + 1 && (!P.strict || top.s === seq[0].s)) {
                    tc.push(...seq); col.length = d.n;
                    if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true;
                    spClear(S); return chkSp(S, api);
                }
            }
        },
    });
    function spClear(S) {
        for (let k = 0; k < 8; k++) {
            const col = S.cols[k];
            if (col.length < 13) continue;
            const tail = col.slice(-13);
            let ok = tail[0].r === 13 && tail.every((c, i) => i === 0 || c.up) ;
            for (let i = 0; i < 12; i++) if (tail[i].r !== tail[i + 1].r + 1) ok = false;
            if (ok) { col.length -= 13; S.done++; if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true; }
        }
    }
    function chkSp(S, api) { if (S.done >= 3) api.finish({ win: true, stars: 3, lines: [`消除了 ${S.done} 条序列！`] }); }

    // ============ 3. 空当接龙 ============
    E.def('freecell', {
        levels: E.nm(),
        params: () => ({}),
        desc: (i, t) => '空当接龙 · 第 ' + (i + 1) + ' 局',
        w: 396, h: 500,
        hint: '点牌自动移动到基础区 / 空当区 / 可叠放列，把 52 张全部归位即胜',
        init: () => {
            const d = deck();
            const cols = Array.from({ length: 8 }, () => []);
            d.forEach((c, i) => { c.up = true; cols[i % 8].push(c); });
            return { cols, free: [null, null, null, null], fnd: [0, 0, 0, 0], msg: '开始！' };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f52', '#1a1430');
            const CW = 44, CH = 60;
            for (let k = 0; k < 4; k++) {
                const x = 8 + k * 48;
                if (S.free[k]) paint(ctx, x, 10, CW, CH, S.free[k]);
                else { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.strokeRect(x, 10, CW, CH); }
            }
            for (let k = 0; k < 4; k++) {
                const x = 212 + k * 48;
                if (S.fnd[k]) paint(ctx, x, 10, CW, CH, { r: S.fnd[k], s: k });
                else { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.strokeRect(x, 10, CW, CH); E.txt(ctx, SU[k], x + CW / 2, 40, 20, 'rgba(255,255,255,.35)', true); }
            }
            for (let k = 0; k < 8; k++) {
                const col = S.cols[k], x = 8 + k * 48;
                for (let n = 0; n < col.length; n++) paint(ctx, x, 82 + n * 20, CW, CH, col[n]);
            }
            E.txt(ctx, S.msg, W / 2, H - 14, 14, '#d8c8f0');
        },
        tap(S, x, y, P, api) {
            const CW = 44, CH = 60;
            for (let k = 0; k < 4; k++) if (S.free[k] && hitc(x, y, 8 + k * 48, 10, CW, CH)) {
                const c = S.free[k];
                if (S.fnd[c.s] === c.r - 1) { S.fnd[c.s] = c.r; S.free[k] = null; return chkFc(S, api); }
                for (let t = 0; t < 8; t++) { const col = S.cols[t]; const top = col[col.length - 1]; if (!top || (top.r === c.r + 1 && isRed(top.s) !== isRed(c.s))) { col.push(c); S.free[k] = null; return; } }
                return;
            }
            for (let k = 0; k < 8; k++) {
                const col = S.cols[k], bx = 8 + k * 48;
                if (col.length && hitc(x, y, bx, 82 + (col.length - 1) * 20, CW, CH)) {
                    const c = col[col.length - 1];
                    if (S.fnd[c.s] === c.r - 1) { S.fnd[c.s] = c.r; col.pop(); return chkFc(S, api); }
                    const fi = S.free.indexOf(null);
                    if (fi >= 0 && col.length === 1) { S.free[fi] = c; col.pop(); return; }
                    for (let t = 0; t < 8; t++) {
                        if (t === k) continue;
                        const tc = S.cols[t], top = tc[tc.length - 1];
                        if (!top) { if (col.length > 1) { tc.push(c); col.pop(); return; } continue; }
                        if (top.r === c.r + 1 && isRed(top.s) !== isRed(c.s)) { tc.push(c); col.pop(); return; }
                    }
                    return;
                }
            }
        },
    });
    function chkFc(S, api) { if (S.fnd.every(v => v === 13)) api.finish({ win: true, stars: 3, lines: ['空当接龙全部归位！'] }); }

    // ============ 4. 金字塔 ============
    E.def('pyramid', {
        levels: E.nm(),
        params: (i, t) => ({ deals: Math.max(1, 3 - Math.floor(i / 7)) }),
        w: 396, h: 480,
        hint: '点击两张合计 13 的牌即可消除（K 单独消），清空金字塔即胜',
        init: P => {
            const d = deck();
            const rows = [];
            for (let r = 0; r < 7; r++) { const row = []; for (let k = 0; k <= r; k++) { const c = d.pop(); c.up = true; row.push(c); } rows.push(row); }
            return { rows, stock: d, waste: [], deals: P.deals, sel: null, msg: '选两张和为 13 的牌' };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#4a3a26', '#241a10');
            const CW = 46, CH = 58;
            for (let r = 0; r < 7; r++) for (let k = 0; k <= r; k++) {
                const c = S.rows[r][k]; if (!c) continue;
                const x = W / 2 - (r + 1) * 24 + k * 48, y = 46 + r * 44;
                const on = S.sel && S.sel.r === r && S.sel.k === k;
                if (on) { ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3; ctx.strokeRect(x - 2, y - 2, CW + 4, CH + 4); }
                paint(ctx, x, y, CW, CH, c);
            }
            E.card(ctx, 12, H - 78, CW, CH, '#4a7fbf', '#22406f', 6);
            E.txt(ctx, '牌堆' + S.stock.length, 12 + CW / 2, H - 49, 13, '#fff', true);
            if (S.waste.length) paint(ctx, 70, H - 78, CW, CH, S.waste[S.waste.length - 1]);
            E.txt(ctx, S.msg, W / 2, H - 16, 14, '#f0e0c8');
        },
        tap(S, x, y, P, api) {
            const CW = 46, CH = 58;
            if (hitc(x, y, 12, 480 - 78, CW, CH)) {
                if (!S.stock.length) { if (S.deals > 0) { S.deals--; while (S.waste.length) S.stock.push(S.waste.pop()); } }
                else { const c = S.stock.pop(); c.up = true; S.waste.push(c); if (S.sel && S.sel.r === -1) { pyTry(S, -1, c); } }
                return;
            }
            for (let r = 0; r < 7; r++) for (let k = 0; k <= r; k++) {
                if (!S.rows[r][k]) continue;
                const cx = 396 / 2 - (r + 1) * 24 + k * 48, cy = 46 + r * 44;
                if (!hitc(x, y, cx, cy, CW, CH)) continue;
                const c = S.rows[r][k];
                if (!S.sel) {
                    if (c.r === 13) { S.rows[r][k] = null; return chkPy(S, api); }
                    S.sel = { r, k }; return;
                }
                if (S.sel.r === r && S.sel.k === k) { S.sel = null; return; }
                if (pyFree(S, r, k) && (S.sel.r < 0 || pyFree(S, S.sel.r, S.sel.k))) {
                    const a = S.sel.r < 0 ? S.waste[S.waste.length - 1] : S.rows[S.sel.r][S.sel.k];
                    if (a && a.r + c.r === 13) {
                        if (S.sel.r < 0) S.waste.pop(); else S.rows[S.sel.r][S.sel.k] = null;
                        S.rows[r][k] = null; S.sel = null; return chkPy(S, api);
                    }
                }
                S.sel = { r, k };
            }
            // 已翻开的牌堆牌
            if (S.waste.length && hitc(x, y, 70, 480 - 78, CW, CH)) {
                const c = S.waste[S.waste.length - 1];
                if (!S.sel) { if (c.r === 13) { S.waste.pop(); return chkPy(S, api); } S.sel = { r: -1, k: 0 }; return; }
                const a = S.sel.r < 0 ? null : S.rows[S.sel.r][S.sel.k];
                if (a && pyFree(S, S.sel.r, S.sel.k) && a.r + c.r === 13) { S.rows[S.sel.r][S.sel.k] = null; S.waste.pop(); S.sel = null; return chkPy(S, api); }
                S.sel = { r: -1, k: 0 };
            }
        },
    });
    function pyFree(S, r, k) {
        if (r === 6) return true;
        return !S.rows[r + 1][k] && !S.rows[r + 1][k + 1];
    }
    function chkPy(S, api) {
        if (S.rows.every(row => row.every(c => !c))) api.finish({ win: true, stars: 3, lines: ['金字塔清空！'] });
    }

    // ============ 5. 21点 ============
    E.def('blackjack', {
        levels: E.nm(),
        params: (i, t) => ({ goal: 100 + i * 50 }),
        endless: { goal: 0 },
        w: 380, h: 440,
        hint: '凑到尽量接近 21 点但不爆牌；先达到目标筹码即胜',
        init: P => ({ cash: 100, goal: P.goal, bet: 10, hand: [], dealer: [], d: deck(), state: 'bet', msg: '下注并开局' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#1f5c3a', '#0a2418');
            E.txt(ctx, `💰 ${S.cash} / 目标 ${S.goal || '∞'}`, W / 2, 30, 18, '#ffd56b', true);
            E.txt(ctx, '庄家', W / 2, 62, 14, '#cfe8d8');
            S.dealer.forEach((c, i) => paint(ctx, 40 + i * 56, 74, 50, 70, c, S.state === 'play' && i === 1));
            E.txt(ctx, `你（${bjVal(S.hand)}）`, W / 2, 176, 14, '#cfe8d8');
            S.hand.forEach((c, i) => paint(ctx, 40 + i * 56, 190, 50, 70, c));
            if (S.state === 'bet') { E.btnBox(ctx, 40, H - 96, 130, 48, '开局 (' + S.bet + ')', '#8a5a2f', '#5a3a1c'); }
            else if (S.state === 'play') {
                E.btnBox(ctx, 30, H - 96, 100, 48, '要牌', '#2f7f4a', '#1a4a2a');
                E.btnBox(ctx, 140, H - 96, 100, 48, '停牌', '#8a3a3a', '#5a1a1a');
            } else { E.btnBox(ctx, 90, H - 96, 200, 48, '下一局', '#4a5a8f', '#2a3a5f'); }
            E.txt(ctx, S.msg, W / 2, H - 26, 15, '#f0e0c8');
        },
        tap(S, x, y, P, api) {
            const H = 440;
            if (S.state === 'bet') {
                if (E.hit(x, y, 40, H - 96, 130, 48)) { S.hand = [S.d.pop(), S.d.pop()]; S.dealer = [S.d.pop(), S.d.pop()]; S.state = 'play'; S.msg = '要牌还是停牌？'; if (bjVal(S.hand) === 21) bjStand(S, api); }
                return;
            }
            if (S.state === 'play') {
                if (E.hit(x, y, 30, H - 96, 100, 48)) {
                    S.hand.push(S.d.pop());
                    const v = bjVal(S.hand);
                    if (v > 21) { S.state = 'over'; S.cash -= S.bet; S.msg = `爆牌 ${v}，输 ${S.bet}`; bjEnd(S, api); }
                    else if (v === 21) bjStand(S, api);
                    return;
                }
                if (E.hit(x, y, 140, H - 96, 100, 48)) return bjStand(S, api);
                return;
            }
            if (E.hit(x, y, 90, H - 96, 200, 48)) {
                if (S.d.length < 20) S.d = deck();
                S.hand = [S.d.pop(), S.d.pop()]; S.dealer = [S.d.pop(), S.d.pop()]; S.state = 'play'; S.msg = '要牌还是停牌？';
                if (bjVal(S.hand) === 21) bjStand(S, api);
            }
        },
    });
    function bjVal(h) { let s = 0, a = 0; h.forEach(c => { const v = Math.min(10, c.r); s += v; if (c.r === 1) a++; }); while (a && s + 10 <= 21) { s += 10; a--; } return s; }
    function bjEnd(S, api) {
        if (S.goal && S.cash >= S.goal) return api.finish({ win: true, stars: 3, score: S.cash, lines: [`筹码达到 ${S.cash}`] });
        if (S.cash <= 0) return api.finish({ win: false, stars: 0, score: 0, lines: ['筹码输光了'] });
    }
    function bjStand(S, api) {
        while (bjVal(S.dealer) < 17) S.dealer.push(S.d.pop());
        const p = bjVal(S.hand), d = bjVal(S.dealer);
        S.state = 'over';
        if (d > 21 || p > d) { S.cash += S.bet; S.msg = `你 ${p} vs 庄 ${d} · 赢 ${S.bet}`; }
        else if (p === d) S.msg = `平局 ${p}`;
        else { S.cash -= S.bet; S.msg = `你 ${p} vs 庄 ${d} · 输 ${S.bet}`; }
        bjEnd(S, api);
    }

    // ============ 6. 五张比牌 ============
    E.def('poker', {
        levels: E.nm(),
        params: (i, t) => ({ rounds: 5 + Math.floor(i / 4) }),
        w: 396, h: 460,
        hint: '点选要换掉的牌，再点「换牌」，牌型大者胜',
        init: P => ({ d: deck(), hand: [], ai: [], sel: [false,false,false,false,false], round: 1, rounds: P.rounds, score: 0, phase: 'draw', msg: '换掉不要的牌' }),
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#2f3a52', '#141c2c');
            E.txt(ctx, `第 ${S.round}/${S.rounds} 局 · 胜 ${S.score}`, W / 2, 26, 16, '#ffd56b', true);
            if (!S.hand.length) { S.hand = [0,1,2,3,4].map(() => S.d.pop()); S.ai = [0,1,2,3,4].map(() => S.d.pop()); }
            S.hand.forEach((c, i) => {
                const x = 24 + i * 70, y = 60;
                if (S.sel[i]) { ctx.fillStyle = 'rgba(255,213,107,.3)'; ctx.fillRect(x - 3, y - 3, 56, 76); }
                paint(ctx, x, y, 50, 70, c);
            });
            E.txt(ctx, S.phase === 'draw' ? '你的牌（点选要换的）' : '结果', W / 2, 160, 14, '#c8d0e0');
            E.btnBox(ctx, 40, H - 92, 140, 46, '换牌', '#2f7f4a', '#1a4a2a');
            E.btnBox(ctx, 200, H - 92, 140, 46, '不换', '#5a5a7f', '#3a3a5f');
            if (S.phase === 'show') {
                S.ai.forEach((c, i) => paint(ctx, 24 + i * 70, 250, 50, 70, c));
                E.txt(ctx, `你：${S.pn}　电脑：${S.an}`, W / 2, 340, 15, '#fff', true);
                E.txt(ctx, S.msg, W / 2, 368, 16, '#ffd56b', true);
                E.btnBox(ctx, 110, H - 148, 160, 44, '下一局', '#4a5a8f', '#2a3a5f');
            } else E.txt(ctx, S.msg, W / 2, 380, 14, '#c8d0e0');
        },
        tap(S, x, y, P, api) {
            const H = 460;
            if (S.phase === 'show') {
                if (E.hit(x, y, 110, H - 148, 160, 44)) pkNext(S, api, P);
                return;
            }
            for (let i = 0; i < 5; i++) if (E.hit(x, y, 24 + i * 70, 60, 50, 70)) { S.sel[i] = !S.sel[i]; return; }
            if (E.hit(x, y, 40, H - 92, 140, 46)) { S.sel.forEach((s, i) => { if (s) S.hand[i] = S.d.pop(); }); pkShow(S); }
            if (E.hit(x, y, 200, H - 92, 140, 46)) pkShow(S);
        },
    });
    function pkNext(S, api, P) {
        if (S.round >= S.rounds) {
            return api.finish(S.score > S.rounds / 2
                ? { win: true, stars: 3, lines: [`${S.rounds} 局胜 ${S.score} 局`] }
                : { win: false, stars: 0, lines: [`只胜 ${S.score} 局`] });
        }
        S.round++; S.sel = [false,false,false,false,false]; S.phase = 'draw'; S.msg = '换掉不要的牌';
        if (S.d.length < 20) S.d = deck();
        S.hand = [0,1,2,3,4].map(() => S.d.pop()); S.ai = [0,1,2,3,4].map(() => S.d.pop());
    }
    function pkScore(h) {
        const cnt = {}, suits = {};
        h.forEach(c => { cnt[c.r] = (cnt[c.r] || 0) + 1; suits[c.s] = (suits[c.s] || 0) + 1; });
        const cs = Object.values(cnt).sort((a, b) => b - a), rs = h.map(c => c.r).sort((a, b) => a - b);
        const flush = Object.values(suits).some(v => v === 5);
        const str = rs.every((v, i) => i === 0 || v === rs[i - 1] + 1) || (rs.join() === '1,10,11,12,13');
        if (flush && str) return [8, '同花顺'];
        if (cs[0] === 4) return [7, '四条'];
        if (cs[0] === 3 && cs[1] === 2) return [6, '葫芦'];
        if (flush) return [5, '同花'];
        if (str) return [4, '顺子'];
        if (cs[0] === 3) return [3, '三条'];
        if (cs[0] === 2 && cs[1] === 2) return [2, '两对'];
        if (cs[0] === 2) return [1, '一对'];
        return [0, '散牌'];
    }
    function pkShow(S) {
        // 电脑：保留对子以上，换掉其余
        const cnt = {};
        S.ai.forEach(c => cnt[c.r] = (cnt[c.r] || 0) + 1);
        S.ai = S.ai.map(c => cnt[c.r] >= 2 ? c : S.d.pop());
        const a = pkScore(S.hand), b = pkScore(S.ai);
        S.pn = a[1]; S.an = b[1]; S.phase = 'show';
        if (a[0] > b[0]) { S.score++; S.msg = '这局你赢！'; }
        else if (a[0] === b[0]) S.msg = '平局';
        else S.msg = '这局电脑赢';
    }

    // ============ 7. 纸牌大战 ============
    E.def('war', {
        levels: E.nm(),
        params: (i, t) => ({ n: 8 + Math.floor(i / 2) }),
        w: 380, h: 420,
        hint: '每回合双方翻一张，点数大者赢（本模式平局各得 1 分）',
        init: P => {
            const d = deck();
            return { p: d.slice(0, 26), a: d.slice(26), ps: 0, as: 0, n: 0, total: P.n, pc: null, ac: null, msg: '点击翻牌' };
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#3a2f52', '#1a1430');
            E.txt(ctx, `第 ${S.n + 1}/${S.total} 回合　你 ${S.ps} : ${S.as} 电脑`, W / 2, 28, 16, '#ffd56b', true);
            E.card(ctx, 60, 90, 90, 126, '#4a7fbf', '#22406f', 10);
            if (S.pc) paint(ctx, 60, 90, 90, 126, S.pc);
            E.card(ctx, 230, 90, 90, 126, '#bf4a5f', '#6f2028', 10);
            if (S.ac) paint(ctx, 230, 90, 90, 126, S.ac);
            E.txt(ctx, S.pc ? '你 ' + RK[S.pc.r] : '你', 105, 242, 15, '#cfe0ff', true);
            E.txt(ctx, S.ac ? '敌 ' + RK[S.ac.r] : '电脑', 275, 242, 15, '#ffd0d0', true);
            E.btnBox(ctx, 110, H - 96, 160, 50, S.n >= S.total ? '结算' : '翻牌', '#8a5a2f', '#5a3a1c');
            E.txt(ctx, S.msg, W / 2, H - 26, 15, '#d8c8f0');
        },
        tap(S, x, y, P, api) {
            const H = 420;
            if (!E.hit(x, y, 110, H - 96, 160, 50)) return;
            if (S.n >= S.total) {
                return api.finish(S.ps > S.as ? { win: true, stars: 3, lines: [`${S.ps} : ${S.as} 获胜`] }
                    : S.ps === S.as ? { win: true, stars: 2, lines: ['平局'] } : { win: false, stars: 0, lines: [`${S.ps} : ${S.as} 落败`] });
            }
            S.pc = S.p.pop(); S.ac = S.a.pop(); S.n++;
            if (S.pc.r > S.ac.r) { S.ps++; S.msg = '你赢这回合！'; }
            else if (S.pc.r < S.ac.r) { S.as++; S.msg = '电脑赢这回合'; }
            else { S.ps++; S.as++; S.msg = '平局，各得 1 分'; }
            if (S.n >= S.total) S.msg += '（点结算）';
        },
    });

})();
