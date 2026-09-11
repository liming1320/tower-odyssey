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
        heroReload: () => call('POST', '/api/admin/hero/reload', {}),
        wallSave: (w) => call('POST', '/api/admin/wall/update', w),
        wallDelete: (lv) => call('POST', '/api/admin/wall/delete', { lv }),
        eventSave: (e) => call('POST', '/api/admin/event/save', { event: e }),
        eventDelete: (id) => call('POST', '/api/admin/event/delete', { id }),
        userGrant: (data) => call('POST', '/api/admin/user/grant', data),
        userDelete: (data) => call('POST', '/api/admin/user/delete', data),
        mail: (data) => call('POST', '/api/admin/mail', data),
        smsCodes: () => call('GET', '/api/admin/sms-codes'),
        giftList: () => call('GET', '/api/admin/gift/list'),
        giftSave: (gift) => call('POST', '/api/admin/gift/save', gift),
        giftDelete: (code) => call('POST', '/api/admin/gift/delete', { code }),
        minigameOrder: () => call('GET', '/api/admin/minigame/order'),
        minigameOrderSave: (order) => call('POST', '/api/admin/minigame/order', { order }),
        // ROM 库（列表/删除走通用 call；上传是原始二进制，单独实现）
        romList: () => call('GET', '/api/roms'),
        romDelete: (id) => call('POST', '/api/roms/delete', { id }),
        romUpdate: (id, patch) => call('POST', '/api/roms/update', Object.assign({ id }, patch)),
        romUpload: async (file, core) => {
            const buf = await (file.arrayBuffer ? file.arrayBuffer() : new Promise((res, rej) => {
                const fr = new FileReader();
                fr.onload = () => res(fr.result);
                fr.onerror = () => rej(fr.error);
                fr.readAsArrayBuffer(file);
            }));
            const res = await fetch('/api/roms/upload?name=' + encodeURIComponent(file.name) + '&core=' + encodeURIComponent(core), {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream', 'Authorization': 'Bearer ' + token() },
                body: buf,
            });
            let json;
            try { json = await res.json(); } catch (e) { throw new Error('上传返回异常'); }
            if (!res.ok) throw new Error(json.error || '上传失败');
            return json;
        },
        // 通用 GET/POST（用于新增的任意后台接口）
        api: (path, method, body) => call(method || 'GET', path, body),
    };
})();

