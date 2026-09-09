// 小游戏共享工具：创建 canvas、基础渲染、按钮、事件、关卡进度系统
window.MiniGames = window.MiniGames || {};
const MG = {
    // ================= 统一美术工具集（2026-09-09 视觉升级）=================
    // 各游戏的 draw() 复用：棋盘背景 / 渐变格子 / emoji / 高光，风格与 2048 妖怪版一致
    ui: {
        EMOJI_FONT: '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif',
        // 圆角矩形路径（只描路径，不填充）
        rr(ctx, x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        },
        // 深蓝渐变棋盘背景 + 圆角 + 描边
        board(ctx, w, h) {
            MG.ui.rr(ctx, 0, 0, w, h, 14);
            let g = null;
            try { g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3d5a80'); g.addColorStop(1, '#243a55'); } catch (e) {}
            ctx.fillStyle = g || '#2e4666'; ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = '#1a2c44'; ctx.stroke();
        },
        // 渐变游戏格子：底板渐变(c1→c2) + 描边(bd) + 顶部高光 + 投影
        tile(ctx, x, y, s, c1, c2, bd, r) {
            r = r == null ? 8 : r;
            MG.ui.rr(ctx, x + 2, y + 3, s - 4, s - 4, r);
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();          // 投影
            MG.ui.rr(ctx, x + 1, y + 1, s - 2, s - 2, r);
            let g = null;
            try { g = ctx.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, c1); g.addColorStop(1, c2); } catch (e) {}
            ctx.fillStyle = g || c1; ctx.fill();
            ctx.lineWidth = 1.6; ctx.strokeStyle = bd; ctx.stroke();
            MG.ui.rr(ctx, x + 4, y + 3, s - 8, s * 0.24, Math.min(r, 6));   // 顶部高光
            ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
        },
        // emoji 绘制（居中）
        emoji(ctx, ch, cx, cy, size) {
            ctx.font = Math.round(size) + 'px ' + MG.ui.EMOJI_FONT;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(ch, cx, cy);
        },
    },
    // 创建自适应 canvas（填满容器）
    canvas(parent, w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.style.maxWidth = '100%'; c.style.maxHeight = '100%';
        c.style.touchAction = 'none';
        parent.innerHTML = '';
        parent.appendChild(c);
        const ctx = c.getContext('2d');
        // 自适应缩放：保持宽高比，居中
        const fit = () => {
            const pw = parent.clientWidth, ph = parent.clientHeight;
            const s = Math.min(pw / w, ph / h);
            c.style.width = (w * s) + 'px';
            c.style.height = (h * s) + 'px';
        };
        fit();
        window.addEventListener('resize', fit);
        return { c, ctx, w, h, fit, destroy() { window.removeEventListener('resize', fit); } };
    },
    // 简单按钮覆盖层
    overlay(parent, html) {
        const o = document.createElement('div');
        o.className = 'mg-overlay';
        o.innerHTML = html;
        parent.appendChild(o);
        return o;
    },
    hint(parent, text) {
        const h = document.createElement('div');
        h.className = 'mg-hint';
        h.textContent = text;
        parent.appendChild(h);
        return h;
    },
    // 触摸/鼠标统一事件
    bind(c, onTap, onMove) {
        const get = (e) => {
            const r = c.getBoundingClientRect();
            const sx = c.width / r.width, sy = c.height / r.height;
            const t = e.touches ? e.touches[0] : e;
            return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy };
        };
        c.addEventListener('mousedown', e => onTap(get(e)));
        c.addEventListener('mousemove', e => onMove && onMove(get(e)));
        c.addEventListener('touchstart', e => { e.preventDefault(); onTap(get(e)); }, { passive: false });
        c.addEventListener('touchmove', e => { e.preventDefault(); onMove && onMove(get(e)); }, { passive: false });
    },
    // 随机整数
    ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    // 圆形按钮
    btn(parent, text, onClick) {
        const b = document.createElement('button');
        b.className = 'mg-btn';
        b.textContent = text;
        b.onclick = onClick;
        parent.appendChild(b);
        return b;
    },

    // ================= 关卡进度系统（localStorage 持久化 + 服务器同步）=================
    PKEY: 'mg-progress-v1',
    progress() {
        try { return JSON.parse(localStorage.getItem(this.PKEY)) || {}; } catch (e) { return {}; }
    },
    saveProgress(p) { try { localStorage.setItem(this.PKEY, JSON.stringify(p)); } catch (e) {} },
    getGameProgress(gameId) {
        return this.progress()[gameId] || { unlocked: 1, stars: {} };
    },
    // 记录星级（取历史最高）并解锁下一关；level=0 表示无尽模式（只存 best）
    // 同时上报服务器（登录用户）：首通/升星发钻石金币奖励
    recordStars(gameId, level, stars) {
        const p = this.progress();
        const g = p[gameId] || { unlocked: 1, stars: {} };
        const old = g.stars[level] || 0;
        if (stars > old) g.stars[level] = stars;
        if (level > 0 && stars > 0 && level >= g.unlocked) g.unlocked = level + 1;
        p[gameId] = g;
        this.saveProgress(p);
        this.report(gameId, level, stars);
        return g;
    },
    totalStars(gameId) {
        const g = this.getGameProgress(gameId);
        return Object.values(g.stars).reduce((a, b) => a + b, 0);
    },

    // ---- 服务器进度/奖励（游客自动跳过，不影响单机体验）----
    report(gameId, level, stars) {
        const tk = localStorage.getItem('game-token');
        if (!tk || !(level > 0)) return;
        fetch('/api/minigame/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
            body: JSON.stringify({ game: gameId, level, stars }),
        }).then(r => r.ok ? r.json() : null).then(r => {
            if (r && r.reward && (r.reward.gems || r.reward.gold)) this.rewardToast(r.reward);
        }).catch(() => {});
    },
    // 登录后拉服务器进度，与本地合并（换设备不丢进度）
    sync() {
        const tk = localStorage.getItem('game-token');
        if (!tk) return Promise.resolve();
        return fetch('/api/minigame/progress', { headers: { 'Authorization': 'Bearer ' + tk } })
            .then(r => r.ok ? r.json() : null).then(r => {
                if (!r || !r.progress) return;
                const p = this.progress();
                Object.keys(r.progress).forEach(gid => {
                    const g = p[gid] || { unlocked: 1, stars: {} };
                    Object.keys(r.progress[gid]).forEach(lv => {
                        const st = (r.progress[gid][lv] || {}).stars || 0;
                        if (st > (g.stars[lv] || 0)) g.stars[lv] = st;
                        const n = parseInt(lv);
                        if (n > 0 && st > 0 && n >= g.unlocked) g.unlocked = n + 1;
                    });
                    p[gid] = g;
                });
                this.saveProgress(p);
            }).catch(() => {});
    },
    // 闯关奖励浮层 + 顶栏资源即时刷新
    rewardToast(reward) {
        try {
            if (window.App && App.user && App.user.state) {
                const r = App.user.state.resources || (App.user.state.resources = {});
                r.gems = (r.gems || 0) + (reward.gems || 0);
                r.gold = (r.gold || 0) + (reward.gold || 0);
                App.refresh();
            }
        } catch (e) {}
        try {
            const d = document.createElement('div');
            d.className = 'mg-reward-toast';
            d.innerHTML = `<div class="mg-rt-title">🎉 小游戏闯关奖励</div>
                <div class="mg-rt-body">💎 +${reward.gems || 0}　💰 +${reward.gold || 0}</div>`;
            document.body.appendChild(d);
            setTimeout(() => d.remove(), 2700);
        } catch (e) {}
    },

    // ================= 关卡数扩展 =================
    // 把任意游戏的关卡列表扩到 N（默认 50）。少于 N 的用引擎名池（场景/品级/能力三套池）
    // 顺延补足，确保所有游戏统一 50 关（暗棋除外，沿用 DOS 原版 15 关）
    // 从关卡自身携带的参数推导难度说明（cols/rows/target/moves/time/score/holes/need 等）——用于选关页 desc
    fmtLevelDesc(l) {
        if (!l || typeof l !== 'object') return '';
        const L = {
            cols: '列', rows: '行', w: '宽', h: '高', size: '尺寸',
            target: '目标', goal: '目标', score: '目标分',
            speed: '速度', spd: '速度', rate: '频率',
            time: '限时', sec: '限时',
            need: '需', n: '阶', max: '上限', moves: '步数',
            holes: '挖空', ships: '船', shots: '炮',
            draws: '发牌', rounds: '轮', deals: '局',
            len: '长度', cnt: '数量', wind: '风力', arrows: '箭',
            gap: '间隙', tickets: '券', hp: '血量', gens: '代',
            clicks: '点击', tilt: '倾角', fuel: '燃料', grow: '生长',
            omega: 'Ω', knives: '刀', baseLen: '长度',
            types: '种类', count: '数量', mis: '失误率', mistakes: '容错',
        };
        const parts = [];
        for (const key in l) {
            if (key === 'name' || key === 'desc') continue;
            const v = l[key];
            if (v == null || typeof v === 'object') continue;
            if (key === 'cols' && l.rows != null) { parts.push(v + '×' + l.rows); continue; }
            if (key === 'rows' || key === 'h') continue; // 与 cols/w 合并显示
            if (key === 'w' && l.h != null) { parts.push(v + '×' + l.h); continue; }
            const label = L[key];
            if (label) parts.push(label + ' ' + v);
        }
        return parts.join(' · ');
    },
    fillLevels(levels, want) {
        want = want || 50;
        // 先把原始关卡的 desc 补齐：若关卡本身带参数（cols/rows/target/...），自动推导难度说明
        const src = (levels || []).map(l => {
            const o = Object.assign({}, l);
            if (!o.desc) o.desc = this.fmtLevelDesc(o);
            return o;
        });
        if (src.length >= want) return src.slice(0, want);
        // 三套名池：场景 / 品级 / 阶段。合并后整体去重，得到一份唯一的名字序列，
        // 再顺序取用补足到 50 关。这样每关名字都唯一、不会相邻撞名，也不会与原始关卡名重复。
        const POOLS = [
            // 池 0 · 场景
            ['启程','微风','林间','溪畔','山谷','云端','雷雨','霜降','雪原','荒漠',
             '幽谷','熔岩','深渊','星海','幻境','苍穹','混沌','鸿蒙','太虚','归墟',
             '迷踪','雾隐','断崖','石门','古道','驿亭','海角','天涯','昆仑','蓬莱',
             '桃源','峨眉','五岳','沧澜','瀚海','冰原','火山','雷泽','风谷','龙窟',
             '凤巢','麒麟崖','盘丝洞','万妖殿','九霄','天宫','瑶池','凌霄宝殿','紫霄','碧落',
             '化境','绝顶','通天','御虚','破界','入圣','不灭','永劫','归元','神化'],
            // 池 1 · 品级
            ['青铜','黑铁','白板','新秀','好手','劲敌','强敌','精英','骁将','统领',
             '元帅','霸主','王者','传说','史诗','不朽','至尊','神话','永恒','归真',
             '精钢','寒铁','陨铁','玄铁','星辰','皓月','耀阳','璀璨','辉金','赤霄',
             '青冥','紫电','白金','墨玉','翡翠','玛瑙','琥珀','琉璃','玄晶','紫金',
             '赤金','耀金','天金','圣金','太一','无瑕','无垢','霸者','绝响','傲视',
             '破晓','风暴','雷霆','烈火','寒冰','圣光','明辉','暗曜','玄黄','鸿钧'],
            // 池 2 · 阶段
            ['初见','学步','小试','渐入','熟手','巧思','妙手','连击','进阶','高手',
             '精通','险境','绝境','大师','宗师','传奇','无双','至尊','神话','王者',
             '暗影','轮回','涅槃','归一','太初','无极','登堂','入室','观海','凌云',
             '穿云','裂石','开山','辟地','观星','摘星','踏浪','逐日','奔月','御风',
             '乘雷','破军','定海','镇岳','洞玄','知微','若谷','麒麟','玄武','朱雀',
             '白虎','青龙','破晓','惊蛰','清明','夏至','秋分','冬至','长夜','黎明'],
        ];
        // 合并三池、去重，得到唯一的名字序列（180 → 约 176 个不重复）
        const ALL = [];
        const seen = new Set();
        for (const pool of POOLS) for (const n of pool) {
            if (!seen.has(n)) { seen.add(n); ALL.push(n); }
        }
        // 原始关卡名也视为已占用，避免补足的名字和游戏自带关卡名撞车
        const used = new Set(src.map(l => (l && l.name) || '').filter(Boolean));
        const out = src.slice();
        let k = 0;
        while (out.length < want) {
            let name = null;
            while (k < ALL.length) {
                if (!used.has(ALL[k])) { name = ALL[k]; k++; break; }
                k++;
            }
            if (name === null) name = '第 ' + (out.length + 1) + ' 关';
            used.add(name);
            const last = src[src.length - 1] || {};
            out.push({ name, desc: last.desc || '' });
        }
        return out;
    },

    // ================= 关卡选择界面 =================
    // cfg: { game, title, levels:[{name,desc}], onStart(idx, lv), extra:[{label,onClick}] }
    levelSelect(container, cfg) {
        const p = this.getGameProgress(cfg.game);
        container.innerHTML = '';
        // 关卡数统一扩展到 50：少于 50 的用引擎名池补足（保持原 1..N 难度曲线，N+1..50 顺延）
        // 暗棋（banqi）例外：沿用 DOS 原版 15 关，不做扩展
        const wantLv = cfg.game === 'banqi' ? 15 : 50;
        const fullLevels = MG.fillLevels(cfg.levels, wantLv);
        cfg = Object.assign({}, cfg, { levels: fullLevels });
        const wrap = document.createElement('div');
        wrap.className = 'mg-levelsel';
        const total = Object.values(p.stars).reduce((a, b) => a + b, 0);
        const maxTotal = fullLevels.length * 3;
        wrap.innerHTML = `<div class="mg-ls-title">${cfg.title}
            <span class="mg-ls-total">⭐ ${total}/${maxTotal}</span></div>`;
        // 排行榜条
        const rankBar = document.createElement('div');
        rankBar.className = 'mg-rank-bar';
        rankBar.innerHTML = `<span>🏆 本游戏榜单</span><button data-act="rank">查看 TOP 20</button>`;
        rankBar.querySelector('button').onclick = () => MG.showRank(cfg.game, cfg.title);
        wrap.appendChild(rankBar);
        const grid = document.createElement('div');
        grid.className = 'mg-ls-grid';
        cfg.levels.forEach((lv, idx) => {
            const n = idx + 1;
            const locked = n > p.unlocked;
            const st = p.stars[n] || 0;
            const el = document.createElement('div');
            el.className = 'mg-ls-cell' + (locked ? ' locked' : (st > 0 ? ' done' : ''));
            el.innerHTML = `<div class="mg-ls-num">${locked ? '🔒' : n}</div>
                <div class="mg-ls-name">${lv.name || ''}</div>
                <div class="mg-ls-desc" title="${lv.desc || ''}">${lv.desc || ''}</div>
                <div class="mg-ls-stars">${'★'.repeat(st)}<span>${'☆'.repeat(3 - st)}</span></div>`;
            if (!locked) el.onclick = () => { wrap.remove(); cfg.onStart(idx, lv); };
            grid.appendChild(el);
        });
        wrap.appendChild(grid);
        (cfg.extra || []).forEach(b => {
            const btn = document.createElement('button');
            btn.className = 'mg-btn mg-ls-extra';
            btn.textContent = b.label;
            btn.onclick = () => { wrap.remove(); b.onClick(); };
            wrap.appendChild(btn);
        });
        container.appendChild(wrap);
    },

    // ================= 结算弹窗 =================
    // cfg: {win, title, stars, lines:[], onRetry, onNext, hasNext}
    result(container, cfg) {
        const o = document.createElement('div');
        o.className = 'mg-result';
        o.innerHTML = `
            <div class="mg-result-card">
                <div class="mg-result-title">${cfg.title || (cfg.win ? '🏆 胜利！' : '💥 失败')}</div>
                ${cfg.stars != null ? `<div class="mg-result-stars">${'<i>★</i>'.repeat(cfg.stars)}${'<i class="off">☆</i>'.repeat(3 - cfg.stars)}</div>` : ''}
                <div class="mg-result-lines">${(cfg.lines || []).map(l => `<div>${l}</div>`).join('')}</div>
                <div class="mg-result-btns">
                    <button class="mg-btn" data-a="retry">↻ 重试</button>
                    ${cfg.hasNext ? '<button class="mg-btn primary" data-a="next">下一关 ›</button>' : ''}
                    ${cfg.hasBack ? '<button class="mg-btn" data-a="back">选关</button>' : ''}
                </div>
            </div>`;
        container.appendChild(o);
        o.querySelector('[data-a=retry]').onclick = () => { o.remove(); cfg.onRetry && cfg.onRetry(); };
        const nb = o.querySelector('[data-a=next]');
        if (nb) nb.onclick = () => { o.remove(); cfg.onNext && cfg.onNext(); };
        const bb = o.querySelector('[data-a=back]');
        if (bb) bb.onclick = () => { o.remove(); cfg.onBack && cfg.onBack(); };
        return o;
    },

    // ================= 猜拳定先手（暗棋圣手）=================
    rps(container, cb) {
        const opts = [['✊', '石头'], ['✌️', '剪刀'], ['✋', '布']];
        const o = document.createElement('div');
        o.className = 'mg-result';
        o.innerHTML = `<div class="mg-result-card">
            <div class="mg-result-title">猜拳定先手</div>
            <div class="mg-result-lines"><div id="mg-rps-ai">电脑：❓</div><div id="mg-rps-msg">请选择你的手势</div></div>
            <div class="mg-rps-btns">${opts.map((o2, i) => `<button class="mg-btn" data-i="${i}">${o2[0]}<br>${o2[1]}</button>`).join('')}</div>
        </div>`;
        container.appendChild(o);
        o.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
            const mine = +b.dataset.i, ai = MG.ri(0, 2);
            o.querySelector('#mg-rps-ai').textContent = '电脑：' + opts[ai][0] + ' ' + opts[ai][1];
            const msgEl = o.querySelector('#mg-rps-msg');
            const d = (mine - ai + 3) % 3;
            if (d === 0) { msgEl.textContent = '平局！再猜一次'; return; }
            msgEl.textContent = d === 1 ? '你赢了 → 你先行' : '电脑赢了 → 电脑先行';
            setTimeout(() => { o.remove(); cb(d === 1 ? 'player' : 'ai'); }, 800);
        });
    },

    // ================= 排行榜（调用 /api/minigame/rank 渲染 TOP 20）=================
    async showRank(gameId, title) {
        let data = { list: [] };
        try {
            const tk = localStorage.getItem('game-token');
            const r = await fetch('/api/minigame/rank?game=' + encodeURIComponent(gameId), tk ? { headers: { 'Authorization': 'Bearer ' + tk } } : {});
            data = await r.json();
        } catch (e) { data = { list: [] }; }
        const html = `<h3>🏆 ${title || gameId} · 榜单 TOP 20</h3>
            <div style="max-height:380px;overflow:auto;margin-top:8px">
            ${data.list.length ? `<table style="width:100%;font-size:13px;border-collapse:collapse">
                <tr style="color:#ffd56b;border-bottom:1px solid #555"><th style="padding:4px;text-align:left">#</th><th style="text-align:left">玩家</th><th style="text-align:right">积分</th></tr>
                ${data.list.map((x, i) => `<tr style="border-bottom:1px solid #2a3450"><td style="padding:5px;color:${i < 3 ? '#ffd56b' : '#7a90d8'};font-weight:bold">${x.rank}</td><td>${x.isAdmin ? '👑 ' : ''}${x.nickname || ''}</td><td style="text-align:right;color:#5cc7ff;font-weight:bold">${x.score}</td></tr>`).join('')}
                </table>` : '<p style="color:#7a90d8;padding:30px;text-align:center">还没人上榜，快来当第一名！</p>'}
            </div>
            <div class="modal-actions" style="margin-top:10px"><button class="btn" onclick="U.closeModal()">关闭</button></div>`;
        U.openModal(html);
    },
    // 上报分数（通关或无尽结算后调用）
    reportScore(gameId, score) {
        const tk = localStorage.getItem('game-token');
        if (!tk || !Number.isFinite(score)) return Promise.resolve(null);
        return fetch('/api/minigame/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
            body: JSON.stringify({ game: gameId, score: Math.floor(score) }),
        }).then(r => r.ok ? r.json() : null).catch(() => null);
    },
    // 拉取后台设置的排序；玩家端按此顺序渲染 GAMES
    async fetchOrder() {
        try {
            const r = await fetch('/api/minigame/order');
            if (!r.ok) return [];
            const d = await r.json();
            return d.order || [];
        } catch (e) { return []; }
    },

    // ================= 统一游戏关卡化框架 =================
    // 流程：levelSelect → 选关 → start → 完成 → result(星级) → 重试/下一关/选关
    //  cfg: {
    //    id, title, levels:[{name, desc, ...任意游戏参数}],
    //    start(container, opts, level) => instance{stop()},
    //    scoreEl?,           // 顶栏 score 元素（实时分数显示）
    //    onScore?,           // (text) => void 自定义实时分数处理
    //  }
    //  游戏内部结束调 opts.onComplete({win, stars, lines, score})
    runGame(container, cfg) {
        const self = this;
        let current = null;  // 当前 instance
        const clearCurrent = () => {
            try { current && current.stop && current.stop(); } catch (e) {}
            current = null;
            container.innerHTML = '';
        };
        const showLevels = () => {
            clearCurrent();
            // 无尽模式：不需要解锁任何关卡，直接可玩
            const extra = [];
            if (cfg.endless) {
                extra.push({
                    label: '∞ 无尽模式（无需解锁，直接玩）',
                    onClick: () => runLevel(-1, Object.assign({ name: '无尽', desc: '无限玩 · 失败为止' }, cfg.endless)),
                });
            }
            this.levelSelect(container, {
                game: cfg.id,
                title: cfg.title,
                levels: cfg.levels,
                extra,
                onStart: (idx, lv) => runLevel(idx, lv),
            });
        };
        const runLevel = (idx, lv) => {
            clearCurrent();
            const scoreEl = cfg.scoreEl || null;
            const onScore = cfg.onScore || (scoreEl ? (s => scoreEl.textContent = s != null ? s : '') : null);
            const endless = idx < 0;
            current = cfg.start(container, {
                level: lv,
                levelIdx: idx,
                endless,
                totalLevels: cfg.levels.length,
                onScore,
                onComplete: result => {
                    clearCurrent();
                    const stars = result.stars || 0;
                    if (!endless) this.recordStars(cfg.id, idx + 1, stars);
                    else this.setBest(cfg.id, result.score || 0);
                    // 上报排行榜（仅登录用户；分数取关卡星 ×100 或无尽分）
                    const score = endless ? (result.score || 0) : stars * 100 + (idx + 1) * 50;
                    try { MG.reportScore(cfg.id, score); } catch (e) {}
                    this.result(container, {
                        win: !!result.win,
                        title: result.title || (result.win ? '🏆 胜利！' : '💥 失败'),
                        stars: endless ? null : stars,
                        lines: (result.lines || []).concat(endless && this.getBest(cfg.id) ? [`🏅 历史最高 ${this.getBest(cfg.id)}`] : []),
                        hasNext: !endless && idx < cfg.levels.length - 1,
                        hasBack: true,
                        onRetry: () => runLevel(idx, lv),
                        onNext: () => idx + 1 < cfg.levels.length && runLevel(idx + 1, cfg.levels[idx + 1]),
                        onBack: showLevels,
                    });
                },
            }, lv);
        };
        showLevels();
        return { stop() { clearCurrent(); } };
    },
    // 无尽模式最高分（localStorage）
    bestKey(id) { return 'mg-best-' + id; },
    getBest(id) { try { return +(localStorage.getItem(this.bestKey(id)) || 0); } catch (e) { return 0; } },
    setBest(id, v) {
        if (v > this.getBest(id)) { try { localStorage.setItem(this.bestKey(id), String(v)); } catch (e) {} }
        return this.getBest(id);
    },
};
window.MG = MG;
