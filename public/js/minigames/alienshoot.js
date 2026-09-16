// 孤胆枪手：俯视角射击，持枪扫射异形潮，击杀配额推进关卡
window.MiniGames = window.MiniGames || {};
(function () {
    const W = 420, H = 560;
    const NAMES = ['前哨遇袭', '隧道清剿', '巢穴深入', '钢铁风暴'];
    const lv = [];
    for (let i = 0; i < 50; i++) {
        const quota = 10 + i * 2;
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `击杀 ${quota} 只异形 · 首领每 ${Math.max(3, 8 - Math.floor(i / 10))} 波出现` });
    }
    // 颜色提亮/压暗：amt ∈ [-1,1]
    function shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
        else { const k = 1 + amt; r *= k; g *= k; b *= k; }
        return `rgb(${r | 0},${g | 0},${b | 0})`;
    }

    MiniGames.alienshoot = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const quota = 10 + idx * 2;
            const spawnInt = Math.max(0.42, 1.25 - idx * 0.016);
            const spd = 52 + idx * 1.4;
            let px = W / 2, py = H / 2, hp = 100, kills = 0, over = false, t = 0;
            let aliens = [], bullets = [], parts = [], pickups = [], decals = [], shake = 0;
            let aim = { x: W / 2, y: 0 }, firing = false, cool = 0, spawnT = 0, wave = 0;
            let score = 0;
            // 移动：键盘 + 移动端左半屏虚拟摇杆
            const keys = new Set();
            let mvx = 0, mvy = 0, walkT = 0, muzzle = 0;
            let joyId = null, joyOx = 0, joyOy = 0, joyVx = 0, joyVy = 0;
            let joyCX = 0, joyCY = 0, isTouch = false;   // 摇杆绘制（画布坐标）与触屏标记

            container.innerHTML = '';
            const cvs = document.createElement('canvas');
            cvs.width = W; cvs.height = H;
            cvs.style.cssText = 'max-width:100%;max-height:100%;touch-action:none;cursor:crosshair;';
            container.appendChild(cvs);
            const ctx = cvs.getContext('2d');

            const done = (win, lines) => {
                if (over) return; over = true; clearInterval(timer);
                opts.onComplete && opts.onComplete({ win, stars: win ? (hp >= 80 ? 3 : hp >= 45 ? 2 : 1) : 0, lines });
            };
            function spawn() {
                wave++;
                const boss = wave % Math.max(3, 8 - Math.floor(idx / 10)) === 0;
                const edge = MG.ri(0, 3);
                let x, y;
                if (edge === 0) { x = MG.ri(0, W); y = -20; }
                else if (edge === 1) { x = W + 20; y = MG.ri(0, H); }
                else if (edge === 2) { x = MG.ri(0, W); y = H + 20; }
                else { x = -20; y = MG.ri(0, H); }
                const type = boss ? 'tank' : Math.random() < 0.25 ? 'runner' : 'grunt';
                const st = { grunt: { r: 13, hp: 1, v: spd, c: '#7fae4a' }, runner: { r: 10, hp: 1, v: spd * 1.7, c: '#d8c24a' }, tank: { r: 22, hp: 5 + Math.floor(idx / 12), v: spd * 0.55, c: '#b04ad8' } }[type];
                aliens.push({ x, y, type, ...st, maxHp: st.hp, hitT: 0 });
            }
            function boom(x, y, c) {
                for (let k = 0; k < 10; k++) parts.push({ x, y, vx: (Math.random() - 0.5) * 280, vy: (Math.random() - 0.5) * 280, life: 0.5, c });
                for (let k = 0; k < 7; k++) parts.push({ x, y, vx: (Math.random() - 0.5) * 170, vy: (Math.random() - 0.5) * 170, life: 0.6, r: 2 + Math.random() * 2.5, kind: 'blood', c: '#9b3b3b' });
            }

            function step() {
                if (over) return;
                const dt = 0.03; t += dt; cool -= dt; spawnT -= dt; muzzle -= dt;
                // 键盘/摇杆移动
                let kx = 0, ky = 0;
                if (keys.has('a') || keys.has('arrowleft')) kx -= 1;
                if (keys.has('d') || keys.has('arrowright')) kx += 1;
                if (keys.has('w') || keys.has('arrowup')) ky -= 1;
                if (keys.has('s') || keys.has('arrowdown')) ky += 1;
                let dx = kx + joyVx, dy = ky + joyVy;
                const dl = Math.hypot(dx, dy);
                if (dl > 1) { dx /= dl; dy /= dl; }
                if (dl > 0.01) {
                    px = Math.max(16, Math.min(W - 16, px + dx * 175 * dt));
                    py = Math.max(16, Math.min(H - 16, py + dy * 175 * dt));
                    walkT += dt * 11;
                } else walkT += dt * 2.2;
                // 射击
                if (firing && cool <= 0) {
                    const a = Math.atan2(aim.y - py, aim.x - px);
                    bullets.push({ x: px + Math.cos(a) * 22, y: py + Math.sin(a) * 22, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620 });
                    cool = 0.13; muzzle = 0.06;
                }
                if (spawnT <= 0) { spawn(); spawnT = spawnInt * (0.7 + Math.random() * 0.6); }
                // 子弹
                for (let i = bullets.length - 1; i >= 0; i--) {
                    const b = bullets[i];
                    b.x += b.vx * dt; b.y += b.vy * dt;
                    if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) { bullets.splice(i, 1); continue; }
                    for (let j = aliens.length - 1; j >= 0; j--) {
                        const a = aliens[j];
                        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r) {
                            a.hp--; a.hitT = 0.1; bullets.splice(i, 1);
                            if (a.hp <= 0) {
                                aliens.splice(j, 1); kills++;
                                boom(a.x, a.y, a.c);
                                decals.push({ x: a.x, y: a.y, r: 6 + Math.random() * 9, a: 0.55 + Math.random() * 0.3 });
                                if (decals.length > 70) decals.shift();
                                score += a.type === 'tank' ? 50 : a.type === 'runner' ? 25 : 10;
                                if (Math.random() < 0.09) pickups.push({ x: a.x, y: a.y, kind: 'hp', life: 8 });
                                if (kills >= quota && !aliens.length) return done(true, ['区域肃清！', `击杀 ${kills} · 剩余 HP ${hp}`]);
                            }
                            break;
                        }
                    }
                }
                // 异形
                for (const a of aliens) {
                    const d = Math.hypot(px - a.x, py - a.y) || 1;
                    a.x += (px - a.x) / d * a.v * dt; a.y += (py - a.y) / d * a.v * dt;
                    a.hitT -= dt;
                    if (d < a.r + 12) {
                        hp -= (a.type === 'tank' ? 18 : 8) * dt * 3.2;
                        if (hp > 0) shake = 4.5;
                        if (hp <= 0) return done(false, ['你被异形吞没了…', `击杀 ${kills}/${quota}`]);
                    }
                }
                // 血包
                for (let i = pickups.length - 1; i >= 0; i--) {
                    const p = pickups[i]; p.life -= dt;
                    if (p.life <= 0) { pickups.splice(i, 1); continue; }
                    if (Math.hypot(p.x - px, p.y - py) < 20) { hp = Math.min(100, hp + 25); pickups.splice(i, 1); }
                }
                for (let i = parts.length - 1; i >= 0; i--) {
                    const p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
                    if (p.life <= 0) parts.splice(i, 1);
                }
                draw();
                opts.onScore && opts.onScore(`击杀 ${kills}/${quota} · HP ${Math.max(0, Math.round(hp))}`);
            }
            function draw() {
                const g = ctx.createLinearGradient(0, 0, W, H);
                g.addColorStop(0, '#1c222b'); g.addColorStop(1, '#0b0e13');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                // 受击抖动（只作用于战场，不影响 HUD）
                ctx.save();
                if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - 0.7); }
                // 地面瓷砖纹理
                const T = 42;
                for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
                    ctx.fillStyle = ((x / T + y / T) & 1) ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.10)';
                    ctx.fillRect(x, y, T, T);
                }
                ctx.strokeStyle = 'rgba(90,110,140,.10)'; ctx.lineWidth = 1;
                for (let x = 0; x <= W; x += T) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
                for (let y = 0; y <= H; y += T) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
                // 地面血迹（持久）
                for (const d of decals) { ctx.globalAlpha = d.a; ctx.fillStyle = '#641c22'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.66, 0, 0, Math.PI * 2); ctx.fill(); }
                ctx.globalAlpha = 1;
                // 血包
                for (const p of pickups) {
                    ctx.fillStyle = '#5ad48a'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('✚', p.x, p.y + 6);
                }
                // 异形（俯视：落地阴影 + 身体渐变 + 红眼 + 利爪/背刺/触须）
                for (const a of aliens) {
                    const ea = Math.atan2(py - a.y, px - a.x);
                    const flash = a.hitT > 0;
                    const body = flash ? '#ffffff' : a.c;
                    // 落地阴影
                    ctx.fillStyle = 'rgba(0,0,0,0.32)';
                    ctx.beginPath(); ctx.ellipse(a.x, a.y + a.r * 0.55, a.r * 0.95, a.r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ea);
                    const R = a.r;
                    if (a.type === 'tank') {
                        // 肩甲尖刺
                        ctx.fillStyle = flash ? '#fff' : shade('#7c2d99', 0.1);
                        for (const k of [-1, 1]) {
                            ctx.beginPath(); ctx.moveTo(-R * 0.3, k * R * 0.7); ctx.lineTo(-R - 9, k * R * 0.95); ctx.lineTo(-R * 0.2, k * R * 0.95); ctx.closePath(); ctx.fill();
                        }
                        // 粗短双臂
                        ctx.strokeStyle = flash ? '#fff' : shade(body, -0.1); ctx.lineWidth = 5; ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(R * 0.2, -R * 0.6); ctx.lineTo(R * 0.95, -R * 0.9); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(R * 0.2, R * 0.6); ctx.lineTo(R * 0.95, R * 0.9); ctx.stroke();
                    } else if (a.type === 'runner') {
                        // 蜘蛛状细腿（4 条，随速度摆动）
                        ctx.strokeStyle = flash ? '#fff' : shade(body, -0.05); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
                        for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
                            const ph = Math.sin(t * 16 + k + s) * 3;
                            const bx = -R * 0.2 + k * R * 0.5;
                            ctx.beginPath(); ctx.moveTo(bx, s * R * 0.5); ctx.lineTo(bx - 6, s * (R + 6 + ph)); ctx.stroke();
                            ctx.beginPath(); ctx.moveTo(bx, s * R * 0.5); ctx.lineTo(bx + 6, s * (R + 6 - ph)); ctx.stroke();
                        }
                    } else {
                        // 小怪：两条前爪 + 后方触须
                        ctx.strokeStyle = flash ? '#fff' : shade(body, -0.1); ctx.lineWidth = 3; ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(R * 0.3, -R * 0.4); ctx.lineTo(R + 4, -R * 0.7); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(R * 0.3, R * 0.4); ctx.lineTo(R + 4, R * 0.7); ctx.stroke();
                        for (let k = 0; k < 4; k++) {
                            const ta = Math.PI * (0.35 + k * 0.43) + Math.PI;
                            ctx.beginPath(); ctx.moveTo(Math.cos(ta) * R * 0.7, Math.sin(ta) * R * 0.7);
                            ctx.lineTo(Math.cos(ta) * (R + 6), Math.sin(ta) * (R + 6)); ctx.stroke();
                        }
                    }
                    // 身体
                    ctx.beginPath();
                    ctx.ellipse(0, 0, R, R * (a.type === 'runner' ? 0.78 : 0.9), 0, 0, Math.PI * 2);
                    const ag = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.15, 0, 0, R);
                    ag.addColorStop(0, flash ? '#ffffff' : shade(body, 0.32));
                    ag.addColorStop(1, flash ? '#dde6ff' : shade(body, -0.4));
                    ctx.fillStyle = ag; ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
                    // 背部纹理
                    if (a.type !== 'runner') {
                        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.4;
                        ctx.beginPath(); ctx.moveTo(-R * 0.5, 0); ctx.lineTo(R * 0.1, 0); ctx.stroke();
                    }
                    // 血盆大口（前端）
                    ctx.beginPath(); ctx.arc(R * 0.72, 0, R * 0.32, 0, Math.PI * 2);
                    ctx.fillStyle = '#2a0d12'; ctx.fill();
                    ctx.fillStyle = '#e8dddd';
                    for (const s of [-1, 1]) {
                        ctx.beginPath(); ctx.moveTo(R * 0.95, s * 2.6); ctx.lineTo(R * 0.55, s * 4.8); ctx.lineTo(R * 0.55, s * 1.4); ctx.closePath(); ctx.fill();
                    }
                    // 红眼（带光晕，盯人）
                    ctx.fillStyle = 'rgba(255,60,60,0.30)';
                    ctx.beginPath(); ctx.arc(R * 0.34, -R * 0.32, 4.2, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(R * 0.34, R * 0.32, 4.2, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#ff3b3b';
                    ctx.beginPath(); ctx.arc(R * 0.36, -R * 0.32, 2.3, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(R * 0.36, R * 0.32, 2.3, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#ffd0d0';
                    ctx.beginPath(); ctx.arc(R * 0.46, -R * 0.36, 0.9, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(R * 0.46, R * 0.36, 0.9, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    if (a.maxHp > 1) { // 血条
                        ctx.fillStyle = '#333'; ctx.fillRect(a.x - a.r, a.y - a.r - 9, a.r * 2, 4);
                        ctx.fillStyle = '#e94f4f'; ctx.fillRect(a.x - a.r, a.y - a.r - 9, a.r * 2 * (a.hp / a.maxHp), 4);
                    }
                }
                // 子弹：曳光弹（拖尾 + 亮头）
                for (const b of bullets) {
                    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
                    ctx.strokeStyle = 'rgba(255,232,120,0.75)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * 8, b.y - uy * 8); ctx.stroke();
                    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.6, 0, Math.PI * 2); ctx.fill();
                }
                // 粒子（方块碎屑 + 圆形血滴）
                for (const p of parts) {
                    ctx.globalAlpha = Math.max(0, p.life * 2.2);
                    if (p.kind === 'blood') { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 2, 0, Math.PI * 2); ctx.fill(); }
                    else { ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
                }
                ctx.globalAlpha = 1;
                // 玩家：俯视士兵（影子 → 摆腿 → 身体防弹背心 → 双手持枪 → 头盔 → 枪口焰）
                const ang = Math.atan2(aim.y - py, aim.x - px);
                drawSoldier(px, py, ang);
                ctx.restore();  // 结束战场抖动包裹
                // 触屏常驻提示：左下移动区 / 右下射击区
                if (isTouch) {
                    ctx.save();
                    ctx.globalAlpha = 0.22; ctx.strokeStyle = '#cfe3ff'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
                    ctx.beginPath(); ctx.arc(64, H - 64, 40, 0, Math.PI * 2); ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 0.5; ctx.fillStyle = '#cfe3ff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('✥ 移动', 64, H - 108);
                    ctx.fillText('🎯 射击', W - 70, H - 108);
                    ctx.restore();
                }
                // 虚拟摇杆（按住左半屏时显示）
                if (joyId !== null) {
                    ctx.save();
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath(); ctx.arc(joyCX, joyCY, 42, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(20,30,45,0.45)'; ctx.fill();
                    ctx.strokeStyle = '#9fc4ef'; ctx.lineWidth = 2.5; ctx.stroke();
                    const kl = Math.hypot(joyVx, joyVy) || 1;
                    const kx = joyCX + (joyVx / kl) * Math.min(1, kl) * 42, ky = joyCY + (joyVy / kl) * Math.min(1, kl) * 42;
                    ctx.beginPath(); ctx.arc(kx, ky, 18, 0, Math.PI * 2);
                    const kg = ctx.createRadialGradient(kx - 5, ky - 5, 3, kx, ky, 18);
                    kg.addColorStop(0, '#e8f3ff'); kg.addColorStop(1, '#5b83b8');
                    ctx.fillStyle = kg; ctx.fill();
                    ctx.strokeStyle = '#dceaff'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.restore();
                }
                // 开场操作提示
                if (t < 4) {
                    ctx.globalAlpha = Math.min(1, (4 - t) / 1.2);
                    ctx.fillStyle = '#cfe3ff'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('WASD / 方向键 移动 · 鼠标瞄准按住扫射（手机：左半屏移动，右半屏射击）', W / 2, H - 14);
                    ctx.globalAlpha = 1;
                }
                // 血条
                ctx.fillStyle = '#333'; ctx.fillRect(8, 8, 120, 10);
                ctx.fillStyle = hp > 40 ? '#5ad48a' : '#ff7b7b'; ctx.fillRect(8, 8, 120 * Math.max(0, hp / 100), 10);
            }
            function drawSoldier(x, y, ang) {
                // 影子
                ctx.beginPath(); ctx.ellipse(x, y + 5, 14, 7, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fill();
                ctx.save();
                ctx.translate(x, y); ctx.rotate(ang);
                const step = Math.sin(walkT) * 3.2;
                // 双腿 + 军靴
                ctx.fillStyle = '#23252b';
                ctx.beginPath(); ctx.ellipse(step, -6, 4.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-step, 6, 4.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#15171c';
                ctx.fillRect(step - 3, -8.5, 6, 3); ctx.fillRect(-step - 3, 4.5, 6, 3);
                // 双臂（持枪姿态，向前伸）
                ctx.strokeStyle = '#5d6b4a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(2, -7); ctx.lineTo(14, -4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(2, 7); ctx.lineTo(14, 4); ctx.stroke();
                // 手
                ctx.fillStyle = '#d9a877';
                ctx.beginPath(); ctx.arc(14, -4, 2.7, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(14, 4, 2.7, 0, Math.PI * 2); ctx.fill();
                // 步枪（枪托 + 机匣 + 枪管 + 弹匣 + 导轨高光）
                ctx.fillStyle = '#2b2c26'; ctx.fillRect(7, -2.4, 16, 4.8);
                ctx.fillStyle = '#3a352c'; ctx.fillRect(2, -2.8, 6, 5.6);
                ctx.fillStyle = '#1f201b'; ctx.fillRect(23, -1.5, 9, 3);
                ctx.fillStyle = '#2e2f28'; ctx.fillRect(12, 2, 4, 8);
                ctx.fillStyle = '#4a463a'; ctx.fillRect(7, -3, 16, 1.2);
                // 身体（战术背心）
                ctx.beginPath(); ctx.ellipse(0, 0, 11.5, 9.5, 0, 0, Math.PI * 2);
                const bg = ctx.createRadialGradient(-2, -3, 2, 0, 1, 14);
                bg.addColorStop(0, '#7e8f5e'); bg.addColorStop(1, '#3c482c');
                ctx.fillStyle = bg; ctx.fill();
                ctx.strokeStyle = '#232c19'; ctx.lineWidth = 1.6; ctx.stroke();
                // 背心绑带 + 弹匣包
                ctx.strokeStyle = '#2c3520'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(-4, -8.5); ctx.lineTo(-4, 8.5); ctx.moveTo(4, -9); ctx.lineTo(4, 9); ctx.stroke();
                ctx.fillStyle = '#2a3320'; ctx.fillRect(-7, -1, 4, 5);
                // 肩甲
                ctx.fillStyle = '#5d6b4a';
                ctx.beginPath(); ctx.ellipse(-2, -9.5, 4.2, 3, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-2, 9.5, 4.2, 3, 0, 0, Math.PI * 2); ctx.fill();
                // 头盔 + 护目镜
                ctx.beginPath(); ctx.arc(1, 0, 6.4, 0, Math.PI * 2);
                const hg = ctx.createRadialGradient(-1, -2, 1.5, 1, 0, 7.5);
                hg.addColorStop(0, '#737f52'); hg.addColorStop(1, '#363f27');
                ctx.fillStyle = hg; ctx.fill();
                ctx.strokeStyle = '#20261a'; ctx.lineWidth = 1.4; ctx.stroke();
                ctx.strokeStyle = '#20261a'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(1, 0, 6.4, -0.9, 0.9); ctx.stroke();
                ctx.fillStyle = '#0e141b'; ctx.fillRect(3.6, -2.6, 2.8, 5.2);
                ctx.fillStyle = 'rgba(120,255,170,0.55)'; ctx.fillRect(3.9, -2.2, 2.2, 4.4);
                // 枪口焰（含辉光）
                if (muzzle > 0) {
                    const mg = ctx.createRadialGradient(33, 0, 1, 33, 0, 12);
                    mg.addColorStop(0, 'rgba(255,240,170,0.9)'); mg.addColorStop(1, 'rgba(255,180,60,0)');
                    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(33, 0, 12, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = 'rgba(255,226,122,0.95)';
                    ctx.beginPath(); ctx.moveTo(33, 0); ctx.lineTo(27, -5); ctx.lineTo(25, 0); ctx.lineTo(27, 5); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(30, 0, 2.4, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
            function setPos(e) {
                const r = cvs.getBoundingClientRect();
                aim = { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
            }
            // 移动端：左半屏=移动摇杆，右半屏=瞄准开火；PC：WASD 移动，按住鼠标扫射
            let firingId = null;
            function onKey(e, down) {
                const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
                if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
                    if (down) keys.add(k); else keys.delete(k);
                    e.preventDefault();
                }
            }
            const kd = e => onKey(e, true), ku = e => onKey(e, false);
            window.addEventListener('keydown', kd);
            window.addEventListener('keyup', ku);
            cvs.addEventListener('pointerdown', e => {
                const r = cvs.getBoundingClientRect();
                const lx = (e.clientX - r.left) * (W / r.width);
                if (e.pointerType !== 'mouse') isTouch = true;
                if (e.pointerType !== 'mouse' && lx < W * 0.4) {
                    // 移动摇杆
                    joyId = e.pointerId;
                    joyOx = e.clientX; joyOy = e.clientY; joyVx = 0; joyVy = 0;
                    joyCX = lx; joyCY = (e.clientY - r.top) * (H / r.height);
                } else {
                    firingId = e.pointerId; firing = true; setPos(e);
                }
            });
            cvs.addEventListener('pointermove', e => {
                if (e.pointerId === joyId) {
                    const dx = e.clientX - joyOx, dy = e.clientY - joyOy;
                    const d = Math.hypot(dx, dy), max = 42;
                    const f = d > max ? max / d : 1;
                    joyVx = dx * f / max; joyVy = dy * f / max;
                } else setPos(e);
            });
            const endPtr = e => {
                if (e.pointerId === joyId) { joyId = null; joyVx = 0; joyVy = 0; }
                if (e.pointerId === firingId) { firingId = null; firing = false; }
            };
            cvs.addEventListener('pointerup', endPtr);
            cvs.addEventListener('pointercancel', endPtr);
            cvs.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') firing = false; });
            draw();
            const timer = setInterval(step, 30);
            return { stop() { clearInterval(timer); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); } };
        },
    };
})();
