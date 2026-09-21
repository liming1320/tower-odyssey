// 塔界远征 - 肉鸽推塔游戏后端 (Node.js 零依赖)
// Author: WorkBuddy
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
// 数据库连接兜底配置：
//   优先级：环境变量 > data/db-env.json > 默认 json 模式
//   背景：systemd 正常重启会带上 DB_* 环境变量，但部署脚本兜底的 nohup
//   直启没有这些变量，服务会悄悄回落到 json 模式（新玩家写进 db.json 而不是 MySQL）。
//   把连接信息写进 data/db-env.json（不进 git、不受部署覆盖），无论哪种方式启动都能进 MySQL。
try {
    if (!process.env.DB_DRIVER) {
        const envCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'db-env.json'), 'utf8'));
        for (const k of Object.keys(envCfg)) {
            if (process.env[k] === undefined) process.env[k] = String(envCfg[k]);
        }
        console.log('[boot] 已从 data/db-env.json 读入数据库配置（DB_DRIVER=' + process.env.DB_DRIVER + '）');
    }
} catch (e) { /* 配置文件不存在 → 默认 json 模式 */ }

// AI 酒馆（SillyTavern）网关配置，同样支持文件兜底：
//   优先级：环境变量 > data/tavern-env.json > 内置默认
//   为什么不只用环境变量：宝塔 / PM2 / systemd 的面板里配环境变量很折腾，
//   而且不同进程管理器写法不一样，很容易配了却没生效。写成文件最省心。
//   注意：必须在 require('./server/tavern') 之前执行 —— 它在模块加载时就读了 process.env。
try {
    const tavCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'tavern-env.json'), 'utf8'));
    for (const k of Object.keys(tavCfg)) {
        if (process.env[k] === undefined) process.env[k] = String(tavCfg[k]);
    }
    console.log('[boot] 已从 data/tavern-env.json 读入 AI 酒馆配置（管理员句柄='
        + (process.env.TAVERN_ADMIN_HANDLE || 'admin') + '）');
} catch (e) { /* 文件不存在 → 用环境变量或内置默认 */ }

// 存储抽象层：DB_DRIVER=json（默认，data/db.json）或 mysql（生产，多人并发/多端同步）
const Store = require('./server/store');
// SillyTavern 网关：同域反向代理 + SSO 账号打通（详见 server/tavern.js 顶部说明）
const Tavern = require('./server/tavern');
// 小游戏联机中继：按游戏匹配的房间转发（WebSocket，挂 upgrade 钩子 /ws/minigame）。失败不阻断主服务。
const WsRelay = (() => { try { return require('./server/ws-relay'); } catch (e) { return null; } })();
// 模拟器联机信令中继（EmulatorJS nightly netplay，socket.io 挂 /netplay/socket.io）。失败不阻断主服务。
const Netplay = (() => { try { return require('./server/netplay'); } catch (e) { return null; } })();

// 游戏内容配置（品质 / 装备 / 英雄星级天赋 / 元素 / 城墙 / 材料英雄 / 许愿 / 锻造 / 塔与肉鸽 / Boss / 建筑 / 资源 / 展示ID / 短信）
// 纯数据常量统一放在 server/config/，server.js 只保留路由、DB 与战斗逻辑。
const {
    QUALITIES,
    QUALITY_NAME,
    QUALITY_MUL,
    QUALITY_COLOR,
    TYPE_MIN_QUALITY,
    EQUIP_SLOTS,
    EQUIP_SLOT_NAME,
    STAR_BASE,
    STAR_MAX,
    STAR_PERKS,
    ELEMENTS,
    ELEMENT_LABEL,
    ELEMENT_COLOR,
    ELEMENT_ALIAS,
    HERO_TIER,
    MATERIAL_HEROES,
    WALL_SKILL_SEED,
    WISH_PITY,
    WISH_RATE,
    FORGE_MAX_LV,
    FORGE_LV_GAIN,
    ENEMY_TYPES,
    BOSS_TYPES,
    CHAPTERS,
    TIER_CN,
    ROGUE_BUFFS,
    BUILD_DEFS,
    RES_LABEL,
    OFFLINE_CAP_SEC,
    RES_CN,
    U_NUM,
    DISPLAY_ID_CHARS,
    DISPLAY_ID_LEN,
    DISPLAY_NICK_MAX,
    SMS_ENABLED,
    SMS,
} = require('./server/config');


