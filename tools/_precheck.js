const http = require('http');
const fs = require('fs');

function get(url) {
  return new Promise(res => {
    const req = http.get(url, r => { r.destroy(); res('HTTP ' + r.statusCode); });
    req.on('error', e => res('DOWN ' + e.code));
    req.setTimeout(3000, () => { req.destroy(); res('TIMEOUT'); });
  });
}

(async () => {
  // 1) server
  const s = await get('http://127.0.0.1:5180/');
  console.log('SERVER:', s);
  // 2) ws module
  try { require.resolve('ws', { paths: ['E:/WorkSpace/tower-odyssey'] }); console.log('WS: OK'); }
  catch (e) { console.log('WS: MISSING'); }
  // 3) chrome
  console.log('CHROME:', fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'OK' : 'MISSING');
})();
