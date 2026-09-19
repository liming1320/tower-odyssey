'use strict';
// 活动 / 许愿 / 许愿卡商城 域路由：从 server.js 抽出（原 1266–1414 行）。
// eventState / drawOneHero 为域内私有 helper，随块搬入本文件。
// todayKey 为 server.js 共享 helper（登录也用），经 ctx 注入；WISH_PITY/WISH_RATE/STAR_BASE 来自 server/config，
// WISH_CARD_PRICE 为 server.js 顶层常量，均经 ctx 注入。
module.exports = function registerEventRoutes(ctx) {
    const {
        api, DB, sendJson, getUserByToken, save, newId, todayKey,
        WISH_PITY, WISH_RATE, STAR_BASE, WISH_CARD_PRICE,
    } = ctx;

    // 活动状态计算：done=已领/不可领，ready=可领，locked=条件未满足（如累计登录天数不够）
    function eventState(u, e) {
        const claimed = (u.claimedEvents || {})[e.id];
        const today = todayKey();
        const repeat = e.repeat || e.type || 'once';
        if (repeat === 'daily') {
            if (claimed === today) return { state: 'done', label: '今日已领' };
            return { state: 'ready', label: '领取' };
        }
        if (repeat === 'login') {
            const need = parseInt(e.needDays || '7');
            if ((u.loginDays || 0) < need) return { state: 'locked', label: `登录 ${u.loginDays || 0}/${need} 天` };
            if (claimed) return { state: 'done', label: '已领取' };
            return { state: 'ready', label: '领取' };
        }
        // once / limited
        if (claimed) return { state: 'done', label: '已领取' };
        return { state: 'ready', label: '领取' };
    }

    api['GET /api/events'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const now = Date.now();
        const list = (DB.events || [])
            .filter(e => {
                if (e.active === false) return false;
                if (e.startTime && e.endTime && (now < e.startTime || now > e.endTime)) return false;
                return true;
            })
            .map(e => {
                const s = eventState(u, e);
                return { ...e, ...s, loginDays: u.loginDays || 0 };
            });
        sendJson(res, 200, {
            events: list,
            loginDays: u.loginDays || 0,
            readyCount: list.filter(e => e.state === 'ready').length,
        });
    };
    api['POST /api/event/claim'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const e = (DB.events || []).find(x => x.id === body.id);
        if (!e) return sendJson(res, 400, { error: '活动不存在' });
        if (e.active === false) return sendJson(res, 400, { error: '活动已停用' });
        const s = eventState(u, e);
        if (s.state !== 'ready') return sendJson(res, 400, { error: s.state === 'done' ? '已领取过' : '条件未满足' });
        u.claimedEvents = u.claimedEvents || {};
        u.claimedEvents[e.id] = (e.repeat === 'daily') ? todayKey() : true;
        const rewards = e.rewards || {};
        for (const k of Object.keys(rewards)) {
            if (k === 'wishCards') u.wishCards = (u.wishCards || 0) + rewards[k];
            else u.resources[k] = (u.resources[k] || 0) + rewards[k];
        }
        save();
        sendJson(res, 200, { ok: true, rewards, state: u });
    };

    // ---- 许愿（支持 1 连 / 10 连）----
    // 每次抽取必定产出 1 个英雄条目，重复获得不再自动升级（升级只在英雄页手动进行）
    function drawOneHero(u) {
        // 保底：累计 WISH_PITY 抽未出 5★ 时，本抽强制出 5★
        u.wishPity = (u.wishPity || 0) + 1;
        const pityHit = u.wishPity >= WISH_PITY;
        let tier;
        if (pityHit) {
            tier = 5;
        } else {
            const roll = Math.random();
            tier = (WISH_RATE.find(x => roll < x.p) || WISH_RATE[WISH_RATE.length - 1]).tier;
        }
        // 按档位取池子；该档为空时依次回退到 5★ → 全部英雄
        let pool = DB.heroes.filter(h => (h.tier || 5) === tier);
        if (!pool.length) pool = DB.heroes.filter(h => (h.tier || 5) === 5);
        if (!pool.length) pool = DB.heroes;
        const t = pool[Math.floor(Math.random() * pool.length)];
        if (!t) throw new Error('英雄表为空，后台未配置英雄');
        // 出 5★ 即重置保底计数（无论是自然出货还是保底触发）
        if ((t.tier || 5) === 5) u.wishPity = 0;
        const oh = { uid: newId(), id: t.id, lv: 1, exp: 0, star: STAR_BASE };
        u.heroes.push(oh);
        // 50% 概率掉落古宝
        let treasure = null;
        if (DB.treasures.length && Math.random() < 0.5) {
            treasure = DB.treasures[Math.floor(Math.random() * DB.treasures.length)];
            if (!u.treasures.includes(treasure.id)) u.treasures.push(treasure.id);
        }
        return { oh, template: t, treasure, pity: (t.tier || 5) === 5 && pityHit };
    }

    api['POST /api/wish'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const want = parseInt(body.count);
        const count = [1, 5, 10].includes(want) ? want : 1;
        if ((u.wishCards || 0) < count) {
            return sendJson(res, 400, { error: `许愿卡不足，需要 ${count} 张（当前 ${u.wishCards || 0} 张）` });
        }
        u.wishCards -= count;

        const results = [];
        try {
            for (let i = 0; i < count; i++) results.push(drawOneHero(u));
        } catch (e) {
            return sendJson(res, 500, { error: e.message });
        }
        save();
        sendJson(res, 200, {
            ok: true, count,
            items: results.map(r => ({ hero: r.oh, template: r.template, treasure: r.treasure, pity: r.pity })),
            wishPity: u.wishPity || 0,          // 已累计未出 5★ 的抽数
            pityMax: WISH_PITY,                  // 保底阈值（20 抽必出 5★）
            pityLeft: Math.max(0, WISH_PITY - (u.wishPity || 0)), // 距保底还剩几抽
            state: u,
        });
    };

    api['POST /api/wish/reward'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        // 每日奖励：每个自然日限领 1 次
        const today = new Date().toDateString();
        if (u.lastWishRewardDay === today) {
            return sendJson(res, 400, { error: '今日已领取，明天再来' });
        }
        u.lastWishRewardDay = today;
        u.wishCards = (u.wishCards || 0) + 3;
        save();
        sendJson(res, 200, { ok: true, state: u });
    };

    // ---- 商城：钻石购买许愿卡（100 钻石 / 张）----
    api['POST /api/shop/buy-wish'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const count = [1, 10, 100].includes(parseInt(body.count)) ? parseInt(body.count) : 1;
        const cost = count * WISH_CARD_PRICE;
        if ((u.resources.gems || 0) < cost) {
            return sendJson(res, 400, { error: `钻石不足，需要 ${cost}（当前 ${Math.floor(u.resources.gems || 0)}）` });
        }
        u.resources.gems -= cost;
        u.wishCards = (u.wishCards || 0) + count;
        save();
        sendJson(res, 200, { ok: true, count, cost, state: u });
    };
};
