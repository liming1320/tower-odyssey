// 游戏内容配置（纯数据）—— 由 server.js 抽出，请勿在此写逻辑

const STAR_BASE = 5;

const STAR_MAX = 16;

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

const ELEMENTS = ['草', '水', '火', '光', '暗'];

const ELEMENT_LABEL = { 草: '草（木）', 水: '水', 火: '火', 光: '光（含风雷）', 暗: '暗' };

const ELEMENT_COLOR = { 草: '#7ddf64', 水: '#5cc7ff', 火: '#ff7a5c', 光: '#ffd56b', 暗: '#b98cff' };

const ELEMENT_ALIAS = { 木: '草', 风: '光', 雷: '光' };

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

module.exports = {
  STAR_BASE,
  STAR_MAX,
  STAR_PERKS,
  ELEMENTS,
  ELEMENT_LABEL,
  ELEMENT_COLOR,
  ELEMENT_ALIAS,
  HERO_TIER,
  MATERIAL_HEROES,
};
