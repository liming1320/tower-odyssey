'use strict';
// 部落 / 聊天 / 邮件 / 昵称设置 域路由：从 server.js 抽出（原 1428–1544 行）。
// displayName / validNickname / newDisplayId 为 server.js 共享 helper（注册/登录/后台也用），经 ctx 注入。
const url = require('url');
module.exports = function registerClanRoutes(ctx) {
    const {
        api, DB, sendJson, getUserByToken, save, newId,
        displayName, validNickname, newDisplayId,
    } = ctx;

    api['GET /api/clans'] = (req, res) => {
        const list = Object.values(DB.clans).map(c => ({ id: c.id, name: c.name, members: c.members.length, leader: c.leaderName }));
        sendJson(res, 200, { clans: list });
    };

    api['POST /api/clan/create'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        if (user.state.clanId) return sendJson(res, 400, { error: '已在部落中' });
        const id = newId();
        DB.clans[id] = { id, name: body.name, leaderId: user.id, leaderName: user.username, members: [user.id], createdAt: Date.now(), chat: [] };
        user.state.clanId = id;
        save();
        sendJson(res, 200, { ok: true, clan: DB.clans[id] });
    };

    api['POST /api/clan/join'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        if (user.state.clanId) return sendJson(res, 400, { error: '已在部落中' });
        const c = DB.clans[body.id];
        if (!c) return sendJson(res, 400, { error: '部落不存在' });
        c.members.push(user.id);
        user.state.clanId = c.id;
        save();
        sendJson(res, 200, { ok: true, clan: c });
    };

    api['GET /api/clan/mine'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const cid = user.state.clanId;
        if (!cid) return sendJson(res, 400, { error: '未加入部落' });
        const c = DB.clans[cid];
        sendJson(res, 200, {
            clan: c,
            memberDetails: c.members.map(id => {
                const u = DB.users[id];
                if (!u) return null;
                return {
                    id,
                    username: u.username,
                    nickname: displayName(u),
                    displayId: u.displayId || '',
                    lv: u.state && u.state.tower ? u.state.tower.maxFloor : 1,
                };
            }).filter(Boolean),
        });
    };

    // 修改昵称（对外展示用，登录名不变）
    api['POST /api/user/set-nickname'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const bad = validNickname(body.nickname);
        if (bad) return sendJson(res, 400, { error: bad });
        const nick = String(body.nickname).trim();
        const dup = Object.values(DB.users).find(u => u.id !== user.id && (u.nickname || u.username) === nick);
        if (dup) return sendJson(res, 400, { error: '该昵称已被占用' });
        user.nickname = nick;
        if (!user.displayId) user.displayId = newDisplayId();
        if (user.state) user.state.nickname = nick;
        save();
        sendJson(res, 200, { ok: true, nickname: user.nickname, displayId: user.displayId });
    };

    // ---- 聊天 ----
    api['GET /api/chat'] = (req, res) => {
        const since = parseInt(url.parse(req.url, true).query.since || '0');
        const list = DB.chat.filter(m => m.time > since).slice(-100);
        sendJson(res, 200, { messages: list, now: Date.now() });
    };

    api['POST /api/chat/send'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        if (!body.text || body.text.length > 100) return sendJson(res, 400, { error: '内容不合法' });
        const msg = {
            user: displayName(user),          // 对外显示昵称
            uid: user.id,
            displayId: user.displayId || '',
            text: String(body.text).slice(0, 100),
            time: Date.now(),
            isAdmin: user.isAdmin,
        };
        DB.chat.push(msg);
        if (DB.chat.length > 500) DB.chat = DB.chat.slice(-500);
        save();
        sendJson(res, 200, { ok: true, msg });
    };

    // ---- 邮件 ----
    api['GET /api/mail'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const list = DB.mails.filter(m => m.toAll || m.to === user.id);
        sendJson(res, 200, { mails: list });
    };

    api['POST /api/mail/claim'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const m = DB.mails.find(x => x.id === body.id);
        if (!m) return sendJson(res, 400, { error: '邮件不存在' });
        if (!m.toAll && m.to !== user.id) return sendJson(res, 400, { error: '无权' });
        if (m.claimedBy && m.claimedBy.includes(user.id)) return sendJson(res, 400, { error: '已领取' });
        m.claimedBy = m.claimedBy || [];
        m.claimedBy.push(user.id);
        const r = m.rewards || {};
        for (const k of Object.keys(r)) {
            if (k === 'wishCards') user.state.wishCards = (user.state.wishCards || 0) + r[k];
            else user.state.resources[k] = (user.state.resources[k] || 0) + r[k];
        }
        save();
        sendJson(res, 200, { ok: true, state: user.state });
    };
};