const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
// ROM 图鉴解析器：街机 ZIP 短名 → 中文名 / 英文原名 / 厂商年份 / 平台 / BIOS / CRC 校验。
// DAT 目录：data/roms/catalog/（后台上传，版本与核心对应）；中文覆盖表：data/rom-zh.json（可在线编辑）
const romCatalog = require('./server/rom-catalog')({
    catalogDir: path.join(DATA_DIR, 'roms', 'catalog'),
    zhFile: path.join(DATA_DIR, 'rom-zh.json'),
    seedFile: path.join(ROOT, 'server', 'rom-zh-seed.json'),
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5180;

// 冒险塔总层数 / 新玩家初始钻石 / 许愿卡单价（钻石）
const MAX_FLOOR = 200;
const INITIAL_GEMS = 100000;
const WISH_CARD_PRICE = 100;

// ============================================================
// 品质体系（七阶）+ 各类别种子表
//   绿=优秀  蓝=精良  紫=史诗  橙=传说  红=远古  金=太古  彩=神话
// 数值越大越稀有 / 基础属性越高。
// 各品类的起品：装备从绿色起、戒指/神器/宝石/古宝从蓝色起、城墙从紫色起。
// ============================================================
// QUALITIES → server/config/qualities.js
// QUALITY_NAME → server/config/qualities.js
// QUALITY_MUL → server/config/qualities.js
// QUALITY_COLOR → server/config/qualities.js
// TYPE_MIN_QUALITY → server/config/qualities.js
// EQUIP_SLOTS → server/config/qualities.js
// EQUIP_SLOT_NAME → server/config/qualities.js

// ============================================================
// 英雄星级：基础 5 星，最高 16 星
//   6★ 起每升 1 星解锁一个「星级天赋」，天赋会真实影响战斗
//   （眩晕 / 增伤 / 复活 / 减伤 / 护盾 / 全队伤害 / 光环 ...）
// ============================================================
// STAR_BASE → server/config/heroes.js   // 初始星级
// STAR_MAX → server/config/heroes.js   // 星级上限
// STAR_PERKS → server/config/heroes.js
function starPerksOf(star) {
    const s = Math.max(STAR_BASE, Math.min(STAR_MAX, star || STAR_BASE));
    return STAR_PERKS.filter(p => p.star <= s);
}
// 升星消耗：金币按星数指数增长，另需钻石（越高星越贵）
function starUpCost(star) {
    const n = Math.max(0, (star || STAR_BASE) - STAR_BASE); // 已升次数
    return {
        gold: Math.floor(20000 * Math.pow(1.55, n)),
        gems: Math.floor(200 * Math.pow(1.35, n)),
        iron: Math.floor(500 * Math.pow(1.4, n)),
    };
}
// 升星额外消耗：材料英雄（3★/4★ 碎片英雄）数量
// 8★ 以下不需要材料，越高星需求越大 —— 让许愿产出的低星英雄有实际用途
function starUpMaterialCost(star) {
    const MAP = { 5: 0, 6: 0, 7: 0, 8: 1, 9: 2, 10: 3, 11: 5, 12: 7, 13: 10, 14: 14, 15: 20 };
    const s = Math.max(STAR_BASE, Math.min(STAR_MAX, star || STAR_BASE));
    return MAP[s] !== undefined ? MAP[s] : 30;
}

// ============================================================
// 许愿池：材料英雄（3★ / 4★）
//   每个系（水/火/风/雷/光/暗）各配 1 个 3★ 与 1 个 4★。
//   它们属性与技能都很弱，**不能上阵**，唯一用途是：
//     ① 许愿产出（让卡池有梯度）
//     ② 当作英雄升星的材料被消耗
//   material:true 是全局开关，前端据此隐藏「上阵」按钮。
// ============================================================
// ============================================================
// 英雄属性（已收敛为 5 系：草 / 水 / 火 / 光 / 暗）
//   原「风」「雷」两系并入「光」；「木」写作「草」
// ============================================================
// ELEMENTS → server/config/heroes.js
// ELEMENT_LABEL → server/config/heroes.js
// ELEMENT_COLOR → server/config/heroes.js
// 老数据迁移映射
// ELEMENT_ALIAS → server/config/heroes.js

// 城墙：每级有独立技能（战斗中可手动/自动释放）
//   type: stun 眩晕 / petrify 石化 / knock 击退 / block 生成阻碍
//         shield 护盾 / dmgup 增伤 / cdreduce 减CD / refresh 刷新必杀
// WALL_SKILL_SEED → server/config/walls.js

// HERO_TIER → server/config/heroes.js
// MATERIAL_HEROES → server/config/heroes.js
// 给材料英雄补齐标记与多技能结构
function normalizeMaterialHero(h) {
    return Object.assign({}, h, {
        material: true,
        skills: [Object.assign({ fx: 'slash', tint: '#b9b3d8' }, h.skill)],
    });
}
// 许愿保底：每累计 N 抽必出 5★（传说+ / 传说）
// WISH_PITY → server/config/wish.js
// WISH_RATE → server/config/wish.js

// ============================================================
// 装备锻造：升级（每级 +8% 属性）+ 升品（绿→蓝→紫→橙→红→金→彩）
// ============================================================
// FORGE_MAX_LV → server/config/wish.js
// FORGE_LV_GAIN → server/config/wish.js   // 每级 +8%
// 锻造升级消耗（当前等级 lv → lv+1）
function forgeLevelCost(lv, quality) {
    const qi = Math.max(0, QUALITIES.indexOf(quality) );
    return {
        gold: Math.floor((400 + 260 * lv) * Math.pow(1.8, qi)),
        iron: Math.floor((30 + 18 * lv) * Math.pow(1.7, qi)),
    };
}
// 升品消耗（下一档品质）
function forgeQualityCost(quality) {
    const ni = QUALITIES.indexOf(quality) + 1;
    if (ni <= 0 || ni >= QUALITIES.length) return null;
    return {
        gold: Math.floor(6000 * Math.pow(2.6, ni - 1)),
        iron: Math.floor(400 * Math.pow(2.2, ni - 1)),
        stone: Math.floor(260 * Math.pow(2.2, ni - 1)),
        gems: Math.floor(30 * Math.pow(2.0, ni - 1)),
    };
}
// 装备实例最终属性：模板基础值 × 品质倍率比 × (1 + 8%×(等级-1))
function equipStats(inst, tpl) {
    if (!inst || !tpl) return { atk: 0, hp: 0 };
    const q = inst.quality || tpl.quality;
    const qRatio = (QUALITY_MUL[q] || 1) / (QUALITY_MUL[tpl.quality] || 1);
    const lvMul = 1 + FORGE_LV_GAIN * Math.max(0, ((inst.lv || 1) - 1));
    return {
        atk: Math.floor((tpl.atk || 0) * qRatio * lvMul),
        hp:  Math.floor((tpl.hp  || 0) * qRatio * lvMul),
    };
}

function seedEquipment() {
    const list = [];
    const S = { weapon: ['铁剑', '银刃', '寒霜剑', '烈焰刀', '嗜血魔剑', '屠龙宝刀', '创世之刃'],
               armor:  ['皮甲', '锁子甲', '秘银战甲', '龙鳞战甲', '深渊铠甲', '永恒之铠', '诸神黄昏'],
               helmet: ['布帽', '钢盔', '紫金冠', '龙角盔', '邪王面具', '神王之冕', '星辰之冠'],
               boots:  ['草鞋', '皮靴', '迅捷之靴', '追风靴', '幻影步履', '时光之靴', '万界之履'] };
    for (const slot of EQUIP_SLOTS) {
        for (let i = 0; i < QUALITIES.length; i++) {
            const q = QUALITIES[i];
            const base = 80 * (slot === 'armor' ? 1.5 : slot === 'boots' ? 0.9 : 1.0);
            const mul = QUALITY_MUL[q];
            list.push({
                id: `eq_${slot}_${q}`,
                slot, quality: q,
                name: S[slot][i],
                atk: slot === 'weapon' || slot === 'helmet' ? Math.floor(base * 1.2 * mul) : 0,
                hp:  slot === 'armor'  || slot === 'boots'  ? Math.floor(base * 4 * mul)   : 0,
                desc: `${QUALITY_NAME[q]}${EQUIP_SLOT_NAME[slot]}，为穿戴者带来属性加成`,
                icon: slot === 'weapon' ? '⚔️' : slot === 'armor' ? '🛡' : slot === 'helmet' ? '👑' : '👢',
            });
        }
    }
    return list;
}
function seedRings() {
    const list = [];
    const N = ['蓝晶戒', '紫晶戒', '红宝戒', '琥珀戒', '血玉戒', '帝皇戒', '神谕之戒'];
    for (let i = 0; i < QUALITIES.length; i++) {
        const q = QUALITIES[i];
        const mul = QUALITY_MUL[q];
        list.push({
            id: `ring_${q}`,
            quality: q, name: N[i],
            atkPct: Math.floor(2 * mul),
            hpPct:  Math.floor(3 * mul),
            desc: `${QUALITY_NAME[q]}戒指，攻/生命 双加成`,
            icon: '💍',
        });
    }
    return list;
}
function seedArtifacts() {
    const list = [];
    const N = ['月光宝盒', '玄铁法杖', '雷神之锤', '圣光之剑', '末日之刃', '永恒权杖', '创世神格'];
    for (let i = 0; i < QUALITIES.length; i++) {
        const q = QUALITIES[i];
        const mul = QUALITY_MUL[q];
        list.push({
            id: `art_${q}`,
            quality: q, name: N[i],
            lvAtkBase: Math.floor(20 * mul),
            lvHpBase:  Math.floor(120 * mul),
            // 升星：每颗星额外给技能加成的百分比（最终技能伤害 ×(1 + starBonus/100)）
            starSkillPct: 8 * (i + 1),
            maxStar: 10,
            maxLevel: 100,
            desc: `${QUALITY_NAME[q]}神器，升星可强化技能，升级可提升攻/生命`,
            icon: '🔮',
        });
    }
    return list;
}
function seedGems() {
    const list = [];
    const T = {
        blue:    { atk: '黄玉', hp: '翠玉' },
        purple:  { atk: '紫晶', hp: '玛瑙' },
        orange:  { atk: '琥珀', hp: '月光石' },
        red:     { atk: '赤焰石', hp: '霜华石' },
        gold:    { atk: '日耀石', hp: '月华石' },
        rainbow: { atk: '神谕石', hp: '万象石' },
    };
    for (const q of Object.keys(T)) {
        const mul = QUALITY_MUL[q];
        list.push({ id: `gem_atk_${q}`,  type: 'atk', quality: q, name: T[q].atk,  atkPct: Math.floor(2 * mul),  icon: '💎' });
        list.push({ id: `gem_hp_${q}`,   type: 'hp',  quality: q, name: T[q].hp,   hpPct:  Math.floor(3 * mul),  icon: '💠' });
    }
    return list;
}
// 活动：repeat 决定领取周期 —— daily 每天 1 次 / once 终身 1 次 / login 累计登录 N 天
function seedEvents() {
    return [
        { id: 'welcome', name: '🎉 开服礼包', type: 'once', repeat: 'once', active: true,
          desc: '新玩家注册即可领取的开服大礼：钻石 2000、许愿卡 20、金币 20000',
          rewards: { gems: 2000, wishCards: 20, gold: 20000 }, startTime: 0, endTime: 0 },
        { id: 'daily', name: '📅 每日签到', type: 'daily', repeat: 'daily', active: true,
          desc: '每天可领一次：钻石 100、金币 5000、许愿卡 1',
          rewards: { gems: 100, gold: 5000, wishCards: 1 }, startTime: 0, endTime: 0 },
        { id: 'login7', name: '🗓 七日登录', type: 'login', repeat: 'login', needDays: 7, active: true,
          desc: '累计登录满 7 天领取：钻石 2000、许愿卡 10、金币 50000',
          rewards: { gems: 2000, wishCards: 10, gold: 50000 }, startTime: 0, endTime: 0 },
        { id: 'online', name: '⏰ 在线奖励', type: 'daily', repeat: 'daily', active: true,
          desc: '每天可领一次：木材 / 铁矿 / 石币 各 2000',
          rewards: { wood: 2000, iron: 2000, stone: 2000 }, startTime: 0, endTime: 0 },
    ];
}

// ---------------- 数据层 ----------------
// 英雄静态配置（名称/属性/技能/立绘）属于代码资产，放在 data/heroes.seed.json 并进版本库。
// 玩家存档 data/db.json 不进版本库，避免自动部署时用本地测试存档覆盖线上真实数据。
// 新建存档时优先读种子文件；没有则回退到内置种子（并保持与 MATERIAL_HEROES 拼接）。
function loadHeroSeed() {
    try {
        const f = path.join(DATA_DIR, 'heroes.seed.json');
        if (!fs.existsSync(f)) return null;
        const list = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (!Array.isArray(list) || !list.length) return null;
        return list.map(h => Object.assign({}, h, {
            material: false,
            skills: (Array.isArray(h.skills) && h.skills.length)
                ? h.skills
                : [h.skill].filter(Boolean),
        })).concat(MATERIAL_HEROES.map(normalizeMaterialHero));
    } catch (e) {
        console.error('[game] 读取 heroes.seed.json 失败，回退内置种子：' + e.message);
        return null;
    }
}

function ensureData() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        const seedHeroes = [
            // 传说+
            { id: 'h1', name: '小甜心爱洛', rarity: '传说+', img: '12ca7235d433cc289910c67477e8a921.jpg', element: '水', baseAtk: 1800, baseHp: 12000, skill: { name: '甜蜜冲击', desc: '对全体敌人造成 220% 攻击力的伤害', cd: 6, multiplier: 2.2 } },
            { id: 'h2', name: '猩红塞拉斯', rarity: '传说+', img: '49aea3d660f9c6cdde1b1132070346bf.jpg', element: '火', baseAtk: 2100, baseHp: 10500, skill: { name: '猩红之刃', desc: '对单体敌人造成 350% 攻击力的伤害', cd: 8, multiplier: 3.5 } },
            { id: 'h3', name: '时空主温温', rarity: '传说+', img: '998b9dbd80c5cb4f7bd3f63ab61955b0.jpg', element: '风', baseAtk: 1900, baseHp: 11000, skill: { name: '时空静止', desc: '冻结全体敌人 2 回合', cd: 10, multiplier: 0 } },
            { id: 'h4', name: '歌姬妮妮', rarity: '传说+', img: 'a13c525ced52b9e4b62bc9fed7fde3e7.jpg', element: '光', baseAtk: 1700, baseHp: 13000, skill: { name: '天籁之音', desc: '全体队友恢复 80% 攻击力生命', cd: 7, multiplier: 0.8 } },
            // 传说
            { id: 'h5', name: '破坏神娜娜', rarity: '传说', img: 'bbf34fedc435bb32a4f253c4d534f749.jpg', element: '暗', baseAtk: 1600, baseHp: 9500, skill: { name: '破坏之锤', desc: '对全体造成 180% 攻击力伤害', cd: 6, multiplier: 1.8 } },
            { id: 'h6', name: '女皇伊琳娜', rarity: '传说', img: 'ea76341fd05983658c4bb91dacbfa6a7.jpg', element: '暗', baseAtk: 1750, baseHp: 10000, skill: { name: '女皇威严', desc: '对全体造成 200% 伤害并降低 20% 攻击 2 回合', cd: 8, multiplier: 2.0 } },
            { id: 'h7', name: '魔女法琳娜', rarity: '传说', img: 'fdd9ed6ebe13b9ec2aa3229491c1c0b0.jpg', element: '火', baseAtk: 1850, baseHp: 9800, skill: { name: '烈焰风暴', desc: '对全体造成 240% 攻击力伤害', cd: 7, multiplier: 2.4 } },
            { id: 'h8', name: '狐妖贝拉', rarity: '传说', img: '676cb111b072644e07eca0205fde7e46.jpg', element: '火', baseAtk: 1700, baseHp: 10200, skill: { name: '狐火灼烧', desc: '对全体造成 210% 伤害并附加持续灼烧', cd: 6, multiplier: 2.1 } },
            { id: 'h9', name: '暗之墓', rarity: '传说', img: 'abc27a5c284716f6a35c9def5194681d.jpg', element: '暗', baseAtk: 1650, baseHp: 11500, skill: { name: '暗影之墓', desc: '召唤暗影对单体造成 280% 伤害', cd: 9, multiplier: 2.8 } },
            { id: 'h10', name: '断月镰希芙', rarity: '传说', img: '9075acf86647618342f93a4c381325de.jpg', element: '暗', baseAtk: 2000, baseHp: 9500, skill: { name: '断月镰舞', desc: '对全体造成 260% 伤害', cd: 7, multiplier: 2.6 } },
            { id: 'h11', name: '月神露西亚', rarity: '史诗', img: '8f83fcc3594f42b2255e89fa6d92087f.jpg', element: '光', baseAtk: 1300, baseHp: 8500, skill: { name: '月光护体', desc: '为全体队友增加 30% 防御 3 回合', cd: 8, multiplier: 0 } },
            { id: 'h12', name: '万伏小蓝星', rarity: '史诗', img: '334e58d177ff09e1596efc29fcf9272f.jpg', element: '雷', baseAtk: 1400, baseHp: 8000, skill: { name: '万伏雷击', desc: '对全体造成 200% 伤害', cd: 6, multiplier: 2.0 } },
            { id: 'h13', name: '太阳神夏夏', rarity: '史诗', img: '959ce43f76b0a3a4e9457954a94877be.jpg', element: '火', baseAtk: 1350, baseHp: 8200, skill: { name: '太阳耀斑', desc: '对全体造成 220% 伤害', cd: 7, multiplier: 2.2 } },
            { id: 'h14', name: '奥特曼赛文', rarity: '稀有', img: '190d56e2109249d36d163f91e3b6b8e6.jpg', element: '光', baseAtk: 950, baseHp: 6500, skill: { name: '光线射击', desc: '对全体造成 150% 伤害', cd: 5, multiplier: 1.5 } },
            { id: 'h15', name: '神女轻音', rarity: '史诗', img: '5a271cca164839198adfb956595396a1.jpg', element: '风', baseAtk: 1250, baseHp: 8800, skill: { name: '微风吟唱', desc: '全体恢复 60% 攻击力生命', cd: 7, multiplier: 0.6 } },
        ].concat(MATERIAL_HEROES.map(normalizeMaterialHero));
        const heroes = loadHeroSeed() || seedHeroes;

        const treasureSeeds = [
            { id: 't1', name: '古玉佩', desc: '生命 +5%', atkPct: 0, hpPct: 5 },
            { id: 't2', name: '青铜爵', desc: '攻击 +5%', atkPct: 5, hpPct: 0 },
            { id: 't3', name: '琉璃盏', desc: '攻击 +10%，生命 +10%', atkPct: 10, hpPct: 10 },
            { id: 't4', name: '龙纹璧', desc: '攻击 +15%', atkPct: 15, hpPct: 0 },
            { id: 't5', name: '玉玲珑', desc: '生命 +15%', atkPct: 0, hpPct: 15 },
            { id: 't6', name: '玄铁令', desc: '攻击 +20%，生命 +20%', atkPct: 20, hpPct: 20 },
        ];

        const wallSkills = WALL_SKILL_SEED;

        // ============================================================
        // 品质体系（七阶）
        //   绿=优秀  蓝=精良  紫=史诗  橙=传说  红=远古  金=太古  彩=神话
        // 数值越大越稀有 / 基础属性越高。
        // 各品类的起品：装备从绿色起、戒指/神器/宝石/古宝从蓝色起、城墙从紫色起。
        // ============================================================
        const QUALITIES = ['green', 'blue', 'purple', 'orange', 'red', 'gold', 'rainbow'];
        const QUALITY_NAME = { green: '优秀', blue: '精良', purple: '史诗', orange: '传说', red: '远古', gold: '太古', rainbow: '神话' };
        const QUALITY_MUL = { green: 1, blue: 1.6, purple: 2.6, orange: 4.2, red: 6.5, gold: 10, rainbow: 16 };
        const QUALITY_COLOR = {
            green: '#5cd65c', blue: '#5cc7ff', purple: '#b78bff',
            orange: '#ff9d5c', red: '#ff5252', gold: '#ffd56b', rainbow: '#ff7adf',
        };
        const TYPE_MIN_QUALITY = {
            equipment: 'green', ring: 'blue', artifact: 'blue',
            gem: 'blue', wall: 'purple', treasure: 'blue',
        };

        // 装备位（4 位）
        const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'boots'];
        const EQUIP_SLOT_NAME = { weapon: '武器', armor: '护甲', helmet: '头盔', boots: '鞋子' };

        const initial = {
            users: {}, // id -> {id,username,password,isAdmin,createdAt, lastSeen}
            tokens: {}, // token -> userId
            heroes: heroes,
            treasures: treasureSeeds,
            wallSkills: wallSkills,
            equipmentTemplates: seedEquipment(),
            ringTemplates: seedRings(),
            artifactTemplates: seedArtifacts(),
            gemTemplates: seedGems(),
            events: seedEvents(),
            chat: [], // {user,text,time}
            mails: [], // {id,to,toAll,title,content,rewards,time,claimed,from}
            clans: {}, // id -> {id,name,leaderId,createdAt}
            world: {}, // userId -> {pos,level,exp, ...}
            ancient: [], // 远古事件日志
            _meta: {
                qualities: QUALITIES, qualityName: QUALITY_NAME, qualityColor: QUALITY_COLOR,
                typeMinQuality: TYPE_MIN_QUALITY,
                equipSlots: EQUIP_SLOTS, equipSlotName: EQUIP_SLOT_NAME,
            },
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    }
}

