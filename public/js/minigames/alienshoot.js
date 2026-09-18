// 孤胆枪手：俯视角射击，持枪扫射异形潮，击杀配额推进关卡
// 大地图版：草地地表 + 散布建筑（带碰撞）+ 相机跟随玩家滚动
window.MiniGames = window.MiniGames || {};
(function () {
    const W = 420, H = 560;
    const WORLD_W = 1260, WORLD_H = 1680;          // 大地图：约 3×3 个屏幕
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
    // 确定性随机（让每关的地图布局稳定不抖动）
    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    MiniGames.alienshoot = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const quota = 10 + idx * 2;
            const spawnInt = Math.max(0.42, 1.25 - idx * 0.016);
            const spd = 52 + idx * 1.4;
            let px = WORLD_W / 2, py = WORLD_H / 2, hp = 100, kills = 0, over = false, t = 0;
            let aliens = [], bullets = [], parts = [], pickups = [], decals = [], shake = 0;
            const cam = { x: px - W / 2, y: py - H / 2 };
            let aimScreen = { x: W / 2, y: H / 2 };   // 准星（屏幕坐标），世界目标 = 屏幕 + 相机
            let firing = false, cool = 0, spawnT = 0, wave = 0, score = 0;
            // 移动：键盘 + 移动端左半屏虚拟摇杆
            const keys = new Set();
            let walkT = 0, muzzle = 0;
            let joyId = null, joyOx = 0, joyOy = 0, joyVx = 0, joyVy = 0;
            let joyCX = 0, joyCY = 0, isTouch = false;   // 摇杆绘制（屏幕坐标）与触屏标记

            container.innerHTML = '';
            const cvs = document.createElement('canvas');
            cvs.width = W; cvs.height = H;
            cvs.style.cssText = 'max-width:100%;max-height:100%;touch-action:none;cursor:crosshair;';
            container.appendChild(cvs);
            const ctx = cvs.getContext('2d');
            try { MG.audio.unlock(); } catch (e) {}

            const done = (win, lines) => {
                if (over) return; over = true; clearInterval(timer);
                opts.onComplete && opts.onComplete({ win, stars: win ? (hp >= 80 ? 3 : hp >= 45 ? 2 : 1) : 0, lines });
            };

            // ---- 大地图：建筑 + 地表细节（确定性生成，随关卡布局变化） ----
            const buildings = [];
            const grass = [];
            const barrels = [];
            const paths = [];
            const casings = [];
            const rng = mulberry32(1337 + idx * 97);
            (function genWorld() {
                const cx0 = WORLD_W / 2, cy0 = WORLD_H / 2;
                // 主干道（泥土地面，军用基地通道感）
                paths.push({ x1: cx0, y1: 40, x2: cx0, y2: WORLD_H - 40, w: 48 });
                paths.push({ x1: 40, y1: cy0, x2: WORLD_W - 40, y2: cy0, w: 48 });
                const types = ['bunker', 'barracks', 'tent', 'crate', 'sandbag'];
                const n = 8 + (idx % 4);
                let placed = 0, guard = 0;
                while (placed < n && guard++ < 200) {
                    const w = 64 + rng() * 86, h = 54 + rng() * 66;
                    const x = 50 + rng() * (WORLD_W - 100 - w);
                    const y = 50 + rng() * (WORLD_H - 100 - h);
                    const cx = x + w / 2, cy = y + h / 2;
                    if (Math.abs(cx - WORLD_W / 2) < 160 && Math.abs(cy - WORLD_H / 2) < 160) continue; // 避开出生点
                    buildings.push({ x, y, w, h, type: types[(rng() * types.length) | 0] });
                    // 建筑连到主干道的支路
                    paths.push({ x1: cx, y1: cy, x2: cx0 + (rng() - 0.5) * 140, y2: cy0 + (rng() - 0.5) * 140, w: 22 });
                    placed++;
                }
                // 油桶（可碰撞掩体）
                const nb = 10 + (idx % 5);
                for (let i = 0; i < nb; i++) {
                    const x = 60 + rng() * (WORLD_W - 120), y = 60 + rng() * (WORLD_H - 120);
                    if (Math.abs(x - cx0) < 90 && Math.abs(y - cy0) < 90) continue;
                    barrels.push({ x, y, r: 11 });
                }
                // 地表：草叶 / 泥斑 / 碎石（散布整个世界，仅绘制可见部分）
                const m = 1500;
                for (let i = 0; i < m; i++) {
                    const gx = rng() * WORLD_W, gy = rng() * WORLD_H;
                    const k = rng();
                    const type = k < 0.55 ? 'blade' : k < 0.8 ? 'dirt' : 'rock';
                    const s = type === 'blade' ? 3 + rng() * 4 : type === 'dirt' ? 5 + rng() * 12 : 1.5 + rng() * 2.5;
                    grass.push({ x: gx, y: gy, type, s, tone: rng() });
                }
                // 弹壳（静态散布，增加战地细节）
                for (let i = 0; i < 220; i++) casings.push({ x: rng() * WORLD_W, y: rng() * WORLD_H, a: rng() * Math.PI });
            })();

            // 把对象 o（含 x,y）推出建筑 AABB（简单最小穿透轴回弹）
            function collide(o, r) {
                for (const b of buildings) {
                    const ex0 = b.x - r, ey0 = b.y - r, ex1 = b.x + b.w + r, ey1 = b.y + b.h + r;
                    if (o.x > ex0 && o.x < ex1 && o.y > ey0 && o.y < ey1) {
                        const dl = o.x - ex0, dr = ex1 - o.x, dt = o.y - ey0, db = ey1 - o.y;
                        const mm = Math.min(dl, dr, dt, db);
                        if (mm === dl) o.x = ex0; else if (mm === dr) o.x = ex1;
                        else if (mm === dt) o.y = ey0; else o.y = ey1;
                    }
                }
                for (const b of barrels) {
                    const ex0 = b.x - r, ey0 = b.y - r, ex1 = b.x + r, ey1 = b.y + r;
                    if (o.x > ex0 && o.x < ex1 && o.y > ey0 && o.y < ey1) {
                        const dl = o.x - ex0, dr = ex1 - o.x, dt = o.y - ey0, db = ey1 - o.y;
                        const mm = Math.min(dl, dr, dt, db);
                        if (mm === dl) o.x = ex0; else if (mm === dr) o.x = ex1;
                        else if (mm === dt) o.y = ey0; else o.y = ey1;
                    }
                }
            }

            function spawn() {
                wave++;
                const boss = wave % Math.max(3, 8 - Math.floor(idx / 10)) === 0;
                const ang = Math.random() * Math.PI * 2;
                const dist = Math.max(W, H) * 0.64;   // 在视口外环绕生成（像原版跟着玩家刷怪）
                let x = px + Math.cos(ang) * dist, y = py + Math.sin(ang) * dist;
                x = Math.max(20, Math.min(WORLD_W - 20, x));
                y = Math.max(20, Math.min(WORLD_H - 20, y));
                const type = boss ? 'tank' : Math.random() < 0.25 ? 'runner' : 'grunt';
                const st = { grunt: { r: 13, hp: 1, v: spd, c: '#7fae4a' }, runner: { r: 10, hp: 1, v: spd * 1.7, c: '#d8c24a' }, tank: { r: 22, hp: 5 + Math.floor(idx / 12), v: spd * 0.55, c: '#b04ad8' } }[type];
                const a = { x, y, type, ...st, maxHp: st.hp, hitT: 0 };
                collide(a, st.r);
                aliens.push(a);
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
                    px = Math.max(16, Math.min(WORLD_W - 16, px + dx * 175 * dt));
                    py = Math.max(16, Math.min(WORLD_H - 16, py + dy * 175 * dt));
                    walkT += dt * 11;
                } else walkT += dt * 2.2;
                const P = { x: px, y: py }; collide(P, 14); px = P.x; py = P.y;   // 建筑碰撞
                // 相机跟随（夹在世界范围内）
                cam.x = Math.max(0, Math.min(WORLD_W - W, px - W / 2));
                cam.y = Math.max(0, Math.min(WORLD_H - H, py - H / 2));
                // 射击（目标 = 屏幕准星 + 相机）
                const aimWX = aimScreen.x + cam.x, aimWY = aimScreen.y + cam.y;
                if (firing && cool <= 0) {
                    const a = Math.atan2(aimWY - py, aimWX - px);
                    bullets.push({ x: px + Math.cos(a) * 22, y: py + Math.sin(a) * 22, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620 });
                    cool = 0.13; muzzle = 0.06;
                    try { MG.audio.sfx('launch'); } catch (e) {}
                }
                if (spawnT <= 0) { spawn(); spawnT = spawnInt * (0.7 + Math.random() * 0.6); }
                // 子弹
                for (let i = bullets.length - 1; i >= 0; i--) {
                    const b = bullets[i];
                    b.x += b.vx * dt; b.y += b.vy * dt;
                    if (b.x < -40 || b.x > WORLD_W + 40 || b.y < -40 || b.y > WORLD_H + 40 || Math.hypot(b.x - px, b.y - py) > 1100) { bullets.splice(i, 1); continue; }
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
                    collide(a, a.r);
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

            function drawBuilding(b) {
                const { x, y, w, h, type } = b;
                // 落地阴影
                ctx.fillStyle = 'rgba(0,0,0,0.26)';
                ctx.fillRect(x + 4, y + 5, w, h);
                if (type === 'crate') {
                    ctx.fillStyle = '#7a5a32'; ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = '#3c2c18'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
                    ctx.strokeStyle = 'rgba(60,40,20,0.7)'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
                    ctx.fillStyle = 'rgba(255,220,160,0.15)'; ctx.fillRect(x + 2, y + 2, w - 4, 4);
                } else if (type === 'sandbag') {
                    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
                        const bx = x + i * (w / 3), by = y + j * (h / 2);
                        ctx.fillStyle = (i + j) % 2 ? '#9a8a5e' : '#86784f';
                        ctx.beginPath(); ctx.ellipse(bx + w / 6, by + h / 4, w / 6, h / 4, 0, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = 'rgba(40,35,20,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                    }
                } else {
                    // 墙体
                    const wg = ctx.createLinearGradient(x, y, x, y + h);
                    wg.addColorStop(0, '#8a8276'); wg.addColorStop(1, '#5f584c');
                    ctx.fillStyle = wg; ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = '#3a352c'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
                    // 屋顶
                    ctx.fillStyle = type === 'tent' ? '#6b7d4a' : (type === 'bunker' ? '#4d5560' : '#7a6f5a');
                    const inset = type === 'bunker' ? 8 : type === 'tent' ? 0 : 10;
                    ctx.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
                    // 门
                    ctx.fillStyle = '#2a261f';
                    const dw = Math.min(20, w * 0.3), dh = Math.min(22, h * 0.4);
                    ctx.fillRect(x + w / 2 - dw / 2, y + h - dh, dw, dh);
                    // 窗
                    if (type !== 'tent') {
                        ctx.fillStyle = '#1c2a30';
                        const ww = Math.min(14, w * 0.25), wh = Math.min(14, h * 0.25);
                        ctx.fillRect(x + 8, y + 8, ww, wh);
                        ctx.fillRect(x + w - 8 - ww, y + 8, ww, wh);
                    }
                    // 顶部高光
                    ctx.strokeStyle = 'rgba(255,240,210,0.18)'; ctx.lineWidth = 1.5;
                    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
                }
            }

            function draw() {
                // 屏幕底色（战场外）
                ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, W, H);

                const aimWX = aimScreen.x + cam.x, aimWY = aimScreen.y + cam.y;

                ctx.save();
                // 相机 + 受击抖动
                const shx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
                const shy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
                if (shake > 0) shake = Math.max(0, shake - 0.7);
                ctx.translate(-cam.x + shx, -cam.y + shy);

                // 可见区域（世界坐标）
                const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + W, vy1 = cam.y + H;

                // 草地底色
                const gg = ctx.createLinearGradient(0, vy0, 0, vy1);
                gg.addColorStop(0, '#3f5a32'); gg.addColorStop(1, '#324827');
                ctx.fillStyle = gg; ctx.fillRect(vx0, vy0, W, H);

                // 泥土地面通道（军用基地支路，带边线）
                ctx.lineCap = 'round';
                for (const p of paths) {
                    ctx.strokeStyle = 'rgba(70,58,40,0.6)'; ctx.lineWidth = p.w + 6;
                    ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
                    ctx.strokeStyle = 'rgba(126,104,68,0.5)'; ctx.lineWidth = p.w;
                    ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
                }

                // 地表细节（仅可见）
                for (const d of grass) {
                    if (d.x < vx0 - 20 || d.x > vx1 + 20 || d.y < vy0 - 20 || d.y > vy1 + 20) continue;
                    if (d.type === 'blade') {
                        ctx.strokeStyle = d.tone < 0.5 ? 'rgba(125,165,82,0.5)' : 'rgba(88,128,58,0.5)';
                        ctx.lineWidth = 1.2;
                        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + (d.tone - 0.5) * 3, d.y - d.s); ctx.stroke();
                    } else if (d.type === 'dirt') {
                        ctx.fillStyle = 'rgba(92,70,44,0.32)';
                        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.s, d.s * 0.7, 0, 0, Math.PI * 2); ctx.fill();
                    } else {
                        ctx.fillStyle = 'rgba(150,150,140,0.4)';
                        ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, Math.PI * 2); ctx.fill();
                    }
                }

                // 弹壳（静态散布，战地细节）
                for (const c of casings) {
                    if (c.x < vx0 - 10 || c.x > vx1 + 10 || c.y < vy0 - 10 || c.y > vy1 + 10) continue;
                    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
                    ctx.fillStyle = 'rgba(205,175,95,0.7)'; ctx.fillRect(-2, -0.8, 4, 1.6);
                    ctx.restore();
                }

                // 世界边界（石墙围栏）
                ctx.strokeStyle = 'rgba(60,55,45,0.9)'; ctx.lineWidth = 6;
                ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
                ctx.strokeStyle = 'rgba(120,110,90,0.45)'; ctx.lineWidth = 2;
                ctx.strokeRect(3, 3, WORLD_W - 6, WORLD_H - 6);

                // 油桶（可碰撞掩体）
                for (const b of barrels) {
                    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(b.x + 2, b.y + 4, b.r, b.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
                    const bg = ctx.createLinearGradient(b.x - b.r, b.y, b.x + b.r, b.y);
                    bg.addColorStop(0, '#9a4b2e'); bg.addColorStop(0.5, '#c8703c'); bg.addColorStop(1, '#7a3a22');
                    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#3a1c10'; ctx.lineWidth = 1.4; ctx.stroke();
                    ctx.strokeStyle = 'rgba(40,20,10,0.6)'; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.ellipse(b.x, b.y - b.r * 0.3, b.r * 0.8, b.r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.ellipse(b.x, b.y + b.r * 0.3, b.r * 0.8, b.r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
                }

                // 建筑
                for (const b of buildings) drawBuilding(b);

                // 地面血迹（持久）
                for (const d of decals) { ctx.globalAlpha = d.a; ctx.fillStyle = '#5e1c20'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.66, 0, 0, Math.PI * 2); ctx.fill(); }
                ctx.globalAlpha = 1;

                // 血包
                for (const p of pickups) {
                    ctx.fillStyle = 'rgba(90,212,138,0.18)'; ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#5ad48a'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✚', p.x, p.y + 6);
                }

                // 异形（俯视：地面能量辉光 + 落地阴影 + 身体渐变 + 红眼辉光 + 利爪/背刺/触须）
                for (const a of aliens) {
                    const ea = Math.atan2(py - a.y, px - a.x);
                    const flash = a.hitT > 0;
                    const body = flash ? '#ffffff' : a.c;
                    // 地面能量辉光（原版异形自带微光）
                    ctx.save();
                    ctx.globalAlpha = 0.5;
                    const eg = ctx.createRadialGradient(a.x, a.y, 2, a.x, a.y, a.r * 1.9);
                    eg.addColorStop(0, flash ? 'rgba(255,255,255,0.5)' : 'rgba(255,80,60,0.38)');
                    eg.addColorStop(1, 'rgba(255,80,60,0)');
                    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 1.9, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    // 落地阴影
                    ctx.fillStyle = 'rgba(0,0,0,0.32)';
                    ctx.beginPath(); ctx.ellipse(a.x, a.y + a.r * 0.55, a.r * 0.95, a.r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ea);
                    const R = a.r;
                    if (a.type === 'tank') {
                        // 肩甲尖刺（更粗更长）
                        ctx.fillStyle = flash ? '#fff' : shade('#7c2d99', 0.1);
                        for (const k of [-1, 1]) {
                            ctx.beginPath(); ctx.moveTo(-R * 0.3, k * R * 0.7); ctx.lineTo(-R - 11, k * R * 1.0); ctx.lineTo(-R * 0.15, k * R * 1.0); ctx.closePath(); ctx.fill();
                        }
                        // 核心能量（发光）
                        ctx.save(); ctx.shadowColor = 'rgba(255,120,200,0.9)'; ctx.shadowBlur = 12;
                        ctx.fillStyle = '#ff7ad0'; ctx.beginPath(); ctx.arc(-R * 0.1, 0, R * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                        // 粗短双臂
                        ctx.strokeStyle = flash ? '#fff' : shade(body, -0.1); ctx.lineWidth = 6; ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(R * 0.2, -R * 0.6); ctx.lineTo(R * 1.0, -R * 0.95); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(R * 0.2, R * 0.6); ctx.lineTo(R * 1.0, R * 0.95); ctx.stroke();
                    } else if (a.type === 'runner') {
                        // 蜘蛛状细腿（6 条，随速度摆动）
                        ctx.strokeStyle = flash ? '#fff' : shade(body, -0.05); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
                        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
                            const ph = Math.sin(t * 18 + k + s) * 3;
                            const bx = -R * 0.3 + k * R * 0.4;
                            ctx.beginPath(); ctx.moveTo(bx, s * R * 0.5); ctx.lineTo(bx - 7, s * (R + 7 + ph)); ctx.stroke();
                            ctx.beginPath(); ctx.moveTo(bx, s * R * 0.5); ctx.lineTo(bx + 7, s * (R + 7 - ph)); ctx.stroke();
                        }
                        // 发光腹部
                        ctx.save(); ctx.shadowColor = 'rgba(255,210,80,0.8)'; ctx.shadowBlur = 8;
                        ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(-R * 0.3, 0, R * 0.25, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                    } else {
                        // 小怪：两条前爪（长，伸向玩家）+ 后方触须
                        ctx.strokeStyle = flash ? '#fff' : shade(body, -0.1); ctx.lineWidth = 3.4; ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(R * 0.3, -R * 0.4); ctx.lineTo(R + 7, -R * 0.75); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(R * 0.3, R * 0.4); ctx.lineTo(R + 7, R * 0.75); ctx.stroke();
                        for (let k = 0; k < 4; k++) {
                            const ta = Math.PI * (0.35 + k * 0.43) + Math.PI;
                            ctx.beginPath(); ctx.moveTo(Math.cos(ta) * R * 0.7, Math.sin(ta) * R * 0.7);
                            ctx.lineTo(Math.cos(ta) * (R + 7), Math.sin(ta) * (R + 7)); ctx.stroke();
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
                    ctx.beginPath(); ctx.arc(R * 0.72, 0, R * 0.34, 0, Math.PI * 2);
                    ctx.fillStyle = '#2a0d12'; ctx.fill();
                    ctx.fillStyle = '#e8dddd';
                    for (const s of [-1, 1]) {
                        ctx.beginPath(); ctx.moveTo(R * 0.98, s * 3.2); ctx.lineTo(R * 0.55, s * 5.4); ctx.lineTo(R * 0.55, s * 1.6); ctx.closePath(); ctx.fill();
                    }
                    // 红眼（带辉光，盯人）
                    ctx.save(); ctx.shadowColor = 'rgba(255,60,60,0.9)'; ctx.shadowBlur = 7;
                    ctx.fillStyle = 'rgba(255,60,60,0.35)';
                    ctx.beginPath(); ctx.arc(R * 0.34, -R * 0.32, 4.6, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(R * 0.34, R * 0.32, 4.6, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#ff3b3b';
                    ctx.beginPath(); ctx.arc(R * 0.36, -R * 0.32, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(R * 0.36, R * 0.32, 2.5, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    ctx.fillStyle = '#ffd0d0';
                    ctx.beginPath(); ctx.arc(R * 0.46, -R * 0.36, 1.0, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(R * 0.46, R * 0.36, 1.0, 0, Math.PI * 2); ctx.fill();
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

                // 枪口闪光照亮周围（场景级暖光）
                if (muzzle > 0) {
                    const ang = Math.atan2(aimWY - py, aimWX - px);
                    const mx = px + Math.cos(ang) * 33, my = py + Math.sin(ang) * 33;
                    const mg = ctx.createRadialGradient(mx, my, 2, mx, my, 64);
                    mg.addColorStop(0, 'rgba(255,225,140,0.35)'); mg.addColorStop(1, 'rgba(255,180,60,0)');
                    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 64, 0, Math.PI * 2); ctx.fill();
                }
                // 玩家：俯视士兵
                drawSoldier(px, py, Math.atan2(aimWY - py, aimWX - px));

                // 玩家手电/环境光：以玩家为中心的径向暗角，营造纵深
                const fg = ctx.createRadialGradient(px, py, 80, px, py, 430);
                fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,0.42)');
                ctx.fillStyle = fg; ctx.fillRect(px - 460, py - 460, 920, 920);

                ctx.restore();  // 结束相机/抖动包裹

                // ===== 屏幕 HUD =====
                // 轻微暗角（聚焦战场中心）
                const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.78);
                vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.34)');
                ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

                // 小地图（右上角）
                const MM = 92, mx0 = W - MM - 8, my0 = 8, sx = MM / WORLD_W, sy = MM / WORLD_H;
                ctx.fillStyle = 'rgba(8,16,10,0.66)'; ctx.fillRect(mx0, my0, MM, MM);
                ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(mx0 + .5, my0 + .5, MM - 1, MM - 1);
                ctx.fillStyle = '#6b6356';
                for (const b of buildings) ctx.fillRect(mx0 + b.x * sx, my0 + b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
                ctx.fillStyle = 'rgba(255,91,91,0.9)';
                for (const a of aliens) ctx.fillRect(mx0 + a.x * sx - 1, my0 + a.y * sy - 1, 2, 2);
                ctx.fillStyle = '#ff8b3b';
                for (const p of pickups) ctx.fillRect(mx0 + p.x * sx - 1, my0 + p.y * sy - 1, 2, 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
                ctx.strokeRect(mx0 + cam.x * sx, my0 + cam.y * sy, W * sx, H * sy);
                ctx.fillStyle = '#7dff7d'; ctx.fillRect(mx0 + px * sx - 1.5, my0 + py * sy - 1.5, 3, 3);
                ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
                ctx.fillText('地图', mx0 + 2, my0 + MM - 4);

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
                // 准星（屏幕坐标）
                ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(aimScreen.x, aimScreen.y, 8, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(aimScreen.x - 12, aimScreen.y); ctx.lineTo(aimScreen.x - 4, aimScreen.y);
                ctx.moveTo(aimScreen.x + 4, aimScreen.y); ctx.lineTo(aimScreen.x + 12, aimScreen.y);
                ctx.moveTo(aimScreen.x, aimScreen.y - 12); ctx.lineTo(aimScreen.x, aimScreen.y - 4);
                ctx.moveTo(aimScreen.x, aimScreen.y + 4); ctx.lineTo(aimScreen.x, aimScreen.y + 12);
                ctx.stroke();
                // 开场操作提示
                if (t < 4) {
                    ctx.globalAlpha = Math.min(1, (4 - t) / 1.2);
                    ctx.fillStyle = '#cfe3ff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('WASD/方向键移动（大地图·右上小地图）· 鼠标瞄准按住扫射', W / 2, H - 14);
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
                if (muzzle > 0) ctx.translate(-2.2, 0);   // 开火后坐
                const step = Math.sin(walkT) * 3.2;
                // 背包（士兵背负的补给包）
                ctx.fillStyle = '#2c3324';
                ctx.beginPath(); ctx.ellipse(-9, 0, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#1b2014'; ctx.lineWidth = 1; ctx.stroke();
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
                // 弹匣腰带
                ctx.fillStyle = '#2a3320'; ctx.fillRect(-9, -2.5, 18, 5);
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
                aimScreen = { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
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
