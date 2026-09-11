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
                const dt = 0.03; t += dt; cool -= dt; spawnT -= dt;
                if (spawnT <= 0) { spawn(); spawnT = spawnInt * (0.7 + Math.random() * 0.6); }
                // 射击
                if (firing && cool <= 0) {
                    const a = Math.atan2(aim.y - py, aim.x - px);
                    bullets.push({ x: px + Math.cos(a) * 16, y: py + Math.sin(a) * 16, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620 });
                    cool = 0.13;
                }
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
            let score = 0;
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
                // 异形
                for (const a of aliens) {
                    ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
                    ctx.fillStyle = a.hitT > 0 ? '#ffffff' : a.c; ctx.fill();
                    ctx.strokeStyle = '#00000066'; ctx.lineWidth = 2; ctx.stroke();
                    // 触手
                    ctx.strokeStyle = a.c; ctx.lineWidth = 2;
                    for (let k = 0; k < 4; k++) {
                        const ang = t * 3 + k * Math.PI / 2;
                        ctx.beginPath(); ctx.moveTo(a.x + Math.cos(ang) * a.r, a.y + Math.sin(ang) * a.r);
                        ctx.lineTo(a.x + Math.cos(ang) * (a.r + 6), a.y + Math.sin(ang) * (a.r + 6)); ctx.stroke();
                    }
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
                // 玩家
                const ang = Math.atan2(aim.y - py, aim.x - px);
                ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2);
                ctx.fillStyle = '#4a90d8'; ctx.fill(); ctx.strokeStyle = '#d8ecff'; ctx.lineWidth = 2; ctx.stroke();
                ctx.strokeStyle = '#222'; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(ang) * 22, py + Math.sin(ang) * 22); ctx.stroke();
                // 血条
                ctx.fillStyle = '#333'; ctx.fillRect(8, 8, 120, 10);
                ctx.fillStyle = hp > 40 ? '#5ad48a' : '#ff7b7b'; ctx.fillRect(8, 8, 120 * Math.max(0, hp / 100), 10);
            }
            function setPos(e) {
                const r = cvs.getBoundingClientRect();
                aim = { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
            }
            // 移动端：拖拽移动角色 + 自动朝指针开火；PC：指针即准星，按住扫射
            let dragging = false;
            cvs.addEventListener('pointerdown', e => { dragging = true; firing = true; setPos(e); });
            cvs.addEventListener('pointermove', e => { setPos(e); if (dragging && e.pointerType !== 'mouse') { /* 手指即准星 */ } });
            cvs.addEventListener('pointerup', () => { firing = false; dragging = false; });
            cvs.addEventListener('pointerleave', () => { firing = false; dragging = false; });
            draw();
            const timer = setInterval(step, 30);
            return { stop() { clearInterval(timer); } };
        },
    };
})();
