// 英雄详情弹窗：升级 / 星级天赋 / 神器 / 宝石 / 装备锻造 / 技能
const HeroDetail = {
    tab: 'upgrade', // upgrade | star | artifact | gem | equip | forge | skill
    cache: null,

    async open(uid, app) {
        const r = await API.heroes();
        this.cache = r;
        const oh = r.owned.find(h => h.uid === uid);
        if (!oh) { U.toast('英雄不存在'); return; }
        this.uid = uid;
        this._render(app);
    },

    // 统一的「操作后刷新」：拉最新存档 → 重绘
    async _after(app, msg) {
        const fresh = await API.heroes();
        this.cache = fresh;
        const me = await API.me();
        if (me && me.user) { app.user = me.user; app.refresh(); }
        if (msg) U.toast(msg);
        this._render(app);
    },

    _render(app) {
        const r = this.cache;
        const oh = r.owned.find(h => h.uid === this.uid);
        if (!oh) { U.toast('英雄不存在'); return; }
        const t = r.heroes.find(x => x.id === oh.id);
        const slots = (r.meta && r.meta.equipSlots) || ['weapon', 'armor', 'helmet', 'boots'];
        const slotName = (r.meta && r.meta.equipSlotName) || { weapon: '武器', armor: '护甲', helmet: '头盔', boots: '鞋子' };
        const QN = (r.meta && r.meta.qualityName) || U.quality.name;
        const starBase = (r.meta && r.meta.starBase) || 5;
        const starMax = (r.meta && r.meta.starMax) || 16;
        const star = oh.star || starBase;
        const starPerks = (r.meta && r.meta.starPerks) || [];
        // 升星所需材料英雄数量表 + 玩家当前持有的材料英雄数
        const starMatCost = r.starMatCost || {};
        const matCount = (r.owned || []).filter(o => o.material || o.tier < 5).length;

        const skills = (t.skills && t.skills.length) ? t.skills : [t.skill];

        const modal = U.openModal(`
            <div style="text-align:center;margin-bottom:8px">
                <div style="font-size:12px;color:#b9b3d8">${t.element}系 · ${t.rarity}</div>
                <h3 style="color:#ffd56b">${t.name}
                    <span class="${U.rarityClass(t.rarity)}" style="font-size:13px;margin-left:4px">${t.rarity}</span>
                </h3>
                <div style="margin:4px 0 2px">${U.starHtml(star, 16)}</div>
                <div style="font-size:11px;color:#b9b3d8">${star} / ${starMax} 星</div>
                <div style="font-size:12px;color:#b9b3d8;line-height:1.5;max-width:380px;margin:6px auto">
                    ${t.desc || (t.element + '系英雄')}
                </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;margin-bottom:10px">
                <div class="hd-stat">⚔️ <b style="color:#ff9d5c">${U.num(oh.atk)}</b></div>
                <div class="hd-stat">❤️ <b style="color:#5cc7ff">${U.num(oh.hp)}</b></div>
                <div class="hd-stat">Lv.${oh.lv}</div>
                <div class="hd-stat">⚡ ${skills.length} 个技能</div>
            </div>
            <div class="admin-tabs" style="margin-bottom:8px">
                <button data-t="upgrade" class="${this.tab === 'upgrade' ? 'active' : ''}">升级</button>
                <button data-t="star"    class="${this.tab === 'star' ? 'active' : ''}">星级天赋</button>
                <button data-t="skill"   class="${this.tab === 'skill' ? 'active' : ''}">技能</button>
                <button data-t="forge"   class="${this.tab === 'forge' ? 'active' : ''}">锻造</button>
                <button data-t="equip"   class="${this.tab === 'equip' ? 'active' : ''}">装备/戒指</button>
                <button data-t="artifact" class="${this.tab === 'artifact' ? 'active' : ''}">神器</button>
                <button data-t="gem"     class="${this.tab === 'gem' ? 'active' : ''}">宝石</button>
            </div>
            <div id="hd-body"></div>
        `);
        modal.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
            this.tab = b.dataset.t;
            this._render(app);
        });
        const body = modal.querySelector('#hd-body');

        const map = {
            upgrade: '_tabUpgrade', star: '_tabStar', skill: '_tabSkill',
            forge: '_tabForge', equip: '_tabEquip', artifact: '_tabArtifact', gem: '_tabGem',
        };
        this[map[this.tab]](body, app, oh, t, { slots, slotName, QN, starBase, starMax, starPerks, skills, starMatCost, matCount });
    },

    // ---------------- 升级 ----------------
    _tabUpgrade(body, app, oh, t, ctx) {
        const cost = Math.floor(30 * Math.pow(1.3, (oh.lv || 1) - 1));
        const gold = (app.user.state.resources && app.user.state.resources.gold) || 0;
        body.innerHTML = `
            <div class="card" style="text-align:center">
                <h3>英雄升级</h3>
                <p style="font-size:12px;color:#b9b3d8">每升 1 级：攻击 +10% 生命 +10%</p>
                <p style="margin:8px 0;font-size:14px">
                    Lv.${oh.lv} → Lv.${(oh.lv || 1) + 1}　<span style="color:#ffd56b">${U.num(cost)} 金币</span>
                </p>
                <button class="btn" id="hd-up" ${gold < cost ? 'disabled' : ''}>升级</button>
                ${gold < cost ? `<p style="color:#ff7a8b;font-size:11px;margin-top:6px">金币不足</p>` : ''}
            </div>
            <div class="card" style="background:rgba(0,0,0,0.25)">
                <h3>当前属性</h3>
                <div class="row"><span>攻击</span><b style="color:#ff9d5c">${U.num(oh.atk)}</b></div>
                <div class="row"><span>生命</span><b style="color:#5cc7ff">${U.num(oh.hp)}</b></div>
                <div class="row"><span>星级</span><b>${U.starHtml(oh.star || ctx.starBase)}</b></div>
            </div>
        `;
        body.querySelector('#hd-up').onclick = async () => {
            try {
                const rs = await API.heroLevelup(oh.uid);
                app.user.state = rs.state; app.refresh();
                await this._after(app, `升级成功！攻 +${rs.gain.atk}　生命 +${rs.gain.hp}`);
            } catch (e) { U.toast(e.message); }
        };
    },

    // ---------------- 星级天赋（5★ → 16★）----------------
    _tabStar(body, app, oh, t, ctx) {
        const star = oh.star || ctx.starBase;
        const maxed = star >= ctx.starMax;
        const cost = maxed ? null : {
            gold: Math.floor(20000 * Math.pow(1.55, star - ctx.starBase)),
            gems: Math.floor(200 * Math.pow(1.35, star - ctx.starBase)),
            iron: Math.floor(500 * Math.pow(1.4, star - ctx.starBase)),
        };
        const R = app.user.state.resources || {};
        // 材料英雄需求（8★ 起需要 3★/4★ 材料英雄）
        const needMat = cost ? ((ctx.starMatCost || {})[star] || 0) : 0;
        const matHave = ctx.matCount || 0;
        const matOk = needMat === 0 || matHave >= needMat;
        const canPay = cost && (R.gold || 0) >= cost.gold && (R.gems || 0) >= cost.gems && (R.iron || 0) >= cost.iron;
        const next = ctx.starPerks.find(p => p.star === star + 1);

        body.innerHTML = `
            <div class="card" style="text-align:center">
                <h3>星级天赋 <span style="font-size:12px;color:#b9b3d8">基础 ${ctx.starBase}★ → 上限 ${ctx.starMax}★</span></h3>
                <p style="font-size:22px;color:#ffd56b;margin:8px 0">
                    ${'★'.repeat(star)}<span style="color:#5a5470">${'☆'.repeat(Math.max(0, ctx.starMax - star))}</span>
                    <b style="font-size:14px;margin-left:6px">${star}★</b>
                </p>
                ${next ? `<p style="font-size:13px;color:#7cfc7c;margin-bottom:6px">
                    升至 ${next.star}★ 解锁：${next.icon} <b>${next.name}</b> — ${next.desc}
                </p>` : (maxed ? '<p style="color:#ffd56b;font-size:13px">已达最高星级，全部天赋已解锁</p>' : '')}
                ${cost ? `
                    <p style="font-size:12px;color:#b9b3d8;margin:6px 0">
                        消耗 💰${U.num(cost.gold)}　💎${U.num(cost.gems)}　${RES_ICON.iron}${U.num(cost.iron)}
                    </p>
                    ${needMat > 0 ? `
                        <p style="font-size:12px;margin:4px 0;color:${matOk ? '#7cfc7c' : '#ff7a8b'}">
                            另需材料英雄 <b>${needMat}</b> 个（3★/4★）　持有 <b>${matHave}</b> 个
                            ${matOk ? '' : '<span style="color:#ff7a8b">← 不足，去「英雄 → 许愿」获取</span>'}
                        </p>
                    ` : '<p style="font-size:11px;color:#777;margin:4px 0">本次升星不需要材料英雄</p>'}
                    <button class="btn" id="hd-star" ${(canPay && matOk) ? '' : 'disabled'}>
                        ${(canPay && matOk) ? '升星' : (!canPay ? '资源不足' : '材料不足')}
                    </button>
                ` : ''}
            </div>
            <div class="section-title">天赋一览（${ctx.starPerks.length} 项）</div>
            ${ctx.starPerks.map(p => {
                const on = star >= p.star;
                return `
                    <div class="perk-card ${on ? 'on' : ''}">
                        <div class="pk-star">${p.star}★</div>
                        <div class="pk-body">
                            <div class="pk-name">${p.icon} ${p.name} ${on ? '<span style="color:#7cfc7c;font-size:11px">已激活</span>' : '<span style="color:#777;font-size:11px">未解锁</span>'}</div>
                            <div class="pk-desc">${p.desc}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        `;
        const btn = body.querySelector('#hd-star');
        if (btn) btn.onclick = async () => {
            btn.disabled = true;
            try {
                const rs = await API.heroStarup(oh.uid);
                await this._after(app, rs.unlocked
                    ? `升至 ${rs.hero.star}★，解锁天赋「${rs.unlocked.name}」！`
                    : `升星成功 → ${rs.hero.star}★`);
            } catch (e) { U.toast(e.message); btn.disabled = false; }
        };
    },

    // ---------------- 技能（多技能）----------------
    _tabSkill(body, app, oh, t, ctx) {
        const bonus = Math.round(((oh.skillMulBonus || 1) - 1) * 100);
        body.innerHTML = `
            <div class="card" style="background:rgba(0,0,0,0.25)">
                <div class="row"><span>技能数量</span><b style="color:#ffd56b">${ctx.skills.length}</b></div>
                <div class="row"><span>星级+神器技能加成</span><b style="color:#7cfc7c">+${bonus}%</b></div>
            </div>
            ${ctx.skills.map((s, i) => `
                <div class="skill-card">
                    <div class="sk-head">
                        <b style="color:#ffd56b">${i === 0 ? '主技能' : i === 1 ? '第二技能' : '觉醒技'}：${s.name}</b>
                        <span class="sk-cd">CD ${s.cd}s</span>
                    </div>
                    <p class="sk-desc">${s.desc || '—'}</p>
                    <div class="sk-meta">
                        ${s.multiplier ? `<span>倍率 ${s.multiplier}</span>` : '<span>控制/增益型</span>'}
                        <span>特效 ${s.fx || 'slash'}</span>
                        <span style="color:${s.tint || '#ffd56b'}">■ 特效色</span>
                    </div>
                </div>
            `).join('')}
        `;
    },

    // ---------------- 装备锻造 ----------------
    _tabForge(body, app, oh, t, ctx) {
        const eq = oh.equip || {};
        const maxLv = (this.cache.meta && this.cache.meta.forgeMaxLv) || 100;
        const gain = (this.cache.meta && this.cache.meta.forgeLvGain) || 8;
        const all = this.cache.equipmentTemplates || [];
        body.innerHTML = `
            <div class="card" style="background:rgba(0,0,0,0.25);font-size:12px;color:#b9b3d8">
                ⚒️ 锻造：每升 1 级属性 +${gain}%（上限 ${maxLv} 级）；
                升品可跨品质阶（绿→蓝→紫→橙→红→金→彩），属性大幅跃升。
            </div>
            ${ctx.slots.map(s => {
                const raw = eq[s];
                const inst = (raw && typeof raw === 'object') ? raw : (raw ? { id: raw, lv: 1, quality: 'green' } : null);
                const tpl = inst ? all.find(x => x.id === inst.id) : null;
                const qi = U.quality.order.indexOf(inst ? inst.quality : 'green');
                const nextQ = U.quality.order[qi + 1];
                const lvCost = inst ? {
                    gold: Math.floor((400 + 260 * (inst.lv || 1)) * Math.pow(1.8, qi)),
                    iron: Math.floor((30 + 18 * (inst.lv || 1)) * Math.pow(1.7, qi)),
                } : null;
                const qCost = nextQ ? (() => {
                    const n = U.quality.order.indexOf(nextQ); // 下一档品质的序号
                    return {
                        gold: Math.floor(6000 * Math.pow(2.6, n - 1)),
                        iron: Math.floor(400 * Math.pow(2.2, n - 1)),
                        stone: Math.floor(260 * Math.pow(2.2, n - 1)),
                        gems: Math.floor(30 * Math.pow(2.0, n - 1)),
                    };
                })() : null;
                return `
                    <div class="forge-card">
                        <div class="fg-head">
                            <b>${ctx.slotName[s] || s}</b>
                            ${tpl ? `<span class="q-badge q-${inst.quality}">${ctx.QN[inst.quality]}</span>
                                     <span style="color:#b9b3d8;font-size:12px">${tpl.name}</span>
                                     <span style="color:#ffd56b;font-size:12px">+${inst.lv || 1}</span>`
                                 : '<span style="color:#777;font-size:12px">未装备</span>'}
                        </div>
                        ${tpl ? `
                            <div class="fg-stats">
                                ${tpl.atk ? `攻 <b style="color:#ff9d5c">+${Math.floor(tpl.atk * this._qRatio(inst.quality, tpl.quality) * (1 + 0.08 * ((inst.lv || 1) - 1)))}</b>` : ''}
                                ${tpl.hp ? `生命 <b style="color:#5cc7ff">+${U.num(Math.floor(tpl.hp * this._qRatio(inst.quality, tpl.quality) * (1 + 0.08 * ((inst.lv || 1) - 1))))}</b>` : ''}
                            </div>
                            <div class="fg-actions">
                                <button class="btn small" data-fl="${s}" data-t="1">升级 ${U.fmt(lvCost.gold)}金/${U.fmt(lvCost.iron)}铁</button>
                                <button class="btn small" data-fl="${s}" data-t="10">连升10级</button>
                                ${qCost ? `<button class="btn small" data-fq="${s}">升品→${ctx.QN[nextQ]}（💎${U.fmt(qCost.gems)}）</button>`
                                        : '<span style="color:#ffd56b;font-size:11px">已是神话品质</span>'}
                            </div>
                        ` : '<p style="color:#777;font-size:11px">请先到「装备/戒指」页穿戴装备</p>'}
                    </div>
                `;
            }).join('')}
        `;
        body.querySelectorAll('[data-fl]').forEach(b => b.onclick = async () => {
            b.disabled = true;
            try {
                const rs = await API.forgeLevelup(oh.uid, b.dataset.fl, parseInt(b.dataset.t));
                await this._after(app, `锻造成功 +${rs.levels} 级（当前 +${rs.equip.lv}）`);
            } catch (e) { U.toast(e.message); b.disabled = false; }
        });
        body.querySelectorAll('[data-fq]').forEach(b => b.onclick = async () => {
            b.disabled = true;
            try {
                const rs = await API.forgeQualityup(oh.uid, b.dataset.fq);
                await this._after(app, `升品成功 → ${rs.qualityName}`);
            } catch (e) { U.toast(e.message); b.disabled = false; }
        });
    },
    _qRatio(q, baseQ) {
        const M = { green: 1, blue: 1.6, purple: 2.6, orange: 4.2, red: 6.5, gold: 10, rainbow: 16 };
        return (M[q] || 1) / (M[baseQ] || 1);
    },

    // ---------------- 神器 ----------------
    _tabArtifact(body, app, oh, t, ctx) {
        const artList = this.cache.artifactTemplates || [];
        const QN = ctx.QN;
        const cur = oh.artifact;
        const curTpl = cur && cur.id ? artList.find(x => x.id === cur.id) : null;
        body.innerHTML = `
            ${curTpl ? `
                <div class="card">
                    <h3>当前神器：${curTpl.name}
                        <span class="q-badge q-${curTpl.quality}">${QN[curTpl.quality]}</span>
                    </h3>
                    <p style="color:#b9b3d8;font-size:12px">${curTpl.desc}</p>
                    <div class="row"><span>等级</span><b style="color:#ffd56b">Lv.${cur.lv || 1} / ${curTpl.maxLevel}</b></div>
                    <div class="row"><span>星级</span><b style="color:#ffd56b">${'★'.repeat(cur.star || 0)}${'☆'.repeat(curTpl.maxStar - (cur.star || 0))}</b></div>
                    <div class="row"><span>升级加攻/生命</span><b style="color:#ff9d5c">+${curTpl.lvAtkBase}</b> / <b style="color:#5cc7ff">+${curTpl.lvHpBase}</b> / 级</div>
                    <div class="row"><span>每升星技能 +</span><b style="color:#b78bff">+${curTpl.starSkillPct}%</b></div>
                    <div class="row" style="margin-top:6px">
                        <button class="btn small" id="hd-art-lv">升级（100 金）</button>
                        <button class="btn small" id="hd-art-st" style="margin-left:6px">升星（1 钻）</button>
                    </div>
                    <button class="btn ghost small" id="hd-art-unequip" style="margin-top:6px;width:100%">卸下</button>
                </div>
            ` : `<div class="card" style="text-align:center;color:#b9b3d8">未装备神器</div>`}
            <div class="section-title">神器列表</div>
            <div class="grid-3col">
                ${artList.map(a => {
                    const equipped = curTpl && curTpl.id === a.id;
                    return `
                        <div class="item-card ${equipped ? 'equipped' : ''}">
                            <div class="ic-qbadge"><span class="q-badge q-${a.quality}">${QN[a.quality]}</span></div>
                            <div class="ic-icon">${a.icon}</div>
                            <div class="ic-name">${a.name}</div>
                            ${equipped ? '<div style="color:#5cc7ff;font-size:10px">已装备</div>'
                                       : `<button class="btn small" data-equip="${a.id}">装备</button>`}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        if (curTpl) {
            body.querySelector('#hd-art-lv').onclick = async () => {
                try { await API.heroArtifactLevelup(oh.uid, 100); await this._after(app, '神器升级成功'); }
                catch (e) { U.toast(e.message); }
            };
            body.querySelector('#hd-art-st').onclick = async () => {
                try { await API.heroArtifactStarup(oh.uid, 1); await this._after(app, '神器升星成功'); }
                catch (e) { U.toast(e.message); }
            };
            body.querySelector('#hd-art-unequip').onclick = async () => {
                try { await API.heroUnequipArtifact(oh.uid); await this._after(app, '已卸下神器'); }
                catch (e) { U.toast(e.message); }
            };
        }
        body.querySelectorAll('[data-equip]').forEach(b => b.onclick = async () => {
            try { await API.heroEquipArtifact(oh.uid, b.dataset.equip); await this._after(app, '已装备神器'); }
            catch (e) { U.toast(e.message); }
        });
    },

    // ---------------- 宝石 ----------------
    _tabGem(body, app, oh, t, ctx) {
        const gemList = this.cache.gemTemplates || [];
        const QN = ctx.QN;
        const gems = oh.gems || {};
        body.innerHTML = `
            <div class="card">
                <h3>宝石槽（4 位）</h3>
                <div class="gem-slots">
                    ${[0, 1, 2, 3].map(i => {
                        const gid = gems[i];
                        const g = gid ? gemList.find(x => x.id === gid) : null;
                        return `
                            <div class="gem-slot ${g ? 'filled' : ''}">
                                ${g ? `
                                    <div class="q-badge q-${g.quality}">${QN[g.quality]}</div>
                                    <div class="gs-icon">${g.icon}</div>
                                    <div class="gs-name">${g.name}</div>
                                    <div class="gs-stat">${g.type === 'atk' ? '攻+' + g.atkPct + '%' : '生命+' + g.hpPct + '%'}</div>
                                    <button class="btn ghost small" data-ungem="${i}">卸下</button>
                                ` : `<div class="gs-empty">空</div>`}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div class="section-title">宝石库</div>
            <div class="grid-3col">
                ${gemList.map(g => `
                    <div class="item-card">
                        <div class="ic-qbadge"><span class="q-badge q-${g.quality}">${QN[g.quality]}</span></div>
                        <div class="ic-icon">${g.icon}</div>
                        <div class="ic-name">${g.name}</div>
                        <div class="ic-stat" style="color:#b9b3d8;font-size:11px">
                            ${g.type === 'atk' ? '攻击 +' + g.atkPct + '%' : '生命 +' + g.hpPct + '%'}
                        </div>
                        <button class="btn small" data-gem="${g.id}">镶嵌</button>
                    </div>
                `).join('')}
            </div>
        `;
        body.querySelectorAll('[data-gem]').forEach(b => b.onclick = async () => {
            const slot = parseInt(prompt('镶嵌到第几个槽位？(1-4)', '1') || '1') - 1;
            if (isNaN(slot) || slot < 0 || slot > 3) { U.toast('槽位 1-4'); return; }
            try { await API.heroSetGem(oh.uid, slot, b.dataset.gem); await this._after(app, '已镶嵌'); }
            catch (e) { U.toast(e.message); }
        });
        body.querySelectorAll('[data-ungem]').forEach(b => b.onclick = async () => {
            try { await API.heroSetGem(oh.uid, parseInt(b.dataset.ungem), null); await this._after(app, '已卸下'); }
            catch (e) { U.toast(e.message); }
        });
    },

    // ---------------- 装备 / 戒指 ----------------
    _tabEquip(body, app, oh, t, ctx) {
        const eq = oh.equip || {};
        const equipList = this.cache.equipmentTemplates || [];
        const ringList = this.cache.ringTemplates || [];
        const QN = ctx.QN;
        const ring = oh.ring ? ringList.find(x => x.id === oh.ring) : null;
        const instOf = (s) => {
            const raw = eq[s];
            return (raw && typeof raw === 'object') ? raw : (raw ? { id: raw, lv: 1, quality: 'green' } : null);
        };
        body.innerHTML = `
            <div class="card">
                <h3>装备槽（4 位）</h3>
                <div class="equip-grid">
                    ${ctx.slots.map(s => {
                        const inst = instOf(s);
                        const e = inst ? equipList.find(x => x.id === inst.id) : null;
                        return `
                            <div class="equip-slot ${e ? 'filled' : ''}">
                                <div class="es-name">${ctx.slotName[s] || s}</div>
                                ${e ? `
                                    <div class="q-badge q-${inst.quality}">${QN[inst.quality]}</div>
                                    <div class="es-icon">${e.icon}</div>
                                    <div class="es-item-name">${e.name} <span style="color:#ffd56b">+${inst.lv || 1}</span></div>
                                    <div class="es-stats">
                                        ${e.atk ? `攻 +${Math.floor(e.atk * this._qRatio(inst.quality, e.quality) * (1 + 0.08 * ((inst.lv || 1) - 1)))}` : ''}
                                        ${e.hp ? `生命 +${U.num(Math.floor(e.hp * this._qRatio(inst.quality, e.quality) * (1 + 0.08 * ((inst.lv || 1) - 1))))}` : ''}
                                    </div>
                                    <button class="btn ghost small" data-uneq="${s}">卸下</button>
                                ` : `<div class="es-empty">空</div>`}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div class="card">
                <h3>戒指（1 位）</h3>
                ${ring ? `
                    <span class="q-badge q-${ring.quality}">${QN[ring.quality]}</span>
                    <b>${ring.name}</b>
                    <p style="color:#b9b3d8;font-size:12px">攻 +${ring.atkPct}% 生命 +${ring.hpPct}%</p>
                    <button class="btn ghost small" data-unring>卸下</button>
                ` : `<p style="color:#b9b3d8;text-align:center">未装备戒指</p>`}
            </div>
            ${ctx.slots.map(s => `
                <div class="section-title" style="font-size:13px">${ctx.slotName[s]}</div>
                <div class="grid-3col">
                    ${equipList.filter(e => e.slot === s).map(e => {
                        const on = instOf(s) && instOf(s).id === e.id;
                        return `
                            <div class="item-card ${on ? 'equipped' : ''}">
                                <div class="ic-qbadge"><span class="q-badge q-${e.quality}">${QN[e.quality]}</span></div>
                                <div class="ic-icon">${e.icon}</div>
                                <div class="ic-name">${e.name}</div>
                                <div class="ic-stat" style="color:#b9b3d8;font-size:11px">
                                    ${e.atk ? `攻 +${e.atk}` : ''}
                                    ${e.hp ? `生命 +${U.num(e.hp)}` : ''}
                                </div>
                                ${on ? '<div style="color:#5cc7ff;font-size:10px">已装备</div>'
                                     : `<button class="btn small" data-eq="${e.id}" data-slot="${s}">装备</button>`}
                            </div>
                        `;
                    }).join('')}
                </div>
            `).join('')}
            <div class="section-title">戒指库</div>
            <div class="grid-3col">
                ${ringList.map(r => {
                    const on = oh.ring === r.id;
                    return `
                        <div class="item-card ${on ? 'equipped' : ''}">
                            <div class="ic-qbadge"><span class="q-badge q-${r.quality}">${QN[r.quality]}</span></div>
                            <div class="ic-icon">${r.icon}</div>
                            <div class="ic-name">${r.name}</div>
                            <div class="ic-stat" style="color:#b9b3d8;font-size:11px">攻 +${r.atkPct}%　生命 +${r.hpPct}%</div>
                            ${on ? '<div style="color:#5cc7ff;font-size:10px">已装备</div>'
                                 : `<button class="btn small" data-rn="${r.id}">装备</button>`}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        body.querySelectorAll('[data-uneq]').forEach(b => b.onclick = async () => {
            try { await API.heroUnequipItem(oh.uid, b.dataset.uneq); await this._after(app, '已卸下'); }
            catch (e) { U.toast(e.message); }
        });
        body.querySelectorAll('[data-eq]').forEach(b => b.onclick = async () => {
            try { await API.heroEquipItem(oh.uid, b.dataset.slot, b.dataset.eq); await this._after(app, '已装备'); }
            catch (e) { U.toast(e.message); }
        });
        body.querySelectorAll('[data-rn]').forEach(b => b.onclick = async () => {
            try { await API.heroEquipRing(oh.uid, b.dataset.rn); await this._after(app, '已装备戒指'); }
            catch (e) { U.toast(e.message); }
        });
        const unring = body.querySelector('[data-unring]');
        if (unring) unring.onclick = async () => {
            try { await API.heroUnequipRing(oh.uid); await this._after(app, '已卸下戒指'); }
            catch (e) { U.toast(e.message); }
        };
    },
};

window.HeroDetail = HeroDetail;
