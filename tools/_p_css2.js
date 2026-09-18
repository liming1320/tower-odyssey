const fs = require('fs');
const P = 'E:/WorkSpace/tower-odyssey/public/css/main.css';
let s = fs.readFileSync(P, 'utf8');
const block = `
/* 引擎增强轮（D+E+F）：每日挑战面板（E4） */
.mg-daily { position: absolute; top: 8px; left: 8px; right: 8px; z-index: 58; text-align: left; color: #cfd2e2; font-size: 12px; pointer-events: none; }
.mg-daily-badge { display: inline-block; background: rgba(255,213,107,0.15); color: #ffd56b; padding: 2px 8px; border-radius: 6px; }
.mg-daily-code { margin-top: 4px; }
.mg-daily-code code { background: rgba(0,0,0,0.4); padding: 1px 6px; border-radius: 4px; color: #9ad0ff; }
.mg-daily-copy { pointer-events: auto; margin-left: 6px; font-size: 11px; padding: 2px 8px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.2); background: #3a3160; color: #e8e6f4; cursor: pointer; }
`;
s += block;
fs.writeFileSync(P, s); console.log('css2 patched OK');
