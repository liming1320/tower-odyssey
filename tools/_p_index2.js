const fs = require('fs');
const P = 'E:/WorkSpace/tower-odyssey/public/index.html';
let s = fs.readFileSync(P, 'utf8');
function rep(a, b, msg) { if (s.indexOf(a) === -1) { console.error('MISS ' + msg); process.exit(1); } s = s.replace(a, b); }
// bump ?v for files patched this round (d -> e)
rep('mg-render.js?v=20260918d', 'mg-render.js?v=20260918e', 'render');
rep('_engine.js?v=20260918d', '_engine.js?v=20260918e', 'engine');
rep('mg-settings.js?v=20260918d', 'mg-settings.js?v=20260918e', 'settings');
// inject 10 new modules (D+E+F) after mg-settings.js
const anchor = '<script src="/js/minigames/engine/mg-settings.js?v=20260918e"></script>';
const mods = ['mg-pool', 'mg-ticker', 'mg-worker', 'mg-atlas', 'mg-daily-ui', 'mg-replaycode', 'mg-net', 'mg-loadmod', 'mg-perfguard', 'mg-reporterror'];
const inject = anchor + '\n' + mods.map(m => '\t<script src="/js/minigames/engine/' + m + '.js?v=20260918e"></script>').join('\n') + '\n';
rep(anchor, inject, 'inject');
fs.writeFileSync(P, s); console.log('index2 patched OK');
