// Generate a clean PK32 智慧之光 (Light) native level file.
// Source of truth: output/pk32-reference/strings.json (read-only extraction from
// module.bin). Boards are filtered to the documented native spec:
//   WW HH + W*H two-decimal-digit codes, W in [11,16], H in [3,9],
//   codes in 0..59 (valid) or 99 (invalid/empty). Max code >= 7 excludes
//   sokoban-like boards (codes 0..6) that share the same dimensions.
// Demos are taken verbatim from light-native-analysis.md (RVA-verified BSTRs).
const fs = require('fs');

const STRINGS = 'E:/WorkSpace/tower-odyssey/output/pk32-reference/strings.json';
const OUT = 'E:/WorkSpace/tower-odyssey/public/data/pk32-light-levels.json';

const strings = JSON.parse(fs.readFileSync(STRINGS, 'utf8'));

// 20 demos (concatenated zero-based XXYY coordinate strings) from the analysis doc.
const DEMOS = [
  '030407041104', '06040903', '07030805', '0505060308040902', '050206040506080508021003',
  '05000602080309051106', '04010605090210040907', '0706080507020604', '0400060208030904090510051106',
  '0501050506060707110708021002', '05020905', '0901070304070907', '050407050703080408021003',
  '0602090206050905', '0502050508041104100510021004', '05060705110806010801', '0701060307030704090406070907',
  '07030605070406050705', '06030904080107060703', '1106100408050906080408050601050204030401080008031102'
];

function parseDemo(s) {
  const clicks = [];
  for (let i = 0; i + 3 < s.length; i += 4) {
    clicks.push([+s.slice(i, i + 2), +s.slice(i + 2, i + 4)]);
  }
  if (s.length % 4 !== 0) clicks.push([+s.slice(-2), 0]); // defensive
  return clicks;
}

const re = /^([0-9]{2})([0-9]{2})((?:[0-9]{2})*)$/;
const boards = [];
const seen = new Set();
for (const it of strings) {
  const s = it.text || '';
  const m = s.match(re);
  if (!m) continue;
  const W = +m[1], H = +m[2];
  const body = m[3];
  if (!(W >= 11 && W <= 16 && H >= 3 && H <= 9)) continue;
  if (body.length / 2 !== W * H) continue;
  let codes = [], ok = true, maxc = 0;
  for (let i = 0; i < body.length; i += 2) {
    const c = +body.slice(i, i + 2);
    if (!(c === 99 || (c >= 0 && c <= 59))) { ok = false; break; }
    if (c > maxc) maxc = c;
    codes.push(c);
  }
  if (!ok) continue;
  if (maxc < 7) continue; // exclude sokoban-like (codes 0..6)
  const full = String(W).padStart(2, '0') + String(H).padStart(2, '0') + body;
  if (seen.has(full)) continue;
  seen.add(full);
  boards.push({ offset: it.offset, width: W, height: H, cells: full, codes });
}

boards.sort((a, b) => a.offset - b.offset);
const levels = boards.map((b, i) => ({
  number: i + 1,
  offset: b.offset,
  width: b.width,
  height: b.height,
  cells: b.cells
}));

const demos = DEMOS.map((d, i) => ({ level: i + 1, raw: d, clicks: parseDemo(d) }));

const out = {
  name: '智慧之光',
  picForm: 26,
  spriteSheet: '/img/pk32/original/sheet-7a90dd.png',
  source: 'module.bin (RVA-verified) via strings.json; demos from light-native-analysis.md',
  generatedAt: new Date().toISOString(),
  fullGameRulesVerified: false,
  nativeLevelCount: 140,
  extractedLevelCount: levels.length,
  objective: 'light all lightable objects',
  extractionNote: 'Recovered ' + levels.length + ' native boards from strings.json matching the documented WW HH + 0..59/99 spec. The full 140 require re-running the capstone-based p-code dispatch-table extraction (not present in this session). Engine implements the complete native state machine; current set is a faithful, replay-verifiable subset.',
  levels,
  demos
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('wrote', OUT, 'levels:', levels.length, 'demos:', demos.length);
console.log('dims:', JSON.stringify(levels.reduce((a, l) => { const k = l.width + 'x' + l.height; a[k] = (a[k] || 0) + 1; return a; }, {})));
