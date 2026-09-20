// verify-hall.js —— 联机大厅「桌子」防刷 + 房间码加入 回归测试（真 ws 中继）
//
// 覆盖本轮修复：一个人连点「创建新桌」曾在大厅堆出一排同名空桌。
// 旧实现的根因是 create 分支每次无条件 new 一个房间，且不把自己从上一个房间摘掉
// （旧房间仍引用着同一个 ws 句柄 → peers 非空 → 永远不被回收，也不从大厅列表消失）。
//
// 断言的三个闸门：
//   闸门1 已在「只有自己的未开战桌」上 → 复用该桌，绝不新开（连点 N 次只留 1 张桌）
//   闸门2 同一 IP 同时只能持有一张空桌（默认 1，即"一个人只能开一张桌子"；本脚本用 XFF 伪造公网 IP 来验证）
//   闸门3 全局房间数上限 + 空桌超时回收（超时回收见 gc，窗口太长不在本脚本内等）
// 另覆盖：换桌（点「换一张新桌」）会回收旧桌；输错房间码报错而非偷建孤儿桌。
process.env.MG_RESUME_MS = process.env.MG_RESUME_MS || '1500';
process.env.MG_ROOMS_OFF = '1';
process.env.MG_MAX_SOLO_PER_IP = process.env.MG_MAX_SOLO_PER_IP || '1';

const http = require('http');
const urlmod = require('url');
const WebSocket = require('ws');
const { attach, _rooms } = require('../server/ws-relay');

// 伪造鉴权：仅 tok-abc / tok-xyz 视为有效登录态（模拟生产 getUserByToken），其余（含无 token）视为匿名。
// 中继拿到的是服务端验证过的账号，因此「一人一桌」严格按账号算，不再可被客户端自报昵称蒙混。
const fakeAuth = (req) => {
    const t = (req.headers['authorization'] || '').replace('Bearer ', '') || urlmod.parse(req.url, true).query.token;
    const map = { 'tok-abc': { username: 'abc', nickname: '甲', displayId: 'A01' }, 'tok-xyz': { username: 'xyz', nickname: '乙', displayId: 'B02' } };
    return t ? (map[t] || null) : null;
};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ip 参数：伪造 X-Forwarded-For（模拟经宝塔 Nginx 反代后的真实公网 IP）；
// 不传则走回环地址 —— IP 闸门对回环自动放行（否则本机跑多个回归脚本会互相挤兑）。
function makeClient(url, ip, tk) {
    const full = tk ? (url + (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(tk)) : url;
    const ws = new WebSocket(full, ip ? { headers: { 'x-forwarded-for': ip } } : undefined);
    const handlers = {};
    const c = {
        ws, room: null, seats: [], notices: [], errors: [], tables: [],
        open: () => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); }),
        send(type, data) { ws.send(JSON.stringify({ type, data })); },
        on(type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); },
        waitFor(type, timeout = 3000) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout: ' + type)), timeout); c.on(type, d => { clearTimeout(t); res(d); }); }); },
        close() { try { ws.terminate(); } catch (e) {} },
    };
    ws.on('message', buf => {
        let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
        if (m.type === 'seat') c.seats.push(m.data);
        if (m.type === 'notice') c.notices.push(m.data);
        if (m.type === 'error') c.errors.push(m.data);
        if (m.type === 'tables' && m.data && m.data.tables) c.tables.push(m.data.tables);
        (handlers[m.type] || []).forEach(h => h(m.data));
    });
    return c;
}

// 该 IP 名下持有的房间总数（含已开战）——用于断言「第 N+1 次建房没有新开房间」
const roomsHeldByIp = ip => {
    let n = 0;
    for (const [, room] of _rooms) {
        if (room.peers.some(p => p && p.ws && p.ws._ip === ip)) n++;
    }
    return n;
};

