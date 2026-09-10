// 三维弹球 · 太空军校生致敬版（100% 自研复刻，非原版文件）
//   台面元素：5 通道 S·P·A·C·E 滚道 · 3 缓冲器 · 4 连靶 S·T·A·R · 旋转门 · 计分洞(Kicker)
//             右侧环形轨道 + 上升坡道(RAMP) · 双弹弓 · 双挡板 · 左右 Kickback 救球道
//   控制：← / → 挡板 · ↓(空格) 按住蓄力松手发射 · M 静音
//   触屏：游戏中按住左/右半屏控制对应挡板 · 待发射时按住蓄力松手发射
//   50 关 = 目标分递增 · 3 球制 · 倍率 ×1~×5 · 音乐/音效由 Web Audio 实时合成
window.MiniGames = window.MiniGames || {};
(function () {
    const GW = 400, GH = 640;
    const BALL_R = 9, GRAV = 1350;
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
            goal: 8000 + Math.floor(idx * idx * 11 + idx * 900),   // 目标分曲线
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

    // ---------- 上升坡道 RAMP 路径（球进入后沿轨道滑行，跳过常规物理）----------
    const RAMP_PTS = [[322, 300], [338, 248], [332, 196], [300, 164], [248, 146], [188, 148], [130, 168], [78, 206]];
    const RAMP_SEG = [];
    let RAMP_TOTAL = 0;
    for (let i = 1; i < RAMP_PTS.length; i++) {
        const a = RAMP_PTS[i - 1], b = RAMP_PTS[i];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        RAMP_SEG.push(d); RAMP_TOTAL += d;
    }
    function rampAt(u) {
        let target = Math.max(0, Math.min(1, u)) * RAMP_TOTAL, acc = 0;
        for (let i = 0; i < RAMP_SEG.length; i++) {
            if (acc + RAMP_SEG[i] >= target) {
                const f = RAMP_SEG[i] ? (target - acc) / RAMP_SEG[i] : 0;
                const a = RAMP_PTS[i], b = RAMP_PTS[i + 1];
                return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
            }
            acc += RAMP_SEG[i];
        }
        const l = RAMP_PTS[RAMP_PTS.length - 1];
        return { x: l[0], y: l[1] };
    }

    // ---------- 顶部 5 通道 S·P·A·C·E ----------
    const LANE_SEP = [26, 78.8, 131.6, 184.4, 237.2, 290];
    const LANE_X = [52.4, 105.2, 158, 210.8, 263.6];
    const LANE_CH = ['S', 'P', 'A', 'C', 'E'];

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

            // ---- 音效 / BGM ----
            const AU = MG.audio;
            const sfx = n => { try { AU.sfx(n); } catch (e) { } };
            let audioOn = false;
            const startAudio = () => {
                if (audioOn) return;
                try { if (AU.unlock()) { AU.bgm.start('space'); audioOn = true; } } catch (e) { }
            };
            startAudio();

            // ---- 台面状态 ----
            let score = 0, balls = endless ? Infinity : 3, launched = false;
            let ball = { x: 366, y: 560, vx: 0, vy: 0 };
            let plunger = 0, plungerHold = false, chargeSfxDone = true;
            let L = { ang: 0.42 }, R = { ang: -0.42 };   // 挡板角度（正=收起）
            let LHold = false, RHold = false, LWas = false, RWas = false;
            let combo = 0, comboT = 0;
            let mult = 1, jackpot = 2500;
            let rail = -1;                 // RAMP 进度 <0 表示不在轨道上
            let rampCool = 0;
            let saucerHold = 0;            // 计分洞吸球倒计时
            let toast = '', toastT = 0;
            const show = (s, d) => { toast = s; toastT = d || 1.4; };
            const lights = { bump: [0, 0, 0], targets: [false, false, false, false], lanes: [false, false, false, false, false] };
            const kickback = { L: true, R: true };
            let orbitCool = 0;

            // ---- 台面元素几何 ----
            const LP = { x: 152, y: 556 }, RP = { x: 248, y: 556 };
            const FLIP_L = 62;
            const flipTip = (p, ang, dir) => ({ x: p.x + dir * Math.cos(ang) * FLIP_L, y: p.y + Math.sin(ang) * FLIP_L });
            // 圆缓冲器
            const bumpers = [
                { x: 128, y: 214, r: 24, score: 150 },
                { x: 206, y: 178, r: 24, score: 250 },
                { x: 272, y: 222, r: 24, score: 150 },
            ];
            // 弹弓
            const slings = [
                { pts: [[92, 470], [128, 530], [92, 530]], score: 80 },
                { pts: [[308, 470], [272, 530], [308, 530]], score: 80 },
            ];
            // 左侧 4 连靶 S·T·A·R
            const targets = [
                { x: 42, y: 250 }, { x: 42, y: 276 }, { x: 42, y: 302 }, { x: 42, y: 328 },
            ];
            const TARGET_CH = ['S', 'T', 'A', 'R'];
            // 旋转门（左侧中下）
            const spinner = { x: 88, y: 372, w: 30, ang: 0, vel: 0, spinAcc: 0, cool: 0 };
            // 计分洞（中央）
            const saucer = { x: 196, y: 300, r: 15 };
            // 弹性小柱
            const posts = [{ x: 152, y: 404, r: 7 }, { x: 250, y: 356, r: 7 }];
            // 墙
            const walls = [
                { x1: 18, y1: 620, x2: 18, y2: 120 },
                { x1: 18, y1: 120, x2: 46, y2: 48 },
                { x1: 46, y1: 48, x2: 150, y2: 26 },
                { x1: 150, y1: 26, x2: 250, y2: 26 },
                { x1: 250, y1: 26, x2: 348, y2: 52 },
                { x1: 348, y1: 52, x2: 348, y2: 120 },
                { x1: 348, y1: 120, x2: 348, y2: 470 },   // 环形轨道右壁
                { x1: 348, y1: 470, x2: 316, y2: 500 },   // 右下导入斜坡
                { x1: 92, y1: 540, x2: 92, y2: 620 },
                { x1: 308, y1: 540, x2: 308, y2: 620 },
                { x1: 18, y1: 620, x2: 92, y2: 620 },
                { x1: 308, y1: 620, x2: 392, y2: 620 },
                { x1: 392, y1: 120, x2: 392, y2: 620 },
                { x1: 392, y1: 60, x2: 392, y2: 120 },
                { x1: 348, y1: 120, x2: 392, y2: 60 },
            ];
            // 顶部 5 通道的分隔柱
            for (const sx of LANE_SEP) {
                walls.push({ x1: sx - 4, y1: 44, x2: sx - 4, y2: 132 });
                walls.push({ x1: sx + 4, y1: 44, x2: sx + 4, y2: 132 });
            }

            // ---- 输入 ----
            const keys = new Set();
            const kd = e => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space', 'KeyZ', 'Slash', 'Period'].includes(e.code)) e.preventDefault();
                if (e.code === 'KeyM') { toggleMute(); return; }
                keys.add(e.code);
                startAudio();
            };
            const ku = e => keys.delete(e.code);
            window.addEventListener('keydown', kd);
            window.addEventListener('keyup', ku);
            const tstart = e => {
                startAudio();
                const r = c.getBoundingClientRect();
                const p = e.touches[0];
                const x = (p.clientX - r.left) / r.width * GW;
                const y = (p.clientY - r.top) / r.height * GH;
                if (hitMuteBtn(x, y)) return;
                if (!launched) { plungerHold = true; return; }
                if (x < GW / 2) LHold = true; else RHold = true;
            };
            const tend = () => { LHold = RHold = false; plungerHold = false; };
            c.addEventListener('touchstart', tstart, { passive: true });
            c.addEventListener('touchend', tend, { passive: true });
            // 静音按钮（画布右上角）
            const MUTE_BTN = { x: GW - 24, y: 30, r: 13 };
            const hitMuteBtn = (x, y) => Math.hypot(x - MUTE_BTN.x, y - MUTE_BTN.y) <= MUTE_BTN.r + 3;
            function toggleMute() {
                startAudio();
                try { AU.toggleMuted(); } catch (e) { }
                if (!AU.muted) startAudio();
            }
            c.addEventListener('click', e => {
                const r = c.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width * GW;
                const y = (e.clientY - r.top) / r.height * GH;
                if (hitMuteBtn(x, y)) toggleMute();
            });

            const addScore = v => {
                score += Math.round(v * mult * (1 + combo * 0.1));
                comboT = 2;
                if (!endless && score >= P.goal && !over) finish(true);
            };
            const bumpMult = () => {
                if (mult < 5) { mult++; sfx('jackpot'); show('倍率提升 ×' + mult, 1.6); }
                else { addScore(15000); sfx('jackpot'); show('MAX 倍率奖励 +15,000', 1.6); }
            };
            const finish = win => {
                if (over) return;
                over = true;
                try { AU.bgm.stop(); } catch (e) { }
                sfx(win ? 'levelup' : 'fail');
                const stars = win ? (balls >= 3 ? 3 : balls >= 2 ? 2 : 1) : 0;
                opts.onComplete && opts.onComplete({
                    win, stars,
                    score: endless ? score : score + (win ? 1000 : 0),
                    title: endless ? '🏅 无尽挑战结束' : (win ? '🏆 任务达成！' : '💥 球已用完'),
                    lines: [
                        `得分 ${score.toLocaleString()}${endless ? '' : ' / 目标 ' + P.goal.toLocaleString()}`,
                        `最高连击 ×${combo} · 倍率 ×${mult}`,
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
                if (toastT > 0) toastT -= dt;
                if (rampCool > 0) rampCool -= dt;
                if (orbitCool > 0) orbitCool -= dt;
                if (spinner.cool > 0) spinner.cool -= dt;
                // 旋转门惯性
                spinner.ang += spinner.vel * dt;
                spinner.vel *= Math.pow(0.55, dt);
                if (Math.abs(spinner.vel) > 0.4) {
                    spinner.spinAcc += Math.abs(spinner.vel) * dt;
                    while (spinner.spinAcc > Math.PI * 2) { spinner.spinAcc -= Math.PI * 2; addScore(250); combo++; sfx('spinner'); }
                }

                // 发射
                if (!launched) {
                    ball.x = 370; ball.y = 566;
                    const holding = plungerHold || keys.has('ArrowDown') || keys.has('Space');
                    if (holding) {
                        if (chargeSfxDone) { sfx('charge'); chargeSfxDone = false; }
                        plunger = Math.min(1, plunger + dt * 1.4);
                    } else if (plunger > 0.08) {
                        ball.vy = -(420 + 560 * plunger);
                        ball.vx = 0;
                        launched = true; plunger = 0; chargeSfxDone = true;
                        sfx('launch');
                    } else { plunger = Math.max(0, plunger - dt * 2); chargeSfxDone = true; }
                    return;
                }

                // RAMP 轨道滑行
                if (rail >= 0) {
                    rail += dt / 0.85;
                    if (rail >= 1) {
                        rail = -1; rampCool = 0.5;
                        const e = rampAt(1);
                        ball.x = e.x; ball.y = e.y; ball.vx = 70; ball.vy = 60;
                        addScore(3000); combo++; sfx('jet'); show('RAMP! +' + Math.round(3000 * mult), 1.2);
                    } else {
                        const p = rampAt(rail);
                        ball.x = p.x; ball.y = p.y; ball.vx = 0; ball.vy = 0;
                    }
                    return;
                }

                // 计分洞吸球
                if (saucerHold > 0) {
                    saucerHold -= dt;
                    ball.x = saucer.x; ball.y = saucer.y; ball.vx = ball.vy = 0;
                    if (saucerHold <= 0) {
                        ball.vy = -560; ball.vx = (Math.random() - 0.5) * 180; ball.y = saucer.y - 16;
                        addScore(jackpot); jackpot += 500; combo++;
                        sfx('kick'); show('JACKPOT +' + Math.round(jackpot * mult).toLocaleString(), 1.5);
                    }
                    return;
                }

                // 重力 + 积分（子步防穿透）
                const SUB = 4;
                for (let s = 0; s < SUB; s++) {
                    ball.vy += P.grav * dt / SUB;
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
                            addScore(b.score); combo++; lights.bump[i] = 1; sfx('bumper');
                        }
                    }
                    // 弹弓
                    for (const sg of slings) {
                        for (let i = 0; i < 3; i++) {
                            const a = sg.pts[i], b2 = sg.pts[(i + 1) % 3];
                            const before = { x: ball.x, y: ball.y };
                            if (hitWallSeg(a[0], a[1], b2[0], b2[1], 480)) {
                                if (i === 0) { addScore(sg.score); combo++; sfx('sling'); }
                                else { ball.x = before.x; ball.y = before.y; }
                            }
                        }
                    }
                    // 弹性小柱
                    for (const p of posts) {
                        const dx = ball.x - p.x, dy = ball.y - p.y, d = Math.hypot(dx, dy);
                        if (d < p.r + BALL_R) {
                            const nx = dx / (d || 1), ny = dy / (d || 1);
                            ball.x = p.x + nx * (p.r + BALL_R); ball.y = p.y + ny * (p.r + BALL_R);
                            reflect(nx, ny, 260); addScore(60);
                        }
                    }
                    // 4 连靶
                    for (let i = 0; i < targets.length; i++) {
                        const tg = targets[i];
                        if (Math.abs(ball.x - tg.x) < BALL_R + 9 && Math.abs(ball.y - tg.y) < BALL_R + 8) {
                            if (!lights.targets[i]) {
                                lights.targets[i] = true;
                                addScore(600); combo++; sfx('target');
                                reflect(ball.x < tg.x ? -1 : 1, 0, 260);
                                if (lights.targets.every(Boolean)) {
                                    addScore(8000); sfx('jackpot');
                                    show('S·T·A·R 全清 +8,000', 1.6);
                                    lights.targets = [false, false, false, false];
                                    bumpMult();
                                }
                            } else reflect(ball.x < tg.x ? -1 : 1, 0, 200);
                        }
                    }
                    // 顶部 S·P·A·C·E 滚道
                    for (let i = 0; i < LANE_X.length; i++) {
                        const cx = LANE_X[i];
                        if (Math.abs(ball.x - cx) < 14 && ball.y > 52 && ball.y < 130) {
                            if (!lights.lanes[i]) {
                                lights.lanes[i] = true; addScore(500); combo++; sfx('rollover');
                                if (lights.lanes.every(Boolean)) {
                                    addScore(12000); sfx('jackpot');
                                    show('SPACE 全亮！+12,000', 1.8);
                                    lights.lanes = [false, false, false, false, false];
                                    bumpMult();
                                }
                            }
                        }
                    }
                    // 旋转门
                    if (Math.abs(ball.x - spinner.x) < spinner.w / 2 + BALL_R * 0.6 &&
                        Math.abs(ball.y - spinner.y) < 12 && spinner.cool <= 0) {
                        const pw = Math.min(26, Math.abs(ball.vy) * 0.035 + 6);
                        spinner.vel = Math.max(spinner.vel, pw);
                        spinner.cool = 0.25;
                        addScore(120); combo++; sfx('spinner');
                        ball.vy *= 0.82;
                    }
                    // RAMP 入口（右侧环形轨道内向上冲）
                    if (rail < 0 && rampCool <= 0 && ball.vy < -300 &&
                        ball.x > 306 && ball.x < 342 && ball.y > 276 && ball.y < 322) {
                        rail = 0; sfx('ramp');
                    }
                    // 环形轨道传感器（从右侧下滑）
                    if (orbitCool <= 0 && ball.x > 300 && ball.y > 330 && ball.y < 380 && ball.vy > 0) {
                        orbitCool = 1.2; addScore(1200); combo++; sfx('rollover');
                        show('轨道 +1,200', 1.0);
                    }
                    // 计分洞
                    if (Math.hypot(ball.x - saucer.x, ball.y - saucer.y) < saucer.r &&
                        Math.hypot(ball.vx, ball.vy) < 900) {
                        saucerHold = 0.85; ball.x = saucer.x; ball.y = saucer.y; ball.vx = ball.vy = 0;
                        sfx('saucer');
                        return;
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
                            if (up) { ball.vy -= 330; ball.vx += dir * 90; }
                            return true;
                        }
                        return false;
                    };
                    hitFlipper(LP, lTip, 1, LHold || keys.has('ArrowLeft') || keys.has('KeyZ'));
                    hitFlipper(RP, rTip, -1, RHold || keys.has('ArrowRight') || keys.has('Slash'));
                    // Kickback 救球道（左右下角，每球各一次）
                    if (ball.y > 566 && ball.vy > 0) {
                        if (ball.x < 58 && kickback.L) {
                            kickback.L = false; ball.vy = -700; ball.vx = 70;
                            addScore(1500); sfx('kick'); show('KICKBACK 救球！', 1.4);
                        } else if (ball.x > 292 && kickback.R) {
                            kickback.R = false; ball.vy = -700; ball.vx = -70;
                            addScore(1500); sfx('kick'); show('KICKBACK 救球！', 1.4);
                        }
                    }
                    // 排水
                    if (ball.y > GH + 30) {
                        sfx('drain');
                        combo = 0; mult = 1; jackpot = 2500;
                        lights.targets = [false, false, false, false];
                        lights.lanes = [false, false, false, false, false];
                        if (endless) { launched = false; ball = { x: 370, y: 566, vx: 0, vy: 0 }; }
                        else {
                            balls--;
                            if (balls <= 0) finish(false);
                            else { launched = false; ball = { x: 370, y: 566, vx: 0, vy: 0 }; }
                        }
                        kickback.L = kickback.R = true;
                        return;
                    }
                }
                // 挡板动画
                const lDown = LHold || keys.has('ArrowLeft') || keys.has('KeyZ');
                const rDown = RHold || keys.has('ArrowRight') || keys.has('Slash');
                if (lDown && !LWas) sfx('flip');
                if (rDown && !RWas) sfx('flip');
                LWas = lDown; RWas = rDown;
                L.ang += ((lDown ? -0.5 : 0.42) - L.ang) * Math.min(1, dt * 28);
                R.ang += ((rDown ? 0.5 : -0.42) - R.ang) * Math.min(1, dt * 28);
            };

            // ---- 绘制 ----
            const draw = () => {
                // 台面底色
                let bg = null;
                try { bg = ctx.createLinearGradient(0, 0, GW * 0.4, GH); bg.addColorStop(0, '#232a4a'); bg.addColorStop(0.5, '#161c34'); bg.addColorStop(1, '#0c101f'); } catch (e) { }
                ctx.fillStyle = bg || '#141a2e';
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(8, 16, GW - 16, GH - 28, 18); ctx.fill(); } else ctx.fillRect(8, 16, GW - 16, GH - 28);
                // 星点 + 星云
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                for (let i = 0; i < 30; i++) {
                    const sx = (i * 137 + 31) % (GW - 30) + 15, sy = (i * 89 + 53) % (GH - 60) + 30;
                    ctx.fillRect(sx, sy, 1.6, 1.6);
                }
                drawDecor();

                // RAMP 轨道（画在台面下层）
                ctx.save();
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.strokeStyle = 'rgba(18,26,54,0.9)'; ctx.lineWidth = 17;
                ctx.beginPath(); ctx.moveTo(RAMP_PTS[0][0], RAMP_PTS[0][1]);
                for (let i = 1; i < RAMP_PTS.length; i++) ctx.lineTo(RAMP_PTS[i][0], RAMP_PTS[i][1]);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(90,200,255,0.30)'; ctx.lineWidth = 12;
                ctx.stroke();
                ctx.setLineDash([10, 12]);
                ctx.strokeStyle = 'rgba(150,235,255,0.55)'; ctx.lineWidth = 3;
                ctx.lineDashOffset = -(t * 60) % 22;
                ctx.stroke();
                ctx.setLineDash([]);
                // 入口箭头
                const glow = 0.4 + 0.3 * Math.sin(t * 5);
                ctx.fillStyle = `rgba(120,235,255,${glow})`;
                ctx.beginPath(); ctx.moveTo(322, 322); ctx.lineTo(334, 300); ctx.lineTo(310, 300); ctx.closePath(); ctx.fill();
                ctx.fillStyle = 'rgba(160,240,255,0.85)'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
                ctx.fillText('RAMP', 322, 334);
                ctx.restore();

                // 顶部 S·P·A·C·E 滚道
                for (const sx of LANE_SEP) {
                    ctx.fillStyle = '#2c3556';
                    ctx.fillRect(sx - 5, 44, 10, 88);
                    ctx.fillStyle = 'rgba(255,255,255,0.10)';
                    ctx.fillRect(sx - 5, 44, 3, 88);
                }
                for (let i = 0; i < LANE_X.length; i++) {
                    const cx = LANE_X[i], on = lights.lanes[i];
                    ctx.save();
                    if (on) { ctx.shadowColor = '#7affd0'; ctx.shadowBlur = 12; }
                    ctx.fillStyle = on ? '#7affd0' : 'rgba(122,255,208,0.16)';
                    ctx.beginPath(); ctx.arc(cx, 143, 6.5, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    ctx.fillStyle = on ? '#0b1a22' : 'rgba(122,255,208,0.55)';
                    ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(LANE_CH[i], cx, 143.5);
                }

                // 计分洞
                ctx.save();
                ctx.fillStyle = '#05070f';
                ctx.beginPath(); ctx.arc(saucer.x, saucer.y, saucer.r, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#8a94c0'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(saucer.x, saucer.y, saucer.r, 0, Math.PI * 2); ctx.stroke();
                const jg = 0.35 + 0.25 * Math.sin(t * 4);
                ctx.fillStyle = `rgba(255,214,110,${jg})`;
                ctx.beginPath(); ctx.arc(saucer.x, saucer.y, saucer.r - 5, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.fillStyle = 'rgba(255,225,150,0.9)'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
                ctx.fillText('JACKPOT', saucer.x, saucer.y - 24);
                ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '8px Arial';
                ctx.fillText((jackpot * mult).toLocaleString(), saucer.x, saucer.y + 28);

                // 4 连靶
                for (let i = 0; i < targets.length; i++) {
                    const tg = targets[i], on = lights.targets[i];
                    ctx.fillStyle = on ? '#ff8a5c' : '#3a3f58';
                    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(tg.x - 10, tg.y - 7, 20, 14, 3); ctx.fill(); } else ctx.fillRect(tg.x - 10, tg.y - 7, 20, 14);
                    if (on) { ctx.save(); ctx.shadowColor = '#ff8a5c'; ctx.shadowBlur = 14; ctx.fill(); ctx.restore(); }
                    ctx.strokeStyle = '#12162a'; ctx.lineWidth = 2;
                    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(tg.x - 10, tg.y - 7, 20, 14, 3); ctx.stroke(); }
                    ctx.fillStyle = on ? '#2a1008' : 'rgba(255,220,190,0.7)';
                    ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(TARGET_CH[i], tg.x, tg.y);
                }
                ctx.fillStyle = 'rgba(255,180,140,0.6)'; ctx.font = '8px Arial'; ctx.textAlign = 'center';
                ctx.fillText('TARGETS', 42, 348);

                // 旋转门
                ctx.save();
                ctx.translate(spinner.x, spinner.y);
                const sq = Math.cos(spinner.ang);
                ctx.fillStyle = '#5c6ea8';
                ctx.fillRect(-spinner.w / 2, -3.5, spinner.w, 7);
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillRect(-spinner.w / 2, -3.5, spinner.w * Math.abs(sq) * 0.5, 3);
                ctx.strokeStyle = '#2a3050'; ctx.lineWidth = 2;
                ctx.strokeRect(-spinner.w / 2, -3.5, spinner.w, 7);
                ctx.restore();
                ctx.fillStyle = 'rgba(160,190,255,0.6)'; ctx.font = '8px Arial'; ctx.textAlign = 'center';
                ctx.fillText('SPIN', spinner.x, spinner.y + 20);

                // 弹性小柱
                for (const p of posts) {
                    ctx.fillStyle = '#39406a';
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#c8d0e8';
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#12162a'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
                }

                // 缓冲器
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
                    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(b.score, b.x, b.y);
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

                // Kickback 救球灯
                drawKick(40, 592, kickback.L, '◀');
                drawKick(310, 592, kickback.R, '▶');

                // 墙
                ctx.strokeStyle = '#8a94c0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
                ctx.beginPath();
                for (const wl of walls) { ctx.moveTo(wl.x1, wl.y1); ctx.lineTo(wl.x2, wl.y2); }
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();

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

                // 球
                const tb = 3;
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
                if (rail >= 0) {  // 轨道中的高光
                    ctx.save(); ctx.strokeStyle = 'rgba(150,235,255,0.9)'; ctx.lineWidth = 2.5;
                    ctx.shadowColor = '#96ebff'; ctx.shadowBlur = 14;
                    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R + 3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
                }

                // 蓄力条
                if (!launched && plunger > 0) {
                    ctx.fillStyle = '#1a2036'; ctx.fillRect(340, 500, 10, 90);
                    const ph = plunger * 86;
                    ctx.fillStyle = `hsl(${120 - plunger * 120},85%,55%)`;
                    ctx.fillRect(341, 590 - ph, 8, ph);
                }

                drawHUD();

                opts.onScore && opts.onScore(
                    `${endless ? '无尽' : `第 ${idx0 + 1} 关`} · ${score.toLocaleString()}${endless ? '' : ' / ' + P.goal.toLocaleString()} 分 · 球 ${endless ? '∞' : balls} · ×${mult} · 连击 ×${combo}`
                );
            };

            // 背景装饰：星球 / 飞船 / 徽标 / 网格
            function drawDecor() {
                ctx.save();
                // 网格
                ctx.strokeStyle = 'rgba(120,150,220,0.05)'; ctx.lineWidth = 1;
                ctx.beginPath();
                for (let y = 60; y < 620; y += 40) { ctx.moveTo(20, y); ctx.lineTo(346, y); }
                ctx.stroke();
                // 星球（右上）
                const px = 300, py = 250, pr = 46;
                let pg = null;
                try { pg = ctx.createRadialGradient(px - 14, py - 16, 6, px, py, pr); pg.addColorStop(0, '#6f5bd0'); pg.addColorStop(0.6, '#3d3480'); pg.addColorStop(1, '#1a1740'); } catch (e) { }
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = pg || '#3d3480';
                ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 0.35;
                ctx.strokeStyle = '#c8b8ff'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.ellipse(px, py + 6, pr + 16, 12, -0.42, 0, Math.PI * 2); ctx.stroke();
                ctx.globalAlpha = 1;
                // 小飞船（左中）
                ctx.save();
                ctx.translate(200, 505);
                ctx.globalAlpha = 0.22;
                ctx.fillStyle = '#cfe6ff';
                ctx.beginPath();
                ctx.moveTo(0, -16); ctx.lineTo(11, 8); ctx.lineTo(0, 4); ctx.lineTo(-11, 8);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#7affd0';
                ctx.fillRect(-4, 6, 8, 6);
                ctx.restore();
                // 徽标
                ctx.globalAlpha = 0.16;
                ctx.fillStyle = '#9fd8ff';
                ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('SPACE CADET', 200, 470);
                ctx.font = '10px Arial';
                ctx.fillText('★ ★ ★', 200, 490);
                ctx.globalAlpha = 1;
                ctx.restore();
            }

            function drawKick(x, y, on, arrow) {
                ctx.save();
                if (on) { ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 10; }
                ctx.fillStyle = on ? '#ffd56b' : 'rgba(255,213,107,0.18)';
                ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.fillStyle = on ? '#3a2a06' : 'rgba(255,213,107,0.5)';
                ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(arrow, x, y + 0.5);
                ctx.fillStyle = 'rgba(255,213,107,0.45)'; ctx.font = '7px Arial';
                ctx.fillText('KICK', x, y + 15);
            }

            function drawHUD() {
                // 倍率
                ctx.save();
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.font = 'bold 30px Arial';
                ctx.fillStyle = mult > 1 ? 'rgba(255,213,107,0.30)' : 'rgba(160,190,255,0.16)';
                ctx.fillText('×' + mult, 200, 430);
                ctx.font = '9px Arial';
                ctx.fillStyle = 'rgba(255,255,255,0.30)';
                ctx.fillText('MULTIPLIER', 200, 452);
                ctx.restore();
                // 球数
                if (!endless) {
                    for (let i = 0; i < 3; i++) {
                        ctx.beginPath();
                        ctx.arc(188 + i * 12, 588, 4, 0, Math.PI * 2);
                        ctx.fillStyle = i < balls ? '#c8d4ea' : 'rgba(200,212,234,0.18)';
                        ctx.fill();
                    }
                }
                // 事件提示
                if (toastT > 0 && toast) {
                    ctx.save();
                    ctx.globalAlpha = Math.min(1, toastT * 1.6);
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.font = 'bold 17px Arial';
                    ctx.fillStyle = '#ffd56b';
                    ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 12;
                    ctx.fillText(toast, 200, 256);
                    ctx.restore();
                }
                // 军衔 / 关卡名
                ctx.save();
                ctx.textAlign = 'center'; ctx.font = '9px Arial';
                ctx.fillStyle = 'rgba(200,220,255,0.45)';
                ctx.fillText((endless ? '∞ 无尽 · ' : `第 ${idx0 + 1} 关 · `) + NAMES[Math.min(49, idx0 < 0 ? 0 : idx0)], 200, 610);
                ctx.restore();
                // 静音按钮
                const m = MUTE_BTN;
                ctx.save();
                ctx.fillStyle = 'rgba(10,14,30,0.65)';
                ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(160,190,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = AU.muted ? '#ff7a8b' : '#9fd8ff';
                ctx.beginPath();
                ctx.moveTo(m.x - 6, m.y - 2.5); ctx.lineTo(m.x - 2, m.y - 2.5); ctx.lineTo(m.x + 2, m.y - 6);
                ctx.lineTo(m.x + 2, m.y + 6); ctx.lineTo(m.x - 2, m.y + 2.5); ctx.lineTo(m.x - 6, m.y + 2.5);
                ctx.closePath(); ctx.fill();
                if (AU.muted) {
                    ctx.strokeStyle = '#ff7a8b'; ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.moveTo(m.x + 4, m.y - 4); ctx.lineTo(m.x + 10, m.y + 4); ctx.stroke();
                } else {
                    ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.arc(m.x + 2, m.y, 5, -0.9, 0.9); ctx.stroke();
                    ctx.beginPath(); ctx.arc(m.x + 2, m.y, 8, -0.8, 0.8); ctx.stroke();
                }
                ctx.restore();
            }

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
            MG.hint(container, `${endless ? '无尽 · ' : ''}←/→ 挡板 · ↓/空格蓄力发射 · M 静音 · 触屏：左右半屏=挡板，待发射时按住蓄力`);
            draw();
            // 测试钩子
            if (typeof window !== 'undefined' && window.__MG_TEST) {
                window.__pinball = {
                    get over() { return over; }, get score() { return score; },
                    get balls() { return balls; }, get launched() { return launched; },
                    get ball() { return ball; }, get combo() { return combo; },
                    get mult() { return mult; }, get rail() { return rail; },
                    get lights() { return lights; }, get spinner() { return spinner; },
                    addScore, finish,
                    launch: v => { plungerHold = false; plunger = v || 0.9; ball.vy = -(420 + 560 * plunger); ball.vx = 0; launched = true; plunger = 0; },
                };
            }
            return {
                stop() {
                    cancelAnimationFrame(raf);
                    window.removeEventListener('keydown', kd);
                    window.removeEventListener('keyup', ku);
                    try { AU.bgm.stop(); } catch (e) { }
                    destroy();
                },
            };
        },
    };
})();
