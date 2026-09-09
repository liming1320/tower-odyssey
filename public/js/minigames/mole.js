// 打地鼠：20 关挑战，网格/同时地鼠数/时限递增
window.MiniGames = window.MiniGames || {};
MiniGames.mole = {
    LEVELS: [
        // { name, desc, cols, rows, moles, interval, time, star3, star2, star1 }
        { name: '启程', desc: '3×3 · 1 地鼠 · 60s · 30 分三星' },
        { name: '入门', desc: '3×3 · 1 地鼠 · 50s · 35 分三星' },
        { name: '熟悉', desc: '3×3 · 1 地鼠 · 45s · 40 分三星' },
        { name: '勤奋', desc: '3×3 · 2 同时 · 45s · 50 分三星' },
        { name: '提速', desc: '3×3 · 2 同时 · 40s · 60 分三星' },
        { name: '进阶', desc: '4×4 · 2 同时 · 50s · 75 分三星' },
        { name: '挑战', desc: '4×4 · 2 同时 · 45s · 90 分三星' },
        { name: '锻手', desc: '4×4 · 3 同时 · 50s · 110 分三星' },
        { name: '熟练', desc: '4×4 · 3 同时 · 45s · 130 分三星' },
        { name: '快手', desc: '5×5 · 3 同时 · 50s · 160 分三星' },
        { name: '拼手速', desc: '5×5 · 3 同时 · 45s · 180 分三星' },
        { name: '高手', desc: '5×5 · 4 同时 · 50s · 220 分三星' },
        { name: '闪电', desc: '5×5 · 4 同时 · 45s · 250 分三星' },
        { name: '追风', desc: '6×6 · 4 同时 · 50s · 290 分三星' },
        { name: '疾速', desc: '6×6 · 4 同时 · 45s · 320 分三星' },
        { name: '鬼手', desc: '6×6 · 5 同时 · 45s · 360 分三星' },
        { name: '眼疾', desc: '6×6 · 5 同时 · 40s · 380 分三星' },
        { name: '传说', desc: '6×6 · 5 同时 · 35s · 400 分三星' },
        { name: '封神', desc: '7×7 · 5 同时 · 40s · 450 分三星' },
        { name: '打地鼠王', desc: '7×7 · 6 同时 · 35s · 520 分三星' },
    ],
    // 真实参数：从 LEVELS 解析
    PARAMS: [
        [3, 3, 1, 800, 60, 30, 25, 20],
        [3, 3, 1, 750, 50, 35, 28, 22],
        [3, 3, 1, 700, 45, 40, 32, 25],
        [3, 3, 2, 700, 45, 50, 40, 30],
        [3, 3, 2, 650, 40, 60, 48, 35],
        [4, 4, 2, 700, 50, 75, 60, 45],
        [4, 4, 2, 650, 45, 90, 72, 55],
        [4, 4, 3, 650, 50, 110, 90, 70],
        [4, 4, 3, 600, 45, 130, 105, 80],
        [5, 5, 3, 650, 50, 160, 130, 100],
        [5, 5, 3, 600, 45, 180, 145, 110],
        [5, 5, 4, 600, 50, 220, 175, 130],
        [5, 5, 4, 550, 45, 250, 200, 150],
        [6, 6, 4, 600, 50, 290, 230, 170],
        [6, 6, 4, 550, 45, 320, 255, 190],
        [6, 6, 5, 550, 45, 360, 285, 215],
        [6, 6, 5, 500, 40, 380, 305, 230],
        [6, 6, 5, 480, 35, 400, 320, 240],
        [7, 7, 5, 550, 40, 450, 360, 270],
        [7, 7, 6, 500, 35, 520, 415, 310],
    ],
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const [cols, rows, moles, interval, time, s3, s2, s1] = this.PARAMS[idx] || this.PARAMS[0];
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:10px;';
        const maxW = Math.min(container.clientWidth - 16, 500);
        const maxH = Math.min(window.innerHeight - 200, 500);
        const cellSize = Math.floor(Math.min(maxW / cols, maxH / rows, 80));
        const grid = document.createElement('div');
        grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px;`;
        const cells = [];
        for (let i = 0; i < cols * rows; i++) {
            const cell = document.createElement('div');
            // 草地格：绿渐变 + 内阴影（模拟地洞口）
            cell.style.cssText = `background:radial-gradient(ellipse at 50% 68%, #2e1a0a 0 26%, transparent 42%),linear-gradient(165deg,#7cae52,#4f7a2e 70%,#3e6323);`
                + `border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:${cellSize * 0.62}px;cursor:pointer;user-select:none;`
                + `width:${cellSize}px;height:${cellSize}px;transition:transform 0.1s;box-shadow:inset 0 2px 6px rgba(0,0,0,0.35), inset 0 -2px 4px rgba(255,255,255,0.15);`
                + `border:1px solid rgba(0,0,0,0.2);`;
            cell.textContent = '';
            grid.appendChild(cell);
            cells.push(cell);
        }
        wrap.appendChild(grid);
        container.appendChild(wrap);
        let score = 0, timeLeft = time, cur = new Set();
        const showMole = () => {
            // 移除已过期的地鼠（未击中）
            const newSet = new Set();
            // 随机保留或换位
            while (newSet.size < Math.min(moles, cols * rows)) newSet.add(MG.ri(0, cols * rows - 1));
            cells.forEach((c, i) => { if (!newSet.has(i)) c.textContent = ''; });
            newSet.forEach(i => { if (cur.has(i) && Math.random() < 0.5) { cells[i].textContent = ''; newSet.delete(i); } });
            while (newSet.size < Math.min(moles, cols * rows)) newSet.add(MG.ri(0, cols * rows - 1));
            newSet.forEach(i => {
                cells[i].textContent = '🐹';
                cells[i].style.transform = 'scale(1.06)';
                setTimeout(() => { if (cells[i].textContent) cells[i].style.transform = ''; }, 130);
            });
            cur = newSet;
        };
        const timer = setInterval(() => {
            timeLeft--;
            opts.onScore && opts.onScore('分数：' + score + ' · 剩余 ' + timeLeft + 's');
            if (timeLeft <= 0) {
                clearInterval(timer); clearInterval(loop);
                cells.forEach(c => c.textContent = '');
                const stars = score >= s3 ? 3 : score >= s2 ? 2 : score >= s1 ? 1 : 0;
                opts.onComplete && opts.onComplete({
                    win: true, stars,
                    lines: ['最终得分：' + score, '达标 ' + s3 + '/' + s2 + '/' + s1, lv.desc],
                });
            }
        }, 1000);
        const loop = setInterval(showMole, interval);
        cells.forEach((c, i) => c.onclick = () => {
            if (cur.has(i)) { score += 10; c.textContent = '💥'; c.style.transform = 'scale(1.2)'; opts.onScore && opts.onScore('分数：' + score + ' · 剩余 ' + timeLeft + 's'); setTimeout(() => { c.textContent = ''; c.style.transform = ''; }, 140); cur.delete(i); }
        });
        MG.hint(container, lv.desc);
        return { stop() { clearInterval(timer); clearInterval(loop); } };
    }
};