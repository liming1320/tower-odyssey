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
        document.getElementById('btn-profile').onclick = () => this.editNickname();
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
        document.getElementById('r-gem').textContent = U.num(r.gems || 0);
        document.getElementById('r-gold').textContent = U.fmt(r.gold || 0);
        document.getElementById('r-wood').textContent = U.fmt(r.wood || 0);
        document.getElementById('r-iron').textContent = U.fmt(r.iron || 0);
        document.getElementById('r-stone').textContent = U.fmt(r.stone || 0);
        document.getElementById('r-exp').textContent = U.fmt(r.exp || 0);
        document.getElementById('r-wish').textContent = U.fmt(this.user.state.wishCards || 0);
    },
    // 修改昵称（顶栏点昵称进入）
    editNickname() {
        const cur = this.user.nickname || this.user.username || '';
        U.openModal(`
            <h3>修改昵称</h3>
            <div class="card" style="font-size:12px;color:#b9b3d8;line-height:1.8">
                昵称是对外展示的名字（聊天、部落、排行榜都用它），2-12 个字符，全服唯一。<br>
                展示 ID <b style="color:#ffd56b">${this.user.displayId || '生成中'}</b> 是别人加你好友用的编号，不可修改。
            </div>
            <div style="margin:10px 0">
                <input id="nick-input" maxlength="12" value="${cur.replace(/"/g, '&quot;')}"
                       placeholder="输入新昵称（2-12 个字符）">
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn" id="nick-save">保存</button>
                <button class="btn ghost" onclick="U.closeModal()">取消</button>
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