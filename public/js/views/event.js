// 活动中心：玩家查看并领取后台配置的活动奖励
const EventView = {
    // 入口钩子：页面加载后由 app.js 调用，创建顶栏「活动」按钮
    ensureEntry(app) {
        if (document.getElementById('btn-event')) return;
        const mail = document.getElementById('btn-mail');
        if (!mail) return;
        const btn = document.createElement('button');
        btn.id = 'btn-event';
        btn.className = mail.className || '';
        btn.style.position = 'relative';
        btn.innerHTML = '🎉<span class="event-dot" id="event-dot"></span>';
        btn.title = '活动';
        btn.onclick = () => this.open(app);
        mail.parentNode.insertBefore(btn, mail);
        this.refreshDot(app);
    },

    async refreshDot(app) {
        const dot = document.getElementById('event-dot');
        if (!dot) return;
        try {
            const r = await API.events();
            dot.style.display = r.readyCount > 0 ? 'block' : 'none';
            dot.textContent = r.readyCount > 9 ? '9+' : r.readyCount;
        } catch (e) { dot.style.display = 'none'; }
    },

    async open(app) {
        let r;
        try { r = await API.events(); }
        catch (e) { U.toast(e.message); return; }

        const modal = U.openModal(`
            <h3 style="text-align:center">🎉 活动中心</h3>
            <p style="text-align:center;color:#b9b3d8;font-size:12px;margin-bottom:8px">
                累计登录 <b style="color:#ffd56b">${r.loginDays}</b> 天
                ${r.readyCount ? `　·　<b style="color:#7cfc7c">${r.readyCount} 个可领取</b>` : '　·　暂无可领奖励'}
            </p>
            <div id="ev-list"></div>
        `);
        const body = modal.querySelector('#ev-list');
        const render = () => {
            body.innerHTML = (r.events || []).map(e => {
                const rw = Object.entries(e.rewards || {})
                    .map(([k, v]) => `<span class="ev-rw">${RES_ICON[k] || '🎁'} ${RES_NAME[k] || k} <b>+${U.fmt(v)}</b></span>`)
                    .join('');
                const cls = e.state === 'ready' ? 'ev-ready' : (e.state === 'done' ? 'ev-done' : 'ev-lock');
                return `
                    <div class="ev-card ${cls}">
                        <div class="ev-head">
                            <b>${e.name}</b>
                            <span class="ev-tag">${EV_TYPE_NAME[e.type] || e.type || '活动'}</span>
                        </div>
                        <p class="ev-desc">${e.desc || ''}</p>
                        <div class="ev-rw-row">${rw}</div>
                        <button class="btn small ${e.state === 'ready' ? '' : 'ghost'}"
                            data-claim="${e.id}" ${e.state === 'ready' ? '' : 'disabled'}>
                            ${e.label}
                        </button>
                    </div>
                `;
            }).join('') || '<div class="card" style="text-align:center;color:#b9b3d8">暂无进行中的活动</div>';

            body.querySelectorAll('[data-claim]').forEach(b => b.onclick = async () => {
                b.disabled = true;
                try {
                    const rs = await API.eventClaim(b.dataset.claim);
                    app.user.state = rs.state;
                    app.refresh();
                    const txt = Object.entries(rs.rewards || {})
                        .map(([k, v]) => `${RES_NAME[k] || k} +${U.fmt(v)}`).join('　');
                    U.toast('已领取：' + txt);
                    r = await API.events();
                    render();
                    this.refreshDot(app);
                } catch (err) { U.toast(err.message); b.disabled = false; }
            });
        };
        render();
    },
};

const EV_TYPE_NAME = { login: '登录', daily: '每日', once: '一次性', limited: '限时', recharge: '充值' };

window.EventView = EventView;
