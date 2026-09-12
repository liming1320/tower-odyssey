// 烹饪发烧友 / Cooking Fever 风格：读单做菜 · 托盘凑齐客人订单即上菜 · 别让客人等到走人
// 玩法：底部 4 种食材一键制作 → 托盘(最多 3 件)凑齐某位客人的订单会「自动上菜」(也可点该客人上菜)
//       客人有耐心条，等太久会走人并扣 1 颗❤；3 颗❤掉光或限时内没达到标服务数即失败
(function () {
    const E = MG.eng, U = MG.ui;
    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

    // 食材定义（值越高越值钱）
    const ITEMS = [
        { id: 'burger', e: '🍔', name: '汉堡', v: 12 },
        { id: 'fries', e: '🍟', name: '薯条', v: 8 },
        { id: 'drink', e: '🥤', name: '饮料', v: 6 },
        { id: 'ice', e: '🍦', name: '冰淇淋', v: 9 },
    ];
    const MAP = {};
    ITEMS.forEach(it => MAP[it.id] = it);

    // 5 个客人槽位 x 坐标
    const XS = [34, 107, 180, 253, 326];
    const W = 360, H = 560;

    // 圆角矩形（兼容无 ctx.roundRect 的环境）
    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // 随机订单：1~maxItems 件（允许重复）
    function randOrder(maxItems) {
        const n = ri(1, Math.min(3, maxItems));
        const o = [];
        for (let k = 0; k < n; k++) o.push(ITEMS[ri(0, ITEMS.length - 1)].id);
        return o;
    }

    // 多重集合相等（顺序无关、数量一致）
    function sameMul(a, b) {
        if (a.length !== b.length) return false;
        const ca = {}, cb = {};
        for (const x of a) ca[x] = (ca[x] || 0) + 1;
        for (const x of b) cb[x] = (cb[x] || 0) + 1;
        for (const k in ca) if (ca[k] !== cb[k]) return false;
        return true;
    }

    function spawnCust(S) {
        if (S.queue.length >= S.MAXQ) return;
        const used = new Set(S.queue.map(c => c.slot));
        let slot = -1;
        for (let i = 0; i < 5; i++) if (!used.has(i)) { slot = i; break; }
        if (slot < 0) return;
        S.queue.push({
            slot, order: randOrder(S.maxItems),
            pat: S.pat, patMax: S.pat, state: 'wait', anim: 0,
            hue: ri(0, 360), style: ri(0, 4), bob: Math.random() * 6.28,
        });
    }

    // 上菜：托盘正好等于某位等待客人的订单则上（preferIdx 指定则只认该客人）
    function tryServe(S, api, preferIdx) {
        if (!S.tray.length) return false;
        let best = -1, bestPat = Infinity;
        S.queue.forEach((c, i) => {
            if (c.state !== 'wait') return;
            if (!sameMul(S.tray, c.order)) return;
            if (preferIdx != null && i !== preferIdx) return;
            if (c.pat < bestPat) { bestPat = c.pat; best = i; }
        });
        if (best < 0) return false;
        const c = S.queue[best];
        let reward = 0;
        c.order.forEach(id => reward += MAP[id].v);
        reward += Math.round(5 * (c.pat / c.patMax));   // 耐心越多小费越高
        S.coin += reward; S.served++;
        c.state = 'happy'; c.anim = 0.6;
        S.tray = [];
        const cx = XS[c.slot];
        if (api && api.pop) api.pop(cx, 150, '+' + reward, { color: '#ffd56b' });
        if (api && api.fx) api.fx.burst(cx, 150, { n: 10, color: '#ffd56b' });
        return true;
    }

    function finishWin(S, api) {
        if (S.over) return;
        S.over = true;
        const stars = S.heart >= 3 ? 3 : S.heart >= 2 ? 2 : 1;
        api.finish({
            win: true, stars, score: S.coin,
            lines: [`服务 ${S.served} 位客人 · 赚得 ${S.coin} 金币`, S.heart >= 3 ? '完美出餐，滴水未漏 🌟' : '手速不错，再快些更稳！'],
        });
    }
    function finishLose(S, api) {
        if (S.over) return;
        S.over = true;
        api.finish({
            win: false, stars: 0, score: S.coin,
            lines: [`服务 ${S.served}/${S.target} 位客人`, '客人跑光啦，再来一次！'],
        });
    }

    // ---------------- 绘制 ----------------
    function drawCust(ctx, S, c) {
        const cx = XS[c.slot];
        const by = 158 + Math.sin(c.bob * 2.2) * 2;
        const hairHue = c.hue;
        const clothHue = (c.hue + 150) % 360;
        const hair = `hsl(${hairHue},48%,46%)`;
        const hairD = `hsl(${hairHue},50%,34%)`;
        const cloth = `hsl(${clothHue},55%,58%)`;
        const clothD = `hsl(${clothHue},55%,42%)`;
        const skin = '#ffe0c4';
        ctx.save();
        if (c.state === 'angry') ctx.globalAlpha = 0.5 + 0.5 * Math.max(0, c.anim / 0.5);

        // 影子
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        ctx.beginPath(); ctx.ellipse(cx, 196, 24, 7, 0, 0, 6.283); ctx.fill();

        // 身体（圆润 Q 版，带领口）
        ctx.fillStyle = clothD; rr(ctx, cx - 20, by + 6, 40, 34, 14); ctx.fill();
        ctx.fillStyle = cloth; rr(ctx, cx - 16, by + 8, 32, 28, 12); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';           // 小领子
        ctx.beginPath(); ctx.moveTo(cx - 7, by + 8); ctx.lineTo(cx, by + 16); ctx.lineTo(cx + 7, by + 8); ctx.closePath(); ctx.fill();

        // 手臂搭在台面 + 手
        ctx.strokeStyle = clothD; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 16, by + 15); ctx.quadraticCurveTo(cx - 25, by + 26, cx - 19, by + 35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 16, by + 15); ctx.quadraticCurveTo(cx + 25, by + 26, cx + 19, by + 35); ctx.stroke();
        ctx.fillStyle = skin;
        ctx.beginPath(); ctx.ellipse(cx - 19, by + 37, 4.2, 3.4, 0, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 19, by + 37, 4.2, 3.4, 0, 0, 6.283); ctx.fill();
        // 小皮鞋
        ctx.fillStyle = '#4a3428';
        ctx.beginPath(); ctx.ellipse(cx - 8, by + 42, 5.5, 3, 0, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 8, by + 42, 5.5, 3, 0, 0, 6.283); ctx.fill();

        // 后发（根据发型）
        const hx = cx, hy = by - 14;
        ctx.fillStyle = hair;
        if (c.style === 1) {                                // 双马尾
            ctx.beginPath(); ctx.ellipse(hx - 22, hy + 4, 8, 16, 0.3, 0, 6.283); ctx.fill();
            ctx.beginPath(); ctx.ellipse(hx + 22, hy + 4, 8, 16, -0.3, 0, 6.283); ctx.fill();
        } else if (c.style === 2) {                         // 长直发
            ctx.beginPath(); ctx.ellipse(hx, hy + 14, 21, 26, 0, 0, 6.283); ctx.fill();
        } else if (c.style === 3) {                         // 波波头
            ctx.beginPath(); ctx.ellipse(hx, hy + 6, 21, 20, 0, 0, 6.283); ctx.fill();
        } else {                                            // 短发
            ctx.beginPath(); ctx.ellipse(hx, hy + 2, 19, 18, 0, 0, 6.283); ctx.fill();
        }

        // 头
        ctx.fillStyle = skin;
        ctx.beginPath(); ctx.arc(hx, hy, 15, 0, 6.283); ctx.fill();

        // 脸颊腮红
        ctx.fillStyle = 'rgba(255,150,150,.45)';
        ctx.beginPath(); ctx.ellipse(hx - 9, hy + 4, 3.2, 2, 0, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.ellipse(hx + 9, hy + 4, 3.2, 2, 0, 0, 6.283); ctx.fill();

        // 眼睛（日漫大眼：眼白 + 虹膜 + 高光）
        const drawEye = (ex) => {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.ellipse(ex, hy + 1, 3.4, 4.6, 0, 0, 6.283); ctx.fill();
            ctx.fillStyle = hairD;
            ctx.beginPath(); ctx.ellipse(ex, hy + 1.5, 2.5, 3.6, 0, 0, 6.283); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(ex - 0.8, hy - 0.4, 1.1, 0, 6.283); ctx.fill();   // 高光
            ctx.fillStyle = 'rgba(0,0,0,.55)';
            ctx.beginPath(); ctx.arc(ex, hy + 1, 0.7, 0, 6.283); ctx.fill();           // 瞳孔底
        };
        drawEye(hx - 6);
        drawEye(hx + 6);

        // 嘴
        ctx.strokeStyle = '#a85a4a'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        if (c.state === 'happy') {
            ctx.beginPath(); ctx.arc(hx, hy + 7, 3, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
        } else if (c.state === 'angry') {
            ctx.beginPath(); ctx.arc(hx, hy + 10, 2.6, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(hx - 1.6, hy + 8); ctx.lineTo(hx + 1.6, hy + 8); ctx.stroke();
        }

        // 前发 / 刘海（盖住额头）
        ctx.fillStyle = hair;
        if (c.style === 0) {                                // 短发斜刘海
            ctx.beginPath();
            ctx.moveTo(hx - 16, hy - 4); ctx.quadraticCurveTo(hx - 4, hy - 14, hx + 16, hy - 6);
            ctx.quadraticCurveTo(hx + 6, hy - 2, hx - 2, hy + 2); ctx.quadraticCurveTo(hx - 10, hy - 2, hx - 16, hy - 4);
            ctx.fill();
        } else if (c.style === 1) {                         // 双马尾 + 中分刘海
            ctx.beginPath(); ctx.arc(hx, hy - 2, 15, Math.PI, 0); ctx.fill();
            ctx.fillRect(hx - 15, hy - 14, 5, 12); ctx.fillRect(hx + 10, hy - 14, 5, 12);
        } else if (c.style === 2) {                         // 长发齐刘海
            ctx.beginPath(); ctx.moveTo(hx - 15, hy - 8); ctx.quadraticCurveTo(hx, hy - 18, hx + 15, hy - 8);
            ctx.quadraticCurveTo(hx + 6, hy - 2, hx - 2, hy + 1); ctx.quadraticCurveTo(hx - 8, hy - 2, hx - 15, hy - 8); ctx.fill();
        } else {                                            // 波波头 + 呆毛
            ctx.beginPath(); ctx.arc(hx, hy - 2, 15, Math.PI, 0); ctx.fill();
            ctx.strokeStyle = hair; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(hx, hy - 15); ctx.quadraticCurveTo(hx + 4, hy - 24, hx + 1, hy - 26); ctx.stroke();
        }

        // 订单气泡
        const o = c.order, bw = 24 * o.length + 18, bx = cx - bw / 2, byy = by - 56;
        const matched = c.state === 'wait' && S.tray.length && sameMul(S.tray, o);
        ctx.fillStyle = c.state === 'happy' ? '#bfe8b0' : c.state === 'angry' ? '#e8b0b0' : '#fff';
        rr(ctx, bx, byy, bw, 30, 8); ctx.fill();
        ctx.strokeStyle = matched ? '#4ade4a' : 'rgba(0,0,0,.15)';
        ctx.lineWidth = matched ? 3 : 1.4;
        if (matched) { ctx.shadowColor = '#4ade4a'; ctx.shadowBlur = 10; }
        rr(ctx, bx, byy, bw, 30, 8); ctx.stroke(); ctx.shadowBlur = 0;
        // 气泡小尾巴
        ctx.fillStyle = ctx.fillStyle;
        ctx.beginPath(); ctx.moveTo(cx - 6, byy + 30); ctx.lineTo(cx + 6, byy + 30); ctx.lineTo(cx, byy + 38); ctx.fill();
        if (c.state === 'happy') U.emoji(ctx, '😊', cx, byy + 15, 20);
        else if (c.state === 'angry') U.emoji(ctx, '😠', cx, byy + 15, 20);
        else o.forEach((id, k) => U.emoji(ctx, MAP[id].e, bx + 15 + 24 * k, byy + 15, 18));
        // 耐心条
        if (c.state === 'wait') {
            const fr = Math.max(0, c.pat / c.patMax);
            ctx.fillStyle = 'rgba(0,0,0,.3)'; rr(ctx, cx - 22, 192, 44, 6, 3); ctx.fill();
            ctx.fillStyle = fr > 0.5 ? '#5cd65c' : fr > 0.25 ? '#ffd24a' : '#ff5a5a';
            rr(ctx, cx - 22, 192, 44 * fr, 6, 3); ctx.fill();
        }
        ctx.restore();
    }

    function drawTray(ctx, S) {
        const px = 180, py = 318;
        const matchedAny = S.queue.some(c => c.state === 'wait' && S.tray.length && sameMul(S.tray, c.order));
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        ctx.beginPath(); ctx.ellipse(px, py, 86, 30, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = matchedAny ? '#5a7a3a' : '#caa978';
        ctx.beginPath(); ctx.ellipse(px, py, 78, 24, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#e8d6b0';
        ctx.beginPath(); ctx.ellipse(px, py, 64, 17, 0, 0, 6.283); ctx.fill();
        ctx.restore();
        if (S.tray.length === 0) E.txt(ctx, '空盘 · 点食材制作', px, py, 13, 'rgba(60,40,20,.7)', true);
        else S.tray.forEach((id, k) => U.emoji(ctx, MAP[id].e, px - 30 + k * 30, py, 22));
        // 倒掉按钮
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); ctx.arc(300, 318, 18, 0, 6.283); ctx.fill();
        U.emoji(ctx, '🗑️', 300, 318, 18);
        ctx.restore();
        E.txt(ctx, '出餐区', 180, 360, 12, 'rgba(255,255,255,.32)', true);
    }

    function drawButtons(ctx, S) {
        const by = 415, bh = 118, bw = 78, bxs = [12, 98, 184, 270];
        ITEMS.forEach((it, i) => {
            const x = bxs[i], pr = S.press === i, full = S.tray.length >= 3;
            ctx.save();
            if (pr) ctx.translate(0, 2);
            const g = ctx.createLinearGradient(x, by, x, by + bh);
            g.addColorStop(0, full ? '#6a5a4a' : '#9a7a44');
            g.addColorStop(1, full ? '#3a2e22' : '#5e421e');
            ctx.fillStyle = g; rr(ctx, x, by, bw, bh, 12); ctx.fill();
            ctx.strokeStyle = pr ? '#ffd56b' : 'rgba(255,230,180,.4)';
            ctx.lineWidth = pr ? 3 : 1.4; rr(ctx, x, by, bw, bh, 12); ctx.stroke();
            U.emoji(ctx, it.e, x + bw / 2, by + 44, 40);
            E.txt(ctx, it.name, x + bw / 2, by + 90, 15, '#fff', true);
            E.txt(ctx, '+' + it.v, x + bw / 2, by + 108, 12, '#ffd56b', true);
            ctx.restore();
        });
    }

    E.def('cookingfever', {
        levels: E.nm(),
        params: (i, t) => ({
            target: 4 + Math.round(t * 14),
            time: 90,
            maxItems: 1 + Math.floor(t * 2),
            spawn: Math.max(1.1, 2.4 - t * 1.0),
            pat: 17 - t * 7,
        }),
        endless: { target: 99999, time: 0, maxItems: 3, spawn: 1.2, pat: 11 },
        w: W, h: H,
        hint: '点食材做菜 → 托盘凑齐客人订单自动上菜（也可点该客人上菜）· 别让客人等到走人',
        init: P => {
            const S = {
                heart: 3, coin: 0, served: 0, target: P.target, time: P.time || 0,
                tray: [], queue: [], spawnT: 0.6, MAXQ: 5, t: 0,
                pat: P.pat || 14, maxItems: P.maxItems || 1, spawn: P.spawn || 2,
                press: -1, pressT: 0, toast: '', toastT: 0, over: false,
            };
            spawnCust(S); spawnCust(S);
            if (window.__MG_TEST) window.__cook = S;
            return S;
        },
        draw(ctx, S, P, W, H) {
            E.bg(ctx, W, H, '#5a3a22', '#241008');
            // 顶部木台面分隔
            ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 248, W, 4);
            // HUD
            E.txt(ctx, `💰 ${S.coin}`, 14, 26, 18, '#ffd56b', true);
            E.txt(ctx, `🍽 ${S.served}/${S.target}`, W / 2, 24, 16, '#fff', true);
            if (P.time > 0) E.txt(ctx, `⏱ ${Math.ceil(S.time)}`, W / 2, 46, 14, S.time < 10 ? '#ff7a7a' : '#cfe0f8');
            let hx = W - 16;
            for (let i = 0; i < 3; i++) { U.emoji(ctx, i < S.heart ? '❤️' : '🤍', hx, 24, 18); hx -= 22; }
            S.queue.forEach(c => drawCust(ctx, S, c));
            drawTray(ctx, S);
            drawButtons(ctx, S);
            if (S.toastT > 0) {
                ctx.save(); ctx.globalAlpha = Math.min(1, S.toastT * 1.5);
                E.card(ctx, 40, H - 34, W - 80, 30, 'rgba(20,12,8,.85)', 'rgba(20,12,8,.85)', 8);
                E.txt(ctx, S.toast, W / 2, H - 19, 14, '#ffd56b', true);
                ctx.restore();
            }
        },
        tick(S, dt, P, api) {
            if (S.pressT > 0) { S.pressT -= dt; if (S.pressT <= 0) S.press = -1; }
            if (S.toastT > 0) S.toastT -= dt;
            if (P.time > 0) {
                S.time -= dt;
                if (S.time <= 0) { S.time = 0; return finishLose(S, api); }
            }
            S.spawnT -= dt;
            if (S.spawnT <= 0) { spawnCust(S); S.spawnT = S.spawn; }
            S.queue.forEach(c => {
                if (c.state === 'wait') {
                    c.pat -= dt; c.bob += dt;
                    if (c.pat <= 0) { c.state = 'angry'; c.anim = 0.5; S.heart--; S.toast = '客人等太久走了…'; S.toastT = 1.2; }
                } else { c.anim -= dt; if (c.anim <= 0) c._dead = true; }
            });
            // 自动上菜：托盘正好等于某客人订单
            if (S.tray.length) tryServe(S, api);
            if (S.queue.some(c => c._dead)) S.queue = S.queue.filter(c => !c._dead);
            if (S.heart <= 0) return finishLose(S, api);
            if (S.served >= S.target) return finishWin(S, api);
        },
        tap(S, x, y, P, api) {
            const by = 415, bh = 118, bw = 78, bxs = [12, 98, 184, 270];
            for (let i = 0; i < 4; i++) {
                if (E.hit(x, y, bxs[i], by, bw, bh)) {
                    if (S.tray.length >= 3) { S.toast = '盘子满了，先上菜或倒掉'; S.toastT = 0.9; }
                    else { S.tray.push(ITEMS[i].id); S.press = i; S.pressT = 0.12; }
                    return;
                }
            }
            if (Math.hypot(x - 300, y - 318) < 22) { S.tray = []; S.press = -1; return; }
            for (const c of S.queue) {
                if (c.state !== 'wait') continue;
                if (Math.hypot(x - XS[c.slot], y - 160) < 46) {
                    if (!tryServe(S, api, S.queue.indexOf(c))) { S.toast = '订单不符'; S.toastT = 0.8; }
                    return;
                }
            }
        },
        score(S, P) {
            return `💰${S.coin}  上菜 ${S.served}/${S.target}${P.time > 0 ? '  ⏱' + Math.ceil(S.time) : ''}`;
        },
    });
})();
