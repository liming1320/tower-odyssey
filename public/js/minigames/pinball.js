// 三维弹球 · 太空军校生（100% 自研实现，向 Windows《3D Pinball – Space Cadet》致敬）
//
// 台面结构（按原版分区复刻）：
//   拱形顶弧 · 右侧发射巷 + 弹簧活塞 · 顶部 4 组滚道灯
//   3 只蘑菇缓冲器（三角形布置）· 左侧 4 连落下靶 · 右侧旋转门
//   环形坡道（右下入口 → 跨顶 → 左上回落）· 中央计分洞（捕获 → 弹射）
//   双弹弓 · 双挡板 · 左右外道（带 KICKBACK 救球）
//   顶部 habitrail 管道：发射后沿管道跨顶，从左上落入台面（原版行为）
//
// 控制：← / → 挡板 · 空格/↓ 按住蓄力松手发射 · M 静音 · 触屏左右半屏=挡板
// 50 关军衔 + ∞ 无尽；3 球制；倍率 ×1~×5
window.MiniGames = window.MiniGames || {};
(function () {
    'use strict';

    /* ══════════════════════ 1. 常量 / 台面几何 ══════════════════════ */
    // 布局对齐原版：左侧台面 + 右侧指令面板（logo / BALL / 分数框 / 任务框）
    const GW = 620, GH = 700;
    const PANEL = { x: 434, w: 176, y: 96, h: 592 };
    const BALL_R = 9;
    const GRAV = 1500;
    const SUB = 6;                 // 物理子步
    const SPEED_CAP = 1800;

    // 台面：左右直墙 + 顶部半圆拱
    const PF = { l: 28, r: 324, cx: 176, cy: 300, arcR: 148, bot: 648 };
    const LANE = { l: 346, r: 402, top: 118, bot: 690 };
    const LNCX = (LANE.l + LANE.r) / 2;      // 374 —— 发射巷中线
    const PLG_TOP = 648;                     // 活塞头顶面（未蓄力）
    const BALL_REST_Y = PLG_TOP - BALL_R;    // 639
    const PLG_PULL = 26;                     // 满蓄力后退距离

    const DMD = { x: 20, y: 14, w: 380, h: 84 };   // 加高：第三行显示当前任务与进度

    // 顶部涡轮引擎 ×3（倒三角布置，原版 turbo bumper 位）
    const BUMPERS = [
        { x: 120, y: 250, r: 23, hue: 5 },
        { x: 232, y: 250, r: 23, hue: 22 },
        { x: 176, y: 314, r: 23, hue: 40 },
    ];
    // 左侧涡轮引擎 ×3（竖排，原版左路引擎带）
    const JETS = [
        { x: 76, y: 292, r: 18, hue: 145 },
        { x: 76, y: 344, r: 18, hue: 180 },
        { x: 76, y: 396, r: 18, hue: 210 },
    ];
    // 左上角第 7 只引擎：涡轮虫洞（吸入 → 送进左侧火箭管道重新发射）
    const WARP = { x: 102, y: 212, r: 16 };
    // 小弹力柱
    const POSTS = [{ x: 116, y: 262, r: 6 }, { x: 280, y: 262, r: 6 },
    { x: 46, y: 466, r: 6 }, { x: 306, y: 466, r: 6 }];
    // 落下靶（右排 3 只，靶面朝左）
    const TARGETS = [300, 346, 392].map((y, i) => ({ i, x: 276, y, w: 7, h: 28, down: false }));
    // 旋转门
    const SPIN = { x: 128, y: 430, w: 30, h: 9 };
    // 计分洞
    const SAUCER = { x: 176, y: 452, r: 17 };
    // 翻牌 ×3（Space Cadet 式翻转徽章牌，集齐 3 张开大奖）
    const CARDS = [
        { x: 140, y: 392, w: 30, h: 36 },
        { x: 176, y: 392, w: 30, h: 36 },
        { x: 212, y: 392, w: 30, h: 36 },
    ];
    // 顶部滚道灯
    const LANES = [{ x: 140, y: 194 }, { x: 172, y: 178 }, { x: 214, y: 180 }, { x: 250, y: 198 }];
    // 弹弓（三角形，斜边朝向台面中央）
    const SLINGS = [
        { a: [62, 498], b: [124, 558], c: [62, 558] },
        { a: [290, 498], b: [228, 558], c: [290, 558] },
    ];
    // 挡板
    const FLIP_L = { px: 108, py: 592, len: 58, rest: 0.52, up: -0.52 };
    const FLIP_R = { px: 244, py: 592, len: 58, rest: Math.PI - 0.52, up: Math.PI + 0.52 };
    // 外道导轨（把外道与内道分开）
    const GUIDE_L = [[62, 558], [74, 592], [100, 602]];
    const GUIDE_R = [[290, 558], [278, 592], [252, 602]];

    // 美术全部程序化绘制（对齐原版 Space Cadet 配色：暗海军台面 + 金褐轨道 + 红橙引擎 + 金翼徽章）

    /* ══════════════════════ 2. 工具 ══════════════════════ */
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const lerp = (a, b, t) => a + (b - a) * t;

    function arcPts(cx, cy, r, a0, a1, steps) {
        const out = [];
        for (let i = 0; i <= steps; i++) {
            const a = a0 + (a1 - a0) * i / steps;
            out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return out;
    }
    function polySegs(pts, closed, r) {
        const segs = [];
        const n = pts.length;
        for (let i = 0; i < (closed ? n : n - 1); i++) {
            const p = pts[i], q = pts[(i + 1) % n];
            segs.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1], r: r || 0 });
        }
        return segs;
    }
    // Catmull-Rom 平滑
    function smooth(pts, per) {
        per = per || 10;
        if (pts.length < 3) return pts.slice();
        const P = [pts[0]].concat(pts, [pts[pts.length - 1]]);
        const out = [];
        for (let i = 1; i < P.length - 2; i++) {
            const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
            for (let j = 0; j < per; j++) {
                const t = j / per, t2 = t * t, t3 = t2 * t;
                out.push([
                    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
                ]);
            }
        }
        out.push(pts[pts.length - 1]);
        return out;
    }
    // 弧长参数化路径
    function mkPath(pts) {
        const P = smooth(pts, 12);
        const cum = [0];
        for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
        const total = cum[cum.length - 1] || 1;
        return {
            pts: P, total,
            at(u) {
                const d = clamp(u, 0, 1) * total;
                let lo = 0, hi = cum.length - 1;
                while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
                const t = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
                const x = lerp(P[lo][0], P[hi][0], t), y = lerp(P[lo][1], P[hi][1], t);
                const dx = P[hi][0] - P[lo][0], dy = P[hi][1] - P[lo][1];
                const L = Math.hypot(dx, dy) || 1;
                return { x, y, tx: dx / L, ty: dy / L };
            },
        };
    }

    /* ── 静态碰撞墙 ── */
    const WALLS = (() => {
        const s = [];
        s.push(...polySegs(arcPts(PF.cx, PF.cy, PF.arcR, Math.PI, Math.PI * 2, 30), false, 2));
        s.push({ x1: PF.l, y1: 300, x2: PF.l, y2: 648, r: 2 });
        s.push({ x1: PF.r, y1: 300, x2: PF.r, y2: 648, r: 2 });
        s.push(...polySegs([[324, 300], [340, 244], [346, 208]], false, 2));
        s.push({ x1: LANE.l, y1: 208, x2: LANE.l, y2: 690, r: 2 });
        s.push({ x1: LANE.r, y1: 130, x2: LANE.r, y2: 690, r: 2 });
        s.push({ x1: LANE.l, y1: 690, x2: LANE.r, y2: 690, r: 2 });
        s.push(...polySegs(GUIDE_L, false, 3));
        s.push(...polySegs(GUIDE_R, false, 3));
        SLINGS.forEach(sl => s.push(...polySegs([sl.a, sl.b, sl.c], true, 3)));
        return s;
    })();

    // 发射管道：右巷直上 → 弧线跨顶 → 左上落入台面
    const LAUNCH_PATH = mkPath([
        [LNCX, BALL_REST_Y], [LNCX, 240],
        [348, 178], [281, 148], [160, 148], [118, 172], [112, 200],
    ]);
    // 坡道：右下入口 → 跨顶 → 左上回落
    const RAMP_ENTRY = [298, 430];
    const RAMP_PATH = mkPath([
        RAMP_ENTRY, [312, 372], [306, 300], [288, 244],
        [252, 200], [206, 174], [160, 170], [116, 186], [80, 220], [58, 266],
    ]);
    // 左侧火箭发射管道：底部入口（外道救球会自然冲入）→ 沿左墙冲顶 → 左上出口喷回台面
    const TUBE_ENTRY = [42, 548];
    const TUBE_PATH = mkPath([TUBE_ENTRY, [42, 420], [42, 320], [44, 258], [54, 226], [72, 208]]);
    const RAIL = { LAUNCH: 0, RAMP: 1, TUBE: 2 };

    /* ══════════════════════ 3. 关卡 / 军衔 ══════════════════════ */
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
        '深空远征', '银河守护', '星辰主宰', '太空军校生', '传说之翼',
    ];
    function lvP(i) {
        return {
            goal: Math.round(15000 + i * 5500),
            grav: 1 + Math.min(0.5, i * 0.010),
        };
    }

    /* ══════════════════════ 4. 主模块 ══════════════════════ */
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
            const GRAVX = P.grav;

            const { c, ctx, w, h, destroy } = MG.canvas(container, GW, GH);
            let t = 0, over = false;

            /* ── 音效 ── */
            const AU = MG.audio;
            const sfx = n => { try { AU.sfx(n); } catch (e) { } };
            let audioOn = false;
            const startAudio = () => {
                if (audioOn) return;
                try { if (AU.unlock()) { AU.bgm.start('space'); audioOn = true; } } catch (e) { }
            };
            startAudio();

            /* ── 特效 ── */
            let shake = 0, shakeMag = 0;
            const parts = [];
            const spawn = (x, y, n, hue, power, spread) => {
                for (let i = 0; i < n; i++) {
                    const a = spread == null ? Math.random() * Math.PI * 2 : spread + (Math.random() - 0.5) * 1.4;
                    const sp = (60 + Math.random() * 220) * (power || 1);
                    parts.push({
                        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
                        life: 0.4 + Math.random() * 0.5, age: 0, hue, r: 1.1 + Math.random() * 2.3,
                    });
                }
            };
            const bumps = [0, 0, 0];          // 顶部 3 只引擎命中光
            const jets = [0, 0, 0];           // 左侧 3 只引擎命中光
            const cardFace = [0, 0, 0];       // 翻牌当前面：0 背面(未开) 1 正面(徽章)
            const cardAnim = [0, 0, 0];       // 翻牌翻转进度 0→1
            const cardOver = [false, false, false];       // 牌上正压着球（防同一球反复翻牌）
            const cardFrameOver = [false, false, false];  // 本帧是否有球压牌（帧末回写 cardOver）
            const flash = { ramp: 0, spin: 0, saucer: 0, target: 0, warp: 0, card: 0, tube: 0 };

            /* ── 任务 / 军衔（Space Cadet 风格：达成目标 → 晋升军衔 → 领取大奖）──
               每个任务盯一类得分事件（kw），累计 need 次即完成并结算 jackpot；
               带 mb 的任务完成后额外开启多球。全部走完停在最终任务继续刷分。 */
            const MISSIONS = [
                { n: '基础训练', hint: '撞击顶部引擎', kw: 'bumper', need: 6, jack: 5000 },
                { n: '引擎试车', hint: '撞击左侧引擎', kw: 'jet', need: 8, jack: 14000 },
                { n: '轨道练习', hint: '冲上坡道', kw: 'ramp', need: 3, jack: 12000 },
                { n: '目标练习', hint: '打落靶子', kw: 'target', need: 5, jack: 9000, mb: 2 },
                { n: '旋转突击', hint: '转动旋门', kw: 'spin', need: 6, jack: 8000 },
                { n: '航道点亮', hint: '点亮滚道灯', kw: 'lane', need: 4, jack: 10000 },
                { n: '徽章收集', hint: '翻开徽章牌', kw: 'card', need: 6, jack: 25000, mb: 3 },
                { n: '虫洞跳跃', hint: '吸入涡轮虫洞', kw: 'warp', need: 2, jack: 18000, mb: 2 },
                { n: '计分洞', hint: '打入计分洞', kw: 'saucer', need: 3, jack: 15000, mb: 2 },
                { n: '连击大师', hint: '累计得分次数', kw: 'any', need: 40, jack: 30000 },
                { n: '最终任务', hint: '累计得分次数', kw: 'any', need: 80, jack: 60000, mb: 3 },
            ];
            const RANKS = ['学员', '少尉', '中尉', '上尉', '少校', '中校', '上校', '准将', '舰队上将'];

            /* ── 状态 ── */
            let score = 0, balls = endless ? Infinity : 3, launched = false;
            let ball = { x: LNCX, y: BALL_REST_Y, vx: 0, vy: 0 };
            const live = [ball];        // 台面上的球：live[0] 恒为主球（多球时长度 > 1）
            const trail = [];
            let missionIdx = 0, missionProg = 0, missionFlash = 0, mbCount = 0;
            let onRail = false, railU = 0, railSpeed = 0, railMode = RAIL.LAUNCH;
            let plunger = 0, plungerHold = false, chargeSfx = true;
            let combo = 0, comboT = 0, mult = 1;
            let saucerHold = 0;
            let warpHold = 0, warpLock = 0, warpSpin = 0, warpPull = 0, warpFlash = 0;
            let cardReset = 0;
            let mbCd = 0;                     // 多球冷却：防任务/翻牌连锁把台面刷成球海
            TARGETS.forEach(x => { x.down = false; });
            let toast = '', toastT = 0;
            const lanesOn = [false, false, false, false];
            const kickback = { L: true, R: true };
            let spinnerAng = 0, spinnerVel = 0, spinnerAcc = 0;
            const cool = {};

            /* ── 卡球自救（防软锁）：主球长时间低速滞留挡板死角 → 周期轻推，仍卡则强制重发 ── */
            let stuckT = 0, stuckNudge = 0;

            const FL = { ...FLIP_L, ang: FLIP_L.rest, omega: 0, held: false };
            const FR = { ...FLIP_R, ang: FLIP_R.rest, omega: 0, held: false };

            const show = (s, d) => { toast = s; toastT = d || 1.4; };
            // ev：得分事件标签（bumper/ramp/target/spin/lane/saucer），用于推进当前任务
            const addScore = (n, ev) => {
                score += Math.round(n * mult);
                if (ev) missionHit(ev, 1);
            };

            /* ── 任务推进 ── */
            function missionHit(ev, k) {
                if (over) return;
                const m = MISSIONS[missionIdx];
                if (!m) return;
                if (m.kw !== 'any' && m.kw !== ev) return;
                missionProg += k;
                if (missionProg >= m.need) completeMission();
            }
            function completeMission() {
                const m = MISSIONS[missionIdx];
                missionProg = 0;
                if (missionIdx < MISSIONS.length - 1) missionIdx++;
                missionFlash = 1.6;
                score += m.jack;            // 直接加分：避免 addScore→missionHit 递归
                sfx('jackpot');
                shake = Math.max(shake, 0.55); shakeMag = Math.max(shakeMag, 8);
                spawn(176, 300, 34, 260, 1.4);
                const rk = RANKS[Math.min(RANKS.length - 1, missionIdx)];
                show(m.mb ? '★ ' + m.n + ' 达成 · 晋升' + rk : '✔ ' + m.n + ' 达成 · 晋升' + rk, 2.2);
                if (m.mb) startMultiball(m.mb);
            }
            // 多球：额外球自计分洞喷出；主球漏掉时其余球顶上，不算失球
            // 防球海三保险：台面球数封顶(4) / 自动触发 8s 冷却 / 新球 1.2s 保护期(不翻牌不被吸入)
            const MAX_LIVE = 4, MB_CD = 8;
            function startMultiball(n, viaApi) {
                if (!viaApi && mbCd > 0) return;                 // 自动触发受冷却（测试直连绕过）
                const add = Math.max(0, Math.min(n, MAX_LIVE - live.length));
                if (add <= 0) return;
                if (!viaApi) mbCd = MB_CD;
                for (let i = 0; i < add; i++) {
                    live.push({
                        x: SAUCER.x + (i - (add - 1) / 2) * 24, y: SAUCER.y - 34,
                        vx: (i - (add - 1) / 2) * 100 + (Math.random() - 0.5) * 70,
                        vy: -560 - Math.random() * 180,
                        grace: 1.2,
                    });
                }
                mbCount = Math.max(mbCount, live.length);
                sfx('jackpot');
                shake = Math.max(shake, 0.6); shakeMag = Math.max(shakeMag, 9);
                spawn(SAUCER.x, SAUCER.y, 26, 300, 1.2);
                show('★ 多球风暴 ×' + live.length + ' ★', 2.2);
            }
            // 左侧火箭管道：球从底部管口被点火，沿左墙冲上顶部，再由左上出口喷回台面
            function enterTube(sp) {
                onRail = true; railU = 0; railMode = RAIL.TUBE; railSpeed = sp;
                flash.tube = 1; sfx('launch');
                addScore(1200, 'jet');
                show('火箭管道发射 +1,200', 1.2);
                spawn(TUBE_ENTRY[0], TUBE_ENTRY[1], 14, 280, 1, -Math.PI / 2);
            }

            /* ══════════ 背景预渲染 ══════════ */
            const BG = (() => {
                try {
                    const cv = document.createElement('canvas');
                    cv.width = GW * 2; cv.height = GH * 2;
                    const g = cv.getContext('2d');
                    if (!g) return null;
                    g.scale(2, 2);

                    const base = g.createLinearGradient(0, 90, 0, GH);
                    base.addColorStop(0, '#131a2e'); base.addColorStop(0.45, '#0b101f');
                    base.addColorStop(1, '#05070d');
                    g.fillStyle = base; g.fillRect(0, 90, GW, GH - 90);

                    g.save();
                    g.beginPath();
                    g.moveTo(PF.l, GH);
                    g.lineTo(PF.l, PF.cy);
                    g.arc(PF.cx, PF.cy, PF.arcR, Math.PI, Math.PI * 2);
                    g.lineTo(PF.r, GH);
                    g.closePath();
                    g.clip();

                    // 深空云气（压暗、偏暖，贴近原版暗调台面）
                    [[210, 260, 200, 'rgba(160,95,35,0.10)'],
                    [110, 430, 190, 'rgba(40,70,140,0.10)'],
                    [255, 545, 180, 'rgba(140,45,55,0.07)']].forEach(([x, y, r, col]) => {
                        const rg = g.createRadialGradient(x, y, 0, x, y, r);
                        rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
                        g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
                    });

                    // 银河带
                    g.save();
                    g.translate(176, 360); g.rotate(-0.42);
                    const mw = g.createLinearGradient(0, -140, 0, 140);
                    mw.addColorStop(0, 'rgba(255,200,130,0)');
                    mw.addColorStop(0.5, 'rgba(255,200,130,0.06)');
                    mw.addColorStop(1, 'rgba(255,200,130,0)');
                    g.fillStyle = mw; g.fillRect(-420, -140, 840, 280);
                    g.restore();

                    // 星球 + 星环（暖色气体巨星，原版台面的行星丝印）
                    g.globalAlpha = 0.4;
                    const plx = 246, ply = 268, plr = 44;
                    const pg = g.createRadialGradient(plx - plr * 0.35, ply - plr * 0.4, plr * 0.1, plx, ply, plr);
                    pg.addColorStop(0, '#d8a86a'); pg.addColorStop(0.55, '#a06a3c');
                    pg.addColorStop(0.85, '#5e3a20'); pg.addColorStop(1, '#2c1c10');
                    g.fillStyle = pg; g.beginPath(); g.arc(plx, ply, plr, 0, Math.PI * 2); g.fill();
                    g.save(); g.translate(plx, ply); g.rotate(-0.34); g.scale(1, 0.26);
                    g.strokeStyle = 'rgba(255,215,160,0.35)'; g.lineWidth = 7;
                    g.beginPath(); g.arc(0, 0, plr * 1.55, 0, Math.PI * 2); g.stroke();
                    g.strokeStyle = 'rgba(255,190,130,0.22)'; g.lineWidth = 3;
                    g.beginPath(); g.arc(0, 0, plr * 1.82, 0, Math.PI * 2); g.stroke();
                    g.restore();
                    g.globalAlpha = 1;

                    // 星点
                    for (let i = 0; i < 190; i++) {
                        const x = 20 + Math.random() * 320, y = 96 + Math.random() * 560;
                        g.fillStyle = `rgba(255,242,225,${0.14 + Math.random() * 0.44})`;
                        g.beginPath(); g.arc(x, y, Math.random() * 1.3 + 0.3, 0, Math.PI * 2); g.fill();
                    }

                    // 台面板接缝 + 顶部微光（暗金丝印板件，模拟原版台面分区）
                    g.strokeStyle = 'rgba(214,170,90,0.08)'; g.lineWidth = 1;
                    [232, 470].forEach(y => {
                        g.beginPath(); g.moveTo(30, y); g.lineTo(322, y); g.stroke();
                    });
                    for (let i = -3; i <= 3; i++) {
                        g.beginPath(); g.moveTo(176 + i * 26, 158); g.lineTo(176 + i * 52, 636); g.stroke();
                    }
                    const spot = g.createRadialGradient(176, 150, 10, 176, 150, 260);
                    spot.addColorStop(0, 'rgba(255,220,170,0.07)');
                    spot.addColorStop(1, 'rgba(0,0,0,0)');
                    g.fillStyle = spot; g.fillRect(0, 90, GW, 400);

                    // 金色丝印箭头（原版台面引导箭头：右侧轨道向上 + 顶部直入滚道）
                    g.strokeStyle = 'rgba(240,195,105,0.22)'; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
                    const chev = (x, y, s, a) => {
                        g.save(); g.translate(x, y); g.rotate(a);
                        g.beginPath(); g.moveTo(-s, s * 0.7); g.lineTo(0, -s * 0.7); g.lineTo(s, s * 0.7);
                        g.stroke(); g.restore();
                    };
                    chev(306, 336, 9, 0); chev(306, 364, 9, 0);
                    chev(176, 224, 9, 0);

                    // 外道警示斜纹（出球区，红纹）
                    [[34, 586], [284, 586]].forEach(([zx, zy]) => {
                        g.save();
                        g.beginPath(); g.rect(zx, zy, 34, 44); g.clip();
                        g.strokeStyle = 'rgba(255,120,80,0.18)'; g.lineWidth = 2;
                        for (let i = 0; i < 9; i++) {
                            g.beginPath(); g.moveTo(zx - 6 + i * 8, zy + 50); g.lineTo(zx + 10 + i * 8, zy - 6); g.stroke();
                        }
                        g.restore();
                    });

                    // 丝印
                    g.textAlign = 'center'; g.textBaseline = 'middle';
                    g.font = 'bold 15px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
                    g.fillStyle = 'rgba(255,205,120,0.30)';
                    g.fillText('S P A C E   C A D E T', 176, 528);
                    g.font = '9px "Segoe UI",sans-serif';
                    g.fillStyle = 'rgba(255,220,170,0.16)';
                    g.fillText('· T O W E R   O D Y S S E Y ·', 176, 546);

                    g.font = 'bold 8px "Segoe UI",sans-serif';
                    g.fillStyle = 'rgba(255,190,90,0.30)'; g.fillText('TARGETS', 276, 428);
                    g.fillStyle = 'rgba(255,190,90,0.30)'; g.fillText('SPINNER', 128, 460);
                    g.fillStyle = 'rgba(255,200,120,0.28)'; g.fillText('JETS', 76, 246);
                    g.fillStyle = 'rgba(255,200,120,0.28)'; g.fillText('RAMP', 296, 448);
                    g.fillStyle = 'rgba(255,150,90,0.30)'; g.fillText('JACKPOT', 176, 488);
                    g.fillStyle = 'rgba(255,200,130,0.22)'; g.fillText('KICKBACK', 40, 612);
                    g.save(); g.translate(316, 612); g.rotate(Math.PI / 2);
                    g.fillStyle = 'rgba(255,200,130,0.22)'; g.fillText('KICKBACK', 0, 0); g.restore();

                    // 底部厂商金字（原版 CINEMATRONICS / MAXIS）
                    g.font = 'bold 9px "Segoe UI",sans-serif';
                    g.fillStyle = 'rgba(220,180,100,0.40)';
                    g.textAlign = 'center';
                    g.fillText('C I N E M A T R O N I C S', 96, 664);
                    g.fillText('M A X I S', 260, 664);

                    // 满台指示灯（原版台面沿轨道密布红绿小灯珠，静态丝印 + 微光晕）
                    const lamps = [
                        [46, 236, 0], [46, 260, 1], [46, 470, 1], [46, 500, 0],
                        [104, 236, 0], [250, 226, 1], [300, 236, 0], [300, 262, 1],
                        [140, 214, 1], [216, 210, 0], [176, 356, 0], [140, 466, 1],
                        [212, 466, 0], [306, 470, 1], [306, 500, 0], [64, 430, 0],
                        [252, 556, 1], [100, 556, 1], [176, 566, 0], [286, 344, 0],
                    ];
                    lamps.forEach(([lx, ly, red]) => {
                        const col = red ? '255,70,60' : '90,220,110';
                        const lgr = g.createRadialGradient(lx, ly, 0, lx, ly, 5);
                        lgr.addColorStop(0, `rgba(${col},0.75)`);
                        lgr.addColorStop(0.4, `rgba(${col},0.28)`);
                        lgr.addColorStop(1, 'rgba(0,0,0,0)');
                        g.fillStyle = lgr;
                        g.beginPath(); g.arc(lx, ly, 5, 0, Math.PI * 2); g.fill();
                        g.fillStyle = `rgba(255,255,255,0.85)`;
                        g.beginPath(); g.arc(lx, ly, 1.3, 0, Math.PI * 2); g.fill();
                    });

                    // 弧形分道丝印（顶部拱内三条淡金弧线，模拟原版顶部 habitrail 分道）
                    g.strokeStyle = 'rgba(214,170,90,0.12)'; g.lineWidth = 1.2;
                    [116, 128, 140].forEach(rr3 => {
                        g.beginPath(); g.arc(PF.cx, PF.cy, rr3, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
                    });

                    g.restore();
                    return cv;
                } catch (e) { return null; }
            })();

            /* ══════════ 输入 ══════════ */
            const keys = new Set();
            const kd = e => {
                if (!e) return;
                const k = e.key || '';
                const c = e.code || '';
                const isLeft = k === 'ArrowLeft' || k === 'a' || k === 'A' || c === 'ArrowLeft' || c === 'KeyA';
                const isRight = k === 'ArrowRight' || k === 'd' || k === 'D' || c === 'ArrowRight' || c === 'KeyD';
                const isDown = k === ' ' || k === 'Spacebar' || k === 'ArrowDown'
                    || c === 'Space' || c === 'ArrowDown';
                const isMute = k === 'm' || k === 'M' || c === 'KeyM';
                if (isLeft) { FL.held = true; e.preventDefault(); }
                if (isRight) { FR.held = true; e.preventDefault(); }
                if (isDown) {
                    if (!launched) { plungerHold = true; startAudio(); }
                    e.preventDefault();
                }
                if (isMute) { try { AU.toggleMuted(); } catch (err) { } }
                const isRelaunch = k === 'r' || k === 'R' || c === 'KeyR';
                if (isRelaunch) manualRelaunch();
                if (k) keys.add(k);
            };
            const ku = e => {
                if (!e) return;
                const k = e.key || '';
                const c = e.code || '';
                const isLeft = k === 'ArrowLeft' || k === 'a' || k === 'A' || c === 'ArrowLeft' || c === 'KeyA';
                const isRight = k === 'ArrowRight' || k === 'd' || k === 'D' || c === 'ArrowRight' || c === 'KeyD';
                const isDown = k === ' ' || k === 'Spacebar' || k === 'ArrowDown'
                    || c === 'Space' || c === 'ArrowDown';
                if (isLeft) FL.held = false;
                if (isRight) FR.held = false;
                if (isDown) plungerHold = false;
                if (k) keys.delete(k);
            };
            window.addEventListener('keydown', kd);
            window.addEventListener('keyup', ku);

            try {
                const onTouch = e => {
                    if (!c.getBoundingClientRect) return;
                    const r = c.getBoundingClientRect();
                    const xs = [];
                    const list = e.touches || [];
                    for (let i = 0; i < list.length; i++) xs.push((list[i].clientX - r.left) / (r.width || 1) * GW);
                    const pfXs = xs.filter(x => x < PANEL.x - 10);   // 右侧指令面板触摸不算挡板
                    FL.held = pfXs.some(x => x < GW / 2);
                    FR.held = pfXs.some(x => x >= GW / 2);
                    plungerHold = !launched && pfXs.length > 0;
                    if (e.cancelable) e.preventDefault();
                };
                c.addEventListener('touchstart', onTouch, { passive: false });
                c.addEventListener('touchmove', onTouch, { passive: false });
                c.addEventListener('touchend', onTouch, { passive: false });
                c.addEventListener('mousedown', e => {
                    if (!c.getBoundingClientRect) return;
                    const r = c.getBoundingClientRect();
                    const x = (e.clientX - r.left) / (r.width || 1) * GW;
                    const y = (e.clientY - r.top) / (r.height || 1) * GH;
                    if (x > GW - 36 && y < 36) { try { AU.toggleMuted(); } catch (err) { } return; }
                    if (x > PANEL.x - 10) return;      // 右侧指令面板不响应台面操作
                    startAudio();
                    if (!launched) plungerHold = true;
                    else if (x < GW / 2) FL.held = true; else FR.held = true;
                });
                const rel = () => { FL.held = FR.held = plungerHold = false; };
                c.addEventListener('mouseup', rel);
                c.addEventListener('mouseleave', rel);
            } catch (e) { }

            /* ══════════ 物理 ══════════ */
            function hitCircle(b, cx, cy, cr, rest, kick) {
                let nx = b.x - cx, ny = b.y - cy;
                let d = Math.hypot(nx, ny);
                const R = BALL_R + cr;
                if (d >= R) return 0;
                if (d < 0.001) { nx = 0; ny = -1; d = 1; }
                nx /= d; ny /= d;
                b.x = cx + nx * R; b.y = cy + ny * R;
                const vn = b.vx * nx + b.vy * ny;
                if (vn < 0) { b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny; }
                if (kick) { b.vx += nx * kick; b.vy += ny * kick; }
                return -Math.min(0, vn);
            }

            function hitSeg(b, s, rest, kick) {
                const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
                const L2 = dx * dx + dy * dy || 1;
                let u = ((b.x - s.x1) * dx + (b.y - s.y1) * dy) / L2;
                u = clamp(u, 0, 1);
                const cx = s.x1 + u * dx, cy = s.y1 + u * dy;
                let nx = b.x - cx, ny = b.y - cy;
                let d = Math.hypot(nx, ny);
                const R = BALL_R + (s.r || 0);
                if (d >= R) return 0;
                if (d < 0.001) { nx = -dy; ny = dx; d = Math.sqrt(L2); }
                nx /= d; ny /= d;
                b.x = cx + nx * R; b.y = cy + ny * R;
                const vn = b.vx * nx + b.vy * ny;
                if (vn < 0) {
                    b.vx -= (1 + rest) * vn * nx;
                    b.vy -= (1 + rest) * vn * ny;
                    const tx = -ny, ty = nx;
                    const vt = b.vx * tx + b.vy * ty;
                    b.vx -= vt * 0.06 * tx; b.vy -= vt * 0.06 * ty;
                }
                if (kick) { b.vx += nx * kick; b.vy += ny * kick; }
                return -Math.min(0, vn);
            }

            function hitFlipper(b, f) {
                const cos = Math.cos(f.ang), sin = Math.sin(f.ang);
                const dx = cos * f.len, dy = sin * f.len;
                const L2 = dx * dx + dy * dy || 1;
                let u = ((b.x - f.px) * dx + (b.y - f.py) * dy) / L2;
                u = clamp(u, 0, 1);
                const cx = f.px + u * dx, cy = f.py + u * dy;
                let nx = b.x - cx, ny = b.y - cy;
                let d = Math.hypot(nx, ny);
                const R = BALL_R + lerp(8, 5, u);
                if (d >= R) return false;
                if (d < 0.001) { nx = -dy; ny = dx; d = Math.sqrt(L2); }
                nx /= d; ny /= d;
                b.x = cx + nx * R; b.y = cy + ny * R;
                const rx = cx - f.px, ry = cy - f.py;
                const svx = -f.omega * ry, svy = f.omega * rx;
                const vn = (b.vx - svx) * nx + (b.vy - svy) * ny;
                if (vn < 0) {
                    const j = -(1 + 0.42) * vn;
                    b.vx += j * nx; b.vy += j * ny;
                }
                return true;
            }

            function canTrigger(key, sec) {
                if (cool[key] && t - cool[key] < sec) return false;
                cool[key] = t; return true;
            }

            function collide() {
                for (const s of WALLS) hitSeg(ball, s, 0.42, 0);
                for (const p of POSTS) {
                    if (hitCircle(ball, p.x, p.y, p.r, 0.62, 90) > 60) {
                        sfx('click'); spawn(p.x, p.y, 3, 200, 0.5);
                    }
                }
                BUMPERS.forEach((bp, i) => {
                    if (hitCircle(ball, bp.x, bp.y, bp.r, 0.55, 520) > 0) {
                        bumps[i] = 1;
                        addScore(120, 'bumper'); combo++; comboT = 2.2;
                        sfx('bumper'); spawn(bp.x, bp.y, 12, bp.hue, 1.1);
                        shake = Math.max(shake, 0.09); shakeMag = Math.max(shakeMag, 2.2);
                    }
                });
                // 左侧涡轮引擎：命中即喷射加速（比顶部引擎更“推”，负责把球送回上半场）
                JETS.forEach((jt, i) => {
                    if (hitCircle(ball, jt.x, jt.y, jt.r, 0.58, 470) > 0) {
                        jets[i] = 1;
                        addScore(150, 'jet'); combo++; comboT = 2.2;
                        sfx('jet');
                        spawn(jt.x, jt.y, 13, jt.hue, 1.15);
                        // 喷流：沿球离开方向甩出尾焰
                        const a = Math.atan2(ball.y - jt.y, ball.x - jt.x);
                        spawn(jt.x + Math.cos(a) * jt.r, jt.y + Math.sin(a) * jt.r, 5, jt.hue, 1.5, a);
                        shake = Math.max(shake, 0.08); shakeMag = Math.max(shakeMag, 2);
                    }
                });
                SLINGS.forEach(sl => {
                    const v = hitSeg(ball, { x1: sl.a[0], y1: sl.a[1], x2: sl.b[0], y2: sl.b[1], r: 3 }, 0.5, 430);
                    if (v > 0) {
                        addScore(60); sfx('sling');
                        spawn((sl.a[0] + sl.b[0]) / 2, (sl.a[1] + sl.b[1]) / 2, 9, 30, 1);
                    } else {
                        hitSeg(ball, { x1: sl.b[0], y1: sl.b[1], x2: sl.c[0], y2: sl.c[1], r: 3 }, 0.4, 0);
                        hitSeg(ball, { x1: sl.c[0], y1: sl.c[1], x2: sl.a[0], y2: sl.a[1], r: 3 }, 0.4, 0);
                    }
                });
                TARGETS.forEach(tg => {
                    if (tg.down) return;
                    const v = hitSeg(ball, {
                        x1: tg.x, y1: tg.y - tg.h / 2, x2: tg.x, y2: tg.y + tg.h / 2, r: 3,
                    }, 0.35, 60);
                    if (v > 90) {
                        tg.down = true; addScore(600, 'target'); combo++; comboT = 2.2;
                        flash.target = 1; sfx('target');
                        spawn(tg.x - 4, tg.y, 12, 40, 1.1, Math.PI);
                        shake = Math.max(shake, 0.08); shakeMag = Math.max(shakeMag, 2);
                        if (TARGETS.every(x => x.down)) {
                            addScore(4000); show('靶组全清 +4,000', 1.6); sfx('jackpot');
                            shake = Math.max(shake, 0.3); shakeMag = Math.max(shakeMag, 6);
                            setTimeout(() => TARGETS.forEach(x => x.down = false), 900);
                        }
                    }
                });
                // 旋转门
                if (Math.abs(ball.x - SPIN.x) < SPIN.w / 2 + BALL_R &&
                    Math.abs(ball.y - SPIN.y) < SPIN.h / 2 + BALL_R) {
                    spinnerVel = clamp(spinnerVel - ball.vx * 0.011, -26, 26);
                    if (canTrigger('spin', 0.22)) { addScore(90, 'spin'); sfx('spinner'); flash.spin = 1; }
                }
                // 滚道灯
                LANES.forEach((ln, i) => {
                    if (Math.hypot(ball.x - ln.x, ball.y - ln.y) < 13 && canTrigger('lane' + i, 0.4)) {
                        if (!lanesOn[i]) {
                            lanesOn[i] = true; addScore(350, 'lane'); sfx('rollover');
                            spawn(ln.x, ln.y, 8, 55, 0.8);
                            if (lanesOn.every(Boolean)) {
                                if (mult < 5) { mult++; show(`倍率提升 ×${mult}`, 1.6); sfx('levelup'); }
                                else { addScore(20000); show('MAX 倍率奖励 +20,000', 1.6); sfx('jackpot'); }
                                for (let k = 0; k < lanesOn.length; k++) lanesOn[k] = false;
                                shake = Math.max(shake, 0.22); shakeMag = Math.max(shakeMag, 5);
                            }
                        }
                    }
                });
                // 坡道入口（须向上冲；仅主球 —— 轨道状态是全局的，额外球误触发会把主球传送上轨道）
                if (!onRail && ball === live[0] && ball.vy < -40 &&
                    Math.hypot(ball.x - RAMP_ENTRY[0], ball.y - RAMP_ENTRY[1]) < 20 &&
                    canTrigger('ramp', 0.8)) {
                    onRail = true; railU = 0; railMode = RAIL.RAMP; railSpeed = 640;
                    addScore(1800, 'ramp'); combo++; comboT = 2.2; sfx('ramp'); flash.ramp = 1;
                    show('坡道达成 +1,800', 1.2);
                }
                // 计分洞（仅主球：额外球入洞曾把冻结逻辑错套到主球上，造成"传送/多球"错觉）
                if (!saucerHold && ball === live[0] &&
                    Math.hypot(ball.x - SAUCER.x, ball.y - SAUCER.y) < SAUCER.r - 3 &&
                    Math.hypot(ball.vx, ball.vy) < 1500) {
                    saucerHold = 1.15; ball.vx = ball.vy = 0;
                    const win = 2500 + 1500 * (mult - 1);
                    addScore(win, 'saucer'); sfx('saucer'); flash.saucer = 1;
                    show('计分洞 +' + win.toLocaleString(), 1.4);
                    shake = Math.max(shake, 0.2); shakeMag = Math.max(shakeMag, 4);
                    spawn(SAUCER.x, SAUCER.y, 18, 45, 1.2);
                }
                // 涡轮虫洞（左上角第 7 只引擎）：吸入 → 送进左侧火箭管道点火发射
                if (!warpHold && warpLock <= 0 && !onRail && ball === live[0] &&
                    Math.hypot(ball.x - WARP.x, ball.y - WARP.y) < WARP.r - 2 &&
                    Math.hypot(ball.vx, ball.vy) < 1700) {
                    warpHold = 0.72; warpPull = 0; warpFlash = 1; flash.warp = 1;
                    ball.vx = ball.vy = 0;
                    addScore(3000, 'warp'); combo++; comboT = 2.2;
                    sfx('saucer');
                    show('虫洞吸入 · 火箭管道点火', 1.6);
                    shake = Math.max(shake, 0.24); shakeMag = Math.max(shakeMag, 5);
                    spawn(WARP.x, WARP.y, 20, 275, 1.2);
                }
                // 翻牌：球"新压上"徽章牌才翻转（防压牌连翻），集齐 3 张开大奖
                CARDS.forEach((cd, i) => {
                    const over = Math.abs(ball.x - cd.x) < cd.w / 2 + 3 &&
                        Math.abs(ball.y - cd.y) < cd.h / 2 + 3;
                    if (over) cardFrameOver[i] = true;
                    if (!over || cardOver[i] || cardReset > 0 ||
                        cardAnim[i] > 0 || cardFace[i] === 1 || (ball.grace || 0) > 0) return;
                    cardOver[i] = true;
                    cardFace[i] = 1; cardAnim[i] = 0.001;
                    addScore(800, 'card'); combo++; comboT = 2.2;
                    sfx('target'); flash.card = 1;
                    spawn(cd.x, cd.y, 12, 45, 1);
                    if (cardFace.every(v => v === 1)) {
                        cardReset = 1.15;
                        score += 15000;
                        show('★ 徽章集齐 +15,000 ★', 2.0);
                        sfx('jackpot');
                        spawn(176, 392, 30, 50, 1.4);
                        shake = Math.max(shake, 0.36); shakeMag = Math.max(shakeMag, 6);
                        startMultiball(2);
                    }
                });
                // 左侧火箭管道入口：向上冲进管口即被点火（仅主球，理由同坡道）
                if (!onRail && ball === live[0] && ball.vy < -240 &&
                    Math.hypot(ball.x - TUBE_ENTRY[0], ball.y - TUBE_ENTRY[1]) < 24 &&
                    canTrigger('tubeIn', 0.5)) {
                    enterTube(660);
                }
                hitFlipper(ball, FL);
                hitFlipper(ball, FR);
            }

            function loseBall() {
                sfx('drain');
                spawn(ball.x, GH - 24, 16, 200, 1);
                combo = 0; mult = 1;
                for (let i = 0; i < lanesOn.length; i++) lanesOn[i] = false;
                TARGETS.forEach(x => x.down = false);
                if (balls === Infinity) { resetBall(); return; }
                balls--;
                if (balls <= 0) { finish(score >= P.goal); return; }
                resetBall();
            }
            function resetBall() {
                launched = false; onRail = false; plunger = 0; plungerHold = false;
                ball = { x: LNCX, y: BALL_REST_Y, vx: 0, vy: 0 };
                live.length = 0; live.push(ball);   // 失球/换球后回到单球状态
                trail.length = 0;
                kickback.L = kickback.R = true;
            }
            // 手动重发：放弃当前主球，从发射巷重新来一颗（走原漏球/失球逻辑，只是玩家主动触发）
            function manualRelaunch() {
                if (over || !launched || onRail || saucerHold > 0 || warpHold > 0) return;
                live[0].y = PF.bot + 12; live[0].vx = 0; live[0].vy = 0;
                stuckT = 0; stuckNudge = 0;
                show('手动重发本球', 1.1);
            }

            const finish = win => {
                if (over) return;
                over = true;
                try { AU.bgm.stop(); } catch (e) { }
                sfx(win ? 'levelup' : 'fail');
                const stars = win ? (balls >= 3 ? 3 : balls >= 2 ? 2 : 1) : 0;
                opts.onComplete && opts.onComplete({
                    win, stars,
                    score: score + (win ? 1000 : 0),
                    title: endless ? '🏅 无尽挑战结束' : (win ? '🏆 任务达成！' : '💥 球已用完'),
                    lines: [
                        `得分 ${score.toLocaleString()}${endless ? '' : ' / 目标 ' + P.goal.toLocaleString()}`,
                        `最高连击 ×${combo} · 倍率 ×${mult}`,
                        `军衔 ${RANKS[Math.min(RANKS.length - 1, missionIdx)]} · 任务推进 ${missionIdx}/${MISSIONS.length}`,
                        mbCount > 1 ? `多球最高同时 ${mbCount} 颗` : '',
                        endless ? '重力强化 · 目标即挑战' : '',
                    ].filter(Boolean),
                });
            };

            function pushTrail() {
                trail.push({ x: ball.x, y: ball.y });
                if (trail.length > 14) trail.shift();
            }

            /* ── 每帧推进 ── */
            function step(dt) {
                if (over) return;
                dt = Math.min(dt, 0.05);
                warpLock = Math.max(0, warpLock - dt);
                warpFlash = Math.max(0, warpFlash - dt * 1.8);
                // 集齐大奖后延时翻回背面
                if (cardReset > 0) {
                    cardReset = Math.max(0, cardReset - dt);
                    if (cardReset === 0) {
                        for (let i = 0; i < 3; i++) {
                            if (cardFace[i] === 1) { cardFace[i] = 0; cardAnim[i] = 0.001; }
                        }
                    }
                }
                for (let i = 0; i < 3; i++) {
                    if (cardAnim[i] > 0) {
                        cardAnim[i] += dt * 2.4;
                        if (cardAnim[i] >= 1) cardAnim[i] = 0;
                    }
                }

                // 挡板
                [FL, FR].forEach(f => {
                    const prev = f.ang;
                    const tgt = f.held ? f.up : f.rest;
                    const sp = 15;
                    if (f.ang < tgt) f.ang = Math.min(tgt, f.ang + sp * dt);
                    else f.ang = Math.max(tgt, f.ang - sp * dt);
                    f.omega = (f.ang - prev) / Math.max(dt, 1e-4);
                    if (f.held && Math.abs(f.ang - prev) > 0.03 && canTrigger('flip' + f.px, 0.12)) sfx('flip');
                });

                // 发射 / 蓄力
                if (!launched) {
                    ball.x = LNCX;
                    const holding = plungerHold || keys.has('ArrowDown') || keys.has(' ');
                    if (holding) {
                        if (chargeSfx) { sfx('charge'); chargeSfx = false; }
                        plunger = Math.min(1, plunger + dt * 1.4);
                    } else if (plunger > 0.08) {
                        onRail = true; railU = 0; railMode = RAIL.LAUNCH;
                        railSpeed = 1150 + 620 * plunger;
                        launched = true; plunger = 0; chargeSfx = true;
                        sfx('launch'); shake = Math.max(shake, 0.12); shakeMag = Math.max(shakeMag, 3);
                        spawn(LNCX, BALL_REST_Y, 10, 190, 0.8, -Math.PI / 2);
                    } else { plunger = Math.max(0, plunger - dt * 2); chargeSfx = true; }
                    ball.y = BALL_REST_Y + plunger * PLG_PULL;
                    ball.vx = ball.vy = 0;
                    return;
                }

                // 管道滑行（发射巷 / 坡道 / 左侧火箭管道）
                // 只牵引主球；多球时额外球照常运动（不再整帧 return 冻结全场）
                let onRailNow = false;
                if (onRail) {
                    const path = railMode === RAIL.RAMP ? RAMP_PATH
                        : railMode === RAIL.TUBE ? TUBE_PATH : LAUNCH_PATH;
                    const floor = railMode === RAIL.TUBE ? 540 : 430;
                    railSpeed = Math.max(floor, railSpeed - 240 * dt);
                    railU += (railSpeed * dt) / path.total;
                    const p = path.at(railU);
                    ball.x = p.x; ball.y = p.y;
                    ball.vx = p.tx * railSpeed; ball.vy = p.ty * railSpeed;
                    if (railU >= 1) {
                        onRail = false;
                        const pl = path.at(1);
                        if (railMode === RAIL.TUBE) {
                            // 出口在左上：向右上高速喷回台面
                            ball.vx = pl.tx * railSpeed * 0.85 + 40;
                            ball.vy = pl.ty * railSpeed * 0.85;
                            warpLock = 0.45;             // 出管瞬间不会被虫洞立刻吸回
                            sfx('kick'); spawn(ball.x, ball.y, 14, 275, 1.1);
                        } else {
                            ball.vx = pl.tx * railSpeed * 0.66 - 40;
                            ball.vy = pl.ty * railSpeed * 0.66;
                            spawn(ball.x, ball.y, 8, 190, 0.7);
                        }
                    } else {
                        onRailNow = true;                // 本帧主球仍在轨：跳过它的物理/救球/漏球
                    }
                    pushTrail();
                }

                // 计分洞捕获（只冻主球；多球时额外球照常运动，不再被整帧 return 卡住）
                let mainFrozen = false;
                if (saucerHold > 0) {
                    saucerHold -= dt;
                    ball.x = SAUCER.x; ball.y = SAUCER.y; ball.vx = ball.vy = 0;
                        if (saucerHold <= 0) {
                            ball.y = SAUCER.y - 4;
                            ball.vy = -880; ball.vx = (Math.random() - 0.5) * 220;
                            sfx('kick'); spawn(SAUCER.x, SAUCER.y, 12, 45, 1);
                        }
                        mainFrozen = true;
                    }
                    // 涡轮虫洞：漩涡加速吸入 → 传送到左侧管道底部 → 点火冲顶
                    if (warpHold > 0) {
                        warpHold -= dt;
                        warpSpin += dt * (6 + (1 - Math.max(0, warpHold / 0.72)) * 34);
                        warpPull = Math.min(1, warpPull + dt * 3.4);
                        ball.x = lerp(ball.x, WARP.x, Math.min(1, dt * 9));
                        ball.y = lerp(ball.y, WARP.y, Math.min(1, dt * 9));
                        ball.vx = ball.vy = 0;
                        if (warpHold <= 0) {
                            ball.x = TUBE_ENTRY[0]; ball.y = TUBE_ENTRY[1];
                            warpPull = 0;
                            enterTube(880);
                        }
                        mainFrozen = true;
                    }

                // 多球冷却倒计时
                mbCd = Math.max(0, mbCd - dt);

                // 物理子步：主球 + 多球统一推进
                // 技巧：每颗球处理前把闭包变量 ball 指向它，collide()/hitFlipper() 无需改动即可复用
                const hd = dt / SUB;
                for (let i = 0; i < SUB; i++) {
                    for (let bi = 0; bi < live.length; bi++) {
                        const b = live[bi];
                        if (bi === 0 && (mainFrozen || onRailNow)) continue;
                        ball = b;
                        b.vy += GRAV * GRAVX * hd;
                        b.x += b.vx * hd; b.y += b.vy * hd;
                        const sp2 = b.vx * b.vx + b.vy * b.vy;
                        if (sp2 > SPEED_CAP * SPEED_CAP) {
                            const k = SPEED_CAP / Math.sqrt(sp2);
                            b.vx *= k; b.vy *= k;
                        }
                        collide();
                    }
                }
                const drag = 1 - 0.22 * dt;
                for (let bi = 0; bi < live.length; bi++) {
                    live[bi].vx *= drag; live[bi].vy *= drag;
                    if (live[bi].grace > 0) live[bi].grace -= dt;   // 新球保护期倒计时
                }
                ball = live[0] || ball;              // 复原：ball 恒为主球引用
                // 翻牌压牌状态帧末回写：球离开牌面后才会再次判定"新压上"
                for (let ci = 0; ci < cardOver.length; ci++) { cardOver[ci] = cardFrameOver[ci]; cardFrameOver[ci] = false; }

                // 旋转门
                spinnerAng += spinnerVel * dt;
                spinnerVel *= (1 - 1.6 * dt);
                spinnerAcc += Math.abs(spinnerVel) * dt;
                if (spinnerAcc > Math.PI * 2) { spinnerAcc -= Math.PI * 2; addScore(250, 'spin'); }

                if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }

                // 外道救球（多球时逐个判定；在轨/冻结的主球跳过）
                for (let bi = 0; bi < live.length; bi++) {
                    const b = live[bi];
                    if (bi === 0 && (onRailNow || mainFrozen)) continue;
                    if (b.y <= 616) continue;
                    if (b.x < 66 && kickback.L) {
                        kickback.L = false; b.vy = -1000; b.vx = 40;
                        addScore(500); sfx('kick'); show('KICKBACK 救球 +500', 1.3);
                        spawn(b.x, b.y, 14, 190, 1.1, -Math.PI / 2);
                    } else if (b.x > 286 && kickback.R) {
                        kickback.R = false; b.vy = -1000; b.vx = -40;
                        addScore(500); sfx('kick'); show('KICKBACK 救球 +500', 1.3);
                        spawn(b.x, b.y, 14, 190, 1.1, -Math.PI / 2);
                    }
                }

                // 卡球自救：主球长时间低速滞留在挡板死角 → 周期轻推，仍卡则自动重发（防软锁）
                if (!over && launched && !onRailNow && !mainFrozen && live.length > 0) {
                    const mb = live[0];
                    const stalled = mb.y > 558 && Math.hypot(mb.vx, mb.vy) < 45;
                    if (stalled) {
                        stuckT += dt;
                        if (stuckT > 2.0 && stuckNudge === 0)
                            show('球卡住了 · 按 R 重发或稍候自动救球', 1.6);
                        if (stuckT > 2.5) {
                            // 每 1.2s 轻推一次，方向朝台面中部，试图自己爬出来
                            const want = Math.floor((stuckT - 2.5) / 1.2) + 1;
                            if (want > stuckNudge) {
                                stuckNudge = want;
                                const dir = mb.x < 176 ? 1 : -1;
                                mb.vx += dir * (130 + Math.random() * 110);
                                mb.vy -= 270 + Math.random() * 130;
                                try { sfx('flip'); } catch (e) { }
                            }
                        }
                        if (stuckT > 7.0) {
                            mb.y = PF.bot + 12; mb.vx = mb.vy = 0;
                            stuckT = 0; stuckNudge = 0;
                            show('卡球自动重发', 1.2);
                        }
                    } else { stuckT = 0; stuckNudge = 0; }
                    // 额外球卡太久也清掉（不软锁，但避免台面留死球）
                    for (let bi = 1; bi < live.length; bi++) {
                        const xb = live[bi];
                        if (xb.y > 560 && Math.hypot(xb.vx, xb.vy) < 40) {
                            xb.__stuck = (xb.__stuck || 0) + dt;
                            if (xb.__stuck > 9) { live.splice(bi, 1); bi--; }
                        } else xb.__stuck = 0;
                    }
                }

                // 漏球：额外球漏掉只是消失；只有最后一颗（主球）漏掉才真正失球（在轨主球不算漏）
                let mainDrained = false;
                for (let bi = live.length - 1; bi >= 0; bi--) {
                    if (bi === 0 && (onRailNow || mainFrozen)) continue;
                    if (live[bi].y <= PF.bot) continue;
                    spawn(live[bi].x, GH - 24, 12, 200, 1);
                    if (bi === 0) mainDrained = true;
                    else { live.splice(bi, 1); sfx('drain'); }
                }
                if (mainDrained) {
                    live.shift();
                    if (live.length > 0) {
                        ball = live[0];               // 多球继续：其余球顶上，不失球
                        show('多球继续 ×' + live.length, 1.2);
                        sfx('drain');
                    } else {
                        ball = { x: LNCX, y: BALL_REST_Y, vx: 0, vy: 0 };
                        live.push(ball);
                        loseBall();
                    }
                }

                pushTrail();
            }

            /* ══════════ 绘制 ══════════ */
            function rr(x, y, ww, hh, r) {
                if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, ww, hh, r); return; }
                ctx.beginPath();
                ctx.moveTo(x + r, y); ctx.arcTo(x + ww, y, x + ww, y + hh, r);
                ctx.arcTo(x + ww, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r);
                ctx.arcTo(x, y, x + ww, y, r); ctx.closePath();
            }

            function drawCabinet() {
                const g0 = ctx.createLinearGradient(0, 0, GW, GH);
                g0.addColorStop(0, '#242019'); g0.addColorStop(0.4, '#16130e'); g0.addColorStop(1, '#0a0806');
                ctx.fillStyle = g0;
                rr(4, 4, GW - 8, GH - 8, 16); ctx.fill();
                ctx.strokeStyle = '#8a6f45'; ctx.lineWidth = 2; ctx.stroke();
                ctx.strokeStyle = 'rgba(255,235,200,0.10)'; ctx.lineWidth = 1;
                rr(8, 8, GW - 16, GH - 16, 13); ctx.stroke();
                [[18, 92], [GW - 18, 92], [18, GH - 18], [GW - 18, GH - 18]].forEach(([sx, sy]) => {
                    const sg = ctx.createRadialGradient(sx - 1, sy - 1, 0, sx, sy, 5);
                    sg.addColorStop(0, '#d8c8a8'); sg.addColorStop(1, '#4a3d28');
                    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#241c10'; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy); ctx.stroke();
                });
            }

            function dmdPanel() {
                ctx.fillStyle = '#0a0503';
                rr(DMD.x, DMD.y, DMD.w, DMD.h, 6); ctx.fill();
                ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 2; ctx.stroke();
            }
            // 点阵屏栅格（间距大、点细、不透明度低）—— 让数字清楚可读，
            // 但仍保留 LED 矩阵的颗粒感（不要把文字压成糊）
            function dmdDots(step, size, alpha) {
                ctx.fillStyle = `rgba(6,3,1,${alpha})`;
                for (let x = DMD.x + 4; x < DMD.x + DMD.w - 2; x += step)
                    for (let y = DMD.y + 4; y < DMD.y + DMD.h - 2; y += step)
                        ctx.fillRect(x, y, size, size);
            }
            function dmdText(text, x, y, size, color, align) {
                ctx.save();
                ctx.font = `bold ${size}px "Consolas","Courier New",monospace`;
                ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
                ctx.shadowColor = color; ctx.shadowBlur = size * 0.6;
                ctx.fillStyle = color; ctx.fillText(text, x, y);
                ctx.shadowBlur = size * 0.2; ctx.fillText(text, x, y);
                ctx.restore();
            }
            function drawDMD() {
                dmdPanel();
                // 暗 LED（红色），让未点亮的位置也略有质感
                dmdDots(4, 1.2, 0.20);
                const cx = DMD.x + DMD.w / 2;
                dmdText(String(Math.round(score)).padStart(8, '0'), cx, DMD.y + 24, 30, '#ff9a2e', 'center');
                const y2 = DMD.y + 48;
                dmdText('BALL ' + (endless ? '∞' : balls), DMD.x + 10, y2, 12, '#ffb85c', 'left');
                dmdText('×' + mult, cx, y2, 14, '#ff6a3d', 'center');
                dmdText(endless ? 'ENDLESS' : NAMES[Math.min(49, idx0)], DMD.x + DMD.w - 10, y2, 11, '#ffb85c', 'right');

                // 第三行：军衔 + 当前任务 + 进度条 —— 台面上永远有个目标在追
                const m = MISSIONS[missionIdx];
                if (m) {
                    const y3 = DMD.y + 70;
                    const rk = RANKS[Math.min(RANKS.length - 1, missionIdx)];
                    const col = missionFlash > 0 ? '#ffe9b0' : '#ff8a3d';
                    dmdText(rk + ' · ' + m.n + '：' + m.hint, DMD.x + 10, y3, 11, col, 'left');
                    dmdText(Math.min(missionProg, m.need) + '/' + m.need, DMD.x + DMD.w - 10, y3, 12, '#ffd56b', 'right');
                    const bw = 78, bx = DMD.x + DMD.w - 58 - bw, by = y3 - 4;
                    ctx.fillStyle = 'rgba(255,140,60,0.20)';
                    ctx.fillRect(bx, by, bw, 5);
                    ctx.fillStyle = col;
                    ctx.fillRect(bx, by, bw * Math.min(1, missionProg / m.need), 5);
                }
                // 亮后轻打点阵（让数字也带颗粒感，但不破坏可读性）
                dmdDots(4, 1.0, 0.30);
            }

            function drawEmblem() {
                const ex = 176, ey = 392, R = 62;
                ctx.save();
                const gg = ctx.createRadialGradient(ex, ey, 8, ex, ey, R + 26);
                gg.addColorStop(0, 'rgba(255,200,120,0.14)');
                gg.addColorStop(0.6, 'rgba(230,150,70,0.05)');
                gg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = gg;
                ctx.beginPath(); ctx.arc(ex, ey, R + 26, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,214,120,0.30)'; ctx.lineWidth = 2.6;
                ctx.beginPath(); ctx.arc(ex, ey, R, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = 'rgba(255,190,90,0.16)'; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.arc(ex, ey, R - 10, 0, Math.PI * 2); ctx.stroke();
                // 部署灯环（原版部署目标：一圈黄灯绕中央，走马式点亮）
                for (let i = 0; i < 14; i++) {
                    const a = i / 14 * Math.PI * 2 - Math.PI / 2;
                    const lx = ex + Math.cos(a) * (R + 12), ly = ey + Math.sin(a) * (R + 12);
                    const on = (Math.floor(t * 5) + i) % 4 !== 0;
                    ctx.fillStyle = on ? 'rgba(255,214,80,0.95)' : 'rgba(120,85,20,0.5)';
                    if (on) { ctx.shadowColor = '#ffd45a'; ctx.shadowBlur = 6; }
                    ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                }
                // 两侧金色飞翼（Space Cadet 翼章，从徽章后向外展开）
                ctx.save(); ctx.translate(ex, ey);
                for (let side = -1; side <= 1; side += 2) {
                    ctx.save(); ctx.scale(side, 1);
                    for (let f = 0; f < 4; f++) {
                        const y0 = -26 + f * 13, len = 64 - f * 13, drop = 8 + f * 6;
                        const wgn = ctx.createLinearGradient(14, y0, 14 + len, y0 + drop);
                        wgn.addColorStop(0, '#ffe9a8'); wgn.addColorStop(0.5, '#e8b64c'); wgn.addColorStop(1, '#8a5a14');
                        ctx.fillStyle = wgn;
                        ctx.beginPath();
                        ctx.moveTo(14, y0);
                        ctx.quadraticCurveTo(14 + len * 0.55, y0 - 7, 14 + len, y0 + drop);
                        ctx.quadraticCurveTo(14 + len * 0.5, y0 + drop * 0.55 + 5, 16, y0 + 10);
                        ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = 'rgba(90,55,10,0.5)'; ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(14, y0);
                        ctx.quadraticCurveTo(14 + len * 0.55, y0 - 7, 14 + len, y0 + drop);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                ctx.restore();
                // 中央星徽（Space Cadet 金红星章）
                ctx.save(); ctx.translate(ex, ey);
                const sg2 = ctx.createRadialGradient(0, -6, 2, 0, 0, 26);
                sg2.addColorStop(0, '#ffe9a8'); sg2.addColorStop(0.55, '#f7b936'); sg2.addColorStop(1, '#b36b12');
                ctx.fillStyle = sg2;
                ctx.beginPath();
                for (let i = 0; i < 10; i++) {
                    const a = -Math.PI / 2 + i * Math.PI / 5;
                    const rr2 = i % 2 ? 9 : 24;
                    const px = Math.cos(a) * rr2, py = Math.sin(a) * rr2;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = 'rgba(120,60,10,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
                // 星面高光
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath(); ctx.ellipse(-6, -8, 5, 3, -0.7, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.restore();
            }

            function drawPlayfield() {
                if (BG) ctx.drawImage(BG, 0, 0, GW, GH);
                else { ctx.fillStyle = '#0a1028'; ctx.fillRect(0, 88, GW, GH - 88); }

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(PF.l, GH - 6);
                ctx.lineTo(PF.l, PF.cy);
                ctx.arc(PF.cx, PF.cy, PF.arcR, Math.PI, Math.PI * 2);
                ctx.lineTo(PF.r, GH - 6);
                ctx.lineWidth = 5.5;
                const wg = ctx.createLinearGradient(0, 140, 0, GH);
                wg.addColorStop(0, '#f2e0ae'); wg.addColorStop(0.35, '#c19a55'); wg.addColorStop(1, '#6e5226');
                ctx.strokeStyle = wg; ctx.stroke();
                ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
                ctx.restore();

                // 台面顶部受光（让台面像被聚光灯照亮）
                const lg = ctx.createLinearGradient(0, 100, 0, 360);
                lg.addColorStop(0, 'rgba(255,215,160,0.10)');
                lg.addColorStop(1, 'rgba(255,215,160,0)');
                ctx.fillStyle = lg; ctx.fillRect(20, 100, GW - 40, 280);

                drawEmblem();

                const vg = ctx.createRadialGradient(176, 380, 90, 176, 380, 330);
                vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
                ctx.fillStyle = vg; ctx.fillRect(0, 88, GW, GH - 88);
            }

            function drawWire(pts, wdt) {
                ctx.save();
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
                ctx.lineWidth = wdt + 2.6;
                ctx.strokeStyle = 'rgba(8,12,24,0.9)'; ctx.stroke();
                ctx.lineWidth = wdt;
                const g = ctx.createLinearGradient(0, 140, 0, 640);
                g.addColorStop(0, '#f5e6bb'); g.addColorStop(0.4, '#c19a55'); g.addColorStop(1, '#6e5226');
                ctx.strokeStyle = g; ctx.stroke();
                ctx.lineWidth = Math.max(1, wdt * 0.3);
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.beginPath();
                ctx.moveTo(pts[0][0] - 1, pts[0][1] - 1);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] - 1, pts[i][1] - 1);
                ctx.stroke();
                ctx.restore();
            }

            function drawWalls() {
                drawWire(arcPts(PF.cx, PF.cy, PF.arcR, Math.PI, Math.PI * 2, 44), 3.4);
                drawWire([[PF.l, 300], [PF.l, 640]], 3.4);
                drawWire([[PF.r, 300], [PF.r, 640]], 3.4);
                drawWire([[324, 300], [340, 244], [346, 208]], 3.4);
                drawWire(GUIDE_L, 3.2);
                drawWire(GUIDE_R, 3.2);
                ctx.fillStyle = 'rgba(8,12,24,0.72)';
                ctx.fillRect(LANE.l, LANE.top, LANE.r - LANE.l, LANE.bot - LANE.top);
                drawWire([[LANE.l, 208], [LANE.l, 690]], 3);
                drawWire([[LANE.r, 130], [LANE.r, 690]], 3);
            }

            function drawTube(path, wdt, hue) {
                const P = path.pts;
                ctx.save();
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(P[0][0], P[0][1]);
                for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
                ctx.lineWidth = wdt; ctx.strokeStyle = 'rgba(6,10,20,0.9)'; ctx.stroke();
                ctx.lineWidth = wdt - 3;
                ctx.strokeStyle = `hsla(${hue},70%,42%,0.32)`; ctx.stroke();
                ctx.lineWidth = Math.max(1.5, wdt * 0.22);
                ctx.strokeStyle = `hsla(${hue},95%,74%,0.8)`; ctx.stroke();
                ctx.restore();
            }

            function drawLaunchTube() {
                drawTube(LAUNCH_PATH, 22, 35);
                const p = LAUNCH_PATH.at(1);
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(Math.atan2(p.ty, p.tx));
                ctx.fillStyle = 'rgba(255,214,150,0.95)';
                ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }

            /* ── 涡轮引擎：顶部 3 只 + 左侧 3 只，统一造型（金属环 + 旋转扇叶 + 发光核心）── */
            function drawTurbine(x, y, r, hue, hit, ph) {
                ctx.save();
                const gr = r + 9 + hit * 20;
                const gg = ctx.createRadialGradient(x, y, r * 0.4, x, y, gr);
                gg.addColorStop(0, `hsla(${hue},95%,62%,${0.24 + hit * 0.5})`);
                gg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = gg;
                ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();

                ctx.fillStyle = '#241a10';
                ctx.beginPath(); ctx.ellipse(x, y + 7, r + 4, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#8a6c44'; ctx.lineWidth = 1.5; ctx.stroke();

                const sk = ctx.createLinearGradient(x, y - r, x, y + r);
                sk.addColorStop(0, '#e8eefc'); sk.addColorStop(0.42, '#93a6cc');
                sk.addColorStop(0.64, '#48577c'); sk.addColorStop(1, '#2a3450');
                ctx.fillStyle = sk;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

                ctx.fillStyle = '#080d1a';
                ctx.beginPath(); ctx.arc(x, y, r * 0.79, 0, Math.PI * 2); ctx.fill();

                ctx.save();
                ctx.translate(x, y); ctx.rotate(ph);
                const blades = 5;
                for (let i = 0; i < blades; i++) {
                    ctx.save(); ctx.rotate(i / blades * Math.PI * 2);
                    const bg = ctx.createLinearGradient(0, 0, r * 0.74, 0);
                    bg.addColorStop(0, `hsla(${hue},80%,${60 + hit * 20}%,0.95)`);
                    bg.addColorStop(1, `hsla(${hue},85%,${32 + hit * 22}%,0.7)`);
                    ctx.fillStyle = bg;
                    ctx.beginPath();
                    ctx.moveTo(r * 0.16, -r * 0.08);
                    ctx.quadraticCurveTo(r * 0.5, -r * 0.36, r * 0.76, -r * 0.07);
                    ctx.quadraticCurveTo(r * 0.5, r * 0.16, r * 0.16, r * 0.11);
                    ctx.closePath(); ctx.fill();
                    ctx.restore();
                }
                ctx.restore();

                const cg = ctx.createRadialGradient(x - r * 0.1, y - r * 0.12, r * 0.04, x, y, r * 0.34);
                cg.addColorStop(0, '#ffffff');
                cg.addColorStop(0.36, `hsl(${hue},100%,${70 + hit * 20}%)`);
                cg.addColorStop(1, `hsla(${hue},90%,${38 + hit * 22}%,0.92)`);
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();

                ctx.strokeStyle = 'rgba(220,235,255,0.75)'; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.arc(x, y, r - 0.8, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2.6;
                ctx.beginPath(); ctx.arc(x, y - 1, r * 0.9, -2.4, -0.7); ctx.stroke();
                for (let i = 0; i < 3; i++) {
                    const a = i / 3 * Math.PI * 2 + 0.5;
                    ctx.fillStyle = '#d9cdae';
                    ctx.beginPath();
                    ctx.arc(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3), 2.2, 0, Math.PI * 2);
                    ctx.fill();
                }
                if (hit > 0.02) {
                    ctx.strokeStyle = `hsla(${hue},100%,78%,${hit})`;
                    ctx.lineWidth = 2 + hit * 3;
                    ctx.beginPath(); ctx.arc(x, y, r + (1 - hit) * 22, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.restore();
            }

            /* ── 蘑菇头缓冲器（原版顶部 bumper 造型：金属座 + 奶油白菌盖 + 彩灯）── */
            function drawMushroom(x, y, r, hue, hit, ph) {
                ctx.save();
                // 命中光晕
                const gr = r + 9 + hit * 20;
                const gg = ctx.createRadialGradient(x, y, r * 0.4, x, y, gr);
                gg.addColorStop(0, `hsla(${hue},95%,62%,${0.22 + hit * 0.5})`);
                gg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = gg;
                ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
                // 金属底座
                ctx.fillStyle = '#1c1710';
                ctx.beginPath(); ctx.ellipse(x, y + r * 0.62, r * 0.82, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
                const st = ctx.createLinearGradient(x - r * 0.4, 0, x + r * 0.4, 0);
                st.addColorStop(0, '#e8dfc8'); st.addColorStop(0.5, '#a89468'); st.addColorStop(1, '#5c4e30');
                ctx.fillStyle = st;
                rr(x - r * 0.34, y, r * 0.68, r * 0.66, 3); ctx.fill();
                ctx.strokeStyle = 'rgba(40,30,14,0.7)'; ctx.lineWidth = 1; ctx.stroke();
                // 奶油白菌盖（半球）
                const cap = ctx.createRadialGradient(x - r * 0.35, y - r * 0.55, r * 0.1, x, y - r * 0.1, r * 1.25);
                cap.addColorStop(0, '#fffdf4');
                cap.addColorStop(0.45, `hsl(${hue},45%,${88 + hit * 8}%)`);
                cap.addColorStop(0.8, `hsl(${hue},30%,68%)`);
                cap.addColorStop(1, `hsl(${hue},25%,44%)`);
                ctx.fillStyle = cap;
                ctx.beginPath();
                ctx.ellipse(x, y - r * 0.12, r, r * 0.78, 0, Math.PI, 0);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = 'rgba(60,45,20,0.55)'; ctx.lineWidth = 1.1; ctx.stroke();
                // 盖沿彩灯珠（旋转）
                for (let i = 0; i < 6; i++) {
                    const a = Math.PI + i / 6 * Math.PI + Math.sin(ph) * 0.1;
                    const lx = x + Math.cos(a) * r * 0.9, ly = y - r * 0.12 + Math.sin(a) * r * 0.72;
                    const on = (Math.floor(t * 6) + i) % 3 !== 0;
                    ctx.fillStyle = on ? `hsl(${hue},95%,${62 + hit * 20}%)` : 'rgba(70,50,30,0.6)';
                    if (on) { ctx.shadowColor = `hsl(${hue},95%,65%)`; ctx.shadowBlur = 4 + hit * 6; }
                    ctx.beginPath(); ctx.arc(lx, ly, 1.8, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                }
                // 顶灯
                const tg2 = ctx.createRadialGradient(x, y - r * 0.5, 0.5, x, y - r * 0.5, r * 0.3);
                tg2.addColorStop(0, '#ffffff');
                tg2.addColorStop(0.5, `hsl(${hue},100%,${66 + hit * 20}%)`);
                tg2.addColorStop(1, `hsla(${hue},90%,40%,0.9)`);
                ctx.fillStyle = tg2;
                ctx.beginPath(); ctx.arc(x, y - r * 0.5, r * 0.22 + hit * 2, 0, Math.PI * 2); ctx.fill();
                // 命中冲击环
                if (hit > 0.02) {
                    ctx.strokeStyle = `hsla(${hue},100%,78%,${hit})`;
                    ctx.lineWidth = 2 + hit * 3;
                    ctx.beginPath(); ctx.arc(x, y - r * 0.1, r + (1 - hit) * 22, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.restore();
            }

            function drawBumpers() {
                BUMPERS.forEach((bp, i) =>
                    drawMushroom(bp.x, bp.y, bp.r, bp.hue, bumps[i], t * (2.3 + i * 0.7) + i * 1.3));
            }
            function drawJets() {
                JETS.forEach((jt, i) =>
                    drawTurbine(jt.x, jt.y, jt.r, jt.hue, jets[i], -t * (2.6 + i * 0.5) + i * 1.7));
            }

            /* ── 左上角第 7 只引擎：涡轮虫洞（吸入 → 送进左侧火箭管道）── */
            function drawWarpJet() {
                const x = WARP.x, y = WARP.y, r = WARP.r;
                ctx.save();
                const gg = ctx.createRadialGradient(x, y, r * 0.3, x, y, r + 16 + warpFlash * 14);
                gg.addColorStop(0, `rgba(255,140,90,${0.40 + warpFlash * 0.45})`);
                gg.addColorStop(0.55, 'rgba(200,60,30,0.18)');
                gg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = gg;
                ctx.beginPath(); ctx.arc(x, y, r + 16 + warpFlash * 14, 0, Math.PI * 2); ctx.fill();

                const sk = ctx.createLinearGradient(x, y - r, x, y + r);
                sk.addColorStop(0, '#dfe6fb'); sk.addColorStop(0.45, '#8c9ecb');
                sk.addColorStop(0.72, '#414f76'); sk.addColorStop(1, '#232c46');
                ctx.fillStyle = sk;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

                for (let i = 0; i < 6; i++) {
                    const a = i / 6 * Math.PI * 2 + warpSpin * 0.22;
                    ctx.save();
                    ctx.translate(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86);
                    ctx.rotate(a);
                    ctx.fillStyle = 'rgba(255,190,150,0.55)';
                    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.2, r * 0.09, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
                ctx.fillStyle = '#03040a';
                ctx.beginPath(); ctx.arc(x, y, r * 0.74, 0, Math.PI * 2); ctx.fill();

                ctx.save();
                ctx.translate(x, y); ctx.rotate(warpSpin);
                ctx.lineCap = 'round';
                for (let s = 0; s < 3; s++) {
                    ctx.beginPath();
                    const a0 = s / 3 * Math.PI * 2;
                    for (let k = 0; k <= 30; k++) {
                        const u = k / 30;
                        const ang = a0 + u * 4.3;
                        const rad = r * 0.72 * (1 - u * (0.92 - warpPull * 0.28));
                        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
                        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.strokeStyle = `rgba(255,${100 + s * 40},${60 + s * 25},${0.5 + warpFlash * 0.45})`;
                    ctx.lineWidth = 2.1; ctx.stroke();
                }
                ctx.restore();

                const cg = ctx.createRadialGradient(x, y, 0.5, x, y, r * 0.32);
                cg.addColorStop(0, '#ffffff');
                cg.addColorStop(0.4, `rgba(255,170,120,${0.8 + warpFlash * 0.2})`);
                cg.addColorStop(1, 'rgba(120,30,10,0)');
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, Math.PI * 2); ctx.fill();

                ctx.strokeStyle = `rgba(255,190,150,${0.5 + flash.warp * 0.5})`;
                ctx.lineWidth = 1.6;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
                ctx.save();
                ctx.font = 'bold 7px "Segoe UI",sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = `rgba(255,160,110,${0.45 + flash.warp * 0.5})`;
                ctx.fillText('WARP', x, y + r + 9);
                ctx.restore();
            }

            /* ── 左侧火箭发射管道 ── */
            function drawTubeLeft() {
                const P = TUBE_PATH.pts;
                ctx.save();
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(P[0][0], P[0][1]);
                for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
                ctx.lineWidth = 17; ctx.strokeStyle = 'rgba(6,10,20,0.88)'; ctx.stroke();
                const g = ctx.createLinearGradient(30, 200, 60, 560);
                g.addColorStop(0, 'rgba(196,130,255,0.34)');
                g.addColorStop(0.5, 'rgba(130,70,220,0.18)');
                g.addColorStop(1, 'rgba(196,130,255,0.34)');
                ctx.lineWidth = 13; ctx.strokeStyle = g; ctx.stroke();
                ctx.lineWidth = 2; ctx.strokeStyle = `rgba(226,190,255,${0.45 + flash.tube * 0.5})`; ctx.stroke();
                ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.beginPath();
                ctx.moveTo(P[0][0] - 3, P[0][1]);
                for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0] - 3, P[i][1]);
                ctx.stroke();
                ctx.restore();

                const flow = (t * (0.3 + flash.tube * 0.85)) % 1;
                for (let k = 0; k < 4; k++) {
                    const p = TUBE_PATH.at((flow + k * 0.25) % 1);
                    ctx.fillStyle = `rgba(216,170,255,${0.3 + flash.tube * 0.55})`;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2); ctx.fill();
                }
                // 底部喇叭口
                ctx.save();
                ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 4);
                ctx.fillStyle = '#c48aff';
                ctx.beginPath();
                ctx.moveTo(TUBE_ENTRY[0] - 11, TUBE_ENTRY[1] + 9);
                ctx.lineTo(TUBE_ENTRY[0] + 11, TUBE_ENTRY[1] + 9);
                ctx.lineTo(TUBE_ENTRY[0] + 6, TUBE_ENTRY[1] - 3);
                ctx.lineTo(TUBE_ENTRY[0] - 6, TUBE_ENTRY[1] - 3);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#f2eaff';
                ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('▲', TUBE_ENTRY[0], TUBE_ENTRY[1] + 17);
                ctx.restore();
                // 左上出口箭头
                const pe = TUBE_PATH.at(1);
                ctx.save();
                ctx.translate(pe.x, pe.y);
                ctx.rotate(Math.atan2(pe.ty, pe.tx));
                ctx.fillStyle = `rgba(236,214,255,${0.7 + flash.tube * 0.3})`;
                ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-3, -5); ctx.lineTo(-3, 5);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            }

            /* ── 翻牌 ×3：Space Cadet 式翻转徽章牌 ── */
            function drawBadge(k) {
                ctx.save();
                ctx.translate(0, -6);
                ctx.fillStyle = '#8a4c05';
                if (k === 0) {
                    ctx.beginPath();
                    for (let i = 0; i < 10; i++) {
                        const a = -Math.PI / 2 + i * Math.PI / 5;
                        const rr2 = i % 2 ? 3.4 : 8.2;
                        const px = Math.cos(a) * rr2, py = Math.sin(a) * rr2;
                        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.closePath(); ctx.fill();
                } else if (k === 1) {
                    ctx.beginPath();
                    ctx.moveTo(-9, 2); ctx.quadraticCurveTo(-4, -7, 0, -1);
                    ctx.quadraticCurveTo(4, -7, 9, 2);
                    ctx.quadraticCurveTo(4, 1, 0, 5);
                    ctx.quadraticCurveTo(-4, 1, -9, 2);
                    ctx.closePath(); ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(-7, -7); ctx.lineTo(7, -7); ctx.lineTo(7, 1);
                    ctx.quadraticCurveTo(0, 9, -7, 1);
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = '#ffd77a';
                    ctx.fillRect(-1.2, -5, 2.4, 8);
                    ctx.fillRect(-4.5, -2.6, 9, 1.8);
                }
                ctx.restore();
            }
            function drawCards() {
                CARDS.forEach((cd, i) => {
                    const p = cardAnim[i];
                    const sx = p > 0 ? Math.abs(Math.cos(p * Math.PI)) : 1;
                    const face = (p > 0 && p < 0.5) ? 1 - cardFace[i] : cardFace[i];
                    const w = cd.w, h = cd.h;
                    ctx.save();
                    ctx.translate(cd.x, cd.y);
                    ctx.fillStyle = 'rgba(0,0,0,0.4)';
                    ctx.beginPath();
                    ctx.ellipse(0, h / 2 + 3, w * 0.42 * sx + 2, 3.6, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.scale(Math.max(0.03, sx), 1);
                    if (face === 1) {
                        const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
                        g.addColorStop(0, '#fff3c0'); g.addColorStop(0.45, '#ffc93c'); g.addColorStop(1, '#b8790f');
                        ctx.fillStyle = g; rr(-w / 2, -h / 2, w, h, 4); ctx.fill();
                        ctx.strokeStyle = '#fff8dc'; ctx.lineWidth = 1.6; ctx.stroke();
                        drawBadge(i);
                        ctx.fillStyle = '#7a4b06';
                        ctx.font = 'bold 7px "Segoe UI",sans-serif';
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(['CADET', 'PILOT', 'ACE'][i], 0, h / 2 - 7);
                    } else {
                        const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
                        g.addColorStop(0, '#3d4c78'); g.addColorStop(0.5, '#26325a'); g.addColorStop(1, '#18213c');
                        ctx.fillStyle = g; rr(-w / 2, -h / 2, w, h, 4); ctx.fill();
                        ctx.strokeStyle = `rgba(150,180,240,${0.6 + flash.card * 0.4})`;
                        ctx.lineWidth = 1.4; ctx.stroke();
                        ctx.fillStyle = 'rgba(165,200,255,0.85)';
                        ctx.font = 'bold 16px "Segoe UI",sans-serif';
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText('?', 0, -2);
                    }
                    ctx.restore();
                });
            }

            function drawRamp() {
                const P = RAMP_PATH.pts;
                ctx.save();
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(P[0][0], P[0][1]);
                for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
                // 底座深色
                ctx.lineWidth = 19; ctx.strokeStyle = 'rgba(6,12,24,0.85)'; ctx.stroke();
                // 半透明塑料感
                const g = ctx.createLinearGradient(60, 200, 320, 440);
                g.addColorStop(0, 'rgba(255,225,150,0.20)');
                g.addColorStop(0.5, 'rgba(255,190,90,0.12)');
                g.addColorStop(1, 'rgba(255,225,150,0.20)');
                ctx.lineWidth = 15; ctx.strokeStyle = g; ctx.stroke();
                // 两侧金属轨
                ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,232,170,0.55)'; ctx.stroke();
                ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
                ctx.restore();
                // 入口箭头（节拍闪烁）
                ctx.save();
                ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4.5);
                ctx.fillStyle = '#ffd166';
                ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText('▲', RAMP_ENTRY[0], RAMP_ENTRY[1] + 26);
                ctx.restore();
            }

            function drawPlunger() {
                const headY = PLG_TOP + plunger * PLG_PULL;
                ctx.save();
                ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
                const coils = 6, top = headY + 12, span = 42;
                ctx.beginPath();
                for (let i = 0; i <= coils * 2; i++) {
                    const yy = top + span * (i / (coils * 2));
                    const xx = LNCX + (i % 2 ? 9 : -9);
                    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
                }
                ctx.stroke();
                ctx.restore();
                const gw = ctx.createLinearGradient(0, headY, 0, headY + 14);
                gw.addColorStop(0, '#ffe89a'); gw.addColorStop(0.5, '#e0a92c'); gw.addColorStop(1, '#8a6410');
                ctx.fillStyle = gw;
                rr(LNCX - 17, headY, 34, 14, 4); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.65)';
                rr(LNCX - 15, headY + 1.5, 30, 3, 2); ctx.fill();
                if (!launched && plunger > 0) {
                    ctx.fillStyle = 'rgba(6,10,20,0.8)';
                    rr(LANE.r - 12, 400, 7, 190, 3); ctx.fill();
                    const ph = plunger * 184;
                    ctx.fillStyle = `hsl(${130 - plunger * 130},88%,56%)`;
                    rr(LANE.r - 11, 586 - ph, 5, ph, 2); ctx.fill();
                }
            }

            function drawPosts() {
                POSTS.forEach(p => {
                    ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r + 1, p.r * 0.9, p.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
                    const g = ctx.createRadialGradient(p.x - 2, p.y - 2, 0.5, p.x, p.y, p.r + 1);
                    g.addColorStop(0, '#ffe6ef'); g.addColorStop(0.45, '#e0456b'); g.addColorStop(1, '#6b0f28');
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
                });
            }

            function drawTargets() {
                TARGETS.forEach(tg => {
                    const h = tg.h / 2;
                    if (tg.down) {
                        ctx.fillStyle = 'rgba(30,40,66,0.9)';
                        rr(tg.x - tg.w / 2 - 1, tg.y - h, tg.w + 2, tg.h, 2); ctx.fill();
                        ctx.strokeStyle = 'rgba(90,110,160,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                    } else {
                        const g = ctx.createLinearGradient(tg.x + 5, tg.y, tg.x - 5, tg.y);
                        g.addColorStop(0, '#5c6a94'); g.addColorStop(0.3, '#8a5c12');
                        g.addColorStop(0.6, '#f0a93c'); g.addColorStop(1, '#ffd98a');
                        ctx.fillStyle = g;
                        rr(tg.x - tg.w / 2 - 1, tg.y - h, tg.w + 2, tg.h, 2.5); ctx.fill();
                        ctx.strokeStyle = 'rgba(255,240,200,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
                        ctx.fillStyle = 'rgba(255,255,255,0.55)';
                        ctx.fillRect(tg.x - 2, tg.y - h + 3, 1.6, tg.h - 8);
                        ctx.fillStyle = 'rgba(20,26,44,0.9)';
                        ctx.fillRect(tg.x + tg.w / 2 + 1, tg.y - h - 2, 2, tg.h + 4);
                    }
                });
            }

            function drawSpinner() {
                ctx.save();
                ctx.translate(SPIN.x, SPIN.y);
                ctx.strokeStyle = '#8fa4d0'; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-SPIN.w / 2 - 4, -SPIN.h / 2 - 4); ctx.lineTo(-SPIN.w / 2 - 4, SPIN.h / 2 + 4);
                ctx.moveTo(SPIN.w / 2 + 4, -SPIN.h / 2 - 4); ctx.lineTo(SPIN.w / 2 + 4, SPIN.h / 2 + 4);
                ctx.stroke();
                const sc = Math.cos(spinnerAng);
                ctx.save();
                ctx.scale(1, Math.max(0.08, Math.abs(sc)));
                const g = ctx.createLinearGradient(0, -SPIN.h / 2, 0, SPIN.h / 2);
                g.addColorStop(0, '#fff3c4'); g.addColorStop(0.5, '#ffc93c'); g.addColorStop(1, '#a06a10');
                ctx.fillStyle = g;
                rr(-SPIN.w / 2, -SPIN.h / 2, SPIN.w, SPIN.h, 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
                ctx.restore();
                if (flash.spin > 0.02) {
                    ctx.fillStyle = `rgba(255,220,120,${flash.spin * 0.6})`;
                    rr(-SPIN.w / 2 - 5, -SPIN.h / 2 - 5, SPIN.w + 10, SPIN.h + 10, 4); ctx.fill();
                }
                ctx.restore();
            }

            function drawSaucer() {
                ctx.save();
                for (let i = 0; i < 8; i++) {
                    const a = i / 8 * Math.PI * 2 + t * 0.8;
                    const lx = SAUCER.x + Math.cos(a) * (SAUCER.r + 7);
                    const ly = SAUCER.y + Math.sin(a) * (SAUCER.r + 7);
                    const on = (Math.floor(t * 4) + i) % 3 === 0;
                    ctx.fillStyle = on ? 'rgba(255,170,60,0.95)' : 'rgba(120,70,20,0.45)';
                    ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, Math.PI * 2); ctx.fill();
                }
                ctx.fillStyle = '#05080f';
                ctx.beginPath(); ctx.arc(SAUCER.x, SAUCER.y, SAUCER.r, 0, Math.PI * 2); ctx.fill();
                const rg = ctx.createRadialGradient(SAUCER.x - 4, SAUCER.y - 6, 1, SAUCER.x, SAUCER.y, SAUCER.r);
                rg.addColorStop(0, '#39496f'); rg.addColorStop(0.65, '#151d33'); rg.addColorStop(1, '#070a12');
                ctx.fillStyle = rg;
                ctx.beginPath(); ctx.arc(SAUCER.x, SAUCER.y, SAUCER.r - 1, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = flash.saucer > 0.02
                    ? `rgba(255,200,90,${0.4 + flash.saucer * 0.6})`
                    : 'rgba(140,170,230,0.55)';
                ctx.lineWidth = 2 + flash.saucer * 2; ctx.stroke();
                ctx.restore();
            }

            function drawLanes() {
                LANES.forEach((ln, i) => {
                    const on = lanesOn[i];
                    ctx.save();
                    if (on) {
                        const g = ctx.createRadialGradient(ln.x, ln.y, 1, ln.x, ln.y, 18);
                        g.addColorStop(0, 'rgba(255,210,110,0.75)'); g.addColorStop(1, 'rgba(255,180,40,0)');
                        ctx.fillStyle = g;
                        ctx.beginPath(); ctx.arc(ln.x, ln.y, 18, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.fillStyle = on ? '#ffd166' : 'rgba(90,110,160,0.55)';
                    ctx.beginPath(); ctx.arc(ln.x, ln.y, 7.5, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = on ? '#fff3c4' : 'rgba(160,185,235,0.7)';
                    ctx.lineWidth = 1.6; ctx.stroke();
                    ctx.fillStyle = on ? '#3a2400' : 'rgba(12,18,34,0.9)';
                    ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText('ABCDE'[i], ln.x, ln.y + 0.5);
                    ctx.restore();
                });
            }

            function drawSlings() {
                SLINGS.forEach(sl => {
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(sl.a[0], sl.a[1]); ctx.lineTo(sl.b[0], sl.b[1]);
                    ctx.lineTo(sl.c[0], sl.c[1]); ctx.closePath();
                    const g = ctx.createLinearGradient(sl.a[0], sl.a[1], sl.b[0], sl.b[1]);
                    g.addColorStop(0, '#4a5c8c'); g.addColorStop(0.5, '#2c3a5e'); g.addColorStop(1, '#1a2440');
                    ctx.fillStyle = g; ctx.fill();
                    ctx.strokeStyle = 'rgba(160,190,240,0.6)'; ctx.lineWidth = 1.4; ctx.stroke();
                    ctx.restore();
                    ctx.save();
                    ctx.lineCap = 'round';
                    ctx.lineWidth = 5.5; ctx.strokeStyle = '#d8334f';
                    ctx.beginPath(); ctx.moveTo(sl.a[0], sl.a[1]); ctx.lineTo(sl.b[0], sl.b[1]); ctx.stroke();
                    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,190,200,0.85)';
                    ctx.beginPath(); ctx.moveTo(sl.a[0], sl.a[1] - 1.2); ctx.lineTo(sl.b[0] - 1, sl.b[1] - 1.2); ctx.stroke();
                    ctx.restore();
                    [sl.a, sl.b].forEach(p => {
                        const g2 = ctx.createRadialGradient(p[0] - 1.5, p[1] - 1.5, 0.5, p[0], p[1], 5);
                        g2.addColorStop(0, '#eaf0ff'); g2.addColorStop(1, '#4d5c86');
                        ctx.fillStyle = g2;
                        ctx.beginPath(); ctx.arc(p[0], p[1], 4.2, 0, Math.PI * 2); ctx.fill();
                    });
                });
            }

            function drawFlipper(f) {
                const cos = Math.cos(f.ang), sin = Math.sin(f.ang);
                const tx = f.px + cos * f.len, ty = f.py + sin * f.len;
                const nx = -sin, ny = cos;
                const r0 = 9, r1 = 5;
                ctx.save();
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.beginPath();
                ctx.arc(f.px, f.py + 5, r0, 0, Math.PI * 2);
                ctx.arc(tx, ty + 5, r1, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(f.px + nx * r0, f.py + ny * r0);
                ctx.lineTo(tx + nx * r1, ty + ny * r1);
                ctx.arc(tx, ty, r1, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
                ctx.lineTo(f.px - nx * r0, f.py - ny * r0);
                ctx.arc(f.px, f.py, r0, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
                ctx.closePath();
                const g = ctx.createLinearGradient(f.px, f.py, tx, ty);
                g.addColorStop(0, '#fff0a8'); g.addColorStop(0.35, '#ffc93c');
                g.addColorStop(0.75, '#f08a1e'); g.addColorStop(1, '#b45c0c');
                ctx.fillStyle = g; ctx.fill();
                ctx.strokeStyle = '#4a2c05'; ctx.lineWidth = 1.4; ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(f.px + nx * r0 * 0.45, f.py + ny * r0 * 0.45);
                ctx.lineTo(tx + nx * r1 * 0.45, ty + ny * r1 * 0.45);
                ctx.stroke();
                ctx.strokeStyle = '#2a3348'; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(f.px + nx * r0, f.py + ny * r0);
                ctx.lineTo(tx + nx * r1, ty + ny * r1);
                ctx.stroke();
                const pg = ctx.createRadialGradient(f.px - 2, f.py - 2, 0.5, f.px, f.py, 8);
                pg.addColorStop(0, '#eef3ff'); pg.addColorStop(1, '#46557e');
                ctx.fillStyle = pg;
                ctx.beginPath(); ctx.arc(f.px, f.py, 7, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#1a2033'; ctx.lineWidth = 1.2; ctx.stroke();
                ctx.restore();
            }

            function drawKickback() {
                [[40, 624, kickback.L], [312, 624, kickback.R]].forEach(([x, y, on]) => {
                    ctx.save();
                    ctx.globalAlpha = on ? 1 : 0.25;
                    ctx.fillStyle = on ? '#3dff9e' : '#33507a';
                    if (on) { ctx.shadowColor = '#3dff9e'; ctx.shadowBlur = 10; }
                    rr(x - 9, y - 6, 18, 12, 3); ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = on ? '#04220f' : '#1a2740';
                    ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText('KB', x, y + 0.5);
                    ctx.restore();
                });
            }

            // withTrail 只给主球开拖尾，避免多球时轨迹互相污染
            function drawBall(b, withTrail) {
                const isMain = (b === ball);
                if (saucerHold > 0 && isMain) return;
                // 管道滑行时加一个冷光，让球在 tube 内不丢辨识度
                if (onRail && isMain) {
                    const g0 = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, 18);
                    g0.addColorStop(0, 'rgba(160,220,255,0.55)');
                    g0.addColorStop(1, 'rgba(160,220,255,0)');
                    ctx.fillStyle = g0;
                    ctx.beginPath(); ctx.arc(b.x, b.y, 18, 0, Math.PI * 2); ctx.fill();
                }
                ctx.fillStyle = 'rgba(0,0,0,0.42)';
                ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + 11, BALL_R * 1.05, BALL_R * 0.42, 0, 0, Math.PI * 2); ctx.fill();
                if (withTrail) {
                    for (let i = 0; i < trail.length; i++) {
                        const p = trail[i], a = i / trail.length;
                        ctx.fillStyle = `rgba(190,220,255,${a * 0.22})`;
                        ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (0.35 + a * 0.6), 0, Math.PI * 2); ctx.fill();
                    }
                }
                const g = ctx.createRadialGradient(b.x - 3.4, b.y - 4, 0.6, b.x, b.y, BALL_R + 1);
                g.addColorStop(0, '#ffffff'); g.addColorStop(0.22, '#dfe8f5');
                g.addColorStop(0.55, '#9fadc4'); g.addColorStop(0.85, '#5a6579'); g.addColorStop(1, '#2b3340');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(20,26,40,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.beginPath(); ctx.ellipse(b.x - 3, b.y - 3.6, 2.6, 1.7, -0.6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath(); ctx.arc(b.x + 3.4, b.y + 3.4, 1.5, 0, Math.PI * 2); ctx.fill();
                // 环境反射弧（金属感）
                ctx.save();
                ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R - 0.5, Math.PI * 0.15, Math.PI * 0.85);
                ctx.strokeStyle = 'rgba(200,225,255,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
                ctx.restore();
                // 顶部细高光环
                ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R - 1.5, Math.PI * 1.05, Math.PI * 1.7);
                ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
                // 多球：给额外球加一圈金色光环，一眼能认出「这不是主球」
                if (!isMain) {
                    ctx.strokeStyle = 'rgba(255,200,90,0.85)'; ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R + 3.5, 0, Math.PI * 2); ctx.stroke();
                }
            }

            function drawParts() {
                for (const p of parts) {
                    const a = 1 - p.age / p.life;
                    ctx.fillStyle = `hsla(${p.hue},100%,${58 + a * 25}%,${a})`;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a + 0.4, 0, Math.PI * 2); ctx.fill();
                }
            }

            function drawToast() {
                if (toastT <= 0) return;
                ctx.save();
                ctx.globalAlpha = Math.min(1, toastT * 2);
                ctx.font = 'bold 17px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const ww = ctx.measureText(toast).width + 30;
                ctx.fillStyle = 'rgba(6,10,22,0.88)';
                rr(176 - ww / 2, 128, ww, 34, 9); ctx.fill();
                ctx.strokeStyle = 'rgba(255,195,120,0.7)'; ctx.lineWidth = 1.6; ctx.stroke();
                ctx.shadowColor = '#ffc46a'; ctx.shadowBlur = 12;
                ctx.fillStyle = '#eaf6ff'; ctx.fillText(toast, 176, 145);
                ctx.restore();
            }

            function drawHints() {
                // 常驻操作提示（小字、低透明度，不遮挡台面）
                ctx.save();
                ctx.globalAlpha = 0.32 + 0.12 * Math.sin(t * 3);
                ctx.font = '9px "Segoe UI","PingFang SC",sans-serif';
                ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#c9b48d';
                ctx.fillText('← / → 挡板 · 空格 发射 · R 重发本球', 14, GH - 8);
                ctx.restore();
                if (launched) return;
                ctx.save();
                ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3.5);
                ctx.font = 'bold 12px "Segoe UI","PingFang SC",sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffd9a0';
                ctx.fillText('按住 空格 / ↓ 蓄力  ·  松手发射', 176, 478);
                ctx.restore();
            }

            function drawMuteBtn() {
                const x = GW - 22, y = 22;
                let muted = false;
                try { muted = !!AU.muted; } catch (e) { }
                ctx.save();
                ctx.fillStyle = 'rgba(10,16,30,0.7)';
                rr(x - 11, y - 11, 22, 22, 5); ctx.fill();
                ctx.strokeStyle = 'rgba(150,190,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = muted ? '#8a7a64' : '#ffcf8a';
                ctx.beginPath();
                ctx.moveTo(x - 6, y - 2.5); ctx.lineTo(x - 2.5, y - 2.5); ctx.lineTo(x + 1, y - 6);
                ctx.lineTo(x + 1, y + 6); ctx.lineTo(x - 2.5, y + 2.5); ctx.lineTo(x - 6, y + 2.5);
                ctx.closePath(); ctx.fill();
                if (muted) {
                    ctx.strokeStyle = '#ff7a7a'; ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.moveTo(x + 3, y - 4); ctx.lineTo(x + 8, y + 4); ctx.stroke();
                } else {
                    ctx.strokeStyle = '#ffcf8a'; ctx.lineWidth = 1.3;
                    ctx.beginPath(); ctx.arc(x + 2, y, 4, -0.9, 0.9); ctx.stroke();
                }
                ctx.restore();
            }

            /* ── 右侧指令面板（对齐原版：logo · BALL · 分数框 · 任务框）── */
            function drawPanel() {
                const px = PANEL.x, pw = PANEL.w;
                // 面板底 + 与台面的分隔梁
                const bg = ctx.createLinearGradient(px - 8, 0, px + 14, 0);
                bg.addColorStop(0, '#0c0a08'); bg.addColorStop(0.5, '#3a3021'); bg.addColorStop(1, '#191410');
                ctx.fillStyle = bg; ctx.fillRect(px - 8, 8, 22, GH - 16);
                const pbg = ctx.createLinearGradient(px, 0, px + pw, GH);
                pbg.addColorStop(0, '#1b1712'); pbg.addColorStop(0.5, '#120f0b'); pbg.addColorStop(1, '#0a0806');
                ctx.fillStyle = pbg; ctx.fillRect(px, 8, pw + 2, GH - 16);
                ctx.strokeStyle = '#8a6f45'; ctx.lineWidth = 2;
                rr(px - 6, 6, pw + 14, GH - 12, 10); ctx.stroke();

                /* ── ① Logo 框（星空 + 紫字 + 绿行星 + 军校生飞船）── */
                const lx = px + 10, ly = 104, lw = pw - 20, lh = 196;
                ctx.fillStyle = '#04030a';
                rr(lx, ly, lw, lh, 6); ctx.fill();
                ctx.strokeStyle = '#6e5226'; ctx.lineWidth = 2; ctx.stroke();
                ctx.save();
                rr(lx, ly, lw, lh, 6); ctx.clip();
                for (let i = 0; i < 46; i++) {
                    const sx = lx + ((i * 97) % lw), sy = ly + ((i * 53) % lh);
                    ctx.fillStyle = `rgba(255,250,240,${0.25 + (i % 5) * 0.13})`;
                    ctx.fillRect(sx, sy, i % 3 ? 1 : 1.6, i % 3 ? 1 : 1.6);
                }
                // 绿色行星（左下）
                const pgx = lx + 26, pgy = ly + lh - 26, pgr = 15;
                const pgr2 = ctx.createRadialGradient(pgx - 4, pgy - 5, 1, pgx, pgy, pgr);
                pgr2.addColorStop(0, '#9ce8a8'); pgr2.addColorStop(0.6, '#3a9a4c'); pgr2.addColorStop(1, '#0e3a18');
                ctx.fillStyle = pgr2;
                ctx.beginPath(); ctx.arc(pgx, pgy, pgr, 0, Math.PI * 2); ctx.fill();
                // 小飞船（右侧，军校生驾驶）
                const scx = lx + lw - 40, scy = ly + 66;
                ctx.save(); ctx.translate(scx, scy); ctx.rotate(-0.28);
                const hull = ctx.createLinearGradient(0, -12, 0, 14);
                hull.addColorStop(0, '#e8ecf4'); hull.addColorStop(0.5, '#9aa4b8'); hull.addColorStop(1, '#4a5266');
                ctx.fillStyle = hull;
                ctx.beginPath(); ctx.ellipse(0, 0, 26, 11, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#2a3040'; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = '#c03040';
                rr(-18, -4, 14, 8, 3); ctx.fill();
                // 驾驶舱 + 军校生（金发）
                ctx.fillStyle = '#8ad4f0';
                ctx.beginPath(); ctx.arc(-2, -8, 7.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#d8e8f4'; ctx.lineWidth = 1.4; ctx.stroke();
                ctx.fillStyle = '#f0c060';
                ctx.beginPath(); ctx.arc(-2, -7, 4.4, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#302418';
                ctx.fillRect(-4.5, -8.5, 5, 2);
                ctx.restore();
                // 尾焰
                const fl2 = ctx.createLinearGradient(scx + 20, scy - 20, scx + 34, scy - 8);
                fl2.addColorStop(0, 'rgba(255,170,60,0.7)'); fl2.addColorStop(1, 'rgba(255,80,30,0)');
                ctx.fillStyle = fl2;
                ctx.beginPath();
                ctx.moveTo(scx + 18, scy - 16); ctx.lineTo(scx + 36, scy - 22); ctx.lineTo(scx + 30, scy - 4);
                ctx.closePath(); ctx.fill();
                // 文字
                ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                ctx.font = 'italic bold 15px "Segoe UI",sans-serif';
                ctx.fillStyle = '#a868e8';
                ctx.fillText('3D Pinball', lx + 12, ly + 30);
                const sc3 = ctx.createLinearGradient(0, ly + 38, 0, ly + 70);
                sc3.addColorStop(0, '#d29aff'); sc3.addColorStop(0.55, '#9a44ec'); sc3.addColorStop(1, '#5c1e9e');
                ctx.font = 'italic bold 25px "Segoe UI",sans-serif';
                ctx.fillStyle = sc3;
                ctx.shadowColor = 'rgba(150,70,230,0.55)'; ctx.shadowBlur = 8;
                ctx.fillText('Space Cadet', lx + 12, ly + 64);
                ctx.shadowBlur = 0;
                ctx.font = 'bold 9px "Segoe UI",sans-serif';
                ctx.fillStyle = 'rgba(255,220,150,0.55)';
                ctx.fillText('塔界远征 · 太空军校生', lx + 12, ly + 84);
                ctx.restore();

                /* ── ② BALL 行 ── */
                const by2 = ly + lh + 16;
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 15px "Segoe UI",sans-serif';
                ctx.textAlign = 'left';
                ctx.fillStyle = '#e8e4d8';
                ctx.fillText('BALL', px + 12, by2 + 14);
                const bn = endless ? '∞' : String(Math.max(1, Math.min(3, 4 - balls)));
                ctx.fillStyle = '#180404';
                rr(px + 72, by2, 44, 28, 3); ctx.fill();
                ctx.strokeStyle = '#c02020'; ctx.lineWidth = 2; ctx.stroke();
                ctx.font = 'bold 19px "Consolas",monospace';
                ctx.textAlign = 'center';
                ctx.shadowColor = '#ff4030'; ctx.shadowBlur = 8;
                ctx.fillStyle = '#ff5040';
                ctx.fillText(bn, px + 94, by2 + 15);
                ctx.shadowBlur = 0;

                /* ── ③ 分数框（两格凹槽：球号 | 总分）── */
                const sy2 = by2 + 40;
                ctx.fillStyle = '#08090e';
                rr(px + 10, sy2, lw, 56, 4); ctx.fill();
                ctx.strokeStyle = '#565d6e'; ctx.lineWidth = 2.4; ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(px + 11, sy2 + 1); ctx.lineTo(px + lw - 1, sy2 + 1);
                ctx.moveTo(px + 11, sy2 + 1); ctx.lineTo(px + 11, sy2 + 55);
                ctx.stroke();
                ctx.strokeStyle = '#565d6e';
                ctx.beginPath(); ctx.moveTo(px + 54, sy2 + 3); ctx.lineTo(px + 54, sy2 + 53); ctx.stroke();
                ctx.font = 'bold 17px "Consolas",monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#d8d4c8';
                ctx.fillText(bn, px + 32, sy2 + 29);
                ctx.textAlign = 'right';
                ctx.shadowColor = '#ffd45a'; ctx.shadowBlur = 6;
                ctx.fillStyle = '#ffd166';
                ctx.font = 'bold 19px "Consolas",monospace';
                let sTxt = String(score);
                if (sTxt.length > 9) sTxt = (score / 1000).toFixed(1) + 'k';
                ctx.fillText(sTxt, px + lw - 8, sy2 + 29);
                ctx.shadowBlur = 0;

                /* ── ④ 任务黑框（原版底部任务文字区）── */
                const my = sy2 + 68, mh = GH - 24 - my;
                ctx.fillStyle = '#04050a';
                rr(px + 10, my, lw, mh, 5); ctx.fill();
                ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 2; ctx.stroke();
                ctx.save();
                rr(px + 10, my, lw, mh, 5); ctx.clip();
                ctx.textAlign = 'left';
                ctx.font = 'bold 10px "Consolas",monospace';
                ctx.fillStyle = 'rgba(255,150,60,0.75)';
                ctx.fillText('· MISSION ·', px + 20, my + 18);
                const wrap = (txt, x, y, maxW, lh3, size, color, glow) => {
                    ctx.font = `bold ${size}px "Consolas","Courier New",monospace`;
                    let line = '', yy = y;
                    for (const ch of String(txt)) {
                        if (ctx.measureText(line + ch).width > maxW) {
                            dmdText(line, x, yy, size, color, 'left');
                            yy += lh3; line = ch;
                        } else line += ch;
                    }
                    if (line) { if (glow) dmdText(line, x, yy, size, color, 'left'); else { ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(line, x, yy); } }
                    return yy + lh3;
                };
                if (over) {
                    dmdText('GAME OVER', px + 24, my + mh / 2 - 14, 20, '#ff6a3d', 'left');
                    dmdText(score >= P.goal ? '任务达成' : '球已用完', px + 24, my + mh / 2 + 16, 14, '#ffb85c', 'left');
                } else if (!launched) {
                    // 原版味：待发射时任务区显示「等待部署」
                    dmdText('等待部署', px + 24, my + 58, 24, '#ff9a2e', 'left');
                    wrap('按住空格蓄力，松手发射', px + 22, my + 104, lw - 40, 20, 12, '#c8bfa8');
                } else {
                    const m = MISSIONS[missionIdx];
                    const rk = RANKS[Math.min(RANKS.length - 1, missionIdx)];
                    if (missionFlash > 0) {
                        dmdText('任务完成!', px + 24, my + 58, 22, '#ffe9b0', 'left');
                    } else if (m) {
                        let yy = wrap(m.n, px + 22, my + 48, lw - 40, 24, 18, '#ff9a2e', true);
                        yy = wrap('目标：' + m.hint, px + 22, yy + 6, lw - 40, 19, 12, '#d8cdb2');
                        dmdText(`进度 ${Math.min(missionProg, m.need)}/${m.need} · 军衔 ${rk}`, px + 22, yy + 10, 11, '#ffb85c', 'left');
                        // 进度条
                        const bw2 = lw - 44, bx2 = px + 22, byy = yy + 26;
                        ctx.fillStyle = 'rgba(255,140,60,0.18)';
                        ctx.fillRect(bx2, byy, bw2, 7);
                        ctx.fillStyle = '#ff9a2e';
                        ctx.fillRect(bx2, byy, bw2 * Math.min(1, missionProg / m.need), 7);
                    }
                    if (mbCount > 1 && live.length > 1)
                        dmdText('MULTIBALL ×' + live.length, px + 22, my + mh - 18, 13, '#ff6a3d', 'left');
                }
                ctx.restore();
            }

            let last = 0, raf = 0;
            function frame(ts) {
                raf = requestAnimationFrame(frame);
                const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
                last = ts; t += dt;

                for (let i = 0; i < 3; i++) bumps[i] = Math.max(0, bumps[i] - dt * 3.2);
                for (const k in flash) flash[k] = Math.max(0, flash[k] - dt * 2.4);
                missionFlash = Math.max(0, missionFlash - dt * 1.2);
                shake = Math.max(0, shake - dt * 3.4);
                toastT = Math.max(0, toastT - dt);
                for (let i = parts.length - 1; i >= 0; i--) {
                    const p = parts[i];
                    p.age += dt;
                    p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
                    if (p.age >= p.life) parts.splice(i, 1);
                }

                step(dt);

                ctx.save();
                if (shake > 0.001) {
                    ctx.translate((Math.random() - 0.5) * shakeMag * shake * 2, (Math.random() - 0.5) * shakeMag * shake * 2);
                }
                ctx.clearRect(-20, -20, GW + 40, GH + 40);
                drawCabinet();
                drawPlayfield();
                drawTubeLeft();
                drawRamp();
                drawLanes();
                drawWalls();
                drawLaunchTube();
                drawSaucer();
                drawCards();
                drawTargets();
                drawSpinner();
                drawBumpers();
                drawJets();
                drawWarpJet();
                drawPosts();
                drawSlings();
                drawKickback();
                drawFlipper(FL);
                drawFlipper(FR);
                drawPlunger();
                for (let bi = 0; bi < live.length; bi++) drawBall(live[bi], bi === 0);
                drawParts();
                ctx.restore();

                drawDMD();
                drawPanel();
                drawHints();
                drawToast();
                drawMuteBtn();

                opts.onScore && opts.onScore(
                    `${endless ? '无尽' : `第 ${idx0 + 1} 关`} · ${score.toLocaleString()}${endless ? '' : ' / ' + P.goal.toLocaleString()} 分 · 球 ${endless ? '∞' : balls} · ×${mult} · 连击 ×${combo}`
                );
            }
            raf = requestAnimationFrame(frame);

            /* ── 调试句柄（冒烟测试用） ── */
            if (typeof window !== 'undefined' && window.__MG_TEST) {
                window.__pinball = {
                    get balls() { return balls; },
                    get launched() { return launched; },
                    get ball() { return ball; },
                    get combo() { return combo; },
                    get mult() { return mult; },
                    get score() { return score; },
                    get liveCount() { return live.length; },
                    get mission() {
                        const m = MISSIONS[missionIdx];
                        return { i: missionIdx, prog: missionProg, name: m && m.n, need: m && m.need, rank: RANKS[Math.min(RANKS.length - 1, missionIdx)] };
                    },
                    get cards() { return cardFace.slice(); },
                    get warpHold() { return warpHold; },
                    get railMode() { return railMode; },
                    addScore, finish, missionHit, startMultiball: n => startMultiball(n, true), enterTube,
                    relaunch: () => manualRelaunch(),
                    get stuckT() { return stuckT; },
                    warp() {
                        if (warpHold > 0 || warpLock > 0) return false;
                        onRail = false; saucerHold = 0;
                        warpHold = 0.72; warpPull = 0; warpFlash = 1; flash.warp = 1;
                        ball.x = WARP.x; ball.y = WARP.y; ball.vx = ball.vy = 0;
                        addScore(3000, 'warp'); return true;
                    },
                    putBallAt(x, y, vx, vy) {
                        launched = true; onRail = false; saucerHold = 0;
                        warpHold = 0; warpLock = 0;
                        ball.x = x; ball.y = y; ball.vx = vx || 0; ball.vy = vy || 0;
                    },
                    launch(v) {
                        plungerHold = false; plunger = v == null ? 0.9 : v;
                        onRail = true; railU = 0; railMode = RAIL.LAUNCH;
                        railSpeed = 1150 + 620 * plunger;
                        launched = true; plunger = 0;
                    },
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
