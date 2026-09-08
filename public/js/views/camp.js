// 营地视图 - 建筑产出、升级消耗与挂机收益一目了然
const CampView = {
    async render(root, app) {
        root.innerHTML = `
            <div class="section-title">营地 · 资源产出</div>
            <div id="camp-summary" class="card">加载中...</div>
            <div class="section-title">建筑</div>
            <div class="building-list" id="building-grid"></div>
            <div class="section-title">产出说明</div>
            <div class="card" style="font-size:12px;line-height:1.8;color:#b9b3d8">
                <p>· 产出按「每分钟」结算，每 5 秒自动入账一次，离线也会累积（最多 12 小时）。</p>
                <p>· <b style="color:#ffd56b">研究院</b>自身不产出资源，每级给全部建筑 <b style="color:#ffd56b">+6%</b> 产出。</p>
                <p>· 升级消耗随等级递增，卡片上会直接标注「还差什么」。</p>
            </div>
        `;
        await this.load(root, app);
    },

    async load(root, app) {
        let d;
        try { d = await API.camp(); } catch (e) { root.innerHTML = `<div class="card">${e.message}</div>`; return; }
        app.user.state.resources = d.resources;
        app.refresh();

        // ---- 顶部总览 ----
        const sum = root.querySelector('#camp-summary');
        if (sum) {
            const rows = Object.keys(d.perMin).map(k =>
                `<span class="pr">${RES_ICON[k] || ''} ${RES_NAME[k] || k}
                    <b style="color:#9ed16f">+${Math.round(d.perMin[k] * 10) / 10}</b>/分</span>`).join('');
            const pend = Object.keys(d.pending).filter(k => d.pending[k] > 0).map(k =>
                `<span class="pr">${RES_NAME[k]} +${U.fmt(d.pending[k])}</span>`).join('');
            sum.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
                    <b style="font-size:13px">总产出（每分钟）</b>
                    <span style="font-size:11px;color:#b9b3d8">研究院加成 +${Math.round((d.bonus - 1) * 100)}%</span>
                </div>
                <div class="prod-row">${rows || '<span style="color:#b9b3d8">暂无产出</span>'}</div>
                <div class="card" style="background:rgba(0,0,0,0.3);margin-top:8px">
                    <div style="font-size:12px;color:#b9b3d8">
                        挂机 <b style="color:#ffd56b">${U.dur(d.pendingSec)}</b>（上限 ${d.offlineCapHours} 小时）
                    </div>
                    <div class="prod-row" style="margin-top:4px">
                        ${pend || '<span style="color:#8a83a8">暂无待领取收益</span>'}
                    </div>
                    <button class="btn small" id="btn-collect" style="margin-top:8px;width:100%"
                        ${d.pendingSec < 5 ? 'disabled' : ''}>⏱ 领取挂机收益</button>
                </div>
            `;
            const bc = sum.querySelector('#btn-collect');
            if (bc) bc.onclick = async () => {
                bc.disabled = true;
                try {
                    const r = await API.campCollect();
                    app.user.state = r.state;
                    app.refresh();
                    U.toast('已领取 ' + U.dur(r.seconds) + ' 的产出');
                    this.load(root, app);
                } catch (e) { U.toast(e.message); bc.disabled = false; }
            };
        }

        // ---- 建筑卡片 ----
        const grid = root.querySelector('#building-grid');
        if (!grid) return;
        grid.innerHTML = '';
        d.defs.forEach(def => {
            const outKeys = Object.keys(def.out);
            const curTxt = outKeys.length
                ? outKeys.map(k => `${RES_NAME[k]} ${def.cur[k]}/分`).join('　')
                : `全建筑产出 +${def.curBonus}%`;
            const nextTxt = outKeys.length
                ? outKeys.map(k => `${RES_NAME[k]} ${def.next[k]}/分`).join('　')
                : `全建筑产出 +${def.nextBonus}%`;
            const costTxt = Object.keys(def.cost)
                .map(k => `${RES_NAME[k]} ${U.fmt(def.cost[k])}`).join('　');
            const lackTxt = def.missing.length ? def.missing.join('、') : '';

            const node = U.el(`
                <div class="building">
                    <div class="b-head">
                        <div class="icon">${def.icon}</div>
                        <div class="b-meta">
                            <div class="name">${def.name} <span class="lv">Lv.${def.lv}</span></div>
                            <div class="desc">${def.res}</div>
                        </div>
                    </div>
                    <div class="b-line">当前：<b style="color:#9ed16f">${curTxt}</b></div>
                    <div class="b-line">升级后：<b style="color:#ffd56b">${nextTxt}</b></div>
                    <div class="b-line">消耗：<span style="color:#b9b3d8">${costTxt}</span></div>
                    ${lackTxt ? `<div class="b-lack">${lackTxt}</div>` : ''}
                    <button class="btn small" data-act="up" ${def.affordable ? '' : 'disabled'}>
                        升级到 Lv.${def.lv + 1}
                    </button>
                </div>
            `);
            node.querySelector('button').onclick = async () => {
                const btn = node.querySelector('button');
                btn.disabled = true;
                try {
                    const r = await API.buildingUpgrade(def.key);
                    app.user.state = r.state;
                    app.refresh();
                    U.toast(`${def.name} 升至 Lv.${(r.state.buildings[def.key] || 0)}`);
                    await this.load(root, app);
                } catch (e) {
                    U.toast(e.message);
                    await this.load(root, app);
                }
            };
            grid.appendChild(node);
        });
    }
};
