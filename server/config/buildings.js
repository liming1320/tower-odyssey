// 游戏内容配置（纯数据）—— 由 server.js 抽出，请勿在此写逻辑

const BUILD_DEFS = [
    { key: 'camp',     icon: '🏕', name: '大本营',  res: '木材 / 金币', out: { wood: 8, gold: 3 } },
    { key: 'forge',    icon: '🔨', name: '锻造坊',  res: '铁矿',        out: { iron: 5 } },
    { key: 'research', icon: '📚', name: '研究院',  res: '全建筑产出',  out: {}, bonus: 6 },
    { key: 'hunt',     icon: '🏹', name: '狩猎场',  res: '经验',        out: { exp: 12 } },
    { key: 'mine',     icon: '⛏', name: '石矿井',  res: '石币',        out: { stone: 4 } },
];

const RES_LABEL = { gold: '金币', wood: '木材', iron: '铁矿', stone: '石币', exp: '经验', gems: '钻石', wishCards: '许愿卡' };

const OFFLINE_CAP_SEC = 12 * 3600;

const RES_CN = { gold: '金币', gems: '钻石', iron: '铁矿', stone: '石币', wood: '木材', exp: '经验' };

const U_NUM = n => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

module.exports = {
  BUILD_DEFS,
  RES_LABEL,
  OFFLINE_CAP_SEC,
  RES_CN,
  U_NUM,
};
