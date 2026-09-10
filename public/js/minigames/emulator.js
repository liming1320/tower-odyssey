// 经典游戏模拟器：内嵌开源 EmulatorJS 引擎（与 yikm / dos.lol / 80joy 同款技术路线）
// ROM 由管理员在后台（/admin → 模拟器ROM）上传到服务器，玩家端只读列表 + 播放
(function () {
    const CDN = 'https://cdn.emulatorjs.org/stable/data/';

    function coreLabel(id) {
        const map = {
            nes: 'FC / NES 红白机', snes: '超级任天堂 SFC', gb: 'Game Boy / GBC', gba: 'GBA 掌机',
            segaMD: '世嘉 MD', n64: 'N64', psx: 'PS1', dosbox: 'DOS 游戏', arcade: '街机',
        };
        return map[id] || id;
    }
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
    // 返回 { roms: [...] }；离线 / 未登录时降级为空列表
    function romList() {
        return fetch('/api/roms', { headers: authHeaders() })
            .then(r => r.json())
            .then(d => ({ roms: (d && d.roms) || [] }))
            .catch(() => ({ roms: [] }));
    }
    function romDownload(id) {
        return fetch('/api/roms/download?id=' + encodeURIComponent(id), { headers: authHeaders() });
    }

    // ---------- EmulatorJS 播放页（iframe 隔离：每次播放都是全新模拟器实例） ----------
    function buildPlayerHtml(core, url, title) {
        const safeTitle = String(title || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
        return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1">' +
            '<style>html,body{margin:0;height:100%;background:#0a0a14;overflow:hidden}' +
            '#game{width:100%;height:100%}</style></head><body>' +
            '<div id="game"></div>' +
            '<script>' +
            'EJS_player="#game";' +
            'EJS_core="' + core + '";' +
            'EJS_gameUrl="' + url + '";' +
            'EJS_gameName="' + safeTitle + '";' +
            'EJS_pathtodata="' + CDN + '";' +
            'EJS_startOnLoaded=true;' +
            'EJS_threads=false;' +
            'EJS_color="#ffd56b";' +
            'EJS_backgroundColor="#0a0a14";' +
            'EJS_defaultOptions={"save-state-location":"browser"};' +
            '</' + 'script>' +
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
            let objectUrl = null;
            const api = {
                stop() {
                    alive = false;
                    if (objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
                        try { URL.revokeObjectURL(objectUrl); } catch (e) {}
                    }
                    objectUrl = null;
                },
            };

            const el = (cls, html) => {
                const d = document.createElement('div');
                d.className = cls;
                if (html != null) d.innerHTML = html;
                return d;
            };

            // ---------- 列表页（玩家只读） ----------
            function renderList(roms) {
                if (!alive) return;
                container.innerHTML = '';
                const wrap = el('emu-wrap');
                wrap.appendChild(el('emu-note',
                    '🕹️ <b>经典模拟器</b>（EmulatorJS 引擎，与 yikm / dos.lol 同款技术）<br>' +
                    '游戏 ROM 由管理员统一上传，<b>所有玩家</b>登录后即可游玩原版。'));
                wrap.appendChild(el('emu-keys',
                    '<b>⌨ 键位与操作</b>（支持自定义）<br>' +
                    '① 打开游戏后<b>点击画面中央</b>，底部弹出模拟器菜单栏<br>' +
                    '② 点 <b>⚙ 设置 → Control Settings（控制设置）</b> → 选「玩家 1」或「玩家 2」<br>' +
                    '③ 点击要改的按键 → <b>按下新按键</b>（键盘 / 手柄都可以）→ 点 Save 保存<br>' +
                    '④ 默认键位（FC 类）：P1 方向键=十字键 · <b>Z / X = A / B</b> · Enter=开始 · Shift=选择<br>' +
                    '⑤ 本地双人：给「玩家 2」单独设一套按键，或直接插手柄自动识别；<br>' +
                    '　　模拟器菜单里还有 <b>即时存档 / 读档</b>（Save State / Load State）和 <b>全屏</b>'));

                if (!roms.length) {
                    wrap.appendChild(el('emu-empty', '管理员还没有上传游戏，敬请期待。'));
                } else {
                    const list = el('emu-list');
                    roms.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).forEach(rom => {
                        const item = el('emu-item');
                        item.appendChild(el('emu-item-info',
                            '<div class="emu-item-name">' + String(rom.name).replace(/[<>&]/g, '') + '</div>' +
                            '<div class="emu-item-meta">' + coreLabel(rom.core) + ' · ' + fmtSize(rom.size) + '</div>'));
                        const play = document.createElement('button');
                        play.className = 'emu-btn emu-btn-play';
                        play.textContent = '▶ 播放';
                        play.onclick = ev => { ev.stopPropagation(); playRom(rom); };
                        item.appendChild(play);
                        list.appendChild(item);
                    });
                    wrap.appendChild(list);
                }
                container.appendChild(wrap);
            }

            // ---------- 播放（鉴权下载 → blob → EmulatorJS） ----------
            function playRom(rom) {
                if (!alive) return;
                if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
                    container.innerHTML = '<div class="emu-empty">当前环境不支持模拟器播放</div>';
                    return;
                }
                container.innerHTML = '<div class="emu-empty">正在从服务器加载「' + String(rom.name).replace(/[<>&]/g, '') + '」…</div>';
                romDownload(rom.id).then(r => {
                    if (!r.ok) throw new Error('下载失败（' + r.status + '）');
                    return r.blob();
                }).then(blob => {
                    if (!alive) return;
                    if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (e) {} }
                    objectUrl = URL.createObjectURL(blob);
                    container.innerHTML = '';
                    const play = el('emu-play');
                    const frame = document.createElement('iframe');
                    frame.className = 'emu-frame';
                    frame.setAttribute('srcdoc', buildPlayerHtml(rom.core, objectUrl, rom.name));
                    const bar = el('emu-playbar');
                    const back = document.createElement('button');
                    back.className = 'emu-btn emu-btn-back';
                    back.textContent = '⏏ 返回列表';
                    back.onclick = refresh;
                    const tip = el('emu-playtip', '加载中…首次启动需下载模拟核心（需联网）· 点击画面呼出菜单，⚙ Control Settings 可改 P1/P2 键位、存档、全屏');
                    bar.appendChild(back);
                    bar.appendChild(tip);
                    play.appendChild(frame);
                    play.appendChild(bar);
                    container.appendChild(play);
                    if (opts.onScore) { try { opts.onScore(''); } catch (e) {} }
                }).catch(e => {
                    if (!alive) return;
                    container.innerHTML = '<div class="emu-empty">加载失败：' + (e && e.message ? e.message : '未知错误') + '</div>';
                });
            }

            function refresh() {
                if (!alive) return;
                romList().then(d => { if (alive) renderList(d.roms); });
            }

            refresh();
            return api;
        },
    };
})();
