// 魂斗罗 · 致敬版（100% 自研复刻，非 ROM）
//   魂斗罗1 · 丛林突击 + 魂斗罗2 · 工厂渗透 —— 两款卡共享引擎
//   横版跑跳射击 · 本地双人：P1 = A/D 移动 W 跳 S 蹲 F 开火 · P2 = ←→ 移动 ↑ 跳 ↓ 蹲 回车 开火
//   道具：S 散弹 · M 机枪 · B 屏障 · ❤ 补命
//   每关推进到关底击败 Boss 通关；中弹即死（3 命），触屏单人：左右滑动移动 · 上滑跳 · 轻点开火
window.MiniGames = window.MiniGames || {};
(function () {
    const GW = 480, GH = 300, GROUND = 258;
    const GRAV = 980, JUMP_V = -380, PSPD = 165, BSPD = 430;

    const NAMES1 = [
        '丛林边缘', '河滩遭遇', '浮桥突围', '瀑布攀行', '树冠伏击',
        '河谷缠斗', '营地强攻', '弹药库房', '高台压制', '丛林深处',
        '暗夜潜行', '雷区穿越', '碉堡攻坚', '运输伏击', '山涧激战',
        '桥头堡', '深谷回响', '雾林迷踪', '断崖抢渡', '前哨绞杀',
        '密林奔袭', '藤蔓回廊', '鳄潭惊魂', '雨林风暴', '古树祭坛',
        '瀑布之巅', '猿啼险径', '毒雾沼泽', '巨蟒巢穴', '丛林之心',
        '余烬林地', '残阳孤影', '风啸谷', '暗河', '萤火小径',
        '决战树海', '血战荒野', '孤胆英雄', '传奇时刻', '超级战士',
        '归途', '曙光', '黎明冲锋', '斩首行动', '合围突破',
        '背水一战', '卫队走廊', '炮台回廊', '升降井道', '最终决战',
    ];
    const NAMES2 = [
        '钢铁大门', '传送带阵', '熔炉车间', '管道迷宫', '配电枢纽',
        '机械军团', '冷却水道', '装配车间', '中央塔楼', '核心禁区',
        '卫队走廊', '炮台回廊', '升降井道', '警报全开', '孤军深入',
        '背水一战', '合围突破', '斩首行动', '黎明冲锋', '最终决战',
        '蒸汽阀门', '齿轮深渊', '电弧走廊', '铸造核心', '冷却塔顶',
        '机械蜈蚣', '激光栅栏', '货运隧洞', '反应堆房', '中枢风暴',
        '焊花车间', '废料回廊', '油污泥沼', '吊臂战场', '烟囱绝壁',
        '合金卫士', '传动心脏', '电压过载', '引擎轰鸣', '母巢渐近',
        '静默齿轮', '红灯长廊', '封锁区', '绝密仓库', '禁断实验',
        '异形初现', '巢穴边缘', '心脏地带', '最终兵器', '异形母巢',
    ];

    function lvP(idx) {
        const t = idx / 49;
        return {
            len: 2200 + Math.floor(idx * 55),
            nInf: 10 + Math.floor(idx / 2),
            nTurret: Math.floor(idx / 5),
            nFly: idx >= 8 ? Math.floor(idx / 6) : 0,
            infHp: idx >= 20 ? 2 : 1,
            bossHp: 26 + Math.floor(idx * 1.4),
            eFire: Math.max(0.55, 1.7 - 1.1 * t),
            eSpd: 55 + 75 * t,
            bulletSpd: 210 + 120 * t,
        };
    }

    // ---------- 绘制小工具 ----------
    function drawSoldier(ctx, x, y, w, h, c, dir, t, crouch, dead) {
        ctx.save();
        ctx.translate(x + w / 2, y + h);
        if (dir < 0) ctx.scale(-1, 1);
        if (dead) ctx.rotate(-Math.PI / 2);
        const run = Math.sin(t * 13) * (crouch ? 0 : 3);
        // 腿
        ctx.strokeStyle = c.pants; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-1, -8); ctx.lineTo(-3 + run, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(1, -8); ctx.lineTo(3 - run, 0); ctx.stroke();
        // 身体（背心 + 裸臂 魂斗罗风）
        ctx.fillStyle = c.skin;
        ctx.fillRect(-5, -17, 10, 9);                       // 胸膛
        ctx.fillStyle = c.pants;
        if (crouch) ctx.fillRect(-6, -13, 12, 6);           // 蹲姿
        else ctx.fillRect(-5, -12, 10, 5);                  // 腰带
        // 头 + 头带
        ctx.fillStyle = c.skin;
        ctx.beginPath(); ctx.arc(0, -21, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.band;
        ctx.fillRect(-4.4, -23.5, 8.8, 2.6);
        // 枪（朝向）
        ctx.strokeStyle = '#2a2a34'; ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(14, -14 - (crouch ? 0 : 0)); ctx.stroke();
        ctx.restore();
    }
    function drawTurret(ctx, x, y, ang, t) {
        ctx.save();
        ctx.translate(x + 14, y + 14);
        // 底座
        let g = null; try { g = ctx.createRadialGradient(-3, -3, 2, 0, 0, 15); g.addColorStop(0, '#8a92a8'); g.addColorStop(1, '#41475a'); } catch (e) { }
        ctx.fillStyle = g || '#5a6078';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#22262f'; ctx.lineWidth = 2; ctx.stroke();
        // 炮管（朝玩家）
        ctx.save(); ctx.rotate(ang);
        ctx.fillStyle = '#2e3340'; ctx.fillRect(0, -3.4, 19, 6.8);
        ctx.fillStyle = '#c8402a'; ctx.fillRect(15, -4.2, 5, 8.4);
        ctx.restore();
        // 中心红灯
        ctx.fillStyle = `rgba(255,80,60,${0.5 + 0.5 * Math.sin(t * 8)})`;
        ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    function drawFlyer(ctx, x, y, t) {
        ctx.save();
        ctx.translate(x + 11, y + 11);
        // 喷气背包火焰
        ctx.fillStyle = `rgba(255,${170 + 40 * Math.sin(t * 22)},60,0.85)`;
        ctx.beginPath(); ctx.moveTo(-4, 9); ctx.lineTo(0, 16 + Math.sin(t * 30) * 4); ctx.lineTo(4, 9); ctx.closePath(); ctx.fill();
        // 身体
        ctx.fillStyle = '#5a6f9e';
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2c3a56'; ctx.fillRect(-8, -3, 16, 2.4);
        // 头盔
        ctx.fillStyle = '#dfe8f4';
        ctx.beginPath(); ctx.arc(3, -3, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5cc7ff';
        ctx.beginPath(); ctx.arc(4, -3.4, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // ---------- 引擎 ----------
    function mkContra(theme) {
        const TH = {
            jungle: {
                sky: ['#7ec8a0', '#2a5a3a'], hills: '#1e4030', ground1: '#5a8a3a', ground2: '#2f5522', groundLine: '#7ab048',
                water: true, title: '丛林突击',
            },
            factory: {
                sky: ['#3a4460', '#141a2a'], hills: '#232b42', ground1: '#5a6278', ground2: '#2a3044', groundLine: '#8a94ac',
                water: false, title: '工厂渗透',
            },
        }[theme];

        return {
            LEVELS: (theme === 'jungle' ? NAMES1 : NAMES2).map((name, i) => {
                const P = lvP(i);
                const half = i < 20 ? '前段' : i < 40 ? '后段' : '终段';
                return { name, desc: `${TH.title} ${half} · 敌兵 ${P.nInf} · 炮台 ${P.nTurret} · Boss ♥${P.bossHp}` };
            }),
            ENDLESS: { name: '∞ 无尽', desc: '无限推进的敌阵，击杀越多分越高' },

            start(container, opts) {
                opts = opts || {};
                const idx0 = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
                const endless = !!opts.endless;
                const P = lvP(Math.min(49, idx0));
                const { c, ctx, w, h, destroy } = MG.canvas(container, GW, GH);
                let t = 0, over = false, cam = 0;
                let kills = 0, endT = 0, stageKills = 0;
                let bossSpawned = false, boss = null;
                const LEVEL_LEN = P.len;

                // ---- 地形：地面高度 + 平台 + 水坑 ----
                srand(idx0 * 104729 + (theme === 'factory' ? 77 : 33));
                const groundY = new Array(LEVEL_LEN + 200).fill(GROUND);
                const plats = [], hazards = [];
                let x = 380;
                while (x < LEVEL_LEN - 250) {
                    const r = rnd();
                    if (r < 0.3) {   // 高地
                        const wdt = ri(90, 180), hh = ri(28, 62);
                        for (let i = 0; i < wdt; i++) groundY[x + i] = GROUND - hh;
                        x += wdt + ri(30, 90);
                    } else if (r < 0.55) {   // 平台
                        const wdt = ri(70, 140), hh = ri(55, 95);
                        plats.push({ x, y: GROUND - hh, w: wdt, h: 10 });
                        x += wdt + ri(20, 70);
                    } else if (r < 0.72 && TH.water) {   // 水坑（掉入即死）
                        const wdt = ri(60, 110);
                        hazards.push({ x, w: wdt });
                        x += wdt + ri(50, 110);
                    } else x += ri(60, 120);
                }

                // ---- 玩家 ----
                const PC = [
                    { skin: '#e8a878', band: '#d02828', pants: '#3a5a8a', bullet: '#ffe066' },
                    { skin: '#e8c8a0', band: '#2870d0', pants: '#4a6a3a', bullet: '#8ae8ff' },
                ];
                const mkP = slot => ({
                    slot, x: 50, y: GROUND - 26, w: 15, h: 26, vy: 0, dir: 1,
                    onGround: true, crouch: false, fireCd: 0, inv: 2.5, lives: 3,
                    weapon: 'N', rapid: 0, shield: 0, active: true, respawn: 0, joined: slot === 0,
                });
                const players = [mkP(0)];
                const joinP2 = () => { if (!players[1]) { players.push(mkP(1)); players[1].x = Math.max(30, players[0].x - 24); } };

                // ---- 敌人 ----
                const enemies = [], bullets = [], items = [];
                const spawnPlan = [];
                for (let i = 0; i < P.nInf; i++) spawnPlan.push({ t: 'inf', x: 420 + rnd() * (LEVEL_LEN - 700) });
                for (let i = 0; i < P.nTurret; i++) spawnPlan.push({ t: 'tur', x: 500 + rnd() * (LEVEL_LEN - 900) });
                for (let i = 0; i < P.nFly; i++) spawnPlan.push({ t: 'fly', x: 500 + rnd() * (LEVEL_LEN - 800) });
                let spawned = 0;

                const spawnEnemy = () => {
                    while (spawned < spawnPlan.length && spawnPlan[spawned].x < cam + GW + 60) {
                        const s = spawnPlan[spawned++];
                        if (s.t === 'inf') enemies.push({ t: 'inf', x: s.x, y: GROUND - 26, w: 15, h: 26, hp: P.infHp, dir: -1, fireCd: 0.8 + rnd(), spd: P.eSpd, sway: rnd() * 9 });
                        else if (s.t === 'tur') enemies.push({ t: 'tur', x: s.x, y: GROUND - 28, w: 28, h: 28, hp: 4, fireCd: 1 + rnd(), ang: Math.PI });
                        else enemies.push({ t: 'fly', x: s.x, y: 60 + rnd() * 70, w: 22, h: 22, hp: 1, fireCd: 1.2 + rnd(), ph: rnd() * 9 });
                    }
                };

                // ---- 输入 ----
                const keys = new Set();
                const kd = e => {
                    const map = { KeyA: 1, KeyD: 1, KeyW: 1, KeyS: 1, KeyF: 1, ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Enter: 1, Numpad0: 1, Slash: 1 };
                    if (map[e.code]) e.preventDefault();
                    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Numpad0', 'Slash'].includes(e.code)) joinP2();
                    keys.add(e.code);
                };
                const ku = e => keys.delete(e.code);
                window.addEventListener('keydown', kd);
                window.addEventListener('keyup', ku);
                // 触屏：滑动方向控制 + 轻点开火
                let tdir = 0, tJump = false, tsx = 0, tsy = 0, tmoved = false, swiped = false;
                c.addEventListener('touchstart', e => { const p = e.touches[0]; tsx = p.clientX; tsy = p.clientY; tmoved = false; swiped = false; }, { passive: true });
                c.addEventListener('touchmove', e => {
                    const p = e.touches[0], dx = p.clientX - tsx, dy = p.clientY - tsy;
                    if (Math.hypot(dx, dy) > 26) {
                        swiped = true; tmoved = true;
                        if (Math.abs(dx) > Math.abs(dy)) { tdir = dx > 0 ? 1 : -1; }
                        else { if (dy < 0) tJump = true; else tdir = 0; }   // 上滑跳
                        tsx = p.clientX; tsy = p.clientY;
                        setTimeout(() => { if (!swiped) tdir = 0; }, 300);
                    }
                }, { passive: true });
                c.addEventListener('touchend', () => {
                    if (!tmoved) fire(players[0]);
                    if (tdir && !swiped) tdir = 0;
                    setTimeout(() => { tJump = false; }, 120);
                }, { passive: true });

                // ---- 物理 ----
                const groundAt = (px, pw, py, ph) => {
                    const gx = Math.max(0, Math.min(groundY.length - 1, Math.floor(px + pw / 2)));
                    let gy = groundY[gx];
                    for (const pl of plats) if (px + pw > pl.x && px < pl.x + pl.w && py <= pl.y + 2 && py > pl.y - 14) gy = Math.min(gy, pl.y);
                    return gy;
                };
                const inHazard = (px, pw) => hazards.some(hz => px + pw > hz.x + 6 && px < hz.x + hz.w - 6);

                const fire = p => {
                    if (!p || !p.joined || !p.active || over || p.fireCd > 0) return;
                    p.fireCd = p.weapon === 'M' ? 0.1 : 0.2;
                    try { MG.audio && MG.audio.sfx('launch'); } catch (e) { }
                    const cy = p.y + (p.crouch ? 4 : 7);
                    const shots = p.weapon === 'S' ? [-0.28, 0, 0.28] : [0];
                    for (const a of shots) {
                        bullets.push({
                            x: p.x + (p.dir > 0 ? p.w : -4), y: cy, w: 7, h: 3,
                            vx: p.dir * BSPD * Math.cos(a), vy: BSPD * Math.sin(a),
                            mine: true, slot: p.slot, col: PC[p.slot].bullet,
                        });
                    }
                };
                const eFire = (ex, ey, tx, ty) => {
                    const dx = tx - ex, dy = ty - ey, L = Math.max(1, Math.hypot(dx, dy));
                    bullets.push({ x: ex, y: ey, w: 6, h: 6, vx: dx / L * P.bulletSpd, vy: dy / L * P.bulletSpd, mine: false, col: '#ff7a5c' });
                };

                const killPlayer = p => {
                    if (p.inv > 0 || p.shield > 0 || over) return;
                    p.lives--;
                    if (p.lives <= 0) {
                        p.active = false;
                        if (players.filter(pp => pp.active || pp.lives > 0).length === 0) finish(false);
                        return;
                    }
                    p.x = Math.max(cam + 30, p.x - 40); p.y = GROUND - 60; p.vy = 0;
                    p.inv = 2.5; p.weapon = 'N';
                };
                const finish = win => {
                    if (over) return;
                    over = true;
                    const lost = players.reduce((s, p) => s + (3 - Math.max(0, p.lives)), 0);
                    const stars = win ? (lost === 0 ? 3 : lost <= 2 ? 2 : 1) : 0;
                    opts.onComplete && opts.onComplete({
                        win, stars,
                        score: endless ? kills : kills * 100 + (win ? 800 : 0),
                        title: win ? '🏆 任务完成！' : '💥 任务失败…',
                        lines: [
                            `击杀 ${kills} · 推进 ${(Math.floor(cam / LEVEL_LEN * 100))}%${bossSpawned ? (boss && boss.dead ? ' · Boss 已击破' : ' · Boss 战中') : ''}`,
                            players.map(p => `P${p.slot + 1} ♥${Math.max(0, p.lives)}`).join(' · '),
                        ],
                    });
                };

                // ---- 主循环 ----
                let last = Date.now(), raf = 0;
                const loop = () => {
                    const now = Date.now();
                    const dt = Math.min(0.04, (now - last) / 1000);
                    last = now; t += dt;
                    if (over) { endT += dt; draw(); if (endT < 1.1) raf = requestAnimationFrame(loop); return; }

                    // 玩家
                    for (const p of players) {
                        if (!p.joined) continue;
                        if (!p.active) continue;
                        p.fireCd -= dt; p.inv -= dt; p.shield -= dt;
                        let mx = 0, jump = false, crouch = false;
                        if (p.slot === 0) {
                            if (keys.has('KeyA')) mx = -1; if (keys.has('KeyD')) mx = 1;
                            if (keys.has('KeyW') || tJump) jump = true;
                            if (keys.has('KeyS')) crouch = true;
                            if (keys.has('KeyF')) fire(p);
                            if (tdir) mx = tdir;   // 触屏
                        } else {
                            if (keys.has('ArrowLeft')) mx = -1; if (keys.has('ArrowRight')) mx = 1;
                            if (keys.has('ArrowUp')) jump = true;
                            if (keys.has('ArrowDown')) crouch = true;
                            if (keys.has('Enter') || keys.has('Numpad0') || keys.has('Slash')) fire(p);
                        }
                        p.crouch = crouch && p.onGround;
                        if (mx) { p.dir = mx; p.x += mx * PSPD * dt; }
                        if (jump && p.onGround) { p.vy = JUMP_V; p.onGround = false; }
                        p.vy += GRAV * dt;
                        p.y += p.vy * dt;
                        const gy = groundAt(p.x, p.w, p.y, p.h);
                        if (p.y >= gy - (p.crouch ? 16 : 26)) { p.y = gy - (p.crouch ? 16 : 26); p.vy = 0; p.onGround = true; }
                        else if (p.vy > 0) p.onGround = false;
                        // 相机边界
                        if (p.x < cam + 4) p.x = cam + 4;
                        if (p.x > cam + GW - 20) p.x = cam + GW - 20;
                        // 水坑/坠落
                        if (p.y > GH + 10 || (p.onGround && inHazard(p.x, p.w))) killPlayer(p);
                    }
                    // 相机（跟随最前者，不回卷）
                    const lead = Math.max(...players.filter(p => p.active).map(p => p.x), cam + GW * 0.35);
                    const targetCam = Math.max(cam, Math.min(lead - GW * 0.45, LEVEL_LEN - GW + 220));
                    cam += Math.min(240 * dt, Math.max(-240 * dt, targetCam - cam));
                    cam = Math.max(0, cam);
                    spawnEnemy();

                    // 敌人
                    for (const en of enemies) {
                        if (en.t === 'inf') {
                            const tgt = players.find(p => p.active) || players[0];
                            en.x += Math.sign(tgt.x - en.x) * en.spd * 0.55 * dt;
                            en.y = GROUND - 26 - Math.abs(Math.sin(t * 6 + en.sway)) * 3;
                            en.dir = tgt.x > en.x ? 1 : -1;
                            en.fireCd -= dt;
                            if (en.fireCd <= 0 && Math.abs(tgt.x - en.x) < GW * 0.75) {
                                en.fireCd = P.eFire * (0.8 + Math.random() * 0.5);
                                eFire(en.x, en.y + 8, tgt.x, tgt.y);
                            }
                        } else if (en.t === 'tur') {
                            const tgt = players.find(p => p.active) || players[0];
                            en.ang = Math.atan2(tgt.y + 8 - en.y - 14, tgt.x + 7 - en.x - 14);
                            en.fireCd -= dt;
                            if (en.fireCd <= 0 && Math.abs(tgt.x - en.x) < GW * 0.8 && tgt.x > en.x - 40) {
                                en.fireCd = P.eFire * (0.9 + Math.random() * 0.6);
                                eFire(en.x + 14, en.y + 14, tgt.x, tgt.y + 8);
                            }
                        } else {
                            en.ph += dt;
                            en.y += Math.sin(en.ph * 2.2) * 34 * dt;
                            const tgt = players.find(p => p.active) || players[0];
                            en.x += Math.sign(tgt.x - en.x) * 40 * dt;
                            en.fireCd -= dt;
                            if (en.fireCd <= 0 && Math.abs(tgt.x - en.x) < GW * 0.7) {
                                en.fireCd = P.eFire * 1.4;
                                eFire(en.x + 11, en.y + 11, tgt.x, tgt.y + 8);
                            }
                        }
                        // 与玩家身体碰撞
                        for (const p of players) {
                            if (!p.active || p.inv > 0) continue;
                            if (p.x < en.x + (en.t === 'tur' ? 24 : 14) && p.x + p.w > en.x + 4 && p.y < en.y + (en.t === 'fly' ? 20 : 24) && p.y + (p.crouch ? 16 : 26) > en.y + 4) killPlayer(p);
                        }
                    }
                    // Boss
                    if (!endless && !bossSpawned && cam >= LEVEL_LEN - GW + 120) {
                        bossSpawned = true;
                        boss = { x: cam + GW - 110, y: GROUND - 76, w: 70, h: 76, hp: P.bossHp, maxHp: P.bossHp, fireCd: 1.2, dead: false, ph: 0 };
                    }
                    if (boss && !boss.dead) {
                        boss.ph += dt;
                        boss.y = GROUND - 76 + Math.sin(boss.ph * 1.6) * 8;
                        boss.fireCd -= dt;
                        if (boss.fireCd <= 0) {
                            boss.fireCd = Math.max(0.5, 1.35 - (idx0 / 49) * 0.6);
                            const tgt = players.find(p => p.active) || players[0];
                            const bx = boss.x + 30, by = boss.y + 30;
                            eFire(bx, by, tgt.x, tgt.y + 8);
                            if (Math.random() < 0.45) eFire(bx, by, tgt.x, tgt.y - 30);
                            if (Math.random() < 0.3) eFire(bx, by, tgt.x, tgt.y + 40);
                        }
                        for (const p of players) {
                            if (!p.active || p.inv > 0) continue;
                            if (p.x < boss.x + boss.w && p.x + p.w > boss.x && p.y < boss.y + boss.h && p.y + 26 > boss.y) killPlayer(p);
                        }
                    }
                    // 子弹
                    for (const b of bullets) {
                        b.x += b.vx * dt; b.y += b.vy * dt;
                        if (b.x < cam - 20 || b.x > cam + GW + 20 || b.y < -20 || b.y > GH + 20) { b.dead = true; continue; }
                        if (b.mine) {
                            for (const en of enemies) {
                                const ew = en.t === 'tur' ? 26 : 16, eh = en.t === 'tur' ? 26 : 24;
                                if (b.x < en.x + ew && b.x + 7 > en.x && b.y < en.y + eh && b.y + 3 > en.y) {
                                    b.dead = true; en.hp--;
                                    if (en.hp <= 0) {
                                        en.dead = true; kills++;
                                        if (Math.random() < 0.14) items.push({ x: en.x, y: en.y, k: ['S', 'M', 'B', 'H'][Math.floor(Math.random() * 4)], born: t });
                                    }
                                    break;
                                }
                            }
                            if (!b.dead && boss && !boss.dead && b.x < boss.x + boss.w && b.x + 7 > boss.x && b.y < boss.y + boss.h && b.y + 3 > boss.y) {
                                b.dead = true; boss.hp--;
                                if (boss.hp <= 0) { boss.dead = true; kills += 8; finish(true); }
                            }
                        } else {
                            for (const p of players) {
                                if (!p.active) continue;
                                if (p.x < b.x + 4 && p.x + p.w > b.x && p.y < b.y + 4 && p.y + (p.crouch ? 16 : 26) > b.y) { b.dead = true; killPlayer(p); break; }
                            }
                        }
                    }
                    for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].dead) bullets.splice(i, 1);
                    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead || enemies[i].x < cam - 80) enemies.splice(i, 1);
                    // 道具
                    for (let i = items.length - 1; i >= 0; i--) {
                        const it = items[i];
                        it.y += 30 * dt;
                        if (it.y > GROUND - 20) it.y = GROUND - 20;
                        for (const p of players) {
                            if (!p.active) continue;
                            if (p.x < it.x + 16 && p.x + p.w > it.x && p.y < it.y + 16 && p.y + 26 > it.y) {
                                items.splice(i, 1);
                                if (it.k === 'S') p.weapon = 'S';
                                else if (it.k === 'M') p.weapon = 'M';
                                else if (it.k === 'B') p.shield = 8;
                                else if (it.k === 'H') p.lives++;
                                break;
                            }
                        }
                    }
                    // 无尽：敌人补货 + 推进到底则循环新 stage
                    if (endless && enemies.length < 3 && spawned >= spawnPlan.length) {
                        for (let i = 0; i < 4; i++) enemies.push({ t: 'inf', x: cam + GW + 40 + Math.random() * 160, y: GROUND - 26, w: 15, h: 26, hp: P.infHp, dir: -1, fireCd: 1, spd: P.eSpd, sway: Math.random() * 9 });
                    }
                    if (endless && cam >= LEVEL_LEN - GW + 120 && enemies.length === 0) finish(true);

                    draw();
                    raf = requestAnimationFrame(loop);
                };

                // ---- 绘制 ----
                const draw = () => {
                    // 天空
                    let sky = null;
                    try { sky = ctx.createLinearGradient(0, 0, 0, GH); sky.addColorStop(0, TH.sky[0]); sky.addColorStop(1, TH.sky[1]); } catch (e) { }
                    ctx.fillStyle = sky || TH.sky[0]; ctx.fillRect(0, 0, GW, GH);
                    // 远景（视差）
                    ctx.fillStyle = TH.hills;
                    for (let i = 0; i < 8; i++) {
                        const hx = ((i * 220 - cam * 0.3) % (GW + 260) + GW + 260) % (GW + 260) - 130;
                        ctx.beginPath();
                        ctx.moveTo(hx - 110, GROUND);
                        ctx.quadraticCurveTo(hx, GROUND - 150 - (i % 3) * 40, hx + 110, GROUND);
                        ctx.closePath(); ctx.fill();
                    }
                    if (theme === 'factory') {   // 工厂管道
                        ctx.fillStyle = 'rgba(20,26,42,0.8)';
                        for (let i = 0; i < 10; i++) {
                            const px = ((i * 190 - cam * 0.5) % (GW + 220) + GW + 220) % (GW + 220) - 110;
                            ctx.fillRect(px, 30, 26, GROUND - 30);
                            ctx.fillStyle = 'rgba(60,70,100,0.6)'; ctx.fillRect(px + 4, 30, 5, GROUND - 30); ctx.fillStyle = 'rgba(20,26,42,0.8)';
                        }
                    }
                    // 地面
                    ctx.fillStyle = TH.ground2;
                    ctx.fillRect(0, GROUND, GW, GH - GROUND);
                    for (let x = 0; x < GW; x += 6) {
                        const gx = Math.floor(cam + x), gy = groundY[Math.max(0, Math.min(groundY.length - 1, gx))];
                        if (gy < GROUND) { ctx.fillStyle = TH.ground1; ctx.fillRect(x, gy, 7, GROUND - gy + 4); ctx.fillStyle = TH.groundLine; ctx.fillRect(x, gy, 7, 3); }
                    }
                    ctx.fillStyle = TH.groundLine;
                    for (let x = -((cam | 0) % 24); x < GW; x += 24) ctx.fillRect(x, GROUND, 14, 3);
                    // 平台
                    for (const pl of plats) {
                        if (pl.x + pl.w < cam - 20 || pl.x > cam + GW + 20) continue;
                        const sx = pl.x - cam;
                        ctx.fillStyle = TH.ground1; ctx.fillRect(sx, pl.y, pl.w, pl.h);
                        ctx.fillStyle = TH.groundLine; ctx.fillRect(sx, pl.y, pl.w, 3);
                        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx + 3, pl.y + pl.h - 2, pl.w - 6, 3);
                    }
                    // 水坑
                    for (const hz of hazards) {
                        if (hz.x + hz.w < cam - 20 || hz.x > cam + GW + 20) continue;
                        const sx = hz.x - cam;
                        ctx.fillStyle = '#1d4f7a'; ctx.fillRect(sx, GROUND - 2, hz.w, GH - GROUND + 2);
                        ctx.fillStyle = `rgba(120,190,255,${0.25 + 0.15 * Math.sin(t * 3)})`;
                        ctx.fillRect(sx, GROUND - 2, hz.w, 5);
                    }
                    // 道具
                    const IC = { S: '🌟', M: '🔫', B: '💫', H: '❤️' };
                    for (const it of items) {
                        ctx.save();
                        ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 10;
                        ctx.font = '15px serif'; ctx.textAlign = 'center';
                        ctx.fillText(IC[it.k], it.x + 8 - cam, it.y + 12);
                        ctx.restore();
                    }
                    // 敌人
                    for (const en of enemies) {
                        const sx = en.x - cam;
                        if (sx < -40 || sx > GW + 40) continue;
                        if (en.t === 'inf') drawSoldier(ctx, sx, en.y, 15, 26, { skin: '#c8a0e0', band: '#402060', pants: '#4a3a68' }, en.dir, t, false, false);
                        else if (en.t === 'tur') drawTurret(ctx, sx, en.y, en.ang, t);
                        else drawFlyer(ctx, sx, en.y, t);
                    }
                    // Boss
                    if (boss && !boss.dead) {
                        const sx = boss.x - cam;
                        ctx.save();
                        ctx.shadowColor = '#ff5c5c'; ctx.shadowBlur = 16;
                        let bg2 = null;
                        try { bg2 = ctx.createLinearGradient(sx, boss.y, sx, boss.y + boss.h); bg2.addColorStop(0, '#8a4058'); bg2.addColorStop(1, '#3a1424'); } catch (e) { }
                        ctx.fillStyle = bg2 || '#6a2a3a';
                        if (ctx.roundRect) ctx.roundRect(sx, boss.y, boss.w, boss.h, 12); else ctx.rect(sx, boss.y, boss.w, boss.h);
                        ctx.fill();
                        ctx.restore();
                        // 炮口 + 核心眼
                        ctx.fillStyle = '#2a2030'; ctx.fillRect(sx + boss.w - 18, boss.y + 24, 22, 16);
                        ctx.fillStyle = `rgba(255,90,70,${0.6 + 0.4 * Math.sin(t * 10)})`;
                        ctx.beginPath(); ctx.arc(sx + 34, boss.y + 34, 11, 0, Math.PI * 2); ctx.fill();
                        // 血条
                        ctx.fillStyle = '#1a1a24'; ctx.fillRect(sx, boss.y - 16, boss.w, 7);
                        ctx.fillStyle = '#ff5c5c'; ctx.fillRect(sx + 1, boss.y - 15, (boss.w - 2) * Math.max(0, boss.hp / boss.maxHp), 5);
                    }
                    // 玩家（无敌闪烁）
                    for (const p of players) {
                        if (!p.active) continue;
                        if (p.inv > 0 && Math.floor(t * 18) % 2 === 0) continue;
                        if (p.shield > 0) {
                            ctx.save();
                            ctx.strokeStyle = `rgba(120,200,255,${0.5 + 0.4 * Math.sin(t * 14)})`; ctx.lineWidth = 2.5;
                            ctx.beginPath(); ctx.arc(p.x + 7 - cam, p.y + (p.crouch ? 8 : 13), 17, 0, Math.PI * 2); ctx.stroke();
                            ctx.restore();
                        }
                        drawSoldier(ctx, p.x - cam, p.y, p.w, p.crouch ? 16 : 26, PC[p.slot], p.dir, t, p.crouch, false);
                    }
                    // 子弹
                    for (const b of bullets) {
                        ctx.save();
                        ctx.shadowColor = b.col; ctx.shadowBlur = 6;
                        ctx.fillStyle = b.mine ? b.col : '#ffb090';
                        if (b.mine) ctx.fillRect(b.x - cam, b.y, 8, 3);
                        else { ctx.beginPath(); ctx.arc(b.x - cam + 3, b.y + 3, 3, 0, Math.PI * 2); ctx.fill(); }
                        ctx.restore();
                    }
                    // HUD
                    opts.onScore && opts.onScore(
                        `${endless ? '无尽' : `第 ${idx0 + 1} 关`} · 击杀 ${kills} · 推进 ${Math.min(100, Math.floor(cam / (LEVEL_LEN - GW + 220) * 100))}%`
                        + ` · P1 ♥${Math.max(0, players[0].lives)}${players[1] ? ` · P2 ♥${Math.max(0, players[1].lives)}` : ' · (P2 按方向键加入)'}`
                    );
                };

                raf = requestAnimationFrame(loop);
                MG.hint(container, `${endless ? '无尽模式 · ' : ''}P1 A/D+W+S+F · P2 ←→+↑↓+回车 · 触屏滑动移动/上滑跳/轻点开火 · 击破关底 Boss 通关`);
                draw();
                // 测试钩子
                if (typeof window !== 'undefined' && window.__MG_TEST) {
                    window['__contra_' + theme] = {
                        get over() { return over; }, get kills() { return kills; },
                        get enemies() { return enemies.length; }, get players() { return players; },
                        get bullets() { return bullets.length; }, get boss() { return boss; }, get bossSpawned() { return bossSpawned; },
                        get cam() { return cam; }, get LEVEL_LEN() { return LEVEL_LEN; },
                        fire, finish, joinP2,
                    };
                }
                return {
                    stop() { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); destroy(); },
                };
            },
        };
    }

    // 固定种子伪随机（地图生成可复现）
    let _seed = 1;
    function srand(s) { _seed = (s || 1) % 2147483647; if (_seed <= 0) _seed += 2147483646; }
    function rnd() { _seed = _seed * 16807 % 2147483647; return _seed / 2147483647; }
    function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

    MiniGames.contra1 = mkContra('jungle');
    MiniGames.contra2 = mkContra('factory');
})();