ensureData();

// ---------------- 持久化存储 ----------------
// 所有账号 / 聊天 / 邮件 / 部落 / 玩家进度都写在 data/db.json（磁盘文件，重启不丢）。
// 启动时自动备份；写入采用「临时文件 + rename」原子替换；进程退出前强制落盘。
function backupDB() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        if (!fs.existsSync(DB_PATH)) return;
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
        fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `db-${stamp}.json`));
        pruneBackups();
    } catch (e) { console.error('[game] 备份失败：' + e.message); }
}
// 备份保留策略：最近 12 份全留 + 每天最早 1 份保留 14 天（其余删除，避免磁盘被撑爆）
function pruneBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR).filter(f => /^db-.*\.json$/.test(f)).sort();
        const keep = new Set(files.slice(-12));
        const byDay = {};
        for (const f of files) { const day = f.slice(3, 13); if (!byDay[day]) byDay[day] = f; }
        Object.values(byDay).slice(-14).forEach(f => keep.add(f));
        for (const f of files) if (!keep.has(f)) fs.unlinkSync(path.join(BACKUP_DIR, f));
    } catch (e) { console.error('[game] 清理备份失败：' + e.message); }
}
// 每小时自动备份一次（不只是启动时）
setInterval(backupDB, 60 * 60 * 1000);

function loadDB() {
    let raw = null;
    try { raw = fs.readFileSync(DB_PATH, 'utf8'); } catch (e) { /* 不存在时由 ensureData 兜底 */ }
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            backupDB();
            return parsed;
        } catch (e) {
            // 主文件损坏：回退到最近一份备份
            if (fs.existsSync(BACKUP_DIR)) {
                const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db-')).sort();
                for (let i = files.length - 1; i >= 0; i--) {
                    try {
                        const back = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, files[i]), 'utf8'));
                        console.error(`[game] db.json 解析失败，已回退备份 ${files[i]}`);
                        return back;
                    } catch (e2) { /* 继续找上一份 */ }
                }
            }
            throw new Error('db.json 损坏且无可用备份');
        }
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

let DB = loadDB();

// 落盘状态（防抖 + 原子替换），声明要早于所有启动迁移脚本
let _dirty = false, _flushTimer = null;

// 英雄表迁移：以 data/heroes.json 为准（由截图裁剪生成，含真实英雄名与立绘）
(function migrateHeroes() {
    const hp = path.join(DATA_DIR, 'heroes.json');
    if (!fs.existsSync(hp)) return;
    let fresh;
    try { fresh = JSON.parse(fs.readFileSync(hp, 'utf8')); } catch (e) { return; }
    if (!Array.isArray(fresh) || !fresh.length) return;
    const stale = !DB.heroes.length || !String(DB.heroes[0].img || '').startsWith('heroes/');
    if (stale) {
        DB.heroes = fresh;
        // 旧英雄 id 已失效：清空玩家英雄并按数量补偿许愿卡
        let cleared = 0;
        for (const uid of Object.keys(DB.users)) {
            const u = DB.users[uid];
            if (!u.state) continue;
            const n = (u.state.heroes || []).length;
            if (n) cleared++;
            u.state.heroes = [];
            u.state.equipped = [];
            u.state.wishCards = (u.state.wishCards || 0) + Math.max(3, n);
        }
        save();
        console.log(`[game] 英雄表已更新：${fresh.length} 个英雄（重置 ${cleared} 名玩家的旧英雄并补偿许愿卡）`);
    }

    // 技能特效字段同步：heroes.json 是模板真源，缺 fx/tint 的英雄按 id 补齐，
    // 后台自定义新增的英雄（不在 heroes.json 里）保持原样不丢。
    const tpl = new Map(fresh.map(h => [h.id, h]));
    let synced = 0;
    for (const h of DB.heroes) {
        const f = tpl.get(h.id);
        if (!f || !f.skill) continue;
        if (!h.skill) h.skill = {};
        if (h.skill.fx !== f.skill.fx || h.skill.tint !== f.skill.tint) {
            h.skill.fx = f.skill.fx || 'slash';
            h.skill.tint = f.skill.tint || '#ffd56b';
            synced++;
        }
    }
    if (synced) {
        save();
        console.log(`[game] 已同步 ${synced} 个英雄的技能特效`);
    }
})();

