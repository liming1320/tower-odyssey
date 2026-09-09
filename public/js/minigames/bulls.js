// 猜数字（Bulls and Cows）：4 位不重复数字，AxB 反馈
window.MiniGames = window.MiniGames || {};
MiniGames.bulls = {
    start(container, opts) {
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:16px;color:#f3f0e0;width:100%;max-width:380px;';
        let secret = [];
        while (secret.length < 4) { const d = MG.ri(0, 9); if (!secret.includes(d)) secret.push(d); }
        let history = [], over = false;
        const render = () => {
            wrap.innerHTML = `
                <div style="font-size:14px;color:#b9b3d8;margin-bottom:10px">猜一个 4 位数字（数字不重复），我会告诉你 A×B</div>
                <div style="display:flex;gap:6px;margin-bottom:12px">
                    <input id="g-in" maxlength="4" placeholder="4 位数字" style="flex:1;padding:8px;border-radius:6px;border:1px solid #555;background:#2a2540;color:#fff;font-size:18px;letter-spacing:6px;text-align:center">
                    <button id="g-go" class="mg-btn" style="margin:0;padding:8px 16px">猜</button>
                </div>
                <div id="g-list" style="font-size:13px;line-height:1.8">${history.map((h,i) => `<div>${i+1}. <b style="color:#ffd56b">${h.g}</b> → <span style="color:#5cd65c">${h.a}A${h.b}B</span></div>`).join('') || '<div style="color:#888">还没有猜测</div>'}</div>
                ${over ? '<div style="margin-top:12px;color:#ffd56b;font-size:14px">🎉 答案就是 <b>' + secret.join('') + '</b></div>' : ''}
            `;
            document.getElementById('g-go').onclick = guess;
            document.getElementById('g-in').addEventListener('keydown', e => { if (e.key === 'Enter') guess(); });
            document.getElementById('g-in').focus();
        };
        const guess = () => {
            if (over) return;
            const inp = document.getElementById('g-in');
            const v = inp.value.trim();
            if (!/^\d{4}$/.test(v) || new Set(v).size !== 4) { U.toast && U.toast('请输入 4 位不重复的数字'); return; }
            const arr = v.split('').map(Number);
            let a = 0, b = 0;
            for (let i = 0; i < 4; i++) { if (arr[i] === secret[i]) a++; else if (secret.includes(arr[i])) b++; }
            history.unshift({ g: v, a, b });
            opts.onScore && opts.onScore('已猜：' + history.length + ' 次');
            if (a === 4) { over = true; opts.onScore && opts.onScore('🏆 猜中了！答案 ' + v); }
            render();
        };
        container.appendChild(wrap);
        render();
        MG.hint(container, 'A=位置和数字都对，B=数字对位置错');
        return { stop() {} };
    }
};
