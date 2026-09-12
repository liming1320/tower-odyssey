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

    MiniGames.alienshoot = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const quota = 10 + idx * 2;
            const spawnInt = Math.max(0.42, 1.25 - idx * 0.016);
            const spd = 52 + idx * 1.4;
            let px = W / 2, py = H / 2, hp = 100, kills = 0, over = false, t = 0;
            let aliens = [], bullets = [], parts = [], pickups = [];
            let aim = { x: W / 2, y: 0 }, firing = false, cool = 0, spawnT = 0, wave = 0;
            let score = 0;
            // 移动：键盘 + 移动端左半屏虚拟摇杆
            const keys = new Set();
            let mvx = 0, mvy = 0, walkT = 0, muzzle = 0;
            let joyId = null, joyOx = 0, joyOy = 0, joyVx = 0, joyVy = 0;

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
            function boom(x, y, c) { for (let k = 0; k < 8; k++) parts.push({ x, y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, life: 0.4, c }); }

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
                // 地面网格
                ctx.strokeStyle = 'rgba(90,110,140,.12)'; ctx.lineWidth = 1;
                for (let x = 0; x < W; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
                for (let y = 0; y < H; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
                // 血包
                for (const p of pickups) {
                    ctx.fillStyle = '#5ad48a'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('✚', p.x, p.y + 6);
                }
                // 异形（体色渐变 + 红眼盯人 + 背刺/触须）
                for (const a of aliens) {
                    const ea = Math.atan2(py - a.y, px - a.x);
                    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ea);
                    const flash = a.hitT > 0;
                    const body = flash ? '#ffffff' : a.c;
                    if (a.type === 'tank') {
                        // 背甲尖刺
                        ctx.fillStyle = flash ? '#ffffff' : '#7c2d99';
                        for (let k = -1; k <= 1; k++) {
                            ctx.beginPath();
                            ctx.moveTo(-a.r * 0.5, k * a.r * 0.55);
                            ctx.lineTo(-a.r - 6, k * a.r * 0.8);
                            ctx.lineTo(-a.r * 0.4, k * a.r * 0.75);
                            ctx.closePath(); ctx.fill();
                        }
                    } else if (a.type === 'runner') {
                        // 快跑者细腿
                        ctx.strokeStyle = flash ? '#ffffff' : a.c; ctx.lineWidth = 2;
                        for (const s of [-1, 1]) {
                            const ph = Math.sin(t * 14 + s) * 3;
                            ctx.beginPath(); ctx.moveTo(-2, s * 5); ctx.lineTo(-8, s * 10 + ph); ctx.stroke();
                            ctx.beginPath(); ctx.moveTo(2, s * 5); ctx.lineTo(7, s * 10 - ph); ctx.stroke();
                        }
                    } else {
                        // 小怪触须
                        ctx.strokeStyle = flash ? '#ffffff' : a.c; ctx.lineWidth = 2;
                        for (let k = 0; k < 4; k++) {
                            const ta = Math.PI * (0.35 + k * 0.43) + Math.PI;   // 朝后方
                            ctx.beginPath(); ctx.moveTo(Math.cos(ta) * a.r * 0.7, Math.sin(ta) * a.r * 0.7);
                            ctx.lineTo(Math.cos(ta) * (a.r + 5), Math.sin(ta) * (a.r + 5)); ctx.stroke();
                        }
                    }
                    // 身体
                    ctx.beginPath();
                    ctx.ellipse(0, 0, a.r, a.r * (a.type === 'runner' ? 0.78 : 0.9), 0, 0, Math.PI * 2);
                    const ag = ctx.createRadialGradient(-a.r * 0.3, -a.r * 0.3, a.r * 0.15, 0, 0, a.r);
                    ag.addColorStop(0, flash ? '#ffffff' : MG.gfx.lighten(body, 0.3));
                    ag.addColorStop(1, flash ? '#dde6ff' : MG.gfx.darken(body, 0.35));
                    ctx.fillStyle = ag; ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2; ctx.stroke();
                    // 咬合口（前端）
                    ctx.beginPath(); ctx.arc(a.r * 0.72, 0, a.r * 0.3, 0, Math.PI * 2);
                    ctx.fillStyle = '#2a0d12'; ctx.fill();
                    ctx.fillStyle = '#e8dddd';
                    for (const s of [-1, 1]) {
                        ctx.beginPath();
                        ctx.moveTo(a.r * 0.9, s * 2.5); ctx.lineTo(a.r * 0.55, s * 4.5); ctx.lineTo(a.r * 0.55, s * 1.5);
                        ctx.closePath(); ctx.fill();
                    }
                    // 红眼
                    ctx.fillStyle = '#ff3b3b';
                    ctx.beginPath(); ctx.arc(a.r * 0.35, -a.r * 0.32, 2.1, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(a.r * 0.35, a.r * 0.32, 2.1, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = 'rgba(255,60,60,0.35)';
                    ctx.beginPath(); ctx.arc(a.r * 0.35, -a.r * 0.32, 3.6, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(a.r * 0.35, a.r * 0.32, 3.6, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    if (a.maxHp > 1) { // 血条
                        ctx.fillStyle = '#333'; ctx.fillRect(a.x - a.r, a.y - a.r - 8, a.r * 2, 4);
                        ctx.fillStyle = '#e94f4f'; ctx.fillRect(a.x - a.r, a.y - a.r - 8, a.r * 2 * (a.hp / a.maxHp), 4);
                    }
                }
                // 子弹
                ctx.fillStyle = '#ffe27a';
                for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); }
                // 粒子
                for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life * 2.2); ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
                ctx.globalAlpha = 1;
                // 玩家：俯视士兵（影子 → 摆腿 → 身体防弹背心 → 双手持枪 → 头盔 → 枪口焰）
                const ang = Math.atan2(aim.y - py, aim.x - px);
                drawSoldier(px, py, ang);
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
                ctx.beginPath(); ctx.ellipse(x, y + 4, 13, 6, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
                ctx.save();
                ctx.translate(x, y); ctx.rotate(ang);
                const step = Math.sin(walkT) * 3;
                // 脚（走路交替前后）
                ctx.fillStyle = '#2b2b33';
                ctx.beginPath(); ctx.ellipse(step, -6, 4.2, 3, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-step, 6, 4.2, 3, 0, 0, Math.PI * 2); ctx.fill();
                // 双臂
                ctx.strokeStyle = '#5d6b4a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(2, -7); ctx.lineTo(13, -3); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(2, 7); ctx.lineTo(13, 3); ctx.stroke();
                // 手
                ctx.fillStyle = '#d9a877';
                ctx.beginPath(); ctx.arc(13, -3, 2.6, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(13, 3, 2.6, 0, Math.PI * 2); ctx.fill();
                // 步枪（枪身 + 枪管 + 弹匣 + 枪托）
                ctx.fillStyle = '#23241f'; ctx.fillRect(6, -2.2, 15, 4.4);      // 机匣
                ctx.fillRect(21, -1.3, 8, 2.6);                                  // 枪管
                ctx.fillStyle = '#3a352c'; ctx.fillRect(2, -2.6, 5, 5.2);        // 枪托
                ctx.fillStyle = '#2e2f28'; ctx.fillRect(11, 2, 4, 7);            // 弹匣
                // 身体（防弹背心）
                ctx.beginPath(); ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2);
                const bg = ctx.createRadialGradient(-2, -3, 2, 0, 1, 13);
                bg.addColorStop(0, '#7a8a5e'); bg.addColorStop(1, '#42502f');
                ctx.fillStyle = bg; ctx.fill();
                ctx.strokeStyle = '#242c19'; ctx.lineWidth = 1.6; ctx.stroke();
                // 背心绑带
                ctx.strokeStyle = '#2c3520'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-4, 8); ctx.moveTo(4, -8.5); ctx.lineTo(4, 8.5); ctx.stroke();
                // 肩甲
                ctx.fillStyle = '#5d6b4a';
                ctx.beginPath(); ctx.ellipse(-2, -9, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-2, 9, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
                // 头盔
                ctx.beginPath(); ctx.arc(1, 0, 6.2, 0, Math.PI * 2);
                const hg = ctx.createRadialGradient(-1, -2, 1.5, 1, 0, 7);
                hg.addColorStop(0, '#6d7c4e'); hg.addColorStop(1, '#39422a');
                ctx.fillStyle = hg; ctx.fill();
                ctx.strokeStyle = '#242c19'; ctx.lineWidth = 1.4; ctx.stroke();
                // 盔沿 + 夜视镜扣
                ctx.strokeStyle = '#20261a'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(1, 0, 6.2, -0.9, 0.9); ctx.stroke();
                ctx.fillStyle = '#11151b'; ctx.fillRect(3.4, -2.4, 2.6, 4.8);
                // 枪口焰
                if (muzzle > 0) {
                    ctx.fillStyle = 'rgba(255,226,122,0.95)';
                    ctx.beginPath();
                    ctx.moveTo(29, 0); ctx.lineTo(24, -4.5); ctx.lineTo(22.5, 0); ctx.lineTo(24, 4.5);
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    ctx.beginPath(); ctx.arc(27, 0, 2.2, 0, Math.PI * 2); ctx.fill();
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
                if (e.pointerType !== 'mouse' && lx < W * 0.4) {
                    // 移动摇杆
                    joyId = e.pointerId;
                    joyOx = e.clientX; joyOy = e.clientY; joyVx = 0; joyVy = 0;
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