// 兜底：保证没有任何玩家的许愿卡被卡在 0（否则将无法获得第一个英雄）
(function ensureWishCards() {
    let fixed = 0;
    for (const uid of Object.keys(DB.users)) {
        const u = DB.users[uid];
        if (!u.state) continue;
        const noHero = !(u.state.heroes || []).length;
        if (noHero && (u.state.wishCards || 0) < 10) { u.state.wishCards = 10; fixed++; }
    }
    if (fixed) { save(); console.log(`[game] 已为 ${fixed} 名无英雄玩家补足许愿卡`); }
})();

// 老存档补发钻石 / 补齐资源字段
(function migrateResources() {
    let fixed = 0;
    for (const uid of Object.keys(DB.users)) {
        const u = DB.users[uid];
        if (!u.state) continue;
        u.state.resources = u.state.resources || {};
        let changed = false;
        for (const k of ['gold', 'wood', 'iron', 'stone', 'exp']) {
            if (typeof u.state.resources[k] !== 'number') { u.state.resources[k] = 0; changed = true; }
        }
        if (typeof u.state.resources.gems !== 'number') { u.state.resources.gems = INITIAL_GEMS; changed = true; }
        if (typeof u.state.wishCards !== 'number') { u.state.wishCards = 10; changed = true; }
        if (!u.state.lastTick) { u.state.lastTick = Date.now(); changed = true; }
        if (changed) fixed++;
    }
    if (fixed) { save(); console.log(`[game] 已为 ${fixed} 名玩家补齐资源字段（钻石 ${INITIAL_GEMS}）`); }
})();

// 新表数据兜底迁移：老存档没有装备/戒指/神器/宝石/活动表，会自动按代码当前默认值补齐
(function migrateNewTables() {
    let changed = false;
    if (!Array.isArray(DB.equipmentTemplates) || !DB.equipmentTemplates.length) {
        DB.equipmentTemplates = seedEquipment();
        changed = true;
    }
    if (!Array.isArray(DB.ringTemplates) || !DB.ringTemplates.length) {
        DB.ringTemplates = seedRings();
        changed = true;
    }
    if (!Array.isArray(DB.artifactTemplates) || !DB.artifactTemplates.length) {
        DB.artifactTemplates = seedArtifacts();
        changed = true;
    }
    if (!Array.isArray(DB.gemTemplates) || !DB.gemTemplates.length) {
        DB.gemTemplates = seedGems();
        changed = true;
    }
    if (!Array.isArray(DB.events) || !DB.events.length) { DB.events = seedEvents(); changed = true; }
    if (!Array.isArray(DB.giftCodes)) { DB.giftCodes = []; changed = true; }
    if (!DB._meta) {
        DB._meta = {
            qualities: QUALITIES, qualityName: QUALITY_NAME, qualityColor: QUALITY_COLOR,
            typeMinQuality: TYPE_MIN_QUALITY,
            equipSlots: EQUIP_SLOTS, equipSlotName: EQUIP_SLOT_NAME,
        };
        changed = true;
    }
    // 星级体系：老存档的英雄星级统一抬到 5★ 起；活动补 repeat 字段
    DB._meta.starBase = STAR_BASE;
    DB._meta.starMax = STAR_MAX;
    DB._meta.starPerks = STAR_PERKS;
    DB._meta.forgeMaxLv = FORGE_MAX_LV;
    DB._meta.forgeLvGain = Math.round(FORGE_LV_GAIN * 100);
    if (changed) save();
})();

// 老英雄数据迁移：星级抬到 5★、装备字符串升级为可锻造实例、登录天数初始化
(function migrateHeroStars() {
    let fixed = 0, eqFixed = 0;
    for (const uid of Object.keys(DB.users)) {
        const u = DB.users[uid];
        if (!u.state) continue;
        let changed = false;
        for (const oh of (u.state.heroes || [])) {
            if (typeof oh.star !== 'number' || oh.star < STAR_BASE) { oh.star = STAR_BASE; changed = true; }
            if (oh.star > STAR_MAX) { oh.star = STAR_MAX; changed = true; }
            // 装备槽：老数据只存了模板 id 字符串，升级为 {id, lv, quality}
            if (oh.equip) {
                for (const slot of EQUIP_SLOTS) {
                    const v = oh.equip[slot];
                    if (typeof v === 'string') {
                        const tpl = DB.equipmentTemplates.find(x => x.id === v);
                        oh.equip[slot] = { id: v, lv: 1, quality: tpl ? tpl.quality : 'green' };
                        eqFixed++; changed = true;
                    }
                }
            }
        }
        if (!u.state.claimedEvents) { u.state.claimedEvents = {}; changed = true; }
        if (typeof u.state.loginDays !== 'number') { u.state.loginDays = 1; changed = true; }
        if (changed) fixed++;
    }
    if (fixed) {
        save();
        console.log(`[game] 已迁移 ${fixed} 名玩家的星级/装备数据（基础 ${STAR_BASE}★，锻造实例 ${eqFixed} 件）`);
    }
})();

// 英雄多技能迁移：老英雄只有 1 个 skill，这里按元素补 1~2 个额外技能
(function migrateHeroSkills() {
    const EXTRA = {
        草: { name: '藤蔓缠绕', desc: '对全体造成 160% 伤害并束缚 1 秒', cd: 8,  multiplier: 1.6, fx: 'wind' },
        水: { name: '潮汐涌动', desc: '对全体造成 180% 伤害并冻结 1 秒', cd: 9,  multiplier: 1.8, fx: 'tidal' },
        火: { name: '烈焰爆裂', desc: '对单体造成 260% 伤害并灼烧',       cd: 8,  multiplier: 2.6, fx: 'burn' },
        光: { name: '圣光普照', desc: '全体恢复 70% 攻击力生命并减伤',   cd: 9,  multiplier: 0.7, fx: 'holy' },
        暗: { name: '暗影侵蚀', desc: '对全体造成 220% 伤害并削弱攻击',   cd: 10, multiplier: 2.2, fx: 'dark' },
    };
    let added = 0;
    for (const t of DB.heroes) {
        if (Array.isArray(t.skills) && t.skills.length) continue;
        const main = t.skill || { name: '默认技能', desc: '造成 150% 攻击伤害', cd: 5, multiplier: 1.5 };
        const e = EXTRA[t.element] || EXTRA.火;
        t.skills = [
            { ...main },
            { name: e.name, desc: e.desc, cd: e.cd, multiplier: e.multiplier, fx: e.fx, tint: t.skill && t.skill.tint ? t.skill.tint : '#ffd56b' },
        ];
        added++;
    }
    if (added) { save(); console.log(`[game] 已为 ${added} 个英雄补齐第二技能`); }
})();

// 迁移：为老存档补充 3★/4★ 材料英雄（许愿池产出 + 升星材料）
(function migrateMaterialHeroes() {
    if (!Array.isArray(DB.heroes)) return;
    let added = 0;
    for (const m of MATERIAL_HEROES) {
        if (DB.heroes.some(h => h.id === m.id)) continue;
        DB.heroes.push(normalizeMaterialHero(m));
        added++;
    }
    // 老英雄补 tier（默认 5★，可上阵）
    for (const h of DB.heroes) {
        if (h.tier === undefined) h.tier = h.material ? (h.rarity === '精英' ? 4 : 3) : 5;
        if (h.material === undefined) h.material = false;
    }
    if (added) { save(); console.log(`[game] 已补充 ${added} 个材料英雄（3★/4★，许愿产出与升星材料）`); }
})();

// 迁移：给老存档的城墙等级补上「专属技能」字段
(function migrateWallSkills() {
    if (!Array.isArray(DB.wallSkills)) return;
    let fixed = 0;
    for (const seed of WALL_SKILL_SEED) {
        const cur = DB.wallSkills.find(w => w.lv === seed.lv);
        if (cur && !cur.skill) { cur.skill = seed.skill; fixed++; }
    }
    if (fixed) { save(); console.log(`[game] 已为 ${fixed} 级城墙补上专属技能`); }
})();

// 迁移：属性收敛 6 系（水火风雷光暗）→ 5 系（草水火光暗）
//   ① 英雄模板：木→草、风/雷→光
//   ② 废弃旧材料英雄（原风系 m33/m43、雷系 m34/m44），改为草系 m37/m47
//   ③ 玩家背包里的旧材料英雄实例同步换成草系
(function migrateElements() {
    if (!Array.isArray(DB.heroes)) return;
    let ch = 0;
    for (const t of DB.heroes) {
        if (ELEMENT_ALIAS[t.element]) { t.element = ELEMENT_ALIAS[t.element]; ch++; }
    }
    const DROP = { m33: 'm37', m34: 'm37', m43: 'm47', m44: 'm47' };
    // 材料英雄头像改为程序生成的原创 SVG（public/img/material/）
    for (const m of MATERIAL_HEROES) {
        const t = DB.heroes.find(h => h.id === m.id);
        if (t && t.img !== m.img) { t.img = m.img; ch++; }
    }
    const before = DB.heroes.length;
    DB.heroes = DB.heroes.filter(h => !DROP[h.id]);
    const dropped = before - DB.heroes.length;

    let conv = 0;
    for (const uid of Object.keys(DB.users)) {
        const u = DB.users[uid];
        if (!u || !u.state || !Array.isArray(u.state.heroes)) continue;
        for (const oh of u.state.heroes) {
            if (DROP[oh.id]) { oh.id = DROP[oh.id]; conv++; }
        }
    }
    if (ch || dropped || conv) {
        save();
        console.log(`[game] 属性收敛：${ch} 个英雄归一到 5 系，删除 ${dropped} 个旧材料模板，${conv} 个玩家材料英雄转为草系`);
    }
})();

