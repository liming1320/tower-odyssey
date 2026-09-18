// 小游戏引擎 · 动态背景（mg-bg.js）—— 画质 A3
window.MG = window.MG || {}; var MG = window.MG;
// 引擎级动态背景：星空 / 极光 / 渐变漂流。opt-in（MG.settings.dynamicBg）。
// 在 paint() 清屏后、游戏绘制前调用 MG.bg.draw(ctx, W, H, t, scale)。
MG.bg = {
    on: false, theme: 'starfield', _stars: null,
    set(on, theme) { this.on = !!on; if (theme) this.theme = theme; if (this.on && !this._stars) this._seed(); },
    _seed() {
        const n = 60, a = [];
        for (let i = 0; i < n; i++) a.push({ x: Math.random(), y: Math.random(), r: 0.4 + Math.random() * 1.6, p: Math.random() * 6.28, s: 0.4 + Math.random() * 1.2 });
        this._stars = a;
    },
    draw(ctx, W, H, t, scale) {
        if (!this.on) return;
        const tt = (MG.a11y && MG.a11y.reducedMotion) ? 0 : (t || 0);
        try {
            ctx.save();
            if (this.theme === 'starfield') {
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#0b1430'); g.addColorStop(1, '#060a1c');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                if (!this._stars) this._seed();
                for (const st of this._stars) {
                    const tw = 0.5 + 0.5 * Math.sin(tt * st.s + st.p);
                    ctx.globalAlpha = 0.25 + tw * 0.6;
                    ctx.fillStyle = '#cfe0ff';
                    ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.r * (scale || 1), 0, 6.2832); ctx.fill();
                }
                ctx.globalAlpha = 1;
                const nx = W * (0.3 + 0.2 * Math.sin(tt * 0.05)), ny = H * (0.25 + 0.15 * Math.cos(tt * 0.04));
                const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, Math.max(W, H) * 0.5);
                ng.addColorStop(0, 'rgba(90,70,160,0.22)'); ng.addColorStop(1, 'rgba(90,70,160,0)');
                ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
            } else if (this.theme === 'aurora') {
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#04140f'); g.addColorStop(1, '#020a14');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                for (let i = 0; i < 3; i++) {
                    const yy = H * (0.25 + i * 0.18), col = ['rgba(80,220,160,', 'rgba(90,180,255,', 'rgba(180,120,255,'][i];
                    const ag = ctx.createLinearGradient(0, yy - 30, 0, yy + 30);
                    ag.addColorStop(0, col + '0)'); ag.addColorStop(0.5, col + '0.16)'); ag.addColorStop(1, col + '0)');
                    ctx.fillStyle = ag; ctx.fillRect(0, yy - 30, W, 60);
                }
            } else {
                const g = ctx.createLinearGradient(0, 0, W, H);
                g.addColorStop(0, 'hsl(' + (220 + Math.sin(tt * 0.1) * 20) + ',45%,16%)');
                g.addColorStop(1, 'hsl(' + (280 + Math.cos(tt * 0.08) * 24) + ',40%,10%)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            }
            ctx.restore();
        } catch (e) { try { ctx.restore(); } catch (_) {} }
    },
};
try { if (MG.settings) MG.bg.set(MG.settings.dynamicBg); } catch (e) {}
