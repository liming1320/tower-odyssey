// 小游戏引擎 · 调色板皮肤（mg-skin.js）—— 画质 A5
window.MG = window.MG || {}; var MG = window.MG;
// 每游戏或全局调色板：default / neon / sunset / midnight / mono。
// 游戏用 MG.skin.bg(ctx,W,H) 替代 MG.gfx.scene 即可获得换肤；设置齿轮可切换。
MG.skin = {
    current: 'default',
    palettes: {
        default: null,
        neon: { c1: '#1a0b2e', c2: '#0b1e3a', accent: '#39e6ff' },
        sunset: { c1: '#3a1140', c2: '#5a1e2a', accent: '#ff8a5c' },
        midnight: { c1: '#0a0e1a', c2: '#101a2e', accent: '#8aa0ff' },
        mono: { c1: '#1a1a1a', c2: '#2a2a2a', accent: '#dddddd' },
    },
    set(name) { if (this.palettes[name]) this.current = name; if (MG.settings) MG.settings.skin = name; },
    bg(ctx, W, H) {
        const p = this.palettes[this.current];
        try {
            if (!p) MG.gfx.scene(ctx, W, H, '#26304e', '#34406a');
            else MG.gfx.scene(ctx, W, H, p.c1, p.c2);
        } catch (e) { try { MG.gfx.scene(ctx, W, H, '#26304e', '#34406a'); } catch (_) {} }
    },
    accent() { const p = this.palettes[this.current]; return p ? p.accent : '#ffd56b'; },
};
try { if (MG.settings) MG.skin.set(MG.settings.skin); } catch (e) {}
