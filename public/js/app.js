// 主应用
const App = {
    user: null,
    tab: 'camp',
    init() {
        LoginView.init();
        this.bindUI();
        if (API.token()) {
            API.me().then(r => {
                this.user = r.user;
                this.onLogin(this.user);
            }).catch(() => {
                API.clearToken();
                document.getElementById('login-view').classList.remove('hidden');
                document.getElementById('app-view').classList.add('hidden');
            });
        } else {
            document.getElementById('login-view').classList.remove('hidden');
        }
    },
    bindUI() {
        document.querySelectorAll('.bottomnav button').forEach(b => {
            b.onclick = () => this.switchTab(b.dataset.tab);
        });
        document.getElementById('btn-chat').onclick = () => ChatView.open(this);
        document.getElementById('btn-avatar').onclick = () => PersonalView.open(this);
        document.getElementById('btn-profile').onclick = () => PersonalView.open(this);
        document.getElementById('btn-mail').onclick = () => MailView.open(this);
        document.getElementById('btn-event').onclick = () => EventView.open(this);
        document.getElementById('btn-menu').onclick = () => {
            const p = document.getElementById('menu-panel');
            p.classList.toggle('hidden');
            p.querySelectorAll('[data-action]').forEach(item => {
                item.onclick = async () => {
                    p.classList.add('hidden');
                    if (item.dataset.action === 'logout') {
                        try { await API.logout(); } catch (e) {}
                        API.clearToken();
                        location.reload();
                    } else if (item.dataset.action === 'free') {
                        try {
                            const r = await API.free();
                            this.user.state = r.state;
                            this.refresh();
                            U.toast('已领取');
                        } catch (e) { U.toast(e.message); }
                    } else if (item.dataset.action === 'event') {
                        EventView.open(this);
                    } else if (item.dataset.action === 'settings') {
                        SettingsView.open(this);
                    } else if (item.dataset.action === 'profile') {
                        PersonalView.open(this);
                    }
                };
            });
        };
        document.body.addEventListener('click', e => {
            const p = document.getElementById('menu-panel');
            if (!p.classList.contains('hidden') && !p.contains(e.target) && e.target.id !== 'btn-menu') {
                p.classList.add('hidden');
            }
        });
    },
    onLogin(user) {
        this.user = user;
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('hidden');
        this.refresh();
        this.switchTab('camp');
        EventView.refreshDot(this);
        // 启动心跳
        setInterval(() => { this.refresh(); EventView.refreshDot(this); }, 8000);
    },
    refresh() {
        if (!this.user) return;
        const r = this.user.state.resources || {};
        // 顶栏昵称 + 展示 ID
        const nickEl = document.getElementById('p-nick');
        const uidEl = document.getElementById('p-uid');
        if (nickEl) nickEl.textContent = this.user.nickname || this.user.username || '冒险者';
        if (uidEl) uidEl.textContent = this.user.displayId || '';
        // 左上角头像
        const av = document.getElementById('player-avatar');
        if (av && typeof avatarSVG === 'function') { av.innerHTML = avatarSVG(this.user); }
        document.getElementById('r-gem').textContent = U.num(r.gems || 0);
        document.getElementById('r-gold').textContent = U.fmt(r.gold || 0);
        document.getElementById('r-wood').textContent = U.fmt(r.wood || 0);
        document.getElementById('r-iron').textContent = U.fmt(r.iron || 0);
        document.getElementById('r-stone').textContent = U.fmt(r.stone || 0);
        document.getElementById('r-exp').textContent = U.fmt(r.exp || 0);
        document.getElementById('r-wish').textContent = U.fmt(this.user.state.wishCards || 0);
    },
    // 个人资料：改昵称 / 绑定手机 / 改密码（顶栏点头像区进入）
    editNickname() {
        const cur = this.user.nickname || this.user.username || '';
        const u = this.user;
        U.openModal(`
            <h3>个人资料</h3>
            <div class="card" style="font-size:12px;color:#b9b3d8;line-height:1.8">
                昵称是对外展示的名字（聊天、部落、排行榜都用它），2-12 个字符，全服唯一。<br>
                展示 ID <b style="color:#ffd56b">${u.displayId || '生成中'}</b> 是别人加你好友用的编号，不可修改。<br>
                绑定手机：<b style="color:${u.phoneBound ? '#5cd65c' : '#ff7a8b'}">${u.phoneBound ? (u.phone || '已绑定') : '未绑定'}</b>
                ${u.phoneBound ? '' : '（绑定后可用手机号+密码登录）'}
            </div>
            <div style="margin:10px 0">
                <input id="nick-input" maxlength="12" value="${cur.replace(/"/g, '&quot;')}"
                       placeholder="输入新昵称（2-12 个字符）">
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn" id="nick-save">保存昵称</button>
                <!-- 短信通道暂停（2026-09-09）：绑定手机需验证码，暂不展示
                <button class="btn ghost" id="btn-bind-phone">📱 ${u.phoneBound ? '换绑手机' : '绑定手机'}</button>
                -->
                <button class="btn ghost" id="btn-set-password">${u.hasPassword ? '修改密码' : '设置密码'}</button>
            </div>
        `);
        const inp = document.getElementById('nick-input');
        inp.focus(); inp.select();
        const doSave = async () => {
            const v = inp.value.trim();
            if (v === cur) { U.closeModal(); return; }
            try {
                const r = await API.setNickname(v);
                this.user.nickname = r.nickname;
                this.user.displayId = r.displayId || this.user.displayId;
                this.refresh();
                U.closeModal();
                U.toast('昵称已更新');
            } catch (e) { U.toast(e.message); }
        };
        document.getElementById('nick-save').onclick = doSave;
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
        // 绑定手机按钮已随短信通道下线（元素不存在时安全跳过）
        const bindBtn = document.getElementById('btn-bind-phone');
        if (bindBtn) bindBtn.onclick = () => this.bindPhone();
        document.getElementById('btn-set-password').onclick = () => this.setPassword();
    },
    // 绑定 / 换绑手机号（短信通道暂停中：服务器 SMS_ENABLED=false，发送验证码会返回
    // 「短信通道暂未开放」；接通付费厂商后置 true 并恢复前端入口即可）
    bindPhone() {
        U.openModal(`
            <h3>${this.user.phoneBound ? '换绑手机号' : '绑定手机号'}</h3>
            <div class="card" style="font-size:12px;color:#b9b3d8;line-height:1.8">
                ${this.user.phoneBound ? '当前：' + (this.user.phone || '已绑定') + '<br>' : ''}
                绑定后可用「手机号 + 密码」登录，也可用验证码直接登录。
            </div>
            <input id="bp-phone" placeholder="手机号" maxlength="11" inputmode="numeric" style="margin-top:8px">
            <div class="sms-row" style="margin-top:8px">
                <input id="bp-code" placeholder="验证码" maxlength="6" inputmode="numeric">
                <button class="ghost" id="bp-send" type="button">获取验证码</button>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px">
                <button class="btn" id="bp-save">确认绑定</button>
                <button class="btn ghost" onclick="U.closeModal()">取消</button>
            </div>
        `);
        const btn = document.getElementById('bp-send');
        let timer = null, left = 0;
        btn.onclick = async () => {
            const phone = document.getElementById('bp-phone').value.trim();
            if (!/^1[3-9]\d{9}$/.test(phone)) return U.toast('请输入正确的手机号');
            try {
                const r = await API.smsSend(phone);
                left = 60; btn.disabled = true;
                timer = setInterval(() => {
                    if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = '获取验证码'; return; }
                    btn.textContent = `重发(${left--}s)`;
                }, 1000);
                U.toast(r.dev ? '验证码已发送（测试模式：请到后台「验证码」页查看）' : '验证码已发送');
            } catch (e) { U.toast(e.message); }
        };
        document.getElementById('bp-save').onclick = async () => {
            const phone = document.getElementById('bp-phone').value.trim();
            const code = document.getElementById('bp-code').value.trim();
            try {
                const r = await API.bindPhone(phone, code);
                this.user.phone = r.phone; this.user.phoneBound = true;
                U.closeModal(); U.toast('手机号已绑定');
                this.editNickname();
            } catch (e) { U.toast(e.message); }
        };
    },
    // 设置 / 修改密码
    setPassword() {
        const has = !!this.user.hasPassword;
        U.openModal(`
            <h3>${has ? '修改密码' : '设置密码'}</h3>
            ${has ? '<input id="pw-old" type="password" placeholder="旧密码" style="margin-top:8px">' : ''}
            <input id="pw-new" type="password" placeholder="新密码（4 位以上）" style="margin-top:8px">
            <input id="pw-new2" type="password" placeholder="再输入一次新密码" style="margin-top:8px">
            <div style="display:flex;gap:8px;margin-top:12px">
                <button class="btn" id="pw-save">保存</button>
                <button class="btn ghost" onclick="U.closeModal()">取消</button>
            </div>
        `);
        document.getElementById('pw-save').onclick = async () => {
            const oldPw = has ? document.getElementById('pw-old').value : '';
            const nw = document.getElementById('pw-new').value;
            const nw2 = document.getElementById('pw-new2').value;
            if (nw.length < 4) return U.toast('新密码至少 4 位');
            if (nw !== nw2) return U.toast('两次输入的新密码不一致');
            try {
                await API.setPassword(oldPw, nw);
                this.user.hasPassword = true;
                U.closeModal(); U.toast(has ? '密码已修改' : '密码已设置，之后可用账号或手机号+密码登录');
            } catch (e) { U.toast(e.message); }
        };
    },
    // 切换页签时先拉一次最新存档，避免视图读到旧的上阵/资源状态
    async switchTab(tab) {
        this.tab = tab;
        document.querySelectorAll('.bottomnav button').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });
        const root = document.getElementById('page-content');
        if (this.user) {
            try {
                const fresh = await API.me();
                const st = fresh && (fresh.state || (fresh.user && fresh.user.state));
                if (st) { this.user.state = st; this.refresh(); }
                // 昵称可能在别处改过，顺带同步
                if (fresh && fresh.user) {
                    if (fresh.user.nickname) this.user.nickname = fresh.user.nickname;
                    if (fresh.user.displayId) this.user.displayId = fresh.user.displayId;
                    this.refresh();
                }
            } catch (e) { /* 网络异常时沿用旧状态 */ }
            // 刷新活动红点（可领数量）
            EventView.refreshDot(this);
        }
        if (this.tab !== tab) return; // 快速连点时以最后一次为准
        if (tab === 'camp') CampView.render(root, this);
        else if (tab === 'aid') AidView.render(root, this);
        else if (tab === 'hero') HeroView.render(root, this);
        else if (tab === 'tower') TowerView.render(root, this);
        else if (tab === 'world') WorldView.render(root, this);
        else if (tab === 'clan') ClanView.render(root, this);
        else if (tab === 'ancient') AncientView.render(root, this);
    }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());