// 孤胆枪手3D：纯 Canvas 射线投射（raycasting）第一人称射击，零依赖
// 真 3D 透视投影（Wolfenstein/Doom 式），俯仰固定，含墙体/精灵怪/手电光/小地图
window.MiniGames = window.MiniGames || {};
(function () {
    const W = 420, H = 560;
    const MW = 24, MH = 24;
    const FOV = Math.PI / 3;                 // 60°
    const PLANE = Math.tan(FOV / 2);         // 0.577
    const PROJ = (H / 2) / PLANE;            // 投影平面距离
    const NAMES = ['前哨遇袭', '隧道清剿', '巢穴深入', '钢铁风暴'];

    function shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
        else { const k = 1 + amt; r *= k; g *= k; b *= k; }
        return `rgb(${r | 0},${g | 0},${b | 0})`;
    }

    function buildMap() {
        const g = [];
        for (let y = 0; y < MH; y++) {
            const row = [];
            for (let x = 0; x < MW; x++) row.push((x === 0 || y === 0 || x === MW - 1 || y === MH - 1) ? 1 : 0);
            g.push(row);
        }
        const rect = (x0, y0, w, h, v) => {
            for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
                if (y > 0 && y < MH - 1 && x > 0 && x < MW - 1) g[y][x] = v;
        };
        // 四角建筑 + 中边弹药/箱堆 + 中央开阔广场（10..13）
        rect(2, 2, 4, 4, 2); rect(18, 2, 4, 4, 3); rect(2, 18, 4, 4, 3); rect(18, 18, 4, 4, 2);
        rect(11, 2, 2, 3, 2); rect(11, 19, 2, 3, 2); rect(2, 11, 3, 2, 2); rect(19, 11, 3, 2, 3);
        return g;
    }

    function makeSprite(color) {
        const c = document.createElement('canvas'); c.width = 48; c.height = 56;
        const x = c.getContext('2d');
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(24, 50, 16, 5, 0, 0, 7); x.fill();
        x.strokeStyle = shade(color, -0.3); x.lineWidth = 4; x.lineCap = 'round';
        x.beginPath(); x.moveTo(18, 46); x.lineTo(16, 54); x.moveTo(30, 46); x.lineTo(32, 54); x.stroke();
        const g = x.createRadialGradient(20, 18, 3, 24, 26, 26);
        g.addColorStop(0, shade(color, 0.4)); g.addColorStop(1, shade(color, -0.4));
        x.fillStyle = g; x.beginPath(); x.ellipse(24, 26, 15, 18, 0, 0, 7); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 2; x.stroke();
        x.strokeStyle = shade(color, -0.1); x.lineWidth = 5;
        x.beginPath(); x.moveTo(12, 24); x.lineTo(6, 34); x.moveTo(36, 24); x.lineTo(42, 34); x.stroke();
        x.fillStyle = '#2a0d12'; x.beginPath(); x.ellipse(24, 34, 8, 5, 0, 0, 7); x.fill();
        x.fillStyle = '#e8dddd';
        for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(24 + i * 5, 30); x.lineTo(24 + i * 5 - 2, 36); x.lineTo(24 + i * 5 + 2, 36); x.closePath(); x.fill(); }
        x.save(); x.shadowColor = 'rgba(255,60,60,0.9)'; x.shadowBlur = 8;
        x.fillStyle = '#ff3b3b'; x.beginPath(); x.arc(19, 18, 3.4, 0, 7); x.arc(29, 18, 3.4, 0, 7); x.fill(); x.restore();
        x.fillStyle = '#ffd0d0'; x.beginPath(); x.arc(19.6, 17.4, 1.1, 0, 7); x.arc(29.6, 17.4, 1.1, 0, 7); x.fill();
        return c;
    }

    const lv = [];
    for (let i = 0; i < 50; i++) {
        const quota = 10 + i * 2;
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `击杀 ${quota} 只异形 · 首领每 ${Math.max(3, 8 - Math.floor(i / 10))} 波出现` });
    }

    MiniGames.alienshoot3d = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const quota = 10 + idx * 2;
            const spawnInt = Math.max(0.5, 1.4 - idx * 0.018);
            const grid = buildMap();
            const spriteCache = {
                grunt: makeSprite('#7fae4a'), runner: makeSprite('#d8c24a'), tank: makeSprite('#b04ad8'),
            };

            let px = 12, py = 12, dir = 0, hp = 100, kills = 0, over = false, t = 0, wave = 0, score = 0;
            let aliens = [], parts = [], decals = [], shake = 0, muzzle = 0;
            let dirX = 1, dirY = 0, planeX = 0, planeY = PLANE;
            const zbuf = new Float32Array(W);

            container.innerHTML = '';
            const cvs = document.createElement('canvas');
            cvs.width = W; cvs.height = H;
            cvs.style.cssText = 'max-width:100%;max-height:100%;touch-action:none;cursor:crosshair;display:block;margin:0 auto;background:#000;';
            container.appendChild(cvs);
            const ctx = cvs.getContext('2d');

            const done = (win, lines) => {
                if (over) return; over = true; clearInterval(timer);
                try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
                opts.onComplete && opts.onComplete({ win, stars: win ? (hp >= 80 ? 3 : hp >= 45 ? 2 : 1) : 0, lines });
            };

            const canStand = (x, y) => {
                const cx = Math.floor(x), cy = Math.floor(y);
                return cx > 0 && cy > 0 && cx < MW - 1 && cy < MH - 1 && grid[cy][cx] === 0;
            };
            function moveAxis(d, axis) {
                if (d === 0) return;
                const r = 0.22, s = Math.sign(d);
                if (axis === 'x') { if (canStand(px + s * r + d, py)) px += d; }
                else { if (canStand(px, py + s * r + d)) py += d; }
            }
            function turnView(d) { dir += d; dirX = Math.cos(dir); dirY = Math.sin(dir); planeX = -dirY * PLANE; planeY = dirX * PLANE; }

            function spawn() {
                wave++;
                const boss = wave % Math.max(3, 8 - Math.floor(idx / 10)) === 0;
                let x, y, tries = 0;
                do {
                    const a = Math.random() * Math.PI * 2, dist = 7 + Math.random() * 6;
                    x = px + Math.cos(a) * dist; y = py + Math.sin(a) * dist; tries++;
                } while ((!canStand(x, y) || Math.hypot(x - px, y - py) < 5) && tries < 50);
                x = Math.max(1, Math.min(MW - 2, x)); y = Math.max(1, Math.min(MH - 2, y));
                const type = boss ? 'tank' : Math.random() < 0.25 ? 'runner' : 'grunt';
                const st = { grunt: { r: 0.35, hp: 1, v: 2.2, color: '#7fae4a' }, runner: { r: 0.28, hp: 1, v: 3.7, color: '#d8c24a' }, tank: { r: 0.6, hp: 5 + Math.floor(idx / 12), v: 1.3, color: '#b04ad8' } }[type];
                aliens.push({ x, y, type, ...st, maxHp: st.hp, hitT: 0 });
            }
            function losClear(x0, y0, x1, y1) {
                const dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy), steps = Math.ceil(dist / 0.3);
                for (let i = 1; i < steps; i++) { const tt = i / steps, cx = Math.floor(x0 + dx * tt), cy = Math.floor(y0 + dy * tt); if (grid[cy] && grid[cy][cx] > 0) return false; }
                return true;
            }
            function fire() {
                muzzle = 0.06;
                let best = null, bestD = 1e9;
                for (const a of aliens) {
                    const dx = a.x - px, dy = a.y - py, dist = Math.hypot(dx, dy);
                    if (dist > 18) continue;
                    let ang = Math.atan2(dy, dx) - dir; while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
                    if (Math.abs(ang) > 0.2) continue;
                    if (!losClear(px, py, a.x, a.y)) continue;
                    if (dist < bestD) { bestD = dist; best = a; }
                }
                if (best) {
                    best.hp--; best.hitT = 0.1;
                    if (best.hp <= 0) {
                        kills++; score += best.type === 'tank' ? 50 : best.type === 'runner' ? 25 : 10;
                        const i = aliens.indexOf(best); if (i >= 0) aliens.splice(i, 1);
                        if (kills >= quota && aliens.length === 0) return done(true, ['区域肃清！', `击杀 ${kills} · 剩余 HP ${Math.round(hp)}`]);
                    }
                }
            }

            // ---- 输入 ----
            const keys = new Set();
            let firing = false, ptrLock = false;
            let joyId = null, joyVx = 0, joyVy = 0, joyOx = 0, joyOy = 0;
            let turnId = null, turnOx = 0, isTouch = false;

            const kd = e => { const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', ' '].includes(k)) { keys.add(k); if (k === ' ') firing = true; e.preventDefault(); } };
            const ku = e => { const k = e.key.toLowerCase(); keys.delete(k); if (k === ' ') firing = false; };
            window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
            cvs.addEventListener('click', () => { if (!isTouch && !ptrLock && cvs.requestPointerLock) cvs.requestPointerLock(); });
            document.addEventListener('mousemove', e => { if (ptrLock) turnView(e.movementX * 0.0026); });
            document.addEventListener('pointerlockchange', () => { ptrLock = document.pointerLockElement === cvs; });
            cvs.addEventListener('mousedown', e => { if (e.pointerType === 'mouse' || e.pointerType === undefined) firing = true; });
            window.addEventListener('mouseup', () => { firing = false; });
            cvs.addEventListener('pointerdown', e => {
                if (e.pointerType === 'mouse') return;
                isTouch = true;
                const r = cvs.getBoundingClientRect();
                const lx = (e.clientX - r.left) * (W / r.width);
                if (lx < W * 0.42) { joyId = e.pointerId; joyOx = e.clientX; joyOy = e.clientY; joyVx = 0; joyVy = 0; }
                else { firing = true; turnId = e.pointerId; turnOx = e.clientX; }
            });
            cvs.addEventListener('pointermove', e => {
                if (e.pointerType === 'mouse') return;
                if (e.pointerId === joyId) {
                    const dx = e.clientX - joyOx, dy = e.clientY - joyOy, d = Math.hypot(dx, dy) || 1, f = Math.min(1, d / 42);
                    joyVx = dx / 42 * f; joyVy = dy / 42 * f;
                } else if (e.pointerId === turnId) { const dx = e.clientX - turnOx; turnOx = e.clientX; turnView(dx * 0.005); }
            });
            const endPtr = e => {
                if (e.pointerId === joyId) { joyId = null; joyVx = 0; joyVy = 0; }
                if (e.pointerId === turnId) { turnId = null; firing = false; }
                if (e.pointerType === 'mouse') firing = false;
            };
            cvs.addEventListener('pointerup', endPtr); cvs.addEventListener('pointercancel', endPtr);
            cvs.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') firing = false; });

            // ---- 主循环 ----
            let spawnT = 0, cool = 0;
            function step() {
                if (over) return;
                const dt = 0.03; t += dt; cool -= dt; muzzle -= dt; spawnT -= dt;
                // 移动
                let mvx = 0, mvy = 0;
                if (keys.has('w') || keys.has('arrowup')) { mvx += dirX; mvy += dirY; }
                if (keys.has('s') || keys.has('arrowdown')) { mvx -= dirX; mvy -= dirY; }
                if (keys.has('a')) { mvx += -dirY; mvy += dirX; }
                if (keys.has('d')) { mvx += dirY; mvy += -dirX; }
                if (keys.has('arrowleft') || keys.has('q')) turnView(-2.4 * dt);
                if (keys.has('arrowright') || keys.has('e')) turnView(2.4 * dt);
                if (joyId !== null) { const fwd = -joyVy, str = joyVx; mvx += fwd * dirX + str * (-dirY); mvy += fwd * dirY + str * dirX; }
                const ml = Math.hypot(mvx, mvy);
                if (ml > 0.001) { const sp = 2.6 * dt; moveAxis(mvx / ml * sp, 'x'); moveAxis(mvy / ml * sp, 'y'); }
                // 射击
                if (firing && cool <= 0) { fire(); cool = 0.14; }
                if (spawnT <= 0) { spawn(); spawnT = spawnInt * (0.7 + Math.random() * 0.6); }
                // 异形
                for (const a of aliens) {
                    const dx = px - a.x, dy = py - a.y, d = Math.hypot(dx, dy) || 1, sp = a.v * dt;
                    const mvx2 = (dx / d) * sp, mvy2 = (dy / d) * sp;
                    if (canStand(a.x + mvx2 + Math.sign(mvx2) * 0.2, a.y)) a.x += mvx2;
                    if (canStand(a.x, a.y + mvy2 + Math.sign(mvy2) * 0.2)) a.y += mvy2;
                    a.hitT -= dt;
                    if (d < a.r + 0.6) { hp -= (a.type === 'tank' ? 14 : 7) * dt * 3; shake = 4; if (hp <= 0) return done(false, ['你被异形吞没了…', `击杀 ${kills}/${quota}`]); }
                }
                draw();
                opts.onScore && opts.onScore(`击杀 ${kills}/${quota} · HP ${Math.max(0, Math.round(hp))}`);
            }

            function draw() {
                // 天花板 / 地面（带纵深渐变）
                let cg = ctx.createLinearGradient(0, 0, 0, H / 2);
                cg.addColorStop(0, '#0e131c'); cg.addColorStop(1, '#26313f'); ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H / 2);
                let fg = ctx.createLinearGradient(0, H / 2, 0, H);
                fg.addColorStop(0, '#2a2016'); fg.addColorStop(1, '#0f0b07'); ctx.fillStyle = fg; ctx.fillRect(0, H / 2, W, H / 2);

                // 墙体（逐列射线投射）
                for (let x = 0; x < W; x++) {
                    const cameraX = 2 * x / W - 1;
                    const rdx = dirX + planeX * cameraX, rdy = dirY + planeY * cameraX;
                    let mapX = Math.floor(px), mapY = Math.floor(py);
                    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
                    let stepX, stepY, sideX, sideY;
                    if (rdx < 0) { stepX = -1; sideX = (px - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
                    if (rdy < 0) { stepY = -1; sideY = (py - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - py) * ddy; }
                    let hit = 0, side = 0, tile = 0;
                    while (!hit) {
                        if (sideX < sideY) { sideX += ddx; mapX += stepX; side = 0; } else { sideY += ddy; mapY += stepY; side = 1; }
                        if (mapX < 0 || mapY < 0 || mapX >= MW || mapY >= MH) { hit = 1; tile = 1; break; }
                        if (grid[mapY][mapX] > 0) { hit = 1; tile = grid[mapY][mapX]; }
                    }
                    const pd = side === 0 ? (sideX - ddx) : (sideY - ddy);
                    zbuf[x] = pd;
                    const lineH = PROJ / (pd < 0.01 ? 0.01 : pd);
                    let d0 = -lineH / 2 + H / 2; if (d0 < 0) d0 = 0;
                    let d1 = lineH / 2 + H / 2; if (d1 > H) d1 = H;
                    const base = tile === 2 ? [150, 100, 55] : tile === 3 ? [110, 105, 125] : [138, 130, 118];
                    let f = 1 / (1 + pd * 0.06); if (side === 1) f *= 0.7;
                    ctx.fillStyle = `rgb(${base[0] * f | 0},${base[1] * f | 0},${base[2] * f | 0})`;
                    ctx.fillRect(x, d0, 1, d1 - d0);
                }

                // 精灵怪（按距离远→近，z-buffer 遮挡）
                const order = aliens.slice().sort((a, b) => Math.hypot(b.x - px, b.y - py) - Math.hypot(a.x - px, a.y - py));
                const inv = 1 / (planeX * dirY - dirX * planeY);
                for (const a of order) {
                    const dx = a.x - px, dy = a.y - py;
                    const tX = inv * (dirY * dx - dirX * dy);
                    const tY = inv * (-planeY * dx + planeX * dy);
                    if (tY <= 0.1) continue;
                    const screenX = (W / 2) * (1 + tX / tY);
                    const sh = PROJ * 0.85 / tY, sw = sh * 0.78;
                    const sx0 = Math.floor(screenX - sw / 2), sx1 = Math.floor(screenX + sw / 2);
                    const sy0 = Math.floor(-sh / 2 + H / 2), sy1 = Math.floor(sh / 2 + H / 2);
                    const spr = spriteCache[a.type];
                    for (let cx = Math.max(0, sx0); cx <= Math.min(W - 1, sx1); cx++) {
                        if (tY >= zbuf[cx]) continue;
                        const texX = Math.max(0, Math.min(spr.width - 1, Math.floor((cx - sx0) / sw * spr.width)));
                        ctx.drawImage(spr, texX, 0, 1, spr.height, cx, sy0, 1, sy1 - sy0);
                    }
                    if (a.maxHp > 1) { ctx.fillStyle = '#333'; ctx.fillRect(screenX - 14, sy0 - 8, 28, 3); ctx.fillStyle = '#e94f4f'; ctx.fillRect(screenX - 14, sy0 - 8, 28 * (a.hp / a.maxHp), 3); }
                }

                // 受击抖动
                if (shake > 0) shake = Math.max(0, shake - 0.7);
                // 第一人称枪 + 枪口焰
                ctx.save();
                if (muzzle > 0) { ctx.globalAlpha = Math.max(0, muzzle / 0.06); ctx.fillStyle = 'rgba(255,230,150,0.9)'; ctx.beginPath(); ctx.moveTo(W / 2 - 16, H); ctx.lineTo(W / 2 + 16, H); ctx.lineTo(W / 2, H - 80); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
                ctx.fillStyle = '#23262c'; ctx.fillRect(W / 2 - 9, H - 52, 18, 52);
                ctx.fillStyle = '#33373f'; ctx.fillRect(W / 2 - 7, H - 50, 14, 30);
                ctx.fillStyle = '#15171c'; ctx.fillRect(W / 2 + 8, H - 40, 26, 6);
                ctx.fillStyle = '#2e3138'; ctx.fillRect(W / 2 - 7, H - 24, 6, 16);
                ctx.restore();

                // 暗角
                const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.8);
                vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.4)');
                ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

                // 准星
                ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(W / 2, H / 2, 7, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(W / 2 - 11, H / 2); ctx.lineTo(W / 2 - 4, H / 2);
                ctx.moveTo(W / 2 + 4, H / 2); ctx.lineTo(W / 2 + 11, H / 2);
                ctx.moveTo(W / 2, H / 2 - 11); ctx.lineTo(W / 2, H / 2 - 4);
                ctx.moveTo(W / 2, H / 2 + 4); ctx.lineTo(W / 2, H / 2 + 11); ctx.stroke();

                // 小地图（右上）
                const MM = 84, mx0 = W - MM - 6, my0 = 6, s = MM / MW;
                ctx.fillStyle = 'rgba(8,16,10,0.7)'; ctx.fillRect(mx0, my0, MM, MM);
                ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(mx0 + .5, my0 + .5, MM - 1, MM - 1);
                for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (grid[y][x] > 0) { ctx.fillStyle = grid[y][x] === 2 ? '#7a5a32' : '#6b6577'; ctx.fillRect(mx0 + x * s, my0 + y * s, s + 0.5, s + 0.5); }
                ctx.fillStyle = 'rgba(255,91,91,0.95)'; for (const a of aliens) ctx.fillRect(mx0 + a.x * s - 1, my0 + a.y * s - 1, 2.5, 2.5);
                ctx.fillStyle = '#7dff7d'; ctx.beginPath(); ctx.arc(mx0 + px * s, my0 + py * s, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#7dff7d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx0 + px * s, my0 + py * s); ctx.lineTo(mx0 + (px + dirX * 2) * s, my0 + (py + dirY * 2) * s); ctx.stroke();

                // 触屏操作提示
                if (isTouch) {
                    ctx.save(); ctx.globalAlpha = 0.22; ctx.strokeStyle = '#cfe3ff'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
                    ctx.beginPath(); ctx.arc(60, H - 60, 42, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
                    ctx.globalAlpha = 0.5; ctx.fillStyle = '#cfe3ff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('✥ 移动', 60, H - 104); ctx.fillText('🎯 转向/射击', W - 70, H - 104); ctx.restore();
                }
                // 开场提示
                if (t < 5) {
                    ctx.globalAlpha = Math.min(1, (5 - t) / 1.4);
                    ctx.fillStyle = '#cfe3ff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('PC：WASD 移动 · 鼠标点击锁定后转视角 · 左键射击 · 方向键/QE 转向', W / 2, H - 16);
                    ctx.fillText('手机：左半屏摇杆移动 · 右半屏拖动转向+射击', W / 2, H - 4);
                    ctx.globalAlpha = 1;
                }
                // 血条
                ctx.fillStyle = '#333'; ctx.fillRect(8, 8, 120, 10);
                ctx.fillStyle = hp > 40 ? '#5ad48a' : '#ff7b7b'; ctx.fillRect(8, 8, 120 * Math.max(0, hp / 100), 10);
                ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('HP', 8, 30);
            }

            draw();
            const timer = setInterval(step, 33);
            return {
                stop() {
                    clearInterval(timer);
                    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
                    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
                }
            };
        },
    };
})();
