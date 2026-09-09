// 2048 · 葫芦娃妖怪版：11 级妖怪合并（L1+L1→L2，最高 L11）
// 每只怪物都是独立 Canvas API 绘制（Q 版葫芦娃妖怪风），左上角显示等级
window.MiniGames = window.MiniGames || {};

// ============ 11 只妖怪定义（按用户给的等级表）============
// L1 毒蛇绿 → L2 毒蛇蓝 → L3 黄蜂精 → L4 蛤蟆绿 → L5 蛤蟆蓝 → L6 蛤蟆红
// → L7 蜈蚣精 → L8 蜘蛛精 → L9 鳄鱼精 → L10 蝎子精 → L11 蛇精
const MON = [
    { n: '毒蛇·绿', bg: '#bce99e', bd: '#5a8a3a' },
    { n: '毒蛇·蓝', bg: '#a8b8f0', bd: '#3a4d8f' },
    { n: '黄蜂精',  bg: '#ffe28a', bd: '#a07020' },
    { n: '蛤蟆·绿', bg: '#9be09b', bd: '#3a7a3a' },
    { n: '蛤蟆·蓝', bg: '#b8a0f5', bd: '#4d2a8f' },
    { n: '蛤蟆·红', bg: '#ff9090', bd: '#8f2020' },
    { n: '蜈蚣精',  bg: '#ffc28a', bd: '#8f4a20' },
    { n: '蜘蛛精',  bg: '#d8b8f5', bd: '#5a2a8f' },
    { n: '鳄鱼精',  bg: '#ffae70', bd: '#8f3a10' },
    { n: '蝎子精',  bg: '#ffa070', bd: '#8f3a10' },
    { n: '蛇精',    bg: '#b59cd8', bd: '#3a1a5f' },
];

// =================== 11 个 draw 函数（每只妖怪 8-15 行）===================
// 画布坐标系 (0,0) 在格子中心，s 为可绘制边长

// L1 毒蛇·绿：S 形蛇身 + 圆头 + 大眼
function drawSnakeG(ctx, s) {
    ctx.strokeStyle = '#5a8a3a'; ctx.lineWidth = s * 0.18; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.35, s * 0.35);
    ctx.bezierCurveTo(-s * 0.1, s * 0.1, -s * 0.15, -s * 0.2, -s * 0.28, -s * 0.28);
    ctx.bezierCurveTo(-s * 0.4, -s * 0.36, s * 0.05, -s * 0.2, s * 0.25, 0);
    ctx.stroke();
    ctx.fillStyle = '#7adf7a';
    ctx.beginPath(); ctx.ellipse(s * 0.3, 0, s * 0.13, s * 0.1, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s * 0.34, -s * 0.02, s * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.02, s * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s * 0.42, 0.01 * s); ctx.lineTo(s * 0.5, 0.05 * s); ctx.stroke();
}

// L2 毒蛇·蓝：紫色蛇身 + 蓝色三角条 + 翘头
function drawSnakeB(ctx, s) {
    ctx.strokeStyle = '#3a4d8f'; ctx.lineWidth = s * 0.18; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.32, s * 0.4);
    ctx.bezierCurveTo(-s * 0.05, s * 0.18, s * 0.1, -s * 0.18, -s * 0.18, -s * 0.32);
    ctx.bezierCurveTo(-s * 0.42, -s * 0.42, s * 0.05, -s * 0.22, s * 0.32, -s * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#a8b8f0';
    ctx.beginPath(); ctx.ellipse(s * 0.36, -s * 0.08, s * 0.15, s * 0.11, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a4d8f';
    ctx.beginPath(); ctx.moveTo(s * 0.25, -s * 0.1); ctx.lineTo(s * 0.48, -s * 0.08); ctx.lineTo(s * 0.34, 0.02 * s); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.1, s * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.09, s * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s * 0.34, -s * 0.18); ctx.lineTo(s * 0.48, -s * 0.13); ctx.stroke();
}

// L3 黄蜂精：椭圆 + 黑条纹 + 半透翅膀 + 蜂针
function drawBee(ctx, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-s * 0.08, -s * 0.32, s * 0.22, s * 0.13, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.12, -s * 0.34, s * 0.2, s * 0.12, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe28a';
    ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.36, s * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a07020'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(-s * 0.2, -s * 0.06, s * 0.07, s * 0.22);
    ctx.fillRect(-0.02 * s, -s * 0.14, s * 0.07, s * 0.36);
    ctx.fillRect(s * 0.13, -s * 0.06, s * 0.07, s * 0.22);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.04, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.04, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.04, s * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.04, s * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, s * 0.3); ctx.lineTo(0, s * 0.44); ctx.stroke();
}

