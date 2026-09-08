// 助战视图（城墙 + 古宝）
const AidView = {
    async render(root, app) {
        root.innerHTML = `<div style="text-align:center;padding:24px">加载中...</div>`;
        let r;
        try { r = await API.heroes(); } catch (e) { U.toast(e.message); return; }
        const state = app.user.state;
        const wall = state.wall || { lv: 1, name: '青石墙' };
        const equippedHeroes = state.equipped || [];
        const wallLvNext = (wall.lv || 1) + 1;
        const nextSkill = r.wallSkills.find(s => s.lv === wallLvNext);

        root.innerHTML = `
            <div class="section-title">城墙</div>
            <div class="card">
                <h3>${wall.name || '青石墙'} <span style="color:#ffd56b;font-size:13px">Lv.${wall.lv}</span></h3>
                <div class="row"><span>攻击加成</span><b style="color:#ff9d5c">+${wall.atkPct || 0}%</b></div>
                <div class="row"><span>生命加成</span><b style="color:#5cc7ff">+${wall.hpPct || 0}%</b></div>
                <p style="font-size:12px;color:#b9b3d8;margin-top:6px;">升级城墙可以提升所有上阵英雄的攻击和生命百分比。</p>
                ${nextSkill ? `<div style="margin-top:8px;font-size:12px;color:#b9b3d8">下一级：${nextSkill.name}（攻击+${nextSkill.atkPct}%，生命+${nextSkill.hpPct}%）</div>` : '<div style="margin-top:8px;color:#ffd56b">城墙已满级</div>'}
                <button class="btn" style="margin-top:10px;width:100%" id="btn-wall-up" ${nextSkill ? '' : 'disabled'}>升级城墙</button>
            </div>

            <div class="section-title">古宝（已装备 ${(state.treasures || []).length}）</div>
            <div id="treasure-list"></div>
        `;

        root.querySelector('#btn-wall-up').onclick = async () => {
            try {
                const rs = await API.wallUpgrade();
                app.user.state = rs.state;
                app.refresh();
                this.render(root, app);
                U.toast('城墙升级成功');
            } catch (e) { U.toast(e.message); }
        };

        const list = root.querySelector('#treasure-list');
        if (!state.treasures || state.treasures.length === 0) {
            list.innerHTML = '<div class="card" style="color:#b9b3d8;text-align:center">尚未获得古宝，可通过许愿获得。</div>';
        } else {
            state.treasures.forEach(tid => {
                const t = r.treasures.find(x => x.id === tid);
                if (!t) return;
                const node = U.el(`
                    <div class="card">
                        <h3>${t.name}</h3>
                        <p style="color:#b9b3d8;font-size:13px">${t.desc}</p>
                        <div style="text-align:right;margin-top:6px;color:#5cc7ff;font-size:12px">已装备</div>
                    </div>
                `);
                list.appendChild(node);
            });
            // 用 insertAdjacentHTML 而非 innerHTML += ，避免重建 DOM 丢失已绑定的事件
            list.insertAdjacentHTML('beforeend', '<div class="card" style="text-align:center;color:#b9b3d8;font-size:12px;">（古宝一旦获得自动装备，可在邮件中获得更多）</div>');
        }
    }
};