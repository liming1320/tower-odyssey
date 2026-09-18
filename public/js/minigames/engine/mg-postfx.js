// 小游戏引擎 · 后处理合成层（mg-postfx.js）—— 画质 A2
window.MG = window.MG || {}; var MG = window.MG;
// 在 paint() 末尾对主画布做合成后处理：暗角 + 扫描线(复古) + bloom 近似(柔光/复古)。
// opt-in：由 MG.settings.postfx 控制（off / soft / retro），尊重减弱动效与画质。
MG.postfx = {
    mode: 'off',            // off / soft / retro
    _cv: null, _vg: null, _vgKey: '', _scan: null, _scanKey: '',
    setMode(m) { this.mode = (m === 'soft' || m === 'retro') ? m : 'off'; if (MG.settings) MG.settings.postfx = this.mode; },
    enabled() { return this.mode !== 'off' && (!MG.a11y || !MG.a11y.reducedMotion); },
    _vignette(ctx, dw, dh) {
        const k = dw + 'x' + dh;
        if (this._vgKey !== k) {
            const g = ctx.createRadialGradient(dw / 2, dh / 2, Math.min(dw, dh) * 0.42, dw / 2, dh / 2, Math.max(dw, dh) * 0.72);
            g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.30)');
            this._vg = g; this._vgKey = k;
        }
        ctx.fillStyle = this._vg; ctx.fillRect(0, 0, dw, dh);
    },
    _scanlines(ctx, dw, dh) {
        const k = dw + 'x' + dh;
        if (this._scanKey !== k) {
            const c = document.createElement('canvas'); c.width = 4; c.height = 4;
            const x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(0, 3, 4, 1);
            this._scan = ctx.createPattern(c, 'repeat'); this._scanKey = k;
        }
        ctx.fillStyle = this._scan; ctx.fillRect(0, 0, dw, dh);
    },
    frame(ctx, c, W, H) {
        if (!this.enabled() || !c) return;
        try {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            const dw = c.width, dh = c.height;
            // bloom 近似：复制主画布到 1/4 离屏 → 放大叠加 'lighter'（仅高画质做，避免低端机压力）
            const q = (typeof MG._quality === 'number') ? MG._quality : 1;
            if (q >= 0.8) {
                if (!this._cv) this._cv = document.createElement('canvas');
                const oc = this._cv, bw = Math.max(1, dw >> 2), bh = Math.max(1, dh >> 2);
                if (oc.width !== bw || oc.height !== bh) { oc.width = bw; oc.height = bh; }
                const o = oc.getContext('2d');
                o.clearRect(0, 0, bw, bh);
                o.drawImage(c, 0, 0, bw, bh);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = this.mode === 'retro' ? 0.45 : 0.28;
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(oc, 0, 0, dw, dh);
                ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
            }
            this._vignette(ctx, dw, dh);
            if (this.mode === 'retro') this._scanlines(ctx, dw, dh);
            ctx.restore();
        } catch (e) { try { ctx.restore(); } catch (_) {} }
    },
};
try { if (MG.settings && MG.settings.postfx) MG.postfx.setMode(MG.settings.postfx); } catch (e) {}
