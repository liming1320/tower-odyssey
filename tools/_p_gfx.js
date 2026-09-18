const fs = require('fs');
const P = 'E:/WorkSpace/tower-odyssey/public/js/minigames/engine/mg-render.js';
let s = fs.readFileSync(P, 'utf8');
function rep(a, b, msg) { if (s.indexOf(a) === -1) { console.error('MISS ' + msg); process.exit(1); } s = s.replace(a, b); }
rep('    MAX_CACHE: 48,',
    "    MAX_CACHE: 48,\n    _MAX_BYTES: 48 * 1024 * 1024,   // 全部 gfx 缓存软内存上限（~48MB），超限按 LRU 跨桶淘汰（性能 D5）\n    _bytes(img) { return (img && img.width && img.height) ? img.width * img.height * 4 : 0; },\n    _evictMem() {\n        let total = 0; for (const b in this._caches) this._caches[b].forEach(function (v) { total += this._bytes(v); }.bind(this));\n        if (total <= this._MAX_BYTES) return;\n        const order = ['px', 'scene', 'wood', 'glow']; let guard = 0;\n        while (total > this._MAX_BYTES && guard++ < 256) {\n            let done = false;\n            for (const b of order) { const c = this._caches[b]; if (c.size) { c.delete(c.keys().next().value); done = true; break; } }\n            if (!done) break;\n            total = 0; for (const b in this._caches) this._caches[b].forEach(function (v) { total += this._bytes(v); }.bind(this));\n        }\n    },", 'maxcache');
rep('        c.set(key, img);\n        return img;', '        c.set(key, img); this._evictMem();\n        return img;', 'pxput');
rep('        c.set(key, img);\n        ctx.drawImage(img, 0, 0, W, H);', '        c.set(key, img); this._evictMem();\n        ctx.drawImage(img, 0, 0, W, H);', 'scene');
rep('        c.set(key, img);\n        }\n        ctx.drawImage(img, x, y, W, H);', '        c.set(key, img); this._evictMem();\n        }\n        ctx.drawImage(img, x, y, W, H);', 'wood');
rep('            c.set(key, img);\n            if (c.size >= this.MAX_CACHE) c.delete(c.keys().next().value);', '            c.set(key, img); this._evictMem();\n            if (c.size >= this.MAX_CACHE) c.delete(c.keys().next().value);', 'glow');
fs.writeFileSync(P, s); console.log('mg-render(D5) patched OK');
