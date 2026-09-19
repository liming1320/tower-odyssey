// 三消英雄射击（triple-shoot）：单机「三消 + 塔防射击」混合小游戏
// 玩法：底部 5×4 三消盘 —— 交换相邻块凑 3+ 同色消除，对应颜色生成/强化一名英雄；
//       顶部 5 条通道小怪向下走，英雄在底部自动射击小怪；不同颜色 = 不同英雄特性。
// 单人无需联机（opt-in 不涉及 MG.pvp）。注册进 minigames.js 的 GAMES + CAT_OF[action]。
window.MiniGames = window.MiniGames || {};
(function () {
    'use strict';

    // ===== 颜色 / 英雄定义（索引 0..4 同时对应 5 条通道 lane）=====
    const COLORS = [
        { key: 'red',    c1: '#ff7a8b', c2: '#a8202f', emo: '🔴', hero: '🛡️', name: '战士' },
        { key: 'blue',   c1: '#7ab8ff', c2: '#1f4fbf', emo: '🔵', hero: '🔮', name: '法师' },
        { key: 'green',  c1: '#7ee08a', c2: '#1f7a32', emo: '🟢', hero: '🏹', name: '游侠' },
        { key: 'yellow', c1: '#ffe07a', c2: '#b8860b', emo: '🟡', hero: '✨', name: '牧师' },
        { key: 'purple', c1: '#c79bff', c2: '#5a1f9f', emo: '🟣', hero: '☠️', name: '术士' },
    ];
    // 英雄基础属性：dmg 单发伤害 / interval 开火间隔(ms) / splash 溅射 / slow 减速 / poison 中毒
    const HERO_BASE = [
        { dmg: 4, interval: 720, splash: false, slow: false, poison: false }, // 红：高攻慢射
        { dmg: 2, interval: 680, splash: true,  slow: false, poison: false }, // 蓝：溅射
        { dmg: 1, interval: 240, splash: false, slow: false, poison: false }, // 绿：速射
        { dmg: 2, interval: 560, splash: false, slow: true,  poison: false }, // 黄：减速
        { dmg: 1, interval: 760, splash: false, slow: false, poison: true  }, // 紫：中毒
    ];
    // 每升 1 级增量
    const HERO_LVL = [
        { dmg: 1, intMul: 0.92 }, { dmg: 1, intMul: 0.92 }, { dmg: 0, intMul: 0.90 },
        { dmg: 1, intMul: 0.93 }, { dmg: 0, intMul: 0.91 },
    ];
    const MIN_INT = [380, 360, 140, 300, 420]; // 开火间隔下限

    // 小怪类型（按关卡难度加权出现）
    const MTYPES = [
        { emo: '👾', hpMul: 1.0, spdMul: 1.0 },
        { emo: '👹', hpMul: 2.2, spdMul: 0.7 },
        { emo: '🦇', hpMul: 0.7, spdMul: 1.7 },
        { emo: '🐉', hpMul: 3.2, spdMul: 0.6 },
    ];

    // ===== 几何布局（逻辑坐标系，MG.canvas 自动适配容器）=====
    const W = 420, H = 680;
    const LANES = 5, LANE_W = W / LANES;          // 84
    const FIELD_H = 420;                           // 战斗区高度
    const DEF_Y = 400;                             // 防线（小怪越过即扣血）
    const HERO_Y = 388;                            // 英雄站位
    const GRID_Y = 432, ROWS = 4, COLS = 5, CELL_W = LANE_W, CELL_H = (H - GRID_Y) / ROWS; // 62

    const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

    function makeLevels() {
        const out = [];
        for (let i = 1; i <= 50; i++) {
            const total = 12 + i * 2;
            out.push({ name: '第 ' + i + ' 关', desc: '歼灭 ' + total + ' 只小怪 · 别让它们越过防线' });
        }
        return out;
    }

    MiniGames['triple-shoot'] = {
        LEVELS: makeLevels(),
        ENDLESS: { name: '∞ 无尽', desc: '最高难度持续来袭，撑到最后一刻' },
        start(container, opts, level) {
            opts = opts || {};
            const idx = (opts.levelIdx != null && opts.levelIdx >= 0) ? opts.levelIdx : (opts.endless ? 49 : 0);
            const endless = !!opts.endless;

            const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);

            // ---------- 难度参数 ----------
            const L = idx;
            const spawnInterval = Math.max(650, 2100 - L * 38);
            const monHP = 2 + Math.floor(L / 3);
            const monSpeed = 22 + L * 0.9;
            const total = endless ? 1e9 : (12 + idx * 2);

            // ---------- 运行状态 ----------
            let grid = [];                     // grid[r][c] = colorIdx | null
            let heroes = [null, null, null, null, null];
            let monsters = [];
            let bullets = [];
            let selected = null;              // {r,c}
            let hp = 100, score = 0, kills = 0, spawned = 0;
            let time = 0, lastSpawn = -9999, last = performance.now();
            let done = false;

            // ---------- 三消：初始化（无初始三连且有可行步）----------
            function fillRandom() {
                grid = [];
                for (let r = 0; r < ROWS; r++) {
                    const row = [];
                    for (let cI = 0; cI < COLS; cI++) row.push(ri(0, 4));
                    grid.push(row);
                }
            }
            function findMatches() {
                const m = new Set();
                for (let r = 0; r < ROWS; r++) {
                    let c0 = 0;
                    while (c0 < COLS) {
                        const v = grid[r][c0];
                        if (v === null) { c0++; continue; }
                        let c1 = c0;
                        while (c1 + 1 < COLS && grid[r][c1 + 1] === v) c1++;
                        if (c1 - c0 + 1 >= 3) for (let cI = c0; cI <= c1; cI++) m.add(r + ',' + cI);
                        c0 = c1 + 1;
                    }
                }
                for (let cI = 0; cI < COLS; cI++) {
                    let r0 = 0;
                    while (r0 < ROWS) {
                        const v = grid[r0][cI];
                        if (v === null) { r0++; continue; }
                        let r1 = r0;
                        while (r1 + 1 < ROWS && grid[r1 + 1][cI] === v) r1++;
                        if (r1 - r0 + 1 >= 3) for (let r = r0; r <= r1; r++) m.add(r + ',' + cI);
                        r0 = r1 + 1;
                    }
                }
                return m;
            }
            function gravity() {
                for (let cI = 0; cI < COLS; cI++) {
                    const col = [];
                    for (let r = 0; r < ROWS; r++) if (grid[r][cI] !== null) col.push(grid[r][cI]);
                    const need = ROWS - col.length;
                    for (let i = 0; i < need; i++) col.unshift(ri(0, 4));
                    for (let r = 0; r < ROWS; r++) grid[r][cI] = col[r];
                }
            }
            function hasMove() {
                for (let r = 0; r < ROWS; r++) for (let cI = 0; cI < COLS; cI++) {
                    for (const d of [[0, 1], [1, 0]]) {
                        const nr = r + d[0], nc = cI + d[1];
                        if (nr >= ROWS || nc >= COLS) continue;
                        const t = grid[r][cI]; grid[r][cI] = grid[nr][nc]; grid[nr][nc] = t;
                        const ok = findMatches().size > 0;
                        const u = grid[r][cI]; grid[r][cI] = grid[nr][nc]; grid[nr][nc] = u;
                        if (ok) return true;
                    }
                }
                return false;
            }
            function shuffleBoard() {
                let guard = 0;
                do { fillRandom(); guard++; } while (guard < 60 && (findMatches().size > 0 || !hasMove()));
            }
            function chargeHero(color, amt) {
                let hh = heroes[color];
                if (!hh) {
                    const b = HERO_BASE[color];
                    hh = { color, level: 1, xp: 0, dmg: b.dmg, interval: b.interval, splash: b.splash, slow: b.slow, poison: b.poison };
                    heroes[color] = hh;
                }
                hh.xp += amt;
                const lv = HERO_LVL[color];
                while (hh.xp >= 6) {
                    hh.xp -= 6; hh.level++;
                    hh.dmg += lv.dmg;
                    hh.interval = Math.max(MIN_INT[color], hh.interval * lv.intMul);
                }
            }
            function resolveBoard() {
                let combo = 0;
                while (true) {
                    const m = findMatches();
                    if (m.size === 0) break;
                    combo++;
                    m.forEach(key => {
                        const p = key.split(',');
                        const r = +p[0], cI = +p[1];
                        const col = grid[r][cI];
                        chargeHero(col, 1);
                        score += 10 * combo;
                        grid[r][cI] = null;
                    });
                    gravity();
                }
                if (!hasMove()) shuffleBoard();
            }

            // 初始棋盘：无三连且有步可走
            let guard = 0;
            do { fillRandom(); guard++; } while (guard < 60 && (findMatches().size > 0 || !hasMove()));

            // ---------- 输入：点选交换 ----------
            function toGrid(lx, ly) {
                if (ly < GRID_Y || lx < 0 || lx >= W) return null;
                const cI = Math.floor(lx / CELL_W), r = Math.floor((ly - GRID_Y) / CELL_H);
                if (cI < 0 || cI >= COLS || r < 0 || r >= ROWS) return null;
                return { r, c: cI };
            }
            function trySwap(a, b) {
                if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return;
                const t = grid[a.r][a.c]; grid[a.r][a.c] = grid[b.r][b.c]; grid[b.r][b.c] = t;
                if (findMatches().size > 0) {
                    resolveBoard();
                    try { MG.audio && MG.audio.sfx && MG.audio.sfx('blip'); } catch (e) {}
                } else {
                    const u = grid[a.r][a.c]; grid[a.r][a.c] = grid[b.r][b.c]; grid[b.r][b.c] = u; // 无匹配则还原
                }
            }
            function onTap(lx, ly) {
                const g = toGrid(lx, ly);
                if (!g) return;
                if (!selected) { selected = g; return; }
                if (selected.r === g.r && selected.c === g.c) { selected = null; return; }
                trySwap(selected, g);
                selected = null;
            }
            const rectPt = e => {
                const r = c.getBoundingClientRect();
                const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
                const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
                return { x: cx / r.width * w, y: cy / r.height * h };
            };
            const md = e => { e.preventDefault(); const p = rectPt(e); onTap(p.x, p.y); };
            c.addEventListener('mousedown', md);
            c.addEventListener('touchstart', md, { passive: false });

            // ---------- 战斗：生成 / 更新 ----------
            function spawnMonster() {
                const lane = ri(0, LANES - 1);
                // 关卡越高越多坦克/快怪/龙
                let t = MTYPES[0];
                const roll = Math.random();
                if (L >= 8 && roll < 0.22) t = MTYPES[1];
                else if (L >= 5 && roll < 0.45) t = MTYPES[2];
                else if (L >= 14 && roll > 0.9) t = MTYPES[3];
                monsters.push({
                    lane, x: lane * LANE_W + LANE_W / 2, y: -20,
                    hp: Math.ceil(monHP * t.hpMul), maxhp: Math.ceil(monHP * t.hpMul),
                    speed: monSpeed * t.spdMul, emo: t.emo, w: 30, h: 30,
                    slowT: 0, poisonT: 0,
                });
                spawned++;
            }
            function fire(hh, lane) {
                bullets.push({ lane, x: lane * LANE_W + LANE_W / 2, y: HERO_Y - 14, dmg: hh.dmg, color: hh.color, splash: hh.splash, slow: hh.slow, poison: hh.poison });
            }

            function finalize(win) {
                if (done) return;
                done = true;
                const stars = win ? (hp >= 80 ? 3 : hp >= 40 ? 2 : 1) : 0;
                try { opts.onComplete && opts.onComplete({ win, stars, score, lines: ['击杀 ' + kills + (endless ? '' : (' / ' + total)), '幸存血量 ' + Math.max(0, Math.round(hp))] }); } catch (e) {}
            }

            // ---------- 主循环 ----------
            function tick() {
                if (done) return;
                const now = performance.now();
                let dt = now - last; last = now;
                if (dt > 60) dt = 60;
                time += dt;

                // 生成
                if (spawned < total && time - lastSpawn >= spawnInterval) {
                    lastSpawn = time; spawnMonster();
                }

                // 小怪移动
                for (const m of monsters) {
                    if (m.slowT > 0) m.slowT -= dt;
                    if (m.poisonT > 0) { m.poisonT -= dt; m.hp -= 1.6 * dt / 1000; }
                    const sp = m.speed * (m.slowT > 0 ? 0.45 : 1);
                    m.y += sp * dt / 1000;
                }
                // 越线扣血
                for (let i = monsters.length - 1; i >= 0; i--) {
                    const m = monsters[i];
                    if (m.y >= DEF_Y) { hp -= 10; monsters.splice(i, 1); continue; }
                    if (m.hp <= 0) { kills++; score += 15 + m.maxhp; monsters.splice(i, 1); try { MG.audio && MG.audio.sfx && MG.audio.sfx('coin'); } catch (e) {} }
                }

                // 英雄开火
                for (let lane = 0; lane < LANES; lane++) {
                    const hh = heroes[lane];
                    if (!hh) continue;
                    if (time - (hh._last || 0) >= hh.interval) { hh._last = time; fire(hh, lane); }
                }

                // 子弹飞行 + 命中（取通道内最靠近英雄 = y 最大者）
                for (let i = bullets.length - 1; i >= 0; i--) {
                    const b = bullets[i];
                    b.y -= 280 * dt / 1000;
                    if (b.y < -20) { bullets.splice(i, 1); continue; }
                    let hitM = null;
                    for (const m of monsters) {
                        if (m.lane !== b.lane) continue;
                        if (!hitM || m.y > hitM.y) hitM = m;
                    }
                    if (hitM && Math.abs(b.y - hitM.y) < 20) {
                        hitM.hp -= b.dmg;
                        if (b.slow) hitM.slowT = 1400;
                        if (b.poison) hitM.poisonT = 2600;
                        if (b.splash) {
                            for (const m2 of monsters) {
                                if (m2 !== hitM && m2.lane === b.lane && Math.abs(m2.y - hitM.y) < 46) m2.hp -= b.dmg * 0.6;
                            }
                        }
                        bullets.splice(i, 1);
                    }
                }

                // 结算
                if (hp <= 0) { finalize(false); return; }
                if (!endless && spawned >= total && monsters.length === 0) { finalize(true); return; }

                draw();
                try { opts.onScore && opts.onScore('❤ ' + Math.max(0, Math.round(hp)) + '  ·  ' + (endless ? '∞' : ('第 ' + (idx + 1) + ' 关')) + '  ·  击杀 ' + kills + (endless ? '' : ('/' + total)) + '  ·  ' + score); } catch (e) {}
            }

            // ---------- 绘制 ----------
            function draw() {
                // 战斗区背景
                let bg = null;
                try { bg = ctx.createLinearGradient(0, 0, 0, FIELD_H); bg.addColorStop(0, '#10183a'); bg.addColorStop(1, '#070b1c'); } catch (e) {}
                ctx.fillStyle = bg || '#0a0e1a'; ctx.fillRect(0, 0, w, FIELD_H);
                // 通道分隔
                ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
                for (let i = 1; i < LANES; i++) { ctx.beginPath(); ctx.moveTo(i * LANE_W, 0); ctx.lineTo(i * LANE_W, FIELD_H); ctx.stroke(); }
                // 防线
                ctx.strokeStyle = 'rgba(255,90,110,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
                ctx.beginPath(); ctx.moveTo(0, DEF_Y); ctx.lineTo(W, DEF_Y); ctx.stroke(); ctx.setLineDash([]);

                // 小怪
                for (const m of monsters) {
                    MG.ui.emoji(ctx, m.emo, m.x, m.y, 26);
                    // 血条
                    const bw = 26, ratio = Math.max(0, m.hp / m.maxhp);
                    MG.ui.rr(ctx, m.x - bw / 2, m.y - 18, bw, 4, 2); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
                    MG.ui.rr(ctx, m.x - bw / 2, m.y - 18, bw * ratio, 4, 2); ctx.fillStyle = ratio > 0.5 ? '#7ad86a' : (ratio > 0.25 ? '#ffd56b' : '#ff7a8b'); ctx.fill();
                    if (m.slowT > 0) MG.ui.emoji(ctx, '❄️', m.x + 12, m.y - 8, 12);
                    if (m.poisonT > 0) MG.ui.emoji(ctx, '☠️', m.x - 12, m.y - 8, 12);
                }
                // 英雄
                for (let lane = 0; lane < LANES; lane++) {
                    const hh = heroes[lane];
                    const cx = lane * LANE_W + LANE_W / 2;
                    if (hh) {
                        MG.ui.emoji(ctx, COLORS[lane].hero, cx, HERO_Y, 30);
                        MG.gfx.text(ctx, 'Lv' + hh.level, cx, HERO_Y + 20, 11, '#ffe07a', { stroke: false });
                    } else {
                        ctx.save(); ctx.globalAlpha = 0.35; MG.ui.emoji(ctx, COLORS[lane].emo, cx, HERO_Y, 20); ctx.restore();
                    }
                }
                // 子弹
                for (const b of bullets) {
                    const col = COLORS[b.color];
                    MG.gfx.glow(ctx, b.x, b.y, 7, col.c2);
                    ctx.fillStyle = col.c1; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 6.2832); ctx.fill();
                }

                // 顶部玩家血条
                MG.gfx.bar(ctx, 8, 8, 150, 12, Math.max(0, hp) / 100, { color: '#7ad86a', text: '❤ ' + Math.max(0, Math.round(hp)) });

                // 三消盘面板
                MG.gfx.panel(ctx, 6, GRID_Y - 6, W - 12, H - GRID_Y + 6, '#1c2440', '#0e1430', 12);
                for (let r = 0; r < ROWS; r++) for (let cI = 0; cI < COLS; cI++) {
                    const x = cI * CELL_W + 8, y = GRID_Y + r * CELL_H + 4, s = CELL_W - 14, v = grid[r][cI];
                    const col = COLORS[v];
                    MG.ui.tile(ctx, x, y, s, col.c1, col.c2, 'rgba(255,255,255,0.35)', 9);
                    MG.ui.emoji(ctx, col.emo, x + s / 2, y + s / 2, s * 0.5);
                    if (selected && selected.r === r && selected.c === cI) {
                        MG.ui.rr(ctx, x - 1, y - 1, s + 2, s + 2, 10);
                        ctx.lineWidth = 3; ctx.strokeStyle = '#ffd56b'; ctx.stroke();
                    }
                }
            }

            draw();
            MG.hint(container, (level && level.desc ? level.desc + ' · ' : '') + '点选相邻块凑 3+ 同色消除 → 召唤/强化英雄自动射击');

            // 测试钩子：暴露内部状态与操作，供 tools/smoke-triple-shoot.js 无浏览器回归
            if (typeof window !== 'undefined') window.__tripleShoot = {
                get grid() { return grid; }, get heroes() { return heroes; }, get monsters() { return monsters; },
                get bullets() { return bullets; }, get hp() { return hp; }, get kills() { return kills; }, get score() { return score; },
                swap(r1, c1, r2, c2) { trySwap({ r: r1, c: c1 }, { r: r2, c: c2 }); },
                debugMatch() { grid[0][0] = grid[0][1] = grid[0][2] = 0; resolveBoard(); },
                tick, draw,
            };

            const loop = setInterval(tick, 30);
            return {
                stop() {
                    clearInterval(loop);
                    c.removeEventListener('mousedown', md);
                    c.removeEventListener('touchstart', md);
                    try { destroy(); } catch (e) {}
                }
            };
        }
    };
})();
