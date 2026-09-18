// 飞行棋（Aeroplane Chess / Ludo）
// 规则：4 色各 4 架飞机。掷到 6 才能起飞；按点数沿 52 格外圈前进一整圈后
//   拐进自己的 6 格归航跑道，正好点数到达即入库；踩到敌机把它撞回机场。
//   先把指定数量飞机全部送回家的获胜。支持 1~4 人本地同屏，其余由 AI 接管。
window.MiniGames = window.MiniGames || {};
(function () {
    const E = MG.eng;
    const RING = 52, HOME_IN = 6, FINISH = RING + HOME_IN;   // 归航 6 格，第 58 格入库
    const COLORS = ['#e8483c', '#f2c230', '#3a7fd5', '#3fae62'];
    const NAMES = ['红', '黄', '蓝', '绿'];
    const startOf = p => p * 13;
    const PIPS = {
        1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
        4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
        6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
    };

    // ---------- 几何 ----------
    function geo(W, H) {
        const cs = 20, B = cs * 13;
        const x0 = Math.round((W - B) / 2), y0 = 78;
        return { cs, B, x0, y0, cx: x0 + B / 2, cy: y0 + B / 2, R: B / 2 };
    }
    function ringPos(i, g) {
        const side = Math.floor(i / 13), off = i % 13;
        if (side === 0) return { x: g.x0 + off * g.cs, y: g.y0 };
        if (side === 1) return { x: g.x0 + 12 * g.cs, y: g.y0 + off * g.cs };
        if (side === 2) return { x: g.x0 + (12 - off) * g.cs, y: g.y0 + 12 * g.cs };
        return { x: g.x0, y: g.y0 + (12 - off) * g.cs };
    }
    function homePos(p, k, g) {
        const c = ringPos((startOf(p) + RING - 1) % RING, g);
        const f = 0.16 + k * 0.125;              // 沿「本方入口角 → 中心」的连线摆 6 格
        return { x: c.x + (g.cx - c.x) * f, y: c.y + (g.cy - c.y) * f };
    }
    function basePos(p, k, g) {
        const ang = -Math.PI / 2 + p * Math.PI / 2;
        const bx = g.cx + Math.cos(ang) * g.R * 0.56;
        const by = g.cy + Math.sin(ang) * g.R * 0.56;
        const dx = (k % 2 === 0 ? -1 : 1) * 13, dy = (k < 2 ? -1 : 1) * 13;
        return { x: bx + dx, y: by + dy };
    }

    // ---------- 逻辑 ----------
    function newPlanes() {
        const out = [];
        for (let p = 0; p < 4; p++) { const a = []; for (let k = 0; k < 4; k++) a.push({ rel: -1 }); out.push(a); }
        return out;
    }
    const absOf = (p, rel) => (startOf(p) + rel) % RING;
    function movable(pl, p, dice, planes) {
        const out = [];
        for (let k = 0; k < 4; k++) {
            const a = pl[p][k];
            if (a.rel >= FINISH) continue;
            if (a.rel < 0) { if (dice === 6) out.push(k); continue; }
            if (a.rel + dice <= FINISH) out.push(k);
        }
        return out;
    }
    // 落点上是否有敌机（返回被撞回机场的飞机列表）
    function land(p, rel, planes) {
        if (rel < 0 || rel > RING - 1) return [];
        const abs = absOf(p, rel);
        if (abs % 13 === 0) return [];               // 四个起飞格是安全格
        const hit = [];
        for (let q = 0; q < 4; q++) {
            if (q === p) continue;
            for (const a of planes[q]) {
                if (a.rel >= 0 && a.rel <= RING - 1 && absOf(q, a.rel) === abs) hit.push(a);
            }
        }
        return hit;
    }
    function hasOwn(pl, p, rel) {
        if (rel < 0 || rel > RING - 1) return false;
        const abs = absOf(p, rel);
        return pl[p].some(a => a.rel >= 0 && a.rel <= RING - 1 && absOf(p, a.rel) === abs);
    }
    function homeCount(pl, p) { return pl[p].filter(a => a.rel >= FINISH).length; }

    // AI 选棋：能撞就撞 > 能回家就回家 > 能起飞就起飞 > 走得最远的
    function aiPick(pl, p, dice, skill) {
        const cand = movable(pl, p, dice, pl);
        if (!cand.length) return -1;
        const scored = cand.map(k => {
            const a = pl[p][k];
            let v = 0;
            const nr = a.rel < 0 ? 0 : a.rel + dice;
            if (nr >= FINISH) v += 1000;
            const hit = land(p, nr, pl);
            v += hit.length * 400;
            if (a.rel < 0) v += 120;                       // 起飞
            v += nr * 2;                                   // 越靠前越好
            if (nr > RING && nr < FINISH) v += 60;         // 进归航道
            v += Math.random() * (1 - skill) * 220;        // 低难度时随机性更大
            return { k, v, nr };
        });
        scored.sort((a, b) => b.v - a.v);
        return scored[0].k;
    }

    if (window.__MG_TEST) {
        window.__ludoDbg = { geo, ringPos, homePos, basePos, movable, FINISH, RING, startOf };
    }

    E.def('ludo', {
        w: 400, h: 520,
        levels: E.nm(),
        hint: '点击「掷骰」→ 点选要走的飞机 · 掷 6 起飞并可再掷一次 · 撞掉敌机可让它回机场',
        params(i, t) {
            return {
                need: 1 + Math.min(3, Math.floor(t * 3.999)),      // 需送回家的飞机数 1→4
                skill: Math.min(1, 0.15 + t * 0.85),               // AI 水平
            };
        },
        desc(i, t, p) { return `${p.need} 架归航 · AI ${Math.round(p.skill * 100)}%`; },
        init(P) {
            return {
                pl: newPlanes(),
                turn: 0, dice: 0, rolling: false, phase: 'roll',
                opts: [], winner: -1, humans: 1, need: P.need || 1,
                msg: '点击掷骰开始', extra: false, t: 0, rnd: null,
            };
        },
        draw(ctx, S, P, W, H, api) {
            if (!S.rnd) S.rnd = api.rng(4242);
            const G = MG.gfx, g = geo(W, H);
            S._geo = g;
            G.scene(ctx, W, H, '#1b2340', '#080b18');

            // 顶部状态
            G.panel(ctx, 8, 8, W - 16, 62, '#2b3550', '#141a2c', 12);
            const cur = COLORS[S.turn];
            G.text(ctx, S.winner >= 0 ? `🏆 ${NAMES[S.winner]}方获胜！`
                : `当前：${NAMES[S.turn]}方${S.turn < S.humans ? '（你）' : '（AI）'}`,
                W / 2, 26, 15, S.winner >= 0 ? '#ffd56b' : '#fff', { bold: true });
            G.text(ctx, `目标 ${S.need} 架归航`, 20, 52, 12, '#b9c6de');
            // 归航进度
            for (let p = 0; p < 4; p++) {
                const x = W - 150 + p * 36;
                ctx.beginPath(); ctx.arc(x, 52, 9, 0, Math.PI * 2);
                ctx.fillStyle = COLORS[p]; ctx.fill();
                ctx.strokeStyle = p === S.turn ? '#fff' : 'rgba(0,0,0,.4)'; ctx.lineWidth = p === S.turn ? 2.5 : 1; ctx.stroke();
                G.text(ctx, String(homeCount(S.pl, p)), x, 52, 11, '#fff', { bold: true });
            }
            // 棋盘外框
            G.panel(ctx, g.x0 - 10, g.y0 - 10, g.B + 20, g.B + 20, '#26304d', '#0e1424', 14);
            // 外圈 52 格
            for (let i = 0; i < RING; i++) {
                const q = ringPos(i, g);
                const owner = Math.floor(i / 13);
                const isStart = i % 13 === 0;
                ctx.fillStyle = isStart ? COLORS[owner] : (i % 2 ? '#e9eef7' : '#d3dbe9');
                ctx.fillRect(q.x, q.y, g.cs, g.cs);
                if (!isStart && owner === S.turn) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(q.x, q.y, g.cs, g.cs); }
                ctx.strokeStyle = 'rgba(40,60,100,.35)'; ctx.lineWidth = 0.5;
                ctx.strokeRect(q.x + .25, q.y + .25, g.cs - .5, g.cs - .5);
                if (isStart) {
                    ctx.fillStyle = 'rgba(255,255,255,.9)';
                    ctx.beginPath();
                    const mx = q.x + g.cs / 2, my = q.y + g.cs / 2;
                    ctx.moveTo(mx, my - 5); ctx.lineTo(mx + 5, my + 4); ctx.lineTo(mx - 5, my + 4);
                    ctx.closePath(); ctx.fill();
                }
            }
            // 归航跑道
            for (let p = 0; p < 4; p++) {
                for (let k = 0; k < HOME_IN; k++) {
                    const q = homePos(p, k, g);
                    ctx.fillStyle = k === HOME_IN - 1 ? COLORS[p] : MG.gfx.rgba(COLORS[p], 0.35);
                    ctx.fillRect(q.x - 6, q.y - 6, 12, 12);
                    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.5;
                    ctx.strokeRect(q.x - 6, q.y - 6, 12, 12);
                }
            }
            // 中心
            const rg = ctx.createRadialGradient(g.cx, g.cy, 2, g.cx, g.cy, 26);
            rg.addColorStop(0, '#fff8dc'); rg.addColorStop(1, '#c9a227');
            ctx.beginPath(); ctx.arc(g.cx, g.cy, 26, 0, Math.PI * 2); ctx.fillStyle = rg; ctx.fill();
            G.text(ctx, '🏁', g.cx, g.cy, 20, '#7a5c10', { bold: true });

            // 机场
            for (let p = 0; p < 4; p++) {
                const c0 = basePos(p, 0, g), c2 = basePos(p, 2, g);
                const bx = Math.min(c0.x, c2.x) - 13, by = Math.min(c0.y, c2.y) - 13;
                G.panel(ctx, bx, by, 52, 52, MG.gfx.lighten(COLORS[p], .25), MG.gfx.darken(COLORS[p], .45), 10);
                for (let k = 0; k < 4; k++) {
                    const q = basePos(p, k, g);
                    const a = S.pl[p][k];
                    if (a.rel !== -1) continue;
                    drawPlane(ctx, q.x, q.y, COLORS[p], 6.5, p === S.turn);
                }
            }
            // 飞机（在外圈 / 归航道）
            for (let p = 0; p < 4; p++) {
                const cnt = {};
                for (let k = 0; k < 4; k++) {
                    const a = S.pl[p][k];
                    if (a.rel < 0) continue;
                    let q;
                    if (a.rel >= FINISH) q = { x: g.cx + (p % 2 ? 14 : -14), y: g.cy + (p < 2 ? -14 : 14) };
                    else if (a.rel >= RING) q = homePos(p, a.rel - RING, g);
                    else q = ringPos(absOf(p, a.rel), g);
                    q = { x: q.x + g.cs / 2, y: q.y + g.cs / 2 };
                    const key = Math.round(q.x) + ',' + Math.round(q.y);
                    cnt[key] = (cnt[key] || 0) + 1;
                    const off = (cnt[key] - 1) * 5;
                    const pick = S.opts.indexOf(k) >= 0 && S.turn === p;
                    if (pick) {
                        ctx.beginPath(); ctx.arc(q.x, q.y - off, 11, 0, Math.PI * 2);
                        ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 2.5; ctx.stroke();
                    }
                    drawPlane(ctx, q.x, q.y - off, COLORS[p], 7.5, pick);
                }
            }
            // 底部：骰子 + 提示
            const by = g.y0 + g.B + 22;
            G.panel(ctx, 8, by, W - 16, H - by - 8, '#222c46', '#0d1220', 12);
            drawDice(ctx, 40, by + 30, 26, S.dice, S.rolling);
            G.text(ctx, S.msg, 84, by + 30, 13, '#dce6f7');
            if (S.phase === 'roll' && S.winner < 0) {
                const bw = 108, bx = W / 2 - bw / 2, bty = by + 52;
                E.btnBox(ctx, bx, bty, bw, 34, S.rolling ? '掷骰中…' : '掷 骰', '#ff9d5c', '#b04818');
                S._btn = { x: bx, y: bty, w: bw, h: 34 };
            } else S._btn = null;
            G.text(ctx, `👥 本地 ${S.humans} 人（点此切换）`, W / 2, by + 100, 11, '#8fa2c4');
            S._pplBtn = { x: W / 2 - 70, y: by + 88, w: 140, h: 22 };
        },
        tap(S, x, y, P, api) {
            const g = S._geo; if (!g) return;
            if (S.winner >= 0) return;
            if (MG.pvp && MG.pvp.active && !MG.pvp.canMove()) return;   // 没轮到我方则锁输入
            // 人数切换
            if (S._pplBtn && E.hit(x, y, S._pplBtn.x, S._pplBtn.y, S._pplBtn.w, S._pplBtn.h)) {
                S.humans = S.humans >= 4 ? 1 : S.humans + 1;
                S.msg = `本地 ${S.humans} 人，其余由 AI 接管`;
                return;
            }
            if (S.rolling) return;
            if (S.turn >= S.humans) return;                 // AI 回合，玩家不能操作

            if (S.phase === 'roll') {
                const b = S._btn;
                if (!b || E.hit(x, y, b.x, b.y, b.w, b.h)) doRoll(S, P, api);
                return;
            }
            if (S.phase === 'pick') {
                for (const k of S.opts) {
                    const a = S.pl[S.turn][k];
                    let q;
                    if (a.rel < 0) q = basePos(S.turn, k, g);
                    else if (a.rel >= RING) q = homePos(S.turn, a.rel - RING, g);
                    else q = ringPos(absOf(S.turn, a.rel), g);
                    q = { x: q.x + g.cs / 2, y: q.y + g.cs / 2 };
                    if (Math.abs(x - q.x) < 16 && Math.abs(y - q.y) < 16) { doMove(S, P, api, k); return; }
                }
            }
        },
        score(S) { return homeCount(S.pl, MG.pvp && MG.pvp.active ? MG.pvp.side : 0) * 100; },
        check(S) {
            if (S.winner < 0) return null;
            if (MG.pvp && MG.pvp.active) {
                // 联机：从「我方」视角判定胜负（side 由房间决定）
                if (S.winner === MG.pvp.side) return { win: true, stars: 3, score: 1000 + homeCount(S.pl, S.winner) * 100, lines: ['全部归航！'] };
                return { win: false, stars: 0, score: homeCount(S.pl, MG.pvp.side) * 100, lines: [NAMES[S.winner] + '方先完成了'] };
            }
            if (S.winner === 0) return { win: true, stars: 3, score: 1000 + homeCount(S.pl, 0) * 100, lines: ['全部归航！'] };
            return { win: false, stars: 0, score: homeCount(S.pl, 0) * 100, lines: [NAMES[S.winner] + '方先完成了'] };
        },
        // ---- 联机（状态同步）接入：仅 mg-pvp 武装本游戏时生效，单人/PvE 零影响 ----
        net: {
            setup(S, P, api) {
                S.humans = 2;          // 联机 = 2 名真实玩家（红 vs 黄），不启用 AI
                S.net = true;
                S.need = P.need || 1;
                S.six = 0;
                S.rnd = api.rng(P.netSeed != null ? P.netSeed : 20260918); // 双端同种子（即便不走 RNG 也一致）
            },
            ser(S) {
                return {
                    pl: S.pl, turn: S.turn, dice: S.dice, rolling: S.rolling, phase: S.phase,
                    opts: S.opts, winner: S.winner, humans: S.humans, need: S.need,
                    msg: S.msg, extra: S.extra, six: S.six, t: S.t,
                };
            },
            apply(S, m) { Object.assign(S, m); },
        },
    });

    // ---------------- 回合流程 ----------------
    function doRoll(S, P, api) {
        if (S.rolling || S.winner >= 0) return;
        S.rolling = true; S.dice = 0; S.msg = '掷骰中…';
        api.later(() => {
            S.dice = 1 + Math.floor((S.rnd ? S.rnd() : Math.random()) * 6);
            S.rolling = false;
            try { MG.audio.sfx('click'); } catch (e) {}
            const opts = movable(S.pl, S.turn, S.dice, S.pl);
            if (!opts.length) {
                S.msg = `${NAMES[S.turn]}方掷出 ${S.dice}，无棋可走`;
                S.opts = [];
                S.phase = 'moving';   // 跳到下一回合前不暴露 roll：联机下本端/对端都不会误判为“该我掷骰”而重复落子
                if (api.net && api.net.on) api.net.commit();
                api.later(() => nextTurn(S, P, api), 700);
                return;
            }
            S.opts = opts; S.phase = 'pick';
            S.msg = `掷出 ${S.dice} · 点击要走的飞机`;
            if (S.turn >= S.humans) {
                api.later(() => {
                    const k = aiPick(S.pl, S.turn, S.dice, P.skill || 0.5);
                    if (k >= 0) doMove(S, P, api, k); else nextTurn(S, P, api);
                }, 620);
            } else if (opts.length === 1 && S.dice !== 6) {
                // 只有一个选择时自动走，省一次点击
                api.later(() => doMove(S, P, api, opts[0]), 380);
            }
            if (api.net && api.net.on) api.net.commit();
        }, 420);
    }
    function doMove(S, P, api, k) {
        if (S.phase !== 'pick') return;   // 防御：自动走(api.later 380ms)与手动 tap 竞态时，
                                          // 落子后 phase 已切走，旧定时器不要再重复移动（联机双落子分叉根因）
        const p = S.turn, a = S.pl[p][k], d = S.dice;
        if (a.rel < 0) { a.rel = 0; S.msg = `${NAMES[p]}方起飞！`; }
        else a.rel += d;
        const hit = land(p, a.rel, S.pl);
        for (const h of hit) h.rel = -1;
        try { MG.audio.sfx(hit.length ? 'target' : (a.rel >= FINISH ? 'coin' : 'click')); } catch (e) {}
        if (hit.length) S.msg = `${NAMES[p]}方撞掉了 ${hit.length} 架敌机！`;
        else if (a.rel >= FINISH) S.msg = `${NAMES[p]}方一架归航！`;
        if (homeCount(S.pl, p) >= S.need) { S.winner = p; S.opts = []; S.phase = 'over'; if (api.net && api.net.on) api.net.commit(); return; }
        S.opts = []; S.phase = 'moving';   // 落子后先进入「移动结算」非交互态：联机下本端/对端都不会把它误判为“该我掷骰”，避免重复落子/状态分叉
        // 掷 6 再来一次，但连掷 3 次强制换人（防止无限回合卡住）
        if (d === 6) {
            S.six = (S.six || 0) + 1;
            if (S.six >= 3) {
                S.six = 0;
                S.msg += ' · 连掷 3 次，换人';
                if (api.net && api.net.on) api.net.commit();   // 仍 moving，等 nextTurn 推进
                api.later(() => nextTurn(S, P, api), 600);
                return;
            }
            S.msg += ' · 掷出 6，再来一次';
            S.phase = 'roll';               // 明确回到 roll：仍是当前行动方(mySide===turn)的回合，仅该端会驱动，不会双端同掷
            if (api.net && api.net.on) api.net.commit();
            if (p >= S.humans) api.later(() => doRoll(S, P, api), 700);
            return;
        }
        S.six = 0;
        if (api.net && api.net.on) api.net.commit();   // moving 态已广播，两端都不会再误掷
        api.later(() => nextTurn(S, P, api), 520);
    }
    function nextTurn(S, P, api) {
        if (S.winner >= 0) return;
        S.extra = false;
        S.turn = (S.turn + 1) % (S.net ? 2 : 4);   // 联机 = 红(0)/黄(1) 双人对弈，回合计 2
        S.phase = 'roll'; S.dice = 0; S.opts = [];
        if (S.turn >= S.humans) {
            S.msg = `${NAMES[S.turn]}方（AI）回合…`;
            api.later(() => { if (S.winner < 0) doRoll(S, P, api); }, 500);
        } else S.msg = `轮到 ${NAMES[S.turn]}方，点击掷骰`;
        if (api.net && api.net.on) api.net.commit();
    }

    // ---------------- 绘制小工具 ----------------
    function drawPlane(ctx, x, y, color, r, hot) {
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y + 1.5, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, MG.gfx.lighten(color, .45)); g.addColorStop(1, color);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = hot ? '#ffd56b' : 'rgba(255,255,255,.85)'; ctx.lineWidth = hot ? 2 : 1.2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.beginPath();
        ctx.moveTo(x, y - r * .55); ctx.lineTo(x + r * .5, y + r * .45); ctx.lineTo(x, y + r * .15);
        ctx.lineTo(x - r * .5, y + r * .45); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
    function drawDice(ctx, x, y, s, v, rolling) {
        ctx.save();
        ctx.translate(x, y);
        if (rolling) ctx.rotate((Date.now() % 360) * Math.PI / 180 * 0.4);
        MG.gfx.panel(ctx, -s / 2, -s / 2, s, s, '#fff', '#c9cfdb', 7);
        if (v >= 1 && v <= 6) {
            const step = s * 0.28, r = s * 0.075;
            ctx.fillStyle = '#22304a';
            for (const [px, py] of PIPS[v]) {
                ctx.beginPath();
                ctx.arc(-step + px * step, -step + py * step, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
})();
