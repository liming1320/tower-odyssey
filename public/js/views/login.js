// 登录视图
const LoginView = {
    init() {
        document.getElementById('btn-login').onclick = () => this.submit(false);
        document.getElementById('btn-register').onclick = () => this.submit(true);
        document.getElementById('login-password').addEventListener('keydown', e => {
            if (e.key === 'Enter') this.submit(false);
        });
    },
    async submit(isRegister) {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        if (!u || !p) return U.toast('请输入账号密码');
        try {
            const fn = isRegister ? API.register : API.login;
            const r = await fn(u, p);
            API.setToken(r.token);
            U.toast(isRegister ? '注册成功' : '登录成功');
            window.App.onLogin(r.user);
        } catch (e) {
            U.toast(e.message);
        }
    }
};
