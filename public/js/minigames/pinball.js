// 三维弹球 · 太空军校生致敬版（100% 自研复刻，非原版文件）
//   圆顶轨道 + 上升坡道 + 双弹弓 + 5 通道 S·P·A·C·E + 4 连靶 S·T·A·R +
//   中央 JACKPOT 计分洞 + 旋转门 + 双挡板 + 左右 KICKBACK 救球道
//   控制：← / → 挡板 · ↓(空格) 按住蓄力松手发射 · M 静音
//   触屏：左右半屏=挡板；未发射时按住蓄力松手发射
//   50 关 + ∞ 无尽；3 球制；倍率 ×1~×5；音乐/音效由 Web Audio 实时合成
window.MiniGames = window.MiniGames || {};
(function () {
    const GW = 420, GH = 680;                        // 略增一档，给圆顶轨道留位
    const BALL_R = 9, GRAV = 1450;
    const SUB = 6;                                  // 物理子步（防穿透）
    const SPEED_CAP = 1700;                         // 球速封顶（防 SUB 间隧穿）

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
            goal: 8000 + Math.floor(idx * idx * 11 + idx * 900),
            bumperPow: 1 + 0.28 * t,
            grav: GRAV * (1 + 0.12 * t),
        };
    }

    // ---- 圆顶轨道（多段折线近似圆弧，球上去后沿顶滑下左弧入局）----
    const R_ARCH_R = 152, R_ARCH_CX = 260, R_ARCH_CY = 188;   // 右弧：x∈[108,412]? 实际从 412 到 260
    // 右弧：从 (412, 188) → (260, 36)  半径 152  中心 (260, 188)
    // 左弧：从 (160, 36)  → (  8, 188)  半径 152  中心 (160, 188)
    // 顶平：x∈[160,260]  y=36
    function arcPts(cx, cy, r, a0, a1, seg) {
        const out = [];
        for (let i = 0; i <= seg; i++) {
            const t = i / seg, a = a0 + (a1 - a0) * t;
            out.push([cx + r * Math.cos(a), cy - r * Math.sin(a)]);
        }
        return out;
    }
    const RIGHT_ARCH = arcPts(R_ARCH_CX, R_ARCH_CY, R_ARCH_R, 0, Math.PI / 2, 14);
    const LEFT_ARCH  = arcPts(160, 188, R_ARCH_R, Math.PI / 2, Math.PI, 14);

    // ---- 上升坡道 RAMP ----
    const RAMP_PTS = [[336, 320], [352, 268], [346, 216], [312, 182], [256, 162], [192, 164], [130, 184], [78, 224]];
    const RAMP_SEG = [], RAMP_LEN = [];
    for (let i = 1; i < RAMP_PTS.length; i++) {
        const d = Math.hypot(RAMP_PTS[i][0] - RAMP_PTS[i - 1][0], RAMP_PTS[i][1] - RAMP_PTS[i - 1][1]);
        RAMP_SEG.push(d); RAMP_LEN.push(d);
    }
    const RAMP_TOTAL = RAMP_SEG.reduce((a, b) => a + b, 0);
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

    // ---- 顶部 S·P·A·C·E 5 通道（y 100~170；球可从上或下穿过触发）----
    const LANE_CENTERS = [122, 168, 214, 260, 306];   // 等距 46
    const LANE_CH = ['S', 'P', 'A', 'C', 'E'];

    // ---- 工具 ----
    const dist2Seg = (px, py, x1, y1, x2, y2) => {
        const dx = x2 - x1, dy = y2 - y1;
        const L2 = dx * dx + dy * dy || 1;
        let t = ((px - x1) * dx + (py - y1) * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t };
    };
    const capSpeed = (b, m) => {
        const s2 = b.vx * b.vx + b.vy * b.vy;
        if (s2 > m * m) { const k = m / Math.sqrt(s2); b.vx *= k; b.vy *= k; }
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

            // 屏幕震动
            let shake = 0, shakeMag = 0;

            // 粒子
            const parts = [];
            const spawnParts = (x, y, n, hue, power) => {
                for (let i = 0; i < n; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const sp = (60 + Math.random() * 200) * (power || 1);
                    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
                                 life: 0.5 + Math.random() * 0.5, age: 0, hue, r: 1.2 + Math.random() * 2.4 });
                }
            };

            // 音效 / BGM
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
            let ball = { x: 380, y: 588, vx: 0, vy: 0 };
            let plunger = 0, plungerHold = false, chargeSfxDone = true;
            let L = { ang: 0.42 }, R = { ang: -0.42 };
            let LHold = false, RHold = false, LWas = false, RWas = false;
            let combo = 0, comboT = 0;
            let mult = 1, jackpot = 2500;
            let rail = -1, rampCool = 0, orbitCool = 0;
            let saucerHold = 0, toast = '', toastT = 0;
            const show = (s, d) => { toast = s; toastT = d || 1.4; };
            const lights = { bump: [0, 0, 0], targets: [false, false, false, false], lanes: [false, false, false, false, false] };
            const kickback = { L: true, R: true };
            let laneTimer = 0;          // 球困在发射巷的累计时间（防死循环兜底）

            // ---- 几何 ----
            // 挡板
            const LP = { x: 152, y: 588 }, RP = { x: 268, y: 588 };
            const FLIP_L = 66;
            const flipTip = (p, ang, dir) => ({ x: p.x + dir * Math.cos(ang) * FLIP_L, y: p.y + Math.sin(ang) * FLIP_L });
            // 蘑菇缓冲器（球形）
            const bumpers = [
                { x: 130, y: 232, r: 26, score: 150, col: '#5ec8ff' },
                { x: 210, y: 188, r: 26, score: 250, col: '#ff7ad8' },
                { x: 290, y: 232, r: 26, score: 150, col: '#ffd56b' },
            ];
            // 弹弓
            const slings = [
                { pts: [[88, 502], [128, 562], [88, 562]], score: 80, dir: 1 },
                { pts: [[332, 502], [292, 562], [332, 562]], score: 80, dir: -1 },
            ];
            // S·T·A·R 4 连靶
            const targets = [
                { x: 40, y: 268 }, { x: 40, y: 298 }, { x: 40, y: 328 }, { x: 40, y: 358 },
            ];
            const TARGET_CH = ['S', 'T', 'A', 'R'];
            // 旋转门
            const spinner = { x: 90, y: 402, w: 36, ang: 0, vel: 0, cool: 0 };
            // 计分洞
            const saucer = { x: 210, y: 320, r: 17 };
            // 弹性小柱
            const posts = [{ x: 156, y: 432, r: 8 }, { x: 264, y: 380, r: 8 }];
            // 发射巷左右壁 + 顶部
            const walls = [];
            // 外框：底（两段）
            walls.push({ x1: 8,   y1: GH - 16, x2: 96,  y2: GH - 16 });
            walls.push({ x1: 324, y1: GH - 16, x2: 412, y2: GH - 16 });
            // 排水口的左右内立柱
            walls.push({ x1: 96,  y1: GH - 16, x2: 96,  y2: 580 });
            walls.push({ x1: 324, y1: GH - 16, x2: 324, y2: 580 });
            // 发射巷左壁（衔接右弧终端）
            const laneTopY = R_ARCH_CY - R_ARCH_R;        // 36
            const laneRightWallX = 412;
            // 发射巷从 x=348（圆顶右下）到 x=412，到 y=580
            walls.push({ x1: 348, y1: 64, x2: 348, y2: 580 });    // 与右弧相接，y=64 即 r=152 处 348-260=88, 188-sqrt(152²-88²)=188-124=64
            // 发射巷右壁
            walls.push({ x1: laneRightWallX, y1: 188, x2: laneRightWallX, y2: GH - 16 });
            // 左下斜坡（与左弧衔接）
            walls.push({ x1: 8, y1: 188, x2: 8, y2: GH - 16 });
            // 左弧
            for (let i = 0; i < LEFT_ARCH.length - 1; i++)
                walls.push({ x1: LEFT_ARCH[i][0], y1: LEFT_ARCH[i][1], x2: LEFT_ARCH[i + 1][0], y2: LEFT_ARCH[i + 1][1] });
            // 顶部平
            walls.push({ x1: 160, y1: 36, x2: 260, y2: 36 });
            // 右弧
            for (let i = 0; i < RIGHT_ARCH.length - 1; i++)
                walls.push({ x1: RIGHT_ARCH[i][0], y1: RIGHT_ARCH[i][1], x2: RIGHT_ARCH[i + 1][0], y2: RIGHT_ARCH[i + 1][1] });
            // 顶部 S·P·A·C·E 通道分隔柱（4 根，y 100~170）
            const LANE_GAP = (LANE_CENTERS[4] - LANE_CENTERS[0]) / 4;     // 46
            for (let i = 1; i < LANE_CENTERS.length; i++) {
                const sx = LANE_CENTERS[0] + LANE_GAP * i;
                walls.push({ x1: sx - 4, y1: 100, x2: sx - 4, y2: 170 });
                walls.push({ x1: sx + 4, y1: 100, x2: sx + 4, y2: 170 });
            }
            // 排水口右导入斜坡
            walls.push({ x1: 348, y1: 500, x2: 324, y2: 540 });

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
            const MUTE_BTN = { x: GW - 22, y: 30, r: 13 };
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
                if (mult < 5) { mult++; sfx('jackpot'); show('倍率提升 ×' + mult, 1.6); shake = Math.max(shake, 0.18); shakeMag = Math.max(shakeMag, 3); }
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

            const reflect = (nx, ny, speedMin) => {
                const dot = ball.vx * nx + ball.vy * ny;
                ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny;
                const sp = Math.hypot(ball.vx, ball.vy);
                if (sp < speedMin) { const k = speedMin / (sp || 1); ball.vx *= k; ball.vy *= k; }
            };
            const hitWallSeg = (x1, y1, x2, y2, bounce) => {
                const { d, t } = dist2Seg(ball.x, ball.y, x1, y1, x2, y2);
                if (d < BALL_R) {
                    const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
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
                spinner.ang += spinner.vel * dt;
                spinner.vel *= Math.pow(0.55, dt);
                if (Math.abs(spinner.vel) > 0.4) {
                    spinner.spinAcc = (spinner.spinAcc || 0) + Math.abs(spinner.vel) * dt;
                    while (spinner.spinAcc > Math.PI * 2) { spinner.spinAcc -= Math.PI * 2; addScore(250); combo++; sfx('spinner'); }
                }

                // 发射
                if (!launched) {
                    ball.x = 380; ball.y = 588;
                    laneTimer = 0;
                    const holding = plungerHold || keys.has('ArrowDown') || keys.has('Space');
                    if (holding) {
                        if (chargeSfxDone) { sfx('charge'); chargeSfxDone = false; }
                        plunger = Math.min(1, plunger + dt * 1.5);
                    } else if (plunger > 0.08) {
                        // 旧版 420+560*plunger 最大 980，球到顶需要 ~1200 → 困在巷里。
                        // 改成 1320+780*plunger，最小 1380 也足够越过 64y 的巷顶进入右弧。
                        ball.vy = -(1320 + 780 * plunger);
                        ball.vx = 0;
                        launched = true; plunger = 0; chargeSfxDone = true;
                        sfx('launch'); shake = Math.max(shake, 0.12); shakeMag = Math.max(shakeMag, 2.5);
                    } else { plunger = Math.max(0, plunger - dt * 2); chargeSfxDone = true; }
                    return;
                }

                // RAMP 滑行
                if (rail >= 0) {
                    rail += dt / 0.85;
                    if (rail >= 1) {
                        rail = -1; rampCool = 0.5;
                        const e = rampAt(1);
                        ball.x = e.x; ball.y = e.y; ball.vx = 80; ball.vy = 70;
                        addScore(3000); combo++; sfx('jet');
                        show('RAMP! +' + Math.round(3000 * mult), 1.2);
                        spawnParts(ball.x, ball.y, 22, 200, 1.2);
                        shake = Math.max(shake, 0.18); shakeMag = Math.max(shakeMag, 3);
                    } else {
                        const p = rampAt(rail);
                        ball.x = p.x; ball.y = p.y; ball.vx = 0; ball.vy = 0;
                    }
                    return;
                }

                // 计分洞
                if (saucerHold > 0) {
                    saucerHold -= dt;
                    ball.x = saucer.x; ball.y = saucer.y; ball.vx = ball.vy = 0;
                    if (saucerHold <= 0) {
                        ball.vy = -560; ball.vx = (Math.random() - 0.5) * 180; ball.y = saucer.y - 16;
                        addScore(jackpot); jackpot += 500; combo++;
                        sfx('kick'); show('JACKPOT +' + Math.round(jackpot * mult).toLocaleString(), 1.5);
                        spawnParts(saucer.x, saucer.y, 28, 50, 1.3);
                        shake = Math.max(shake, 0.22); shakeMag = Math.max(shakeMag, 3.5);
                    }
                    return;
                }

                // 主物理：SUB 子步
                for (let s = 0; s < SUB; s++) {
                    ball.vy += P.grav * dt / SUB;
                    ball.vx += Math.sin(t * 0.7) * 6 * dt / SUB;
                    capSpeed(ball, SPEED_CAP);
                    ball.x += ball.vx * dt / SUB;
                    ball.y += ball.vy * dt / SUB;
                    // 墙
                    for (const wl of walls) hitWallSeg(wl.x1, wl.y1, wl.x2, wl.y2, 110);
                    // 缓冲器
                    for (let i = 0; i < bumpers.length; i++) {
                        const b = bumpers[i];
                        const dx = ball.x - b.x, dy = ball.y - b.y;
                        const d = Math.hypot(dx, dy);
                        if (d < b.r + BALL_R) {
                            const nx = dx / (d || 1), ny = dy / (d || 1);
                            ball.x = b.x + nx * (b.r + BALL_R); ball.y = b.y + ny * (b.r + BALL_R);
                            reflect(nx, ny, 320 * P.bumperPow);
                            addScore(b.score); combo++; lights.bump[i] = 1;
                            sfx('bumper'); spawnParts(b.x, b.y, 8, 50, 1);
                            shake = Math.max(shake, 0.08); shakeMag = Math.max(shakeMag, 1.5);
                        }
                    }
                    // 弹弓
                    for (const sg of slings) {
                        for (let i = 0; i < 3; i++) {
                            const a = sg.pts[i], b2 = sg.pts[(i + 1) % 3];
                            const before = { x: ball.x, y: ball.y };
                            if (hitWallSeg(a[0], a[1], b2[0], b2[1], 520)) {
                                if (i === 0) { addScore(sg.score); combo++; sfx('sling'); spawnParts(sg.pts[1][0], sg.pts[1][1], 6, 0, 0.9); }
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
                            reflect(nx, ny, 280); addScore(60);
                        }
                    }
                    // 4 连靶
                    for (let i = 0; i < targets.length; i++) {
                        const tg = targets[i];
                        if (Math.abs(ball.x - tg.x) < BALL_R + 10 && Math.abs(ball.y - tg.y) < BALL_R + 9) {
                            if (!lights.targets[i]) {
                                lights.targets[i] = true;
                                addScore(600); combo++; sfx('target');
                                reflect(ball.x < tg.x ? -1 : 1, 0, 280);
                                spawnParts(tg.x, tg.y, 4, 30, 0.6);
                                if (lights.targets.every(Boolean)) {
                                    addScore(8000); sfx('jackpot');
                                    show('S·T·A·R 全清 +8,000', 1.6);
                                    lights.targets = [false, false, false, false];
                                    bumpMult();
                                }
                            } else reflect(ball.x < tg.x ? -1 : 1, 0, 220);
                        }
                    }
                    // S·P·A·C·E 滚道
                    for (let i = 0; i < LANE_CENTERS.length; i++) {
                        const cx = LANE_CENTERS[i];
                        if (Math.abs(ball.x - cx) < 12 && ball.y > 100 && ball.y < 168) {
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
                        const pw = Math.min(28, Math.abs(ball.vy) * 0.04 + 7);
                        spinner.vel = Math.max(spinner.vel, pw);
                        spinner.cool = 0.25;
                        addScore(120); combo++; sfx('spinner');
                        ball.vy *= 0.82;
                    }
                    // RAMP 入口（球高速冲上右侧 x∈[320,360] y∈[300,340] 时吸上）
                    if (rail < 0 && rampCool <= 0 && ball.vy < -340 &&
                        ball.x > 318 && ball.x < 362 && ball.y > 296 && ball.y < 342) {
                        rail = 0; sfx('ramp');
                    }
                    // 右侧环轨（球从右上滑回）
                    if (orbitCool <= 0 && ball.x > 316 && ball.y > 348 && ball.y < 396 && ball.vy > 0) {
                        orbitCool = 1.2; addScore(1200); combo++; sfx('rollover');
                        show('轨道 +1,200', 1.0);
                    }
                    // JACKPOT 洞
                    if (Math.hypot(ball.x - saucer.x, ball.y - saucer.y) < saucer.r &&
                        Math.hypot(ball.vx, ball.vy) < 900) {
                        saucerHold = 0.85; ball.x = saucer.x; ball.y = saucer.y; ball.vx = ball.vy = 0;
                        sfx('saucer');
                        return;
                    }
                    // 挡板
                    const lTip = flipTip(LP, L.ang, 1), rTip = flipTip(RP, R.ang, -1);
                    const hitFlipper = (pivot, tip, dir, up) => {
                        const { d, t } = dist2Seg(ball.x, ball.y, pivot.x, pivot.y, tip.x, tip.y);
                        if (d < BALL_R + 7) {
                            const cx = pivot.x + (tip.x - pivot.x) * t, cy = pivot.y + (tip.y - pivot.y) * t;
                            let nx = ball.x - cx, ny = ball.y - cy;
                            const Ln = Math.hypot(nx, ny) || 1; nx /= Ln; ny /= Ln;
                            ball.x = cx + nx * (BALL_R + 7); ball.y = cy + ny * (BALL_R + 7);
                            reflect(nx, ny, 180);
                            if (up) { ball.vy -= 340; ball.vx += dir * 95; sfx('flip'); spawnParts(tip.x, tip.y, 3, 50, 0.4); }
                            return true;
                        }
                        return false;
                    };
                    hitFlipper(LP, lTip, 1, LHold || keys.has('ArrowLeft') || keys.has('KeyZ'));
                    hitFlipper(RP, rTip, -1, RHold || keys.has('ArrowRight') || keys.has('Slash'));
                    // 困在发射巷兜底：每球最多一次，发现 ball 长时间在 x>348, y>400 → 强制再击
                    if (ball.x > 348 && ball.y > 400 && ball.y < 560) {
                        laneTimer += dt / SUB;
                        if (laneTimer > 2.2) {
                            ball.vy = -(1350 + 200 * Math.random());
                            ball.vx = -80 - Math.random() * 60;
                            laneTimer = 0;
                        }
                    } else laneTimer = 0;
                    // 排水
                    if (ball.y > GH - 6) {
                        sfx('drain');
                        combo = 0; mult = 1; jackpot = 2500;
                        lights.targets = [false, false, false, false];
                        lights.lanes = [false, false, false, false, false];
                        if (endless) { launched = false; ball = { x: 380, y: 588, vx: 0, vy: 0 }; }
                        else {
                            balls--;
                            if (balls <= 0) finish(false);
                            else { launched = false; ball = { x: 380, y: 588, vx: 0, vy: 0 }; }
                        }
                        kickback.L = kickback.R = true; laneTimer = 0;
                        return;
                    }
                }
                const lDown = LHold || keys.has('ArrowLeft') || keys.has('KeyZ');
                const rDown = RHold || keys.has('ArrowRight') || keys.has('Slash');
                if ((lDown && !LWas) || (rDown && !RWas)) sfx('flip');
                LWas = lDown; RWas = rDown;
                L.ang += ((lDown ? -0.5 : 0.42) - L.ang) * Math.min(1, dt * 28);
                R.ang += ((rDown ? 0.5 : -0.42) - R.ang) * Math.min(1, dt * 28);

                // 屏幕震动衰减
                if (shake > 0) { shake = Math.max(0, shake - dt * 1.6); }
            };

            // ============== 绘制 ==============
            const draw = () => {
                ctx.save();
                if (shake > 0) {
                    ctx.translate((Math.random() - 0.5) * shake * shakeMag, (Math.random() - 0.5) * shake * shakeMag);
                }
                drawCabinet();
                drawPlayfield();
                drawRamp();
                drawLanes();
                drawBumpers();
                drawSlings();
                drawPosts();
                drawTargets();
                drawSpinner();
                drawSaucer();
                drawKick(46, 624, kickback.L, '◀');
                drawKick(324, 624, kickback.R, '▶');
                drawWalls();
                drawFlippers();
                drawPlunger();
                drawBall();
                drawPlungerBar();
                drawParticles();
                drawDMD();
                drawToast();
                drawMuteBtn();
                drawMeta();
                ctx.restore();
                opts.onScore && opts.onScore(
                    `${endless ? '无尽' : `第 ${idx0 + 1} 关`} · ${score.toLocaleString()}${endless ? '' : ' / ' + P.goal.toLocaleString()} 分 · 球 ${endless ? '∞' : balls} · ×${mult} · 连击 ×${combo}`
                );
            };

            function drawCabinet() {
                // 外框：金属深蓝 + 螺丝
                const g0 = ctx.createLinearGradient(0, 0, 0, GH);
                g0.addColorStop(0, '#0a0f1f'); g0.addColorStop(0.5, '#1b2240'); g0.addColorStop(1, '#070a14');
                ctx.fillStyle = g0; ctx.fillRect(0, 0, GW, GH);
                // 内部台面边框
                ctx.strokeStyle = 'rgba(80,120,200,0.45)'; ctx.lineWidth = 3;
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(4, 4, GW - 8, GH - 8, 16); ctx.stroke(); }
                // 4 角螺丝
                ctx.fillStyle = '#9fb3da';
                [[14, 14], [GW - 14, 14], [14, GH - 14], [GW - 14, GH - 14]].forEach(([x, y]) => {
                    const sg = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 4);
                    sg.addColorStop(0, '#dfe6f5'); sg.addColorStop(1, '#5a6480');
                    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#0a0f1f'; ctx.lineWidth = 1; ctx.stroke();
                });
            }

            function drawPlayfield() {
                // 内部背景（圆角）
                const inset = 6;
                let g = null;
                try { g = ctx.createLinearGradient(0, 16, 0, GH - 16); g.addColorStop(0, '#1d2348'); g.addColorStop(0.5, '#10142a'); g.addColorStop(1, '#070a18'); } catch (e) { }
                ctx.fillStyle = g || '#10142a';
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(inset, 16, GW - inset * 2, GH - 32, 12); ctx.fill(); }
                // 星点
                for (let i = 0; i < 70; i++) {
                    const sx = (i * 137 + 31) % (GW - 22) + 11;
                    const sy = (i * 89 + 53) % (GH - 70) + 30;
                    const blink = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + (i % 7) * 0.12) + i));
                    ctx.fillStyle = `rgba(255,255,255,${0.18 + 0.4 * blink})`;
                    ctx.fillRect(sx, sy, 1.4, 1.4);
                }
                // 网格
                ctx.strokeStyle = 'rgba(120,150,220,0.06)'; ctx.lineWidth = 1;
                ctx.beginPath();
                for (let y = 50; y < GH - 30; y += 36) { ctx.moveTo(12, y); ctx.lineTo(GW - 12, y); }
                for (let x = 30; x < GW - 30; x += 36) { ctx.moveTo(x, 50); ctx.lineTo(x, GH - 30); }
                ctx.stroke();
                // 行星（左下）— 带环
                const px = 84, py = 462, pr = 30;
                let pg = null;
                try { pg = ctx.createRadialGradient(px - 8, py - 10, 4, px, py, pr); pg.addColorStop(0, '#ffb070'); pg.addColorStop(0.4, '#cf6a3a'); pg.addColorStop(1, '#3a1a10'); } catch (e) { }
                ctx.save();
                ctx.globalAlpha = 0.78;
                ctx.fillStyle = pg || '#cf6a3a';
                ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 0.4;
                ctx.strokeStyle = '#ffd0a0'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.ellipse(px, py + 4, pr + 16, 7, -0.35, 0, Math.PI * 2); ctx.stroke();
                ctx.globalAlpha = 0.18;
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.ellipse(px, py + 4, pr + 22, 9, -0.35, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
                // 星云
                ctx.save();
                let ng = null;
                try { ng = ctx.createRadialGradient(290, 250, 8, 290, 250, 80); ng.addColorStop(0, 'rgba(140,90,255,0.40)'); ng.addColorStop(0.5, 'rgba(70,40,160,0.22)'); ng.addColorStop(1, 'rgba(0,0,0,0)'); } catch (e) { }
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = ng || 'rgba(70,40,160,0.22)';
                ctx.beginPath(); ctx.arc(290, 250, 80, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                // 徽标
                ctx.save();
                ctx.globalAlpha = 0.18;
                ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#9fd8ff';
                ctx.fillText('SPACE CADET', 210, 484);
                ctx.font = '8px Arial'; ctx.fillStyle = '#7affd0';
                ctx.fillText('★ ★ ★', 210, 498);
                ctx.restore();
                // 暗角
                const vg = ctx.createRadialGradient(GW / 2, GH / 2, 120, GW / 2, GH / 2, 320);
                vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
                ctx.fillStyle = vg;
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(inset, 16, GW - inset * 2, GH - 32, 12); ctx.fill(); }
            }

            function drawRamp() {
                ctx.save();
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                // 凹槽底
                ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 20;
                ctx.beginPath(); ctx.moveTo(RAMP_PTS[0][0], RAMP_PTS[0][1]);
                for (let i = 1; i < RAMP_PTS.length; i++) ctx.lineTo(RAMP_PTS[i][0], RAMP_PTS[i][1]);
                ctx.stroke();
                // 塑料透明感
                let rg = null;
                try { rg = ctx.createLinearGradient(50, 220, 360, 200); rg.addColorStop(0, 'rgba(70,180,255,0.10)'); rg.addColorStop(0.5, 'rgba(160,235,255,0.45)'); rg.addColorStop(1, 'rgba(70,180,255,0.18)'); } catch (e) { }
                ctx.strokeStyle = rg || 'rgba(160,235,255,0.45)'; ctx.lineWidth = 14;
                ctx.stroke();
                // 边轨（描边）
                ctx.strokeStyle = '#bfe4ff'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.7;
                ctx.stroke();
                // 动箭头虚线
                ctx.globalAlpha = 1;
                ctx.setLineDash([8, 10]);
                ctx.lineDashOffset = -(t * 80) % 18;
                ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
                ctx.stroke();
                ctx.setLineDash([]);
                // 入口箭头
                const glow = 0.5 + 0.4 * Math.sin(t * 5);
                ctx.fillStyle = `rgba(140,235,255,${glow})`;
                ctx.beginPath(); ctx.moveTo(336, 340); ctx.lineTo(352, 320); ctx.lineTo(320, 320); ctx.closePath(); ctx.fill();
                ctx.fillStyle = 'rgba(180,240,255,0.95)'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
                ctx.fillText('RAMP', 336, 354);
                // 支撑柱
                ctx.fillStyle = '#3a4a78';
                [[80, 222], [188, 162], [310, 184]].forEach(([x, y]) => { ctx.fillRect(x - 2, y - 1, 4, 4); });
                ctx.restore();
            }

            function drawLanes() {
                // 通道背景底色
                const laneY0 = 100, laneY1 = 170;
                ctx.save();
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(80, laneY0 - 4, GW - 160, laneY1 - laneY0 + 8, 6); ctx.fill(); }
                // 每个通道
                for (let i = 0; i < LANE_CENTERS.length; i++) {
                    const cx = LANE_CENTERS[i], on = lights.lanes[i];
                    if (on) { ctx.shadowColor = '#7affd0'; ctx.shadowBlur = 12; }
                    ctx.fillStyle = on ? '#7affd0' : 'rgba(122,255,208,0.18)';
                    ctx.beginPath(); ctx.arc(cx, (laneY0 + laneY1) / 2, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = on ? '#0b1a22' : 'rgba(190,255,225,0.65)';
                    ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(LANE_CH[i], cx, (laneY0 + laneY1) / 2 + 0.5);
                }
                ctx.restore();
            }

            function drawBumpers() {
                for (let i = 0; i < bumpers.length; i++) {
                    const b = bumpers[i];
                    const pulse = Math.max(0, lights.bump[i]);
                    lights.bump[i] = Math.max(0, lights.bump[i] - 0.07);
                    ctx.save();
                    ctx.shadowColor = pulse > 0 ? b.col : 'rgba(80,120,200,0.5)';
                    ctx.shadowBlur = 12 + pulse * 28;
                    // 底座
                    let bg = null;
                    try { bg = ctx.createRadialGradient(b.x - 4, b.y - 6, 3, b.x, b.y, b.r); bg.addColorStop(0, '#a8b3d8'); bg.addColorStop(1, '#2a3050'); } catch (e) { }
                    ctx.fillStyle = bg || '#3a466e';
                    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
                    // 蘑菇盖（高光 + 主色）
                    let cg = null;
                    try { cg = createRadial(b.x, b.y, b.r, pulse > 0 ? '#ffffff' : b.col, pulse > 0 ? b.col : '#5a6480', pulse > 0 ? '#2a3050' : '#1c2240'); } catch (e) { }
                    if (cg) {
                        ctx.fillStyle = cg;
                        ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 5, 0, Math.PI * 2); ctx.fill();
                    }
                    // 中心高光
                    ctx.fillStyle = 'rgba(255,255,255,0.55)';
                    ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.18, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    // 描边
                    ctx.strokeStyle = '#0a0e1a'; ctx.lineWidth = 2.5;
                    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
                    // 分数
                    ctx.fillStyle = pulse > 0 ? '#fff' : 'rgba(255,255,255,0.85)';
                    ctx.font = `bold ${pulse > 0 ? 13 : 11}px Arial`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(b.score, b.x, b.y);
                }
            }

            function createRadial(x, y, r, c0, c1, c2) {
                const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r - 4);
                g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
                return g;
            }

            function drawSlings() {
                for (const sg of slings) {
                    // 主体三角橡胶
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
                    let tg = null;
                    try { tg = ctx.createLinearGradient(sg.pts[2][0], sg.pts[2][1], sg.pts[0][0], sg.pts[0][1]); tg.addColorStop(0, '#ff6b86'); tg.addColorStop(0.5, '#d63a55'); tg.addColorStop(1, '#8a1a30'); } catch (e) { }
                    ctx.fillStyle = tg || '#d63a55';
                    ctx.beginPath();
                    ctx.moveTo(sg.pts[0][0], sg.pts[0][1]);
                    for (let i = 1; i < 3; i++) ctx.lineTo(sg.pts[i][0], sg.pts[i][1]);
                    ctx.closePath(); ctx.fill();
                    // 高光
                    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.4;
                    ctx.beginPath(); ctx.moveTo(sg.pts[0][0] + 5 * sg.dir, sg.pts[0][1] + 6); ctx.lineTo(sg.pts[1][0] - 5 * sg.dir, sg.pts[1][1] - 6); ctx.stroke();
                    // 描边
                    ctx.strokeStyle = '#3a0a18'; ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(sg.pts[0][0], sg.pts[0][1]);
                    for (let i = 1; i < 3; i++) ctx.lineTo(sg.pts[i][0], sg.pts[i][1]);
                    ctx.closePath(); ctx.stroke();
                    // 3 根金属柱
                    ctx.fillStyle = '#9fb3da';
                    [[sg.pts[0][0], sg.pts[0][1] + 4], [sg.pts[2][0], sg.pts[2][1] - 4], [sg.pts[1][0] - 6 * sg.dir, sg.pts[1][1] - 8]].forEach(([x, y]) => {
                        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = '#1a2240'; ctx.lineWidth = 1; ctx.stroke();
                    });
                    ctx.restore();
                }
            }

            function drawPosts() {
                for (const p of posts) {
                    ctx.save();
                    // 红胶圈
                    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
                    const rg = ctx.createRadialGradient(p.x - 1, p.y - 1, 1, p.x, p.y, p.r);
                    rg.addColorStop(0, '#ff7a8b'); rg.addColorStop(0.6, '#d63a55'); rg.addColorStop(1, '#5a0a18');
                    ctx.fillStyle = rg;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                    // 中心金属
                    const mg = ctx.createRadialGradient(p.x - 0.8, p.y - 1, 0.3, p.x, p.y, p.r * 0.5);
                    mg.addColorStop(0, '#f0f4ff'); mg.addColorStop(1, '#7a86a8');
                    ctx.fillStyle = mg;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    ctx.strokeStyle = '#0a0e1a'; ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
                }
            }

            function drawTargets() {
                for (let i = 0; i < targets.length; i++) {
                    const tg = targets[i], on = lights.targets[i];
                    ctx.save();
                    // 阴影
                    if (!on) { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2; }
                    // 主体
                    const fg = ctx.createLinearGradient(tg.x - 10, tg.y - 7, tg.x + 10, tg.y + 7);
                    fg.addColorStop(0, on ? '#ffd56b' : '#c46a3a');
                    fg.addColorStop(0.5, on ? '#ffae3a' : '#8a3a1a');
                    fg.addColorStop(1, on ? '#a06010' : '#3a1a0a');
                    ctx.fillStyle = fg;
                    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(tg.x - 11, tg.y - 8, 22, 16, 3); ctx.fill(); }
                    // 高光
                    if (!on) {
                        ctx.fillStyle = 'rgba(255,255,255,0.25)';
                        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(tg.x - 9, tg.y - 6, 18, 4, 2); ctx.fill(); }
                    } else {
                        ctx.shadowColor = '#ffae3a'; ctx.shadowBlur = 14;
                        ctx.fillStyle = '#fff5d0';
                        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(tg.x - 11, tg.y - 8, 22, 16, 3); ctx.fill(); }
                    }
                    ctx.restore();
                    // 描边
                    ctx.strokeStyle = on ? '#fff' : '#1a0a04';
                    ctx.lineWidth = on ? 1.5 : 1.8;
                    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(tg.x - 11, tg.y - 8, 22, 16, 3); ctx.stroke(); }
                    // 字符
                    ctx.fillStyle = on ? '#2a1008' : 'rgba(255,230,200,0.85)';
                    ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(TARGET_CH[i], tg.x, tg.y + 0.5);
                }
            }

            function drawSpinner() {
                ctx.save();
                ctx.translate(spinner.x, spinner.y);
                ctx.rotate(spinner.ang * 0.1);
                // 金属条
                const mg = ctx.createLinearGradient(-spinner.w / 2, 0, spinner.w / 2, 0);
                mg.addColorStop(0, '#3a466e'); mg.addColorStop(0.5, '#c8d0e8'); mg.addColorStop(1, '#3a466e');
                ctx.fillStyle = mg;
                ctx.fillRect(-spinner.w / 2, -4, spinner.w, 8);
                // 端帽
                ctx.fillStyle = '#1a2240';
                ctx.beginPath(); ctx.arc(-spinner.w / 2, 0, 4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(spinner.w / 2, 0, 4, 0, Math.PI * 2); ctx.fill();
                // 中心轴
                ctx.fillStyle = '#9fb3da';
                ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.fillStyle = 'rgba(180,210,255,0.6)'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center';
                ctx.fillText('SPIN', spinner.x, spinner.y + 22);
            }

            function drawSaucer() {
                ctx.save();
                // 外环
                const jg = 0.5 + 0.3 * Math.sin(t * 4);
                ctx.shadowColor = 'rgba(255,210,90,0.6)'; ctx.shadowBlur = 12 + jg * 12;
                ctx.fillStyle = '#070a14';
                ctx.beginPath(); ctx.arc(saucer.x, saucer.y, saucer.r, 0, Math.PI * 2); ctx.fill();
                // 内圈
                let sg = null;
                try { sg = ctx.createRadialGradient(saucer.x - 4, saucer.y - 5, 2, saucer.x, saucer.y, saucer.r - 3); sg.addColorStop(0, `rgba(255,238,180,${0.9 * jg + 0.4})`); sg.addColorStop(1, `rgba(255,140,40,${0.7})`); } catch (e) { }
                ctx.fillStyle = sg || 'rgba(255,200,90,0.7)';
                ctx.beginPath(); ctx.arc(saucer.x, saucer.y, saucer.r - 3, 0, Math.PI * 2); ctx.fill();
                // 高光
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.beginPath(); ctx.arc(saucer.x - saucer.r * 0.35, saucer.y - saucer.r * 0.4, saucer.r * 0.16, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.strokeStyle = '#bfa050'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(saucer.x, saucer.y, saucer.r, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = 'rgba(255,225,150,0.9)'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
                ctx.fillText('JACKPOT', saucer.x, saucer.y - 24);
                ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '8px Arial';
                ctx.fillText((jackpot * mult).toLocaleString(), saucer.x, saucer.y + 30);
            }

            function drawKick(x, y, on, arrow) {
                ctx.save();
                if (on) { ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 12; }
                const kg = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 6);
                kg.addColorStop(0, on ? '#fff5d0' : '#ffd56b'); kg.addColorStop(1, on ? '#a07010' : '#5a3008');
                ctx.fillStyle = kg;
                ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.fillStyle = on ? '#3a2a06' : 'rgba(255,213,107,0.5)';
                ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(arrow, x, y + 0.5);
                ctx.fillStyle = 'rgba(255,213,107,0.45)'; ctx.font = '7px Arial';
                ctx.fillText('KICK', x, y + 15);
            }

            function drawWalls() {
                // 双线：暗底 + 亮顶
                ctx.save();
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.strokeStyle = '#5a6aa0'; ctx.lineWidth = 5;
                ctx.beginPath();
                for (const wl of walls) { ctx.moveTo(wl.x1, wl.y1); ctx.lineTo(wl.x2, wl.y2); }
                ctx.stroke();
                ctx.strokeStyle = 'rgba(180,210,255,0.55)'; ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (const wl of walls) { ctx.moveTo(wl.x1, wl.y1); ctx.lineTo(wl.x2, wl.y2); }
                ctx.stroke();
                ctx.restore();
            }

            function drawFlippers() {
                const drawFlipper = (pivot, ang, dir, col) => {
                    const tip = flipTip(pivot, ang, dir);
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
                    // 黄色橡胶主体
                    const fg = ctx.createLinearGradient(pivot.x, pivot.y, tip.x, tip.y);
                    fg.addColorStop(0, '#f5d36a'); fg.addColorStop(0.5, '#ffd56b'); fg.addColorStop(1, '#a06a18');
                    ctx.strokeStyle = fg; ctx.lineWidth = 14; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
                    // 顶部高光
                    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(pivot.x + dir * 2, pivot.y - 2); ctx.lineTo(tip.x - dir * 1, tip.y - 3); ctx.stroke();
                    // 中心轴
                    const pg = ctx.createRadialGradient(pivot.x - 1, pivot.y - 1, 1, pivot.x, pivot.y, 9);
                    pg.addColorStop(0, '#dfe6f5'); pg.addColorStop(0.5, '#7a86a8'); pg.addColorStop(1, '#1a2240');
                    ctx.fillStyle = pg;
                    ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#0a0e1a'; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.restore();
                };
                drawFlipper(LP, L.ang, 1, '#e8b83a');
                drawFlipper(RP, R.ang, -1, '#e8b83a');
            }

            function drawPlunger() {
                // 发射巷底盒
                ctx.save();
                ctx.fillStyle = '#1a2240'; ctx.fillRect(352, 200, 60, GH - 220);
                ctx.strokeStyle = '#5a6aa0'; ctx.lineWidth = 1.5;
                ctx.strokeRect(352, 200, 60, GH - 220);
                // 弹簧
                ctx.strokeStyle = '#bfa050'; ctx.lineWidth = 2;
                for (let i = 0; i < 5; i++) {
                    const yy = 600 - plunger * 20 - i * 8;
                    ctx.beginPath();
                    ctx.moveTo(372, yy);
                    ctx.lineTo(376, yy - 4); ctx.lineTo(372, yy - 8); ctx.lineTo(376, yy - 12);
                    ctx.stroke();
                }
                // 活塞头
                ctx.fillStyle = '#e8b83a';
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(360, 590 - plunger * 22, 22, 12, 4); ctx.fill(); }
                else { ctx.fillRect(360, 590 - plunger * 22, 22, 12); }
                ctx.fillStyle = '#fff5d0';
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(362, 591 - plunger * 22, 18, 3, 2); ctx.fill(); }
                ctx.restore();
            }

            function drawBall() {
                // 投影
                ctx.save();
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.beginPath(); ctx.ellipse(ball.x + 2, ball.y + 3, BALL_R, BALL_R * 0.5, 0, 0, Math.PI * 2); ctx.fill();
                // 拖尾
                const trail = 3;
                for (let i = trail; i >= 1; i--) {
                    ctx.fillStyle = `rgba(180,220,255,${0.05 * (trail - i + 1)})`;
                    ctx.beginPath();
                    ctx.arc(ball.x - ball.vx * 0.014 * i, ball.y - ball.vy * 0.014 * i, BALL_R - 1, 0, Math.PI * 2);
                    ctx.fill();
                }
                // 球本体（金属 + 反射）
                const sp = Math.hypot(ball.vx, ball.vy);
                const tilt = Math.min(1, sp / 800);
                let bg = null;
                try {
                    bg = ctx.createRadialGradient(ball.x - 3, ball.y - 4, 1, ball.x, ball.y, BALL_R);
                    bg.addColorStop(0, '#ffffff');
                    bg.addColorStop(0.25, '#c8d4ea');
                    bg.addColorStop(0.7, '#5a6480');
                    bg.addColorStop(1, '#0a0e1a');
                } catch (e) { }
                ctx.fillStyle = bg || '#c8d4ea';
                ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
                // 反射窗（让球"动"起来）
                const ra = Math.atan2(ball.vy, ball.vx) + Math.PI;
                const rx = ball.x + Math.cos(ra) * 3;
                const ry = ball.y + Math.sin(ra) * 3;
                ctx.fillStyle = `rgba(160,235,255,${0.3 + 0.4 * tilt})`;
                ctx.beginPath(); ctx.arc(rx, ry, 2.6, 0, Math.PI * 2); ctx.fill();
                // 主高光
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.beginPath(); ctx.arc(ball.x - 3.2, ball.y - 3.4, 2.2, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                if (rail >= 0) {
                    ctx.save(); ctx.strokeStyle = 'rgba(150,235,255,0.9)'; ctx.lineWidth = 2.5;
                    ctx.shadowColor = '#96ebff'; ctx.shadowBlur = 14;
                    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R + 3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
                }
            }

            function drawPlungerBar() {
                if (!launched && plunger > 0) {
                    ctx.fillStyle = '#0a0e1a'; ctx.fillRect(344, 500, 8, 90);
                    const ph = plunger * 86;
                    ctx.fillStyle = `hsl(${130 - plunger * 130},85%,55%)`;
                    ctx.fillRect(345, 588 - ph, 6, ph);
                }
            }

            function drawParticles() {
                ctx.save();
                for (let i = parts.length - 1; i >= 0; i--) {
                    const p = parts[i];
                    p.age += 0.016;
                    if (p.age >= p.life) { parts.splice(i, 1); continue; }
                    p.vy += 220 * 0.016;
                    p.x += p.vx * 0.016; p.y += p.vy * 0.016;
                    const a = 1 - p.age / p.life;
                    ctx.fillStyle = `hsla(${p.hue},90%,70%,${a})`;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }

            function drawDMD() {
                // 圆顶上方 DMD 风格记分牌
                ctx.save();
                ctx.fillStyle = '#05070d';
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(58, 14, GW - 116, 22, 5); ctx.fill(); }
                ctx.strokeStyle = '#3a466e'; ctx.lineWidth = 1.2;
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(58, 14, GW - 116, 22, 5); ctx.stroke(); }
                ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 4;
                ctx.fillStyle = '#ffd56b';
                ctx.font = 'bold 12px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const s = score.toLocaleString();
                ctx.fillText(s.padStart(8, '0'), GW / 2, 26);
                // 球数
                ctx.shadowBlur = 0;
                ctx.fillStyle = 'rgba(160,235,255,0.6)'; ctx.font = '8px Arial';
                if (endless) ctx.fillText('∞', GW - 70, 26);
                else for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(GW - 110 + i * 10, 26, 3, 0, Math.PI * 2);
                    ctx.fillStyle = i < balls ? '#7affd0' : 'rgba(122,255,208,0.18)';
                    ctx.fill();
                }
                // 倍率
                ctx.fillStyle = mult > 1 ? '#ffd56b' : 'rgba(160,235,255,0.6)';
                ctx.font = `bold ${mult > 1 ? 11 : 9}px Arial`;
                ctx.textAlign = 'left';
                ctx.fillText('×' + mult, 70, 26);
                ctx.restore();
            }

            function drawToast() {
                if (toastT > 0 && toast) {
                    ctx.save();
                    ctx.globalAlpha = Math.min(1, toastT * 1.6);
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.font = 'bold 18px Arial';
                    ctx.fillStyle = '#ffd56b';
                    ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 14;
                    ctx.fillText(toast, GW / 2, 240);
                    ctx.restore();
                }
            }

            function drawMuteBtn() {
                const m = MUTE_BTN;
                ctx.save();
                ctx.fillStyle = 'rgba(10,14,30,0.7)';
                ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(160,190,255,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
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

            function drawMeta() {
                ctx.save();
                ctx.textAlign = 'center'; ctx.font = '8px Arial';
                ctx.fillStyle = 'rgba(200,220,255,0.4)';
                ctx.fillText((endless ? '∞ 无尽 · ' : `第 ${idx0 + 1} 关 · `) + NAMES[Math.min(49, idx0 < 0 ? 0 : idx0)], GW / 2, GH - 18);
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
            if (typeof window !== 'undefined' && window.__MG_TEST) {
                window.__pinball = {
                    get over() { return over; }, get score() { return score; },
                    get balls() { return balls; }, get launched() { return launched; },
                    get ball() { return ball; }, get combo() { return combo; },
                    get mult() { return mult; }, get rail() { return rail; },
                    get lights() { return lights; }, get spinner() { return spinner; },
                    addScore, finish,
                    launch: v => { plungerHold = false; plunger = v || 0.9; ball.vy = -(1320 + 780 * plunger); ball.vx = 0; launched = true; plunger = 0; },
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
