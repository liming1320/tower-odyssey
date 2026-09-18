// 小游戏引擎 · 回放分享码（mg-replaycode.js）—— 体验 E5
window.MG = window.MG || {}; var MG = window.MG;
// 把 mg-replay 记录的事件流（[{t,x,y,k}]）压缩成可分享字符串/URL，好友粘贴即可复现同一局。
// 编码：t 以 0.1s 为单位量化、x/y 量化到 0~65535，每事件 7 字节 → btoa 成 RP- 前缀串。
// 用法：const s = MG.replayCode.encode(api._rec.events); MG.replayCode.decode(s) → events
MG.replayCode = {
    encode(events) {
        try {
            if (!events || !events.length) return '';
            const bin = [];
            for (const e of events) {
                const t = Math.max(0, Math.min(65535, Math.round((e.t || 0) * 10)));
                const x = Math.max(0, Math.min(65535, (e.x | 0)));
                const y = Math.max(0, Math.min(65535, (e.y | 0)));
                const k = ((e.k || 't').charCodeAt(0) || 116) & 0xff;
                bin.push(String.fromCharCode((t >> 8) & 255, t & 255, (x >> 8) & 255, x & 255, (y >> 8) & 255, y & 255, k));
            }
            return 'RP-' + btoa(bin.join(''));
        } catch (e) { return ''; }
    },
    decode(str) {
        try {
            if (!str || str.indexOf('RP-') !== 0) return null;
            const bin = atob(str.slice(3));
            const out = [];
            for (let i = 0; i + 7 <= bin.length; i += 7) {
                const t = ((bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1)) / 10;
                const x = (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3);
                const y = (bin.charCodeAt(i + 4) << 8) | bin.charCodeAt(i + 5);
                const k = String.fromCharCode(bin.charCodeAt(i + 6) & 0xff);
                out.push({ t, x, y, k });
            }
            return out;
        } catch (e) { return null; }
    },
    shareUrl(code) { return location.origin + location.pathname + '?replay=' + encodeURIComponent(code); },
};
