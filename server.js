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
const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'boots'];
const EQUIP_SLOT_NAME = { weapon: '武器', armor: '护甲', helmet: '头盔', boots: '鞋子' };

// ============================================================
// 英雄星级：基础 5 星，最高 16 星
//   6★ 起每升 1 星解锁一个「星级天赋」，天赋会真实影响战斗
//   （眩晕 / 增伤 / 复活 / 减伤 / 护盾 / 全队伤害 / 光环 ...）
// ============================================================
const STAR_BASE = 5;   // 初始星级
const STAR_MAX = 16;   // 星级上限
const STAR_PERKS = [
    { star: 6,  key: 'stun',      name: '震击',   icon: '💫', val: 12, desc: '普攻有 12% 概率眩晕敌人 1 秒' },
    { star: 7,  key: 'dmgUp',     name: '增伤',   icon: '⚔️', val: 10, desc: '自身造成伤害 +10%' },
    { star: 8,  key: 'revive',    name: '复生',   icon: '🕊', val: 1,  desc: '战斗中首次阵亡时原地复活，恢复 50% 生命' },
    { star: 9,  key: 'dmgDown',   name: '减伤',   icon: '🛡', val: 8,  desc: '自身受到伤害 -8%' },
    { star: 10, key: 'shield',    name: '护盾',   icon: '💠', val: 15, desc: '战斗开始时获得 15% 最大生命的护盾' },
    { star: 11, key: 'allDmg',    name: '战意',   icon: '🔥', val: 15, desc: '全体友方造成伤害 +15%' },
    { star: 12, key: 'aura',      name: '光环',   icon: '🌟', val: 10, desc: '光环：全体友方攻击 +10%' },
    { star: 13, key: 'stunUp',    name: '强震',   icon: '⚡', val: 22, desc: '眩晕概率提升至 22%，持续 1.5 秒' },
    { star: 14, key: 'critUp',    name: '狂暴',   icon: '💥', val: 15, desc: '暴击率 +15%，暴击伤害 +30%' },
    { star: 15, key: 'teamGuard', name: '守护',   icon: '⛨', val: 12, desc: '全体友方受到伤害 -12%' },
    { star: 16, key: 'awaken',    name: '觉醒',   icon: '👑', val: 25, desc: '觉醒：全属性 +25%，技能伤害 +50%' },
];
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
const ELEMENTS = ['草', '水', '火', '光', '暗'];
const ELEMENT_LABEL = { 草: '草（木）', 水: '水', 火: '火', 光: '光（含风雷）', 暗: '暗' };
const ELEMENT_COLOR = { 草: '#7ddf64', 水: '#5cc7ff', 火: '#ff7a5c', 光: '#ffd56b', 暗: '#b98cff' };
// 老数据迁移映射
const ELEMENT_ALIAS = { 木: '草', 风: '光', 雷: '光' };

// 城墙：每级有独立技能（战斗中可手动/自动释放）
//   type: stun 眩晕 / petrify 石化 / knock 击退 / block 生成阻碍
//         shield 护盾 / dmgup 增伤 / cdreduce 减CD / refresh 刷新必杀
const WALL_SKILL_SEED = [
    { lv: 1,  name: '青石墙', atkPct: 2,  hpPct: 2,  skill: { type: 'stun',    name: '落石冲击', desc: '眩晕全体怪物 1.5 秒', cd: 14, value: 1.5 } },
    { lv: 5,  name: '铜铁墙', atkPct: 5,  hpPct: 5,  skill: { type: 'knock',   name: '铁壁冲撞', desc: '击退小怪半屏并短暂停顿', cd: 16, value: 110 } },
    { lv: 10, name: '白银墙', atkPct: 8,  hpPct: 8,  skill: { type: 'shield',  name: '银辉护盾', desc: '为城墙附加护盾，6 秒免疫伤害', cd: 18, value: 6 } },
    { lv: 15, name: '黄金墙', atkPct: 12, hpPct: 12, skill: { type: 'petrify', name: '石化凝视', desc: '石化全体怪物 2 秒', cd: 20, value: 2 } },
    { lv: 20, name: '铂金墙', atkPct: 16, hpPct: 16, skill: { type: 'dmgup',   name: '铂金战意', desc: '全队增伤 35%，持续 8 秒', cd: 20, value: 35 } },
    { lv: 30, name: '钻石墙', atkPct: 22, hpPct: 22, skill: { type: 'block',   name: '钻石屏障', desc: '生成阻碍物阻挡怪物前进', cd: 22, value: 4 } },
    { lv: 40, name: '星耀墙', atkPct: 30, hpPct: 30, skill: { type: 'cdreduce',name: '星耀共鸣', desc: '8 秒内英雄技能冷却减半', cd: 24, value: 50 } },
    { lv: 50, name: '王者墙', atkPct: 40, hpPct: 40, skill: { type: 'refresh', name: '王者号令', desc: '立即刷新全队必杀冷却', cd: 30, value: 0 } },
];

const HERO_TIER = { 3: '3★', 4: '4★', 5: '5★' };
const MATERIAL_HEROES = [
    // ---- 水系 ----
    { id: 'm31', name: '水泡泡', rarity: '优秀', tier: 3, element: '水', baseAtk: 380, baseHp: 2800,
      img: 'material/m31.svg',
      desc: '漂浮在溪畔的小型水元素，一戳就破。除了充当升星材料别无他用。',
      skill: { name: '水花溅射', desc: '对单体造成 80% 攻击力伤害', cd: 8, multiplier: 0.8 } },
    { id: 'm41', name: '溪流精灵', rarity: '精英', tier: 4, element: '水', baseAtk: 640, baseHp: 4600,
      img: 'material/m41.svg',
      desc: '汇聚溪水之力的元素精灵，能掀起小小的浪花，常被当作升星材料。',
      skill: { name: '溪水冲击', desc: '对单体造成 120% 攻击力伤害', cd: 7, multiplier: 1.2 } },
    // ---- 火系 ----
    { id: 'm32', name: '小火花', rarity: '优秀', tier: 3, element: '火', baseAtk: 400, baseHp: 2600,
      img: 'material/m32.svg',
      desc: '一簇摇曳的小火苗，风一吹就晃。是廉价的升星材料。',
      skill: { name: '火星飞溅', desc: '对单体造成 80% 攻击力伤害', cd: 8, multiplier: 0.8 } },
    { id: 'm42', name: '烈焰童子', rarity: '精英', tier: 4, element: '火', baseAtk: 660, baseHp: 4400,
      img: 'material/m42.svg',
      desc: '掌中跳跃着火焰的孩童，脾气不大本事也不大，适合当升星材料。',
      skill: { name: '烈焰弹', desc: '对单体造成 120% 攻击力伤害', cd: 7, multiplier: 1.2 } },
    // ---- 草系（木）----
    { id: 'm37', name: '青苔童子', rarity: '优秀', tier: 3, element: '草', baseAtk: 375, baseHp: 2850,
      img: 'material/m37.svg',
      desc: '趴在老树根上的青苔小精，湿漉漉软绵绵，是常见的升星材料。',
      skill: { name: '苔藓飞溅', desc: '对单体造成 80% 攻击力伤害', cd: 8, multiplier: 0.8 } },
    { id: 'm47', name: '藤蔓精灵', rarity: '精英', tier: 4, element: '草', baseAtk: 645, baseHp: 4550,
      img: 'material/m47.svg',
      desc: '缠绕树干生长的藤之精灵，能抽出细细的藤鞭，多被用作升星材料。',
      skill: { name: '藤鞭抽击', desc: '对单体造成 120% 攻击力伤害', cd: 7, multiplier: 1.2 } },
    // ---- 光系 ----
    { id: 'm35', name: '萤火虫', rarity: '优秀', tier: 3, element: '光', baseAtk: 360, baseHp: 3000,
      img: 'material/m35.svg',
      desc: '提着微弱光芒的小虫，除了发光一无是处，标准的升星材料。',
      skill: { name: '微光', desc: '对单体造成 80% 攻击力伤害', cd: 8, multiplier: 0.8 } },
    { id: 'm45', name: '晨曦使', rarity: '精英', tier: 4, element: '光', baseAtk: 630, baseHp: 4700,
      img: 'material/m45.svg',
      desc: '带来第一缕晨光的下级侍从，力量有限，多被用作升星材料。',
      skill: { name: '晨曦射线', desc: '对单体造成 120% 攻击力伤害', cd: 7, multiplier: 1.2 } },
    // ---- 暗系 ----
    { id: 'm36', name: '影缚', rarity: '优秀', tier: 3, element: '暗', baseAtk: 385, baseHp: 2750,
      img: 'material/m36.svg',
      desc: '附着在地面上的稀薄影子，踩上去会粘脚。廉价升星材料。',
      skill: { name: '暗影缠绕', desc: '对单体造成 80% 攻击力伤害', cd: 8, multiplier: 0.8 } },
    { id: 'm46', name: '暗影仆从', rarity: '精英', tier: 4, element: '暗', baseAtk: 655, baseHp: 4450,
      img: 'material/m46.svg',
      desc: '听命于高阶暗影的下级仆从，战力平平，是可靠的升星材料。',
      skill: { name: '暗影突刺', desc: '对单体造成 120% 攻击力伤害', cd: 7, multiplier: 1.2 } },
];
// 给材料英雄补齐标记与多技能结构
function normalizeMaterialHero(h) {
    return Object.assign({}, h, {
        material: true,
        skills: [Object.assign({ fx: 'slash', tint: '#b9b3d8' }, h.skill)],
    });
}
// 许愿保底：每累计 N 抽必出 5★（传说+ / 传说）
const WISH_PITY = 20;
const WISH_RATE = [
    { tier: 5, p: 0.08 },   // 8%  5★ 主力英雄
    { tier: 4, p: 0.40 },   // 32% 4★ 材料
    { tier: 3, p: 1.00 },   // 60% 3★ 材料
];

// ============================================================
// 装备锻造：升级（每级 +8% 属性）+ 升品（绿→蓝→紫→橙→红→金→彩）
// ============================================================
const FORGE_MAX_LV = 100;
const FORGE_LV_GAIN = 0.08;   // 每级 +8%
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
const BUILD_DEFS = [
    { key: 'camp',     icon: '🏕', name: '大本营',  res: '木材 / 金币', out: { wood: 8, gold: 3 } },
    { key: 'forge',    icon: '🔨', name: '锻造坊',  res: '铁矿',        out: { iron: 5 } },
    { key: 'research', icon: '📚', name: '研究院',  res: '全建筑产出',  out: {}, bonus: 6 },
    { key: 'hunt',     icon: '🏹', name: '狩猎场',  res: '经验',        out: { exp: 12 } },
    { key: 'mine',     icon: '⛏', name: '石矿井',  res: '石币',        out: { stone: 4 } },
];
const RES_LABEL = { gold: '金币', wood: '木材', iron: '铁矿', stone: '石币', exp: '经验', gems: '钻石', wishCards: '许愿卡' };
const OFFLINE_CAP_SEC = 12 * 3600; // 挂机收益最多累计 12 小时

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
const DISPLAY_ID_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const DISPLAY_ID_LEN = 14;
const DISPLAY_NICK_MAX = 12;
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
const SMS_ENABLED = false;
// 开发模式（默认）：验证码打印到服务端控制台，并提供后台接口查看，方便联调；
// 接真实短信：设置 SMS_PROVIDER=tencent 后在此处接入厂商 SDK（见 deploy/README.md）。
const SMS = {
    codes: new Map(),     // phone -> { code, expires }（验证通过即作废）
    nextSend: new Map(),  // phone -> 下次可发送时间戳（独立存放：验证码作废后限流依然生效）
    recent: [],           // 最近发送记录（后台查看用）：{ phone, code, time }
    codeTTL: 5 * 60 * 1000,                                  // 验证码 5 分钟有效
    resendGap: (parseInt(process.env.SMS_RESEND_SEC) || 60) * 1000, // 同号重发间隔（测试可调小）
    recentMax: 30,
    send(phone) {
        if (!SMS_ENABLED) return { ok: false, error: '短信通道暂未开放，请使用账号密码登录' };
        const now = Date.now();
        const ns = this.nextSend.get(phone) || 0;
        if (now < ns) {
            return { ok: false, error: `发送太频繁，请 ${Math.ceil((ns - now) / 1000)} 秒后再试` };
        }
        const code = String(crypto.randomInt(100000, 1000000));
        this.codes.set(phone, { code, expires: now + this.codeTTL });
        this.nextSend.set(phone, now + this.resendGap);
        this.recent.unshift({ phone, code, time: now });
        if (this.recent.length > this.recentMax) this.recent.length = this.recentMax;
        // 开发模式：直接打日志（接真实短信时替换为厂商 API 调用）
        console.log(`[sms] 验证码 → ${phone}：${code}（${this.codeTTL / 60000} 分钟内有效）`);
        return { ok: true, dev: true };
    },
    verify(phone, code) {
        const rec = this.codes.get(phone);
        if (!rec) return { ok: false, error: '请先获取验证码' };
        if (Date.now() > rec.expires) { this.codes.delete(phone); return { ok: false, error: '验证码已过期，请重新获取' }; }
        if (String(code) !== rec.code) return { ok: false, error: '验证码错误' };
        this.codes.delete(phone); // 验证通过即作废，一次性使用
        return { ok: true };
    },
};
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

function sendJson(res, code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
}

// ---------------- 静态文件 ----------------
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
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
api['POST /api/register'] = async (req, res, body) => {
    const { username, password, phone, code } = body;
    if (!username || !password) return sendJson(res, 400, { error: '用户名密码必填' });
    // 账号只能是英文 + 数字组合（4-16 位，不能有中文和特殊符号）
    if (!/^[A-Za-z0-9]{4,16}$/.test(username)) {
        return sendJson(res, 400, { error: '账号只能是 4-16 位英文字母或数字（不能有中文和特殊符号）' });
    }
    if (password.length < 4) return sendJson(res, 400, { error: '密码至少 4 位' });
    if (Object.values(DB.users).some(u => u.username === username)) return sendJson(res, 400, { error: '用户已存在' });

    // 注册时可选绑定手机号（需验证码）
    let bindPhone = null;
    if (phone) {
        if (!validPhone(phone)) return sendJson(res, 400, { error: '手机号格式不正确' });
        const v = SMS.verify(phone, code);
        if (!v.ok) return sendJson(res, 400, { error: v.error });
        if (Object.values(DB.users).some(u => u.phone === phone)) return sendJson(res, 400, { error: '该手机号已被其他账号绑定' });
        bindPhone = phone;
    }

    // 可选昵称：传了就用（需通过校验且不重复），没传自动分配「勇者XXXX」
    let finalNickname = null;
    if (body.nickname != null && String(body.nickname).trim() !== '') {
        const v = validNickname(body.nickname);
        if (v) return sendJson(res, 400, { error: v });
        const nick = String(body.nickname).trim();
        if (Object.values(DB.users).some(u => (u.nickname || u.username) === nick))
            return sendJson(res, 400, { error: '该昵称已被占用' });
        finalNickname = nick;
    } else {
        finalNickname = genDefaultNickname();
    }

    const id = newId();
    const isAdmin = Object.keys(DB.users).length === 0; // 第一个注册用户为管理员
    DB.users[id] = {
        id, username,
        password: hashPassword(password),
        isAdmin,
        createdAt: Date.now(),
        nickname: finalNickname,
        displayId: newDisplayId(),      // 展示 ID，全局唯一
        phone: bindPhone,
        state: defaultUserState(username),
    };
    const token = newToken();
    DB.tokens[token] = id;
    touchLogin(DB.users[id].state);
    save();
    sendJson(res, 200, { ok: true, token, user: publicUser(DB.users[id]) });
};

api['POST /api/login'] = async (req, res, body) => {
    const { username, password } = body;
    if (!username || !password) return sendJson(res, 400, { error: '请输入账号和密码' });
    // 账号登录 / 手机号+密码登录 用同一个入口：先按用户名查，查不到再按手机号查
    const user = Object.values(DB.users).find(u => u.username === username)
        || Object.values(DB.users).find(u => u.phone === username && !!u.phone);
    if (!user || !verifyPassword(password, user.password)) return sendJson(res, 401, { error: '账号或密码错误' });
    const token = newToken();
    DB.tokens[token] = user.id;
    touchLogin(user.state);
    save();
    sendJson(res, 200, { ok: true, token, user: publicUser(user) });
};

