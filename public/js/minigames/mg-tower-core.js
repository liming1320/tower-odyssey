// 魔塔核心引擎（与具体层数无关）—— 魔塔 50 层 / 24 层 / 新新魔塔 56 层 共用
// 通过 MG.tower.register(id, opts) 注册，MG.tower.run(container, opts) 启动。
// 玩法：网格爬塔，撞怪触发战斗（伤害预览→确认）、捡钥匙开门、吃道具、爬楼梯换层、NPC 对话。
window.MG = window.MG || {};
(function () {
    const E = (MG.eng = MG.eng || {});
    const G = MG.gfx, U = MG.ui, HUD = MG.hud, GRID = MG.grid, DLG = MG.dialogue;

    // ---------------- 工具 ----------------
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
    const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

    // ---------------- 怪物模板（按层深缩放）----------------
    const MOBS = [
        { key: 'slime', name: '绿史莱姆', face: 'slime', color: '#7fdc6a', base: { hp: 24, atk: 10, def: 3, exp: 5, gold: 3 } },
        { key: 'bat', name: '红蝙蝠', face: 'ghost', color: '#ff7a8b', base: { hp: 38, atk: 16, def: 5, exp: 9, gold: 6 } },
        { key: 'skeleton', name: '骷髅兵', face: 'knight', color: '#d8d8e8', base: { hp: 64, atk: 24, def: 9, exp: 15, gold: 11 } },
        { key: 'orc', name: '兽人战士', face: 'human', color: '#c98e63', base: { hp: 102, atk: 34, def: 15, exp: 24, gold: 17 } },
        { key: 'mage', name: '黑袍法师', face: 'ghost', color: '#a880ff', base: { hp: 145, atk: 46, def: 20, exp: 36, gold: 26 } },
        { key: 'golem', name: '岩石巨人', face: 'mecha', color: '#b0a890', base: { hp: 230, atk: 58, def: 34, exp: 60, gold: 42 } },
        { key: 'demon', name: '炎魔', face: 'mecha', color: '#ff7040', base: { hp: 360, atk: 80, def: 46, exp: 96, gold: 70 } },
    ];
    function mobForFloor(rng, f, floors, growth) {
        const depth = f / floors;
        const idx = Math.min(MOBS.length - 1, Math.max(0, Math.floor(depth * MOBS.length) + ri(rng, -1, 1)));
        const t = MOBS[idx];
        const k = Math.pow(growth, f - 1);
        return {
            key: t.key, name: t.name, face: t.face, color: t.color,
            hp: Math.round(t.base.hp * k), max: Math.round(t.base.hp * k),
            atk: Math.round(t.base.atk * Math.pow(growth, (f - 1) * 0.82)),
            def: Math.round(t.base.def * Math.pow(growth, (f - 1) * 0.78)),
            exp: Math.round(t.base.exp * k), gold: Math.round(t.base.gold * k),
        };
    }
    const KEYCOL = { y: '#ffd54a', b: '#5aa0ff', r: '#ff5a6a' };
    const KEYNAME = { y: '黄', b: '蓝', r: '红' };

    // ---------------- 楼层生成 ----------------
    // 返回 { grid, start, stairs, monsters, items, doors, npcs, bossHere }
    function genFloor(f, opts) {
        const W = opts.W, H = opts.H;
        const rng = mulberry32(((opts.seed * 7919 + f * 104729) >>> 0));
        const grid = [];
        for (let y = 0; y < H; y++) {
            const row = [];
            for (let x = 0; x < W; x++) row.push((x === 0 || y === 0 || x === W - 1 || y === H - 1) ? '#' : '.');
            grid.push(row);
        }
        const start = { x: 1, y: H - 2 };
        const stairs = { x: W - 2, y: 1 };
        const isTop = f >= opts.floors;

        // 随机柱子（障碍）
        const occupied = (x, y) => (x === start.x && y === start.y) || (x === stairs.x && y === stairs.y);
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            if (occupied(x, y)) continue;
            if (rng() < opts.pillar) grid[y][x] = '#';
        }
        // 保证 start→stairs 的 L 形主路永远通畅（覆盖柱子）
        (function carve() {
            let cy = start.y, cx = start.x;
            while (cy > stairs.y) { grid[cy - 1][cx] = '.'; cy--; }
            while (cx < stairs.x) { grid[cy][cx + 1] = '.'; cx++; }
        })();

        // 可达集合（用于撒怪/道具/NPC，保证都在主路上或分支里）
        const reach = bfs(grid, start);
        const freeCells = [];
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            if (grid[y][x] === '.' && reach.has(y * W + x) && !(x === start.x && y === start.y) && !(x === stairs.x && y === stairs.y)) freeCells.push({ x, y });
        }
        const used = new Set();
        const take = () => { for (let i = freeCells.length - 1; i >= 0; i--) { const j = ri(rng, 0, i); const c = freeCells[j]; if (!used.has(c.x * 100 + c.y)) { used.add(c.x * 100 + c.y); return c; } } return null; };

        // 怪物
        const monsters = [];
        const mc = Math.min(opts.monCount, 2 + Math.floor(f / 3));
        for (let i = 0; i < mc; i++) {
            const c = take(); if (!c) break;
            const m = mobForFloor(rng, f, opts.floors, opts.growth);
            m.x = c.x; m.y = c.y; monsters.push(m);
        }
        // 每 N 层一个楼层守卫（强化怪，守在楼梯前）
        if (opts.bossEvery && f > 1 && f % opts.bossEvery === 0 && !isTop) {
            const c = take(); if (c) { const m = mobForFloor(rng, f, opts.floors, opts.growth); m.x = c.x; m.y = c.y; m.name = '💀 守层卫士'; m.isGuard = true; m.hp = m.max = Math.round(m.hp * 1.8); m.atk = Math.round(m.atk * 1.4); m.def = Math.round(m.def * 1.3); m.exp = Math.round(m.exp * 2); m.gold = Math.round(m.gold * 2); monsters.push(m); }
        }

        // 道具
        const items = [];
        const ic = 1 + ri(rng, 0, 2);
        for (let i = 0; i < ic; i++) {
            const c = take(); if (!c) break;
            items.push(makeItem(rng, f, c));
        }
        // 顶层 BOSS 占据楼梯格
        let bossHere = false;
        if (isTop) {
            const b = mobForFloor(rng, f, opts.floors, opts.growth * 1.04);
            b.x = stairs.x; b.y = stairs.y; b.name = '👑 魔王'; b.isBoss = true;
            b.hp = b.max = Math.round(b.hp * 2.6); b.atk = Math.round(b.atk * 1.6); b.def = Math.round(b.def * 1.5);
            b.exp = Math.round(b.exp * 4); b.gold = Math.round(b.gold * 4);
            monsters.push(b); bossHere = true;
        }

        // 宝物房（彩色门 + 钥匙在路上，门后藏好东西；门是可选的，不挡主路）
        const doors = [];
        if (rng() < 0.62) {
            const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
            for (let tries = 0; tries < 12; tries++) {
                const a = pick(rng, freeCells.filter(c => !used.has(c.x * 100 + c.y)));
                if (!a) break;
                const d = pick(rng, dirs);
                const bx = a.x + d[0], by = a.y + d[1];
                const px = bx + d[0], py = by + d[1];
                if (grid[by] && grid[by][bx] === '#' && grid[py] && grid[py][px] === '#') {
                    const color = pick(rng, ['y', 'b', 'r']);
                    grid[by][bx] = 'D' + color;            // 门
                    grid[py][px] = '.';                    // 门后小室
                    used.add(a.x * 100 + a.y); used.add(bx * 100 + by); used.add(px * 100 + py);
                    doors.push({ x: bx, y: by, color });
                    const loot = makeItem(rng, f, { x: px, y: py }, true);
                    items.push(loot);
                    // 同色钥匙放在主路可达处（不在门后）
                    const kc = take(); if (kc) items.push({ x: kc.x, y: kc.y, type: 'key', color, amt: 1 });
                    break;
                }
            }
        }

        // NPC（每 npcEvery 层一个，靠近起点）
        const npcs = [];
        if (opts.npcEvery && f % opts.npcEvery === 0) {
            const near = freeCells.filter(c => (Math.abs(c.x - start.x) + Math.abs(c.y - start.y)) <= 3 && !used.has(c.x * 100 + c.y));
            const c = near.length ? pick(rng, near) : take();
            if (c) {
                const set = NPC_SET[ri(rng, 0, NPC_SET.length - 1)];
                npcs.push(Object.assign({ x: c.x, y: c.y, given: false }, set));
                used.add(c.x * 100 + c.y);
            }
        }
        return { grid, start, stairs, monsters, items, doors, npcs, bossHere };
    }

    function makeItem(rng, f, c, rich) {
        const roll = rng();
        if (roll < 0.26) return { x: c.x, y: c.y, type: 'hp' };
        if (roll < 0.45) return { x: c.x, y: c.y, type: 'atk', amt: Math.round(4 + f * 0.6 + ri(rng, 0, 6)) };
        if (roll < 0.62) return { x: c.x, y: c.y, type: 'def', amt: Math.round(3 + f * 0.4 + ri(rng, 0, 4)) };
        if (roll < 0.74) return { x: c.x, y: c.y, type: 'gold', amt: Math.round(10 + f * 4 + ri(rng, 0, 20)) };
        if (roll < 0.88) return { x: c.x, y: c.y, type: 'exp', amt: Math.round(8 + f * 3 + ri(rng, 0, 10)) };
        if (roll < 0.95) return { x: c.x, y: c.y, type: 'key', color: pick(rng, ['y', 'b', 'r']), amt: 1 };
        return { x: c.x, y: c.y, type: 'wing' };
    }

    const NPC_SET = [
        { name: '🧚 精灵', color: '#8ad0ff', char: { arch: 'ghost', skin: '#ffe0bd', hair: { style: 2, color: '#b88aff' }, cloth: { c1: '#a0e0ff', c2: '#5a9fd0' }, accent: '#ffd56b', eye: '#26324a', expr: 'happy', acc: 'horn', face: 1 }, lines: ['勇敢的勇者，塔顶的魔王夺走了公主的光。', '每上一层，怪物更强——先去搜刮道具再前进吧。'], gift: { type: 'hp' } },
        { name: '🧙 贤者', color: '#ffd56b', char: { arch: 'ghost', skin: '#f5cda0', hair: { style: 0, color: '#dddddd' }, cloth: { c1: '#b0a0e0', c2: '#6a5aa0' }, accent: '#ffd56b', eye: '#26324a', expr: 'normal', acc: 'hat', face: 1 }, lines: ['撞向怪物会进入战斗，系统会先告诉你将损失多少生命。', '攻防不足时可以绕开，变强后再来。'] },
        { name: '💰 商人', color: '#7ad86a', char: { arch: 'human', skin: '#e8b98a', hair: { style: 1, color: '#3a2a1a' }, cloth: { c1: '#caa05a', c2: '#8a6a2a' }, accent: '#ffd56b', eye: '#26324a', expr: 'smile', acc: 'glasses', face: 1 }, lines: ['免费送你一点盘缠，路上小心！'], gift: { type: 'gold', amt: 50 } },
    ];

    function bfs(grid, s) {
        const H = grid.length, W = grid[0].length;
        const seen = new Set(); const q = [s]; seen.add(s.y * W + s.x);
        const d = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        while (q.length) {
            const c = q.shift();
            for (const [dx, dy] of d) {
                const nx = c.x + dx, ny = c.y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const ch = grid[ny][nx];
                if (ch === '#' || ch[0] === 'D') continue;
                if (seen.has(ny * W + nx)) continue;
                seen.add(ny * W + nx); q.push({ x: nx, y: ny });
            }
        }
        return seen;
    }

    // ---------------- 原版魔塔像素贴图（12×12 点阵）----------------
    const PIX_ART = {
        hero: [
            '...ooooo....',
            '..ohhhhho...',
            '..ohhhhho..w',
            '..ossssso..w',
            '..osesseso.w',
            '...ossso...w',
            '..oaaaaao..w',
            '.oaaaaaaao.w',
            '.oasaaasao.w',
            '.oaaaaaaao.W',
            '...oa.ao....',
            '...ob.bo....',
        ],
        slime: [
            '............',
            '....oooo....',
            '..oogggoo...',
            '.olggggglo..',
            'ogggggggggo.',
            'ogggggggggo.',
            'ogeggggego..',
            'ogggggggggo.',
            'ogggmmggggo.',
            '.ogggggggo..',
            '..oooooooo..',
            '............',
        ],
        bat: [
            '............',
            '.o........o.',
            'oro......oro',
            'orrro..orrro',
            'orrroooorrro',
            '.orroEEorro.',
            '.orrrrrrrro.',
            '..orrrrrro..',
            '...orWWro...',
            '....orro....',
            '............',
            '............',
        ],
        skeleton: [
            '....oooo....',
            '...owwwwo...',
            '..owwwwwwo..',
            '..owEwwEwo..',
            '..owwwwwwo..',
            '...owwwwo...',
            '.....oo.....',
            'o..owwwwo..o',
            'oo.owwwwo.oo',
            '...ow..wo...',
            '....w..w....',
            '...ww..ww...',
        ],
        orc: [
            '.o........o.',
            '.oo......oo.',
            '..ogggggo...',
            '.oggggggggo.',
            '.ogeggggego.',
            '.oggggggggo.',
            '..otgggto...',
            '.oBBBBBBBBo.',
            '.oBBBBBBBBo.',
            '..oBBBBBBo..',
            '...og..go...',
            '...oo..oo...',
        ],
        mage: [
            '....oooo....',
            '...oppppo...',
            '..oppppppo..',
            '..opkeekpo..',
            '..opppppppo.',
            '.oppppppppo.',
            '.oppppppppo.',
            'opppppppppos',
            'opppppppppos',
            'opppppppppos',
            '.opppppppos.',
            '..oooooooo..',
        ],
        golem: [
            '............',
            '..oooooo....',
            '..oGGGGo....',
            '..oeGGeo....',
            '.ooGGGGoo...',
            '.oGGGGGGGo..',
            'oGooGGGGooGo',
            'oGoGGGGGGoGo',
            '.ooGGGGGGoo.',
            '..oGGGGGGo..',
            '..oGGooGGo..',
            '.ooo....ooo.',
        ],
        demon: [
            '.o........o.',
            '.oo......oo.',
            '..orrrrro...',
            '..oreerro...',
            '..orrrrro...',
            'oo.orrrro.oo',
            'oRoorrroRoo.',
            '.oorrrrroo..',
            '..orrrrro...',
            '..orrrrro...',
            '...or..ro...',
            '...oo..oo...',
        ],
        potion: [
            '............',
            '....occo....',
            '....occo....',
            '....oggo....',
            '...og..go...',
            '..og....go..',
            '..oLLLLLLo..',
            '..oLLLLLLo..',
            '..oLLLLLLo..',
            '..oggggggo..',
            '...oooooo...',
            '............',
        ],
        sword: [
            '............',
            '.....oo.....',
            '....owwo....',
            '....owwo....',
            '....owwo....',
            '....owwo....',
            '....owwo....',
            '.oWWwwWWo...',
            '....oWWo....',
            '....oWWo....',
            '....oooo....',
            '............',
        ],
        shield: [
            '............',
            '..oooooooo..',
            '.oSSSSSSSSo.',
            '.oSSSwwSSSo.',
            '.oSSSwwSSSo.',
            '.oSSSSSSSSo.',
            '..oSSSSSSo..',
            '...oSSSSo...',
            '....oSSo....',
            '.....oo.....',
            '............',
            '............',
        ],
        goldbag: [
            '............',
            '.....oo.....',
            '....oyyo....',
            '...oyyyyo...',
            '..oyyyyyyo..',
            '..oYYYYYYo..',
            '.oYYYYYYYYo.',
            '.oYYYYYYYYo.',
            '..oYYYYYYo..',
            '...oYYYYo...',
            '....oooo....',
            '............',
        ],
        scroll: [
            '............',
            '..oooooooo..',
            '.oppppppppo.',
            '.oppppppppo.',
            '.oppkkkkppo.',
            '.oppppppppo.',
            '.oppkkkkppo.',
            '.oppppppppo.',
            '..oooooooo..',
            '............',
            '............',
            '............',
        ],
        key: [
            '............',
            '...ooo......',
            '..ok.ko.....',
            '..ok.ko.....',
            '...ooo......',
            '....oko.....',
            '....oko.....',
            '....okko....',
            '....oko.....',
            '....okko....',
            '............',
            '............',
        ],
        wing: [
            '....o.......',
            '...owo......',
            '..owwwo.....',
            '.owwwwwo....',
            'owwwwwwwo...',
            '.owwwwwo....',
            '..owwwo.....',
            '...owo......',
            '....o.......',
            '............',
            '............',
            '............',
        ],
    };
    const PIX_PAL = {
        hero: { o: '#241c10', h: '#6a4520', s: '#f2c79a', e: '#1c2430', a: '#f2c33c', w: '#dce4ec', W: '#7a4a20', b: '#5a3c1c' },
        slime: { o: '#173a10', g: '#5ec44a', l: '#a8e888', e: '#182028', m: '#1d4a18' },
        bat: { o: '#3a1018', r: '#e05565', E: '#ffe14a', W: '#ffffff' },
        skeleton: { o: '#3a3a48', w: '#e8e8e0', E: '#141420' },
        orc: { o: '#1c2c10', g: '#7aa844', e: '#e03030', t: '#ffffff', B: '#7a5230' },
        mage: { o: '#241038', p: '#8a5ccc', k: '#100818', e: '#8affd8', s: '#8a6a3a' },
        golem: { o: '#2a2a30', G: '#9a9484', e: '#ffb04a' },
        demon: { o: '#2c0c0c', r: '#d04030', e: '#ffe14a', R: '#7c1f18' },
        potionR: { c: '#8a5a2a', g: '#dce8f0', L: '#e04848' },
        potionB: { c: '#8a5a2a', g: '#dce8f0', L: '#4878e0' },
        sword: { o: '#2a2a34', w: '#d8e0ea', W: '#8a5a28' },
        shield: { o: '#3a2a18', S: '#4878c8', w: '#e8e8f0' },
        goldbag: { o: '#5a3c10', y: '#c89838', Y: '#f0c048' },
        scroll: { o: '#5a4428', p: '#efe4c0', k: '#7a5c30' },
        keyY: { o: '#5a4208', k: '#f0c840' },
        keyB: { o: '#0c2a5a', k: '#5a9cf0' },
        keyR: { o: '#5a0c14', k: '#f05a68' },
        wing: { o: '#3a3a50', w: '#e8ecf4' },
    };
    const MON_SPR = { slime: 'slime', bat: 'bat', skeleton: 'skeleton', orc: 'orc', mage: 'mage', golem: 'golem', demon: 'demon' };
    // 画一个点阵精灵：居中于 (cx,cy)，边长约 ts
    function pxSpriteC(ctx, artName, palName, cx, cy, ts) {
        const cv = G.px(PIX_ART[artName], PIX_PAL[palName], 'mt|' + artName + '|' + palName);
        G.pxDraw(ctx, cv, cx - ts * 0.46, cy - ts * 0.46, ts * 0.92, ts * 0.92);
    }

    // ---------------- 配置构建 ----------------
    function buildCfg(opts) {
        const W = opts.W, H = opts.H;
        return {
            w: 360, h: 560,
            hint: '方向键 / WASD 移动 · 手机点按或滑动方向 · 撞怪战斗 · 吃钥匙开门 · 踩楼梯上楼',
            init(P) {
                const S = {};
                S.opts = opts;
                S.name = opts.name;
                S.floors = opts.floors;
                // 布局
                const HUD_H = 92, pad = 8;
                const availW = 360 - pad * 2, availH = 560 - HUD_H - 12;
                const ts = Math.max(18, Math.floor(Math.min(availH / H, availW / W)));
                S.ts = ts; S.ox = Math.round((360 - ts * W) / 2); S.oy = HUD_H + 8;
                // 英雄属性
                const hb = opts.heroBase || {};
                S.hpMax = hb.hp || 200; S.hp = S.hpMax;
                S.atk = hb.atk || 30; S.def = hb.def || 20;
                S.lv = 1; S.exp = 0; S.expNext = 28; S.gold = 0;
                S.keys = { y: 0, b: 0, r: 0 };
                S.heroChar = { arch: 'knight', skin: '#ffe0bd', hair: { style: 0, color: '#2b2b3a' }, cloth: { c1: '#5cc7ff', c2: '#2a7fd0' }, accent: '#ffd56b', eye: '#26324a', expr: 'focus', acc: 'crown', face: 1 };
                S.deaths = 0; S.maxFloor = 1; S.win = false;
                S.t = 0; S.fade = 1; S.toast = null; S.toastT = 0;
                S.battle = null; S.dlg = null; S._dlgRects = [];
                S.stepping = false; S.tx = 0; S.ty = 0; S._lastMove = 0; S.bump = 0;
                S.cx = 1; S.cy = 1; S.hx = 0; S.hy = 0;
                loadFloor(S, 1, true);
                return S;
            },
            draw(ctx, S, P, Wc, Hc, api) { drawAll(ctx, S, Wc, Hc, api); },
            tick(S, dt, P, api) {
                S.t += dt;
                if (S.fade > 0) S.fade = Math.max(0, S.fade - dt * 1.8);
                if (S.toastT > 0) { S.toastT -= dt; if (S.toastT <= 0) S.toast = null; }
                if (S.bump > 0) S.bump = Math.max(0, S.bump - dt * 4);
                if (S.stepping) {
                    const sp = S.ts * 9 * dt, ddx = S.tx - S.hx, ddy = S.ty - S.hy, d = Math.hypot(ddx, ddy);
                    if (d <= sp || d < 0.5) { S.hx = S.tx; S.hy = S.ty; S.stepping = false; onArrive(S, api); }
                    else { S.hx += ddx / d * sp; S.hy += ddy / d * sp; }
                }
            },
            tap(S, x, y, P, api) { onInput(S, x, y, api, false); },
            drag(S, x, y, P, api) { onInput(S, x, y, api, true); },
            key(S, k, P, api) { onKey(S, k, api); },
            check(S, P) {
                if (S.win) return { win: true, stars: 3, score: S.floor * 1000 + S.hp, lines: ['登顶成功，魔王已被击败！'] };
                return null;
            },
            score(S, P) { return { score: S.floor * 1000 + S.hp, lines: ['已到达 ' + S.floor + ' 层'] }; },
        };
    }

    // ---------------- 楼层装载 ----------------
    function loadFloor(S, f, first) {
        const fl = genFloor(f, S.opts);
        S.floor = f; S.map = fl.grid; S.start = fl.start; S.stairs = fl.stairs;
        S.monsters = fl.monsters; S.items = fl.items; S.doors = fl.doors; S.npcs = fl.npcs; S.bossHere = fl.bossHere;
        S.Wm = S.opts.W; S.Hm = S.opts.H;
        S.cx = fl.start.x; S.cy = fl.start.y;
        S.hx = S.ox + (S.cx + 0.5) * S.ts; S.hy = S.oy + (S.cy + 0.5) * S.ts;
        S.terrain = GRID.bake(S.map, S.ts, { tint: S.opts.tint });
        S.explored = []; for (let y = 0; y < S.Hm; y++) { const r = []; for (let x = 0; x < S.Wm; x++) r.push(false); S.explored.push(r); }
        reveal(S, S.cx, S.cy);
        if (first) S._cp = snapshot(S);
        S.fade = 1; S.battle = null; S.dlg = null; S.stepping = false;
        if (f > S.maxFloor) S.maxFloor = f;
    }
    function snapshot(S) { return { hpMax: S.hpMax, hp: S.hp, atk: S.atk, def: S.def, lv: S.lv, exp: S.exp, expNext: S.expNext, gold: S.gold, keys: Object.assign({}, S.keys) }; }
    function restore(S, cp) { S.hpMax = cp.hpMax; S.hp = cp.hp; S.atk = cp.atk; S.def = cp.def; S.lv = cp.lv; S.exp = cp.exp; S.expNext = cp.expNext; S.gold = cp.gold; S.keys = Object.assign({}, cp.keys); }

    // ---------------- 输入 ----------------
    function dirFrom(S, x, y) {
        const hx = S.ox + (S.cx + 0.5) * S.ts, hy = S.oy + (S.cy + 0.5) * S.ts;
        const dx = x - hx, dy = y - hy;
        if (Math.abs(dx) >= Math.abs(dy)) return [dx > 0 ? 1 : -1, 0];
        return [0, dy > 0 ? 1 : -1];
    }
    function onInput(S, x, y, api, isDrag) {
        if (S.fade > 0.2) return;
        // 战斗面板按钮
        if (S.battle) {
            const b = S.battle.rects; if (!b) return;
            for (const r of b) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { if (r.act === 'fight') resolveBattle(S, api); else S.battle = null; return; }
            return;
        }
        // 对话选项
        if (S.dlg) {
            const rs = S._dlgRects || [];
            for (const r of rs) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { closeDlg(S, r.i, api); return; }
            // 点对话框以外关闭（仅当无选项）
            if (!S.dlg.choices) S.dlg = null;
            return;
        }
        if (y < 92) return;               // 顶部 HUD 区域不触发移动
        if (isDrag && (performance.now() - S._lastMove) < 90) return;
        const [dx, dy] = dirFrom(S, x, y);
        step(S, dx, dy, api);
    }
    function onKey(S, k, api) {
        const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0], ' ': [0, 0], z: [0, 0], Z: [0, 0] };
        const m = map[k]; if (!m) return;
        if (S.battle) { if (k === ' ' || k === 'z' || k === 'Z' || k === 'Enter') resolveBattle(S, api); else if (k === 'Escape') S.battle = null; return; }
        if (S.dlg) { if (k === ' ' || k === 'Enter' || k === 'Escape') closeDlg(S, S.dlg.choices ? 0 : -1, api); return; }
        if (m[0] === 0 && m[1] === 0) return;
        step(S, m[0], m[1], api);
    }

    function cellAt(S, x, y) { return S.map[y] ? S.map[y][x] : '#'; }
    function monsterAt(S, x, y) { return S.monsters.find(m => m.x === x && m.y === y && m.hp > 0); }
    function itemAt(S, x, y) { return S.items.find(it => it.x === x && it.y === y); }
    function npcAt(S, x, y) { return S.npcs.find(n => n.x === x && n.y === y); }
    function doorAt(S, x, y) { return S.doors.find(d => d.x === x && d.y === y); }

    function step(S, dx, dy, api) {
        if (S.stepping || S.fade > 0.2) return;
        S._lastMove = performance.now();
        const nx = S.cx + dx, ny = S.cy + dy;
        if (nx < 0 || ny < 0 || nx >= S.Wm || ny >= S.Hm) { S.bump = 1; return; }
        const ch = cellAt(S, nx, ny);
        if (ch === '#') { S.bump = 1; return; }
        const m = monsterAt(S, nx, ny);
        if (m) { startBattle(S, m, api); return; }
        const dr = doorAt(S, nx, ny);
        if (dr) {
            if (S.keys[dr.color] > 0) { S.keys[dr.color]--; S.map[ny][nx] = '.'; S.doors = S.doors.filter(d => d !== dr); toast(S, '🔓 ' + KEYNAME[dr.color] + '门开启'); try { MG.audio.sfx('click'); } catch (e) {} api.haptics && api.haptics.tap(); }
            else { S.bump = 1; toast(S, '需要' + KEYNAME[dr.color] + '钥匙'); api.shake && api.shake(4, 0.12); }
            return;
        }
        // 移动
        S.cx = nx; S.cy = ny; S.tx = S.ox + (nx + 0.5) * S.ts; S.ty = S.oy + (ny + 0.5) * S.ts; S.stepping = true;
    }

    function onArrive(S, api) {
        reveal(S, S.cx, S.cy);
        const it = itemAt(S, S.cx, S.cy);
        if (it) { applyItem(S, it, api); S.items = S.items.filter(x => x !== it); }
        const np = npcAt(S, S.cx, S.cy);
        if (np) { openDlg(S, np); return; }
        // 楼梯 / BOSS
        if (S.cx === S.stairs.x && S.cy === S.stairs.y) {
            if (S.bossHere) { /* BOSS 已被击败才会站到这里 */ S.win = true; return; }
            if (S.floor < S.floors) { loadFloor(S, S.floor + 1, false); toast(S, '⬆ 第 ' + S.floor + ' 层'); }
        }
    }

    // ---------------- 战斗 ----------------
    function startBattle(S, m, api) {
        const hdmg = Math.max(1, S.atk - m.def);
        const rounds = Math.ceil(m.hp / hdmg);
        const mdmg = Math.max(1, m.atk - S.def);
        const loss = mdmg * Math.max(0, rounds - 1);
        S.battle = { m, nx: m.x, ny: m.y, rounds, loss, fatal: loss >= S.hp, nobreak: S.atk <= m.def };
    }
    function resolveBattle(S, api) {
        const b = S.battle; if (!b) return; S.battle = null;
        const m = b.m;
        if (b.nobreak) { toast(S, '攻击不足以破防，先升级武器！'); return; }
        const px = S.ox + (m.x + 0.5) * S.ts, py = S.oy + (m.y + 0.5) * S.ts;
        S.hp -= b.loss;
        m.hp = 0;
        S.monsters = S.monsters.filter(x => x !== m);
        S.exp += m.exp; S.gold += m.gold;
        levelUp(S);
        api.flash && api.flash('#ff5a5a', 0.4, 0.14);
        api.shake && api.shake(7, 0.22);
        api.hitstop && api.hitstop(120);
        api.boom && api.boom(px, py, { color: m.color, n: 14 });
        api.pop && api.pop(px, py - 22, '-' + b.loss, '#ff6b6b');
        api.haptics && api.haptics.hit();
        toast(S, '⚔ ' + m.name + ' 被击败！ +' + m.exp + 'EXP');
        if (m.isBoss) { S.win = true; return; }
        if (S.hp <= 0) die(S, api);
    }
    function levelUp(S) {
        while (S.exp >= S.expNext) {
            S.exp -= S.expNext; S.lv++; S.atk += 4; S.def += 2; S.hpMax += 25; S.hp = S.hpMax;
            S.expNext = Math.round(S.expNext * 1.25 + 10);
        }
    }
    function die(S, api) {
        S.deaths++;
        toast(S, '💀 你倒下了…回到本层起点');
        api.haptics && api.haptics.lose();
        restore(S, S._cp);            // 回到进层时的状态（怪物已清空则保留，否则重新生成）
        S.gold = Math.floor(S.gold * 0.7);
        loadFloor(S, S.floor, false); // 重新生成本层 → 怪物复活，可再战
    }

    function applyItem(S, it, api) {
        const px = S.ox + (it.x + 0.5) * S.ts, py = S.oy + (it.y + 0.5) * S.ts;
        let msg = '';
        if (it.type === 'hp') { const g = Math.round(S.hpMax * 0.35); S.hp = Math.min(S.hpMax, S.hp + g); msg = '❤ 生命 +' + g; }
        else if (it.type === 'atk') { S.atk += it.amt; msg = '⚔ 攻击 +' + it.amt; }
        else if (it.type === 'def') { S.def += it.amt; msg = '🛡 防御 +' + it.amt; }
        else if (it.type === 'gold') { S.gold += it.amt; msg = '💰 金币 +' + it.amt; }
        else if (it.type === 'exp') { S.exp += it.amt; levelUp(S); msg = '📜 经验 +' + it.amt; }
        else if (it.type === 'key') { S.keys[it.color]++; msg = '🔑 ' + KEYNAME[it.color] + '钥匙 +1'; }
        else if (it.type === 'wing') { S.gold += 30; S.exp += 20; levelUp(S); msg = '🕊 回城之翼！'; }
        api.pop && api.pop(px, py - 20, '+', '#ffe06b');
        try { MG.audio.sfx('click'); } catch (e) {} api.haptics && api.haptics.tap();
        toast(S, msg);
    }

    // ---------------- 对话 ----------------
    function openDlg(S, np) {
        const lines = np.lines.slice();
        const choices = np.gift ? [{ label: '领取' }, { label: '离开' }] : (np.choices || [{ label: '好的' }]);
        S.dlg = { speaker: np.name, text: lines.join(''), color: np.color, choices, np };
        if (np.gift && !np.given) { applyItem(S, np.gift, { pop() {}, haptics: { tap() {} } }); np.given = true; }
    }
    function closeDlg(S, i, api) {
        const np = S.dlg && S.dlg.np;
        S.dlg = null; S._dlgRects = [];
    }

    function reveal(S, cx, cy) {
        for (let y = Math.max(0, cy - 1); y <= Math.min(S.Hm - 1, cy + 1); y++)
            for (let x = Math.max(0, cx - 1); x <= Math.min(S.Wm - 1, cx + 1); x++) S.explored[y][x] = true;
    }
    function toast(S, t) { S.toast = t; S.toastT = 1.6; }

    // ---------------- 渲染 ----------------
    function drawAll(ctx, S, Wc, Hc, api) {
        G.scene(ctx, Wc, Hc, S.opts.tint.bg1 || '#14101f', S.opts.tint.bg2 || '#0c0a14');
        // 地形
        if (S.terrain) ctx.drawImage(S.terrain, S.ox, S.oy);
        // 门
        for (const d of S.doors) drawDoor(ctx, S, d);
        // 楼梯
        drawStairs(ctx, S);
        // 道具
        for (const it of S.items) drawItem(ctx, S, it);
        // 怪物
        for (const m of S.monsters) if (m.hp > 0) drawMonster(ctx, S, m);
        // NPC
        for (const np of S.npcs) drawNpc(ctx, S, np);
        // 英雄（原版像素勇者）
        const bob = Math.sin(S.t * 3) * 1.2 * (S.stepping ? 1.6 : 0.6);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(S.hx, S.hy + S.ts * 0.3, S.ts * 0.26, S.ts * 0.09, 0, 0, 7); ctx.fill();
        pxSpriteC(ctx, 'hero', 'hero', S.hx, S.hy + bob, S.ts);
        ctx.restore();
        // 小地图
        GRID.mini(ctx, S.map, S.cx, S.cy, 2, 10, Hc - 26 - 6, S.explored);
        // 顶栏 HUD
        drawHud(ctx, S, Wc, Hc);
        // 战斗 / 对话 / 提示 浮层
        if (S.battle) drawBattle(ctx, S, Wc, Hc);
        if (S.dlg) S._dlgRects = DLG.draw(ctx, Wc, Hc, S.dlg);
        if (S.toast) drawToast(ctx, S, Wc, Hc);
        // 楼层淡入
        if (S.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + S.fade + ')'; ctx.fillRect(0, 0, Wc, Hc); }
    }

    function drawHud(ctx, S, Wc, Hc) {
        ctx.fillStyle = 'rgba(8,8,16,0.55)'; ctx.fillRect(0, 0, Wc, 92);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, 90, Wc, 2);
        const ratio = Math.max(0, S.hp / S.hpMax);
        const hpColor = ratio > 0.5 ? '#5fd06a' : ratio > 0.25 ? '#ffcf4a' : '#ff5a6a';
        HUD.meter(ctx, 8, 8, 232, 16, ratio, hpColor, 'HP', Math.max(0, Math.round(S.hp)) + '/' + S.hpMax);
        HUD.label(ctx, Wc - 8, 16, S.floor + 'F / ' + S.floors + 'F', '#ffd56b', 14, 'right');
        // 第二行：ATK / DEF / LV / GOLD
        let x = 8;
        x += HUD.chip(ctx, x, 30, '⚔', '' + S.atk, 'rgba(255,120,120,0.35)') + 6;
        x += HUD.chip(ctx, x, 30, '🛡', '' + S.def, 'rgba(120,160,255,0.35)') + 6;
        x += HUD.chip(ctx, x, 30, '⭐', 'Lv' + S.lv, 'rgba(180,140,255,0.35)') + 6;
        HUD.chip(ctx, x, 30, '💰', '' + S.gold, 'rgba(255,210,90,0.35)');
        // 第三行：钥匙
        let kx = 8;
        kx += HUD.chip(ctx, kx, 54, '🔑黄', '' + S.keys.y, 'rgba(255,210,74,0.30)') + 6;
        kx += HUD.chip(ctx, kx, 54, '🔑蓝', '' + S.keys.b, 'rgba(90,160,255,0.30)') + 6;
        HUD.chip(ctx, kx, 54, '🔑红', '' + S.keys.r, 'rgba(255,90,106,0.30)');
    }

    function drawDoor(ctx, S, d) {
        const x = S.ox + d.x * S.ts, y = S.oy + d.y * S.ts, s = S.ts, c = KEYCOL[d.color];
        ctx.save();
        // 门框（石）
        ctx.fillStyle = '#3a3428'; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        ctx.fillStyle = '#554c38'; ctx.fillRect(x + 1, y + 1, s - 2, 2); ctx.fillRect(x + 1, y + 1, 2, s - 2);
        // 门板（本色，带横梁与铆钉，原版门样式）
        ctx.fillStyle = c; ctx.fillRect(x + s * 0.14, y + s * 0.08, s * 0.72, s * 0.86);
        ctx.fillStyle = G.darken(c, 0.3);
        ctx.fillRect(x + s * 0.14, y + s * 0.38, s * 0.72, s * 0.08);
        ctx.fillRect(x + s * 0.14, y + s * 0.66, s * 0.72, s * 0.08);
        ctx.fillStyle = G.lighten(c, 0.4);
        for (const ry of [0.2, 0.52, 0.8]) for (const rx of [0.24, 0.76]) {
            ctx.fillRect(x + s * rx - 1, y + s * ry - 1, 2.5, 2.5);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(x + s * 0.14, y + s * 0.08, s * 0.72, s * 0.86);
        ctx.restore();
    }
    function drawItem(ctx, S, it) {
        const cx = S.ox + (it.x + 0.5) * S.ts, cy = S.oy + (it.y + 0.5) * S.ts + Math.sin(S.t * 3 + it.x) * 2;
        const s = S.ts;
        const spr = {
            hp: ['potion', 'potionR'], atk: ['sword', 'sword'], def: ['shield', 'shield'],
            gold: ['goldbag', 'goldbag'], exp: ['scroll', 'scroll'],
            key: ['key', 'key' + (it.color || 'y').toUpperCase()],
            wing: ['wing', 'wing'],
        }[it.type];
        if (!spr) return;
        if (it.type === 'key') { ctx.save(); ctx.shadowColor = KEYCOL[it.color]; ctx.shadowBlur = 8; }
        pxSpriteC(ctx, spr[0], spr[1], cx, cy, s);
        if (it.type === 'key') ctx.restore();
    }
    function drawMonster(ctx, S, m) {
        const cx = S.ox + (m.x + 0.5) * S.ts, cy = S.oy + (m.y + 0.5) * S.ts + Math.sin(S.t * 2.5 + m.x) * 1.5, s = S.ts;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.32, s * 0.3, s * 0.1, 0, 0, 7); ctx.fill();
        pxSpriteC(ctx, MON_SPR[m.key] || 'slime', MON_SPR[m.key] || 'slime', cx, cy, s);
        if (m.isBoss || m.isGuard) {
            ctx.strokeStyle = m.isBoss ? '#ffd56b' : '#c8c8d8'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.48, 0, 7); ctx.stroke();
            if (m.isBoss) { MG.ui.emoji(ctx, '👑', cx, cy - s * 0.52, s * 0.3); }
            else { MG.ui.emoji(ctx, '💀', cx + s * 0.42, cy - s * 0.42, s * 0.24); }
        }
        ctx.restore();
        // 血条
        const r = Math.max(0, m.hp / m.max);
        const bw = s * 0.7, bx = cx - bw / 2, by = cy - s * 0.52;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, bw, 4);
        ctx.fillStyle = r > 0.4 ? '#7ad86a' : '#ff6b6b'; ctx.fillRect(bx, by, bw * r, 4);
    }
    function drawStairs(ctx, S) {
        if (S.bossHere) return;   // 顶层楼梯被魔王占着
        const x = S.ox + S.stairs.x * S.ts, y = S.oy + S.stairs.y * S.ts, s = S.ts;
        ctx.save();
        ctx.fillStyle = '#181410'; MG.ui.rr(ctx, x + 1, y + 1, s - 2, s - 2, 3); ctx.fill();
        // 四级台阶（向下沉的洞口 → 上行阶梯）
        const steps = 4;
        for (let k = 0; k < steps; k++) {
            const t = k / steps;
            ctx.fillStyle = `rgb(${90 + k * 30},${80 + k * 30},${64 + k * 26})`;
            ctx.fillRect(x + s * 0.12 + t * s * 0.1, y + s * 0.14 + k * (s * 0.72 / steps), s * (0.76 - t * 0.2), s * 0.72 / steps - 1);
        }
        MG.ui.emoji(ctx, '⬆', x + s * 0.5, y + s * 0.3, s * 0.3);
        ctx.restore();
    }
    function drawNpc(ctx, S, np) {
        const cx = S.ox + (np.x + 0.5) * S.ts, cy = S.oy + (np.y + 0.5) * S.ts;
        MG.char.draw(ctx, cx, cy - S.ts * 0.42, S.ts / 44, np.char, { t: S.t, pose: 'idle', face: 1 });
    }

    function drawBattle(ctx, S, Wc, Hc) {
        const b = S.battle; const m = b.m;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, Wc, Hc);
        const pw = 280, ph = 168, px = (Wc - pw) / 2, py = (Hc - ph) / 2;
        MG.ui.rr(ctx, px, py, pw, ph, 14); ctx.fillStyle = 'rgba(20,18,34,0.96)'; ctx.fill();
        ctx.strokeStyle = '#ff8a8a'; ctx.lineWidth = 2; ctx.stroke();
        HUD.label(ctx, px + pw / 2, py + 24, '⚔ 遭遇 ' + m.name, '#ff9a9a', 16, 'center');
        const lines = [
            '生命 ' + m.hp + '   攻击 ' + m.atk + '   防御 ' + m.def,
            '预计 ' + b.rounds + ' 回合解决',
        ];
        let yy = py + 52;
        for (const l of lines) { HUD.label(ctx, px + pw / 2, yy, l, '#cdd3e0', 13, 'center'); yy += 20; }
        if (b.nobreak) HUD.label(ctx, px + pw / 2, yy, '⚠ 攻击不足以破防！', '#ffcf4a', 13, 'center');
        else if (b.fatal) HUD.label(ctx, px + pw / 2, yy, '☠ 此战将损失 ' + b.loss + ' 生命（可能阵亡）', '#ff6b6b', 13, 'center');
        else HUD.label(ctx, px + pw / 2, yy, '将损失 ' + b.loss + ' 生命', '#9fe0a0', 13, 'center');
        // 按钮
        const bw = (pw - 36) / 2, bh = 34, by = py + ph - bh - 14;
        const r1 = { x: px + 12, y: by, w: bw, h: bh, act: 'fight' };
        const r2 = { x: px + 24 + bw, y: by, w: bw, h: bh, act: 'cancel' };
        MG.ui.rr(ctx, r1.x, r1.y, r1.w, r1.h, 8); ctx.fillStyle = '#c0392b'; ctx.fill();
        MG.ui.rr(ctx, r2.x, r2.y, r2.w, r2.h, 8); ctx.fillStyle = 'rgba(120,130,160,0.4)'; ctx.fill();
        HUD.label(ctx, r1.x + r1.w / 2, r1.y + r1.h / 2, b.nobreak ? '硬拼' : '战斗', '#fff', 15, 'center');
        HUD.label(ctx, r2.x + r2.w / 2, r2.y + r2.h / 2, '取消', '#fff', 15, 'center');
        b.rects = [r1, r2];
    }
    function drawToast(ctx, S, Wc, Hc) {
        const t = S.toast; ctx.font = '14px sans-serif'; const w = Math.min(Wc - 40, ctx.measureText(t).width + 28);
        const x = (Wc - w) / 2, y = Hc - 150;
        MG.ui.rr(ctx, x, y, w, 30, 15); ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fill();
        HUD.label(ctx, Wc / 2, y + 15, t, '#ffe9a8', 14, 'center');
    }

    // ---------------- 注册 / 启动 ----------------
    function run(container, opts) {
        const cfg = buildCfg(opts);
        const o = Object.assign({ endless: false }, { level: { name: opts.name, desc: opts.desc || (opts.floors + ' 层魔塔') } });
        return E.game(container, o, cfg);
    }
    function register(id, opts) {
        opts = Object.assign({
            W: 11, H: 13, growth: 1.09, monCount: 6, pillar: 0.13, npcEvery: 6, bossEvery: 0,
            tint: { floorA: '#2a2740', floorB: '#34314f', bg1: '#14101f', bg2: '#0c0a14' },
            heroBase: { hp: 200, atk: 30, def: 20 },
        }, opts);
        window.MiniGames[id] = {
            LEVELS: [{ name: opts.name, desc: opts.desc || (opts.floors + ' 层 · 爬塔冒险') }],
            ENDLESS: null,
            start(c, o) { return run(c, Object.assign({}, opts, o || {})); },
        };
    }

    MG.tower = { run, register };
})();
