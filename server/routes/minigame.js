'use strict';
// 小游戏馆 / PK32 原版迁移馆 域路由：从 server.js 抽出（原 1443–1693 行，ROM 常量块与 admin 登录/邮件/礼包后台留 server.js）。
// 含 minigame/pk32 注册表（懒加载 + mtime 失效）+ 玩家闯关进度/积分排行榜/排序 + 后台排序。
// MINIGAME_IDS / MINIGAME_NAMES 为旧引用名兼容代理，随注册表搬入本文件。
const fs = require('fs');
const path = require('path');
const url = require('url');
module.exports = function registerMinigameRoutes(ctx) {
    const { api, DB, sendJson, getUserByToken, isAdminToken, save, newId } = ctx;

    const MINIGAMES_FILE = path.join(__dirname, '..', '..', 'public', 'js', 'views', 'minigames.js');
    const MINIGAME_BASE_IDS = [
        // 旧 20
        'gomoku','g2048','banqi','xiangqi','link','match3','snake','tetris','mole','mine','memory','slide15','bulls','sudoku6','hanoi','piano','reaction','breakout','jump','shooter',
        // 新 80
        'tictactoe','connect4','reversi','nim','battleship','dots','mancala','queens','peg','breakthru',
        'chess','junqi',
        'solitaire','spider','freecell','pyramid','blackjack','poker','war','monopoly',
        'maze','lightsout','floodit','pipes','nonogram','sudoku9','numberpath','sokoban','blockpuzzle','mastermind',
        'flappy','dodge','catcher','balloonpop','archery','basketball','darts','fishing','helicopter','stacker',
        'mathquiz','stroop','higherlower','oddone','idiom','trivia','counting','estimate','clockread','sequence',
        'flashnum','chimp','simon','cardmem','wordmem','spot','pathmem','shadowmatch','whatmiss','reversenum',
        'coinflip','dicehi','slots','bingo','spinner','rpsgame','plinko','lucky7','tapburst','gacha',
        'towerdef','idleclick','life','virus','sandfall','ballance','rocketland','orbit','traffic','growfarm',
        // 动作类
        'knife','sheep','pocketarmy','tank','contra1','contra2','pinball',
    ];
    // 懒加载 + mtime 失效：minigames.js 一变（git pull / 新增游戏）下次请求即生效
    let _mgReg = null;
    function minigameRegistry() {
        let mtime = 0;
        try { mtime = fs.statSync(MINIGAMES_FILE).mtimeMs; } catch (e) { mtime = 0; }
        if (_mgReg && _mgReg.mtime === mtime) return _mgReg;
        const ids = MINIGAME_BASE_IDS.slice();
        const names = {};
        try {
            const txt = fs.readFileSync(MINIGAMES_FILE, 'utf8');
            const start = txt.indexOf('const GAMES');
            const seg = start < 0 ? txt : txt.slice(start);
            let m;
            const reId = /(?:sc|sc2|scard|g)\(\s*['"]([A-Za-z0-9_-]+)['"]/g;
            while ((m = reId.exec(txt))) if (ids.indexOf(m[1]) < 0) ids.push(m[1]);
            const re1 = /(?:sc|sc2|scard|g)\(\s*['"]([A-Za-z0-9_-]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
            while ((m = re1.exec(seg))) names[m[1]] = m[2];
            const re2 = /\bid\s*:\s*['"]([A-Za-z0-9_-]+)['"]\s*,\s*name\s*:\s*['"]([^'"]+)['"]/g;
            while ((m = re2.exec(seg))) if (!names[m[1]]) names[m[1]] = m[2];
        } catch (e) { /* 读不到就用硬编码清单 + id 兜底 */ }
        _mgReg = { mtime, ids, set: new Set(ids), names };
        return _mgReg;
    }
    const mgIds = () => minigameRegistry().ids;
    const mgSet = () => minigameRegistry().set;
    const mgNames = () => minigameRegistry().names;
    // 兼容旧引用名（历史代码里到处是 MINIGAME_IDS.has / MINIGAME_NAMES）
    const MINIGAME_IDS = { has: x => mgSet().has(x) };
    const MINIGAME_NAMES = new Proxy({}, { get: (_, k) => mgNames()[k], has: (_, k) => k in mgNames(), ownKeys: () => Object.keys(mgNames()), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });

    api['POST /api/minigame/report'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const game = String(body.game || '');
        const level = parseInt(body.level);
        const stars = parseInt(body.stars);
        if (!MINIGAME_IDS.has(game)) return sendJson(res, 400, { error: '未知小游戏' });
        if (!(level >= 1 && level <= 60)) return sendJson(res, 400, { error: '关卡号不合法' });
        if (!(stars >= 1 && stars <= 3)) return sendJson(res, 400, { error: '星级不合法' });
        const u = user.state;
        u.minigames = u.minigames || {};
        u.minigames[game] = u.minigames[game] || {};
        const rec = u.minigames[game][level] || { stars: 0, clears: 0 };
        const reward = {};
        if (stars > rec.stars) {
            if (rec.clears) {                          // 已通关，只升星：补差价
                reward.gems = (stars - rec.stars) * 4;
                reward.gold = 100;
            } else {                                   // 首次通关：大奖
                reward.gems = 10 + level * 2 + (stars - 1) * 4;
                reward.gold = 400 + level * 150;
            }
            u.resources.gems = (u.resources.gems || 0) + reward.gems;
            u.resources.gold = (u.resources.gold || 0) + reward.gold;
        }
        rec.stars = Math.max(rec.stars, stars);
        rec.clears = (rec.clears || 0) + 1;
        u.minigames[game][level] = rec;
        save();
        sendJson(res, 200, { ok: true, reward, resources: u.resources, progress: u.minigames[game] });
    };
    // 客户端登录后拉取，与本地 localStorage 进度合并（换设备不丢进度）
    api['GET /api/minigame/progress'] = (req, res) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        sendJson(res, 200, { progress: (user.state && user.state.minigames) || {} });
    };

    // ---- 小游戏积分排行榜 ----
    //  DB.minigameScores = { [gameId]: [ {nickname, score, ts, displayId, isAdmin}, ... ] }
    //  按 score 倒序，取前 20；同名次取最早达成
    api['POST /api/minigame/score'] = (req, res, body) => {
        const user = getUserByToken(req);
        if (!user) return sendJson(res, 401, { error: '未登录' });
        const game = String(body.game || '');
        const score = parseInt(body.score);
        if (!MINIGAME_IDS.has(game)) return sendJson(res, 400, { error: '未知小游戏' });
        if (!Number.isFinite(score) || score < 0) return sendJson(res, 400, { error: '积分不合法' });
        DB.minigameScores = DB.minigameScores || {};
        DB.minigameScores[game] = DB.minigameScores[game] || [];
        const list = DB.minigameScores[game];
        const nick = user.nickname || user.username || ('玩家' + (user.displayId || user.id || ''));
        const isAdmin = !!user.isAdmin;
        const displayId = user.displayId || '';
        const me = list.find(x => x.userId === (user.id || user.username));
        if (me) {
            if (score > me.score) me.score = score;
            me.ts = Date.now();
            me.nickname = nick; me.isAdmin = isAdmin; me.displayId = displayId;
        } else {
            list.push({ userId: user.id || user.username, nickname: nick, score, ts: Date.now(), displayId, isAdmin });
        }
        list.sort((a, b) => b.score - a.score || a.ts - b.ts);
        // 保留前 100
        if (list.length > 100) list.length = 100;
        save();
        // 返回前 10 + 我的排名
        const top = list.slice(0, 10).map((x, i) => ({ rank: i + 1, nickname: x.nickname, score: x.score, displayId: x.displayId, isAdmin: x.isAdmin }));
        const myRank = list.findIndex(x => x.userId === (user.id || user.username)) + 1;
        sendJson(res, 200, { ok: true, top, myRank, myScore: list.find(x => x.userId === (user.id || user.username)).score });
    };
    api['GET /api/minigame/rank'] = (req, res) => {
        const parsed = url.parse(req.url, true);
        const game = String(parsed.query.game || '');
        if (!MINIGAME_IDS.has(game)) return sendJson(res, 400, { error: '未知小游戏' });
        const list = ((DB.minigameScores || {})[game] || []).slice(0, 20).map((x, i) => ({ rank: i + 1, nickname: x.nickname, score: x.score, displayId: x.displayId, isAdmin: x.isAdmin }));
        sendJson(res, 200, { game, list });
    };

    // ---- 小游戏排序：玩家 GET 当前顺序 / 后台 POST 调整 ----
    // DB.minigameOrder = string[]   （按用户后台设置的顺序存）
    api['GET /api/minigame/order'] = (req, res) => {
        // all / full：全部小游戏 id，供管理后台排序页兜底（即使没保存过任何顺序也能列出清单）
        const all = mgIds();
        const savedOrder = Array.isArray(DB.minigameOrder) ? DB.minigameOrder.filter(x => MINIGAME_IDS.has(x)) : [];
        const seen = new Set(savedOrder);
        sendJson(res, 200, {
            order: DB.minigameOrder || [],
            all,
            full: savedOrder.concat(all.filter(id => !seen.has(id))),
            names: mgNames(),
        });
    };
    api['POST /api/admin/minigame/order'] = (req, res, body) => {
        if (!isAdminToken(req)) return sendJson(res, 401, { error: '需要管理员' });
        if (!Array.isArray(body.order)) return sendJson(res, 400, { error: 'order 不合法' });
        // 仅保留合法的游戏 id；保留客户端提交的相对顺序
        const seen = new Set();
        const ordered = [];
        for (const x of body.order) {
            if (typeof x === 'string' && MINIGAME_IDS.has(x) && !seen.has(x)) { ordered.push(x); seen.add(x); }
        }
        // 兜底：客户端只拖了部分游戏（历史 bug：admin UI 误只提交 5 个）→ 把剩余的按 mgIds() 原序补到末尾
        // 避免再次出现 db.json 只存 5 个、玩家端「前 5 个生效，后面的退回原始顺序」的悲剧
        const all = mgIds();
        for (const id of all) if (!seen.has(id)) { ordered.push(id); seen.add(id); }
        if (ordered.length !== all.length) return sendJson(res, 400, { error: 'order 与清单不匹配' });
        DB.minigameOrder = ordered;
        save();
        sendJson(res, 200, { ok: true, order: DB.minigameOrder, count: ordered.length });
    };
    // 后台读取：把「已保存顺序」补齐未排序的新游戏，保证后台能看到全部小游戏
    api['GET /api/admin/minigame/order'] = (req, res) => {
        if (!isAdminToken(req)) return sendJson(res, 401, { error: '需要管理员' });
        const all = mgIds();
        const savedOrder = Array.isArray(DB.minigameOrder) ? DB.minigameOrder.filter(x => MINIGAME_IDS.has(x)) : [];
        const seen = new Set(savedOrder);
        const order = savedOrder.concat(all.filter(id => !seen.has(id)));
        // 关键：补 full 字段（与玩家端 GET 一致），否则后台排序页会走 r.all（默认顺序）而忽略已保存顺序，
        // 造成「保存后玩家端生效、但后台刷新后仍是默认顺序」的假象。
        const full = savedOrder.concat(all.filter(id => !seen.has(id)));
        sendJson(res, 200, { order, all, full, names: mgNames(), saved: savedOrder.length > 0, count: all.length });
    };

    // ---- PK32 原版迁移馆排序：玩家 GET 当前顺序 / 后台 POST 调整 ----
    // 馆内 200+ 款游戏清单定义在 public/js/minigames/pk32.js 的 NAMES 数组，
    // 同样用「按文件 mtime 失效缓存」的方式解析，避免 git pull 新游戏后服务不重启看不到。
    const PK32_FILE = path.join(__dirname, '..', '..', 'public', 'js', 'minigames', 'pk32.js');
    let _pk32Reg = null;
    function pk32Registry() {
        let mtime = 0;
        try { mtime = fs.statSync(PK32_FILE).mtimeMs; } catch (e) { mtime = 0; }
        if (_pk32Reg && _pk32Reg.mtime === mtime) return _pk32Reg;
        const ids = [], names = {};
        try {
            const txt = fs.readFileSync(PK32_FILE, 'utf8');
            const start = txt.indexOf('const NAMES');
            const seg = start < 0 ? txt : txt.slice(start);
            const m = seg.match(/const NAMES\s*=\s*\(([\s\S]*?)\)\s*\.split\(['"]\|['"]\)/);
            if (m) {
                const inner = m[1].trim();
                const body = (inner.length >= 2 && (inner[0] === "'" || inner[0] === '"')) ? inner.slice(1, -1) : inner;
                const arr = body.split('|').map(s => s.trim()).filter(Boolean);
                arr.forEach((name, i) => {
                    const id = 'pk32-' + String(i + 1).padStart(3, '0');
                    ids.push(id); names[id] = name;
                });
            }
        } catch (e) { /* 读不到就用空清单兜底 */ }
        _pk32Reg = { mtime, ids, set: new Set(ids), names };
        return _pk32Reg;
    }
    const pk32Ids = () => pk32Registry().ids;
    const pk32Set = () => pk32Registry().set;
    const pk32Names = () => pk32Registry().names;
    // 玩家端读取：馆内目录展示顺序（与后台保存顺序一致）
    api['GET /api/pk32/order'] = (req, res) => {
        const all = pk32Ids();
        const saved = Array.isArray(DB.pk32Order) ? DB.pk32Order.filter(x => pk32Set().has(x)) : [];
        const seen = new Set(saved);
        sendJson(res, 200, {
            order: DB.pk32Order || [],
            all,
            full: saved.concat(all.filter(id => !seen.has(id))),
            names: pk32Names(),
        });
    };
    api['POST /api/admin/pk32/order'] = (req, res, body) => {
        if (!isAdminToken(req)) return sendJson(res, 401, { error: '需要管理员' });
        const all = pk32Ids();
        if (!all.length) return sendJson(res, 400, { error: 'PK32 清单不可用' });
        if (!Array.isArray(body.order)) return sendJson(res, 400, { error: 'order 不合法' });
        const seen = new Set();
        const ordered = [];
        for (const x of body.order) {
            if (typeof x === 'string' && pk32Set().has(x) && !seen.has(x)) { ordered.push(x); seen.add(x); }
        }
        // 兜底：只提交部分 → 把剩余的按原始顺序补到末尾，避免馆内只剩被拖动的几项
        for (const id of all) if (!seen.has(id)) { ordered.push(id); seen.add(id); }
        if (ordered.length !== all.length) return sendJson(res, 400, { error: 'order 与清单不匹配' });
        DB.pk32Order = ordered;
        save();
        sendJson(res, 200, { ok: true, order: DB.pk32Order, count: ordered.length });
    };
    // 后台读取：把「已保存顺序」补齐未排序的新游戏，保证后台能看到全部 pk32 项
    api['GET /api/admin/pk32/order'] = (req, res) => {
        if (!isAdminToken(req)) return sendJson(res, 401, { error: '需要管理员' });
        const all = pk32Ids();
        const saved = Array.isArray(DB.pk32Order) ? DB.pk32Order.filter(x => pk32Set().has(x)) : [];
        const seen = new Set(saved);
        const order = saved.concat(all.filter(id => !seen.has(id)));
        const full = saved.concat(all.filter(id => !seen.has(id)));
        sendJson(res, 200, { order, all, full, names: pk32Names(), saved: saved.length > 0, count: all.length });
    };
};
