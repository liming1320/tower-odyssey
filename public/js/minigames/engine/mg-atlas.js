// 小游戏引擎 · 精灵图集打包（mg-atlas.js）—— 性能 D3
window.MG = window.MG || {}; var MG = window.MG;
// 把多张同源小图（角色帧/棋子/图标）打包进一张离屏 canvas，之后用 drawFrame 按名取用，
// 减少 drawImage 的目标纹理数量与上传开销（散 PNG 各自上传更慢）。
// 用法：const a = MG.atlas().add('hero', imgEl).add('enemy', img2); a.build(); a.draw(ctx,'hero',x,y);
MG.atlas = function () {
    const frames = {}; let built = null, pad = 1;
    return {
        add(name, img) { if (name && img) frames[name] = img; return this; },
        build() {
            const names = Object.keys(frames);
            if (!names.length) { built = { cv: document.createElement('canvas'), rects: {} }; return this; }
            const cols = Math.max(1, Math.ceil(Math.sqrt(names.length)));
            let rx = pad, ry = pad, col = 0, curMaxH = 0, cw = 0, ch = 0;
            const rects = {};
            for (const n of names) {
                const im = frames[n];
                if (col >= cols) { col = 0; ry += curMaxH + pad; curMaxH = 0; rx = pad; }
                rects[n] = { x: rx, y: ry, w: im.width, h: im.height };
                rx += im.width + pad; curMaxH = Math.max(curMaxH, im.height); col++;
                cw = Math.max(cw, rx); ch = Math.max(ch, ry + curMaxH);
            }
            const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
            const c = cv.getContext('2d');
            for (const n of names) { const im = frames[n], r = rects[n]; c.drawImage(im, r.x, r.y); }
            built = { cv, rects }; return this;
        },
        draw(ctx, name, x, y) {
            if (!built || !built.rects[name]) return;
            const r = built.rects[name];
            ctx.drawImage(built.cv, r.x, r.y, r.w, r.h, x, y, r.w, r.h);
        },
        frame(name) { return built && built.rects[name]; },
        canvas() { return built && built.cv; },
    };
};