(async () => {
    const server = http.createServer();
    attach(server, { getUserByToken: fakeAuth });
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const url = `ws://127.0.0.1:${port}/ws/minigame`;
    console.log('[relay] 监听于', url, 'MAX_SOLO_PER_IP=', process.env.MG_MAX_SOLO_PER_IP);

    // ---------- [1] 连点「创建新桌」：只应留下一张桌 ----------
    console.log('\n[1] 连点「创建新桌」不再堆出同名空桌');
    const OBS = makeClient(url);   // 大厅旁观者：只看桌子列表，不入座
    const A = makeClient(url);
    await Promise.all([OBS.open(), A.open()]);
    OBS.send('lobby', { game: 'gomoku', cap: 2 });
    A.send('lobby', { game: 'gomoku', cap: 2 });
    await sleep(80);
    A.send('join', { game: 'gomoku', cap: 2, create: true, me: 'liming' });
    A.send('join', { game: 'gomoku', cap: 2, create: true, me: 'liming' });
    A.send('join', { game: 'gomoku', cap: 2, create: true, me: 'liming' });
    await sleep(300);
    const roomsA = A.seats.map(s => s.room);
    ok(roomsA.length === 3, '三次点击都拿到 seat 回应（' + roomsA.length + ' 次）');
    ok(roomsA.every(r => r === roomsA[0]), '三次「创建新桌」返回同一房间码（复用原桌）: ' + roomsA[0]);
    ok(_rooms.size === 1, '服务端只存在 1 个房间（旧实现会留下 3 个）: size=' + _rooms.size);
    const lastTables = OBS.tables.length ? OBS.tables[OBS.tables.length - 1] : null;
    ok(lastTables && lastTables.length === 1, '大厅桌子列表只有 1 张桌（旁观者视角）: ' + (lastTables ? lastTables.length : 'n/a'));
    ok(A.notices.some(n => /已经在桌子上/.test(n.msg || '')), '复用原桌时给出「你已经在桌子上」提示');

    // ---------- [2] 明确「换一张新桌」：旧桌被回收 ----------
    console.log('\n[2] 点「换一张新桌」重开 → 旧桌立即回收');
    const before = roomsA[0];
    A.seats.length = 0;
    A.send('join', { game: 'gomoku', cap: 2, create: true, fresh: true, me: 'liming' });
    await sleep(250);
    const after = A.seats.length ? A.seats[0].room : null;
    ok(!!after && after !== before, '换桌得到新的房间码: ' + before + ' → ' + after);
    ok(_rooms.size === 1, '旧桌已被回收（服务端仍只有 1 个房间）: size=' + _rooms.size);
    ok(!_rooms.has(before), '旧房间码已从房间表中删除');

    // ---------- [3] 大厅列表显示的人数与实际一致 ----------
    console.log('\n[3] 大厅列表带座位快照');
    const B = makeClient(url);
    await B.open();
    B.send('lobby', { game: 'gomoku', cap: 2 });
    await sleep(150);
    const t3 = B.tables[B.tables.length - 1] || [];
    ok(t3.length === 1 && t3[0].room === after, '旁观者看到 A 的桌子（房间码一致）');
    ok(t3[0] && (t3[0].seats || []).filter(Boolean).length === 1, '该桌座位快照为 1 人已坐 / 1 空位');

    // ---------- [4] 输错房间码：报错而不是偷偷建一张孤儿桌 ----------
    console.log('\n[4] 输错房间码不偷建孤儿桌');
    const sizeBefore = _rooms.size;
    B.send('join', { game: 'gomoku', cap: 2, room: 'mg-gomoku-00000000', code: true, me: 'B' });
    await sleep(250);
    ok(B.errors.length === 1, '收到「房间不存在」错误提示');
    ok(_rooms.size === sizeBefore, '服务端房间数未变（没有凭空多出一张桌）: ' + _rooms.size);

    // ---------- [5] 输对房间码正常入座并开战 ----------
    console.log('\n[5] 输对房间码正常入座');
    B.seats.length = 0;
    B.send('join', { game: 'gomoku', cap: 2, room: after, code: true, me: 'B' });
    const [startA, startB] = await Promise.all([A.waitFor('start'), B.waitFor('start')]);
    ok(startA && startB && startA.side !== startB.side, '两人 side 不同，正常开局（A=' + startA.side + ' B=' + startB.side + '）');

    // ---------- [6] 坐在别人桌上时点创建：旧桌留给原主，自己另开 ----------
    console.log('\n[6] 中途换桌：从别人的桌子里摘出来');
    const E = makeClient(url), F = makeClient(url);
    await Promise.all([E.open(), F.open()]);
    E.send('join', { game: 'richman', cap: 4, create: true, me: 'E' });
    const eSeat = await E.waitFor('seat'); E.room = eSeat.room;
    F.send('join', { game: 'richman', cap: 4, room: E.room, me: 'F' });
    await sleep(200);
    const sizeR = _rooms.size;
    E.seats.length = 0;
    F.send('join', { game: 'richman', cap: 4, create: true, me: 'F' });
    await sleep(300);
    const eRoom = _rooms.get(E.room);
    ok(!!eRoom && eRoom.peers.length === 1, '原桌仍在且只剩房主 1 人（F 已摘出）: peers=' + (eRoom ? eRoom.peers.length : 'n/a'));
    ok(!eRoom.started, '原桌未被误判为开局');
    ok(_rooms.size === sizeR + 1, 'F 另开了一张新桌（房间总数 +1）: ' + _rooms.size);
    const eSeatAfter = E.seats.length ? E.seats[E.seats.length - 1] : null;
    ok(eSeatAfter && eSeatAfter.room === E.room && eSeatAfter.you === 0, '房主收到座位更新，仍坐 0 号位');

    // ---------- [7] 同一公网 IP：一个人只能开一张桌子 ----------
    console.log('\n[7] 同一 IP 多开标签页：一个人只能有一张桌子');
    const IP = '203.0.113.9';
    const many = [];
    for (let i = 0; i < 3; i++) { const c = makeClient(url, IP); many.push(c); await c.open(); }
    many.forEach((c, i) => c.send('join', { game: 'ludo', cap: 2, create: true, me: 'tab' + i }));
    await sleep(400);
    ok(roomsHeldByIp(IP) === 1, '该 IP 名下只持有 1 张桌子（多开 N 个标签也不会堆出多张）: ' + roomsHeldByIp(IP));
    ok(many[0].seats.length === 1, '第一个连接成功开桌并拿到座位');
    const surplus = many.slice(1);
    ok(surplus.every(c => c.notices.some(n => /已经有一张桌子/.test(n.msg || ''))), '其余连接都被提示「已经有一张桌子」且未新开桌');
    ok(surplus.every(c => c.seats.length === 0), '超出的连接没有被塞进自己那张空桌当第二个玩家（杜绝自对弈/误开局）');
    let fullLudo = 0;
    for (const [, r] of _rooms) if (r.game === 'ludo' && r.peers.length >= 2) fullLudo++;
    ok(fullLudo === 0, '不存在被「自己凑齐」的 ludo 桌（仍是 1 人空桌）: ' + fullLudo);

    // ---------- [8] 同一条连接重复入座同一房间：座位不叠加 ----------
    console.log('\n[8] 重复入座同一房间不叠加座位');
    const G = makeClient(url);
    await G.open();
    G.send('join', { game: 'ludo', cap: 3, room: 'mg-ludo-aaaaaaaa', me: 'G' });
    await sleep(150);
    G.send('join', { game: 'ludo', cap: 3, room: 'mg-ludo-aaaaaaaa', me: 'G' });
    await sleep(200);
    const gRoom = _rooms.get('mg-ludo-aaaaaaaa');
    ok(!!gRoom && gRoom.peers.length === 1, '同连接重复 join 同一房间仍只有 1 个座位（未被自己占满）: peers=' + (gRoom ? gRoom.peers.length : 'n/a'));

    // ---------- [9] 按账号计「一人一桌」：登录用户不受回环放行影响，不同账号互不挤占 ----------
    console.log('\n[9] 登录态按账号计「一人一桌」（不再只看 IP）');
    const ludoOf = owner => { let n = 0; for (const [, r] of _rooms) if (r.game === 'ludo' && r.peers.some(p => p && p.ws && p.ws._owner === owner)) n++; return n; };
    const beforeU = ludoOf('u:abc'), beforeX = ludoOf('u:xyz'), beforeAnon = ludoOf('ip:127.0.0.1');
    const a1 = makeClient(url, null, 'tok-abc'), a2 = makeClient(url, null, 'tok-abc');
    const b1 = makeClient(url, null, 'tok-xyz');
    const anon = makeClient(url);   // 无 token 的匿名回环连接
    await Promise.all([a1.open(), a2.open(), b1.open(), anon.open()]);
    a1.send('join', { game: 'ludo', cap: 2, create: true, me: '甲' });
    b1.send('join', { game: 'ludo', cap: 2, create: true, me: '乙' });
    anon.send('join', { game: 'ludo', cap: 2, create: true, me: '匿名' });
    await sleep(300);
    a2.send('join', { game: 'ludo', cap: 2, create: true, me: '甲也' });
    await sleep(300);
    ok(ludoOf('u:abc') === beforeU + 1, '账号 abc 净增 1 张桌（回环地址不再豁免登录用户）: ' + beforeU + ' → ' + ludoOf('u:abc'));
    ok(a2.notices.some(n => /已经有一张桌子/.test(n.msg || '')), '同一账号第二个标签被提示「已经有一张桌子」且未新开桌');
    ok(a2.seats.length === 0, '超出的登录连接没有被塞成自己桌的第二个玩家');
    ok(ludoOf('u:xyz') === beforeX + 1, '不同账号 xyz 也有自己的一张桌（互不挤占）: ' + beforeX + ' → ' + ludoOf('u:xyz'));
    ok(ludoOf('ip:127.0.0.1') === beforeAnon + 1, '匿名回环连接仍可开桌（本地开发放行）: ' + beforeAnon + ' → ' + ludoOf('ip:127.0.0.1'));

    [OBS, A, B, E, F, G, ...many, a1, a2, b1, anon].forEach(c => c.close());
    await sleep(80);
    console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
    try { server.close(); } catch (e) {}
    setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
