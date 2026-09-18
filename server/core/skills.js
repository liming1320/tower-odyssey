'use strict';
// 英雄技能规范化（从 server.js 拆出，admin 英雄编辑复用）。纯函数，无副作用。
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

module.exports = { normalizeSkills };
