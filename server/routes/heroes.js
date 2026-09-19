'use strict';
// 英雄域路由：GET /api/heroes + 全部 POST /api/hero/*
// 从 server.js 抽出（原 1255–1602 行）。共享 helper / 常量经 routeCtx 注入，
// 仅本域使用的 4 个 helper（materialHeroUids / findOwnHero / equipInstOf / payCost）在本文件内定义。
module.exports = function registerHeroRoutes(ctx) {
    const {
        api, DB, sendJson, getUserByToken, save,
        STAR_BASE, STAR_MAX, STAR_PERKS, WISH_PITY, RES_CN, U_NUM, FORGE_MAX_LV, QUALITIES, QUALITY_NAME,
        starUpCost, starUpMaterialCost, forgeLevelCost, forgeQualityCost, equipStats, heroCombatStats,
    } = ctx;

    // ---- 仅本域使用的 helper ----
    // 找出玩家持有的材料英雄（3★/4★，且不是正在升星的本体），3★ 排前面优先被消耗
    function materialHeroUids(u, excludeUid) {
        const tplOf = id => DB.heroes.find(t => t.id === id);
        return (u.heroes || [])
            .filter(oh => oh.uid !== excludeUid)
            .map(oh => ({ uid: oh.uid, tier: (tplOf(oh.id) || {}).tier || 5, material: !!(tplOf(oh.id) || {}).material }))
            .filter(x => x.material || x.tier < 5)
            .sort((a, b) => a.tier - b.tier)
            .map(x => x.uid);
    }
    function findOwnHero(u, uid) {
        const oh = (u.heroes || []).find(x => x.uid === uid);
        if (!oh) return { err: '没有该英雄' };
        return { oh };
    }
    function equipInstOf(oh, slot) {
        const raw = oh.equip && oh.equip[slot];
        if (!raw) return null;
        // 兼容旧存档的字符串形式
        if (typeof raw === 'string') {
            const tpl = DB.equipmentTemplates.find(x => x.id === raw);
            const inst = { id: raw, lv: 1, quality: tpl ? tpl.quality : 'green' };
            oh.equip[slot] = inst;
            return inst;
        }
        return raw;
    }
    // 扣除一组消耗，不足时返回缺啥
    function payCost(u, cost) {
        for (const k of Object.keys(cost)) {
            if ((u.resources[k] || 0) < cost[k]) return `${RES_CN[k] || k}不足，需要 ${U_NUM(cost[k])}`;
        }
        for (const k of Object.keys(cost)) u.resources[k] = (u.resources[k] || 0) - cost[k];
        return null;
    }

    // ---- 英雄 ----
    api['GET /api/heroes'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        // 给每个持有的英雄附加实时战力，便于背包展示升级效果
        const owned = (u.heroes || []).map(oh => {
            const s = heroCombatStats(u, oh);
            const tpl = DB.heroes.find(t => t.id === oh.id) || {};
            return {
                ...oh,
                atk: s ? s.atk : 0, hp: s ? s.hp : 0,
                skillMulBonus: s ? s.skillMulBonus : 1,
                star: s ? s.star : STAR_BASE,
                perks: s ? s.perks : {},
                material: !!tpl.material,      // 3★/4★ 材料英雄：不能上阵，只能当升星材料
                tier: tpl.tier || 5,
            };
        });
        // 各星级升星所需材料英雄数量（供前端展示「还需 N 个材料」）
        const starMatCost = {};
        for (let s = STAR_BASE; s < STAR_MAX; s++) starMatCost[s] = starUpMaterialCost(s);
        sendJson(res, 200, {
            heroes: DB.heroes, treasures: DB.treasures, wallSkills: DB.wallSkills,
            equipmentTemplates: DB.equipmentTemplates, ringTemplates: DB.ringTemplates,
            artifactTemplates: DB.artifactTemplates, gemTemplates: DB.gemTemplates,
            events: DB.events, meta: DB._meta,
            owned, equipped: u.equipped, treasuresOwned: u.treasures, wall: u.wall,
            wishPity: u.wishPity || 0, pityMax: WISH_PITY,
            pityLeft: Math.max(0, WISH_PITY - (u.wishPity || 0)),
            starMatCost,
        });
    };

    api['POST /api/hero/levelup'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const h = u.heroes.find(x => x.uid === body.uid);
        if (!h) return sendJson(res, 400, { error: '没有该英雄' });
        const before = heroCombatStats(u, h);
        const cost = Math.floor(30 * Math.pow(1.3, (h.lv || 1) - 1));
        if ((u.resources.gold || 0) < cost) return sendJson(res, 400, { error: `金币不足，需要 ${cost}` });
        u.resources.gold -= cost;
        h.lv = (h.lv || 1) + 1;
        const after = heroCombatStats(u, h);
        save();
        sendJson(res, 200, {
            ok: true,
            hero: { uid: h.uid, lv: h.lv, atk: after.atk, hp: after.hp },
            gain: { atk: after.atk - before.atk, hp: after.hp - before.hp },
            cost,
            state: u,
        });
    };

    api['POST /api/hero/starup'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const h = u.heroes.find(x => x.uid === body.uid);
        if (!h) return sendJson(res, 400, { error: '没有该英雄' });
        h.star = (typeof h.star === 'number' && h.star >= STAR_BASE) ? h.star : STAR_BASE;
        if (h.star >= STAR_MAX) return sendJson(res, 400, { error: `已达星级上限（${STAR_MAX}星）` });
        const cost = starUpCost(h.star);
        for (const k of Object.keys(cost)) {
            const pool = k === 'gems' ? (u.resources.gems || 0) : (u.resources[k] || 0);
            if (pool < cost[k]) return sendJson(res, 400, { error: `${RES_CN[k]}不足，需要 ${U_NUM(cost[k])}` });
        }
        // 材料英雄消耗：需求不足时拒绝，并告知还差几个
        const needMat = starUpMaterialCost(h.star);
        if (needMat > 0 && !body.ignoreMaterial) {
            const matUids = materialHeroUids(u, h.uid);
            if (matUids.length < needMat) {
                return sendJson(res, 400, {
                    error: `升星材料不足，需要 ${needMat} 个 3★/4★ 材料英雄（当前 ${matUids.length} 个，去许愿获取）`,
                });
            }
            // 优先消耗低阶（3★）材料，再消耗 4★
            const used = matUids.slice(0, needMat);
            const usedSet = new Set(used);
            u.heroes = u.heroes.filter(x => !usedSet.has(x.uid));
        }
        for (const k of Object.keys(cost)) u.resources[k] = (u.resources[k] || 0) - cost[k];
        h.star += 1;
        save();
        const unlocked = STAR_PERKS.find(p => p.star === h.star) || null;
        sendJson(res, 200, {
            ok: true,
            hero: { uid: h.uid, star: h.star, atk: (heroCombatStats(u, h) || {}).atk, hp: (heroCombatStats(u, h) || {}).hp },
            cost, materialUsed: needMat, unlocked, state: u,
        });
    };

    // ---- 英雄上阵 / 下阵（队伍最多 5 个）----
    api['POST /api/hero/equip'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        if (u.equipped.length >= 5 && !u.equipped.includes(body.uid)) return sendJson(res, 400, { error: '上阵最多 5 个英雄' });
        if (u.equipped.includes(body.uid)) return sendJson(res, 400, { error: '已在队伍中' });
        u.equipped.push(body.uid);
        save();
        sendJson(res, 200, { ok: true, state: u });
    };
    api['POST /api/hero/unequip'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        u.equipped = u.equipped.filter(x => x !== body.uid);
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    // ---- 英雄装备（4 个槽位）----
    api['POST /api/hero/equip-item'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid, slot, itemId } = body;
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        const oh = f.oh;
        const tpl = DB.equipmentTemplates.find(x => x.id === itemId);
        if (!tpl) return sendJson(res, 400, { error: '装备不存在' });
        if (tpl.slot !== slot) return sendJson(res, 400, { error: '槽位不匹配' });
        oh.equip = oh.equip || {};
        // 老装备可能是字符串（旧存档），统一升级为可锻造实例
        const old = oh.equip[slot];
        if (old && typeof old === 'object' && old.id === itemId) {
            // 重复穿戴同一件：保留锻造进度
        } else {
            oh.equip[slot] = { id: itemId, lv: 1, quality: tpl.quality };
        }
        save();
        sendJson(res, 200, { ok: true, state: u });
    };
    api['POST /api/hero/unequip-item'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid, slot } = body;
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        const oh = f.oh;
        if (oh.equip) delete oh.equip[slot];
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    // ---- 戒指（每个英雄 1 个）----
    api['POST /api/hero/equip-ring'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid, ringId } = body;
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        const oh = f.oh;
        const r = DB.ringTemplates.find(x => x.id === ringId);
        if (!r) return sendJson(res, 400, { error: '戒指不存在' });
        oh.ring = ringId;
        save();
        sendJson(res, 200, { ok: true, state: u });
    };
    api['POST /api/hero/unequip-ring'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid } = body;
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        delete f.oh.ring;
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    // ---- 神器（每个英雄 1 个，可升级、可升星）----
    api['POST /api/hero/equip-artifact'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid, artifactId } = body;
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        const oh = f.oh;
        const a = DB.artifactTemplates.find(x => x.id === artifactId);
        if (!a) return sendJson(res, 400, { error: '神器不存在' });
        oh.artifact = oh.artifact && oh.artifact.id === artifactId
            ? oh.artifact
            : { id: artifactId, lv: 1, star: 0 };
        save();
        sendJson(res, 200, { ok: true, state: u });
    };
    api['POST /api/hero/artifact-levelup'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid, cost } = body;
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        const oh = f.oh;
        if (!oh.artifact) return sendJson(res, 400, { error: '请先装备神器' });
        const tpl = DB.artifactTemplates.find(x => x.id === oh.artifact.id);
        if (!tpl) return sendJson(res, 400, { error: '神器模板不存在' });
        if ((oh.artifact.lv || 1) >= tpl.maxLevel) return sendJson(res, 400, { error: '已达等级上限' });
        const use = (typeof cost === 'number') ? cost : 100;
        if ((u.resources.gold || 0) < use) return sendJson(res, 400, { error: `金币不足，需要 ${use}` });
        u.resources.gold -= use;
        oh.artifact.lv = (oh.artifact.lv || 1) + 1;
        save();
        sendJson(res, 200, { ok: true, artifact: oh.artifact, state: u });
    };
    api['POST /api/hero/artifact-starup'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid, cost } = body;
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        const oh = f.oh;
        if (!oh.artifact) return sendJson(res, 400, { error: '请先装备神器' });
        const tpl = DB.artifactTemplates.find(x => x.id === oh.artifact.id);
        if (!tpl) return sendJson(res, 400, { error: '神器模板不存在' });
        if ((oh.artifact.star || 0) >= tpl.maxStar) return sendJson(res, 400, { error: '已达星级上限' });
        const use = (typeof cost === 'number') ? cost : 1;
        if ((u.resources.gems || 0) < use) return sendJson(res, 400, { error: `钻石不足，需要 ${use}` });
        u.resources.gems -= use;
        oh.artifact.star = (oh.artifact.star || 0) + 1;
        save();
        sendJson(res, 200, { ok: true, artifact: oh.artifact, state: u });
    };
    api['POST /api/hero/unequip-artifact'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid } = body;
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        delete f.oh.artifact;
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    // ---- 宝石（每个英雄 4 个槽位）----
    api['POST /api/hero/set-gem'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid, slot, gemId } = body;
        if (slot < 0 || slot > 3) return sendJson(res, 400, { error: '槽位 0-3' });
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        const oh = f.oh;
        if (gemId === null || gemId === undefined || gemId === '') {
            oh.gems = oh.gems || {};
            delete oh.gems[slot];
            save();
            return sendJson(res, 200, { ok: true, state: u });
        }
        const g = DB.gemTemplates.find(x => x.id === gemId);
        if (!g) return sendJson(res, 400, { error: '宝石不存在' });
        oh.gems = oh.gems || {};
        oh.gems[slot] = gemId;
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    // ---- 装备锻造：升级（每级 +8% 属性）与升品（绿→蓝→紫→橙→红→金→彩）----
    api['POST /api/hero/forge-levelup'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid, slot } = body;
        const times = Math.min(10, Math.max(1, parseInt(body.times) || 1)); // 一次最多连点 10 级
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        const oh = f.oh;
        const inst = equipInstOf(oh, slot);
        if (!inst) return sendJson(res, 400, { error: '该槽位没有装备' });
        const tpl = DB.equipmentTemplates.find(x => x.id === inst.id);
        if (!tpl) return sendJson(res, 400, { error: '装备模板不存在' });
        let done = 0, total = { gold: 0, iron: 0 };
        for (let i = 0; i < times; i++) {
            if ((inst.lv || 1) >= FORGE_MAX_LV) break;
            const c = forgeLevelCost(inst.lv || 1, inst.quality || tpl.quality);
            const err = payCost(u, c);
            if (err) { if (!done) return sendJson(res, 400, { error: err }); break; }
            total.gold += c.gold; total.iron += c.iron;
            inst.lv = (inst.lv || 1) + 1;
            done++;
        }
        if (!done) return sendJson(res, 400, { error: '已达锻造等级上限' });
        save();
        const st = equipStats(inst, tpl);
        sendJson(res, 200, { ok: true, levels: done, equip: inst, cost: total, stats: st, state: u });
    };
    api['POST /api/hero/forge-qualityup'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const { uid, slot } = body;
        const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
        const oh = f.oh;
        const inst = equipInstOf(oh, slot);
        if (!inst) return sendJson(res, 400, { error: '该槽位没有装备' });
        const tpl = DB.equipmentTemplates.find(x => x.id === inst.id);
        if (!tpl) return sendJson(res, 400, { error: '装备模板不存在' });
        const q = inst.quality || tpl.quality;
        const cost = forgeQualityCost(q);
        if (!cost) return sendJson(res, 400, { error: '已是最高品质（神话）' });
        const err = payCost(u, cost);
        if (err) return sendJson(res, 400, { error: err });
        inst.quality = QUALITIES[QUALITIES.indexOf(q) + 1];
        save();
        const st = equipStats(inst, tpl);
        sendJson(res, 200, {
            ok: true, equip: inst, cost, stats: st,
            qualityName: QUALITY_NAME[inst.quality], state: u,
        });
    };
};
