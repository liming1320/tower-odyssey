#!/usr/bin/env node
/**
 * 从当前存档导出「英雄静态配置」到 data/heroes.seed.json
 *
 * 用途：
 *   - data/db.json 是玩家数据，不进版本库（否则自动部署会用本地测试存档覆盖线上真实数据）
 *   - 英雄配置（名称/属性/技能/立绘）属于代码资产，需要进仓库
 *   - 新服务器首次启动、或存档丢失重建时，server.js 会读 heroes.seed.json 还原正确的英雄
 *
 * 用法：node tools/update-hero-seed.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'data', 'db.json');
const OUT = path.join(ROOT, 'data', 'heroes.seed.json');

if (!fs.existsSync(DB)) { console.error('找不到 data/db.json'); process.exit(1); }
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const all = db.heroes || [];

// 只导出战斗英雄；材料英雄由 server.js 里的 MATERIAL_HEROES 生成，避免重复
const heroes = all.filter(h => !h.material).map(h => {
    const o = {
        id: h.id,
        name: h.name,
        rarity: h.rarity,
        img: h.img,
        avatar: h.avatar || (h.img && h.img.replace(/^heroes\//, 'avatars/')),
        element: h.element,
        baseAtk: h.baseAtk,
        baseHp: h.baseHp,
        tier: h.tier,
    };
    if (h.skill) o.skill = h.skill;
    if (Array.isArray(h.skills) && h.skills.length) o.skills = h.skills;
    if (h.material !== undefined) o.material = false;
    return o;
});

if (!heroes.length) { console.error('存档里没有战斗英雄，放弃导出（防止写出空种子）'); process.exit(1); }

fs.writeFileSync(OUT, JSON.stringify(heroes, null, 2));
const byEl = {};
heroes.forEach(h => { byEl[h.element] = (byEl[h.element] || 0) + 1; });
console.log(`✅ 已导出 ${heroes.length} 个战斗英雄 → data/heroes.seed.json`);
console.log('   属性分布：' + Object.entries(byEl).map(([k, v]) => `${k}${v}`).join(' '));
console.log('   示例：' + heroes.slice(0, 3).map(h => `${h.id} ${h.name}`).join(' / '));
console.log('   材料英雄由 server.js 的 MATERIAL_HEROES 生成，不在此文件内。');
