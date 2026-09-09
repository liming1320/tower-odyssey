// 猜数字（Bulls and Cows）：20 关挑战，位数/允许次数递增
window.MiniGames = window.MiniGames || {};
MiniGames.bulls = {
    LEVELS: [
        // { name, desc, digits, maxTries }
        { name: '两位入门', desc: '2 位 · 不重复 · 6 次机会' },
        { name: '两位熟练', desc: '2 位 · 不重复 · 5 次机会' },
        { name: '三位入门', desc: '3 位 · 不重复 · 8 次机会' },
        { name: '三位熟练', desc: '3 位 · 不重复 · 7 次机会' },
        { name: '三位挑战', desc: '3 位 · 不重复 · 6 次机会' },
        { name: '三位极限', desc: '3 位 · 不重复 · 5 次机会' },
        { name: '经典', desc: '4 位 · 不重复 · 8 次机会' },
        { name: '经典 II', desc: '4 位 · 不重复 · 7 次机会' },
        { name: '经典 III', desc: '4 位 · 不重复 · 6 次机会' },
        { name: '经典 IV', desc: '4 位 · 不重复 · 5 次机会' },
        { name: '五位入门', desc: '5 位 · 不重复 · 9 次机会' },
        { name: '五位熟练', desc: '5 位 · 不重复 · 8 次机会' },
        { name: '五位挑战', desc: '5 位 · 不重复 · 7 次机会' },
        { name: '五位极限', desc: '5 位 · 不重复 · 6 次机会' },
        { name: '六位入门', desc: '6 位 · 不重复 · 10 次机会' },
        { name: '六位熟练', desc: '6 位 · 不重复 · 9 次机会' },
        { name: '六位挑战', desc: '6 位 · 不重复 · 8 次机会' },
        { name: '七位', desc: '7 位 · 不重复 · 10 次机会' },
        { name: '八位', desc: '8 位 · 不重复 · 11 次机会' },
        { name: '猜数王', desc: '9 位 · 不重复 · 12 次机会 · 终极' },
    ],
    PARAMS: [
        [2, 6], [2, 5], [3, 8], [3, 7], [3, 6], [3, 5],
        [4, 8], [4, 7], [4, 6], [4, 5],
        [5, 9], [5, 8], [5, 7], [5, 6],
        [6, 10], [6, 9], [6, 8],
        [7, 10], [8, 11], [9, 12],
    ],
    start(container, opts, level) {
        const lv = level || this.LEVELS[0];
        const idx = this.LEVELS.indexOf(lv);
        const [digits, maxTries] = this.PARAMS[idx] || this.PARAMS[0];
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:16px;color:#f3f0e0;width:100%;max-width:380px;margin:0 auto;';
        let secret = [];
        while (secret.length < digits) { const d = MG.ri(0, 9); if (!secret.includes(d)) secret.push(d); }
        let history = [], over = false, won = false;
        const render = () => {
            wrap.innerHTML = `
                <div style="font-size:13px;color:#b9b3d8;margin-bottom:10px">🔑 ${digits} 位不重复数字（首位可 0），A×B 反馈 · 剩 ${maxTries - history.length} 次</div>
                <div style="display:flex;gap:6px;margin-bottom:12px">
                    <input id="g-in" maxlength="${digits}" placeholder="${digits} 位" style="flex:1;padding:9px;border-radius:8px;border:1px solid #5a5a80;background:#2a2540;color:#fff;font-size:18px;letter-spacing:6px;text-align:center;box-shadow:inset 0 2px 5px rgba(0,0,0,0.4)">
                    <button id="g-go" class="mg-btn" style="margin:0;padding:8px 16px">猜</button>
                </div>
                <div id="g-list" style="max-height:60vh;overflow-y:auto;display:flex;flex-direction:column;gap:5px">${history.map((h, i) => `
                    <div style="display:flex;align-items:center;gap:8px;background:linear-gradient(160deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03));border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 10px;font-size:14px">
                        <span style="color:#8f8ab0;min-width:18px">${history.length - i}.</span>
                        <b style="color:#ffd56b;letter-spacing:3px;flex:1">${h.g}</b>
                        <span style="background:rgba(92,213,92,0.15);border:1px solid rgba(92,213,92,0.4);color:#7adf7a;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:bold">${h.a}A${h.b}B</span>
                    </div>`).join('') || '<div style="color:#8f8ab0;font-size:13px;padding:10px 4px">还没有猜测 · 输入数字开始推理吧</div>'}</div>
                ${over ? '<div style="margin-top:12px;color:#ffd56b;font-size:14px">答案：<b style="letter-spacing:3px">' + secret.join('') + '</b></div>' : ''}`;
            document.getElementById('g-go').onclick = guess;
            document.getElementById('g-in').addEventListener('keydown', e => { if (e.key === 'Enter') guess(); });
            document.getElementById('g-in').focus();
        };
        const tryEnd = () => {
            if (!over) return;
            const used = history.length;
            const stars = won ? (used <= maxTries * 0.5 ? 3 : used <= maxTries * 0.75 ? 2 : 1) : 0;
            opts.onComplete && opts.onComplete({
                win: won, stars,
                lines: [won ? '用 ' + used + ' / ' + maxTries + ' 次猜中' : '用完 ' + maxTries + ' 次机会', '答案：' + secret.join(''), lv.desc],
            });
        };
        const guess = () => {
            if (over) return;
            const inp = document.getElementById('g-in');
            const v = inp.value.trim();
            if (!new RegExp('^\\d{' + digits + '}$').test(v) || new Set(v).size !== digits) { U.toast && U.toast('请输入 ' + digits + ' 位不重复的数字'); return; }
            const arr = v.split('').map(Number);
            let a = 0, b = 0;
            for (let i = 0; i < digits; i++) { if (arr[i] === secret[i]) a++; else if (secret.includes(arr[i])) b++; }
            history.unshift({ g: v, a, b });
            opts.onScore && opts.onScore('已猜：' + history.length + ' / ' + maxTries);
            if (a === digits) { over = true; won = true; }
            else if (history.length >= maxTries) { over = true; }
            render();
            tryEnd();
        };
        container.appendChild(wrap);
        render();
        MG.hint(container, lv.desc + ' · A=位置和数字都对，B=数字对位置错');
        return { stop() {} };
    }
};