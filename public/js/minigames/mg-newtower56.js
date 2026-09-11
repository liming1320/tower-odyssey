// 新新魔塔 56 层 —— 暗紫高难
window.MG = window.MG || {};
(function () {
    if (!MG.tower) return;
    MG.tower.register('newtower56', {
        name: '新新魔塔 56 层',
        desc: '56 层新新魔塔 · 高难挑战 · 守层卫士 + 魔王',
        floors: 56, seed: 5656, growth: 1.10, monCount: 7, pillar: 0.15,
        bossEvery: 8,
        tint: { floorA: '#2a1f3e', floorB: '#3e2a56', bg1: '#160f24', bg2: '#0a0614' },
        heroBase: { hp: 260, atk: 38, def: 26 },
    });
})();
