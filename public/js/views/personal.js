// 个人信息弹窗：头像 + 昵称(可改) + 展示ID(可复制) + 冒险进度 + 冒险阵容
const PersonalView = {
    async open(app) {
        const u = app.user;
        const st = u.state || {};
        const equipped = st.equipped || [];
        const maxFloor = (st.tower && st.tower.maxFloor) || 0;
        const curFloor = (st.tower && st.tower.currentFloor) || 1;
        const cleared = maxFloor;
        // 拉取英雄模板表（缓存到 DB_LOCAL）
        if (!DB_LOCAL.heroes.length) {
            try { const r = await API.get('/api/heroes'); DB_LOCAL.heroes = r.heroes || []; } catch (e) { DB_LOCAL.heroes = []; }
        }
        const heroes = DB_LOCAL.heroes;
        // 渲染头像 + 阵容卡
        const avatar = avatarSVG(u);
        const lineupHTML = equipped.map((uid) => {
            const own = (st.heroes || []).find(h => h.uid === uid);
            const tpl = heroes.find(h => h.id === (own && own.id));
            if (!tpl) return `<div class="lineup-slot empty">?</div>`;
            const stars = own.star || 1;
            return `<div class="lineup-slot" data-id="${tpl.id}">
                <div class="lineup-portrait">${portraitSVG(tpl, stars)}</div>
                <div class="lineup-name">${tpl.name}</div>
                <div class="lineup-star">${U.starHtml(stars)}</div>
            </div>`;
        }).join('');
        const emptySlots = Array.from({ length: Math.max(0, 5 - equipped.length) }, (_, i) =>
            `<div class="lineup-slot empty">${equipped.length + i + 1}</div>`
        ).join('');

        U.openModal(`
            <h3>个人资料</h3>
            <div class="pi-hero">
                <div class="pi-avatar">${avatar}</div>
                <div class="pi-info">
                    <div class="pi-nick" id="pi-nick">${esc(u.nickname || u.username)}</div>
                    <div class="pi-id">ID：<b id="pi-id">${u.displayId || '生成中'}</b><button class="btn-mini" id="pi-copy">复制</button></div>
                    <div class="pi-stats">
                        <span>🏆 最高通关 <b>${cleared}</b> 层</span>
                        <span>📍 当前 <b>第 ${curFloor} 关</b></span>
                    </div>
                    ${u.phoneBound ? `<div class="pi-stats">📱 已绑定 <b>${u.phone || ''}</b></div>` : ''}
                </div>
            </div>
            <div class="pi-edit">
                <input id="pi-nick-input" maxlength="12" value="${esc(u.nickname || u.username)}" placeholder="新昵称（2-12 字符）">
                <button class="btn" id="pi-save">保存昵称</button>
            </div>
            <h4 style="margin-top:14px">冒险阵容</h4>
            <div class="pi-lineup">${lineupHTML || emptySlots}</div>
            <div class="pi-actions">
                <!-- 绑定手机入口随短信通道暂停（2026-09-09）
                <button class="btn ghost" id="pi-bind">📱 ${u.phoneBound ? '换绑手机' : '绑定手机'}</button>
                -->
                <button class="btn ghost" id="pi-pw">${u.hasPassword ? '修改密码' : '设置密码'}</button>
                <button class="btn ghost" id="pi-settings">⚙ 设置</button>
            </div>
        `);

        document.getElementById('pi-copy').onclick = () => copyToClipboard(u.displayId);
        document.getElementById('pi-save').onclick = async () => {
            const v = document.getElementById('pi-nick-input').value.trim();
            if (v === (u.nickname || u.username)) return U.toast('昵称未变');
            try {
                const r = await API.setNickname(v);
                app.user.nickname = r.nickname;
                document.getElementById('pi-nick').textContent = r.nickname;
                app.refresh();
                U.toast('昵称已更新');
            } catch (e) { U.toast(e.message); }
        };
        // 绑定手机按钮已随短信通道下线（元素不存在时安全跳过）
        const bindBtn = document.getElementById('pi-bind');
        if (bindBtn) bindBtn.onclick = () => app.bindPhone();
        document.getElementById('pi-pw').onclick = () => app.setPassword();
        document.getElementById('pi-settings').onclick = () => SettingsView.open(app);
    }
};

// 头像：参数字（昵称 hash 决定配色），用 SVG 画个小 Q 版骑士头盔
function avatarSVG(user) {
    const seed = (user.nickname || user.username || '?').split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
    const palette = [
        ['#5b8cff', '#1c3a8c'], ['#ff7a8b', '#7a1c3a'], ['#7adf7a', '#1c5c1c'],
        ['#ffd56b', '#7a4c1c'], ['#b78bff', '#3a1c7a'], ['#5cc7ff', '#1c4a7a'],
    ];
    const [c1, c2] = palette[seed % palette.length];
    return `<svg viewBox="0 0 64 64" width="64" height="64">
        <defs>
            <linearGradient id="av${seed}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${c1}"/>
                <stop offset="1" stop-color="${c2}"/>
            </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill="url(#av${seed})" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
        <path d="M16 28 Q32 14 48 28 L48 36 Q32 24 16 36 Z" fill="#cfd2e2" stroke="#7c8099" stroke-width="1"/>
        <rect x="20" y="28" width="24" height="14" rx="2" fill="url(#av${seed})"/>
        <ellipse cx="26" cy="35" rx="3" ry="3.5" fill="#0a0a14"/>
        <ellipse cx="38" cy="35" rx="3" ry="3.5" fill="#0a0a14"/>
        <circle cx="25" cy="33.5" r="0.8" fill="#fff"/>
        <circle cx="37" cy="33.5" r="0.8" fill="#fff"/>
        <path d="M27 42 Q32 44 37 42" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <path d="M14 50 Q32 60 50 50" fill="#7c8099"/>
    </svg>`;
}

// 缩略头像：用于阵容卡片
function portraitSVG(tpl, star) {
    const seed = (tpl.id || '').split('').reduce((s, c) => s * 17 + c.charCodeAt(0), 1) >>> 0;
    const palette = ['#5b8cff', '#ff7a8b', '#7adf7a', '#ffd56b', '#b78bff', '#5cc7ff', '#ff9d5c', '#ff5252'];
    const c1 = palette[seed % palette.length];
    const c2 = palette[(seed >> 3) % palette.length];
    return `<svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs><linearGradient id="p${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
        <rect width="40" height="40" fill="url(#p${seed})"/>
        <ellipse cx="20" cy="17" rx="9" ry="9" fill="#ffe4d0"/>
        <ellipse cx="16" cy="17" rx="2" ry="2.4" fill="#0a0a14"/>
        <ellipse cx="24" cy="17" rx="2" ry="2.4" fill="#0a0a14"/>
        <ellipse cx="16.5" cy="16" r="0.6" fill="#fff"/>
        <ellipse cx="24.5" cy="16" r="0.6" fill="#fff"/>
        <path d="M16 22 Q20 24 24 22" stroke="#a04848" stroke-width="1" fill="none" stroke-linecap="round"/>
        <path d="M6 35 Q20 30 34 35 L34 40 L6 40 Z" fill="#3a2c5e"/>
    </svg>`;
}

function esc(s) { return String(s || '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])); }
function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => U.toast('已复制 ' + text));
    } else {
        const t = document.createElement('textarea');
        t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); U.toast('已复制 ' + text); } catch (e) { U.toast('复制失败'); }
        t.remove();
    }
}

// heroes 缓存（app.refresh 时也会更新到全局 DB_LOCAL）
const DB_LOCAL = { heroes: [] };
window.PersonalView = PersonalView;
