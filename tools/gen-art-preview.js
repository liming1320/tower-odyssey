/* 生成英雄美术预览页（立绘 / 头像 / 星级标识一屏看完）
 *   node tools/gen-art-preview.js   →  public/art-preview.html
 *   浏览器打开 http://localhost:5180/art-preview.html
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/db.json'), 'utf8'));
const heroes = (db.heroes || []).filter(h => !h.material);

const cards = heroes.map((h, i) => {
    const demo = (i % 16) + 1;               // 1..16 星循环展示
    return `<div class="ac">
        <img class="full" src="/img/${h.img}">
        <img class="ava" src="/img/${h.avatar}">
        <div class="nm">${h.name}</div>
        <div class="el el-${h.element}">${h.element}系</div>
        <div class="star-line" data-star="${demo}"></div>
    </div>`;
}).join('');

const rules = Array.from({ length: 16 }, (_, i) => i + 1)
    .map(s => `<div class="rc"><div class="star-line" data-star="${s}"></div><div class="lb">${s} 星</div></div>`).join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>英雄美术预览 · 塔界远征</title>
<link rel="stylesheet" href="/css/main.css">
<style>
  body { background:#141026; color:#eae6ff; font-family:system-ui,"Microsoft YaHei",sans-serif; padding:18px; }
  h1 { font-size:20px; color:#ffd56b; margin:0 0 4px; }
  h2 { font-size:15px; color:#ffd56b; margin:22px 0 8px; }
  .tip { color:#b9b3d8; font-size:12px; margin-bottom:10px; line-height:1.7; }
  .rules { display:flex; flex-wrap:wrap; gap:10px; background:rgba(255,255,255,.05); padding:12px; border-radius:10px; }
  .rc { text-align:center; min-width:64px; }
  .rc .lb { font-size:10px; color:#b9b3d8; margin-top:3px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; }
  .ac { background:rgba(255,255,255,.06); border-radius:10px; padding:8px; text-align:center; }
  .ac .full { width:100%; border-radius:8px; display:block; background:#fff; }
  .ac .ava { width:56px; height:56px; border-radius:50%; margin:-28px auto 4px; display:block; border:2px solid #fff; position:relative; }
  .ac .nm { font-size:12px; margin-top:4px; }
  .ac .el { font-size:10px; color:#b9b3d8; }
  .el-草{color:#4ade80}.el-水{color:#38bdf8}.el-火{color:#ff7a45}.el-光{color:#fbbf24}.el-暗{color:#a78bfa}
</style>
</head>
<body>
<h1>塔界远征 · 英雄美术预览</h1>
<div class="tip">
  立绘与头像全部由 <b>tools/gen-hero-art.js</b> 程序生成（Q 版 2 头身 · 大眼日漫风 · 按属性配色），无外部素材、无版权风险。<br>
  星级规则：1-5 黄星 / 6-10 红星 / 11-14 彩虹星 / 15 至尊（紫金 + 皇冠角标）/ 16 MAX（金冠 + 流光），头像下方最多 5 颗。
</div>

<h2>星级标识（1 → 16 星）</h2>
<div class="rules">${rules}</div>

<h2>英雄一览（${heroes.length} 名）</h2>
<div class="grid">${cards}</div>

<script src="/js/utils.js"></script>
<script>
document.querySelectorAll('.star-line[data-star]').forEach(n => {
    n.innerHTML = U.starHtml(n.dataset.star, 13);
});
</script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'public/art-preview.html'), html);
console.log('✅ 预览页已生成：public/art-preview.html → http://localhost:5180/art-preview.html');