// ---- 手机号通道 ----
// 发送验证码
api['POST /api/sms/send'] = (req, res, body) => {
    const { phone } = body;
    if (!validPhone(phone)) return sendJson(res, 400, { error: '手机号格式不正确' });
    const r = SMS.send(phone);
    if (!r.ok) return sendJson(res, 429, { error: r.error });
    sendJson(res, 200, { ok: true, dev: !!r.dev, ttl: 300 });
};
// 手机号 + 验证码 登录（未注册的手机号自动注册，一个手机号只有一个账号，天然不会重复注册）
// 可同时提交 password 为新账号设置密码；老账号忽略该字段（改密码走 /api/user/set-password）
api['POST /api/phone/login'] = (req, res, body) => {
    const { phone, code, password } = body;
    if (!validPhone(phone)) return sendJson(res, 400, { error: '手机号格式不正确' });
    const v = SMS.verify(phone, code);
    if (!v.ok) return sendJson(res, 400, { error: v.error });

    let user = Object.values(DB.users).find(u => u.phone === phone);
    let isNew = false;
    if (!user) {
        // 自动注册：用户名自动生成（账号规则同样是字母+数字），昵称勇者XXXX
        const id = newId();
        let uname;
        do { uname = 'u' + crypto.randomBytes(4).toString('hex'); }
        while (Object.values(DB.users).some(u => u.username === uname));
        user = {
            id, username: uname,
            password: (password && password.length >= 4) ? hashPassword(password) : '',
            isAdmin: false,
            createdAt: Date.now(),
            nickname: genDefaultNickname(),
            displayId: newDisplayId(),
            phone,
            state: defaultUserState(uname),
        };
        DB.users[id] = user;
        isNew = true;
    }
    const token = newToken();
    DB.tokens[token] = user.id;
    touchLogin(user.state);
    save();
    sendJson(res, 200, { ok: true, token, isNew, user: publicUser(user) });
};
// 已登录账号绑定 / 换绑手机号
api['POST /api/user/bind-phone'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const { phone, code } = body;
    if (!validPhone(phone)) return sendJson(res, 400, { error: '手机号格式不正确' });
    const v = SMS.verify(phone, code);
    if (!v.ok) return sendJson(res, 400, { error: v.error });
    const other = Object.values(DB.users).find(u => u.phone === phone && u.id !== user.id);
    if (other) return sendJson(res, 400, { error: '该手机号已被其他账号绑定' });
    user.phone = phone;
    save();
    sendJson(res, 200, { ok: true, phone: maskPhone(phone) });
};
// 设置 / 修改密码（验证码登录创建的无密码账号，或想改密码的账号）
api['POST /api/user/set-password'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const { oldPassword, newPassword } = body;
    if (!newPassword || newPassword.length < 4) return sendJson(res, 400, { error: '新密码至少 4 位' });
    if (user.password) { // 已有密码：必须验证旧密码
        if (!verifyPassword(oldPassword || '', user.password)) return sendJson(res, 400, { error: '旧密码不正确' });
    }
    user.password = hashPassword(newPassword);
    save();
    sendJson(res, 200, { ok: true });
};

api['POST /api/logout'] = (req, res) => {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    if (token) delete DB.tokens[token];
    save();
    sendJson(res, 200, { ok: true });
};

api['GET /api/me'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    touchLogin(user.state);
    sendJson(res, 200, { user: publicUser(user) });
};

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        displayId: user.displayId || '',
        phone: maskPhone(user.phone),        // 脱敏：138****1234
        phoneBound: !!user.phone,            // 是否已绑定
        hasPassword: !!user.password,        // 验证码登录创建的无密码账号为 false
        isAdmin: !!user.isAdmin,
        createdAt: user.createdAt,
        state: user.state,
    };
}
// 对外展示用：昵称 + 展示 ID
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
api['GET /api/camp'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const now = Date.now();
    const { perMin, bonus } = productionRates(u);
    const pendingSec = Math.min(Math.max(0, (now - (u.lastTick || now)) / 1000), OFFLINE_CAP_SEC);
    const pending = gainOf(perMin, pendingSec);

    const defs = BUILD_DEFS.map(d => {
        const lv = u.buildings[d.key] || 0;
        const cost = buildingCost(d.key, lv + 1);
        const round1 = v => Math.round(v * 10) / 10;
        const cur = {}, next = {};
        for (const k of Object.keys(d.out)) {
            cur[k] = round1(d.out[k] * lv * bonus);
            next[k] = round1(d.out[k] * (lv + 1) * bonus);
        }
        return {
            ...d, lv, cost, cur, next,
            nextBonus: d.bonus ? round1((lv + 1) * d.bonus) : 0,
            curBonus: d.bonus ? round1(lv * d.bonus) : 0,
            affordable: canAfford(u, cost),
            missing: canAfford(u, cost) ? [] : missingRes(u, cost),
        };
    });

    sendJson(res, 200, {
        defs, perMin, bonus,
        pendingSec: Math.floor(pendingSec),
        pending: Object.fromEntries(Object.keys(pending).map(k => [k, Math.floor(pending[k])])),
        resources: u.resources,
        offlineCapHours: OFFLINE_CAP_SEC / 3600,
    });
};

// 手动领取挂机收益（不领也会每 5 秒自动入账，这里只是立刻结算）
api['POST /api/camp/collect'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const r = applyProduction(u, Date.now());
    if (!r) return sendJson(res, 400, { error: '暂无可领取的收益' });
    const gains = {};
    for (const k of Object.keys(r.gains)) gains[k] = Math.floor(r.gains[k]);
    save();
    sendJson(res, 200, { ok: true, seconds: Math.floor(r.seconds), gains, state: u });
};

api['POST /api/building/upgrade'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const which = body.which;
    if (!BUILD_DEFS.some(d => d.key === which)) return sendJson(res, 400, { error: '建筑不存在' });
    const u = user.state;
    const lv = (u.buildings[which] || 0) + 1;
    const costs = buildingCost(which, lv);
    if (!canAfford(u, costs)) return sendJson(res, 400, { error: '资源不足：' + missingRes(u, costs).join('、'), need: costs });
    for (const k of Object.keys(costs)) u.resources[k] -= costs[k];
    u.buildings[which] = lv;
    save();
    sendJson(res, 200, { ok: true, state: u });
};

// ---- 助战 ----
api['POST /api/wall/upgrade'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const next = (u.wall.lv || 1) + 1;
    const skill = DB.wallSkills.find(s => s.lv === next);
    if (!skill) return sendJson(res, 400, { error: '城墙已满级' });
    const cost = { wood: 200 * next, iron: 200 * next, stone: 200 * next };
    for (const k of Object.keys(cost)) {
        if ((u.resources[k] || 0) < cost[k]) return sendJson(res, 400, { error: '资源不足' });
    }
    for (const k of Object.keys(cost)) u.resources[k] -= cost[k];
    u.wall.lv = next;
    u.wall.name = skill.name;
    u.wall.atkPct = skill.atkPct;
    u.wall.hpPct = skill.hpPct;
    save();
    sendJson(res, 200, { ok: true, state: u });
};

api['POST /api/treasure/equip'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    if (!u.treasures.includes(body.id)) return sendJson(res, 400, { error: '未拥有该古宝' });
    const idx = u.treasures.indexOf(body.id);
    u.treasures.splice(idx, 1);
    save();
    sendJson(res, 200, { ok: true, state: u });
};

api['POST /api/treasure/unequip'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    u.treasures.push(body.id);
    save();
    sendJson(res, 200, { ok: true, state: u });
};

// ---- 英雄 ----
api['GET /api/heroes'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    // 给每个持有的英雄附加实时战力，便于背包展示升级效果
    const owned = (u.heroes || []).map(oh => {
        const s = heroCombatStats(u, oh);
        const tpl = DB.heroes.find(t => t.id === oh.id) || {};
        return {
            ...oh,
            atk: s ? s.atk : 0, hp: s ? s.hp : 0,
            skillMulBonus: s ? s.skillMulBonus : 1,
            star: s ? s.star : STAR_BASE,
            perks: s ? s.perks : {},
            material: !!tpl.material,      // 3★/4★ 材料英雄：不能上阵，只能当升星材料
            tier: tpl.tier || 5,
        };
    });
    // 各星级升星所需材料英雄数量（供前端展示「还需 N 个材料」）
    const starMatCost = {};
    for (let s = STAR_BASE; s < STAR_MAX; s++) starMatCost[s] = starUpMaterialCost(s);
    sendJson(res, 200, {
        heroes: DB.heroes, treasures: DB.treasures, wallSkills: DB.wallSkills,
        equipmentTemplates: DB.equipmentTemplates, ringTemplates: DB.ringTemplates,
        artifactTemplates: DB.artifactTemplates, gemTemplates: DB.gemTemplates,
        events: DB.events, meta: DB._meta,
        owned, equipped: u.equipped, treasuresOwned: u.treasures, wall: u.wall,
        wishPity: u.wishPity || 0, pityMax: WISH_PITY,
        pityLeft: Math.max(0, WISH_PITY - (u.wishPity || 0)),
        starMatCost,
    });
};

api['POST /api/hero/levelup'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const h = u.heroes.find(x => x.uid === body.uid);
    if (!h) return sendJson(res, 400, { error: '没有该英雄' });
    const before = heroCombatStats(u, h);
    const cost = Math.floor(30 * Math.pow(1.3, (h.lv || 1) - 1));
    if ((u.resources.gold || 0) < cost) return sendJson(res, 400, { error: `金币不足，需要 ${cost}` });
    u.resources.gold -= cost;
    h.lv = (h.lv || 1) + 1;
    const after = heroCombatStats(u, h);
    save();
    sendJson(res, 200, {
        ok: true,
        hero: { uid: h.uid, lv: h.lv, atk: after.atk, hp: after.hp },
        gain: { atk: after.atk - before.atk, hp: after.hp - before.hp },
        cost,
        state: u,
    });
};

api['POST /api/hero/starup'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const h = u.heroes.find(x => x.uid === body.uid);
    if (!h) return sendJson(res, 400, { error: '没有该英雄' });
    h.star = (typeof h.star === 'number' && h.star >= STAR_BASE) ? h.star : STAR_BASE;
    if (h.star >= STAR_MAX) return sendJson(res, 400, { error: `已达星级上限（${STAR_MAX}星）` });
    const cost = starUpCost(h.star);
    for (const k of Object.keys(cost)) {
        const pool = k === 'gems' ? (u.resources.gems || 0) : (u.resources[k] || 0);
        if (pool < cost[k]) return sendJson(res, 400, { error: `${RES_CN[k]}不足，需要 ${U_NUM(cost[k])}` });
    }
    // 材料英雄消耗：需求不足时拒绝，并告知还差几个
    const needMat = starUpMaterialCost(h.star);
    if (needMat > 0 && !body.ignoreMaterial) {
        const matUids = materialHeroUids(u, h.uid);
        if (matUids.length < needMat) {
            return sendJson(res, 400, {
                error: `升星材料不足，需要 ${needMat} 个 3★/4★ 材料英雄（当前 ${matUids.length} 个，去许愿获取）`,
            });
        }
        // 优先消耗低阶（3★）材料，再消耗 4★
        const used = matUids.slice(0, needMat);
        const usedSet = new Set(used);
        u.heroes = u.heroes.filter(x => !usedSet.has(x.uid));
    }
    for (const k of Object.keys(cost)) u.resources[k] = (u.resources[k] || 0) - cost[k];
    h.star += 1;
    save();
    const unlocked = STAR_PERKS.find(p => p.star === h.star) || null;
    sendJson(res, 200, {
        ok: true,
        hero: { uid: h.uid, star: h.star, atk: (heroCombatStats(u, h) || {}).atk, hp: (heroCombatStats(u, h) || {}).hp },
        cost, materialUsed: needMat, unlocked, state: u,
    });
};
// 找出玩家持有的材料英雄（3★/4★，且不是正在升星的本体），3★ 排前面优先被消耗
function materialHeroUids(u, excludeUid) {
    const tplOf = id => DB.heroes.find(t => t.id === id);
    return (u.heroes || [])
        .filter(oh => oh.uid !== excludeUid)
        .map(oh => ({ uid: oh.uid, tier: (tplOf(oh.id) || {}).tier || 5, material: !!(tplOf(oh.id) || {}).material }))
        .filter(x => x.material || x.tier < 5)
        .sort((a, b) => a.tier - b.tier)
        .map(x => x.uid);
}
const RES_CN = { gold: '金币', gems: '钻石', iron: '铁矿', stone: '石币', wood: '木材', exp: '经验' };
const U_NUM = n => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

api['POST /api/hero/equip'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    if (u.equipped.length >= 5 && !u.equipped.includes(body.uid)) return sendJson(res, 400, { error: '上阵最多 5 个英雄' });
    if (u.equipped.includes(body.uid)) return sendJson(res, 400, { error: '已在队伍中' });
    u.equipped.push(body.uid);
    save();
    sendJson(res, 200, { ok: true, state: u });
};

api['POST /api/hero/unequip'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    u.equipped = u.equipped.filter(x => x !== body.uid);
    save();
    sendJson(res, 200, { ok: true, state: u });
};

// ---- 英雄装备（4 个槽位）----
function findOwnHero(u, uid) {
    const oh = (u.heroes || []).find(x => x.uid === uid);
    if (!oh) return { err: '没有该英雄' };
    return { oh };
}
api['POST /api/hero/equip-item'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid, slot, itemId } = body;
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    const oh = f.oh;
    const tpl = DB.equipmentTemplates.find(x => x.id === itemId);
    if (!tpl) return sendJson(res, 400, { error: '装备不存在' });
    if (tpl.slot !== slot) return sendJson(res, 400, { error: '槽位不匹配' });
    oh.equip = oh.equip || {};
    // 老装备可能是字符串（旧存档），统一升级为可锻造实例
    const old = oh.equip[slot];
    if (old && typeof old === 'object' && old.id === itemId) {
        // 重复穿戴同一件：保留锻造进度
    } else {
        oh.equip[slot] = { id: itemId, lv: 1, quality: tpl.quality };
    }
    save();
    sendJson(res, 200, { ok: true, state: u });
};
api['POST /api/hero/unequip-item'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid, slot } = body;
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    const oh = f.oh;
    if (oh.equip) delete oh.equip[slot];
    save();
    sendJson(res, 200, { ok: true, state: u });
};

// ---- 戒指（每个英雄 1 个）----
api['POST /api/hero/equip-ring'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid, ringId } = body;
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    const oh = f.oh;
    const r = DB.ringTemplates.find(x => x.id === ringId);
    if (!r) return sendJson(res, 400, { error: '戒指不存在' });
    oh.ring = ringId;
    save();
    sendJson(res, 200, { ok: true, state: u });
};
api['POST /api/hero/unequip-ring'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid } = body;
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    delete f.oh.ring;
    save();
    sendJson(res, 200, { ok: true, state: u });
};

// ---- 神器（每个英雄 1 个，可升级、可升星）----
api['POST /api/hero/equip-artifact'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid, artifactId } = body;
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    const oh = f.oh;
    const a = DB.artifactTemplates.find(x => x.id === artifactId);
    if (!a) return sendJson(res, 400, { error: '神器不存在' });
    oh.artifact = oh.artifact && oh.artifact.id === artifactId
        ? oh.artifact
        : { id: artifactId, lv: 1, star: 0 };
    save();
    sendJson(res, 200, { ok: true, state: u });
};
api['POST /api/hero/artifact-levelup'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid, cost } = body;
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    const oh = f.oh;
    if (!oh.artifact) return sendJson(res, 400, { error: '请先装备神器' });
    const tpl = DB.artifactTemplates.find(x => x.id === oh.artifact.id);
    if (!tpl) return sendJson(res, 400, { error: '神器模板不存在' });
    if ((oh.artifact.lv || 1) >= tpl.maxLevel) return sendJson(res, 400, { error: '已达等级上限' });
    const use = (typeof cost === 'number') ? cost : 100;
    if ((u.resources.gold || 0) < use) return sendJson(res, 400, { error: `金币不足，需要 ${use}` });
    u.resources.gold -= use;
    oh.artifact.lv = (oh.artifact.lv || 1) + 1;
    save();
    sendJson(res, 200, { ok: true, artifact: oh.artifact, state: u });
};
api['POST /api/hero/artifact-starup'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid, cost } = body;
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    const oh = f.oh;
    if (!oh.artifact) return sendJson(res, 400, { error: '请先装备神器' });
    const tpl = DB.artifactTemplates.find(x => x.id === oh.artifact.id);
    if (!tpl) return sendJson(res, 400, { error: '神器模板不存在' });
    if ((oh.artifact.star || 0) >= tpl.maxStar) return sendJson(res, 400, { error: '已达星级上限' });
    const use = (typeof cost === 'number') ? cost : 1;
    if ((u.resources.gems || 0) < use) return sendJson(res, 400, { error: `钻石不足，需要 ${use}` });
    u.resources.gems -= use;
    oh.artifact.star = (oh.artifact.star || 0) + 1;
    save();
    sendJson(res, 200, { ok: true, artifact: oh.artifact, state: u });
};
api['POST /api/hero/unequip-artifact'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid } = body;
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    delete f.oh.artifact;
    save();
    sendJson(res, 200, { ok: true, state: u });
};

// ---- 宝石（每个英雄 4 个槽位）----
api['POST /api/hero/set-gem'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid, slot, gemId } = body;
    if (slot < 0 || slot > 3) return sendJson(res, 400, { error: '槽位 0-3' });
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    const oh = f.oh;
    if (gemId === null || gemId === undefined || gemId === '') {
        oh.gems = oh.gems || {};
        delete oh.gems[slot];
        save();
        return sendJson(res, 200, { ok: true, state: u });
    }
    const g = DB.gemTemplates.find(x => x.id === gemId);
    if (!g) return sendJson(res, 400, { error: '宝石不存在' });
    oh.gems = oh.gems || {};
    oh.gems[slot] = gemId;
    save();
    sendJson(res, 200, { ok: true, state: u });
};

