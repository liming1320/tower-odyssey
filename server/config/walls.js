// 游戏内容配置（纯数据）—— 由 server.js 抽出，请勿在此写逻辑

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

module.exports = {
  WALL_SKILL_SEED,
};
