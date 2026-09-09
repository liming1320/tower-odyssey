// 三维弹球 · 太空军校生致敬版（100% 自研复刻，非原版文件）
//   经典弹球台玩法：弹簧发射 · 双挡板 · 缓冲器 · 弹弓 · 靶灯组 · 光道
//   控制：← / → 挡板 · ↓(空格) 按住蓄力松手发射
//   触屏：游戏中按住左/右半屏控制对应挡板 · 待发射时按住蓄力松手发射
//   50 关 = 目标分递增 · 3 球制 · 击破靶灯组与 bumper 连击得分
window.MiniGames = window.MiniGames || {};
(function () {
    const GW = 400, GH = 640;
    const BALL_R = 9, GRAV = 1350, DAMP = 0.82;
    const NAMES = [
        '新兵报到', '首次值勤', '巡航练习', '靶场训练', '引擎预热',
        '低轨巡航', '陨石带', '补给站', '信号中继', '例行巡逻',
        '异常警报', '拦截任务', '护送舰队', '深空扫描', '边境哨戒',
        '遭遇战', '虫洞边缘', '失重区', '太阳风暴', '中尉军衔',
        '精英小队', '突入敌阵', '防守反击', '电子对抗', '隐身行动',
        '上尉军衔', '斩首打击', '母舰攻略', '轨道空降', '决战准备',
        '少校军衔', '星域驰援', '要塞攻坚', '奇袭作战', '深入敌后',
        '绝地反击', '上校军衔', '总攻号令', '旗舰对决', '凯旋之师',
        '将军授勋', '传奇飞行员', '星际英雄', '宇宙勋章', '永恒荣耀',
        '无垠星海', '超新星', '事件视界', '时空尽头', '太空军校长',
    ];

    function lvP(idx) {
        const t = idx / 49;
        return {
            goal: 6000 + Math.floor(idx * idx * 9 + idx * 700),   // 目标分曲线
            bumperPow: 1 + 0.25 * t,                               // 缓冲器弹力
            grav: GRAV * (1 + 0.12 * t),
        };
    }

    // ---------- 几何小工具 ----------
    const dist2Seg = (px, py, x1, y1, x2, y2) => {
        const dx = x2 - x1, dy = y2 - y1;
        const L2 = dx * dx + dy * dy || 1;
        let tt = ((px - x1) * dx + (py - y1) * dy) / L2;
        tt = Math.max(0, Math.min(1, tt));
        const cx = x1 + tt * dx, cy = y1 + tt * dy;
        return { d: Math.hypot(px - cx, py - cy), cx, cy };
    };

    MiniGames.pinball = {
        LEVELS: NAMES.map((name, i) => {
            const P = lvP(i);
            return { name, desc: `军衔挑战 · 目标 ${P.goal.toLocaleString()} 分 · 3 球` };
        }),
        ENDLESS: { name: '∞ 无尽', desc: '无限球数挑战最高分，重力强化' },

        start(container, opts) {
            opts = opts || {};
            const idx0 = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const endless = !!opts.endless;
            const P = lvP(Math.min(49, idx0 + (endless ? 20 : 0)));
            const { c, ctx, w, h, destroy } = MG.canvas(container, GW, GH);
            let t = 0, over = false, endT = 0;

            // ---- 台面状态 ----
            let score = 0, balls = endless ? Infinity : 3, launched = false;
            let ball = { x: 366, y: 560, vx: 0, vy: 0 };
            let plunger = 0, plungerHold = false;
            let L = { ang: 0.42 }, R = { ang: -0.42 };   // 挡板角度（正=收起）
            let LHold = false, RHold = false;
            let combo = 0, comboT = 0;
            const lights = { bump: [0, 0, 0], targets: [false, false, false, false], lanes: [false, false, false] };

            // ---- 台面元素几何 ----
            // 挡板转轴
            const LP = { x: 152, y: 556 }, RP = { x: 248, y: 556 };
            const FLIP_L = 62, FLIP_R = 62;
            const flipTip = (p, ang, dir) => ({ x: p.x + dir * Math.cos(ang) * FLIP_L, y: p.y + Math.sin(ang) * FLIP_L });
            // 圆缓冲器
            const bumpers = [
                { x: 128, y: 210, r: 26, score: 150 },
                { x: 200, y: 160, r: 26, score: 250 },
                { x: 272, y: 210, r: 26, score: 150 },
            ];
            // 弹弓（挡板上方两侧三角形）
            const slings = [
                { pts: [[92, 480], [128, 540], [92, 540]], score: 80 },
                { pts: [[308, 480], [272, 540], [308, 540]], score: 80 },
            ];
            // 靶灯组（左侧竖排）
            const targets = [
                { x: 60, y: 300 }, { x: 60, y: 340 }, { x: 60, y: 380 }, { x: 60, y: 420 },
            ];
            // 光道（顶部三柱之间）
            const lanes = [
                { x: 150, y: 95 }, { x: 200, y: 88 }, { x: 250, y: 95 },
            ];
            // 墙（多边形边界：主台面 + 发射通道）
            const walls = [
                // 主台面外墙（顺时针）：左墙 → 顶弧 → 右墙（通道左侧）
                { x1: 18, y1: 620, x2: 18, y2: 120 },
                { x1: 18, y1: 120, x2: 46, y2: 48 },
                { x1: 46, y1: 48, x2: 150, y2: 26 },
                { x1: 150, y1: 26, x2: 250, y2: 26 },
                { x1: 250, y1: 26, x2: 348, y2: 52 },
                { x1: 348, y1: 52, x2: 348, y2: 120 },   // 通道左上沿
                { x1: 348, y1: 120, x2: 348, y2: 470 },   // 通道左壁
                { x1: 348, y1: 470, x2: 316, y2: 500 },   // 右下导入斜坡
                // 排水口两侧 + 挡板底座
                { x1: 92, y1: 540, x2: 92, y2: 620 },
                { x1: 308, y1: 540, x2: 308, y2: 620 },
                { x1: 18, y1: 620, x2: 92, y2: 620 },
                { x1: 308, y1: 620, x2: 392, y2: 620 },
                // 发射通道右壁
                { x1: 392, y1: 120, x2: 392, y2: 620 },
                { x1: 392, y1: 60, x2: 392, y2: 120 },
                { x1: 348, y1: 120, x2: 392, y2: 60 },    // 顶部弧导入
            ];
            // 光道柱（物理：窄柱分隔三条通道，球穿行经过计分）
            for (const ln of lanes) {
                walls.push({ x1: ln.x - 14, y1: 60, x2: ln.x - 14, y2: 116 });
                walls.push({ x1: ln.x + 6, y1: 60, x2: ln.x + 6, y2: 116 });
            }

            // ---- 输入 ----
            const keys = new Set();
            const kd = e => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space', 'KeyZ', 'Slash', 'Period'].includes(e.code)) e.preventDefault();
                keys.add(e.code);
            };
            const ku = e => keys.delete(e.code);
            window.addEventListener('keydown', kd);
            window.addEventListener('keyup', ku);
            // 触屏：游戏中左/右半屏 = 挡板；待发射时按住蓄力
            const tstart = e => {
                const r = c.getBoundingClientRect();
                const p = e.touches[0];
                const x = (p.clientX - r.left) / r.width * GW;
                if (!launched) { plungerHold = true; return; }
                if (x < GW / 2) LHold = true; else RHold = true;
            };
            const tend = () => { LHold = RHold = false; plungerHold = false; };
            c.addEventListener('touchstart', tstart, { passive: true });
            c.addEventListener('touchend', tend, { passive: true });

            const addScore = v => {
                score += Math.round(v * (1 + combo * 0.1));
                comboT = 2;
                if (!endless && score >= P.goal && !over) finish(true);
            };
            const finish = win => {
                if (over) return;
                over = true;
                const stars = win ? (balls >= 3 ? 3 : balls >= 2 ? 2 : 1) : 0;
                opts.onComplete && opts.onComplete({
                    win, stars,
                    score: endless ? score : score + (win ? 1000 : 0),
                    title: endless ? '🏅 无尽挑战结束' : (win ? '🏆 任务达成！' : '💥 球已用完'),
                    lines: [
                        `得分 ${score.toLocaleString()}${endless ? '' : ' / 目标 ' + P.goal.toLocaleString()}`,
                        `最高连击 ×${combo}`,
                        endless ? `重力强化 · 目标即挑战` : '',
                    ].filter(Boolean),
                });
            };

            // ---- 物理：球反射 ----
            const reflect = (nx, ny, speedMin) => {
                const dot = ball.vx * nx + ball.vy * ny;
                ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny;
                const sp = Math.hypot(ball.vx, ball.vy);
                if (sp < speedMin) { const k = speedMin / (sp || 1); ball.vx *= k; ball.vy *= k; }
            };
            const hitWallSeg = (x1, y1, x2, y2, bounce) => {
                const { d, cx, cy } = dist2Seg(ball.x, ball.y, x1, y1, x2, y2);
                if (d < BALL_R) {
                    let nx = ball.x - cx, ny = ball.y - cy;
                    const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
                    ball.x = cx + nx * BALL_R; ball.y = cy + ny * BALL_R;
                    reflect(nx, ny, bounce || 120);
                    return true;
                }
                return false;
            };

            const step = dt => {
                t += dt;
                if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
                // 发射
                if (!launched) {
                    ball.x = 370; ball.y = 566 - plunger * 0;
                    if (plungerHold || keys.has('ArrowDown') || keys.has('Space')) plunger = Math.min(1, plunger + dt * 1.4);
                    else if (plunger > 0.08) {
                        ball.vy = -(420 + 560 * plunger);
                        ball.vx = 0;
                        launched = true;
                        plunger = 0;
                    } else plunger = Math.max(0, plunger - dt * 2);
                    return;
                }
                // 重力 + 积分（子步防穿透）
                const SUB = 4;
                for (let s = 0; s < SUB; s++) {
                    ball.vy += P.grav * dt / SUB;
                    // 台面倾斜微扰（增添真实感）
                    ball.vx += Math.sin(t * 0.7) * 6 * dt / SUB;
                    ball.x += ball.vx * dt / SUB;
                    ball.y += ball.vy * dt / SUB;
                    // 外墙
                    for (const wl of walls) hitWallSeg(wl.x1, wl.y1, wl.x2, wl.y2, 100);
                    // bumper
                    for (let i = 0; i < bumpers.length; i++) {
                        const b = bumpers[i];
                        const dx = ball.x - b.x, dy = ball.y - b.y;
                        const d = Math.hypot(dx, dy);
                        if (d < b.r + BALL_R) {
                            const nx = dx / (d || 1), ny = dy / (d || 1);
                            ball.x = b.x + nx * (b.r + BALL_R); ball.y = b.y + ny * (b.r + BALL_R);
                            reflect(nx, ny, 300 * P.bumperPow);
                            addScore(b.score); combo++;
                            lights.bump[i] = 1;
                        }
                    }
                    // 弹弓
                    for (const sg of slings) {
                        for (let i = 0; i < 3; i++) {
                            const a = sg.pts[i], b2 = sg.pts[(i + 1) % 3];
                            const before = { x: ball.x, y: ball.y };
                            if (hitWallSeg(a[0], a[1], b2[0], b2[1], 480)) {
                                // 命中前面（斜边）才给分强弹
                                if (i === 0) { addScore(sg.score); combo++; }
                                else ball.x = before.x, ball.y = before.y;
                            }
                        }
                    }
                    // 靶灯组（方形靶）
                    for (let i = 0; i < targets.length; i++) {
                        const tg = targets[i];
                        if (Math.abs(ball.x - tg.x) < BALL_R + 9 && Math.abs(ball.y - tg.y) < BALL_R + 9) {
                            if (!lights.targets[i]) {
                                lights.targets[i] = true;
                                addScore(600); combo++;
                                // 顶开靶面（反弹）
                                const nx = ball.x < tg.x ? -1 : 1;
                                reflect(nx, 0, 260);
                                if (lights.targets.every(v => v)) {
                                    addScore(5000);
                                    lights.targets = [false, false, false, false];   // 重置可再打
                                }
                            } else reflect(ball.x < tg.x ? -1 : 1, 0, 200);
                        }
                    }
                    // 光道
                    for (let i = 0; i < lanes.length; i++) {
                        const ln = lanes[i];
                        if (Math.abs(ball.x - ln.x) < 10 && Math.abs(ball.y - ln.y) < 12 && ball.vy < 0) {
                            if (!lights.lanes[i]) { lights.lanes[i] = true; addScore(800); }
                            if (lights.lanes.every(v => v)) { addScore(3000); lights.lanes = [false, false, false]; }
                        }
                    }
                    // 挡板
                    const lTip = flipTip(LP, L.ang, 1), rTip = flipTip(RP, R.ang, -1);
                    const hitFlipper = (pivot, tip, dir, up) => {
                        const { d, cx, cy } = dist2Seg(ball.x, ball.y, pivot.x, pivot.y, tip.x, tip.y);
                        if (d < BALL_R + 7) {
                            let nx = ball.x - cx, ny = ball.y - cy;
                            const Ln = Math.hypot(nx, ny) || 1; nx /= Ln; ny /= Ln;
                            ball.x = cx + nx * (BALL_R + 7); ball.y = cy + ny * (BALL_R + 7);
                            reflect(nx, ny, 170);
                            if (up) { ball.vy -= 330; ball.vx += dir * 90; }   // 挥动加力
                            return true;
                        }
                        return false;
                    };
                    hitFlipper(LP, lTip, 1, LHold || keys.has('ArrowLeft') || keys.has('KeyZ'));
                    hitFlipper(RP, rTip, -1, RHold || keys.has('ArrowRight') || keys.has('Slash'));
                    // 排水（掉出底部）
                    if (ball.y > GH + 30) {
                        if (endless) { launched = false; ball = { x: 370, y: 566, vx: 0, vy: 0 }; combo = 0; }
                        else {
                            balls--;
                            if (balls <= 0) finish(false);
                            else { launched = false; ball = { x: 370, y: 566, vx: 0, vy: 0 }; combo = 0; }
                        }
                        return;
                    }
                }
                // 挡板动画（角度插值）
                const lTarget = (LHold || keys.has('ArrowLeft') || keys.has('KeyZ')) ? -0.5 : 0.42;
                const rTarget = (RHold || keys.has('ArrowRight') || keys.has('Slash')) ? 0.5 : -0.42;
                L.ang += (lTarget - L.ang) * Math.min(1, dt * 28);
                R.ang += (rTarget - R.ang) * Math.min(1, dt * 28);
            };

            // ---- 绘制 ----
            const draw = () => {
                // 台面底色（深空金属渐变）
                let bg = null;
                try { bg = ctx.createLinearGradient(0, 0, GW * 0.4, GH); bg.addColorStop(0, '#232a4a'); bg.addColorStop(0.5, '#161c34'); bg.addColorStop(1, '#0c101f'); } catch (e) { }
                ctx.fillStyle = bg || '#141a2e';
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(8, 16, GW - 16, GH - 28, 18); ctx.fill(); } else ctx.fillRect(8, 16, GW - 16, GH - 28);
                // 星点
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                for (let i = 0; i < 26; i++) {
                    const sx = (i * 137 + 31) % (GW - 30) + 15, sy = (i * 89 + 53) % (GH - 60) + 30;
                    ctx.fillRect(sx, sy, 1.6, 1.6);
                }
                // 光道柱
                ctx.fillStyle = '#2c3556';
                for (const ln of lanes) { ctx.fillRect(ln.x - 16, 40, 8, 76); ctx.fillRect(ln.x + 8, 40, 8, 76); }
                for (let i = 0; i < lanes.length; i++) {
                    const ln = lanes[i];
                    ctx.fillStyle = lights.lanes[i] ? '#7affd0' : 'rgba(122,255,208,0.18)';
                    ctx.beginPath(); ctx.arc(ln.x, ln.y, 6, 0, Math.PI * 2); ctx.fill();
                    if (lights.lanes[i]) { ctx.save(); ctx.shadowColor = '#7affd0'; ctx.shadowBlur = 12; ctx.fill(); ctx.restore(); }
                }
                // 缓冲器（发光圆 + 脉冲）
                for (let i = 0; i < bumpers.length; i++) {
                    const b = bumpers[i];
                    const pulse = Math.max(0, lights.bump[i]);
                    lights.bump[i] = Math.max(0, lights.bump[i] - 0.06);
                    ctx.save();
                    ctx.shadowColor = pulse > 0 ? '#ffd56b' : 'rgba(120,150,255,0.6)';
                    ctx.shadowBlur = 10 + pulse * 22;
                    let g2 = null;
                    try { g2 = ctx.createRadialGradient(b.x - 8, b.y - 8, 4, b.x, b.y, b.r); g2.addColorStop(0, pulse > 0 ? '#fff8d0' : '#8a9ac8'); g2.addColorStop(0.6, pulse > 0 ? '#ffc84a' : '#3a466e'); g2.addColorStop(1, '#1c2240'); } catch (e) { }
                    ctx.fillStyle = g2 || '#3a466e';
                    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    ctx.strokeStyle = '#0e1226'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
                    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(b.score, b.x, b.y);
                }
                // 靶灯组
                for (let i = 0; i < targets.length; i++) {
                    const tg = targets[i];
                    ctx.fillStyle = lights.targets[i] ? '#ff8a5c' : '#3a3f58';
                    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(tg.x - 9, tg.y - 7, 18, 14, 3); ctx.fill(); } else ctx.fillRect(tg.x - 9, tg.y - 7, 18, 14);
                    if (lights.targets[i]) { ctx.save(); ctx.shadowColor = '#ff8a5c'; ctx.shadowBlur = 14; ctx.fill(); ctx.restore(); }
                    ctx.strokeStyle = '#12162a'; ctx.lineWidth = 2; ctx.strokeRect(tg.x - 9, tg.y - 7, 18, 14);
                }
                // 弹弓
                for (const sg of slings) {
                    ctx.fillStyle = '#c8405c';
                    ctx.beginPath();
                    ctx.moveTo(sg.pts[0][0], sg.pts[0][1]);
                    for (let i = 1; i < 3; i++) ctx.lineTo(sg.pts[i][0], sg.pts[i][1]);
                    ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = '#5c1428'; ctx.lineWidth = 3; ctx.stroke();
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(sg.pts[0][0] + 4, sg.pts[0][1] + 6); ctx.lineTo(sg.pts[1][0] - 4, sg.pts[1][1] - 6); ctx.stroke();
                }
                // 墙
                ctx.strokeStyle = '#8a94c0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
                ctx.beginPath();
                for (const wl of walls) { ctx.moveTo(wl.x1, wl.y1); ctx.lineTo(wl.x2, wl.y2); }
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5;
                ctx.stroke();
                // 挡板
                const drawFlipper = (pivot, ang, dir, col) => {
                    const tip = flipTip(pivot, ang, dir);
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
                    ctx.strokeStyle = col; ctx.lineWidth = 13; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
                    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 4;
                    ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y - 2); ctx.lineTo(tip.x, tip.y - 2); ctx.stroke();
                    ctx.fillStyle = '#2a3050';
                    ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                };
                drawFlipper(LP, L.ang, 1, '#e8b83a');
                drawFlipper(RP, R.ang, -1, '#e8b83a');
                // 发射器
                ctx.fillStyle = '#2c3556'; ctx.fillRect(348, 470, 44, 150);
                ctx.fillStyle = '#8a94c0'; ctx.fillRect(366, 566, 8, 40 + plunger * 22);
                ctx.fillStyle = '#c8d0e8';
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(358, 556 + plunger * 22, 24, 12, 4); ctx.fill(); } else ctx.fillRect(358, 556 + plunger * 22, 24, 12);
                // 球（金属渐变 + 拖影）
                if (true) {
                    const tb = 3;   // 拖影
                    for (let i = tb; i >= 1; i--) {
                        ctx.fillStyle = `rgba(160,190,255,${0.06 * (tb - i + 1)})`;
                        ctx.beginPath(); ctx.arc(ball.x - ball.vx * 0.012 * i, ball.y - ball.vy * 0.012 * i, BALL_R, 0, Math.PI * 2); ctx.fill();
                    }
                    let gb = null;
                    try { gb = ctx.createRadialGradient(ball.x - 3, ball.y - 4, 1.5, ball.x, ball.y, BALL_R); gb.addColorStop(0, '#ffffff'); gb.addColorStop(0.4, '#c8d4ea'); gb.addColorStop(1, '#5a6480'); } catch (e) { }
                    ctx.save();
                    ctx.shadowColor = 'rgba(200,220,255,0.8)'; ctx.shadowBlur = 10;
                    ctx.fillStyle = gb || '#c8d4ea';
                    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    ctx.beginPath(); ctx.arc(ball.x - 3, ball.y - 3.4, 2.2, 0, Math.PI * 2); ctx.fill();
                }
                // 蓄力条
                if (!launched && plunger > 0) {
                    ctx.fillStyle = '#1a2036'; ctx.fillRect(340, 500, 10, 90);
                    const ph = plunger * 86;
                    ctx.fillStyle = `hsl(${120 - plunger * 120},85%,55%)`;
                    ctx.fillRect(341, 590 - ph, 8, ph);
                }
                // HUD
                opts.onScore && opts.onScore(
                    `${endless ? '无尽' : `第 ${idx0 + 1} 关`} · ${score.toLocaleString()}${endless ? '' : ' / ' + P.goal.toLocaleString()} 分 · 球 ${endless ? '∞' : balls} · 连击 ×${combo}`
                );
            };

            // ---- 主循环 ----
            let last = Date.now(), raf = 0;
            const loop = () => {
                const now = Date.now();
                const dt = Math.min(0.033, (now - last) / 1000);
                last = now;
                if (!over) step(dt);
                else endT += dt;
                draw();
                if (!over || endT < 1.1) raf = requestAnimationFrame(loop);
            };
            raf = requestAnimationFrame(loop);
            MG.hint(container, `${endless ? '无尽 · ' : ''}←/→ 挡板 · ↓/空格按住蓄力松手发射 · 触屏：左右半屏=挡板，待发射时按住蓄力`);
            draw();
            // 测试钩子
            if (typeof window !== 'undefined' && window.__MG_TEST) {
                window.__pinball = {
                    get over() { return over; }, get score() { return score; },
                    get balls() { return balls; }, get launched() { return launched; },
                    get ball() { return ball; }, get combo() { return combo; },
                    addScore, finish,
                    launch: v => { plungerHold = false; plunger = v || 0.9; ball.vy = -(420 + 560 * plunger); ball.vx = 0; launched = true; plunger = 0; },
                };
            }
            return {
                stop() { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); destroy(); },
            };
        },
    };
})();