// 迁移：补许愿保底计数器
(function migrateWishPity() {
    let fixed = 0;
    for (const uid of Object.keys(DB.users)) {
        const st = DB.users[uid] && DB.users[uid].state;
        if (!st) continue;
        if (typeof st.wishPity !== 'number') { st.wishPity = 0; fixed++; }
    }
    if (fixed) { save(); console.log(`[game] 已为 ${fixed} 名玩家初始化许愿保底计数`); }
})();

// 写入磁盘：合并 200ms 内的多次改动，再用「临时文件 + rename」原子替换，
// 避免写到一半进程退出导致 db.json 损坏。（变量提前声明，迁移脚本在上方就会调用 save()）
function save() {
    _dirty = true;
    if (_flushTimer) return;
    _flushTimer = setTimeout(() => { _flushTimer = null; flush(); }, 200);
}
// 英雄配置变更（改名 / 改技能 / 换立绘）：MySQL 模式下额外写回 heroes 表
let _heroesDirty = false;
function saveHeroes() {
    _heroesDirty = true;
    save();
}
function flush() {
    if (!_dirty) return;
    _dirty = false;
    // MySQL 模式：玩家数据写库，不写 db.json（代码回滚 / 重新部署都不会碰到玩家数据）
    if (Store.isMySQL()) {
        const p = Store.saveState(DB);
        if (_heroesDirty) {
            _heroesDirty = false;
            p.then(() => Store.saveHeroes(DB.heroes))
                .catch(e => console.error('[game] 英雄写库失败：' + e.message));
        }
        p.catch(e => {
            _dirty = true;
            console.error('[game] MySQL 保存失败：' + e.message);
        });
        return;
    }
    try {
        const tmp = DB_PATH + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(DB, null, 2));
        fs.renameSync(tmp, DB_PATH);
    } catch (e) {
        _dirty = true;
        console.error('[game] 保存失败：' + e.message);
    }
}
// 兜底：每 10 秒补写一次，以及进程退出 / 崩溃前强制落盘
setInterval(flush, 10000);
function flushAndExit(code) {
    // 注意：SIGINT/SIGTERM 处理器传进来的是**信号名字符串**（'SIGTERM'），
    // 直接喂给 process.exit 会抛 ERR_INVALID_ARG_TYPE（历史 bug）→ 进程退不掉
    // → systemd stop-sigterm 超时 → SIGKILL，日志刷「Failed with result 'timeout'」。
    const exitCode = typeof code === 'number' ? code : 0;
    if (Store.isMySQL()) {
        Store.saveState(DB)
            .then(() => Store.close())
            .catch(e => console.error('[game] 退出前保存失败：' + e.message))
            .finally(() => process.exit(exitCode));
        return;
    }
    flush();
    process.exit(exitCode);
}
process.on('SIGINT', flushAndExit);
process.on('SIGTERM', flushAndExit);
process.on('beforeExit', flush);
process.on('uncaughtException', e => { console.error('[game] 未捕获异常：', e && e.stack || e); flush(); });
// Node 15+ 起「未处理的 Promise 拒绝」会直接杀进程。线上 MySQL 偶发抖动、
// 某个请求里的 async 报错都可能触发 → 表现为 systemd Restart=always 不停
// 拉起又崩（外部看就是「服务起不来」）。这里只记录不退出，避免整站挂掉。
process.on('unhandledRejection', (reason) => {
    console.error('[game] 未处理的 Promise 拒绝（已忽略，进程继续）：', reason && reason.stack || reason);
});

// ---------------- 营地：建筑产出 ----------------
// rate = 每级「每分钟」产出量；研究院不直接产出，而是给全部建筑提供加成
// BUILD_DEFS → server/config/buildings.js
// RES_LABEL → server/config/buildings.js
// OFFLINE_CAP_SEC → server/config/buildings.js // 挂机收益最多累计 12 小时

// 当前每分钟产出（含研究院加成）
function productionRates(u) {
    const b = u.buildings || {};
    const bonus = 1 + ((b.research || 0) * 6) / 100;
    const perMin = {};
    for (const d of BUILD_DEFS) {
        const lv = b[d.key] || 0;
        for (const k of Object.keys(d.out)) perMin[k] = (perMin[k] || 0) + d.out[k] * lv * bonus;
    }
    return { perMin, bonus };
}

function gainOf(perMin, seconds) {
    const out = {};
    for (const k of Object.keys(perMin)) out[k] = perMin[k] * seconds / 60;
    return out;
}

// 结算从 lastTick 到现在的挂机产出（返回实际入账的量）
function applyProduction(u, now) {
    const dt = Math.min(Math.max(0, (now - (u.lastTick || now)) / 1000), OFFLINE_CAP_SEC);
    u.lastTick = now;
    if (dt < 1) return null;
    const { perMin } = productionRates(u);
    const gains = gainOf(perMin, dt);
    u.resources = u.resources || {};
    for (const k of Object.keys(gains)) u.resources[k] = (u.resources[k] || 0) + gains[k];
    return { seconds: dt, gains };
}

// 营地产出以「挂机收益」形式累积（最多 12 小时），由玩家在营地页手动领取，
// 这样每时每刻都能看到具体累积了多少资源；离线期间同样会累积。
// （不再后台静默自动入账，避免玩家看不到产出来源）

// ---------------- 工具函数 ----------------
function hashPassword(pw, salt) {
    salt = salt || crypto.randomBytes(8).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
    return salt + '$' + hash;
}
function verifyPassword(pw, stored) {
    const [salt] = stored.split('$');
    return hashPassword(pw, salt) === stored;
}
function newId() { return crypto.randomBytes(6).toString('hex'); }
function newToken() { return crypto.randomBytes(16).toString('hex'); }

// ---- 昵称 / 展示 ID ----
// 展示 ID：14 位字母数字混合（去掉易混的 0/O/1/I），形如 LPFR3NMNS7372C
//   32^14 ≈ 2×10^21 种组合，足够支撑上亿玩家无碰撞
//   不加 # 之类的装饰符——这就是别人找你时用的「账号标识」，纯字符串更通用
// DISPLAY_ID_CHARS → server/config/ids.js
// DISPLAY_ID_LEN → server/config/ids.js
// DISPLAY_NICK_MAX → server/config/ids.js
function genDisplayId() {
    const out = new Uint32Array(DISPLAY_ID_LEN);
    crypto.randomFillSync(out);
    let s = '';
    for (let i = 0; i < DISPLAY_ID_LEN; i++) s += DISPLAY_ID_CHARS[out[i] % DISPLAY_ID_CHARS.length];
    return s;
}
function newDisplayId() {
    const taken = new Set(Object.values(DB.users).map(u => u.displayId).filter(Boolean));
    for (let i = 0; i < 50; i++) {
        const id = genDisplayId();
        if (!taken.has(id)) return id;
    }
    // 极小概率连撞 50 次：用时间戳兜底，仍保持 14 位
    return Date.now().toString(36).toUpperCase().padStart(14, '0').slice(-14);
}
// 昵称合法性：2-12 字符（中文算 1 个字符），首尾不能有空格，禁止纯空白
function validNickname(n) {
    if (typeof n !== 'string') return '昵称不合法';
    const s = n.trim();
    if (s.length < 2) return '昵称至少 2 个字符';
    if (s.length > DISPLAY_NICK_MAX) return `昵称最多 ${DISPLAY_NICK_MAX} 个字符`;
    if (/^\s|\s$/.test(n)) return '昵称首尾不能有空格';
    if (/[<>]|[\u0000-\u001f]/.test(s)) return '昵称含非法字符';
    return null;
}
// 给老账号补齐昵称与展示 ID（升级后首次启动执行）
// 展示 ID 格式从「#XXXXXX 6位」改为「14 位字母数字」（更通用、更长）。老格式自动重发。
function migrateNicknames() {
    let changed = 0;
    const idRe = /^[2-9A-HJ-NP-Z]{14}$/;
    for (const u of Object.values(DB.users)) {
        if (!u.nickname) { u.nickname = u.username || ('冒险者' + String(u.id).slice(-4)); changed++; }
        if (!u.displayId || !idRe.test(u.displayId)) { u.displayId = newDisplayId(); changed++; }
    }
    if (changed) { save(); console.log(`[game] 已为老账号补齐昵称/展示 ID（${changed} 处）`); }
}

// 默认昵称：勇者 + 4 位随机字母数字（全服唯一，玩家之后可自己改）
function genDefaultNickname() {
    const taken = new Set(Object.values(DB.users).map(u => u.nickname).filter(Boolean));
    for (let i = 0; i < 200; i++) {
        let s = '';
        for (let j = 0; j < 4; j++) s += DISPLAY_ID_CHARS[crypto.randomInt(DISPLAY_ID_CHARS.length)];
        const n = '勇者' + s;
        if (!taken.has(n)) return n;
    }
    // 极小概率撞车：加长到 6 位
    return '勇者' + crypto.randomBytes(3).toString('hex').toUpperCase();
}
// 手机号格式：11 位、1 开头、第二位 3-9
function validPhone(p) {
    return typeof p === 'string' && /^1[3-9]\d{9}$/.test(p);
}
// 手机号脱敏展示：138****1234
function maskPhone(p) {
    return (p && p.length === 11) ? p.slice(0, 3) + '****' + p.slice(7) : '';
}

