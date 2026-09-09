// 汉诺塔：N 层盘子的经典递归谜题，玩家手动操作
window.MiniGames = window.MiniGames || {};
MiniGames.hanoi = {
    start(container, opts) {
        const N = 5;
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;width:100%;height:100%;background:#1a1c2a;display:flex;flex-direction:column;align-items:center;';
        const info = document.createElement('div');
        info.style.cssText = 'padding:10px;color:#ffd56b;font-size:14px;';
        wrap.appendChild(info);
        const stage = document.createElement('div');
        stage.style.cssText = 'flex:1;width:100%;display:flex;align-items:flex-end;justify-content:space-around;padding:0 20px 20px;';
        const PEGS = [0, 1, 2];
        const pegDivs = PEGS.map(() => { const d = document.createElement('div'); d.style.cssText = 'flex:1;display:flex;flex-direction:column-reverse;align-items:center;'; stage.appendChild(d); return d; });
        wrap.appendChild(stage);
        container.appendChild(wrap);
        // peg 状态：栈顶在最后
        let pegs = [Array.from({ length: N }, (_, i) => N - i), [], []];
        let moves = 0, sel = null;
        const draw = () => {
            pegDivs.forEach((d, i) => {
                d.innerHTML = '';
                const base = document.createElement('div');
                base.style.cssText = 'width:90%;height:14px;background:#8a5732;border-radius:4px;margin-top:6px;';
                d.appendChild(base);
                const pole = document.createElement('div');
                pole.style.cssText = 'width:6px;height:160px;background:#5a3a1c;margin:0 auto;';
                d.appendChild(pole);
                pegs[i].forEach((size, idx) => {
                    const disk = document.createElement('div');
                    const w = 20 + size * 14;
                    const isSel = sel === i;
                    disk.style.cssText = `width:${w}px;height:18px;background:${isSel ? '#ffd56b' : ['#ff5252','#ff9d5c','#ffd56b','#5cd65c','#5cc7ff','#b78bff'][size-1]};border-radius:4px;margin-bottom:2px;`;
                    d.appendChild(disk);
                });
                if (sel === null) {
                    d.style.cursor = 'pointer';
                    d.onclick = () => { if (pegs[i].length) { sel = i; draw(); } };
                } else if (sel !== i) {
                    d.style.cursor = 'pointer';
                    d.onclick = () => {
                        const top = pegs[sel][pegs[sel].length - 1];
                        const dest = pegs[i].length ? pegs[i][pegs[i].length-1] : 99;
                        if (top < dest) { pegs[i].push(pegs[sel].pop()); moves++; }
                        sel = null; draw();
                        const win = pegs[2].length === N;
                        if (win) { opts.onScore && opts.onScore('🏆 完成！' + moves + ' 步（最少 ' + (Math.pow(2, N) - 1) + '）'); }
                    };
                } else { sel = null; draw(); }
            });
            info.textContent = '步数：' + moves + ' · 理论最少 ' + (Math.pow(2, N) - 1);
            opts.onScore && opts.onScore('步数：' + moves);
        };
        draw();
        MG.hint(container, '点击柱子选中顶部盘子，再点目标柱移动。' + (Math.pow(2, N) - 1) + ' 步为理论最少');
        return { stop() {} };
    }
};
