// 游戏设置：音乐/战斗飘字开关、礼包码、隐私政策、用户协议、小游戏、账号注销
const SettingsView = {
    open(app) {
        const prefs = getPrefs();
        U.openModal(`
            <h3>游戏设置</h3>
            <div class="settings-group">
                <div class="settings-label">系统设置</div>
                <div class="settings-row">
                    <span class="set-name">音乐</span>
                    <label class="toggle"><input type="checkbox" id="s-music" ${prefs.music ? 'checked' : ''}><span></span></label>
                </div>
                <div class="settings-row">
                    <span class="set-name">战斗飘字</span>
                    <label class="toggle"><input type="checkbox" id="s-float" ${prefs.floatText ? 'checked' : ''}><span></span></label>
                </div>
                <div class="settings-row">
                    <span class="set-name">震动反馈</span>
                    <label class="toggle"><input type="checkbox" id="s-vibrate" ${prefs.vibrate ? 'checked' : ''}><span></span></label>
                </div>
            </div>

            <div class="settings-icons">
                <div class="set-tile" data-act="gift">
                    <div class="set-tile-ico">🎁</div>
                    <div>礼包码</div>
                </div>
                <div class="set-tile" data-act="mini">
                    <div class="set-tile-ico">🎮</div>
                    <div>小游戏</div>
                </div>
                <div class="set-tile" data-act="emu">
                    <div class="set-tile-ico">🕹️</div>
                    <div>经典模拟器</div>
                </div>
                <div class="set-tile" data-act="arcade">
                    <div class="set-tile-ico">🎰</div>
                    <div>街机模拟器</div>
                </div>
                <div class="set-tile" data-act="pk32">
                    <div class="set-tile-ico">🗃️</div>
                    <div>PK32 原版迁移</div>
                </div>
                <div class="set-tile" data-act="tavern">
                    <div class="set-tile-ico">🍺</div>
                    <div>AI 酒馆</div>
                </div>
                <div class="set-tile" data-act="privacy">
                    <div class="set-tile-ico">📜</div>
                    <div>隐私政策</div>
                </div>
                <div class="set-tile" data-act="agreement">
                    <div class="set-tile-ico">📄</div>
                    <div>用户协议</div>
                </div>
                <div class="set-tile" data-act="support">
                    <div class="set-tile-ico">💬</div>
                    <div>客服</div>
                </div>
                <div class="set-tile" data-act="about">
                    <div class="set-tile-ico">ℹ️</div>
                    <div>关于</div>
                </div>
                <div class="set-tile danger" data-act="delete">
                    <div class="set-tile-ico">🗑</div>
                    <div>账号注销</div>
                </div>
                <div class="set-tile" data-act="logout">
                    <div class="set-tile-ico">🚪</div>
                    <div>退出登录</div>
                </div>
            </div>
        `);

        // 开关事件
        document.getElementById('s-music').onchange = e => { prefs.music = e.target.checked; savePrefs(prefs); U.toast(prefs.music ? '音乐已开' : '音乐已关'); };
        document.getElementById('s-float').onchange = e => { prefs.floatText = e.target.checked; savePrefs(prefs); U.toast(prefs.floatText ? '战斗飘字已开' : '战斗飘字已关'); };
        document.getElementById('s-vibrate').onchange = e => { prefs.vibrate = e.target.checked; savePrefs(prefs); };

        // 图标按钮
        document.querySelectorAll('.set-tile').forEach(t => {
            t.onclick = () => this.handleAct(t.dataset.act, app);
        });
    },

    handleAct(act, app) {
        if (act === 'mini') {
            U.closeModal();
            MinigamesView.open(app);
        } else if (act === 'emu') {
            this.openEmulator(app);
        } else if (act === 'arcade') {
            this.openArcade(app);
        } else if (act === 'pk32') {
            this.openPk32(app);
        } else if (act === 'tavern') {
            this.openTavern(app);
        } else if (act === 'privacy') {
            this.showDoc('隐私政策', PRIVACY_DOC);
        } else if (act === 'agreement') {
            this.showDoc('用户协议', AGREEMENT_DOC);
        } else if (act === 'about') {
            this.showDoc('关于游戏', ABOUT_DOC);
        } else if (act === 'support') {
            this.showDoc('联系客服', '<p>游戏内问题请直接在 <b>聊天</b> 频道反馈。</p><p>邮箱：support@tower-odyssey.local</p><p>QQ 群：暂未开放</p>');
        } else if (act === 'gift') {
            this.giftCode(app);
        } else if (act === 'delete') {
            this.deleteAccount(app);
        } else if (act === 'logout') {
            U.closeModal();
            (async () => { try { await API.logout(); } catch (e) {} API.clearToken(); location.reload(); })();
        }
    },

    // 经典模拟器：独立全屏入口（不在小游戏列表里）
    openEmulator(app) {
        U.closeModal();
        const mask = U.el(`<div class="mini-mask" id="emu-mask">
            <div class="mini-topbar">
                <button class="btn-back" id="emu-back">‹ 返回</button>
                <div class="mini-title">🕹️ 经典模拟器</div>
                <div class="mini-score" id="emu-score"></div>
            </div>
            <div class="mini-stage" id="emu-stage"></div>
        </div>`);
        document.body.appendChild(mask);
        const stage = document.getElementById('emu-stage');
        const scoreEl = document.getElementById('emu-score');
        const close = () => mask.remove();
        document.getElementById('emu-back').onclick = close;
        try {
            const game = window.MiniGames && window.MiniGames.emulator;
            if (!game) throw new Error('未加载到模拟器模块');
            const inst = game.start(stage, { onScore: s => { scoreEl.textContent = s != null ? s : ''; } });
            inst && (inst._close = close);
        } catch (e) {
            stage.innerHTML = `<div style="padding:30px;color:#ff7a8b">启动失败：${e.message}</div>`;
        }
    },

    // 街机模拟器：独立全屏入口（只列 fbneo 等街机核心，突出 BIOS 缺失警告）
    openArcade(app) {
        U.closeModal();
        const mask = U.el(`<div class="mini-mask" id="arc-mask">
            <div class="mini-topbar">
                <button class="btn-back" id="arc-back">‹ 返回</button>
                <div class="mini-title">🎰 街机模拟器</div>
                <div class="mini-score" id="arc-score"></div>
            </div>
            <div class="mini-stage" id="arc-stage"></div>
        </div>`);
        document.body.appendChild(mask);
        const stage = document.getElementById('arc-stage');
        const scoreEl = document.getElementById('arc-score');
        const close = () => mask.remove();
        document.getElementById('arc-back').onclick = close;
        try {
            const game = window.MiniGames && window.MiniGames.arcade;
            if (!game) throw new Error('未加载到街机模拟器模块');
            const inst = game.start(stage, { onScore: s => { scoreEl.textContent = s != null ? s : ''; } });
            inst && (inst._close = close);
        } catch (e) {
            stage.innerHTML = `<div style="padding:30px;color:#ff7a8b">启动失败：${e.message}</div>`;
        }
    },

    // PK32 原版迁移馆：独立于小游戏关卡系统，按原版流程逐款接入
    openPk32(app) {
        U.closeModal();
        const mask = U.el(`<div class="mini-mask" id="pk32-mask">
            <div class="mini-topbar">
                <button class="btn-back" id="pk32-back">‹ 返回</button>
                <div class="mini-title">🗃️ PK32 原版迁移</div>
                <div class="mini-score" id="pk32-score"></div>
            </div>
            <div class="mini-stage" id="pk32-stage"></div>
        </div>`);
        document.body.appendChild(mask);
        const stage = document.getElementById('pk32-stage');
        const scoreEl = document.getElementById('pk32-score');
        let inst = null;
        const close = () => { try { inst && inst.stop && inst.stop(); } catch (e) {} mask.remove(); };
        document.getElementById('pk32-back').onclick = close;
        try {
            const game = window.MiniGames && window.MiniGames.pk32;
            if (!game) throw new Error('未加载到 PK32 迁移模块');
            inst = game.start(stage, { onScore: s => { scoreEl.textContent = s != null ? s : ''; } });
        } catch (e) {
            stage.innerHTML = `<div style="padding:30px;color:#ff7a8b">启动失败：${e.message}</div>`;
        }
    },

    // AI 酒馆（SillyTavern）：同域反向代理 iframe，网关层已做登录鉴权 + SSO 自动登录
    openTavern(app) {
        U.closeModal();
        const mask = U.el(`<div class="mini-mask" id="tav-mask">
            <div class="mini-topbar">
                <button class="btn-back" id="tav-back">‹ 返回</button>
                <div class="mini-title">🍺 AI 酒馆</div>
                <div class="mini-score" id="tav-score"></div>
            </div>
            <div class="mini-stage" id="tav-stage" style="padding:0"></div>
        </div>`);
        document.body.appendChild(mask);
        const stage = document.getElementById('tav-stage');
        const scoreEl = document.getElementById('tav-score');
        const close = () => mask.remove();
        document.getElementById('tav-back').onclick = close;

        stage.innerHTML = '<div class="emu-empty">正在检查 SillyTavern 服务…</div>';
        const tk = (typeof localStorage !== 'undefined' && localStorage.getItem('game-token')) || '';
        fetch('/api/tavern/status', { headers: { Authorization: 'Bearer ' + tk } })
            .then(r => (r.ok ? r.json() : Promise.reject(new Error('状态查询失败'))))
            .then(st => {
                if (!document.body.contains(mask)) return;
                if (!st.online) {
                    stage.innerHTML =
                        `<div style="padding:26px;font-size:13px;line-height:2;color:#c9d4e3">
                            <h3 style="color:#ffd56b;margin:0 0 12px">🍺 AI 酒馆未启动</h3>
                            <div style="color:#ffb37a;margin-bottom:10px">${esc(st.note || '连不上 SillyTavern')}</div>
                            <div style="color:#7f8da3;font-size:12px">
                                请联系管理员：在 SillyTavern 目录执行 <code style="background:#0d1218;padding:2px 6px;border-radius:4px">node server.js</code>
                                （<b>不要</b>加 --listen，那会监听所有网卡、把能改 API Key 的面板暴露到公网）。<br>
                                管理员可在<b>管理后台 → AI 酒馆</b>页直接配置地址与账号，改完立即生效、无需重启。<br>
                                启动后刷新本页。
                            </div>
                        </div>`;
                    return;
                }
                // 注意：不要把管理员句柄显示给玩家，只在账号没打通时给个提示
                if (st.admin && !st.admin.ok) {
                    scoreEl.textContent = '⚠ 账号未打通';
                } else if (!st.hasPassword) {
                    scoreEl.textContent = '👥 共享账号模式';
                } else {
                    scoreEl.textContent = '👤 已自动登录';
                }
                stage.innerHTML = '';
                const frame = document.createElement('iframe');
                frame.style.cssText = 'width:100%;height:100%;border:0;background:#0a0a14';
                // 走 /tavern 而非直连 8000：同域，cookie/CSRF 都不会出问题
                frame.src = '/tavern/';
                stage.appendChild(frame);
            })
            .catch(e => {
                if (document.body.contains(mask)) {
                    stage.innerHTML = `<div style="padding:26px;color:#ff7a8b">无法获取酒馆状态：${esc(e.message)}</div>`;
                }
            });
    },

    showDoc(title, html) {
        U.openModal(`<h3>${title}</h3><div class="doc-text">${html}</div><div class="modal-actions"><button class="btn" onclick="U.closeModal()">关闭</button></div>`);
    },

    // 礼包码：粘到 main 区域，关闭设置弹窗
    giftCode(app) {
        U.closeModal();
        const root = document.getElementById('page-content');
        root.innerHTML = `
            <div class="section-title">🎁 礼包码兑换</div>
            <div class="card">
                <p style="color:#b9b3d8;font-size:12px;line-height:1.7">输入礼包码领取奖励，每个码每账号限领一次，奖励通过邮件发放。</p>
                <div class="sms-row" style="margin-top:10px">
                    <input id="gc-input" maxlength="32" placeholder="请输入礼包码（区分大小写）" style="text-transform:uppercase">
                    <button class="btn ghost" id="gc-submit">兑换</button>
                </div>
                <div id="gc-log" style="margin-top:10px;font-size:12px;color:#7cfc7c;line-height:1.7"></div>
            </div>
            <div style="text-align:center;margin-top:14px"><button class="btn ghost" onclick="App.switchTab(App.tab)">返回</button></div>
        `;
        const inp = document.getElementById('gc-input');
        const log = document.getElementById('gc-log');
        document.getElementById('gc-submit').onclick = async () => {
            const code = inp.value.trim();
            if (!code) return U.toast('请输入礼包码');
            try {
                const r = await API.giftRedeem(code);
                log.innerHTML = `<div>✔ 兑换成功！奖励已通过邮件发放，<a style="color:#ffd56b" onclick="MailView.open(App)">查看邮件</a></div>`;
                inp.value = '';
                U.toast('兑换成功');
            } catch (e) { log.innerHTML = `<div style="color:#ff7a8b">✗ ${esc(e.message)}</div>`; }
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('gc-submit').click(); });
        inp.focus();
    },

    async deleteAccount(app) {
        U.openModal(`
            <h3>账号注销</h3>
            <div class="card" style="color:#ff7a8b;line-height:1.7">
                ⚠ 注销后账号将永久删除，所有数据（英雄、装备、邮件、聊天记录）不可恢复。<br>
                请确认后再操作。
            </div>
            <div style="margin-top:10px">
                <input id="da-pw" type="password" placeholder="请输入登录密码确认">
            </div>
            <div style="margin-top:8px">
                <input id="da-confirm" placeholder="请输入「确认注销」四个字">
            </div>
            <div class="modal-actions" style="margin-top:14px;display:flex;gap:8px">
                <button class="btn ghost" onclick="U.closeModal()">取消</button>
                <button class="btn danger" id="da-go" style="background:#d83a3a">确认注销</button>
            </div>
        `);
        document.getElementById('da-go').onclick = async () => {
            const pw = document.getElementById('da-pw').value;
            const cf = document.getElementById('da-confirm').value.trim();
            if (cf !== '确认注销') return U.toast('请输入「确认注销」');
            if (!pw) return U.toast('请输入密码');
            try {
                await API.accountDelete(pw);
                U.toast('账号已注销');
                setTimeout(() => location.reload(), 800);
            } catch (e) { U.toast(e.message); }
        };
    }
};

