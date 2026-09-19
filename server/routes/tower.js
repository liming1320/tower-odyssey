'use strict';
// 冒险塔 / 世界 域路由：tower/info/level/clear/start/choice/finish + world/world/gather
// 从 server.js 抽出（原 1483–1837 行）。
// 共享 helper：heroCombatStats 留在 server.js（英雄域也用）经 ctx 注入；
// chapterOf/bossForFloor/floorHpScale/floorAtkScale/mulberry32/enemyPoolFor 留在 server.js 经 ctx 注入；
// buildBattleHeroes/getWallInfo 原在 tower 块内、随块搬入本文件。
const url = require('url');
module.exports = function registerTowerRoutes(ctx) {
    const {
        api, DB, sendJson, getUserByToken, save,
        MAX_FLOOR, CHAPTERS, ROGUE_BUFFS, heroCombatStats,
        chapterOf, bossForFloor, floorHpScale, floorAtkScale, mulberry32, enemyPoolFor,
    } = ctx;

    // 构造参战英雄数据（含城墙 / 古宝 / 装备 / 戒指 / 神器 / 宝石加成）
    function buildBattleHeroes(u) {
        const out = [];
        for (const uid of (u.equipped || [])) {
            const oh = (u.heroes || []).find(x => x.uid === uid);
            if (!oh) continue;
            const t = DB.heroes.find(h => h.id === oh.id);
            if (!t) continue;
            const s = heroCombatStats(u, oh);
            if (!s) continue;
            // 多技能：主技能 + 副技能 + 觉醒技，兼容只有单个 skill 的老模板
            const rawSkills = (Array.isArray(t.skills) && t.skills.length) ? t.skills : [t.skill];
            const skills = rawSkills.filter(Boolean).map((sk, i) => ({
                name: sk.name || '技能',
                desc: sk.desc || '',
                cd: Math.max(1, sk.cd || 5),
                multiplier: sk.multiplier || 0,
                fx: sk.fx || 'slash',
                tint: sk.tint || '#ffd56b',
                // 技能伤害倍率 ×(1 + 星级/神器加成)
                mul: (sk.multiplier || 0) * (s.skillMulBonus || 1),
                slot: i,
            }));
            // 必杀：觉醒技（第 3 个技能）优先，否则由主技能派生（倍率 ×2.5）
            const ultSrc = rawSkills[2] || rawSkills[0] || {};
            const ultBoost = rawSkills[2] ? 1.6 : 2.5;
            const ultMult = (ultSrc.multiplier || 1) * ultBoost;
            const ult = {
                name: rawSkills[2] ? (ultSrc.name || '觉醒技') : ('必杀·' + (ultSrc.name || '斩击')),
                desc: ultSrc.desc || '倾尽全力的一击',
                cd: rawSkills[2] ? Math.max(12, Math.round((ultSrc.cd || 8) * 1.5)) : 12,
                multiplier: ultMult,
                mul: ultMult * (s.skillMulBonus || 1),
                fx: ultSrc.fx || 'ult',
                tint: ultSrc.tint || '#ff7adf',
            };
            out.push({
                uid: oh.uid, name: t.name, img: t.img, rarity: t.rarity, element: t.element,
                lv: oh.lv, star: s.star, atk: s.atk, hp: s.hp, maxHp: s.hp,
                perks: s.perks || {},
                ult,
                skills,
                // 兼容旧前端：仍保留 skill 字段（取第一个）
                skill: {
                    name: (rawSkills[0] || {}).name || '技能',
                    desc: (rawSkills[0] || {}).desc || '',
                    cd: (rawSkills[0] || {}).cd || 5,
                    multiplier: (rawSkills[0] || {}).multiplier || 0,
                    fx: (rawSkills[0] || {}).fx || 'slash',
                    tint: (rawSkills[0] || {}).tint || '#ffd56b',
                    mulBonus: s.skillMulBonus || 1,
                },
            });
        }
        return out;
    }

    // 玩家当前城墙（含该等级专属技能），供战斗 UI 释放城墙技
    function getWallInfo(u) {
        const lv = Math.max(1, (u.wall && u.wall.lv) || 1);
        let cur = (DB.wallSkills || [])[0] || { lv: 1, name: '青石墙', atkPct: 0, hpPct: 0 };
        for (const w of (DB.wallSkills || [])) if (w.lv <= lv) cur = w;
        return { lv, name: cur.name, atkPct: cur.atkPct || 0, hpPct: cur.hpPct || 0, skill: cur.skill || null };
    }

    api['GET /api/tower/info'] = (req, res) => {
        sendJson(res, 200, {
            maxFloor: MAX_FLOOR,
            chapters: CHAPTERS.map(c => ({ name: c.name, emoji: c.emoji, from: c.from, to: c.to })),
            bossFloors: Math.floor(MAX_FLOOR / 5),
        });
    };

    // 生成一场战斗的完整关卡数据（1 ~ MAX_FLOOR 层）
    api['GET /api/tower/level'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const q = url.parse(req.url, true).query;
        const floor = Math.min(MAX_FLOOR, Math.max(1, parseInt(q.floor || '1') || 1));
        const ancient = q.ancient === '1';
        const mul = ancient ? 3 : 1;

        const heroesData = buildBattleHeroes(user.state);
        if (!heroesData.length) return sendJson(res, 400, { error: '请先到「冒险」上阵英雄' });
        const teamAtk = Math.max(1, heroesData.reduce((s, h) => s + h.atk, 0));
        const teamHp = Math.max(1, heroesData.reduce((s, h) => s + h.maxHp, 0));
        const avgHeroHp = Math.max(1, teamHp / heroesData.length);

        const chapter = chapterOf(floor);
        const pool = enemyPoolFor(floor);
        const rng = mulberry32(floor * 104729 + (ancient ? 7 : 0));
        const hpS = floorHpScale(floor) * mul;
        const atkS = floorAtkScale(floor) * mul;

        // 保底机制：队伍变强后小怪不能刚出场就被秒杀，所以血量/攻击同时与队伍强度挂钩。
        // 保底系数本身也随层数递增（小怪撑住的秒数随层数缓慢上升），
        // 这样即使玩家练度很高，每一层的怪物强度依然肉眼可见地在增加。

        // ---- 波次结构：每关固定 20 波，最后一波必定是 BOSS ----
        const WAVES_PER_FLOOR = 20;
        // 每波小怪数：4 只起步，随层数到 10 只封顶（画面上「小而多」的怪潮感）
        const perWave = Math.min(4 + Math.floor(floor / 4), 10);
        // 平衡归一化：旧版一关 9~64 只小怪，现在 80~200 只。
        // 按总量比例压低单只的血/攻，让一关的总承伤、总耗时与旧版大致相当。
        const oldWaves = Math.min(3 + Math.floor(floor / 3), 8);
        const oldCnt = Math.min(3 + Math.floor(floor / 8), 8);
        const countNorm = Math.max(0.22, Math.min(1, (oldWaves * oldCnt) / (WAVES_PER_FLOOR * perWave)));
        const mobHpBase = Math.floor(Math.max(520 * hpS, teamAtk * (1.8 + 0.06 * (floor - 1))) * countNorm);
        const bossHpBase = Math.max(520 * hpS, teamAtk * (14 + 0.5 * (floor - 1)) / 12);
        const mobAtkBase = Math.floor(Math.max(42 * atkS, avgHeroHp * (0.05 + 0.0006 * (floor - 1))) * countNorm);
        const bossAtkBase = Math.max(42 * atkS, avgHeroHp * (0.065 + 0.0008 * (floor - 1)));

        const waveCount = WAVES_PER_FLOOR;
        const waves = [];
        let bossInfo = null;

        for (let w = 0; w < waveCount; w++) {
            const isBossWave = w === waveCount - 1; // 第 20 波固定 BOSS
            const enemies = [];
            if (isBossWave) {
                const { bt, tier, name } = bossForFloor(floor);
                const tierMul = 1 + 0.25 * tier;
                const hp = Math.floor(bossHpBase * bt.hpMul * tierMul);
                const atk = Math.floor(bossAtkBase * bt.atkMul * tierMul);
                enemies.push({
                    name, emoji: bt.emoji, hp, maxHp: hp, atk,
                    speed: bt.speed, boss: true, elite: false, skill: bt.skill, tier,
                    shape: bt.shape, body: bt.body, accent: bt.accent,
                });
                bossInfo = { name, tier, skill: bt.skill, emoji: bt.emoji };
                // Boss 亲卫：中后期带着小怪一起上，与纯小怪波明显区分
                const guards = Math.min(1 + Math.floor(floor / 25), 4);
                for (let g = 0; g < guards; g++) {
                    const t = pool[Math.floor(rng() * pool.length)];
                    const ghp = Math.floor(mobHpBase * t.hpMul * 1.6);
                    const gatk = Math.floor(mobAtkBase * t.atkMul * 1.3);
                    enemies.push({
                        name: '亲卫·' + t.name, emoji: t.emoji, hp: ghp, maxHp: ghp, atk: gatk,
                        speed: t.speed, boss: false, elite: false, guard: true,
                        shape: t.shape, body: t.body, accent: t.accent,
                    });
                }
            } else {
                // 精英怪：第 5 / 10 / 15 波（0 起点即 w=4/9/14），越往后精英越多
                const eliteCount = (w % 5 === 4) ? (floor >= 10 ? 2 : 1) : 0;
                for (let i = 0; i < perWave; i++) {
                    const t = pool[Math.floor(rng() * pool.length)];
                    const elite = i < eliteCount;
                    const eMul = elite ? 2.5 : 1;
                    const hp = Math.floor(mobHpBase * t.hpMul * eMul);
                    const atk = Math.floor(mobAtkBase * t.atkMul * (elite ? 1.8 : 1));
                    enemies.push({
                        name: (elite ? '精英·' : '') + t.name, emoji: t.emoji,
                        hp, maxHp: hp, atk, speed: t.speed, boss: false, elite,
                        shape: t.shape, body: t.body, accent: t.accent,
                    });
                }
            }
            waves.push({ enemies });
        }

        const theme = ancient ? null : {
            name: chapter.name, emoji: chapter.emoji,
            sky: chapter.sky, mount: chapter.mount, path: chapter.path,
            ground: chapter.ground, tower: chapter.tower,
        };

        sendJson(res, 200, {
            floor, ancient, waves, isBossFloor: true, boss: bossInfo,
            heroes: heroesData,
            wall: getWallInfo(user.state),    // 城墙等级 + 专属技能（战斗中可释放）
            buffPool: ROGUE_BUFFS,
            maxFloor: MAX_FLOOR,
            chapter: { name: chapter.name, emoji: chapter.emoji, from: chapter.from, to: chapter.to, index: CHAPTERS.indexOf(chapter) + 1, total: CHAPTERS.length },
            theme,
            // 推荐战力（仅作提示，不强制）；base* 为该层 1.0 系数小怪的真实数值
            power: {
                teamAtk, teamHp,
                baseMobHp: Math.floor(mobHpBase),
                baseMobAtk: Math.floor(mobAtkBase),
                needAtk: Math.floor(mobHpBase / 1.6),
                needHp: Math.floor(mobAtkBase * 30),
            },
        });
    };

    // 通关结算
    api['POST /api/tower/clear'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const floor = Math.min(MAX_FLOOR, Math.max(1, parseInt(body.floor || '1') || 1));
        const ancient = !!body.ancient;
        const mul = ancient ? 3 : 1;
        const reached = ancient ? (u.ancient.maxFloor || 0) : (u.tower.maxFloor || 0);
        const first = floor > reached;                       // 首次通关该层
        const fb = first ? 2 : 1;                            // 首通资源翻倍
        const rewards = {
            gold: Math.floor(60 * floor * mul * fb),
            wood: Math.floor(40 * floor * mul * fb),
            iron: Math.floor(30 * floor * mul * fb),
            stone: Math.floor(20 * floor * mul * fb),
            exp: Math.floor(50 * floor * mul * fb),
        };
        if (first) rewards.gems = (20 + Math.floor(floor / 5) * 10) * mul; // 首通送钻石
        if (floor % 5 === 0) rewards.wishCards = ancient ? 3 : 1;
        for (const k of Object.keys(rewards)) {
            if (k === 'wishCards') u.wishCards = (u.wishCards || 0) + rewards[k];
            else u.resources[k] = (u.resources[k] || 0) + rewards[k];
        }
        if (ancient) {
            if (floor > (u.ancient.maxFloor || 0)) u.ancient.maxFloor = floor;
        } else {
            if (floor > (u.tower.maxFloor || 0)) u.tower.maxFloor = floor;
        }
        save();
        sendJson(res, 200, { ok: true, rewards, first, state: u });
    };

    // 兼容旧版前端（浏览器可能仍缓存着调用旧接口的 JS），转发到新接口
    api['POST /api/tower/start'] = api['GET /api/tower/level'];
    api['POST /api/tower/choice'] = (req, res) => sendJson(res, 200, { ok: true, deprecated: true });

    api['POST /api/tower/finish'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const rewards = body.rewards || {};
        const isAncient = !!body.ancient;
        for (const k of Object.keys(rewards)) {
            u.resources[k] = (u.resources[k] || 0) + rewards[k];
        }
        if (isAncient) {
            if (body.floor > (u.ancient.maxFloor || 0)) u.ancient.maxFloor = body.floor;
        } else {
            if (body.floor > (u.tower.maxFloor || 0)) u.tower.maxFloor = body.floor;
        }
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    // ---- 世界 ----
    api['GET /api/world'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const nodes = [];
        for (let i = 0; i < 12; i++) {
            const lv = Math.floor(Math.random() * 30) + 1;
            nodes.push({
                id: 'n' + i,
                lv,
                type: ['mine', 'battle', 'camp', 'elite'][i % 4],
                pos: { x: (i % 4) * 25 + 10, y: Math.floor(i / 4) * 30 + 20 },
            });
        }
        sendJson(res, 200, { world: { nodes, lv: user.state.tower.maxFloor }, state: user.state });
    };

    api['POST /api/world/gather'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const gains = { wood: 50, iron: 30, stone: 30, exp: 20 };
        for (const k of Object.keys(gains)) u.resources[k] = (u.resources[k] || 0) + gains[k];
        save();
        sendJson(res, 200, { ok: true, gains, state: u });
    };
};
