const http = require('http');
function get(url, cb) {
  http.get(url, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => cb(null, d));
  }).on('error', e => cb(e));
}
const base = 'http://152.136.167.250:5180/';
get(base, (e, html) => {
  if (e) { console.log('INDEX_ERR', e.message); return; }
  const idx = (html.match(/utils\.js\?v=[^"']+/g) || []).join(',');
  const bjs = (html.match(/battle\.js\?v=[^"']+/g) || []).join(',');
  console.log('INDEX utils?', idx);
  console.log('INDEX battle?', bjs);
  get(base + 'js/battle.js?cb=' + Date.now(), (e2, js) => {
    if (e2) { console.log('BATTLE_ERR', e2.message); return; }
    const have = ['U.canvas.setup', 'U.loop(', 'U.math.rgba'].filter(s => js.includes(s));
    const old = ['function rgba(hex', 'this.raf = requestAnimationFrame(t => this.loop'].filter(s => js.includes(s));
    console.log('battle.js 新接线:', have.join(','));
    console.log('battle.js 旧残留:', old.length ? old.join(',') : '(无)');
  });
});