// L4 蛤蟆·绿：圆头 + 两大眼 + 张嘴
function drawToadG(ctx, s) {
    ctx.fillStyle = '#9be09b';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.4, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a7a3a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.2, s * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.2, s * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-s * 0.18, -s * 0.18, s * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.22, -s * 0.18, s * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a7a3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, s * 0.12, s * 0.18, 0, Math.PI); ctx.stroke();
}

// L5 蛤蟆·蓝：紫色 + 背刺 + 红眼 + 大嘴
function drawToadB(ctx, s) {
    ctx.fillStyle = '#b8a0f5';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.4, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4d2a8f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#4d2a8f';
    ctx.beginPath(); ctx.moveTo(-s * 0.34, -s * 0.14); ctx.lineTo(-s * 0.4, -s * 0.34); ctx.lineTo(-s * 0.22, -s * 0.18); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -s * 0.34); ctx.lineTo(s * 0.04, -s * 0.48); ctx.lineTo(s * 0.12, -s * 0.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.28, -s * 0.18); ctx.lineTo(s * 0.4, -s * 0.36); ctx.lineTo(s * 0.2, -s * 0.22); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s * 0.18, -s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.18, -s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3030';
    ctx.beginPath(); ctx.arc(-s * 0.18, -s * 0.08, s * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.18, -s * 0.08, s * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a1a5f';
    ctx.beginPath(); ctx.arc(0, s * 0.12, s * 0.2, 0, Math.PI); ctx.fill();
}

// L6 蛤蟆·红：红椭圆 + 3 背刺 + 凶眉 + 红眼 + 大嘴
function drawToadR(ctx, s) {
    ctx.fillStyle = '#ff9090';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8f2020'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#8f2020';
    for (const dx of [-0.32, -0.08, 0.18]) {
        ctx.beginPath();
        ctx.moveTo(dx * s, -s * 0.16);
        ctx.lineTo(dx * s, -s * 0.42);
        ctx.lineTo((dx + 0.05) * s, -s * 0.18);
        ctx.fill();
    }
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-s * 0.32, -s * 0.24); ctx.lineTo(-s * 0.1, -s * 0.15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.32, -s * 0.24); ctx.lineTo(s * 0.1, -s * 0.15); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.18, -s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff2020';
    ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.08, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.18, -s * 0.08, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a0a0a';
    ctx.beginPath(); ctx.arc(0, s * 0.14, s * 0.22, 0, Math.PI); ctx.fill();
}

// L7 蜈蚣精：触角 + 3 节身 + 6 足 + 头
function drawCentipede(ctx, s) {
    ctx.strokeStyle = '#8f4a20'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-s * 0.32, s * 0.0); ctx.lineTo(-s * 0.42, -s * 0.18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.32, s * 0.0); ctx.lineTo(s * 0.42, -s * 0.18); ctx.stroke();
    ctx.fillStyle = '#ffc28a';
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-s * 0.25 + i * s * 0.25, s * 0.1 - i * s * 0.04, s * 0.18, s * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8f4a20'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.strokeStyle = '#8f4a20'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
        const x = -s * 0.32 + i * s * 0.13;
        ctx.beginPath(); ctx.moveTo(x, s * 0.16); ctx.lineTo(x + 4, s * 0.3); ctx.stroke();
    }
    ctx.fillStyle = '#ffc28a';
    ctx.beginPath(); ctx.arc(-s * 0.34, s * 0.04, s * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8f4a20'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s * 0.4, -s * 0.0, s * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-s * 0.4, -s * 0.0, s * 0.022, 0, Math.PI * 2); ctx.fill();
}

// L8 蜘蛛精：8 腿 + 大圆腹 + 8 红眼
function drawSpider(ctx, s) {
    ctx.strokeStyle = '#5a2a8f'; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
        const ang = -Math.PI / 2 + (i - 1.5) * 0.5;
        ctx.beginPath(); ctx.moveTo(0, s * 0.05);
        ctx.lineTo(Math.cos(ang) * s * 0.46, Math.sin(ang) * s * 0.46);
        ctx.stroke();
    }
    ctx.fillStyle = '#d8b8f5';
    ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.34, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a2a8f'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#d8b8f5';
    ctx.beginPath(); ctx.arc(0, -s * 0.18, s * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a2a8f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ff3030';
    for (const [dx, dy] of [[-0.08, -0.2], [0, -0.22], [0.08, -0.2], [-0.04, -0.14], [0.04, -0.14]]) {
        ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.022, 0, Math.PI * 2); ctx.fill();
    }
}

