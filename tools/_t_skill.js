// 验证：tower/level 返回 wall + 英雄 ult；材料英雄头像为生成 SVG
const http = require('http');
function req(m, p, d, t) {
    return new Promise((res, rej) => {
        const b = d ? JSON.stringify(d) : null;
        const r = http.request({
            host: 'localhost', port: 5180, path: p, method: m,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': b ? Buffer.byteLength(b) : 0,
                ...(t ? { Authorization: 'Bearer ' + t } : {}),
            },
        }, resp => { let s = ''; resp.on('data', c => s += c); resp.on('end', () => res({ code: resp.statusCode, body: s })); });
        r.on('error', rej); if (b) r.write(b); r.end();
    });
}
const j = r => { try { return JSON.parse(r.body); } catch (e) { return {}; } };

(async () => {
    const at = j(await req('POST', '/api/admin/login', { username: 'admin', password: 'workbuddy' })).token;
    const uname = 'skl' + (Date.now() % 100000);
    const tk = j(await req('POST', '/api/register', { username: uname, password: 'pwd12345' })).token;
    await req('POST', '/api/admin/mail', { usernames: [uname], title: '资源', rewards: { gold: 9999999, wishCards: 200, gems: 99999 } }, at);
    const mails = j(await req('GET', '/api/mail', null, tk)).mails;
    for (const m of mails) await req('POST', '/api/mail/claim', { id: m.id }, tk);
    for(let i=0;i<4;i++) await req('POST', '/api/wish', { count: 10 }, tk);

    // 上阵
    const hr = j(await req('GET', '/api/heroes', null, tk));
    const main = hr.owned.find(o => !o.material);
    await req('POST', '/api/hero/equip', { uid: main.uid }, tk);

    const lvR = await req('GET', '/api/tower/level?floor=1&ancient=0', null, tk);
    const lv = j(lvR);
    console.log('1) tower/level:', lvR.code);
    console.log('   wall:', JSON.stringify(lv.wall));
    const h0 = lv.heroes && lv.heroes[0];
    console.log('   hero0:', h0 && h0.name, '| ult:', h0 && JSON.stringify(h0.ult));
    console.log('   skills:', h0 && h0.skills.length);
    console.log('   判定:', lv.wall && lv.wall.skill && h0 && h0.ult ? '✅ 城墙技能 + 必杀已下发' : '❌ 缺失');

    // 材料英雄头像
    const mats = hr.heroes.filter(h => h.material);
    console.log('2) 材料英雄头像:');
    console.log('  ', mats.map(m => m.id + '=' + m.img).join('  '));
    const allSvg = mats.length && mats.every(m => /^material\/m\d+\.svg$/.test(m.img || ''));
    console.log('   判定:', allSvg ? '✅ 全部为程序生成的 SVG' : '❌ 仍有旧截图');

    // 静态资源可访问
    const svgRes = await req('GET', '/img/material/m37.svg');
    console.log('3) SVG 可访问:', svgRes.code, svgRes.code === 200 ? '✅' : '❌');

    await req('POST', '/api/admin/user/delete', { usernames: [uname] }, at);
})();
