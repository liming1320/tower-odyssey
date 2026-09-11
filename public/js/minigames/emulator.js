// 经典游戏模拟器：内嵌开源 EmulatorJS 引擎（与 yikm / dos.lol / 80joy 同款技术路线）
// ROM 由管理员在后台（/admin → 模拟器ROM）上传到服务器，玩家端只读列表 + 播放
(function () {
    // 每个资源条例都要自保：不能假设别的脚本已经初始化过这个全局，
    // 否则 index.html 里调整加载顺序就会静默 ReferenceError、整个模块不生效
    window.MiniGames = window.MiniGames || {};

    const CDN = 'https://cdn.emulatorjs.org/stable/data/';

    function coreLabel(id) {
        const map = {
            nes: 'FC / NES 红白机', snes: '超级任天堂 SFC', gb: 'Game Boy / GBC', gba: 'GBA 掌机',
            segaMD: '世嘉 MD', n64: 'N64', psx: 'PS1', dosbox: 'DOS 游戏', arcade: '街机（旧）',
            fbneo: '街机 NeoGeo/CPS', fbalpha2012_cps1: 'CPS1', fbalpha2012_cps2: 'CPS2',
            fbalpha2012_neogeo: 'NeoGeo', mame2003: 'MAME 2003', mame2003_plus: 'MAME 2003+',
        };
        return map[id] || id;
    }
    // 街机族核心：弧机模拟器入口靠它筛选；fbneo 一个核心包圆 NeoGeo + CPS1 + CPS2，是首选
    const ARCADE_CORES = new Set(['arcade', 'fbneo', 'fbalpha2012_cps1', 'fbalpha2012_cps2', 'fbalpha2012_neogeo', 'mame2003', 'mame2003_plus']);
    const PLATFORM_LABEL = { neogeo: 'NeoGeo', cps1: 'CPS1', cps2: 'CPS2', cps3: 'CPS3', igs: 'IGS', other: '其他街机' };
    function platformLabel(p) { return p ? (PLATFORM_LABEL[p] || p) : ''; }
    function fmtSize(n) {
        if (n == null) return '';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
    }

    // ---------- 服务端 API（带玩家令牌） ----------
    function authHeaders(extra) {
        const tk = (typeof localStorage !== 'undefined' && localStorage.getItem('game-token')) || '';
        return Object.assign({ Authorization: 'Bearer ' + tk }, extra || {});
    }
    // 返回 { roms: [...], authError?: true }；未登录（401）时打 authError 标记
    // 注意：401 不是"管理员没上传"，必须明确告知前端处理，否则会误导玩家
    function romList() {
        return fetch('/api/roms', { headers: authHeaders() })
            .then(r => {
                if (r.status === 401) return { _authError: true };
                return r.json().catch(() => ({}));
            })
            .then(d => ({ roms: (d && d.roms) || [], authError: !!(d && d._authError) }))
            .catch(() => ({ roms: [] }));
    }
    function romDownload(id) {
        return fetch('/api/roms/download?id=' + encodeURIComponent(id), { headers: authHeaders() });
    }
    // BIOS 下载：只用一次却被所有街机 ROM 共用，Get 不到就等于 NeoGeo 全黑屏
    function biosDownload(id) {
        return fetch('/api/roms/bios/download?id=' + encodeURIComponent(id), { headers: authHeaders() });
    }
    function biosList() {
        return fetch('/api/roms/bios', { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : Promise.resolve({})))
            .then(d => ({ bios: (d && d.bios) || [], missing: (d && d.missing) || [], admin: !!(d && d.admin) }))
            .catch(() => ({ bios: [], missing: [], admin: false }));
    }

    function tok() {
        try { return (typeof localStorage !== 'undefined' && localStorage.getItem('game-token')) || ''; }
        catch (e) { return ''; }
    }
    function jstr(s) {
        // 进 <script> 前必须转义，否则标题里一个引号就把整段 JS 打断（右键查看源码才看得出问题）
        return JSON.stringify(String(s == null ? '' : s));
    }

    // ---------- 云存档桥接脚本（跑在 iframe 内，与父页面同源，可直接带令牌调 /api/emu/save） ----------
    // 为什么不用 EJS_onSaveState：文档明确写着「设置它会接管并阻止默认存档行为」。
    // 我们反而要保留 EmulatorJS 自己的浏览器存档当兜底，所以只用事件做**观察者**。
    const CLOUD_BRIDGE = [
        '(function(){',
        '  var ROM=__ROM__, TK=__TK__, AUTO=__AUTO__;',
        '  function say(t){ try{ parent.postMessage({__mgEmuSync:t},"*"); }catch(e){} }',
        '  function notify(h,t){ say(h+t+(t?"":"")) }',
        '  function up(kind,bytes){',
        '    if(!bytes||!bytes.byteLength) return Promise.resolve(false);',
        '    return fetch("/api/emu/save?romId="+encodeURIComponent(ROM)+"&kind="+kind+' +
        '      ,{method:"POST",headers:{Authorization:"Bearer "+TK,"Content-Type":"application/octet-stream"},body:bytes})',
        '      .then(function(r){ return r.ok; }).catch(function(){ return false; });',
        '  }',
        '  function down(kind){',
        '    return fetch("/api/emu/save?romId="+encodeURIComponent(ROM)+"&kind="+kind,' +
        '      {headers:{Authorization:"Bearer "+TK}})',
        '      .then(function(r){ return r.ok ? r.arrayBuffer() : null; }).catch(function(){ return null; });',
        '  }',
        '  function delayed(fn,ms){ var t=null; return function(a){ if(t)clearTimeout(t); t=setTimeout(function(){t=null;fn(a);},ms); }; };',
        '  // 游戏内存档（SRAM/记忆卡）才是真正的「进度」，但要限流否则游戏中每帧都在传',
        '  var upSram=delayed(function(d){ up("sram",d).then(function(ok){ if(ok) say("☁ 游戏进度已自动备份"); }); }, 3000);',
        '  function getSram(){',
        '    try{ var gm=window.EJS_emulator&&window.EJS_emulator.gameManager;',
        '      if(gm&&gm.getSaveFile) return gm.getSaveFile();',
        '    }catch(e){} return null;',
        '  }',
        '  function restoreState(){',
        '    return down("state").then(function(ab){',
        '      if(!ab||!ab.byteLength) return false;',
        '      var u8=new Uint8Array(ab);',
        '      try{ if(window.EJS_loadState){ window.EJS_loadState(u8); return true; } }catch(e){}',
        '      try{ var gm=window.EJS_emulator&&window.EJS_emulator.gameManager;',
        '        if(gm&&gm.loadState){ gm.loadState(u8); return true; } }catch(e){}',
        '      return false;',
        '    }).catch(function(){ return false; });',
        '  }',
        '  function restoreSram(){',
        '    return down("sram").then(function(ab){',
        '      if(!ab||!ab.byteLength) return false;',
        '      var u8=new Uint8Array(ab);',
        '      try{ var gm=window.EJS_emulator&&window.EJS_emulator.gameManager;',
        '        if(gm&&gm.loadSaveFiles){ gm.loadSaveFiles(u8); return true; }',
        '        if(gm&&gm.loadSaveFile){ gm.loadSaveFile(u8); return true; }',
        '      }catch(e){} return false;',
        '    }).catch(function(){ return false; });',
        '  }',
        '  function hook(){',
        '    var em=window.EJS_emulator;',
        '    if(!em||em.__mgHooked) return; em.__mgHooked=true;',
        '    try{ em.on("saveState", function(d){ up("state",d).then(function(ok){ say(ok?"☁ 即时存档已上云":"⚠ 云同步失败（本地存档仍在）"); }); }); }catch(e){}',
        '    try{ if(em.enableSaveUpdateEvent) em.enableSaveUpdateEvent();',
        '      else if(em.gameManager&&em.gameManager.enableSaveUpdateEvent) em.gameManager.enableSaveUpdateEvent();',
        '      em.on("saveUpdate", function(d){ upSram(d); }); }catch(e){}',
        '    try{ if(em.gameManager&&em.gameManager.saveSaveFiles){ var _o=em.gameManager.saveSaveFiles.bind(em.gameManager);',
        '      em.gameManager.saveSaveFiles=function(){ try{ upSram(getSram()); }catch(e){} return _o.apply(null,arguments); }; } }catch(e){}',
        '    if(AUTO) setTimeout(function(){ restoreState().then(function(ok){ restoreSram(); say(ok?"☁ 已恢复上次云存档":""); }); }, 1500);',
        '  }',
        '  var iv=setInterval(function(){ if(window.EJS_emulator){ clearInterval(iv); setTimeout(hook,300); } },500);',
        '  setTimeout(function(){ clearInterval(iv); }, 60000);',
        '  window.addEventListener("message", function(e){',
        '    var d=e.data; if(!d||!d.__mgEmuCmd) return;',
        '    if(d.cmd==="restore"){ Promise.all([restoreState(),restoreSram()]).then(function(r){ say(r[0]||r[1]?"☁ 已从云端恢复":"云端暂无存档"); }); }',
        '    else if(d.cmd==="sync"){ Promise.resolve(getSram()).then(function(s){ return up("sram",s); })',
        '      .then(function(ok){ say(ok?"☁ 游戏进度已备份到云端":"⚠ 备份失败"); }); }',
        '    else if(d.cmd==="clear"){ fetch("/api/emu/save?romId="+encodeURIComponent(ROM)+"&kind=state",{method:"DELETE",headers:{Authorization:"Bearer "+TK}})',
        '      .then(function(){ return fetch("/api/emu/save?romId="+encodeURIComponent(ROM)+"&kind=sram",{method:"DELETE",headers:{Authorization:"Bearer "+TK}}); })',
        '      .then(function(){ say("☁ 云端存档已清除"); }); }',
        '  });',
        '})();',
    ].join('\n');

    // ---------- EmulatorJS 播放页（iframe 隔离：每次播放都是全新模拟器实例） ----------
    // opts: { core, url, title, biosUrl, parentUrl, romId, token, autoSync }
    function buildPlayerHtml(opts) {
        const o = opts || {};
        const core = o.core, url = o.url, title = o.title;
        const esc = s => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
        const bridge = CLOUD_BRIDGE
            .replace('__ROM__', jstr(o.romId))
            .replace('__TK__', jstr(o.token))
            .replace('__AUTO__', o.autoSync ? 'true' : 'false');
        return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1">' +
            '<style>html,body{margin:0;height:100%;background:#0a0a14;overflow:hidden}' +
            '#game{width:100%;height:100%}</style></head><body>' +
            '<div id="game"></div>' +
            '<script>' +
            'EJS_player="#game";' +
            'EJS_core=' + jstr(core) + ';' +
            'EJS_gameUrl=' + jstr(url) + ';' +
            'EJS_gameName=' + jstr(title) + ';' +
            'EJS_pathtodata="' + CDN + '";' +
            'EJS_startOnLoaded=true;' +
            // 多线程只支持 psx/mgba/mupen 等少数核心，**arcade 系列开了会直接网络报错**，务必保持 false
            'EJS_threads=false;' +
            'EJS_color="#ffd56b";' +
            'EJS_backgroundColor="#0a0a14";' +
            // 保留默认浏览器存档兜底，同时由下面的桥接脚本镜像到云端
            'EJS_defaultOptions={"save-state-location":"browser"};' +
            (o.biosUrl ? 'EJS_biosUrl=' + jstr(o.biosUrl) + ';' : '') +
            (o.parentUrl ? 'EJS_gameParentUrl=' + jstr(o.parentUrl) + ';' : '') +
            '</' + 'script>' +
            '<script>' + bridge + '</' + 'script>' +
            '<script src="' + CDN + 'loader.js"></' + 'script>' +
            '</body></html>';
    }

    MiniGames.emulator = {
        // 50 关占位：本游戏不走关卡框架，仅为了让清单/审计口径一致
        LEVELS: Array.from({ length: 50 }, (_, i) => ({ name: '自由游玩 ' + (i + 1), desc: '管理员上传的 ROM 全员畅玩' })),
        ENDLESS: { name: '∞ 自由玩', desc: 'ROM 游戏，无限制畅玩' },

        start(container, opts) {
            opts = opts || {};
            let alive = true;
            // 三个 blob URL（主 ROM / BIOS / 父 ROM）都要在退出时回收，否则大 ROM 会驻留内存
            let objectUrl = null, biosUrl = null, parentUrl = null;
            const api = {
                stop() {
                    alive = false;
                    [objectUrl, biosUrl, parentUrl].forEach(u => {
                        if (u && typeof URL !== 'undefined' && URL.revokeObjectURL) {
                            try { URL.revokeObjectURL(u); } catch (e) {}
                        }
                    });
                    objectUrl = biosUrl = parentUrl = null;
                },
            };

            const el = (cls, html) => {
                const d = document.createElement('div');
                d.className = cls;
                if (html != null) d.innerHTML = html;
                return d;
            };

            // ---------- 列表页（玩家只读，支持搜索 / 分类筛选） ----------
            // 筛选状态（工具栏重建时保留）
            let allRoms = [];
            const filters = { q: '', core: 'all', cat: 'all' };
            const CORE_OPTS = [
                ['all', '全部平台'], ['nes', 'FC 红白机'], ['snes', 'SFC'], ['gb', 'GB/GBC'],
                ['gba', 'GBA'], ['segaMD', '世嘉 MD'], ['n64', 'N64'], ['psx', 'PS1'],
                ['dosbox', 'DOS'], ['arcade', '街机（旧）'], ['fbneo', '街机 NeoGeo/CPS'],
                ['fbalpha2012_neogeo', 'NeoGeo'], ['fbalpha2012_cps1', 'CPS1'], ['fbalpha2012_cps2', 'CPS2'],
                ['mame2003_plus', 'MAME 2003+'],
            ];

            function filteredRoms() {
                const q = filters.q.trim().toLowerCase();
                const rank = r => (r.sort > 0 ? r.sort : 1e9);   // sort>0 越小越靠前；0=未设置按上传时间排后面
                return allRoms.filter(r => {
                    if (filters.core !== 'all' && r.core !== filters.core) return false;
                    if (filters.cat !== 'all' && (r.category || 'normal') !== filters.cat) return false;
                    if (q && String(r.name || '').toLowerCase().indexOf(q) < 0) return false;
                    return true;
                }).sort((a, b) => rank(a) - rank(b) || (b.addedAt || 0) - (a.addedAt || 0));
            }

            function renderList(roms, authError) {
                if (!alive) return;
                container.innerHTML = '';
                const wrap = el('emu-wrap');
                if (!opts.arcadeOnly) {
                    wrap.appendChild(el('emu-note',
                        '🕹️ <b>经典模拟器</b>（EmulatorJS 引擎，与 yikm / dos.lol 同款技术）<br>' +
                        '游戏 ROM 由管理员统一上传，<b>所有玩家</b>登录后即可游玩原版。'));
                    wrap.appendChild(el('emu-keys',
                    '<b>⌨ 键位设置（支持自定义）</b><br>' +
                    '打开游戏后画面<b>顶部有「≡ 菜单」图标</b>（三条杠）→ 点 <b>控制设置</b> 即可<br><br>' +
                    '<b>① 玩家 1 / 2 / 3 / 4</b> 切顶标签选玩家<br>' +
                    '<b>② 游戏手柄 / 键盘</b> 切换输入来源（默认在「键盘」标签）<br>' +
                    '<b>③ 每行最右边【设置】按钮</b> → 点一下 → <b>按下新键</b>（键盘/手柄均可）→ 自动保存<br><br>' +
                    '<b>默认键位（FC/NES）</b>：方向键=十字键 · <b>Z=A · X=B · V=选择 · Enter=开始</b><br>' +
                    '<b>Q=L · E=R · 1/2/3=快速存档/读档/换槽</b><br>' +
                    '<b>本地双人</b>：玩家 2 在「玩家 2」标签单独设一套按键，或直接插入手柄自动识别<br>' +
                    '菜单里还有 <b>即时存档 / 读档</b>（Save State / Load State）和<b>全屏</b>'));
                }

                if (authError) {
                    // 401：登录态失效，必须明确告知玩家"重新登录"，而不是"管理员没上传"
                    const box = el('emu-empty');
                    box.innerHTML =
                        '<div style="font-size:14px;color:#ffb37a;margin-bottom:10px">⚠ 登录状态已失效（浏览器缓存被清理 / token 过期）</div>' +
                        '<div style="font-size:12px;color:#9bb0c8;margin-bottom:14px">电脑正常而手机看不到游戏，多半就是这个原因。点击下方按钮退出账号重新登录一次即可恢复。</div>' +
                        '<button class="emu-btn emu-btn-play" id="emu-relogin">⏏ 退出账号 · 重新登录</button>';
                    wrap.appendChild(box);
                    const btn = box.querySelector('#emu-relogin');
                    if (btn) btn.onclick = () => {
                        try { (window.API && API.clearToken) ? API.clearToken() : localStorage.removeItem('game-token'); } catch (e) {}
                        location.reload();
                    };
                    container.appendChild(wrap);
                    return;
                }

                allRoms = roms.slice();
                // 筛选工具栏（仅在有游戏时显示）
                let bar = null;
                if (allRoms.length) {
                    bar = el('emu-toolbar');
                    bar.innerHTML =
                        '<input id="emu-search" placeholder="🔍 搜索游戏名" value="' + String(filters.q).replace(/[<>&"]/g, '') + '">' +
                        '<select id="emu-f-core">' + CORE_OPTS.map(([v, l]) =>
                            '<option value="' + v + '"' + (filters.core === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
                        '<select id="emu-f-cat">' + [
                            ['all', '全部版本'], ['normal', '普通版'], ['invincible', '无敌版'],
                        ].map(([v, l]) => '<option value="' + v + '"' + (filters.cat === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
                        '<span class="emu-toolbar-count" id="emu-count"></span>';
                    wrap.appendChild(bar);
                }
                const listBox = el('emu-list');
                wrap.appendChild(listBox);
                renderRomRows(listBox, bar);

                if (bar) {
                    const search = bar.querySelector('#emu-search');
                    const coreSel = bar.querySelector('#emu-f-core');
                    const catSel = bar.querySelector('#emu-f-cat');
                    search.oninput = () => { filters.q = search.value; renderRomRows(listBox, bar); };
                    coreSel.onchange = () => { filters.core = coreSel.value; renderRomRows(listBox, bar); };
                    catSel.onchange = () => { filters.cat = catSel.value; renderRomRows(listBox, bar); };
                }
                container.appendChild(wrap);
            }

            // 只重渲染 ROM 行（筛选条件变化时不用重建工具栏，保持输入焦点）
            function renderRomRows(listBox, bar) {
                if (!alive) return;
                const roms = filteredRoms();
                const count = bar ? bar.querySelector('#emu-count') : document.getElementById('emu-count');
                if (count) count.textContent = roms.length + ' / ' + allRoms.length + ' 款';
                if (!allRoms.length) {
                    listBox.innerHTML = '';
                    const empty = el('emu-empty', '管理员还没有上传游戏，敬请期待。');
                    listBox.appendChild(empty);
                    return;
                }
                if (!roms.length) {
                    listBox.innerHTML = '';
                    listBox.appendChild(el('emu-empty', '没有匹配的游戏 —— 换个关键词、平台或版本试试。'));
                    return;
                }
                listBox.innerHTML = '';
                const frag = document.createDocumentFragment();
                roms.forEach(rom => {
                    const item = el('emu-item');
                    item.appendChild(el('emu-item-info',
                        '<div class="emu-item-name">' + String(rom.name).replace(/[<>&]/g, '') +
                        (rom.category === 'invincible' ? ' <span class="emu-tag emu-tag-inv">无敌版</span>' : '') + '</div>' +
                        '<div class="emu-item-meta">' + coreLabel(rom.core) + ' · ' + fmtSize(rom.size) + (rom.sort ? ' · 🔝' : '') + '</div>'));
                    const play = document.createElement('button');
                    play.className = 'emu-btn emu-btn-play';
                    play.textContent = '▶ 播放';
                    play.onclick = ev => { ev.stopPropagation(); playRom(rom); };
                    item.appendChild(play);
                    frag.appendChild(item);
                });
                listBox.appendChild(frag);
            }

            // ---------- 播放（鉴权下载 ROM/BIOS/父ROM → blob → EmulatorJS iframe） ----------
            function playRom(rom) {
                if (!alive) return;
                if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
                    container.innerHTML = '<div class="emu-empty">当前环境不支持模拟器播放</div>';
                    return;
                }
                container.innerHTML = '<div class="emu-empty">正在从服务器加载「' + String(rom.name).replace(/[<>&]/g, '') + '」…</div>';
                Promise.resolve()
                    .then(() => Promise.all([
                        romDownload(rom.id),
                        rom.biosId ? biosDownload(rom.biosId) : Promise.resolve(null),
                        rom.parentId ? romDownload(rom.parentId) : Promise.resolve(null),
                    ]))
                    .then(([rr, br, pr]) => {
                        if (!rr.ok) throw new Error('ROM 下载失败（' + rr.status + '）');
                        if (br && !br.ok) throw new Error('BIOS 下载失败（' + br.status + '）—— NeoGeo/IGS 缺 BIOS 会直接黑屏');
                        if (pr && !pr.ok) throw new Error('父 ROM 下载失败（' + pr.status + '）—— 克隆基板必须连同母 ROM 一起加载');
                        return Promise.all([rr.blob(), br ? br.blob() : null, pr ? pr.blob() : null]);
                    })
                    .then(([main, bios, parent]) => {
                        if (!alive) return;
                        [objectUrl, biosUrl, parentUrl].forEach(u => {
                            if (u) { try { URL.revokeObjectURL(u); } catch (e) {} }
                        });
                        objectUrl = URL.createObjectURL(main);
                        biosUrl = bios ? URL.createObjectURL(bios) : null;
                        parentUrl = parent ? URL.createObjectURL(parent) : null;

                        container.innerHTML = '';
                        const play = el('emu-play');
                        const frame = document.createElement('iframe');
                        frame.className = 'emu-frame';
                        frame.setAttribute('srcdoc', buildPlayerHtml({
                            core: rom.core, url: objectUrl, title: rom.name,
                            biosUrl, parentUrl,
                            romId: rom.id, token: tok(), autoSync: cloudSyncOn(),
                        }));
                        const bar = el('emu-playbar');
                        const back = document.createElement('button');
                        back.className = 'emu-btn emu-btn-back';
                        back.textContent = '⏏ 返回列表';
                        back.onclick = refresh;
                        bar.appendChild(back);
                        bar.appendChild(el('emu-playtip',
                            '加载中…首次启动需下载模拟核心（需联网）· 点击画面呼出菜单，⚙ Control Settings 可改 P1/P2 键位、存档、全屏'));
                        bar.appendChild(buildCloudBar(frame));
                        play.appendChild(frame);
                        play.appendChild(bar);
                        container.appendChild(play);
                        rememberPlay(rom.id);
                        listenCloud();
                        if (opts.onScore) { try { opts.onScore(''); } catch (e) {} }
                    })
                    .catch(e => {
                        if (!alive) return;
                        container.innerHTML = '<div class="emu-empty">加载失败：' + (e && e.message ? e.message : '未知错误') + '</div>';
                    });
            }

            // ---------- 云存档 UI（播放器底部工具条） ----------
            // 注意：整条工具 bar 必须用真实 DOM 拼装。
            // 曾在这里图省事用 innerHTML 拼字符串 + querySelector 绑事件，
            // 结果事件全丢（字符串序列化会把 listener 抹掉），开关点了没反应。
            function cloudSyncOn() {
                try { return localStorage.getItem('emu-cloud-sync') !== '0'; } catch (e) { return true; }
            }
            function buildCloudBar(frame) {
                const box = document.createElement('div');
                box.className = 'emu-cloud';
                const mkBtn = (txt, cmd, title) => {
                    const b = document.createElement('button');
                    b.className = 'emu-btn emu-btn-back';
                    b.textContent = txt;
                    if (title) b.title = title;
                    b.onclick = ev => {
                        ev.stopPropagation();
                        const t = container.querySelector('.emu-cloud-tip');
                        if (t) t.textContent = '处理中…';
                        try { frame.contentWindow.postMessage({ __mgEmuCmd: true, cmd }, '*'); } catch (e) {}
                    };
                    return b;
                };
                const toggle = document.createElement('label');
                toggle.className = 'emu-cloud-toggle';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = cloudSyncOn();
                cb.onchange = () => {
                    try { localStorage.setItem('emu-cloud-sync', cb.checked ? '1' : '0'); } catch (e) {}
                    const t = container.querySelector('.emu-cloud-tip');
                    if (t) t.textContent = cb.checked ? '☁ 下次播放起自动云同步' : '☁ 已关闭自动同步（本地存档不受影响）';
                };
                toggle.appendChild(cb);
                toggle.appendChild(document.createTextNode(' 云存档同步'));
                box.appendChild(toggle);
                box.appendChild(mkBtn('⬇ 恢复进度', 'restore', '从云端拉取存档覆盖本机'));
                box.appendChild(mkBtn('⬆ 备份进度', 'sync', '把当前游戏内存档传到云端'));
                box.appendChild(mkBtn('🗑 清空云端', 'clear', '删除该游戏在云端的存档'));
                const tip = el('emu-cloud-tip', cloudSyncOn() ? '☁ 自动同步已开启' : '☁ 自动同步已关闭');
                box.appendChild(tip);
                return box;
            }
            let cloudHooked = false;
            function listenCloud() {
                if (cloudHooked) return;
                cloudHooked = true;
                window.addEventListener('message', ev => {
                    const d = ev.data;
                    if (!d || typeof d.__mgEmuSync !== 'string') return;
                    const t = container.querySelector('.emu-cloud-tip');
                    if (t) t.textContent = d.__mgEmuSync;
                });
            }
            // 最近在玩：本地记录，下次进来置顶
            const RECENT_KEY = 'emu-recent-played';
            function rememberPlay(id) {
                try {
                    let arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
                    arr = [id].concat(arr.filter(x => x !== id)).slice(0, 24);
                    localStorage.setItem(RECENT_KEY, JSON.stringify(arr));
                } catch (e) {}
            }
            function recentPlayed() {
                try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
            }

            function refresh() {
                if (!alive) return;
                romList().then(d => {
                    if (!alive) return;
                    if (d.authError) return renderList([], true);
                    let roms = d.roms.slice();
                    // 街机模拟器入口复用本模块时会传 arcadeOnly + autoPlayId（直接进某款游戏）
                    if (opts.arcadeOnly) roms = roms.filter(r => ARCADE_CORES.has(r.core));
                    renderList(roms, false);
                    if (opts.autoPlayId) {
                        const target = roms.find(r => r.id === opts.autoPlayId);
                        if (target) { playRom(target); return; }
                    }
                    if (opts.arcadeOnly && !roms.length) {
                        const box = container.querySelector('.emu-empty');
                        if (box) box.innerHTML = '还没有街机 ROM。管理员上传时把「平台」选成 <b>fbneo</b> 即可（一个核心通吃 NeoGeo / CPS1 / CPS2）。';
                    }
                });
            }

            refresh();
            return api;
        },
    };
})();
