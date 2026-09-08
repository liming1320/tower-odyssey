/* 英雄原创化改名：替换有版权风险的名称，并把立绘/头像指向程序生成的 SVG
 *
 *   node tools/rename-heroes.js          # 执行改名（自动备份 db.json）
 *   node tools/rename-heroes.js --check  # 只预览，不写入
 *
 * 原名 → 新名 的映射会导出到 tools/hero-rename-map.json，
 * 老存档（玩家背包里的英雄）按 id 关联，改名不会影响已有数据。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'data/db.json');
const MAP_OUT = path.join(__dirname, 'hero-rename-map.json');

/* 原名 → 原创名（保留元素与定位，去掉一切现实/IP 角色名） */
const RENAME = {
    h01: '潮汐歌女·澜澜', h02: '赤刃剑客·焰', h03: '时之守序·瞳', h04: '星语歌姬·妮可',
    h05: '崩坏魔童·娜娜', h06: '夜之女皇·伊莲', h07: '灼炎魔女·法琳', h08: '狐火巫女·贝拉',
    h09: '幽冥守墓人·墨', h10: '断月镰使·希芙', h11: '月华神使·露娜', h12: '电光小子·蓝星',
    h13: '烈阳神女·夏夏', h14: '银辉武神·零式', h15: '圣咏神女·铃音', h16: '森灵神鹿·鹿鹿',
    h17: '绘海之灵·小悠', h18: '圣翼天使·米勒', h19: '雷霆神将·左尔', h20: '曙光守墓人·曜',
    h21: '琴音游侠·比利', h22: '花灵仙子·阿黛拉', h23: '百羽神使·佩吉', h24: '踏浪大侠·阿波',
    h25: '木桶勇士·阿蛮', h26: '双子巡礼·韦斯', h27: '剑圣·奥利弗', h28: '园丁少女·莉莉',
    h29: '青葱公主·葱葱', h30: '海螺王子·噜噜', h31: '暴龙少年·加加', h32: '鸣火少女·吉娜',
    h33: '天才少年·刘星', h34: '巨力斗士·艾斯', h35: '圣光守卫·托尔', h36: '蛮锤工匠·塔利',
    h37: '鬼火少女·小樱', h38: '红衣舞者·小舞', h39: '雪女·斯卡蒂', h40: '神盾卫士·阿克',
    h41: '水灵童子·阿蓝', h42: '人鱼歌女·玛丽娅', h43: '冰晶少年·萨米', h44: '极寒灵童·洛洛',
    h45: '菠萝小侠·波仔', h46: '冰月少女·小月',
};

/* 技能名原创化（仅替换有风险的） */
const SKILL_RENAME = {};

const check = process.argv.includes('--check');
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));

const map = [];
let changed = 0;
for (const h of db.heroes || []) {
    if (h.material) continue;                       // 材料英雄已是原创名，不动
    const before = h.name;
    const after = RENAME[h.id];
    if (after && after !== before) {
        map.push({ id: h.id, before, after, element: h.element });
        if (!check) h.name = after;
        changed++;
    }
    // 立绘 / 头像统一指向生成的 SVG
    if (!check) {
        h.img = `heroes/${h.id}.svg`;
        h.avatar = `avatars/${h.id}.svg`;
        const fix = (s) => {
            if (!s) return s;
            if (SKILL_RENAME[s.name]) s.name = SKILL_RENAME[s.name];
        };
        fix(h.skill);
        (h.skills || []).forEach(fix);
    }
}

if (check) {
    console.log('【预览】将修改 ' + changed + ' 个英雄名称：');
    map.forEach(m => console.log(`  ${m.id}  ${m.before}  →  ${m.after}`));
    process.exit(0);
}

// 备份
const bakDir = path.join(ROOT, 'data/backups');
fs.mkdirSync(bakDir, { recursive: true });
const bak = path.join(bakDir, `db-before-rename-${Date.now()}.json`);
fs.copyFileSync(DB, bak);

fs.writeFileSync(DB, JSON.stringify(db, null, 1));
fs.writeFileSync(MAP_OUT, JSON.stringify(map, null, 1));

console.log(`✅ 改名完成：${changed} 个英雄`);
console.log(`   存档备份：${path.relative(ROOT, bak)}`);
console.log(`   原名映射：${path.relative(ROOT, MAP_OUT)}`);
console.log('   立绘/头像：public/img/heroes/<id>.svg, public/img/avatars/<id>.svg');
