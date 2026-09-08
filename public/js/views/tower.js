// 冒险 - 实时推塔战斗（RES_NAME / RES_ICON 定义在 utils.js）
const TowerView = {
    ancient: false,
    // 层数导航：一次显示 15 层
    pageStart: 1,
    pageSize: 15,
    maxFloor: 200,
    chapters: [],
    // 自动推塔（通关后自动打下一层，失败停止）；自动释放技能（必杀 + 城墙技）
    autoTower: (() => { try { return localStorage.getItem('autoTower') === '1'; } catch (e) { return false; } })(),
    autoSkill: (() => { try { return localStorage.getItem('autoSkill') !== '0'; } catch (e) { return true; } })(),

    render(root, app) {
        this.ancient = false;
        this.renderHome(root, app, false);
    },

    async renderHome(root, app, ancient) {
        const st = app.user.state;
        const cleared = ancient ? (st.ancient.maxFloor || 0) : (st.tower.maxFloor || 0);
        const maxF = Math.max(1, cleared); // 展示用最高层
        const equipped = (st.equipped || []).length;
        const gate = ancient ? 5 : 0;
        const gateOk = !ancient || (st.tower.maxFloor || 0) >= 5;
        if (!this.chapters.length) {
            try { const info = await API.towerInfo(); this.chapters = info.chapters; this.maxFloor = info.maxFloor; }
            catch (e) { this.maxFloor = 200; }
        }
        const chap = this.chapterOf(Math.min(this.maxFloor, cleared + 1));
        const nextBoss = Math.ceil((cleared + 1) / 5) * 5;

        root.innerHTML = `
            <div class="section-title">${ancient ? '远古世界' : '冒险 · 推塔'}</div>
            <div class="card" style="text-align:center">
                <h3>${ancient ? '🌌 远古远征' : '⚔️ 肉鸽推塔'}</h3>
                <p style="color:#b9b3d8;font-size:13px;margin:8px 0;line-height:1.7">
                    小怪分波冲阵，每 5 层关底出现 BOSS。<br>每清完一波可三选一增益。
                </p>
                <p>已通关：<b style="color:#ffd56b">${cleared}</b> / ${this.maxFloor} 层　·
                    当前进度：<b style="color:#5cc7ff">${chap.emoji} ${chap.name}</b>（${chap.from}-${chap.to} 层）</p>
                <p>上阵英雄：<b style="color:${equipped ? '#5cc7ff' : '#ff5252'}">${equipped}/5</b></p>
                ${!equipped ? '<p style="color:#ff7a8b;font-size:12px;margin-top:6px">请先点击下方按钮上阵英雄</p>' : ''}
                ${ancient && !gateOk ? `<p style="color:#ff7a8b;font-size:12px;margin-top:6px">需先在冒险中通关第 ${gate} 层</p>` : ''}
                <button class="btn" id="btn-formation" style="margin-top:10px">🎯 上阵（${equipped}/5）</button>
                <div id="formation-list" style="display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin-top:10px"></div>
                <button class="btn ${this.autoTower ? '' : 'ghost'} small" id="btn-auto-tower" style="margin-top:10px">
                    ${this.autoTower ? '🤖 自动推塔：开（通关自动进下一层）' : '🤖 自动推塔：关'}
                </button>
            </div>
            <div class="section-title">
                选择层数
                <span style="float:right;font-size:11px;color:#b9b3d8">每 5 层一个 BOSS · 共 ${this.maxFloor} 层</span>
            </div>
            <div class="floor-nav">
                <button class="btn ghost small" id="fn-prev">« 上一页</button>
                <button class="btn ghost small" id="fn-cur">回到当前层</button>
                <button class="btn ghost small" id="fn-boss">下一个 BOSS 层 ${nextBoss <= this.maxFloor ? '(' + nextBoss + ')' : ''}</button>
                <button class="btn ghost small" id="fn-next">下一页 »</button>
            </div>
            <div id="floor-list" class="floor-grid"></div>
            <div class="chapter-bar" id="chapter-bar"></div>
        `;

        root.querySelector('#btn-formation').onclick = () => this.openFormation(root, app, ancient);
        const autoBtn = root.querySelector('#btn-auto-tower');
        if (autoBtn) autoBtn.onclick = () => {
            this.autoTower = !this.autoTower;
            try { localStorage.setItem('autoTower', this.autoTower ? '1' : '0'); } catch (e) { }
            autoBtn.textContent = this.autoTower ? '🤖 自动推塔：开（通关自动进下一层）' : '🤖 自动推塔：关';
            autoBtn.classList.toggle('ghost', !this.autoTower);
            U.toast(this.autoTower ? '自动推塔已开启：通关后自动挑战下一层，失败自动停止' : '自动推塔已关闭');
        };
        this.renderFormationBar(root, app);

        // 章节快捷条
        const cb = root.querySelector('#chapter-bar');
        cb.innerHTML = this.chapters.map((c, i) =>
            `<button class="ch-btn" data-c="${i}">${c.emoji}<span>${c.from}-${c.to}</span></button>`).join('');
        cb.querySelectorAll('[data-c]').forEach(b => {
            b.onclick = () => {
                const c = this.chapters[parseInt(b.dataset.c)];
                this.pageStart = c.from;
                this.renderFloors(root, app, ancient);
            };
        });

        // 默认定位到当前进度所在页
        this.pageStart = this.clampPage(Math.max(1, cleared - 2));
        root.querySelector('#fn-prev').onclick = () => {
            this.pageStart = this.clampPage(this.pageStart - this.pageSize);
            this.renderFloors(root, app, ancient);
        };
        root.querySelector('#fn-next').onclick = () => {
            this.pageStart = this.clampPage(this.pageStart + this.pageSize);
            this.renderFloors(root, app, ancient);
        };
        root.querySelector('#fn-cur').onclick = () => {
            this.pageStart = this.clampPage(Math.max(1, cleared - 2));
            this.renderFloors(root, app, ancient);
        };
        root.querySelector('#fn-boss').onclick = () => {
            this.pageStart = this.clampPage(nextBoss - 2);
            this.renderFloors(root, app, ancient);
        };

        this.renderFloors(root, app, ancient);
    },

    chapterOf(f) {
        return this.chapters.find(c => f >= c.from && f <= c.to) || this.chapters[this.chapters.length - 1] || { name: '-', emoji: '⚔️', from: 1, to: 200 };
    },
    clampPage(p) {
        const maxStart = Math.max(1, this.maxFloor - this.pageSize + 1);
        return Math.min(Math.max(1, p), maxStart);
    },

    renderFloors(root, app, ancient) {
        const st = app.user.state;
        const cleared = ancient ? (st.ancient.maxFloor || 0) : (st.tower.maxFloor || 0);
        const maxF = Math.max(1, cleared); // 展示用最高层
        const equipped = (st.equipped || []).length;
        const gateOk = !ancient || (st.tower.maxFloor || 0) >= 5;
        const list = root.querySelector('#floor-list');
        if (!list) return;
        list.innerHTML = '';
        const from = this.pageStart;
        const to = Math.min(this.maxFloor, from + this.pageSize - 1);
        for (let f = from; f <= to; f++) {
            const isBoss = f % 5 === 0;
            const done = f <= cleared;
            const current = f === cleared + 1;
            const locked = (ancient && !gateOk) || !equipped || f > cleared + 1;
            const btn = U.el(`
                <button class="floor-btn ${isBoss ? 'boss' : ''} ${done ? 'done' : ''} ${current ? 'current' : ''}"
                    data-f="${f}" ${locked ? 'disabled' : ''}>
                    <span class="fi">${isBoss ? '👑' : (done ? '✅' : '⚔️')}</span>
                    <span class="ft">第 ${f} 层</span>
                    ${isBoss ? '<span class="fb">BOSS</span>' : ''}
                </button>
            `);
            btn.onclick = () => this.launch(root, app, ancient, f);
            list.appendChild(btn);
        }
    },

    // 顶部展示当前上阵的 5 个英雄
    async renderFormationBar(root, app) {
        const box = root.querySelector('#formation-list');
        if (!box) return;
        try {
            const r = await API.heroes();
            const eq = new Set(r.equipped || []);
            const items = r.owned.filter(o => eq.has(o.uid));
            box.innerHTML = items.length
                ? items.map(o => {
                    const t = r.heroes.find(x => x.id === o.id);
                    if (!t) return '';
                    return `<div style="text-align:center;width:58px">
                        <img src="${U.imgSrc(t.img)}" style="width:44px;height:44px;border-radius:6px;object-fit:cover">
                        <div style="font-size:10px;color:#cfc9e8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}</div>
                        <div style="font-size:10px;color:#ffd56b">Lv.${o.lv || 1}</div>
                    </div>`;
                }).join('')
                : '<span style="font-size:12px;color:#ff7a8b">尚未上阵英雄</span>';
        } catch (e) { /* 忽略 */ }
    },

    // 上阵选择弹窗：点击卡片切换上阵 / 下阵
    async openFormation(root, app, ancient) {
        let r;
        try { r = await API.heroes(); } catch (e) { U.toast(e.message); return; }
        if (!r.owned.length) { U.toast('还没有英雄，请先到「英雄 → 许愿」'); return; }

        const modal = U.openModal(`
            <h3 style="text-align:center">选择上阵英雄</h3>
            <p style="text-align:center;color:#b9b3d8;font-size:12px;margin:6px 0">
                已选 <b id="fm-cnt" style="color:#ffd56b">${(r.equipped || []).length}</b> / 5　·　点击卡片上阵 / 下阵
            </p>
            <div class="hero-grid" id="fm-grid" style="max-height:50vh;overflow:auto"></div>
            <button class="btn" id="fm-ok" style="margin-top:12px;width:100%">完成</button>
        `);

        const grid = modal.querySelector('#fm-grid');
        const cntEl = modal.querySelector('#fm-cnt');
        const equipped = new Set(r.equipped || []);

        const sync = () => {
            cntEl.textContent = equipped.size;
            grid.querySelectorAll('[data-uid]').forEach(card => {
                const on = equipped.has(card.dataset.uid);
                card.style.outline = on ? '2px solid #ffd56b' : '2px solid transparent';
                card.style.opacity = on ? '1' : '0.72';
                const badge = card.querySelector('.fm-badge');
                if (badge) badge.textContent = on ? '已上阵' : '';
            });
        };

        // 3★/4★ 材料英雄不能上阵（已上阵的保留，方便玩家手动下阵）
        const isMaterial = (oh) => oh.material === true || !!(r.heroes.find(x => x.id === oh.id) || {}).material;
        r.owned.filter(oh => !isMaterial(oh) || equipped.has(oh.uid)).forEach(oh => {
            const t = r.heroes.find(x => x.id === oh.id);
            if (!t) return;
            const mat = isMaterial(oh);
            const card = U.el(`
                <div class="hero-card" data-uid="${oh.uid}" style="cursor:pointer;position:relative">
                    <div class="fm-badge" style="position:absolute;top:2px;right:5px;font-size:10px;color:#ffd56b"></div>
                    ${mat ? '<div style="position:absolute;top:2px;left:4px;font-size:9px;color:#b9b3d8;background:rgba(0,0,0,.6);padding:1px 4px;border-radius:4px">材料</div>' : ''}
                    <img src="${U.imgSrc(t.img)}">
                    <div class="name">${t.name} Lv.${oh.lv || 1}</div>
                    <div class="rarity ${U.rarityClass(t.rarity)}">${t.rarity}</div>
                    <div style="font-size:11px;color:#ff9d5c">攻 ${oh.atk || 0}</div>
                    <div style="font-size:11px;color:#5cc7ff">生命 ${oh.hp || 0}</div>
                </div>
            `);
            card.onclick = async () => {
                if (mat && !equipped.has(oh.uid)) {
                    U.toast('3★/4★ 材料英雄无法上阵，只能用作升星材料');
                    return;
                }
                try {
                    const on = equipped.has(oh.uid);
                    const rs = on ? await API.heroUnequip(oh.uid) : await API.heroEquip(oh.uid);
                    app.user.state = rs.state;
                    app.refresh();
                    if (on) equipped.delete(oh.uid); else equipped.add(oh.uid);
                    sync();
                } catch (e) { U.toast(e.message); }
            };
            grid.appendChild(card);
        });
        sync();

        modal.querySelector('#fm-ok').onclick = () => {
            U.closeModal();
            this.renderHome(root, app, ancient);
        };
    },

    // 战斗在独立的全屏层中进行，铺满整个屏幕
    battleLayer() {
        let layer = document.getElementById('battle-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'battle-layer';
            layer.className = 'battle-layer hidden';
            document.body.appendChild(layer);
        }
        return layer;
    },

    async launch(root, app, ancient, floor) {
        const equipped = (app.user.state.equipped || []).length;
        if (!equipped) { U.toast('请先在英雄背包上阵英雄'); return; }

        let lv;
        try { lv = await API.towerLevel(floor, ancient); }
        catch (e) { U.toast(e.message); return; }
        if (!lv.heroes || !lv.heroes.length) { U.toast('没有上阵英雄'); return; }
        const maxFloor = lv.maxFloor || 200;

        const waveCount = lv.waves.length;
        const enemyCount = lv.waves.reduce((s, w) => s + w.enemies.length, 0);
        const chap = lv.chapter || { name: '', emoji: '' };
        const p = lv.power || {};
        const atkRate = p.needAtk ? Math.min(999, ((p.teamAtk || 0) / p.needAtk * 100) / 100) : 0;
        const hpRate = p.needHp ? Math.min(999, ((p.teamHp || 0) / p.needHp * 100) / 100) : 0;
        const rateColor = r => r >= 1 ? '#5cc7ff' : (r >= 0.7 ? '#ffd56b' : '#ff7a8b');

        const layer = this.battleLayer();
        layer.innerHTML = `
            <div class="battle-top">
                <button class="btn ghost small" id="btn-retreat">← 撤退</button>
                <div class="bt-title">${ancient ? '远古' : chap.emoji + ' ' + chap.name} · 第 ${floor} 层</div>
                <div class="bt-info">${waveCount}波 / ${enemyCount}怪${lv.isBossFloor ? ' 👑' : ''}</div>
            </div>
            <div class="battle-power">
                队伍战力 <b style="color:${rateColor(atkRate)}">${U.fmt(p.teamAtk || 0)}</b>
                <span style="color:#8a83a8">/ 推荐 ${U.fmt(p.needAtk || 0)}</span>
                ・队伍生命 <b style="color:${rateColor(hpRate)}">${U.fmt(p.teamHp || 0)}</b>
                <span style="color:#8a83a8">/ 推荐 ${U.fmt(p.needHp || 0)}</span>
                ${lv.boss ? `・BOSS <b style="color:#ff7a8b">${lv.boss.name}</b>` : ''}
            </div>
            <div class="battle-stage">
                <canvas id="battle-canvas" class="battle-canvas"></canvas>
                <div id="buff-area" class="buff-overlay hidden"></div>
            </div>
            <div class="skill-bar" id="skill-bar"></div>
        `;
        layer.classList.remove('hidden');

        let barTimer = 0;
        const closeLayer = () => {
            if (barTimer) { clearInterval(barTimer); barTimer = 0; }
            Battle.stop();
            layer.classList.add('hidden');
            layer.innerHTML = '';
        };

        layer.querySelector('#btn-retreat').onclick = () => {
            closeLayer();
            this.renderHome(root, app, ancient);
        };

        const cvs = layer.querySelector('#battle-canvas');
        const buffArea = layer.querySelector('#buff-area');

        requestAnimationFrame(() => {
            Battle.start(cvs, {
                floor, ancient,
                waves: lv.waves, heroes: lv.heroes, buffPool: lv.buffPool, theme: lv.theme,
                wall: lv.wall,                 // 城墙技能
                autoSkill: this.autoSkill,     // 必杀 / 城墙技是否自动释放
                onWaveClear: (buffs, cb) => this.showBuffs(buffArea, buffs, cb),
                onWin: async () => {
                    closeLayer();
                    try {
                        const r = await API.towerClear(floor, ancient);
                        app.user.state = r.state;
                        app.refresh();
                        this.showResult(root, app, true, floor, ancient, r.rewards, r.first, maxFloor);
                    } catch (e) { U.toast(e.message); }
                },
                onLose: () => {
                    closeLayer();
                    if (this.autoTower) U.toast(`🤖 自动推塔停止：第 ${floor} 层挑战失败`);
                    this.showResult(root, app, false, floor, ancient, null, false, maxFloor);
                },
            });

            // ---- 技能栏：英雄必杀 + 城墙技能 + 自动开关 ----
            const bar = layer.querySelector('#skill-bar');
            if (bar && Battle.skillState) {
                const syncBar = () => {
                    const stt = Battle.skillState();
                    stt.ults.forEach(u => {
                        const b = bar.querySelector(`[data-ult="${u.uid}"]`);
                        if (!b) return;
                        b.classList.toggle('ready', !!u.ready && !u.dead);
                        b.classList.toggle('dead', !!u.dead);
                        const cd = b.querySelector('.sk-cd'); if (cd) cd.style.height = ((1 - u.pct) * 100) + '%';
                        const tx = b.querySelector('.sk-txt');
                        if (tx) tx.textContent = u.dead ? '阵亡' : (u.ready ? '必杀' : u.cd.toFixed(1) + 's');
                    });
                    const wb = bar.querySelector('#btn-wall');
                    if (wb && stt.wall) {
                        wb.classList.toggle('ready', stt.wall.ready);
                        const cd = wb.querySelector('.sk-cd'); if (cd) cd.style.height = ((1 - stt.wall.pct) * 100) + '%';
                        const tx = wb.querySelector('.sk-txt');
                        if (tx) tx.textContent = stt.wall.ready ? '🛡 ' + stt.wall.name : stt.wall.cd.toFixed(1) + 's';
                    }
                    const ab = bar.querySelector('#btn-auto');
                    if (ab) {
                        ab.textContent = stt.auto ? '自动 ⏻开' : '自动 ⏻关';
                        ab.classList.toggle('on', stt.auto);
                    }
                };
                const buildBar = () => {
                    const stt = Battle.skillState();
                    bar.innerHTML = `
                        <div class="sb-ults">
                            ${stt.ults.map(u => `
                                <button class="sk-btn" data-ult="${u.uid}" title="${u.ultName}">
                                    <span class="sk-cd"></span>
                                    <span class="sk-txt"></span>
                                </button>`).join('')}
                        </div>
                        <div class="sb-wall">
                            ${stt.wall ? `<button class="sk-btn wall" id="btn-wall" title="${stt.wall.desc}（${stt.wall.wallName}）">
                                <span class="sk-cd"></span><span class="sk-txt"></span></button>` : ''}
                            <button class="sk-auto" id="btn-auto"></button>
                        </div>`;
                    bar.querySelectorAll('[data-ult]').forEach(b => b.onclick = () => {
                        Battle.castUltByUid(b.dataset.ult); syncBar();
                    });
                    const wb = bar.querySelector('#btn-wall');
                    if (wb) wb.onclick = () => { Battle.castWallSkill(); syncBar(); };
                    const ab = bar.querySelector('#btn-auto');
                    if (ab) ab.onclick = () => {
                        Battle.setAuto(!Battle.autoSkill);
                        this.autoSkill = Battle.autoSkill;
                        try { localStorage.setItem('autoSkill', this.autoSkill ? '1' : '0'); } catch (e) { }
                        syncBar();
                    };
                    syncBar();
                };
                buildBar();
                barTimer = setInterval(syncBar, 200);
            }
        });
    },

    showBuffs(area, buffs, cb) {
        // 自动推塔：不弹窗打断，直接选一个增益继续
        if (this.autoTower) {
            const b = buffs[Math.floor(Math.random() * buffs.length)];
            cb(b);
            return;
        }
        area.classList.remove('hidden');
        area.innerHTML = `
            <div class="card buff-card">
                <h3 style="text-align:center">🎁 清完一波！选择增益</h3>
                <div class="buff-list">
                    ${buffs.map((b, i) => `
                        <button class="buff-item" data-i="${i}">
                            <div class="bi">${b.icon}</div>
                            <div class="bn">${b.name}</div>
                            <div class="bd">${b.desc}</div>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        area.querySelectorAll('.buff-item').forEach(btn => {
            btn.onclick = () => {
                const b = buffs[parseInt(btn.dataset.i)];
                area.innerHTML = '';
                area.classList.add('hidden');
                cb(b);
            };
        });
    },

    showResult(root, app, win, floor, ancient, rewards, first, maxFloor) {
        maxFloor = maxFloor || 200;
        const rw = rewards
            ? Object.entries(rewards).map(([k, v]) => `<span>${RES_NAME[k] || k} +${U.fmt(v)}</span>`).join('')
            : '';
        const hasNext = win && floor < maxFloor;
        const modal = U.openModal(`
            <h3 style="text-align:center">${win ? '🎉 挑战成功' : '💀 挑战失败'}</h3>
            <p style="text-align:center;color:#b9b3d8;font-size:13px">${ancient ? '远古' : '冒险'} 第 ${floor} 层</p>
            ${win && first ? '<p style="text-align:center;color:#ffd56b;font-size:13px">✨ 首通奖励已翻倍</p>' : ''}
            ${win && floor >= maxFloor ? `<p style="text-align:center;color:#ffd56b;font-size:13px">🏆 已通关最高层 ${maxFloor}，可重复挑战刷资源</p>` : ''}
            ${win ? `<div class="card" style="background:rgba(0,0,0,0.3)">
                <h3>战利品</h3>
                <div style="display:flex;flex-wrap:wrap;gap:8px;color:#ffd56b;font-size:13px">${rw}</div>
            </div>` : '<p style="text-align:center;color:#b9b3d8;font-size:13px">英雄全部阵亡，回去升级再来吧</p>'}
            <div class="row">
                <button class="btn ghost" id="back-btn">返回</button>
                ${hasNext ? '<button class="btn" id="next-floor">下一层</button>' : ''}
                ${win ? '<button class="btn ghost" id="retry-floor">再战一次</button>' : ''}
            </div>
        `);
        modal.querySelector('#back-btn').onclick = () => {
            U.closeModal();
            this.renderHome(root, app, ancient);
        };
        const nf = modal.querySelector('#next-floor');
        if (nf) nf.onclick = () => { U.closeModal(); this.launch(root, app, ancient, floor + 1); };
        const rt = modal.querySelector('#retry-floor');
        if (rt) rt.onclick = () => { U.closeModal(); this.launch(root, app, ancient, floor); };
        // 自动推塔：胜利后自动进入下一层；失败（hasNext=false）则停在这里
        if (win && this.autoTower && hasNext) {
            U.toast(`🤖 自动推塔：进入第 ${floor + 1} 层`);
            setTimeout(() => { U.closeModal(); this.launch(root, app, ancient, floor + 1); }, 800);
        }
    },
};