// 经典游戏模拟器：内嵌开源 EmulatorJS 引擎（与 yikm / dos.lol / 80joy 同款技术路线）
// ROM 由管理员上传到服务器（data/roms/ 磁盘文件），所有登录玩家可见可玩
// 玩家端只读列表 + 播放；导入 / 删除入口仅对管理员账号显示（服务端同样校验权限）
(function () {
    const CDN = 'https://cdn.emulatorjs.org/stable/data/';

    const CORES = [
        { id: 'nes',     label: 'FC / NES 红白机',      exts: ['nes'] },
        { id: 'snes',    label: '超级任天堂 SFC',        exts: ['smc', 'sfc', 'swc'] },
        { id: 'gb',      label: 'Game Boy / GBC',        exts: ['gb', 'gbc'] },
        { id: 'gba',     label: 'GBA 掌机',              exts: ['gba'] },
        { id: 'segaMD',  label: '世嘉 MD',               exts: ['md', 'gen'] },
        { id: 'n64',     label: 'N64（需较新浏览器）',   exts: [] },
        { id: 'psx',     label: 'PS1（需较新浏览器）',   exts: [] },
        { id: 'dosbox',  label: 'DOS 游戏（.zip 整包）', exts: [] },
        { id: 'arcade',  label: '街机（.zip）',          exts: [] },
    ];
    const coreLabel = id => { const c = CORES.find(c => c.id === id); return c ? c.label : id; };

    function detectCore(filename) {
        const m = /\.([a-z0-9]+)$/i.exec(filename || '');
        const ext = m ? m[1].toLowerCase() : '';
        for (const c of CORES) if (c.exts.indexOf(ext) >= 0) return c.id;
        return null;   // zip / 7z / bin 等无法从后缀判断 → 让管理员手动选择核心
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
    // 返回 { roms: [...], admin: bool }；离线 / 未登录时降级为空列表
    function romList() {
        return fetch('/api/roms', { headers: authHeaders() })
            .then(r => r.json())
            .then(d => ({ roms: (d && d.roms) || [], admin: !!(d && d.admin) }))
            .catch(() => ({ roms: [], admin: false }));
    }
    function romUpload(file, core) {
        const q = '?name=' + encodeURIComponent(file.name) + '&core=' + encodeURIComponent(core);
        return readBuffer(file)
            .then(buf => fetch('/api/roms/upload' + q, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/octet-stream' }),
                body: buf,
            }))
            .then(r => r.json());
    }
    function romDelete(id) {
        return fetch('/api/roms/delete', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ id }),
        }).then(r => r.json()).catch(() => ({}));
    }
    function romDownload(id) {
        return fetch('/api/roms/download?id=' + encodeURIComponent(id), { headers: authHeaders() });
    }

    // ---------- 读取文件为 ArrayBuffer（file.arrayBuffer 优先，老浏览器 FileReader） ----------
    function readBuffer(file) {
        if (file.arrayBuffer) return file.arrayBuffer();
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error || new Error('read-fail'));
            fr.readAsArrayBuffer(file);
        });
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
            let isAdmin = false;          // 当前账号是否管理员（由 /api/roms 返回，服务端判定）
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

            // ---------- 列表页（管理员额外有导入区 / 删除键） ----------
            function renderList(roms) {
                if (!alive) return;
                container.innerHTML = '';
                const wrap = el('emu-wrap');
                wrap.appendChild(el('emu-note',
                    '🕹️ <b>经典模拟器</b>（EmulatorJS 引擎，与 yikm / dos.lol 同款技术）<br>' +
                    '游戏 ROM 由管理员统一上传，<b>所有玩家</b>登录后即可游玩原版。<br>' +
                    '<span class="emu-tip">操作：模拟器内 ⚙ 菜单可设置 P1/P2 按键（默认 P1 方向键 + Z/X），支持手柄 · 有即时存/读档和全屏</span>'));

                // 管理员：导入区（点击选择 / 拖拽）
                if (isAdmin) {
                    const drop = el('emu-drop',
                        '📥 点击选择 ROM 文件，或拖拽到此处<br>' +
                        '<span>.nes / .smc / .sfc / .gb / .gbc / .gba / .md / .zip …（zip 需选择模拟核心）· 上传后全员可见</span>');
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.nes,.smc,.sfc,.swc,.gb,.gbc,.gba,.md,.gen,.bin,.zip,.7z';
                    input.multiple = true;
                    input.style.display = 'none';
                    drop.onclick = () => { try { input.click(); } catch (e) {} };
                    input.onchange = () => {
                        if (input.files && input.files.length) handleFiles(Array.prototype.slice.call(input.files));
                        input.value = '';
                    };
                    drop.appendChild(input);
                    wrap.appendChild(drop);
                }

                // ROM 列表
                if (!roms.length) {
                    wrap.appendChild(el('emu-empty', isAdmin
                        ? '还没有游戏。上方导入 ROM 后，所有玩家都能在这里看到。'
                        : '管理员还没有上传游戏，敬请期待。'));
                } else {
                    const list = el('emu-list');
                    roms.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).forEach(rom => {
                        const item = el('emu-item');
                        item.appendChild(el('emu-item-info',
                            '<div class="emu-item-name">' + String(rom.name).replace(/[<>&]/g, '') + '</div>' +
                            '<div class="emu-item-meta">' + coreLabel(rom.core) + ' · ' + fmtSize(rom.size) + (rom.by ? ' · ' + String(rom.by).replace(/[<>&]/g, '') + ' 上传' : '') + '</div>'));
                        const play = document.createElement('button');
                        play.className = 'emu-btn emu-btn-play';
                        play.textContent = '▶ 播放';
                        play.onclick = ev => { ev.stopPropagation(); playRom(rom); };
                        item.appendChild(play);
                        if (isAdmin) {
                            const del = document.createElement('button');
                            del.className = 'emu-btn emu-btn-del';
                            del.textContent = '✕';
                            del.title = '删除';
                            del.onclick = ev => {
                                ev.stopPropagation();
                                try { if (typeof confirm === 'function' && !confirm('删除「' + rom.name + '」？所有玩家将无法再玩到它')) return; } catch (e) {}
                                romDelete(rom.id).then(refresh);
                            };
                            item.appendChild(del);
                        }
                        list.appendChild(item);
                    });
                    wrap.appendChild(list);
                }
                container.appendChild(wrap);
            }

            // ---------- 核心选择（zip 等无法自动判断的文件，仅管理员触发） ----------
            function pickCore(file, onDone) {
                if (!alive) return;
                container.innerHTML = '';
                const wrap = el('emu-wrap');
                wrap.appendChild(el('emu-note', '「' + String(file.name).replace(/[<>&]/g, '') +
                    '」无法从后缀判断机型，请选择模拟核心：<br><span class="emu-tip">FC 游戏选「FC / NES 红白机」；DOS 游戏整包 zip 选「DOS」</span>'));
                const row = el('emu-core-row');
                CORES.forEach(c => {
                    const b = document.createElement('button');
                    b.className = 'emu-core-btn' + (c.id === 'nes' ? ' emu-core-hot' : '');
                    b.textContent = c.label;
                    b.onclick = () => onDone(c.id);
                    row.appendChild(b);
                });
                wrap.appendChild(row);
                const back = document.createElement('button');
                back.className = 'emu-btn emu-btn-back';
                back.textContent = '‹ 取消';
                back.onclick = refresh;
                wrap.appendChild(back);
                container.appendChild(wrap);
            }

            // ---------- 导入（上传到服务器） ----------
            function handleFiles(files) {
                let pending = files.slice();
                const next = () => {
                    if (!alive) return;
                    if (!pending.length) return refresh();
                    const file = pending.shift();
                    const core = detectCore(file.name);
                    if (!core) return pickCore(file, coreId => romUpload(file, coreId).then(next));
                    romUpload(file, core).then(next);
                };
                next();
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
                    const tip = el('emu-playtip', '加载中…首次启动需下载模拟核心（需联网）· ⚙ 菜单可设双人按键 / 存档 / 全屏');
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
                romList().then(d => {
                    if (!alive) return;
                    isAdmin = !!d.admin;
                    renderList(d.roms);
                });
            }

            // 拖放支持（容器级，仅管理员会看到导入区，但拖放对管理员随时可用）
            container.addEventListener('dragover', e => { e.preventDefault(); });
            container.addEventListener('drop', e => {
                e.preventDefault();
                if (!isAdmin) return;
                const fs = e && e.dataTransfer && e.dataTransfer.files;
                if (fs && fs.length) handleFiles(Array.prototype.slice.call(fs));
            });

            refresh();
            return api;
        },
    };
})();