// ---- 装备锻造：升级（每级 +8% 属性）与升品（绿→蓝→紫→橙→红→金→彩）----
function equipInstOf(oh, slot) {
    const raw = oh.equip && oh.equip[slot];
    if (!raw) return null;
    // 兼容旧存档的字符串形式
    if (typeof raw === 'string') {
        const tpl = DB.equipmentTemplates.find(x => x.id === raw);
        const inst = { id: raw, lv: 1, quality: tpl ? tpl.quality : 'green' };
        oh.equip[slot] = inst;
        return inst;
    }
    return raw;
}
// 扣除一组消耗，不足时返回缺啥
function payCost(u, cost) {
    for (const k of Object.keys(cost)) {
        if ((u.resources[k] || 0) < cost[k]) return `${RES_CN[k] || k}不足，需要 ${U_NUM(cost[k])}`;
    }
    for (const k of Object.keys(cost)) u.resources[k] = (u.resources[k] || 0) - cost[k];
    return null;
}
api['POST /api/hero/forge-levelup'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid, slot } = body;
    const times = Math.min(10, Math.max(1, parseInt(body.times) || 1)); // 一次最多连点 10 级
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    const oh = f.oh;
    const inst = equipInstOf(oh, slot);
    if (!inst) return sendJson(res, 400, { error: '该槽位没有装备' });
    const tpl = DB.equipmentTemplates.find(x => x.id === inst.id);
    if (!tpl) return sendJson(res, 400, { error: '装备模板不存在' });
    let done = 0, total = { gold: 0, iron: 0 };
    for (let i = 0; i < times; i++) {
        if ((inst.lv || 1) >= FORGE_MAX_LV) break;
        const c = forgeLevelCost(inst.lv || 1, inst.quality || tpl.quality);
        const err = payCost(u, c);
        if (err) { if (!done) return sendJson(res, 400, { error: err }); break; }
        total.gold += c.gold; total.iron += c.iron;
        inst.lv = (inst.lv || 1) + 1;
        done++;
    }
    if (!done) return sendJson(res, 400, { error: '已达锻造等级上限' });
    save();
    const st = equipStats(inst, tpl);
    sendJson(res, 200, { ok: true, levels: done, equip: inst, cost: total, stats: st, state: u });
};
api['POST /api/hero/forge-qualityup'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const { uid, slot } = body;
    const f = findOwnHero(u, uid); if (f.err) return sendJson(res, 400, { error: f.err });
    const oh = f.oh;
    const inst = equipInstOf(oh, slot);
    if (!inst) return sendJson(res, 400, { error: '该槽位没有装备' });
    const tpl = DB.equipmentTemplates.find(x => x.id === inst.id);
    if (!tpl) return sendJson(res, 400, { error: '装备模板不存在' });
    const q = inst.quality || tpl.quality;
    const cost = forgeQualityCost(q);
    if (!cost) return sendJson(res, 400, { error: '已是最高品质（神话）' });
    const err = payCost(u, cost);
    if (err) return sendJson(res, 400, { error: err });
    inst.quality = QUALITIES[QUALITIES.indexOf(q) + 1];
    save();
    const st = equipStats(inst, tpl);
    sendJson(res, 200, {
        ok: true, equip: inst, cost, stats: st,
        qualityName: QUALITY_NAME[inst.quality], state: u,
    });
};

// ---- 活动：玩家查看当前可用活动 + 领取奖励 ----
// 状态计算：done=已领/不可领，ready=可领，locked=条件未满足（如累计登录天数不够）
function eventState(u, e) {
    const claimed = (u.claimedEvents || {})[e.id];
    const today = todayKey();
    const repeat = e.repeat || e.type || 'once';
    if (repeat === 'daily') {
        if (claimed === today) return { state: 'done', label: '今日已领' };
        return { state: 'ready', label: '领取' };
    }
    if (repeat === 'login') {
        const need = parseInt(e.needDays || '7');
        if ((u.loginDays || 0) < need) return { state: 'locked', label: `登录 ${u.loginDays || 0}/${need} 天` };
        if (claimed) return { state: 'done', label: '已领取' };
        return { state: 'ready', label: '领取' };
    }
    // once / limited
    if (claimed) return { state: 'done', label: '已领取' };
    return { state: 'ready', label: '领取' };
}
api['GET /api/events'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const now = Date.now();
    const list = (DB.events || [])
        .filter(e => {
            if (e.active === false) return false;
            if (e.startTime && e.endTime && (now < e.startTime || now > e.endTime)) return false;
            return true;
        })
        .map(e => {
            const s = eventState(u, e);
            return { ...e, ...s, loginDays: u.loginDays || 0 };
        });
    sendJson(res, 200, {
        events: list,
        loginDays: u.loginDays || 0,
        readyCount: list.filter(e => e.state === 'ready').length,
    });
};
api['POST /api/event/claim'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const e = (DB.events || []).find(x => x.id === body.id);
    if (!e) return sendJson(res, 400, { error: '活动不存在' });
    if (e.active === false) return sendJson(res, 400, { error: '活动已停用' });
    const s = eventState(u, e);
    if (s.state !== 'ready') return sendJson(res, 400, { error: s.state === 'done' ? '已领取过' : '条件未满足' });
    u.claimedEvents = u.claimedEvents || {};
    u.claimedEvents[e.id] = (e.repeat === 'daily') ? todayKey() : true;
    const rewards = e.rewards || {};
    for (const k of Object.keys(rewards)) {
        if (k === 'wishCards') u.wishCards = (u.wishCards || 0) + rewards[k];
        else u.resources[k] = (u.resources[k] || 0) + rewards[k];
    }
    save();
    sendJson(res, 200, { ok: true, rewards, state: u });
};

// ---- 许愿（支持 1 连 / 10 连）----
// 每次抽取必定产出 1 个英雄条目，重复获得不再自动升级（升级只在英雄页手动进行）
function drawOneHero(u) {
    // 保底：累计 WISH_PITY 抽未出 5★ 时，本抽强制出 5★
    u.wishPity = (u.wishPity || 0) + 1;
    const pityHit = u.wishPity >= WISH_PITY;
    let tier;
    if (pityHit) {
        tier = 5;
    } else {
        const roll = Math.random();
        tier = (WISH_RATE.find(x => roll < x.p) || WISH_RATE[WISH_RATE.length - 1]).tier;
    }
    // 按档位取池子；该档为空时依次回退到 5★ → 全部英雄
    let pool = DB.heroes.filter(h => (h.tier || 5) === tier);
    if (!pool.length) pool = DB.heroes.filter(h => (h.tier || 5) === 5);
    if (!pool.length) pool = DB.heroes;
    const t = pool[Math.floor(Math.random() * pool.length)];
    if (!t) throw new Error('英雄表为空，后台未配置英雄');
    // 出 5★ 即重置保底计数（无论是自然出货还是保底触发）
    if ((t.tier || 5) === 5) u.wishPity = 0;
    const oh = { uid: newId(), id: t.id, lv: 1, exp: 0, star: STAR_BASE };
    u.heroes.push(oh);
    // 50% 概率掉落古宝
    let treasure = null;
    if (DB.treasures.length && Math.random() < 0.5) {
        treasure = DB.treasures[Math.floor(Math.random() * DB.treasures.length)];
        if (!u.treasures.includes(treasure.id)) u.treasures.push(treasure.id);
    }
    return { oh, template: t, treasure, pity: (t.tier || 5) === 5 && pityHit };
}

api['POST /api/wish'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const want = parseInt(body.count);
    const count = [1, 5, 10].includes(want) ? want : 1;
    if ((u.wishCards || 0) < count) {
        return sendJson(res, 400, { error: `许愿卡不足，需要 ${count} 张（当前 ${u.wishCards || 0} 张）` });
    }
    u.wishCards -= count;

    const results = [];
    try {
        for (let i = 0; i < count; i++) results.push(drawOneHero(u));
    } catch (e) {
        return sendJson(res, 500, { error: e.message });
    }
    save();
    sendJson(res, 200, {
        ok: true, count,
        items: results.map(r => ({ hero: r.oh, template: r.template, treasure: r.treasure, pity: r.pity })),
        wishPity: u.wishPity || 0,          // 已累计未出 5★ 的抽数
        pityMax: WISH_PITY,                  // 保底阈值（20 抽必出 5★）
        pityLeft: Math.max(0, WISH_PITY - (u.wishPity || 0)), // 距保底还剩几抽
        state: u,
    });
};

api['POST /api/wish/reward'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    // 每日奖励：每个自然日限领 1 次
    const today = new Date().toDateString();
    if (u.lastWishRewardDay === today) {
        return sendJson(res, 400, { error: '今日已领取，明天再来' });
    }
    u.lastWishRewardDay = today;
    u.wishCards = (u.wishCards || 0) + 3;
    save();
    sendJson(res, 200, { ok: true, state: u });
};

// ---- 商城：钻石购买许愿卡（100 钻石 / 张）----
api['POST /api/shop/buy-wish'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const count = [1, 10, 100].includes(parseInt(body.count)) ? parseInt(body.count) : 1;
    const cost = count * WISH_CARD_PRICE;
    if ((u.resources.gems || 0) < cost) {
        return sendJson(res, 400, { error: `钻石不足，需要 ${cost}（当前 ${Math.floor(u.resources.gems || 0)}）` });
    }
    u.resources.gems -= cost;
    u.wishCards = (u.wishCards || 0) + count;
    save();
    sendJson(res, 200, { ok: true, count, cost, state: u });
};

// ---- 冒险（推塔）：实时战斗关卡 ----

// 普通小怪模板（20 种，shape 决定前端绘制的体型轮廓）
const ENEMY_TYPES = [
    { id: 'slime',    name: '史莱姆',   emoji: '🟢', shape: 'blob',    body: '#5cd65c', accent: '#2e8b2e', hpMul: 0.8, atkMul: 0.7, speed: 46 },
    { id: 'goblin',   name: '哥布林',   emoji: '👺', shape: 'brute',   body: '#7fbf5c', accent: '#3f6b2a', hpMul: 1.0, atkMul: 1.0, speed: 58 },
    { id: 'skeleton', name: '骷髅兵',   emoji: '💀', shape: 'undead',  body: '#e8e4d0', accent: '#8a8570', hpMul: 0.9, atkMul: 1.2, speed: 52 },
    { id: 'wolf',     name: '丛林野狼', emoji: '🐺', shape: 'beast',   body: '#8b8f9a', accent: '#4a4e58', hpMul: 0.7, atkMul: 1.4, speed: 95 },
    { id: 'bat',      name: '吸血蝙蝠', emoji: '🦇', shape: 'bat',     body: '#6b4a7a', accent: '#3a2547', hpMul: 0.6, atkMul: 0.9, speed: 105 },
    { id: 'orc',      name: '兽人战士', emoji: '👹', shape: 'brute',   body: '#4f8a4a', accent: '#26401f', hpMul: 1.6, atkMul: 1.2, speed: 42 },
    { id: 'golem',    name: '石魔像',   emoji: '🗿', shape: 'golem',   body: '#9a8f80', accent: '#5b5145', hpMul: 2.6, atkMul: 1.0, speed: 28 },
    { id: 'wraith',   name: '幽灵',     emoji: '👻', shape: 'ghost',   body: '#a8d8e8', accent: '#5f8fa8', hpMul: 0.8, atkMul: 1.6, speed: 70 },
    { id: 'spider',   name: '毒蜘蛛',   emoji: '🕷', shape: 'spider',  body: '#7a4a8f', accent: '#40254d', hpMul: 0.9, atkMul: 1.5, speed: 82 },
    { id: 'scorpion', name: '沙蝎',     emoji: '🦂', shape: 'insect',  body: '#d9a441', accent: '#8a6420', hpMul: 1.1, atkMul: 1.3, speed: 66 },
    { id: 'mushroom', name: '毒菌菇',   emoji: '🍄', shape: 'plant',   body: '#e05c5c', accent: '#f0e0d0', hpMul: 1.3, atkMul: 0.9, speed: 34 },
    { id: 'imp',      name: '火焰小鬼', emoji: '🔥', shape: 'demon',   body: '#ff7a2f', accent: '#8a2f10', hpMul: 0.7, atkMul: 1.5, speed: 88 },
    { id: 'harpy',    name: '鹰身女妖', emoji: '🦅', shape: 'bird',    body: '#6fa8c8', accent: '#315a72', hpMul: 0.8, atkMul: 1.3, speed: 100 },
    { id: 'serpent',  name: '沼泽巨蟒', emoji: '🐍', shape: 'serpent', body: '#4f9a5c', accent: '#24512c', hpMul: 1.8, atkMul: 1.2, speed: 50 },
    { id: 'mage',     name: '邪术师',   emoji: '🧙', shape: 'mage',    body: '#8a5fd0', accent: '#4a2f7a', hpMul: 1.0, atkMul: 1.7, speed: 44 },
    { id: 'knight',   name: '黑铁骑士', emoji: '🛡', shape: 'knight',  body: '#6b7580', accent: '#2f363d', hpMul: 2.2, atkMul: 1.1, speed: 36 },
    { id: 'boar',     name: '狂暴野猪', emoji: '🐗', shape: 'beast',   body: '#a06a3f', accent: '#5c3a1f', hpMul: 1.5, atkMul: 1.4, speed: 76 },
    { id: 'zombie',   name: '腐尸',     emoji: '🧟', shape: 'undead',  body: '#7f9a5c', accent: '#3f5228', hpMul: 1.4, atkMul: 1.0, speed: 32 },
    { id: 'wisp',     name: '幽蓝鬼火', emoji: '💠', shape: 'wisp',    body: '#5cc7ff', accent: '#1f6f9a', hpMul: 0.6, atkMul: 1.8, speed: 92 },
    { id: 'lizard',   name: '熔岩蜥蜴', emoji: '🦎', shape: 'beast',   body: '#e0552f', accent: '#7a2410', hpMul: 1.2, atkMul: 1.4, speed: 70 },
];

// Boss 模板（每 5 层轮换）
const BOSS_TYPES = [
    { id: 'dragon',  name: '远古巨龙·焱',   emoji: '🐉', shape: 'dragon', body: '#e0552f', accent: '#7a1f10', hpMul: 12, atkMul: 2.2, speed: 38, skill: '烈焰吐息' },
    { id: 'demon',   name: '深渊魔王·奈落', emoji: '😈', shape: 'demon',  body: '#8a2fd0', accent: '#3f1060', hpMul: 14, atkMul: 2.5, speed: 44, skill: '暗影冲击' },
    { id: 'titan',   name: '泰坦巨人·磐',   emoji: '🦖', shape: 'golem',  body: '#9a8f80', accent: '#4a4038', hpMul: 17, atkMul: 2.0, speed: 30, skill: '大地震荡' },
    { id: 'phoenix', name: '不死凤凰·曦',   emoji: '🦅', shape: 'bird',   body: '#ffb03b', accent: '#a83f10', hpMul: 13, atkMul: 2.8, speed: 52, skill: '焚天之羽' },
    { id: 'kraken',  name: '深海巨妖·渊',   emoji: '🦑', shape: 'serpent',body: '#3f7fd0', accent: '#123a66', hpMul: 15, atkMul: 2.4, speed: 40, skill: '触手狂舞' },
    { id: 'mammoth', name: '冰霜巨兽·霜',   emoji: '🦣', shape: 'beast',  body: '#a8d8e8', accent: '#3f6b80', hpMul: 16, atkMul: 2.1, speed: 34, skill: '极寒风暴' },
    { id: 'lich',    name: '亡灵君主·骸',   emoji: '☠️', shape: 'undead', body: '#cfe6c0', accent: '#4a5c3f', hpMul: 15, atkMul: 2.6, speed: 42, skill: '亡者大军' },
    { id: 'whale',   name: '天空鲸·霄',     emoji: '🐋', shape: 'dragon', body: '#5c9ad0', accent: '#1f4a72', hpMul: 18, atkMul: 2.3, speed: 36, skill: '坠星之息' },
];

