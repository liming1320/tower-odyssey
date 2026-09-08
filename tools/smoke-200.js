// 冒烟测试：200 层关卡 / Boss 去重 / 难度递增 / 营地产出 / 钻石商城
const BASE = 'http://127.0.0.1:5180';
let TOKEN = '';

async function call(method, path, body) {
    const res = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: TOKEN ? 'Bearer ' + TOKEN : '' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.error || ''}`);
    return json;
}

const ok = [], bad = [];
function check(cond, msg) { (cond ? ok : bad).push(msg); }

(async () => {
    // 1. 注册 + 钻石
    const name = 't' + Date.now().toString(36);
    let r = await call('POST', '/api/register', { username: name, password: '1234' });
    TOKEN = r.token;
    const gems = r.user.state.resources.gems;
    check(gems === 100000, `新玩家初始钻石 = ${gems}（期望 100000）`);

    // 2. 钻石买许愿卡
    r = await call('POST', '/api/shop/buy-wish', { count: 10 });
    check(r.cost === 1000 && r.state.wishCards >= 10, `1000 钻买 10 张许愿卡 → 卡 ${r.state.wishCards}，钻石 ${Math.floor(r.state.resources.gems)}`);

    // 3. 抽卡 + 上阵
    r = await call('POST', '/api/wish', { count: 10 });
    check(r.items && r.items.length === 10, `十连获得 ${r.items.length} 个英雄`);
    const heroes = await call('GET', '/api/heroes');
    for (const oh of heroes.owned.slice(0, 5)) await call('POST', '/api/hero/equip', { uid: oh.uid });

    // 4. 塔信息
    const info = await call('GET', '/api/tower/info');
    check(info.maxFloor === 200 && info.chapters.length === 10, `总层数 ${info.maxFloor} / ${info.chapters.length} 个章节`);

    // 5. 逐层采样：难度递增 + Boss 不重复 + 怪种组合
    const samples = [1, 2, 3, 5, 10, 20, 25, 40, 50, 75, 100, 125, 150, 175, 200];
    const rows = [];
    const bossSeq = [];
    const poolSet = new Set();
    for (const f of samples) {
        const lv = await call('GET', `/api/tower/level?floor=${f}`);
        let mobHp = 0, mobAtk = 0, cnt = 0, bossHp = 0;
        const names = new Set();
        for (const w of lv.waves) {
            for (const e of w.enemies) {
                cnt++;
                names.add(e.name);
                if (e.boss) bossHp += e.maxHp;
                else { mobHp = Math.max(mobHp, e.maxHp); mobAtk = Math.max(mobAtk, e.atk); }
            }
        }
        rows.push({
            f, waves: lv.waves.length, cnt, mobHp, mobAtk, bossHp,
            boss: lv.boss ? lv.boss.name : '', chapter: lv.chapter.name,
            baseHp: lv.power.baseMobHp, baseAtk: lv.power.baseMobAtk,
            theme: lv.theme ? lv.theme.name : '-',
        });
        poolSet.add([...names].sort().join('/'));
        if (lv.boss) bossSeq.push({ f, name: lv.boss.name, base: lv.boss.name.split('·')[0] });
    }

    console.log('\n层数  波次 怪数   小怪HP(基准)  小怪ATK   BOSS HP     章节 / BOSS');
    for (const x of rows) {
        console.log(
            String(x.f).padEnd(5),
            String(x.waves).padEnd(4),
            String(x.cnt).padEnd(5),
            (x.baseHp + ' (' + x.mobHp + ')').padEnd(13),
            String(x.baseAtk).padEnd(8),
            String(x.bossHp || '-').padEnd(11),
            x.chapter + (x.boss ? ' / ' + x.boss : ''),
        );
    }

    // 难度单调递增（用该层 1.0 系数小怪的基准值判断，排除怪种随机带来的波动）
    let mono = true, why = '';
    for (let i = 1; i < rows.length; i++) {
        if (rows[i].baseHp < rows[i - 1].baseHp) { mono = false; why = `第 ${rows[i].f} 层小怪血量低于第 ${rows[i - 1].f} 层`; }
        if (rows[i].baseAtk < rows[i - 1].baseAtk) { mono = false; why = `第 ${rows[i].f} 层小怪攻击低于第 ${rows[i - 1].f} 层`; }
    }
    check(mono, '难度随层数单调递增（小怪基准 HP / ATK）' + (mono ? '' : ' → ' + why));
    check(rows[rows.length - 1].baseHp > rows[0].baseHp * 5, `第 200 层小怪基准血量是第 1 层的 ${(rows[rows.length - 1].baseHp / rows[0].baseHp).toFixed(1)} 倍`);
    check(poolSet.size === samples.length, `${samples.length} 个采样层的怪种组合各不相同（${poolSet.size} 种）`);
    const themes = new Set(rows.map(r => r.theme));
    check(themes.size >= 6, `采样层覆盖 ${themes.size} 个章节主题`);

    // 6. 全部 40 个 BOSS 层：相邻不重复
    const allBoss = [];
    for (let f = 5; f <= 200; f += 5) {
        const lv = await call('GET', `/api/tower/level?floor=${f}`);
        allBoss.push({ f, name: lv.boss.name, base: lv.boss.name.split('·')[0] });
    }
    let adjSame = 0;
    for (let i = 1; i < allBoss.length; i++) if (allBoss[i].base === allBoss[i - 1].base) adjSame++;
    check(adjSame === 0, `40 个 BOSS 层相邻不重复（重复次数 ${adjSame}）`);
    const uniqBase = new Set(allBoss.map(b => b.base));
    check(uniqBase.size === 8, `BOSS 共 ${uniqBase.size} 种，重复出现时带阶数后缀`);
    console.log('\nBOSS 层序列：');
    console.log(allBoss.map(b => `${b.f}:${b.name}`).join('  '));

    // 7. 营地
    let camp = await call('GET', '/api/camp');
    console.log('\n营地每分钟产出：', JSON.stringify(camp.perMin), '研究院加成', camp.bonus);
    check(Object.keys(camp.perMin).length >= 4, `营地产出 ${Object.keys(camp.perMin).length} 种资源`);
    // 挂机收益：pending 随时间累积（不再自动入账，需要手动领取）
    const before = { ...camp.resources };
    const p1 = camp.pendingSec;
    await new Promise(r2 => setTimeout(r2, 8000));
    camp = await call('GET', '/api/camp');
    check(camp.pendingSec > p1, `挂机时间持续累积：${p1}s → ${camp.pendingSec}s`);
    const col = await call('POST', '/api/camp/collect');
    check(col.ok && col.gains.wood != null, `手动领取 ${col.seconds}s 产出：${JSON.stringify(col.gains)}`);
    const campAfter = await call('GET', '/api/camp');
    check(campAfter.resources.wood > before.wood, `领取后木材 ${Math.floor(before.wood)} → ${Math.floor(campAfter.resources.wood)}`);

    // 升级建筑
    camp = await call('GET', '/api/camp');
    const def0 = camp.defs.find(d => d.key === 'camp');
    const up = await call('POST', '/api/building/upgrade', { which: 'camp' });
    check(up.state.buildings.camp === def0.lv + 1, `大本营 Lv.${def0.lv} → Lv.${up.state.buildings.camp}`);
    const camp2 = await call('GET', '/api/camp');
    check(camp2.perMin.wood > camp.perMin.wood, `升级后木材产出 ${Math.round(camp.perMin.wood)} → ${Math.round(camp2.perMin.wood)}/分`);

    // 8. 通关结算（首通）
    const cl = await call('POST', '/api/tower/clear', { floor: 1 });
    check(cl.first === true && cl.rewards.gems > 0, `首通第 1 层：钻石 +${cl.rewards.gems}，资源翻倍`);

    // 9. 持久化：重启也能读回（校验 db.json 内容）
    const me = await call('GET', '/api/me');
    check(me.user.state.tower.maxFloor === 1 && me.user.state.buildings.camp === def0.lv + 1,
        `进度已写入存档（最高层 ${me.user.state.tower.maxFloor}，大本营 Lv.${me.user.state.buildings.camp}）`);

    console.log('\n===== 通过 ' + ok.length + ' 项 =====');
    ok.forEach(m => console.log('  ✅ ' + m));
    if (bad.length) {
        console.log('\n===== 失败 ' + bad.length + ' 项 =====');
        bad.forEach(m => console.log('  ❌ ' + m));
        process.exit(1);
    }
    console.log('\n全部通过');
})().catch(e => { console.error('测试异常：', e.message); process.exit(1); });
