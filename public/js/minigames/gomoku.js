// 五子棋：50 关阶梯 AI
// AI 强度：棋型识别（活四/冲四/活三/眠三/活二）+ 必防必攻 + 高关卡两层搜索
// 注意：MG.runGame 调用 start(container, opts)，不会传第三个 level，必须用 opts.levelIdx 取关卡
window.MiniGames = window.MiniGames || {};

// ---------- 棋型打分表（'1'=我方含虚拟落子，'0'=空，'2'=对手/边界）----------
const PAT = [
    [/11111/, 5000000],                                     // 五连：直接赢
    [/011110/, 200000],                                     // 活四
    [/011112|211110|11011|10111|11101/, 15000],             // 冲四 / 跳四（必须应）
    [/001110|011100/, 9000],                                // 活三
    [/011010|010110/, 8000],                                // 跳活三
    [/01112|21110|11001|10011/, 700],                       // 眠三
    [/00110|01100/, 500],                                   // 活二
    [/01010|010010/, 420],                                  // 跳活二
    [/0012|2100|0101|1010/, 110],                           // 眠二
];

// AI 强度曲线：t = 关卡进度 0~1
//   blunder  走神概率：直接不看棋型、在候选里随手下一个（低关卡主要靠它变弱）
//   pickWide 从排好序的前 N 个候选里随便挑（越大越不精确）
//   pats     能识别哪些棋型：弱 AI 只认「五连/活四/冲四/活三」，看不见眠三与活二
//   depth    是否计算对手的应手（两层）
//   atkW/defW 进攻 / 防守权重
const PAT_WEAK = PAT.slice(0, 4);
const paramsFor = t => ({
    blunder: t >= 0.85 ? 0.05 : Math.max(0, 0.60 * Math.pow(1 - t, 2.0)),
    pickWide: t < 0.15 ? 14 : t < 0.3 ? 10 : t < 0.45 ? 7 : t < 0.6 ? 5 : t < 0.8 ? 3 : 1,
    pats: t < 0.22 ? PAT_WEAK : PAT,
    depth2Prob: t < 0.32 ? 0 : Math.min(1, (t - 0.32) / 0.4),   // 中高段按概率启用两层，曲线更平滑
    depth: t >= 0.45 ? 2 : 1,   // 保留：文案用（是否具备算两步的能力）
    topK: Math.round(5 + 9 * t),
    atkW: 1 + 0.15 * t,
    defW: 0.95 + 0.40 * t,
});

const LV_NAME = [
    '入门', '初识', '热身', '小成', '练习', '稳健', '熟练', '进阶', '进阶 II', '挑战',
    '挑战 II', '高手', '高手 II', '冲刺', '冲刺 II', '宗匠', '宗匠 II', '鬼手', '神机', '五子王',
    '棋士', '棋兵', '棋卫', '棋将', '棋帅',
    '国手', '国手 II', '名宿', '大师', '大师 II',
    '宗师', '大宗师', '无双', '棋圣', '棋魂',
    '天元', '天元 II', '无敌', '至尊', '绝世',
    '棋神', '棋神 II', '破军', '贪狼', '七杀',
    '紫微', '太极', '无极', '混沌', '棋道尽头',
];