// ---- 章节主题（每 20 层一章，共 10 章 / 200 层）----
const CHAPTERS = [
    { from: 1,   to: 20,  name: '迷雾森林', emoji: '🌲', mobs: ['slime', 'goblin', 'wolf', 'boar'],
      sky: ['#0e2418', '#1f4a2e', '#5d8a44'], mount: 'rgba(20,44,28,0.75)', path: ['rgba(96,140,84,0.42)', 'rgba(46,58,34,0.9)'], ground: '#2c3a24', tower: ['#2f3a22', '#5f7a3e', '#1e2616'] },
    { from: 21,  to: 40,  name: '黄沙戈壁', emoji: '🏜', mobs: ['scorpion', 'orc', 'golem', 'harpy'],
      sky: ['#3a2a12', '#7a5a22', '#c99a44'], mount: 'rgba(70,50,20,0.75)', path: ['rgba(200,160,80,0.35)', 'rgba(96,70,32,0.9)'], ground: '#5a4526', tower: ['#4a3a1c', '#a8813a', '#2a2010'] },
    { from: 41,  to: 60,  name: '幽暗洞窟', emoji: '🕳', mobs: ['bat', 'spider', 'mushroom', 'zombie'],
      sky: ['#0a0a14', '#20202e', '#3a3a52'], mount: 'rgba(14,14,24,0.8)', path: ['rgba(80,80,110,0.35)', 'rgba(30,30,42,0.92)'], ground: '#23232e', tower: ['#24242e', '#4a4a5e', '#14141a'] },
    { from: 61,  to: 80,  name: '冰封雪原', emoji: '❄️', mobs: ['wraith', 'wisp', 'serpent', 'knight'],
      sky: ['#0a1a2e', '#1f4a6b', '#8fc8e8'], mount: 'rgba(24,52,78,0.7)', path: ['rgba(150,200,235,0.35)', 'rgba(48,80,110,0.9)'], ground: '#33465c', tower: ['#2a4258', '#7fb0d0', '#16242f' ] },
    { from: 81,  to: 100, name: '熔岩深渊', emoji: '🌋', mobs: ['imp', 'lizard', 'golem', 'orc'],
      sky: ['#2a0806', '#7a1f0e', '#e05a1f'], mount: 'rgba(60,16,10,0.78)', path: ['rgba(255,130,60,0.32)', 'rgba(80,26,14,0.92)'], ground: '#4a2018', tower: ['#4a1c12', '#a8502a', '#24100a'] },
    { from: 101, to: 120, name: '雷暴云海', emoji: '⛈', mobs: ['harpy', 'wisp', 'mage', 'bat'],
      sky: ['#0a0e28', '#2a2a6b', '#6a5ac0'], mount: 'rgba(20,22,54,0.75)', path: ['rgba(140,150,255,0.3)', 'rgba(34,34,72,0.92)'], ground: '#2a2a44', tower: ['#26264a', '#6a6ab0', '#14142a'] },
    { from: 121, to: 140, name: '亡灵墓地', emoji: '⚰️', mobs: ['skeleton', 'zombie', 'wraith', 'mage'],
      sky: ['#0c1608', '#243a1c', '#6a8a44'], mount: 'rgba(22,36,18,0.78)', path: ['rgba(140,180,100,0.3)', 'rgba(34,48,26,0.92)'], ground: '#2e3a22', tower: ['#2c3a20', '#6a8a44', '#141a0e'] },
    { from: 141, to: 160, name: '天空之城', emoji: '☁️', mobs: ['harpy', 'knight', 'wisp', 'golem'],
      sky: ['#123a5a', '#3a8ac0', '#ffe6b0'], mount: 'rgba(30,80,120,0.6)', path: ['rgba(255,240,210,0.34)', 'rgba(70,110,140,0.85)'], ground: '#5a7a90', tower: ['#4a6a80', '#d8e8f0', '#263a48'] },
    { from: 161, to: 180, name: '深海遗迹', emoji: '🌊', mobs: ['serpent', 'mage', 'slime', 'spider'],
      sky: ['#03101e', '#0a3a4a', '#1f8a8a'], mount: 'rgba(6,26,38,0.8)', path: ['rgba(60,200,200,0.3)', 'rgba(12,48,60,0.92)'], ground: '#12414a', tower: ['#123a42', '#3aa0a0', '#082026'] },
    { from: 181, to: 200, name: '混沌神殿', emoji: '🔮', mobs: ['mage', 'knight', 'wraith', 'golem'],
      sky: ['#120424', '#3a0a5a', '#7a1f9a'], mount: 'rgba(28,8,48,0.8)', path: ['rgba(200,120,255,0.3)', 'rgba(40,14,60,0.94)'], ground: '#2a1040', tower: ['#2c1046', '#8a4ab0', '#160826'] },
];
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
const TIER_CN = ['', '·二阶', '·三阶', '·四阶', '·五阶'];
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
const ROGUE_BUFFS = [
    { id: 'atk',   name: '力量祝福', desc: '全体攻击力 +25%',       icon: '⚔️', stat: 'atkPct', val: 25 },
    { id: 'hp',    name: '生命祝福', desc: '全体生命值 +30%',       icon: '❤️', stat: 'hpPct',  val: 30 },
    { id: 'cd',    name: '疾风祝福', desc: '技能冷却 -1 秒',         icon: '⚡', stat: 'cd',     val: 1 },
    { id: 'aspd',  name: '狂战祝福', desc: '攻击速度 +30%',         icon: '🔥', stat: 'aspd',   val: 30 },
    { id: 'heal',  name: '治疗之泉', desc: '立即恢复全体 60% 生命', icon: '💚', stat: 'heal',   val: 60 },
    { id: 'crit',  name: '精准祝福', desc: '暴击率 +20%（2 倍伤害）', icon: '🎯', stat: 'crit',   val: 20 },
    { id: 'armor', name: '守护祝福', desc: '受到的伤害 -20%',       icon: '🛡', stat: 'armor',  val: 20 },
    { id: 'lifesteal', name: '嗜血祝福', desc: '攻击吸血 +15%',     icon: '🩸', stat: 'lifesteal', val: 15 },
];

// 塔的元信息（总层数 / 章节列表 / 每层主题），供冒险页做章节导航
api['GET /api/tower/info'] = (req, res) => {
    sendJson(res, 200, {
        maxFloor: MAX_FLOOR,
        chapters: CHAPTERS.map(c => ({ name: c.name, emoji: c.emoji, from: c.from, to: c.to })),
        bossFloors: Math.floor(MAX_FLOOR / 5),
    });
};

// 生成一场战斗的完整关卡数据（1 ~ MAX_FLOOR 层）
api['GET /api/tower/level'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const q = url.parse(req.url, true).query;
    const floor = Math.min(MAX_FLOOR, Math.max(1, parseInt(q.floor || '1') || 1));
    const ancient = q.ancient === '1';
    const mul = ancient ? 3 : 1;

    const heroesData = buildBattleHeroes(user.state);
    if (!heroesData.length) return sendJson(res, 400, { error: '请先到「冒险」上阵英雄' });
    const teamAtk = Math.max(1, heroesData.reduce((s, h) => s + h.atk, 0));
    const teamHp = Math.max(1, heroesData.reduce((s, h) => s + h.maxHp, 0));
    const avgHeroHp = Math.max(1, teamHp / heroesData.length);

    const chapter = chapterOf(floor);
    const pool = enemyPoolFor(floor);
    const rng = mulberry32(floor * 104729 + (ancient ? 7 : 0));
    const hpS = floorHpScale(floor) * mul;
    const atkS = floorAtkScale(floor) * mul;

    // 保底机制：队伍变强后小怪不能刚出场就被秒杀，所以血量/攻击同时与队伍强度挂钩。
    // 保底系数本身也随层数递增（小怪撑住的秒数随层数缓慢上升），
    // 这样即使玩家练度很高，每一层的怪物强度依然肉眼可见地在增加。

    // ---- 波次结构：每关固定 20 波，最后一波必定是 BOSS ----
    const WAVES_PER_FLOOR = 20;
    // 每波小怪数：4 只起步，随层数到 10 只封顶（画面上「小而多」的怪潮感）
    const perWave = Math.min(4 + Math.floor(floor / 4), 10);
    // 平衡归一化：旧版一关 9~64 只小怪，现在 80~200 只。
    // 按总量比例压低单只的血/攻，让一关的总承伤、总耗时与旧版大致相当。
    const oldWaves = Math.min(3 + Math.floor(floor / 3), 8);
    const oldCnt = Math.min(3 + Math.floor(floor / 8), 8);
    const countNorm = Math.max(0.22, Math.min(1, (oldWaves * oldCnt) / (WAVES_PER_FLOOR * perWave)));
    const mobHpBase = Math.floor(Math.max(520 * hpS, teamAtk * (1.8 + 0.06 * (floor - 1))) * countNorm);
    const bossHpBase = Math.max(520 * hpS, teamAtk * (14 + 0.5 * (floor - 1)) / 12);
    const mobAtkBase = Math.floor(Math.max(42 * atkS, avgHeroHp * (0.05 + 0.0006 * (floor - 1))) * countNorm);
    const bossAtkBase = Math.max(42 * atkS, avgHeroHp * (0.065 + 0.0008 * (floor - 1)));

    const waveCount = WAVES_PER_FLOOR;
    const waves = [];
    let bossInfo = null;

    for (let w = 0; w < waveCount; w++) {
        const isBossWave = w === waveCount - 1; // 第 20 波固定 BOSS
        const enemies = [];
        if (isBossWave) {
            const { bt, tier, name } = bossForFloor(floor);
            const tierMul = 1 + 0.25 * tier;
            const hp = Math.floor(bossHpBase * bt.hpMul * tierMul);
            const atk = Math.floor(bossAtkBase * bt.atkMul * tierMul);
            enemies.push({
                name, emoji: bt.emoji, hp, maxHp: hp, atk,
                speed: bt.speed, boss: true, elite: false, skill: bt.skill, tier,
                shape: bt.shape, body: bt.body, accent: bt.accent,
            });
            bossInfo = { name, tier, skill: bt.skill, emoji: bt.emoji };
            // Boss 亲卫：中后期带着小怪一起上，与纯小怪波明显区分
            const guards = Math.min(1 + Math.floor(floor / 25), 4);
            for (let g = 0; g < guards; g++) {
                const t = pool[Math.floor(rng() * pool.length)];
                const ghp = Math.floor(mobHpBase * t.hpMul * 1.6);
                const gatk = Math.floor(mobAtkBase * t.atkMul * 1.3);
                enemies.push({
                    name: '亲卫·' + t.name, emoji: t.emoji, hp: ghp, maxHp: ghp, atk: gatk,
                    speed: t.speed, boss: false, elite: false, guard: true,
                    shape: t.shape, body: t.body, accent: t.accent,
                });
            }
        } else {
            // 精英怪：第 5 / 10 / 15 波（0 起点即 w=4/9/14），越往后精英越多
            const eliteCount = (w % 5 === 4) ? (floor >= 10 ? 2 : 1) : 0;
            for (let i = 0; i < perWave; i++) {
                const t = pool[Math.floor(rng() * pool.length)];
                const elite = i < eliteCount;
                const eMul = elite ? 2.5 : 1;
                const hp = Math.floor(mobHpBase * t.hpMul * eMul);
                const atk = Math.floor(mobAtkBase * t.atkMul * (elite ? 1.8 : 1));
                enemies.push({
                    name: (elite ? '精英·' : '') + t.name, emoji: t.emoji,
                    hp, maxHp: hp, atk, speed: t.speed, boss: false, elite,
                    shape: t.shape, body: t.body, accent: t.accent,
                });
            }
        }
        waves.push({ enemies });
    }

    const theme = ancient ? null : {
        name: chapter.name, emoji: chapter.emoji,
        sky: chapter.sky, mount: chapter.mount, path: chapter.path,
        ground: chapter.ground, tower: chapter.tower,
    };

    sendJson(res, 200, {
        floor, ancient, waves, isBossFloor: true, boss: bossInfo,
        heroes: heroesData,
        wall: getWallInfo(user.state),    // 城墙等级 + 专属技能（战斗中可释放）
        buffPool: ROGUE_BUFFS,
        maxFloor: MAX_FLOOR,
        chapter: { name: chapter.name, emoji: chapter.emoji, from: chapter.from, to: chapter.to, index: CHAPTERS.indexOf(chapter) + 1, total: CHAPTERS.length },
        theme,
        // 推荐战力（仅作提示，不强制）；base* 为该层 1.0 系数小怪的真实数值
        power: {
            teamAtk, teamHp,
            baseMobHp: Math.floor(mobHpBase),
            baseMobAtk: Math.floor(mobAtkBase),
            needAtk: Math.floor(mobHpBase / 1.6),
            needHp: Math.floor(mobAtkBase * 30),
        },
    });
};

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

// 构造参战英雄数据（含城墙 / 古宝 / 装备 / 戒指 / 神器 / 宝石加成）
function buildBattleHeroes(u) {
    const out = [];
    for (const uid of (u.equipped || [])) {
        const oh = (u.heroes || []).find(x => x.uid === uid);
        if (!oh) continue;
        const t = DB.heroes.find(h => h.id === oh.id);
        if (!t) continue;
        const s = heroCombatStats(u, oh);
        if (!s) continue;
        // 多技能：主技能 + 副技能 + 觉醒技，兼容只有单个 skill 的老模板
        const rawSkills = (Array.isArray(t.skills) && t.skills.length) ? t.skills : [t.skill];
        const skills = rawSkills.filter(Boolean).map((sk, i) => ({
            name: sk.name || '技能',
            desc: sk.desc || '',
            cd: Math.max(1, sk.cd || 5),
            multiplier: sk.multiplier || 0,
            fx: sk.fx || 'slash',
            tint: sk.tint || '#ffd56b',
            // 技能伤害倍率 ×(1 + 星级/神器加成)
            mul: (sk.multiplier || 0) * (s.skillMulBonus || 1),
            slot: i,
        }));
        // 必杀：觉醒技（第 3 个技能）优先，否则由主技能派生（倍率 ×2.5）
        const ultSrc = rawSkills[2] || rawSkills[0] || {};
        const ultBoost = rawSkills[2] ? 1.6 : 2.5;
        const ultMult = (ultSrc.multiplier || 1) * ultBoost;
        const ult = {
            name: rawSkills[2] ? (ultSrc.name || '觉醒技') : ('必杀·' + (ultSrc.name || '斩击')),
            desc: ultSrc.desc || '倾尽全力的一击',
            cd: rawSkills[2] ? Math.max(12, Math.round((ultSrc.cd || 8) * 1.5)) : 12,
            multiplier: ultMult,
            mul: ultMult * (s.skillMulBonus || 1),
            fx: ultSrc.fx || 'ult',
            tint: ultSrc.tint || '#ff7adf',
        };
        out.push({
            uid: oh.uid, name: t.name, img: t.img, rarity: t.rarity, element: t.element,
            lv: oh.lv, star: s.star, atk: s.atk, hp: s.hp, maxHp: s.hp,
            perks: s.perks || {},
            ult,
            skills,
            // 兼容旧前端：仍保留 skill 字段（取第一个）
            skill: {
                name: (rawSkills[0] || {}).name || '技能',
                desc: (rawSkills[0] || {}).desc || '',
                cd: (rawSkills[0] || {}).cd || 5,
                multiplier: (rawSkills[0] || {}).multiplier || 0,
                fx: (rawSkills[0] || {}).fx || 'slash',
                tint: (rawSkills[0] || {}).tint || '#ffd56b',
                mulBonus: s.skillMulBonus || 1,
            },
        });
    }
    return out;
}

// 玩家当前城墙（含该等级专属技能），供战斗 UI 释放城墙技
function getWallInfo(u) {
    const lv = Math.max(1, (u.wall && u.wall.lv) || 1);
    let cur = (DB.wallSkills || [])[0] || { lv: 1, name: '青石墙', atkPct: 0, hpPct: 0 };
    for (const w of (DB.wallSkills || [])) if (w.lv <= lv) cur = w;
    return { lv, name: cur.name, atkPct: cur.atkPct || 0, hpPct: cur.hpPct || 0, skill: cur.skill || null };
}

// 通关结算
api['POST /api/tower/clear'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const floor = Math.min(MAX_FLOOR, Math.max(1, parseInt(body.floor || '1') || 1));
    const ancient = !!body.ancient;
    const mul = ancient ? 3 : 1;
    const reached = ancient ? (u.ancient.maxFloor || 0) : (u.tower.maxFloor || 0);
    const first = floor > reached;                       // 首次通关该层
    const fb = first ? 2 : 1;                            // 首通资源翻倍
    const rewards = {
        gold: Math.floor(60 * floor * mul * fb),
        wood: Math.floor(40 * floor * mul * fb),
        iron: Math.floor(30 * floor * mul * fb),
        stone: Math.floor(20 * floor * mul * fb),
        exp: Math.floor(50 * floor * mul * fb),
    };
    if (first) rewards.gems = (20 + Math.floor(floor / 5) * 10) * mul; // 首通送钻石
    if (floor % 5 === 0) rewards.wishCards = ancient ? 3 : 1;
    for (const k of Object.keys(rewards)) {
        if (k === 'wishCards') u.wishCards = (u.wishCards || 0) + rewards[k];
        else u.resources[k] = (u.resources[k] || 0) + rewards[k];
    }
    if (ancient) {
        if (floor > (u.ancient.maxFloor || 0)) u.ancient.maxFloor = floor;
    } else {
        if (floor > (u.tower.maxFloor || 0)) u.tower.maxFloor = floor;
    }
    save();
    sendJson(res, 200, { ok: true, rewards, first, state: u });
};