// ---------------- 短信验证码 ----------------
// 短信通道总开关（2026-09-09 下线）：
//   真实短信需购买厂商套餐（腾讯云/阿里云 SMS 按条计费，约 0.045 元/条），
//   当前未接入付费服务商，整条手机验证码通道暂停 —— 保留代码，接通后置 true 即恢复。
// SMS_ENABLED → server/config/ids.js
// 开发模式（默认）：验证码打印到服务端控制台，并提供后台接口查看，方便联调；
// 接真实短信：设置 SMS_PROVIDER=tencent 后在此处接入厂商 SDK（见 deploy/README.md）。
// SMS → server/config/ids.js
// 自然日 key（用于每日奖励 / 累计登录天数）
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 每次进入游戏调用：刷新累计登录天数（同一天只算 1 天）
function touchLogin(u) {
    if (!u) return;
    const t = todayKey();
    if (u.lastLoginDay !== t) {
        u.lastLoginDay = t;
        u.loginDays = (u.loginDays || 0) + 1;
        save();
    }
    if (typeof u.loginDays !== 'number' || u.loginDays < 1) u.loginDays = 1;
}

function defaultUserState(username) {
    return {
        username,
        resources: { gold: 100, wood: 100, iron: 50, stone: 50, exp: 0, gems: INITIAL_GEMS },
        buildings: { camp: 1, forge: 1, research: 1, hunt: 1, mine: 1 },
        wall: { lv: 1, name: '青石墙' },
        treasures: [], // 装备的古宝 id
        heroes: [], // 拥有的英雄 uid 数组（每个是 {uid, id, lv, exp, equip, ring, artifact, gems}）
        equipped: [], // 上阵英雄 uid 数组
        wishCards: 10, // 新手初始许愿卡
        claimedEvents: {}, // 活动领取记录：{ eventId: 'YYYY-MM-DD' 或 true }
        loginDays: 1,      // 累计登录天数
        lastLoginDay: todayKey(),
        // maxFloor = 已通关的最高层（0 表示尚未通关任何一层）
        tower: { floor: 1, maxFloor: 0 },
        ancient: { floor: 1, maxFloor: 0 },
        clanId: null,
        lastTick: Date.now(),
    };
}

function getUserByToken(req) {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '') || url.parse(req.url, true).query.token;
    if (!token) return null;
    const uid = DB.tokens[token];
    if (!uid) return null;
    if (uid === '__admin__') {
        return { id: 'admin', username: 'admin', isAdmin: true };
    }
    if (!DB.users[uid]) return null;
    return DB.users[uid];
}

function isAdminToken(req) {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '') || url.parse(req.url, true).query.token;
    return token && DB.tokens[token] === '__admin__';
}
// 后台权限判定双通道：独立管理员令牌（admin/workbuddy 登录写入的 '__admin__'）或玩家端 isAdmin 账号。
// 注意：server/routes/rom.js 内部也定义了一份同名函数供 ROM/BIOS 路由使用；
// 此处 server.js 顶层再定义一份，供原 server.js 内的 AI 酒馆网关配置路由（/api/admin/tavern/*）调用，
// 修复「tavern config 路由直接引用只在 rom.js 作用域内的 romAdminOk」导致的运行时 ReferenceError。
function romAdminOk(req) {
    if (isAdminToken(req)) return true;
    const u = getUserByToken(req);
    return !!(u && (u.isAdmin || u.id === 'admin'));
}

function sendJson(res, code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
}

// ---------------- 静态文件 ----------------
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
    // 管理后台独立入口：/admin 与 /admin/ 都指向 admin.html（与玩家端物理隔离）
    if (pathname === '/admin' || pathname === '/admin/') {
        pathname = '/admin.html';
    }
    let p = pathname === '/' ? '/index.html' : pathname;
    const full = path.join(PUBLIC_DIR, p);
    if (!full.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        // 尝试不加扩展名匹配
        return sendJson(res, 404, { error: 'not found' });
    }
    const ext = path.extname(full).toLowerCase();
    // html/js/css 禁用缓存，避免玩家加载到旧版本前端（曾导致调用已删除的接口）
    const noCache = ['.html', '.js', '.css'].includes(ext);
    res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': noCache ? 'no-store, must-revalidate' : 'public, max-age=3600',
    });
    fs.createReadStream(full).pipe(res);
}

// ---------------- 路由 ----------------
async function readBody(req) {
    return new Promise((resolve, reject) => {
        let buf = '';
        req.on('data', c => buf += c);
        req.on('end', () => {
            try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { resolve({}); }
        });
        req.on('error', reject);
    });
}

const api = {};
// 健康检查（给 Nginx / 宝塔 / 监控 / 负载均衡探活用）
api['GET /api/health'] = (req, res) => {
    sendJson(res, 200, {
        ok: true,
        game: 'tower-odyssey',
        version: (DB._meta && DB._meta.version) || '1.0.0',
        uptime: Math.floor(process.uptime()),
        players: Object.keys(DB.users || {}).length,
        heroes: (DB.heroes || []).length,
        storage: Store.driver + (Store.isMySQL() ? `(${process.env.DB_NAME || 'tower_odyssey'})` : '(db.json)'),
        memMB: Math.round(process.memoryUsage().rss / 1048576),
        dbKB: (() => { try { return Math.round(fs.statSync(DB_PATH).size / 1024); } catch (e) { return 0; } })(),
        time: new Date().toISOString(),
    });
};
// ---- 账号体系：路由抽到 server/routes/auth.js（注册/登录/短信/手机号/绑定/改密/登出/我的）----

function displayName(user) {
    if (!user) return '未知玩家';
    return (user.nickname || user.username || '未知玩家');
}

// ---- 营地 ----
function buildingCost(which, lv) {
    const base = {
        camp: { wood: 50, stone: 20 },   // 大本营 - 木材
        forge: { iron: 30, stone: 30 },  // 锻造坊 - 铁矿
        research: { wood: 100, gold: 80 }, // 研究院
        hunt: { wood: 40, iron: 20 },    // 狩猎场
        mine: { stone: 30, iron: 20 },   // 石矿井
    };
    const cost = base[which] || { wood: 50 };
    const factor = Math.pow(1.32, lv - 1);
    const out = {};
    for (const k of Object.keys(cost)) out[k] = Math.floor(cost[k] * factor);
    return out;
}

function canAfford(u, cost) {
    for (const k of Object.keys(cost)) if ((u.resources[k] || 0) < cost[k]) return false;
    return true;
}

function missingRes(u, cost) {
    return Object.keys(cost).filter(k => (u.resources[k] || 0) < cost[k])
        .map(k => `${RES_LABEL[k] || k} 还差 ${Math.ceil(cost[k] - (u.resources[k] || 0))}`);
}

// 营地总览：建筑等级 / 每分钟产出 / 升级消耗 / 升级后产出 / 待领取挂机收益
// ---- 营地 / 建筑 / 助战城墙 / 古宝：路由抽到 server/routes/camp.js ----
// 路由模块统一上下文：把路由注册表与共享依赖注入各 server/routes/*.js（沿用 rom.js 约定）。
// 后续每抽一个域，只需往 routeCtx 追加该域需要的 helper/config，再 require 对应模块。
// 技能规范化（英雄多技能数组过滤/补默认特效/最多 3 个）：admin 域 hero 路由需要，提前到此声明避免 routeCtx 引用时 TDZ
const { normalizeSkills } = require('./server/core/skills');

const routeCtx = {
    api, DB, sendJson, getUserByToken, isAdminToken, save, newId, newToken,
    BUILD_DEFS, OFFLINE_CAP_SEC,
    productionRates, gainOf, applyProduction, buildingCost, canAfford, missingRes,
    // 英雄域注入：纯数据常量来自 server/config，共享 helper 为顶层函数（已被抽模块引用，需经 ctx 传入）
    STAR_BASE, STAR_MAX, STAR_PERKS, WISH_PITY, RES_CN, U_NUM, FORGE_MAX_LV, QUALITIES, QUALITY_NAME,
    starUpCost, starUpMaterialCost, forgeLevelCost, forgeQualityCost, equipStats, heroCombatStats,
    // 冒险塔/世界域注入：heroCombatStats 为共享（英雄域也用，保留在 server.js）；
    // chapterOf/bossForFloor/floorHpScale/floorAtkScale/mulberry32/enemyPoolFor 为塔专用 helper（保留在 server.js 经 ctx 注入）
    MAX_FLOOR, CHAPTERS, ROGUE_BUFFS,
    chapterOf, bossForFloor, floorHpScale, floorAtkScale, mulberry32, enemyPoolFor,
    // 活动/许愿域注入：todayKey 为共享 helper；WISH_RATE/WISH_CARD_PRICE 为 server.js 顶层常量
    todayKey, WISH_RATE, WISH_CARD_PRICE,
    // 部落/聊天/邮件/昵称域注入：displayName/validNickname/newDisplayId 为 server.js 共享 helper
    displayName, validNickname, newDisplayId,
    // 账号体系域注入：hashPassword 为密码函数；validPhone/maskPhone/genDefaultNickname/
    // defaultUserState/touchLogin 为 server.js 顶层共享 helper（verifyPassword/SMS 见后台域注入行）
    hashPassword, validPhone, maskPhone, genDefaultNickname, defaultUserState, touchLogin,
    // 后台/账号/酒馆网关域注入：
    // romAdminOk 为 server.js 顶层函数（修复 tavern config 路由既有 ReferenceError）；
    // verifyPassword/normalizeSkills/saveHeroes 为 server.js 顶层函数；
    // Store/Tavern/SMS 为 server.js 顶层 require 的模块/对象；ELEMENTS/ELEMENT_ALIAS 来自 server/config
    verifyPassword, normalizeSkills, saveHeroes, Store, Tavern, SMS,
    romAdminOk, ELEMENTS, ELEMENT_ALIAS,
};
require('./server/routes/auth')(routeCtx);

require('./server/routes/camp')(routeCtx);

require('./server/routes/heroes')(routeCtx);

require('./server/routes/events')(routeCtx);

// ---- 冒险（推塔）：实时战斗关卡 ----

// 普通小怪模板（20 种，shape 决定前端绘制的体型轮廓）
// ENEMY_TYPES → server/config/tower.js

// Boss 模板（每 5 层轮换）
// BOSS_TYPES → server/config/tower.js

