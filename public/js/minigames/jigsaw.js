// 拼图：支持导入本地图片、自选 3×3~8×8 切块数，拖拽吸附拼合
window.MiniGames = window.MiniGames || {};
(function () {
    const SRC = 360; // 源图边长
    const NAMES = ['小试拼图', '图案进阶', '碎片风暴', '拼图大师'];
    const lv = [];
    for (let i = 0; i < 50; i++) {
        const n = 3 + Math.min(5, Math.floor(i / 9)); // 3~8
        lv.push({ name: NAMES[i % NAMES.length] + ' ' + (Math.floor(i / NAMES.length) + 1), desc: `默认 ${n}×${n} = ${n * n} 块 · 可在游戏内改块数/换图` });
    }

    MiniGames.jigsaw = {
        LEVELS: lv,
        start(container, opts) {
            const idx = opts.levelIdx != null && opts.levelIdx >= 0 ? opts.levelIdx : 0;
            const defN = 3 + Math.min(5, Math.floor(idx / 10));
            let N = defN, over = false, t0 = Date.now();
            let srcCanvas = null, pieces = [], locked = 0;

            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px;overflow:auto;';

            // ---- 工具栏：导入图片 / 块数选择 ----
            const bar = document.createElement('div');
            bar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;';
            const fileBtn = document.createElement('button');
            fileBtn.className = 'btn ghost small'; fileBtn.textContent = '🖼️ 导入图片';
            const fileInput = document.createElement('input');
            fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
            fileBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => {
                const f = fileInput.files && fileInput.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                    const img = new Image();
                    img.onload = () => {
                        srcCanvas = document.createElement('canvas');
                        srcCanvas.width = SRC; srcCanvas.height = SRC;
                        const c2 = srcCanvas.getContext('2d');
                        // 居中裁成方形
                        const s = Math.min(img.width, img.height);
                        c2.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, SRC, SRC);
                        build();
                        MG.toast && MG.toast(container, '已载入你的图片！');
                    };
                    img.src = reader.result;
                };
                reader.readAsDataURL(f);
                fileInput.value = '';
            });
            const selLabel = document.createElement('span');
            selLabel.style.cssText = 'font-size:12px;color:#9c96b8;';
            selLabel.textContent = '切块：';
            const sel = document.createElement('select');
            sel.className = 'btn ghost small';
            sel.style.cssText = 'height:32px;padding:0 8px;';
            for (let n = 3; n <= 8; n++) {
                const o = document.createElement('option');
                o.value = n; o.textContent = `${n}×${n}（${n * n} 块）`;
                if (n === defN) o.selected = true;
                sel.appendChild(o);
            }
            sel.addEventListener('change', () => { N = parseInt(sel.value, 10) || defN; build(); });
            bar.appendChild(fileBtn); bar.appendChild(fileInput);
            bar.appendChild(selLabel); bar.appendChild(sel);

            // ---- 拼图区 ----
            const boardWrap = document.createElement('div');
            boardWrap.style.cssText = 'position:relative;flex:none;';
            const BOARD = Math.min(container.clientWidth - 90 || 400, window.innerHeight - 190 || 500, 470);
            boardWrap.style.width = BOARD + 'px'; boardWrap.style.height = BOARD + 'px';

            // 底板凹槽
            const slotLayer = document.createElement('div');
            slotLayer.style.cssText = 'position:absolute;inset:0;border-radius:10px;background:rgba(18,22,44,.6);box-shadow:inset 0 0 24px rgba(0,0,0,.5);';
            boardWrap.appendChild(slotLayer);
            container.appendChild(wrap);
            wrap.appendChild(bar); wrap.appendChild(boardWrap);

            // 默认图：程序化画一张「日出宝塔」
            function defaultSrc() {
                const c = document.createElement('canvas');
                c.width = SRC; c.height = SRC;
                const g2 = c.getContext('2d');
                const sky = g2.createLinearGradient(0, 0, 0, SRC);
                sky.addColorStop(0, '#2b3a67'); sky.addColorStop(0.6, '#e8734a'); sky.addColorStop(1, '#f7c873');
                g2.fillStyle = sky; g2.fillRect(0, 0, SRC, SRC);
                g2.fillStyle = '#ffd56b'; g2.beginPath(); g2.arc(SRC * 0.7, SRC * 0.3, 36, 0, Math.PI * 2); g2.fill();
                g2.fillStyle = '#1d2a4a'; // 群山
                g2.beginPath(); g2.moveTo(0, SRC * 0.72); g2.lineTo(SRC * 0.3, SRC * 0.45); g2.lineTo(SRC * 0.62, SRC * 0.72); g2.closePath(); g2.fill();
                g2.beginPath(); g2.moveTo(SRC * 0.4, SRC * 0.78); g2.lineTo(SRC * 0.75, SRC * 0.5); g2.lineTo(SRC, SRC * 0.78); g2.closePath(); g2.fill();
                g2.fillStyle = '#0f1830'; // 宝塔剪影
                g2.fillRect(SRC * 0.12, SRC * 0.5, 26, SRC * 0.45);
                for (let k = 0; k < 4; k++) {
                    g2.fillRect(SRC * 0.06, SRC * (0.52 + k * 0.11), 38, 7);
                }
                g2.fillStyle = '#101a33'; g2.fillRect(0, SRC * 0.86, SRC, SRC * 0.14);
                return c;
            }

            function build() {
                boardWrap.querySelectorAll('.mgy-piece,.mgy-slot').forEach(e => e.remove());
                pieces = []; locked = 0; t0 = Date.now();
                const PW = BOARD / N;
                if (!srcCanvas) srcCanvas = defaultSrc();
                // 凹槽底纹
                for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
                    const slot = document.createElement('div');
                    slot.className = 'mgy-slot';
                    slot.style.cssText = `position:absolute;left:${c * PW}px;top:${r * PW}px;width:${PW}px;height:${PW}px;`
                        + `border:1px dashed rgba(255,255,255,.12);box-sizing:border-box;`;
                    boardWrap.appendChild(slot);
                }
                // 碎片
                for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
                    const pc = document.createElement('canvas');
                    pc.className = 'mgy-piece';
                    pc.width = Math.round(PW); pc.height = Math.round(PW);
                    pc.getContext('2d').drawImage(srcCanvas, c * (SRC / N), r * (SRC / N), SRC / N, SRC / N, 0, 0, pc.width, pc.height);
                    pc.style.cssText = `position:absolute;width:${PW}px;height:${PW}px;cursor:grab;touch-action:none;`
                        + `box-shadow:0 2px 8px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.25);box-sizing:border-box;border-radius:2px;`;
                    const home = { x: c * PW, y: r * PW };
                    // 初始散布在底板内部，且至少离家 1.5 格
                    const scatter = scatterPos(home, PW);
                    place(pc, scatter.x, scatter.y);
                    boardWrap.appendChild(pc);
                    const item = { el: pc, home, x: scatter.x, y: scatter.y, locked: false };
                    dragify(item);
                    pieces.push(item);
                }
                opts.onScore && opts.onScore(`已归位 0/${N * N}`);
            }
            function scatterPos(home, PW) {
                let x = 0, y = 0;
                for (let t = 0; t < 60; t++) {
                    x = Math.random() * Math.max(1, BOARD - PW);
                    y = Math.random() * Math.max(1, BOARD - PW);
                    if (Math.hypot(x - home.x, y - home.y) >= PW * 1.5) break;
                }
                return { x, y };
            }
            function place(pc, x, y) { pc.style.left = x + 'px'; pc.style.top = y + 'px'; }
            function dragify(item) {
                const el = item.el;
                let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
                el.addEventListener('pointerdown', e => {
                    if (item.locked || over) return;
                    dragging = true; el.setPointerCapture && el.setPointerCapture(e.pointerId);
                    sx = e.clientX; sy = e.clientY; ox = item.x; oy = item.y;
                    el.style.zIndex = 99; el.style.cursor = 'grabbing';
                });
                el.addEventListener('pointermove', e => {
                    if (!dragging) return;
                    item.x = ox + e.clientX - sx; item.y = oy + e.clientY - sy;
                    place(el, item.x, item.y);
                });
                const up = () => {
                    if (!dragging) return;
                    dragging = false; el.style.cursor = 'grab';
                    const PW = BOARD / N;
                    const tol = Math.max(16, PW * 0.3);
                    if (Math.hypot(item.x - item.home.x, item.y - item.home.y) < tol) {
                        item.locked = true; item.x = item.home.x; item.y = item.home.y;
                        place(el, item.x, item.y);
                        el.style.zIndex = 2; el.style.pointerEvents = 'none';
                        el.style.boxShadow = 'none'; el.style.borderColor = 'rgba(255,255,255,.08)';
                        locked++;
                        opts.onScore && opts.onScore(`已归位 ${locked}/${N * N}`);
                        if (locked >= N * N && !over) {
                            over = true;
                            const secs = Math.round((Date.now() - t0) / 1000);
                            const par = N * N * 8;
                            opts.onComplete && opts.onComplete({
                                win: true, stars: secs <= par ? 3 : secs <= par * 1.8 ? 2 : 1,
                                lines: [`完成 ${N}×${N} 拼图！用时 ${secs}s`],
                            });
                        }
                    } else el.style.zIndex = 5;
                };
                el.addEventListener('pointerup', up);
                el.addEventListener('pointercancel', up);
            }

            build();
            return { stop() {} };
        },
    };
})();
