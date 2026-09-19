'use strict';
// 后台 / 账号 / AI 酒馆网关 域路由：
//   admin/login · admin/mail · account/delete
//   admin/gift/save|delete|list · admin/tavern/config|test|handles|scan
//   admin/user/delete|grant · admin/hero/add|update|delete|reload
//   admin/wall/update|delete · admin/event/save|delete
//   admin/overview · admin/sms-codes · free · tavern/ticket · tavern/status
// 从 server.js 抽出（原 1445–1988 行；ROM 常量块留在 server.js，因其已在 rom.js 加载时经 ctx 传入）。
// 依赖经 routeCtx 注入：verifyPassword/normalizeSkills/saveHeroes/Store/Tavern/SMS/romAdminOk/ELEMENTS/ELEMENT_ALIAS
//   均为 server.js 顶层符号（romAdminOk 为 server.js 顶层函数，修复 tavern config 路由既有 ReferenceError）。
module.exports = function registerAdminRoutes(ctx) {
    const {
        api, DB, sendJson, getUserByToken, save, newId, newToken,
        verifyPassword, normalizeSkills, saveHeroes, Store, Tavern, SMS,
        romAdminOk, ELEMENTS, ELEMENT_ALIAS,
    } = ctx;

    api['POST /api/admin/login'] = (req, res, body) => {
        // 单独管理员入口，用户名 admin / 密码 workbuddy
        if (body.username !== 'admin' || body.password !== 'workbuddy') return sendJson(res, 401, { error: '管理员账号错误' });
        const token = newToken();
        DB.tokens[token] = '__admin__';
        save();
        sendJson(res, 200, { ok: true, token, isAdmin: true });
    };

    api['POST /api/admin/mail'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const isAdmin = user.isAdmin || user.id === 'admin';
        if (!isAdmin) return sendJson(res, 403, { error: '无权限' });

        const rewards = body.rewards || {};
        const title = body.title || '系统邮件';
        const content = body.content || '';
        const hasReward = Object.keys(rewards).some(k => (parseInt(rewards[k]) || 0) > 0);

        // 三种发送范围：全员（toAll） / 指定多个（usernames[]） / 指定单个（to / username）
        if (body.toAll) {
            const mail = {
                id: newId(), toAll: true, to: null, title, content, rewards,
                time: Date.now(), from: user.username || 'admin', claimedBy: [],
            };
            DB.mails.push(mail);
            save();
            return sendJson(res, 200, { ok: true, count: -1, mails: [mail] }); // -1 表示全员
        }

        let names = Array.isArray(body.usernames) ? body.usernames.slice() : [];
        if (body.username) names.push(body.username);
        if (!names.length && body.to) {
            const tu = Object.values(DB.users).find(x => x.id === body.to);
            if (tu) names.push(tu.username);
        }
        names = [...new Set(names.map(n => String(n || '').trim()).filter(Boolean))];
        if (!names.length) return sendJson(res, 400, { error: '请选择收件玩家' });

        const unknown = [];
        const targets = [];
        for (const n of names) {
            const tu = Object.values(DB.users).find(x => x.username === n);
            if (!tu) { unknown.push(n); continue; }
            targets.push(tu);
        }
        if (!targets.length) return sendJson(res, 400, { error: '未找到玩家：' + unknown.join('、') });

        const mails = targets.map(tu => ({
            id: newId(), toAll: false, to: tu.id, toName: tu.username,
            title, content, rewards,
            time: Date.now(), from: user.username || 'admin', claimedBy: [],
        }));
        mails.forEach(m => DB.mails.push(m));
        save();
        sendJson(res, 200, {
            ok: true, count: mails.length, mails,
            unknown,
            hint: hasReward ? '' : '注意：该邮件没有附带资源',
        });
    };

    api['POST /api/account/delete'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const pw = String((body && body.password) || '');
        if (!pw) return sendJson(res, 400, { error: '请输入密码' });
        if (!verifyPassword(pw, user.password)) return sendJson(res, 401, { error: '密码错误' });
        if (String((body && body.confirm) || '') !== '确认注销') return sendJson(res, 400, { error: '请输入「确认注销」' });

        const uid = user.id;
        for (const t of Object.keys(DB.tokens)) if (DB.tokens[t] === uid) delete DB.tokens[t];
        if (Array.isArray(DB.mails)) DB.mails = DB.mails.filter(m => m.to !== uid);
        if (DB.clans && typeof DB.clans === 'object') {
            for (const cid of Object.keys(DB.clans)) {
                const cl = DB.clans[cid];
                if (cl && Array.isArray(cl.members)) cl.members = cl.members.filter(m => m.userId !== uid);
            }
        }
        if (Store.isMySQL()) {
            try { Store.deletePlayer(uid); } catch (e) { console.error('[game] 删 MySQL player 失败：' + e.message); }
        }
        delete DB.users[uid];
        save();
        sendJson(res, 200, { ok: true });
    };

    // ---------------- 礼品码（后台管理）----------------
    api['POST /api/admin/gift/save'] = (req, res, body) => {
        const u = getUserByToken(req);
        if (!u || (!u.isAdmin && u.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        if (!Array.isArray(DB.giftCodes)) DB.giftCodes = [];
        const code = String((body && body.code) || '').trim();
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(code)) return sendJson(res, 400, { error: '礼包码仅允许 4-32 位字母/数字/下划线/短横' });
        const rewards = body.rewards || {};
        if (Object.keys(rewards).length === 0) return sendJson(res, 400, { error: '请填写至少一项奖励' });
        const gift = {
            code,
            name: String(body.name || code),
            content: String(body.content || ''),
            rewards,
            maxUses: Math.max(0, parseInt(body.maxUses) || 0),
            enabled: body.enabled !== false,
            expires: body.expires || null,
            usedBy: [],
            createdAt: Date.now(),
            createdBy: u.username || 'admin',
        };
        const i = DB.giftCodes.findIndex(g => g.code.toLowerCase() === code.toLowerCase());
        if (i >= 0) {
            gift.usedBy = DB.giftCodes[i].usedBy || [];
            gift.createdAt = DB.giftCodes[i].createdAt;
            gift.createdBy = DB.giftCodes[i].createdBy;
            DB.giftCodes[i] = gift;
        } else {
            DB.giftCodes.push(gift);
        }
        save();
        sendJson(res, 200, { ok: true, gift });
    };
    api['POST /api/admin/gift/delete'] = (req, res, body) => {
        const u = getUserByToken(req);
        if (!u || (!u.isAdmin && u.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const code = String((body && body.code) || '');
        DB.giftCodes = (DB.giftCodes || []).filter(g => g.code !== code);
        save();
        sendJson(res, 200, { ok: true });
    };
    api['GET /api/admin/gift/list'] = (req, res) => {
        const u = getUserByToken(req);
        if (!u || (!u.isAdmin && u.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const list = (DB.giftCodes || []).map(g => ({
            code: g.code, name: g.name, content: g.content, rewards: g.rewards,
            maxUses: g.maxUses, usedCount: (g.usedBy || []).length,
            enabled: g.enabled, expires: g.expires, createdAt: g.createdAt, createdBy: g.createdBy,
        }));
        sendJson(res, 200, { ok: true, list });
    };

    // ============================================================
    // AI 酒馆（SillyTavern）网关配置 —— 管理后台可视化配置，改完立即生效、无需重启
    // ============================================================
    api['GET /api/admin/tavern/config'] = (req, res) => {
        if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
        const cfg = Tavern.getConfig();
        sendJson(res, 200, {
            ok: true,
            config: {
                url: cfg.TAVERN_URL,
                enabled: cfg.TAVERN_ENABLED !== '0',
                handle: cfg.TAVERN_ADMIN_HANDLE,
                password: cfg.TAVERN_ADMIN_PASSWORD,
                forwardRealIp: cfg.TAVERN_FORWARD_REAL_IP === '1',
            },
            hasPassword: cfg.hasPassword,
            file: cfg.file,
        });
    };

    api['POST /api/admin/tavern/config'] = async (req, res, body) => {
        if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
        const patch = {};
        if (body.url != null) {
            const u = String(body.url).trim();
            if (!/^https?:\/\//i.test(u)) return sendJson(res, 400, { error: '上游地址必须以 http:// 或 https:// 开头' });
            patch.TAVERN_URL = u.replace(/\/+$/, '');
        }
        if (body.enabled != null) patch.TAVERN_ENABLED = body.enabled ? '1' : '0';
        if (body.handle != null) patch.TAVERN_ADMIN_HANDLE = String(body.handle).trim().slice(0, 64);
        if (body.forwardRealIp != null) patch.TAVERN_FORWARD_REAL_IP = body.forwardRealIp ? '1' : '0';
        // 密码允许空串（= 不开自动开号，退化为共享账号模式）
        if (body.password != null) patch.TAVERN_ADMIN_PASSWORD = String(body.password).slice(0, 256);

        const r = Tavern.configure(patch);
        if (!r.ok) return sendJson(res, 500, { error: r.msg });
        // 保存后立刻自检一次，让后台直接显示「现在到底通没通」
        let test = null;
        try { test = await Tavern.testConnection(); } catch (e) { test = { ok: false, note: e.message }; }
        sendJson(res, 200, { ok: true, config: r.config, test });
    };

    api['POST /api/admin/tavern/test'] = async (req, res, body) => {
        if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
        const patch = {};
        if (body.url) patch.TAVERN_URL = String(body.url).trim().replace(/\/+$/, '');
        if (body.handle) patch.TAVERN_ADMIN_HANDLE = String(body.handle).trim();
        if (body.password != null) patch.TAVERN_ADMIN_PASSWORD = String(body.password);
        try {
            const r = await Tavern.testConnection(patch);
            sendJson(res, 200, Object.assign({ ok: true }, r));
        } catch (e) {
            sendJson(res, 200, { ok: false, online: false, note: e.message });
        }
    };

    // 列出 SillyTavern 里已有的账号（句柄）——管理员常常不知道 ST 里的管理员叫什么
    api['POST /api/admin/tavern/handles'] = (req, res, body) => {
        if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
        const r = Tavern.listHandles((body || {}).dir);
        if (!r.ok) return sendJson(res, 400, { error: r.error });
        sendJson(res, 200, { ok: true, ...r });
    };
    // 扫描本机常见端口，帮管理员找到 SillyTavern 实际跑在哪个端口
    api['POST /api/admin/tavern/scan'] = async (req, res, body) => {
        if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
        const from = Number(body && body.from) || 8000;
        const to = Number(body && body.to) || 8010;
        if (to - from > 200) return sendJson(res, 400, { error: '扫描范围过大（最多 200 个端口）' });
        try {
            const ports = await Tavern.scanPorts(from, to);
            sendJson(res, 200, { ok: true, ports });
        } catch (e) {
            sendJson(res, 200, { ok: false, ports: [], note: e.message });
        }
    };

    // 删除玩家（含其 token、邮件、聊天中无关，存档直接抹除）
    api['POST /api/admin/user/delete'] = (req, res, body) => {
        const admin = getUserByToken(req);
        if (!admin || (!admin.isAdmin && admin.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const us = Array.isArray(DB.users) ? DB.users : Object.values(DB.users);
        const isArr = Array.isArray(DB.users);
        let names = Array.isArray(body.usernames) ? body.usernames.slice() : [];
        if (body.username) names.push(body.username);
        names = [...new Set(names.map(n => String(n || '').trim()).filter(Boolean))];
        if (!names.length) return sendJson(res, 400, { error: '请选择要删除的玩家' });

        let removed = 0;
        const ids = new Set();
        for (const n of names) {
            if (n === 'admin') continue;
            const tu = us.find(x => x.username === n);
            if (!tu) continue;
            ids.add(tu.id);
            if (isArr) {
                const i = DB.users.findIndex(x => x.id === tu.id);
                if (i >= 0) DB.users.splice(i, 1);
            } else {
                delete DB.users[tu.id];
            }
            removed++;
        }
        // 清掉这些玩家的 token 与其专属邮件
        if (removed) {
            for (const t of Object.keys(DB.tokens || {})) {
                if (ids.has(DB.tokens[t])) delete DB.tokens[t];
            }
            DB.mails = (DB.mails || []).filter(m => !m.to || !ids.has(m.to));
            save();
        }
        sendJson(res, 200, { ok: true, removed });
    };

    api['POST /api/admin/hero/add'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const t = body.hero;
        if (!t.name) return sendJson(res, 400, { error: '名称必填' });
        t.id = newId();
        if (!t.rarity) t.rarity = '史诗';
        // 属性只允许 5 系；老写法（木/风/雷）自动归一
        if (ELEMENT_ALIAS[t.element]) t.element = ELEMENT_ALIAS[t.element];
        if (!ELEMENTS.includes(t.element)) t.element = '火';
        if (!t.baseAtk) t.baseAtk = 1000;
        if (!t.baseHp) t.baseHp = 8000;
        if (!t.skill) t.skill = { name: '默认技能', desc: '造成 150% 攻击伤害', cd: 5, multiplier: 1.5 };
        if (!t.desc) t.desc = `${t.name}，${t.element}系英雄`;
        // 特效类型：默认斩击，可由后台指定（slash/water/fire/ice/meteor/...）
        if (!t.skill.fx) {
            const EM = { 水: 'water', 火: 'fire', 风: 'wind', 雷: 'bolt', 光: 'holy', 暗: 'dark' };
            t.skill.fx = EM[t.element] || 'slash';
        }
        if (!t.skill.tint) t.skill.tint = '#ffd56b';
        // 多技能：后台可配 1~3 个，缺省补一个主技能
        t.skills = normalizeSkills(t.skills, t.skill, t.element);
        if (!t.img) t.img = '8f83fcc3594f42b2255e89fa6d92087f.jpg';
        DB.heroes.push(t);
        saveHeroes();
        sendJson(res, 200, { ok: true, hero: t });
    };

    api['POST /api/admin/hero/update'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const t = body.hero;
        const idx = DB.heroes.findIndex(h => h.id === t.id);
        if (idx < 0) return sendJson(res, 400, { error: '英雄不存在' });
        // 多技能规范化；同时保持 skill（主技能）与 skills[0] 同步
        if (t.skills || t.skill) {
            const el = t.element || DB.heroes[idx].element;
            t.skills = normalizeSkills(t.skills, t.skill || DB.heroes[idx].skill, el);
            t.skill = { ...(t.skill || {}), ...t.skills[0] };
        }
        DB.heroes[idx] = Object.assign(DB.heroes[idx], t);
        saveHeroes();
        sendJson(res, 200, { ok: true });
    };

    api['POST /api/admin/hero/delete'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const idx = DB.heroes.findIndex(h => h.id === body.id);
        if (idx < 0) return sendJson(res, 400, { error: '英雄不存在' });
        DB.heroes.splice(idx, 1);
        // 同步移除所有玩家的该英雄实例（同时清空其装备/戒指/神器/宝石）
        let touched = 0;
        for (const uid of Object.keys(DB.users)) {
            const u = DB.users[uid];
            if (!u.state) continue;
            const before = (u.state.heroes || []).length;
            u.state.heroes = (u.state.heroes || []).filter(h => h.id !== body.id);
            if (u.state.heroes.length !== before) {
                u.state.equipped = (u.state.equipped || []).filter(euid => u.state.heroes.some(h => h.uid === euid));
                touched++;
            }
        }
        saveHeroes();
        sendJson(res, 200, { ok: true, cleanedUsers: touched });
    };

    // 从数据库重新载入英雄配置（在 MySQL 里改名 / 改技能后点一下即可，无需重启）
    api['POST /api/admin/hero/reload'] = async (req, res) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        if (!Store.isMySQL()) return sendJson(res, 400, { error: '当前不是 MySQL 模式，英雄在 data/db.json 里' });
        try {
            const list = await Store.loadHeroes();
            if (!list || !list.length) return sendJson(res, 400, { error: 'heroes 表为空，请先导入 seed-heroes.sql' });
            DB.heroes = list;
            saveHeroes();
            sendJson(res, 200, { ok: true, count: list.length });
        } catch (e) {
            sendJson(res, 500, { error: '重载失败：' + e.message });
        }
    };

    api['POST /api/admin/wall/update'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const { lv, name, atkPct, hpPct, skillDesc } = body;
        if (![lv, name, atkPct, hpPct].every(x => x !== undefined && x !== null && x !== '')) {
            return sendJson(res, 400, { error: '城墙参数不完整' });
        }
        const idx = DB.wallSkills.findIndex(w => w.lv === parseInt(lv));
        const rec = {
            lv: parseInt(lv),
            name: String(name),
            atkPct: parseInt(atkPct) || 0,
            hpPct: parseInt(hpPct) || 0,
            skillDesc: skillDesc ? String(skillDesc) : '',
        };
        if (idx >= 0) DB.wallSkills[idx] = rec; else DB.wallSkills.push(rec);
        DB.wallSkills.sort((a, b) => a.lv - b.lv);
        // 老玩家城墙等级不变，但展示名/技能会按新配置显示
        save();
        sendJson(res, 200, { ok: true, wallSkills: DB.wallSkills });
    };

    api['POST /api/admin/wall/delete'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        DB.wallSkills = DB.wallSkills.filter(w => w.lv !== parseInt(body.lv));
        save();
        sendJson(res, 200, { ok: true, wallSkills: DB.wallSkills });
    };

    api['POST /api/admin/event/save'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const e = body.event || {};
        if (!e.name) return sendJson(res, 400, { error: '活动名必填' });
        if (!e.id) e.id = newId();
        const idx = DB.events.findIndex(x => x.id === e.id);
        if (idx >= 0) DB.events[idx] = Object.assign(DB.events[idx], e);
        else DB.events.push(e);
        save();
        sendJson(res, 200, { ok: true, event: e });
    };

    api['POST /api/admin/event/delete'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        DB.events = DB.events.filter(e => e.id !== body.id);
        save();
        sendJson(res, 200, { ok: true });
    };

    api['POST /api/admin/user/grant'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const { username, toAll, rewards } = body;
        if (!rewards || typeof rewards !== 'object') return sendJson(res, 400, { error: '请填写奖励' });
        let count = 0;
        for (const uid of Object.keys(DB.users)) {
            const u = DB.users[uid];
            if (!u.state) continue;
            if (!toAll && u.username !== username) continue;
            for (const k of Object.keys(rewards)) {
                const v = parseInt(rewards[k]) || 0;
                if (!v) continue;
                if (k === 'wishCards') u.state.wishCards = (u.state.wishCards || 0) + v;
                else u.state.resources[k] = (u.state.resources[k] || 0) + v;
            }
            count++;
        }
        save();
        sendJson(res, 200, { ok: true, count });
    };

    api['GET /api/admin/overview'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        const users = Object.values(DB.users).map(u => ({
            id: u.id, username: u.username, isAdmin: u.isAdmin,
            nickname: u.nickname || u.username,
            displayId: u.displayId || '',
            phone: u.phone || '',
            lv: u.state.tower.maxFloor,
            gems: Math.floor((u.state.resources && u.state.resources.gems) || 0),
            heroCount: (u.state.heroes || []).length,
            loginDays: u.state.loginDays || 0,
            lastLoginDay: u.state.lastLoginDay || '',
            createdAt: u.createdAt,
        }));
        sendJson(res, 200, {
            users, heroes: DB.heroes, mails: DB.mails,
            wallSkills: DB.wallSkills, events: DB.events,
            equipmentTemplates: DB.equipmentTemplates, ringTemplates: DB.ringTemplates,
            artifactTemplates: DB.artifactTemplates, gemTemplates: DB.gemTemplates,
            meta: DB._meta,
        });
    };

    // 后台查看最近发送的验证码（开发/联调期专用：未接真实短信时，管理员在此取码测试）
    api['GET /api/admin/sms-codes'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
        sendJson(res, 200, {
            ok: true,
            provider: process.env.SMS_PROVIDER || 'dev',
            list: SMS.recent.map(r => ({
                phone: r.phone, code: r.code,
                time: new Date(r.time).toISOString(),
                ago: Math.floor((Date.now() - r.time) / 1000) + 's',
            })),
        });
    };

    // ---- 资源作弊：玩家每分钟可领一次 ----
    api['POST /api/free'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const u = user.state;
        const now = Date.now();
        if (now - (u.lastFree || 0) < 60000) return sendJson(res, 400, { error: '1 分钟 1 次' });
        u.lastFree = now;
        const r = { gold: 100, wood: 50, iron: 30, stone: 30, gems: 50, wishCards: 1 };
        for (const k of Object.keys(r)) {
            if (k === 'wishCards') u.wishCards = (u.wishCards || 0) + r[k];
            else u.resources[k] = (u.resources[k] || 0) + r[k];
        }
        save();
        sendJson(res, 200, { ok: true, rewards: r, state: u });
    };

    // ---- AI 酒馆：换一张「入馆票」cookie ----
    api['GET /api/tavern/ticket'] = async (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const ticket = Tavern.signTicket(DB, user.id);
        const body = JSON.stringify({ ok: true });
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Set-Cookie': 'to_tavern=' + ticket + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (12 * 3600),
        });
        res.end(body);
    };

    // ---- AI 酒馆（SillyTavern）网关状态：给设置页做降级提示 ----
    api['GET /api/tavern/status'] = async (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const st = await Tavern.status(DB, true);
        sendJson(res, 200, {
            ok: true,
            enabled: st.enabled,
            online: st.online,
            note: st.note,
            upstream: st.upstream,
            handle: user.username,
            stHandle: Tavern.slugifyHandle(user.username),
            // 管理员凭据没配 → 网关无法用官方接口自动建号，SSO 会失效，需要明确告知
            admin: st.admin || { ok: false, msg: '未配置 TAVERN_ADMIN_PASSWORD' },
        });
    };
};