// ---- 章节主题（每 20 层一章，共 10 章 / 200 层）----
// CHAPTERS → server/config/tower.js
function chapterOf(floor) {
    return CHAPTERS.find(c => floor >= c.from && floor <= c.to) || CHAPTERS[CHAPTERS.length - 1];
}

// Boss 出场序列：相邻层的 BOSS 绝不相同，同一个 Boss 隔若干关才重复一次
const BOSS_SEQ = (() => {
    const n = BOSS_TYPES.length, total = MAX_FLOOR;
    const seq = [];
    let idx = 0;
    for (let i = 0; i < total; i++) {
        seq.push(idx);
        idx = (idx + 1 + (i % (n - 1))) % n; // 步长 1..n-1 循环 → 相邻必不同
    }
    return seq;
})();
// TIER_CN → server/config/tower.js
function bossForFloor(floor) {
    const id = BOSS_SEQ[(floor - 1) % BOSS_SEQ.length];
    // 阶数随大章节提升（每 40 层 +1 阶，上限五阶），数值主要还是由层数曲线决定
    const tier = Math.min(4, Math.floor((floor - 1) / 40));
    const bt = BOSS_TYPES[id];
    return { bt, tier, name: bt.name + (TIER_CN[tier] || '') };
}

// 难度曲线：二次增长，200 层持续变强
function floorHpScale(f) { const x = Math.max(0, f - 1); return 1 + 0.30 * x + 0.008 * x * x; }
function floorAtkScale(f) { const x = Math.max(0, f - 1); return 1 + 0.22 * x + 0.0035 * x * x; }

// 固定种子随机：同一层的小怪组合稳定（同一层刷新不会出现完全不同的阵容）
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// 每层的怪种组合：3 个本层主题怪 + 2 个随机怪，尽量多种组合
function enemyPoolFor(floor) {
    const chap = chapterOf(floor);
    const rng = mulberry32(floor * 7919 + 13);
    const pool = [];
    const pref = chap.mobs.map(id => ENEMY_TYPES.find(t => t.id === id)).filter(Boolean);
    for (let i = pref.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pref[i], pref[j]] = [pref[j], pref[i]];
    }
    pool.push(...pref.slice(0, 3));
    const rest = ENEMY_TYPES.filter(t => !pool.includes(t));
    while (pool.length < 5 && rest.length) {
        const t = rest.splice(Math.floor(rng() * rest.length), 1)[0];
        pool.push(t);
    }
    return pool;
}

// 肉鸽增益（每波结束三选一）
// ROGUE_BUFFS → server/config/tower.js

// 塔的元信息（总层数 / 章节列表 / 每层主题），供冒险页做章节导航
require('./server/routes/tower')(routeCtx);

// 计算单个英雄当前的攻击 / 生命（含等级、城墙、古宝、装备、戒指、神器、宝石加成）
function heroCombatStats(u, oh) {
    const t = DB.heroes.find(h => h.id === oh.id);
    if (!t) return null;
    const wallAtk = (u.wall && u.wall.atkPct) || 0;
    const wallHp = (u.wall && u.wall.hpPct) || 0;
    let tAtk = 0, tHp = 0;
    for (const tid of (u.treasures || [])) {
        const tre = DB.treasures.find(x => x.id === tid);
        if (tre) { tAtk += tre.atkPct; tHp += tre.hpPct; }
    }
    const lvBonus = 1 + ((oh.lv || 1) - 1) * 0.1; // 每级 +10%

    // 装备 / 戒指 / 神器 / 宝石的属性（与城墙、古宝一起叠加）
    let eqAtk = 0, eqHp = 0;
    let ringAtkPct = 0, ringHpPct = 0;
    let artAtk = 0, artHp = 0, artStarSkillPct = 0;
    let gemAtkPct = 0, gemHpPct = 0;

    // 装备（4 槽位，含锻造等级与品质）
    for (const slot of EQUIP_SLOTS) {
        const raw = oh.equip && oh.equip[slot];
        if (!raw) continue;
        // 兼容旧存档：字符串形式直接取模板，对象形式走锻造计算
        if (typeof raw === 'string') {
            const e0 = DB.equipmentTemplates.find(x => x.id === raw);
            if (e0) { eqAtk += e0.atk || 0; eqHp += e0.hp || 0; }
            continue;
        }
        const e = DB.equipmentTemplates.find(x => x.id === raw.id);
        if (!e) continue;
        const st = equipStats(raw, e);
        eqAtk += st.atk; eqHp += st.hp;
    }
    // 戒指
    if (oh.ring) {
        const r = DB.ringTemplates.find(x => x.id === oh.ring);
        if (r) { ringAtkPct += r.atkPct || 0; ringHpPct += r.hpPct || 0; }
    }
    // 神器
    if (oh.artifact && oh.artifact.id) {
        const a = DB.artifactTemplates.find(x => x.id === oh.artifact.id);
        if (a) {
            const lv = oh.artifact.lv || 1;
            const star = oh.artifact.star || 0;
            artAtk += a.lvAtkBase * lv;
            artHp  += a.lvHpBase  * lv;
            artStarSkillPct += star * a.starSkillPct;
        }
    }
    // 宝石（4 槽）
    const gems = oh.gems || {};
    for (let i = 0; i < 4; i++) {
        const gid = gems[i];
        if (!gid) continue;
        const g = DB.gemTemplates.find(x => x.id === gid);
        if (g) { gemAtkPct += g.atkPct || 0; gemHpPct += g.hpPct || 0; }
    }

    const atkPctAll = (wallAtk + tAtk + ringAtkPct + gemAtkPct) / 100;
    const hpPctAll  = (wallHp  + tHp  + ringHpPct  + gemHpPct)  / 100;
    const baseAtk = t.baseAtk + eqAtk + artAtk;
    const baseHp  = t.baseHp  + eqHp  + artHp;

    // 星级天赋（6★ 起逐个解锁，全部汇总成一组战斗参数）
    const perks = {};
    let awaken = 0;
    for (const p of starPerksOf(oh.star)) {
        if (p.key === 'awaken') awaken = p.val;
        else if (p.key === 'stunUp') perks.stun = Math.max(perks.stun || 0, p.val);
        else perks[p.key] = (perks[p.key] || 0) + p.val;
    }
    const awakenMul = 1 + awaken / 100;
    const skillStarBonus = (oh.star || 0) * 0.08 + (awaken ? 0.5 : 0);

    return {
        atk: Math.floor(baseAtk * lvBonus * (1 + atkPctAll) * awakenMul),
        hp:  Math.floor(baseHp  * lvBonus * (1 + hpPctAll)  * awakenMul),
        lvBonus,
        star: oh.star || STAR_BASE,
        perks,                        // 战斗里生效的功能性天赋
        // 技能最终伤害：技能原值 ×(1 + 英雄星数加成 + 神器星数加成 + 觉醒加成)
        skillMulBonus: 1 + skillStarBonus + artStarSkillPct / 100,
    };
}


require('./server/routes/clan')(routeCtx);

// ---- 小游戏闯关进度 + 奖励 ----
// 进度存档：u.state.minigames = { [gameId]: { [level]: { stars, clears } } }
// 奖励规则（防刷）：首次通关送钻（关卡越高越多）+ 金币；已通关只升星补差价；重复通关不送
// MINIGAME_IDS 同时作为排行榜白名单
// 小游戏 id 白名单：硬编码存量 + 解析玩家端清单自动补齐新游戏。
// 历史教训①：这里曾经漏掉 tank / contra1 / contra2 / pinball，导致它们
//   ① 管理后台「小游戏排序」页看不到  ② 成绩上报被拒（未知小游戏）→ 排行榜失效。
// 历史教训②：改成自动解析后又踩了一次 —— 只在**进程启动时**解析一次，
//   云端 git pull 拉到新小游戏但服务没重启 → 后台依旧显示旧数量（103 个）。
//   现在按 minigames.js 的 mtime 自动失效缓存：拉完代码下一次请求就生效，
//   **不需要重启服务**。新增小游戏只需在 minigames.js 里 sc(...) 注册即可。
require('./server/routes/minigame')(routeCtx);

// ---- 经典模拟器 ROM 库：管理员上传（存 data/roms/ 磁盘文件，元数据进 DB）· 全员游玩 ----
// ROM 是二进制大文件，不适合塞进 db.json / MySQL 表；业界通行做法（yikm/dos.lol 同理）都是磁盘文件 + 元数据入库
const ROMS_DIR = path.join(DATA_DIR, 'roms');
// 图鉴「上传到服务器」的收件箱：项目部署在服务器上时，管理员本地的 ROM 目录
// （如 F:\…\roms）服务器根本读不到，只能先把 ZIP 传到服务器的这个目录再扫描。
const ROM_INBOX_DIR = path.join(ROMS_DIR, 'inbox');
const ROM_MAX_BYTES = 512 * 1024 * 1024;   // 单文件上限 512MB（PS1 级别也够）
// arcade 是历史遗留的泛化值（只吃 FBA v0.2.97.42 ROM 集，容易踩坑），保留用于兼容旧数据。
// 街机新上传统一用 fbneo —— 一个核心同时覆盖 Neo Geo / CPS1 / CPS2，是 EmulatorJS 官方默认 arcade 核心。
const ROM_CORES = new Set([
    'nes', 'snes', 'gb', 'gba', 'segaMD', 'n64', 'psx', 'dosbox', 'arcade',
    'fbneo',
    'fbalpha2012_cps1', 'fbalpha2012_cps2', 'fbalpha2012_neogeo',
    'mame2003', 'mame2003_plus',
]);
const ROM_CORE_LABELS = {
    nes: 'FC 红白机', snes: 'SFC', gb: 'GB/GBC', gba: 'GBA', segaMD: '世嘉 MD',
    n64: 'N64', psx: 'PS1', dosbox: 'DOS', arcade: '街机（旧）',
    fbneo: '街机 NeoGeo/CPS', fbalpha2012_cps1: 'CPS1', fbalpha2012_cps2: 'CPS2',
    fbalpha2012_neogeo: 'NeoGeo', mame2003: 'MAME 2003', mame2003_plus: 'MAME 2003+',
};
// 街机族：用于「街机模拟器」入口的筛选，以及判断该 ROM 是否需要 BIOS
const ARCADE_CORES = new Set(['arcade', 'fbneo', 'fbalpha2012_cps1', 'fbalpha2012_cps2', 'fbalpha2012_neogeo', 'mame2003', 'mame2003_plus']);

