/* 生成 10 个材料英雄头像（SVG，原创绘制，不使用任何外部截图）
 * 5 系 × 2 档（3★ / 4★），输出到 public/img/material/
 * 用法: node tools/gen-material-avatars.js
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'img', 'material');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// 每系配色 + 图形主题
const THEME = {
    草: { c1: '#d8f7b8', c2: '#7ddf64', c3: '#2f7a35', glow: '#b6ff7a', motif: 'leaf' },
    水: { c1: '#cdefff', c2: '#5cc7ff', c3: '#1d5f8f', glow: '#9fe6ff', motif: 'drop' },
    火: { c1: '#ffd9b0', c2: '#ff7a2f', c3: '#8c2f14', glow: '#ffb066', motif: 'flame' },
    光: { c1: '#fff3c4', c2: '#ffd56b', c3: '#a06a12', glow: '#fff0a8', motif: 'star' },
    暗: { c1: '#e0d0ff', c2: '#b78bff', c3: '#3d2470', glow: '#d9b8ff', motif: 'shadow' },
};

function motif(m, t) {
    const { c2, c3, glow } = t;
    switch (m) {
        case 'leaf': // 头顶两片叶子
            return `
            <path d="M100 46 C86 26 60 26 54 44 C74 36 86 44 100 60 Z" fill="${c2}" stroke="${c3}" stroke-width="3"/>
            <path d="M100 46 C114 26 140 26 146 44 C126 36 114 44 100 60 Z" fill="${c2}" stroke="${c3}" stroke-width="3"/>
            <path d="M100 46 L100 62" stroke="${c3}" stroke-width="4" stroke-linecap="round"/>`;
        case 'drop': // 头顶水滴 + 波纹
            return `
            <path d="M100 30 C116 50 124 60 124 72 A24 24 0 0 1 76 72 C76 60 84 50 100 30 Z" fill="${c2}" stroke="${c3}" stroke-width="3"/>
            <path d="M84 66 A16 16 0 0 0 84 78" stroke="#ffffff" stroke-width="4" fill="none" opacity=".65" stroke-linecap="round"/>`;
        case 'flame': // 火焰
            return `
            <path d="M100 28 C112 46 126 52 126 70 A26 26 0 0 1 74 70 C74 54 88 48 100 28 Z" fill="${c2}" stroke="${c3}" stroke-width="3"/>
            <path d="M100 50 C106 60 112 64 112 74 A12 12 0 0 1 88 74 C88 64 94 60 100 50 Z" fill="${glow}"/>`;
        case 'star': // 头顶星星 + 光晕
            return `
            <circle cx="100" cy="56" r="26" fill="${glow}" opacity=".35"/>
            <path d="M100 30 L108 50 L130 52 L113 66 L119 88 L100 76 L81 88 L87 66 L70 52 L92 50 Z" fill="${c2}" stroke="${c3}" stroke-width="3"/>`;
        case 'shadow': // 双角 + 暗影
        default:
            return `
            <path d="M74 62 C64 44 62 30 66 24 C76 34 84 46 86 58 Z" fill="${c3}" stroke="${c2}" stroke-width="3"/>
            <path d="M126 62 C136 44 138 30 134 24 C124 34 116 46 114 58 Z" fill="${c3}" stroke="${c2}" stroke-width="3"/>`;
    }
}

function star(grade) {
    // 4★ 加背后光环与角标星星
    if (grade === 4) {
        return `
        <circle cx="100" cy="100" r="92" fill="none" stroke="#ffd56b" stroke-width="4" opacity=".9" stroke-dasharray="10 8"/>
        <g transform="translate(150,46)">
            <path d="M0 -16 L5 -5 L17 -5 L7 3 L11 15 L0 8 L-11 15 L-7 3 L-17 -5 L-5 -5 Z" fill="#ffd56b" stroke="#8a5a12" stroke-width="2"/>
        </g>`;
    }
    return `
        <g transform="translate(150,46) scale(.8)">
            <path d="M0 -16 L5 -5 L17 -5 L7 3 L11 15 L0 8 L-11 15 L-7 3 L-17 -5 L-5 -5 Z" fill="#e8e2ff" stroke="#6e6788" stroke-width="2"/>
        </g>`;
}

function svg(el, grade, name) {
    const t = THEME[el];
    const ring = grade === 4 ? '#ffd56b' : '#cfc8e8';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="${t.c1}"/>
      <stop offset="100%" stop-color="${t.c2}"/>
    </radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="${t.c1}"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="96" fill="url(#bg)" stroke="${ring}" stroke-width="6"/>
  <circle cx="100" cy="100" r="82" fill="none" stroke="#ffffff" stroke-width="3" opacity=".5"/>
  ${motif(t.motif, t)}
  <!-- 身体 -->
  <ellipse cx="100" cy="118" rx="52" ry="46" fill="url(#body)" stroke="${t.c3}" stroke-width="4"/>
  <!-- 眼睛 -->
  <ellipse cx="82" cy="112" rx="8" ry="10" fill="${t.c3}"/>
  <ellipse cx="118" cy="112" rx="8" ry="10" fill="${t.c3}"/>
  <circle cx="85" cy="108" r="3" fill="#ffffff"/>
  <circle cx="121" cy="108" r="3" fill="#ffffff"/>
  <!-- 腮红 -->
  <ellipse cx="70" cy="128" rx="9" ry="6" fill="${t.c2}" opacity=".55"/>
  <ellipse cx="130" cy="128" rx="9" ry="6" fill="${t.c2}" opacity=".55"/>
  <!-- 嘴 -->
  <path d="M92 134 Q100 142 108 134" stroke="${t.c3}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <!-- 元素标记 -->
  <text x="100" y="182" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="${t.c3}" opacity=".85">${el}</text>
  ${star(grade)}
</svg>`;
}

// 5 系 × 2 档
const LIST = [
    ['m37', '草', 3], ['m47', '草', 4],
    ['m31', '水', 3], ['m41', '水', 4],
    ['m32', '火', 3], ['m42', '火', 4],
    ['m35', '光', 3], ['m45', '光', 4],
    ['m36', '暗', 3], ['m46', '暗', 4],
];

for (const [id, el, grade] of LIST) {
    const file = path.join(OUT, `${id}.svg`);
    fs.writeFileSync(file, svg(el, grade), 'utf8');
    console.log('生成', `${id}.svg`, el, grade + '★');
}
console.log('输出目录:', OUT);
