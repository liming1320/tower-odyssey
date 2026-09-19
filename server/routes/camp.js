'use strict';
// 营地 / 建筑 / 助战城墙 / 古宝：从 server.js 拆出的独立路由模块。
// 通过 ctx 注入共享依赖（api 路由表、DB、鉴权、存档、营地相关 helper 与配置），行为不变。
module.exports = function registerCampRoutes(ctx) {
    const {
        api, DB, sendJson, getUserByToken, save,
        BUILD_DEFS, OFFLINE_CAP_SEC,
        productionRates, gainOf, applyProduction, buildingCost, canAfford, missingRes,
    } = ctx;

    api['GET /api/camp'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const now = Date.now();
        const { perMin, bonus } = productionRates(u);
        const pendingSec = Math.min(Math.max(0, (now - (u.lastTick || now)) / 1000), OFFLINE_CAP_SEC);
        const pending = gainOf(perMin, pendingSec);

        const defs = BUILD_DEFS.map(d => {
            const lv = u.buildings[d.key] || 0;
            const cost = buildingCost(d.key, lv + 1);
            const round1 = v => Math.round(v * 10) / 10;
            const cur = {}, next = {};
            for (const k of Object.keys(d.out)) {
                cur[k] = round1(d.out[k] * lv * bonus);
                next[k] = round1(d.out[k] * (lv + 1) * bonus);
            }
            return {
                ...d, lv, cost, cur, next,
                nextBonus: d.bonus ? round1((lv + 1) * d.bonus) : 0,
                curBonus: d.bonus ? round1(lv * d.bonus) : 0,
                affordable: canAfford(u, cost),
                missing: canAfford(u, cost) ? [] : missingRes(u, cost),
            };
        });

        sendJson(res, 200, {
            defs, perMin, bonus,
            pendingSec: Math.floor(pendingSec),
            pending: Object.fromEntries(Object.keys(pending).map(k => [k, Math.floor(pending[k])])),
            resources: u.resources,
            offlineCapHours: OFFLINE_CAP_SEC / 3600,
        });
    };

    // 手动领取挂机收益（不领也会每 5 秒自动入账，这里只是立刻结算）
    api['POST /api/camp/collect'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const r = applyProduction(u, Date.now());
        if (!r) return sendJson(res, 400, { error: '暂无可领取的收益' });
        const gains = {};
        for (const k of Object.keys(r.gains)) gains[k] = Math.floor(r.gains[k]);
        save();
        sendJson(res, 200, { ok: true, seconds: Math.floor(r.seconds), gains, state: u });
    };

    api['POST /api/building/upgrade'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const which = body.which;
        if (!BUILD_DEFS.some(d => d.key === which)) return sendJson(res, 400, { error: '建筑不存在' });
        const u = user.state;
        const lv = (u.buildings[which] || 0) + 1;
        const costs = buildingCost(which, lv);
        if (!canAfford(u, costs)) return sendJson(res, 400, { error: '资源不足：' + missingRes(u, costs).join('、'), need: costs });
        for (const k of Object.keys(costs)) u.resources[k] -= costs[k];
        u.buildings[which] = lv;
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    // ---- 助战 ----
    api['POST /api/wall/upgrade'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const next = (u.wall.lv || 1) + 1;
        const skill = DB.wallSkills.find(s => s.lv === next);
        if (!skill) return sendJson(res, 400, { error: '城墙已满级' });
        const cost = { wood: 200 * next, iron: 200 * next, stone: 200 * next };
        for (const k of Object.keys(cost)) {
            if ((u.resources[k] || 0) < cost[k]) return sendJson(res, 400, { error: '资源不足' });
        }
        for (const k of Object.keys(cost)) u.resources[k] -= cost[k];
        u.wall.lv = next;
        u.wall.name = skill.name;
        u.wall.atkPct = skill.atkPct;
        u.wall.hpPct = skill.hpPct;
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    api['POST /api/treasure/equip'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        if (!u.treasures.includes(body.id)) return sendJson(res, 400, { error: '未拥有该古宝' });
        const idx = u.treasures.indexOf(body.id);
        u.treasures.splice(idx, 1);
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    api['POST /api/treasure/unequip'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        u.treasures.push(body.id);
        save();
        sendJson(res, 200, { ok: true, state: u });
    };
};
