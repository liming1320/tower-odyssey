// 冒烟测试：装备 / 戒指 / 神器 / 宝石 / 升星 / 后台墙/活动/玩家发钻
const http = require('http');
const HOST = '127.0.0.1', PORT = 5180;

function call(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : '';
        const req = http.request({
            host: HOST, port: PORT, method, path,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
            },
        }, res => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => {
                try { resolve(JSON.parse(buf)); }
                catch (e) { reject(new Error('JSON 解析失败: ' + buf.slice(0, 100))); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}
let pass = 0, fail = 0;
function check(ok, label) {
    if (ok) { pass++; console.log('✅', label); }
    else    { fail++; console.log('❌', label); }
}

(async () => {
    // ---- 1. 注册并登录普通玩家 ----
    const rnd = Math.random().toString(36).slice(2, 6);
    const user = `eq${rnd}`;
    const reg = await call('POST', '/api/register', { username: user, password: '1234' });
    if (!reg.token) { console.log('注册失败:', JSON.stringify(reg)); process.exit(1); }
    check(!!reg.token, `注册成功 (${user})`);
    const token = reg.token;

    // ---- 2. 管理员登录 ----
    const adm = await call('POST', '/api/admin/login', { username: 'admin', password: 'workbuddy' });
    check(!!adm.token, '管理员登录成功');
    const admTok = adm.token;

    // ---- 3. 拿到 /api/heroes 看新表是否齐全 ----
    const her = await call('GET', '/api/heroes', null, token);
    check(her.equipmentTemplates && her.equipmentTemplates.length === 28,
        `装备模板 28 个 (4 槽 × 7 品质)，实际 ${(her.equipmentTemplates || []).length}`);
    check(her.ringTemplates && her.ringTemplates.length === 7, `戒指模板 7 个，实际 ${(her.ringTemplates || []).length}`);
    check(her.artifactTemplates && her.artifactTemplates.length === 7, `神器模板 7 个，实际 ${(her.artifactTemplates || []).length}`);
    check(her.gemTemplates && her.gemTemplates.length === 12, `宝石模板 12 个（6 品质 × 2 类型），实际 ${(her.gemTemplates || []).length}`);
    check(her.events && her.events.length > 0, `活动数 ${her.events.length}`);
    check(her.meta && her.meta.qualityName, '品质元信息已下发');
    // 装备 4 槽，绿色最差 → 蓝色 → 紫色 → 橙色 → 红色 → 金色 → 彩色
    const greenEq = her.equipmentTemplates.find(e => e.quality === 'green');
    const rainbowEq = her.equipmentTemplates.find(e => e.quality === 'rainbow' && e.slot === 'weapon');
    check(greenEq && greenEq.atk > 0, `绿色武器 攻击 ${greenEq && greenEq.atk}`);
    check(rainbowEq && rainbowEq.atk > (greenEq.atk * 10),
        `彩色武器攻击 ${rainbowEq && rainbowEq.atk} >> 绿色 ${greenEq.atk}（10+倍）`);

    // ---- 4. 新建英雄 → 玩家图鉴立刻出现 ----
    const newH = await call('POST', '/api/admin/hero/add', {
        hero: {
            name: '冒烟测试战士',
            desc: '由后台添加的测试英雄',
            rarity: '传说', element: '火',
            baseAtk: 2500, baseHp: 15000,
            img: 'bbf34fedc435bb32a4f253c4d534f749.jpg',
            skill: { name: '烈焰击', desc: '对全体造成 200% 攻击伤害', cd: 5, multiplier: 2.0, fx: 'fire', tint: '#ff7a2f' },
        },
    }, admTok);
    check(!!newH.hero && !!newH.hero.id, '后台添加英雄成功');
    const her2 = await call('GET', '/api/heroes', null, token);
    const found = her2.heroes.find(h => h.name === '冒烟测试战士');
    check(!!found, '玩家图鉴立刻看到新英雄');
    check(found && found.skill && found.skill.name === '烈焰击', '新英雄技能同步到玩家');
    check(found && found.desc === '由后台添加的测试英雄', '新英雄描述同步到玩家');

    // ---- 5. 删掉新英雄 ----
    if (newH.hero) {
        const del = await call('POST', '/api/admin/hero/delete', { id: newH.hero.id }, admTok);
        check(del.ok, '删除英雄成功');
    }

    // ---- 6. 买许愿卡抽英雄 ----
    await call('POST', '/api/shop/buy-wish', { count: 10 }, token);
    const wish = await call('POST', '/api/wish', { count: 10 }, token);
    check(wish.items && wish.items.length === 10, `许愿 10 次得到 ${wish.items.length} 个英雄`);
    if (!wish.items.length) { console.log('提前结束：没有英雄'); return; }
    const myHeroUid = wish.items[0].hero.uid;
    const myHeroId = wish.items[0].hero.id;
    console.log(`  -> 第一个英雄 uid=${myHeroUid.slice(0,8)} id=${myHeroId}`);

    // ---- 7. 上阵 ----
    const eq = await call('POST', '/api/hero/equip', { uid: myHeroUid }, token);
    check(eq.ok, '英雄上阵');

    // ---- 8. 装备一件（武器 优秀）----
    const her3 = await call('GET', '/api/heroes', null, token);
    const before = her3.owned.find(o => o.uid === myHeroUid);
    const greenWpn = her3.equipmentTemplates.find(e => e.slot === 'weapon' && e.quality === 'green');
    const r1 = await call('POST', '/api/hero/equip-item', { uid: myHeroUid, slot: 'weapon', itemId: greenWpn.id }, token);
    check(r1.ok, `装备 ${greenWpn.name}（${greenWpn.quality}）`);
    const her4 = await call('GET', '/api/heroes', null, token);
    const after = her4.owned.find(o => o.uid === myHeroUid);
    check(after.atk > before.atk || after.hp > before.hp, `装备后属性上涨：攻 ${before.atk}→${after.atk} 生命 ${before.hp}→${after.hp}`);

    // ---- 9. 换装更高级的橙色武器 ----
    const orangeWpn = her4.equipmentTemplates.find(e => e.slot === 'weapon' && e.quality === 'orange');
    await call('POST', '/api/hero/equip-item', { uid: myHeroUid, slot: 'weapon', itemId: orangeWpn.id }, token);
    const her5 = await call('GET', '/api/heroes', null, token);
    const after2 = her5.owned.find(o => o.uid === myHeroUid);
    check(after2.atk > after.atk, `橙武替换绿武：攻 ${after.atk}→${after2.atk}`);

    // ---- 10. 装戒指 ----
    const blueRing = her5.ringTemplates.find(r => r.quality === 'blue');
    const rRing = await call('POST', '/api/hero/equip-ring', { uid: myHeroUid, ringId: blueRing.id }, token);
    check(rRing.ok, `装备戒指 ${blueRing.name}`);
    const her6 = await call('GET', '/api/heroes', null, token);
    const after3 = her6.owned.find(o => o.uid === myHeroUid);
    check(after3.atk > after2.atk || after3.hp > after2.hp, `戒指加成后：攻 ${after2.atk}→${after3.atk} 生命 ${after2.hp}→${after3.hp}`);

    // ---- 11. 装备神器并升 2 级 1 星 ----
    const blueArt = her6.artifactTemplates.find(a => a.quality === 'blue');
    await call('POST', '/api/hero/equip-artifact', { uid: myHeroUid, artifactId: blueArt.id }, token);
    const lv1 = await call('POST', '/api/hero/artifact-levelup', { uid: myHeroUid, cost: 100 }, token);
    check(lv1.ok && lv1.artifact.lv === 2, `神器升级 Lv.${lv1.artifact.lv}`);
    const st1 = await call('POST', '/api/hero/artifact-starup', { uid: myHeroUid, cost: 1 }, token);
    check(st1.ok && st1.artifact.star === 1, `神器升星 ${st1.artifact.star}★`);
    const her7 = await call('GET', '/api/heroes', null, token);
    const after4 = her7.owned.find(o => o.uid === myHeroUid);
    check(after4.atk > after3.atk && after4.hp > after3.hp,
        `神器 1 级 1 星加成：攻 ${after3.atk}→${after4.atk} 生命 ${after3.hp}→${after4.hp}`);
    check(after4.skillMulBonus > 1, `技能伤害加成生效 mulBonus=${(after4.skillMulBonus || 0).toFixed(2)}`);

    // ---- 12. 镶嵌 4 颗宝石 ----
    const blueAtkGem = her7.gemTemplates.find(g => g.quality === 'blue' && g.type === 'atk');
    const blueHpGem  = her7.gemTemplates.find(g => g.quality === 'blue' && g.type === 'hp');
    for (let i = 0; i < 4; i++) {
        const g = i % 2 ? blueAtkGem : blueHpGem;
        await call('POST', '/api/hero/set-gem', { uid: myHeroUid, slot: i, gemId: g.id }, token);
    }
    const her8 = await call('GET', '/api/heroes', null, token);
    const after5 = her8.owned.find(o => o.uid === myHeroUid);
    check(after5.atk > after4.atk && after5.hp > after4.hp, `4 颗宝石加成：攻 ${after4.atk}→${after5.atk} 生命 ${after4.hp}→${after5.hp}`);

    // ---- 13. 卸下宝石 ----
    const unG = await call('POST', '/api/hero/set-gem', { uid: myHeroUid, slot: 0, gemId: null }, token);
    check(unG.ok, '卸下宝石');

    // ---- 14. 英雄升星 ----
    // 先给玩家补点金币（升星需要 5000*星级）
    await call('POST', '/api/admin/user/grant', { username: user, rewards: { gold: 50000 } }, admTok);
    const star = await call('POST', '/api/hero/starup', { uid: myHeroUid }, token);
    check(star.ok && star.hero.star === 1, `英雄升星 1★`);

    // ---- 15. 后台：城墙编辑 ----
    const wsave = await call('POST', '/api/admin/wall/update', {
        lv: 99, name: '测试墙', atkPct: 88, hpPct: 88, skillDesc: '测试技能',
    }, admTok);
    check(wsave.ok, '后台添加城墙等级 99');
    const wDel = await call('POST', '/api/admin/wall/delete', { lv: 99 }, admTok);
    check(wDel.ok, '后台删除城墙');

    // ---- 16. 后台：活动编辑 ----
    const esave = await call('POST', '/api/admin/event/save', {
        event: { name: '冒烟测试活动', type: 'limited', desc: '测测', active: true, rewards: { gold: 1000 } },
    }, admTok);
    check(esave.ok && esave.event.id, `后台添加活动 id=${(esave.event && esave.event.id || '').slice(0, 8)}`);
    await call('POST', '/api/admin/event/delete', { id: esave.event.id }, admTok);

    // ---- 17. 后台：发钻给单个玩家和所有玩家 ----
    const u0 = her.users || (await call('GET', '/api/admin/overview', null, admTok)).users;
    const me = u0.find(u => u.username === user);
    const beforeGems = me.gems;
    const grant1 = await call('POST', '/api/admin/user/grant', {
        username: user, rewards: { gems: 5000, wishCards: 5 },
    }, admTok);
    check(grant1.ok && grant1.count === 1, `给 ${user} 发 5000 钻 + 5 许愿卡（${grant1.count} 人）`);
    const ov2 = await call('GET', '/api/admin/overview', null, admTok);
    const me2 = ov2.users.find(u => u.username === user);
    check(me2.gems === beforeGems + 5000, `钻石 ${beforeGems} → ${me2.gems}`);
    const grant2 = await call('POST', '/api/admin/user/grant', {
        toAll: true, rewards: { gold: 100 },
    }, admTok);
    check(grant2.ok && grant2.count >= 2, `给所有玩家发 100 金（${grant2.count} 人）`);

    // ---- 18. 玩家能看到活动列表 ----
    const ev = await call('GET', '/api/events', null, token);
    check(Array.isArray(ev.events) && ev.events.length > 0, `玩家看到活动 ${ev.events.length} 个`);

    // ---- 19. 战斗仍正常 ----
    const lv = await call('GET', '/api/tower/level?floor=1', null, token);
    check(lv.heroes && lv.heroes.length > 0, '战斗英雄数据带新加成');
    check(lv.heroes[0].skill.mulBonus >= 1, `技能 mulBonus=${lv.heroes[0].skill.mulBonus.toFixed(2)}`);

    console.log(`\n==== ${pass} 通过 / ${fail} 失败 ====`);
    process.exit(fail ? 1 : 0);
})();
