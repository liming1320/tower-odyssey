/**
 * 存储抽象层：JSON（默认，零依赖） / MySQL（生产，多人并发 + 多设备同步）
 *
 * 切换方式（环境变量）：
 *   DB_DRIVER=json                    本地开发默认，数据仍在 data/db.json
 *   DB_DRIVER=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASS=xxx DB_NAME=tower_odyssey
 *
 * 设计要点：
 *   - 玩家存档与代码彻底分离：代码回滚 / 重新部署 / 重装系统都不会影响玩家数据
 *   - 英雄配置在 heroes 表：改名改技能改立绘直接改库，后台点「重载」即生效
 *   - MySQL 驱动需要 mysql2：npm install mysql2（未安装时会给出明确提示并退出）
 */
const fs = require('fs');
const path = require('path');

const DRIVER = (process.env.DB_DRIVER || 'json').toLowerCase();
const ROOT = path.join(__dirname, '..');

// game_meta 里以 JSON 存放的全局数据（非玩家私有）
const META_KEYS = [
    'chat', 'mails', 'clans', 'world', 'ancient', 'events',
    'wallSkills', 'treasures', 'giftCodes',
    'equipmentTemplates', 'ringTemplates', 'artifactTemplates', 'gemTemplates',
    '_meta', 'tokens',
    // 小游戏：积分排行榜（{gameId: [entry]}）+ 后台排序（string[]）
    'minigameScores', 'minigameOrder',
    // 模拟器 ROM 元数据（bin 文件在磁盘 data/roms/，元数据必须持久化，
    // 否则 MySQL 模式下重启即丢——线上 80+ ROM 列表清空事故的根因）
    'roms',
];
// 这些 key 在库里还没有记录时要初始化成对象（{}），其余初始化成数组（[]）
const META_OBJ_KEYS = new Set(['tokens', 'world', 'clans', 'minigameScores']);

let pool = null;
// 降级标记：DB_STRICT=0 时，MySQL 连不上就不再自杀，改用本地 db.json 继续服务
// （默认 DB_STRICT=1 保持原行为：连不上立刻退出，避免用空数据覆盖真实存档）
let degraded = false;

