// 扫描 Pk32.exe 里的可提取字符串（ASCII / UTF-16 / GBK），按游戏名、资源扩展名、窗体名过滤。
// 实测结论：213 个游戏名在 EXE 中 0 命中（GBK 字节序列也搜不到）——原版是 VB5 编译产物，
// 名字/逻辑/美术都编译进了 p-code 与窗体二进制资源，不是明文数据。
// 运行： node scan-exe.js
const fs = require('fs');
const buf = fs.readFileSync('F:/BaiduNetdiskDownload/pk32/Pk32.exe');
const u8 = new Uint8Array(buf);
const n = u8.length;
const dec = new TextDecoder('gbk');

function asciiStrings(minLen) {
  const out = []; let cur = []; let start = -1;
  for (let i = 0; i < n; i++) {
    const c = u8[i];
    if (c >= 0x20 && c < 0x7f) { if (start < 0) start = i; cur.push(c); }
    else {
      if (cur.length >= minLen) out.push({ o: start, s: Buffer.from(cur).toString('latin1') });
      cur = []; start = -1;
    }
  }
  if (cur.length >= minLen) out.push({ o: start, s: Buffer.from(cur).toString('latin1') });
  return out;
}
function utf16Strings(minLen) {
  const out = []; let cur = []; let start = -1;
  for (let i = 0; i + 1 < n; i += 2) {
    const code = u8[i] | (u8[i + 1] << 8);
    if (code >= 0x20 && code < 0xfffe && code !== 0xfffe) { if (start < 0) start = i; cur.push(code); }
    else { if (cur.length >= minLen) out.push({ o: start, s: Buffer.from(cur.map(c => c & 0xff)).toString('ucs2') }); cur = []; start = -1; }
  }
  return out;
}
function gbkRuns() {
  const isLead = b => b >= 0x81 && b <= 0xFE;
  const isTrail = b => b >= 0x40 && b <= 0xFE && b !== 0x7F;
  const isAsc = b => b >= 0x20 && b <= 0x7E;
  const runs = []; let cur = []; let i = 0;
  const flush = () => { if (cur.length) { runs.push(Buffer.from(cur)); cur = []; } };
  while (i < n) {
    const b = u8[i];
    if (isAsc(b)) { cur.push(b); i++; continue; }
    if (isLead(b) && i + 1 < n && isTrail(u8[i + 1])) { cur.push(b, u8[i + 1]); i += 2; continue; }
    flush(); i++;
  }
  flush();
  return runs.map(r => { try { return dec.decode(r); } catch (e) { return null; } }).filter(Boolean);
}

const a = asciiStrings(6);
const w = utf16Strings(3);
const g = gbkRuns();
const out = [`EXE size=${n}`, `ASCII>=6=${a.length}`, `UTF16>=3=${w.length}`, `GBK runs=${g.length}`];

const NAMES = require('./_names.js'); // 见同目录 _names.js（从 pk32.js 复制）
const nameSet = new Set(NAMES);
function hasCJK(s){ for(const ch of s){ if(ch>=0x4E00&&ch<=0x9FFF) return true; } return false; }

let hits = 0; const hitLines = [];
for (const x of a.concat(w)) {
  for (const nm of NAMES) if (x.s.indexOf(nm) >= 0) { hitLines.push('  [' + (x.o) + '] ' + nm + ' <<' + x.s.slice(0,70) + '>>'); hits++; break; }
}
out.push('', '=== game-name hits (ASCII/UTF16) = ' + hits + ' ===');
out.push(hitLines.slice(0,120).join('\n'));

const pats = [/\.bmp/i,/\.gif/i,/\.jpg/i,/\.png/i,/\.wav/i,/\.mid/i,/\.mp3/i,/\.pal/i,/frm/i,/\.frx/i,/VB5!/i,/MSVBVM50/i,/\.dat/i,/\.map/i,/\.lvl/i];
out.push('', '=== asset / form references (ASCII) ===');
for (const x of a) for (const p of pats) if (p.test(x.s)) { out.push('  [A' + x.o + '] ' + x.s.slice(0,80)); break; }

const cjk = g.filter(s => s.length >= 4 && hasCJK(s));
out.push('', '=== CJK (GBK) strings >=4 = ' + cjk.length + ' ===');
out.push(cjk.slice(0,60).map((s,i)=>'  '+i+': '+s.slice(0,60)).join('\n'));

fs.writeFileSync('E:/WorkSpace/_pk32extract/_scan.txt', out.join('\n'));
console.log('done ascii=' + a.length + ' utf16=' + w.length + ' gbk=' + g.length + ' nameHits=' + hits + ' cjk=' + cjk.length);