// ---- 模块拆分：ROM/BIOS/云存档路由 + 技能规范化（见 server/routes/rom.js、server/core/skills.js）----
const romRoutes = require("./server/routes/rom")({
  api, DB, sendJson, getUserByToken, isAdminToken, romCatalog, save, newId,
  ROMS_DIR, ROM_INBOX_DIR, DATA_DIR, ROM_MAX_BYTES, ROM_CORES, ROM_CORE_LABELS, ARCADE_CORES,
});


require('./server/routes/gift')(routeCtx);

require('./server/routes/admin')(routeCtx);

// ---- 主分发 ----
const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    try {
        if (pathname.startsWith('/api/')) {
            const key = req.method + ' ' + pathname;
            const handler = api[key];
            // 游戏没有这条路由时，先给酒馆兜底（ST 前端发的 /api/... 是站点根绝对路径）。
            // ⚠️ 必须排在 readBody 之前：proxyRequest 靠 req.pipe(上游) 转发，
            //    一旦 readBody 先把流读完，POST 的 body 就丢了（表现为写操作全是空）。
            if (!handler && await Tavern.fallbackRequest(req, res, { getUserByToken, DB })) return;
            // 原始二进制流式接口（handler 自己落盘，不能过 readBody 的 JSON 解析）：
            //   ROM 上传 / BIOS 上传 / 云存档上传
            // ⚠️ 新增这类接口必须同步加进下面的 RAW_BODY_API 集合，
            //    否则 readBody 会把 req 的数据流吃掉，handler 收到空 body，
            //    表现是「上传成功但 0 字节」（当年排查花了很久）。
            const RAW_BODY_API = new Set([
                '/api/roms/upload', '/api/roms/bios/upload', '/api/emu/save',
                '/api/admin/roms/dat',   // DAT 是原始文本（可能几十 MB），不能过 JSON 解析
                '/api/admin/roms/inbox/upload',   // ROM ZIP 是原始二进制，流式落盘
            ]);
            const body = (req.method === 'GET' || req.method === 'DELETE' || RAW_BODY_API.has(pathname)) ? {} : await readBody(req);
            if (handler) { await handler(req, res, body); return; }
            return sendJson(res, 404, { error: 'API 不存在' });
        }
        // AI 酒馆：/tavern 与 /tavern/* 反向代理到 SillyTavern（登录鉴权 + SSO 头注入都在网关层）
        // 必须排在 serveStatic 之前，否则会被静态文件处理器判成 404
        if (pathname === Tavern.PREFIX || pathname.startsWith(Tavern.PREFIX + '/')) {
            return Tavern.proxyRequest(req, res, { getUserByToken, DB });
        }
        // 非 /api 的站点根绝对路径（ST 的 /socket.io 轮询、/login 落地页等）也要兜底
        if (await Tavern.fallbackRequest(req, res, { getUserByToken, DB })) return;
        serveStatic(req, res, pathname);
    } catch (e) {
        // sendJson 本身也可能抛（响应已发出 / 连接已断），这里必须兜住，
        // 否则异常逃逸会让 Node 把整个进程拖挂、所有玩家集体掉线。
        try {
            if (!res.headersSent) sendJson(res, 500, { error: (e && e.message) || '服务器内部错误' });
            else res.end();
        } catch (_) { try { res.destroy(); } catch (__) {} }
    }
});
// WebSocket 透传：ST 的 socket.io 靠长连接收发消息，缺了它页面能开但聊天卡死
Tavern.attachUpgrade(server, { getUserByToken, DB });
// 小游戏联机中继：仅拦截 /ws/minigame，与上面 ST 的 upgrade 钩子互不干扰（两者都对非自身路径 return）
if (WsRelay) WsRelay.attach(server, { getUserByToken }); else console.warn('[game] 联机中继未启用（缺少 server/ws-relay 或 ws 模块）');
// 模拟器联机信令中继（EmulatorJS nightly netplay）：独立端口自包含服务（socket.io 默认 /socket.io + /list），
// 不与主服务器的 /socket.io(ST 代理) / /ws/minigame 冲突。端口 = NETPLAY_PORT 环境变量或默认 5181。
if (Netplay) Netplay.createServer(); else console.warn('[game] 模拟器联机信令未启用（缺少 server/netplay 或 socket.io 模块）');

// MySQL 模式：先连库载入真实数据（玩家 + 英雄），再开始监听，避免请求打到空数据
//
// 历史教训（2026-09-10 线上事故，勿删）：这段初始化曾经抛异常（store.js 没导出
// META_KEYS → Store.META_KEYS.filter 抛 TypeError），异常直接冒泡出这个 IIFE，
// **后面的 server.listen() 一行都没执行**。外部表现极具迷惑性：
//   systemd 显示 active (running)、MySQL 连上了、日志里「已载入 15 名玩家」都正常，
//   但端口 5180 没有任何监听 → 网页打不开。
// 现在改成：初始化失败也要监听端口（降级用本地 db.json 种子），
//   保证站点永远可访问、/admin 永远能进去排错。再加一个 15 秒看门狗防 await 卡死。
let _listening = false;
// ⚠️ 监听失败必须让进程退出（2026-09-15 血的教训）：
// 端口被占时如果只打日志不退出，会留下一个「活着但不服务」的僵尸进程 ——
// systemd 显示 active (running)、Main PID 也在，实际 5180 上根本没有它，
// 于是表现为「代码明明更新了，新接口却 404」。部署脚本每跑一次就多一个。
// 退出后 systemd Restart=always 会自动重试，端口一空出来就能正常起来。
server.on('error', e => {
    console.error('[game] 端口 ' + PORT + ' 监听失败：' + ((e && e.code) || '') + ' ' + ((e && e.message) || e));
    if (e && e.code === 'EADDRINUSE') {
        console.error('[game] ' + PORT + ' 已被别的进程占用（常见：部署脚本 nohup 直启留下的游离进程）。');
        console.error('[game] 查是谁：ss -lntp | grep ' + PORT + '   然后 kill -9 <pid>');
        console.error('[game] 进程退出，交给 systemd 重试；端口空出来后会自动起来。');
    }
    try { flush(); } catch (_) { }
    process.exit(1);
});
function startListen() {
    if (process.env.MG_NO_LISTEN) return;   // 路由冒烟测试用：不绑端口，仅加载并注册全部 api 路由
    if (_listening) return;
    _listening = true;
    server.listen(PORT, '0.0.0.0', async () => {
        console.log(`[game] listening on http://localhost:${PORT}`);
        if (Store.isMySQL()) {
            console.log(`[game] 存储：MySQL（${process.env.DB_NAME || 'tower_odyssey'}）— 玩家数据与代码隔离，回滚不影响存档`);
        } else {
            console.log(`[game] 存档文件：${DB_PATH}（账号 / 聊天 / 邮件 / 进度全部持久化在此）`);
        }
        console.log(`[game] admin: admin / workbuddy`);
        // 后台补算存量 ROM 内容指纹（去重用），不阻塞端口监听
        romRoutes.romsBackfillHash().catch(e => console.error('[game] ROM 指纹补算失败：' + e.message));
    });
}
// 看门狗：任何 await 卡死（MySQL 连不上且无超时）也不能让端口不通
const _listenWatchdog = setTimeout(() => {
    if (!_listening) {
        console.error('[game] 启动 15 秒仍未监听端口，强制监听（数据可能未从数据库载入）');
        startListen();
    }
}, 15000);
if (_listenWatchdog.unref) _listenWatchdog.unref();

(async () => {
    try {
        if (Store.isMySQL()) {
            await Store.init({ ensureSchema: process.env.DB_AUTO_SCHEMA === '1' });
            const st = await Store.loadState();
            if (st) {
                // 玩家与英雄以数据库为准；静态模板（装备/神器/宝石等）若库里为空，沿用内置种子
                if (st.users) DB.users = st.users;
                if (st.tokens) DB.tokens = st.tokens;
                if ((st.heroes || []).length) DB.heroes = st.heroes;
                // 自动从 META_KEYS 派生恢复列表（除内置种子模板）——
                // 历史教训：曾在这里硬编码恢复列表，漏掉 roms/minigameOrder/minigameScores，
                // 造成排序保存后重启失效 / 排行榜分数丢失。现在新增 META_KEYS 成员自动覆盖
                // MySQL 启动恢复，不会再漏。
                const META_FROM_SEED = new Set(['wallSkills', 'treasures',
                    'equipmentTemplates', 'ringTemplates', 'artifactTemplates', 'gemTemplates']);
                const metaKeys = Array.isArray(Store.META_KEYS) ? Store.META_KEYS : [];
                if (!metaKeys.length) console.error('[game] 警告：Store.META_KEYS 不可用，MySQL 的全局数据（ROM/排序/排行榜）本次不会恢复');
                metaKeys.filter(k => !META_FROM_SEED.has(k)).forEach(k => {
                    const v = st[k];
                    if (v === undefined || v === null) return;
                    const empty = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
                    if (!empty) DB[k] = v;
                });
            }
        }
        migrateNicknames();
    } catch (e) {
        console.error('[game] 启动初始化失败（已降级，端口仍会监听，数据用本地 db.json）：', e && e.stack || e);
    }
    startListen();
})();

// 路由冒烟测试钩子（tools/verify-routes.js）：仅在 MG_NO_LISTEN 下导出 api 表，不绑定端口。
if (process.env.MG_NO_LISTEN) module.exports = { api, DB };