// L9 鳄鱼精：长嘴 + 牙齿 + 背刺 + 红眼
function drawCroc(ctx, s) {
    ctx.fillStyle = '#ffae70';
    ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.4, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8f3a10'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffae70';
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, -s * 0.18);
    ctx.quadraticCurveTo(s * 0.38, -s * 0.28, s * 0.45, -s * 0.04);
    ctx.lineTo(s * 0.4, s * 0.04);
    ctx.quadraticCurveTo(s * 0.32, s * 0.04, s * 0.28, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8f3a10'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(s * 0.18, -s * 0.08); ctx.lineTo(s * 0.22, -s * 0.01); ctx.lineTo(s * 0.26, -s * 0.08); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.06); ctx.lineTo(s * 0.34, 0.01); ctx.lineTo(s * 0.38, -s * 0.06); ctx.fill();
    ctx.fillStyle = '#8f3a10';
    for (const dx of [-0.22, -0.05, 0.12]) {
        ctx.beginPath();
        ctx.moveTo(dx * s, -s * 0.2);
        ctx.lineTo((dx + 0.05) * s, -s * 0.34);
        ctx.lineTo((dx + 0.1) * s, -s * 0.2);
        ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s * 0.22, -s * 0.18, s * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3030';
    ctx.beginPath(); ctx.arc(-s * 0.22, -s * 0.18, s * 0.045, 0, Math.PI * 2); ctx.fill();
}

// L10 蝎子精：双钳 + 椭圆身 + 翘尾带钩 + 眼
function drawScorpion(ctx, s) {
    ctx.fillStyle = '#ffa070'; ctx.strokeStyle = '#8f3a10'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-s * 0.38, -s * 0.16, s * 0.13, s * 0.08, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-s * 0.5, -s * 0.28, s * 0.06, s * 0.04, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(s * 0.38, -s * 0.16, s * 0.13, s * 0.08, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(s * 0.5, -s * 0.28, s * 0.06, s * 0.04, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffa070';
    ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.32, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8f3a10'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#ffa070'; ctx.lineWidth = s * 0.13; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.25);
    ctx.bezierCurveTo(s * 0.06, s * 0.42, -s * 0.06, s * 0.46, -s * 0.12, s * 0.34);
    ctx.stroke();
    ctx.fillStyle = '#8f3a10';
    ctx.beginPath(); ctx.moveTo(-s * 0.12, s * 0.34); ctx.lineTo(-s * 0.2, s * 0.3); ctx.lineTo(-s * 0.08, s * 0.42); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.05, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.05, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.05, s * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.05, s * 0.025, 0, Math.PI * 2); ctx.fill();
}

// L11 蛇精（终极 BOSS）：高挑 S 身 + 王冠 + 长眯眼 + 翘笑
function drawSnakeQueen(ctx, s) {
    ctx.strokeStyle = '#3a1a5f'; ctx.lineWidth = s * 0.18; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, s * 0.46);
    ctx.bezierCurveTo(-s * 0.32, s * 0.22, s * 0.12, s * 0.08, -s * 0.1, -s * 0.1);
    ctx.bezierCurveTo(-s * 0.32, -s * 0.3, s * 0.06, -s * 0.36, s * 0.18, -s * 0.18);
    ctx.stroke();
    ctx.fillStyle = '#b59cd8';
    ctx.beginPath(); ctx.ellipse(s * 0.18, -s * 0.2, s * 0.16, s * 0.13, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a1a5f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffd56b';
    ctx.beginPath();
    ctx.moveTo(s * 0.02, -s * 0.38); ctx.lineTo(s * 0.06, -s * 0.48); ctx.lineTo(s * 0.12, -s * 0.38); ctx.lineTo(s * 0.18, -s * 0.5); ctx.lineTo(s * 0.24, -s * 0.38); ctx.lineTo(s * 0.3, -s * 0.48); ctx.lineTo(s * 0.36, -s * 0.38);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8f4a10'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ff5050';
    ctx.beginPath(); ctx.ellipse(s * 0.12, -s * 0.22, s * 0.045, s * 0.022, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.24, -s * 0.18, s * 0.045, s * 0.022, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a1a5f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.1, s * 0.06, 0.3, Math.PI - 0.3); ctx.stroke();
}

// =================== 通用渲染 ===================
const MON_DRAW = [drawSnakeG, drawSnakeB, drawBee, drawToadG, drawToadB, drawToadR, drawCentipede, drawSpider, drawCroc, drawScorpion, drawSnakeQueen];

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawMonsterCell(ctx, level, x, y, s) {
    const m = MON[level - 1]; if (!m) return;
    // 圆角矩形底
    roundRect(ctx, x + 3, y + 3, s - 6, s - 6, 10);
    ctx.fillStyle = m.bg; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = m.bd; ctx.stroke();
    // 怪物身体（中心偏下，给徽标留位置）
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2 + 7);
    MON_DRAW[level - 1](ctx, s * 0.72);
    ctx.restore();
    // 等级徽标（左上角）
    ctx.beginPath();
    ctx.arc(x + 17, y + 17, 11.5, 0, Math.PI * 2);
    ctx.fillStyle = m.bd; ctx.fill();
    ctx.lineWidth = 1.8; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(level, x + 17, y + 17);
}

