// 登录 / 注册合并视图（2026-09-10）：
// - 默认显示「登录」面板；右上角「没有账号？点此注册」一键切到注册
// - 注册时多显示一个昵称输入框（可选；不填则服务端随机生成「勇者XXXX」）
// - 支持「记住我」30 天免登录（localStorage 存 token）
// - 手机号验证码通道暂停（2026-09-09）：真实短信需购买厂商套餐，恢复方法见 index.html 注释
const SMS_ENABLED = false;
const LoginView = {
    smsCountdown: 0,
    mode: 'login',     // 'login' | 'register'
    init() {
        // 模式切换：登录 ⇄ 注册
        const switchLink = document.getElementById('login-switch');
        const titleEl = document.getElementById('login-title');
        const btnLogin = document.getElementById('btn-login');
        const nicknameInput = document.getElementById('login-nickname');
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const rememberEl = document.getElementById('login-remember');
        const hintEl = document.getElementById('login-hint');
        const setMode = m => {
            this.mode = m;
            const isReg = m === 'register';
            titleEl.textContent = isReg ? '注 册' : '登 录';
            btnLogin.textContent = isReg ? '注 册' : '登 录';
            btnLogin.classList.toggle('btn-register', isReg);
            nicknameInput.classList.toggle('hidden', !isReg);
            switchLink.textContent = isReg ? '已有账号？点此登录' : '没有账号？点此注册';
            hintEl.textContent = isReg
                ? '账号 4-16 位字母/数字 · 密码至少 4 位 · 昵称 2-12 个字符（不填则随机生成）'
                : '账号注册：4-16 位英文字母+数字，密码至少 4 位。';
            // 切换后清空敏感字段；用户名保留（很多人切换时复用）
            passwordInput.value = '';
            rememberEl.checked = false;
        };
        switchLink.onclick = () => setMode(this.mode === 'login' ? 'register' : 'login');
        // 顶部 tab 仍兼容旧逻辑（SMS 已下线，旧代码仅占位）
        const tabA = document.getElementById('tab-account');
        const tabP = document.getElementById('tab-phone');
        const boxA = document.getElementById('login-account-box');
        const boxP = document.getElementById('login-phone-box');
        const switchTo = phone => {
            if (tabA) tabA.classList.toggle('active', !phone);
            if (tabP) tabP.classList.toggle('active', !!phone);
            if (boxA) boxA.classList.toggle('hidden', !!phone);
            if (boxP) boxP.classList.toggle('hidden', !phone);
        };
        if (tabP && boxP) tabP.onclick = () => switchTo(true);
        if (tabA) tabA.onclick = () => switchTo(false);

        // 提交：当前模式决定走 login 还是 register
        const submit = () => this.submit(this.mode === 'register');
        btnLogin.onclick = submit;
        // Enter 键：密码框回车 = 当前模式；昵称框（注册时）回车跳账号
        passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
        usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') passwordInput.focus(); });
        nicknameInput.addEventListener('keydown', e => { if (e.key === 'Enter') usernameInput.focus(); });

        // 手机号通道（下线中：元素不存在时自动跳过）
        const btnSms = document.getElementById('btn-send-sms');
        const btnPhone = document.getElementById('btn-phone-login');
        const smsInput = document.getElementById('login-sms');
        if (btnSms && SMS_ENABLED) btnSms.onclick = () => this.sendSms();
        if (btnPhone) btnPhone.onclick = () => this.phoneLogin();
        if (smsInput) smsInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') this.phoneLogin();
        });

        // 记住我：localStorage 持久化 token，下次进入自动登录
        const rememberKey = 'tower-odyssey-remember';
        try {
            const savedRemember = localStorage.getItem(rememberKey) === '1';
            rememberEl.checked = savedRemember;
            if (savedRemember) {
                const t = API.getToken();
                if (t) {
                    API.me().then(u => { if (u) window.App.onLogin(u); }).catch(() => {});
                }
            }
        } catch (e) { /* localStorage 不可用时静默 */ }
        rememberEl.addEventListener('change', () => {
            try {
                if (rememberEl.checked) localStorage.setItem(rememberKey, '1');
                else localStorage.removeItem(rememberKey);
            } catch (e) {}
        });
    },
    async submit(isRegister) {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        const n = isRegister ? document.getElementById('login-nickname').value.trim() : '';
        if (!u || !p) return U.toast('请输入账号密码');
        if (isRegister && !/^[A-Za-z0-9]{4,16}$/.test(u)) {
            return U.toast('账号只能是 4-16 位英文字母或数字（不能有中文和特殊符号）');
        }
        try {
            const fn = isRegister
                ? (username, password, nickname) => API.register(username, password, { nickname })
                : API.login;
            const r = await fn(u, p, n);
            API.setToken(r.token);
            U.toast(isRegister ? '注册成功' : '登录成功');
            // 记住我：勾选时把 token 留在 localStorage（默认就是）
            const rememberEl = document.getElementById('login-remember');
            try {
                if (rememberEl && rememberEl.checked) localStorage.setItem('tower-odyssey-remember', '1');
                else localStorage.removeItem('tower-odyssey-remember');
            } catch (e) {}
            window.App.onLogin(r.user);
        } catch (e) {
            U.toast(e.message);
        }
    },
    async sendSms() {
        const phone = document.getElementById('login-phone').value.trim();
        if (!/^1[3-9]\d{9}$/.test(phone)) return U.toast('请输入正确的手机号');
        const btn = document.getElementById('btn-send-sms');
        try {
            const r = await API.smsSend(phone);
            this.startCountdown(60);
            if (r.dev) U.toast('验证码已发送（测试模式：请到后台「验证码」页查看）');
            else U.toast('验证码已发送，请注意查收短信');
        } catch (e) { U.toast(e.message); }
    },
    startCountdown(sec) {
        const btn = document.getElementById('btn-send-sms');
        if (this._smsTimer) clearInterval(this._smsTimer);
        this.smsCountdown = sec;
        btn.disabled = true;
        const tick = () => {
            if (this.smsCountdown <= 0) {
                clearInterval(this._smsTimer); this._smsTimer = null;
                btn.disabled = false;
                btn.textContent = '获取验证码';
                return;
            }
            btn.textContent = `重发(${this.smsCountdown--}s)`;
        };
        tick();
        this._smsTimer = setInterval(tick, 1000);
    },
    async phoneLogin() {
        const phone = document.getElementById('login-phone').value.trim();
        const code = document.getElementById('login-sms').value.trim();
        const pw = document.getElementById('login-phone-pw').value;
        if (!/^1[3-9]\d{9}$/.test(phone)) return U.toast('请输入正确的手机号');
        if (!/^\d{6}$/.test(code)) return U.toast('请输入 6 位验证码');
        try {
            const r = await API.phoneLogin(phone, code, pw || undefined);
            API.setToken(r.token);
            U.toast(r.isNew ? '注册成功，欢迎加入塔界远征' : '登录成功');
            window.App.onLogin(r.user);
        } catch (e) { U.toast(e.message); }
    }
};