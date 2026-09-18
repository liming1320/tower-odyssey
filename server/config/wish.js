// 游戏内容配置（纯数据）—— 由 server.js 抽出，请勿在此写逻辑

const WISH_PITY = 20;

const WISH_RATE = [
    { tier: 5, p: 0.08 },   // 8%  5★ 主力英雄
    { tier: 4, p: 0.40 },   // 32% 4★ 材料
    { tier: 3, p: 1.00 },   // 60% 3★ 材料
];

const FORGE_MAX_LV = 100;

const FORGE_LV_GAIN = 0.08;

module.exports = {
  WISH_PITY,
  WISH_RATE,
  FORGE_MAX_LV,
  FORGE_LV_GAIN,
};