const AdminApp = {
    tab: 'overview',
    // HTML 转义
    esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])); },

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
            sms: () => this.renderSms(body),
            gift: () => this.renderGift(body),
            order: () => this.renderOrder(body),
            roms: () => this.renderRoms(body),
            tavern: () => this.renderTavern(body),
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
                            <h4>${u.nickname || u.username} ${u.displayId ? `<span style="color:#8ad4ff;font-size:11px;opacity:.75">${u.displayId}</span>` : ''} ${u.isAdmin ? '<span style="color:#ff7a8b;font-size:11px">[管理员]</span>' : ''}</h4>
                            <p>账号 ${u.username} · 钻石 ${U.num(u.gems)} · 最高层 ${u.lv} · ${new Date(u.createdAt).toLocaleString('zh-CN')}</p>
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
                <div class="row" style="align-items:center;gap:8px;margin-bottom:8px">
                    <button class="btn ghost small" id="h-reload" title="从 MySQL 的 heroes 表重新读取英雄配置">🔄 重载英雄配置（MySQL）</button>
                    <span style="font-size:11px;opacity:.7">在数据库里改名/改技能后点这里，无需重启服务</span>
                </div>
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

        const reloadBtn = body.querySelector('#h-reload');
        if (reloadBtn) reloadBtn.onclick = async () => {
            reloadBtn.disabled = true; reloadBtn.textContent = '⏳ 重载中…';
            try {
                const r = await AdminAPI.heroReload();
                if (r.ok) {
                    alert(`已从数据库重载 ${r.count} 个英雄`);
                    this.renderHero(body);
                } else {
                    alert('重载失败：' + (r.error || '未知错误'));
                }
            } catch (e) {
                alert('重载失败：' + e.message);
            } finally {
                reloadBtn.disabled = false; reloadBtn.textContent = '🔄 重载英雄配置（MySQL）';
            }
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
        // 支持按账号 / 昵称 / 展示 ID 搜索
        if (kw) list = list.filter(u =>
            (u.username || '').toLowerCase().includes(kw) ||
            (u.nickname || '').toLowerCase().includes(kw) ||
            (u.displayId || '').toLowerCase().includes(kw)
        );
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

    // ================= 验证码（测试模式查看） =================
    // 未接真实短信时，玩家端点「获取验证码」后，在这里查看 6 位验证码完成登录/绑定测试。
    // 接入真实短信（SMS_PROVIDER）后此页仍可用，仅作发送记录审计。
    async renderSms(body) {
        let r;
        try { r = await AdminAPI.smsCodes(); }
        catch (e) { body.innerHTML = `<div class="card" style="color:#ff7a8b">加载失败：${e.message}</div>`; return; }
        const rows = (r.list || []).map(x => `
            <tr>
                <td>${x.phone}</td>
                <td><b style="color:#ffd56b;font-size:15px;letter-spacing:2px">${x.code}</b></td>
                <td>${new Date(x.time).toLocaleString('zh-CN')}（${x.ago}前）</td>
            </tr>
        `).join('');
        body.innerHTML = `
            <div class="admin-note">
                短信通道：<b>${r.provider === 'dev' ? '测试模式（未接真实短信）' : r.provider}</b>。
                测试模式下玩家点「获取验证码」后，在此处把 6 位验证码告诉玩家即可完成登录 / 绑定。<br>
                验证码 5 分钟内有效、一次性使用；同一手机号 60 秒内只能发送一次。
            </div>
            <div class="card">
                <h3>最近发送记录（前 30 条）</h3>
                <button class="btn small ghost" id="sms-refresh">刷新</button>
                <table class="admin-table" style="margin-top:10px">
                    <thead><tr><th>手机号</th><th>验证码</th><th>发送时间</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:#777;padding:16px">还没有发送记录</td></tr>'}</tbody>
                </table>
            </div>
        `;
        body.querySelector('#sms-refresh').onclick = () => this.renderSms(body);
    },

    // ================= 小游戏排序（管理后台可调整顺序，玩家端同步）=================
    // 兜底：接口都取不到清单时，直接解析玩家端的小游戏清单文件拿全部 id
    // 直接从玩家端清单文件解析 [{id,name}] —— 服务端进程旧/没重启时用它补齐排序页
    async _localGameList() {
        try {
            const txt = await (await fetch('/js/views/minigames.js?t=' + Date.now())).text();
            const start = txt.indexOf('const GAMES');
            const seg = start < 0 ? txt : txt.slice(start);
            const out = [];
            // GAMES 项既可能是 sc('id','名称',...) 工厂写法，也可能是 { id:'xxx' } 字面量
            const re = /(?:sc|sc2|scard|g)\(\s*['"]([A-Za-z0-9_-]+)['"](?:\s*,\s*['"]([^'"]+)['"])?|\bid\s*:\s*['"]([A-Za-z0-9_-]+)['"]\s*,\s*name\s*:\s*['"]([^'"]+)['"]/g;
            let m;
            while ((m = re.exec(seg))) {
                const id = m[1] || m[3];
                const name = m[2] || m[4] || id;
                if (id && !out.some(o => o.id === id)) out.push({ id, name });
            }
            return out;
        } catch (e) { return []; }
    },
    async _fallbackGameIds() {
        return (await this._localGameList()).map(o => o.id);
    },

    async renderOrder(body) {
        body.innerHTML = `<div class="card">加载中...</div>`;
        let r = null;
        try { r = await AdminAPI.minigameOrder(); } catch (e) { r = null; }
        if (!r) { try { r = await AdminAPI.api('/api/minigame/order', 'GET'); } catch (e) { r = null; } }
        // 优先 r.full（后端把「已保存顺序 + 未排序的新游戏」拼好的完整序列），
        // 避免 r.order 是局部子集时被截短。r.all / r.order 兜底。
        let list = ((r && (r.full || r.all || r.order)) || []).slice();
        // 关键：服务端进程可能是旧的（git pull 后没重启 → 清单停在 103 个），
        // 这里用前端 minigames.js 解析结果补齐，保证新增游戏一定出现在排序页。
        const localList = await this._localGameList();
        const missing = [];
        for (const o of localList) {
            if (list.indexOf(o.id) < 0) { list.push(o.id); missing.push(o.id); }
        }
        if (!list.length) list = localList.map(o => o.id);
        if (!list.length) {
            body.innerHTML = `<div class="card" style="color:#ff7a8b">取不到小游戏清单：接口没有返回数据，且无法解析 /js/views/minigames.js。请确认服务已重启加载最新代码。</div>`;
            return;
        }
        let all = ((r && (r.all || r.full)) || list.slice()).slice();
        for (const o of localList) if (all.indexOf(o.id) < 0) all.push(o.id);
        const names = Object.assign({}, r && r.names);
        for (const o of localList) if (!names[o.id]) names[o.id] = o.name;
        const nm = id => names[id] || id;
        // 内部用 {id, n} 列表：n 是「数字序号」，按 n 升序就是玩家端看到顺序
        // 保存时按 n 升序展开成 id[] 提交。
        const items = list.map((id, i) => ({ id, n: i + 1 }));
        const renum = () => items.sort((a, b) => a.n - b.n).forEach((o, i) => o.n = i + 1);
        body.innerHTML = `
            <div class="admin-note">
                调整玩家端小游戏排序。<b>拖动</b>或输入<b>序号</b>（数字越小越靠前）→ 1=最前。点击「💾 保存」后立即生效。<br>
                序号留空=未设（自动按当前位置）。未保存的更改显示「⚠ 未保存」。
                ${missing.length ? `<div style="margin-top:6px;color:#ffd56b">⚠ 本机清单里有 ${missing.length} 个游戏服务端还没识别（${this.esc(missing.join('、'))}）—— 已临时补进列表。若保存后仍不生效，请重启一次游戏服务（服务端现在按文件时间自动刷新，一般重启一次即可）。</div>` : ''}
            </div>
            <div class="card">
                <h3>当前排序（${items.length} 个）</h3>
                <input id="ord-kw" placeholder="🔍 搜索游戏名 / id" style="margin:8px 0;width:100%;max-width:260px">
                <div id="order-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px"></div>
                <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
                    <button class="btn primary" id="ord-save">💾 保存排序</button>
                    <button class="btn ghost" id="ord-reset">↺ 恢复默认</button>
                    <span id="ord-status" style="font-size:12px;color:#b9b3d8"></span>
                </div>
            </div>
        `;
        const ol = body.querySelector('#order-list');
        let kw = '';
        const render = () => {
            const key = kw.trim().toLowerCase();
            const sorted = items.slice().sort((a, b) => a.n - b.n);
            const rows = sorted.map((o, i) => ({ ...o, name: nm(o.id), display: i + 1 }))
                .filter(o => !key || o.name.toLowerCase().indexOf(key) >= 0 || o.id.toLowerCase().indexOf(key) >= 0);
            ol.innerHTML = rows.map(o => `
                <div class="ord-row" data-id="${this.esc(o.id)}" draggable="true" style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 10px;cursor:grab">
                    <span style="font-size:11px;color:#ffd56b;width:18px;text-align:right">${o.display}</span>
                    <input class="ord-num" type="number" min="1" step="1" value="${o.n}" data-id="${this.esc(o.id)}" title="直接输入序号，1=最前" style="width:48px;padding:2px 4px;background:#1a1428;color:#ffd56b;border:1px solid #555;border-radius:4px;text-align:center">
                    <span style="flex:1;font-size:13px">${this.esc(o.name)}<span style="opacity:.45;font-size:11px"> · ${o.id}</span></span>
                    <button class="btn ghost small" data-act="up" title="上移一位">▲</button>
                    <button class="btn ghost small" data-act="dn" title="下移一位">▼</button>
                    <button class="btn ghost small" data-act="top" title="置顶">⤒</button>
                    <button class="btn ghost small" data-act="bot" title="置底">⤓</button>
                </div>
            `).join('') || '<div style="color:#888;padding:12px">没有匹配的小游戏</div>';
            ol.querySelectorAll('.ord-row').forEach(el => {
                const id = el.dataset.id;
                const item = items.find(x => x.id === id);
                if (!item) return;
                const go = () => { renum(); render(); dirty(); };
                el.querySelector('[data-act=up]').onclick = () => { item.n -= 0.5; go(); };
                el.querySelector('[data-act=dn]').onclick = () => { item.n += 0.5; go(); };
                el.querySelector('[data-act=top]').onclick = () => { item.n = -1; go(); };
                el.querySelector('[data-act=bot]').onclick = () => { item.n = 1e9; go(); };
                el.querySelector('.ord-num').onchange = (e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v) && v >= 1) item.n = v;
                    go();
                };
            });
            // HTML5 拖动排序（PC）：拖到某行 → 插入到该 n 之前
            let dragId = null;
            ol.querySelectorAll('.ord-row').forEach(el => {
                el.addEventListener('dragstart', e => {
                    dragId = el.dataset.id;
                    el.style.opacity = '0.4';
                    e.dataTransfer.effectAllowed = 'move';
                });
                el.addEventListener('dragend', () => { el.style.opacity = ''; dragId = null; });
                el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.style.borderColor = 'rgba(255,213,107,.8)'; });
                el.addEventListener('dragleave', () => { el.style.borderColor = ''; });
                el.addEventListener('drop', e => {
                    e.preventDefault();
                    el.style.borderColor = '';
                    if (!dragId || dragId === el.dataset.id) return;
                    const src = items.find(x => x.id === dragId);
                    const dst = items.find(x => x.id === el.dataset.id);
                    if (!src || !dst) return;
                    src.n = dst.n - 0.5;
                    renum(); render(); dirty();
                });
            });
        };
        let saved = true;
        const status = body.querySelector('#ord-status');
        const dirty = () => { saved = false; status.textContent = '⚠ 未保存'; status.style.color = '#ff7a8b'; };
        const clean = () => { saved = true; status.textContent = '✓ 已保存'; status.style.color = '#7ad86a'; };
        body.querySelector('#ord-kw').addEventListener('input', e => { kw = e.target.value || ''; render(); });
        render(); clean();
        body.querySelector('#ord-save').onclick = async () => {
            try {
                renum();
                const order = items.slice().sort((a, b) => a.n - b.n).map(o => o.id);
                await AdminAPI.minigameOrderSave(order);
                clean(); U.toast('排序已保存，玩家端立即生效');
            } catch (e) { U.toast('保存失败：' + e.message); }
        };
        body.querySelector('#ord-reset').onclick = () => {
            // 恢复默认：按服务端小游戏清单的原始顺序（清空保存值后玩家端也走默认顺序）
            items.length = 0;
            all.forEach((id, i) => items.push({ id, n: i + 1 }));
            render(); dirty();
        };
    },

    async renderGift(body) {
        let r;
        try { r = await AdminAPI.giftList(); }
        catch (e) { body.innerHTML = `<div class="card" style="color:#ff7a8b">加载失败：${e.message}</div>`; return; }
        const list = r.list || [];
        const rows = list.map(g => {
            const rewards = Object.entries(g.rewards || {}).map(([k, v]) => `${k}×${v}`).join(' ');
            return `<tr>
                <td><b style="color:#ffd56b;font-family:monospace;letter-spacing:1px">${g.code}</b><div style="font-size:11px;color:#888">${g.name || ''}</div></td>
                <td>${rewards || '<i style="color:#888">无</i>'}</td>
                <td>${g.usedCount}${g.maxUses > 0 ? '/' + g.maxUses : '/∞'}</td>
                <td>${g.enabled !== false ? '<span style="color:#5cd65c">启用</span>' : '<span style="color:#888">停用</span>'}</td>
                <td>${g.expires ? new Date(g.expires).toLocaleDateString('zh-CN') : '永不过期'}</td>
                <td><button class="btn small" data-edit="${g.code}" data-name="${this.esc(g.name||'')}" data-content="${this.esc(g.content||'')}" data-max="${g.maxUses}" data-rewards='${this.esc(JSON.stringify(g.rewards||{}))}'>编辑</button> <button class="btn small danger" data-del="${g.code}">删</button></td>
            </tr>`;
        }).join('');

        body.innerHTML = `
            <div class="admin-note">礼品码：玩家在「设置 → 礼包码」中输入，奖励通过邮件发放。每个码每账号限领一次，maxUses=0 表示无限。</div>
            <div class="card">
                <h3>新建 / 编辑礼品码</h3>
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
                    <input id="gf-code" placeholder="礼包码（4-32 位字母数字-_）" maxlength="32">
                    <input id="gf-name" placeholder="名称（选填）">
                    <input id="gf-max" type="number" placeholder="最大使用次数（0=无限）" min="0" value="0">
                    <input id="gf-exp" type="date" placeholder="过期时间（选填）">
                    <input id="gf-gold" type="number" placeholder="金币" min="0" value="0">
                    <input id="gf-wood" type="number" placeholder="木材" min="0" value="0">
                    <input id="gf-iron" type="number" placeholder="铁矿" min="0" value="0">
                    <input id="gf-stone" type="number" placeholder="石币" min="0" value="0">
                    <input id="gf-gems" type="number" placeholder="钻石" min="0" value="0">
                    <input id="gf-wish" type="number" placeholder="许愿卡" min="0" value="0">
                </div>
                <textarea id="gf-content" placeholder="邮件说明文字（选填）" style="width:100%;margin-top:8px;min-height:50px;background:#2a2540;color:#fff;border:1px solid #555;border-radius:6px;padding:6px"></textarea>
                <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
                    <label style="font-size:12px"><input type="checkbox" id="gf-enabled" checked> 启用</label>
                    <button class="btn" id="gf-save" style="margin-left:auto">保存</button>
                </div>
            </div>
            <div class="card">
                <h3>已有礼品码</h3>
                <table class="admin-table">
                    <thead><tr><th>码/名称</th><th>奖励</th><th>已用</th><th>状态</th><th>过期</th><th>操作</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#777;padding:16px">还没有礼品码</td></tr>'}</tbody>
                </table>
            </div>
        `;
        const fill = (code, name, content, max, rewards) => {
            document.getElementById('gf-code').value = code || '';
            document.getElementById('gf-name').value = name || '';
            document.getElementById('gf-content').value = content || '';
            document.getElementById('gf-max').value = max || 0;
            ['gold','wood','iron','stone','gems','wish'].forEach(k => {
                const el = document.getElementById('gf-' + k); if (el) el.value = rewards[k] || 0;
            });
        };
        body.querySelector('#gf-save').onclick = async () => {
            const code = document.getElementById('gf-code').value.trim();
            const rewards = {};
            ['gold','wood','iron','stone','gems','wish'].forEach(k => {
                const v = parseInt(document.getElementById('gf-' + k).value) || 0;
                if (v > 0) rewards[k] = v;
            });
            if (!code) return U.toast('请输入礼包码');
            if (Object.keys(rewards).length === 0) return U.toast('至少填一项奖励');
            const exp = document.getElementById('gf-exp').value;
            try {
                await AdminAPI.giftSave({
                    code,
                    name: document.getElementById('gf-name').value.trim(),
                    content: document.getElementById('gf-content').value.trim(),
                    rewards,
                    maxUses: parseInt(document.getElementById('gf-max').value) || 0,
                    enabled: document.getElementById('gf-enabled').checked,
                    expires: exp ? new Date(exp + 'T23:59:59').toISOString() : null,
                });
                U.toast('保存成功');
                this.renderGift(body);
            } catch (e) { U.toast(e.message); }
        };
        body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
            fill(b.dataset.edit, b.dataset.name, b.dataset.content, b.dataset.max, JSON.parse(b.dataset.rewards || '{}'));
        });
        body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
            if (!confirm('删除礼品码 ' + b.dataset.del + '？已发放的邮件不会收回')) return;
            try { await AdminAPI.giftDelete(b.dataset.del); U.toast('已删除'); this.renderGift(body); }
            catch (e) { U.toast(e.message); }
        });
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
                    <div class="pi-name">${u.nickname || u.username}
                        ${u.displayId ? `<span style="color:#8ad4ff;font-size:11px;opacity:.7;margin-left:4px">${u.displayId}</span>` : ''}
                        ${u.isAdmin ? '<span class="tag-admin">[管理员]</span>' : ''}
                    </div>
                    <div class="pi-meta">
                        账号 ${u.username}${u.phone ? ' · 📱' + u.phone : ''} · 💎${U.num(u.gems)} · 🏔最高层 ${u.lv || 0} · 英雄 ${u.heroCount || 0} ·
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
        const names = [...this._us.sel];        if (!names.length) return U.toast('请先选择要删除的玩家');
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

    // ================= 模拟器 ROM 管理 =================
    ROM_CORES: [
        { id: 'nes',     label: 'FC / NES 红白机',      exts: ['nes'] },
        { id: 'snes',    label: '超级任天堂 SFC',        exts: ['smc', 'sfc', 'swc'] },
        { id: 'gb',      label: 'Game Boy / GBC',        exts: ['gb', 'gbc'] },
        { id: 'gba',     label: 'GBA 掌机',              exts: ['gba'] },
        { id: 'segaMD',  label: '世嘉 MD',               exts: ['md', 'gen'] },
        { id: 'n64',     label: 'N64（需较新浏览器）',   exts: [] },
        { id: 'psx',     label: 'PS1（需较新浏览器）',   exts: [] },
        { id: 'dosbox',  label: 'DOS 游戏（.zip 整包）', exts: [] },
        { id: 'arcade',  label: '街机（.zip）',          exts: [] },
    ],
    romCoreLabel(id) { const c = this.ROM_CORES.find(c => c.id === id); return c ? c.label : id; },
    romDetectCore(filename) {
        const m = /\.([a-z0-9]+)$/i.exec(filename || '');
        const ext = m ? m[1].toLowerCase() : '';
        for (const c of this.ROM_CORES) if (c.exts.includes(ext)) return c.id;
        return null;   // zip/7z/bin → 弹核心选择
    },
    romFmtSize(n) {
        if (n == null) return '';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
    },

    async renderRoms(body) {
        body.innerHTML = `
            <div class="card">
                <h3>🕹️ 模拟器 ROM 库</h3>
                <p style="font-size:13px;color:#b9b3d8">
                    上传的 ROM 会出现在玩家端「经典模拟器」里，<b>所有登录玩家</b>都可游玩（EmulatorJS 引擎）。
                    文件保存在服务器 data/roms/，单文件上限 512MB。<br>
                    <b>自动去重</b>：内容完全相同的 ROM 会被拒绝；上传后可在下方给游戏设<b>版本标签</b>（普通版 / 无敌版）和<b>排序</b>（数字越小越靠前，0=默认按上传时间）。
                    <br><b>平台</b>按文件扩展名<b>自动识别</b>（.nes=FC、.smc/.sfc=SFC、.gba=GBA 等），<b>不要</b>在这里选平台。
                </p>
                <div class="emu-drop" id="rom-drop">📥 点击选择 ROM 文件，或拖拽到此处<br>
                    <span>.nes / .smc / .sfc / .gb / .gbc / .gba / .md / .zip …（zip 需选择模拟核心）</span>
                    <input type="file" id="rom-file" accept=".nes,.smc,.sfc,.swc,.gb,.gbc,.gba,.md,.gen,.bin,.zip,.7z" multiple style="display:none">
                </div>
                <div id="rom-core-pick" style="display:none;margin-top:12px"></div>
            </div>
            <div class="card">
                <h3>已上传（<span id="rom-count">0</span>）</h3>
                <div class="emu-list" id="rom-list"></div>
                <p id="rom-empty" style="font-size:12px;color:#777;display:none">还没有上传任何 ROM。</p>
            </div>
        `;
        const drop = body.querySelector('#rom-drop');
        const fileInput = body.querySelector('#rom-file');
        const pickBox = body.querySelector('#rom-core-pick');
        drop.onclick = () => fileInput.click();
        fileInput.onchange = () => { if (fileInput.files.length) this.romHandleFiles(body, [...fileInput.files]); fileInput.value = ''; };
        drop.ondragover = e => { e.preventDefault(); drop.style.borderColor = 'rgba(255,213,107,.8)'; };
        drop.ondragleave = () => { drop.style.borderColor = ''; };
        drop.ondrop = e => {
            e.preventDefault();
            drop.style.borderColor = '';
            if (e.dataTransfer.files.length) this.romHandleFiles(body, [...e.dataTransfer.files]);
        };
        await this.romRefreshList(body);
    },

    async romRefreshList(body) {
        const r = await AdminAPI.romList();
        const list = body.querySelector('#rom-list');
        const empty = body.querySelector('#rom-empty');
        const count = body.querySelector('#rom-count');
        if (!list) return;
        // 与玩家端一致的排序：sort>0 的越小越靠前；0=未设置 → 按上传时间倒序排后面
        const rank = r => (r.sort > 0 ? r.sort : 1e9);
        const roms = (r.roms || []).slice().sort((a, b) => rank(a) - rank(b) || (b.addedAt || 0) - (a.addedAt || 0));
        count.textContent = roms.length;
        list.innerHTML = roms.map(rom => `
            <div class="emu-item">
                <div class="emu-item-info">
                    <div class="emu-item-name">${this.esc(rom.name)}${rom.category === 'invincible' ? ' <span class="emu-tag emu-tag-inv">无敌版</span>' : ''}</div>
                    <div class="emu-item-meta">${this.esc(this.romCoreLabel(rom.core))} · ${this.romFmtSize(rom.size)}${rom.by ? ' · ' + this.esc(rom.by) + ' 上传' : ''} · ${new Date(rom.addedAt).toLocaleString('zh-CN')}${rom.sort ? ' · 置顶序 ' + rom.sort : ''}</div>
                    <div class="emu-row-ctl">
                        <label>版本 <select data-cat="${this.esc(rom.id)}" title="平台按扩展名已自动识别，这里只选「普通版 / 无敌版」">
                            <option value="normal"${rom.category !== 'invincible' ? ' selected' : ''}>普通版</option>
                            <option value="invincible"${rom.category === 'invincible' ? ' selected' : ''}>无敌版</option>
                        </select></label>
                        <label>排序 <input type="number" min="0" max="9999" value="${rom.sort || 0}" data-sort="${this.esc(rom.id)}" title="0=默认按上传时间，数字越小越靠前"></label>
                        <button class="emu-btn emu-btn-save" data-save="${this.esc(rom.id)}">💾 保存</button>
                        <button class="emu-btn emu-btn-del" data-del="${this.esc(rom.id)}">✕ 删除</button>
                    </div>
                </div>
            </div>
        `).join('');
        empty.style.display = roms.length ? 'none' : 'block';
        // 保存分类/排序（只传改动过的字段）
        const dirty = {};   // id -> {category?, sort?}
        list.querySelectorAll('[data-cat]').forEach(sel => {
            sel.onchange = () => {
                (dirty[sel.dataset.cat] = dirty[sel.dataset.cat] || {}).category = sel.value;
                sel.closest('.emu-item').classList.add('emu-item-dirty');
            };
        });
        list.querySelectorAll('[data-sort]').forEach(inp => {
            inp.onchange = () => {
                (dirty[inp.dataset.sort] = dirty[inp.dataset.sort] || {}).sort = parseInt(inp.value || '0', 10);
                inp.closest('.emu-item').classList.add('emu-item-dirty');
            };
        });
        list.querySelectorAll('[data-save]').forEach(b => {
            b.onclick = async () => {
                const id = b.dataset.save;
                const patch = dirty[id];
                if (!patch) return U.toast('没有改动需要保存');
                try {
                    await AdminAPI.romUpdate(id, patch);
                    U.toast('✅ 已保存，玩家端立即按新顺序/分类显示');
                    this.romRefreshList(body);
                } catch (e) { U.toast('❌ ' + e.message); }
            };
        });
        list.querySelectorAll('[data-del]').forEach(b => {
            b.onclick = async () => {
                if (!U.confirm('删除该 ROM？所有玩家将无法再玩到它（磁盘文件一并清除）')) return;
                try {
                    await AdminAPI.romDelete(b.dataset.del);
                    U.toast('已删除');
                    this.romRefreshList(body);
                } catch (e) { U.toast(e.message); }
            };
        });
    },

    romHandleFiles(body, files) {
        const pickBox = body.querySelector('#rom-core-pick');
        let pending = [...files];
        const next = () => {
            if (!pending.length) { pickBox.style.display = 'none'; pickBox.innerHTML = ''; return this.romRefreshList(body); }
            const file = pending.shift();
            const core = this.romDetectCore(file.name);
            if (core) return this.romUploadOne(body, file, core).then(next);
            // 无法从后缀判断 → 核心选择
            pickBox.style.display = 'block';
            pickBox.innerHTML = `<p style="font-size:13px;color:#ffd56b">「${this.esc(file.name)}」请选择模拟核心（FC 游戏选 FC / NES；DOS 整包 zip 选 DOS）：</p>
                <div class="emu-core-row">${this.ROM_CORES.map(c =>
                    `<button class="emu-core-btn${c.id === 'nes' ? ' emu-core-hot' : ''}" data-core="${c.id}">${this.esc(c.label)}</button>`).join('')}</div>`;
            pickBox.querySelectorAll('[data-core]').forEach(b => {
                b.onclick = () => {
                    pickBox.style.display = 'none';
                    this.romUploadOne(body, file, b.dataset.core).then(next);
                };
            });
        };
        next();
    },

    async romUploadOne(body, file, core) {
        U.toast(`正在上传「${file.name}」…`);
        try {
            const r = await AdminAPI.romUpload(file, core);
            U.toast(`✅ 已上传「${file.name}」（${this.romFmtSize(r.size)}），玩家端立即可见`);
        } catch (e) {
            U.toast('❌ ' + (e.message || '上传失败'));
        }
    },

    async _sendMail(body, FIELDS) {        const st = this._us;
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

    // ================= AI 酒馆（SillyTavern 网关） =================
    async renderTavern(body) {
        body.innerHTML = `
            <div class="card">
                <h3>🍺 AI 酒馆（SillyTavern）接入状态</h3>
                <div id="tv-status" style="font-size:13px;color:#b9b3d8">正在检测…</div>
                <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn small" id="tv-refresh">刷新状态</button>
                    <button class="btn small ghost" id="tv-scan">扫描本机端口(8000-8010)</button>
                </div>
            </div>
            <div class="card">
                <h3>连接配置</h3>
                <div class="admin-note" style="margin-bottom:10px">
                    在这里填写后点「保存并生效」，<b>立即生效、不需要重启服务</b>，也不用再去服务器上改文件。<br>
                    要求 SillyTavern 与塔界远征跑在<b>同一台服务器</b>上（网关连的是 127.0.0.1）。
                </div>
                <label class="tv-label">上游地址（SillyTavern 跑在哪）</label>
                <input id="tv-url" placeholder="http://127.0.0.1:8000">
                <label class="tv-label">管理员句柄（handle）</label>
                <input id="tv-handle" placeholder="admin">
                <label class="tv-label">管理员密码</label>
                <input id="tv-pwd" type="password" placeholder="留空 = 只代理，不给玩家自动开号">
                <label class="tv-check"><input type="checkbox" id="tv-enabled"> 启用 AI 酒馆网关</label>
                <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn small" id="tv-test">测试连接（不保存）</button>
                    <button class="btn small" id="tv-save">保存并生效</button>
                </div>
                <div id="tv-result" style="margin-top:12px;font-size:12.5px;color:#b9b3d8"></div>
            </div>
            <div class="card">
                <h3>怎么拿到「管理员句柄 / 密码」</h3>
                <div style="font-size:12.5px;color:#b9b3d8;line-height:1.9">
                    1. 在 SillyTavern 目录执行一次 <code>node server.js</code>，生成配置文件后 Ctrl+C 停掉<br>
                    2. 编辑仓库<b>根目录</b>的 <code>config.yaml</code>（不是 <code>default/</code> 里那份）：<br>
                    &nbsp;&nbsp;&nbsp;· <code>enableUserAccounts: true</code> ← 必须，否则没有多用户<br>
                    &nbsp;&nbsp;&nbsp;· 增加 <code>sso</code> 段：<code>autheliaAuth: true</code>、<code>trustedProxies: [127.0.0.1]</code><br>
                    &nbsp;&nbsp;&nbsp;· <code>listen</code> 保持 <code>false</code>（别加 --listen，会把能改 API Key 的面板暴露到公网）<br>
                    3. 重启 SillyTavern，用服务器本机访问 <code>http://127.0.0.1:8000</code>，进「用户设置 → 管理员面板」<br>
                    4. 给默认账号 <code>default-user</code> 设密码（它默认就是管理员），或新建一个提升为 Admin 的账号<br>
                    5. 把句柄和密码填到上面，点「保存并生效」
                </div>
            </div>
        `;

        const el = id => body.querySelector('#' + id);
        const result = el('tv-result');
        let cfg = { url: 'http://127.0.0.1:8000', enabled: true, handle: 'admin', password: '' };

        const renderStatus = async () => {
            const box = el('tv-status');
            if (!box) return;
            box.textContent = '正在检测…';
            try {
                const r = await AdminAPI.api('/api/admin/tavern/config');
                const c = r.config || {};
                cfg = { url: c.url, enabled: c.enabled, handle: c.handle, password: c.password || '', forwardRealIp: c.forwardRealIp };
                el('tv-url').value = c.url || '';
                el('tv-handle').value = c.handle || '';
                el('tv-pwd').value = c.password || '';
                el('tv-enabled').checked = c.enabled !== false;
            } catch (e) { /* 老版本服务端可能没这个接口 */ }

            try {
                const t = await AdminAPI.api('/api/admin/tavern/test', 'POST', {});
                const dot = t.online ? '🟢' : '🔴';
                const lines = [];
                lines.push(`${dot} 上游 <code>${this.esc(t.upstream || cfg.url)}</code> —— ${t.online ? '已连通' : '连不上'}`);
                if (t.note) lines.push(`<span style="color:#ff9aa6">${this.esc(t.note)}</span>`);
                if (t.online) {
                    if (!t.handle || !cfg.password) {
                        lines.push('⚠️ 未填写管理员密码：玩家能打开酒馆，但<b>不会自动开号</b>，大家会挤在同一个账号里');
                    } else if (t.admin && t.admin.ok) {
                        lines.push(`🟢 管理员「${this.esc(t.handle)}」登录成功`);
                        if (t.provision) {
                            lines.push(t.provision.ok
                                ? '🟢 自动开号可用（已用临时账号实测通过）'
                                : `🔴 自动开号失败：${this.esc(t.provision.msg || '')}`);
                        }
                    } else {
                        lines.push(`🔴 管理员登录失败：${this.esc((t.admin && t.admin.msg) || '未知原因')}`);
                    }
                } else {
                    lines.push('提示：在 SillyTavern 目录执行 <code>node server.js</code>（<b>不要</b>加 --listen），再点刷新。');
                }
                box.innerHTML = lines.join('<br>');
            } catch (e) {
                box.innerHTML = `<span style="color:#ff9aa6">状态检测失败：${this.esc(e.message)}</span>`;
            }
        };

        el('tv-refresh').onclick = renderStatus;

        el('tv-scan').onclick = async () => {
            U.toast('正在扫描本机 8000-8010 端口…');
            try {
                const r = await AdminAPI.api('/api/admin/tavern/scan', 'POST', { from: 8000, to: 8010 });
                if (!r.ports || !r.ports.length) return U.toast('没扫到，确认 SillyTavern 是否已启动');
                const port = r.ports[0];
                el('tv-url').value = 'http://127.0.0.1:' + port;
                U.toast('找到端口 ' + r.ports.join('、') + '，已填入地址框，记得保存');
            } catch (e) { U.toast(e.message); }
        };

        el('tv-test').onclick = async () => {
            result.textContent = '测试中…';
            try {
                const t = await AdminAPI.api('/api/admin/tavern/test', 'POST', {
                    url: el('tv-url').value.trim(),
                    handle: el('tv-handle').value.trim(),
                    password: el('tv-pwd').value,
                });
                const lines = [t.online ? '🟢 连上了' : '🔴 连不上：' + (t.note || '')];
                if (t.online && t.admin) lines.push((t.admin.ok ? '🟢 管理员登录成功' : '🔴 ' + t.admin.msg));
                if (t.provision) lines.push(t.provision.ok ? '🟢 自动开号可用' : '🔴 自动开号失败：' + t.provision.msg);
                result.innerHTML = lines.join('<br>') + '<br><span style="color:#7f8da3">（这是测试，尚未保存）</span>';
            } catch (e) { result.innerHTML = `<span style="color:#ff9aa6">${this.esc(e.message)}</span>`; }
        };

        el('tv-save').onclick = async () => {
            result.textContent = '保存中…';
            try {
                const r = await AdminAPI.api('/api/admin/tavern/config', 'POST', {
                    url: el('tv-url').value.trim(),
                    handle: el('tv-handle').value.trim(),
                    password: el('tv-pwd').value,
                    enabled: el('tv-enabled').checked,
                });
                U.toast('✅ 已保存并生效（无需重启）');
                result.textContent = '✅ 已保存并生效，配置写入 ' + (r.config && r.config.file ? r.config.file : '服务端');
                await renderStatus();
            } catch (e) { result.innerHTML = `<span style="color:#ff9aa6">${this.esc(e.message)}</span>`; }
        };

        await renderStatus();
    },
};

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
