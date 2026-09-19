'use strict';
// 礼品码 玩家兑换 路由：从 server.js 抽出（原 1781–1807 行）。
// 后台管理（POST /api/admin/gift/save 等）留待 admin 模块（server/routes/admin.js）。
module.exports = function registerGiftRoutes(ctx) {
    const { api, DB, sendJson, getUserByToken, save, newId } = ctx;

    // ---------------- 礼品码 ----------------
    api['POST /api/gift/redeem'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const code = String((body && body.code) || '').trim();
        if (!code) return sendJson(res, 400, { error: '请输入礼包码' });
        if (!Array.isArray(DB.giftCodes) || !DB.giftCodes.length) return sendJson(res, 400, { error: '礼包码无效' });
        const gift = DB.giftCodes.find(g => g.code && g.code.toLowerCase() === code.toLowerCase());
        if (!gift) return sendJson(res, 400, { error: '礼包码无效或已过期' });
        if (gift.enabled === false) return sendJson(res, 400, { error: '该礼包码已停用' });
        if (gift.expires && Date.now() > +new Date(gift.expires)) return sendJson(res, 400, { error: '该礼包码已过期' });
        gift.usedBy = Array.isArray(gift.usedBy) ? gift.usedBy : [];
        if (gift.usedBy.some(u => u.userId === user.id)) return sendJson(res, 400, { error: '该礼包码您已兑换过' });
        if (gift.maxUses > 0 && gift.usedBy.length >= gift.maxUses) return sendJson(res, 400, { error: '该礼包码已被领完' });

        // 通过邮件系统发放（与后台发奖保持一致，玩家可一键领取）
        const rewards = gift.rewards || {};
        const mail = {
            id: newId(), toAll: false, to: user.id, toName: user.username,
            title: '🎁 礼包码奖励 · ' + (gift.name || gift.code),
            content: gift.content || ('感谢您的支持！礼包码 ' + gift.code + ' 兑换成功。'),
            rewards, time: Date.now(), from: 'gift', claimedBy: [],
        };
        DB.mails.push(mail);
        gift.usedBy.push({ userId: user.id, username: user.username, time: Date.now() });
        save();
        sendJson(res, 200, { ok: true, mail, reward: rewards });
    };
};
