// 登录视图：账号通道（账号+密码）
// 手机号验证码通道暂停（2026-09-09）：真实短信需购买厂商套餐，前端入口已注释；
// 恢复方法：还原 index.html 的手机号 tab/box，并去掉下方 SMS_ENABLED 判断。
const SMS_ENABLED = false;
const LoginView = {
    smsCountdown: 0,
    init() {
        // 通道切换（手机号通道下线时 tab-phone 不存在，安全跳过）
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

        // 账号通道
        document.getElementById('btn-login').onclick = () => this.submit(false);
        document.getElementById('btn-register').onclick = () => this.submit(true);
        document.getElementById('login-password').addEventListener('keydown', e => {
            if (e.key === 'Enter') this.submit(false);
        });

        // 手机号通道（下线中：元素不存在时自动跳过）
        const btnSms = document.getElementById('btn-send-sms');
        const btnPhone = document.getElementById('btn-phone-login');
        const smsInput = document.getElementById('login-sms');
        if (btnSms && SMS_ENABLED) btnSms.onclick = () => this.sendSms();
        if (btnPhone) btnPhone.onclick = () => this.phoneLogin();
        if (smsInput) smsInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') this.phoneLogin();
        });
    },
    async submit(isRegister) {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        if (!u || !p) return U.toast('请输入账号密码');
        if (isRegister && !/^[A-Za-z0-9]{4,16}$/.test(u)) {
            return U.toast('账号只能是 4-16 位英文字母或数字（不能有中文和特殊符号）');
        }
        try {
            const fn = isRegister ? API.register : API.login;
            const r = await fn(u, p);
            API.setToken(r.token);
            U.toast(isRegister ? '注册成功' : '登录成功');
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
