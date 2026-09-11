// 魔塔 50 层 —— 经典蓝塔
window.MG = window.MG || {};
(function () {
    if (!MG.tower) return;
    MG.tower.register('tower50', {
        name: '魔塔 50 层',
        desc: '50 层经典魔塔 · 撞怪战斗 · 捡钥匙开门 · 登顶击败魔王',
        floors: 50, seed: 1050, growth: 1.085, monCount: 6, pillar: 0.13,
        bossEvery: 10,
        tint: { floorA: '#26304e', floorB: '#34406a', bg1: '#141a2e', bg2: '#0b1020' },
        heroBase: { hp: 220, atk: 32, def: 22 },
    });
})();