MiniGames.gomoku = {
    LEVELS: LV_NAME.map((name, i) => {
        const t = i / (LV_NAME.length - 1);
        const p = paramsFor(t);
        const rank = t < 0.2 ? '新手' : t < 0.45 ? '业余棋手' : t < 0.7 ? '职业棋手' : t < 0.9 ? '大师' : '宗师';
        return {
            name,
            desc: `${rank} · 失误 ${Math.round(p.blunder * 100)}% · ${p.depth2Prob > 0 ? (p.depth2Prob >= 1 ? '算 2 步' : '偶尔算 2 步') : '看眼前'}${i === LV_NAME.length - 1 ? '（终极）' : ''}`,
        };
    }),

    ENDLESS: { name: '∞ 无尽', desc: '挑战最强 AI，直到落败为止' },

    start(container, opts) {
        opts = opts || {};
        const self = this;
        const total = opts.totalLevels || this.LEVELS.length;
        // 无尽模式：直接打最高难度（末关），score 用 1/0 记录是否击败最强 AI
        const idx = opts.endless ? this.LEVELS.length - 1 : Math.max(0, Math.min(this.LEVELS.length - 1, opts.levelIdx != null ? opts.levelIdx : (opts.level ? opts.level - 1 : 0)));
        const lv = this.LEVELS[idx] || this.LEVELS[0];
        const t = total > 1 ? Math.min(1, idx / (total - 1)) : 0;
        const P = paramsFor(t);

        const { c, ctx, w, h, destroy } = MG.canvas(container, 420, 420);
        const N = 15, S = 28, OFF = 8;
        const board = Array.from({ length: N }, () => Array(N).fill(0));
        const ai = 2, human = 1;
        let over = false, winLine = null;

        const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

        // 某点在某一方向上的 9 格形态串（中心='1'；棋盘外与对手都算 '2'）
        const lineStr = (x, y, dx, dy, me) => {
            let s = '';
            for (let k = -4; k <= 4; k++) {
                if (k === 0) { s += '1'; continue; }
                const nx = x + dx * k, ny = y + dy * k;
                if (nx < 0 || nx >= N || ny < 0 || ny >= N) { s += '2'; continue; }
                const v = board[nx][ny];
                s += v === me ? '1' : (v ? '2' : '0');
            }
            return s;
        };
        // 落子在 (x,y) 对 me 的价值（四个方向累加，每方向只记最高档形态）
        const evalPoint = (x, y, me, pats) => {
            if (board[x][y] !== 0) return -1;
            let sum = 0;
            for (const [dx, dy] of DIRS) {
                const s = lineStr(x, y, dx, dy, me);
                for (const [re, v] of pats) if (re.test(s)) { sum += v; break; }
            }
            return sum;
        };
        const candidates = () => {
            const set = new Set();
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                if (!board[i][j]) continue;
                for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
                    const ni = i + dx, nj = j + dy;
                    if (ni >= 0 && ni < N && nj >= 0 && nj < N && !board[ni][nj]) set.add(ni * N + nj);
                }
            }
            if (!set.size) return [[Math.floor(N / 2), Math.floor(N / 2)]];
            return [...set].map(k => [Math.floor(k / N), k % N]);
        };
        // me 在当前局面下最强的一手价值（用于两层搜索时估算对手应手）
        const bestValueFor = (me, pats) => {
            let best = 0;
            for (const [x, y] of candidates()) {
                const v = evalPoint(x, y, me, pats);
                if (v > best) best = v;
            }
            return best;
        };
        const checkWin = (x, y, p) => {
            for (const [dx, dy] of DIRS) {
                const line = [[x, y]];
                for (let s = 1; s < 5; s++) { const nx = x + dx * s, ny = y + dy * s; if (nx >= 0 && nx < N && ny >= 0 && ny < N && board[nx][ny] === p) line.push([nx, ny]); else break; }
                for (let s = 1; s < 5; s++) { const nx = x - dx * s, ny = y - dy * s; if (nx >= 0 && nx < N && ny >= 0 && ny < N && board[nx][ny] === p) line.unshift([nx, ny]); else break; }
                if (line.length >= 5) return line.slice(0, 5);
            }
            return null;
        };
        const WINV = 5000000;

        const place = (x, y, p) => {
            board[x][y] = p;
            const wl = checkWin(x, y, p);
            draw();
            if (wl) {
                over = true; winLine = wl;
                opts.onComplete && opts.onComplete({
                    win: p === human, stars: p === human ? 3 : 0,
                    title: p === human ? '🏆 你五连获胜！' : '💥 电脑五连了…',
                    lines: [p === human ? '干得漂亮！' : '再来一局试试', lv.name + ' · ' + lv.desc],
                    score: p === human ? 1 : 0,
                });
            }
            return wl;
        };

        const aiMove = () => {
            if (over) return;
            const cs = candidates();
            // 0) 走神：完全不看棋型，随手下一个（低关卡主要靠这里变弱）
            const gone = P.blunder > 0 && Math.random() < P.blunder;
            if (gone) {
                const r = cs[MG.ri(0, cs.length - 1)];
                place(r[0], r[1], ai); return;
            }
            const scored = cs.map(([x, y]) => {
                const sa = evalPoint(x, y, ai, P.pats), sh = evalPoint(x, y, human, P.pats);
                return { x, y, sa, sh, s: sa * P.atkW + sh * P.defW };
            }).filter(o => o.s >= 0).sort((a, b) => b.s - a.s);
            if (!scored.length) { const r = cs[0]; place(r[0], r[1], ai); return; }

            // 1) 能赢就赢 / 对手要赢必须堵（弱 AI 有概率「看不见」）
            const myWin = scored.find(o => o.sa >= WINV);
            if (myWin && Math.random() >= P.blunder * 0.5) { place(myWin.x, myWin.y, ai); return; }
            const opWin = scored.find(o => o.sh >= WINV);
            if (opWin && Math.random() >= P.blunder) { place(opWin.x, opWin.y, ai); return; }

            let pick;
            if (Math.random() < P.depth2Prob) {
                // 2) 两层：把对手最强应手考虑进去
                const top = scored.slice(0, P.topK);
                let bestV = -Infinity;
                for (const o of top) {
                    board[o.x][o.y] = ai;
                    const reply = bestValueFor(human, P.pats);
                    board[o.x][o.y] = 0;
                    const v = o.s - reply * (0.55 + 0.45 * t);
                    if (v > bestV) { bestV = v; pick = o; }
                }
            } else {
                pick = scored[MG.ri(0, Math.min(scored.length, P.pickWide) - 1)];
            }
            if (!pick) pick = scored[0];
            place(pick.x, pick.y, ai);
        };

        const draw = () => {
            let bg = null;
            try { bg = ctx.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#e8c890'); bg.addColorStop(1, '#c8a060'); } catch (e) {}
            ctx.fillStyle = bg || '#d4a76a'; ctx.fillRect(0, 0, w, h);
            ctx.lineWidth = 4; ctx.strokeStyle = '#8a5a28';
            ctx.strokeRect(2, 2, w - 4, h - 4);
            ctx.lineWidth = 1; ctx.strokeStyle = '#7a5228';
            for (let i = 0; i < N; i++) {
                ctx.beginPath(); ctx.moveTo(OFF + i * S, OFF); ctx.lineTo(OFF + i * S, OFF + (N - 1) * S); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(OFF, OFF + i * S); ctx.lineTo(OFF + (N - 1) * S, OFF + i * S); ctx.stroke();
            }
            ctx.fillStyle = '#6a4218';
            [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([x, y]) => {
                ctx.beginPath(); ctx.arc(OFF + x * S, OFF + y * S, 3.5, 0, Math.PI * 2); ctx.fill();
            });
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                if (!board[i][j]) continue;
                const cx = OFF + j * S, cy = OFF + i * S;
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
                const grad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 12);
                if (board[i][j] === 1) { grad.addColorStop(0, '#686878'); grad.addColorStop(1, '#0a0a12'); }
                else { grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#c8c8d0'); }
                ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
            if (winLine) {
                ctx.save();
                ctx.shadowColor = '#ff5252'; ctx.shadowBlur = 8;
                ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 4; ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(OFF + winLine[0][1] * S, OFF + winLine[0][0] * S);
                ctx.lineTo(OFF + winLine[4][1] * S, OFF + winLine[4][0] * S);
                ctx.stroke();
                ctx.restore();
            }
        };

        MG.bind(c, p => {
            if (over) return;
            const x = Math.round((p.y - OFF) / S), y = Math.round((p.x - OFF) / S);
            if (x < 0 || x >= N || y < 0 || y >= N || board[x][y]) return;
            place(x, y, human);
            if (!over) setTimeout(aiMove, 180);
        });

        draw();
        MG.hint(container, `${lv.name}（${lv.desc}） · 点击棋盘落子，五连成线获胜`);
        return { stop() { destroy(); } };
    }
};
