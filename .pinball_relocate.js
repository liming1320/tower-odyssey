// Relocate the component block (data + collideNew + drawNew) from module scope into start(),
// so it closes over ctx/ball/live/addScore etc. (fixes "ctx is not defined" runtime throw).
const fs = require('fs');
const p = 'E:/WorkSpace/tower-odyssey/public/js/minigames/pinball.js';
let s = fs.readFileSync(p, 'utf8');

const ctxLine = 'const { c, ctx, w, h, destroy } = MG.canvas(container, GW, GH);';
const bi = s.indexOf(ctxLine);
if (bi < 0) throw new Error('ctxLine not found');
const afterCtx = s.indexOf('\n', bi) + 1;

const bStart = s.indexOf('/* ── 新增组件（对齐百科 55 项');
if (bStart < 0) throw new Error('blockStart not found');

const endMarkerStart = s.indexOf('\n        }\n\n        // 美术全部程序化绘制', bStart);
if (endMarkerStart < 0) throw new Error('endMarker not found');
const blockEnd = endMarkerStart + '\n        }'.length; // position just after the drawNew closing brace

let block = s.slice(bStart, blockEnd);
// re-indent block by 4 spaces to match start() body (12 spaces)
block = block.split('\n').map(l => '    ' + l).join('\n');

// remove block from old location (collapse the now-empty gap)
let newS = s.slice(0, bStart).replace(/\s+$/, '') + s.slice(blockEnd).replace(/^\s+/, '\n');
// insert block right after the ctx destructuring line
const insertPos = newS.indexOf('\n', newS.indexOf(ctxLine)) + 1;
newS = newS.slice(0, insertPos) + '\n' + block + '\n' + newS.slice(insertPos);

fs.writeFileSync(p, newS);
console.log('relocated block; old length', s.length, '-> new', newS.length);
