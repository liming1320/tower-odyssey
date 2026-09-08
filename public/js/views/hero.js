// 英雄视图 - 图鉴 + 背包 + 许愿
const HeroView = {
    tab: 'atlas', // atlas | bag | wish
    async render(root, app) {
        root.innerHTML = `
            <div class="section-title">英雄</div>
            <div class="admin-tabs">
                <button data-t="atlas" class="${this.tab==='atlas'?'active':''}">图鉴</button>
                <button data-t="bag" class="${this.tab==='bag'?'active':''}">背包</button>
                <button data-t="wish" class="${this.tab==='wish'?'active':''}">许愿</button>
            </div>
            <div id="hero-body">加载中...</div>
        `;
        root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
            this.tab = b.dataset.t;
            this.render(root, app);
        });
        const body = root.querySelector('#hero-body');
        if (this.tab === 'atlas') return this.renderAtlas(body, app);
        if (this.tab === 'bag') return this.renderBag(body, app);
        if (this.tab === 'wish') return this.renderWish(body, app);
    },

    async renderAtlas(body, app) {
        const r = await API.heroes();
        const ownedIds = new Set(r.owned.map(o => o.id));
        const groups = ['传说+', '传说']
            .map(k => ({ key: k, list: r.heroes.filter(h => h.rarity === k) }))
            .filter(g => g.list.length);

        let html = `<div class="card" style="text-align:center;font-size:13px">
            图鉴收集 <b style="color:#ffd56b">${r.heroes.filter(h => ownedIds.has(h.id)).length} / ${r.heroes.length}</b>
        </div>`;
        groups.forEach((g, gi) => {
            const got = g.list.filter(h => ownedIds.has(h.id)).length;
            html += `<div class="section-title">${g.key}
                <span style="float:right;font-size:12px;color:#b9b3d8">${got}/${g.list.length}</span>
            </div><div class="hero-grid" data-g="${gi}"></div>`;
        });
        body.innerHTML = html;

        groups.forEach((g, gi) => {
            const grid = body.querySelector(`[data-g="${gi}"]`);
            if (!grid) return;
            g.list.forEach(h => {
                const owned = ownedIds.has(h.id);
                const node = U.el(`
                    <div class="hero-card" style="${owned ? '' : 'opacity:.42;filter:grayscale(1)'}">
                        <img src="${U.imgSrc(h.img)}" loading="lazy">
                        <div class="star-line">${U.starHtml(owned ? ((r.owned.find(o => o.id === h.id) || {}).star || 5) : 0)}</div>
                        <div class="name">${h.name}</div>
                        <div class="rarity ${U.rarityClass(h.rarity)}">${h.element}系</div>
                        ${owned ? '<div style="font-size:10px;color:#5cc7ff">已拥有</div>'
                                : '<div style="font-size:10px;color:#8a83a8">未拥有</div>'}
                    </div>
                `);
                node.onclick = () => {
                    if (owned) {
                        const oh = r.owned.find(o => o.id === h.id);
                        if (oh) return HeroDetail.open(oh.uid, app);
                    }
                    U.openModal(`
                        <h3>${h.name}
                            <span class="${U.rarityClass(h.rarity)}" style="font-size:13px">${h.rarity}</span>
                            ${owned ? '<span style="font-size:11px;color:#5cc7ff">已拥有</span>'
                                    : '<span style="font-size:11px;color:#8a83a8">未拥有</span>'}
                        </h3>
                        <img src="${U.imgSrc(h.img)}" style="width:160px;height:160px;border-radius:10px;display:block;margin:10px auto;">
                        <div class="card" style="background:rgba(0,0,0,0.3)">
                            <p style="color:#b9b3d8;font-size:13px">
                                ${h.element}系 · 攻击 <b style="color:#ff9d5c">${h.baseAtk}</b>
                                · 生命 <b style="color:#5cc7ff">${h.baseHp}</b>
                            </p>
                            ${h.desc ? `<p style="color:#cfc9e8;font-size:12px;margin-top:6px;line-height:1.5">${h.desc}</p>` : ''}
                        </div>
                        <div class="card" style="margin-top:8px;background:rgba(0,0,0,0.3)">
                            <h4 style="color:#ffd56b;font-size:14px">⚡ ${h.skill.name}</h4>
                            <p style="color:#b9b3d8;font-size:12px">${h.skill.desc}</p>
                            <p style="color:#b9b3d8;font-size:12px">冷却：${h.skill.cd} 秒
                                ${h.skill.multiplier ? ` · 倍率：${h.skill.multiplier}` : ' · 控制/增益型'}</p>
                        </div>
                    `);
                };
                grid.appendChild(node);
            });
        });
    },

    async renderBag(body, app) {
        const r = await API.heroes();
        const equipped = new Set(r.equipped);
        if (!r.owned.length) {
            body.innerHTML = '<div class="card" style="text-align:center;color:#b9b3d8">背包空空如也，去许愿吧！</div>';
            return;
        }
        body.innerHTML = '<div class="hero-grid" id="hg"></div>';
        const grid = body.querySelector('#hg');
        const gold = (app.user.state.resources && app.user.state.resources.gold) || 0;
        r.owned.forEach(oh => {
            const t = r.heroes.find(x => x.id === oh.id);
            if (!t) return;
            const cost = Math.floor(30 * Math.pow(1.3, (oh.lv || 1) - 1));
            const isEq = equipped.has(oh.uid);
            const star = oh.star || 0;
            const mat = oh.material === true || !!t.material;
            const node = U.el(`
                <div class="hero-card">
                    ${isEq ? '<div style="position:absolute;top:2px;right:4px;font-size:10px;color:#5cc7ff">已上阵</div>' : ''}
                    ${mat ? `<div style="position:absolute;top:2px;left:4px;font-size:9px;color:#c9c3e8;background:rgba(0,0,0,.65);padding:1px 5px;border-radius:4px">材料 ${t.tier || 3}★</div>` : ''}
                    <img src="${U.imgSrc(t.img)}">
                    <div class="star-line">${U.starHtml(star)}</div>
                    <div class="name">${t.name} <span style="color:#ffd56b">Lv.${oh.lv || 1}</span></div>
                    <div class="rarity ${U.rarityClass(t.rarity)}">${t.rarity}</div>
                    <div style="font-size:11px;color:#ff9d5c;margin-top:3px">攻 <b data-s="atk">${oh.atk || 0}</b></div>
                    <div style="font-size:11px;color:#5cc7ff">生命 <b data-s="hp">${oh.hp || 0}</b></div>
                    ${mat
                        ? `<div style="margin-top:6px;font-size:10px;color:#b9b3d8;line-height:1.5">升星材料<br>不可上阵</div>`
                        : `<div style="margin-top:6px;display:flex;gap:4px">
                            <button class="btn small" data-act="up"
                                ${gold < cost ? 'disabled title="金币不足"' : ''}>升级（${cost}金）</button>
                            <button class="btn small ghost" data-act="detail">详情</button>
                        </div>`}
                </div>
            `);
            const upBtn = node.querySelector('[data-act="up"]');
            if (upBtn) upBtn.onclick = async (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                    const rs = await API.heroLevelup(oh.uid);
                    app.user.state = rs.state;
                    app.refresh();
                    // 就地更新这张卡，避免重建整个列表
                    node.querySelector('.name').innerHTML =
                        `${t.name} <span style="color:#ffd56b">Lv.${rs.hero.lv}</span>`;
                    node.querySelector('[data-s="atk"]').textContent = rs.hero.atk;
                    node.querySelector('[data-s="hp"]').textContent = rs.hero.hp;
                    const nextCost = Math.floor(30 * Math.pow(1.3, rs.hero.lv - 1));
                    btn.textContent = `升级（${nextCost}金）`;
                    U.toast(`${t.name} → Lv.${rs.hero.lv}　攻 +${rs.gain.atk}　生命 +${rs.gain.hp}`);
                } catch (err) {
                    U.toast(err.message);
                    btn.disabled = false;
                }
            };
            const detailBtn = node.querySelector('[data-act="detail"]');
            if (detailBtn) detailBtn.onclick = (e) => {
                e.stopPropagation();
                HeroDetail.open(oh.uid, app);
            };
            grid.appendChild(node);
        });
        // 注意：不能用 body.innerHTML += ，那会重建整块 DOM 导致上面按钮的 onclick 全部失效
        grid.insertAdjacentHTML('afterend',
            `<div class="card" style="font-size:12px;color:#b9b3d8;text-align:center;line-height:1.7">
                共 ${r.owned.length} 个英雄 · 已上阵 ${r.equipped.length}/5<br>
                <span style="color:#ffd56b">上阵请到「冒险」页面点「上阵」按钮选择</span>
            </div>`);
    },

    async renderWish(body, app) {
        const state = app.user.state;
        const gems = (state.resources && state.resources.gems) || 0;
        const pityMax = 20;
        // 优先用服务端算好的 pityLeft；没有则用本地 wishPity 推算
        const pityLeft = state.pityLeft != null ? state.pityLeft : Math.max(0, pityMax - (state.wishPity || 0));
        const pityDone = Math.min(pityMax, pityMax - pityLeft);
        const pityPct = Math.min(100, Math.round((pityDone / pityMax) * 100));
        body.innerHTML = `
            <div class="card" style="text-align:center">
                <h3>许愿池</h3>
                <p style="color:#b9b3d8;font-size:13px">消耗 1 张许愿卡随机抽取英雄</p>
                <p style="margin:12px 0">许愿卡：<b id="wish-cnt" style="color:#ffd56b">${state.wishCards || 0}</b>
                    　钻石：<b id="gem-cnt" style="color:#5cc7ff">${U.num(gems)}</b></p>
                <div style="margin:10px 0 4px">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:#b9b3d8;margin-bottom:4px">
                        <span>5★ 保底进度</span>
                        <span id="pity-txt" style="color:#ffd56b">${pityDone} / ${pityMax}　再抽 <b id="pity-left">${pityLeft}</b> 次必出 5★</span>
                    </div>
                    <div style="height:8px;background:rgba(0,0,0,.4);border-radius:5px;overflow:hidden">
                        <div id="pity-bar" style="height:100%;width:${pityPct}%;background:linear-gradient(90deg,#ffd56b,#ff9d5c);transition:width .3s"></div>
                    </div>
                </div>
                <div class="row" style="justify-content:center">
                    <button class="btn" id="btn-wish1">许愿一次（1 张）</button>
                    <button class="btn" id="btn-wish10" style="margin-left:8px">许愿十次（10 张）</button>
                </div>
                <button class="btn ghost" id="btn-wish-reward" style="margin-top:10px">领取每日奖励（+3 许愿卡）</button>
            </div>
            <div class="card" style="text-align:center">
                <h3>💎 钻石商城</h3>
                <p style="color:#b9b3d8;font-size:12px;margin:6px 0">
                    100 钻石 = 1 张许愿卡　·　当前钻石 <b id="gem-cnt2" style="color:#5cc7ff">${U.num(gems)}</b>
                </p>
                <div class="row" style="justify-content:center;flex-wrap:wrap">
                    <button class="btn small" id="btn-buy1">买 1 张（100 💎）</button>
                    <button class="btn small" id="btn-buy10">买 10 张（1,000 💎）</button>
                    <button class="btn small" id="btn-buy100">买 100 张（10,000 💎）</button>
                </div>
            </div>
            <div class="card" style="font-size:12px;color:#b9b3d8;line-height:1.7">
                <p style="color:#ffd56b">· 每 20 抽必定保底出 5★（传说 / 传说+），出货后计数重置</p>
                <p>· 5★ 8%　·　4★ 材料 32%　·　3★ 材料 60%</p>
                <p>· 3★/4★ 是升星材料英雄，属性较弱且<b style="color:#ff9d5c">不可上阵</b></p>
                <p>· 50% 概率同时获得古宝</p>
                <p>· 每次必出 1 个英雄，重复获得会作为独立英雄进入背包</p>
                <p>· 首通新楼层、每日免费领取都能获得钻石</p>
                <p style="color:#ffd56b">· 英雄升级请到「背包」，上阵请到「冒险」</p>
            </div>
            <div id="wish-result"></div>
        `;
        this.syncWishUI(body, state);

        const buy = async (count, btnId) => {
            const btn = body.querySelector(btnId);
            if (btn) btn.disabled = true;
            try {
                const rs = await API.shopBuyWish(count);
                app.user.state = rs.state;
                app.refresh();
                this.syncWishUI(body, rs.state);
                U.toast(`花费 ${U.num(rs.cost)} 钻石，买到 ${rs.count} 张许愿卡`);
            } catch (e) {
                U.toast(e.message);
                this.syncWishUI(body, app.user.state);
            }
        };
        body.querySelector('#btn-buy1').onclick = () => buy(1, '#btn-buy1');
        body.querySelector('#btn-buy10').onclick = () => buy(10, '#btn-buy10');
        body.querySelector('#btn-buy100').onclick = () => buy(100, '#btn-buy100');

        const doWish = async (count) => {
            const btn = body.querySelector(count === 10 ? '#btn-wish10' : '#btn-wish1');
            if (btn) btn.disabled = true;
            try {
                const rs = await API.wish(count);
                app.user.state = rs.state;
                app.refresh();
                // 把服务端返回的保底剩余次数一并同步给进度条
                this.syncWishUI(body, Object.assign({}, rs.state, { pityLeft: rs.pityLeft, pityMax: rs.pityMax }));
                this.showWishResult(body, rs, app);
                const god = rs.items.filter(i => (i.template.tier || 5) === 5);
                U.toast(god.length
                    ? `许愿 ${count} 次，获得 ${god.length} 个 5★！`
                    : `许愿 ${count} 次，获得 ${rs.items.length} 个英雄`);
            } catch (e) {
                U.toast(e.message);
                this.syncWishUI(body, app.user.state);
            }
        };
        body.querySelector('#btn-wish1').onclick = () => doWish(1);
        body.querySelector('#btn-wish10').onclick = () => doWish(10);
        body.querySelector('#btn-wish-reward').onclick = async () => {
            try {
                const rs = await API.wishReward();
                app.user.state = rs.state;
                app.refresh();
                this.syncWishUI(body, rs.state);
                U.toast('已领取 3 张许愿卡');
            } catch (e) {
                U.toast(e.message);
                this.syncWishUI(body, app.user.state);
            }
        };
    },

    // 展示许愿结果（1 连大图 / 10 连网格）
    showWishResult(body, rs, app) {
        const result = body.querySelector('#wish-result');
        if (!result) return;
        const treasures = rs.items.filter(i => i.treasure).map(i => i.treasure.name);
        const ten = rs.items.length > 1;
        result.innerHTML = `
            <div class="card" style="text-align:center">
                <h3>恭喜获得 ${rs.items.length} 个英雄</h3>
                <div class="${ten ? 'hero-grid' : ''}" style="${ten ? '' : 'margin-top:10px'}">
                    ${rs.items.map(it => `
                        <div class="${ten ? 'hero-card' : ''}" style="${ten ? '' : 'display:inline-block'}">
                            <img src="${U.imgSrc(it.template.img)}"
                                 style="width:${ten ? '100%' : '140px'};height:${ten ? 'auto' : '140px'};border-radius:8px">
                            <div class="${U.rarityClass(it.template.rarity)}" style="font-size:13px;margin-top:4px">
                                ${it.template.name} · ${it.template.rarity}
                            </div>
                        </div>
                    `).join('')}
                </div>
                ${treasures.length ? `<div style="margin-top:8px;color:#ffd56b;font-size:12px">同时获得古宝：${treasures.join('、')}</div>` : ''}
                <p style="margin-top:8px;color:#b9b3d8;font-size:12px">英雄已放入背包，可到「背包」升级，到「冒险」上阵</p>
            </div>
        `;
    },

    // 同步许愿页的数量与按钮状态（不重建 DOM，避免丢失已绑定的事件）
    syncWishUI(body, state) {
        const s = state || {};
        // 保底进度条
        if (s.pityLeft != null) {
            const max = s.pityMax || 20;
            const left = s.pityLeft;
            const done = Math.min(max, max - left);
            const bar = body.querySelector('#pity-bar');
            const txt = body.querySelector('#pity-txt');
            const leftEl = body.querySelector('#pity-left');
            if (bar) bar.style.width = Math.min(100, Math.round((done / max) * 100)) + '%';
            if (leftEl) leftEl.textContent = left;
            if (txt) txt.innerHTML = `${done} / ${max}　再抽 <b id="pity-left">${left}</b> 次必出 5★`;
        }
        const cnt = body.querySelector('#wish-cnt');
        const b1 = body.querySelector('#btn-wish1');
        const b10 = body.querySelector('#btn-wish10');
        const rb = body.querySelector('#btn-wish-reward');
        const n = s.wishCards || 0;
        const g = (s.resources && s.resources.gems) || 0;
        if (cnt) cnt.textContent = n;
        const g1 = body.querySelector('#gem-cnt'), g2 = body.querySelector('#gem-cnt2');
        if (g1) g1.textContent = U.num(g);
        if (g2) g2.textContent = U.num(g);
        if (b1) b1.disabled = n < 1;
        if (b10) b10.disabled = n < 10;
        const b1w = body.querySelector('#btn-buy1');
        const b10w = body.querySelector('#btn-buy10');
        const b100w = body.querySelector('#btn-buy100');
        if (b1w) b1w.disabled = g < 100;
        if (b10w) b10w.disabled = g < 1000;
        if (b100w) b100w.disabled = g < 10000;
        const claimed = s.lastWishRewardDay === new Date().toDateString();
        if (rb) {
            rb.disabled = !!claimed;
            rb.textContent = claimed ? '今日已领取（明日可再领）' : '领取每日奖励（+3 许愿卡）';
        }
    }
};