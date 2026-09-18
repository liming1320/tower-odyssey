// 小游戏引擎 · 特效模块（mg-effects.js）
// 职责：粒子系统（fx）、缓动补间（每实例池）、相机（平移/缩放/震屏）。
// 这些对象由 E.game 在每局创建并挂到 api.fx / api.cam / api.tw，stop() 时自动清理，互不串场。
window.MG = window.MG || {};
var MG = window.MG;

// ================= 粒子系统（零依赖，纯 Canvas 2D 对象池）=================
// 每个游戏实例一个池（E.game 自动创建并挂到 api.fx），stop() 时自动清空，不串场。
// 用法：
//   fx.burst(x, y, { n:16, colors:[...], speed:120, life:.6, shape:'spark', angle:-1.57, spread:1.2 })
//   fx.text(x, y, '+100', { color:'#ffd56b', size:20 })      飘分/连击/提示
//   fx.ring(x, y, { r:48, color:'#ffd56b', lw:3 })           冲击波
// shape: dot(圆) | spark(拖尾火星) | square / confetti(旋转矩形) | ring | text
MG.fxPool = function (max) {
    const ps = [];
    const CAP = max || 360;
    const TAU = Math.PI * 2;
    const api = {
        list: ps,
        _flash: null,    // 全屏闪屏叠加 { color, amt, t, dur }
        _hs: 0,          // 顿帧剩余秒数（命中/爆炸时冻结画面）
        get count() { return ps.length; },
        clear() { ps.length = 0; this._flash = null; this._hs = 0; return this; },
        // 全屏闪屏：color 闪光色，amt 0~1 强度，dur 秒
        flash(color, amt, dur, opt) {
            this._flash = { color: color || '#fff', amt: amt == null ? 0.55 : amt, t: 0, dur: dur || 0.26 };
            return this;
        },
        // 顿帧（打击感）：ms 毫秒内冻结 tick（粒子/相机仍推进，闪屏仍播）
        hitstop(ms) { this._hs = Math.max(this._hs, (ms || 0) / 1000); return this; },
        // 运动拖尾：在 (x,y) 留一颗会淡出的小光点，连成尾迹
        trail(x, y, o) {
            o = o || {};
            this.burst(x, y, {
                n: 1, r: o.r || 3, colors: [o.color || '#fff'],
                speed: o.speed != null ? o.speed : 0, life: o.life || 0.3, g: 0, drag: 1,
                shape: 'dot', glow: o.glow !== false,
            });
            return this;
        },
        burst(x, y, o) {
            o = o || {};
            let n = Math.min(o.n != null ? o.n : 14, CAP - ps.length);
            // 减弱动效（Tier1-2）：无障碍模式下大幅削减粒子（保留极少反馈），避免眩晕
            if (MG.a11y && MG.a11y.reducedMotion) n = Math.min(n, 4);
            // 自适应画质：quality<1 时按比例减粒子，低端机自动减负（优化 P2-6）
            const q = (this._quality != null && this._quality < 1) ? this._quality : 1;
            if (q < 1) n = Math.max(0, Math.round(n * q));
            const cs = o.colors || ['#ffd56b', '#ff9d5c', '#ff7a8b', '#fff3c4'];
            const ang = o.angle, spread = o.spread != null ? o.spread : TAU;
            for (let i = 0; i < n; i++) {
                const a = (ang != null ? ang + (Math.random() - 0.5) * spread : Math.random() * TAU);
                const sp = (o.speed != null ? o.speed : 110) * (0.35 + Math.random() * 0.95);
                const life = (o.life != null ? o.life : 0.55) * (0.65 + Math.random() * 0.7);
                ps.push({
                    k: o.shape || 'dot', x, y,
                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                    g: o.g != null ? o.g : 240,
                    drag: o.drag != null ? o.drag : 0.965,
                    r: (o.r != null ? o.r : 4) * (0.55 + Math.random() * 0.9),
                    c: cs[(Math.random() * cs.length) | 0],
                    t: 0, life,
                    rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
                    glow: !!o.glow,
                });
            }
            return this;
        },
        text(x, y, s, o) {
            o = o || {};
            if (ps.length >= CAP) return this;
            ps.push({
                k: 'text', x, y, s: String(s),
                vx: o.vx || 0, vy: o.vy != null ? o.vy : -46,
                g: o.g != null ? o.g : 34, drag: 1,
                c: o.color || '#ffd56b', size: o.size || 20, bold: o.bold !== false,
                t: 0, life: o.life != null ? o.life : 0.9,
                r: 0, rot: 0, vr: 0, glow: o.glow !== false,
            });
            return this;
        },
        ring(x, y, o) {
            o = o || {};
            if (ps.length >= CAP) return this;
            ps.push({
                k: 'ring', x, y,
                vx: 0, vy: 0, g: 0, drag: 1,
                r: o.r0 != null ? o.r0 : 4, r1: o.r1 != null ? o.r1 : (o.r != null ? o.r : 46),
                lw: o.lw || 3, c: o.color || '#ffd56b',
                t: 0, life: o.life != null ? o.life : 0.36,
                rot: 0, vr: 0, glow: o.glow !== false,
            });
            return this;
        },
        update(dt) {
            if (this._flash) {
                this._flash.t += dt;
                if (this._flash.t >= this._flash.dur) this._flash = null;
            }
            for (let i = ps.length - 1; i >= 0; i--) {
                const p = ps[i];
                p.t += dt;
                if (p.t >= p.life) { ps.splice(i, 1); continue; }
                if (p.k === 'ring') continue;
                p.vy += p.g * dt;
                if (p.drag !== 1) { const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; }
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.rot += p.vr * dt;
            }
            return this;
        },
        draw(ctx, W, H) {
            if (!ps.length && !this._flash) return this;
            ctx.save();
            ctx.lineCap = 'round';
            // 全屏闪屏（叠加在粒子之上，命中/爆炸反馈）
            if (this._flash && W) {
                const k = 1 - this._flash.t / this._flash.dur;
                ctx.globalAlpha = Math.max(0, this._flash.amt * k * k);
                ctx.fillStyle = this._flash.color;
                ctx.fillRect(0, 0, W, H);
                ctx.globalAlpha = 1;
            }
            for (let i = 0; i < ps.length; i++) {
                const p = ps[i];
                const k = p.t / p.life;
                const a = Math.max(0, 1 - k * k);
                if (p.k === 'text') {
                    ctx.globalAlpha = a;
                    ctx.font = (p.bold ? 'bold ' : '') + p.size + 'px ' + (MG.ui.EMOJI_FONT || 'sans-serif');
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; }
                    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)';
                    ctx.strokeText(p.s, p.x, p.y);
                    ctx.fillStyle = p.c; ctx.fillText(p.s, p.x, p.y);
                    ctx.shadowBlur = 0;
                    continue;
                }
                if (p.k === 'ring') {
                    const r = p.r + (p.r1 - p.r) * (1 - Math.pow(1 - k, 2));
                    ctx.globalAlpha = a;
                    ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(0.5, p.lw * (1 - k * 0.6));
                    if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 10; }
                    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
                    ctx.shadowBlur = 0;
                    continue;
                }
                ctx.globalAlpha = a;
                if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; }
                if (p.k === 'spark') {
                    const sp = Math.hypot(p.vx, p.vy) || 1;
                    const L = Math.min(18, sp * 0.05) * (1 - k * 0.5);
                    ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(0.6, p.r * 0.9);
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - p.vx / sp * L, p.y - p.vy / sp * L);
                    ctx.stroke();
                } else if (p.k === 'square' || p.k === 'confetti') {
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
                    const s = p.r * (1 - k * 0.35);
                    ctx.fillStyle = p.c;
                    ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
                    ctx.restore();
                } else {
                    ctx.fillStyle = p.c;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, Math.max(0.4, p.r * (1 - k * 0.55)), 0, TAU);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
            }
            ctx.restore();
            return this;
        },
    };
    return api;
};

