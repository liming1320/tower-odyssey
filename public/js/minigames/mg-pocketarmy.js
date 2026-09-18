// 口袋奇兵（Count Masters 风格）：竖屏俯视下落式
//   - 玩家方阵（Q 版方块小兵）固定在屏幕底部，左右滑动移动
//   - 障碍物从屏幕顶部下落：蓝门 +N / 红门 -N / 木桶（得 buff）/ 敌人（撞减血）
//   - 走到目标距离 = 胜利（无尽模式继续向前）
//   - 兵力归零 = 失败
window.MiniGames = window.MiniGames || {};
(function () {
    const E = (window.MG && window.MG.eng) || {};
    // 统一角色系统：主角=骑士（蓝甲金饰），士兵=多原型混编（真人/猫娘/机器人/Q版）
    // 直接复用引擎 MG.char，告别"圆头圆身子"
    const heroCfg = { arch: 'knight', skin: '#f5cda0', hair: { style: 1, color: '#2b2b3a' }, cloth: { c1: '#3a8fd0', c2: '#1f5a98' }, accent: '#ffd56b', eye: '#26324a', expr: 'focus', acc: 'none', face: 1 };
    const scache = {};
    const soldierCfg = (i) => {
        if (!scache[i]) {
            const c = MG.char.gen(500 + i * 13);
            c.arch = ['human', 'chibi', 'robot', 'cat'][i % 4];
            c.cloth = { c1: '#9ab0e8', c2: '#5a6fae' };
            c.face = 1; c.expr = 'focus';
            scache[i] = c;
        }
        return scache[i];
    };
    E.def && E.def('pocketarmy', {
        levels: [
            '草地', '乡间', '山路', '竹林', '石径', '雪原', '吊桥', '深渊', '云海', '星河',
            '彩虹', '极光', '冰裂', '砂砾', '沙漠', '绿洲', '海面', '峡谷', '长城', '月光',
            '烈阳', '晨曦', '黄昏', '暮色', '夜幕', '风暴', '雷霆', '烈火', '寒冰', '樱花',
            '金叶', '枫林', '雾凇', '琉璃', '水晶', '琥珀', '玛瑙', '翡翠', '玄铁', '紫金',
            '赤霄', '耀金', '圣光', '暗影', '轮回', '涅槃', '归一', '永恒', '归元', '万军'
        ],
        params: (i, t) => ({
            t,                                                    // 进度 0..1
            target: 800 + Math.floor(i * 60),                    // 行军距离
            initArmy: 6 + Math.floor(i / 4),                     // 初始兵力
            atk: 1 + Math.floor(i / 6),                          // 攻击力
            spawnGap: Math.max(0.55, 1.4 - 0.7 * t),             // 出怪间隔
            enemyMul: 0.6 + 0.5 * t,                             // 敌人密度（0.4 太稀，开局看不到射击）
            gateMul: 0.55 + 0.35 * t,                            // 加减门密度
        }),
        endless: { name: '无尽·远征', desc: '不停向前，看你能走多远' },
        hint: '👈👉 左右滑动移动方阵 · 蓝门增兵 / 红门减兵 / 撞敌人耗血 / 木桶得攻击力',
        w: 360, h: 560,
        init: P => ({
            army: P.initArmy || 6, atk: P.atk || 1,
            ox: 0,                  // 方阵 x 偏移（相对中心）
            dist: 0, target: P.target || 800,
            speed: 0,
            obstacles: [],          // {type:'gate'|'enemy'|'barrel', val, y, x, w, alive, hp?, taken, rot}
            bullets: [],            // 士兵自动射击的子弹 {x, y, vx, vy, dmg}
            sparks: [],             // 命中火花 {x, y, t, col}
            fireCd: 0,              // 开火冷却
            ticker: 0,
            spawnGap: P.spawnGap || 1,
            enemyMul: P.enemyMul || 0.6,
            gateMul: P.gateMul || 0.7,
            buff: 0,                // 攻击力 buff 倒计时
            finishAt: 0,
            animPhase: 0,
            touchDX: 0,
            pointerId: -1,
            pointerStartX: 0,
            oxStart: 0,
        }),
        draw: (ctx, S, P, W, H, api) => {
            // 背景：天 → 草
            let bg = null; try { bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#a3d8f0'); bg.addColorStop(0.7, '#cae9bb'); bg.addColorStop(1, '#7bb96d'); } catch (e) { }
            ctx.fillStyle = bg || '#7bb96d'; ctx.fillRect(0, 0, W, H);
            // 远山（横向带状）
            ctx.fillStyle = '#8aac7d';
            ctx.beginPath();
            ctx.moveTo(0, H * 0.32);
            ctx.lineTo(W * 0.18, H * 0.26); ctx.lineTo(W * 0.42, H * 0.32); ctx.lineTo(W * 0.7, H * 0.24);
            ctx.lineTo(W, H * 0.32); ctx.lineTo(W, H * 0.5); ctx.lineTo(0, H * 0.5);
            ctx.closePath(); ctx.fill();

            // ---- 视差滚动层（用 S.dist 让世界向后跑，营造行军感）----
            const roll = S.dist % 400;
            // 云（最慢视差）
            const cloudDrift = (S.animPhase * 12) % (W + 120);
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            [[cloudDrift, 60, 1], [((cloudDrift + W * 0.55) % (W + 120)) - 60, 96, 0.7]].forEach(([cxx, cyy, cs]) => {
                ctx.beginPath();
                ctx.arc(cxx, cyy, 16 * cs, 0, Math.PI * 2);
                ctx.arc(cxx + 18 * cs, cyy - 6 * cs, 12 * cs, 0, Math.PI * 2);
                ctx.arc(cxx + 34 * cs, cyy, 14 * cs, 0, Math.PI * 2);
                ctx.fill();
            });
            // 路旁树（快视差，左右两排）
            const treeSpots = [[16, 0], [46, 200], [22, 380], [W - 20, 100], [W - 44, 300], [W - 14, 480]];
            treeSpots.forEach(([tx, toff]) => {
                const ty = ((toff + roll) % 560) - 40;
                if (ty < -30 || ty > H - 60) return;
                ctx.save();
                ctx.translate(tx, ty);
                ctx.fillStyle = '#6a4a26'; ctx.fillRect(-3, 8, 6, 16);
                let tg = null; try { tg = ctx.createRadialGradient(-4, -6, 2, 0, 0, 18); tg.addColorStop(0, '#5cb85c'); tg.addColorStop(1, '#2e7a3a'); } catch (e) { }
                ctx.fillStyle = tg || '#3a8a46';
                ctx.beginPath(); ctx.arc(0, -2, 14, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            });
            // 路面小草（最快视差）
            ctx.strokeStyle = 'rgba(60,120,50,0.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
            for (let k = 0; k < 7; k++) {
                const gy = ((k * 80 + roll * 1.2) % 560) - 20;
                if (gy < 0 || gy > H - 70) continue;
                const side = k % 2 ? 8 : W - 10;
                ctx.beginPath(); ctx.moveTo(side, gy); ctx.lineTo(side - 3, gy - 7); ctx.moveTo(side, gy); ctx.lineTo(side + 3, gy - 6); ctx.stroke();
            }
            // 桥面（底部横线，队伍站在上）
            ctx.fillStyle = '#7a5028'; ctx.fillRect(0, H - 60, W, 14);
            ctx.fillStyle = '#5a3818';
            for (let i = 0; i < W; i += 28) ctx.fillRect(i, H - 50, 18, 4);
            // 终点旗（顶部中央）
            const finishY = 30;
            ctx.fillStyle = '#cf2020'; ctx.fillRect(W / 2 - 2, finishY, 4, 50);
            ctx.beginPath(); ctx.moveTo(W / 2 + 2, finishY); ctx.lineTo(W / 2 + 38, finishY + 20); ctx.lineTo(W / 2 + 2, finishY + 38); ctx.closePath();
            ctx.fillStyle = '#ffd56b'; ctx.fill();

            // 进度条（屏幕左侧竖条：行军距离）
            ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(4, 4, 6, H - 8);
            const prog = Math.min(1, S.dist / S.target);
            const progY = 4 + (H - 8) * (1 - prog);
            ctx.fillStyle = '#ffd56b'; ctx.fillRect(4, progY, 6, (H - 8) * prog);

            // 障碍物（按 y 坐标从顶往下掉）
            for (const o of S.obstacles) {
                const sx = o.x;
                const sy = o.y;
                if (sy < -50 || sy > H + 50) continue;
                if (o.type === 'gate') {
                    // 门：竖条 + 顶标
                    ctx.fillStyle = o.val >= 0 ? '#3a7fd0' : '#d04848';
                    ctx.fillRect(sx - 28, sy - 40, 56, 80);
                    // 顶条
                    ctx.fillStyle = o.val >= 0 ? '#5cc7ff' : '#ff7a7a';
                    ctx.fillRect(sx - 30, sy - 46, 60, 6);
                    // 数字
                    ctx.font = 'bold 32px "Microsoft YaHei"'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText((o.val >= 0 ? '+' : '') + o.val, sx, sy);
                    // 门框
                    ctx.lineWidth = 3; ctx.strokeStyle = '#1a1f2e'; ctx.strokeRect(sx - 28, sy - 40, 56, 80);
                } else if (o.type === 'barrel') {
                    ctx.save();
                    ctx.translate(sx, sy);
                    ctx.rotate(o.rot || 0);
                    ctx.fillStyle = '#a06820';
                    ctx.beginPath(); ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#7a4818';
                    ctx.fillRect(-16, -12, 32, 24);
                    ctx.lineWidth = 2; ctx.strokeStyle = '#3a2410'; ctx.stroke();
                    // 木纹
                    ctx.strokeStyle = '#5a3010'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(12, -8); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
                    // 撞击标记
                    if (o.taken) {
                        ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 3;
                        ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
                        ctx.fillStyle = 'rgba(255,213,107,0.4)'; ctx.fill();
                    }
                    ctx.restore();
                } else if (o.type === 'enemy' && o.alive) {
                    // 敌人：用统一角色系统绘制（红色机器人，凶狠表情 + 引擎血条）
                    const wob = Math.sin(S.animPhase * 6 + o.x) * 2;   // 左右摇摆
                    const cfg = { arch: 'robot', skin: '#cfd6e6', hair: { style: 0, color: '#7a1020' }, cloth: { c1: '#e0586a', c2: '#a01f33' }, accent: '#ffd56b', eye: '#1a0a0a', expr: 'angry', acc: 'none', face: -1 };
                    MG.char.draw(ctx, sx + wob, sy + 18, 0.42, cfg, { t: S.animPhase, pose: 'idle', face: -1 });
                    // 血条（引擎统一血条）
                    const hp = o.hp, max = o.maxHp;
                    MG.gfx.bar(ctx, sx - 18, sy - 30, 36, 5, hp / max, { color: hp > max * 0.3 ? '#7ad86a' : '#ff7a8b' });
                    ctx.font = 'bold 11px Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
                    ctx.fillText(hp, sx, sy - 36);
                }
            }

            // ---- 子弹（亮黄圆头弹 + 拖尾 + 命中火花）----
            for (const b of S.bullets) {
                ctx.save();
                // 拖尾：沿速度反方向（飞行动感）
                const blen = 0.075;
                const grad = (() => { try { const g2 = ctx.createLinearGradient(b.x, b.y, b.x - b.vx * blen, b.y - b.vy * blen); g2.addColorStop(0, 'rgba(255,224,138,0.95)'); g2.addColorStop(1, 'rgba(255,213,107,0)'); return g2; } catch (e) { return 'rgba(255,213,107,0.5)'; } })();
                ctx.strokeStyle = grad; ctx.lineWidth = 5; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * blen, b.y - b.vy * blen); ctx.stroke();
                // 弹体（发光圆）
                ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 10;
                ctx.fillStyle = '#ffe08a';
                ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(b.x - 1, b.y - 1, 1.8, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
            for (const sp of S.sparks) {
                const k = sp.t / 0.25;
                ctx.save();
                ctx.globalAlpha = 1 - k;
                ctx.strokeStyle = sp.col; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(sp.x, sp.y, 4 + k * 14, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }

            // 玩家方阵：底部 V 字形摆开（统一角色系统绘制）
            const baseX = W / 2 + S.ox;
            const baseY = H - 90;
            const N = S.army;
            const ph = S.animPhase;
            const drawChar = (cfg, x, y, sz) => {
                MG.char.draw(ctx, x, y + sz * 0.5, sz / 30, cfg, { t: ph, pose: 'walk', face: 1 });
            };
            // 主角（骑士，蓝甲金饰，持枪）
            drawChar(heroCfg, baseX, baseY - 14, 20);
            ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(baseX + 12, baseY - 14 - 2); ctx.lineTo(baseX + 12, baseY - 14 - 16); ctx.stroke();
            // 队伍（每排 4 个，V 字向下散开；总宽根据 N 自动伸缩）
            const cols = 4;
            const rowH = 17;
            let si = 0;
            for (let i = 1; i < N; i++) {
                const row = Math.floor((i - 1) / cols);
                const col = (i - 1) % cols;
                const inRow = Math.min(cols, N - 1 - row * cols);
                const dx = (col - (inRow - 1) / 2) * 19;
                const dy = row * rowH + 5;
                const ox = baseX + dx, oy = baseY - dy;
                if (oy < H * 0.55) break;
                drawChar(soldierCfg(si++), ox, oy - 8, 14);
            }
            // 队伍数字徽章
            ctx.fillStyle = 'rgba(255,213,107,0.95)';
            ctx.beginPath(); ctx.arc(baseX - 26, baseY - 38, 11, 0, Math.PI * 2); ctx.fill();
            ctx.font = 'bold 11px Arial'; ctx.fillStyle = '#1a1f2e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('×' + S.army, baseX - 26, baseY - 38);
            // 攻击力 buff 倒计时（主角头上）
            if (S.buff > 0) {
                ctx.fillStyle = '#ffd56b';
                ctx.font = 'bold 14px "Microsoft YaHei"'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText('⚔×' + (S.atk + 1) + ' ' + Math.ceil(S.buff) + 's', baseX + 16, baseY - 36);
            }

            // 顶部 HUD
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, 36);
            ctx.font = 'bold 13px "Microsoft YaHei"'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText('👥 ×' + S.army + '   ⚔ ×' + S.atk + '   📏 ' + Math.floor(S.dist) + ' / ' + S.target, 8, 18);
            ctx.textAlign = 'right';
            ctx.fillText(P._i || 1 + ' 关', W - 8, 18);

            // 终局覆盖
            if (S.finishAt) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
                ctx.font = 'bold 28px "Microsoft YaHei"'; ctx.fillStyle = S.army > 0 ? '#ffd56b' : '#ff7a8b';
                ctx.fillText(S.army > 0 ? '🏆 抵达终点！' : '💥 全军覆没', W / 2, H / 2 - 20);
                ctx.font = '14px "Microsoft YaHei"'; ctx.fillStyle = '#fff';
                ctx.fillText(S.army + ' 名士兵冲到终点 · 行军 ' + Math.floor(S.dist) + ' 米', W / 2, H / 2 + 20);
            }
        },
        tap: (S, x, y, P, api, W) => {
            // 触摸开始：记录触点（drag 会自动接管）
            S.pointerId = 1; S.pointerStartX = x; S.oxStart = S.ox;
        },
        drag: (S, x, y, P, api, dx, dy) => {
            // 拖动：直接平移方阵
            const W = api.W || 360;
            S.ox = (S.oxStart || 0) + dx;
            const limit = W / 2 - 16;
            if (S.ox > limit) S.ox = limit;
            if (S.ox < -limit) S.ox = -limit;
        },
        key: (S, k, P, api) => {
            if (S.finishAt) return;
            const step = 18;
            if (k === 'ArrowLeft') S.ox = Math.max(-150, S.ox - step);
            else if (k === 'ArrowRight') S.ox = Math.min(150, S.ox + step);
        },
        tick: (S, dt, P, api) => {
            const W = api.W || 360;
            const H = api.H || 560;
            const baseX = W / 2 + S.ox;      // 注意：射击代码也用，必须先声明（曾因 TDZ 报错冻结整个 tick）
            const baseY = H - 90;
            if (S.finishAt) {
                S.finishAt += dt;
                if (S.finishAt > 1.6) {
                    const win = S.army > 0;
                    api.finish({
                        win, stars: win ? (S.army >= (P.initArmy || 6) * 1.5 ? 3 : S.army >= (P.initArmy || 6) ? 2 : 1) : 0,
                        score: Math.floor(S.dist) + S.army * 50,
                        lines: [`到达距离 ${Math.floor(S.dist)}`, `剩余兵力 ${S.army}`]
                    });
                }
                return;
            }
            S.animPhase += dt;
            if (S.buff > 0) S.buff -= dt;

            // 行军距离增长（自动向前）
            S.dist += 90 * dt;

            // 障碍物下落
            S.ticker += dt;
            if (S.ticker >= S.spawnGap) {
                S.ticker = 0;
                const x = 40 + Math.random() * (W - 80);
                const r = Math.random();
                if (r < 0.55 * S.gateMul) {
                    // 门
                    const val = (Math.random() < 0.65 ? 1 : -1) * (1 + Math.floor(Math.random() * (3 + Math.floor(P.t * 4))));
                    S.obstacles.push({ type: 'gate', val, x, y: -50, w: 56, alive: true });
                } else if (r < 0.78) {
                    // 木桶
                    S.obstacles.push({ type: 'barrel', x, y: -50, w: 36, taken: false, rot: 0 });
                } else {
                    // 敌人
                    const lv = 1 + Math.floor(Math.random() * (3 + Math.floor(P.t * 3)));
                    S.obstacles.push({ type: 'enemy', x, y: -50, w: 36, hp: lv, maxHp: lv, alive: true });
                }
            }
            // 障碍物更新（下移 + 木桶旋转）
            for (const o of S.obstacles) {
                o.y += 220 * dt;
                if (o.type === 'barrel') o.rot = (o.rot || 0) + 3 * dt;
            }
            // ---- 自动射击：方阵向最近的敌人开火（兵力越多火力越猛）----
            S.fireCd -= dt;
            if (S.fireCd <= 0) {
                let target = null;
                for (const o of S.obstacles) if (o.type === 'enemy' && o.alive && o.y > -30) {
                    if (!target || o.y > target.y) target = o;   // 最靠近的敌人
                }
                if (target) {
                    S.fireCd = 0.34;
                    try { MG.audio.sfx('launch'); } catch (e) {}
                    const n = S.army >= 25 ? 3 : S.army >= 10 ? 2 : 1;   // 兵力 = 火力
                    for (let i = 0; i < n; i++) {
                        const sx0 = baseX + (i - (n - 1) / 2) * 10;
                        const dx = target.x - sx0, dy = target.y - (H - 130);
                        const len = Math.max(1, Math.hypot(dx, dy));
                        const spd = 480;
                        S.bullets.push({ x: sx0, y: H - 130, vx: dx / len * spd, vy: dy / len * spd, dmg: S.atk + (S.buff > 0 ? 1 : 0) });
                    }
                } else S.fireCd = 0.12;   // 没有目标时短轮询
            }
            // ---- 子弹飞行 + 命中 ----
            for (const b of S.bullets) {
                b.x += b.vx * dt; b.y += b.vy * dt;
                for (const o of S.obstacles) {
                    if (o.type !== 'enemy' || !o.alive) continue;
                    if (Math.abs(b.x - o.x) < 20 && Math.abs(b.y - o.y) < 22) {
                        o.hp -= b.dmg; b.dead = true;
                        S.sparks.push({ x: b.x, y: b.y, t: 0, col: '#ffd56b' });
                        if (o.hp <= 0) {
                            o.alive = false;
                            try { MG.audio.sfx('target'); } catch (e) {}
                            S.sparks.push({ x: o.x, y: o.y, t: 0, col: '#ff9d5c' });
                            S.sparks.push({ x: o.x - 8, y: o.y + 6, t: -0.06, col: '#ffd56b' });
                            S.sparks.push({ x: o.x + 8, y: o.y - 4, t: -0.06, col: '#ffd56b' });
                        }
                        break;
                    }
                }
            }
            S.bullets = S.bullets.filter(b => !b.dead && b.y > -30 && b.x > -30 && b.x < W + 30);
            for (const sp of S.sparks) sp.t += dt;
            S.sparks = S.sparks.filter(sp => sp.t < 0.25);
            // 碰撞（方阵 = 主角位置 ± 半宽）—— baseX/baseY 已在 tick 开头声明
            for (const o of S.obstacles) {
                if (!o.alive && !o.taken) continue;
                const dy = Math.abs(o.y - baseY);
                const dx = Math.abs(o.x - baseX);
                if (dy < 30 && dx < 28) {
                    if (o.type === 'gate') {
                        if (o.val > 0) S.army = Math.max(1, S.army + o.val);
                        else S.army = Math.max(1, S.army + o.val);   // val 已是负数，最少 1
                        o.alive = false;
                        try { MG.audio.sfx(o.val > 0 ? 'coin' : 'click'); } catch (e) {}
                    } else if (o.type === 'barrel' && !o.taken) {
                        o.taken = true;
                        S.buff = 6;
                        try { MG.audio.sfx('coin'); } catch (e) {}
                    } else if (o.type === 'enemy' && o.alive) {
                        const atk = S.atk + (S.buff > 0 ? 1 : 0);
                        o.hp -= atk;
                        S.army = Math.max(0, S.army - 1);
                        if (o.hp <= 0) o.alive = false;
                        if (S.army <= 0) { S.finishAt = 0.001; return; }
                    }
                }
            }
            // 清理越界
            S.obstacles = S.obstacles.filter(o => o.y < H + 80);
            // 终点
            if (S.dist >= S.target) {
                S.finishAt = 0.001;
            }
        },
        score: S => `行军 ${Math.floor(S.dist)} / ${S.target} · 兵力 ${S.army}`,
    });
})();