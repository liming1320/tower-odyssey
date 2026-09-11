// 小游戏引擎 · 角色模块（mg-character.js）
// 职责：程序化人物系统（8 原型 + 发型/肤色/服装/表情/配饰/动画），由 seed 确定性生成。
window.MG = window.MG || {};
var MG = window.MG;

// ================= 角色系统（程序化人物，告别"圆头圆身子"）=================
// 8 种原型 + 发型/肤色/服装/表情/配饰/动画，全部由 seed 确定性生成。
// 用法：
//   const c = MG.char.gen(123);                 // 确定性角色
//   MG.char.draw(ctx, x, y, scale, c, { t:0, pose:'walk', expr:'happy' });
//   api.char.gallery(ctx, 20, 60, 44, 0.6);     // 一行陈列
// 各游戏零成本升级：小兵/敌人/玩家/NPC 直接换上，画风统一且可批量变化。
MG.char = {
    ARCH: ['chibi', 'human', 'robot', 'slime', 'cat', 'mecha', 'ghost', 'knight'],
    SKIN: ['#ffe0bd', '#f5cda0', '#e8b98a', '#c98e63', '#8a5a3b', '#caa0c0'],
    HAIR: ['#2b2b3a', '#5a3a22', '#caa14a', '#b33b5e', '#3a7d6e', '#7a5cff', '#e8e8f0', '#d8643a'],
    CLOTH: [['#5cc7ff', '#2a7fd0'], ['#ff8aa0', '#d8486a'], ['#7ee0a0', '#2f9e6a'], ['#ffd56b', '#d99a2b'], ['#b89cff', '#7a5cff'], ['#ff9d5c', '#e0642a'], ['#9fb3d0', '#5a7099'], ['#9ad8e0', '#3a9eb0']],
    EXPR: ['normal', 'smile', 'angry', 'surprise', 'focus', 'happy'],
    ACC: ['none', 'glasses', 'headband', 'crown', 'horn', 'hat'],
    _rng(seed) { let s = (seed | 0) || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    gen(seed) {
        const r = this._rng(seed == null ? (Math.random() * 1e9 | 0) : seed);
        const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
        const cloth = this.CLOTH[ri(0, this.CLOTH.length - 1)];
        return {
            arch: this.ARCH[ri(0, this.ARCH.length - 1)],
            skin: this.SKIN[ri(0, this.SKIN.length - 1)],
            hair: { style: ri(0, 4), color: this.HAIR[ri(0, this.HAIR.length - 1)] },
            cloth: { c1: cloth[0], c2: cloth[1] },
            accent: this.HAIR[ri(0, this.HAIR.length - 1)],
            eye: '#26324a', expr: this.EXPR[ri(0, 2)],
            acc: r() < 0.4 ? this.ACC[ri(1, this.ACC.length - 1)] : 'none',
            face: r() < 0.5 ? 1 : -1,
        };
    },
    // ---------- 基础绘制部件 ----------
    _hair(ctx, cx, cy, R, style, color) {
        ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round';
        const top = cy - R * 1.25;
        if (style === 0) {
            ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx, top + R * 0.3, R * 1.05, R * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        } else if (style === 1) {
            ctx.beginPath(); ctx.arc(cx, cy, R * 1.0, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
            for (let i = -2; i <= 2; i++) { ctx.lineWidth = R * 0.32; ctx.beginPath(); ctx.moveTo(cx + i * R * 0.34, top + R * 0.25); ctx.lineTo(cx + i * R * 0.34, top - R * 0.5); ctx.stroke(); }
        } else if (style === 2) {
            ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, Math.PI, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(cx - R * 1.02, cy); ctx.quadraticCurveTo(cx - R * 1.4, cy + R * 1.9, cx - R * 0.7, cy + R * 2.3); ctx.quadraticCurveTo(cx, cy + R * 1.6, cx + R * 0.7, cy + R * 2.3); ctx.quadraticCurveTo(cx + R * 1.4, cy + R * 1.9, cx + R * 1.02, cy); ctx.fill();
        } else if (style === 3) {
            ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx + R * 1.15, cy + R * 0.4, R * 0.42, R * 1.15, 0.3, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
            ctx.lineWidth = R * 0.24; ctx.beginPath(); ctx.moveTo(cx, top); ctx.quadraticCurveTo(cx + R * 0.3, top - R * 0.9, cx - R * 0.1, top - R * 1.4); ctx.stroke();
        }
    },
    _eye(ctx, ex, ey, R, ec, expr, blink) {
        if (blink) { ctx.strokeStyle = '#222'; ctx.lineWidth = R * 0.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex - R * 0.8, ey); ctx.quadraticCurveTo(ex, ey + R * 0.25, ex + R * 0.8, ey); ctx.stroke(); return; }
        const happy = (expr === 'happy' || expr === 'smile' || expr === 'focus');
        if (expr === 'surprise') {
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, R * 1.1, R * 1.2, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(ex, ey, R * 0.7, 0, Math.PI * 2); ctx.fill();
        } else if (expr === 'angry') {
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, R * 0.9, R * 0.8, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(ex + R * 0.15, ey + R * 0.1, R * 0.5, 0, Math.PI * 2); ctx.fill();
        } else if (happy) {
            ctx.strokeStyle = '#222'; ctx.lineWidth = R * 0.5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(ex, ey + R * 0.4, R * 0.95, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
            return;
        } else {
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, R, R * 1.15, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(ex, ey + R * 0.15, R * 0.62, 0, Math.PI * 2); ctx.fill();
        }
        if (expr !== 'happy') { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ex - R * 0.25, ey - R * 0.25, R * 0.22, 0, Math.PI * 2); ctx.fill(); }
    },
    _mouth(ctx, my, w, expr) {
        ctx.strokeStyle = '#7a3a3a'; ctx.fillStyle = '#7a3a3a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        if (expr === 'surprise') { ctx.beginPath(); ctx.ellipse(0, my, w * 0.5, w * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
        else if (expr === 'happy') { ctx.fillStyle = '#7a3a3a'; ctx.beginPath(); ctx.arc(0, my - w * 0.2, w * 0.6, Math.PI * 0.1, Math.PI * 0.9); ctx.fill(); }
        else if (expr === 'smile') { ctx.beginPath(); ctx.arc(0, my - 1, w * 0.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
        else if (expr === 'angry') { ctx.beginPath(); ctx.arc(0, my + w * 0.5, w * 0.6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
        else if (expr === 'focus') { ctx.beginPath(); ctx.moveTo(-w * 0.5, my); ctx.lineTo(w * 0.5, my); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(-w * 0.35, my); ctx.quadraticCurveTo(0, my + w * 0.25, w * 0.35, my); ctx.stroke(); }
    },
    _acc(ctx, hx, hy, R, acc, color) {
        if (!acc || acc === 'none') return;
        if (acc === 'glasses') { ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx - R * 0.42, hy + R * 0.12, R * 0.34, 0, Math.PI * 2); ctx.arc(hx + R * 0.42, hy + R * 0.12, R * 0.34, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(hx - R * 0.08, hy + R * 0.12); ctx.lineTo(hx + R * 0.08, hy + R * 0.12); ctx.stroke(); }
        else if (acc === 'headband') { ctx.fillStyle = color; ctx.fillRect(hx - R, hy + R * 0.45, R * 2, R * 0.28); }
        else if (acc === 'crown') { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(hx - R * 0.9, hy - R * 0.9); ctx.lineTo(hx - R * 0.5, hy - R * 1.35); ctx.lineTo(hx, hy - R * 0.95); ctx.lineTo(hx + R * 0.5, hy - R * 1.35); ctx.lineTo(hx + R * 0.9, hy - R * 0.9); ctx.closePath(); ctx.fill(); }
        else if (acc === 'horn') { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(hx - R * 0.5, hy - R * 0.8); ctx.lineTo(hx - R * 0.7, hy - R * 1.4); ctx.lineTo(hx - R * 0.2, hy - R * 0.95); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx + R * 0.5, hy - R * 0.8); ctx.lineTo(hx + R * 0.7, hy - R * 1.4); ctx.lineTo(hx + R * 0.2, hy - R * 0.95); ctx.fill(); }
        else if (acc === 'hat') { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(hx, hy - R * 0.7, R * 1.2, R * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx - R * 0.7, hy - R * 0.7); ctx.lineTo(hx - R * 0.1, hy - R * 1.7); ctx.lineTo(hx + R * 0.7, hy - R * 0.7); ctx.fill(); }
    },
    _head(ctx, c, hx, hy, R, opt, t) {
        const blink = !!(opt.blink || Math.sin(t * 2.7) > 0.97);
        let g = null; try { g = ctx.createRadialGradient(hx - R * 0.3, hy - R * 0.3, R * 0.2, hx, hy, R); g.addColorStop(0, MG.gfx.lighten(c.skin, 0.18)); g.addColorStop(1, MG.gfx.darken(c.skin, 0.08)); } catch (e) { }
        ctx.fillStyle = g || c.skin; ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(hx - R * 0.95, hy + R * 0.1, R * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(hx + R * 0.95, hy + R * 0.1, R * 0.22, 0, Math.PI * 2); ctx.fill();
        this._hair(ctx, hx, hy, R, c.hair ? c.hair.style : 0, c.hair ? c.hair.color : '#2b2b3a');
        const ey = hy + R * 0.12, ex = R * 0.42, eR = R * 0.26, exx = opt.expr || c.expr || 'normal';
        this._eye(ctx, hx - ex, ey, eR, c.eye || '#26324a', exx, blink);
        this._eye(ctx, hx + ex, ey, eR, c.eye || '#26324a', exx, blink);
        ctx.fillStyle = 'rgba(255,120,140,0.35)'; ctx.beginPath(); ctx.ellipse(hx - ex * 1.15, hy + R * 0.45, R * 0.18, R * 0.12, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(hx + ex * 1.15, hy + R * 0.45, R * 0.18, R * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        this._mouth(ctx, hy + R * 0.6, R * 0.5, exx);
        this._acc(ctx, hx, hy, R, c.acc, c.accent);
    },
    // ---------- 各原型 ----------
    _chibi(ctx, c, s, opt, t) {
        const R = 18 * s, bodyTop = -R * 1.8, bodyH = R * 1.4;
        let g = null; try { g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH); g.addColorStop(0, c.cloth.c1); g.addColorStop(1, c.cloth.c2); } catch (e) { }
        ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -11 * s, bodyTop, 22 * s, bodyH, 8 * s); ctx.fill();
        ctx.fillStyle = c.cloth.c2; ctx.beginPath(); ctx.ellipse(-12 * s, bodyTop + bodyH * 0.4, 4 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(12 * s, bodyTop + bodyH * 0.4, 4 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333'; ctx.beginPath(); ctx.ellipse(-6 * s, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(6 * s, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
        this._head(ctx, c, 0, bodyTop - R, R, opt, t);
    },
    _human(ctx, c, s, opt, t) {
        const sw = opt.pose === 'walk' ? Math.sin(t * 8) * 3 * s : 0;
        ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.1); MG.ui.rr(ctx, -7 * s + sw, -20 * s, 6 * s, 20 * s, 3 * s); ctx.fill(); MG.ui.rr(ctx, 1 * s - sw, -20 * s, 6 * s, 20 * s, 3 * s); ctx.fill();
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(-4 * s + sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(4 * s - sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
        let g = null; try { g = ctx.createLinearGradient(0, -44 * s, 0, -20 * s); g.addColorStop(0, c.cloth.c1); g.addColorStop(1, c.cloth.c2); } catch (e) { }
        ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -12 * s, -44 * s, 24 * s, 26 * s, 8 * s); ctx.fill();
        ctx.fillStyle = c.cloth.c2; ctx.save(); ctx.translate(-12 * s, -40 * s); ctx.rotate(sw * 0.02); MG.ui.rr(ctx, -4 * s, -2 * s, 7 * s, 20 * s, 3 * s); ctx.fill(); ctx.restore();
        ctx.save(); ctx.translate(12 * s, -40 * s); ctx.rotate(-sw * 0.02); MG.ui.rr(ctx, -3 * s, -2 * s, 7 * s, 20 * s, 3 * s); ctx.fill(); ctx.restore();
        ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(-13 * s + sw, -22 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(13 * s - sw, -22 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
        this._head(ctx, c, 0, -56 * s, 13 * s, opt, t);
    },
    _robot(ctx, c, s, opt, t) {
        ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.2); ctx.fillRect(-8 * s, -16 * s, 6 * s, 16 * s); ctx.fillRect(2 * s, -16 * s, 6 * s, 16 * s);
        ctx.fillStyle = '#444'; ctx.fillRect(-10 * s, -2 * s, 10 * s, 3 * s); ctx.fillRect(0, -2 * s, 10 * s, 3 * s);
        let g = null; try { g = ctx.createLinearGradient(0, -46 * s, 0, -16 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.2)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
        ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -15 * s, -46 * s, 30 * s, 32 * s, 6 * s); ctx.fill();
        ctx.strokeStyle = MG.gfx.darken(c.cloth.c2, 0.3); ctx.lineWidth = 2 * s; ctx.stroke();
        ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, -34 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.cloth.c2; ctx.fillRect(-21 * s, -44 * s, 6 * s, 22 * s); ctx.fillRect(15 * s, -44 * s, 6 * s, 22 * s);
        ctx.fillStyle = MG.gfx.lighten(c.skin, 0.1); MG.ui.rr(ctx, -13 * s, -66 * s, 26 * s, 20 * s, 5 * s); ctx.fill();
        ctx.fillStyle = c.accent; MG.ui.rr(ctx, -11 * s, -60 * s, 22 * s, 8 * s, 3 * s); ctx.fill();
        ctx.fillStyle = '#1a2238'; ctx.beginPath(); ctx.arc(-5 * s, -56 * s, 2.6 * s, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(5 * s, -56 * s, 2.6 * s, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = c.accent; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(0, -66 * s); ctx.lineTo(0, -74 * s); ctx.stroke(); ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, -75 * s, 2.4 * s, 0, Math.PI * 2); ctx.fill();
    },
    _slime(ctx, c, s, opt, t) {
        const wob = Math.sin(t * 3) * 2 * s;
        ctx.save(); ctx.translate(0, -18 * s);
        let g = null; try { g = ctx.createRadialGradient(0, -10 * s, 2 * s, 0, 0, 22 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.3)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
        ctx.fillStyle = g || c.cloth.c1; ctx.globalAlpha = 0.92;
        ctx.beginPath(); ctx.moveTo(-20 * s, -2 * s + wob); ctx.quadraticCurveTo(-22 * s, -34 * s, 0, -36 * s); ctx.quadraticCurveTo(22 * s, -34 * s, 20 * s, -2 * s - wob); ctx.quadraticCurveTo(14 * s, 6 * s, 0, 6 * s); ctx.quadraticCurveTo(-14 * s, 6 * s, -20 * s, -2 * s + wob); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-7 * s, -20 * s, 5 * s, 8 * s, -0.3, 0, Math.PI * 2); ctx.fill();
        this._eye(ctx, -7 * s, -14 * s, 4 * s, c.eye, 'normal', false);
        this._eye(ctx, 7 * s, -14 * s, 4 * s, c.eye, 'normal', false);
        this._mouth(ctx, -6 * s, 4 * s, 'normal');
        ctx.restore();
    },
    _cat(ctx, c, s, opt, t) {
        const sw = opt.pose === 'walk' ? Math.sin(t * 8) * 3 * s : 0;
        ctx.strokeStyle = c.cloth.c2; ctx.lineWidth = 5 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(10 * s, -14 * s); ctx.quadraticCurveTo(22 * s, -18 * s, 18 * s, -30 * s); ctx.stroke();
        ctx.fillStyle = c.cloth.c2; ctx.beginPath(); ctx.ellipse(-5 * s + sw, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(5 * s - sw, 0, 5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
        let g = null; try { g = ctx.createLinearGradient(0, -30 * s, 0, -8 * s); g.addColorStop(0, c.cloth.c1); g.addColorStop(1, c.cloth.c2); } catch (e) { }
        ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -11 * s, -30 * s, 22 * s, 24 * s, 9 * s); ctx.fill();
        ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(-11 * s, -16 * s, 3 * s, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(11 * s, -16 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
        const hy = -44 * s, hx = 0, R = 15 * s;
        ctx.fillStyle = c.cloth.c1; ctx.beginPath(); ctx.moveTo(hx - R * 0.8, hy - R * 0.4); ctx.lineTo(hx - R * 1.1, hy - R * 1.5); ctx.lineTo(hx - R * 0.2, hy - R * 0.9); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx + R * 0.8, hy - R * 0.4); ctx.lineTo(hx + R * 1.1, hy - R * 1.5); ctx.lineTo(hx + R * 0.2, hy - R * 0.9); ctx.fill();
        ctx.fillStyle = '#ffb6c1'; ctx.beginPath(); ctx.moveTo(hx - R * 0.7, hy - R * 0.5); ctx.lineTo(hx - R * 0.95, hy - R * 1.2); ctx.lineTo(hx - R * 0.3, hy - R * 0.8); ctx.fill(); ctx.beginPath(); ctx.moveTo(hx + R * 0.7, hy - R * 0.5); ctx.lineTo(hx + R * 0.95, hy - R * 1.2); ctx.lineTo(hx + R * 0.3, hy - R * 0.8); ctx.fill();
        this._head(ctx, Object.assign({}, c, { hair: { style: 1, color: c.skin } }), hx, hy, R, opt, t);
        ctx.strokeStyle = 'rgba(60,40,40,0.7)'; ctx.lineWidth = 1 * s; ctx.beginPath();
        ctx.moveTo(hx - 6 * s, hy + 2 * s); ctx.lineTo(hx - 14 * s, hy); ctx.moveTo(hx - 6 * s, hy + 4 * s); ctx.lineTo(hx - 14 * s, hy + 5 * s);
        ctx.moveTo(hx + 6 * s, hy + 2 * s); ctx.lineTo(hx + 14 * s, hy); ctx.moveTo(hx + 6 * s, hy + 4 * s); ctx.lineTo(hx + 14 * s, hy + 5 * s); ctx.stroke();
    },
    _mecha(ctx, c, s, opt, t) {
        const sw = opt.pose === 'walk' ? Math.sin(t * 8) * 2 * s : 0;
        ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.25); MG.ui.rr(ctx, -9 * s + sw, -18 * s, 8 * s, 18 * s, 3 * s); ctx.fill(); MG.ui.rr(ctx, 1 * s - sw, -18 * s, 8 * s, 18 * s, 3 * s); ctx.fill();
        ctx.fillStyle = c.accent; ctx.beginPath(); ctx.ellipse(-5 * s + sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(5 * s - sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
        let g = null; try { g = ctx.createLinearGradient(0, -48 * s, 0, -18 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.25)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
        ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -16 * s, -48 * s, 32 * s, 32 * s, 7 * s); ctx.fill();
        ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.15); ctx.beginPath(); ctx.ellipse(-16 * s, -44 * s, 8 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(16 * s, -44 * s, 8 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, -32 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.cloth.c1; ctx.fillRect(-23 * s, -46 * s, 7 * s, 24 * s); ctx.fillRect(16 * s, -46 * s, 7 * s, 24 * s);
        ctx.fillStyle = MG.gfx.lighten(c.cloth.c1, 0.1); MG.ui.rr(ctx, -13 * s, -68 * s, 26 * s, 22 * s, 6 * s); ctx.fill();
        ctx.fillStyle = c.accent; ctx.fillRect(-12 * s, -64 * s, 24 * s, 5 * s); ctx.fillStyle = '#0b1020'; ctx.fillRect(-2 * s, -64 * s, 4 * s, 12 * s);
        ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(0, -50 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
    },
    _ghost(ctx, c, s, opt, t) {
        const fl = Math.sin(t * 3) * 2 * s;
        ctx.save(); ctx.globalAlpha = 0.85;
        let g = null; try { g = ctx.createRadialGradient(0, -18 * s, 2 * s, 0, 0, 24 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.25)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
        ctx.fillStyle = g || c.cloth.c1;
        ctx.beginPath(); ctx.moveTo(-18 * s, -18 * s); ctx.quadraticCurveTo(-20 * s, -40 * s, 0, -42 * s); ctx.quadraticCurveTo(20 * s, -40 * s, 18 * s, -18 * s);
        for (let i = 0; i < 4; i++) { const x = 18 * s - (i * 2 + 1) * (36 * s / 4); ctx.quadraticCurveTo(x + 9 * s, -10 * s + fl, x, -2 * s); }
        ctx.quadraticCurveTo(0, 6 * s, -18 * s, -18 * s); ctx.fill();
        ctx.globalAlpha = 1;
        this._eye(ctx, -7 * s, -26 * s, 4.5 * s, c.eye, 'normal', false);
        this._eye(ctx, 7 * s, -26 * s, 4.5 * s, c.eye, 'normal', false);
        this._mouth(ctx, -8 * s, 4 * s, 'surprise');
        ctx.restore();
    },
    _knight(ctx, c, s, opt, t) {
        const sw = opt.pose === 'walk' ? Math.sin(t * 8) * 2 * s : 0;
        ctx.fillStyle = MG.gfx.darken(c.cloth.c2, 0.2); ctx.fillRect(-8 * s + sw, -16 * s, 7 * s, 16 * s); ctx.fillRect(1 * s - sw, -16 * s, 7 * s, 16 * s);
        ctx.fillStyle = '#2a2a33'; ctx.beginPath(); ctx.ellipse(-4 * s + sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(5 * s - sw, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = MG.gfx.darken(c.accent, 0.1); ctx.beginPath(); ctx.moveTo(-12 * s, -44 * s); ctx.quadraticCurveTo(-22 * s, -10 * s, -14 * s, 2 * s); ctx.lineTo(14 * s, 2 * s); ctx.quadraticCurveTo(22 * s, -10 * s, 12 * s, -44 * s); ctx.fill();
        let g = null; try { g = ctx.createLinearGradient(0, -46 * s, 0, -16 * s); g.addColorStop(0, MG.gfx.lighten(c.cloth.c1, 0.3)); g.addColorStop(1, c.cloth.c2); } catch (e) { }
        ctx.fillStyle = g || c.cloth.c1; MG.ui.rr(ctx, -14 * s, -46 * s, 28 * s, 30 * s, 8 * s); ctx.fill();
        ctx.strokeStyle = MG.gfx.darken(c.cloth.c2, 0.3); ctx.lineWidth = 2 * s; ctx.stroke();
        ctx.fillStyle = MG.gfx.lighten(c.cloth.c1, 0.15); ctx.beginPath(); ctx.ellipse(-15 * s, -43 * s, 7 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(15 * s, -43 * s, 7 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.cloth.c2; ctx.fillRect(13 * s, -44 * s, 6 * s, 22 * s);
        ctx.strokeStyle = '#cfd6e6'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(20 * s, -40 * s); ctx.lineTo(26 * s, -66 * s); ctx.stroke();
        ctx.fillStyle = c.accent; ctx.beginPath(); ctx.moveTo(26 * s, -70 * s); ctx.lineTo(22 * s, -64 * s); ctx.lineTo(30 * s, -64 * s); ctx.fill();
        ctx.fillStyle = MG.gfx.lighten(c.cloth.c1, 0.1); MG.ui.rr(ctx, -13 * s, -66 * s, 26 * s, 22 * s, 7 * s); ctx.fill();
        ctx.strokeStyle = MG.gfx.darken(c.cloth.c2, 0.35); ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(0, -66 * s); ctx.lineTo(0, -46 * s); ctx.stroke();
        ctx.fillStyle = '#10141f'; ctx.fillRect(-9 * s, -60 * s, 18 * s, 5 * s);
        ctx.fillStyle = c.accent; ctx.beginPath(); ctx.moveTo(0, -66 * s); ctx.quadraticCurveTo(6 * s, -78 * s, 0, -86 * s); ctx.quadraticCurveTo(-3 * s, -76 * s, 0, -66 * s); ctx.fill();
    },
    // ---------- 主绘制入口 ----------
    draw(ctx, x, y, scale, cfg, opt) {
        cfg = cfg || {}; opt = opt || {};
        const F = (opt.face != null ? opt.face : (cfg.face || 1));
        const t = opt.t || 0;
        scale = scale || 1;
        ctx.save();
        ctx.globalAlpha = opt.alpha != null ? opt.alpha : 1;
        if (opt.shadow !== false) {
            ctx.save(); ctx.globalAlpha = (opt.alpha != null ? opt.alpha : 1) * 0.26; ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.ellipse(x, y + 2, 16 * scale, 5 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        ctx.translate(x, y); ctx.scale(F, 1);
        const bob = opt.pose === 'walk' ? Math.abs(Math.sin(t * 8)) * 2 * scale : Math.sin(t * 2.2) * 0.6 * scale;
        ctx.translate(0, -bob);
        const fn = this['_' + (cfg.arch || 'chibi')] || this._chibi;
        try { fn.call(this, ctx, cfg, scale, opt, t); } catch (e) { if (window.__MG_TEST) throw e; }
        ctx.restore();
    },
    // 一行陈列：从 x 起，每个间隔 spacing，统一 scale
    gallery(ctx, x, y, spacing, scale, list) {
        list = list || this.ARCH;
        list.forEach((a, i) => { const c = this.gen(700 + i * 131); c.arch = a; c.expr = 'smile'; c.face = 1; this.draw(ctx, x + i * spacing, y, scale, c, { t: 0.6, pose: 'idle' }); });
    },
};
