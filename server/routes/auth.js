'use strict';
// 账号体系：注册 / 登录 / 短信验证码 / 手机号登录 / 绑定手机号 / 改密码 / 登出 / 我的
// 路由抽到 server/routes/auth.js（原 server.js 1055–1205）。
// 共享 helper 经 ctx 注入；publicUser 为账号域私有 helper，随模块搬入。
// 注意：displayName 仍留在 server.js（被 clan.js 经 ctx 引用），本模块不依赖它。
const crypto = require('crypto');

module.exports = function registerAuthRoutes(ctx) {
    const {
        api, DB, sendJson, getUserByToken, save, newId, newToken,
        hashPassword, verifyPassword, validPhone, maskPhone,
        genDefaultNickname, defaultUserState, touchLogin, SMS,
        validNickname, newDisplayId,
    } = ctx;

    api['POST /api/register'] = async (req, res, body) => {
        const { username, password, phone, code } = body;
        if (!username || !password) return sendJson(res, 400, { error: '用户名密码必填' });
        // 账号只能是英文 + 数字组合（4-16 位，不能有中文和特殊符号）
        if (!/^[A-Za-z0-9]{4,16}$/.test(username)) {
            return sendJson(res, 400, { error: '账号只能是 4-16 位英文字母或数字（不能有中文和特殊符号）' });
        }
        if (password.length < 4) return sendJson(res, 400, { error: '密码至少 4 位' });
        if (Object.values(DB.users).some(u => u.username === username)) return sendJson(res, 400, { error: '用户已存在' });

        // 注册时可选绑定手机号（需验证码）
        let bindPhone = null;
        if (phone) {
            if (!validPhone(phone)) return sendJson(res, 400, { error: '手机号格式不正确' });
            const v = SMS.verify(phone, code);
            if (!v.ok) return sendJson(res, 400, { error: v.error });
            if (Object.values(DB.users).some(u => u.phone === phone)) return sendJson(res, 400, { error: '该手机号已被其他账号绑定' });
            bindPhone = phone;
        }

        // 可选昵称：传了就用（需通过校验且不重复），没传自动分配「勇者XXXX」
        let finalNickname = null;
        if (body.nickname != null && String(body.nickname).trim() !== '') {
            const v = validNickname(body.nickname);
            if (v) return sendJson(res, 400, { error: v });
            const nick = String(body.nickname).trim();
            if (Object.values(DB.users).some(u => (u.nickname || u.username) === nick))
                return sendJson(res, 400, { error: '该昵称已被占用' });
            finalNickname = nick;
        } else {
            finalNickname = genDefaultNickname();
        }

        const id = newId();
        const isAdmin = Object.keys(DB.users).length === 0; // 第一个注册用户为管理员
        DB.users[id] = {
            id, username,
            password: hashPassword(password),
            isAdmin,
            createdAt: Date.now(),
            nickname: finalNickname,
            displayId: newDisplayId(),      // 展示 ID，全局唯一
            phone: bindPhone,
            state: defaultUserState(username),
        };
        const token = newToken();
        DB.tokens[token] = id;
        touchLogin(DB.users[id].state);
        save();
        sendJson(res, 200, { ok: true, token, user: publicUser(DB.users[id]) });
    };

    api['POST /api/login'] = async (req, res, body) => {
        const { username, password } = body;
        if (!username || !password) return sendJson(res, 400, { error: '请输入账号和密码' });
        // 账号登录 / 手机号+密码登录 用同一个入口：先按用户名查，查不到再按手机号查
        const user = Object.values(DB.users).find(u => u.username === username)
            || Object.values(DB.users).find(u => u.phone === username && !!u.phone);
        if (!user || !verifyPassword(password, user.password)) return sendJson(res, 401, { error: '账号或密码错误' });
        const token = newToken();
        DB.tokens[token] = user.id;
        touchLogin(user.state);
        save();
        sendJson(res, 200, { ok: true, token, user: publicUser(user) });
    };

    // ---- 手机号通道 ----
    // 发送验证码
    api['POST /api/sms/send'] = (req, res, body) => {
        const { phone } = body;
        if (!validPhone(phone)) return sendJson(res, 400, { error: '手机号格式不正确' });
        const r = SMS.send(phone);
        if (!r.ok) return sendJson(res, 429, { error: r.error });
        sendJson(res, 200, { ok: true, dev: !!r.dev, ttl: 300 });
    };
    // 手机号 + 验证码 登录（未注册的手机号自动注册，一个手机号只有一个账号，天然不会重复注册）
    // 可同时提交 password 为新账号设置密码；老账号忽略该字段（改密码走 /api/user/set-password）
    api['POST /api/phone/login'] = (req, res, body) => {
        const { phone, code, password } = body;
        if (!validPhone(phone)) return sendJson(res, 400, { error: '手机号格式不正确' });
        const v = SMS.verify(phone, code);
        if (!v.ok) return sendJson(res, 400, { error: v.error });

        let user = Object.values(DB.users).find(u => u.phone === phone);
        let isNew = false;
        if (!user) {
            // 自动注册：用户名自动生成（账号规则同样是字母+数字），昵称勇者XXXX
            const id = newId();
            let uname;
            do { uname = 'u' + crypto.randomBytes(4).toString('hex'); }
            while (Object.values(DB.users).some(u => u.username === uname));
            user = {
                id, username: uname,
                password: (password && password.length >= 4) ? hashPassword(password) : '',
                isAdmin: false,
                createdAt: Date.now(),
                nickname: genDefaultNickname(),
                displayId: newDisplayId(),
                phone,
                state: defaultUserState(uname),
            };
            DB.users[id] = user;
            isNew = true;
        }
        const token = newToken();
        DB.tokens[token] = user.id;
        touchLogin(user.state);
        save();
        sendJson(res, 200, { ok: true, token, isNew, user: publicUser(user) });
    };
    // 已登录账号绑定 / 换绑手机号
    api['POST /api/user/bind-phone'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const { phone, code } = body;
        if (!validPhone(phone)) return sendJson(res, 400, { error: '手机号格式不正确' });
        const v = SMS.verify(phone, code);
        if (!v.ok) return sendJson(res, 400, { error: v.error });
        const other = Object.values(DB.users).find(u => u.phone === phone && u.id !== user.id);
        if (other) return sendJson(res, 400, { error: '该手机号已被其他账号绑定' });
        user.phone = phone;
        save();
        sendJson(res, 200, { ok: true, phone: maskPhone(phone) });
    };
    // 设置 / 修改密码（验证码登录创建的无密码账号，或想改密码的账号）
    api['POST /api/user/set-password'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const { oldPassword, newPassword } = body;
        if (!newPassword || newPassword.length < 4) return sendJson(res, 400, { error: '新密码至少 4 位' });
        if (user.password) { // 已有密码：必须验证旧密码
            if (!verifyPassword(oldPassword || '', user.password)) return sendJson(res, 400, { error: '旧密码不正确' });
        }
        user.password = hashPassword(newPassword);
        save();
        sendJson(res, 200, { ok: true });
    };

    api['POST /api/logout'] = (req, res) => {
        const token = (req.headers['authorization'] || '').replace('Bearer ', '');
        if (token) delete DB.tokens[token];
        save();
        sendJson(res, 200, { ok: true });
    };

    api['GET /api/me'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        touchLogin(user.state);
        sendJson(res, 200, { user: publicUser(user) });
    };

    function publicUser(user) {
        return {
            id: user.id,
            username: user.username,
            nickname: user.nickname || user.username,
            displayId: user.displayId || '',
            phone: maskPhone(user.phone),        // 脱敏：138****1234
            phoneBound: !!user.phone,            // 是否已绑定
            hasPassword: !!user.password,        // 验证码登录创建的无密码账号为 false
            isAdmin: !!user.isAdmin,
            createdAt: user.createdAt,
            state: user.state,
        };
    }
};