// 偏好：localStorage 持久化
function getPrefs() {
    try {
        return Object.assign({ music: false, floatText: true, vibrate: true }, JSON.parse(localStorage.getItem('tower-odyssey.prefs') || '{}'));
    } catch (e) { return { music: false, floatText: true, vibrate: true }; }
}
function savePrefs(p) { localStorage.setItem('tower-odyssey.prefs', JSON.stringify(p)); }

// 文案
const PRIVACY_DOC = `
<p style="color:#b9b3d8;line-height:1.8">塔界远征（以下简称"本游戏"）尊重并保护所有使用本游戏服务用户的个人隐私权。</p>
<h4>1. 信息收集</h4>
<p>本游戏在您注册账号时收集您的账号名、密码哈希、手机号（可选）、展示 ID 等必要信息。游戏过程数据（英雄、装备、资源、邮件）存储于服务器数据库。</p>
<h4>2. 信息使用</h4>
<p>收集的信息仅用于：账号登录与验证、游戏数据保存、客服支持、违规行为排查。不会用于商业广告或转售给第三方。</p>
<h4>3. 信息存储</h4>
<p>您的数据存储在自建服务器，您可以随时通过游戏内"账号注销"功能永久删除账号及全部关联数据。</p>
<h4>4. 免责声明</h4>
<p>本游戏为娱乐性质，请合理安排游戏时间。未成年人应在监护人陪同下使用。</p>
<p style="color:#888;margin-top:14px">最后更新：2026-09</p>`;
const AGREEMENT_DOC = `
<p style="color:#b9b3d8;line-height:1.8">欢迎使用塔界远征（以下简称"本游戏"）。在使用本游戏前，请仔细阅读本协议。</p>
<h4>1. 账号规则</h4>
<p>每个玩家可注册一个账号。账号、密码由您自行保管，因保管不善造成的损失由您自行承担。账号可随时通过"账号注销"功能删除。</p>
<h4>2. 行为规范</h4>
<p>您承诺不利用本游戏从事违反法律法规、扰乱游戏秩序、侵犯他人权益的行为。聊天频道禁止发布违法、淫秽、暴力、歧视、骚扰、广告等内容。</p>
<h4>3. 虚拟物品</h4>
<p>游戏内的钻石、金币、装备等均为虚拟物品，仅限本游戏内使用。本游戏不提供虚拟物品的现金交易、回购服务。</p>
<h4>4. 服务变更</h4>
<p>运营方保留根据法律法规变更、业务调整等原因修改或中止本游戏服务的权利。重大变更将提前公告。</p>
<p style="color:#888;margin-top:14px">最后更新：2026-09</p>`;
const ABOUT_DOC = `
<p><b>塔界远征</b> v1.0.0</p>
<p>一款零依赖的肉鸽推塔游戏。200 层冒险、5 系英雄、7 阶装备、部落远征。</p>
<p>技术栈：Node.js + 原生 JS（无任何前端框架）</p>
<p style="color:#888;margin-top:14px">© 2026 塔界远征</p>`;

function esc(s) { return String(s || '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])); }

window.SettingsView = SettingsView;
