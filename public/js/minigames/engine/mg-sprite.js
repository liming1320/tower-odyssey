// 小游戏引擎 · 精灵动画时间轴（mg-sprite.js）—— Tier3-9
window.MG = window.MG || {}; var MG = window.MG;
// MG.makeSprite(frames, opt)：frames 为离屏 canvas 数组（像素图/序列帧），opt:{fps, loop}
// 动作类游戏用它播放角色/特效序列，update(dt) 推进、draw(ctx,x,y[,w,h]) 绘制当前帧。
MG.makeSprite = function (frames, opt) {
    opt = opt || {};
    const fps = opt.fps || 12, loop = opt.loop !== false;
    let i = 0, acc = 0, playing = true, done = false;
    return {
        update(dt) {
            if (!playing || !frames.length) return;
            acc += dt; const step = 1 / fps;
            while (acc >= step) {
                acc -= step; i++;
                if (i >= frames.length) { if (loop) i = 0; else { i = frames.length - 1; playing = false; done = true; } }
            }
        },
        draw(ctx, x, y, w, h) { const f = frames[i]; if (!f) return; if (w != null) ctx.drawImage(f, x, y, w, h); else ctx.drawImage(f, x, y); },
        get frame() { return i; },
        get finished() { return done; },
        play() { playing = true; },
        pause() { playing = false; },
        reset() { i = 0; acc = 0; playing = true; done = false; },
        setFrames(f) { frames = f || []; i = 0; acc = 0; done = false; },
    };
};
