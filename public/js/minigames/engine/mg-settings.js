// 小游戏引擎 · 设置 + 无障碍（mg-settings.js）—— Tier1-2
window.MG = window.MG || {}; var MG = window.MG;
// 全局无障碍开关（减弱动效 / 色盲安全色 / 大字号），特效与 UI 读取
MG.a11y = { reducedMotion: false, colorblind: false, largeText: false };
MG.settings = {
    volume: 0.42, haptics: true, autoQuality: true,
    KEY: 'mg-settings-v1', AKEY: 'mg-a11y-v1',
    load() {
        try { const o = JSON.parse(localStorage.getItem(this.KEY) || '{}'); if (o && typeof o === 'object') Object.assign(this, o); } catch (e) {}
        try { const a = JSON.parse(localStorage.getItem(this.AKEY) || '{}'); if (a && typeof a === 'object') Object.assign(MG.a11y, a); } catch (e) {}
        this._apply();
    },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify({ volume: this.volume, haptics: this.haptics, autoQuality: this.autoQuality })); } catch (e) {} },
    setVolume(v) { this.volume = Math.max(0, Math.min(1, +v || 0)); try { MG.audio && MG.audio.setVolume && MG.audio.setVolume(this.volume); } catch (e) {} this.save(); },
    setHaptics(v) { this.haptics = !!v; this.save(); },
    setAutoQuality(v) { this.autoQuality = !!v; this.save(); },
    setA11y(k, v) { MG.a11y[k] = !!v; try { localStorage.setItem(this.AKEY, JSON.stringify(MG.a11y)); } catch (e) {} },
    _apply() {
        try { MG.audio && MG.audio.setVolume && MG.audio.setVolume(this.volume); } catch (e) {}
        // 包裹 MG.haptics，使其受「震动开关」控制（默认开启）
        const _orig = MG.haptics;
        if (_orig && !_orig.__wrapped) {
            const wrap = function (p) { if (MG.settings.haptics) return _orig(p); };
            wrap.tap = _orig.tap; wrap.hit = _orig.hit; wrap.bomb = _orig.bomb; wrap.win = _orig.win; wrap.lose = _orig.lose; wrap.P = _orig.P; wrap.__wrapped = true;
            MG.haptics = wrap;
        }
    },
    // 小齿轮面板（opt-in）：游戏/选关页调用 MG.settings.gear(container) 挂一个设置按钮
    gear(container) {
        if (!container || container.querySelector('.mg-gear')) return null;
        const wrap = document.createElement('div'); wrap.className = 'mg-gear';
        wrap.innerHTML =
            '<button class="mg-gear-btn" title="设置" aria-label="设置">⚙</button>' +
            '<div class="mg-gear-panel" hidden>' +
            '<label>音量 <input type="range" min="0" max="1" step="0.01" value="' + this.volume + '"></label>' +
            '<label><input type="checkbox" ' + (this.haptics ? 'checked' : '') + '> 震动</label>' +
            '<label><input type="checkbox" ' + (this.autoQuality ? 'checked' : '') + '> 自动画质</label>' +
            '<label><input type="checkbox" ' + (MG.a11y.reducedMotion ? 'checked' : '') + '> 减弱动效</label>' +
            '<label><input type="checkbox" ' + (MG.a11y.colorblind ? 'checked' : '') + '> 色盲安全色</label>' +
            '<label><input type="checkbox" ' + (MG.a11y.largeText ? 'checked' : '') + '> 大字号</label>' +
            '</div>';
        const btn = wrap.querySelector('.mg-gear-btn');
        const panel = wrap.querySelector('.mg-gear-panel');
        btn.onclick = () => { panel.hidden = !panel.hidden; };
        const vol = wrap.querySelector('input[type=range]'); vol.oninput = () => this.setVolume(+vol.value);
        const chks = wrap.querySelectorAll('input[type=checkbox]');
        const map = ['haptics', 'autoQuality', 'reducedMotion', 'colorblind', 'largeText'];
        chks.forEach((c, i) => { c.onchange = () => { if (i === 0) this.setHaptics(c.checked); else if (i === 1) this.setAutoQuality(c.checked); else this.setA11y(map[i], c.checked); }; });
        container.appendChild(wrap);
        return wrap;
    },
};
MG.settings.load();
