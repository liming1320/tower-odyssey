// 游戏内容配置（纯数据）—— 由 server.js 抽出，请勿在此写逻辑

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

module.exports = {
  QUALITIES,
  QUALITY_NAME,
  QUALITY_MUL,
  QUALITY_COLOR,
  TYPE_MIN_QUALITY,
  EQUIP_SLOTS,
  EQUIP_SLOT_NAME,
};
