// 部落
const ClanView = {
    async render(root, app) {
        const state = app.user.state;
        if (state.clanId) {
            try {
                const r = await API.clanMine();
                const c = r.clan;
                root.innerHTML = `
                    <div class="section-title">我的部落</div>
                    <div class="card">
                        <h3>${c.name}</h3>
                        <p style="color:#b9b3d8;font-size:12px">族长：${c.leaderName} · 人数：${c.members.length}</p>
                        <p style="color:#b9b3d8;font-size:12px">成员：${r.memberDetails.map(m => `${m.nickname || m.username}${m.displayId ? `<span style="opacity:.6">${m.displayId}</span>` : ''}(Lv.${m.lv})`).join('、')}</p>
                        <p style="color:#5cc7ff;font-size:12px;margin-top:6px">部落功能：联合远征 / 部落战（占位）</p>
                    </div>
                `;
            } catch (e) { U.toast(e.message); }
        } else {
            let list = [];
            try { const r = await API.clans(); list = r.clans; } catch (e) {}
            root.innerHTML = `
                <div class="section-title">部落</div>
                <div class="card" style="text-align:center">
                    <p style="color:#b9b3d8">还没有加入部落？</p>
                    <button class="btn" id="btn-clan-create">创建部落</button>
                </div>
                <div class="section-title">已有部落</div>
                ${list.length === 0 ? '<div class="card" style="text-align:center;color:#b9b3d8;font-size:13px">暂无可加入部落</div>' :
                    list.map(c => `
                        <div class="card">
                            <h3>${c.name}</h3>
                            <p style="color:#b9b3d8;font-size:12px">族长：${c.leader} · 人数：${c.members}</p>
                            <button class="btn small" data-id="${c.id}">加入</button>
                        </div>
                    `).join('')}
            `;
            const cc = root.querySelector('#btn-clan-create');
            if (cc) cc.onclick = () => {
                U.openModal(`
                    <h3>创建部落</h3>
                    <input id="clan-name" placeholder="部落名称">
                    <div class="row">
                        <button class="btn ghost" data-close>取消</button>
                        <button class="btn" id="cc-confirm">创建</button>
                    </div>
                `);
                document.querySelector('#cc-confirm').onclick = async () => {
                    const n = document.querySelector('#clan-name').value.trim();
                    if (!n) return U.toast('请输入名称');
                    try {
                        await API.clanCreate(n);
                        app.user.state.clanId = true;
                        app.user = { ...app.user };
                        U.closeModal();
                        U.toast('部落创建成功');
                        this.render(root, app);
                    } catch (e) { U.toast(e.message); }
                };
            };
            root.querySelectorAll('[data-id]').forEach(b => b.onclick = async () => {
                try {
                    await API.clanJoin(b.dataset.id);
                    U.toast('加入成功');
                    this.render(root, app);
                } catch (e) { U.toast(e.message); }
            });
        }
    }
};