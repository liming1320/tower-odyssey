// 打地鼠：3x3 网格，60 秒限时
window.MiniGames = window.MiniGames || {};
MiniGames.mole = {
    start(container, opts) {
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:300px;height:300px;padding:8px;';
        const cells = [];
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.style.cssText = 'background:#6b4226;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:48px;cursor:pointer;user-select:none;';
            cell.textContent = '';
            grid.appendChild(cell);
            cells.push(cell);
        }
        container.appendChild(grid);
        let score = 0, timeLeft = 60, cur = -1;
        const showMole = () => {
            cells.forEach(c => c.textContent = '');
            cur = MG.ri(0, 8);
            cells[cur].textContent = '🐹';
        };
        const timer = setInterval(() => {
            timeLeft--;
            opts.onScore && opts.onScore('分数：' + score + ' · 剩余 ' + timeLeft + 's');
            if (timeLeft <= 0) { clearInterval(timer); clearInterval(loop); opts.onScore && opts.onScore('⏰ 时间到！得分：' + score); cells.forEach(c => c.textContent = ''); }
        }, 1000);
        const loop = setInterval(showMole, 800);
        cells.forEach((c, i) => c.onclick = () => { if (i === cur) { score += 10; c.textContent = '💥'; opts.onScore && opts.onScore('分数：' + score + ' · 剩余 ' + timeLeft + 's'); setTimeout(() => { c.textContent = ''; }, 150); } });
        MG.hint(container, '点击出现的地鼠！60 秒内看谁打得多');
        return { stop() { clearInterval(timer); clearInterval(loop); } };
    }
};
