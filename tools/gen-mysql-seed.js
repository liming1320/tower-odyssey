#!/usr/bin/env node
/**
 * 生成英雄数据的 MySQL 插入语句 → deploy/mysql/seed-heroes.sql
 *
 * 数据来源：data/db.json（56 个英雄：46 战斗 + 10 许愿材料）
 *
 * 用法：
 *   node tools/gen-mysql-seed.js          首次导入用（会清空 heroes / hero_skills 再全量写入）
 *   node tools/gen-mysql-seed.js --safe   线上补数据用（INSERT IGNORE，已存在的英雄不动，
 *                                         只补新英雄 —— 不会覆盖你在数据库里改过的名字/技能）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'data', 'db.json');
const SAFE = process.argv.includes('--safe');
const OUT = path.join(ROOT, 'deploy', 'mysql',
    SAFE ? 'seed-heroes-safe.sql' : 'seed-heroes.sql');

if (!fs.existsSync(DB)) { console.error('找不到 data/db.json'); process.exit(1); }
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const heroes = db.heroes || [];

// SQL 字面量转义
const esc = (v) => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
};
const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v) || d);

const lines = [];
lines.push('-- =============================================================');
lines.push('-- 塔界远征 · 英雄初始数据（自动生成，请勿手改）');
lines.push('-- 生成命令：node tools/gen-mysql-seed.js');
lines.push('-- 改名 / 改技能 / 换立绘：直接 UPDATE heroes 表即可，无需改代码');
lines.push('-- =============================================================');
if (SAFE) {
    lines.push('-- 【安全模式】INSERT IGNORE：已存在的英雄 / 技能保持不变，只补缺失的行');
    lines.push('-- 用途：线上库已人工改过名字或技能时，用来补新英雄，不会覆盖已有改动');
} else {
    lines.push('-- 【首次导入】会先清空 heroes / hero_skills 再全量写入');
    lines.push('-- ⚠ 如果库里已经人工改过英雄名/技能，请改用安全模式：');
    lines.push('--    node tools/gen-mysql-seed.js --safe   →  deploy/mysql/seed-heroes-safe.sql');
}
lines.push('USE `tower_odyssey`;');
lines.push('');
if (!SAFE) {
    lines.push('SET FOREIGN_KEY_CHECKS = 0;');
    lines.push('TRUNCATE TABLE `hero_skills`;');
    lines.push('TRUNCATE TABLE `heroes`;');
    lines.push('SET FOREIGN_KEY_CHECKS = 1;');
    lines.push('');
}

// ---------- heroes ----------
lines.push('-- ---------- 英雄主表 ----------');
const HERO_COLS = '`id`,`name`,`rarity`,`element`,`tier`,`base_atk`,`base_hp`,`img`,`avatar`,`material`,`hero_desc`,' +
    '`skill_name`,`skill_desc`,`skill_cd`,`skill_multiplier`,`skill_fx`,`skill_tint`,`enabled`,`sort_order`';

const chunk = (arr, n) => arr.reduce((a, v, i) => (i % n ? a : a.concat([arr.slice(i, i + n)])), []);
const rows = heroes.map((h, i) => {
    const s = h.skill || {};
    const avatar = h.avatar || (h.img ? String(h.img).replace(/^heroes\//, 'avatars/') : null);
    return `(${[
        esc(h.id),
        esc(h.name),
        esc(h.rarity || '稀有'),
        esc(h.element || '光'),
        num(h.tier, 1),
        num(h.baseAtk, 0),
        num(h.baseHp, 0),
        esc(h.img || ''),
        esc(avatar),
        h.material ? 1 : 0,
        esc(h.desc || null),
        esc(s.name || null),
        esc(s.desc || null),
        num(s.cd, 0),
        num(s.multiplier, 0),
        esc(s.fx || null),
        esc(s.tint || null),
        1,
        i,
    ].join(',')})`;
});
chunk(rows, 20).forEach(g => {
    lines.push(`INSERT ${SAFE ? 'IGNORE ' : ''}INTO \`heroes\` (${HERO_COLS}) VALUES`);
    lines.push(g.join(',\n') + ';');
    lines.push('');
});

// ---------- hero_skills ----------
lines.push('-- ---------- 英雄技能表（slot 0 = 主技能）----------');
const skillRows = [];
heroes.forEach(h => {
    const list = (Array.isArray(h.skills) && h.skills.length) ? h.skills : [h.skill].filter(Boolean);
    list.forEach((s, slot) => {
        if (!s || !s.name) return;
        skillRows.push(`(${[
            esc(h.id), slot, esc(s.name), esc(s.desc || null),
            num(s.cd, 0), num(s.multiplier, 0), esc(s.fx || null), esc(s.tint || null),
        ].join(',')})`);
    });
});
if (skillRows.length) {
    chunk(skillRows, 40).forEach(g => {
        lines.push('INSERT ' + (SAFE ? 'IGNORE ' : '') + 'INTO `hero_skills` (`hero_id`,`slot`,`name`,`skill_desc`,`cd`,`multiplier`,`fx`,`tint`) VALUES');
        lines.push(g.join(',\n') + ';');
        lines.push('');
    });
}

lines.push('-- ---------- 常用运维示例 ----------');
lines.push('-- 给英雄改名：      UPDATE heroes SET name=\'新名字\' WHERE id=\'h01\';');
lines.push('-- 改技能描述：      UPDATE hero_skills SET skill_desc=\'新描述\' WHERE hero_id=\'h01\' AND slot=0;');
lines.push('-- 换立绘 / 头像：   UPDATE heroes SET img=\'heroes/h01.svg\', avatar=\'avatars/h01.svg\' WHERE id=\'h01\';');
lines.push('-- 下架某英雄：      UPDATE heroes SET enabled=0 WHERE id=\'h01\';  （老玩家已拥有的会保留）');
lines.push('-- 改完在后台点「重载英雄配置」即可生效，无需重启服务。');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'));
console.log(`✅ 已生成 ${OUT}`);
console.log(`   英雄 ${heroes.length} 个（战斗 ${heroes.filter(h => !h.material).length} / 材料 ${heroes.filter(h => h.material).length}）`);
console.log(`   技能 ${skillRows.length} 条`);
console.log(`   文件大小 ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