// 兼容旧版前端（浏览器可能仍缓存着调用旧接口的 JS），转发到新接口
api['POST /api/tower/start'] = api['GET /api/tower/level'];
api['POST /api/tower/choice'] = (req, res) => sendJson(res, 200, { ok: true, deprecated: true });

api['POST /api/tower/finish'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const rewards = body.rewards || {};
    const isAncient = !!body.ancient;
    for (const k of Object.keys(rewards)) {
        u.resources[k] = (u.resources[k] || 0) + rewards[k];
    }
    if (isAncient) {
        if (body.floor > (u.ancient.maxFloor || 0)) u.ancient.maxFloor = body.floor;
    } else {
        if (body.floor > (u.tower.maxFloor || 0)) u.tower.maxFloor = body.floor;
    }
    save();
    sendJson(res, 200, { ok: true, state: u });
};

// （旧的文字战报逻辑已由实时战斗关卡取代）

// ---- 世界 ----
api['GET /api/world'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const nodes = [];
    for (let i = 0; i < 12; i++) {
        const lv = Math.floor(Math.random() * 30) + 1;
        nodes.push({
            id: 'n' + i,
            lv,
            type: ['mine', 'battle', 'camp', 'elite'][i % 4],
            pos: { x: (i % 4) * 25 + 10, y: Math.floor(i / 4) * 30 + 20 },
        });
    }
    sendJson(res, 200, { world: { nodes, lv: user.state.tower.maxFloor }, state: user.state });
};

api['POST /api/world/gather'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const gains = { wood: 50, iron: 30, stone: 30, exp: 20 };
    for (const k of Object.keys(gains)) u.resources[k] = (u.resources[k] || 0) + gains[k];
    save();
    sendJson(res, 200, { ok: true, gains, state: u });
};

// ---- 部落 ----
api['GET /api/clans'] = (req, res) => {
    const list = Object.values(DB.clans).map(c => ({ id: c.id, name: c.name, members: c.members.length, leader: c.leaderName }));
    sendJson(res, 200, { clans: list });
};

api['POST /api/clan/create'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    if (user.state.clanId) return sendJson(res, 400, { error: '已在部落中' });
    const id = newId();
    DB.clans[id] = { id, name: body.name, leaderId: user.id, leaderName: user.username, members: [user.id], createdAt: Date.now(), chat: [] };
    user.state.clanId = id;
    save();
    sendJson(res, 200, { ok: true, clan: DB.clans[id] });
};

api['POST /api/clan/join'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    if (user.state.clanId) return sendJson(res, 400, { error: '已在部落中' });
    const c = DB.clans[body.id];
    if (!c) return sendJson(res, 400, { error: '部落不存在' });
    c.members.push(user.id);
    user.state.clanId = c.id;
    save();
    sendJson(res, 200, { ok: true, clan: c });
};

api['GET /api/clan/mine'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const cid = user.state.clanId;
    if (!cid) return sendJson(res, 400, { error: '未加入部落' });
    const c = DB.clans[cid];
    sendJson(res, 200, {
        clan: c,
        memberDetails: c.members.map(id => {
            const u = DB.users[id];
            if (!u) return null;
            return {
                id,
                username: u.username,
                nickname: displayName(u),
                displayId: u.displayId || '',
                lv: u.state && u.state.tower ? u.state.tower.maxFloor : 1,
            };
        }).filter(Boolean),
    });
};

// 修改昵称（对外展示用，登录名不变）
api['POST /api/user/set-nickname'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const bad = validNickname(body.nickname);
    if (bad) return sendJson(res, 400, { error: bad });
    const nick = String(body.nickname).trim();
    const dup = Object.values(DB.users).find(u => u.id !== user.id && (u.nickname || u.username) === nick);
    if (dup) return sendJson(res, 400, { error: '该昵称已被占用' });
    user.nickname = nick;
    if (!user.displayId) user.displayId = newDisplayId();
    if (user.state) user.state.nickname = nick;
    save();
    sendJson(res, 200, { ok: true, nickname: user.nickname, displayId: user.displayId });
};

// ---- 聊天 ----
api['GET /api/chat'] = (req, res) => {
    const since = parseInt(url.parse(req.url, true).query.since || '0');
    const list = DB.chat.filter(m => m.time > since).slice(-100);
    sendJson(res, 200, { messages: list, now: Date.now() });
};

api['POST /api/chat/send'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    if (!body.text || body.text.length > 100) return sendJson(res, 400, { error: '内容不合法' });
    const msg = {
        user: displayName(user),          // 对外显示昵称
        uid: user.id,
        displayId: user.displayId || '',
        text: String(body.text).slice(0, 100),
        time: Date.now(),
        isAdmin: user.isAdmin,
    };
    DB.chat.push(msg);
    if (DB.chat.length > 500) DB.chat = DB.chat.slice(-500);
    save();
    sendJson(res, 200, { ok: true, msg });
};

// ---- 邮件 ----
api['GET /api/mail'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const list = DB.mails.filter(m => m.toAll || m.to === user.id);
    sendJson(res, 200, { mails: list });
};

api['POST /api/mail/claim'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const m = DB.mails.find(x => x.id === body.id);
    if (!m) return sendJson(res, 400, { error: '邮件不存在' });
    if (!m.toAll && m.to !== user.id) return sendJson(res, 400, { error: '无权' });
    if (m.claimedBy && m.claimedBy.includes(user.id)) return sendJson(res, 400, { error: '已领取' });
    m.claimedBy = m.claimedBy || [];
    m.claimedBy.push(user.id);
    const r = m.rewards || {};
    for (const k of Object.keys(r)) {
        if (k === 'wishCards') user.state.wishCards = (user.state.wishCards || 0) + r[k];
        else user.state.resources[k] = (user.state.resources[k] || 0) + r[k];
    }
    save();
    sendJson(res, 200, { ok: true, state: user.state });
};

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
const MINIGAMES_FILE = path.join(__dirname, 'public', 'js', 'views', 'minigames.js');
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

// ---- 后台 ----
api['POST /api/admin/login'] = (req, res, body) => {
    // 单独管理员入口，用户名 admin / 密码 workbuddy
    if (body.username !== 'admin' || body.password !== 'workbuddy') return sendJson(res, 401, { error: '管理员账号错误' });
    const token = newToken();
    DB.tokens[token] = '__admin__';
    save();
    sendJson(res, 200, { ok: true, token, isAdmin: true });
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
const PK32_FILE = path.join(__dirname, 'public', 'js', 'minigames', 'pk32.js');
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
const isArcadeCore = c => ARCADE_CORES.has(c);
// 平台标签（给前端做筛选/展示，fbneo 按 core 猜不出来，只能由管理员在 platform 里指定）
const ROM_PLATFORMS = {
    neogeo: 'NeoGeo', cps1: 'CPS1', cps2: 'CPS2', cps3: 'CPS3', igs: 'IGS', other: '其他街机',
};
// BIOS：NeoGeo 必须 neogeo.zip、IGS(PGM) 必须 pgm.zip、CPS3 必须 cps3.zip，缺了就是黑屏（无任何报错提示）。
// 判定分两套 key：platform（导入时写入，优先）和 core（老数据只有 core）——之前混在一个表里，
// 导致 neogeo.zip 因为 neogeo / fbalpha2012_neogeo 两个 key 被算成"缺 2 个"。
const ROM_BIOS_BY_PLATFORM = { neogeo: 'neogeo.zip', igs: 'pgm.zip', cps3: 'cps3.zip' };
const ROM_BIOS_BY_CORE = { fbalpha2012_neogeo: 'neogeo.zip' };
const ROM_BIOS_FILES = ['neogeo.zip', 'pgm.zip', 'cps3.zip'];
const biosKeyLabel = k => ROM_PLATFORMS[k] || ROM_CORE_LABELS[k] || k;
// 扫一遍库，只统计"真有人要玩"的 BIOS：库里没有 PGM/CPS3 游戏时，pgm.zip/cps3.zip 就完全不需要，
// 不该报红吓人 —— 这两个固件厂商不随游戏分发，普通 ROM 合集里本来就没有。
function romBiosDemand() {
    const need = new Map();   // file -> Set<platform|core>
    for (const r of DB.roms || []) {
        const file = ROM_BIOS_BY_PLATFORM[r.platform] || ROM_BIOS_BY_CORE[r.core];
        if (!file) continue;
        if (!need.has(file)) need.set(file, new Set());
        need.get(file).add(r.platform || r.core);
    }
    return need;
}
function romAdminOk(req) {
    // 双通道：后台独立管理员令牌（admin/workbuddy）或玩家端 isAdmin 账号（第一个注册的玩家）
    if (isAdminToken(req)) return true;
    const u = getUserByToken(req);
    return !!(u && (u.isAdmin || u.id === 'admin'));
}
const romMeta = r => ({
    id: r.id, name: r.name, core: r.core, size: r.size, addedAt: r.addedAt,
    by: r.by || '', category: r.category || 'normal', sort: r.sort || 0,
    platform: r.platform || '', year: r.year || '', maker: r.maker || '',
    genre: r.genre || '', cover: r.cover || '',
    biosId: r.biosId || '', parentId: r.parentId || '',
    // 图鉴身份（街机专用）：短名 = zip 文件名，是 ROM 的唯一稳定 ID；中文名/别名用于搜索
    shortName: r.shortName || '', titleZh: r.titleZh || '', titleEn: r.titleEn || '',
    aliases: r.aliases || [], crcStatus: r.crcStatus || '',
    catalogVersion: r.catalogVersion || '', fileName: r.fileName || '',
});
// 搜索命中范围：显示名 + 中文名 + 英文原名 + 短名 + 别名 + 厂商（玩家可能只记得「饿狼」或 kof98）
function romMatchQ(r, q) {
    if (!q) return true;
    const hay = [r.name, r.titleZh, r.titleEn, r.shortName, r.maker, r.genre]
        .concat(Array.isArray(r.aliases) ? r.aliases : [])
        .filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
}

// ---------- ROM 内容 hash：上传去重 + 存量补算 ----------
function romFileHash(file) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        const s = fs.createReadStream(file);
        s.on('data', c => h.update(c));
        s.on('end', () => resolve(h.digest('hex')));
        s.on('error', reject);
    });
}
// 启动时给历史 ROM 懒补 hash（首次升级到「去重版」后跑一次，之后秒退）
async function romsBackfillHash() {
    DB.roms = DB.roms || [];
    const need = DB.roms.filter(r => !r.hash);
    if (!need.length) return;
    let n = 0;
    for (const r of need) {
        try {
            r.hash = await romFileHash(path.join(ROMS_DIR, r.id + '.bin'));
            n++;
        } catch (e) { /* 文件缺失：留着，删除接口自会清理 */ }
    }
    if (n) { save(); console.log(`[game] 已为 ${n} 个存量 ROM 补算内容指纹（去重用）`); }
}

