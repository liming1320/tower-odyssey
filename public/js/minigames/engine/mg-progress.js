// 小游戏引擎 · 进度模块（mg-progress.js）
// 职责：关卡数扩展（补全到 N 关）、星级/解锁本地持久化、服务器同步、无尽最高分。
window.MG = window.MG || {};
var MG = window.MG;

// ================= 关卡进度系统（localStorage 持久化 + 服务器同步）=================
MG.PKEY = 'mg-progress-v1';
MG.PROG_V = 1;
// 读取进度：支持「版本包裹 {v, games}」与「旧版裸 games map」两种格式，损坏数据自动备份
MG.progress = function () {
    let raw = null;
    try {
        raw = localStorage.getItem(this.PKEY);
        if (!raw) return {};
        const obj = JSON.parse(raw);
        if (obj && obj.v === this.PROG_V && obj.games) return obj.games;   // 新版
        if (obj && typeof obj === 'object' && !obj.v) return obj;            // 兼容旧版（无版本包裹）
        return {};
    } catch (e) {
        if (raw) { try { localStorage.setItem('mg-progress-corrupt-' + Date.now(), raw); } catch (_) { } }
        return {};
    }
};
// 写入进度：统一包裹版本号，便于将来迁移；多标签页用 storage 事件合并（见 sync）
MG.saveProgress = function (p) { try { localStorage.setItem(this.PKEY, JSON.stringify({ v: this.PROG_V, games: p || {} })); } catch (e) { } };
MG.getGameProgress = function (gameId) {
    return this.progress()[gameId] || { unlocked: 1, stars: {} };
};
// 记录星级（取历史最高）并解锁下一关；level=0 表示无尽模式（只存 best）
// 同时上报服务器（登录用户）：首通/升星发钻石金币奖励
MG.recordStars = function (gameId, level, stars) {
    const p = this.progress();
    const g = p[gameId] || { unlocked: 1, stars: {} };
    const old = g.stars[level] || 0;
    const improved = stars > old;                       // 仅首次通关 / 升星才变化
    if (improved) g.stars[level] = stars;
    if (level > 0 && stars > 0 && level >= g.unlocked) g.unlocked = level + 1;
    p[gameId] = g;
    this.saveProgress(p);
    // 仅首次/升星上报：避免重复通关反复下发奖励（服务端仍需幂等兜底，见 issue #20/#21）
    if (improved) this.report(gameId, level, stars);
    return g;
};
MG.totalStars = function (gameId) {
    const g = this.getGameProgress(gameId);
    return Object.values(g.stars).reduce((a, b) => a + b, 0);
};

// ---- 服务器进度/奖励（游客自动跳过，不影响单机体验）----
MG.report = function (gameId, level, stars) {
    const tk = localStorage.getItem('game-token');
    if (!tk || !(level > 0)) return;
    fetch('/api/minigame/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk },
        body: JSON.stringify({ game: gameId, level, stars }),
    }).then(r => r.ok ? r.json() : null).then(r => {
        if (r && r.reward && (r.reward.gems || r.reward.gold)) this.rewardToast(r.reward);
    }).catch(() => {});
};
// 登录后拉服务器进度，与本地合并（换设备不丢进度）
MG.sync = function () {
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
};
// 闯关奖励浮层 + 顶栏资源即时刷新
MG.rewardToast = function (reward) {
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
};

// ================= 关卡数扩展 =================
// 把任意游戏的关卡列表扩到 N（默认 50）。少于 N 的用引擎名池（场景/品级/能力三套池）
// 顺延补足，确保所有游戏统一 50 关（暗棋除外，沿用 DOS 原版 15 关）
// 从关卡自身携带的参数推导难度说明（cols/rows/target/moves/time/score/holes/need 等）——用于选关页 desc
MG.fmtLevelDesc = function (l) {
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
};
MG.fillLevels = function (levels, want) {
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
        ['启程', '微风', '林间', '溪畔', '山谷', '云端', '雷雨', '霜降', '雪原', '荒漠',
            '幽谷', '熔岩', '深渊', '星海', '幻境', '苍穹', '混沌', '鸿蒙', '太虚', '归墟',
            '迷踪', '雾隐', '断崖', '石门', '古道', '驿亭', '海角', '天涯', '昆仑', '蓬莱',
            '桃源', '峨眉', '五岳', '沧澜', '瀚海', '冰原', '火山', '雷泽', '风谷', '龙窟',
            '凤巢', '麒麟崖', '盘丝洞', '万妖殿', '九霄', '天宫', '瑶池', '凌霄宝殿', '紫霄', '碧落',
            '化境', '绝顶', '通天', '御虚', '破界', '入圣', '不灭', '永劫', '归元', '神化'],
        // 池 1 · 品级
        ['青铜', '黑铁', '白板', '新秀', '好手', '劲敌', '强敌', '精英', '骁将', '统领',
            '元帅', '霸主', '王者', '传说', '史诗', '不朽', '至尊', '神话', '永恒', '归真',
            '精钢', '寒铁', '陨铁', '玄铁', '星辰', '皓月', '耀阳', '璀璨', '辉金', '赤霄',
            '青冥', '紫电', '白金', '墨玉', '翡翠', '玛瑙', '琥珀', '琉璃', '玄晶', '紫金',
            '赤金', '耀金', '天金', '圣金', '太一', '无瑕', '无垢', '霸者', '绝响', '傲视',
            '破晓', '风暴', '雷霆', '烈火', '寒冰', '圣光', '明辉', '暗曜', '玄黄', '鸿钧'],
        // 池 2 · 阶段
        ['初见', '学步', '小试', '渐入', '熟手', '巧思', '妙手', '连击', '进阶', '高手',
            '精通', '险境', '绝境', '大师', '宗师', '传奇', '无双', '至尊', '神话', '王者',
            '暗影', '轮回', '涅槃', '归一', '太初', '无极', '登堂', '入室', '观海', '凌云',
            '穿云', '裂石', '开山', '辟地', '观星', '摘星', '踏浪', '逐日', '奔月', '御风',
            '乘雷', '破军', '定海', '镇岳', '洞玄', '知微', '若谷', '麒麟', '玄武', '朱雀',
            '白虎', '青龙', '破晓', '惊蛰', '清明', '夏至', '秋分', '冬至', '长夜', '黎明'],
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
};

// ================= 无尽模式最高分（独立键持久化）=================
// 此前 bestKey 未定义，导致 setBest 永远静默失败（P0）。现已独立成键并存 localStorage。
MG.bestKey = function (id) { return 'mg-best-' + String(id); };
MG.getBest = function (id) { try { return +(localStorage.getItem(this.bestKey(id)) || 0); } catch (e) { return 0; } };
MG.setBest = function (id, v) {
    v = Number(v) || 0;
    if (v > this.getBest(id)) { try { localStorage.setItem(this.bestKey(id), String(v)); } catch (e) { } }
    return this.getBest(id);
};
