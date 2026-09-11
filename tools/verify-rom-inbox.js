// 端到端验证：服务器部署场景下「上传 ROM 到服务器 → 扫描收件箱 → 导入」整条链路。
// 背景：项目部署在服务器上时，管理员本地 ROM 目录（F:\…）服务器读不到，
// 必须先传到服务器 data/roms/inbox。这里就验这条路。
//
// 用法：node tools/verify-rom-inbox.js        （独立端口 5198，不影响 5180）
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeZip } = require('./rom-zip-fixture');

const ROOT = path.join(__dirname, '..');
const PORT = 5198;
let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; console.log('  \u2717 ' + name + (extra ? '  → ' + extra : '')); }
}

function req(method, p, { body, raw, headers, token } = {}) {
    return new Promise((resolve, reject) => {
        const h = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
        if (token) h['Authorization'] = 'Bearer ' + token;
        if (raw) h['Content-Type'] = 'application/octet-stream';
        const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: h }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = null; try { json = JSON.parse(text); } catch (e) { }
                resolve({ status: res.statusCode, json, text });
            });
        });
        r.on('error', reject);
        if (body != null) r.end(raw ? body : JSON.stringify(body));
        else r.end();
    });
}

(async () => {
    // 用独立端口起一份服务，避免动到 5180 上的真实存档
    process.env.PORT = String(PORT);
    const DB = path.join(ROOT, 'data', 'db.json');
    const backup = DB + '.bak-rominbox';
    const hadDb = fs.existsSync(DB);
    if (hadDb) fs.copyFileSync(DB, backup);

    process.chdir(ROOT);
    const srvPath = path.join(ROOT, 'server.js');
    delete require.cache[require.resolve(srvPath)];
    require(srvPath);

    await new Promise(r => setTimeout(r, 600));

    try {
        console.log('\n【1】登录管理员');
        const lg = await req('POST', '/api/admin/login', { body: { username: 'admin', password: 'workbuddy' } });
        const token = (lg.json && (lg.json.token || (lg.json.user && lg.json.user.token))) || '';
        check('管理员登录成功', !!token, JSON.stringify(lg.json));

        console.log('\n【2】catalog 返回服务器路径信息');
        const cat = await req('GET', '/api/admin/roms/catalog', { token });
        check('返回 server.inboxDir 绝对路径', !!(cat.json.server && path.isAbsolute(cat.json.server.inboxDir)),
            JSON.stringify(cat.json.server));
        check('返回 server.platform', !!(cat.json.server && cat.json.server.platform));
        check('inbox 初始为空', cat.json.inbox && cat.json.inbox.count === 0);

        console.log('\n【3】上传 ROM 到服务器收件箱');
        const zip = makeZip([{ name: '223-p1.bin', data: Buffer.from('fake rom data') }]);
        const up = await req('POST', '/api/admin/roms/inbox/upload?fileName=' + encodeURIComponent('rbffspec.zip'),
            { token, raw: true, body: zip });
        check('上传 rbffspec.zip 成功', up.status === 200 && up.json.ok === true, up.text.slice(0, 200));
        check('收件箱计数 +1', up.json.inbox && up.json.inbox.count === 1);
        check('文件落盘到服务器 inbox', fs.existsSync(path.join(ROOT, 'data', 'roms', 'inbox', 'rbffspec.zip')));

        const up2 = await req('POST', '/api/admin/roms/inbox/upload?fileName=' + encodeURIComponent('kof98.zip'),
            { token, raw: true, body: zip });
        check('第二个 ROM 上传成功', up2.status === 200 && up2.json.inbox.count === 2);

        console.log('\n【4】只接受 zip / 拒绝非法文件名');
        const bad1 = await req('POST', '/api/admin/roms/inbox/upload?fileName=evil.exe', { token, raw: true, body: zip });
        check('非 zip 被拒', bad1.status === 400, bad1.text.slice(0, 120));
        const bad2 = await req('POST', '/api/admin/roms/inbox/upload?fileName=' + encodeURIComponent('../../evil.zip'),
            { token, raw: true, body: zip });
        check('路径穿越文件名被拒（不落到 inbox 之外）', bad2.status === 400, bad2.text.slice(0, 120));
        check('没有文件逃出 inbox', !fs.existsSync(path.join(ROOT, 'data', 'evil.zip')));

        console.log('\n【5】留空目录 = 扫描收件箱');
        const scan = await req('POST', '/api/admin/roms/scan', { token, body: { dir: '' } });
        check('留空也能扫（默认收件箱）', scan.status === 200 && (scan.json.items || []).length === 2,
            scan.text.slice(0, 200));
        const rb = (scan.json.items || []).find(x => x.shortName === 'rbffspec');
        check('识别出中文名', rb && rb.titleZh === '真饿狼传说特别版', rb && rb.titleZh);
        check('平台按目录/表判定为 neogeo', rb && rb.platform === 'neogeo', rb && rb.platform);
        check('neogeo.zip 不在其中（未上传 BIOS）', !(scan.json.items || []).some(x => x.isBios));

        console.log('\n【6】目录不存在时给出「服务器路径」提示');
        const bad = await req('POST', '/api/admin/roms/scan', { token, body: { dir: 'F:\\nonexistent\\roms' } });
        check('返回 400', bad.status === 400);
        check('报错里说明了是服务器路径', /服务器/.test((bad.json && bad.json.error) || ''), bad.json && bad.json.error);
        check('报错里给出了收件箱路径', /inbox/.test((bad.json && bad.json.error) || ''));

        console.log('\n【7】清空收件箱');
        const clr = await req('POST', '/api/admin/roms/inbox/clear', { token, body: { files: null } });
        check('清空成功', clr.status === 200 && clr.json.removed === 2, clr.text.slice(0, 160));
        check('磁盘文件已删除', !fs.existsSync(path.join(ROOT, 'data', 'roms', 'inbox', 'rbffspec.zip')));
        const cat2 = await req('GET', '/api/admin/roms/catalog', { token });
        check('catalog 里 inbox 归零', cat2.json.inbox && cat2.json.inbox.count === 0);

        console.log('\n【8】权限：非管理员不能上传');
        const noTok = await req('POST', '/api/admin/roms/inbox/upload?fileName=x.zip', { raw: true, body: zip });
        check('无 token 被拒 403', noTok.status === 403, String(noTok.status));
        console.log('\n【9】BIOS 管家（上传 / 列表 / 缺失判定 / 删除）');
        const biosZip = makeZip([{ name: 'neogeo.rom', data: Buffer.from('fake bios') }]);
        const bl0 = await req('GET', '/api/roms/bios', { token });
        check('BIOS 列表接口可用', bl0.status === 200 && Array.isArray(bl0.json.bios), bl0.text.slice(0, 120));
        const miss0 = (bl0.json.missing || []).find(m => m.platform === 'neogeo');
        check('未上传时 neogeo 标记缺失', !!miss0 && miss0.file === 'neogeo.zip', JSON.stringify(bl0.json.missing));
        const bu = await req('POST', '/api/roms/bios/upload?name=neogeo', { token, raw: true, body: biosZip });
        check('上传 neogeo BIOS 成功', bu.status === 200 && bu.json.ok === true, bu.text.slice(0, 160));
        const bl1 = await req('GET', '/api/roms/bios', { token });
        check('上传后 missing 不再含 neogeo', !((bl1.json.missing || []).some(m => m.platform === 'neogeo')));
        const bu2 = await req('POST', '/api/roms/bios/upload?name=neogeo', { token, raw: true, body: biosZip });
        check('同名再传=覆盖（replaced）', bu2.status === 200 && bu2.json.replaced === true, bu2.text.slice(0, 120));
        const biosId = bu2.json.id;
        const bd = await req('POST', '/api/roms/bios/delete', { token, body: { id: biosId } });
        check('删除 BIOS 成功', bd.status === 200 && bd.json.ok === true, bd.text.slice(0, 120));
        const bl2 = await req('GET', '/api/roms/bios', { token });
        check('删除后 neogeo 恢复缺失标记', (bl2.json.missing || []).some(m => m.platform === 'neogeo'));
        check('磁盘 BIOS 文件已清理', !fs.existsSync(path.join(ROOT, 'data', 'roms', 'bios', biosId + '.bin')));
        const bno = await req('POST', '/api/roms/bios/upload?name=neogeo', { raw: true, body: biosZip });
        check('无 token 上传 BIOS 被拒 403', bno.status === 403, String(bno.status));

    } catch (e) {
        fail++;
        console.log('\n\u2717 异常：' + (e && e.stack || e));
    } finally {
        // 回滚存档 + 清掉测试文件
        try {
            try { for (const f of (fs.readdirSync(path.join(ROOT, 'data', 'roms', 'bios')) || [])) {
                if (f.endsWith('.bin')) { try { fs.unlinkSync(path.join(ROOT, 'data', 'roms', 'bios', f)); } catch (e) { } }
            } } catch (e) { }
            const inboxDir = path.join(ROOT, 'data', 'roms', 'inbox');
            for (const f of fs.readdirSync(inboxDir)) {
                if (/\.zip$/i.test(f)) { try { fs.unlinkSync(path.join(inboxDir, f)); } catch (e) { } }
            }
        } catch (e) { }
        if (hadDb) { try { fs.copyFileSync(backup, DB); fs.unlinkSync(backup); } catch (e) { } }
        console.log('\n' + (fail ? '\u2717 ' : '\u2713 ') + pass + ' 通过 / ' + fail + ' 失败');
        process.exit(fail ? 1 : 0);
    }
})();
