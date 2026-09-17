// 坦克大战：FC Battle City 致敬（100% 自研复刻，非 ROM）
//   50 关 · 保护基地老鹰 · 消灭全部敌军
//   本地双人：P1 = WASD 移动 + F 开火 · P2 = 方向键移动 + 回车开火（随时按键加入）
//   触屏单人：滑动转向 · 轻点开火
//   道具：⭐火力升级 🧨清屏 🛡护盾 ⏱冻结敌军 🔧基地钢化 👑+1 命
window.MiniGames = window.MiniGames || {};
(function () {
    // ---------- 固定种子伪随机（每关地图固定不变） ----------
    let _seed = 1;
    const srand = s => { _seed = (s || 1) % 2147483647; if (_seed <= 0) _seed += 2147483646; };
    const rnd = () => { _seed = _seed * 16807 % 2147483647; return _seed / 2147483647; };
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

    const CELL = 34, COLS = 13, ROWS = 13;
    const W = COLS * CELL, H = ROWS * CELL;
    const T_EMPTY = 0, T_BRICK = 1, T_STEEL = 2, T_WATER = 3, T_GRASS = 4;
    const DIRS = { U: { x: 0, y: -1 }, D: { x: 0, y: 1 }, L: { x: -1, y: 0 }, R: { x: 1, y: 0 } };

    const LV_NAMES = [
        '初阵', '前哨', '阻击', '砖垒', '铁壁', '河谷', '草丛', '迷阵', '突击', '遭遇',
        '穿插', '伏击', '拉锯', '反扑', '合围', '突破', '夜袭', '奔袭', '强攻', '僵持',
        '绞肉', '钢铁', '洪流', '雷区', '孤军', '死守', '背水', '破晓', '总攻', '会战',
        '残阳', '铁幕', '风暴', '焦土', '炼狱', '修罗', '炼钢', '天堑', '攻城', '巷战',
        '殿后', '断后', '远征', '归途', '荣光', '勋章', '王牌', '传奇', '战神', '卫国战争',
    ];

    // ---------- 关卡参数：敌军构成 / 强度随关递增 ----------
    function lvParams(idx) {
        const t = idx / 49;
        const total = 16 + Math.floor(idx / 4);                       // 16~28 辆
        return {
            total,
            maxOnField: Math.min(6, 3 + Math.floor(idx / 12)),
            spd: 60 + 55 * t,                                          // 敌军速度 px/s
            fireRate: 0.9 + 1.5 * t,                                   // 开火间隔
            smart: 0.15 + 0.55 * t,                                    // 追击/打基地倾向
            mix: [                                                     // 组成概率 [普通,快速,硬汉,装甲]
                Math.max(0.08, 0.62 - 0.4 * t), 0.18 + 0.08 * t,
                0.15 + 0.22 * t, Math.max(0.05, 0.08 + 0.1 * t),
            ],
            steely: idx >= 14 ? 0.1 + 0.25 * t : 0,                    // 钢块密度
            watery: idx >= 24 ? 0.06 + 0.1 * t : 0,                    // 水域密度
        };
    }

    // ---------- 程序化地图（对称图案 + 基地堡垒 + 出生点清空） ----------
    function genMap(idx) {
        srand(idx * 7919 + 101);
        const g = Array.from({ length: ROWS }, () => Array(COLS).fill(T_EMPTY));
        const P = lvParams(idx);
        const put = (x, y, v) => { if (x >= 0 && x < COLS && y >= 0 && y < ROWS) g[y][x] = v; };
        // 5 种图案骨架
        const pat = idx % 5;
        for (let x = 0; x <= 6; x++) for (let y = 1; y < ROWS - 1; y++) {
            let v = T_EMPTY;
            if (pat === 0) v = (x % 2 === 0 && (y + x) % 3 !== 0) ? T_BRICK : T_EMPTY;                 // 竖列
            else if (pat === 1) v = (y % 3 === 0) ? T_BRICK : T_EMPTY;                                  // 横条
            else if (pat === 2) v = ((x + y) % 4 === 0 && y % 2 === 0) ? T_BRICK : T_EMPTY;             // 斜纹
            else if (pat === 3) v = (x % 3 === 1 && y % 3 !== 2) ? T_BRICK : T_EMPTY;                   // 方阵
            else v = ((x * x + y) % 5 < 2) ? T_BRICK : T_EMPTY;                                          // 散点
            if (v !== T_EMPTY && rnd() < 0.82) { put(x, y, v); put(12 - x, y, v); }                     // 左右对称
        }
        // 高关卡：钢块 / 水 / 草丛
        for (let k = 0; k < Math.floor(3 + P.steely * 26); k++) {
            const x = ri(1, 11), y = ri(2, 9);
            put(x, y, T_STEEL); put(12 - x, y, T_STEEL);
        }
        for (let k = 0; k < Math.floor(P.watery * 30); k++) {
            const x = ri(0, 6), y = ri(3, 9);
            put(x, y, T_WATER); put(12 - x, y, T_WATER);
        }
        for (let k = 0; k < 8; k++) {
            const x = ri(1, 5), y = ri(4, 10);
            if (g[y][x] === T_EMPTY) { put(x, y, T_GRASS); put(12 - x, y, T_GRASS); }
        }
        // 基地堡垒（老鹰 + 砖围）
        put(5, 11, T_EMPTY); put(6, 11, T_EMPTY); put(7, 11, T_EMPTY);
        put(5, 12, T_EMPTY); put(6, 12, T_EMPTY); put(7, 12, T_EMPTY);
        put(5, 11, T_BRICK); put(6, 11, T_BRICK); put(7, 11, T_BRICK);
        put(5, 12, T_BRICK); put(7, 12, T_BRICK);
        // 出生点清空（敌方三点 + 玩家两点）
        [[0, 0], [6, 0], [12, 0], [4, 12], [8, 12]].forEach(([x, y]) => {
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) put(x + dx, y + dy, T_EMPTY);
        });
        return g;
    }

    // ---------- 坦克绘制（像素风矢量） ----------
    function drawTank(ctx, tk, colors, t) {
        const x = tk.x, y = tk.y, s = tk.size;
        ctx.save();
        ctx.translate(x + s / 2, y + s / 2);
        const d = tk.dir;
        ctx.rotate(d === 'R' ? Math.PI / 2 : d === 'D' ? Math.PI : d === 'L' ? -Math.PI / 2 : 0);
        const tread = Math.sin(t * 14) * 1.6;   // 履带滚动动画
        // 履带（两侧 + 滚花）
        ctx.fillStyle = colors.tread;
        ctx.fillRect(-s / 2 + 1, -s / 2 + 2, s * 0.26, s - 4);
        ctx.fillRect(s / 2 - 1 - s * 0.26, -s / 2 + 2, s * 0.26, s - 4);
        ctx.fillStyle = colors.treadHi;
        for (let i = 0; i < 6; i++) {
            const yy = -s / 2 + 5 + i * (s - 10) / 5 + tread;
            ctx.fillRect(-s / 2 + 2, yy, s * 0.22, 1.6);
            ctx.fillRect(s / 2 - 4 - s * 0.22, yy, s * 0.22, 1.6);
        }
        // 车身（圆角 + 渐变）
        let body = null;
        try { body = ctx.createLinearGradient(0, -s / 4, 0, s / 4); body.addColorStop(0, colors.c1); body.addColorStop(1, colors.c2); } catch (e) { }
        ctx.fillStyle = body || colors.c1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-s * 0.28, -s * 0.38, s * 0.56, s * 0.76, 4); else ctx.rect(-s * 0.28, -s * 0.38, s * 0.56, s * 0.76);
        ctx.fill();
        // 炮塔（圆）+ 炮管
        ctx.fillStyle = colors.turret;
        ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = colors.gun; ctx.lineWidth = s * 0.12; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(0, -s * 0.1); ctx.lineTo(0, -s / 2 + 1); ctx.stroke();
        ctx.restore();
        // 闪光护盾
        if (tk.shield > 0) {
            ctx.save();
            ctx.strokeStyle = `rgba(120,200,255,${0.5 + 0.4 * Math.sin(t * 16)})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.62, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin(t * 16 + 2)})`;
            ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.74, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }
        // 硬汉血点
        if (tk.hp > 1) {
            ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('♥' + tk.hp, x + s / 2, y - 6);
        }
    }

    function drawEagle(ctx, px, py, dead) {
        ctx.save();
        ctx.translate(px + CELL / 2, py + CELL / 2);
        if (dead) {
            ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('💀', 0, 0);
        } else {
            ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 8;
            ctx.font = '23px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🦅', 0, 1);
        }
        ctx.restore();
    }

    function drawCell(ctx, v, px, py) {
        if (v === T_BRICK) {
            ctx.fillStyle = '#9c4a2a'; ctx.fillRect(px, py, CELL, CELL);
            ctx.fillStyle = '#7a3620';
            for (let r = 0; r < 4; r++) ctx.fillRect(px, py + r * (CELL / 4) + CELL / 4 - 2, CELL, 2);   // 横缝
            for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
                if ((r + c) % 2 === 0) ctx.fillRect(px + (c + 1) * (CELL / 2) - 1, py + r * (CELL / 4), 2, CELL / 4);
            }
            ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px, py, CELL, 3);
        } else if (v === T_STEEL) {
            let g = null; try { g = ctx.createLinearGradient(px, py, px + CELL, py + CELL); g.addColorStop(0, '#c8d0dc'); g.addColorStop(0.5, '#8892a4'); g.addColorStop(1, '#5a6478'); } catch (e) { }
            ctx.fillStyle = g || '#9aa4b6'; ctx.fillRect(px, py, CELL, CELL);
            ctx.strokeStyle = '#3a4252'; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath(); ctx.moveTo(px + 4, py + 10); ctx.lineTo(px + 10, py + 4); ctx.lineTo(px + 14, py + 4); ctx.lineTo(px + 4, py + 14); ctx.closePath(); ctx.fill();
        } else if (v === T_WATER) {
            ctx.fillStyle = '#2255aa'; ctx.fillRect(px, py, CELL, CELL);
            ctx.strokeStyle = 'rgba(150,200,255,0.5)'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px + 4, py + 10); ctx.quadraticCurveTo(px + 8, py + 6, px + 12, py + 10);
            ctx.moveTo(px + 16, py + 20); ctx.quadraticCurveTo(px + 20, py + 16, px + 24, py + 20);
            ctx.stroke();
        }
    }

    MiniGames.tank = {
        LEVELS: LV_NAMES.map((name, i) => {
            const P = lvParams(i);
            const t = i / 49;
            const tag = t < 0.25 ? '遭遇战' : t < 0.5 ? '攻坚战' : t < 0.75 ? '装甲洪流' : '卫国战争';
            return { name, desc: `${tag} · 敌军 ${P.total} 辆 · 智能 ${(P.smart * 100 | 0)}%` };
        }),
        ENDLESS: { name: '∞ 无尽', desc: '波次无限的敌军突击，坚守到最后一刻' },

        start(container, opts) {
            opts = opts || {};
            const idx0 = opts.levelIdx != null ? opts.levelIdx : 0;
            const endless = !!opts.endless;
            const wave = endless ? 18 : 0;   // 无尽模式起始强度加成
            const P = lvParams(Math.min(49, idx0 + wave));
            const map = genMap(Math.min(49, idx0 + wave)).map(r => r.slice());

            const { c, ctx, w, h, destroy } = MG.canvas(container, W, H);
            let over = false, won = false, t = 0;
            let eagle = { x: 6, y: 12, dead: false };
            let steelT = 0, freezeT = 0;
            let kills = 0, spawnLeft = endless ? Infinity : P.total;
            let spawnT = 0, spawnSlot = 0;
            let scoreP = [0, 0];
            let endT = 0;

            // ---- 玩家（P2 动态加入） ----
            const mkPlayer = (slot) => ({
                slot, x: (slot === 0 ? 4 : 8) * CELL + 3, y: 12 * CELL + 3, size: CELL - 6,
                dir: 'U', hp: 1, shield: 3, lives: 3, power: 0, fireCd: 0, respawn: 0,
                active: true, colors: slot === 0
                    ? { tread: '#8a6a1a', treadHi: '#c8a840', c1: '#ffe066', c2: '#d4a017', turret: '#f0c040', gun: '#7a6a2a' }
                    : { tread: '#3a6a3a', treadHi: '#68a868', c1: '#8ae87a', c2: '#3a9a3a', turret: '#6ac858', gun: '#2a6a2a' },
            });
            const players = [mkPlayer(0)];
            let p2Joined = false;
            const joinP2 = () => { if (!p2Joined) { p2Joined = true; players.push(mkPlayer(1)); } };

            // ---- 敌军 ----
            const enemies = [];
            const SPAWNS = [[0, 0], [6, 0], [12, 0]];
            const mkEnemy = () => {
                const r = Math.random();
                let acc = 0, type = 0;
                for (let i = 0; i < 4; i++) { acc += P.mix[i]; if (r < acc) { type = i; break; } }
                const [sx, sy] = SPAWNS[spawnSlot % 3]; spawnSlot++;
                const cols = [
                    { tread: '#6a4a4a', treadHi: '#a87878', c1: '#d8d8d8', c2: '#909098', turret: '#b8b8c0', gun: '#5a5a62' },  // 普通·银
                    { tread: '#4a5a6a', treadHi: '#88a8c0', c1: '#a8d8f0', c2: '#5898b8', turret: '#88c0e0', gun: '#3a6a8a' },  // 快速·蓝
                    { tread: '#5a4a6a', treadHi: '#9a88b0', c1: '#e8b8f0', c2: '#a058b8', turret: '#d090e0', gun: '#6a3a7a' },  // 硬汉·紫
                    { tread: '#6a6a3a', treadHi: '#b8b878', c1: '#f8e8a0', c2: '#c0a838', turret: '#e8d060', gun: '#7a7a2a' },  // 装甲·金（带道具）
                ][type];
                return {
                    type, x: sx * CELL + 3, y: sy * CELL + 3, size: CELL - 6,
                    dir: 'D', hp: type === 2 ? 4 : 1, shield: 1.2,   // 出生短暂无敌
                    spd: P.spd * (type === 1 ? 1.45 : type === 2 ? 0.85 : 1),
                    fireCd: 1 + Math.random(), think: 0, carries: type === 3, colors: cols, flash: 0,
                };
            };

            // ---- 子弹 / 道具 ----
            const bullets = [], items = [];
            const ITEM_DEFS = {
                star: { icon: '⭐', label: '火力升级' }, bomb: { icon: '🧨', label: '清屏' },
                shield: { icon: '🛡️', label: '护盾' }, clock: { icon: '⏱️', label: '冻结' },
                shovel: { icon: '🔧', label: '基地钢化' }, life: { icon: '👑', label: '+1 命' },
            };
            const dropItem = () => {
                const keys = Object.keys(ITEM_DEFS);
                const k = keys[Math.floor(Math.random() * keys.length)];
                let x, y, tries = 0;
                do { x = ri(1, 11); y = ri(2, 10); tries++; } while (tries < 30 && map[y][x] !== T_EMPTY);
                items.push({ k, x: x * CELL, y: y * CELL, born: t });
            };

            // ---- 输入 ----
            const keys = new Set();
            const P1K = { KeyW: 'U', KeyS: 'D', KeyA: 'L', KeyD: 'R' }, P1F = ['KeyF', 'Space'];
            const P2K = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' }, P2F = ['Enter', 'Numpad0', 'Slash'];
            const onKeyDown = e => {
                if (P1K[e.code] || P1F.includes(e.code) || P2K[e.code] || P2F.includes(e.code)) e.preventDefault();
                if (P2K[e.code] || P2F.includes(e.code)) joinP2();
                keys.add(e.code);
            };
            const onKeyUp = e => keys.delete(e.code);
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onKeyUp);
            // 触屏（单人）：滑动转向 + 轻点开火
            let tsx = 0, tsy = 0, tdir = null, tmoved = false;
            c.addEventListener('touchstart', e => { const p = e.touches[0]; tsx = p.clientX; tsy = p.clientY; tmoved = false; }, { passive: true });
            c.addEventListener('touchmove', e => {
                const p = e.touches[0], dx = p.clientX - tsx, dy = p.clientY - tsy;
                if (Math.hypot(dx, dy) > 18) {
                    tmoved = true;
                    tdir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
                    tsx = p.clientX; tsy = p.clientY;
                }
            }, { passive: true });
            c.addEventListener('touchend', () => { if (!tmoved) firePlayer(players[0]); tdir = null; }, { passive: true });

            // ---- 地图碰撞 ----
            const blockedAt = (nx, ny, size, forBullet) => {
                const x0 = Math.floor(nx / CELL), x1 = Math.floor((nx + size - 1) / CELL);
                const y0 = Math.floor(ny / CELL), y1 = Math.floor((ny + size - 1) / CELL);
                for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
                    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
                    const v = map[gy][gx];
                    if (v === T_BRICK || v === T_STEEL) return true;
                    if (!forBullet && v === T_WATER) return true;
                }
                return false;
            };
            const tankBlocked = (tk, nx, ny) => {
                if (nx < 0 || ny < 0 || nx + tk.size > W || ny + tk.size > H) return true;
                if (blockedAt(nx, ny, tk.size, false)) return true;
                // 老鹰占格
                const ex = eagle.x * CELL, ey = eagle.y * CELL;
                if (nx < ex + CELL && nx + tk.size > ex && ny < ey + CELL && ny + tk.size > ey && !eagle.dead) return true;
                // 其他坦克
                const all = [...players.filter(p => p.active), ...enemies];
                for (const o of all) {
                    if (o === tk) continue;
                    if (nx < o.x + o.size && nx + tk.size > o.x && ny < o.y + o.size && ny + tk.size > o.y) return true;
                }
                return false;
            };
            const moveTank = (tk, dir, dist) => {
                const d = DIRS[dir]; tk.dir = dir;
                const nx = tk.x + d.x * dist, ny = tk.y + d.y * dist;
                if (!tankBlocked(tk, nx, ny)) { tk.x = nx; tk.y = ny; return true; }
                // 半格对齐吸附（经典手感：贴墙滑动，方便钻缝）
                if (d.x !== 0) {
                    const ay = Math.round(tk.y / (CELL / 2)) * (CELL / 2);
                    if (ay !== tk.y && !tankBlocked(tk, tk.x, ay)) tk.y += Math.sign(ay - tk.y) * Math.min(Math.abs(ay - tk.y), dist);
                } else {
                    const ax = Math.round(tk.x / (CELL / 2)) * (CELL / 2);
                    if (ax !== tk.x && !tankBlocked(tk, ax, tk.y)) tk.x += Math.sign(ax - tk.x) * Math.min(Math.abs(ax - tk.x), dist);
                }
                return false;
            };

            // ---- 开火 ----
            const firePlayer = p => {
                if (!p || !p.active || over || p.fireCd > 0 || p.respawn > 0) return;
                const maxB = p.power >= 2 ? 2 : 1;
                if (bullets.filter(b => b.owner === p).length >= maxB) return;
                p.fireCd = 0.24;
                try { MG.audio && MG.audio.sfx('launch'); } catch (e) { }
                const d = DIRS[p.dir], cx = p.x + p.size / 2, cy = p.y + p.size / 2;
                bullets.push({
                    x: cx + d.x * 14 - 2, y: cy + d.y * 14 - 2, size: 4,
                    vx: d.x * 330, vy: d.y * 330, owner: p, from: 'player', power: p.power, slot: p.slot,
                });
            };
            const fireEnemy = en => {
                if (over || en.fireCd > 0) return;
                if (bullets.filter(b => b.owner === en).length >= 1) return;
                en.fireCd = P.fireRate * (0.7 + Math.random() * 0.6);
                const d = DIRS[en.dir], cx = en.x + en.size / 2, cy = en.y + en.size / 2;
                bullets.push({ x: cx + d.x * 14 - 2, y: cy + d.y * 14 - 2, size: 4, vx: d.x * 300, vy: d.y * 300, owner: en, from: 'enemy' });
            };

            // ---- 结算 ----
            const finish = (win) => {
                if (over) return;
                over = true; won = win;
                const aliveP = players.filter(p => p.active || p.lives > 0).length;
                const lostLives = players.reduce((s, p) => s + (3 - p.lives), 0);
                const stars = win ? (lostLives === 0 ? 3 : lostLives <= 2 ? 2 : 1) : 0;
                opts.onComplete && opts.onComplete({
                    win, stars,
                    score: endless ? kills : kills * 100 + (win ? 500 : 0),
                    title: win ? (endless ? '🏆 无尽波次荣耀！' : '🏆 关卡告捷！') : (eagle.dead ? '💥 基地失守…' : '💥 全军覆没…'),
                    lines: [
                        `击毁 ${kills} 辆敌军坦克`,
                        `P1 得分 ${scoreP[0]}${p2Joined ? ` · P2 得分 ${scoreP[1]}` : ''}`,
                        eagle.dead ? '老鹰被毁，重整旗鼓再来' : '',
                    ].filter(Boolean),
                });
            };

            // ---- 敌军 AI ----
            const enemyThink = (en, dt) => {
                en.think -= dt;
                if (en.think <= 0) {
                    en.think = 0.4 + Math.random() * 1.2;
                    const r = Math.random();
                    if (r < P.smart) {
                        // 追击：朝玩家或基地
                        const targets = players.filter(p => p.active);
                        const tgt = (targets.length && Math.random() < 0.6)
                            ? targets[Math.floor(Math.random() * targets.length)]
                            : { x: eagle.x * CELL, y: eagle.y * CELL };
                        const dx = tgt.x - en.x, dy = tgt.y - en.y;
                        en.aiDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
                    } else if (r < P.smart + 0.25) en.aiDir = 'D';   // 冲基地
                    else en.aiDir = ['U', 'D', 'L', 'R'][Math.floor(Math.random() * 4)];
                }
                if (!moveTank(en, en.aiDir, en.spd * dt)) {
                    en.think = 0;   // 撞墙立刻重新决策
                    if (Math.random() < 0.5) fireEnemy(en);
                }
                // 时不时开火
                if (Math.random() < dt * (0.5 + P.smart)) fireEnemy(en);
            };

            // ---- 主循环 ----
            let last = Date.now();
            const loop = () => {
                if (over && endT > 1.2) return;
                const now = Date.now();
                const dt = Math.min(0.05, (now - last) / 1000);
                last = now; t += dt;
                if (over) { endT += dt; draw(); raf = requestAnimationFrame(loop); return; }

                // 玩家控制
                for (const p of players) {
                    p.fireCd -= dt;
                    if (p.shield > 0) p.shield -= dt;
                    if (p.respawn > 0) {
                        p.respawn -= dt;
                        if (p.respawn <= 0) { p.active = true; p.shield = 3; p.x = (p.slot === 0 ? 4 : 8) * CELL + 3; p.y = 12 * CELL + 3; p.dir = 'U'; }
                        continue;
                    }
                    if (!p.active) continue;
                    let dir = null;
                    if (p.slot === 0) {
                        dir = tdir;   // 触屏优先
                        if (!dir) for (const k in P1K) if (keys.has(k)) { dir = P1K[k]; break; }
                        if (keys.has('KeyF') || keys.has('Space')) firePlayer(p);
                    } else {
                        for (const k in P2K) if (keys.has(k)) { dir = P2K[k]; break; }
                        if (keys.has('Enter') || keys.has('Numpad0') || keys.has('Slash')) firePlayer(p);
                    }
                    if (dir) moveTank(p, dir, 130 * dt);
                }
                // 敌军出生
                spawnT -= dt;
                if (spawnT <= 0 && enemies.length < P.maxOnField && (endless ? enemies.length < P.maxOnField : spawnLeft > 0)) {
                    const en = mkEnemy();
                    // 出生点被占则延迟
                    if (!tankBlocked(en, en.x, en.y)) {
                        enemies.push(en); if (!endless) spawnLeft--;
                        spawnT = Math.max(1.0, 2.6 - (P.smart * 1.2));
                    } else spawnT = 0.4;
                }
                // 敌军行动
                if (freezeT > 0) freezeT -= dt;
                else for (const en of enemies) { if (en.shield > 0) en.shield -= dt; enemyThink(en, dt); }
                if (steelT > 0) {
                    steelT -= dt;
                    if (steelT <= 0) {   // 钢化结束恢复砖墙
                        const bx = [5, 6, 7, 5, 7], by = [11, 11, 11, 12, 12];
                        for (let i = 0; i < 5; i++) if (map[by[i]][bx[i]] === T_STEEL) map[by[i]][bx[i]] = T_BRICK;
                    }
                }
                // 子弹
                for (const b of bullets) {
                    b.x += b.vx * dt; b.y += b.vy * dt;
                    if (b.x < -6 || b.y < -6 || b.x > W + 6 || b.y > H + 6) { b.dead = true; continue; }
                    // 打墙
                    const gx = Math.floor((b.x + 2) / CELL), gy = Math.floor((b.y + 2) / CELL);
                    if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
                        const v = map[gy][gx];
                        if (v === T_BRICK) { map[gy][gx] = T_EMPTY; b.dead = true; }
                        else if (v === T_STEEL) { if (b.power >= 3) map[gy][gx] = T_EMPTY; b.dead = true; }
                        else if (v === T_WATER && b.from === 'enemy') { /* 子弹过水 */ }
                    }
                    if (b.dead) continue;
                    // 子弹互消
                    for (const b2 of bullets) {
                        if (b2 === b || b2.dead || b2.from === b.from) continue;
                        if (Math.abs(b2.x - b.x) < 6 && Math.abs(b2.y - b.y) < 6) { b.dead = b2.dead = true; break; }
                    }
                    if (b.dead) continue;
                    // 打老鹰
                    if (!eagle.dead) {
                        const ex = eagle.x * CELL, ey = eagle.y * CELL;
                        if (b.x < ex + CELL && b.x + b.size > ex && b.y < ey + CELL && b.y + b.size > ey) {
                            eagle.dead = true; b.dead = true;
                            finish(false);
                        }
                    }
                    if (b.dead) continue;
                    // 打坦克
                    if (b.from === 'player') {
                        for (const en of enemies) {
                            if (en.shield > 0) continue;
                            if (b.x < en.x + en.size && b.x + b.size > en.x && b.y < en.y + en.size && b.y + b.size > en.y) {
                                b.dead = true; en.hp -= (b.power >= 1 ? 2 : 1);
                                if (en.hp <= 0) {
                                    en.dead = true; kills++;
                                    scoreP[b.slot] += [200, 300, 400, 500][en.type];
                                    if (en.carries) dropItem();
                                }
                                break;
                            }
                        }
                    } else {
                        for (const p of players) {
                            if (!p.active || p.respawn > 0) continue;
                            if (b.x < p.x + p.size && b.x + b.size > p.x && b.y < p.y + p.size && b.y + b.size > p.y) {
                                b.dead = true;
                                if (p.shield > 0) continue;
                                p.lives--; p.power = Math.max(0, p.power - 1);
                                if (p.lives <= 0 && players.filter(pp => pp.lives > 0).length === 0) { finish(false); }
                                else p.respawn = 1.2, p.active = p.lives > 0;
                                break;
                            }
                        }
                    }
                }
                for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].dead) bullets.splice(i, 1);
                for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
                // 道具拾取
                for (let i = items.length - 1; i >= 0; i--) {
                    const it = items[i];
                    for (const p of players) {
                        if (!p.active || p.respawn > 0) continue;
                        if (p.x < it.x + CELL && p.x + p.size > it.x && p.y < it.y + CELL && p.y + p.size > it.y) {
                            items.splice(i, 1);
                            if (it.k === 'star') p.power = Math.min(3, p.power + 1);
                            else if (it.k === 'bomb') { enemies.forEach(en => { en.dead = true; kills++; scoreP[p.slot] += 100; }); }
                            else if (it.k === 'shield') p.shield = 10;
                            else if (it.k === 'clock') freezeT = 8;
                            else if (it.k === 'shovel') {
                                steelT = 12;
                                [[5, 11], [6, 11], [7, 11], [5, 12], [7, 12]].forEach(([x, y]) => map[y][x] = T_STEEL);
                            }
                            else if (it.k === 'life') p.lives++;
                            p.shield = Math.max(p.shield, 0.5);
                            break;
                        }
                    }
                }
                // 胜负
                if (!endless && spawnLeft <= 0 && enemies.length === 0) finish(true);
                if (endless && eagle.dead) finish(false);

                draw();
                raf = requestAnimationFrame(loop);
            };

            // ---- 绘制 ----
            const draw = () => {
                let g = null;
                try { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a2a22'); g.addColorStop(1, '#16160f'); } catch (e) { }
                ctx.fillStyle = g || '#1a1a12'; ctx.fillRect(0, 0, W, H);
                for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
                    const v = map[y][x];
                    if (v !== T_EMPTY && v !== T_GRASS) drawCell(ctx, v, x * CELL, y * CELL);
                }
                drawEagle(ctx, eagle.x * CELL, eagle.y * CELL, eagle.dead);
                // 坦克
                for (const en of enemies) {
                    if (en.type === 3) { ctx.save(); ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 10); drawTank(ctx, en, en.colors, t); ctx.restore(); }
                    else drawTank(ctx, en, en.colors, t);
                }
                for (const p of players) if (p.active && p.respawn <= 0) drawTank(ctx, p, p.colors, t);
                // 子弹
                for (const b of bullets) {
                    ctx.save();
                    ctx.shadowColor = b.from === 'player' ? '#ffe08a' : '#ff9d8a'; ctx.shadowBlur = 6;
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(b.x + 2, b.y + 2, b.size * 0.7, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
                // 道具（发光脉动）
                for (const it of items) {
                    const k = 0.5 + 0.5 * Math.sin(t * 6);
                    ctx.save();
                    ctx.shadowColor = '#ffd56b'; ctx.shadowBlur = 10 + k * 8;
                    ctx.fillStyle = 'rgba(30,26,16,0.85)';
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(it.x + 4, it.y + 4, CELL - 8, CELL - 8, 6); else ctx.rect(it.x + 4, it.y + 4, CELL - 8, CELL - 8);
                    ctx.fill();
                    ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(ITEM_DEFS[it.k].icon, it.x + CELL / 2, it.y + CELL / 2);
                    ctx.restore();
                }
                // 草丛（顶层，半透明）
                for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
                    if (map[y][x] === T_GRASS) {
                        ctx.fillStyle = '#2a6a2a';
                        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
                        ctx.fillStyle = '#3a8a3a';
                        for (let i = 0; i < 5; i++) ctx.fillRect(x * CELL + 4 + i * 6, y * CELL + 6 + ((i * 13) % 14), 3, CELL - 12);
                    }
                }
                // 冻结提示
                if (freezeT > 0) {
                    ctx.fillStyle = `rgba(140,200,255,${0.08 + 0.04 * Math.sin(t * 8)})`;
                    ctx.fillRect(0, 0, W, H);
                }
                // HUD 文本
                opts.onScore && opts.onScore(
                    `${endless ? '无尽模式' : `第 ${idx0 + 1} 关`} · 敌余 ${enemies.length + Math.max(0, Math.min(spawnLeft, 99))} · 击毁 ${kills}`
                    + ` · P1 ♥${players[0].lives}${p2Joined ? ` · P2 ♥${players[1].lives}` : ' · (P2 按方向键加入)'}`
                );
            };

            let raf = requestAnimationFrame(loop);
            MG.hint(container, `${endless ? '无尽模式：' : ''}P1 WASD+F · P2 方向键+回车 · 触屏滑动转向轻点开火 · 保护 🦅 消灭全部敌军`);
            draw();
            // 测试钩子（仅测试模式）
            if (typeof window !== 'undefined' && window.__MG_TEST) {
                window.__tank = {
                    get over() { return over; }, get kills() { return kills; },
                    get enemies() { return enemies.length; }, get players() { return players; },
                    get bullets() { return bullets.length; }, get eagle() { return eagle; },
                    get spawnLeft() { return spawnLeft; },
                    firePlayer, finish,
                };
            }
            return {
                stop() {
                    cancelAnimationFrame(raf);
                    window.removeEventListener('keydown', onKeyDown);
                    window.removeEventListener('keyup', onKeyUp);
                    destroy();
                },
            };
        },
    };
})();
