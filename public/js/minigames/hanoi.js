// 汉诺塔：20 关挑战，盘子数递增
window.MiniGames = window.MiniGames || {};
MiniGames.hanoi = {
    LEVELS: [
        { name: '三盘入门', desc: '3 盘 · 理论最少 7 步' },
        { name: '三盘熟练', desc: '3 盘' },
        { name: '四盘入门', desc: '4 盘 · 理论最少 15 步' },
        { name: '四盘熟练', desc: '4 盘' },
        { name: '四盘精通', desc: '4 盘' },
        { name: '五盘入门', desc: '5 盘 · 理论最少 31 步' },
        { name: '五盘熟练', desc: '5 盘' },
        { name: '五盘挑战', desc: '5 盘' },
        { name: '六盘入门', desc: '6 盘 · 理论最少 63 步' },
        { name: '六盘熟练', desc: '6 盘' },
        { name: '六盘挑战', desc: '6 盘' },
        { name: '六盘极限', desc: '6 盘' },
        { name: '七盘入门', desc: '7 盘 · 理论最少 127 步' },
        { name: '七盘熟练', desc: '7 盘' },
        { name: '七盘挑战', desc: '7 盘' },
        { name: '七盘极限', desc: '7 盘' },
        { name: '八盘入门', desc: '8 盘 · 理论最少 255 步' },
        { name: '八盘熟练', desc: '8 盘' },
        { name: '八盘挑战', desc: '8 盘' },
        { name: '汉诺塔王', desc: '9 盘 · 理论最少 511 步' },
    ],
    PARAMS: [3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 9],
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const N = this.PARAMS[idx] || 3;
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;width:100%;height:100%;background:#1a1c2a;display:flex;flex-direction:column;align-items:center;';
        const info = document.createElement('div');
        info.style.cssText = 'padding:10px;color:#ffd56b;font-size:14px;';
        wrap.appendChild(info);
        const stage = document.createElement('div');
        stage.style.cssText = 'flex:1;width:100%;display:flex;align-items:flex-end;justify-content:space-around;padding:0 20px 20px;';
        const PEGS = [0, 1, 2];
        const pegDivs = PEGS.map(() => { const d = document.createElement('div'); d.style.cssText = 'flex:1;display:flex;flex-direction:column-reverse;align-items:center;cursor:pointer;'; stage.appendChild(d); return d; });
        wrap.appendChild(stage);
        container.appendChild(wrap);
        let pegs = [Array.from({ length: N }, (_, i) => N - i), [], []];
        let moves = 0, sel = null, won_score = 0;
        const draw = () => {
            pegDivs.forEach((d, i) => {
                d.innerHTML = '';
                const base = document.createElement('div');
                base.style.cssText = 'width:90%;height:14px;background:#8a5732;border-radius:4px;margin-top:6px;';
                d.appendChild(base);
                const pole = document.createElement('div');
                pole.style.cssText = 'width:6px;height:' + Math.max(100, N * 22) + 'px;background:#5a3a1c;margin:0 auto;';
                d.appendChild(pole);
                pegs[i].forEach((size, _) => {
                        const disk = document.createElement('div');
                        const w = 20 + size * 14;
                        const isSel = sel === i;
                        const palette = ['#ff5252', '#ff9d5c', '#ffd56b', '#5cd65c', '#5cc7ff', '#b78bff', '#ff7a8b', '#7adf7a', '#5b8cff'];
                        disk.style.cssText = `width:${w}px;height:18px;background:${isSel ? '#ffd56b' : palette[size % palette.length]};border-radius:4px;margin-bottom:2px;`;
                        d.appendChild(disk);
                    });
            });
            const minSteps = Math.pow(2, N) - 1;
            info.textContent = '步数：' + moves + ' · 理论最少 ' + minSteps + ' 步';
            opts.onScore && opts.onScore('步数：' + moves + ' / 最少 ' + minSteps);
        };
        pegDivs.forEach((d, i) => d.onclick = () => {
            if (sel === null) { if (pegs[i].length) { sel = i; draw(); } return; }
            if (sel === i) { sel = null; draw(); return; }
            const top = pegs[sel][pegs[sel].length - 1];
            const dest = pegs[i].length ? pegs[i][pegs[i].length - 1] : 99;
            if (top < dest) { pegs[i].push(pegs[sel].pop()); moves++; }
            sel = null; draw();
            const win = pegs[2].length === N;
            if (win) {
                const minSteps = Math.pow(2, N) - 1;
                const stars = moves <= minSteps ? 3 : moves <= minSteps * 1.5 ? 2 : 1;
                opts.onComplete && opts.onComplete({
                    win: true, stars,
                    lines: ['用 ' + moves + ' 步完成', '理论最少 ' + minSteps + ' 步', lv.desc],
                });
            }
        });
        draw();
        MG.hint(container, lv.desc + ' · 点击柱子选中顶部盘子，再点目标柱移动');
        return { stop() {} };
    }
};