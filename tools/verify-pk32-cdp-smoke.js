'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const cdp = process.env.PK32_CDP_URL || 'http://127.0.0.1:9222';
const output = path.resolve(__dirname, '../output/pk32-cdp-smoke');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function cdpCall(ws, method, params = {}) {
  const id = ++ws.nextId;
  ws.socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    ws.pending.set(id, { resolve, reject });
  });
}

async function evaluate(ws, expression, awaitPromise = false) {
  const result = await cdpCall(ws, 'Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  return result.result && result.result.value;
}

async function connectWebSocket(url) {
  const WebSocket = globalThis.WebSocket || require('ws');
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.addEventListener ? (socket.addEventListener('open', resolve), socket.addEventListener('error', reject)) : (socket.once('open', resolve), socket.once('error', reject)); });
  const ws = { socket, nextId: 0, pending: new Map() };
  const onMessage = event => {
    const data = JSON.parse(event.data || event);
    if (!data.id || !ws.pending.has(data.id)) return;
    const pending = ws.pending.get(data.id); ws.pending.delete(data.id);
    if (data.error) pending.reject(new Error(data.error.message)); else pending.resolve(data.result || {});
  };
  if (socket.addEventListener) socket.addEventListener('message', onMessage); else socket.on('message', onMessage);
  return ws;
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const targets = await request(cdp + '/json/list');
  const page = JSON.parse(targets.body).find(item => item.type === 'page' && item.url.startsWith(base));
  if (!page || !page.webSocketDebuggerUrl) throw new Error('No Chrome CDP page found for ' + base);
  const ws = await connectWebSocket(page.webSocketDebuggerUrl);
  await cdpCall(ws, 'Runtime.enable');
  const result = { scope: 'catalog-cdp-smoke-only', fullGameRulesVerified: false, widths: {}, totals: {} };
  for (const width of [390, 1280]) {
    await evaluate(ws, `window.resizeTo(${width}, 900); location.href = ${JSON.stringify(base)};`);
    await sleep(900);
    await evaluate(ws, `new Promise(resolve => { const wait = () => window.MiniGames && window.PK32Catalog ? resolve(true) : setTimeout(wait, 50); wait(); })`, true);
    const roster = await evaluate(ws, `window.PK32Catalog.map(x => ({id:x.id,name:x.name}))`);
    const rows = [];
    for (const record of roster) {
      const row = { ...record, width, smokePassed: false, errors: [] };
      try {
        await evaluate(ws, `(() => { const b = document.querySelector('[data-pk32-id=${JSON.stringify(record.id)}] button'); if (!b) throw new Error('no launch button'); b.click(); })()`);
        await sleep(180);
        row.render = await evaluate(ws, `(() => { const list = document.querySelector('#pk32-list'); const host = list && list.children[1]; if (!host) return {mounted:false}; const images = [...host.querySelectorAll('img')]; return {mounted: !!host.childElementCount, nodes: host.querySelectorAll('*').length, brokenImages: images.filter(x => x.complete && !x.naturalWidth).map(x => x.src), preformatted: host.querySelectorAll('pre').length, overflow: document.documentElement.scrollWidth > innerWidth + 1, text: host.textContent.slice(0, 160)}; })()`);
        row.smokePassed = row.render.mounted && !row.render.brokenImages.length && !row.render.overflow && !/启动失败|加载失败/.test(row.render.text);
        await evaluate(ws, `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '返回 PK32 目录'); if (b) b.click(); })()`);
        await sleep(30);
      } catch (error) { row.errors.push(error.message); }
      rows.push(row);
    }
    result.widths[width] = rows;
  }
  result.totals = { checked: Object.values(result.widths).reduce((n, rows) => n + rows.length, 0), passed: Object.values(result.widths).flat().filter(row => row.smokePassed).length };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result.totals, output, fullGameRulesVerified: false }));
  ws.socket.close();
  if (result.totals.passed !== result.totals.checked) process.exitCode = 1;
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
