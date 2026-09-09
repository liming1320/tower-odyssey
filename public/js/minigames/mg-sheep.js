// 羊了个羊：堆叠消除 —— 7 槽位，集满 3 张同款消除，全消即胜
// 桌面有 N 张牌（带数字 / emoji），点选进入槽位，槽内 3 张同款 → 消除
// 卡住（槽满 + 桌面无牌可消且无新牌可点） → 失败
window.MiniGames = window.MiniGames || {};
(function () {
    const E = (window.MG && window.MG.eng) || {};
    // 牌的造型：12 款 emoji，每款有数字 1..3 作为冗余辨识
    const TILES = [
        { e: '🐑', n: '羊', t: '#fff5d6' },     // 羊
        { e: '🐰', n: '兔', t: '#ffd6e6' },     // 兔
        { e: '🐶', n: '狗', t: '#d6e6ff' },     // 狗
        { e: '🐱', n: '猫', t: '#ffe8c8' },     // 猫
        { e: '🐭', n: '鼠', t: '#d8d8e8' },     // 鼠
        { e: '🐹', n: '仓', t: '#ffd6b3' },     // 仓鼠
        { e: '🐷', n: '猪', t: '#f5b3c8' },     // 猪
        { e: '🐸', n: '蛙', t: '#b3e8c8' },     // 蛙
        { e: '🐵', n: '猴', t: '#e8d6b3' },     // 猴
        { e: '🐔', n: '鸡', t: '#fff09c' },     // 鸡
        { e: '🐧', n: '企', t: '#b3d8e8' },     // 企鹅
        { e: '🐦', n: '鸟', t: '#cce0ff' },     // 鸟
    ];
    // 生成牌堆：保证可消（每款 3 张的倍数），层叠遮挡越深越难
    function genDeck(n, types) {
        const out = [];
        const groups = Math.ceil(n / 3 / types);   // 每款至少 groups 组（即 groups*3 张）
        for (let g = 0; g < groups; g++) {
            for (let i = 0; i < types; i++) out.push(i);
        }
        while (out.length < n) out.push(Math.floor(Math.random() * types));
        // shuffle
        for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
        // 确保能消：每种至少 3 张
        const cnt = {};
        out.forEach(t => cnt[t] = (cnt[t] || 0) + 1);
        for (let i = 0; i < types; i++) {
            while ((cnt[i] || 0) % 3 !== 0) {
                // 从其他多的转移一张
                let donor = -1;
                for (let j = 0; j < types; j++) if (j !== i && (cnt[j] || 0) >= 4) { donor = j; break; }
                if (donor < 0) { out.push(i); cnt[i] = (cnt[i] || 0) + 1; continue; }
                const idx = out.lastIndexOf(donor);
                if (idx >= 0) { out[idx] = i; cnt[donor]--; cnt[i] = (cnt[i] || 0) + 1; }
            }
        }
        return out.slice(0, n);
    }
    // 摆放：先按层堆叠（高层覆盖低层），上层必须等到下层清空才能点
    function layoutPositions(n, types) {
        // 3 列布局（type count），每列堆叠；列间可压
        const W = 360;
        const colW = (W - 40) / 3;
        const startX = 20 + colW / 2;
        const tiles = [];
        const rows = Math.ceil(n / 3);
        // 简单三角堆叠：底层 3 张，下层往上层缩 1 张
        // 用 3 列堆叠器：每列垂直堆
        const colStack = [0, 0, 0];
        let idx = 0;
        for (let row = 0; row < rows; row++) {
            const cnt = Math.min(3, n - idx);
            for (let c = 0; c < cnt; c++) {
                const col = (c === 0) ? 0 : (c === 1) ? 1 : 2;
                const x = startX + col * colW;
                const y = 90 + colStack[col] * 26;
                tiles.push({ x, y, col, stackIdx: colStack[col] });
                colStack[col]++;
                idx++;
                if (idx >= n) break;
            }
            if (idx >= n) break;
        }
        return tiles;
    }
    E.def && E.defd('sheep', {
        levels: [
            '青草坡','河边地','麦田','果园','竹林','石径','断崖','深谷','古木','荒原',
            '迷雾林','雷泽','雪原','沙海','火山口','幽潭','绿洲','孤岛','海崖','云海',
            '高原','绝壁','深渊','裂谷','雪峰','冰川','冻土','苔原','松林','云杉',
            '冷杉','白桦','红松','古柏','老榕','银杉','花楸','红杉','沙柳','胡杨',
            '怪柳','石楠','雪莲','红桦','古桑','老榆','沙棘','青杠','乌木','化境'
        ],
        params: (i, t) => ({
            types: Math.min(TILES.length, 4 + Math.floor(i / 6)),   // 4 → 12 种牌
            count: 18 + Math.floor(i * 1.8),                         // 牌总数 18 → 100+
        }),
        endless: { name: '无尽·消羊', desc: '牌越堆越多，看你能消几关' },
        hint: '👆 点击桌面牌上的羊/兔/狗…3 张同款即可消除；槽满=失败',
        init: P => {
            const types = P.types || 8;
            const n = P.count || 30;
            const deck = genDeck(n, types);
            const positions = layoutPositions(deck.length, types);
            return { deck, positions, locked: positions.map(() => true), slot: [], sel: -1, n: deck.length, types };
        },
        render: (S, P, api) => {
            const items = [];
            items.push(`<div style="background:linear-gradient(180deg,#7e5f3e,#5a4028);padding:6px 10px;border-radius:8px;font-size:12px;color:#ffd56b;text-align:center">关卡 ${P._i || 1} · 剩 ${S.deck.filter(x=>x>=0).length}/${S.n}</div>`);
            // 桌面区
            for (let i = 0; i < S.positions.length; i++) {
                if (S.deck[i] < 0) continue;
                const t = TILES[S.deck[i]];
                const p = S.positions[i];
                const blocked = S.locked[i];
                const stack = p.stackIdx;
                const top = stack === Math.max(...S.positions.filter((pp, k) => pp.col === p.col).map(pp => pp.stackIdx));
                const visTop = top && !blocked;
                items.push(`<div data-i="${i}" class="sheep-tile${visTop ? ' clickable' : ''}${blocked ? ' blocked' : ''}" style="left:${p.x - 26}px;top:${p.y - 26}px;background:${t.t};${stack > 0 ? 'box-shadow:1px 1px 0 #00000022' : ''}">
                    <div class="sheep-emoji">${t.e}</div>
                    <div class="sheep-num">${(S.deck[i] % 3) + 1}</div>
                </div>`);
            }
            // 槽位（7 格）
            const slots = [];
            for (let k = 0; k < 7; k++) {
                const it = S.slot[k];
                if (it == null) slots.push(`<div class="sheep-slot empty"></div>`);
                else { const t = TILES[it]; slots.push(`<div class="sheep-slot" style="background:${t.t}"><div class="sheep-emoji">${t.e}</div><div class="sheep-num">${(it % 3) + 1}</div></div>`); }
            }
            items.push(`<div class="sheep-slots">${slots.join('')}</div>`);
            // 工具按钮
            items.push(`<div class="sheep-tools"><button class="sheep-btn" data-act="undo">↶ 撤销</button><button class="sheep-btn" data-act="shuffle">🔀 打乱</button></div>`);
            return `<div class="sheep-board">${items.join('')}</div>`;
        },
        bind: (root, S, P, api) => {
            root.querySelectorAll('.sheep-tile.clickable').forEach(el => {
                el.onclick = () => {
                    const i = +el.dataset.i;
                    if (S.deck[i] < 0 || S.locked[i]) return;
                    // 入槽
                    S.slot.push(S.deck[i]);
                    S.deck[i] = -1;
                    // 重新计算锁定：本列 stackIdx 最大的为未锁
                    recomputeLocked(S);
                    // 槽内三消
                    while (S.slot.length >= 3) {
                        const cnt = {};
                        S.slot.forEach(x => cnt[x] = (cnt[x] || 0) + 1);
                        let tri = -1;
                        for (const k of Object.keys(cnt)) if (cnt[k] >= 3) tri = +k;
                        if (tri < 0) break;
                        // 移除最早入槽的 3 张
                        let removed = 0;
                        S.slot = S.slot.filter(x => { if (x === tri && removed < 3) { removed++; return false; } return true; });
                    }
                    api.update();
                    // 终局
                    const remain = S.deck.filter(x => x >= 0).length;
                    const stackLeft = S.slot.length;
                    if (remain === 0) {
                        api.finish({ win: true, score: 100 + S.n * 5, lines: [`全清 ${S.n} 张牌`] });
                    } else if (stackLeft >= 7) {
                        api.finish({ win: false, score: Math.floor((S.n - remain) / S.n * 100), lines: ['槽位满', `清 ${S.n - remain} / ${S.n} 张`] });
                    } else {
                        // 死局？再扫一次可消
                        if (noPossible(S)) {
                            api.finish({ win: false, score: Math.floor((S.n - remain) / S.n * 100), lines: ['无可消牌 · 失败', `清 ${S.n - remain} / ${S.n} 张`] });
                        }
                    }
                };
            });
            root.querySelector('[data-act=undo]').onclick = () => {
                if (S.undo) {
                    // 简单撤销：从槽位末尾弹回桌面
                    const last = S.slot.pop();
                    if (last != null) {
                        for (let i = 0; i < S.deck.length; i++) if (S.deck[i] === -1) { S.deck[i] = last; break; }
                        recomputeLocked(S);
                        api.update();
                    }
                } else {
                    U.toast && U.toast('本关暂不支持撤销');
                }
            };
            root.querySelector('[data-act=shuffle]').onclick = () => {
                const alive = S.deck.filter(x => x >= 0);
                for (let i = alive.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [alive[i], alive[j]] = [alive[j], alive[i]]; }
                let ai = 0;
                for (let i = 0; i < S.deck.length; i++) if (S.deck[i] >= 0) S.deck[i] = alive[ai++];
                recomputeLocked(S);
                api.update();
            };
        },
        score: S => {
            const remain = S.deck.filter(x => x >= 0).length;
            return `清 ${S.n - remain}/${S.n} · 槽 ${S.slot.length}/7`;
        },
    });
    function recomputeLocked(S) {
        // 计算每列最大 stackIdx
        const maxByCol = {};
        for (let i = 0; i < S.positions.length; i++) {
            if (S.deck[i] < 0) continue;
            const c = S.positions[i].col;
            maxByCol[c] = Math.max(maxByCol[c] || 0, S.positions[i].stackIdx);
        }
        for (let i = 0; i < S.positions.length; i++) {
            if (S.deck[i] < 0) { S.locked[i] = false; continue; }
            const p = S.positions[i];
            S.locked[i] = !(p.stackIdx === maxByCol[p.col]);
        }
    }
    function noPossible(S) {
        // 死局：桌面上每种牌 ≤ 2 张（无法再凑 3），且槽位里没有任何牌可以叠成 3
        const onBoard = {};
        for (const x of S.deck) if (x >= 0) onBoard[x] = (onBoard[x] || 0) + 1;
        const slotCnt = {};
        for (const x of S.slot) slotCnt[x] = (slotCnt[x] || 0) + 1;
        for (const k of Object.keys(onBoard)) {
            const total = onBoard[k] + (slotCnt[k] || 0);
            if (total >= 3) return false;
        }
        return true;
    }
})();