// PK32 colored-box variant, recovered from native routines 0x1bf41a0..0x1bf63b3.
(function (root) {
    'use strict';
    const WIDTH = 11, HEIGHT = 9, TILE = 32;
    const DIRECTIONS = { up: [0, -1, 2], down: [0, 1, 0], left: [-1, 0, 3], right: [1, 0, 1] };
    const ATLAS = '/img/pk32/original/sheet-c313c5.png';
    const FRAME_ATLAS = '/img/pk32/original/sheet-d3525b.png';

    function createState(level) {
        if (!Number.isInteger(level.width) || !Number.isInteger(level.height) || level.width < 1 || level.width > WIDTH || level.height < 1 || level.height > HEIGHT || typeof level.cells !== 'string' || level.cells.length !== level.width * level.height || !/^[0-6]+$/.test(level.cells) || level.cells.split('6').length !== 2) throw new Error('Invalid native Sokoban IV board');
        const cells = Array(WIDTH * HEIGHT).fill(0);
        const ox = Math.floor((WIDTH - level.width) / 2), oy = Math.floor((HEIGHT - level.height) / 2);
        let player = -1;
        for (let i = 0; i < level.cells.length; i++) {
            const index = (oy + Math.floor(i / level.width)) * WIDTH + ox + i % level.width;
            const code = Number(level.cells[i]);
            if (code === 6) player = index;
            else cells[index] = code;
        }
        return { cells, player, direction: 0, moves: 0, won: false };
    }

    function neighbor(index, dx, dy) {
        const x = index % WIDTH + dx, y = Math.floor(index / WIDTH) + dy;
        return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT ? y * WIDTH + x : -1;
    }

    function isWon(cells) {
        const counts = [0, 0, 0, 0, 0];
        cells.forEach(code => { if (code > 0 && code < 5) counts[code]++; });
        // Native marks adjacent pairs, not connected components (0x1bf5fa0..0x1bf63b3).
        return counts.some(Boolean) && cells.every((code, index) => code < 1 || code > 4 || counts[code] === 1 || Object.values(DIRECTIONS).some(([dx, dy]) => cells[neighbor(index, dx, dy)] === code));
    }

    function move(state, direction) {
        const delta = DIRECTIONS[direction];
        if (!delta || state.won) return false;
        const [dx, dy, facing] = delta;
        state.direction = facing;
        const next = neighbor(state.player, dx, dy);
        let moved = false;
        if (next >= 0 && state.cells[next] !== 5) {
            const code = state.cells[next];
            const beyond = neighbor(next, dx, dy);
            if (code === 0 || (code >= 1 && code <= 4 && beyond >= 0 && state.cells[beyond] === 0)) {
                if (code) { state.cells[beyond] = code; state.cells[next] = 0; }
                state.player = next; state.moves++; moved = true;
            }
        }
        state.won = isWon(state.cells);
        return moved;
    }

    function start(container, options) {
        options = options || {};
        let alive = true, levels = [], levelIndex = 0, state = null, frame = 0, atlas = null, border = null, history = [];
        let demoTimer = null, demonstrating = false;
        const host = document.createElement('section'); host.className = 'pk32-soko4';
        host.style.cssText = 'max-width:560px;margin:auto;min-width:0;color:#20252b;background:#e9ecef;padding:12px;box-sizing:border-box';
        const toolbar = document.createElement('div'); toolbar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px';
        const select = document.createElement('select'); select.setAttribute('aria-label', '\u63a8\u7bb1\u5b50\u56db\u5173\u5361');
        const message = document.createElement('p'); message.setAttribute('role', 'status'); message.style.cssText = 'margin:8px 0;min-height:24px'; message.textContent = '\u6b63\u5728\u52a0\u8f7d';
        const canvas = document.createElement('canvas'); canvas.width = WIDTH * TILE + 28; canvas.height = HEIGHT * TILE + 28;
        canvas.dataset.role = 'sokoban4-board'; canvas.setAttribute('aria-label', '\u63a8\u7bb1\u5b50\u56db\u68cb\u76d8');
        canvas.style.cssText = 'display:block;width:100%;max-width:380px;height:auto;aspect-ratio:380/316;margin:auto;image-rendering:pixelated';
        const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        const spriteCanvas = document.createElement('canvas'); spriteCanvas.width = spriteCanvas.height = TILE;
        const spriteCtx = spriteCanvas.getContext('2d', { willReadFrequently: true });
        const controls = document.createElement('div'); controls.style.cssText = 'display:grid;grid-template-columns:repeat(3,48px);grid-template-rows:repeat(3,48px);gap:4px;justify-content:center;margin:12px auto 0';
        function button(text, label, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', label); b.title = label; b.style.cssText = 'min-height:44px;min-width:44px'; b.onclick = action; return b; }
        const reset = button('\u21bb', '\u91cd\u5f00\u672c\u5173', () => load(levelIndex));
        const undo = button('\u21b6', '\u64a4\u9500', () => { if (!history.length || !alive) return; state = history.pop(); draw(); });
        const next = button('\u2192', '\u4e0b\u4e00\u5173', () => load((levelIndex + 1) % levels.length));
        const demo = button('\u25b6', '\u539f\u7248\u6f14\u793a', playDemo);
        const victory = document.createElement('dialog'); victory.setAttribute('aria-label', '\u8fc7\u5173');
        victory.style.cssText = 'max-width:calc(100% - 48px);box-sizing:border-box;border:2px solid #888;background:#e9ecef;color:#20252b;padding:16px';
        const congratulations = document.createElement('p'); congratulations.textContent = '\u606d\u559c\uff01\u60a8\u8fc7\u5173\u4e86\uff01';
        victory.append(congratulations, button('\u786e\u5b9a', '\u786e\u5b9a', () => victory.close()));
        toolbar.append(select, reset, undo, demo, next);
        [['up', '\u2191', '\u4e0a', 2, 1], ['left', '\u2190', '\u5de6', 1, 2], ['right', '\u2192', '\u53f3', 3, 2], ['down', '\u2193', '\u4e0b', 2, 3]].forEach(([dir, text, label, x, y]) => {
            const b = button(text, label, () => act(dir)); b.dataset.direction = dir;
            b.style.gridColumn = x; b.style.gridRow = y; controls.appendChild(b);
        });
        host.append(toolbar, message, canvas, controls, victory); container.replaceChildren(host);
        function load(index) {
            if (!alive || !levels[index]) return;
            if (victory.open) victory.close();
            clearTimeout(demoTimer); demoTimer = null; demonstrating = false;
            levelIndex = index; state = createState(levels[index]); history = []; frame = 0;
            select.value = String(index); draw();
        }
        function act(direction) {
            if (!alive || !state || state.won || demonstrating) return;
            const previous = JSON.parse(JSON.stringify(state));
            if (move(state, direction)) history.push(previous);
            draw();
            if (state.won && !victory.open) victory.showModal();
        }
        function playDemo() {
            if (!alive || !levels[levelIndex] || !levels[levelIndex].demo) return;
            load(levelIndex); demonstrating = true; draw();
            const keys = levels[levelIndex].demo.keys; let cursor = 0;
            function step() {
                if (!alive || !demonstrating) return;
                frame = 1 - frame;
                move(state, ['left', 'up', 'right', 'down'][Number(keys[cursor++])]);
                if (cursor === keys.length) { demonstrating = false; demoTimer = null; }
                else demoTimer = setTimeout(step, 600);
                draw();
            }
            demoTimer = setTimeout(step, 600);
        }
        function draw() {
            if (!alive || !state || !atlas) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let x = 14; x < canvas.width - 14; x += 14) {
                const length = Math.min(14, canvas.width - 14 - x);
                ctx.drawImage(border, 14, 0, length, 14, x, 0, length, 14);
                ctx.drawImage(border, 14, 32, length, 14, x, canvas.height - 14, length, 14);
            }
            for (let y = 14; y < canvas.height - 14; y += 14) {
                const length = Math.min(14, canvas.height - 14 - y);
                ctx.drawImage(border, 0, 14, 14, length, 0, y, 14, length);
                ctx.drawImage(border, 185, 14, 14, length, canvas.width - 14, y, 14, length);
            }
            [[0, 0, 0, 0], [185, 0, canvas.width - 14, 0], [0, 32, 0, canvas.height - 14], [185, 32, canvas.width - 14, canvas.height - 14]].forEach(([sx, sy, dx, dy]) => ctx.drawImage(border, sx, sy, 14, 14, dx, dy, 14, 14));
            state.cells.forEach((code, index) => {
                ctx.drawImage(atlas, 677, (code === 0 ? 0 : code === 5 ? 25 : code + 4) * TILE, TILE, TILE, 14 + index % WIDTH * TILE, 14 + Math.floor(index / WIDTH) * TILE, TILE, TILE);
            });
            const x = 14 + state.player % WIDTH * TILE, y = 14 + Math.floor(state.player / WIDTH) * TILE;
            spriteCtx.clearRect(0, 0, TILE, TILE);
            spriteCtx.drawImage(atlas, 283 + frame * TILE, state.direction * TILE, TILE, TILE, 0, 0, TILE, TILE);
            const source = spriteCtx.getImageData(0, 0, TILE, TILE), destination = ctx.getImageData(x, y, TILE, TILE);
            // GDI SRCPAINT combines RGB bits; Canvas source-over is not equivalent.
            for (let i = 0; i < source.data.length; i += 4) {
                destination.data[i] |= source.data[i]; destination.data[i + 1] |= source.data[i + 1]; destination.data[i + 2] |= source.data[i + 2]; destination.data[i + 3] = 255;
            }
            ctx.putImageData(destination, x, y);
            message.textContent = '\u7b2c ' + (levelIndex + 1) + ' / ' + levels.length + ' \u5173' + (state.won ? ' \u00b7 \u8fc7\u5173' : ' \u00b7 ' + state.moves + ' \u6b65');
            canvas.dataset.ready = 'true'; canvas.dataset.player = String(state.player); canvas.dataset.won = String(state.won);
            undo.disabled = !history.length || demonstrating; next.disabled = !levels.length;
            demo.disabled = !levels[levelIndex].demo || demonstrating;
            controls.querySelectorAll('button').forEach(b => { b.disabled = state.won || demonstrating; });
        }
        select.onchange = () => load(Number(select.value));
        function onKey(event) {
            const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
            if (!alive || !dir || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
            event.preventDefault(); act(dir);
        }
        document.addEventListener('keydown', onKey);
        const timer = setInterval(() => { if (alive && state && !state.won && !demonstrating && !document.hidden) { frame = 1 - frame; draw(); } }, 500);
        fetch('/data/pk32-sokoban4-levels.json').then(response => {
            if (!response.ok) throw new Error('Map HTTP ' + response.status);
            return response.json();
        }).then(async data => {
            if (!alive) return;
            const image = new Image(); image.src = ATLAS;
            const frameImage = new Image(); frameImage.src = FRAME_ATLAS;
            await Promise.all([image.decode(), frameImage.decode()]);
            if (!alive) return;
            if (data.version !== 2 || data.levels.length !== 23 || image.naturalWidth !== 709 || image.naturalHeight !== 835) throw new Error('Native data mismatch');
            data.levels.forEach(createState); levels = data.levels; atlas = image; border = frameImage;
            levels.forEach((_, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = '\u7b2c ' + (index + 1) + ' \u5173'; select.appendChild(option); });
            load(Math.max(0, Math.min(levels.length - 1, Number(options.levelIdx) || 0)));
        }).catch(error => { if (alive) { message.textContent = '\u539f\u751f\u8d44\u6e90\u52a0\u8f7d\u5931\u8d25'; host.dataset.error = error.message; } });
        return {
            getState: () => state && JSON.parse(JSON.stringify({ ...state, level: levelIndex, frame, demonstrating })),
            stop() { if (!alive) return; alive = false; clearInterval(timer); clearTimeout(demoTimer); document.removeEventListener('keydown', onKey); if (victory.open) victory.close(); host.remove(); },
            restart: () => load(levelIndex)
        };
    }
    const api = { WIDTH, HEIGHT, ATLAS, FRAME_ATLAS, createState, move, isWon, start };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PK32Sokoban4 = api;
})(typeof window !== 'undefined' ? window : globalThis);
