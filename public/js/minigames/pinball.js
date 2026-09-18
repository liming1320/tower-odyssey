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
        // 50 关目标分数 + ∞ 无尽；3 球制
window.MiniGames = window.MiniGames || {};
(function () {
    'use strict';

    /* ══════════════════════ 1. 常量 / 台面几何 ══════════════════════ */
    // 布局对齐原版：左侧台面 + 右侧指令面板（logo / BALL / 分数框 / 任务框）
    const GW = 620, GH = 700;
    const PANEL = { x: 434, w: 176, y: 96, h: 592 };
    const BALL_R = 5;
    const GRAV = 1500;
    const SUB = 6;                 // 物理子步
    const SPEED_CAP = 1800;

    // 台面：左右直墙 + 顶部半圆拱
    const PF = { l: 28, r: 324, cx: 176, cy: 300, arcR: 148, bot: 627 };
    const LANE = { l: 346, r: 402, top: 118, bot: 690 };

    const DMD = { x: 20, y: 14, w: 380, h: 84 };   // 加高：第三行显示当前任务与进度
    const CADET_LOGO = new Image();
    CADET_LOGO.src = '/img/pinball/cadet-logo.bmp';
    const CADET_TABLE = new Image();
    CADET_TABLE.src = '/img/pinball/cadet-table.bmp';

    // Full Tilt resource coordinates are global 640x480 coordinates; the table starts at 137,2.
    const CADET_SCALE = (LANE.r - PF.l) / 365;
    const cadetX = x => PF.l + (x - 137) * CADET_SCALE;
    const cadetY = y => 140 + (y - 2) * CADET_SCALE;
    const cadetImage = name => {
        const image = new Image();
        // The extractor can replace these files while the development server is running.
        image.src = '/img/pinball/' + name + '?v=2';
        return image;
    };
    // Keep the ball, plunger sprite and launch rail on the original table's coordinates.
    const CADET_PLUNGER_ORIGIN = { x: 461, y: 383, w: 11 };
    const CADET_LAUNCH = { ballX: CADET_PLUNGER_ORIGIN.x + CADET_PLUNGER_ORIGIN.w / 2, ballY: 378.5 };
    const LNCX = cadetX(CADET_LAUNCH.ballX);
    const BALL_REST_Y = cadetY(CADET_LAUNCH.ballY);
    const PLG_TOP = cadetY(CADET_PLUNGER_ORIGIN.y);
    const PLG_PULL = 26;
    const CADET_BALL = cadetImage('cadet-ball.png');
    const CADET_PLUNGER = cadetImage('cadet-plunger.png');
    const CADET_KICKERS = [
        { rest: cadetImage('cadet-kick-left-rest.png'), hit: cadetImage('cadet-kick-left-hit.png'), restPos: [168, 379], hitPos: [170, 370], x: cadetX(173), y: cadetY(396), vx: 105 },
        { rest: cadetImage('cadet-kick-right-rest.png'), hit: cadetImage('cadet-kick-right-hit.png'), restPos: [435, 379], hitPos: [434, 370], x: cadetX(439), y: cadetY(396), vx: -105 },
    ];
    const CADET_REBOUNDERS = [
        { image: cadetImage('cadet-rebound-1.png'), pos: [245, 291], x: 254.5, y: 313.5, surface: [245, 334, 264, 291] },
        { image: cadetImage('cadet-rebound-2.png'), pos: [375, 291], x: 384.5, y: 313.5, surface: [394, 334, 375, 291] },
        { image: cadetImage('cadet-rebound-3.png'), pos: [367, 110], x: 379.5, y: 129 },
        { image: cadetImage('cadet-rebound-4.png'), pos: [234, 130], x: 252, y: 139.5 },
    ];
    const CADET_GATES = [
        { image: cadetImage('cadet-gate-1.png'), pos: [170, 337], x: cadetX(170), y: cadetY(337), w: 22, h: 19 },
        { image: cadetImage('cadet-gate-2.png'), pos: [424, 356], x: cadetX(424), y: cadetY(356), w: 23, h: 19 },
    ];
    const CADET_FLAGS = [
        { image: cadetImage('cadet-flag-1.png'), pos: [202, 105] },
        { image: cadetImage('cadet-flag-2.png'), pos: [380, 131] },
    ];
    const CADET_TARGET_FRAMES = [
        [
            { image: cadetImage('cadet-target-1.png'), pos: [385, 182] },
            { image: cadetImage('cadet-target-2.png'), pos: [386, 193] },
            { image: cadetImage('cadet-target-3.png'), pos: [387, 203] },
        ],
        [
            { image: cadetImage('cadet-target-4.png'), pos: [297, 134] },
            { image: cadetImage('cadet-target-5.png'), pos: [307, 137] },
            { image: cadetImage('cadet-target-6.png'), pos: [317, 140] },
        ],
        [
            { image: cadetImage('cadet-target-7.png'), pos: [269, 71] },
            { image: cadetImage('cadet-target-8.png'), pos: [277, 67] },
            { image: cadetImage('cadet-target-9.png'), pos: [286, 63] },
        ],
    ];
    const CADET_ROLLERS = [
        [[637, [299, 60]], [638, [317, 60]], [639, [334, 60]]].map(([group, pos]) => ({ image: cadetImage(`cadet-roll-${group}.png`), pos })),
        [[640, [184, 297]], [641, [206, 297]], [642, [227, 297]]].map(([group, pos]) => ({ image: cadetImage(`cadet-roll-${group}.png`), pos })),
        [[643, [404, 297]], [644, [425, 297]]].map(([group, pos]) => ({ image: cadetImage(`cadet-roll-${group}.png`), pos })),
        [[645, [190, 190]], [646, [206, 194]], [647, [222, 199]]].map(([group, pos]) => ({ image: cadetImage(`cadet-roll-${group}.png`), pos })),
    ];
    const CADET_LITE = {
        lanes: [333, 334, 335, 304].map(group => cadetImage(`cadet-lite-${group}.png`)),
        ramp: [[271, [299, 227]], [272, [276, 243]], [273, [269, 270]], [274, [282, 297]], [275, [314, 309]], [276, [346, 297]], [277, [360, 271]], [278, [352, 243]], [279, [329, 227]]]
            .map(([group, pos]) => ({ image: cadetImage(`cadet-lite-${group}.png`), pos })),
        warp: [[268, [343, 113]], [269, [359, 113]], [270, [351, 124]]]
            .map(([group, pos]) => ({ image: cadetImage(`cadet-lite-${group}.png`), pos })),
    };
    const CADET_LIGHT_GROUPS = {
        worm_hole_lights: [244, 245, 246],
        fuel_bargraph: [374, 375, 376, 377, 378, 379],
        l_trek_lights: [341, 342, 343, 344, 345],
        r_trek_lights: [336, 337, 338, 339, 340],
        bsink_arrow_lights: [235, 238, 241],
        hyperspace_lights: [258, 259, 260, 261],
        ramp_tgt_lights: [301, 302, 303],
        goal_lights: [351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373],
        bpr_solotgt_lights: [307, 308, 309],
        top_circle_tgt_lights: [295, 296, 297],
        lchute_tgt_lights: [304, 305, 306],
        right_target_lights: [286, 285, 284, 283],
        skill_shot_lights: [292, 293, 294, 312, 313, 314],
        top_target_lights: [291, 290, 289, 288],
        bumper_target_lights: [252, 251, 250],
        bmpr_inc_lights: [247, 248, 249],
        ramp_bmpr_inc_lights: [335, 334, 333],
    };
    const CADET_LIGHT_POSITIONS = {
        244: [348, 47], 245: [276, 54], 246: [405, 204],
        247: [332, 52], 248: [315, 49], 249: [298, 52],
        250: [305, 169], 251: [305, 158], 252: [305, 149],
        258: [390, 117], 259: [394, 98], 260: [387, 77], 261: [375, 60],
        283: [377, 175], 284: [372, 188], 285: [372, 204], 286: [378, 217],
        288: [294, 74], 289: [283, 79], 290: [274, 83], 291: [262, 86],
        301: [243, 220], 302: [242, 231], 303: [241, 242],
        333: [190, 183], 334: [206, 187], 335: [222, 190],
        304: [234, 104], 305: [233, 114], 306: [235, 123],
        307: [359, 88], 308: [363, 95], 309: [367, 103],
        310: [360, 148], 311: [351, 181], 312: [419, 96],
        313: [407, 64], 314: [380, 41], 315: [314, 225],
        316: [342, 234], 317: [358, 256], 318: [354, 285],
        319: [366, 302], 320: [308, 293], 321: [288, 281],
        322: [284, 263], 323: [292, 247], 324: [197, 171],
        325: [290, 195], 326: [251, 205], 327: [254, 234],
        328: [186, 266], 329: [227, 263], 330: [308, 293],
        331: [288, 281], 332: [284, 263],
        336: [424, 67], 337: [404, 47], 338: [377, 31],
        339: [349, 22], 340: [324, 17], 341: [204, 74],
        342: [214, 55], 344: [274, 23], 345: [305, 17],
        346: [419, 207], 347: [179, 254], 348: [196, 160],
        349: [247, 380], 350: [380, 380],
        351: [361, 308], 352: [419, 266], 353: [399, 266],
        354: [362, 212], 355: [348, 194], 356: [392, 147],
        357: [353, 103], 358: [335, 41], 359: [241, 58],
        360: [276, 92], 361: [249, 96], 362: [285, 116],
        363: [212, 89], 364: [243, 113], 365: [284, 158],
        366: [315, 154], 367: [197, 171], 368: [290, 195],
        369: [251, 205], 370: [254, 234], 371: [186, 266],
        372: [227, 263], 373: [262, 306], 374: [235, 190],
        375: [227, 177], 376: [220, 165], 377: [214, 153],
        378: [210, 141], 379: [207, 129],
    };
    const CADET_LIGHT_IMAGES = Object.fromEntries(Object.keys(CADET_LIGHT_POSITIONS)
        .map(id => [id, cadetImage(`cadet-lite-${id}.png`)]));
    const CADET_LITE_POS = [[190, 183], [206, 187], [222, 190], [234, 104]];
    const CADET_FLIPPERS = [
        Array.from({ length: 8 }, (_, frame) => cadetImage(`cadet-flip-left-${frame}.png`)),
        Array.from({ length: 8 }, (_, frame) => cadetImage(`cadet-flip-right-${frame}.png`)),
    ];
    const CADET_FLIPPER_POSITIONS = [
        [[261, 378], [261, 378], [261, 378], [261, 378], [261, 377], [261, 370], [261, 364], [261, 358]],
        [[335, 378], [332, 378], [329, 378], [328, 378], [328, 377], [329, 370], [331, 364], [335, 358]],
    ];
    const CADET_BUMPERS = [
        { frames: Array.from({ length: 8 }, (_, frame) => cadetImage(`cadet-bump-1-${frame}.png`)), pos: [[307, 112], [307, 113]] },
        { frames: Array.from({ length: 8 }, (_, frame) => cadetImage(`cadet-bump-2-${frame}.png`)), pos: [[328, 79], [328, 80]] },
        { frames: Array.from({ length: 8 }, (_, frame) => cadetImage(`cadet-bump-3-${frame}.png`)), pos: [[288, 86], [288, 87]] },
        { frames: Array.from({ length: 8 }, (_, frame) => cadetImage(`cadet-bump-5-${frame}.png`)), pos: [[212, 216], [212, 217]] },
        { frames: Array.from({ length: 8 }, (_, frame) => cadetImage(`cadet-bump-6-${frame}.png`)), pos: [[178, 208], [179, 209]] },
        { frames: Array.from({ length: 8 }, (_, frame) => cadetImage(`cadet-bump-7-${frame}.png`)), pos: [[188, 231], [188, 232]] },
    ];

    // 顶部涡轮引擎 ×3（倒三角布置，原版 turbo bumper 位）
    const BUMPERS = [
        { x: cadetX(319.5), y: cadetY(125), r: 13, hue: 5 },
        { x: cadetX(340), y: cadetY(91), r: 12, hue: 22 },
        { x: cadetX(300), y: cadetY(98.5), r: 12, hue: 40 },
    ];
    // 左侧涡轮引擎 ×3（竖排，原版左路引擎带）
    const JETS = [
        { x: cadetX(222), y: cadetY(226), r: 10, hue: 145 },
        { x: cadetX(188.5), y: cadetY(218), r: 10, hue: 180 },
        { x: cadetX(198.5), y: cadetY(241.5), r: 10, hue: 210 },
    ];
    // 左上角第 7 只引擎：涡轮虫洞（吸入 → 送进左侧火箭管道重新发射）
    const WARP = { x: 102, y: 212, r: 16 };
    // 小弹力柱
    const POSTS = [{ x: 116, y: 262, r: 6 }, { x: 280, y: 262, r: 6 },
    { x: 46, y: 466, r: 6 }, { x: 306, y: 466, r: 6 }];
    // 原版 3 组落下靶，每组 3 只；坐标来自 a_targ1..a_targ22 的 1x 资源。
    const TARGETS = [
        [388.5, 189.5, 7, 15, 0], [389.5, 200, 7, 14, 0], [390.5, 210.5, 7, 15, 0],
        [303.5, 139.5, 13, 11, 1], [313.5, 142.5, 13, 11, 1], [323.5, 145.5, 13, 11, 1],
        [275, 77.5, 12, 13, 2], [283, 73.5, 12, 13, 2], [292, 70.5, 12, 13, 2],
    ].map(([x, y, w, h, group], i) => ({ i, group, x: cadetX(x), y: cadetY(y), w: w * CADET_SCALE, h: h * CADET_SCALE, down: false }));
    const REBOUND = CADET_REBOUNDERS.map((rp, i) => ({ x: cadetX(rp.x), y: cadetY(rp.y), i }));
    // 旋转门
    const SPIN = { x: 128, y: 430, w: 30, h: 9 };
    // 计分洞
    const SAUCER = { x: 176, y: 452, r: 17 };
    // 顶部滚道灯
    const LANES = [{ x: 140, y: 194 }, { x: 172, y: 178 }, { x: 214, y: 180 }, { x: 250, y: 198 }];
    // 弹弓（三角形，斜边朝向台面中央）
    const SLINGS = [
        { a: [62, 498], b: [124, 558], c: [62, 558] },
        { a: [290, 498], b: [228, 558], c: [290, 558] },
    ];
    // 挡板
    const FLIP_L = { px: cadetX(264), py: cadetY(402), len: 43 * CADET_SCALE, rest: 0.52, up: -0.52, cadetSide: 0 };
    const FLIP_R = { px: cadetX(378), py: cadetY(402), len: 43 * CADET_SCALE, rest: Math.PI - 0.52, up: Math.PI + 0.52, cadetSide: 1 };
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
        s.push({ x1: PF.l, y1: 300, x2: PF.l, y2: PF.bot, r: 2 });
        s.push({ x1: PF.r, y1: 300, x2: PF.r, y2: PF.bot, r: 2 });
        s.push(...polySegs([[324, 300], [340, 244], [346, 208]], false, 2));
        s.push({ x1: LANE.l, y1: 208, x2: LANE.l, y2: 690, r: 2 });
        s.push({ x1: LANE.r, y1: 130, x2: LANE.r, y2: 690, r: 2 });
        s.push({ x1: LANE.l, y1: 690, x2: LANE.r, y2: 690, r: 2 });
        s.push(...polySegs(GUIDE_L, false, 3));
        s.push(...polySegs(GUIDE_R, false, 3));
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

    function startNativeSpaceCadet(container, opts, idx0, endless, P) {
        const host = document.createElement('div');
        const frame = document.createElement('iframe');
        let stopped = false;
        let completed = false;
        host.style.cssText = 'width:min(100%,820px);aspect-ratio:4/3;margin:auto;background:#000;';
        frame.src = '/vendor/spacecadet/index.html?v=1';
        frame.title = 'Space Cadet Pinball';
        frame.setAttribute('allow', 'autoplay');
        frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#000;';
        host.appendChild(frame);
        container.replaceChildren(host);

        const focusGame = () => {
            if (stopped) return;
            try {
                frame.focus();
                const canvas = frame.contentDocument && frame.contentDocument.getElementById('canvas');
                if (canvas) canvas.focus();
            } catch (e) { }
        };
        frame.addEventListener('load', focusGame);
        host.addEventListener('pointerdown', focusGame);
        const onMessage = event => {
            if (stopped || event.source !== frame.contentWindow) return;
            const data = event.data;
            if (!data || data.type !== 'spacecadet-score') return;
            const score = Math.max(0, Number(data.score) || 0);
            const balls = Math.max(0, Number(data.balls) || 0);
            opts.onScore && opts.onScore(
                `${endless ? '无尽' : `第 ${idx0 + 1} 关`} · ${score.toLocaleString()}${endless ? '' : ' / ' + P.goal.toLocaleString()} 分 · 球 ${balls}`
            );
            if (!endless && !completed && score >= P.goal) {
                completed = true;
                opts.onComplete && opts.onComplete({
                    win: true,
                    stars: score >= P.goal * 2 ? 3 : score >= P.goal * 1.35 ? 2 : 1,
                    score,
                    lines: [`原版分数 ${score.toLocaleString()}，达到关卡目标`],
                });
            }
        };
        window.addEventListener('message', onMessage);
        opts.onScore && opts.onScore(`${endless ? '无尽' : `第 ${idx0 + 1} 关`} · 0${endless ? '' : ' / ' + P.goal.toLocaleString()} 分 · 原版 Space Cadet 台面`);
        return {
            stop() {
                stopped = true;
                window.removeEventListener('message', onMessage);
                frame.src = 'about:blank';
                host.remove();
            },
        };
    }

    /* ══════════════════════ 4. 主模块 ══════════════════════ */
    MiniGames.pinball = {
        LEVELS: NAMES.map((name, i) => {
            const P = lvP(i);
            return { name, desc: `第 ${i + 1} 关 · 目标 ${P.goal.toLocaleString()} 分 · 3 球` };
        }),
        ENDLESS: { name: '∞ 无尽', desc: '无限球数挑战最高分，重力强化' },

        start(container, opts) {
            opts = opts || {};
            const idx0 = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const endless = !!opts.endless;
            const P = lvP(Math.min(49, idx0 + (endless ? 20 : 0)));
            return startNativeSpaceCadet(container, opts, idx0, endless, P);
            const GRAVX = P.grav;

            const { c, ctx, w, h, destroy } = MG.canvas(container, GW, GH);

            container.style.position = 'relative';
            container.style.overflow = 'hidden';

            // 台面、DMD 与计分板共用同一画布，缩放时始终保持为一体。
            let GC = ctx;

            let t = 0, over = false;

            /* ── 音效 ── */
            const AU = MG.audio;
            const CADET_SFX = {
                bumper: 'SOUND104.WAV', sling: 'SOUND105.WAV', flip: 'SOUND16.WAV',
                target: 'SOUND17.WAV', rollover: 'SOUND18.WAV', spinner: 'SOUND19.WAV',
                saucer: 'SOUND20.WAV', kick: 'SOUND21.WAV', ramp: 'SOUND22.WAV',
                drain: 'SOUND24.WAV', launch: 'SOUND25.WAV', charge: 'SOUND26.WAV',
                jet: 'SOUND27.WAV', jackpot: 'SOUND28.WAV', levelup: 'SOUND29.WAV',
                fail: 'SOUND30.WAV', click: 'SOUND34.WAV', coin: 'SOUND35.WAV',
            };
            const cadetSfx = {};
            const cadetVoices = new Set();
            const sfxLast = {};
            const sfxGap = { bumper: 0.08, sling: 0.07, flip: 0.06, click: 0.04, spinner: 0.12, rollover: 0.08 };
            const setCadetMuted = muted => cadetVoices.forEach(voice => { voice.muted = muted; });
            const sfx = n => {
                try {
                    if (AU.muted) return;
                    if (sfxGap[n] && t - (sfxLast[n] || -Infinity) < sfxGap[n]) return;
                    sfxLast[n] = t;
                    const file = CADET_SFX[n];
                    if (file && typeof Audio !== 'undefined') {
                        const source = cadetSfx[file] || (cadetSfx[file] = new Audio('/audio/pinball/' + file));
                        const voice = source.cloneNode();
                        voice.volume = 0.55;
                        cadetVoices.add(voice);
                        voice.addEventListener('ended', () => cadetVoices.delete(voice), { once: true });
                        voice.play().catch(() => { cadetVoices.delete(voice); try { AU.sfx(n); } catch (e) { } });
                        return;
                    }
                    AU.sfx(n);
                } catch (e) { }
            };
            let cadetMusicTimer = null;
            let cadetMusicToken = 0;
            const stopMusic = () => {
                cadetMusicToken++;
                if (cadetMusicTimer) { clearTimeout(cadetMusicTimer); cadetMusicTimer = null; }
                try { AU.bgm.stop(); } catch (e) { }
            };
            const CADET_PROGRAMS = {
                0: { type: 'triangle', lp: 2100 },
                5: { type: 'sine', lp: 2600 },
                11: { type: 'sine', lp: 3200 },
                28: { type: 'triangle', lp: 1900 },
                38: { type: 'sawtooth', lp: 1200 },
                83: { type: 'square', lp: 1800 },
            };
            const playCadetNote = (note, delay) => {
                const [,, pitch, velocity, channel, program] = note;
                const profile = CADET_PROGRAMS[program] || CADET_PROGRAMS[0];
                const gain = Math.min(0.075, 0.010 + velocity / 2400);
                if (channel === 9) {
                    AU.noise({ dur: 0.055, freq: pitch < 45 ? 150 : 1900, type: pitch < 45 ? 'lowpass' : 'highpass', gain, delay });
                    return;
                }
                AU.tone({
                    freq: 440 * Math.pow(2, (pitch - 69) / 12),
                    dur: Math.min(0.8, note[1] / 1000),
                    type: profile.type, lp: profile.lp, gain, delay,
                });
            };
            const startCadetMusic = () => {
                const token = ++cadetMusicToken;
                fetch('/data/pinball-cadet-music.json?v=1')
                    .then(response => response.ok ? response.json() : Promise.reject(new Error('MDS music unavailable')))
                    .then(data => {
                        if (token !== cadetMusicToken || !AU.ctx || !data.tracks || !data.tracks.length) return;
                        const track = data.tracks[Math.floor(Math.random() * data.tracks.length)];
                        let index = 0;
                        let cycleStart = AU.ctx.currentTime + 0.12;
                        const schedule = () => {
                            if (token !== cadetMusicToken || !AU.ctx) return;
                            const until = AU.ctx.currentTime + 0.25;
                            while (index < track.notes.length && cycleStart + track.notes[index][0] / 1000 < until) {
                                const note = track.notes[index++];
                                playCadetNote(note, Math.max(0, cycleStart + note[0] / 1000 - AU.ctx.currentTime));
                            }
                            if (index === track.notes.length) {
                                index = 0;
                                cycleStart += track.duration / 1000;
                            }
                            cadetMusicTimer = setTimeout(schedule, 45);
                        };
                        schedule();
                    })
                    .catch(() => { });
            };
            let audioOn = false;
            const startAudio = () => {
                if (audioOn) return;
                try { if (AU.unlock()) { startCadetMusic(); audioOn = true; } } catch (e) { }
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
            const bumperContact = [false, false, false];
            const jetContact = [false, false, false];
            const slingHit = [0, 0];
            const turboLit = [false, false, false];
            const jetLit = [false, false, false];
            const flash = { ramp: 0, spin: 0, saucer: 0, target: 0, warp: 0, tube: 0 };
            let targetFlashGroup = -1;

            /* ── 状态 ── */
            let score = 0, balls = endless ? Infinity : 3, launched = false;
            let ball = { x: LNCX, y: BALL_REST_Y, vx: 0, vy: 0 };
            const live = [ball];        // 台面上的球：live[0] 恒为主球（多球时长度 > 1）
            const trail = [];
            let mbCount = 0;
            let onRail = false, railU = 0, railSpeed = 0, railMode = RAIL.LAUNCH;
            let plunger = 0, plungerHold = false, chargeSfx = true;
            let combo = 0, comboT = 0, mult = 1;
            let saucerHold = 0;
            let warpHold = 0, warpLock = 0, warpSpin = 0, warpPull = 0, warpFlash = 0;
            let mbCd = 0;                     // 多球冷却
            let hyperStage = 0;              // 超空间阶段 0..5：每次虫洞跃迁 +1，满 5 触发超空间大赏
            let tiltWarn = 0;                // 倾斜警告灯 0..3：3 盏全亮 → TILT 失球
            let tiltActive = false;
            let nudgeCd = 0;                 // 推挤冷却，防连按刷满倾斜灯
            TARGETS.forEach(x => { x.down = false; });
            let toast = '', toastT = 0;
            const lanesOn = [false, false, false, false];
            const kickback = { L: true, R: true };
            const kickerHit = [0, 0];
            const reboundHit = [0, 0, 0, 0];
            const rollerHit = [0, 0, 0, 0];
            const gateHit = [0, 0];
            let spinnerAng = 0, spinnerVel = 0, spinnerAcc = 0;
            const cool = {};

            /* ── 卡球自救（防软锁）：主球长时间低速滞留挡板死角 → 周期轻推，仍卡则强制重发 ── */
            let stuckT = 0, stuckNudge = 0;

            const FL = { ...FLIP_L, ang: FLIP_L.rest, omega: 0, held: false };
            const FR = { ...FLIP_R, ang: FLIP_R.rest, omega: 0, held: false };

            const TABLE_OBJECTS = [
                ...BUMPERS.map((ref, i) => ({ id: 'bumper' + i, resource: 'a_bump' + (i + 1), kind: 'bumper', ref, shape: { type: 'circle', r: ref.r }, state: 'idle', timer: 0, frame: 0, frames: 8 })),
                ...JETS.map((ref, i) => ({ id: 'jet' + i, resource: 'a_bump' + (i + 5), kind: 'jet', ref, shape: { type: 'circle', r: ref.r }, state: 'idle', timer: 0, frame: 0, frames: 8 })),
                ...TARGETS.map((ref, i) => ({ id: 'target' + i, resource: 'a_targ' + (i + 1), kind: 'target', ref, shape: { type: 'segment', r: 3 }, state: 'ready', timer: 0, frame: 0, frames: 3 })),
                ...CADET_GATES.map((ref, i) => ({ id: 'gate' + i, resource: 'v_gate' + (i + 1), kind: 'gate', ref, shape: { type: 'segment', r: 2 }, state: 'closed', timer: 0, frame: 0, frames: 1 })),
                ...CADET_KICKERS.map((ref, i) => ({ id: 'kicker' + i, resource: 'a_kick' + (i + 1), kind: 'kicker', ref, shape: { type: 'circle', r: 7 }, state: 'idle', timer: 0, frame: 0, frames: 2 })),
                ...REBOUND.map((ref, i) => ({ id: 'rebound' + i, resource: 'v_rebo' + (i + 1), kind: 'rebound', ref, shape: { type: 'segment', r: 3 }, state: 'idle', timer: 0, frame: 0, frames: 2 })),
                ...CADET_ROLLERS.map((ref, i) => ({ id: 'roller' + i, kind: 'roller', ref, shape: { type: 'circle', r: 6 }, state: 'idle', timer: 0, frame: 0, frames: ref.length })),
                ...Object.keys(CADET_LIGHT_GROUPS).map(id => ({ id: 'light:' + id, kind: 'light-group', ref: CADET_LIGHT_GROUPS[id], shape: { type: 'group' }, state: 'off', timer: 0, frame: 0, frames: 1 })),
                { id: 'flipperL', kind: 'flipper', ref: FL, shape: { type: 'capsule', r: 8 }, state: 'rest', timer: 0, frame: 0, frames: 8 },
                { id: 'flipperR', kind: 'flipper', ref: FR, shape: { type: 'capsule', r: 8 }, state: 'rest', timer: 0, frame: 0, frames: 8 },
            ];
            const TABLE_OBJECT_BY_ID = Object.fromEntries(TABLE_OBJECTS.map(object => [object.id, object]));
            const setTableObjectState = (id, state, duration) => {
                const object = TABLE_OBJECT_BY_ID[id];
                if (!object) return;
                object.state = state;
                object.timer = duration || 0;
                object.frame = state === 'hit' ? 1 : 0;
            };
            const pulseTableObject = (id, duration) => setTableObjectState(id, 'hit', duration || 0.5);
            const pulseCadetLightGroup = (id, duration) => pulseTableObject('light:' + id, duration || 0.42);
            const updateTableObjects = dt => TABLE_OBJECTS.forEach(object => {
                if (object.timer <= 0) return;
                object.timer = Math.max(0, object.timer - dt);
                if (object.timer <= 0) {
                    object.state = object.kind === 'gate' ? 'closed' : object.kind === 'target' ? 'ready' : object.kind === 'light-group' ? 'off' : 'idle';
                    object.frame = 0;
                    return;
                }
                object.frame = Math.min(object.frames - 1, 1 + Math.floor((1 - object.timer / 0.5) * (object.frames - 1)));
            });

            const show = (s, d) => { toast = s; toastT = d || 1.4; };
            const addScore = n => {
                score += Math.round(n * mult);
            };
            // 多球：额外球自计分洞喷出；主球漏掉时其余球顶上，不算失球
            // 防球海三保险：台面球数封顶(4) / 自动触发 8s 冷却 / 新球 1.2s 保护期
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

                    // 星球 + 星环（蓝色行星，原版台面标志性的行星丝印）
                    g.globalAlpha = 0.4;
                    const plx = 246, ply = 268, plr = 44;
                    const pg = g.createRadialGradient(plx - plr * 0.35, ply - plr * 0.4, plr * 0.1, plx, ply, plr);
                    pg.addColorStop(0, '#bfe6ff'); pg.addColorStop(0.55, '#4f9bdc');
                    pg.addColorStop(0.85, '#1c5288'); pg.addColorStop(1, '#0c2342');
                    g.fillStyle = pg; g.beginPath(); g.arc(plx, ply, plr, 0, Math.PI * 2); g.fill();
                    g.save(); g.translate(plx, ply); g.rotate(-0.34); g.scale(1, 0.26);
                    g.strokeStyle = 'rgba(190,225,255,0.40)'; g.lineWidth = 7;
                    g.beginPath(); g.arc(0, 0, plr * 1.55, 0, Math.PI * 2); g.stroke();
                    g.strokeStyle = 'rgba(150,200,255,0.28)'; g.lineWidth = 3;
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
                const isNudge = k === 'n' || k === 'N' || c === 'KeyN';
                if (isLeft) { FL.held = true; e.preventDefault(); }
                if (isRight) { FR.held = true; e.preventDefault(); }
                if (isDown) {
                    if (!launched) { plungerHold = true; startAudio(); }
                    e.preventDefault();
                }
                if (isMute) { try { setCadetMuted(AU.toggleMuted()); } catch (err) { } }
                if (isNudge) { doNudge(); e.preventDefault(); }
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
                    if (x > GW - 36 && y < 36) { try { setCadetMuted(AU.toggleMuted()); } catch (err) { } return; }
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
                if (vn >= 0) return 0;
                b.__contactHits = (b.__contactHits || 0) + 1;
                if (vn < 0) { b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny; }
                if (kick && vn < 0) { b.vx += nx * kick; b.vy += ny * kick; }
                return -Math.min(0, vn);
            }

            function touchCircle(b, cx, cy, cr, rest, kick) {
                const touch = Math.hypot(b.x - cx, b.y - cy) < BALL_R + cr;
                return { touch, impact: hitCircle(b, cx, cy, cr, rest, kick) };
            }

            function confineBall(b) {
                const left = PF.l + BALL_R, right = LANE.r - BALL_R;
                const top = PF.cy - PF.arcR + BALL_R;
                if (b.x < left) { b.x = left; if (b.vx < 0) b.vx = -b.vx * 0.42; }
                if (b.x > right) { b.x = right; if (b.vx > 0) b.vx = -b.vx * 0.42; }
                if (b.y < top) { b.y = top; if (b.vy < 0) b.vy = -b.vy * 0.42; }
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
                if (vn >= 0) return 0;
                b.__contactHits = (b.__contactHits || 0) + 1;
                if (vn < 0) {
                    b.vx -= (1 + rest) * vn * nx;
                    b.vy -= (1 + rest) * vn * ny;
                    const tx = -ny, ty = nx;
                    const vt = b.vx * tx + b.vy * ty;
                    b.vx -= vt * 0.06 * tx; b.vy -= vt * 0.06 * ty;
                }
                if (kick && vn < 0) { b.vx += nx * kick; b.vy += ny * kick; }
                return -Math.min(0, vn);
            }

            function sweepStaticCollision(b, x0, y0, x1, y1) {
                const distance = Math.hypot(x1 - x0, y1 - y0);
                const samples = Math.max(1, Math.ceil(distance / (BALL_R * 0.45)));
                for (let i = 1; i <= samples; i++) {
                    const u = i / samples;
                    b.x = x0 + (x1 - x0) * u;
                    b.y = y0 + (y1 - y0) * u;
                    for (const wall of WALLS) {
                        if (hitSeg(b, wall, 0.42, 0) > 0) return true;
                    }
                }
                b.x = x1;
                b.y = y1;
                return false;
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
                if (f.held && f.omega && vn > -120) {
                    const kick = Math.min(760, 180 + Math.abs(f.omega) * 26);
                    b.vx += nx * kick; b.vy += ny * kick;
                    if (b.vy > -260) b.vy -= 260;
                }
                return true;
            }

            function canTrigger(key, sec) {
                if (cool[key] && t - cool[key] < sec) return false;
                cool[key] = t; return true;
            }

            function collide() {
                for (const s of WALLS) hitSeg(ball, s, 0.42, 0);
                CADET_GATES.forEach((gate, i) => {
                    if (gateHit[i] > 0.02) return;
                    const impact = hitSeg(ball, {
                        x1: gate.x, y1: gate.y,
                        x2: gate.x + gate.w * CADET_SCALE,
                        y2: gate.y + gate.h * CADET_SCALE,
                        r: 2,
                    }, 0.5, 45);
                    if (impact > 45 && canTrigger('gate' + i, 0.18)) {
                        gateHit[i] = 1;
                        pulseTableObject('gate' + i, 0.32);
                        addScore(125, 'spin'); sfx('click');
                    }
                });
                for (const p of POSTS) {
                    if (hitCircle(ball, p.x, p.y, p.r, 0.62, 90) > 60) {
                        sfx('click'); spawn(p.x, p.y, 3, 200, 0.5);
                    }
                }
                REBOUND.forEach((rp, i) => {
                    const source = CADET_REBOUNDERS[i];
                    const surface = source.surface;
                    const impact = surface
                        ? hitSeg(ball, {
                            x1: cadetX(surface[0]), y1: cadetY(surface[1]),
                            x2: cadetX(surface[2]), y2: cadetY(surface[3]), r: 3,
                        }, 0.72, 360)
                        : hitCircle(ball, rp.x, rp.y, 7, 0.6, 360);
                    if (impact > 0) {
                        reboundHit[i] = 1;
                        pulseTableObject('rebound' + i, 0.28);
                        sfx('sling');
                    }
                });
                BUMPERS.forEach((bp, i) => {
                    const hit = touchCircle(ball, bp.x, bp.y, bp.r, 0.55, 520);
                    if (hit.touch) bumps[i] = 1;
                    if (hit.touch && !bumperContact[i] && canTrigger('bumper' + i, 0.12)) {
                        bumps[i] = 1;
                        pulseTableObject('bumper' + i, 0.5);
                        pulseCadetLightGroup('bumper_target_lights');
                        pulseCadetLightGroup('bmpr_inc_lights');
                        turboLit[i] = true;
                        addScore(120, 'bumper'); combo++; comboT = 2.2;
                        sfx('bumper'); spawn(bp.x, bp.y, 12, bp.hue, 1.1);
                        shake = Math.max(shake, 0.09); shakeMag = Math.max(shakeMag, 2.2);
                        if (turboLit.every(Boolean)) {
                            addScore(1500, 'bumper'); show('涡轮引擎全亮 +1,500', 1.4); sfx('jackpot');
                            turboLit.fill(false);
                        }
                    }
                    bumperContact[i] = hit.touch;
                });
                // 左侧涡轮引擎：命中即喷射加速（比顶部引擎更“推”，负责把球送回上半场）
                JETS.forEach((jt, i) => {
                    const hit = touchCircle(ball, jt.x, jt.y, jt.r, 0.58, 470);
                    if (hit.touch) jets[i] = 1;
                    if (hit.touch && !jetContact[i] && canTrigger('jet' + i, 0.12)) {
                        jets[i] = 1;
                        pulseTableObject('jet' + i, 0.5);
                        pulseCadetLightGroup('ramp_bmpr_inc_lights');
                        jetLit[i] = true;
                        addScore(150, 'jet'); combo++; comboT = 2.2;
                        sfx('jet');
                        spawn(jt.x, jt.y, 13, jt.hue, 1.15);
                        // 喷流：沿球离开方向甩出尾焰
                        const a = Math.atan2(ball.y - jt.y, ball.x - jt.x);
                        spawn(jt.x + Math.cos(a) * jt.r, jt.y + Math.sin(a) * jt.r, 5, jt.hue, 1.5, a);
                        shake = Math.max(shake, 0.08); shakeMag = Math.max(shakeMag, 2);
                        if (jetLit.every(Boolean)) {
                            addScore(1800, 'jet'); show('左路引擎全亮 +1,800', 1.4); sfx('jackpot');
                            jetLit.fill(false);
                        }
                    }
                    jetContact[i] = hit.touch;
                });
                CADET_KICKERS.forEach((kb, i) => {
                    const hit = touchCircle(ball, kb.x, kb.y, 7, 0.6, 0);
                    const side = i ? 'R' : 'L';
                    if (hit.touch && kickback[side] && canTrigger('kickback' + i, 0.18)) {
                        kickback[side] = false;
                        kickerHit[i] = 1;
                        pulseTableObject('kicker' + i, 0.24);
                        ball.vy = Math.min(ball.vy, -1050);
                        ball.vx += kb.vx;
                        addScore(500, 'kick'); combo++; comboT = 2.2;
                        sfx('kick'); show('KICKBACK 救球 +500', 1.3);
                        spawn(kb.x, kb.y, 14, 190, 1.1, -Math.PI / 2);
                    }
                });
                SLINGS.forEach((sl, si) => {
                    const v = hitSeg(ball, { x1: sl.a[0], y1: sl.a[1], x2: sl.b[0], y2: sl.b[1], r: 3 }, 0.5, 430);
                    if (v > 0) {
                        slingHit[si] = 1;
                        if (canTrigger('sling' + si, 0.12)) {
                            addScore(60); sfx('sling');
                            spawn((sl.a[0] + sl.b[0]) / 2, (sl.a[1] + sl.b[1]) / 2, 9, 30, 1);
                        }
                    } else {
                        const sideHit = hitSeg(ball, { x1: sl.b[0], y1: sl.b[1], x2: sl.c[0], y2: sl.c[1], r: 3 }, 0.4, 80);
                        const baseHit = hitSeg(ball, { x1: sl.c[0], y1: sl.c[1], x2: sl.a[0], y2: sl.a[1], r: 3 }, 0.4, 80);
                        if ((sideHit > 0 || baseHit > 0) && canTrigger('sling' + si, 0.12)) {
                            slingHit[si] = 0.75;
                            addScore(60); sfx('sling');
                        }
                    }
                });
                TARGETS.forEach(tg => {
                    if (tg.down) return;
                    const v = hitSeg(ball, {
                        x1: tg.x, y1: tg.y - tg.h / 2, x2: tg.x, y2: tg.y + tg.h / 2, r: 3,
                    }, 0.35, 60);
                    if (v > 90) {
                        tg.down = true; setTableObjectState('target' + tg.i, 'down'); addScore(600, 'target'); combo++; comboT = 2.2;
                        pulseCadetLightGroup(tg.group === 0 ? 'right_target_lights' : tg.group === 1 ? 'top_target_lights' : 'top_circle_tgt_lights');
                            flash.target = 1; targetFlashGroup = tg.group; sfx('target');
                        spawn(tg.x - 4, tg.y, 12, 40, 1.1, Math.PI);
                        shake = Math.max(shake, 0.08); shakeMag = Math.max(shakeMag, 2);
                        if (TARGETS.filter(x => x.group === tg.group).every(x => x.down)) {
                            addScore(4000); show('靶组全清 +4,000', 1.6); sfx('jackpot');
                            shake = Math.max(shake, 0.3); shakeMag = Math.max(shakeMag, 6);
                            setTimeout(() => TARGETS.filter(x => x.group === tg.group).forEach(x => {
                                x.down = false;
                                setTableObjectState('target' + x.i, 'ready');
                            }), 900);
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
                            lanesOn[i] = true; rollerHit[i] = 1; pulseTableObject('roller' + i, 0.5); addScore(350, 'lane'); sfx('rollover');
                            spawn(ln.x, ln.y, 8, 55, 0.8);
                            if (lanesOn.every(Boolean)) {
                                if (mult < 9) {
                                    mult++; show(`倍率提升 ×${mult}`, 1.6); sfx('levelup');
                                    if (mult > 5) addScore((mult - 5) * 4000);  // 高阶倍率递进额外奖励
                                } else { addScore(20000); show('MAX 倍率奖励 +20,000', 1.6); sfx('jackpot'); }
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
                    pulseCadetLightGroup('ramp_tgt_lights');
                    addScore(1800, 'ramp'); combo++; comboT = 2.2; sfx('ramp'); flash.ramp = 1;
                    show('坡道达成 +1,800', 1.2);
                }
                // 计分洞（仅主球：额外球入洞曾把冻结逻辑错套到主球上，造成"传送/多球"错觉）
                if (!saucerHold && ball === live[0] &&
                    Math.hypot(ball.x - SAUCER.x, ball.y - SAUCER.y) < SAUCER.r - 3 &&
                    Math.hypot(ball.vx, ball.vy) < 1500) {
                    saucerHold = 1.15; ball.vx = ball.vy = 0;
                    pulseCadetLightGroup('bsink_arrow_lights');
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
                    pulseCadetLightGroup('worm_hole_lights');
                    ball.vx = ball.vy = 0;
                    hyperStage = Math.min(5, hyperStage + 1);          // 超空间阶段递进
                    addScore(3000 + (hyperStage - 1) * 2000, 'warp'); combo++; comboT = 2.2;
                    sfx('saucer');
                    if (hyperStage >= 5) {
                        addScore(50000); show('超空间跃迁达成！+50,000', 2); sfx('jackpot');
                        hyperStage = 0;
                    } else {
                        show('虫洞吸入 · 超空间 ' + hyperStage + '/5', 1.6);
                    }
                    shake = Math.max(shake, 0.24); shakeMag = Math.max(shakeMag, 5);
                    spawn(WARP.x, WARP.y, 20, 275, 1.2);
                }
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
                hyperStage = 0; tiltWarn = 0;
                for (let i = 0; i < lanesOn.length; i++) lanesOn[i] = false;
                TARGETS.forEach(x => x.down = false);
                TARGETS.forEach(x => setTableObjectState('target' + x.i, 'ready'));
                turboLit.fill(false); jetLit.fill(false);
                bumperContact.fill(false); jetContact.fill(false);
                slingHit.fill(0);
                kickerHit.fill(0);
                reboundHit.fill(0);
                rollerHit.fill(0);
                gateHit.fill(0);
                if (balls === Infinity) { resetBall(); return; }
                balls--;
                if (balls <= 0) { finish(score >= P.goal); return; }
                resetBall();
            }
            function resetBall() {
                launched = false; onRail = false; plunger = 0; plungerHold = false; tiltActive = false;
                ball = { x: LNCX, y: BALL_REST_Y, vx: 0, vy: 0 };
                live.length = 0; live.push(ball);   // 失球/换球后回到单球状态
                trail.length = 0;
                kickback.L = kickback.R = true;
            }
            // 推挤：轻微扰动主球；累计倾斜警告，满 3 → TILT 失球惩罚
            function doNudge() {
                if (over || tiltActive || !launched || onRail || warpHold > 0 || live.length === 0) return;
                if (nudgeCd > 0) return;
                nudgeCd = 1.2;
                const b = live[0];
                b.vx += (Math.random() - 0.5) * 180; b.vy -= 60 + Math.random() * 80;
                tiltWarn++;
                sfx('click');
                if (tiltWarn >= 3) {
                    show('TILT！倾斜出局', 2); sfx('fail');
                    tiltActive = true;
                    FL.held = FR.held = false;
                    tiltWarn = 0;
                    loseBall();
                } else {
                    show('WARN ' + tiltWarn + '/3', 1);
                }
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
                stopMusic();
                sfx(win ? 'levelup' : 'fail');
                const stars = win ? (balls >= 3 ? 3 : balls >= 2 ? 2 : 1) : 0;
                opts.onComplete && opts.onComplete({
                    win, stars,
                    score: score + (win ? 1000 : 0),
                    title: endless ? '🏅 无尽挑战结束' : (win ? '🏆 任务达成！' : '💥 球已用完'),
                    lines: [
                        `得分 ${score.toLocaleString()}${endless ? '' : ' / 目标 ' + P.goal.toLocaleString()}`,
                        `最高连击 ×${combo} · 倍率 ×${mult}`,
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
                    // 原版蓄力时只有活塞下压，球保持在发射巷球位，避免穿入弹簧贴图。
                    ball.y = BALL_REST_Y;
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
                // Keep a ball from crossing more than one collision radius per substep,
                // including a speed boost applied halfway through this frame.
                const subSteps = Math.max(SUB, Math.ceil(SPEED_CAP * dt / BALL_R));
                const hd = dt / subSteps;
                live.forEach(b => { b.__contactHits = 0; });
                for (let i = 0; i < subSteps; i++) {
                    for (let bi = 0; bi < live.length; bi++) {
                        const b = live[bi];
                        if (bi === 0 && (mainFrozen || onRailNow)) continue;
                        ball = b;
                        b.vy += GRAV * GRAVX * hd;
                        const sp2 = b.vx * b.vx + b.vy * b.vy;
                        if (sp2 > SPEED_CAP * SPEED_CAP) {
                            const k = SPEED_CAP / Math.sqrt(sp2);
                            b.vx *= k; b.vy *= k;
                        }
                        const x0 = b.x, y0 = b.y;
                        const x1 = x0 + b.vx * hd, y1 = y0 + b.vy * hd;
                        sweepStaticCollision(b, x0, y0, x1, y1);
                        collide();
                        confineBall(b);
                    }
                }
                live.forEach(b => {
                    if ((b.__contactHits || 0) < 24) return;
                    const dir = b.x < PF.cx ? 1 : -1;
                    b.vx += dir * 180;
                    b.vy = Math.min(b.vy, -240);
                    b.__contactHits = 0;
                });
                // 引力井（中央轻微吸引，模拟原版引力井；主球冻结/在轨时跳过）
                for (let bi = 0; bi < live.length; bi++) {
                    const b = live[bi];
                    if (bi === 0 && (mainFrozen || onRailNow)) continue;
                    const dxw = SAUCER.x - b.x, dyw = SAUCER.y - b.y, dw = Math.hypot(dxw, dyw);
                    if (dw < 72 && dw > 6) { const f = 240 / dw; b.vx += dxw * f * hd; b.vy += dyw * f * hd; }
                }
                const drag = 1 - 0.22 * dt;
                for (let bi = 0; bi < live.length; bi++) {
                    live[bi].vx *= drag; live[bi].vy *= drag;
                    if (live[bi].grace > 0) live[bi].grace -= dt;   // 新球保护期倒计时
                }
                ball = live[0] || ball;              // 复原：ball 恒为主球引用
                // 旋转门
                spinnerAng += spinnerVel * dt;
                spinnerVel *= (1 - 1.6 * dt);
                spinnerAcc += Math.abs(spinnerVel) * dt;
                if (spinnerAcc > Math.PI * 2) { spinnerAcc -= Math.PI * 2; addScore(250, 'spin'); }

                if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }

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
                if (GC.roundRect) { GC.beginPath(); GC.roundRect(x, y, ww, hh, r); return; }
                GC.beginPath();
                GC.moveTo(x + r, y); GC.arcTo(x + ww, y, x + ww, y + hh, r);
                GC.arcTo(x + ww, y + hh, x, y + hh, r); GC.arcTo(x, y + hh, x, y, r);
                GC.arcTo(x, y, x + ww, y, r); GC.closePath();
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
                GC.save();
                GC.font = `bold ${size}px "Consolas","Courier New",monospace`;
                GC.textAlign = align || 'left'; GC.textBaseline = 'middle';
                GC.shadowColor = color; GC.shadowBlur = size * 0.6;
                GC.fillStyle = color; GC.fillText(text, x, y);
                GC.shadowBlur = size * 0.2; GC.fillText(text, x, y);
                GC.restore();
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

                const y3 = DMD.y + 70;
                const progress = Math.min(1, score / Math.max(1, P.goal));
                dmdText('第 ' + (idx0 + 1) + '/50 关 · 目标分数', DMD.x + 10, y3, 11, '#ff8a3d', 'left');
                dmdText(Math.round(score) + '/' + P.goal, DMD.x + DMD.w - 10, y3, 11, '#ffd56b', 'right');
                ctx.fillStyle = 'rgba(255,140,60,0.20)';
                ctx.fillRect(DMD.x + 10, y3 + 5, DMD.w - 20, 4);
                ctx.fillStyle = '#ff9a2e';
                ctx.fillRect(DMD.x + 10, y3 + 5, (DMD.w - 20) * progress, 4);
                // 亮后轻打点阵（让数字也带颗粒感，但不破坏可读性）
                dmdDots(4, 1.0, 0.30);
            }

            function drawEmblem() {
                const ex = SAUCER.x, ey = SAUCER.y, R = 56;
                ctx.save();
                // 外发光
                const gg = ctx.createRadialGradient(ex, ey, 8, ex, ey, R + 38);
                gg.addColorStop(0, 'rgba(255,205,130,0.16)');
                gg.addColorStop(0.55, 'rgba(230,150,70,0.05)');
                gg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = gg;
                ctx.beginPath(); ctx.arc(ex, ey, R + 38, 0, Math.PI * 2); ctx.fill();

                // 部署灯环（原版：一圈黄灯绕中央，走马点亮）
                for (let i = 0; i < 16; i++) {
                    const a = i / 16 * Math.PI * 2 - Math.PI / 2;
                    const lx = ex + Math.cos(a) * (R + 13), ly = ey + Math.sin(a) * (R + 13);
                    const on = (Math.floor(t * 5) + i) % 4 !== 0;
                    ctx.fillStyle = on ? 'rgba(255,214,80,0.95)' : 'rgba(120,85,20,0.5)';
                    if (on) { ctx.shadowColor = '#ffd45a'; ctx.shadowBlur = 6; }
                    ctx.beginPath(); ctx.arc(lx, ly, 2.8, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                }

                // 黄铜外环
                ctx.lineWidth = 7;
                const br = ctx.createLinearGradient(ex - R, ey - R, ex + R, ey + R);
                br.addColorStop(0, '#ffe9a8'); br.addColorStop(0.5, '#c79a4d'); br.addColorStop(1, '#7a5512');
                ctx.strokeStyle = br;
                ctx.beginPath(); ctx.arc(ex, ey, R, 0, Math.PI * 2); ctx.stroke();
                ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                ctx.beginPath(); ctx.arc(ex, ey, R - 4, 0, Math.PI * 2); ctx.stroke();

                // 内侧深色徽底（裁剪）
                ctx.save();
                ctx.beginPath(); ctx.arc(ex, ey, R - 7, 0, Math.PI * 2); ctx.clip();
                const disc = ctx.createRadialGradient(ex, ey - 14, 4, ex, ey, R);
                disc.addColorStop(0, '#1b2a52'); disc.addColorStop(0.6, '#0e1730'); disc.addColorStop(1, '#05080f');
                ctx.fillStyle = disc;
                ctx.beginPath(); ctx.arc(ex, ey, R, 0, Math.PI * 2); ctx.fill();

                // 背景小星
                for (let i = 0; i < 18; i++) {
                    const a = i / 18 * Math.PI * 2 + t * 0.05;
                    const rr2 = R - 16 - (i % 3) * 4;
                    const sx = ex + Math.cos(a) * rr2 * 0.82, sy = ey + Math.sin(a) * rr2 * 0.72;
                    ctx.fillStyle = `rgba(255,240,210,${0.25 + (i % 3) * 0.2})`;
                    ctx.beginPath(); ctx.arc(sx, sy, 0.9, 0, Math.PI * 2); ctx.fill();
                }

                // 蓝色行星 + 星环（徽底上方装饰，露在计分洞上方）
                const pgx = ex, pgy = ey - 30, pgr = 18;
                const pg = ctx.createRadialGradient(pgx - 6, pgy - 7, 2, pgx, pgy, pgr);
                pg.addColorStop(0, '#aee0ff'); pg.addColorStop(0.5, '#3f8fd6'); pg.addColorStop(1, '#123a66');
                ctx.fillStyle = pg;
                ctx.beginPath(); ctx.arc(pgx, pgy, pgr, 0, Math.PI * 2); ctx.fill();
                ctx.save(); ctx.translate(pgx, pgy); ctx.rotate(-0.5); ctx.scale(1, 0.32);
                ctx.strokeStyle = 'rgba(180,220,255,0.5)'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(0, 0, pgr * 1.7, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();

                // 军校生小火箭（徽底下方，露在计分洞下方）
                ctx.save();
                ctx.translate(ex, ey + 30);
                const fl = 0.6 + 0.4 * Math.sin(t * 12);
                const fg = ctx.createLinearGradient(0, 12, 0, 26);
                fg.addColorStop(0, `rgba(255,180,60,${0.85 * fl})`); fg.addColorStop(1, 'rgba(255,70,30,0)');
                ctx.fillStyle = fg;
                ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(5, 12); ctx.lineTo(0, 26); ctx.closePath(); ctx.fill();
                const body = ctx.createLinearGradient(-10, 0, 10, 0);
                body.addColorStop(0, '#cdd6e6'); body.addColorStop(0.5, '#ffffff'); body.addColorStop(1, '#8a96ad');
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(0, 0, 9, 16, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#3a4256'; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = '#d8484f';
                ctx.beginPath(); ctx.moveTo(-7, -10); ctx.lineTo(7, -10); ctx.lineTo(0, -20); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(-9, 6); ctx.lineTo(-13, 16); ctx.lineTo(-7, 12); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(9, 6); ctx.lineTo(13, 16); ctx.lineTo(7, 12); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#8ad4f0';
                ctx.beginPath(); ctx.arc(0, -4, 6, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#d8e8f4'; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = '#f0c060';
                ctx.beginPath(); ctx.arc(0, -4, 3.4, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // 弧形文字（上 SPACE CADET · 下 TOWER ODYSSEY）
                ctx.fillStyle = 'rgba(255,225,160,0.85)';
                ctx.font = 'bold 9px "Segoe UI",sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const top = 'SPACE CADET', bot = 'TOWER ODYSSEY';
                for (let i = 0; i < top.length; i++) {
                    const a = Math.PI * 1.20 + i / (top.length - 1) * Math.PI * 0.60;
                    ctx.save(); ctx.translate(ex + Math.cos(a) * (R - 15), ey + Math.sin(a) * (R - 15));
                    ctx.rotate(a + Math.PI / 2); ctx.fillText(top[i], 0, 0); ctx.restore();
                }
                ctx.fillStyle = 'rgba(200,225,255,0.7)';
                for (let i = 0; i < bot.length; i++) {
                    const a = Math.PI * 0.20 + i / (bot.length - 1) * Math.PI * 0.60;
                    ctx.save(); ctx.translate(ex + Math.cos(a) * (R - 15), ey + Math.sin(a) * (R - 15));
                    ctx.rotate(a - Math.PI / 2); ctx.fillText(bot[i], 0, 0); ctx.restore();
                }
                ctx.restore();

                ctx.restore();
            }

            function drawPlayfield() {
                if (BG) ctx.drawImage(BG, 0, 0, GW, GH);
                else { ctx.fillStyle = '#0a1028'; ctx.fillRect(0, 88, GW, GH - 88); }
                if (CADET_TABLE.complete && CADET_TABLE.naturalWidth) {
                    const tableW = LANE.r - PF.l;
                    const tableH = CADET_TABLE.naturalHeight * tableW / CADET_TABLE.naturalWidth;
                    ctx.drawImage(CADET_TABLE, PF.l, 140, tableW, tableH);
                    return;
                }

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

            function drawCadetSprite(image, x, y) {
                if (!image.complete || !image.naturalWidth) return;
                ctx.drawImage(image, cadetX(x), cadetY(y), image.naturalWidth * CADET_SCALE, image.naturalHeight * CADET_SCALE);
            }

            function drawCadetBumpers() {
                CADET_BUMPERS.forEach((bumper, index) => {
                    const hit = index < 3 ? bumps[index] : jets[index - 3];
                    const object = TABLE_OBJECT_BY_ID[index < 3 ? 'bumper' + index : 'jet' + (index - 3)];
                    const frame = object && object.state === 'hit'
                        ? Math.min(7, Math.max(1, object.frame))
                        : hit > 0 ? 1 + (Math.floor((1 - hit) * 18) % 7) : 0;
                    const pos = bumper.pos[frame & 1];
                    drawCadetSprite(bumper.frames[frame], pos[0], pos[1]);
                });
            }

            function drawCadetFlipper(f) {
                const side = f.cadetSide;
                const travel = Math.abs((f.ang - f.rest) / (f.up - f.rest));
                const frame = clamp(Math.round(travel * 7), 0, 7);
                const pos = CADET_FLIPPER_POSITIONS[side][frame];
                drawCadetSprite(CADET_FLIPPERS[side][frame], pos[0], pos[1]);
            }

            function drawCadetPlunger() {
                if (!CADET_PLUNGER.complete || !CADET_PLUNGER.naturalWidth) return;
                const pull = !launched ? plunger * PLG_PULL : 0;
                ctx.drawImage(
                    CADET_PLUNGER,
                    cadetX(CADET_PLUNGER_ORIGIN.x), PLG_TOP + pull,
                    CADET_PLUNGER.naturalWidth * CADET_SCALE, CADET_PLUNGER.naturalHeight * CADET_SCALE,
                );
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

            /* ── 顶部 pop-bumper（经典弹球缓冲器：铬环 + 霓虹色环 + 圆顶 + 中心灯，绝非蘑菇）── */
            function drawPopBumper(x, y, r, hue, hit, ph) {
                ctx.save();
                // 命中光晕
                if (hit > 0.02) {
                    const gr = r + 6 + hit * 22;
                    const gg = ctx.createRadialGradient(x, y, r * 0.5, x, y, gr);
                    gg.addColorStop(0, `hsla(${hue},100%,72%,${hit * 0.5})`);
                    gg.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = gg;
                    ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
                }
                // 落影
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.beginPath(); ctx.ellipse(x, y + r * 0.62, r + 5, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
                // 金属底座
                const base = ctx.createLinearGradient(x, y - r, x, y + r);
                base.addColorStop(0, '#2b3142'); base.addColorStop(1, '#0e1220');
                ctx.fillStyle = base;
                ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.fill();
                // 铬外环
                const rim = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
                rim.addColorStop(0, '#f2f5fb'); rim.addColorStop(0.5, '#9aa6bf'); rim.addColorStop(1, '#525c75');
                ctx.strokeStyle = rim; ctx.lineWidth = 2.6;
                ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
                // 霓虹色环（命中发光）
                ctx.strokeStyle = `hsl(${hue},90%,${56 + hit * 16}%)`;
                ctx.lineWidth = 3.4;
                if (hit > 0.05) { ctx.shadowColor = `hsl(${hue},95%,60%)`; ctx.shadowBlur = 8 + hit * 10; }
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
                ctx.shadowBlur = 0;
                // 内暗环
                ctx.fillStyle = '#0a0e18';
                ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
                // 圆顶（色相径向渐变，立体而非平面）
                const dome = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 0.82);
                dome.addColorStop(0, `hsl(${hue},85%,${84 + hit * 8}%)`);
                dome.addColorStop(0.5, `hsl(${hue},80%,${58 + hit * 6}%)`);
                dome.addColorStop(1, `hsl(${hue},72%,36%)`);
                ctx.fillStyle = dome;
                ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
                // 顶部柔和高光弧（非整片椭圆，避免蘑菇盖感）
                ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 2.2;
                ctx.beginPath(); ctx.arc(x - r * 0.12, y - r * 0.18, r * 0.5, -2.4, -0.7); ctx.stroke();
                // 中心灯
                const cg = ctx.createRadialGradient(x, y - 1, 0.5, x, y, r * 0.34);
                cg.addColorStop(0, '#ffffff');
                cg.addColorStop(0.5, `hsl(${hue},95%,${74 + hit * 16}%)`);
                cg.addColorStop(1, `hsla(${hue},90%,40%,0.92)`);
                ctx.fillStyle = cg;
                ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
                // 底座走马小灯
                for (let i = 0; i < 8; i++) {
                    const a = i / 8 * Math.PI * 2 + ph * 0.25;
                    const lx = x + Math.cos(a) * (r + 5), ly = y + Math.sin(a) * (r + 5);
                    const on = (Math.floor(t * 5) + i) % 4 !== 0;
                    ctx.fillStyle = on ? `hsl(${hue},95%,${62 + hit * 18}%)` : 'rgba(40,30,20,0.5)';
                    if (on) { ctx.shadowColor = `hsl(${hue},95%,65%)`; ctx.shadowBlur = 4; }
                    ctx.beginPath(); ctx.arc(lx, ly, 1.5, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                }
                // 命中冲击环
                if (hit > 0.02) {
                    ctx.strokeStyle = `hsla(${hue},100%,80%,${hit})`;
                    ctx.lineWidth = 2 + hit * 3;
                    ctx.beginPath(); ctx.arc(x, y, r + (1 - hit) * 22, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.restore();
            }

            function drawBumpers() {
                BUMPERS.forEach((bp, i) =>
                    drawPopBumper(bp.x, bp.y, bp.r, bp.hue, bumps[i], t * (2.3 + i * 0.7) + i * 1.3));
            }
            function drawJets() {
                JETS.forEach((jt, i) =>
                    drawTurbine(jt.x, jt.y, jt.r, jt.hue, jets[i], -t * (2.6 + i * 0.5) + i * 1.7));
            }

            /* ── 左上角第 7 只引擎：涡轮虫洞（吸入 → 送进左侧火箭管道）── */
            function drawTiltLights() {
                const tx = 176, ty = 624;
                for (let i = 0; i < 3; i++) {
                    const lx = tx - 16 + i * 16;
                    ctx.beginPath(); ctx.arc(lx, ty, 3.2, 0, Math.PI * 2);
                    if (i < tiltWarn) {
                        ctx.fillStyle = tiltWarn >= 2 ? '#ff4a3d' : '#ffb84d';
                        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
                    } else { ctx.fillStyle = 'rgba(90,60,40,0.5)'; ctx.shadowBlur = 0; }
                    ctx.fill(); ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                }
            }
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
                // 超空间 5 阶段灯（环绕虫洞，点亮数 = 当前阶段）
                for (let i = 0; i < 5; i++) {
                    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
                    const lx = x + Math.cos(a) * (r + 24), ly = y + Math.sin(a) * (r + 24);
                    ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI * 2);
                    if (i < hyperStage) { ctx.fillStyle = '#c79bff'; ctx.shadowColor = '#c79bff'; ctx.shadowBlur = 6; }
                    else { ctx.fillStyle = 'rgba(90,70,120,0.5)'; ctx.shadowBlur = 0; }
                    ctx.fill(); ctx.shadowBlur = 0;
                }
                ctx.restore();
            }

            /* ── 左侧火箭发射管道（铬合金 habitrail + 蓝焰能量口）── */
            function drawTubeLeft() {
                const P = TUBE_PATH.pts;
                ctx.save();
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(P[0][0], P[0][1]);
                for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
                // 底座深色
                ctx.lineWidth = 18; ctx.strokeStyle = 'rgba(6,10,20,0.9)'; ctx.stroke();
                // 铬金属管身
                const g = ctx.createLinearGradient(28, 200, 60, 560);
                g.addColorStop(0, 'rgba(224,232,244,0.62)');
                g.addColorStop(0.5, 'rgba(150,165,190,0.42)');
                g.addColorStop(1, 'rgba(96,110,135,0.55)');
                ctx.lineWidth = 13; ctx.strokeStyle = g; ctx.stroke();
                // 高光细线
                ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${0.5 + flash.tube * 0.4})`; ctx.stroke();
                // 内侧暗线（金属厚度感）
                ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(20,28,44,0.55)';
                ctx.beginPath();
                ctx.moveTo(P[0][0] - 3, P[0][1]);
                for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0] - 3, P[i][1]);
                ctx.stroke();
                ctx.restore();

                // 管内蓝色能量流
                const flow = (t * (0.3 + flash.tube * 0.85)) % 1;
                for (let k = 0; k < 4; k++) {
                    const p = TUBE_PATH.at((flow + k * 0.25) % 1);
                    ctx.fillStyle = `rgba(150,200,255,${0.35 + flash.tube * 0.55})`;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2); ctx.fill();
                }
                // 底部喇叭口（铬 + 蓝焰）
                ctx.save();
                ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 4);
                const ent = TUBE_PATH.at(0);
                const eg = ctx.createRadialGradient(ent.x, ent.y, 1, ent.x, ent.y, 18);
                eg.addColorStop(0, `rgba(150,200,255,${0.6 + flash.tube * 0.4})`);
                eg.addColorStop(1, 'rgba(80,140,255,0)');
                ctx.fillStyle = eg;
                ctx.beginPath(); ctx.arc(ent.x, ent.y, 18, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#cfd8ea';
                ctx.beginPath();
                ctx.moveTo(TUBE_ENTRY[0] - 11, TUBE_ENTRY[1] + 9);
                ctx.lineTo(TUBE_ENTRY[0] + 11, TUBE_ENTRY[1] + 9);
                ctx.lineTo(TUBE_ENTRY[0] + 6, TUBE_ENTRY[1] - 3);
                ctx.lineTo(TUBE_ENTRY[0] - 6, TUBE_ENTRY[1] - 3);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = '#9fd0ff';
                ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('▲', TUBE_ENTRY[0], TUBE_ENTRY[1] + 17);
                ctx.restore();
                // 左上出口箭头
                const pe = TUBE_PATH.at(1);
                ctx.save();
                ctx.translate(pe.x, pe.y);
                ctx.rotate(Math.atan2(pe.ty, pe.tx));
                ctx.fillStyle = `rgba(190,225,255,${0.7 + flash.tube * 0.3})`;
                ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-3, -5); ctx.lineTo(-3, 5);
                ctx.closePath(); ctx.fill();
                ctx.restore();
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
                    rr(LNCX + 11, PLG_TOP + 6, 7, 190, 3); ctx.fill();
                    const ph = plunger * 184;
                    ctx.fillStyle = `hsl(${130 - plunger * 130},88%,56%)`;
                    rr(LNCX + 12, PLG_TOP + 196 - ph, 5, ph, 2); ctx.fill();
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
                SLINGS.forEach((sl, si) => {
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
                    ctx.lineWidth = 5.5; ctx.strokeStyle = '#e8a83c';
                    ctx.beginPath(); ctx.moveTo(sl.a[0], sl.a[1]); ctx.lineTo(sl.b[0], sl.b[1]); ctx.stroke();
                    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,236,180,0.9)';
                    ctx.beginPath(); ctx.moveTo(sl.a[0], sl.a[1] - 1.2); ctx.lineTo(sl.b[0] - 1, sl.b[1] - 1.2); ctx.stroke();
                    ctx.restore();
                    [sl.a, sl.b].forEach(p => {
                        const g2 = ctx.createRadialGradient(p[0] - 1.5, p[1] - 1.5, 0.5, p[0], p[1], 5);
                        g2.addColorStop(0, '#eaf0ff'); g2.addColorStop(1, '#4d5c86');
                        ctx.fillStyle = g2;
                        ctx.beginPath(); ctx.arc(p[0], p[1], 4.2, 0, Math.PI * 2); ctx.fill();
                    });
                    if (slingHit[si] > 0.02) drawSlingHit(sl, slingHit[si]);
                });
            }

            function drawSlingHit(sl, hit) {
                const cx = (sl.a[0] + sl.b[0] + sl.c[0]) / 3;
                const cy = (sl.a[1] + sl.b[1] + sl.c[1]) / 3;
                ctx.save();
                ctx.globalAlpha = hit;
                ctx.fillStyle = 'rgba(255,190,72,0.28)';
                ctx.beginPath();
                ctx.moveTo(sl.a[0], sl.a[1]); ctx.lineTo(sl.b[0], sl.b[1]); ctx.lineTo(sl.c[0], sl.c[1]);
                ctx.closePath(); ctx.fill();
                const retract = 1 - hit * 0.28;
                const bx = lerp(sl.a[0], sl.b[0], retract), by = lerp(sl.a[1], sl.b[1], retract);
                ctx.strokeStyle = '#ffe2a0'; ctx.lineWidth = 2 + hit * 3;
                ctx.beginPath(); ctx.moveTo(sl.a[0], sl.a[1]); ctx.lineTo(bx, by); ctx.stroke();
                ctx.strokeStyle = 'rgba(255,245,190,0.9)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(cx, cy, 7 + hit * 7, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }

            function drawCadetDynamicEffects() {
                Object.entries(CADET_LIGHT_GROUPS).forEach(([id, groups]) => {
                    const object = TABLE_OBJECT_BY_ID['light:' + id];
                    if (!object || object.state !== 'hit') return;
                    groups.forEach(group => {
                        const position = CADET_LIGHT_POSITIONS[group];
                        if (position) drawCadetSprite(CADET_LIGHT_IMAGES[group], position[0], position[1]);
                    });
                });
                CADET_KICKERS.forEach((kb, i) => {
                    drawCadetSprite(kickerHit[i] > 0.02 ? kb.hit : kb.rest,
                        kickerHit[i] > 0.02 ? kb.hitPos[0] : kb.restPos[0],
                        kickerHit[i] > 0.02 ? kb.hitPos[1] : kb.restPos[1]);
                });
                CADET_REBOUNDERS.forEach((rp, i) => {
                    const object = TABLE_OBJECT_BY_ID['rebound' + i];
                    if ((object && object.state === 'hit') || reboundHit[i] > 0.02) drawCadetSprite(rp.image, rp.pos[0], rp.pos[1]);
                });
                CADET_GATES.forEach((gate, i) => {
                    const object = TABLE_OBJECT_BY_ID['gate' + i];
                    if (gateHit[i] <= 0.02 && (!object || object.state !== 'hit')) {
                        drawCadetSprite(gate.image, gate.pos[0], gate.pos[1]);
                        return;
                    }
                    const width = gate.image.naturalWidth * CADET_SCALE;
                    const height = gate.image.naturalHeight * CADET_SCALE;
                    ctx.save();
                    ctx.translate(cadetX(gate.pos[0]) + width / 2, cadetY(gate.pos[1]) + height / 2);
                    ctx.rotate((i ? -1 : 1) * gateHit[i] * 0.55);
                    ctx.drawImage(gate.image, -width / 2, -height / 2, width, height);
                    ctx.restore();
                });
                CADET_FLAGS.forEach(flag => drawCadetSprite(flag.image, flag.pos[0], flag.pos[1]));
                if (flash.target > 0.02 && targetFlashGroup >= 0) {
                    const frame = Math.min(2, Math.floor((1 - flash.target) * 3));
                    const target = CADET_TARGET_FRAMES[targetFlashGroup][frame];
                    drawCadetSprite(target.image, target.pos[0], target.pos[1]);
                }
                CADET_ROLLERS.forEach((frames, i) => {
                    if (rollerHit[i] <= 0.02) return;
                    const frame = Math.min(frames.length - 1, Math.floor((1 - rollerHit[i]) * frames.length));
                    const sprite = frames[frame];
                    drawCadetSprite(sprite.image, sprite.pos[0], sprite.pos[1]);
                });
                if (lanesOn.some(Boolean)) drawLanes();
                lanesOn.forEach((on, i) => {
                    if (!on) return;
                    const image = CADET_LITE.lanes[i];
                    if (image.complete && image.naturalWidth) drawCadetSprite(image, CADET_LITE_POS[i][0], CADET_LITE_POS[i][1]);
                });
                if (flash.ramp > 0.02) CADET_LITE.ramp.forEach(light => drawCadetSprite(light.image, light.pos[0], light.pos[1]));
                if (flash.warp > 0.02) CADET_LITE.warp.forEach(light => drawCadetSprite(light.image, light.pos[0], light.pos[1]));
                if (flash.spin > 0.02 || Math.abs(spinnerVel) > 0.8) drawSpinner();
                if (flash.saucer > 0.02 || saucerHold > 0) drawSaucer();
                if (warpHold > 0 || flash.warp > 0.02) drawWarpJet();
                if (flash.target > 0.02) {
                    TARGETS.forEach(tg => {
                        if (!tg.down) return;
                        ctx.save();
                        ctx.strokeStyle = `rgba(255,180,70,${flash.target * 0.8})`;
                        ctx.lineWidth = 2 + flash.target * 2;
                        ctx.beginPath(); ctx.arc(tg.x, tg.y, 12 + (1 - flash.target) * 8, 0, Math.PI * 2); ctx.stroke();
                        ctx.restore();
                    });
                }
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

            /* ── 发射巷塔顶 + 挡板排水外壳（原版底部中央隆起 + 右巷顶端金属结构）── */
            function drawStructures() {
                ctx.save();
                // 右巷顶端炮塔上盖
                ctx.fillStyle = 'rgba(8,12,24,0.85)';
                rr(LANE.l - 4, LANE.top - 10, LANE.r - LANE.l + 8, 28, 9); ctx.fill();
                ctx.strokeStyle = '#c19a55'; ctx.lineWidth = 2; ctx.stroke();
                const lp = (Math.floor(t * 3) % 2) === 0;
                ctx.fillStyle = lp ? '#ff5a3c' : 'rgba(120,40,20,0.6)';
                if (lp) { ctx.shadowColor = '#ff5a3c'; ctx.shadowBlur = 8; }
                ctx.beginPath(); ctx.arc(LNCX, LANE.top - 3, 3, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                // 右巷外侧细塔（贴着面板一侧的轨道立柱）
                const txp = 410;
                const tg = ctx.createLinearGradient(txp - 6, 0, txp + 6, 0);
                tg.addColorStop(0, '#2a2030'); tg.addColorStop(0.5, '#6e5226'); tg.addColorStop(1, '#2a2030');
                ctx.fillStyle = tg;
                rr(txp - 6, 132, 12, 168, 4); ctx.fill();
                ctx.strokeStyle = 'rgba(255,220,160,0.4)'; ctx.lineWidth = 1; ctx.stroke();
                for (let i = 0; i < 4; i++) {
                    const ly = 150 + i * 40;
                    ctx.fillStyle = i % 2 ? 'rgba(255,150,90,0.85)' : 'rgba(120,200,255,0.85)';
                    ctx.beginPath(); ctx.arc(txp, ly, 2, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();

                // 挡板下方排水槽外壳（原版底部中央隆起 + 中央排水口）
                ctx.save();
                ctx.fillStyle = 'rgba(22,17,11,0.9)';
                ctx.beginPath();
                ctx.moveTo(84, 630); ctx.lineTo(268, 630);
                ctx.lineTo(252, GH - 12); ctx.lineTo(100, GH - 12);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#8a6f45'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#05070d';
                rr(148, 634, 56, 44, 7); ctx.fill();
                ctx.strokeStyle = 'rgba(255,210,150,0.3)'; ctx.lineWidth = 1; ctx.stroke();
                ctx.restore();
            }

            // withTrail 只给主球开拖尾，避免多球时轨迹互相污染
            function drawBall(b, withTrail) {
                const isMain = (b === ball);
                if (saucerHold > 0 && isMain) return;
                if (CADET_TABLE.complete && CADET_TABLE.naturalWidth && CADET_BALL.complete && CADET_BALL.naturalWidth) {
                    const diameter = CADET_BALL.naturalWidth * CADET_SCALE;
                    const bx = b.x;
                    const by = b.y;
                    ctx.drawImage(CADET_BALL, bx - diameter / 2, by - diameter / 2, diameter, diameter);
                    return;
                }
                const bx = b.x;
                const by = b.y;
                // 管道滑行时加一个冷光，让球在 tube 内不丢辨识度
                if (onRail && isMain) {
                    const g0 = ctx.createRadialGradient(bx, by, 2, bx, by, 18);
                    g0.addColorStop(0, 'rgba(160,220,255,0.55)');
                    g0.addColorStop(1, 'rgba(160,220,255,0)');
                    ctx.fillStyle = g0;
                    ctx.beginPath(); ctx.arc(bx, by, 18, 0, Math.PI * 2); ctx.fill();
                }
                ctx.fillStyle = 'rgba(0,0,0,0.42)';
                ctx.beginPath(); ctx.ellipse(bx + 3, by + 11, BALL_R * 1.05, BALL_R * 0.42, 0, 0, Math.PI * 2); ctx.fill();
                if (withTrail) {
                    for (let i = 0; i < trail.length; i++) {
                        const p = trail[i], a = i / trail.length;
                        ctx.fillStyle = `rgba(190,220,255,${a * 0.22})`;
                        ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (0.35 + a * 0.6), 0, Math.PI * 2); ctx.fill();
                    }
                }
                const g = ctx.createRadialGradient(bx - 3.4, by - 4, 0.6, bx, by, BALL_R + 1);
                g.addColorStop(0, '#ffffff'); g.addColorStop(0.22, '#dfe8f5');
                g.addColorStop(0.55, '#9fadc4'); g.addColorStop(0.85, '#5a6579'); g.addColorStop(1, '#2b3340');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(20,26,40,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.beginPath(); ctx.ellipse(bx - 3, by - 3.6, 2.6, 1.7, -0.6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath(); ctx.arc(bx + 3.4, by + 3.4, 1.5, 0, Math.PI * 2); ctx.fill();
                // 环境反射弧（金属感）
                ctx.save();
                ctx.beginPath(); ctx.arc(bx, by, BALL_R - 0.5, Math.PI * 0.15, Math.PI * 0.85);
                ctx.strokeStyle = 'rgba(200,225,255,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
                ctx.restore();
                // 顶部细高光环
                ctx.beginPath(); ctx.arc(bx, by, BALL_R - 1.5, Math.PI * 1.05, Math.PI * 1.7);
                ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
                // 多球：给额外球加一圈金色光环，一眼能认出「这不是主球」
                if (!isMain) {
                    ctx.strokeStyle = 'rgba(255,200,90,0.85)'; ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.arc(bx, by, BALL_R + 3.5, 0, Math.PI * 2); ctx.stroke();
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
                const octx = GC;
                GC = ctx;
                ctx.save();
                ctx.translate(PANEL.x, 0);
                const px = 0, pw = PANEL.w;
                const FS = Math.max(0.72, pw / 210);
                // 面板底 + 与台面的分隔梁
                const bg = ctx.createLinearGradient(0, 0, 18, 0);
                bg.addColorStop(0, '#0c0a08'); bg.addColorStop(0.5, '#3a3021'); bg.addColorStop(1, '#191410');
                ctx.fillStyle = bg; ctx.fillRect(0, 8, 20, GH - 16);
                const pbg = ctx.createLinearGradient(14, 0, px + pw, GH);
                pbg.addColorStop(0, '#1b1712'); pbg.addColorStop(0.5, '#120f0b'); pbg.addColorStop(1, '#0a0806');
                ctx.fillStyle = pbg; ctx.fillRect(14, 8, pw - 12, GH - 16);
                ctx.strokeStyle = '#8a6f45'; ctx.lineWidth = 2;
                rr(3, 6, pw - 5, GH - 12, 10); ctx.stroke();

                /* ── ① Logo 框（星空 + 紫字 + 绿行星 + 军校生飞船）── */
                const lx = px + 14, ly = 90, lw = pw - 28, lh = 170;
                ctx.fillStyle = '#04030a';
                rr(lx, ly, lw, lh, 6); ctx.fill();
                ctx.strokeStyle = '#6e5226'; ctx.lineWidth = 2; ctx.stroke();
                ctx.save();
                rr(lx, ly, lw, lh, 6); ctx.clip();
                if (CADET_LOGO.complete && CADET_LOGO.naturalWidth) {
                    const logoSize = Math.min(lw - 14, lh - 14);
                    ctx.drawImage(CADET_LOGO, lx + (lw - logoSize) / 2, ly + (lh - logoSize) / 2, logoSize, logoSize);
                } else {
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
                ctx.font = `italic bold ${Math.round(16 * FS)}px "Segoe UI",sans-serif`;
                ctx.fillStyle = '#a868e8';
                ctx.fillText('3D Pinball', lx + 14, ly + 34);
                const sc3 = ctx.createLinearGradient(0, ly + 40, 0, ly + 78);
                sc3.addColorStop(0, '#d29aff'); sc3.addColorStop(0.55, '#9a44ec'); sc3.addColorStop(1, '#5c1e9e');
                ctx.font = `italic bold ${Math.round(28 * FS)}px "Segoe UI",sans-serif`;
                ctx.fillStyle = sc3;
                ctx.shadowColor = 'rgba(150,70,230,0.55)'; ctx.shadowBlur = 8;
                ctx.fillText('Space Cadet', lx + 14, ly + 72);
                ctx.shadowBlur = 0;
                ctx.font = `bold ${Math.round(10 * FS)}px "Segoe UI",sans-serif`;
                ctx.fillStyle = 'rgba(255,220,150,0.55)';
                ctx.fillText('塔界远征 · 太空军校生', lx + 14, ly + 92);
                }
                ctx.restore();

                /* ── ② BALL 行 ── */
                const by2 = ly + lh + 16;
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${Math.round(16 * FS)}px "Segoe UI",sans-serif`;
                ctx.textAlign = 'left';
                ctx.fillStyle = '#e8e4d8';
                ctx.fillText('BALL', px + 16, by2 + 15);
                const bn = endless ? '∞' : String(Math.max(1, Math.min(3, 4 - balls)));
                ctx.fillStyle = '#180404';
                rr(px + 86, by2, 50, 30, 3); ctx.fill();
                ctx.strokeStyle = '#c02020'; ctx.lineWidth = 2; ctx.stroke();
                ctx.font = `bold ${Math.round(21 * FS)}px "Consolas",monospace`;
                ctx.textAlign = 'center';
                ctx.shadowColor = '#ff4030'; ctx.shadowBlur = 8;
                ctx.fillStyle = '#ff5040';
                ctx.fillText(bn, px + 111, by2 + 16);
                ctx.shadowBlur = 0;

                /* ── ③ 分数框（两格凹槽：球号 | 总分）── */
                const sy2 = by2 + 42;
                ctx.fillStyle = '#08090e';
                rr(px + 12, sy2, lw, 60, 4); ctx.fill();
                ctx.strokeStyle = '#565d6e'; ctx.lineWidth = 2.4; ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(px + 13, sy2 + 1); ctx.lineTo(px + lw - 1, sy2 + 1);
                ctx.moveTo(px + 13, sy2 + 1); ctx.lineTo(px + 13, sy2 + 59);
                ctx.stroke();
                ctx.strokeStyle = '#565d6e';
                ctx.beginPath(); ctx.moveTo(px + 60, sy2 + 3); ctx.lineTo(px + 60, sy2 + 57); ctx.stroke();
                ctx.font = `bold ${Math.round(19 * FS)}px "Consolas",monospace`;
                ctx.textAlign = 'center';
                ctx.fillStyle = '#d8d4c8';
                ctx.fillText(bn, px + 36, sy2 + 31);
                ctx.textAlign = 'right';
                ctx.shadowColor = '#ffd45a'; ctx.shadowBlur = 6;
                ctx.fillStyle = '#ffd166';
                ctx.font = `bold ${Math.round(21 * FS)}px "Consolas",monospace`;
                let sTxt = String(score);
                if (sTxt.length > 9) sTxt = (score / 1000).toFixed(1) + 'k';
                ctx.fillText(sTxt, px + lw - 10, sy2 + 31);
                ctx.shadowBlur = 0;

                /* ── ③b 状态灯阵（倍率阶梯 / 超空间 / 倾斜 / 关卡进度）── */
                const iy = sy2 + 72;
                const drawLightRow = (lab, y, n, lit, col) => {
                    ctx.font = `bold ${Math.round(10 * FS)}px "Consolas",monospace`;
                    ctx.fillStyle = 'rgba(220,210,190,0.75)';
                    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.fillText(lab, px + 16, y);
                    const gap = Math.min(15, (pw - 92) / n), r = Math.min(4.4, gap * 0.36), x0 = px + 76;
                    for (let i = 0; i < n; i++) {
                        const on = i < lit;
                        ctx.beginPath(); ctx.arc(x0 + i * gap, y, r, 0, Math.PI * 2);
                        if (on) { ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6; }
                        else { ctx.fillStyle = 'rgba(70,62,48,0.55)'; ctx.shadowBlur = 0; }
                        ctx.fill(); ctx.shadowBlur = 0;
                        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
                    }
                };
                const rowP = 17 * FS;
                drawLightRow('倍率', iy, 9, Math.min(9, mult), '#ff6a3d');
                drawLightRow('超空间', iy + rowP, 5, hyperStage, '#c79bff');
                drawLightRow('倾斜', iy + rowP * 2, 3, tiltWarn, tiltWarn >= 2 ? '#ff4a3d' : '#ffb84d');
                drawLightRow('关卡', iy + rowP * 3, 9, Math.min(9, Math.ceil((idx0 + 1) / 6)), '#5fd0ff');
                // 进度灯阵（18 格总体进度，两行）
                ctx.font = `bold ${Math.round(10 * FS)}px "Consolas",monospace`;
                ctx.fillStyle = 'rgba(220,210,190,0.75)';
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText('进度', px + 16, iy + rowP * 4.5);
                const progAll = Math.min(1, score / Math.max(1, P.goal));
                const litP = Math.round(progAll * 18);
                const gapP = Math.min(14, (pw - 86) / 9);
                for (let i = 0; i < 18; i++) {
                    const on = i < litP;
                    const rx = px + 74 + (i % 9) * gapP, ry = iy + rowP * 4 + Math.floor(i / 9) * rowP;
                    ctx.beginPath(); ctx.arc(rx, ry, Math.min(4, gapP * 0.34), 0, Math.PI * 2);
                    if (on) { ctx.fillStyle = '#46d97a'; ctx.shadowColor = '#46d97a'; ctx.shadowBlur = 5; }
                    else { ctx.fillStyle = 'rgba(60,80,60,0.45)'; ctx.shadowBlur = 0; }
                    ctx.fill(); ctx.shadowBlur = 0;
                }

                /* ── ④ 关卡目标黑框 ── */
                const my = iy + rowP * 5 + 16, mh = GH - 24 - my;
                ctx.fillStyle = '#04050a';
                rr(px + 12, my, lw, mh, 5); ctx.fill();
                ctx.strokeStyle = '#3a2a1e'; ctx.lineWidth = 2; ctx.stroke();
                ctx.save();
                rr(px + 12, my, lw, mh, 5); ctx.clip();
                ctx.textAlign = 'left';
                ctx.font = `bold ${Math.round(11 * FS)}px "Consolas",monospace`;
                ctx.fillStyle = 'rgba(255,150,60,0.75)';
                ctx.fillText('· LEVEL GOAL ·', px + 22, my + 18);
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
                    dmdText('GAME OVER', px + 24, my + mh / 2 - 14, Math.round(20 * FS), '#ff6a3d', 'left');
                    dmdText(score >= P.goal ? '任务达成' : '球已用完', px + 24, my + mh / 2 + 16, Math.round(14 * FS), '#ffb85c', 'left');
                } else if (!launched) {
                    // 原版味：待发射时任务区显示「等待部署」
                    dmdText('等待部署', px + 24, my + 52, Math.round(24 * FS), '#ff9a2e', 'left');
                    wrap('按住空格蓄力，松手发射', px + 22, my + 96, lw - 40, 20, Math.round(12 * FS), '#c8bfa8');
                } else {
                    let yy = wrap('第 ' + (idx0 + 1) + ' 关 · ' + NAMES[Math.min(49, idx0)], px + 22, my + 42, lw - 40, Math.round(24 * FS), Math.round(17 * FS), '#ff9a2e', true);
                    yy = wrap('目标分数：' + P.goal.toLocaleString(), px + 22, yy + 4, lw - 40, Math.round(20 * FS), Math.round(12 * FS), '#d8cdb2');
                    dmdText('当前分数：' + Math.round(score).toLocaleString(), px + 22, yy + 8, Math.round(12 * FS), '#ffb85c', 'left');
                    const bw2 = lw - 44, bx2 = px + 22, byy = yy + 28;
                    ctx.fillStyle = 'rgba(255,140,60,0.18)';
                    ctx.fillRect(bx2, byy, bw2, 7);
                    ctx.fillStyle = '#ff9a2e';
                    ctx.fillRect(bx2, byy, bw2 * Math.min(1, score / Math.max(1, P.goal)), 7);
                    if (mbCount > 1 && live.length > 1)
                        dmdText('MULTIBALL ×' + live.length, px + 22, my + mh - 16, Math.round(13 * FS), '#ff6a3d', 'left');
                }
                ctx.restore();
                ctx.restore();
                GC = octx;
            }

            let last = 0, raf = 0;
            function frame(ts) {
                raf = requestAnimationFrame(frame);
                const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
                last = ts; t += dt;
                updateTableObjects(dt);

                for (let i = 0; i < 3; i++) bumps[i] = Math.max(0, bumps[i] - dt * 3.2);
                for (let i = 0; i < 3; i++) jets[i] = Math.max(0, jets[i] - dt * 3.2);
                for (let i = 0; i < 2; i++) slingHit[i] = Math.max(0, slingHit[i] - dt * 5.5);
                for (let i = 0; i < 2; i++) kickerHit[i] = Math.max(0, kickerHit[i] - dt * 8);
                for (let i = 0; i < reboundHit.length; i++) reboundHit[i] = Math.max(0, reboundHit[i] - dt * 7);
                for (let i = 0; i < rollerHit.length; i++) rollerHit[i] = Math.max(0, rollerHit[i] - dt * 5);
                for (let i = 0; i < gateHit.length; i++) gateHit[i] = Math.max(0, gateHit[i] - dt * 6);
                for (const k in flash) flash[k] = Math.max(0, flash[k] - dt * 2.4);
                if (flash.target <= 0.02) targetFlashGroup = -1;
                shake = Math.max(0, shake - dt * 3.4);
                toastT = Math.max(0, toastT - dt);
                nudgeCd = Math.max(0, nudgeCd - dt);
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
                const originalTable = CADET_TABLE.complete && CADET_TABLE.naturalWidth;
                if (!originalTable) {
                    drawTubeLeft();
                    drawRamp();
                    drawLanes();
                    drawWalls();
                    drawStructures();
                    drawLaunchTube();
                    drawSaucer();
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
                    drawTiltLights();
                    drawPlunger();
                } else {
                    drawCadetBumpers();
                    SLINGS.forEach((sl, i) => { if (slingHit[i] > 0.02) drawSlingHit(sl, slingHit[i]); });
                    drawCadetDynamicEffects();
                    drawCadetFlipper(FL);
                    drawCadetFlipper(FR);
                    drawCadetPlunger();
                }
                for (let bi = 0; bi < live.length; bi++) drawBall(live[bi], bi === 0);
                drawParts();
                ctx.restore();

                drawDMD();
                drawPanel();
                if (!(CADET_TABLE.complete && CADET_TABLE.naturalWidth)) drawHints();
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
                    get hyperStage() { return hyperStage; },
                    get tiltWarn() { return tiltWarn; },
                    get score() { return score; },
                    get liveCount() { return live.length; },
                    get mission() { return { i: idx0, prog: score, name: NAMES[Math.min(49, idx0)], need: P.goal, rank: idx0 + 1 }; },
                    get objects() { return TABLE_OBJECTS.map(object => ({ id: object.id, kind: object.kind, state: object.state, frame: object.frame })); },
                    get warpHold() { return warpHold; },
                    get railMode() { return railMode; },
                    addScore, finish, startMultiball: n => startMultiball(n, true), enterTube,
                    relaunch: () => manualRelaunch(),
                    nudge: () => doNudge(),
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
                    stopMusic();
                    destroy();
                },
            };
        },
    };
})();
