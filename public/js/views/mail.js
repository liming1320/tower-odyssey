// 邮件
const MailView = {
    async open(app) {
        U.openModal(`
            <h3>邮件箱</h3>
            <div id="mail-list" style="max-height:50vh;overflow-y:auto"></div>
        `);
        await this.refresh(app);
        const dot = document.getElementById('mail-dot');
        if (dot) dot.classList.add('hidden');
    },
    async refresh(app) {
        try {
            const r = await API.mails();
            const list = document.querySelector('#mail-list');
            if (!list) return;
            if (!r.mails.length) {
                list.innerHTML = '<div style="text-align:center;color:#b9b3d8;padding:24px">暂无邮件</div>';
                return;
            }
            list.innerHTML = '';
            r.mails.forEach(m => {
                const claimed = m.claimedBy && m.claimedBy.includes(app.user.id);
                const rewardText = Object.entries(m.rewards || {}).map(([k, v]) => `${RES_NAME[k] || k}:${v}`).join('，');
                list.appendChild(U.el(`
                    <div class="mail-item">
                        <div class="title">${m.title} ${m.toAll?'<span style="color:#ffd56b">[全服]</span>':''}</div>
                        <div class="from">发件人：${m.from} · ${new Date(m.time).toLocaleString()}</div>
                        <div style="font-size:13px;color:#b9b3d8;margin-top:4px">${m.content || ''}</div>
                        ${rewardText ? `<div class="rewards">奖励：${rewardText}</div>` : ''}
                        ${rewardText && !claimed ? `<button class="btn small" style="margin-top:6px" data-id="${m.id}">领取</button>` : (claimed ? '<span style="color:#5cc7ff;font-size:12px">已领取</span>' : '')}
                    </div>
                `));
            });
            list.querySelectorAll('button[data-id]').forEach(b => b.onclick = async () => {
                try {
                    const r2 = await API.mailClaim(b.dataset.id);
                    app.user.state = r2.state;
                    app.refresh();
                    U.toast('领取成功');
                    this.refresh(app);
                } catch (e) { U.toast(e.message); }
            });
        } catch (e) { U.toast(e.message); }
    }
};