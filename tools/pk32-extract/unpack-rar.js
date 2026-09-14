// 解包 pk32.rar（纯 JS，无需外部 unrar 二进制）
// 运行： set NODE_PATH=C:\Users\li\.workbuddy\binaries\node\workspace\node_modules && node unpack-rar.js
const fs = require('fs');
const path = require('path');
const unrar = require('node-unrar-js');
const src = 'F:/BaiduNetdiskDownload/pk32/pk32.rar';
const outDir = 'E:/WorkSpace/_pk32extract';
fs.mkdirSync(outDir, { recursive: true });
const raw = new Uint8Array(fs.readFileSync(src));
(async () => {
  const extractor = await unrar.createExtractorFromData({ data: raw.buffer });
  const res = extractor.extract(); // 不传 files 过滤 = 全部
  let total = 0, dirs = 0, written = 0;
  const lines = [];
  for (const f of res.files) {
    const h = f.fileHeader;
    const isDir = h.flags && h.flags.directory;
    lines.push((isDir ? '[DIR] ' : '') + h.name + '\t' + h.unpSize);
    if (!isDir && f.extraction instanceof Uint8Array) {
      const dest = path.join(outDir, h.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.extraction);
      total += f.extraction.length; written++;
    } else if (isDir) dirs++;
  }
  fs.writeFileSync(path.join(outDir, '_manifest.txt'), lines.join('\n'));
  console.log('EXTRACTED files=' + lines.length + ' dirs=' + dirs + ' written=' + written + ' bytes=' + total);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
