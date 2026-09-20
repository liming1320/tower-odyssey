// 实时战斗引擎（Canvas 全屏）
// 我方英雄在底部守阵，敌方小怪从顶部塔下「从上往下」冲下来，每 5 层关底出现 Boss。
// 每个英雄拥有独立的技能特效（fx），共 21 种视觉表现。
const RARITY_COLOR = { '传说+': '#ff7a8b', '传说': '#ff9d5c', '史诗': '#b78bff', '稀有': '#5cc7ff' };
const ELEMENT_COLOR = { 水: '#5cc7ff', 火: '#ff7a2f', 风: '#7cfc7c', 雷: '#ffd56b', 光: '#ffe28a', 暗: '#b78bff' };

// 颜色 / 数学工具统一走 U.math（含 rgba / clamp / lerp / pick 等，抽自 MG.hit）

const Battle = {
    cvs: null, ctx: null, W: 360, H: 640, dpr: 1,
    heroes: [], enemies: [], projs: [], floats: [], parts: [], fx: [], spawnQueue: [],
    waves: [], waveIdx: 0, waveSize: 0, towerMax: 1, towerHp: 1,
    ancient: false, floor: 1,
    running: false, paused: false, finished: false,
    opts: null, raf: 0, lastT: 0, spawnTimer: 0,
    stunUntil: 0, shake: 0, banner: null,
    groundY: 520, topY: 130,
    stats: null, time: 0, stars: null, shieldUntil: 0, teamBuffUntil: 0,

    start(canvas, opts) {
        this.stop();
        document.body.classList.add('in-battle');
        this.cvs = canvas;
        this.ctx = canvas.getContext('2d');
        // 画布缩放/居中交给 U.canvas（抽 MG.canvas：aspect-contain 不变形，修异形屏拉伸）
        this._cv = (U.canvas && U.canvas.setup)
            ? U.canvas.setup(this.cvs, this.W, this.H, this.cvs.parentElement, { mode: 'contain', renderScaleCap: 3 })
            : null;
        this.opts = opts || {};
        this.waves = opts.waves || [];
        this.waveIdx = 0;
        this.ancient = !!opts.ancient;
        this.floor = opts.floor || 1;
        this.theme = opts.theme || null; // 章节主题配色（远古世界沿用紫色）
        this.floats = []; this.projs = []; this.parts = []; this.fx = [];
        this.enemies = []; this.spawnQueue = [];
        this.banner = null; this.stunUntil = 0;
        // 震屏/顿帧/飘字/粒子统一走 U.fx（与 MG 小游戏共用 MG 引擎的相机/粒子池底座）
        this.shieldUntil = 0; this.teamBuffUntil = 0;
        // 城墙技能 / 必杀 / 障碍
        this.wall = opts.wall || null;
        this.wallSk = (this.wall && this.wall.skill)
            ? { ...this.wall.skill, cdMax: Math.max(5, this.wall.skill.cd || 15), cdTimer: 0 }
            : null;
        this.blocks = [];            // 城墙「生成阻碍」产生的障碍物
        this.petrifyUntil = 0;       // 石化（不可行动，视觉变灰）
        this.wallDmgUntil = 0;       // 城墙增伤持续时间
        this.wallCdUntil = 0;        // 城墙减 CD 持续时间
        this.autoSkill = opts.autoSkill !== false; // 自动释放开关（必杀 + 城墙技）
        this.finished = false; this.paused = false; this.running = true;
        this.time = 0;
        this.stats = { atkPct: 0, hpPct: 0, aspd: 0, crit: 0, armor: 0, lifesteal: 0, cdReduce: 0 };
        this.teamAllDmg = 0; this.teamGuard = 0; this.teamAuraAtk = 0;
        this.towerMax = Math.max(1, this.waves.length);
        this.towerHp = this.towerMax;

        this.buildHeroes(opts.heroes || []);
        this.resize();
        this.buildStars();
        this.beginWave();

        // 主循环下沉到 U.loop（抽 MG _engine.makeLoop：dt 限幅 + 错误隔离 + 暂停重绘 + alive 钩子）
        this._loop = (U.loop) ? U.loop({
            alive: () => this.running,
            paused: () => this.paused,
            variable: (dt) => { this.update(dt, performance.now()); },
            render: () => { this.draw(); },
        }) : null;
        this._onResize = () => this.resize();
        window.addEventListener('resize', this._onResize); // U.canvas 已自带 resize/RO，这里仅作兜底
        if (this._loop) this._loop.start();
        else { // U.loop 缺失时的兜底（正常 U.loop 必存在，此分支仅防 utils.js 未加载）
            this.lastT = performance.now();
            const step = (t) => {
                if (!this.running) return;
                let dt = (t - this.lastT) / 1000; this.lastT = t;
                if (dt > 0.05) dt = 0.05;
                if (!this.paused) this.update(dt, t);
                this.draw();
                this.raf = requestAnimationFrame(step);
            };
            this.raf = requestAnimationFrame(step);
        }
    },

    stop() {
        this.running = false;
        if (this._loop) { this._loop.stop(); this._loop = null; }
        else if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
        if (this._cv) { try { this._cv.destroy(); } catch (e) {} this._cv = null; }
        if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
    },

    buildHeroes(list) {
        this.heroes = list.map((h, i) => {
            const imgEl = new Image();
            let loaded = false;
            imgEl.onload = () => { loaded = true; };
            imgEl.src = '/img/' + h.img + '?v=' + (typeof IMG_V !== 'undefined' ? IMG_V : '1');
            // 多技能：主 / 副 / 觉醒技，各自独立冷却
            const raw = (Array.isArray(h.skills) && h.skills.length)
                ? h.skills
                : [(h.skill || { name: '技能', desc: '', cd: 5, multiplier: 1.5, fx: 'slash', tint: '#ffd56b' })];
            const skills = raw.slice(0, 3).map((s, si) => ({
                name: s.name || '技能',
                desc: s.desc || '',
                mult: s.multiplier || 0,
                fx: s.fx || 'slash',
                tint: s.tint || '#ffd56b',
                cdMax: Math.max(1, s.cd || 5),
                // 首个技能开局即可放，其余错开，避免同时开火
                cdTimer: Math.max(1, s.cd || 5) * (si === 0 ? 0.35 : 0.6 + si * 0.15),
            }));
            return {
                uid: h.uid, name: h.name, imgEl, get imgLoaded() { return loaded; },
                rarity: h.rarity, element: h.element, lv: h.lv,
                star: h.star || 5,
                atk: h.atk, hp: h.hp, maxHp: h.maxHp,
                baseAtk: h.atk, baseMaxHp: h.maxHp,
                // 星级天赋（服务端已按星级汇总好）
                perks: h.perks || {},
                reviveLeft: (h.perks && h.perks.revive) || 0,
                shield: 0,                       // 护盾值（10★ 天赋）
                stunChance: (h.perks && h.perks.stun) || 0,
                stunDur: ((h.perks && h.perks.stunUp) ? 1.5 : 1.0),
                skills,
                // 必杀：每英雄 1 个，可手动点击或自动释放
                ult: (() => {
                    const u = h.ult || {};
                    const cd = Math.max(8, u.cd || 12);
                    return {
                        name: u.name || '必杀',
                        desc: u.desc || '倾尽全力的一击',
                        mult: u.mul || u.multiplier || 3,
                        fx: u.fx || 'ult',
                        tint: u.tint || '#ff7adf',
                        cdMax: cd, cdTimer: cd, ready: false,
                    };
                })(),
                // 兼容旧绘制逻辑：主技能字段
                skillName: skills[0].name, skillDesc: skills[0].desc,
                skillMult: skills[0].mult,
                fx: skills[0].fx, tint: skills[0].tint,
                cdMax: skills[0].cdMax, cdTimer: skills[0].cdTimer,
                atkTimer: 0.4 + i * 0.15, dead: false, hitFlash: 0, animT: Math.random() * 6,
                castGlow: 0, x: 0, y: 0,
            };
        });
        this.applyTeamPerks();
    },

    // 队伍级天赋：光环（加攻）、战意（全队增伤）、守护（全队减伤）、护盾
    applyTeamPerks() {
        let aura = 0, allDmg = 0, guard = 0;
        for (const h of this.heroes) {
            aura += (h.perks.aura || 0);
            allDmg += (h.perks.allDmg || 0);
            guard += (h.perks.teamGuard || 0);
        }
        this.teamAuraAtk = aura;      // 全队攻击 +N%（开局一次性加成）
        this.teamAllDmg = allDmg;     // 全队造成伤害 +N%
        this.teamGuard = Math.min(60, guard); // 全队受到伤害 -N%（上限 60%）
        for (const h of this.heroes) {
            if (aura) {
                h.atk = Math.round(h.atk * (1 + aura / 100));
                h.baseAtk = h.atk;
            }
            if (h.perks.shield) {
                h.shield = Math.floor(h.maxHp * h.perks.shield / 100);
            }
        }
    },

    // 单个英雄的伤害加成（自身增伤 + 全队战意）
    dmgMulOf(h) {
        const wall = performance.now() < this.wallDmgUntil ? (this.wallDmgPct || 0) : 0;
        return 1 + ((h.perks && h.perks.dmgUp) || 0) / 100 + this.teamAllDmg / 100 + wall / 100;
    },
    // 单个英雄的受伤减免（自身减伤 + 全队守护）
    takenMulOf(h) {
        const self = (h.perks && h.perks.dmgDown) || 0;
        return Math.max(0.15, 1 - (self + this.teamGuard) / 100);
    },

    buildStars() {
        this.stars = [];
        for (let i = 0; i < 70; i++) {
            this.stars.push({
                x: Math.random(), y: Math.random() * 0.55,
                r: Math.random() * 1.4 + 0.3, p: Math.random() * 6.28,
                s: 0.6 + Math.random() * 1.6,
            });
        }
    },

    resize() {
        if (!this.cvs) return;
        // 几何基于设计分辨率（恒定 360x640），不随屏幕变化；画布缩放/居中交给 U.canvas
        const w = this.W, h = this.H;
        if (this._cv) this._cv.fit();
        this.groundY = Math.round(h * 0.80);
        this.topY = Math.round(h * 0.20);
        this.contentW = Math.min(w, 560);
        this.contentX = Math.round((w - this.contentW) / 2);
        this.layout();
        // 兜底（无 U.canvas 时）：旧 fill 模式，DPR 设 backing
        if (!this._cv) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const cw = this.cvs.clientWidth || window.innerWidth || w;
            const ch = this.cvs.clientHeight || window.innerHeight || h;
            this.cvs.width = Math.round(cw * dpr);
            this.cvs.height = Math.round(ch * dpr);
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.dpr = dpr;
        }
    },

    // 战斗区中心（宽屏时画布比内容区更宽，特效与 HUD 都以内容区为基准）
    get CX() { return this.contentX + this.contentW / 2; },

    layout() {
        const n = Math.max(1, this.heroes.length);
        const pad = 16;
        const span = this.contentW - pad * 2;
        const gap = Math.min(72, span / n);
        const totalW = gap * n;
        const sx = this.contentX + (this.contentW - totalW) / 2;
        this.heroes.forEach((h, i) => { h.x = sx + gap * i + gap / 2; h.y = this.groundY + 26; });
        for (const en of this.enemies) this.slotOf(en);
    },

    slotOf(en) {
        const n = Math.max(1, this.waveSize || this.enemies.length || 1);
        const pad = 26;
        const span = this.contentW - pad * 2;
        const egap = Math.min(74, span / n);
        const totalW = egap * n;
        const startX = this.contentX + (this.contentW - totalW) / 2;
        en.slotX = startX + egap * (en.idx || 0) + egap / 2;
        en.slotY = this.topY + 60 + ((en.idx || 0) % 2) * 42 + ((en.idx || 0) % 3) * 12;
    },

    beginWave() {
        const wave = this.waves[this.waveIdx];
        if (!wave) { this.finish(true); return; }
        this.waveSize = wave.enemies.length;
        this.spawnQueue = wave.enemies.map((e, i) => ({ ...e, _i: i }));
        this.spawnTimer = 0;
        this.enemies = [];
        this.layout();

        const boss = wave.enemies.find(e => e.boss);
        if (boss) {
            this.banner = { text: '⚠ BOSS 来袭', sub: boss.name, until: performance.now() + 2200, big: true, color: '#ff5252' };
            U.fx.shake(12, 0.4);
        } else {
            this.banner = { text: `第 ${this.waveIdx + 1} 波`, sub: `${wave.enemies.length} 只怪物`, until: performance.now() + 850, color: '#ffd56b' };
        }
    },

    spawnOne(data) {
        // 小怪整体缩小一档（数量变多后画面更清爽），BOSS 保持压迫感
        const size = data.boss ? 32 : (data.elite ? 15 : 11);
        const en = {
            name: data.name, emoji: data.emoji,
            shape: data.shape || 'blob', body: data.body || '#8a8a8a', accent: data.accent || '#333',
            hp: data.hp, maxHp: data.maxHp, atk: data.atk, speed: data.speed,
            boss: !!data.boss, elite: !!data.elite, skill: data.skill,
            idx: data._i || 0,
            x: 0, y: 0, slotX: this.CX, slotY: this.topY + 60,
            atkTimer: 1.0 + Math.random() * 0.5,
            dead: false, hitFlash: 0, animT: Math.random() * 6, walking: true, spawnA: 0,
            size, dot: null, frozen: 0,
        };
        this.slotOf(en);
        en.x = en.slotX + (Math.random() - 0.5) * 10;
        en.y = this.topY + 10 - Math.random() * 30;
        this.enemies.push(en);
        // 出场烟尘
        this.spawnParts(6, en.x, en.y, { color: en.body, spread: 40, up: -30, life: 0.5, size: 3 });
    },

    // 主循环已下沉到 U.loop（抽 MG _engine.makeLoop：dt 限幅 + 错误隔离 + 暂停重绘 + alive 钩子）。
    // U.loop 缺失时由 start() 内兜底 step() 直接驱动（dt 限幅 0.05，无错误隔离）。

    update(dt, now) {
        // 顿帧：命中瞬间把本帧 dt 压到极低，制造「定格」打击感（仅缩放动画时间，不改真实时序）
        if (U.fx.consumeHitStop(dt)) dt *= 0.12;
        this.time += dt;
        U.fx.updateCam(dt); U.fx.update(dt); // 推进相机抖动 / 特效粒子池
        const stunned = now < this.stunUntil;

        // 逐个出场（怪潮感：出怪间隔略快）
        if (this.spawnQueue.length) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this.spawnOne(this.spawnQueue.shift());
                this.spawnTimer = 0.22;
            }
        }

        // 我方行动
        for (const h of this.heroes) {
            if (h.dead) continue;
            h.animT += dt;
            h.hitFlash = Math.max(0, h.hitFlash - dt * 5);
            h.castGlow = Math.max(0, h.castGlow - dt * 2);
            // 每个技能独立计时、独立释放
            for (const sk of h.skills) {
                sk.cdTimer -= dt;
                if (sk.cdTimer <= 0) {
                    this.castSkill(h, sk);
                    sk.cdTimer = Math.max(1, sk.cdMax - this.stats.cdReduce);
                }
            }
            h.cdTimer = h.skills[0].cdTimer; // HUD 冷却环跟随主技能
            // 必杀：独立冷却，自动模式下就绪即放
            if (h.ult) {
                h.ult.cdTimer -= dt * (performance.now() < this.wallCdUntil ? 2 : 1);
                h.ult.ready = h.ult.cdTimer <= 0;
                if (h.ult.ready && this.autoSkill && !stunned) this.castUlt(h);
            }
            h.atkTimer -= dt;
            if (h.atkTimer <= 0) {
                const t = this.pickTarget();
                if (t) { this.fire(h, t); h.atkTimer = 1 / (1 + this.stats.aspd / 100); }
                else h.atkTimer = 0.2;
            }
        }

        // 城墙技能：独立冷却，自动模式下就绪即放
        if (this.wallSk) {
            this.wallSk.cdTimer -= dt;
            if (this.wallSk.cdTimer <= 0 && this.autoSkill) this.castWallSkill();
        }
        // 障碍物存在时间
        if (this.blocks.length) {
            for (const b of this.blocks) b.life -= dt;
            this.blocks = this.blocks.filter(b => b.life > 0 && b.hp > 0);
        }

        // 敌方行动
        for (const e of this.enemies) {
            if (e.dead) continue;
            e.spawnA = Math.min(1, (e.spawnA === undefined ? 0 : e.spawnA) + dt * 3.5); // 出场淡入
            e.animT += dt;
            e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
            e.frozen = Math.max(0, e.frozen - dt);
            // 持续伤害
            if (e.dot && now < e.dot.until) {
                e.dot.tick -= dt;
                if (e.dot.tick <= 0) {
                    e.dot.tick = 0.5;
                    this.dealDamage(e, e.dot.dmg, false, e.dot.tint, false);
                    if (Math.random() < 0.5) this.spawnParts(2, e.x, e.y - 10, { color: e.dot.tint, spread: 20, up: -40, life: 0.4, size: 2.5 });
                }
            }
            const petrified = now < this.petrifyUntil;
            if (stunned || petrified || e.frozen > 0) { e.walking = false; continue; }
            // 被城墙障碍挡住：停下攻击障碍
            const blocker = this.blocks.find(b => Math.abs(b.x - e.x) < 46 && e.y < b.y + 40 && e.y > b.y - 90);
            if (blocker) {
                e.walking = false;
                e.blockTimer = (e.blockTimer || 0) - dt;
                if (e.blockTimer <= 0) {
                    e.blockTimer = 0.8;
                    this.spawnParts(5, blocker.x, blocker.y, { color: blocker.tint, spread: 26, up: -40, life: 0.5, size: 2.6 });
                }
                continue;
            }
            if (e.y < e.slotY - 0.5) {
                e.y += e.speed * dt;
                e.walking = true;
                if (e.y > e.slotY) e.y = e.slotY;
                e.x += (e.slotX - e.x) * Math.min(1, dt * 3);
            } else {
                e.walking = false;
                e.atkTimer -= dt;
                if (e.atkTimer <= 0) { e.atkTimer = 1.2; this.enemyAttack(e); }
            }
        }

        // 投射物
        for (const p of this.projs) {
            const dx = p.tx - p.x, dy = p.ty - p.y;
            const d = Math.hypot(dx, dy);
            const step = p.speed * dt;
            if (d <= step || p.target.dead) { this.onProjHit(p); p.done = true; }
            else {
                p.x += dx / d * step; p.y += dy / d * step;
                if (p.trail && Math.random() < 0.6) {
                    this.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.22, max: 0.22, size: p.size * 0.6, color: p.color, glow: true, grav: 0 });
                }
            }
        }
        this.projs = this.projs.filter(p => !p.done);

        // 粒子
        for (const p of this.parts) {
            p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.grav || 0) * dt;
            if (p.drag) { p.vx *= (1 - p.drag * dt); p.vy *= (1 - p.drag * dt); }
        }
        if (this.parts.length > 320) this.parts.splice(0, this.parts.length - 320);
        this.parts = this.parts.filter(p => p.life > 0);

        // 技能特效推进
        for (const f of this.fx) {
            f.t += dt;
            if (!f.hit && f.t >= (f.impactAt || 0)) { f.hit = true; if (f.onImpact) f.onImpact(); }
        }
        this.fx = this.fx.filter(f => f.t < f.dur);

        // 飘字
        for (const f of this.floats) { f.life -= dt; f.y -= 34 * dt; }
        this.floats = this.floats.filter(f => f.life > 0);

        // 环境粒子
        if (Math.random() < dt * 14) {
            if (this.ancient) {
                this.parts.push({ x: Math.random() * this.W, y: this.groundY + Math.random() * 40, vx: (Math.random() - 0.5) * 8, vy: -12 - Math.random() * 20, life: 2.4, max: 2.4, size: 1.5 + Math.random() * 2, color: '#b78bff', glow: true, grav: 0, amb: 1 });
            } else {
                this.parts.push({ x: Math.random() * this.W, y: -6, vx: (Math.random() - 0.5) * 10, vy: 14 + Math.random() * 16, life: 3.4, max: 3.4, size: 1 + Math.random() * 1.6, color: '#ffe6a0', glow: true, grav: 0, amb: 1 });
            }
        }

        this.enemies = this.enemies.filter(e => !e.dead);

        if (!this.spawnQueue.length && this.enemies.length === 0 && !this.finished) this.onWaveCleared();
        if (this.heroes.length && this.heroes.every(h => h.dead) && !this.finished) this.finish(false);
    },

    pickTarget(lowestHp) {
        const alive = this.enemies.filter(e => !e.dead);
        if (!alive.length) return null;
        if (lowestHp) return alive.reduce((a, b) => (a.hp <= b.hp ? a : b));
        return alive[0];
    },

    fire(h, target) {
        const bonus = (h.perks && h.perks.critUp) || 0;      // 14★ 狂暴：暴击率加成
        const crit = Math.random() * 100 < (this.stats.crit + bonus);
        let dmg = h.atk * (crit ? (2 + (bonus ? 0.3 : 0)) : 1);
        dmg *= this.dmgMulOf(h);                             // 自身增伤 + 全队战意
        const color = ELEMENT_COLOR[h.element] || '#ffd56b';
        this.projs.push({
            x: h.x, y: h.y - 34, tx: target.x, ty: target.y - 14,
            speed: 460, color, size: 5, crit, dmg, target, trail: true, h,
        });
    },

    // 命中后按天赋判定眩晕（6★ 震击 / 13★ 强震）
    tryStun(h, e) {
        if (!h.stunChance || e.boss) return;
        if (Math.random() * 100 < h.stunChance) {
            e.frozen = Math.max(e.frozen || 0, h.stunDur);
            this.addFloat(e.x, e.y - 34, '眩晕', '#ffd56b');
            this.spawnParts(6, e.x, e.y - 16, { color: '#ffd56b', spread: 40, life: 0.5, size: 2.6, glow: true });
        }
    },

    onProjHit(p) {
        if (p.target.dead) return;
        this.dealDamage(p.target, p.dmg, p.crit, p.color, false);
        this.spawnParts(p.crit ? 10 : 5, p.tx, p.ty, { color: p.color, spread: 70, life: 0.32, size: 2.6 });
        if (p.h) {
            this.tryStun(p.h, p.target);
            if (this.stats.lifesteal) {
                const heal = Math.floor(p.dmg * this.stats.lifesteal / 100);
                if (p.h.hp < p.h.maxHp) {
                    p.h.hp = Math.min(p.h.maxHp, p.h.hp + heal);
                    this.addFloat(p.h.x, p.h.y - 52, '+' + heal, '#7cfc7c');
                }
            }
        }
    },

    enemyAttack(e) {
        const alive = this.heroes.filter(h => !h.dead);
        if (!alive.length) return;
        const t = U.math.pick(alive);
        let dmg = e.atk * (e.boss ? 1.2 : 1);
        if (performance.now() < this.shieldUntil) dmg *= 0.65;
        dmg = Math.max(1, Math.floor(dmg * (1 - this.stats.armor / 100) * this.takenMulOf(t)));
        // 护盾优先吸收（10★ 天赋）
        if (t.shield > 0) {
            const absorbed = Math.min(t.shield, dmg);
            t.shield -= absorbed; dmg -= absorbed;
            this.addFloat(t.x, t.y - 58, '护盾 -' + absorbed, '#5cc7ff');
            if (t.shield <= 0) this.spawnParts(10, t.x, t.y - 26, { color: '#5cc7ff', spread: 60, life: 0.5, size: 2.6, glow: true });
        }
        t.hp -= dmg;
        t.hitFlash = 1;
        if (dmg > 0) this.addFloat(t.x, t.y - 44, '-' + dmg, '#ff7a8b');
        this.spawnParts(4, t.x, t.y - 24, { color: '#ff7a8b', spread: 50, life: 0.3, size: 2.4 });
        if (t.hp <= 0) {
            // 8★ 复生：首次阵亡原地复活
            if (t.reviveLeft > 0) {
                t.reviveLeft -= 1;
                t.hp = Math.floor(t.maxHp * 0.5);
                t.shield = 0;
                this.addFloat(t.x, t.y - 66, '🕊 复生！', '#7cfc7c', true);
                this.spawnParts(22, t.x, t.y - 24, { color: '#7cfc7c', spread: 90, up: -60, life: 0.9, size: 3.2, glow: true });
                return;
            }
            t.dead = true;
            U.fx.hitStop( 0.05); // 我方阵亡定格
            this.addFloat(t.x, t.y - 60, '阵亡', '#ff5252');
        }
        if (e.boss) { U.fx.shake(5); }
    },

    dealDamage(t, dmg, crit, color, big) {
        dmg = Math.max(1, Math.floor(dmg));
        t.hp -= dmg;
        t.hitFlash = 1;
        if (crit) { U.fx.shake(4.5); U.fx.hitStop( 0.045); } // 暴击：轻震屏 + 顿帧
        this.addFloat(t.x, t.y - (t.boss ? 52 : 32), (crit ? '暴击 ' : '-') + dmg, crit ? '#ff5252' : (color || '#fff'), crit || big);
        if (t.hp <= 0 && !t.dead) {
            t.dead = true;
            U.fx.hitStop( 0.06); // 击杀定格
            this.addFloat(t.x, t.y - 62, '阵亡', '#ff5252');
            // 死亡爆碎
            this.spawnParts(t.boss ? 30 : 14, t.x, t.y - 10, {
                color: t.body || '#ff7a8b', spread: t.boss ? 170 : 95,
                life: t.boss ? 0.9 : 0.55, size: t.boss ? 5.5 : 3.4,
            });
            this.spawnParts(t.boss ? 16 : 6, t.x, t.y - 10, {
                color: t.accent || '#ffd56b', spread: t.boss ? 120 : 60, life: 0.7, size: t.boss ? 4 : 2.6,
            });
            if (t.boss) U.fx.shake(14);
        }
    },

    // 技能类型判定：优先按描述关键词，避免治疗被当成伤害
    skillKind(h, sk) {
        const d = (sk && sk.desc) || h.skillDesc || '';
        if (/恢复|治疗|回复/.test(d)) return 'heal';
        if (/冻结|缠绕|静止|麻痹/.test(d)) return 'freeze';
        if (/减伤|护盾|护体|守护/.test(d)) return 'shield';
        if (/提升.*攻击|号令|加攻/.test(d)) return 'buff';
        return 'damage';
    },

    // ===================== 必杀（每英雄 1 个） =====================
    castUlt(h) {
        if (!h || h.dead || !h.ult || h.ult.cdTimer > 0) return false;
        h.ult.cdTimer = h.ult.cdMax;
        h.castGlow = 1.6;
        const ult = h.ult;
        this.banner = { text: '💥 ' + ult.name, sub: h.name, until: performance.now() + 1200, color: ult.tint };
        const targets = this.enemies.filter(e => !e.dead);
        const dmg = Math.floor(h.atk * ult.mult * this.dmgMulOf(h));
        this.addFx({
            type: 'bloom', tint: ult.tint, dur: 1.1, impactAt: 0.28,
            onImpact: () => {
                for (const e of targets) {
                    if (e.dead) continue;
                    this.dealDamage(e, dmg, true, ult.tint, true);
                    this.spawnParts(10, e.x, e.y - 16, { color: ult.tint, spread: 40, up: -90, life: 0.8, size: 3.4, glow: true });
                }
                U.fx.shake(14);
            },
        });
        return true;
    },

    // ===================== 城墙技能 =====================
    castWallSkill() {
        const sk = this.wallSk;
        if (!sk || sk.cdTimer > 0) return false;
        sk.cdTimer = sk.cdMax;
        const now = performance.now();
        const tint = '#7fd3ff';
        this.banner = { text: '🛡 ' + sk.name, sub: this.wall ? this.wall.name : '城墙', until: now + 1100, color: tint };
        switch (sk.type) {
            case 'stun':
                this.stunUntil = now + (sk.value || 1.5) * 1000;
                this.addFloat(this.CX, this.groundY - 90, '全体眩晕!', tint, true);
                break;
            case 'petrify':
                this.petrifyUntil = now + (sk.value || 2) * 1000;
                this.addFloat(this.CX, this.groundY - 90, '全体石化!', '#c9c2e8', true);
                break;
            case 'knock': {
                const push = sk.value || 110;
                for (const e of this.enemies) {
                    if (e.dead) continue;
                    e.y -= push; e.frozen = Math.max(e.frozen || 0, 0.6);
                }
                this.addFloat(this.CX, this.groundY - 90, '击退!', tint, true);
                break;
            }
            case 'shield':
                this.shieldUntil = now + (sk.value || 6) * 1000;
                this.addFloat(this.CX, this.groundY - 90, '城墙护盾开启!', '#ffd56b', true);
                break;
            case 'dmgup':
                this.wallDmgUntil = now + 8000;
                this.wallDmgPct = sk.value || 35;
                this.addFloat(this.CX, this.groundY - 90, `全队增伤 ${sk.value}%`, '#ff9d5c', true);
                break;
            case 'cdreduce':
                this.wallCdUntil = now + 8000;
                this.addFloat(this.CX, this.groundY - 90, '技能冷却减半!', '#b6ff7a', true);
                break;
            case 'block': {
                const n = Math.max(1, Math.min(5, sk.value || 3));
                for (let i = 0; i < n; i++) {
                    this.blocks.push({
                        x: this.CX + (i - (n - 1) / 2) * 62,
                        y: this.groundY - 130 - Math.random() * 40,
                        hp: 9999, life: 8, tint: '#9fe8ff',
                    });
                }
                this.addFloat(this.CX, this.groundY - 90, '障碍生成!', tint, true);
                break;
            }
            case 'refresh':
                for (const h of this.heroes) if (h.ult) h.ult.cdTimer = 0;
                this.addFloat(this.CX, this.groundY - 90, '全队必杀已刷新!', '#ff7adf', true);
                break;
        }
        for (const e of this.enemies) {
            this.spawnParts(6, e.x, e.y - 20, { color: tint, spread: 30, up: -60, life: 0.6, size: 2.6, glow: true });
        }
        return true;
    },

    setAuto(v) { this.autoSkill = !!v; },

    castUltByUid(uid) {
        const h = this.heroes.find(x => x.uid === uid);
        return h ? this.castUlt(h) : false;
    },

    // 供战斗 UI 刷新技能按钮
    skillState() {
        return {
            auto: this.autoSkill,
            ults: this.heroes.map(h => ({
                uid: h.uid, name: h.name, ultName: h.ult ? h.ult.name : '',
                tint: h.ult ? h.ult.tint : '#ffd56b',
                ready: !!(h.ult && h.ult.cdTimer <= 0) && !h.dead,
                dead: !!h.dead,
                pct: h.ult ? Math.max(0, Math.min(1, 1 - h.ult.cdTimer / h.ult.cdMax)) : 0,
                cd: h.ult ? Math.max(0, h.ult.cdTimer) : 0,
            })),
            wall: this.wallSk ? {
                name: this.wallSk.name, desc: this.wallSk.desc || '',
                wallName: this.wall ? this.wall.name : '',
                ready: this.wallSk.cdTimer <= 0,
                pct: Math.max(0, Math.min(1, 1 - this.wallSk.cdTimer / this.wallSk.cdMax)),
                cd: Math.max(0, this.wallSk.cdTimer),
            } : null,
        };
    },

    castSkill(h, sk) {
        sk = sk || h.skills[0];
        const desc = sk.desc || '';
        const kind = this.skillKind(h, sk);
        const tint = sk.tint || h.tint;
        const fx = sk.fx || 'slash';
        const mult = sk.mult || 0;
        const single = /单体|单个/.test(desc);
        h.castGlow = 1;
        this.banner = { text: '⚡ ' + sk.name, sub: h.name, until: performance.now() + 1100, color: tint };

        const targets = this.enemies.filter(e => !e.dead);
        const list = single ? [this.pickTarget(true)].filter(Boolean) : targets;
        const atk = h.atk * (performance.now() < this.teamBuffUntil ? 1.25 : 1);
        // 技能伤害：技能倍率 × 自身增伤 × 全队战意
        const mul = mult * this.dmgMulOf(h);

        const payload = { kind, list, atk, mult, h, single, sk };

        if (kind === 'heal') {
            const heal = Math.floor(atk * (mult || 0.7));
            this.addFx({
                type: fx === 'sound' || fx === 'bloom' ? fx : 'heal', tint, dur: 1.1, impactAt: 0.25,
                onImpact: () => {
                    for (const a of this.heroes) {
                        if (a.dead) continue;
                        const before = a.hp;
                        a.hp = Math.min(a.maxHp, a.hp + heal);
                        if (a.hp > before) {
                            this.addFloat(a.x, a.y - 50, '+' + (a.hp - before), '#7cfc7c');
                            this.spawnParts(6, a.x, a.y - 20, { color: tint, spread: 24, up: -60, life: 0.8, size: 2.6, glow: true });
                        }
                    }
                    if (/提升.*攻击/.test(desc)) this.teamBuffUntil = performance.now() + 3000;
                },
            });
            return;
        }

        if (kind === 'shield') {
            this.shieldUntil = performance.now() + 3000;
            this.addFx({
                type: 'shield', tint, dur: 1.2, impactAt: 0.15,
                onImpact: () => {
                    this.addFloat(this.CX, this.groundY - 60, '护盾激活 · 减伤 35%', tint, true);
                    for (const a of this.heroes) this.spawnParts(8, a.x, a.y - 26, { color: tint, spread: 30, up: -50, life: 0.9, size: 3, glow: true });
                },
            });
            return;
        }

        if (kind === 'buff') {
            this.teamBuffUntil = performance.now() + 3000;
            this.addFx({
                type: 'buff', tint, dur: 1.2, impactAt: 0.15,
                onImpact: () => {
                    this.addFloat(this.CX, this.groundY - 60, '全体攻击 +25%', tint, true);
                    for (const a of this.heroes) this.spawnParts(8, a.x, a.y - 20, { color: tint, spread: 26, up: -70, life: 0.9, size: 3, glow: true });
                },
            });
            return;
        }

        if (kind === 'freeze') {
            const dmg = atk * (mult || 1);
            this.stunUntil = performance.now() + 2000;
            this.addFx({
                type: fx, tint, dur: 1.4, impactAt: 0.2, targets: list,
                onImpact: () => {
                    for (const e of list) {
                        if (e.dead) continue;
                        e.frozen = 1.6;
                        this.dealDamage(e, dmg, false, tint, true);
                        this.spawnParts(8, e.x, e.y - 12, { color: tint, spread: 40, life: 0.6, size: 3, glow: true });
                    }
                    this.addFloat(this.CX, this.H * 0.42, '冰封!', tint, true);
                },
            });
            U.fx.shake(6);
            return;
        }

        // 伤害型：按 fx 决定视觉
        const dmg = atk * (mult || 1.5) * (single ? 1.6 : 1);
        this.addFx({
            type: fx, tint, dur: this.fxDur(fx), impactAt: this.fxImpact(fx),
            targets: list, src: { x: h.x, y: h.y - 34 }, single,
            onImpact: () => {
                for (const e of list) {
                    if (e.dead) continue;
                    this.dealDamage(e, dmg, Math.random() * 100 < this.stats.crit, tint, true);
                    this.spawnParts(10, e.x, e.y - 12, { color: tint, spread: 90, life: 0.5, size: 3.2, glow: true });
                    this.tryStun(h, e);   // 星级天赋：震击 / 强震
                }
                // 附加效果
                if (fx === 'burn') for (const e of list) if (!e.dead) e.dot = { dmg: Math.floor(dmg * 0.18), until: performance.now() + 3000, tick: 0.5, tint };
                if (fx === 'dark') for (const e of list) if (!e.dead) e.atk = Math.max(1, Math.floor(e.atk * 0.85));
                U.fx.shake(fx === 'quake' || fx === 'meteor' ? 10 : 6);
            },
        });
    },

    fxDur(fx) {
        return ({ meteor: 1.3, bolt: 1.0, laser: 0.9, tidal: 1.2, bloom: 1.3, summon: 1.2 })[fx] || 0.9;
    },
    fxImpact(fx) {
        return ({ meteor: 0.55, bolt: 0.28, laser: 0.18, tidal: 0.45, summon: 0.6 })[fx] || 0.25;
    },

    addFx(o) {
        o.t = 0; o.hit = false;
        this.fx.push(o);
    },

    addFloat(x, y, text, color, big) {
        // 飘字开关：设置面板关闭后不再生成（但保留大招/护盾等关键提示）
        try {
            const p = JSON.parse(localStorage.getItem('tower-odyssey.prefs') || '{}');
            if (p.floatText === false && !big) return;
        } catch (e) {}
        // 走 U.fx 粒子池的 text（与 MG 小游戏同款飘字：带辉光/描边/重力），缺失时降级空操作
        U.fx.text(x, y, text, { color: color || '#fff', size: big ? 19 : 14, bold: !!big, vy: -34, life: big ? 1.1 : 0.9, glow: true });
    },

    spawnParts(n, x, y, o) {
        o = o || {};
        // 命中碎片走 U.fx 粒子池（与 MG 小游戏同款：对象池化、带 glow、尊重减弱动效/画质分级）。
        // 向上初速用 angle 偏置近似；技能/环境粒子仍走 this.parts（见 drawParticles）。
        U.fx.burst(x, y, {
            n, colors: [o.color || '#fff'],
            speed: o.spread || 60, life: o.life || 0.5,
            shape: 'spark', glow: !!o.glow,
            g: o.grav === undefined ? 120 : o.grav, drag: o.drag || 1.2,
            r: o.size || 2.5, angle: -Math.PI / 2, spread: 1.4,
        });
    },

    onWaveCleared() {
        this.towerHp = Math.max(0, this.towerHp - 1);
        if (this.waveIdx >= this.waves.length - 1) { this.finish(true); return; }
        this.paused = true;
        // 20 波节奏：每 4 波（第 4/8/12/16 波后）弹一次增益三选一，其余波次短暂停顿直接进下一波
        const isBuffWave = (this.waveIdx + 1) % 4 === 0;
        if (isBuffWave) {
            const pool = (this.opts.buffPool || []).slice();
            const picks = [];
            for (let i = 0; i < 3 && pool.length; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
            if (picks.length && this.opts.onWaveClear) { this.opts.onWaveClear(picks, buff => { this.applyBuff(buff); this.resume(); }); return; }
        }
        this._waveTimer = setTimeout(() => { this._waveTimer = null; this.resume(); }, isBuffWave ? 200 : 650);
    },

    resume() {
        if (this.finished || !this.running) return;
        this.waveIdx++;
        this.paused = false;
        this.beginWave();
    },

    applyBuff(b) {
        if (!b) return;
        const S = this.stats;
        if (b.stat === 'atkPct') { this.heroes.forEach(h => { h.atk = Math.round(h.atk * (1 + b.val / 100)); }); S.atkPct += b.val; }
        else if (b.stat === 'hpPct') {
            this.heroes.forEach(h => { h.maxHp = Math.round(h.maxHp * (1 + b.val / 100)); h.hp = Math.min(h.maxHp, Math.round(h.hp * (1 + b.val / 100))); });
            S.hpPct += b.val;
        }
        else if (b.stat === 'cd') { S.cdReduce += b.val; this.heroes.forEach(h => { h.cdTimer = Math.max(0, h.cdTimer - b.val); }); }
        else if (b.stat === 'aspd') S.aspd += b.val;
        else if (b.stat === 'heal') {
            this.heroes.forEach(h => {
                const before = h.hp;
                h.hp = Math.min(h.maxHp, Math.round(h.hp * (1 + b.val / 100)));
                if (h.hp > before) this.addFloat(h.x, h.y - 50, '+' + (h.hp - before), '#7cfc7c');
            });
        }
        else if (b.stat === 'crit') S.crit += b.val;
        else if (b.stat === 'armor') S.armor = Math.min(70, S.armor + b.val);
        else if (b.stat === 'lifesteal') S.lifesteal += b.val;
    },

    finish(win) {
        if (this.finished) return;
        this.finished = true;
        this.paused = true;
        setTimeout(() => {
            if (win) { if (this.opts.onWin) this.opts.onWin(); }
            else { if (this.opts.onLose) this.opts.onLose(); }
        }, 620);
    },

    // ================= 绘制 =================
    draw() {
        const ctx = this.ctx, W = this.W, H = this.H;
        ctx.setTransform(1, 0, 0, 1, 0, 0);                  // 回到 backing 坐标
        // letterbox 条（aspect-contain 时画面两侧/上下留白）铺同色底，避免透出 canvas 默认背景
        ctx.fillStyle = this.ancient ? '#0b0d18' : '#0d1330';
        ctx.fillRect(0, 0, this.cvs.width, this.cvs.height);
        // —— 战斗世界（逻辑 360x640，经 U.canvas 的 contain 变换居中）——
        ctx.save();
        if (this._cv && this._cv.base) this._cv.base(ctx);   // contain 变换 → 逻辑坐标
        U.fx.applyCam(ctx, W, H);                            // 震屏 / 缩放冲击（MG 相机）
        this.drawSky();
        this.drawPath();
        this.drawParticles(false);
        this.drawTower();
        // 按 y 排序，越靠下越后画
        const ens = this.enemies.slice().sort((a, b) => a.y - b.y);
        for (const e of ens) this.drawEnemy(e);
        this.drawBlocks();
        for (const h of this.heroes) this.drawHero(h);
        this.drawProjs();
        this.drawFx();
        this.drawParticles(true);
        U.fx.draw(ctx, W, H); // 飘字 / 命中粒子 / 冲击波（MG 粒子池，与 MG 小游戏同一套）
        ctx.restore();
        // —— HUD / 横幅（同样逻辑坐标，但不受震屏影响）——
        ctx.save();
        if (this._cv && this._cv.base) this._cv.base(ctx);
        this.drawHUD();
        this.drawBanner();
        ctx.restore();
    },

    drawSky() {
        const ctx = this.ctx, W = this.W, H = this.H;
        const th = this.ancient ? null : this.theme;
        const g = ctx.createLinearGradient(0, 0, 0, this.groundY);
        if (this.ancient) { g.addColorStop(0, '#1a0b2e'); g.addColorStop(0.5, '#3a1c56'); g.addColorStop(1, '#5b2f6b'); }
        else if (th) { g.addColorStop(0, th.sky[0]); g.addColorStop(0.45, th.sky[1]); g.addColorStop(1, th.sky[2]); }
        else { g.addColorStop(0, '#0d1330'); g.addColorStop(0.45, '#2a2350'); g.addColorStop(1, '#6b3a5c'); }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, this.groundY + 40);

        // 星星
        ctx.save();
        for (const s of (this.stars || [])) {
            const a = 0.35 + Math.sin(this.time * s.s + s.p) * 0.35;
            ctx.globalAlpha = Math.max(0, a);
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill();
        }
        ctx.restore();

        // 月亮
        const mx = W * 0.8, my = H * 0.09;
        ctx.save();
        ctx.globalAlpha = 0.9;
        const mg = ctx.createRadialGradient(mx, my, 2, mx, my, 34);
        mg.addColorStop(0, this.ancient ? 'rgba(183,139,255,0.9)' : 'rgba(255,240,200,0.95)');
        mg.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 34, 0, 6.283); ctx.fill();
        ctx.fillStyle = this.ancient ? '#c9a6ff' : '#fff3d0';
        ctx.beginPath(); ctx.arc(mx, my, 13, 0, 6.283); ctx.fill();
        ctx.restore();

        // 远山两层
        for (let layer = 0; layer < 2; layer++) {
            const base = this.groundY - 26 + layer * 12;
            ctx.fillStyle = layer === 0
                ? (this.ancient ? 'rgba(58,28,86,0.75)' : (th ? th.mount : 'rgba(24,20,48,0.7)'))
                : (this.ancient ? 'rgba(44,20,66,0.85)' : (th ? 'rgba(10,10,20,0.82)' : 'rgba(16,14,34,0.8)'));
            ctx.beginPath();
            ctx.moveTo(0, base + 30);
            const seg = 8, amp = 26 - layer * 8;
            for (let i = 0; i <= seg; i++) {
                const x = W * i / seg;
                const y = base - Math.abs(Math.sin(i * (1.3 + layer * 0.6) + layer)) * amp;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(W, base + 30); ctx.closePath(); ctx.fill();
        }
    },

    // 自上而下的进攻通道（透视梯形）
    drawPath() {
        const ctx = this.ctx, W = this.W, H = this.H;
        const th = this.ancient ? null : this.theme;
        // 通道宽度跟随内容区，但地面铺满整个画布宽度
        const topW = this.contentW * 0.30, botW = this.contentW * 0.98;
        const ty = this.topY + 46, by = this.groundY + 30;
        const cx = this.contentX + this.contentW / 2;

        const g = ctx.createLinearGradient(0, ty, 0, by);
        if (this.ancient) { g.addColorStop(0, 'rgba(80,40,120,0.55)'); g.addColorStop(1, 'rgba(52,26,74,0.9)'); }
        else if (th) { g.addColorStop(0, th.path[0]); g.addColorStop(1, th.path[1]); }
        else { g.addColorStop(0, 'rgba(90,60,110,0.45)'); g.addColorStop(1, 'rgba(60,44,32,0.9)'); }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - topW / 2, ty); ctx.lineTo(cx + topW / 2, ty);
        ctx.lineTo(cx + botW / 2, by); ctx.lineTo(cx - botW / 2, by);
        ctx.closePath(); ctx.fill();

        // 横向纹路
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 9; i++) {
            const t = i / 9;
            const y = ty + (by - ty) * t;
            const hw = (topW + (botW - topW) * t) / 2;
            ctx.beginPath(); ctx.moveTo(cx - hw, y); ctx.lineTo(cx + hw, y); ctx.stroke();
        }
        ctx.restore();

        // 地面
        ctx.fillStyle = this.ancient ? '#33204a' : (th ? th.ground : '#3d2f22');
        ctx.fillRect(0, this.groundY + 24, W, H - this.groundY);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.moveTo(0, this.groundY + 24.5); ctx.lineTo(W, this.groundY + 24.5); ctx.stroke();
    },

    drawTower() {
        const ctx = this.ctx, W = this.W;
        const cx = this.contentX + this.contentW / 2, baseY = this.topY + 48, th = Math.min(96, this.H * 0.15);
        const dmg = 1 - this.towerHp / this.towerMax;
        ctx.save();

        const thm = this.ancient ? null : this.theme;
        // 塔身
        const g = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0);
        if (this.ancient) { g.addColorStop(0, '#3a1c56'); g.addColorStop(0.5, '#6b3f8f'); g.addColorStop(1, '#2a1040'); }
        else if (thm) { g.addColorStop(0, thm.tower[0]); g.addColorStop(0.5, thm.tower[1]); g.addColorStop(1, thm.tower[2]); }
        else { g.addColorStop(0, '#3a2a1c'); g.addColorStop(0.5, '#7a5c3a'); g.addColorStop(1, '#2a1c12'); }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - 26, baseY); ctx.lineTo(cx - 20, baseY - th);
        ctx.lineTo(cx + 20, baseY - th); ctx.lineTo(cx + 26, baseY);
        ctx.closePath(); ctx.fill();

        // 城齿
        ctx.fillStyle = this.ancient ? '#8a5fbf' : (thm ? thm.tower[1] : '#8a6a44');
        for (let i = 0; i < 5; i++) ctx.fillRect(cx - 24 + i * 10, baseY - th - 9, 7, 10);

        // 塔门（小怪出生口）
        ctx.fillStyle = this.ancient ? '#160a26' : '#1a1008';
        ctx.beginPath();
        ctx.moveTo(cx - 10, baseY); ctx.lineTo(cx - 10, baseY - 22);
        ctx.quadraticCurveTo(cx, baseY - 34, cx + 10, baseY - 22);
        ctx.lineTo(cx + 10, baseY); ctx.fill();
        // 门内幽光
        const pulse = 0.25 + Math.sin(this.time * 3) * 0.15;
        const dg = ctx.createRadialGradient(cx, baseY - 12, 1, cx, baseY - 12, 22);
        dg.addColorStop(0, this.ancient ? `rgba(183,139,255,${pulse + 0.3})` : `rgba(255,120,60,${pulse})`);
        dg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.arc(cx, baseY - 12, 22, 0, 6.283); ctx.fill();

        // 火把
        for (const sx of [cx - 30, cx + 30]) {
            ctx.fillStyle = '#5b4632';
            ctx.fillRect(sx - 2, baseY - th * 0.55, 4, 12);
            const fg = ctx.createRadialGradient(sx, baseY - th * 0.55 - 3, 1, sx, baseY - th * 0.55 - 3, 14);
            fg.addColorStop(0, `rgba(255,200,80,${0.75 + Math.sin(this.time * 8 + sx) * 0.2})`);
            fg.addColorStop(1, 'rgba(255,120,20,0)');
            ctx.fillStyle = fg;
            ctx.beginPath(); ctx.arc(sx, baseY - th * 0.55 - 3, 14, 0, 6.283); ctx.fill();
        }

        // 裂纹
        if (dmg > 0) {
            ctx.strokeStyle = `rgba(0,0,0,${0.35 + dmg * 0.5})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - 14, baseY - th * 0.7); ctx.lineTo(cx - 4, baseY - th * 0.5);
            ctx.lineTo(cx - 12, baseY - th * 0.32);
            ctx.moveTo(cx + 12, baseY - th * 0.62); ctx.lineTo(cx + 3, baseY - th * 0.44);
            if (dmg > 0.5) { ctx.moveTo(cx + 2, baseY - 6); ctx.lineTo(cx + 8, baseY - th * 0.3); }
            ctx.stroke();
        }
        ctx.restore();

        // 塔血条
        const bw = Math.min(160, W * 0.46), bx = cx - bw / 2, by = baseY - th - 26;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 9);
        const tg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        tg.addColorStop(0, this.ancient ? '#b78bff' : '#ff7a8b');
        tg.addColorStop(1, this.ancient ? '#7a4fd0' : '#ff3b5c');
        ctx.fillStyle = tg;
        ctx.fillRect(bx, by, bw * (this.towerHp / this.towerMax), 7);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 6);
        ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(`敌方塔 ${this.towerHp}/${this.towerMax}`, cx, by - 4);
    },

    // ---------- 怪物：按 shape 画出不同体型 ----------
    drawEnemy(e) {
        const ctx = this.ctx;
        const s = e.size;
        const bob = e.walking ? Math.sin(e.animT * 9) * 2.5 : Math.sin(e.animT * 2.5) * 1.2;
        const x = e.x, y = e.y + bob;
        const fa = (e.spawnA === undefined ? 1 : e.spawnA); // 出场淡入透明度

        // 影子
        ctx.save();
        ctx.globalAlpha = 0.3 * fa; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(e.x, e.y + s * 0.75, s * 0.7, s * 0.26, 0, 0, 6.283); ctx.fill();
        ctx.restore();

        if (e.frozen > 0) {
            ctx.save();
            ctx.globalAlpha = 0.5 * fa; ctx.fillStyle = '#8ad4ff';
            ctx.beginPath();
            ctx.moveTo(x - s * 0.8, y + s * 0.7); ctx.lineTo(x, y - s * 1.2); ctx.lineTo(x + s * 0.8, y + s * 0.7);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        }

        ctx.save();
        // 小怪不显示血条，血量低于 30% 时用呼吸闪烁提示濒死
        if (!e.boss && e.maxHp > 0 && e.hp / e.maxHp <= 0.3) {
            ctx.globalAlpha = (0.45 + 0.55 * Math.abs(Math.sin(this.time * 5))) * fa;
        } else {
            ctx.globalAlpha = fa;
        }
        if (e.hitFlash > 0) {
            ctx.globalAlpha = Math.max(ctx.globalAlpha, 0.85 * fa);
            ctx.filter = 'brightness(2.2)';
        }
        if (e.boss) {
            ctx.shadowColor = 'rgba(255,60,60,0.7)'; ctx.shadowBlur = 16 + Math.sin(this.time * 4) * 8;
        } else if (e.elite) {
            ctx.shadowColor = 'rgba(255,200,80,0.6)'; ctx.shadowBlur = 10;
        }
        this.drawShape(ctx, e.shape, x, y, s, e.body, e.accent, e.animT, e.walking);
        ctx.restore();

        // 受击白环（强化打击反馈；敌人外形仍按各自 shape 差异化）
        if (e.hitFlash > 0) {
            ctx.save();
            ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 12 * e.hitFlash * fa;
            ctx.strokeStyle = `rgba(255,255,255,${0.9 * e.hitFlash * fa})`;
            ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.arc(x, y, s * 1.06, 0, 6.283); ctx.stroke();
            ctx.restore();
        }

        // 血条/名牌：含淡入
        ctx.save();
        ctx.globalAlpha = fa;
        if (e.boss) {
            const bw = 76, bh = 7;
            const by = y - s * 1.5;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(x - bw / 2 - 1, by - 1, bw + 2, bh + 2);
            ctx.fillStyle = '#ff5252';
            ctx.fillRect(x - bw / 2, by, bw * Math.max(0, e.hp / e.maxHp), bh);
            // BOSS 名字
            ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd56b';
            ctx.fillText(e.name + (e.skill ? ' · ' + e.skill : ''), x, by - 5);
        } else if (e.elite) {
            ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
            ctx.fillStyle = '#ffb03b';
            ctx.fillText('精英', x, y - s * 1.35 - 3);
        }
        ctx.restore();
    },

    drawShape(ctx, shape, x, y, s, body, accent, t, walking) {
        const walk = walking ? Math.sin(t * 9) : 0;
        ctx.lineWidth = Math.max(1.2, s * 0.1);
        ctx.strokeStyle = accent;
        const eye = (ex, ey, r) => {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(ex, ey, r, 0, 6.283); ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(ex + r * 0.25, ey, r * 0.55, 0, 6.283); ctx.fill();
        };

        switch (shape) {
            case 'blob': {
                const sq = 1 + Math.sin(t * 6) * 0.1;
                ctx.fillStyle = body;
                ctx.beginPath();
                ctx.ellipse(x, y, s * 0.95 * (2 - sq), s * 0.85 * sq, 0, Math.PI, 0);
                ctx.fill();
                ctx.fillRect(x - s * 0.95 * (2 - sq), y, s * 1.9 * (2 - sq), s * 0.2);
                eye(x - s * 0.3, y - s * 0.15, s * 0.17); eye(x + s * 0.3, y - s * 0.15, s * 0.17);
                break;
            }
            case 'brute': {
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y, s * 0.55, s * 0.62, 0, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                ctx.fillRect(x - s * 0.72, y - s * 0.1, s * 0.28, s * 0.5 + walk * 2);
                ctx.fillRect(x + s * 0.44, y - s * 0.1, s * 0.28, s * 0.5 - walk * 2);
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.arc(x, y - s * 0.6, s * 0.36, 0, 6.283); ctx.fill();
                eye(x - s * 0.14, y - s * 0.66, s * 0.12); eye(x + s * 0.14, y - s * 0.66, s * 0.12);
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.moveTo(x - s * 0.36, y - s * 0.86); ctx.lineTo(x - s * 0.2, y - s * 1.2); ctx.lineTo(x - s * 0.08, y - s * 0.84); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x + s * 0.36, y - s * 0.86); ctx.lineTo(x + s * 0.2, y - s * 1.2); ctx.lineTo(x + s * 0.08, y - s * 0.84); ctx.fill();
                break;
            }
            case 'undead': {
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.arc(x, y - s * 0.45, s * 0.34, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                for (let i = 0; i < 3; i++) ctx.fillRect(x - s * 0.3, y - s * 0.1 + i * s * 0.22, s * 0.6, s * 0.07);
                ctx.fillRect(x - s * 0.08, y - s * 0.12, s * 0.16, s * 0.62);
                ctx.fillStyle = body;
                ctx.fillRect(x - s * 0.5, y - s * 0.02 + walk * 2, s * 0.16, s * 0.5);
                ctx.fillRect(x + s * 0.34, y - s * 0.02 - walk * 2, s * 0.16, s * 0.5);
                ctx.fillStyle = '#111';
                ctx.beginPath(); ctx.arc(x - s * 0.13, y - s * 0.5, s * 0.1, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.arc(x + s * 0.13, y - s * 0.5, s * 0.1, 0, 6.283); ctx.fill();
                break;
            }
            case 'beast': {
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y - s * 0.1, s * 0.72, s * 0.42, 0, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.arc(x + s * 0.62, y - s * 0.34, s * 0.3, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.moveTo(x + s * 0.86, y - s * 0.4); ctx.lineTo(x + s * 1.05, y - s * 0.28); ctx.lineTo(x + s * 0.86, y - s * 0.2); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x + s * 0.5, y - s * 0.58); ctx.lineTo(x + s * 0.6, y - s * 0.92); ctx.lineTo(x + s * 0.7, y - s * 0.55); ctx.fill();
                ctx.fillStyle = body;
                for (let i = 0; i < 2; i++) {
                    ctx.fillRect(x - s * 0.42 + i * s * 0.6, y + s * 0.2, s * 0.14, s * 0.42 + walk * 3);
                    ctx.fillRect(x - s * 0.2 + i * s * 0.6, y + s * 0.2, s * 0.14, s * 0.42 - walk * 3);
                }
                ctx.strokeStyle = accent;
                ctx.beginPath(); ctx.moveTo(x - s * 0.7, y - s * 0.15);
                ctx.quadraticCurveTo(x - s * 1.15, y - s * 0.4 + walk * 4, x - s * 0.95, y - s * 0.7); ctx.stroke();
                eye(x + s * 0.6, y - s * 0.4, s * 0.1);
                break;
            }
            case 'bat': {
                const flap = Math.sin(t * 14) * s * 0.5;
                ctx.fillStyle = accent;
                ctx.beginPath();
                ctx.moveTo(x, y - s * 0.1);
                ctx.quadraticCurveTo(x - s * 0.9, y - s * 0.5 - flap, x - s * 1.25, y + s * 0.1);
                ctx.quadraticCurveTo(x - s * 0.7, y + s * 0.1, x, y + s * 0.2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x, y - s * 0.1);
                ctx.quadraticCurveTo(x + s * 0.9, y - s * 0.5 - flap, x + s * 1.25, y + s * 0.1);
                ctx.quadraticCurveTo(x + s * 0.7, y + s * 0.1, x, y + s * 0.2);
                ctx.fill();
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y, s * 0.3, s * 0.38, 0, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x - s * 0.22, y - s * 0.34); ctx.lineTo(x - s * 0.1, y - s * 0.72); ctx.lineTo(x - s * 0.02, y - s * 0.32); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x + s * 0.22, y - s * 0.34); ctx.lineTo(x + s * 0.1, y - s * 0.72); ctx.lineTo(x + s * 0.02, y - s * 0.32); ctx.fill();
                eye(x - s * 0.11, y - s * 0.08, s * 0.09); eye(x + s * 0.11, y - s * 0.08, s * 0.09);
                break;
            }
            case 'golem': {
                ctx.fillStyle = body;
                ctx.fillRect(x - s * 0.6, y - s * 0.9, s * 1.2, s * 1.15);
                ctx.fillRect(x - s * 0.42, y - s * 1.3, s * 0.84, s * 0.45);
                ctx.fillStyle = accent;
                ctx.fillRect(x - s * 0.78, y - s * 0.75 + walk * 3, s * 0.22, s * 0.95);
                ctx.fillRect(x + s * 0.56, y - s * 0.75 - walk * 3, s * 0.22, s * 0.95);
                ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x - s * 0.3, y - s * 0.8); ctx.lineTo(x - s * 0.05, y - s * 0.4); ctx.lineTo(x - s * 0.3, y);
                ctx.stroke();
                ctx.save();
                ctx.shadowColor = '#ff8a3b'; ctx.shadowBlur = 8;
                ctx.fillStyle = '#ff8a3b';
                ctx.fillRect(x - s * 0.28, y - s * 1.08, s * 0.2, s * 0.14);
                ctx.fillRect(x + s * 0.08, y - s * 1.08, s * 0.2, s * 0.14);
                ctx.restore();
                break;
            }
            case 'ghost': {
                ctx.save();
                ctx.globalAlpha = 0.75;
                ctx.fillStyle = body;
                ctx.beginPath();
                ctx.moveTo(x - s * 0.6, y + s * 0.6);
                ctx.quadraticCurveTo(x - s * 0.7, y - s * 0.9, x, y - s * 1.0);
                ctx.quadraticCurveTo(x + s * 0.7, y - s * 0.9, x + s * 0.6, y + s * 0.6);
                for (let i = 0; i < 3; i++) {
                    const wx = x + s * 0.6 - i * s * 0.4;
                    ctx.quadraticCurveTo(wx - s * 0.1, y + s * 0.9 + Math.sin(t * 5 + i) * 4, wx - s * 0.4, y + s * 0.6);
                }
                ctx.fill();
                ctx.restore();
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.arc(x - s * 0.2, y - s * 0.45, s * 0.11, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.arc(x + s * 0.2, y - s * 0.45, s * 0.11, 0, 6.283); ctx.fill();
                break;
            }
            case 'spider': {
                ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1.4, s * 0.11);
                for (let i = 0; i < 4; i++) {
                    const a = 0.5 + i * 0.5;
                    const sw = Math.sin(t * 8 + i) * s * 0.16;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.quadraticCurveTo(x - Math.cos(a) * s * 0.9, y - s * 0.5 + sw, x - Math.cos(a) * s * 1.25, y + s * 0.35);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.quadraticCurveTo(x + Math.cos(a) * s * 0.9, y - s * 0.5 - sw, x + Math.cos(a) * s * 1.25, y + s * 0.35);
                    ctx.stroke();
                }
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y, s * 0.55, s * 0.48, 0, 0, 6.283); ctx.fill();
                ctx.save(); ctx.shadowColor = '#ff5252'; ctx.shadowBlur = 6; ctx.fillStyle = '#ff5252';
                for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - s * 0.24 + i * s * 0.16, y - s * 0.24, s * 0.055, 0, 6.283); ctx.fill(); }
                ctx.restore();
                break;
            }
            case 'insect': {
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y, s * 0.42, s * 0.6, 0, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                for (let i = 0; i < 3; i++) ctx.fillRect(x - s * 0.34, y - s * 0.3 + i * s * 0.26, s * 0.68, s * 0.06);
                ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1.6, s * 0.13);
                ctx.beginPath();
                ctx.moveTo(x, y - s * 0.5);
                ctx.quadraticCurveTo(x + s * 0.7, y - s * 0.9, x + s * 0.35, y - s * 1.25);
                ctx.stroke();
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.moveTo(x + s * 0.35, y - s * 1.25); ctx.lineTo(x + s * 0.6, y - s * 1.5); ctx.lineTo(x + s * 0.2, y - s * 1.4); ctx.fill();
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.moveTo(x - s * 0.4, y - s * 0.5); ctx.lineTo(x - s * 0.95, y - s * 0.62); ctx.lineTo(x - s * 0.4, y - s * 0.3); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x + s * 0.4, y - s * 0.5); ctx.lineTo(x + s * 0.95, y - s * 0.62); ctx.lineTo(x + s * 0.4, y - s * 0.3); ctx.fill();
                break;
            }
            case 'plant': {
                ctx.fillStyle = '#e8dcc0';
                ctx.fillRect(x - s * 0.2, y - s * 0.35, s * 0.4, s * 0.8);
                ctx.fillStyle = body;
                ctx.beginPath();
                ctx.ellipse(x, y - s * 0.35, s * 0.85, s * 0.62, 0, Math.PI, 0);
                ctx.fill();
                ctx.fillStyle = accent;
                for (let i = 0; i < 4; i++) {
                    const px = x - s * 0.5 + i * s * 0.34, py = y - s * 0.6 - (i % 2) * s * 0.2;
                    ctx.beginPath(); ctx.arc(px, py, s * 0.13, 0, 6.283); ctx.fill();
                }
                ctx.fillStyle = '#111';
                ctx.beginPath(); ctx.arc(x - s * 0.16, y + s * 0.12, s * 0.08, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.arc(x + s * 0.16, y + s * 0.12, s * 0.08, 0, 6.283); ctx.fill();
                break;
            }
            case 'demon': {
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y, s * 0.5, s * 0.55, 0, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.arc(x, y - s * 0.62, s * 0.36, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.moveTo(x - s * 0.34, y - s * 0.85); ctx.lineTo(x - s * 0.5, y - s * 1.35); ctx.lineTo(x - s * 0.12, y - s * 0.92); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x + s * 0.34, y - s * 0.85); ctx.lineTo(x + s * 0.5, y - s * 1.35); ctx.lineTo(x + s * 0.12, y - s * 0.92); ctx.fill();
                ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1.4, s * 0.1);
                ctx.beginPath();
                ctx.moveTo(x + s * 0.3, y + s * 0.3);
                ctx.quadraticCurveTo(x + s * 1.0, y + s * 0.5 + walk * 3, x + s * 0.75, y - s * 0.1);
                ctx.stroke();
                ctx.save(); ctx.shadowColor = '#ffe66b'; ctx.shadowBlur = 7; ctx.fillStyle = '#ffe66b';
                eye(x - s * 0.14, y - s * 0.66, s * 0.1); eye(x + s * 0.14, y - s * 0.66, s * 0.1);
                ctx.restore();
                break;
            }
            case 'bird': {
                const flap = Math.sin(t * 11) * s * 0.55;
                ctx.fillStyle = accent;
                ctx.beginPath();
                ctx.moveTo(x, y - s * 0.15);
                ctx.quadraticCurveTo(x - s * 0.85, y - s * 0.6 - flap, x - s * 1.3, y - s * 0.1);
                ctx.quadraticCurveTo(x - s * 0.7, y + s * 0.15, x, y + s * 0.1);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x, y - s * 0.15);
                ctx.quadraticCurveTo(x + s * 0.85, y - s * 0.6 - flap, x + s * 1.3, y - s * 0.1);
                ctx.quadraticCurveTo(x + s * 0.7, y + s * 0.15, x, y + s * 0.1);
                ctx.fill();
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y, s * 0.34, s * 0.5, 0, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.arc(x, y - s * 0.52, s * 0.26, 0, 6.283); ctx.fill();
                ctx.fillStyle = '#ffb03b';
                ctx.beginPath(); ctx.moveTo(x, y - s * 0.56); ctx.lineTo(x + s * 0.42, y - s * 0.44); ctx.lineTo(x, y - s * 0.36); ctx.fill();
                eye(x + s * 0.06, y - s * 0.58, s * 0.09);
                break;
            }
            case 'serpent': {
                ctx.strokeStyle = body; ctx.lineWidth = s * 0.5; ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x - s * 0.9, y + s * 0.5);
                ctx.quadraticCurveTo(x + Math.sin(t * 3) * s * 0.6, y - s * 0.1, x + s * 0.5, y + s * 0.15);
                ctx.stroke();
                ctx.lineCap = 'butt';
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x + s * 0.62, y + s * 0.05, s * 0.42, s * 0.32, 0, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.moveTo(x + s * 1.0, y + s * 0.05); ctx.lineTo(x + s * 1.4, y - s * 0.05); ctx.lineTo(x + s * 1.0, y + s * 0.18); ctx.fill();
                ctx.save(); ctx.shadowColor = '#ff5252'; ctx.shadowBlur = 6; ctx.fillStyle = '#ff5252';
                eye(x + s * 0.68, y - s * 0.05, s * 0.1);
                ctx.restore();
                break;
            }
            case 'mage': {
                ctx.fillStyle = body;
                ctx.beginPath();
                ctx.moveTo(x, y - s * 1.05);
                ctx.lineTo(x + s * 0.55, y + s * 0.65);
                ctx.lineTo(x - s * 0.55, y + s * 0.65);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.arc(x, y - s * 0.95, s * 0.32, 0, 6.283); ctx.fill();
                ctx.fillStyle = '#111';
                ctx.beginPath(); ctx.ellipse(x, y - s * 0.98, s * 0.24, s * 0.2, 0, 0, 6.283); ctx.fill();
                ctx.save(); ctx.shadowColor = '#b78bff'; ctx.shadowBlur = 8; ctx.fillStyle = '#b78bff';
                ctx.beginPath(); ctx.arc(x - s * 0.09, y - s * 0.98, s * 0.06, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.arc(x + s * 0.09, y - s * 0.98, s * 0.06, 0, 6.283); ctx.fill();
                ctx.restore();
                ctx.strokeStyle = accent; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x + s * 0.6, y + s * 0.5); ctx.lineTo(x + s * 0.72, y - s * 0.7); ctx.stroke();
                ctx.save();
                ctx.shadowColor = '#b78bff'; ctx.shadowBlur = 10 + Math.sin(t * 5) * 4;
                ctx.fillStyle = '#d9b3ff';
                ctx.beginPath(); ctx.arc(x + s * 0.72, y - s * 0.78, s * 0.16, 0, 6.283); ctx.fill();
                ctx.restore();
                break;
            }
            case 'knight': {
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y, s * 0.5, s * 0.6, 0, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                ctx.fillRect(x - s * 0.52, y - s * 0.1 + walk * 2, s * 0.16, s * 0.55);
                ctx.fillRect(x + s * 0.36, y - s * 0.1 - walk * 2, s * 0.16, s * 0.55);
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.arc(x, y - s * 0.66, s * 0.33, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                ctx.fillRect(x - s * 0.35, y - s * 0.72, s * 0.7, s * 0.1);
                ctx.fillStyle = '#8ad4ff';
                ctx.fillRect(x - s * 0.22, y - s * 0.6, s * 0.44, s * 0.11);
                ctx.fillStyle = '#c8ccd4';
                ctx.beginPath();
                ctx.moveTo(x - s * 0.78, y - s * 0.6); ctx.lineTo(x - s * 0.78, y + s * 0.45);
                ctx.quadraticCurveTo(x - s * 0.78, y + s * 0.7, x - s * 0.55, y + s * 0.45);
                ctx.lineTo(x - s * 0.55, y - s * 0.6); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
                break;
            }
            case 'wisp': {
                ctx.save();
                const wg = ctx.createRadialGradient(x, y, 1, x, y, s * 1.1);
                wg.addColorStop(0, '#ffffff');
                wg.addColorStop(0.35, body);
                wg.addColorStop(1, 'rgba(92,199,255,0)');
                ctx.fillStyle = wg;
                ctx.beginPath(); ctx.arc(x, y, s * 1.1, 0, 6.283); ctx.fill();
                ctx.restore();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(x, y, s * 0.34, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.arc(x - s * 0.12, y, s * 0.07, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.arc(x + s * 0.12, y, s * 0.07, 0, 6.283); ctx.fill();
                break;
            }
            case 'dragon': {
                const flap = Math.sin(t * 4) * s * 0.4;
                ctx.fillStyle = accent;
                ctx.beginPath();
                ctx.moveTo(x, y - s * 0.2);
                ctx.quadraticCurveTo(x - s * 1.1, y - s * 0.9 - flap, x - s * 1.6, y - s * 0.1);
                ctx.quadraticCurveTo(x - s * 0.9, y + s * 0.25, x, y + s * 0.15);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x, y - s * 0.2);
                ctx.quadraticCurveTo(x + s * 1.1, y - s * 0.9 - flap, x + s * 1.6, y - s * 0.1);
                ctx.quadraticCurveTo(x + s * 0.9, y + s * 0.25, x, y + s * 0.15);
                ctx.fill();
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y, s * 0.55, s * 0.7, 0, 0, 6.283); ctx.fill();
                ctx.strokeStyle = body; ctx.lineWidth = s * 0.3; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(x, y - s * 0.4); ctx.quadraticCurveTo(x, y - s * 1.0, x, y - s * 1.15); ctx.stroke();
                ctx.lineCap = 'butt';
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.ellipse(x, y - s * 1.3, s * 0.42, s * 0.3, 0, 0, 6.283); ctx.fill();
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.moveTo(x + s * 0.36, y - s * 1.32); ctx.lineTo(x + s * 0.86, y - s * 1.2); ctx.lineTo(x + s * 0.36, y - s * 1.08); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x - s * 0.2, y - s * 1.5); ctx.lineTo(x - s * 0.05, y - s * 2.0); ctx.lineTo(x + s * 0.1, y - s * 1.48); ctx.fill();
                ctx.save(); ctx.shadowColor = '#ff5252'; ctx.shadowBlur = 9; ctx.fillStyle = '#ffd56b';
                eye(x - s * 0.14, y - s * 1.34, s * 0.1); eye(x + s * 0.14, y - s * 1.34, s * 0.1);
                ctx.restore();
                break;
            }
            default: {
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, 6.283); ctx.fill();
                ctx.strokeStyle = accent; ctx.stroke();
                eye(x - s * 0.2, y - s * 0.1, s * 0.13); eye(x + s * 0.2, y - s * 0.1, s * 0.13);
            }
        }
    },

    // ---------- 我方英雄 ----------
    drawHero(h) {
        const ctx = this.ctx;
        const r = 24;
        const y = h.y - r - 4 + Math.sin(h.animT * 2.2) * 1.5;

        // 影子
        ctx.save();
        ctx.globalAlpha = 0.32; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(h.x, h.y + 6, r * 0.85, r * 0.3, 0, 0, 6.283); ctx.fill();
        ctx.restore();

        // 元素光环（旋转）
        const ec = ELEMENT_COLOR[h.element] || '#ffd56b';
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = ec; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, y, r + 7, this.time * 1.6, this.time * 1.6 + 2.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(h.x, y, r + 7, this.time * 1.6 + Math.PI, this.time * 1.6 + Math.PI + 2.1);
        ctx.stroke();
        if (h.castGlow > 0) {
            ctx.globalAlpha = h.castGlow * 0.7;
            const cg = ctx.createRadialGradient(h.x, y, 1, h.x, y, r * 2.2);
            cg.addColorStop(0, h.tint); cg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = cg;
            ctx.beginPath(); ctx.arc(h.x, y, r * 2.2, 0, 6.283); ctx.fill();
        }
        ctx.restore();

        // 站位圆台
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = h.dead ? '#555' : ec;
        ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, r * 0.9, r * 0.32, 0, 0, 6.283); ctx.fill();
        ctx.restore();

        // 头像
        ctx.save();
        ctx.beginPath(); ctx.arc(h.x, y, r, 0, 6.283); ctx.clip();
        if (h.dead) { ctx.fillStyle = '#2a2540'; ctx.fillRect(h.x - r, y - r, r * 2, r * 2); }
        else if (h.imgLoaded && h.imgEl) {
            try { ctx.drawImage(h.imgEl, h.x - r, y - r, r * 2, r * 2); }
            catch (e) { ctx.fillStyle = '#3a2c5e'; ctx.fillRect(h.x - r, y - r, r * 2, r * 2); }
        } else {
            ctx.fillStyle = '#3a2c5e'; ctx.fillRect(h.x - r, y - r, r * 2, r * 2);
            ctx.fillStyle = ec; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText((h.name || '?')[0], h.x, y);
        }
        if (h.hitFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${h.hitFlash * 0.85})`; ctx.fillRect(h.x - r, y - r, r * 2, r * 2); }
        ctx.restore();

        // 稀有度边框
        ctx.save();
        ctx.strokeStyle = RARITY_COLOR[h.rarity] || '#ffd56b';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(h.x, y, r, 0, 6.283); ctx.stroke();
        ctx.restore();

        // 受击白环（强化打击反馈）
        if (h.hitFlash > 0) {
            ctx.save();
            ctx.strokeStyle = `rgba(255,255,255,${0.9 * h.hitFlash})`;
            ctx.lineWidth = 3.2; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10 * h.hitFlash;
            ctx.beginPath(); ctx.arc(h.x, y, r + 1.5, 0, 6.283); ctx.stroke();
            ctx.restore();
        }

        if (h.dead) {
            ctx.save();
            ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(h.x - r * 0.6, y - r * 0.6); ctx.lineTo(h.x + r * 0.6, y + r * 0.6);
            ctx.moveTo(h.x + r * 0.6, y - r * 0.6); ctx.lineTo(h.x - r * 0.6, y + r * 0.6);
            ctx.stroke(); ctx.restore();
        } else {
            // 血条
            const bw = 42, bh = 5, by = y + r + 5;
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(h.x - bw / 2 - 1, by - 1, bw + 2, bh + 2);
            const ratio = Math.max(0, h.hp / h.maxHp);
            ctx.fillStyle = ratio > 0.5 ? '#7cfc7c' : (ratio > 0.22 ? '#ffd56b' : '#ff5252');
            ctx.fillRect(h.x - bw / 2, by, bw * ratio, bh);

            // 护盾环（10★ 天赋）
            if (h.shield > 0) {
                ctx.save();
                ctx.strokeStyle = 'rgba(92,199,255,0.85)';
                ctx.lineWidth = 2.2;
                ctx.globalAlpha = 0.55 + Math.sin(this.time * 5) * 0.25;
                ctx.beginPath(); ctx.arc(h.x, y, r + 6.5, 0, 6.283); ctx.stroke();
                ctx.restore();
            }
            // 星级（1-5 黄 / 6-10 红 / 11-14 彩虹 / 15 至尊 / 16 MAX）
            if (h.star && h.star > 0) {
                ctx.save();
                ctx.textAlign = 'center';
                ctx.globalAlpha = 0.95;
                const col = U.starColor(h.star);
                const starTxt = h.star >= 15 ? '👑' : '★';
                ctx.font = 'bold 9px system-ui';
                ctx.fillStyle = col;
                ctx.fillText(starTxt, h.x - 6, y - r - 7);
                // 具体数字
                ctx.font = 'bold 9px system-ui';
                ctx.fillStyle = col;
                ctx.fillText(String(h.star), h.x + 5, y - r - 7);
                ctx.restore();
            }

            // 技能 CD 环
            const ready = h.cdTimer <= 0;
            ctx.save();
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3.4;
            ctx.beginPath(); ctx.arc(h.x, y, r + 3.5, 0, 6.283); ctx.stroke();
            const p = 1 - Math.max(0, Math.min(1, h.cdTimer / h.cdMax));
            ctx.strokeStyle = ready ? '#ffe66b' : 'rgba(140,200,255,0.85)';
            ctx.lineWidth = 3.4;
            ctx.beginPath(); ctx.arc(h.x, y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + 6.283 * p); ctx.stroke();
            if (ready) {
                ctx.globalAlpha = 0.4 + Math.sin(this.time * 6) * 0.3;
                ctx.strokeStyle = h.tint; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(h.x, y, r + 3.5, 0, 6.283); ctx.stroke();
            }
            ctx.restore();
        }
    },

    // ---------- 城墙障碍（钻石屏障） ----------
    drawBlocks() {
        if (!this.blocks || !this.blocks.length) return;
        const ctx = this.ctx;
        for (const b of this.blocks) {
            const a = Math.min(1, b.life / 1.2);
            ctx.save();
            ctx.globalAlpha = 0.85 * a;
            ctx.fillStyle = 'rgba(120,200,255,0.55)';
            ctx.strokeStyle = b.tint;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y - 26);
            ctx.lineTo(b.x + 24, b.y - 4);
            ctx.lineTo(b.x + 18, b.y + 24);
            ctx.lineTo(b.x - 18, b.y + 24);
            ctx.lineTo(b.x - 24, b.y - 4);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            ctx.globalAlpha = 0.5 * a;
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(b.x - 10, b.y - 8); ctx.lineTo(b.x + 8, b.y + 12);
            ctx.moveTo(b.x + 10, b.y - 8); ctx.lineTo(b.x - 8, b.y + 12);
            ctx.stroke();
            ctx.restore();
        }
    },

    drawProjs() {
        const ctx = this.ctx;
        for (const p of this.projs) {
            ctx.save();
            ctx.shadowColor = p.color; ctx.shadowBlur = 10;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
            ctx.globalAlpha = 0.65; ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.45, 0, 6.283); ctx.fill();
            ctx.restore();
        }
    },

    // ---------- 技能特效 ----------
    drawFx() {
        const ctx = this.ctx, W = this.W, H = this.H;
        for (const f of this.fx) {
            const k = Math.min(1, f.t / f.dur);
            const fade = 1 - k;
            ctx.save();
            ctx.globalAlpha = Math.max(0, fade);
            switch (f.type) {
                case 'slash': this.fxSlash(f, k); break;
                case 'water': this.fxRings(f, k, '#5cc7ff', 3); break;
                case 'tidal': this.fxTidal(f, k); break;
                case 'freeze': this.fxFreeze(f, k); break;
                case 'ice': this.fxIce(f, k); break;
                case 'heal': this.fxHeal(f, k); break;
                case 'bloom': this.fxBloom(f, k); break;
                case 'meteor': this.fxMeteor(f, k); break;
                case 'fire': this.fxFire(f, k); break;
                case 'burn': this.fxBurn(f, k); break;
                case 'dark': this.fxDark(f, k); break;
                case 'summon': this.fxSummon(f, k); break;
                case 'thunder': this.fxThunder(f, k); break;
                case 'bolt': this.fxBolt(f, k); break;
                case 'laser': this.fxLaser(f, k); break;
                case 'holy': this.fxHoly(f, k); break;
                case 'shield': this.fxShield(f, k); break;
                case 'buff': this.fxBuff(f, k); break;
                case 'sound': this.fxSound(f, k); break;
                case 'wind': this.fxWind(f, k); break;
                case 'quake': this.fxQuake(f, k); break;
                case 'paint': this.fxPaint(f, k); break;
                default: this.fxRings(f, k, f.tint, 2);
            }
            ctx.restore();
        }
    },

    fxTargets(f) {
        return (f.targets || this.enemies).filter(e => e && !e.dead);
    },

    // 斩击：一道扫过的弧形刀光
    fxSlash(f, k) {
        const ctx = this.ctx;
        const list = this.fxTargets(f);
        ctx.save();
        for (const e of list) {
            const x = e.x, y = e.y;
            const a = -0.6 + k * 2.2;
            ctx.strokeStyle = f.tint;
            ctx.lineWidth = 7 * (1 - k) + 2;
            ctx.shadowColor = f.tint; ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(x, y, e.size * 2.2, a, a + 1.5);
            ctx.stroke();
            ctx.globalAlpha = (1 - k) * 0.7;
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(x, y, e.size * 2.2, a, a + 1.5); ctx.stroke();
        }
        ctx.restore();
    },

    // 扩散圆环（水波 / 通用）
    fxRings(f, k, color, count) {
        const ctx = this.ctx;
        for (let i = 0; i < (count || 3); i++) {
            const kk = k - i * 0.12;
            if (kk < 0 || kk > 1) continue;
            ctx.strokeStyle = f.tint || color;
            ctx.lineWidth = 5 * (1 - kk) + 1;
            ctx.globalAlpha = (1 - kk) * 0.8;
            ctx.beginPath();
            ctx.arc(this.CX, this.groundY - 40, 30 + kk * this.W * 0.6, 0, 6.283);
            ctx.stroke();
        }
    },

    // 洪流：从底部升起的水墙往上推
    fxTidal(f, k) {
        const ctx = this.ctx;
        const y = this.groundY + 30 - k * (this.groundY - this.topY);
        const g = ctx.createLinearGradient(0, y - 30, 0, y + 60);
        g.addColorStop(0, U.math.rgba(f.tint, 0.1));
        g.addColorStop(0.5, U.math.rgba(f.tint, 0.75));
        g.addColorStop(1, U.math.rgba(f.tint, 0.15));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, y + 60);
        for (let i = 0; i <= 12; i++) {
            const x = this.W * i / 12;
            ctx.lineTo(x, y + Math.sin(i * 1.4 + this.time * 8) * 7);
        }
        ctx.lineTo(this.W, y + 60);
        ctx.closePath(); ctx.fill();
    },

    // 冰封：全屏蓝色 + 冰晶
    fxFreeze(f, k) {
        const ctx = this.ctx;
        ctx.fillStyle = U.math.rgba(f.tint, 0.28 * (1 - k));
        ctx.fillRect(0, 0, this.W, this.H);
        for (const e of this.fxTargets(f)) {
            const s = e.size * (1 + k * 0.5);
            ctx.strokeStyle = f.tint; ctx.lineWidth = 2.5;
            ctx.globalAlpha = 1 - k * 0.4;
            for (let i = 0; i < 6; i++) {
                const a = i * 1.047 + k;
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(e.x + Math.cos(a) * s * 1.6, e.y + Math.sin(a) * s * 1.6);
                ctx.stroke();
            }
        }
    },

    // 冰锥：敌人身上冒出冰晶
    fxIce(f, k) {
        const ctx = this.ctx;
        for (const e of this.fxTargets(f)) {
            for (let i = 0; i < 5; i++) {
                const a = i * 1.25 + k * 0.6;
                const len = e.size * (1.2 + Math.sin(k * 3 + i) * 0.5);
                ctx.strokeStyle = f.tint; ctx.lineWidth = 3;
                ctx.globalAlpha = 1 - k;
                ctx.beginPath();
                ctx.moveTo(e.x + Math.cos(a) * e.size * 0.4, e.y + Math.sin(a) * e.size * 0.4);
                ctx.lineTo(e.x + Math.cos(a) * len * 2, e.y + Math.sin(a) * len * 2);
                ctx.stroke();
            }
        }
    },

    // 治疗：上升的光点
    fxHeal(f, k) {
        const ctx = this.ctx;
        for (const h of this.heroes) {
            if (h.dead) continue;
            ctx.globalAlpha = (1 - k) * 0.9;
            const r = 30 + k * 26;
            ctx.strokeStyle = f.tint; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(h.x, h.y - 20, r, r * 0.4, 0, 0, 6.283); ctx.stroke();
            for (let i = 0; i < 3; i++) {
                const yy = h.y - 10 - ((k * 60 + i * 22) % 70);
                ctx.fillStyle = f.tint;
                ctx.globalAlpha = (1 - k) * 0.85;
                ctx.beginPath(); ctx.arc(h.x + Math.sin(i * 2 + this.time * 3) * 10, yy, 3, 0, 6.283); ctx.fill();
            }
        }
    },

    // 花瓣：大量花瓣飘落
    fxBloom(f, k) {
        const ctx = this.ctx;
        if (Math.random() < 0.8) {
            this.parts.push({
                x: Math.random() * this.W, y: -10,
                vx: (Math.random() - 0.5) * 30, vy: 40 + Math.random() * 50,
                life: 1.6, max: 1.6, size: 3 + Math.random() * 3,
                color: Math.random() < 0.5 ? f.tint : '#ffd6e8', glow: false, grav: 10,
            });
        }
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.fillStyle = f.tint;
        ctx.fillRect(0, 0, this.W, this.H);
    },

    // 陨石：从天而降的火球
    fxMeteor(f, k) {
        const ctx = this.ctx;
        const list = this.fxTargets(f);
        const n = Math.max(1, list.length);
        for (let i = 0; i < n; i++) {
            const tgt = list[i % list.length];
            const tx = tgt ? tgt.x : this.CX;
            const ty = tgt ? tgt.y : this.groundY - 60;
            const startY = -60;
            const y = startY + (ty - startY) * Math.min(1, k / 0.55);
            const x = tx + (1 - Math.min(1, k / 0.55)) * (i - n / 2) * 40;
            if (k < 0.58) {
                ctx.save();
                const g = ctx.createRadialGradient(x, y, 2, x, y, 22);
                g.addColorStop(0, '#fff'); g.addColorStop(0.4, f.tint); g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(x, y, 22, 0, 6.283); ctx.fill();
                ctx.restore();
                // 拖尾
                this.parts.push({ x: x + (Math.random() - 0.5) * 8, y: y - 14, vx: 0, vy: -20, life: 0.35, max: 0.35, size: 4, color: f.tint, glow: true, grav: 0 });
            } else {
                const ek = (k - 0.55) / 0.45;
                ctx.globalAlpha = 1 - ek;
                const g = ctx.createRadialGradient(tx, ty, 4, tx, ty, 70 * (0.4 + ek));
                g.addColorStop(0, 'rgba(255,255,255,0.95)');
                g.addColorStop(0.35, f.tint);
                g.addColorStop(1, 'rgba(255,80,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(tx, ty, 70 * (0.4 + ek), 0, 6.283); ctx.fill();
            }
        }
    },

    // 烈焰：从英雄位置喷出的火焰锥
    fxFire(f, k) {
        const ctx = this.ctx;
        const src = f.src || { x: this.CX, y: this.groundY - 20 };
        const cy = this.groundY - 120;
        ctx.save();
        const g = ctx.createRadialGradient(src.x, cy, 4, src.x, cy, this.W * 0.6);
        g.addColorStop(0, U.math.rgba(f.tint, 0.85 * (1 - k)));
        g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(src.x, cy, this.W * 0.6, 0, 6.283); ctx.fill();
        ctx.restore();
        if (Math.random() < 0.9) {
            this.parts.push({
                x: src.x + (Math.random() - 0.5) * 50, y: cy + (Math.random() - 0.5) * 90,
                vx: (Math.random() - 0.5) * 60, vy: -60 - Math.random() * 80,
                life: 0.5, max: 0.5, size: 4 + Math.random() * 5, color: Math.random() < 0.5 ? f.tint : '#ffd56b', glow: true, grav: -40,
            });
        }
    },

    // 灼烧：敌人身上燃起火焰
    fxBurn(f, k) {
        const ctx = this.ctx;
        for (const e of this.fxTargets(f)) {
            ctx.save();
            const g = ctx.createRadialGradient(e.x, e.y - 8, 2, e.x, e.y - 8, e.size * 2);
            g.addColorStop(0, U.math.rgba(f.tint, 0.8 * (1 - k)));
            g.addColorStop(1, 'rgba(255,80,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(e.x, e.y - 8, e.size * 2, 0, 6.283); ctx.fill();
            ctx.restore();
            if (Math.random() < 0.6) {
                this.parts.push({ x: e.x + (Math.random() - 0.5) * 14, y: e.y, vx: (Math.random() - 0.5) * 20, vy: -50 - Math.random() * 40, life: 0.45, max: 0.45, size: 3.5, color: f.tint, glow: true, grav: -30 });
            }
        }
    },

    // 暗影：紫色漩涡
    fxDark(f, k) {
        const ctx = this.ctx;
        const cx = this.CX, cy = this.H * 0.42;
        ctx.save();
        ctx.globalAlpha = 0.35 * (1 - k);
        ctx.fillStyle = '#1a0033';
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.restore();
        for (let i = 0; i < 5; i++) {
            const a = k * 8 + i * 1.26;
            const r = 30 + i * 16 + k * 40;
            ctx.strokeStyle = f.tint;
            ctx.lineWidth = 4;
            ctx.globalAlpha = (1 - k) * (0.9 - i * 0.12);
            ctx.beginPath();
            ctx.arc(cx, cy, r, a, a + 1.6);
            ctx.stroke();
        }
        ctx.globalAlpha = (1 - k) * 0.8;
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 90);
        g.addColorStop(0, U.math.rgba(f.tint, 0.7));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, 90, 0, 6.283); ctx.fill();
    },

    // 召唤：地面升起墓碑/暗影柱
    fxSummon(f, k) {
        const ctx = this.ctx;
        for (const e of this.fxTargets(f)) {
            const hgt = e.size * 3 * Math.min(1, k / 0.6);
            ctx.globalAlpha = 1 - k * 0.7;
            const g = ctx.createLinearGradient(e.x, e.y - hgt, e.x, e.y);
            g.addColorStop(0, U.math.rgba(f.tint, 0.1));
            g.addColorStop(1, U.math.rgba(f.tint, 0.9));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(e.x - e.size * 0.7, e.y);
            ctx.lineTo(e.x - e.size * 0.5, e.y - hgt);
            ctx.quadraticCurveTo(e.x, e.y - hgt - e.size * 0.5, e.x + e.size * 0.5, e.y - hgt);
            ctx.lineTo(e.x + e.size * 0.7, e.y);
            ctx.closePath(); ctx.fill();
        }
    },

    // 雷链：在敌人之间跳跃的闪电
    fxThunder(f, k) {
        const ctx = this.ctx;
        const list = this.fxTargets(f);
        if (!list.length) return;
        ctx.strokeStyle = f.tint; ctx.shadowColor = f.tint; ctx.shadowBlur = 14;
        let px = this.CX, py = this.groundY - 30;
        for (const e of list) {
            ctx.lineWidth = 3.5 * (1 - k) + 1;
            ctx.globalAlpha = 1 - k * 0.6;
            ctx.beginPath();
            ctx.moveTo(px, py);
            const seg = 4;
            for (let i = 1; i <= seg; i++) {
                const t = i / seg;
                const jx = (Math.random() - 0.5) * 26 * (1 - k);
                const jy = (Math.random() - 0.5) * 26 * (1 - k);
                ctx.lineTo(px + (e.x - px) * t + jx, py + (e.y - py) * t + jy);
            }
            ctx.stroke();
            px = e.x; py = e.y;
        }
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath();
    },

    // 落雷：每个敌人头顶一道垂直雷柱
    fxBolt(f, k) {
        const ctx = this.ctx;
        for (const e of this.fxTargets(f)) {
            ctx.save();
            ctx.strokeStyle = f.tint; ctx.shadowColor = f.tint; ctx.shadowBlur = 18;
            ctx.lineWidth = 5 * (1 - k) + 1.5;
            ctx.globalAlpha = 1 - k * 0.5;
            ctx.beginPath();
            ctx.moveTo(e.x, 0);
            let y = 0;
            while (y < e.y) {
                y += 18;
                ctx.lineTo(e.x + (Math.random() - 0.5) * 20, Math.min(y, e.y));
            }
            ctx.stroke();
            ctx.restore();
            if (k < 0.3) {
                const g = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, 55);
                g.addColorStop(0, 'rgba(255,255,255,0.9)');
                g.addColorStop(0.4, U.math.rgba(f.tint, 0.7));
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(e.x, e.y, 55, 0, 6.283); ctx.fill();
            }
        }
    },

    // 激光：从英雄射向目标的粗光束
    fxLaser(f, k) {
        const ctx = this.ctx;
        const src = f.src || { x: this.CX, y: this.groundY - 20 };
        for (const e of this.fxTargets(f)) {
            ctx.save();
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = f.tint; ctx.shadowColor = f.tint; ctx.shadowBlur = 22;
            ctx.lineWidth = 16 * (1 - k) + 4;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(e.x, e.y); ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 6 * (1 - k) + 1.5;
            ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(e.x, e.y); ctx.stroke();
            ctx.lineCap = 'butt';
            ctx.restore();
        }
    },

    // 圣光：金色光柱从天而降
    fxHoly(f, k) {
        const ctx = this.ctx;
        for (const e of this.fxTargets(f)) {
            const w = e.size * 2.4;
            const g = ctx.createLinearGradient(e.x, 0, e.x, e.y);
            g.addColorStop(0, U.math.rgba(f.tint, 0.05));
            g.addColorStop(0.7, U.math.rgba(f.tint, 0.6 * (1 - k)));
            g.addColorStop(1, U.math.rgba(f.tint, 0.95 * (1 - k)));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(e.x - w * 0.4, 0); ctx.lineTo(e.x + w * 0.4, 0);
            ctx.lineTo(e.x + w, e.y); ctx.lineTo(e.x - w, e.y);
            ctx.closePath(); ctx.fill();
            // 光斑
            ctx.globalAlpha = (1 - k) * 0.9;
            const rg = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, e.size * 2.4);
            rg.addColorStop(0, '#fff'); rg.addColorStop(1, 'rgba(255,220,120,0)');
            ctx.fillStyle = rg;
            ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 2.4, 0, 6.283); ctx.fill();
        }
    },

    // 护盾：全体罩上半球
    fxShield(f, k) {
        const ctx = this.ctx;
        for (const h of this.heroes) {
            if (h.dead) continue;
            ctx.save();
            ctx.globalAlpha = (1 - k) * 0.85;
            ctx.strokeStyle = f.tint; ctx.lineWidth = 3;
            ctx.shadowColor = f.tint; ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(h.x, h.y - 20, 34, Math.PI, 0);
            ctx.stroke();
            ctx.globalAlpha = (1 - k) * 0.25;
            ctx.fillStyle = f.tint;
            ctx.beginPath(); ctx.arc(h.x, h.y - 20, 34, Math.PI, 0); ctx.fill();
            ctx.restore();
        }
    },

    // 号令：金色圆环扩散 + 上升箭头
    fxBuff(f, k) {
        const ctx = this.ctx;
        for (const h of this.heroes) {
            if (h.dead) continue;
            ctx.save();
            ctx.globalAlpha = (1 - k) * 0.9;
            ctx.strokeStyle = f.tint; ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.ellipse(h.x, h.y, 20 + k * 40, (20 + k * 40) * 0.4, 0, 0, 6.283);
            ctx.stroke();
            ctx.fillStyle = f.tint;
            const ay = h.y - 40 - k * 40;
            ctx.beginPath();
            ctx.moveTo(h.x, ay - 8); ctx.lineTo(h.x - 7, ay + 4); ctx.lineTo(h.x + 7, ay + 4);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        }
    },

    // 音波：同心圆
    fxSound(f, k) {
        const ctx = this.ctx;
        const cx = f.src ? f.src.x : this.CX;
        const cy = f.src ? f.src.y : this.groundY - 40;
        for (let i = 0; i < 3; i++) {
            const kk = k - i * 0.15;
            if (kk < 0 || kk > 1) continue;
            ctx.globalAlpha = (1 - kk) * 0.75;
            ctx.strokeStyle = f.tint; ctx.lineWidth = 4 * (1 - kk) + 1;
            ctx.beginPath();
            ctx.arc(cx, cy, 20 + kk * this.W * 0.7, 0, 6.283);
            ctx.stroke();
        }
        // 音符
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.tint;
        ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) {
            const a = k * 3 + i * 2.1;
            ctx.fillText('♪', cx + Math.cos(a) * (40 + k * 50), cy - 20 + Math.sin(a) * 22 - k * 30);
        }
    },

    // 风刃：旋转的弧形刀刃飞过
    fxWind(f, k) {
        const ctx = this.ctx;
        for (const e of this.fxTargets(f)) {
            for (let i = 0; i < 3; i++) {
                const a = k * 9 + i * 2.1;
                const rr = e.size * (2.4 - i * 0.4);
                ctx.save();
                ctx.globalAlpha = (1 - k) * 0.9;
                ctx.strokeStyle = f.tint; ctx.lineWidth = 3.5;
                ctx.shadowColor = f.tint; ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(e.x, e.y, rr, a, a + 1.1);
                ctx.stroke();
                ctx.restore();
            }
        }
    },

    // 裂地：地面裂开，石柱突起
    fxQuake(f, k) {
        const ctx = this.ctx;
        const y = this.groundY + 20;
        ctx.save();
        ctx.strokeStyle = f.tint; ctx.lineWidth = 4 * (1 - k) + 2;
        ctx.shadowColor = f.tint; ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let i = 0; i <= 14; i++) {
            const x = this.W * i / 14;
            ctx.lineTo(x, y + Math.sin(i * 1.7 + k * 6) * 10 * (1 - k));
        }
        ctx.stroke();
        ctx.restore();
        for (const e of this.fxTargets(f)) {
            const hgt = e.size * 2.2 * Math.min(1, k / 0.4) * (1 - k * 0.4);
            ctx.fillStyle = f.tint;
            ctx.globalAlpha = 1 - k * 0.5;
            ctx.beginPath();
            ctx.moveTo(e.x - e.size * 0.5, e.y + 10);
            ctx.lineTo(e.x - e.size * 0.25, e.y + 10 - hgt);
            ctx.lineTo(e.x + e.size * 0.25, e.y + 10 - hgt);
            ctx.lineTo(e.x + e.size * 0.5, e.y + 10);
            ctx.closePath(); ctx.fill();
        }
    },

    // 彩绘：彩色颜料飞溅
    fxPaint(f, k) {
        const ctx = this.ctx;
        const cols = ['#ff5c7a', '#ffd56b', '#5cc7ff', '#7cfc7c', '#b78bff'];
        if (k < 0.7 && Math.random() < 0.9) {
            this.parts.push({
                x: Math.random() * this.W, y: this.H * 0.3 + Math.random() * this.H * 0.4,
                vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160,
                life: 0.7, max: 0.7, size: 4 + Math.random() * 5,
                color: cols[Math.floor(Math.random() * cols.length)], glow: true, grav: 60, drag: 1.5,
            });
        }
        for (const e of this.fxTargets(f)) {
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = cols[Math.floor(k * 10) % cols.length];
            ctx.beginPath(); ctx.arc(e.x, e.y - 10, e.size * (1.2 + Math.sin(k * 9) * 0.3), 0, 6.283); ctx.fill();
        }
    },

    // ---------- 粒子 / 飘字 / HUD ----------
    drawParticles(front) {
        const ctx = this.ctx;
        ctx.save();
        for (const p of this.parts) {
            const isAmb = p.amb === 1;
            if (isAmb && front) continue;
            if (!isAmb && !front) continue;
            const a = Math.max(0, p.life / p.max);
            ctx.globalAlpha = isAmb ? a * 0.5 : a;
            if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
            else ctx.shadowBlur = 0;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, 6.283); ctx.fill();
        }
        ctx.restore();
    },

    drawFloats() {
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const f of this.floats) {
            const a = Math.min(1, f.life / 0.5);
            ctx.globalAlpha = a;
            const big = !!f.big;
            ctx.font = (big ? 'bold 19px' : 'bold 14px') + ' "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
            ctx.lineWidth = big ? 4 : 3;
            ctx.strokeStyle = 'rgba(0,0,0,0.72)';
            ctx.strokeText(f.text, f.x, f.y);
            ctx.shadowColor = f.color; ctx.shadowBlur = big ? 10 : 4; // 同色辉光，更清晰
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    },

    drawHUD() {
        const ctx = this.ctx;
        ctx.save();
        // 左上：层数 / 波次（跟随内容区，宽屏时不会跑到角落）
        const hx = this.contentX + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(hx, 8, 132, 40);
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffd56b';
        ctx.fillText(`${this.ancient ? '远古 ' : ''}第 ${this.floor} 层`, hx + 8, 24);
        ctx.fillStyle = '#dfe6ff';
        ctx.font = '11px sans-serif';
        ctx.fillText(`波次 ${Math.min(this.waveIdx + 1, this.waves.length)}/${this.waves.length} · 剩 ${this.enemies.length + this.spawnQueue.length} 怪`, hx + 8, 40);

        // BOSS 血条（底部，给塔让位）
        const boss = this.enemies.find(e => e.boss);
        if (boss) {
            const bw = this.contentW - 40, bx = this.contentX + 20, by = this.H - 26;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
            const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
            g.addColorStop(0, '#ff5252'); g.addColorStop(1, '#ff9d5c');
            ctx.fillStyle = g;
            ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 10);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
            ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 9);
            ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
            ctx.fillText(`👑 ${boss.name}`, this.CX, by + 8);
        }
        ctx.restore();
    },

    drawBanner() {
        if (!this.banner) return;
        const now = performance.now();
        if (now > this.banner.until) { this.banner = null; return; }
        const ctx = this.ctx;
        const left = (this.banner.until - now) / 1000;
        const a = Math.min(1, left / 0.4);
        const y = this.banner.big ? this.H * 0.34 : this.H * 0.30;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        const size = this.banner.big ? 30 : 22;
        ctx.font = `bold ${size}px sans-serif`;
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(this.banner.text, this.CX, y);
        const g = ctx.createLinearGradient(0, y - size, 0, y + 6);
        g.addColorStop(0, '#fff');
        g.addColorStop(1, this.banner.color || '#ffd56b');
        ctx.fillStyle = g;
        ctx.fillText(this.banner.text, this.CX, y);
        if (this.banner.sub) {
            ctx.font = 'bold 13px sans-serif';
            ctx.lineWidth = 3;
            ctx.strokeText(this.banner.sub, this.CX, y + 20);
            ctx.fillStyle = '#ffe6a0';
            ctx.fillText(this.banner.sub, this.CX, y + 20);
        }
        ctx.restore();
    },
};