// 等级 → 妖怪名
const MON_NAME = level => MON[level - 1].n;

// =================== 关卡配置（20 关，目标 = 凑出指定等级怪物）===================
// 关卡名 / 目标等级 / 步数预算 / 岩石障碍
MiniGames.g2048 = {
    LEVELS: [
        { name: '伏蛇',     target: 2,  moves: 100, desc: '击败 毒蛇·蓝 · 100 步' },
        { name: '蜂起',     target: 3,  moves: 170, desc: '击败 黄蜂精 · 170 步' },
        { name: '通灵',     target: 3,  moves: 140, desc: '击败 黄蜂精 · 140 步' },
        { name: '蛤蟆咒',   target: 4,  moves: 280, desc: '击败 蛤蟆·绿 · 280 步' },
        { name: '石门试炼', target: 4,  moves: 250, rocks: 2, desc: '击败 蛤蟆·绿 · 250 步 · 🪨2' },
        { name: '呱声震谷', target: 5,  moves: 220, desc: '击败 蛤蟆·蓝 · 220 步' },
        { name: '毒潭',     target: 5,  moves: 480, desc: '击败 蛤蟆·蓝 · 480 步' },
        { name: '乱石沼',   target: 6,  moves: 430, rocks: 3, desc: '击败 蛤蟆·红 · 430 步 · 🪨3' },
        { name: '魔音窟',   target: 6,  moves: 380, desc: '击败 蛤蟆·红 · 380 步' },
        { name: '百足径',   target: 7,  moves: 800, desc: '击败 蜈蚣精 · 800 步' },
        { name: '石林',     target: 7,  moves: 700, rocks: 3, desc: '击败 蜈蚣精 · 700 步 · 🪨3' },
        { name: '蛛丝洞',   target: 8,  moves: 620, desc: '击败 蜘蛛精 · 620 步' },
        { name: '碎石带',   target: 8,  moves: 560, rocks: 4, desc: '击败 蜘蛛精 · 560 步 · 🪨4' },
        { name: '鳄潭',     target: 9,  moves: 1400, desc: '击败 鳄鱼精 · 1400 步' },
        { name: '顽石岗',   target: 9,  moves: 1250, rocks: 4, desc: '击败 鳄鱼精 · 1250 步 · 🪨4' },
        { name: '蝎尾崖',   target: 10, moves: 1100, desc: '击败 蝎子精 · 1100 步' },
        { name: '深渊石阵', target: 10, moves: 980,  rocks: 5, desc: '击败 蝎子精 · 980 步 · 🪨5' },
        { name: '蛇穴',     target: 11, moves: 2400, desc: '击败 蛇精 · 2400 步' },
        { name: '磐石塔',   target: 11, moves: 2100, rocks: 4, desc: '击败 蛇精 · 2100 步 · 🪨4' },
        { name: '诛妖·终',  target: 11, moves: 1800, rocks: 6, desc: '击败 蛇精 · 1800 步 · 🪨6' },
    ],
    // 由 MG.runGame 统一管理关卡选择；g2048.start 只负责对局逻辑
    // opts.levelIdx: 关卡索引（0-based），opts.level === 0 表示无尽模式（levelIdx=undefined）
    start(container, opts) {
        const level = (opts.levelIdx != null ? opts.levelIdx + 1 : 0);
        const api = { stop() {} };
        g2048Round(container, opts, level, api, () => { if (api._back) api._back(); }, lvl => { if (api._restart) api._restart(lvl); });
        return api;
    },
};

