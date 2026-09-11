// 魔塔 24 层 —— 轻松绿塔
window.MG = window.MG || {};
(function () {
    if (!MG.tower) return;
    MG.tower.register('tower24', {
        name: '魔塔 24 层',
        desc: '24 层轻松魔塔 · 入门友好 · 节奏明快',
        floors: 24, seed: 2024, growth: 1.07, monCount: 5, pillar: 0.11,
        bossEvery: 8,
        tint: { floorA: '#1f3a28', floorB: '#2c5440', bg1: '#0f1f16', bg2: '#081410' },
        heroBase: { hp: 240, atk: 36, def: 24 },
    });
})();
