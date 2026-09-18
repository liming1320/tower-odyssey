// 游戏内容配置统一出口：server.js 顶部所有纯数据常量抽出后在此聚合。
// server.js 通过 `const { ... } = require('./server/config')` 一次性解构引用。
module.exports = Object.assign(
  {},
  require('./qualities'),
  require('./heroes'),
  require('./walls'),
  require('./wish'),
  require('./tower'),
  require('./buildings'),
  require('./ids')
);
