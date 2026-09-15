// PK32 智慧之光 原版迁移版（PicForm26）：使用 PK32 原版棋盘编码、原生精灵图与存档。
// 美术资源与坐标关系：sheet-7a90dd.png（Native RVA 0x7a90dd）。
// 完整原生状态机见 public/js/minigames/pk32-light-core.js（经 20 段原版演示回放验证）。
(function (global) {
    'use strict';
    var CORE = global.PK32LightCore;
    if (!CORE) { try { CORE = require('./pk32-light-core.js'); } catch (e) {} }
    var SAVE = 'pk32-light-save-picform26-v1';
    // 精灵图：每张 42px，源码矩形 ((c%20)*43, 387 + floor(c/20)*43, 42, 42)，落到 (21+42*gx, 21+42*gy)。
    var ART = '/img/pk32/original/sheet-7a90dd.png';
    var CELL = 42, MARGIN = 21;
    var GW = CORE ? CORE.GRID_W : 16, GH = CORE ? CORE.GRID_H : 9;
    var CW = MARGIN + GW * CELL, CH = MARGIN + GH * CELL;

    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function button(label, fn) { var b = el('button', 'pk32-light-btn', label); b.type = 'button'; b.addEventListener('click', fn); return b; }

    function load() {
        try {
            var s = JSON.parse(localStorage.getItem(SAVE));
            if (!s || !s.levels || typeof s.levels !== 'object' || typeof s.current !== 'number') return null;
            return s;
        } catch (e) { return null; }
    }
    function save(s) { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch (e) {} }

    function start(container, opts) {
        opts = opts || {};
        var stopped = false;
        var levelIdx = 0, level = null, state = null, atlas = null, assetStatus = 'loading';
        var cursor = { x: 0, y: 0 }, cursorOn = false;
        var persist = load() || { current: 0, levels: {} };

        container.innerHTML = '';
        var root = el('section', 'pk32-light');
        var head = el('header', 'pk32-light-head');
        var title = el('h2', '', 'PK32 · 智慧之光');
        head.appendChild(title);
        var status = el('div', 'pk32-light-status');
        var boardWrap = el('div', 'pk32-light-board-wrap');
        var board = el('div', 'pk32-light-board');
        board.dataset.assetSource = 'picform-26';
        board.dataset.assetStatus = 'native-sheet-7a90dd';
        board.dataset.rulesStatus = 'partial';
        boardWrap.appendChild(board);
        var actions = el('div', 'pk32-light-actions');
        var log = el('div', 'pk32-light-log');
        root.append(head, boardWrap, actions, log);
        container.appendChild(root);

        var canvas = el('canvas', 'pk32-light-canvas');
        canvas.width = CW; canvas.height = CH;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', '智慧之光棋盘');

        var style = document.createElement('style');
        style.textContent = '.pk32-light{box-sizing:border-box;width:100%;max-width:760px;margin:auto;padding:12px;background:#1b1b1b;color:#e8e8e8;font-family:system-ui}.pk32-light *{box-sizing:border-box}.pk32-light-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pk32-light-head h2{margin:0;font-size:18px}.pk32-light-status{font-size:14px;line-height:1.5;overflow-wrap:anywhere}.pk32-light-board-wrap{width:100%;max-width:' + CW + 'px;margin:10px auto;overscroll-behavior-x:contain}.pk32-light-board{position:relative;width:100%;aspect-ratio:' + CW + '/' + CH + ';background:#000}.pk32-light-canvas{display:block;width:100%;height:100%;image-rendering:pixelated;cursor:pointer}.pk32-light-cell-hit{position:absolute;border:0;padding:0;background:transparent;min-width:0;min-height:0;touch-action:manipulation}.pk32-light-cell-hit:hover{outline:2px solid #6cf;outline-offset:-2px}.pk32-light-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.pk32-light-actions button,.pk32-light-actions select{padding:8px 10px;min-height:40px;border:1px solid #555;border-radius:2px;background:#2a2a2a;color:#e8e8e8;cursor:pointer}.pk32-light-actions button:disabled{color:#888;cursor:default}.pk32-light-log{min-height:42px;padding:8px;border-top:1px solid #444;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}@media(max-width:480px){.pk32-light{padding:6px}}';
        root.appendChild(style);

        var select = el('select', '', '');
        select.setAttribute('aria-label', '选择关卡');
        var prevBtn = button('上一关', function () { if (levelIdx > 0) { levelIdx -= 1; loadLevel(levelIdx); } });
        var nextBtn = button('下一关', function () { if (levelIdx < LEVELS.length - 1) { levelIdx += 1; loadLevel(levelIdx); } });
        var resetBtn = button('重开本关', function () { resetLevel(); });
        var saveBtn = button('存档', function () { persist.current = levelIdx; persist.levels[levelIdx] = state.grid.slice(); save(persist); note('智慧之光进度已保存'); });
        var replayBtn = button('演示回放', function () { playDemo(); });
        var zoomBtn = button('+', function () { zoomed = !zoomed; render(); });

        function note(t) { status.textContent = t; log.textContent = t; }

        function loadLevelData() {
            // 异步加载关卡数据（缓存）
            if (LEVELS && LEVELS.length) return Promise.resolve();
            return fetch('/data/pk32-light-levels.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
                if (!data) return;
                LEVELS = (data.levels || []).slice();
                DEMOS = data.demos || [];
            }).catch(function () {});
        }
        var LEVELS = [], DEMOS = [];

        function buildFromState() {
            // 若存档里有本关进度则恢复
            var saved = persist.levels[levelIdx];
            if (saved && saved.length === GW * GH) { state = { W: level.W, H: level.H, ox: level.ox, oy: level.oy, grid: saved.slice() }; }
            else { state = CORE.decodeLevel(level); }
        }

        function loadLevel(idx) {
            levelIdx = idx;
            level = LEVELS[idx];
            if (!level) { note('关卡数据缺失'); return; }
            buildFromState();
            cursorOn = false;
            select.value = String(idx);
            render();
            note('智慧之光 · 第 ' + (idx + 1) + ' 关 / ' + LEVELS.length + '（已恢复 ' + (persist.levels[idx] ? '存档' : '初始') + '）');
            if (opts.onScore) opts.onScore('智慧之光 第 ' + (idx + 1) + ' 关');
        }

        function resetLevel() { if (!level) return; state = CORE.decodeLevel(level); delete persist.levels[levelIdx]; render(); note('已重置第 ' + (levelIdx + 1) + ' 关'); }

        function drawBoard() {
            var ctx = canvas.getContext('2d');
            if (!ctx || !atlas || !atlas.complete || !atlas.naturalWidth) return;
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, CW, CH);
            for (var y = 0; y < GH; y++) {
                for (var x = 0; x < GW; x++) {
                    var v = state.grid[y * GW + x];
                    if (v < 0 || v > 59) continue; // 无效格留空
                    var sx = (v % 20) * 43, sy = 387 + Math.floor(v / 20) * 43;
                    ctx.drawImage(atlas, sx, sy, 42, 42, MARGIN + x * CELL, MARGIN + y * CELL, 42, 42);
                }
            }
            if (cursorOn) {
                ctx.strokeStyle = '#6cf'; ctx.lineWidth = 3;
                ctx.strokeRect(MARGIN + cursor.x * CELL + 1, MARGIN + cursor.y * CELL + 1, CELL - 2, CELL - 2);
            }
            // 胜利高亮
            if (CORE.isWin(state)) {
                ctx.fillStyle = 'rgba(60,220,120,0.18)';
                ctx.fillRect(0, 0, CW, CH);
            }
            canvas.dataset.ready = 'true';
        }

        function applyClick(gx, gy) {
            if (stopped || assetStatus !== 'ready') return;
            var ok = CORE.click(state, gx, gy);
            if (!ok) return;
            render();
            if (CORE.isWin(state)) { note('第 ' + (levelIdx + 1) + ' 关完成！可进入下一关或重开挑战。'); }
        }

        function render() {
            board.innerHTML = '';
            board.style.width = zoomed ? (CW * 2) + 'px' : '100%';
            board.appendChild(canvas);
            drawBoard();
            // 透明点击层：按 16x9 网格覆盖按钮
            for (var y = 0; y < GH; y++) {
                for (var x = 0; x < GW; x++) {
                    var v = state.grid[y * GW + x];
                    var hit = el('button', 'pk32-light-cell-hit');
                    hit.type = 'button';
                    hit.style.left = ((MARGIN + x * CELL) / CW * 100) + '%';
                    hit.style.top = ((MARGIN + y * CELL) / CH * 100) + '%';
                    hit.style.width = (CELL / CW * 100) + '%';
                    hit.style.height = (CELL / CH * 100) + '%';
                    hit.setAttribute('aria-label', '格子 ' + (x + 1) + ',' + (y + 1) + (v < 0 ? ' 空' : ' 代码 ' + v));
                    (function (gx, gy) { hit.addEventListener('click', function () { cursor = { x: gx, y: gy }; cursorOn = true; applyClick(gx, gy); }); })(x, y);
                    board.appendChild(hit);
                }
            }
        }

        var zoomed = false;

        function playDemo() {
            var demo = DEMOS.find(function (d) { return d.level === (levelIdx + 1); });
            if (!demo) { note('本关暂无原版演示数据'); return; }
            if (assetStatus !== 'ready') { note('请等待资源加载完成'); return; }
            note('正在回放原版演示（' + demo.clicks.length + ' 步）…');
            resetLevel();
            var i = 0;
            (function step() {
                if (stopped || i >= demo.clicks.length) { if (!stopped) note('演示回放结束。'); return; }
                var g = CORE.blToGrid(state, demo.clicks[i][0], demo.clicks[i][1]);
                cursor = { x: g[0], y: g[1] }; cursorOn = true;
                applyClick(g[0], g[1]);
                i += 1;
                setTimeout(step, 480);
            })();
        }

        // 键盘：方向键移动光标，回车/空格落子
        function onKey(e) {
            if (stopped || assetStatus !== 'ready') return;
            var moved = true;
            if (e.key === 'ArrowLeft') cursor.x = Math.max(0, cursor.x - 1);
            else if (e.key === 'ArrowRight') cursor.x = Math.min(GW - 1, cursor.x + 1);
            else if (e.key === 'ArrowUp') cursor.y = Math.max(0, cursor.y - 1);
            else if (e.key === 'ArrowDown') cursor.y = Math.min(GH - 1, cursor.y + 1);
            else if (e.key === 'Enter' || e.key === ' ') { cursorOn = true; applyClick(cursor.x, cursor.y); e.preventDefault(); return; }
            else moved = false;
            if (moved) { cursorOn = true; e.preventDefault(); render(); }
        }
        document.addEventListener('keydown', onKey);

        atlas = document.createElement('img');
        atlas.onload = function () { if (!stopped) { assetStatus = 'ready'; if (state) { render(); note('智慧之光 · 第 ' + (levelIdx + 1) + ' 关（原版精灵图已加载）'); } } };
        atlas.onerror = function () { if (!stopped) { assetStatus = 'failed'; note('精灵图加载失败：' + ART); } };
        atlas.src = ART;

        // 关卡选择
        function fillSelect() {
            select.innerHTML = '';
            LEVELS.forEach(function (lv, i) { var o = el('option', '', '第 ' + (i + 1) + ' 关 (' + lv.width + '×' + lv.height + ')'); o.value = String(i); select.appendChild(o); });
            select.value = String(levelIdx);
            select.onchange = function () { loadLevel(Number(select.value)); };
        }

        actions.append(prevBtn, nextBtn, select, resetBtn, saveBtn, replayBtn, zoomBtn);

        loadLevelData().then(function () {
            if (stopped) return;
            fillSelect();
            var startIdx = Math.min(Math.max(0, persist.current | 0), Math.max(0, LEVELS.length - 1));
            levelIdx = startIdx;
            loadLevel(startIdx);
        });

        return {
            getState: function () { return { levelIdx: levelIdx, level: level, grid: state ? state.grid.slice() : null, win: state ? CORE.isWin(state) : false }; },
            stop: function () { stopped = true; document.removeEventListener('keydown', onKey); persist.current = levelIdx; if (state) persist.levels[levelIdx] = state.grid.slice(); save(persist); },
            restart: resetLevel,
            destroy: function () { stopped = true; document.removeEventListener('keydown', onKey); persist.current = levelIdx; if (state) persist.levels[levelIdx] = state.grid.slice(); save(persist); container.innerHTML = ''; }
        };
    }

    global.PK32Light = { start: start, CORE: CORE };
}(window));
