// 世界地图
const WorldView = {
    async render(root, app) {
        const r = await API.world();
        const w = r.world;
        const lv = w.lv || 1;
        root.innerHTML = `
            <div class="section-title">世界地图</div>
            <div class="card" style="text-align:center">
                <h3>云海大陆</h3>
                <p style="color:#b9b3d8;font-size:13px">探索不同区域：矿脉 / 战场 / 营地 / 精英怪</p>
                <p style="margin-top:6px">当前推荐等级：<b style="color:#ffd56b">Lv.${lv}</b></p>
                <button class="btn ghost" id="btn-gather">采集一次（免费）</button>
            </div>
            <div class="section-title">区域</div>
            <div class="world-grid">
                ${w.nodes.map(n => `
                    <div class="world-node" data-id="${n.id}">
                        <div style="font-size:24px">${this.icon(n.type)}</div>
                        <div style="margin-top:4px">${this.name(n.type)}</div>
                        <div class="lv">Lv.${n.lv}</div>
                    </div>
                `).join('')}
            </div>
        `;
        root.querySelector('#btn-gather').onclick = async () => {
            try {
                const r2 = await API.worldGather();
                app.user.state = r2.state;
                app.refresh();
                U.toast('获得资源 +' + Object.entries(r2.gains).map(([k, v]) => `${k}:${v}`).join(', '));
            } catch (e) { U.toast(e.message); }
        };
        root.querySelectorAll('.world-node').forEach(el => el.onclick = () => {
            U.openModal(`
                <h3>${this.name(el.dataset.type || 'battle')}</h3>
                <p style="color:#b9b3d8;font-size:13px">等级：${el.querySelector('.lv').textContent}</p>
                <p style="color:#b9b3d8;font-size:13px">前往挑战可获得资源与经验值</p>
                <button class="btn" style="width:100%;margin-top:10px" id="go-tower">前往推塔</button>
            `);
            document.querySelector('#go-tower').onclick = () => {
                U.closeModal();
                document.querySelector('[data-tab="tower"]').click();
            };
        });
    },
    icon(t) { return { mine: '⛏', battle: '⚔', camp: '🏕', elite: '👹' }[t] || '❓'; },
    name(t) { return { mine: '矿区', battle: '战场', camp: '营地', elite: '精英' }[t] || '未知'; }
};