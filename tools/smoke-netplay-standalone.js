// 独立端口 netplay 信令服务冒烟测试（无 socket.io-client 依赖，纯 HTTP 探活）。
// 验证：createServer 在独立端口起服务后，/list 返回 JSON、/socket.io 返回 engine.io 握手、未知路径 404。
// 用法：node tools/smoke-netplay-standalone.js  （可选环境变量 NETPLAY_TEST_PORT 指定测试端口）
const path = require('path');
const http = require('http');
const Netplay = require(path.join(__dirname, '..', 'server', 'netplay'));

const PORT = parseInt(process.env.NETPLAY_TEST_PORT || '5199', 10);
const io = Netplay.createServer(PORT);

function get(p) {
    return new Promise((resolve) => {
        const req = http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: 5000 }, (res) => {
            let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ code: res.statusCode, body: b }));
        });
        req.on('error', (e) => resolve({ code: 'ERR', body: String(e.message) }));
        req.on('timeout', () => { req.destroy(); resolve({ code: 'TIMEOUT', body: '' }); });
    });
}

setTimeout(async () => {
    if (!io) { console.error('FAIL: createServer 返回 null（socket.io 未安装？）'); process.exit(1); }
    let pass = 0, fail = 0;
    const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
    try {
        const list = await get('/list?game_id=1001');
        ok(list.code === 200, 'GET /list 状态 200 (got ' + list.code + ')');
        let j = null, isJson = false;
        try { j = JSON.parse(list.body); isJson = true; } catch (e) {}
        ok(isJson && j && typeof j === 'object', '/list 返回合法 JSON 对象');

        const hs = await get('/socket.io/?EIO=4&transport=polling');
        ok(hs.code === 200, 'GET /socket.io 轮询状态 200 (got ' + hs.code + ')');
        ok(/^0\{/.test(hs.body), '/socket.io 返回 engine.io 握手 (0{...}) -> ' + JSON.stringify(hs.body.slice(0, 48)));

        const nf = await get('/nope');
        ok(nf.code === 404, '未知路径 404 (got ' + nf.code + ')');
    } catch (e) {
        console.error('ERR', e); fail++;
    }
    console.log('\n' + pass + '/' + (pass + fail) + ' passed');
    process.exit(fail ? 1 : 0);
}, 800);