// 玩家：拉取 ROM 列表（含当前账号是否管理员，前端据此决定是否显示导入区）
api['GET /api/roms'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    // q：按中文名 / 英文原名 / 短名 / 别名 / 厂商 搜索（街机玩家常只记得「饿狼」「kof98」）
    const q = String(url.parse(req.url, true).query.q || '').trim().toLowerCase().slice(0, 60);
    const list = (DB.roms || []).filter(r => romMatchQ(r, q));
    sendJson(res, 200, { roms: list.map(romMeta), admin: romAdminOk(req), q });
};
// 玩家：下载 ROM（鉴权后流式回传，前端转 blob 喂给模拟器）
api['GET /api/roms/download'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const id = String(url.parse(req.url, true).query.id || '');
    const rom = (DB.roms || []).find(r => r.id === id);
    if (!rom || !/^[A-Za-z0-9_-]+$/.test(id)) return sendJson(res, 404, { error: 'ROM 不存在' });
    const file = path.join(ROMS_DIR, id + '.bin');
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'ROM 文件缺失' });
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fs.statSync(file).size,
        'Cache-Control': 'private, max-age=86400',
    });
    fs.createReadStream(file).pipe(res);
};
// 管理员：上传 ROM（原始二进制流式落盘，不走 readBody 的 JSON 解析）
api['POST /api/roms/upload'] = (req, res) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可上传 ROM' });
    const q = url.parse(req.url, true).query;
    const name = String(q.name || '').slice(0, 120).replace(/[<>&"'/\\]/g, '');
    // 原始文件名：街机 ROM 的身份就在它身上（rbffspec.zip → 短名 rbffspec），必须保留
    const fileName = String(q.fileName || name || '').slice(0, 180).replace(/[<>&"'/\\]/g, '');
    const core = String(q.core || '');
    if (!name || !ROM_CORES.has(core)) return sendJson(res, 400, { error: '参数不完整（name/core）' });
    // 扩展元数据（可选）：platform/year/maker/genre/cover/biosId/parentId
    const platform = ROM_PLATFORMS[q.platform] ? String(q.platform) : '';
    const biosId = /^[A-Za-z0-9_-]+$/.test(String(q.biosId || '')) ? String(q.biosId) : '';
    const parentId = /^[A-Za-z0-9_-]+$/.test(String(q.parentId || '')) ? String(q.parentId) : '';
    const year = /^\d{4}$/.test(String(q.year || '')) ? String(q.year) : '';
    const maker = String(q.maker || '').slice(0, 40).replace(/[<>&"'/\\]/g, '');
    const genre = String(q.genre || '').slice(0, 20).replace(/[<>&"'/\\]/g, '');
    const cover = String(q.cover || '').slice(0, 8);
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > ROM_MAX_BYTES) return sendJson(res, 413, { error: '文件过大（上限 512MB）' });
    fs.mkdirSync(ROMS_DIR, { recursive: true });
    const id = 'rom_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const file = path.join(ROMS_DIR, id + '.bin');
    let received = 0, over = false, done = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    const cleanup = () => { try { fs.unlinkSync(file); } catch (e) {} };
    const out = fs.createWriteStream(file);
    out.on('error', e => { cleanup(); finish(500, { error: '写入失败：' + e.message }); });
    req.on('data', c => {
        if (over) return;
        received += c.length;
        if (received > ROM_MAX_BYTES) {
            over = true;
            out.destroy();
            cleanup();
            finish(413, { error: '文件过大（上限 512MB）' });
            return;
        }
        if (!out.write(c)) {          // 写入背压：磁盘忙时暂停接收，drain 后恢复
            req.pause();
            out.once('drain', () => req.resume());
        }
    });
    req.on('end', () => {
        if (over) return;
        if (done) { cleanup(); return; }
        if (received === 0) { cleanup(); return finish(400, { error: '空文件' }); }
        out.end(async () => {
            // 内容指纹去重：与库内任一 ROM 内容一致 → 拒收并提示已存在的名字
            try {
                const hash = await romFileHash(file);
                const dup = (DB.roms || []).find(r => r.hash && r.hash === hash);
                if (dup) {
                    cleanup();
                    return finish(409, { error: `重复上传：与「${dup.name}」（${ROM_CORE_LABELS[dup.core] || dup.core}）内容完全相同，已跳过` });
                }
                const u = getUserByToken(req);
                // 图鉴识别：ZIP 短名 + 内部 CRC → 中文名 / 英文原名 / 厂商年份 / 平台 / BIOS / CRC 校验
                let cat = null;
                try {
                    const short = String(fileName || name).replace(/\.(zip|7z|bin)$/i, '').toLowerCase();
                    if (short) {
                        const z = /\.zip$/i.test(fileName) ? romCatalog.readZipEntries(file) : { ok: false, entries: [] };
                        cat = romCatalog.resolve({ shortName: short, entries: z.ok ? z.entries : [] });
                    }
                } catch (e) { /* 图鉴识别失败不影响上传 */ }
                let dispName = name, plat = platform, yr = year, mk = maker, biosAuto = biosId;
                if (cat && cat.shortName) {
                    if (cat.displayName) dispName = cat.displayName;
                    if (!plat && cat.platform) plat = cat.platform;
                    if (!yr && cat.year) yr = cat.year;
                    if (!mk && cat.maker) mk = cat.maker;
                    // BIOS 自动挂载：NeoGeo→neogeo.zip、IGS→pgm.zip，库里已上传就自动绑
                    if (!biosAuto && cat.bios) {
                        const key = cat.bios.replace(/\.zip$/i, '').toLowerCase();
                        const b = (DB.romBios || []).find(x =>
                            String(x.name || '').toLowerCase().replace(/\.zip$/i, '') === key);
                        if (b) biosAuto = b.id;
                    }
                }
                DB.roms = DB.roms || [];
                DB.roms.push({
                    id, name: dispName, core, size: received, addedAt: Date.now(),
                    by: (u && u.username) || 'admin', hash, category: 'normal', sort: 0,
                    platform: plat, year: yr, maker: mk, genre, cover, biosId: biosAuto, parentId,
                    fileName: fileName || name,
                    shortName: (cat && cat.shortName) || '',
                    titleZh: (cat && cat.titleZh) || '',
                    titleEn: (cat && cat.titleEn) || '',
                    aliases: (cat && cat.aliases) || [],
                    crcStatus: (cat && cat.crcStatus) || '',
                    catalogVersion: (cat && cat.catalogVersion) || '',
                });
                save();
                finish(200, { ok: true, id, size: received, name: dispName, matched: cat });
            } catch (e) {
                cleanup();
                finish(500, { error: '保存失败：' + e.message });
            }
        });
    });
    req.on('error', () => { out.destroy(); cleanup(); finish(500, { error: '上传中断' }); });
};
// 管理员：修改 ROM 元数据（分类 / 排序 / 改名）
api['POST /api/roms/update'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可修改 ROM' });
    const id = String((body || {}).id || '');
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return sendJson(res, 400, { error: 'id 不合法' });
    DB.roms = DB.roms || [];
    const rom = DB.roms.find(r => r.id === id);
    if (!rom) return sendJson(res, 404, { error: 'ROM 不存在' });
    let changed = false;
    if (body.category != null) {
        const c = String(body.category);
        if (!['normal', 'invincible'].includes(c)) return sendJson(res, 400, { error: 'category 只能是 normal / invincible' });
        rom.category = c; changed = true;
    }
    if (body.sort != null) {
        const s = parseInt(body.sort, 10);
        if (isNaN(s) || s < 0 || s > 9999) return sendJson(res, 400, { error: 'sort 需为 0-9999 的数字（越小越靠前）' });
        rom.sort = s; changed = true;
    }
    if (body.name != null) {
        const nm = String(body.name).slice(0, 120).replace(/[<>&"'/\\]/g, '').trim();
        if (!nm) return sendJson(res, 400, { error: '名称不能为空' });
        rom.name = nm; changed = true;
    }
    // 街机扩展元数据
    if (body.platform != null) {
        const p = String(body.platform);
        if (p && !ROM_PLATFORMS[p]) return sendJson(res, 400, { error: 'platform 只能是 ' + Object.keys(ROM_PLATFORMS).join('/') + ' 或空' });
        rom.platform = p; changed = true;
    }
    if (body.year != null) {
        const y = String(body.year);
        if (y && !/^\d{4}$/.test(y)) return sendJson(res, 400, { error: 'year 需为 4 位年份或空' });
        rom.year = y; changed = true;
    }
    if (body.maker != null) {
        rom.maker = String(body.maker).slice(0, 40).replace(/[<>&"'/\\]/g, ''); changed = true;
    }
    if (body.genre != null) {
        rom.genre = String(body.genre).slice(0, 20).replace(/[<>&"'/\\]/g, ''); changed = true;
    }
    if (body.cover != null) {
        rom.cover = String(body.cover).slice(0, 8); changed = true;
    }
    if (body.biosId != null) {
        const b = String(body.biosId);
        if (b && !/^[A-Za-z0-9_-]+$/.test(b)) return sendJson(res, 400, { error: 'biosId 不合法' });
        if (b && !(DB.romBios || []).some(x => x.id === b)) return sendJson(res, 404, { error: 'BIOS 不存在，请先在「BIOS 管理」上传' });
        rom.biosId = b; changed = true;
    }
    if (body.parentId != null) {
        const pid = String(body.parentId);
        if (pid && !/^[A-Za-z0-9_-]+$/.test(pid)) return sendJson(res, 400, { error: 'parentId 不合法' });
        // 基板 ROM（clone）：必须同时加载父 ROM 才能跑，前端据此传 EJS_gameParentUrl
        if (pid && !(DB.roms || []).some(x => x.id === pid)) return sendJson(res, 404, { error: '父 ROM 不存在' });
        rom.parentId = pid; changed = true;
    }
    if (!changed) return sendJson(res, 400, { error: '没有要修改的字段' });
    save();
    sendJson(res, 200, { ok: true, rom: romMeta(rom) });
};
// 管理员：删除 ROM（元数据 + 磁盘文件一起清）
api['POST /api/roms/delete'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可删除 ROM' });
    const id = String((body || {}).id || '');
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return sendJson(res, 400, { error: 'id 不合法' });
    DB.roms = DB.roms || [];
    const i = DB.roms.findIndex(r => r.id === id);
    if (i < 0) return sendJson(res, 404, { error: 'ROM 不存在' });
    DB.roms.splice(i, 1);
    try { fs.unlinkSync(path.join(ROMS_DIR, id + '.bin')); } catch (e) {}
    save();
    sendJson(res, 200, { ok: true });
};

// ---------------- ROM 图鉴（街机短名 → 中文名 / CRC 校验 / 批量导入）----------------
// 背景：街机 ZIP 内文件名是板卡芯片编号（223-p1.bin），不含标题；唯一稳定身份是 ZIP 短名。
// 流程：上传 DAT（与核心版本匹配）→ 扫描 ROM 目录 → 预览确认（中文名/厂商年份/平台/BIOS/CRC）→ 导入。
// 中文名单独维护在 data/rom-zh.json，不混进 DAT，换 DAT 版本不影响翻译。
api['GET /api/admin/roms/catalog'] = (req, res) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const st = romCatalog.status();
    sendJson(res, 200, {
        catalog: st, zh: romCatalog.zh, platforms: romCatalog.PLATFORMS,
        // 服务器部署时管理员需要知道「往哪儿传、填什么路径」，这里直接把绝对路径给前端
        server: {
            platform: process.platform,
            inboxDir: ROM_INBOX_DIR,
            romsDir: ROMS_DIR,
            cwd: ROOT,
        },
        inbox: romInboxList(),
    });
};
// 收件箱：列出已上传到服务器的 ZIP（图鉴扫描的默认目标）
function romInboxList() {
    let files = [];
    try {
        files = fs.readdirSync(ROM_INBOX_DIR).filter(n => /\.zip$/i.test(n)).map(n => {
            let size = 0, mtime = 0;
            try { const st = fs.statSync(path.join(ROM_INBOX_DIR, n)); size = st.size; mtime = st.mtimeMs; } catch (e) { }
            return { file: n, shortName: n.replace(/\.zip$/i, '').toLowerCase(), size, mtime };
        });
    } catch (e) { files = []; }
    files.sort((a, b) => String(a.file).localeCompare(String(b.file)));
    let total = 0; for (const f of files) total += f.size;
    return { dir: ROM_INBOX_DIR, files, count: files.length, total };
}
// 收件箱上传：原始字节流（同 ROM 上传），文件名通过 query 传（短名必须保持原样）
api['POST /api/admin/roms/inbox/upload'] = (req, res) => {
    if (!romAdminOk(req)) { sendJson(res, 403, { error: '仅管理员' }); req.resume(); return; }
    const q = url.parse(req.url, true).query;
    const raw = String(q.fileName || q.name || '').slice(0, 180);
    // 只保留安全字符；非 ZIP 一律拒收（图鉴只认 ZIP）
    const safe = raw.replace(/[<>&"'\/\\:*?|]/g, '_').replace(/^\.+/, '');
    // 宁可拒绝也不要「静默改名」：把 ../../evil.zip 洗成 _.._evil.zip 虽然当下安全，
    // 但管理员会以为传成功了、文件名却被改了，短名一变街机就认不出这是哪个游戏。
    // 而且一旦以后放宽替换规则，这种写法会直接退化成目录穿越。
    if (raw.indexOf('..') >= 0) return sendJson(res, 400, { error: '文件名不合法（含 ..）：' + raw });
    if (!/\.zip$/i.test(safe)) return sendJson(res, 400, { error: '只接受 .zip 文件：' + (raw || '(未给文件名)') });
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > ROM_MAX_BYTES) { req.resume(); return sendJson(res, 413, { error: '文件过大（上限 512MB）' }); }
    try { fs.mkdirSync(ROM_INBOX_DIR, { recursive: true }); } catch (e) {
        return sendJson(res, 500, { error: '无法创建收件箱目录：' + e.message });
    }
    const file = path.join(ROM_INBOX_DIR, safe);
    let received = 0, over = false, done = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    const cleanup = () => { try { fs.unlinkSync(file); } catch (e) { } };
    let out = null;
    try { out = fs.createWriteStream(file); } catch (e) { return finish(500, { error: '写入失败：' + e.message }); }
    out.on('error', e => { cleanup(); finish(500, { error: '写入失败：' + e.message }); });
    req.on('data', c => {
        if (over) return;
        received += c.length;
        if (received > ROM_MAX_BYTES) {
            over = true; out.destroy(); cleanup();
            finish(413, { error: '文件过大（上限 512MB）' });
            return;
        }
        if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('end', () => {
        if (over) return;
        if (received === 0) { cleanup(); return finish(400, { error: '空文件：' + safe }); }
        out.end(() => finish(200, { ok: true, file: safe, size: received, inbox: romInboxList() }));
    });
    req.on('error', () => { cleanup(); finish(500, { error: '上传中断' }); });
};
api['POST /api/admin/roms/inbox/clear'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const only = Array.isArray((body || {}).files) ? (body || {}).files.map(String) : null;
    let removed = 0;
    try {
        for (const n of fs.readdirSync(ROM_INBOX_DIR)) {
            if (!/\.zip$/i.test(n)) continue;
            if (only && only.indexOf(n) < 0) continue;
            // 文件名来自 readdirSync，天然不含路径分隔符，不可能穿越出去
            if (/[<>:*?|]/.test(n)) continue;
            try { fs.unlinkSync(path.join(ROM_INBOX_DIR, n)); removed++; } catch (e) { }
        }
    } catch (e) { }
    sendJson(res, 200, { ok: true, removed, inbox: romInboxList() });
};
// DAT 走原始文本流（同 ROM 上传，需加进 RAW_BODY_API），避免 JSON 转义撑大内存
api['POST /api/admin/roms/dat'] = (req, res) => {
    // 注意：这里不能 res.destroy() —— 连接被掐断时浏览器只会报 ECONNRESET，
    // 看不出是「没权限」还是「网络断了」。照常回 403，再把请求体排空即可。
    if (!romAdminOk(req)) { sendJson(res, 403, { error: '仅管理员' }); req.resume(); return; }
    const q = url.parse(req.url, true).query;
    const file = String(q.file || '').slice(0, 60);
    const chunks = [];
    let received = 0, done = false;
    const DAT_MAX = 128 * 1024 * 1024;
    // 超限后不能只标记 done：必须继续排空请求体，否则客户端会卡在「上传中」
    let overLimit = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    req.on('data', c => {
        if (overLimit) return;                      // 已判定超限：丢弃后续分片
        received += c.length;
        if (received > DAT_MAX) { overLimit = true; chunks.length = 0; return; }
        chunks.push(c);
    });
    req.on('end', () => {
        if (done) return;
        if (overLimit) return finish(413, { error: 'DAT 过大（上限 128MB）' });
        const text = Buffer.concat(chunks).toString('utf8');
        const r = romCatalog.saveDat(file, text);
        if (!r.ok) return finish(400, { error: r.error });
        finish(200, { ok: true, ...r });
    });
    req.on('error', () => finish(500, { error: '上传中断' }));
};
api['POST /api/admin/roms/dat/delete'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const r = romCatalog.deleteDat(String((body || {}).file || ''));
    if (!r.ok) return sendJson(res, 404, { error: r.error });
    sendJson(res, 200, { ok: true, ...romCatalog.status() });
};
api['POST /api/admin/roms/zh'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const raw = (body || {}).zh;
    let obj = raw;
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch (e) { return sendJson(res, 400, { error: 'JSON 格式错误：' + e.message }); }
    }
    if (!obj || typeof obj !== 'object') return sendJson(res, 400, { error: '参数不完整（zh 为对象或 JSON 字符串）' });
    const zh = romCatalog.saveZh(obj);
    sendJson(res, 200, { ok: true, count: Object.keys(zh).length, zh });
};
// 扫描服务器目录：只读每个 ZIP 的中央目录（不解压），给出「待确认」预览
api['POST /api/admin/roms/scan'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const dir = String((body || {}).dir || '').trim() || ROM_INBOX_DIR;   // 留空 = 扫收件箱
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        // 报错里直接把「服务器路径 vs 本地路径」讲清楚：这是部署到服务器后最高频的误解
        return sendJson(res, 400, {
            error: '目录不存在：' + dir + '。注意这是**服务器**上的路径，不是你电脑上的；'
                + '请先用上面的「上传到服务器」把 ROM 传进 ' + ROM_INBOX_DIR + '，再留空扫描。',
            hint: '收件箱当前 ' + romInboxList().count + ' 个 ZIP',
            inbox: romInboxList(),
        });
    }
    const r = romCatalog.scanDir(dir, { limit: (body || {}).limit });
    if (!r.ok) return sendJson(res, 400, { error: r.error });
    // 已导入标记：同 shortName 或同文件已入库 → 前端默认不勾选
    const have = new Set((DB.roms || []).map(x => String(x.shortName || '').toLowerCase()).filter(Boolean));
    for (const it of r.items) it.imported = have.has(it.shortName);
    sendJson(res, 200, r);
};
// 批量导入：把选中的 ROM 复制（或移动）进库，自动挂 BIOS / 回填父 ROM
api['POST /api/admin/roms/import'] = async (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员' });
    const items = Array.isArray((body || {}).items) ? (body || {}).items : [];
    if (!items.length) return sendJson(res, 400, { error: '没有选中任何 ROM' });
    const move = !!(body || {}).move;
    const u = getUserByToken(req);
    DB.roms = DB.roms || [];
    fs.mkdirSync(ROMS_DIR, { recursive: true });
    const added = [], skipped = [];
    for (const it of items.slice(0, 200)) {
        const src = String(it.path || '');
        if (!src || !src.toLowerCase().endsWith('.zip') || !fs.existsSync(src)) { skipped.push({ file: src, reason: '文件不存在或非 ZIP' }); continue; }
        if (!path.isAbsolute(src)) { skipped.push({ file: src, reason: '路径必须是绝对路径' }); continue; }
        const shortName = String(it.shortName || path.basename(src).replace(/\.zip$/i, '')).toLowerCase();
        // 基板 BIOS（neogeo.zip 等）跟游戏 ROM 在同一个目录里，但它是「零件」不是游戏：
        // 当成游戏导入会在玩家列表里多点一个永远打不开的条目。请走「BIOS 管家」上传。
        if (romCatalog.isBiosShortName(shortName)) {
            skipped.push({ file: src, reason: '这是基板 BIOS，不是游戏（请在「BIOS 管家」里上传）' });
            continue;
        }
        if ((DB.roms || []).some(r => r.shortName === shortName)) { skipped.push({ file: src, reason: '已导入过同短名 ROM' }); continue; }
        // 允许管理员在预览表里改中文名 / 平台 / 年份
        let info;
        try {
            const z = romCatalog.readZipEntries(src);
            info = romCatalog.resolve({ shortName, entries: z.ok ? z.entries : [] });
        } catch (e) { info = romCatalog.resolve({ shortName, entries: [] }); }
        if (it.titleZh) info.titleZh = String(it.titleZh).slice(0, 60);
        if (it.platform && romCatalog.PLATFORMS.includes(String(it.platform))) { info.platform = String(it.platform); info.bios = romCatalog.BIOS_HINT[info.platform] || ''; }
        if (it.year) info.year = String(it.year).slice(0, 4);
        const id = 'rom_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        const dest = path.join(ROMS_DIR, id + '.bin');
        try {
            if (move) fs.renameSync(src, dest); else fs.copyFileSync(src, dest);
        } catch (e) { skipped.push({ file: src, reason: '写入失败：' + e.message }); continue; }
        let hash = '';
        try { hash = await romFileHash(dest); } catch (e) { }
        if (hash) {
            const dup = (DB.roms || []).find(r => r.hash && r.hash === hash);
            if (dup) {
                try { fs.unlinkSync(dest); } catch (e) { }
                skipped.push({ file: src, reason: `内容与「${dup.name}」完全相同` });
                continue;
            }
        }
        let biosId = '';
        if (info.bios) {
            const key = info.bios.replace(/\.zip$/i, '').toLowerCase();
            const b = (DB.romBios || []).find(x => String(x.name || '').toLowerCase().replace(/\.zip$/i, '') === key);
            if (b) biosId = b.id;
        }
        DB.roms.push({
            id, name: info.titleZh || info.titleEn || shortName,
            core: String(it.core || info.core || 'fbneo'),
            size: fs.existsSync(dest) ? fs.statSync(dest).size : 0,
            addedAt: Date.now(), by: (u && u.username) || 'admin', hash,
            category: 'normal', sort: 0,
            platform: info.platform || 'other', year: info.year || '', maker: info.maker || '',
            genre: '', cover: '', biosId, parentId: '',
            fileName: path.basename(src), shortName,
            titleZh: info.titleZh || '', titleEn: info.titleEn || '',
            aliases: info.aliases || [], crcStatus: info.crcStatus || '',
            catalogVersion: info.catalogVersion || '',
        });
        added.push({ id, shortName, name: info.titleZh || info.titleEn || shortName, crcStatus: info.crcStatus, parentShortName: info.parentShortName });
    }
    // 父子 ROM 回填：克隆基板必须挂到母 ROM 上才能跑（前端据此传 EJS_gameParentUrl）
    let linked = 0;
    for (const a of added) {
        if (!a.parentShortName) continue;
        const p = (DB.roms || []).find(r => r.shortName === a.parentShortName);
        if (!p) continue;
        const self = (DB.roms || []).find(r => r.id === a.id);
        if (self) { self.parentId = p.id; linked++; }
    }
    save();
    sendJson(res, 200, { ok: true, added, skipped, linked, total: (DB.roms || []).length });
};

// ---------------- BIOS 管家（街机刚需） ----------------
// NeoGeo 必须 neogeo.zip、IGS(PGM) 必须 pgm.zip，缺了就是纯黑屏且无任何报错。
// 管理员只需各上传一次，之后所有街机 ROM 共用；EJS_biosUrl 支持 zip，自动解压。
const BIOS_DIR = path.join(ROMS_DIR, 'bios');
const BIOS_MAX_BYTES = 128 * 1024 * 1024;
const biosMeta = b => ({ id: b.id, name: b.name, size: b.size, addedAt: b.addedAt, hint: b.hint || '' });

api['GET /api/roms/bios'] = (req, res) => {
    if (!getUserByToken(req)) return sendJson(res, 401, { error: '未登录' });
    // 同时回传"每种街机平台缺哪个 BIOS"，前端据此在列表上标红警告。
    // 只有库里真有该平台的游戏才算 missing（缺了必然黑屏）；库里没有的进 notNeeded（暂不需要）。
    const have = (DB.romBios || []).map(b => (b.name || '').toLowerCase());
    const has = file => {
        const bare = file.replace(/\.zip$/i, '').toLowerCase();
        return have.some(n => n === file.toLowerCase() || n === bare);
    };
    const demand = romBiosDemand();
    const missing = [], notNeeded = [], used = [];
    for (const file of ROM_BIOS_FILES) {
        const src = demand.get(file);
        if (has(file)) { if (src && src.size) used.push({ file, platforms: [...src].map(biosKeyLabel) }); continue; }
        if (src && src.size) missing.push({ file, platforms: [...src].map(biosKeyLabel) });
        else notNeeded.push({ file });
    }
    sendJson(res, 200, { bios: (DB.romBios || []).map(biosMeta), missing, notNeeded, used, admin: romAdminOk(req) });
};
api['GET /api/roms/bios/download'] = (req, res) => {
    if (!getUserByToken(req)) return sendJson(res, 401, { error: '未登录' });
    const id = String(url.parse(req.url, true).query.id || '');
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return sendJson(res, 404, { error: 'BIOS 不存在' });
    const b = (DB.romBios || []).find(x => x.id === id);
    if (!b) return sendJson(res, 404, { error: 'BIOS 不存在' });
    const file = path.join(BIOS_DIR, b.id + '.bin');
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'BIOS 文件缺失' });
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fs.statSync(file).size,
        'Cache-Control': 'private, max-age=86400',
    });
    fs.createReadStream(file).pipe(res);
};
api['POST /api/roms/bios/upload'] = (req, res) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可上传 BIOS' });
    const q = url.parse(req.url, true).query;
    const name = String(q.name || '').slice(0, 60).replace(/[^A-Za-z0-9._-]/g, '');
    if (!name) return sendJson(res, 400, { error: '请填 BIOS 名称，如 neogeo / pgm' });
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > BIOS_MAX_BYTES) return sendJson(res, 413, { error: '文件过大（上限 128MB）' });
    // 同名覆盖：BIOS 就那几个，重复上传多半是补文件，直接替换更省事
    const exist = (DB.romBios || []).find(x => x.name.toLowerCase() === name.toLowerCase());
    const id = exist ? exist.id : 'bios_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    fs.mkdirSync(BIOS_DIR, { recursive: true });
    const file = path.join(BIOS_DIR, id + '.bin');
    let received = 0, over = false, done = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    const out = fs.createWriteStream(file);
    out.on('error', e => { try { fs.unlinkSync(file); } catch (_) {} finish(500, { error: '写入失败：' + e.message }); });
    req.on('data', c => {
        if (over) return;
        received += c.length;
        if (received > BIOS_MAX_BYTES) {
            over = true; out.destroy();
            try { fs.unlinkSync(file); } catch (_) {}
            return finish(413, { error: '文件过大（上限 128MB）' });
        }
        if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('end', () => {
        if (over || done) return;
        if (!received) { try { fs.unlinkSync(file); } catch (_) {} return finish(400, { error: '空文件' }); }
        out.end(() => {
            DB.romBios = DB.romBios || [];
            if (exist) { exist.size = received; exist.addedAt = Date.now(); }
            else DB.romBios.push({ id, name, size: received, addedAt: Date.now() });
            save();
            finish(200, { ok: true, id, size: received, replaced: !!exist });
        });
    });
    req.on('error', () => { out.destroy(); try { fs.unlinkSync(file); } catch (_) {} finish(500, { error: '上传中断' }); });
};
api['POST /api/roms/bios/delete'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '仅管理员可删除 BIOS' });
    const id = String((body || {}).id || '');
    DB.romBios = DB.romBios || [];
    const i = DB.romBios.findIndex(x => x.id === id);
    if (i < 0) return sendJson(res, 404, { error: 'BIOS 不存在' });
    DB.romBios.splice(i, 1);
    try { fs.unlinkSync(path.join(BIOS_DIR, id + '.bin')); } catch (e) {}
    // 解绑引用，避免前端拿着失效 id 去拼 URL
    (DB.roms || []).forEach(r => { if (r.biosId === id) r.biosId = ''; });
    save();
    sendJson(res, 200, { ok: true });
};

// ---------------- 云存档（模拟器进度不丢的关键） ----------------
// 存档是二进制且单份可达数十 MB，和 ROM 一样走「磁盘文件 + 登录鉴权」，
// 绝不写进 db.json / MySQL（会把存档文件拖垮、还会把玩家的ROM搞串行）。
// 目录：data/emu-saves/<userId>/<romId>.state（即时存档）/ .sram（游戏内存档）
const EMU_SAVES_DIR = path.join(DATA_DIR, 'emu-saves');
const SAVE_MAX = { state: 64 * 1024 * 1024, sram: 16 * 1024 * 1024 };
const safeId = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

function saveFilePath(userId, romId, kind) {
    if (!/^(state|sram)$/.test(kind)) return null;
    const raw = String(romId || '');
    const u = safeId(userId), r = safeId(romId);
    if (!u || !r) return null;
    // 关键：光把 ../ 剥掉是不够的 —— '../../server.js' 会被洗成 'serverjs'，
    // 既没穿出去、又变成一句含义不清的 404。这里直接判定为非法参数（400），
    // 让调用方一眼看出是 id 不合法，而不是误以为「存档不存在」。
    if (r !== raw) return null;
    const dir = path.join(EMU_SAVES_DIR, u);
    const rel = path.join(u, r + '.' + kind);
    const full = path.join(EMU_SAVES_DIR, rel);
    // 防目录穿越：拼好的绝对路径必须还在 EMU_SAVES_DIR 内
    if (!full.startsWith(EMU_SAVES_DIR + path.sep)) return null;
    return { full, dir, rel };
}

api['GET /api/emu/save/meta'] = (req, res) => {
    const u = getUserByToken(req);
    if (!u) return sendJson(res, 401, { error: '未登录' });
    const romId = String(url.parse(req.url, true).query.romId || '');
    const out = {};
    for (const kind of ['state', 'sram']) {
        const p = saveFilePath(u.id, romId, kind);
        if (!p) { out[kind] = null; continue; }
        try {
            const st = fs.statSync(p.full);
            out[kind] = { size: st.size, at: Math.floor(st.mtimeMs) };
        } catch (e) { out[kind] = null; }
    }
    sendJson(res, 200, { romId, saves: out });
};
api['GET /api/emu/save'] = (req, res) => {
    const u = getUserByToken(req);
    if (!u) return sendJson(res, 401, { error: '未登录' });
    const q = url.parse(req.url, true).query;
    const p = saveFilePath(u.id, q.romId, q.kind);
    if (!p) return sendJson(res, 400, { error: '参数不合法（romId/kind）' });
    if (!fs.existsSync(p.full)) return sendJson(res, 404, { error: '尚无云存档' });
    const st = fs.statSync(p.full);
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'no-store',
    });
    fs.createReadStream(p.full).pipe(res);
};
api['POST /api/emu/save'] = (req, res) => {
    const u = getUserByToken(req);
    if (!u) return sendJson(res, 401, { error: '未登录' });
    const q = url.parse(req.url, true).query;
    const kind = String(q.kind || '');
    const p = saveFilePath(u.id, q.romId, kind);
    if (!p) return sendJson(res, 400, { error: '参数不合法（romId/kind）' });
    const limit = SAVE_MAX[kind] || SAVE_MAX.sram;
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > limit) return sendJson(res, 413, { error: '存档过大（上限 ' + Math.round(limit / 1048576) + 'MB）' });
    fs.mkdirSync(p.dir, { recursive: true });
    let received = 0, over = false, done = false;
    const finish = (code, data) => { if (done) return; done = true; sendJson(res, code, data); };
    const out = fs.createWriteStream(p.full);
    out.on('error', e => finish(500, { error: '写入失败：' + e.message }));
    req.on('data', c => {
        if (over) return;
        received += c.length;
        if (received > limit) {
            over = true; out.destroy();
            try { fs.unlinkSync(p.full); } catch (_) {}
            return finish(413, { error: '存档过大（上限 ' + Math.round(limit / 1048576) + 'MB）' });
        }
        if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('end', () => {
        if (over || done) return;
        if (!received) return finish(400, { error: '空存档，忽略' });
        out.end(() => finish(200, { ok: true, size: received, at: Date.now() }));
    });
    req.on('error', () => { out.destroy(); try { fs.unlinkSync(p.full); } catch (_) {} finish(500, { error: '上传中断' }); });
};
api['DELETE /api/emu/save'] = (req, res) => {
    const u = getUserByToken(req);
    if (!u) return sendJson(res, 401, { error: '未登录' });
    const q = url.parse(req.url, true).query;
    const p = saveFilePath(u.id, q.romId, q.kind);
    if (!p) return sendJson(res, 400, { error: '参数不合法（romId/kind）' });
    try { fs.unlinkSync(p.full); } catch (e) {}
    sendJson(res, 200, { ok: true });
};

api['POST /api/admin/mail'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const isAdmin = user.isAdmin || user.id === 'admin';
    if (!isAdmin) return sendJson(res, 403, { error: '无权限' });

    const rewards = body.rewards || {};
    const title = body.title || '系统邮件';
    const content = body.content || '';
    const hasReward = Object.keys(rewards).some(k => (parseInt(rewards[k]) || 0) > 0);

    // 三种发送范围：全员（toAll） / 指定多个（usernames[]） / 指定单个（to / username）
    if (body.toAll) {
        const mail = {
            id: newId(), toAll: true, to: null, title, content, rewards,
            time: Date.now(), from: user.username || 'admin', claimedBy: [],
        };
        DB.mails.push(mail);
        save();
        return sendJson(res, 200, { ok: true, count: -1, mails: [mail] }); // -1 表示全员
    }

    let names = Array.isArray(body.usernames) ? body.usernames.slice() : [];
    if (body.username) names.push(body.username);
    if (!names.length && body.to) {
        const tu = Object.values(DB.users).find(x => x.id === body.to);
        if (tu) names.push(tu.username);
    }
    names = [...new Set(names.map(n => String(n || '').trim()).filter(Boolean))];
    if (!names.length) return sendJson(res, 400, { error: '请选择收件玩家' });

    const unknown = [];
    const targets = [];
    for (const n of names) {
        const tu = Object.values(DB.users).find(x => x.username === n);
        if (!tu) { unknown.push(n); continue; }
        targets.push(tu);
    }
    if (!targets.length) return sendJson(res, 400, { error: '未找到玩家：' + unknown.join('、') });

    const mails = targets.map(tu => ({
        id: newId(), toAll: false, to: tu.id, toName: tu.username,
        title, content, rewards,
        time: Date.now(), from: user.username || 'admin', claimedBy: [],
    }));
    mails.forEach(m => DB.mails.push(m));
    save();
    sendJson(res, 200, {
        ok: true, count: mails.length, mails,
        unknown,
        hint: hasReward ? '' : '注意：该邮件没有附带资源',
    });
};

// ---------------- 礼品码 ----------------
api['POST /api/gift/redeem'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const code = String((body && body.code) || '').trim();
    if (!code) return sendJson(res, 400, { error: '请输入礼包码' });
    if (!Array.isArray(DB.giftCodes) || !DB.giftCodes.length) return sendJson(res, 400, { error: '礼包码无效' });
    const gift = DB.giftCodes.find(g => g.code && g.code.toLowerCase() === code.toLowerCase());
    if (!gift) return sendJson(res, 400, { error: '礼包码无效或已过期' });
    if (gift.enabled === false) return sendJson(res, 400, { error: '该礼包码已停用' });
    if (gift.expires && Date.now() > +new Date(gift.expires)) return sendJson(res, 400, { error: '该礼包码已过期' });
    gift.usedBy = Array.isArray(gift.usedBy) ? gift.usedBy : [];
    if (gift.usedBy.some(u => u.userId === user.id)) return sendJson(res, 400, { error: '该礼包码您已兑换过' });
    if (gift.maxUses > 0 && gift.usedBy.length >= gift.maxUses) return sendJson(res, 400, { error: '该礼包码已被领完' });

    // 通过邮件系统发放（与后台发奖保持一致，玩家可一键领取）
    const rewards = gift.rewards || {};
    const mail = {
        id: newId(), toAll: false, to: user.id, toName: user.username,
        title: '🎁 礼包码奖励 · ' + (gift.name || gift.code),
        content: gift.content || ('感谢您的支持！礼包码 ' + gift.code + ' 兑换成功。'),
        rewards, time: Date.now(), from: 'gift', claimedBy: [],
    };
    DB.mails.push(mail);
    gift.usedBy.push({ userId: user.id, username: user.username, time: Date.now() });
    save();
    sendJson(res, 200, { ok: true, mail, reward: rewards });
};

api['POST /api/account/delete'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const pw = String((body && body.password) || '');
    if (!pw) return sendJson(res, 400, { error: '请输入密码' });
    if (!verifyPassword(pw, user.password)) return sendJson(res, 401, { error: '密码错误' });
    if (String((body && body.confirm) || '') !== '确认注销') return sendJson(res, 400, { error: '请输入「确认注销」' });

    const uid = user.id;
    for (const t of Object.keys(DB.tokens)) if (DB.tokens[t] === uid) delete DB.tokens[t];
    if (Array.isArray(DB.mails)) DB.mails = DB.mails.filter(m => m.to !== uid);
    if (DB.clans && typeof DB.clans === 'object') {
        for (const cid of Object.keys(DB.clans)) {
            const cl = DB.clans[cid];
            if (cl && Array.isArray(cl.members)) cl.members = cl.members.filter(m => m.userId !== uid);
        }
    }
    if (Store.isMySQL()) {
        try { Store.deletePlayer(uid); } catch (e) { console.error('[game] 删 MySQL player 失败：' + e.message); }
    }
    delete DB.users[uid];
    save();
    if (req.headers.authorization) {
        const tok = String(req.headers.authorization).replace(/^Bearer\s+/i, '').trim();
        if (tok) delete DB.tokens[tok];
    }
    sendJson(res, 200, { ok: true });
};

// ---------------- 礼品码 后台管理 ----------------
api['POST /api/admin/gift/save'] = (req, res, body) => {
    const u = getUserByToken(req);
    if (!u || (!u.isAdmin && u.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    if (!Array.isArray(DB.giftCodes)) DB.giftCodes = [];
    const code = String((body && body.code) || '').trim();
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(code)) return sendJson(res, 400, { error: '礼包码仅允许 4-32 位字母/数字/下划线/短横' });
    const rewards = body.rewards || {};
    if (Object.keys(rewards).length === 0) return sendJson(res, 400, { error: '请填写至少一项奖励' });
    const gift = {
        code,
        name: String(body.name || code),
        content: String(body.content || ''),
        rewards,
        maxUses: Math.max(0, parseInt(body.maxUses) || 0),
        enabled: body.enabled !== false,
        expires: body.expires || null,
        usedBy: [],
        createdAt: Date.now(),
        createdBy: u.username || 'admin',
    };
    const i = DB.giftCodes.findIndex(g => g.code.toLowerCase() === code.toLowerCase());
    if (i >= 0) {
        gift.usedBy = DB.giftCodes[i].usedBy || [];
        gift.createdAt = DB.giftCodes[i].createdAt;
        gift.createdBy = DB.giftCodes[i].createdBy;
        DB.giftCodes[i] = gift;
    } else {
        DB.giftCodes.push(gift);
    }
    save();
    sendJson(res, 200, { ok: true, gift });
};
api['POST /api/admin/gift/delete'] = (req, res, body) => {
    const u = getUserByToken(req);
    if (!u || (!u.isAdmin && u.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const code = String((body && body.code) || '');
    DB.giftCodes = (DB.giftCodes || []).filter(g => g.code !== code);
    save();
    sendJson(res, 200, { ok: true });
};
api['GET /api/admin/gift/list'] = (req, res) => {
    const u = getUserByToken(req);
    if (!u || (!u.isAdmin && u.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const list = (DB.giftCodes || []).map(g => ({
        code: g.code, name: g.name, content: g.content, rewards: g.rewards,
        maxUses: g.maxUses, usedCount: (g.usedBy || []).length,
        enabled: g.enabled, expires: g.expires, createdAt: g.createdAt, createdBy: g.createdBy,
    }));
    sendJson(res, 200, { ok: true, list });
};

// ============================================================
// AI 酒馆（SillyTavern）网关配置 —— 管理后台可视化配置，改完立即生效、无需重启
//   之前只能让运维去服务器上改 data/tavern-env.json，既找不到文件又要重启；
//   现在后台填表 → 保存 → 热更新（同时写入 process.env，保证优先级压过环境变量）。
// ============================================================
api['GET /api/admin/tavern/config'] = (req, res) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
    const cfg = Tavern.getConfig();
    sendJson(res, 200, {
        ok: true,
        config: {
            url: cfg.TAVERN_URL,
            enabled: cfg.TAVERN_ENABLED !== '0',
            handle: cfg.TAVERN_ADMIN_HANDLE,
            password: cfg.TAVERN_ADMIN_PASSWORD,
            forwardRealIp: cfg.TAVERN_FORWARD_REAL_IP === '1',
        },
        hasPassword: cfg.hasPassword,
        file: cfg.file,
    });
};

api['POST /api/admin/tavern/config'] = async (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
    const patch = {};
    if (body.url != null) {
        const u = String(body.url).trim();
        if (!/^https?:\/\//i.test(u)) return sendJson(res, 400, { error: '上游地址必须以 http:// 或 https:// 开头' });
        patch.TAVERN_URL = u.replace(/\/+$/, '');
    }
    if (body.enabled != null) patch.TAVERN_ENABLED = body.enabled ? '1' : '0';
    if (body.handle != null) patch.TAVERN_ADMIN_HANDLE = String(body.handle).trim().slice(0, 64);
    if (body.forwardRealIp != null) patch.TAVERN_FORWARD_REAL_IP = body.forwardRealIp ? '1' : '0';
    // 密码允许空串（= 不开自动开号，退化为共享账号模式）
    if (body.password != null) patch.TAVERN_ADMIN_PASSWORD = String(body.password).slice(0, 256);

    const r = Tavern.configure(patch);
    if (!r.ok) return sendJson(res, 500, { error: r.msg });
    // 保存后立刻自检一次，让后台直接显示「现在到底通没通」
    let test = null;
    try { test = await Tavern.testConnection(); } catch (e) { test = { ok: false, note: e.message }; }
    sendJson(res, 200, { ok: true, config: r.config, test });
};

api['POST /api/admin/tavern/test'] = async (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
    const patch = {};
    if (body.url) patch.TAVERN_URL = String(body.url).trim().replace(/\/+$/, '');
    if (body.handle) patch.TAVERN_ADMIN_HANDLE = String(body.handle).trim();
    if (body.password != null) patch.TAVERN_ADMIN_PASSWORD = String(body.password);
    try {
        const r = await Tavern.testConnection(patch);
        sendJson(res, 200, Object.assign({ ok: true }, r));
    } catch (e) {
        sendJson(res, 200, { ok: false, online: false, note: e.message });
    }
};

// 列出 SillyTavern 里已有的账号（句柄）——管理员常常不知道 ST 里的管理员叫什么
api['POST /api/admin/tavern/handles'] = (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
    const r = Tavern.listHandles((body || {}).dir);
    if (!r.ok) return sendJson(res, 400, { error: r.error });
    sendJson(res, 200, { ok: true, ...r });
};
// 扫描本机常见端口，帮管理员找到 SillyTavern 实际跑在哪个端口
api['POST /api/admin/tavern/scan'] = async (req, res, body) => {
    if (!romAdminOk(req)) return sendJson(res, 403, { error: '无权限' });
    const from = Number(body && body.from) || 8000;
    const to = Number(body && body.to) || 8010;
    if (to - from > 200) return sendJson(res, 400, { error: '扫描范围过大（最多 200 个端口）' });
    try {
        const ports = await Tavern.scanPorts(from, to);
        sendJson(res, 200, { ok: true, ports });
    } catch (e) {
        sendJson(res, 200, { ok: false, ports: [], note: e.message });
    }
};

// 删除玩家（含其 token、邮件、聊天中无关，存档直接抹除）
api['POST /api/admin/user/delete'] = (req, res, body) => {
    const admin = getUserByToken(req);
    if (!admin || (!admin.isAdmin && admin.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const us = Array.isArray(DB.users) ? DB.users : Object.values(DB.users);
    const isArr = Array.isArray(DB.users);
    let names = Array.isArray(body.usernames) ? body.usernames.slice() : [];
    if (body.username) names.push(body.username);
    names = [...new Set(names.map(n => String(n || '').trim()).filter(Boolean))];
    if (!names.length) return sendJson(res, 400, { error: '请选择要删除的玩家' });

    let removed = 0;
    const ids = new Set();
    for (const n of names) {
        if (n === 'admin') continue;
        const tu = us.find(x => x.username === n);
        if (!tu) continue;
        ids.add(tu.id);
        if (isArr) {
            const i = DB.users.findIndex(x => x.id === tu.id);
            if (i >= 0) DB.users.splice(i, 1);
        } else {
            delete DB.users[tu.id];
        }
        removed++;
    }
    // 清掉这些玩家的 token 与其专属邮件
    if (removed) {
        for (const t of Object.keys(DB.tokens || {})) {
            if (ids.has(DB.tokens[t])) delete DB.tokens[t];
        }
        DB.mails = (DB.mails || []).filter(m => !m.to || !ids.has(m.to));
        save();
    }
    sendJson(res, 200, { ok: true, removed });
};

api['POST /api/admin/hero/add'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const t = body.hero;
    if (!t.name) return sendJson(res, 400, { error: '名称必填' });
    t.id = newId();
    if (!t.rarity) t.rarity = '史诗';
    // 属性只允许 5 系；老写法（木/风/雷）自动归一
    if (ELEMENT_ALIAS[t.element]) t.element = ELEMENT_ALIAS[t.element];
    if (!ELEMENTS.includes(t.element)) t.element = '火';
    if (!t.baseAtk) t.baseAtk = 1000;
    if (!t.baseHp) t.baseHp = 8000;
    if (!t.skill) t.skill = { name: '默认技能', desc: '造成 150% 攻击伤害', cd: 5, multiplier: 1.5 };
    if (!t.desc) t.desc = `${t.name}，${t.element}系英雄`;
    // 特效类型：默认斩击，可由后台指定（slash/water/fire/ice/meteor/...）
    if (!t.skill.fx) {
        const EM = { 水: 'water', 火: 'fire', 风: 'wind', 雷: 'bolt', 光: 'holy', 暗: 'dark' };
        t.skill.fx = EM[t.element] || 'slash';
    }
    if (!t.skill.tint) t.skill.tint = '#ffd56b';
    // 多技能：后台可配 1~3 个，缺省补一个主技能
    t.skills = normalizeSkills(t.skills, t.skill, t.element);
    if (!t.img) t.img = '8f83fcc3594f42b2255e89fa6d92087f.jpg';
    DB.heroes.push(t);
    saveHeroes();
    sendJson(res, 200, { ok: true, hero: t });
};

// 规范化技能数组：过滤空项、补默认特效与色值，最多 3 个
function normalizeSkills(skills, mainSkill, element) {
    const EM = { 水: 'water', 火: 'fire', 风: 'wind', 雷: 'bolt', 光: 'holy', 暗: 'dark' };
    let list = Array.isArray(skills) ? skills.filter(s => s && s.name) : [];
    if (!list.length && mainSkill) list = [mainSkill];
    if (!list.length) list = [{ name: '默认技能', desc: '造成 150% 攻击伤害', cd: 5, multiplier: 1.5 }];
    return list.slice(0, 3).map((s, i) => ({
        name: s.name,
        desc: s.desc || '',
        cd: Math.max(1, parseInt(s.cd) || 5),
        multiplier: parseFloat(s.multiplier) || 0,
        fx: s.fx || EM[element] || 'slash',
        tint: s.tint || '#ffd56b',
    }));
}

api['POST /api/admin/hero/update'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const t = body.hero;
    const idx = DB.heroes.findIndex(h => h.id === t.id);
    if (idx < 0) return sendJson(res, 400, { error: '英雄不存在' });
    // 多技能规范化；同时保持 skill（主技能）与 skills[0] 同步
    if (t.skills || t.skill) {
        const el = t.element || DB.heroes[idx].element;
        t.skills = normalizeSkills(t.skills, t.skill || DB.heroes[idx].skill, el);
        t.skill = { ...(t.skill || {}), ...t.skills[0] };
    }
    DB.heroes[idx] = Object.assign(DB.heroes[idx], t);
    saveHeroes();
    sendJson(res, 200, { ok: true });
};

api['POST /api/admin/hero/delete'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const idx = DB.heroes.findIndex(h => h.id === body.id);
    if (idx < 0) return sendJson(res, 400, { error: '英雄不存在' });
    DB.heroes.splice(idx, 1);
    // 同步移除所有玩家的该英雄实例（同时清空其装备/戒指/神器/宝石）
    let touched = 0;
    for (const uid of Object.keys(DB.users)) {
        const u = DB.users[uid];
        if (!u.state) continue;
        const before = (u.state.heroes || []).length;
        u.state.heroes = (u.state.heroes || []).filter(h => h.id !== body.id);
        if (u.state.heroes.length !== before) {
            u.state.equipped = (u.state.equipped || []).filter(euid => u.state.heroes.some(h => h.uid === euid));
            touched++;
        }
    }
    saveHeroes();
    sendJson(res, 200, { ok: true, cleanedUsers: touched });
};

// 从数据库重新载入英雄配置（在 MySQL 里改名 / 改技能后点一下即可，无需重启）
api['POST /api/admin/hero/reload'] = async (req, res) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    if (!Store.isMySQL()) return sendJson(res, 400, { error: '当前不是 MySQL 模式，英雄在 data/db.json 里' });
    try {
        const list = await Store.loadHeroes();
        if (!list || !list.length) return sendJson(res, 400, { error: 'heroes 表为空，请先导入 seed-heroes.sql' });
        DB.heroes = list;
        saveHeroes();
        sendJson(res, 200, { ok: true, count: list.length });
    } catch (e) {
        sendJson(res, 500, { error: '重载失败：' + e.message });
    }
};

api['POST /api/admin/wall/update'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const { lv, name, atkPct, hpPct, skillDesc } = body;
    if (![lv, name, atkPct, hpPct].every(x => x !== undefined && x !== null && x !== '')) {
        return sendJson(res, 400, { error: '城墙参数不完整' });
    }
    const idx = DB.wallSkills.findIndex(w => w.lv === parseInt(lv));
    const rec = {
        lv: parseInt(lv),
        name: String(name),
        atkPct: parseInt(atkPct) || 0,
        hpPct: parseInt(hpPct) || 0,
        skillDesc: skillDesc ? String(skillDesc) : '',
    };
    if (idx >= 0) DB.wallSkills[idx] = rec; else DB.wallSkills.push(rec);
    DB.wallSkills.sort((a, b) => a.lv - b.lv);
    // 老玩家城墙等级不变，但展示名/技能会按新配置显示
    save();
    sendJson(res, 200, { ok: true, wallSkills: DB.wallSkills });
};

api['POST /api/admin/wall/delete'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    DB.wallSkills = DB.wallSkills.filter(w => w.lv !== parseInt(body.lv));
    save();
    sendJson(res, 200, { ok: true, wallSkills: DB.wallSkills });
};

api['POST /api/admin/event/save'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const e = body.event || {};
    if (!e.name) return sendJson(res, 400, { error: '活动名必填' });
    if (!e.id) e.id = newId();
    const idx = DB.events.findIndex(x => x.id === e.id);
    if (idx >= 0) DB.events[idx] = Object.assign(DB.events[idx], e);
    else DB.events.push(e);
    save();
    sendJson(res, 200, { ok: true, event: e });
};

api['POST /api/admin/event/delete'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    DB.events = DB.events.filter(e => e.id !== body.id);
    save();
    sendJson(res, 200, { ok: true });
};

api['POST /api/admin/user/grant'] = (req, res, body) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const { username, toAll, rewards } = body;
    if (!rewards || typeof rewards !== 'object') return sendJson(res, 400, { error: '请填写奖励' });
    let count = 0;
    for (const uid of Object.keys(DB.users)) {
        const u = DB.users[uid];
        if (!u.state) continue;
        if (!toAll && u.username !== username) continue;
        for (const k of Object.keys(rewards)) {
            const v = parseInt(rewards[k]) || 0;
            if (!v) continue;
            if (k === 'wishCards') u.state.wishCards = (u.state.wishCards || 0) + v;
            else u.state.resources[k] = (u.state.resources[k] || 0) + v;
        }
        count++;
    }
    save();
    sendJson(res, 200, { ok: true, count });
};

api['GET /api/admin/overview'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    const users = Object.values(DB.users).map(u => ({
        id: u.id, username: u.username, isAdmin: u.isAdmin,
        nickname: u.nickname || u.username,
        displayId: u.displayId || '',
        phone: u.phone || '',
        lv: u.state.tower.maxFloor,
        gems: Math.floor((u.state.resources && u.state.resources.gems) || 0),
        heroCount: (u.state.heroes || []).length,
        loginDays: u.state.loginDays || 0,
        lastLoginDay: u.state.lastLoginDay || '',
        createdAt: u.createdAt,
    }));
    sendJson(res, 200, {
        users, heroes: DB.heroes, mails: DB.mails,
        wallSkills: DB.wallSkills, events: DB.events,
        equipmentTemplates: DB.equipmentTemplates, ringTemplates: DB.ringTemplates,
        artifactTemplates: DB.artifactTemplates, gemTemplates: DB.gemTemplates,
        meta: DB._meta,
    });
};

// 后台查看最近发送的验证码（开发/联调期专用：未接真实短信时，管理员在此取码测试）
api['GET /api/admin/sms-codes'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user || (!user.isAdmin && user.id !== 'admin')) return sendJson(res, 403, { error: '无权限' });
    sendJson(res, 200, {
        ok: true,
        provider: process.env.SMS_PROVIDER || 'dev',
        list: SMS.recent.map(r => ({
            phone: r.phone, code: r.code,
            time: new Date(r.time).toISOString(),
            ago: Math.floor((Date.now() - r.time) / 1000) + 's',
        })),
    });
};

// ---- 资源作弊：玩家每分钟可领一次 ----
api['POST /api/free'] = (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const u = user.state;
    const now = Date.now();
    if (now - (u.lastFree || 0) < 60000) return sendJson(res, 400, { error: '1 分钟 1 次' });
    u.lastFree = now;
    const r = { gold: 100, wood: 50, iron: 30, stone: 30, gems: 50, wishCards: 1 };
    for (const k of Object.keys(r)) {
        if (k === 'wishCards') u.wishCards = (u.wishCards || 0) + r[k];
        else u.resources[k] = (u.resources[k] || 0) + r[k];
    }
    save();
    sendJson(res, 200, { ok: true, rewards: r, state: u });
};

// ---- AI 酒馆：换一张「入馆票」cookie ----
// 为什么需要：酒馆是 iframe 加载 /tavern/，浏览器不会给 iframe 请求带 Authorization 头，
// 而玩家的 game-token 存在 localStorage 里 —— 直接进 iframe 必然 401。
// 做法：先用带 Authorization 的 fetch 换一张 HttpOnly 票 cookie，之后同源请求自动携带。
api['GET /api/tavern/ticket'] = async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const ticket = Tavern.signTicket(DB, user.id);
    const body = JSON.stringify({ ok: true });
    res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': 'to_tavern=' + ticket + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (12 * 3600),
    });
    res.end(body);
};

// ---- AI 酒馆（SillyTavern）网关状态：给设置页做降级提示 ----
api['GET /api/tavern/status'] = async (req, res) => {
    const user = getUserByToken(req);
    if (!user) return sendJson(res, 401, { error: '未登录' });
    const st = await Tavern.status(DB, true);
    sendJson(res, 200, {
        ok: true,
        enabled: st.enabled,
        online: st.online,
        note: st.note,
        upstream: st.upstream,
        handle: user.username,
        stHandle: Tavern.slugifyHandle(user.username),
        // 管理员凭据没配 → 网关无法用官方接口自动建号，SSO 会失效，需要明确告知
        admin: st.admin || { ok: false, msg: '未配置 TAVERN_ADMIN_PASSWORD' },
    });
};

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
if (WsRelay) WsRelay.attach(server); else console.warn('[game] 联机中继未启用（缺少 server/ws-relay 或 ws 模块）');

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
        romsBackfillHash().catch(e => console.error('[game] ROM 指纹补算失败：' + e.message));
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