// ---------------------------------------------------------------- 初始化
async function init(opts = {}) {
    if (DRIVER !== 'mysql') return false;
    let mysql;
    try {
        mysql = require('mysql2/promise');
    } catch (e) {
        console.error('[store] ✗ 未安装 mysql2，请先执行： npm install mysql2');
        console.error('       （或把 DB_DRIVER 改回 json 使用文件存档）');
        process.exit(1);
    }
    const cfg = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'tower_odyssey',
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_POOL || 10),
        queueLimit: 0,
        charset: 'utf8mb4',
    };
    pool = mysql.createPool(cfg);
    try {
        await pool.query('SELECT 1');
        console.log(`[store] MySQL 已连接：${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
    } catch (e) {
        console.error('[store] ✗ MySQL 连接失败：' + e.message);
        console.error(`       host=${cfg.host} port=${cfg.port} user=${cfg.user} db=${cfg.database}`);
        console.error('       检查：数据库是否创建（deploy/mysql/schema.sql）、账号密码、安全组/防火墙');
        if ((process.env.DB_STRICT || '1') === '0') {
            // 降级：站点继续可访问（数据用本地 db.json，本次不会回写 MySQL）
            console.error('[store] DB_STRICT=0 → 降级为本地文件存档，进程继续（修好 MySQL 后重启即可恢复）');
            degraded = true; pool = null;
            return false;
        }
        process.exit(1);
    }
    if (opts.ensureSchema) await ensureSchema();
    await ensureColumns(); // 自动补缺失的列 / 索引，升级版本不再需要手动执行 ALTER
    return true;
}

// 自动结构迁移：players 表缺什么列就补什么列；老列宽度不够自动加宽
// 升级版本不再需要手动跑 alter-xxx.sql
async function ensureColumns() {
    try {
        const [cols] = await pool.query(
            `SELECT COLUMN_NAME AS name, CHARACTER_MAXIMUM_LENGTH AS len
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'players'`
        );
        if (!cols.length) return; // 表都不存在（等 ensureSchema 建表）
        const have = new Map(cols.map(c => [c.name, c.len]));

        // 缺列 → ADD
        const need = [
            ['nickname',   "ALTER TABLE `players` ADD COLUMN `nickname` VARCHAR(24) NULL COMMENT '玩家昵称（对外展示，可修改）'"],
            ['display_id', "ALTER TABLE `players` ADD COLUMN `display_id` VARCHAR(20) NULL COMMENT '展示 ID，14 位字母数字，全局唯一'"],
            ['phone',      "ALTER TABLE `players` ADD COLUMN `phone` VARCHAR(20) NULL COMMENT '绑定手机号（可登录）'"],
        ];
        for (const [col, ddl] of need) {
            if (!have.has(col)) {
                await pool.query(ddl);
                console.log(`[store] 已自动补列：players.${col}`);
            }
        }

        // 老列宽度不够 → MODIFY 拓宽（display_id 从 VARCHAR(12) 升到 VARCHAR(20) 以容纳 14 位 ID）
        if (have.get('display_id') && Number(have.get('display_id')) < 20) {
            await pool.query("ALTER TABLE `players` MODIFY COLUMN `display_id` VARCHAR(20) NULL");
            console.log('[store] 已拓宽 display_id 至 VARCHAR(20)');
        }

        // 关键：建 phone 唯一索引前，先把空串 '' 改成 NULL
        // （MySQL 唯一索引里多个空串算重复，但多个 NULL 允许并存——对应"未绑定手机"场景）
        await pool.query("UPDATE `players` SET `phone` = NULL WHERE `phone` = '' OR `phone` IS NULL").catch(() => {});
        // 再清一遍确保 phone 是 NULL
        await pool.query("UPDATE `players` SET `phone` = NULL WHERE `phone` = ''").catch(() => {});

        const [idx] = await pool.query(
            `SELECT INDEX_NAME AS name FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'players' AND INDEX_NAME = 'uk_phone'`
        );
        if (!idx.length) {
            await pool.query('ALTER TABLE `players` ADD UNIQUE KEY `uk_phone` (`phone`)');
            console.log('[store] 已自动补索引：uk_phone(phone)');
        }
    } catch (e) {
        console.error('[store] ⚠ 自动结构迁移失败：' + e.message);
    }
}

// 建表（可选，用于全新数据库一键初始化）
async function ensureSchema() {
    const sqlFile = path.join(ROOT, 'deploy', 'mysql', 'schema.sql');
    if (!fs.existsSync(sqlFile)) return;
    const sql = fs.readFileSync(sqlFile, 'utf8');
    // 去掉 CREATE DATABASE / USE，只执行建表部分
    const body = sql
        .split('\n')
        .filter(l => !/^\s*(CREATE DATABASE|USE)\b/i.test(l))
        .join('\n');
    for (const stmt of body.split(';')) {
        const s = stmt.replace(/--[^\n]*/g, '').trim();
        if (s) { try { await pool.query(s); } catch (e) { /* 已存在则忽略 */ } }
    }
    console.log('[store] 数据表已就绪');
}

// ---------------------------------------------------------------- 读取
/** 返回完整 state（users/tokens/heroes/...）；JSON 模式返回 null（交给 server.js 读文件） */
async function loadState() {
    if (DRIVER !== 'mysql' || !pool) return null;

    const [players] = await pool.query('SELECT * FROM `players`');
    const [states] = await pool.query('SELECT `player_id`, `state` FROM `player_state`');
    const stateMap = {};
    for (const r of states) stateMap[r.player_id] = r.state;

    const users = {};
    for (const p of players) {
        const saved = stateMap[p.id];
        if (saved && typeof saved === 'object') {
            // 用库里的存档为准，账号字段以 players 表为准（避免旧存档覆盖改名）
            users[p.id] = Object.assign({}, saved, {
                id: p.id,
                username: p.username,
                password: p.pass_hash,
                isAdmin: !!p.is_admin,
                nickname: p.nickname || saved.nickname || p.username,
                displayId: p.display_id || saved.displayId || null,
                phone: p.phone || saved.phone || null,
            });
        } else {
            users[p.id] = {
                id: p.id, username: p.username, password: p.pass_hash,
                isAdmin: !!p.is_admin, createdAt: p.created_at,
                nickname: p.nickname || p.username,
                displayId: p.display_id || null,
                phone: p.phone || null,
            };
        }
    }

    // 全局数据
    const [metas] = await pool.query('SELECT `meta_key`, `meta_value` FROM `game_meta`');
    const state = { users, heroes: await loadHeroes() };
    for (const m of metas) {
        let v = m.meta_value;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { /* 保持原样 */ } }
        state[m.meta_key] = v;
    }
    for (const k of META_KEYS) if (!(k in state)) state[k] = META_OBJ_KEYS.has(k) ? {} : [];

    // 邮件独立表（只有表里有数据时才覆盖 game_meta 里的，避免清空）
    try {
        const [mails] = await pool.query('SELECT * FROM `mails` ORDER BY `id` DESC LIMIT 500');
        if (mails.length) {
            state.mails = mails.map(m => ({
                id: String(m.id), to: m.to_user, toAll: !m.to_user,
                title: m.title, content: m.content,
                rewards: (typeof m.rewards === 'string' ? JSON.parse(m.rewards) : m.rewards) || {},
                from: m.from, time: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
                claimed: !!m.claimed,
            }));
        }
    } catch (e) { /* 表不存在则用 game_meta 里的 */ }

    console.log(`[store] 已载入 ${Object.keys(users).length} 名玩家 / ${state.heroes.length} 个英雄`);
    return state;
}

/** 只重新读取英雄配置（后台「重载英雄」用，改完库立刻生效，不用重启） */
async function loadHeroes() {
    if (DRIVER !== 'mysql' || !pool) return null;
    const [rows] = await pool.query('SELECT * FROM `heroes` ORDER BY `sort_order`, `id`');
    const [skills] = await pool.query('SELECT * FROM `hero_skills` ORDER BY `hero_id`, `slot`');
    const byHero = {};
    for (const s of skills) {
        (byHero[s.hero_id] = byHero[s.hero_id] || []).push({
            name: s.name, desc: s.skill_desc, cd: s.cd,
            multiplier: Number(s.multiplier), fx: s.fx, tint: s.tint,
        });
    }
    return rows.map(h => {
        const list = byHero[h.id] || [];
        const main = list[0] || null;
        const o = {
            id: h.id,
            name: h.name,
            rarity: h.rarity,
            element: h.element,
            tier: h.tier,
            baseAtk: h.base_atk,
            baseHp: h.base_hp,
            img: h.img,
            avatar: h.avatar || String(h.img || '').replace(/^heroes\//, 'avatars/'),
            material: !!h.material,
        };
        if (h.hero_desc) o.desc = h.hero_desc;
        if (main) o.skill = main;
        if (list.length) o.skills = list;
        if (h.enabled === 0) o.disabled = true;
        return o;
    });
}

// ---------------------------------------------------------------- 写入
/** 保存整个 state（玩家存档 + 全局数据） */
async function saveState(state) {
    if (DRIVER !== 'mysql' || !pool) return false;
    if (!state) return false;

    // 1) 玩家账号 + 存档
    for (const [id, u] of Object.entries(state.users || {})) {
        const pass = u.password || '';
        const salt = pass.includes('$') ? pass.split('$')[0] : '';
        await pool.execute(
            `INSERT INTO \`players\`
                (\`id\`,\`username\`,\`pass_hash\`,\`salt\`,\`is_admin\`,\`created_at\`,\`last_login\`,\`last_login_day\`,\`login_days\`,\`nickname\`,\`display_id\`,\`phone\`)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
                \`username\`=VALUES(\`username\`), \`pass_hash\`=VALUES(\`pass_hash\`), \`salt\`=VALUES(\`salt\`),
                \`is_admin\`=VALUES(\`is_admin\`), \`last_login\`=VALUES(\`last_login\`),
                \`last_login_day\`=VALUES(\`last_login_day\`), \`login_days\`=VALUES(\`login_days\`),
                \`nickname\`=VALUES(\`nickname\`), \`display_id\`=VALUES(\`display_id\`), \`phone\`=VALUES(\`phone\`)`,
            [
                id, u.username, pass, salt, u.isAdmin ? 1 : 0,
                u.createdAt ? new Date(u.createdAt) : new Date(),
                u.lastLogin ? new Date(u.lastLogin) : null,
                u.lastLoginDay || null,
                u.loginDays || 0,
                u.nickname || u.username || null,
                u.displayId || null,
                u.phone || null,
            ]
        );
        await pool.execute(
            `INSERT INTO \`player_state\` (\`player_id\`,\`state\`) VALUES (?,?)
             ON DUPLICATE KEY UPDATE \`state\`=VALUES(\`state\`)`,
            [id, JSON.stringify(u)]
        );
    }

    // 2) 全局数据
    for (const k of META_KEYS) {
        if (!(k in state)) continue;
        await pool.execute(
            `INSERT INTO \`game_meta\` (\`meta_key\`,\`meta_value\`) VALUES (?,?)
             ON DUPLICATE KEY UPDATE \`meta_value\`=VALUES(\`meta_value\`)`,
            [k, JSON.stringify(state[k] ?? null)]
        );
    }
    return true;
}

