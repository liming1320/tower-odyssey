// 引擎文件清单（与 index.html 加载顺序一致）。
// issue #10 拆分后，引擎代码集中在 public/js/minigames/engine/。
// 本文件供 Node VM 测试 / 审计脚本统一加载，避免各脚本硬编码 _shared.js 路径。
const path = require('path');

const engineDir = path.join(__dirname, '..', 'public', 'js', 'minigames', 'engine');

// 注意：mg-core 必须最先（建立 window.MG），_engine 最后（依赖其余模块）
const ENGINE_FILES = [
  'mg-core.js',
  'mg-effects.js',
  'mg-audio.js',
  'mg-input.js',
  'mg-progress.js',
  'mg-character.js',
  'mg-map.js',
  'mg-render.js',
  'mg-ui.js',
  '_engine.js',
];

module.exports = { engineDir, ENGINE_FILES };
