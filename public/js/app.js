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
        document.getElementById('r-gem').textContent = U.num(r.gems || 0);
        document.getElementById('r-gold').textContent = U.fmt(r.gold || 0);
        document.getElementById('r-wood').textContent = U.fmt(r.wood || 0);
        document.getElementById('r-iron').textContent = U.fmt(r.iron || 0);
        document.getElementById('r-stone').textContent = U.fmt(r.stone || 0);
        document.getElementById('r-exp').textContent = U.fmt(r.exp || 0);
        document.getElementById('r-wish').textContent = U.fmt(this.user.state.wishCards || 0);
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