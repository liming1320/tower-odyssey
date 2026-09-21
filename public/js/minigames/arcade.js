// 街机模拟器：独立全屏入口（设置页 tile → openArcade）
//
// 与「经典模拟器」是**两个入口但共用一套后端**（ROM 库 / BIOS / 云存档），
// 差别只在于：这里只显示街机族核心（fbneo 等），并且把 BIOS 缺失提前暴露出来。
//
// 为什么街机必须单独拎出来：
//   ① NeoGeo 必须有 neogeo.zip、IGS 必须有 pgm.zip，缺了就是纯黑屏且**没有任何报错**，
//      混在几十款 FC/GBA 里根本不会被发现；单独一个入口能集中警告。
//   ② 街机 ROM 有「母 ROM / 克隆基板」的关系（parentId），只有这里用得着。
//   ③ 街机 ROM 大多是 zip 且几十 MB，玩家期望的筛选维度是厂商/年代/基板，和掌机完全不同。
(function () {
    // 同上：自保初始化，不依赖 index.html 的加载顺序
    window.MiniGames = window.MiniGames || {};
    var MiniGames = window.MiniGames;

    const PLATFORMS = {
        neogeo: 'NeoGeo', cps1: 'CPS1', cps2: 'CPS2', cps3: 'CPS3', igs: 'IGS', other: '其他街机',
    };
    const ARCADE_CORES = new Set(['arcade', 'fbneo', 'fbalpha2012_cps1', 'fbalpha2012_cps2', 'fbalpha2012_neogeo', 'mame2003', 'mame2003_plus']);
    // 各基板需要的 BIOS 文件名 —— 由服务端 GET /api/roms/bios 的 missing 决定要不要示警
    const BIOS_FOR_PLATFORM = { neogeo: 'neogeo.zip', cps3: 'cps3.zip', igs: 'pgm.zip' };

    function authHeaders() {
        const tk = (typeof localStorage !== 'undefined' && localStorage.getItem('game-token')) || '';
        return { Authorization: 'Bearer ' + tk };
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
    function fmtSize(n) {
        if (n == null) return '';
        if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
    }
    function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    // 直接复用经典模拟器已经跑通的播放链路（BIOS / 父 ROM / 云存档桥接都在那里面），
    // 这里只做筛选与提示，避免两套几乎一样的实现各自腐烂。
    // 把 settings.js 透传下来的回调（onScore / onLayerChange）一并转发，否则顶栏「返回」在街机播放页
    // 会直接关掉整个模拟器、且返回按钮文案不会随层切换。
    function playViaEmulator(container, rom, opts) {
        const emu = window.MiniGames && window.MiniGames.emulator;
        if (!emu) throw new Error('未加载到模拟器模块');
        return emu.start(container, Object.assign({ arcadeOnly: true, autoPlayId: rom.id }, opts || {}));
    }

    MiniGames.arcade = {
        LEVELS: Array.from({ length: 50 }, (_, i) => ({ name: '自由游玩 ' + (i + 1), desc: '街机 ROM 全员畅玩' })),
        ENDLESS: { name: '∞ 自由玩', desc: '街机游戏，无限制畅玩' },

        start(container, opts) {
            opts = opts || {};
            let alive = true;
            let inst = null;
            const api = {
                stop() {
                    alive = false;
                    if (inst && inst.stop) { try { inst.stop(); } catch (e) {} }
                    inst = null;
                },
            };
            const el = (cls, html) => {
                const d = document.createElement('div');
                d.className = cls;
                if (html != null) d.innerHTML = html;
                return d;
            };

            const filters = { q: '', platform: 'all', decade: 'all' };
            let allRoms = [], missingBios = [];
            let recent = [];
            try { recent = JSON.parse(lsGet('emu-recent-played', '[]')); } catch (e) { recent = []; }

            function biosMissingFor(rom) {
                const need = BIOS_FOR_PLATFORM[rom.platform];
                if (!need) return '';
                return missingBios.some(m => m.file === need) ? need : '';
            }

            function filtered() {
                const q = filters.q.trim().toLowerCase();
                return allRoms.filter(r => {
                    if (filters.platform !== 'all' && (r.platform || 'other') !== filters.platform) return false;
                    if (filters.decade !== 'all') {
                        const y = parseInt(r.year, 10);
                        if (!y) return false;
                        const d = parseInt(filters.decade, 10);
                        if (Math.floor(y / 10) * 10 !== d) return false;
                    }
                    // 搜索范围：显示名 + 中文名 + 英文原名 + 短名 + 别名（玩家常只记得「饿狼」或 kof98）
                    if (q) {
                        const hay = [r.name, r.titleZh, r.titleEn, r.shortName]
                            .concat(Array.isArray(r.aliases) ? r.aliases : [])
                            .filter(Boolean).join(' ').toLowerCase();
                        if (hay.indexOf(q) < 0
                            && String(r.maker || '').toLowerCase().indexOf(q) < 0
                            && String(r.genre || '').toLowerCase().indexOf(q) < 0) return false;
                    }
                    return true;
                }).sort((a, b) => {
                    // 最近在玩置顶，其余按 sort → 更新时间
                    const ra = recent.indexOf(a.id), rb = recent.indexOf(b.id);
                    const pa = ra < 0 ? 9999 : ra, pb = rb < 0 ? 9999 : rb;
                    if (pa !== pb) return pa - pb;
                    const sa = a.sort > 0 ? a.sort : 1e9, sb = b.sort > 0 ? b.sort : 1e9;
                    return sa - sb || (b.addedAt || 0) - (a.addedAt || 0);
                });
            }

            function renderRows(listBox, countEl) {
                if (!alive) return;
                const roms = filtered();
                if (countEl) countEl.textContent = roms.length + ' / ' + allRoms.length + ' 款';
                listBox.innerHTML = '';
                if (!allRoms.length) {
                    listBox.appendChild(el('emu-empty',
                        '还没有街机 ROM。<br>管理员在后台上传时把「平台」选成 <b>fbneo</b>（一个核心通吃 NeoGeo / CPS1 / CPS2）即可。'));
                    return;
                }
                if (!roms.length) {
                    listBox.appendChild(el('emu-empty', '没有匹配的游戏 —— 换个关键词或基板试试。'));
                    return;
                }
                const frag = document.createDocumentFragment();
                roms.forEach(rom => {
                    const item = el('emu-item');
                    const cover = rom.cover || '🕹️';
                    const plat = rom.platform || 'other';
                    const miss = biosMissingFor(rom);
                    // 英文名与短名作为副标题：玩家搜「kof98」/「Fatal Fury」也能找到
                    const sub = [rom.titleEn && rom.titleEn !== rom.name ? rom.titleEn : '', rom.shortName]
                        .filter(Boolean).join(' · ');
                    const meta = [
                        PLATFORMS[plat] || plat,
                        rom.year || '', rom.maker || '', rom.genre || '',
                        fmtSize(rom.size),
                        rom.parentId ? '需母 ROM' : '',
                    ].filter(Boolean).join(' · ');
                    item.appendChild(el('emu-item-info',
                        '<div class="emu-item-name"><span style="margin-right:6px">' + esc(cover) + '</span>' + esc(rom.name) +
                        '<span class="emu-plat ' + esc(plat) + '">' + esc(PLATFORMS[plat] || plat) + '</span>' +
                        (rom.category === 'invincible' ? ' <span class="emu-tag emu-tag-inv">无敌版</span>' : '') + '</div>' +
                        (sub ? '<div class="emu-item-meta" style="opacity:.7">' + esc(sub) + '</div>' : '') +
                        '<div class="emu-item-meta">' + esc(meta) + '</div>' +
                        (miss ? '<div class="emu-warn">⚠ 缺 BIOS ' + esc(miss) + '，该基板游戏会黑屏</div>' : '')));
                    const play = document.createElement('button');
                    play.className = 'emu-btn emu-btn-play';
                    play.textContent = miss ? '⚠ 播放' : '▶ 播放';
                    play.onclick = ev => { ev.stopPropagation(); startRom(rom); };
                    item.appendChild(play);
                    frag.appendChild(item);
                });
                listBox.appendChild(frag);
            }

            function renderList() {
                if (!alive) return;
                container.innerHTML = '';
                const wrap = el('emu-wrap');
                wrap.appendChild(el('emu-note',
                    '🕹️ <b>街机模拟器</b>（EmulatorJS + fbneo 核心）<br>' +
                    '<b>一个 fbneo 核心同时覆盖 NeoGeo / CPS1 / CPS2</b>，上传时选它最省事。'));

                if (missingBios.length) {
                    const need = missingBios.map(m => m.file).join('、');
                    wrap.appendChild(el('emu-banner warn',
                        '⚠ <b>缺少 BIOS：' + esc(need) + '</b><br>' +
                        '街机不同于家用机，<b>NeoGeo 必须有 neogeo.zip、IGS(PGM) 必须有 pgm.zip</b>，' +
                        '缺了不会报错，只会<b>黑屏转不出来</b>。请管理员在后台「模拟器 ROM → BIOS 管理」各上传一次即可，全体共用。'));
                }
                wrap.appendChild(el('emu-banner info',
                    '☁ <b>存档已上云</b>：开局自动恢复上次进度，游戏中自动备份。' +
                    '播放器底部也有「⬇ 恢复 / ⬆ 备份 / 🗑 清空」手动开关，换设备或清缓存都不会丢档。'));

                let bar = null;
                if (allRoms.length) {
                    bar = el('emu-toolbar');
                    const platOpts = [['all', '全部基板']].concat(
                        Object.keys(PLATFORMS).filter(p => allRoms.some(r => (r.platform || 'other') === p))
                            .map(p => [p, PLATFORMS[p]]));
                    const decades = Array.from(new Set(allRoms.map(r => parseInt(r.year, 10)).filter(y => y).map(y => Math.floor(y / 10) * 10))).sort((a, b) => b - a);
                    bar.innerHTML =
                        '<input id="arc-search" placeholder="🔍 搜游戏名 / 厂商 / 类型" value="' + esc(filters.q) + '">' +
                        '<select id="arc-plat">' + platOpts.map(([v, l]) =>
                            '<option value="' + v + '"' + (filters.platform === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
                        '<select id="arc-decade">' + [['all', '全部年代']].concat(decades.map(d => [String(d), d + 's'])).map(([v, l]) =>
                            '<option value="' + v + '"' + (filters.decade === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
                        '<span class="emu-toolbar-count" id="arc-count"></span>';
                    wrap.appendChild(bar);
                }
                const listBox = el('emu-list');
                wrap.appendChild(listBox);
                renderRows(listBox, bar ? bar.querySelector('#arc-count') : null);

                if (bar) {
                    const q = bar.querySelector('#arc-search');
                    const p = bar.querySelector('#arc-plat');
                    const d = bar.querySelector('#arc-decade');
                    q.oninput = () => { filters.q = q.value; renderRows(listBox, bar.querySelector('#arc-count')); };
                    p.onchange = () => { filters.platform = p.value; renderRows(listBox, bar.querySelector('#arc-count')); };
                    d.onchange = () => { filters.decade = d.value; renderRows(listBox, bar.querySelector('#arc-count')); };
                }
                container.appendChild(wrap);
            }

            function startRom(rom) {
                if (!alive) return;
                try {
                    inst = playViaEmulator(container, rom, opts);
                } catch (e) {
                    container.innerHTML = '<div class="emu-empty">启动失败：' + esc(e.message) + '</div>';
                }
            }

            function load() {
                if (!alive) return;
                Promise.all([
                    fetch('/api/roms', { headers: authHeaders() })
                        .then(r => (r.status === 401 ? { _authError: true } : r.json().catch(() => ({})))),
                    fetch('/api/roms/bios', { headers: authHeaders() }).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
                ]).then(([d, b]) => {
                    if (!alive) return;
                    if (d && d._authError) {
                        container.innerHTML = '<div class="emu-empty">⚠ 登录状态已失效，请退出账号重新登录一次。</div>';
                        return;
                    }
                    allRoms = ((d && d.roms) || []).filter(r => ARCADE_CORES.has(r.core));
                    missingBios = (b && b.missing) || [];
                    // 后端还没标 platform 时，按 core 兜个标签，免得列表全显示「其他街机」
                    allRoms.forEach(r => {
                        if (!r.platform) {
                            if (r.core === 'fbalpha2012_neogeo') r.platform = 'neogeo';
                            else if (r.core === 'fbalpha2012_cps1') r.platform = 'cps1';
                            else if (r.core === 'fbalpha2012_cps2') r.platform = 'cps2';
                            else r.platform = 'other';
                        }
                    });
                    renderList();
                    if (opts.autoPlayId) {
                        const t = allRoms.find(r => r.id === opts.autoPlayId);
                        if (t) startRom(t);
                    }
                }).catch(e => {
                    if (alive) container.innerHTML = '<div class="emu-empty">加载失败：' + esc(e.message) + '</div>';
                });
            }

            load();
            // 顶栏「返回」委托给内部 emulator 实例：播放层 → 退回列表层（返回 true 阻止外层关闭）；
            // 列表层（含街机自身列表、或 emulator 列表层）→ 返回 false，由 settings.js 关闭回设置页。
            api.back = function () {
                if (inst && typeof inst.back === 'function') return inst.back();
                return false;
            };
            return api;
        },
    };
})();
