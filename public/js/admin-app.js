/* 管理后台独立应用（仅在 /admin 加载）
 * 与玩家端完全隔离：独立的 token、独立的接口封装、不加载任何玩家 view。
 */
const AdminAPI = (() => {
    // 用独立的 key，避免和玩家端 game-token 互相顶掉
    const KEY = 'admin-token';
    const token = () => localStorage.getItem(KEY);

    async function call(method, path, body) {
        const res = await fetch(path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token() ? 'Bearer ' + token() : '',
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        let json;
        try { json = await res.json(); } catch (e) { throw new Error('服务返回异常'); }
        if (!res.ok) throw new Error(json.error || '请求失败');
        return json;
    }

    return {
        token,
        setToken: t => localStorage.setItem(KEY, t),
        clearToken: () => localStorage.removeItem(KEY),
        login: (u, p) => call('POST', '/api/admin/login', { username: u, password: p }),
        overview: () => call('GET', '/api/admin/overview'),
        heroAdd: (hero) => call('POST', '/api/admin/hero/add', { hero }),
        heroUpdate: (hero) => call('POST', '/api/admin/hero/update', { hero }),
        heroDelete: (id) => call('POST', '/api/admin/hero/delete', { id }),
        wallSave: (w) => call('POST', '/api/admin/wall/update', w),
        wallDelete: (lv) => call('POST', '/api/admin/wall/delete', { lv }),
        eventSave: (e) => call('POST', '/api/admin/event/save', { event: e }),
        eventDelete: (id) => call('POST', '/api/admin/event/delete', { id }),
        userGrant: (data) => call('POST', '/api/admin/user/grant', data),
        userDelete: (data) => call('POST', '/api/admin/user/delete', data),
        mail: (data) => call('POST', '/api/admin/mail', data),
    };
})();

const AdminApp = {
    tab: 'overview',

    init() {
        document.body.classList.add('admin-page');
        document.getElementById('ad-go').onclick = () => this.login();
        document.getElementById('ad-p').addEventListener('keydown', e => {
            if (e.key === 'Enter') this.login();
        });
        document.getElementById('ad-logout').onclick = () => {
            AdminAPI.clearToken();
            location.reload();
        };
        document.querySelectorAll('.admin-tabs button').forEach(b => {
            b.onclick = () => { this.tab = b.dataset.t; this.render(); };
        });
        // 已有 token 直接进入
        if (AdminAPI.token()) this.boot();
    },

    async login() {
        const u = document.getElementById('ad-u').value.trim();
        const p = document.getElementById('ad-p').value;
        if (!u || !p) return U.toast('请输入账号密码');
        try {
            const r = await AdminAPI.login(u, p);
            AdminAPI.setToken(r.token);
            U.toast('登录成功');
            this.boot();
        } catch (e) { U.toast(e.message || '登录失败'); }
    },

    async boot() {
        // 校验 token 是否有效
        try {
            await AdminAPI.overview();
        } catch (e) {
            AdminAPI.clearToken();
            return U.toast('登录已失效，请重新登录');
        }
        document.getElementById('ad-login-view').classList.add('hidden');
        document.getElementById('ad-main').classList.remove('hidden');
        document.getElementById('ad-who').textContent = 'admin';
        this.render();
    },

    render() {
        document.querySelectorAll('.admin-tabs button').forEach(b => {
            b.classList.toggle('active', b.dataset.t === this.tab);
        });
        const body = document.getElementById('admin-body');
        body.innerHTML = '<div class="card">加载中...</div>';
        const fn = {
            overview: () => this.renderOverview(body),
            hero: () => this.renderHero(body),
            wall: () => this.renderWall(body),
            event: () => this.renderEvent(body),
            users: () => this.renderUsers(body),
        }[this.tab];
        fn().catch(e => {
            body.innerHTML = `<div class="card" style="color:#ff7a8b">加载失败：${e.message}</div>`;
        });
    },

    // ================= 概览 =================
    async renderOverview(body) {
        const r = await AdminAPI.overview();
        body.innerHTML = `
            <div class="admin-stats">
                <div class="card"><h3>注册玩家</h3><p>${r.users.length}</p></div>
                <div class="card"><h3>英雄</h3><p>${r.heroes.length}</p></div>
                <div class="card"><h3>城墙等级</h3><p>${r.wallSkills.length}</p></div>
                <div class="card"><h3>活动</h3><p>${r.events.length}</p></div>
            </div>
            <div class="admin-note">
                在这里配置的英雄 / 城墙 / 活动会立即对所有在线与后续登录的玩家生效；新增的英雄会立刻出现在玩家图鉴与许愿池中。
            </div>
            <div class="card">
                <h3>物品模板</h3>
                <p style="font-size:13px;color:#b9b3d8">
                    装备 ${r.equipmentTemplates.length} · 戒指 ${r.ringTemplates.length} ·
                    神器 ${r.artifactTemplates.length} · 宝石 ${r.gemTemplates.length}
                </p>
            </div>
            <div class="card">
                <h3>最近注册玩家</h3>
                ${r.users.slice(0, 8).map(u => `
                    <div class="admin-list-item" style="margin-bottom:6px">
                        <div class="info">
                            <h4>${u.username} ${u.isAdmin ? '<span style="color:#ff7a8b;font-size:11px">[管理员]</span>' : ''}</h4>
                            <p>钻石 ${U.num(u.gems)} · 最高层 ${u.lv} · ${new Date(u.createdAt).toLocaleString('zh-CN')}</p>
                        </div>
                    </div>
                `).join('') || '<p style="font-size:12px;color:#777">暂无玩家</p>'}
            </div>
        `;
    },

    // ================= 英雄管理 =================
    async renderHero(body) {
        const r = await AdminAPI.overview();
        const FX_LIST = ['slash|斩击', 'water|水流', 'tidal|潮汐', 'freeze|冰冻', 'ice|寒霜', 'heal|治疗',
            'bloom|绽放', 'meteor|陨石', 'fire|烈火', 'burn|灼烧', 'dark|暗影', 'summon|召唤',
            'thunder|雷鸣', 'bolt|闪电', 'laser|激光', 'holy|圣光', 'shield|护盾', 'buff|强化',
            'sound|音波', 'wind|狂风', 'quake|地震', 'paint|涂鸦'];
        const RARITY = ['传说+', '传说', '史诗', '稀有', '精英', '优秀'];
        const ELEMENT = ['草', '水', '火', '光', '暗'];
        const ELEMENT_LABEL = { 草: '草（木）', 水: '水', 火: '火', 光: '光（含风雷）', 暗: '暗' };

        body.innerHTML = `
            <div class="admin-note">
                英雄保存后立刻写入图鉴与许愿池，玩家刷新即可看到；双击下方卡片可载入修改（主技能需填写名称才会保存）。
            </div>
            <div class="card">
                <h3>添加 / 编辑英雄</h3>
                <div class="hero-form">
                    <input id="h-id" placeholder="留空 = 新建英雄">
                    <input id="h-name" placeholder="英雄名（必填）">
                    <textarea id="h-desc" placeholder="英雄描述（展示在图鉴详情）" rows="2"></textarea>
                    <div class="row">
                        <select id="h-rarity">${RARITY.map(x => `<option>${x}</option>`).join('')}</select>
                        <select id="h-element">${ELEMENT.map(x => `<option value="${x}">${ELEMENT_LABEL[x] || x}</option>`).join('')}</select>
                    </div>
                    <div class="row">
                        <input id="h-atk" placeholder="基础攻击" type="number">
                        <input id="h-hp" placeholder="基础生命" type="number">
                    </div>
                    <div class="row">
                        <input id="h-img" placeholder="立绘文件名（如 xxx.jpg）">
                        <input id="h-portrait" placeholder="头像文件名（可与立绘同名）">
                    </div>
                    <div class="section-title" style="font-size:12px;margin-top:6px">技能（最多 3 个：主 / 副 / 觉醒）</div>
                    <div id="skill-forms"></div>
                    <button class="btn ghost small" id="h-add-skill" style="width:100%;margin-bottom:6px">+ 添加技能</button>
                    <div class="row">
                        <button class="btn" id="h-save" style="flex:2">保存英雄</button>
                        <button class="btn ghost" id="h-reset">清空</button>
                    </div>
                </div>
            </div>
            <div class="section-title">已有英雄（${r.heroes.length}）· 单击编辑 / 双击删除</div>
            <div class="admin-hero-grid">
                ${r.heroes.map(h => `
                    <div class="hero-card" data-id="${h.id}" title="${h.name}">
                        <img src="${U.imgSrc(h.img)}" onerror="this.style.opacity=.3">
                        <div class="name">${h.name}</div>
                        <div class="rarity ${U.rarityClass(h.rarity)}">${h.rarity}</div>
                        <div style="font-size:10px;color:#5cc7ff">${h.element}系 · ${(h.skills || []).length}技</div>
                    </div>
                `).join('')}
            </div>
        `;

        const skillBox = body.querySelector('#skill-forms');
        const collectSkills = () => Array.from(skillBox.querySelectorAll('.skill-form')).map(f => ({
            name: f.querySelector('.sf-name').value.trim(),
            desc: f.querySelector('.sf-desc').value.trim(),
            cd: parseInt(f.querySelector('.sf-cd').value || '5'),
            multiplier: parseFloat(f.querySelector('.sf-mult').value || '0'),
            fx: f.querySelector('.sf-fx').value,
            tint: f.querySelector('.sf-tint').value || '#ffd56b',
        })).filter(s => s.name);

        const renderSkills = (list) => {
            skillBox.innerHTML = list.map((s, i) => `
                <div class="skill-form" data-si="${i}">
                    <div class="row" style="justify-content:space-between;margin-bottom:4px">
                        <b style="font-size:12px;color:#ffd56b">${i === 0 ? '主技能' : i === 1 ? '第二技能' : '觉醒技'}</b>
                        ${i > 0 ? `<button class="btn ghost small" data-rm="${i}">移除</button>` : ''}
                    </div>
                    <input class="sf-name" placeholder="技能名" value="${(s.name || '').replace(/"/g, '&quot;')}">
                    <input class="sf-desc" placeholder="技能描述" value="${(s.desc || '').replace(/"/g, '&quot;')}">
                    <div class="row">
                        <input class="sf-cd" placeholder="冷却(秒)" type="number" value="${s.cd || 5}">
                        <input class="sf-mult" placeholder="伤害倍率" type="number" step="0.1" value="${s.multiplier || 0}">
                    </div>
                    <div class="row">
                        <select class="sf-fx">
                            ${FX_LIST.map(f => {
                                const [v, n] = f.split('|');
                                return `<option value="${v}" ${(s.fx || '') === v ? 'selected' : ''}>${n}</option>`;
                            }).join('')}
                        </select>
                        <input class="sf-tint" placeholder="特效色" value="${s.tint || '#ffd56b'}">
                    </div>
                </div>
            `).join('');
            skillBox.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
                const list2 = collectSkills();
                list2.splice(parseInt(b.dataset.rm), 1);
                renderSkills(list2.length ? list2 : [{ name: '', cd: 5, multiplier: 0, fx: 'slash' }]);
            });
        };
        renderSkills([{ name: '', desc: '', cd: 5, multiplier: 0, fx: 'slash', tint: '#ffd56b' }]);

        const fillForm = (h) => {
            body.querySelector('#h-id').value = h.id || '';
            body.querySelector('#h-name').value = h.name || '';
            body.querySelector('#h-desc').value = h.desc || '';
            body.querySelector('#h-rarity').value = h.rarity || '传说';
            body.querySelector('#h-element').value = h.element || '火';
            body.querySelector('#h-atk').value = h.baseAtk || '';
            body.querySelector('#h-hp').value = h.baseHp || '';
            body.querySelector('#h-img').value = h.img || '';
            body.querySelector('#h-portrait').value = h.portrait || h.img || '';
            renderSkills((Array.isArray(h.skills) && h.skills.length)
                ? h.skills
                : [(h.skill || { name: '', desc: '', cd: 5, multiplier: 0, fx: 'slash', tint: '#ffd56b' })]);
        };

        body.querySelectorAll('.hero-card').forEach(card => {
            const hero = r.heroes.find(x => x.id === card.dataset.id);
            let clickTimer = null;
            card.onclick = () => {
                if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    if (hero) {
                        fillForm(hero);
                        document.querySelectorAll('.admin-hero-grid .hero-card').forEach(c => c.classList.remove('editing'));
                        card.classList.add('editing');
                        U.toast('已载入：' + hero.name);
                    }
                }, 220);
            };
            card.ondblclick = async () => {
                if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
                if (!hero) return;
                if (!U.confirm(`确认删除英雄「${hero.name}」？该操作不可撤销。`)) return;
                try {
                    await AdminAPI.heroDelete(hero.id);
                    U.toast('已删除');
                    this.render();
                } catch (e) { U.toast(e.message); }
            };
        });

        body.querySelector('#h-add-skill').onclick = () => {
            const cur = collectSkills();
            if (cur.length >= 3) return U.toast('最多 3 个技能');
            cur.push({ name: '', desc: '', cd: 8, multiplier: 2, fx: 'slash', tint: '#ffd56b' });
            renderSkills(cur);
        };

        body.querySelector('#h-reset').onclick = () => {
            body.querySelector('#h-id').value = '';
            body.querySelector('#h-name').value = '';
            body.querySelector('#h-desc').value = '';
            body.querySelector('#h-atk').value = '';
            body.querySelector('#h-hp').value = '';
            body.querySelector('#h-img').value = '';
            body.querySelector('#h-portrait').value = '';
            renderSkills([{ name: '', desc: '', cd: 5, multiplier: 0, fx: 'slash', tint: '#ffd56b' }]);
            document.querySelectorAll('.admin-hero-grid .hero-card').forEach(c => c.classList.remove('editing'));
        };

        body.querySelector('#h-save').onclick = async () => {
            try {
                const id = body.querySelector('#h-id').value.trim();
                const name = body.querySelector('#h-name').value.trim();
                if (!name) return U.toast('请填写英雄名');
                const skills = collectSkills();
                if (!skills.length) return U.toast('至少填写一个技能名');
                const hero = {
                    id: id || undefined,
                    name,
                    desc: body.querySelector('#h-desc').value.trim(),
                    rarity: body.querySelector('#h-rarity').value,
                    element: body.querySelector('#h-element').value,
                    baseAtk: parseInt(body.querySelector('#h-atk').value || '1000'),
                    baseHp: parseInt(body.querySelector('#h-hp').value || '8000'),
                    img: body.querySelector('#h-img').value.trim(),
                    portrait: body.querySelector('#h-portrait').value.trim(),
                    skills,
                    skill: skills[0],
                };
                if (id) await AdminAPI.heroUpdate(hero);
                else await AdminAPI.heroAdd(hero);
                U.toast(id ? '已更新，玩家图鉴同步生效' : '已新增，玩家图鉴立刻出现');
                this.render();
            } catch (e) { U.toast(e.message); }
        };
    },

    // ================= 城墙管理 =================
    async renderWall(body) {
        const r = await AdminAPI.overview();
        body.innerHTML = `
            <div class="admin-note">
                城墙按等级配置：等级 / 名称 / 技能描述 / 攻击与生命加成百分比。等级需唯一，保存同等级会覆盖。
            </div>
            <div class="card">
                <h3>添加 / 编辑城墙等级</h3>
                <div class="hero-form">
                    <div class="row">
                        <input id="w-lv" placeholder="等级（数字，必填）" type="number">
                        <input id="w-name" placeholder="城墙名称（必填）">
                    </div>
                    <textarea id="w-desc" placeholder="技能描述（玩家在助战页看到）" rows="2"></textarea>
                    <div class="row">
                        <input id="w-atk" placeholder="攻击加成 %" type="number">
                        <input id="w-hp" placeholder="生命加成 %" type="number">
                    </div>
                    <div class="row">
                        <button class="btn" id="w-save" style="flex:2">保存</button>
                        <button class="btn ghost" id="w-reset">清空</button>
                    </div>
                </div>
            </div>
            <div class="section-title">已有城墙（${r.wallSkills.length}）· 单击编辑</div>
            ${r.wallSkills.map(w => `
                <div class="admin-list-item" data-lv="${w.lv}">
                    <div class="info">
                        <h4>Lv.${w.lv} · ${w.name}</h4>
                        <p>${w.skillDesc || '（无技能描述）'}</p>
                        <p style="color:#ffd56b;margin-top:3px">攻击 +${w.atkPct || 0}% · 生命 +${w.hpPct || 0}%</p>
                    </div>
                    <div class="ops">
                        <button class="btn small" data-w-edit="${w.lv}">编辑</button>
                        <button class="btn small ghost" data-w-del="${w.lv}">删除</button>
                    </div>
                </div>
            `).join('') || '<p style="font-size:12px;color:#777">暂无城墙配置</p>'}
        `;

        const fill = (w) => {
            body.querySelector('#w-lv').value = w.lv;
            body.querySelector('#w-name').value = w.name || '';
            body.querySelector('#w-desc').value = w.skillDesc || '';
            body.querySelector('#w-atk').value = w.atkPct || 0;
            body.querySelector('#w-hp').value = w.hpPct || 0;
        };
        body.querySelectorAll('[data-w-edit]').forEach(b => b.onclick = () => {
            const w = r.wallSkills.find(x => String(x.lv) === String(b.dataset.wEdit));
            if (w) fill(w);
        });
        body.querySelectorAll('[data-w-del]').forEach(b => b.onclick = async () => {
            if (!U.confirm('确认删除该城墙等级？')) return;
            try {
                await AdminAPI.wallDelete(parseInt(b.dataset.wDel));
                U.toast('已删除'); this.render();
            } catch (e) { U.toast(e.message); }
        });
        body.querySelector('#w-reset').onclick = () => {
            ['#w-lv', '#w-name', '#w-desc', '#w-atk', '#w-hp'].forEach(s => body.querySelector(s).value = '');
        };
        body.querySelector('#w-save').onclick = async () => {
            try {
                const w = {
                    lv: parseInt(body.querySelector('#w-lv').value),
                    name: body.querySelector('#w-name').value.trim(),
                    skillDesc: body.querySelector('#w-desc').value.trim(),
                    atkPct: parseInt(body.querySelector('#w-atk').value || '0'),
                    hpPct: parseInt(body.querySelector('#w-hp').value || '0'),
                };
                if (!w.lv || !w.name) return U.toast('等级和名称必填');
                await AdminAPI.wallSave(w);
                U.toast('已保存');
                this.render();
            } catch (e) { U.toast(e.message); }
        };
    },

    // ================= 活动管理 =================
    async renderEvent(body) {
        const r = await AdminAPI.overview();
        body.innerHTML = `
            <div class="admin-note">
                活动保存后立即出现在玩家端「🎉 活动中心」。类型说明：<b>login</b> 累计登录 · <b>daily</b> 每日可领 · <b>once</b> 一次性。
            </div>
            <div class="card">
                <h3>添加 / 编辑活动</h3>
                <div class="hero-form">
                    <input id="ev-id" placeholder="留空 = 新建活动">
                    <input id="ev-name" placeholder="活动名（必填）">
                    <select id="ev-type">
                        <option value="login">登录累计</option>
                        <option value="daily">每日</option>
                        <option value="once">一次性</option>
                        <option value="recharge">充值</option>
                        <option value="limited">限时</option>
                    </select>
                    <textarea id="ev-desc" placeholder="活动描述" rows="2"></textarea>
                    <div class="row">
                        <input id="ev-need" placeholder="所需天数/次数（默认 1）" type="number">
                        <input id="ev-gold" placeholder="金币" type="number">
                    </div>
                    <div class="row">
                        <input id="ev-gems" placeholder="钻石" type="number">
                        <input id="ev-wishCards" placeholder="许愿卡" type="number">
                    </div>
                    <div class="row">
                        <input id="ev-wood" placeholder="木材" type="number">
                        <input id="ev-iron" placeholder="铁矿" type="number">
                    </div>
                    <div class="row">
                        <input id="ev-stone" placeholder="石币" type="number">
                        <input id="ev-exp" placeholder="经验" type="number">
                    </div>
                    <label style="font-size:12px;color:#b9b3d8;display:flex;align-items:center;gap:6px;margin:4px 0">
                        <input id="ev-active" type="checkbox" checked style="width:auto;margin:0"> 启用该活动
                    </label>
                    <button class="btn" style="width:100%" id="ev-save">保存活动</button>
                </div>
            </div>
            <div class="section-title">已有活动（${r.events.length}）</div>
            ${r.events.map(e => `
                <div class="admin-list-item">
                    <div class="info">
                        <h4>${e.name} <span style="font-size:11px;color:#b9b3d8">[${e.type}]</span>
                            <span style="font-size:11px;color:${e.active ? '#5cc7ff' : '#ff7a8b'}">${e.active ? '已启用' : '已停用'}</span></h4>
                        <p>${e.desc || ''}</p>
                        <p style="color:#ffd56b;margin-top:3px">奖励：${Object.entries(e.rewards || {}).map(([k, v]) => (RES_NAME[k] || k) + '×' + v).join(' · ') || '无'}</p>
                    </div>
                    <div class="ops">
                        <button class="btn small" data-ev-edit="${e.id}">编辑</button>
                        <button class="btn small ghost" data-ev-del="${e.id}">删除</button>
                    </div>
                </div>
            `).join('') || '<p style="font-size:12px;color:#777">暂无活动</p>'}
        `;

        const fill = (e) => {
            const rw = e.rewards || {};
            body.querySelector('#ev-id').value = e.id || '';
            body.querySelector('#ev-name').value = e.name || '';
            body.querySelector('#ev-type').value = e.type || 'login';
            body.querySelector('#ev-desc').value = e.desc || '';
            body.querySelector('#ev-need').value = e.needDays || e.need || 1;
            body.querySelector('#ev-gold').value = rw.gold || '';
            body.querySelector('#ev-gems').value = rw.gems || '';
            body.querySelector('#ev-wishCards').value = rw.wishCards || '';
            body.querySelector('#ev-wood').value = rw.wood || '';
            body.querySelector('#ev-iron').value = rw.iron || '';
            body.querySelector('#ev-stone').value = rw.stone || '';
            body.querySelector('#ev-exp').value = rw.exp || '';
            body.querySelector('#ev-active').checked = e.active !== false;
        };
        body.querySelectorAll('[data-ev-edit]').forEach(b => b.onclick = () => {
            const e = r.events.find(x => x.id === b.dataset.evEdit);
            if (e) fill(e);
        });
        body.querySelectorAll('[data-ev-del]').forEach(b => b.onclick = async () => {
            if (!U.confirm('确认删除该活动？')) return;
            try {
                await AdminAPI.eventDelete(b.dataset.evDel);
                U.toast('已删除'); this.render();
            } catch (e2) { U.toast(e2.message); }
        });
        body.querySelector('#ev-save').onclick = async () => {
            try {
                const pick = (sel) => parseInt(body.querySelector(sel).value || '0') || undefined;
                const ev = {
                    id: body.querySelector('#ev-id').value.trim() || undefined,
                    name: body.querySelector('#ev-name').value.trim(),
                    type: body.querySelector('#ev-type').value,
                    desc: body.querySelector('#ev-desc').value.trim(),
                    needDays: parseInt(body.querySelector('#ev-need').value || '1') || 1,
                    active: body.querySelector('#ev-active').checked,
                    rewards: {
                        gold: pick('#ev-gold'), gems: pick('#ev-gems'), wishCards: pick('#ev-wishCards'),
                        wood: pick('#ev-wood'), iron: pick('#ev-iron'), stone: pick('#ev-stone'), exp: pick('#ev-exp'),
                    },
                };
                if (!ev.name) return U.toast('活动名必填');
                await AdminAPI.eventSave(ev);
                U.toast('已保存，玩家活动中心实时更新');
                this.render();
            } catch (e) { U.toast(e.message); }
        };
    },

    // ================= 玩家列表 / 邮件发放 =================
    // 选择器状态（真实数据来自 /api/admin/overview，即 data/db.json）
    _us: { all: [], kw: '', page: 0, size: 15, sel: new Set(), onlyIdle: false },

    // 疑似测试账号：① 用户名带测试/工具特征 ② 字母+数字尾巴的随机串 ③ 完全 0 进度
    // （仅用于「预选中」，最终删除由管理员手动确认）
    _isTestUser(u) {
        const n = (u.username || '').toLowerCase();
        if (!n || n === 'admin') return false;
        if (/^(tester|wish|star|sync|iso|eq|test|tmp|demo|bot|flow|dbg|cdp|shot|smoke|mailtest|uifix|eqfix|user)/.test(n)) return true;
        if (/^[a-z]{1,6}\d{3,}$/.test(n)) return true;      // bob5118 / cdp5962820 这类随机串
        return (u.lv || 0) === 0 && (u.heroCount || 0) === 0;
    },

    _filtered() {
        const st = this._us;
        let list = st.all;
        if (st.onlyIdle) list = list.filter(u => (u.lv || 0) === 0 && (u.heroCount || 0) === 0);
        const kw = st.kw.trim().toLowerCase();
        if (kw) list = list.filter(u => (u.username || '').toLowerCase().includes(kw));
        return list;
    },
    _maxPage() {
        return Math.max(1, Math.ceil(this._filtered().length / this._us.size));
    },

    async renderUsers(body) {
        const r = await AdminAPI.overview();
        const st = this._us;
        // 真实注册玩家，按注册时间倒序
        st.all = (r.users || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const valid = new Set(st.all.map(u => u.username));
        [...st.sel].forEach(n => { if (!valid.has(n)) st.sel.delete(n); });
        st.page = Math.min(st.page, this._maxPage() - 1);

        const FIELDS = [
            ['gold', '金币'], ['gems', '钻石'], ['wishCards', '许愿卡'],
            ['wood', '木材'], ['iron', '铁矿'], ['stone', '石币'], ['exp', '经验'],
        ];

        body.innerHTML = `
            <div class="admin-note">
                发放资源通过 <b>游戏内邮件</b> 下发：玩家登录后在「✉ 邮件」里自行领取，不会直接改动存档。<br>
                下方列表是 <b>真实注册玩家</b>（读自 db.json），支持模糊搜索、单选 / 多选、分页。
            </div>
            <div class="card">
                <h3>发送邮件（发放资源）</h3>
                <div class="scope-row">
                    <label><input type="radio" name="gr-scope" value="pick" checked> 指定玩家</label>
                    <label><input type="radio" name="gr-scope" value="all"> 所有玩家（全员邮件）</label>
                </div>

                <div id="gr-picker">
                    <input id="u-kw" placeholder="🔍 模糊搜索用户名（支持部分匹配）">
                    <div class="picker-tools">
                        <span class="picker-count">已选 <b id="sel-n">0</b> 人</span>
                        <button class="btn small ghost" id="sel-page">全选本页</button>
                        <button class="btn small ghost" id="sel-all">全选筛选结果</button>
                        <button class="btn small ghost" id="sel-clear">清空</button>
                        <button class="btn small danger" id="sel-del">删除已选</button>
                    </div>
                    <div class="picker-tools">
                        <span class="picker-count" style="margin-right:6px;opacity:.8">清理测试号：</span>
                        <button class="btn small ghost" id="sel-test">选中疑似测试号（<b id="test-n">0</b>）</button>
                        <button class="btn small ghost" id="sel-everyone">选中全部（不含 admin）</button>
                        <button class="btn small ghost" id="flt-idle">仅看 0 进度账号</button>
                        <button class="btn small ghost" id="flt-all">显示全部</button>
                    </div>
                    <div id="sel-chips" class="picker-chips"></div>
                    <div id="u-list" class="picker-list"></div>
                    <div class="pager">
                        <button class="btn small ghost" id="pg-prev">上一页</button>
                        <span id="pg-info">1 / 1</span>
                        <button class="btn small ghost" id="pg-next">下一页</button>
                        <select id="pg-size" style="width:auto;margin:0;padding:4px 8px">
                            ${[10, 15, 20, 50].map(n => `<option value="${n}" ${n === st.size ? 'selected' : ''}>每页 ${n} 人</option>`).join('')}
                        </select>
                    </div>
                </div>

                <input id="ml-title" placeholder="邮件标题" value="系统奖励">
                <textarea id="ml-content" rows="2" placeholder="邮件正文（可选）"></textarea>
                <div class="row">${FIELDS.slice(0, 3).map(([k, n]) => `<input id="gr-${k}" placeholder="${n}" type="number">`).join('')}</div>
                <div class="row">${FIELDS.slice(3, 6).map(([k, n]) => `<input id="gr-${k}" placeholder="${n}" type="number">`).join('')}</div>
                <div class="row">${FIELDS.slice(6).map(([k, n]) => `<input id="gr-${k}" placeholder="${n}" type="number">`).join('')}</div>
                <button class="btn" style="width:100%;margin-top:4px" id="gr-go">发送给指定玩家</button>
            </div>
        `;

        // ---- 范围切换 ----
        const scopeEls = [...body.querySelectorAll('input[name=gr-scope]')];
        const picker = body.querySelector('#gr-picker');
        const goBtn = body.querySelector('#gr-go');
        const syncScope = () => {
            const all = body.querySelector('input[name=gr-scope]:checked').value === 'all';
            picker.style.display = all ? 'none' : 'block';
            goBtn.textContent = all ? '发送给所有玩家' : `发送给已选玩家（${st.sel.size} 人）`;
        };
        scopeEls.forEach(el => el.onchange = syncScope);

        // ---- 搜索 ----
        body.querySelector('#u-kw').oninput = (e) => {
            st.kw = e.target.value;
            st.page = 0;
            this._renderPickList(body);
        };

        // ---- 全选 / 清空 ----
        body.querySelector('#sel-page').onclick = () => {
            this._pageItems().forEach(u => st.sel.add(u.username));
            this._renderPickList(body);
        };
        body.querySelector('#sel-all').onclick = () => {
            this._filtered().forEach(u => st.sel.add(u.username));
            this._renderPickList(body);
        };
        body.querySelector('#sel-clear').onclick = () => {
            st.sel.clear();
            this._renderPickList(body);
        };
        body.querySelector('#sel-del').onclick = () => this._deleteSel(body);

        // ---- 清理测试号 ----
        body.querySelector('#sel-test').onclick = () => {
            const cands = st.all.filter(u => this._isTestUser(u));
            if (!cands.length) return U.toast('没有识别到疑似测试账号');
            cands.forEach(u => st.sel.add(u.username));
            this._renderPickList(body);
            U.toast(`已选中 ${cands.length} 个疑似测试号，确认无误后点「删除已选」`);
        };
        body.querySelector('#sel-everyone').onclick = () => {
            st.all.forEach(u => { if (u.username !== 'admin') st.sel.add(u.username); });
            this._renderPickList(body);
            U.toast(`已选中 ${st.sel.size} 名玩家`);
        };
        const idleBtn = body.querySelector('#flt-idle');
        const allBtn = body.querySelector('#flt-all');
        const syncFilter = () => {
            st.onlyIdle ? idleBtn.classList.add('on') : idleBtn.classList.remove('on');
            allBtn.classList.toggle('on', !st.onlyIdle);
        };
        idleBtn.onclick = () => { st.onlyIdle = true; st.page = 0; syncFilter(); this._renderPickList(body); };
        allBtn.onclick = () => { st.onlyIdle = false; st.page = 0; syncFilter(); this._renderPickList(body); };
        syncFilter();

        // ---- 分页 ----
        body.querySelector('#pg-prev').onclick = () => {
            st.page = Math.max(0, st.page - 1);
            this._renderPickList(body);
        };
        body.querySelector('#pg-next').onclick = () => {
            st.page = Math.min(this._maxPage() - 1, st.page + 1);
            this._renderPickList(body);
        };
        body.querySelector('#pg-size').onchange = (e) => {
            st.size = parseInt(e.target.value);
            st.page = 0;
            this._renderPickList(body);
        };

        // ---- 发送 ----
        goBtn.onclick = () => this._sendMail(body, FIELDS);

        syncScope();
        this._renderPickList(body);
    },

    _pageItems() {
        const st = this._us;
        const list = this._filtered();
        return list.slice(st.page * st.size, st.page * st.size + st.size);
    },

    // 只重建列表 / chips / 分页，保证搜索框不丢焦点
    _renderPickList(body) {
        const st = this._us;
        const list = this._filtered();
        const total = list.length;
        const maxPg = Math.max(1, Math.ceil(total / st.size));
        st.page = Math.min(st.page, maxPg - 1);
        const items = this._pageItems();

        body.querySelector('#u-list').innerHTML = items.length ? items.map(u => `
            <div class="pick-item ${st.sel.has(u.username) ? 'sel' : ''}" data-uname="${u.username}">
                <input type="checkbox" data-pick="${u.username}" ${st.sel.has(u.username) ? 'checked' : ''}>
                <div class="pi-main">
                    <div class="pi-name">${u.username}
                        ${u.isAdmin ? '<span class="tag-admin">[管理员]</span>' : ''}
                    </div>
                    <div class="pi-meta">
                        💎${U.num(u.gems)} · 🏔最高层 ${u.lv || 0} · 英雄 ${u.heroCount || 0} ·
                        登录 ${u.loginDays || 0} 天 · 注册 ${new Date(u.createdAt).toLocaleString('zh-CN')}
                    </div>
                </div>
                <button class="btn small danger" data-udel="${u.username}">删除</button>
            </div>
        `).join('') : '<p style="font-size:12px;color:#888;padding:10px;text-align:center">没有匹配的玩家</p>';

        // 已选 chips
        const chips = [...st.sel];
        body.querySelector('#sel-chips').innerHTML = chips.length
            ? chips.map(n => `<span class="chip">${n}<b data-unsel="${n}">✕</b></span>`).join('')
            : '<span style="font-size:12px;color:#777">未选择玩家（也可在下方列表点选）</span>';

        body.querySelector('#sel-n').textContent = st.sel.size;
        const tn = body.querySelector('#test-n');
        if (tn) tn.textContent = st.all.filter(u => this._isTestUser(u)).length;
        body.querySelector('#pg-info').textContent = `第 ${st.page + 1} / ${maxPg} 页 · 共 ${total} 人`;
        const goBtn = body.querySelector('#gr-go');
        if (body.querySelector('input[name=gr-scope]:checked').value !== 'all') {
            goBtn.textContent = `发送给已选玩家（${st.sel.size} 人）`;
        }

        // 行点击 / 复选 / 移除 / 删除
        body.querySelectorAll('#u-list .pick-item').forEach(row => {
            row.querySelectorAll('input[data-pick]').forEach(cb => {
                cb.onchange = () => {
                    const n = cb.dataset.pick;
                    cb.checked ? st.sel.add(n) : st.sel.delete(n);
                    this._renderPickList(body);
                };
            });
            row.onclick = (e) => {
                if (e.target.closest('button') || e.target.tagName === 'INPUT') return;
                const n = row.dataset.uname;
                st.sel.has(n) ? st.sel.delete(n) : st.sel.add(n);
                this._renderPickList(body);
            };
            const del = row.querySelector('[data-udel]');
            if (del) del.onclick = (e) => {
                e.stopPropagation();
                this._deleteUsers(body, [del.dataset.udel]);
            };
        });
        body.querySelectorAll('#sel-chips [data-unsel]').forEach(b => b.onclick = () => {
            st.sel.delete(b.dataset.unsel);
            this._renderPickList(body);
        });
    },

    async _deleteSel(body) {
        const names = [...this._us.sel];
        if (!names.length) return U.toast('请先选择要删除的玩家');
        this._deleteUsers(body, names);
    },

    async _deleteUsers(body, names) {
        if (!names.length) return;
        if (!U.confirm(`确定删除 ${names.length} 名玩家？\n\n${names.slice(0, 10).join('、')}${names.length > 10 ? ' …' : ''}\n\n删除后其存档、登录 token、专属邮件都会被清除，且不可恢复。`)) return;
        try {
            const rs = await AdminAPI.userDelete({ usernames: names });
            U.toast(`已删除 ${rs.removed} 名玩家`);
            names.forEach(n => this._us.sel.delete(n));
            this.render();
        } catch (e) { U.toast(e.message); }
    },

    async _sendMail(body, FIELDS) {
        const st = this._us;
        const scope = body.querySelector('input[name=gr-scope]:checked').value;
        const rewards = {};
        FIELDS.forEach(([k]) => {
            const v = parseInt(body.querySelector('#gr-' + k).value || '0');
            if (v > 0) rewards[k] = v;
        });
        if (!Object.keys(rewards).length) return U.toast('请至少填写一项资源');
        const title = (body.querySelector('#ml-title').value || '').trim() || '系统奖励';
        const content = (body.querySelector('#ml-content').value || '').trim();

        try {
            if (scope === 'all') {
                if (!U.confirm('确定向所有玩家发送这封邮件（含附件资源）？')) return;
                await AdminAPI.mail({ toAll: true, title, content, rewards });
                U.toast('已发送给所有玩家，玩家可在游戏内邮件领取');
            } else {
                const usernames = [...st.sel];
                if (!usernames.length) return U.toast('请先选择收件玩家');
                if (!U.confirm(`确定向 ${usernames.length} 名玩家发送邮件？\n\n${usernames.slice(0, 8).join('、')}${usernames.length > 8 ? ' …' : ''}`)) return;
                const rs = await AdminAPI.mail({ usernames, title, content, rewards });
                U.toast(`已发送邮件给 ${rs.count} 名玩家`);
                if (rs.unknown && rs.unknown.length) U.toast('未找到：' + rs.unknown.join('、'));
            }
        } catch (e) { U.toast(e.message); }
    },
};

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