// =================== 单局游戏主逻辑（opts.level 由 MG.runGame 传入）==================
function g2048Round(container, opts, level, api, onBack, onReplay) {
    const N = 4, SIZE = 100;
    const lv = level > 0 ? MiniGames.g2048.LEVELS[level - 1] : { target: 11, moves: Infinity, rocks: 0 };
    const target = lv.target || 11, maxMoves = lv.moves || Infinity, rockN = lv.rocks || 0;
    const { c, ctx, w, h, destroy } = MG.canvas(container, N * SIZE + 20, N * SIZE + 20);

    let board = Array.from({ length: N }, () => Array(N).fill(0));
    let score = 0, moves = 0, over = false;

    // 岩石障碍（避开初始 2×2）
    const rocks = new Set();
    const rockKey = (i, j) => i * N + j;
    if (rockN) {
        const cells = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cells.push([i, j]);
        MG.shuffle(cells);
        for (const [i, j] of cells) {
            if (rocks.size >= rockN) break;
            if (!(i < 2 && j < 2)) rocks.add(rockKey(i, j));
        }
    }

    // 等级 → 分数（升级时累加，等级越高奖励越多）
    const levelScore = l => l * l * 5;

    // 加权 spawn：根据目标等级动态调整（防止卡死也防止太轻松）
    const spawnLevel = () => {
        const maxSpawn = Math.min(11, Math.max(2, target));
        if (maxSpawn <= 2) return Math.random() < 0.85 ? 1 : 2;
        if (maxSpawn <= 4) {
            const r = Math.random();
            if (r < 0.7) return 1;
            if (r < 0.92) return 2;
            return MG.ri(3, maxSpawn);
        }
        if (maxSpawn <= 7) {
            const r = Math.random();
            if (r < 0.55) return 1;
            if (r < 0.78) return 2;
            if (r < 0.9) return 3;
            return MG.ri(4, maxSpawn);
        }
        const r = Math.random();
        if (r < 0.4) return 1;
        if (r < 0.65) return 2;
        if (r < 0.82) return 3;
        return MG.ri(4, maxSpawn);
    };

    const add = () => {
        const empty = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
            if (!board[i][j] && !rocks.has(rockKey(i, j))) empty.push([i, j]);
        if (!empty.length) return;
        const [x, y] = MG.pick(empty);
        board[x][y] = spawnLevel();
    };

    const draw = () => {
        // 棋盘背景（蓝灰）
        ctx.fillStyle = '#5a7a9f';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
            const x = 10 + j * SIZE, y = 10 + i * SIZE;
            if (rocks.has(rockKey(i, j))) {
                // 岩石格（不可移动）
                roundRect(ctx, x + 4, y + 4, SIZE - 8, SIZE - 8, 10);
                ctx.fillStyle = '#3a3a44'; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = '#1a1a20'; ctx.stroke();
                ctx.fillStyle = '#5a5a64';
                ctx.beginPath(); ctx.arc(x + SIZE * 0.38, y + SIZE * 0.36, SIZE * 0.16, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + SIZE * 0.62, y + SIZE * 0.6, SIZE * 0.2, 0, Math.PI * 2); ctx.fill();
                continue;
            }
            const v = board[i][j];
            if (v) drawMonsterCell(ctx, v, x, y, SIZE);
            else {
                roundRect(ctx, x + 6, y + 6, SIZE - 12, SIZE - 12, 10);
                ctx.fillStyle = '#486890'; ctx.fill();
            }
        }
        const maxL = Math.max(...board.flat(), 0);
        if (level > 0) {
            opts.onScore && opts.onScore(`目标：${MON_NAME(target)} (Lv${target}) · 最高 Lv${maxL} · ${moves}/${maxMoves} 步 · 击退 ${score}`);
        } else {
            opts.onScore && opts.onScore(`分数 ${score} · 最高 Lv${maxL} · ${moves} 步`);
        }
    };

    // 段内压缩：n + n → n+1（封顶 11）
    const compressSeg = seg => {
        const a = seg.filter(v => v);
        for (let i = 0; i < a.length - 1; i++) {
            if (a[i] === a[i + 1] && a[i] < 11) {
                a[i] += 1;
                score += levelScore(a[i]);
                a.splice(i + 1, 1);
            }
        }
        while (a.length < seg.length) a.push(0);
        return a;
    };
    const compressRow = row => {
        const out = []; let seg = [];
        for (const v of row) {
            if (v === -1) { out.push(...compressSeg(seg), -1); seg = []; }
            else seg.push(v);
        }
        out.push(...compressSeg(seg));
        return out;
    };
    const getRow = i => board[i].map((v, j) => rocks.has(rockKey(i, j)) ? -1 : v);
    const setRow = (i, r) => { board[i] = r.map(v => v === -1 ? 0 : v); };
    const getCol = j => board.map((r, i) => rocks.has(rockKey(i, j)) ? -1 : r[j]);
    const setCol = (j, cl) => { cl.forEach((v, i) => { if (v !== -1) board[i][j] = v; }); };

    const finish = (win, reason) => {
        if (over) return;
        over = true;
        let stars = 0;
        if (level > 0) {
            const ratio = (maxMoves - moves) / maxMoves;
            stars = win ? (ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1) : 0;
            MG.recordStars('g2048', level, stars);
        }
        // 通知 MG.runGame 处理结算弹窗（重试/下一关/选关）
        if (opts.onComplete) {
            const maxL = Math.max(...board.flat(), 0);
            opts.onComplete({
                win,
                stars,
                title: win ? `🏆 击败 ${MON_NAME(target)}！` : '💥 妖怪太强了…',
                lines: [reason || '', `分数 ${score} · 用了 ${moves} 步`, `最高 Lv${maxL}（${MON_NAME(maxL)}）`].filter(Boolean),
                score,
            });
        }
        draw();
    };

    const move = dir => {
        if (over) return;
        const before = JSON.stringify(board);
        if (dir === 'L') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i)));
        if (dir === 'R') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i).reverse()).reverse());
        if (dir === 'U') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j)));
        if (dir === 'D') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j).reverse()).reverse());
        if (JSON.stringify(board) !== before) { moves++; add(); }
        draw();
        if (board.flat().includes(target)) return finish(true, `在 ${moves} 步内合出了 ${MON_NAME(target)}！`);
        if (level > 0 && moves >= maxMoves) return finish(false, `步数用完（${maxMoves} 步）还没凑出 ${MON_NAME(target)}`);
        // 死局检测
        const can = ['L', 'R', 'U', 'D'].some(d => {
            const snap = JSON.stringify(board), sc = score;
            if (d === 'L') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i)));
            if (d === 'R') for (let i = 0; i < N; i++) setRow(i, compressRow(getRow(i).reverse()).reverse());
            if (d === 'U') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j)));
            if (d === 'D') for (let j = 0; j < N; j++) setCol(j, compressRow(getCol(j).reverse()).reverse());
            const changed = JSON.stringify(board) !== snap;
            board = JSON.parse(snap); score = sc;
            return changed;
        });
        if (!can) finish(level === 0, '棋盘锁死，无路可走');
    };

    const kbd = e => {
        const k = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }[e.key];
        if (k) { e.preventDefault(); move(k); }
    };
    window.addEventListener('keydown', kbd);
    let startX, startY;
    const ts = e => { const t = e.touches[0]; startX = t.clientX; startY = t.clientY; };
    const te = e => {
        const t = e.changedTouches[0]; const dx = t.clientX - startX, dy = t.clientY - startY;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L'); else move(dy > 0 ? 'D' : 'U');
    };
    c.addEventListener('touchstart', ts);
    c.addEventListener('touchend', te);

    const origStop = api.stop;
    api.stop = function () { window.removeEventListener('keydown', kbd); c.removeEventListener('touchstart', ts); c.removeEventListener('touchend', te); origStop(); };

    add(); add(); draw();
    MG.hint(container, level > 0
        ? `第 ${level} 关：${maxMoves} 步内击败 ${MON_NAME(target)}${rockN ? '（🪨岩石无法移动）' : ''}`
        : '滑动屏幕（或方向键）合并妖怪，最高 Lv11 蛇精！');

    // 测试钩子（无头测试用）
    if (typeof window !== 'undefined' && window.__MG_TEST) {
        window.__g2048 = {
            get board() { return board; }, get moves() { return moves; }, get over() { return over; },
            get score() { return score; },
            move, target, maxMoves, rocks,
            N, SIZE, add, drawMonsterCell, MON,
        };
    }
    return api;
}