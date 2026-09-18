// 小游戏引擎 · 设置 + 无障碍（mg-settings.js）—— Tier1-2 + 画质/玩法/健壮性增强
window.MG = window.MG || {}; var MG = window.MG;
// 全局无障碍开关（减弱动效 / 色盲安全色 / 大字号），特效与 UI 读取
MG.a11y = { reducedMotion: false, colorblind: false, largeText: false };
MG.settings = {
    volume: 0.42, haptics: true, autoQuality: true,
    // —— 增强轮新增（A 画质 / B 玩法 / C 健壮性）——
    postfx: 'off',        // 后处理：off / soft / retro
    pixelated: false,     // 像素风（硬边放大，复古游戏）
    renderScale: 1,       // 渲染倍率 0.75~1.5（性能/画质权衡）
    dynamicBg: false,     // 动态背景（A3）
    skin: 'default',      // 调色板皮肤（A5）
    assist: false,        // 辅助模式（B8）
    perfGuard: false,     // 性能预算守卫（F3）
    lang: 'zh',           // 界面语言（C13）
    KEY: 'mg-settings-v1', AKEY: 'mg-a11y-v1', LKEY: 'mg-lang-v1',
    load() {
        try { const o = JSON.parse(localStorage.getItem(this.KEY) || '{}'); if (o && typeof o === 'object') Object.assign(this, o); } catch (e) {}
        try { const a = JSON.parse(localStorage.getItem(this.AKEY) || '{}'); if (a && typeof a === 'object') Object.assign(MG.a11y, a); } catch (e) {}
        try { const l = localStorage.getItem(this.LKEY); if (l) this.lang = l; } catch (e) {}
        this._apply();
    },
    save() {
        try {
            localStorage.setItem(this.KEY, JSON.stringify({
                volume: this.volume, haptics: this.haptics, autoQuality: this.autoQuality,
                postfx: this.postfx, pixelated: this.pixelated, renderScale: this.renderScale,
                dynamicBg: this.dynamicBg, skin: this.skin, assist: this.assist, perfGuard: this.perfGuard,
            }));
        } catch (e) {}
    },
    setVolume(v) { this.volume = Math.max(0, Math.min(1, +v || 0)); try { MG.audio && MG.audio.setVolume && MG.audio.setVolume(this.volume); } catch (e) {} this.save(); },
    setHaptics(v) { this.haptics = !!v; this.save(); },
    setAutoQuality(v) { this.autoQuality = !!v; this.save(); },
    setA11y(k, v) { MG.a11y[k] = !!v; try { localStorage.setItem(this.AKEY, JSON.stringify(MG.a11y)); } catch (e) {} },
    setPostfx(m) { this.postfx = (m === 'soft' || m === 'retro') ? m : 'off'; try { MG.postfx && MG.postfx.setMode(this.postfx); } catch (e) {} this.save(); },
    setPixelated(v) { this.pixelated = !!v; this.save(); },
    setRenderScale(v) { this.renderScale = Math.max(0.75, Math.min(1.5, +v || 1)); this.save(); },
    setDynamicBg(v) { this.dynamicBg = !!v; try { MG.bg && MG.bg.set(this.dynamicBg); } catch (e) {} this.save(); },
    setSkin(n) { this.skin = n || 'default'; try { MG.skin && MG.skin.set(this.skin); } catch (e) {} this.save(); },
    setAssist(v) { this.assist = !!v; try { MG.assist && MG.assist.set(this.assist); } catch (e) {} this.save(); },
    setPerfGuard(v) { this.perfGuard = !!v; try { MG.perfGuard && MG.perfGuard.set(this.perfGuard); } catch (e) {} this.save(); },
    setLang(l) { this.lang = l || 'zh'; try { localStorage.setItem(this.LKEY, this.lang); MG.i18n && MG.i18n.set(null, this.lang); } catch (e) {} },
    // 设置云同步（C12）：登录用户把设置/无障碍同步到账号（端点缺失则静默）
    sync() {
        try {
            const body = JSON.stringify({
                volume: this.volume, haptics: this.haptics, autoQuality: this.autoQuality,
                postfx: this.postfx, pixelated: this.pixelated, renderScale: this.renderScale,
                dynamicBg: this.dynamicBg, skin: this.skin, assist: this.assist, lang: this.lang, a11y: MG.a11y,
            });
            fetch('/api/minigame/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(function () {});
        } catch (e) {}
    },
    _apply() {
        try { MG.audio && MG.audio.setVolume && MG.audio.setVolume(this.volume); } catch (e) {}
        // 包裹 MG.haptics，使其受「震动开关」控制（默认开启）
        const _orig = MG.haptics;
        if (_orig && !_orig.__wrapped) {
            const wrap = function (p) { if (MG.settings.haptics) return _orig(p); };
            wrap.tap = _orig.tap; wrap.hit = _orig.hit; wrap.bomb = _orig.bomb; wrap.win = _orig.win; wrap.lose = _orig.lose; wrap.P = _orig.P; wrap.__wrapped = true;
            MG.haptics = wrap;
        }
        // 同步新增模块（它们可能在 settings.load() 之前尚未定义，故各自在底部也 self-sync）
        try { MG.postfx && MG.postfx.setMode(this.postfx); } catch (e) {}
        try { MG.bg && MG.bg.set(this.dynamicBg); } catch (e) {}
        try { MG.skin && MG.skin.set(this.skin); } catch (e) {}
        try { MG.assist && MG.assist.set(this.assist); } catch (e) {}
    },
    // 小齿轮面板（opt-in）：游戏/选关页调用 MG.settings.gear(container) 挂一个设置按钮
    gear(container) {
        if (!container || container.querySelector('.mg-gear')) return null;
        const wrap = document.createElement('div'); wrap.className = 'mg-gear';
        let html = '<button class="mg-gear-btn" title="设置" aria-label="设置">⚙</button><div class="mg-gear-panel" hidden>';
        html += '<label>音量 <input type="range" min="0" max="1" step="0.01" value="' + this.volume + '"></label>';
        html += '<label><input type="checkbox" ' + (this.haptics ? 'checked' : '') + '> 震动</label>';
        html += '<label><input type="checkbox" ' + (this.autoQuality ? 'checked' : '') + '> 自动画质</label>';
        html += '<label>后处理 <select data-kind="postfx"><option value="off"' + (this.postfx === 'off' ? ' selected' : '') + '>关</option><option value="soft"' + (this.postfx === 'soft' ? ' selected' : '') + '>柔光</option><option value="retro"' + (this.postfx === 'retro' ? ' selected' : '') + '>复古CRT</option></select></label>';
        html += '<label><input type="checkbox" ' + (this.pixelated ? 'checked' : '') + '> 像素风</label>';
        html += '<label>渲染 <input type="range" min="0.75" max="1.5" step="0.05" value="' + this.renderScale + '"></label>';
        html += '<label><input type="checkbox" ' + (this.dynamicBg ? 'checked' : '') + '> 动态背景</label>';
        html += '<label>皮肤 <select data-kind="skin"><option value="default"' + (this.skin === 'default' ? ' selected' : '') + '>默认</option><option value="neon">霓虹</option><option value="sunset">日落</option><option value="midnight">午夜</option><option value="mono">极简</option></select></label>';
        html += '<label><input type="checkbox" ' + (this.assist ? 'checked' : '') + '> 辅助模式</label>';
        html += '<label><input type="checkbox" ' + (this.perfGuard ? 'checked' : '') + ' data-kind="perfGuard"> 性能预算守卫</label>';
        const langs = (MG.i18n && MG.i18n.languages) || [{ id: 'zh', name: '中文' }];
        html += '<label>语言 <select data-kind="lang">' + langs.map(function (l) { return '<option value="' + l.id + '"' + (l.id === MG.settings.lang ? ' selected' : '') + '>' + l.name + '</option>'; }).join('') + '</select></label>';
        html += '<label><input type="checkbox" ' + (MG.a11y.reducedMotion ? 'checked' : '') + '> 减弱动效</label>';
        html += '<label><input type="checkbox" ' + (MG.a11y.colorblind ? 'checked' : '') + '> 色盲安全色</label>';
        html += '<label><input type="checkbox" ' + (MG.a11y.largeText ? 'checked' : '') + '> 大字号</label>';
        html += '</div>';
        wrap.innerHTML = html;
        const btn = wrap.querySelector('.mg-gear-btn');
        const panel = wrap.querySelector('.mg-gear-panel');
        btn.onclick = () => { panel.hidden = !panel.hidden; };
        const vol = wrap.querySelector('input[type=range]'); vol.oninput = () => this.setVolume(+vol.value);
        const chks = wrap.querySelectorAll('input[type=checkbox]:not([data-kind])');
        const map = ['haptics', 'autoQuality', 'pixelated', 'dynamicBg', 'assist', 'reducedMotion', 'colorblind', 'largeText'];
        chks.forEach((c, i) => { c.onchange = () => { if (i === 0) this.setHaptics(c.checked); else if (i === 1) this.setAutoQuality(c.checked); else if (i === 2) this.setPixelated(c.checked); else if (i === 3) this.setDynamicBg(c.checked); else if (i === 4) this.setAssist(c.checked); else this.setA11y(map[i], c.checked); }; });
        const _pg = wrap.querySelector('input[type=checkbox][data-kind="perfGuard"]'); if (_pg) _pg.onchange = () => this.setPerfGuard(_pg.checked);
        const sels = wrap.querySelectorAll('select');
        sels.forEach((s) => { s.onchange = () => { const k = s.getAttribute('data-kind'); if (k === 'postfx') this.setPostfx(s.value); else if (k === 'skin') this.setSkin(s.value); else if (k === 'lang') this.setLang(s.value); }; });
        container.appendChild(wrap);
        return wrap;
    },
};
MG.settings.load();