// ================= 缓动补间（Tween）=================
// 用法：
//   MG.tw.to(obj, { x: 100, y: 20 }, 0.3, { ease:'outBack', onDone(){} })
//   MG.tw.add({ dur:.4, ease:'outCubic', delay:.1, onUpdate(v){}, onDone(){} })
// E.game 每帧自动 update(dt)；stop 时 clear()，不留残留。
// 缓动补间：做成「工厂」而非单例，让每个游戏实例持有独立 pool，
// 避免全局 MG.tw.list 跨游戏残留、stop() 后还在改旧状态对象（见 issue #4）。
MG.makeTweenPool = function () {
    const list = [];
    const EASE = {
        linear: t => t,
        inQuad: t => t * t,
        outQuad: t => t * (2 - t),
        inOutQuad: t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        outCubic: t => 1 - Math.pow(1 - t, 3),
        inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
        outElastic: t => { const c4 = Math.PI * 2 / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
        outBounce: t => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + .75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + .9375; return n1 * (t -= 2.625 / d1) * t + .984375; },
    };
    return {
        EASE, list,
        add(o) {
            o = o || {};
            const it = { t: 0, dur: o.dur != null ? o.dur : 0.3, ease: typeof o.ease === 'function' ? o.ease : (EASE[o.ease] || EASE.outCubic), onUpdate: o.onUpdate, onDone: o.onDone, delay: o.delay || 0 };
            list.push(it);
            return it;
        },
        to(target, props, dur, o) {
            o = o || {};
            const keys = Object.keys(props), from = {};
            keys.forEach(k => { from[k] = target[k] || 0; });
            return this.add({ dur, ease: o.ease || 'outCubic', delay: o.delay, onUpdate: (v) => { for (let i = 0; i < keys.length; i++) { const k = keys[i]; target[k] = from[k] + (props[k] - from[k]) * v; } o.onUpdate && o.onUpdate(v); }, onDone: o.onDone });
        },
        update(dt) {
            for (let i = list.length - 1; i >= 0; i--) {
                const it = list[i];
                if (it.delay > 0) { it.delay -= dt; continue; }
                it.t += dt;
                const raw = it.dur > 0 ? Math.min(1, it.t / it.dur) : 1;
                it.onUpdate && it.onUpdate(it.ease(raw), raw);
                if (raw >= 1) { list.splice(i, 1); it.onDone && it.onDone(); }
            }
        },
        clear() { list.length = 0; },
        get count() { return list.length; },
    };
};
MG._tw = null;
// 向后兼容：保留全局默认 pool（如老代码直接调 MG.tw.to）；新游戏应改用 api.tw（实例隔离）
Object.defineProperty(MG, 'tw', { configurable: true, get() { return this._tw || (this._tw = this.makeTweenPool()); } });

