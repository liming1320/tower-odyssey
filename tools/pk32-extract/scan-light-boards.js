// Scan module.bin for PK32 智慧之光 (Light) native boards.
// Boards are stored as UTF-16LE BSTRs: "WW HH" + W*H two-decimal-digit codes,
// where W in [11,16], H in [3,9], codes in 0..59 or 99 (invalid sentinel).
// This mirrors the reverse-engineering evidence in light-native-analysis.md.
const fs = require('fs');
const path = require('path');

const BIN = 'E:/WorkSpace/tower-odyssey/output/pk32-reference/module.bin';
const OUT = 'E:/WorkSpace/tower-odyssey/output/pk32-reference/light-boards-extracted.json';

const buf = fs.readFileSync(BIN);
const len = buf.length;

function charAt(i) {
  // returns ASCII char if this is a UTF-16LE ASCII codepoint, else -1
  if (i + 1 >= len) return -1;
  if (buf[i + 1] !== 0) return -1;
  return buf[i];
}

const found = [];
const seen = new Set();
let i = 0;
while (i + 8 <= len) {
  if (buf[i + 1] !== 0) { i += 2; continue; }
  const c0 = buf[i], c1 = buf[i + 2], c2 = buf[i + 4], c3 = buf[i + 6];
  if (c1 !== 0 || c2 !== 0 || c3 !== 0) { i += 2; continue; }
  if (c0 < 0x30 || c0 > 0x39 || c1 !== 0) { i += 2; continue; }
  const W = c0 * 10 + c1; // c1 already 0 -> W = c0 as digit? careful
  // c0,c1 are the two bytes of the first code unit pair: actually c0=first char, c1=high byte(0)
  //first two chars: buf[i] and buf[i+2]
  const d0 = buf[i], d1 = buf[i + 2];
  if (d0 < 0x30 || d0 > 0x39 || d1 < 0x30 || d1 > 0x39) { i += 2; continue; }
  const wv = (d0 - 0x30) * 10 + (d1 - 0x30);
  const d2 = buf[i + 4], d3 = buf[i + 6];
  if (d2 < 0x30 || d2 > 0x39 || d3 < 0x30 || d3 > 0x39) { i += 2; continue; }
  const hv = (d2 - 0x30) * 10 + (d3 - 0x30);
  if (!(wv >= 11 && wv <= 16 && hv >= 3 && hv <= 9)) { i += 2; continue; }
  const nCells = wv * hv;
  const totalBytes = (4 + 2 * nCells) * 2;
  if (i + totalBytes > len) { i += 2; continue; }
  let text = '';
  let ok = true;
  for (let k = 0; k < 2 * nCells; k++) {
    const ci = i + 8 + k * 2;
    if (buf[ci + 1] !== 0) { ok = false; break; }
    const ch = buf[ci];
    if (ch < 0x30 || ch > 0x39) { ok = false; break; }
    text += String.fromCharCode(ch);
  }
  if (!ok) { i += 2; continue; }
  // parse codes
  let codes = [];
  for (let k = 0; k < text.length; k += 2) {
    const c = +text.slice(k, k + 2);
    if (!(c === 99 || (c >= 0 && c <= 59))) { ok = false; break; }
    codes.push(c);
  }
  if (!ok) { i += 2; continue; }
  const full = String(wv).padStart(2, '0') + String(hv).padStart(2, '0') + text;
  if (seen.has(full)) { i += 2; continue; }
  seen.add(full);
  found.push({ offset: i, W: wv, H: hv, codes, text: full });
  i += totalBytes; // skip past
}

console.log('found unique light boards:', found.length);
const dim = {};
found.forEach(f => { const k = f.W + 'x' + f.H; dim[k] = (dim[k] || 0) + 1; });
console.log('dims:', JSON.stringify(dim));
// sort by offset (native order) - not necessarily level order but stable
found.sort((a, b) => a.offset - b.offset);
fs.writeFileSync(OUT, JSON.stringify(found.map(f => ({ W: f.W, H: f.H, codes: f.codes, text: f.text, offset: f.offset })), null, 0));
console.log('wrote', OUT);
