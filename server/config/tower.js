// 游戏内容配置（纯数据）—— 由 server.js 抽出，请勿在此写逻辑

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

const TIER_CN = ['', '·二阶', '·三阶', '·四阶', '·五阶'];

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

module.exports = {
  ENEMY_TYPES,
  BOSS_TYPES,
  CHAPTERS,
  TIER_CN,
  ROGUE_BUFFS,
};