// ================= 相机（平移 / 缩放 / 震屏）=================
// 用法：cam.shake(6, .28) 命中反馈；cam.set(x, y, zoom) 跟随。
// E.game 自动在 draw 前 apply、每帧 update、stop 时 reset。
MG.cam = function () {
    let ox = 0, oy = 0, zoom = 1;
    let sx = 0, sy = 0, sAmt = 0, sT = 0, sDur = 0;
    return {
        shake(amt, dur) {
            // 减弱动效（Tier1-2）：无障碍模式完全关闭震屏
            if (MG.a11y && MG.a11y.reducedMotion) return this;
            amt = amt != null ? amt : 6;
            dur = dur != null ? dur : 0.28;
            if (amt >= sAmt || sT >= sDur) { sAmt = amt; sDur = dur; sT = 0; }
            return this;
        },
        set(x, y, z) { if (x != null) ox = x; if (y != null) oy = y; if (z != null) zoom = z; return this; },
        reset() { ox = 0; oy = 0; zoom = 1; sAmt = 0; sT = 0; sx = 0; sy = 0; return this; },
        update(dt) {
            if (sAmt > 0) {
                sT += dt;
                if (sT >= sDur) { sAmt = 0; sx = 0; sy = 0; }
                else {
                    const k = 1 - sT / sDur;
                    const a = sAmt * k * k;
                    sx = Math.sin(sT * 61) * a;
                    sy = Math.cos(sT * 73) * a;
                }
            }
            return this;
        },
        // W/H 用于「以画面中心为锚点」缩放；不传则只平移
        apply(ctx, W, H) {
            const tx = ox + sx, ty = oy + sy;
            if (zoom !== 1 && W) {
                ctx.translate(W / 2, H / 2);
                ctx.scale(zoom, zoom);
                ctx.translate(-W / 2 + tx, -H / 2 + ty);
            } else if (tx || ty) {
                ctx.translate(tx, ty);
            }
            return this;
        },
    };
};