/** 保存英雄配置（后台改名 / 改技能后写回） */
async function saveHeroes(heroes) {
    if (DRIVER !== 'mysql' || !pool) return false;
    if (!Array.isArray(heroes)) return false;
    for (let i = 0; i < heroes.length; i++) {
        const h = heroes[i];
        const s = h.skill || (Array.isArray(h.skills) && h.skills[0]) || {};
        await pool.execute(
            `INSERT INTO \`heroes\`
                (\`id\`,\`name\`,\`rarity\`,\`element\`,\`tier\`,\`base_atk\`,\`base_hp\`,\`img\`,\`avatar\`,
                 \`material\`,\`hero_desc\`,\`skill_name\`,\`skill_desc\`,\`skill_cd\`,\`skill_multiplier\`,
                 \`skill_fx\`,\`skill_tint\`,\`enabled\`,\`sort_order\`)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
                \`name\`=VALUES(\`name\`), \`rarity\`=VALUES(\`rarity\`), \`element\`=VALUES(\`element\`),
                \`tier\`=VALUES(\`tier\`), \`base_atk\`=VALUES(\`base_atk\`), \`base_hp\`=VALUES(\`base_hp\`),
                \`img\`=VALUES(\`img\`), \`avatar\`=VALUES(\`avatar\`), \`material\`=VALUES(\`material\`),
                \`hero_desc\`=VALUES(\`hero_desc\`), \`skill_name\`=VALUES(\`skill_name\`),
                \`skill_desc\`=VALUES(\`skill_desc\`), \`skill_cd\`=VALUES(\`skill_cd\`),
                \`skill_multiplier\`=VALUES(\`skill_multiplier\`), \`skill_fx\`=VALUES(\`skill_fx\`),
                \`skill_tint\`=VALUES(\`skill_tint\`), \`enabled\`=VALUES(\`enabled\`),
                \`sort_order\`=VALUES(\`sort_order\`)`,
            [
                h.id, h.name, h.rarity || '稀有', h.element || '光', h.tier || 1,
                h.baseAtk || 0, h.baseHp || 0, h.img || '', h.avatar || null,
                h.material ? 1 : 0, h.desc || null,
                s.name || null, s.desc || null, s.cd || 0, s.multiplier || 0,
                s.fx || null, s.tint || null, h.disabled ? 0 : 1, i,
            ]
        );

        const list = (Array.isArray(h.skills) && h.skills.length) ? h.skills : [h.skill].filter(Boolean);
        await pool.execute('DELETE FROM `hero_skills` WHERE `hero_id`=?', [h.id]);
        for (let slot = 0; slot < list.length; slot++) {
            const sk = list[slot];
            if (!sk || !sk.name) continue;
            await pool.execute(
                `INSERT INTO \`hero_skills\` (\`hero_id\`,\`slot\`,\`name\`,\`skill_desc\`,\`cd\`,\`multiplier\`,\`fx\`,\`tint\`)
                 VALUES (?,?,?,?,?,?,?,?)`,
                [h.id, slot, sk.name, sk.desc || null, sk.cd || 0, sk.multiplier || 0, sk.fx || null, sk.tint || null]
            );
        }
    }
    return true;
}

/** 删除玩家（后台清理测试号） */
async function deletePlayer(id) {
    if (DRIVER !== 'mysql' || !pool) return false;
    await pool.execute('DELETE FROM `players` WHERE `id`=?', [id]);
    return true;
}

async function close() { if (pool) { try { await pool.end(); } catch (e) { /* ignore */ } } }

module.exports = {
    driver: DRIVER,
    // 降级后（DB_STRICT=0 且 MySQL 连不上）对外表现等同 json 模式，
    // 这样 server.js 的读写分支、启动日志、退出保存都会自动走文件存档
    isMySQL: () => DRIVER === 'mysql' && !degraded,
    isDegraded: () => degraded,
    init, ensureSchema, loadState, saveState, loadHeroes, saveHeroes, deletePlayer, close,
    // 导出给 server.js 派生「MySQL 启动恢复列表」——
    // 历史教训（2026-09-10 线上事故）：这里漏导出，server.js 的 Store.META_KEYS.filter
    // 抛 TypeError，把后面的 server.listen() 一起带没了 → 进程在、MySQL 也连上了，
    // 但端口没有任何监听，表现就是「网页打不开」。新增 META_KEYS 成员时会自动覆盖。
    META_KEYS,
};
