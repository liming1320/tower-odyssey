/* 生成 Q 版日漫风英雄立绘 / 头像（纯 SVG，程序生成，无版权风险）
 *
 *   node tools/gen-hero-art.js            # 生成全部英雄
 *   node tools/gen-hero-art.js h01 h02    # 只生成指定 id
 *
 * 输出：
 *   public/img/heroes/<id>.svg   立绘 320x420（2 头身 Q 版）
 *   public/img/avatars/<id>.svg  头像 128x128（大头贴，圆形）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HERO_DIR = path.join(ROOT, 'public/img/heroes');
const AVATAR_DIR = path.join(ROOT, 'public/img/avatars');
const DB = path.join(ROOT, 'data/db.json');

/* ---------------- 配色 ---------------- */
const EL = {
    草: { main: '#4ade80', deep: '#15803d', light: '#bbf7d0', glow: '#e9fff2', dark: '#0b3a22' },
    水: { main: '#38bdf8', deep: '#0369a1', light: '#bae6fd', glow: '#e6f7ff', dark: '#0b3550' },
    火: { main: '#ff7a45', deep: '#c2410c', light: '#ffd3a8', glow: '#fff0e2', dark: '#4a1705' },
    光: { main: '#fbbf24', deep: '#b45309', light: '#fef3c7', glow: '#fffbeb', dark: '#4a2f05' },
    暗: { main: '#a78bfa', deep: '#5b21b6', light: '#e9d5ff', glow: '#f6f2ff', dark: '#2a1150' },
};
const HAIRS = ['#ffd9a0', '#f4a6c0', '#8fd3ff', '#c9a7f5', '#b8f2c9', '#ffb3a0', '#e6e8f2', '#8b5e3c', '#4b3f5c', '#fff2e0', '#ff9ab5', '#7ee0d0', '#ffc7d8', '#a0e7ff'];
const IRIS = ['#5cc7ff', '#ff8fb1', '#ffd166', '#a78bfa', '#4ade80', '#ff7043', '#7dd3fc', '#f472b6', '#67e8f9', '#fb923c'];
const SKINS = ['#ffe4d6', '#ffd9c4', '#f8dcc0'];
// 品质配色（与 battle.js 的 RARITY_COLOR 保持一致，用于头像/立绘边框）
const RARITY = {
    '传说+': '#ff7a8b', '传说': '#ff9d5c', '史诗': '#b78bff', '稀有': '#5cc7ff',
    '优秀': '#7cfc7c', '普通': '#cfd6e6',
};
// 柔和发光滤镜（defs 片段，按 id 去重）
function glowFilter(id, color) {
    return `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
}

/* ---------------- 稳定哈希（同 id 每次生成一致） ---------------- */
function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
const pick = (arr, h, shift) => arr[(h >>> shift) % arr.length];

/* ---------------- 眼睛（大眼日漫，expr: 0 平和 / 1 微笑 / 2 酷） ---------------- */
function eye(cx, cy, rx, ry, c1, c2, gid, expr) {
    const lid = expr === 2
        ? `<path d="M${cx - rx * 1.02} ${cy - ry * 0.5} q${rx} ${-ry * 0.2} ${rx * 2.04} 0" stroke="#2b2140" stroke-width="${ry * 0.30}" fill="none" stroke-linecap="round"/>`
        : `<path d="M${cx - rx * 1.02} ${cy - ry * 0.72} q${rx} ${-ry * 0.86} ${rx * 2.04} 0" stroke="#2b2140" stroke-width="${ry * 0.24}" fill="none" stroke-linecap="round"/>`;
    const pupil = expr === 1
        ? `<ellipse cx="${cx}" cy="${cy + ry * 0.10}" rx="${rx * 0.30}" ry="${ry * 0.46}" fill="#241634" opacity=".92"/>`
        : `<ellipse cx="${cx}" cy="${cy + ry * 0.14}" rx="${rx * 0.34}" ry="${ry * 0.52}" fill="#241634" opacity=".9"/>`;
    return `
    <g>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fffdf8"/>
      <ellipse cx="${cx}" cy="${cy + ry * 0.06}" rx="${rx * 0.82}" ry="${ry * 0.92}" fill="url(#iris${gid})"/>
      ${pupil}
      <circle cx="${cx - rx * 0.32}" cy="${cy - ry * 0.36}" r="${rx * 0.30}" fill="#fff" opacity=".96"/>
      <circle cx="${cx + rx * 0.30}" cy="${cy + ry * 0.34}" r="${rx * 0.13}" fill="#fff" opacity=".72"/>
      ${lid}
      <path d="M${cx - rx * 0.9} ${cy + ry * 0.86} q${rx * 0.9} ${ry * 0.30} ${rx * 1.8} 0"
            stroke="#2b2140" stroke-width="${ry * 0.10}" fill="none" stroke-linecap="round" opacity=".55"/>
      <circle cx="${c2 ? cx - rx * 1.05 : cx - rx * 1.05}" cy="${cy - ry * 0.9}" r="${rx * 0.13}" fill="#2b2140" opacity=".5"/>
    </g>`;
}

/* ---------------- 嘴（expr: 0 平和 / 1 微笑 / 2 酷） ---------------- */
function mouth(cx, cy, rx, ry, expr) {
    if (expr === 1) // 微笑
        return `<path d="M${cx - rx * 0.5} ${cy + ry * 0.42} q${rx * 0.5} ${ry * 0.55} ${rx} 0" fill="none" stroke="#c4626f" stroke-width="2.6" stroke-linecap="round"/>`;
    if (expr === 2) // 微撇（酷）
        return `<path d="M${cx - rx * 0.5} ${cy + ry * 0.55} q${rx * 0.55} ${-ry * 0.2} ${rx} ${-ry * 0.05}" fill="none" stroke="#c4626f" stroke-width="2.4" stroke-linecap="round"/>`;
    return `<path d="M${cx - 4} ${cy + ry * 0.5} q4 5 8 0" fill="none" stroke="#c4626f" stroke-width="2.4" stroke-linecap="round"/>`;
}

/* ---------------- 发型（8 种） ---------------- */
function hairBack(style, cx, cy, rx, ry, col, deep) {
    const w = rx * 1.28, h = ry * 1.34;
    switch (style) {
        case 0: // 长直发
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    <path d="M${cx - w} ${cy - ry * 0.3} h${rx * 0.5} v${ry * 2.2} h${-rx * 0.5} z" fill="${deep}"/>
                    <path d="M${cx + w - rx * 0.5} ${cy - ry * 0.3} h${rx * 0.5} v${ry * 2.2} h${-rx * 0.5} z" fill="${deep}"/>`;
        case 1: // 双马尾
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    <ellipse cx="${cx - w * 0.98}" cy="${cy + ry * 0.72}" rx="${rx * 0.42}" ry="${ry * 0.86}" fill="${col}"/>
                    <ellipse cx="${cx + w * 0.98}" cy="${cy + ry * 0.72}" rx="${rx * 0.42}" ry="${ry * 0.86}" fill="${col}"/>
                    <circle cx="${cx - w * 0.98}" cy="${cy + ry * 0.2}" r="${rx * 0.16}" fill="${deep}"/>
                    <circle cx="${cx + w * 0.98}" cy="${cy + ry * 0.2}" r="${rx * 0.16}" fill="${deep}"/>`;
        case 2: // 短碎发
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w * 0.98}" ry="${h * 0.9}" fill="${deep}"/>`;
        case 3: // 丸子头
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    <circle cx="${cx}" cy="${cy - ry * 1.34}" r="${rx * 0.44}" fill="${col}"/>
                    <circle cx="${cx}" cy="${cy - ry * 1.34}" r="${rx * 0.44}" fill="none" stroke="${deep}" stroke-width="${rx * 0.08}"/>`;
        case 4: // 波波头
            return `<path d="M${cx - w} ${cy + ry * 0.5} q${-rx * 0.1} ${-h * 1.15} ${w} ${-h * 1.05} q${w * 0.98} ${-ry * 0.1} ${w} ${h * 1.05}
                     q${rx * 0.1} ${h * 0.5} ${-w * 0.55} ${h * 0.36} h${-w * 0.9} q${-w * 0.65} ${-h * 0.86} ${-w * 0.55} ${-h * 0.36} z" fill="${deep}"/>`;
        case 5: // 单马尾
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    <path d="M${cx + w * 0.86} ${cy - ry * 0.1} q${rx * 0.7} ${ry * 1.1} ${-rx * 0.1} ${ry * 1.9} q${-rx * 0.5} ${-ry * 0.7} ${-rx * 0.42} ${-ry * 1.7} z" fill="${col}"/>`;
        case 6: // 卷发 / 爆炸
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    ${[0, 1, 2, 3, 4, 5].map(i => {
                        const a = (i / 6) * Math.PI * 2 + 0.4;
                        return `<circle cx="${cx + Math.cos(a) * w * 0.92}" cy="${cy + Math.sin(a) * h * 0.86}" r="${rx * 0.3}" fill="${col}"/>`;
                    }).join('')}`;
        case 8: // 侧分短发
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w * 0.98}" ry="${h * 0.92}" fill="${deep}"/>
                    <path d="M${cx - w} ${cy - ry * 0.2} q${rx * 0.4} ${-ry * 1.0} ${rx * 1.1} ${-ry * 0.5} q${-rx * 0.2} ${ry * 0.6} ${-rx * 0.5} ${ry * 0.7} q${-rx * 0.6} ${-ry * 0.4} ${-rx * 0.6} ${-ry * 0.2} z" fill="${col}"/>`;
        case 9: // 麻花辫
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    ${[1, -1].map(s => `<g transform="translate(${cx + s * w * 0.8},${cy + ry * 0.4})">
                      <path d="M0 0 q${s * rx * 0.5} ${ry * 0.8} ${-s * rx * 0.1} ${ry * 1.6} q${-s * rx * 0.5} ${-ry * 0.7} ${s * rx * 0.1} ${-ry * 1.5} z" fill="${col}"/>
                      ${[0,1,2].map(i => `<circle cx="${s * rx * 0.1}" cy="${ry * 0.5 + i * ry * 0.5}" r="${rx * 0.16}" fill="${deep}" opacity=".5"/>`).join('')}</g>`).join('')}`;
        case 10: // 大波浪长发
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    <path d="M${cx - w * 0.95} ${cy + ry * 0.1} q${-rx * 0.5} ${ry * 1.1} ${rx * 0.2} ${ry * 1.5} q${-rx * 0.5} ${ry * 0.5} ${rx * 0.1} ${ry * 1.4} q${-rx * 0.3} ${-ry * 1.6} ${rx * 0.3} ${-ry * 1.7} z" fill="${col}"/>
                    <path d="M${cx + w * 0.95} ${cy + ry * 0.1} q${rx * 0.5} ${ry * 1.1} ${-rx * 0.2} ${ry * 1.5} q${rx * 0.5} ${ry * 0.5} ${-rx * 0.1} ${ry * 1.4} q${rx * 0.3} ${-ry * 1.6} ${-rx * 0.3} ${-ry * 1.7} z" fill="${col}"/>`;
        case 11: // 妹妹头（锅盖）
            return `<path d="M${cx - w} ${cy + ry * 0.2} q0 ${-h * 1.2} ${w * 2} 0 q0 ${-ry * 0.1} ${-w * 0.5} ${-ry * 0.3} q${-w} ${ry * 0.1} ${-w * 1.5} ${ry * 0.3} z" fill="${deep}"/>
                    <ellipse cx="${cx}" cy="${cy}" rx="${w * 0.9}" ry="${h * 0.86}" fill="${col}"/>`;
        case 12: // 高双马尾
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    ${[-1, 1].map(s => `<path d="M${cx + s * w * 0.7} ${cy - ry * 0.2} q${s * rx * 0.7} ${-ry * 0.6} ${s * rx * 0.5} ${ry * 1.7} q${-s * rx * 0.4} ${-ry * 0.6} ${-s * rx * 0.5} ${-ry * 1.5} z" fill="${col}"/>
                      <circle cx="${cx + s * w * 0.7}" cy="${cy - ry * 0.2}" r="${rx * 0.18}" fill="${deep}"/>`).join('')}`;
        case 13: // 飘逸长发（挑染）
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    <path d="M${cx - w * 0.9} ${cy + ry * 0.2} q${-rx * 0.4} ${ry * 1.7} ${rx * 0.35} ${ry * 2.1} q${-rx * 0.25} ${-ry * 1.3} ${rx * 0.55} ${-ry * 2.1} z" fill="${col}"/>
                    <path d="M${cx + w * 0.9} ${cy + ry * 0.2} q${rx * 0.4} ${ry * 1.7} ${-rx * 0.35} ${ry * 2.1} q${rx * 0.25} ${-ry * 1.3} ${-rx * 0.55} ${-ry * 2.1} z" fill="${col}"/>
                    <path d="M${cx - w * 0.5} ${cy + ry * 0.6} q${-rx * 0.2} ${ry * 1.6} ${rx * 0.1} ${ry * 2.0} z" fill="${elLight(col)}" opacity=".7"/>`;
        default: // 长发 + 发梢
            return `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="${deep}"/>
                    <path d="M${cx - w * 0.9} ${cy + ry * 0.2} q${-rx * 0.4} ${ry * 1.6} ${rx * 0.3} ${ry * 2.0} q${-rx * 0.2} ${-ry * 1.2} ${rx * 0.5} ${-ry * 2.0} z" fill="${col}"/>
                    <path d="M${cx + w * 0.9} ${cy + ry * 0.2} q${rx * 0.4} ${ry * 1.6} ${-rx * 0.3} ${ry * 2.0} q${rx * 0.2} ${-ry * 1.2} ${-rx * 0.5} ${-ry * 2.0} z" fill="${col}"/>`;
    }
}
// 发色提亮（用于挑染高光）
function elLight(hex) {
    const m = hex.replace('#', '');
    let r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    r = Math.min(255, r + 60); g = Math.min(255, g + 60); b = Math.min(255, b + 60);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hairFront(style, cx, cy, rx, ry, col, deep) {
    switch (style) {
        case 2: // 碎刘海
            return `<path d="M${cx - rx * 1.02} ${cy - ry * 0.36} q${rx * 0.28} ${-ry * 0.72} ${rx * 0.62} ${-ry * 0.3}
                     q${rx * 0.12} ${-ry * 0.6} ${rx * 0.5} ${ry * 0.06} q${rx * 0.2} ${-ry * 0.62} ${rx * 0.52} ${-ry * 0.1}
                     q${rx * 0.3} ${-ry * 0.5} ${rx * 0.36} ${ry * 0.3} q${-rx * 0.6} ${ry * 0.5} ${-rx * 2.0} ${ry * 0.1} z" fill="${col}"/>`;
        case 4: // 齐刘海
            return `<path d="M${cx - rx * 1.06} ${cy - ry * 0.5} q${rx * 0.1} ${-ry * 0.86} ${rx * 1.06} ${-ry * 0.82}
                     q${rx * 0.96} ${-ry * 0.04} ${rx * 1.06} ${ry * 0.82} q${-rx * 0.7} ${ry * 0.42} ${-rx * 1.3} ${ry * 0.16}
                     q${-rx * 0.3} ${-ry * 0.3} ${-rx * 0.82} ${ry * 0.02} z" fill="${col}"/>`;
        case 8: // 侧分短刘海
            return `<path d="M${cx - rx * 1.04} ${cy - ry * 0.3} q${rx * 0.2} ${-ry * 0.9} ${rx * 1.0} ${-ry * 0.55}
                     q${rx * 0.5} ${ry * 0.1} ${rx * 0.04} ${ry * 0.4} q${-rx * 0.7} ${ry * 0.2} ${-rx * 1.04} ${-ry * 0.25} z" fill="${col}"/>`;
        case 9: // 麻花辫前额碎发
        case 11: // 锅盖齐厚
            return `<path d="M${cx - rx * 1.06} ${cy - ry * 0.5} q${rx * 0.1} ${-ry * 0.86} ${rx * 1.06} ${-ry * 0.82}
                     q${rx * 0.96} ${-ry * 0.04} ${rx * 1.06} ${ry * 0.82} q${-rx * 0.7} ${ry * 0.5} ${-rx * 1.3} ${ry * 0.2}
                     q${-rx * 0.3} ${-ry * 0.3} ${-rx * 0.82} ${ry * 0.02} z" fill="${col}"/>`;
        case 10: // 中分大波
        case 12: // 高双马尾前额
        case 13: // 飘逸中分
            return `<path d="M${cx - rx * 1.04} ${cy - ry * 0.34} q${rx * 0.16} ${-ry * 0.9} ${rx * 0.86} ${-ry * 0.62}
                     q${rx * 0.42} ${ry * 0.16} ${rx * 0.36} ${ry * 0.36} q${-rx * 0.34} ${ry * 0.18} ${-rx * 0.5} ${-ry * 0.1}
                     q${rx * 0.1} ${ry * 0.44} ${rx * 0.9} ${ry * 0.32} q${rx * 0.24} ${ry * 0.5} ${-rx * 0.7} ${ry * 0.7}
                     q${-rx * 1.2} ${-ry * 0.3} ${-rx * 0.92} ${-ry * 1.0} z" fill="${col}"/>`;
        default: // 中分 / 斜刘海
            return `<path d="M${cx - rx * 1.04} ${cy - ry * 0.34} q${rx * 0.16} ${-ry * 0.9} ${rx * 0.86} ${-ry * 0.62}
                     q${rx * 0.42} ${ry * 0.16} ${rx * 0.36} ${ry * 0.36} q${-rx * 0.34} ${ry * 0.18} ${-rx * 0.5} ${-ry * 0.1}
                     q${rx * 0.1} ${ry * 0.44} ${rx * 0.9} ${ry * 0.32} q${rx * 0.24} ${ry * 0.5} ${-rx * 0.7} ${ry * 0.7}
                     q${-rx * 1.2} ${-ry * 0.3} ${-rx * 0.92} ${-ry * 1.0} z" fill="${col}"/>`;
    }
}

/* ---------------- 头饰 / 兽耳 ---------------- */
function extra(type, cx, cy, rx, ry, el, hair) {
    switch (type) {
        case 0: // 王冠
            return `<path d="M${cx - rx * 0.5} ${cy - ry * 1.0} l${rx * 0.16} ${-rx * 0.34} l${rx * 0.18} ${rx * 0.28}
                     l${rx * 0.16} ${-rx * 0.42} l${rx * 0.16} ${rx * 0.42} l${rx * 0.18} ${-rx * 0.28} l${rx * 0.16} ${rx * 0.34} z"
                     fill="#ffd56b" stroke="#c99a2e" stroke-width="${rx * 0.03}"/>`;
        case 1: // 猫耳
            return `<path d="M${cx - rx * 0.86} ${cy - ry * 0.82} l${-rx * 0.1} ${-rx * 0.6} l${rx * 0.5} ${rx * 0.36} z" fill="${hair}" stroke="${el.deep}" stroke-width="${rx * 0.03}"/>
                    <path d="M${cx + rx * 0.86} ${cy - ry * 0.82} l${rx * 0.1} ${-rx * 0.6} l${-rx * 0.5} ${rx * 0.36} z" fill="${hair}" stroke="${el.deep}" stroke-width="${rx * 0.03}"/>`;
        case 2: // 光环
            return `<ellipse cx="${cx}" cy="${cy - ry * 1.42}" rx="${rx * 0.62}" ry="${rx * 0.18}" fill="none" stroke="#ffe9a8" stroke-width="${rx * 0.09}" opacity=".95"/>`;
        case 3: // 花朵
            return `<g transform="translate(${cx + rx * 0.82},${cy - ry * 0.86})">
                    ${[0, 1, 2, 3, 4].map(i => `<ellipse cx="0" cy="${-rx * 0.2}" rx="${rx * 0.12}" ry="${rx * 0.2}" fill="#ff9ec4" transform="rotate(${i * 72})"/>`).join('')}
                    <circle cx="0" cy="0" r="${rx * 0.11}" fill="#fff3c4"/></g>`;
        case 4: // 蝴蝶结
            return `<g transform="translate(${cx - rx * 0.92},${cy - ry * 0.78})">
                    <path d="M0 0 l${-rx * 0.44} ${-rx * 0.26} l0 ${rx * 0.52} z" fill="${el.main}"/>
                    <path d="M0 0 l${rx * 0.44} ${-rx * 0.26} l0 ${rx * 0.52} z" fill="${el.main}"/>
                    <circle cx="0" cy="0" r="${rx * 0.11}" fill="${el.deep}"/></g>`;
        case 5: // 护目镜
            return `<path d="M${cx - rx * 0.95} ${cy - ry * 0.72} h${rx * 1.9} v${rx * 0.1} h${-rx * 1.9} z" fill="${el.deep}"/>
                    <circle cx="${cx - rx * 0.48}" cy="${cy - ry * 0.72}" r="${rx * 0.24}" fill="none" stroke="${el.deep}" stroke-width="${rx * 0.07}"/>
                    <circle cx="${cx + rx * 0.48}" cy="${cy - ry * 0.72}" r="${rx * 0.24}" fill="none" stroke="${el.deep}" stroke-width="${rx * 0.07}"/>`;
        case 6: // 呆毛
            return `<path d="M${cx} ${cy - ry * 1.06} q${rx * 0.06} ${-ry * 0.5} ${rx * 0.34} ${-ry * 0.62} q${-rx * 0.3} ${ry * 0.06} ${-rx * 0.14} ${ry * 0.5} z" fill="${hair}"/>`;
        default: // 狐耳 / 尖耳
            return `<path d="M${cx - rx * 0.8} ${cy - ry * 0.9} q${-rx * 0.22} ${-rx * 0.7} ${rx * 0.16} ${-rx * 0.6} q${rx * 0.26} ${rx * 0.16} ${rx * 0.2} ${rx * 0.5} z" fill="${hair}" stroke="${el.deep}" stroke-width="${rx * 0.025}"/>
                    <path d="M${cx + rx * 0.8} ${cy - ry * 0.9} q${rx * 0.22} ${-rx * 0.7} ${-rx * 0.16} ${-rx * 0.6} q${-rx * 0.26} ${rx * 0.16} ${-rx * 0.2} ${rx * 0.5} z" fill="${hair}" stroke="${el.deep}" stroke-width="${rx * 0.025}"/>`;
    }
}

/* ---------------- 元素符号 ---------------- */
function symbol(kind, cx, cy, r, color) {
    switch (kind) {
        case 'leaf': return `<path d="M${cx} ${cy - r} q${r} ${r * 0.5} 0 ${r * 2} q${-r} ${-r * 1.5} 0 ${-r * 2} z" fill="${color}"/>`;
        case 'drop': return `<path d="M${cx} ${cy - r} q${r * 0.9} ${r} 0 ${r * 1.7} q${-r * 0.9} ${-r * 0.7} 0 ${-r * 1.7} z" fill="${color}"/>`;
        case 'flame': return `<path d="M${cx} ${cy - r * 1.1} q${r * 0.8} ${r * 0.9} ${r * 0.2} ${r * 1.6} q${-r * 0.1} ${-r * 0.6} ${-r * 0.5} ${-r * 0.3} q${-r * 0.7} ${r * 0.4} ${-r * 0.6} ${-r * 0.7} q${-r * 0.5} ${-r * 0.4} ${-r * 0.1} ${-r * 0.9} z" fill="${color}"/>`;
        case 'star': return `<path d="M${cx} ${cy - r} l${r * 0.3} ${r * 0.62} l${r * 0.68} ${r * 0.1} l${-r * 0.5} ${r * 0.48} l${r * 0.12} ${r * 0.68} l${-r * 0.6} ${-r * 0.32} l${-r * 0.6} ${r * 0.32} l${r * 0.12} ${-r * 0.68} l${-r * 0.5} ${-r * 0.48} l${r * 0.68} ${-r * 0.1} z" fill="${color}"/>`;
        default: return `<path d="M${cx + r * 0.3} ${cy - r * 0.95} a${r} ${r} 0 1 0 ${r * 0.35} ${r * 1.15} a${r * 0.8} ${r * 0.8} 0 1 1 ${-r * 0.35} ${-r * 1.15} z" fill="${color}"/>`;
    }
}

/* ---------------- 武器 ---------------- */
function weapon(type, x, y, s, el) {
    const c = '#e8e2f5', d = '#8d84ad';
    switch (type) {
        case 0: // 剑
            return `<g transform="translate(${x},${y}) scale(${s})">
                <path d="M0 -46 l7 10 v46 h-14 v-46 z" fill="${c}" stroke="${d}" stroke-width="2"/>
                <rect x="-16" y="8" width="32" height="6" rx="3" fill="${el.main}"/>
                <rect x="-3" y="14" width="6" height="20" rx="3" fill="${d}"/></g>`;
        case 1: // 法杖
            return `<g transform="translate(${x},${y}) scale(${s})">
                <rect x="-3" y="-30" width="6" height="70" rx="3" fill="${d}"/>
                <circle cx="0" cy="-38" r="12" fill="${el.main}" opacity=".9"/>
                <circle cx="0" cy="-38" r="6" fill="#fff" opacity=".85"/></g>`;
        case 2: // 弓
            return `<g transform="translate(${x},${y}) scale(${s})">
                <path d="M0 -40 q26 40 0 80" fill="none" stroke="${d}" stroke-width="6" stroke-linecap="round"/>
                <line x1="0" y1="-40" x2="0" y2="40" stroke="#fff" stroke-width="2" opacity=".8"/></g>`;
        case 3: // 锤
            return `<g transform="translate(${x},${y}) scale(${s})">
                <rect x="-3" y="-6" width="6" height="60" rx="3" fill="${d}"/>
                <rect x="-22" y="-40" width="44" height="34" rx="8" fill="${c}" stroke="${d}" stroke-width="3"/>
                <rect x="-22" y="-26" width="44" height="7" fill="${el.main}"/></g>`;
        case 4: // 书
            return `<g transform="translate(${x},${y}) scale(${s})">
                <path d="M-22 -26 h20 v52 h-20 z M2 -26 h20 v52 h-20 z" fill="${c}" stroke="${d}" stroke-width="3"/>
                <path d="M-2 -26 v52" stroke="${el.main}" stroke-width="5"/></g>`;
        case 5: // 镰刀
            return `<g transform="translate(${x},${y}) scale(${s})">
                <rect x="-3" y="-20" width="6" height="70" rx="3" fill="${d}"/>
                <path d="M0 -20 q34 -6 34 -30 q-4 20 -34 20 z" fill="${c}" stroke="${d}" stroke-width="3"/></g>`;
        case 6: // 竖琴 / 琴
            return `<g transform="translate(${x},${y}) scale(${s})">
                <path d="M-18 30 q0 -50 26 -56 q10 24 -6 40 q6 8 6 16 z" fill="${c}" stroke="${d}" stroke-width="3"/>
                ${[0, 1, 2, 3].map(i => `<line x1="${-12 + i * 7}" y1="${18 - i * 4}" x2="${-6 + i * 7}" y2="${-16 - i * 3}" stroke="${el.main}" stroke-width="1.6"/>`).join('')}</g>`;
        case 7: // 宝珠
            return `<g transform="translate(${x},${y}) scale(${s})">
                <circle cx="0" cy="0" r="20" fill="${el.main}" opacity=".85"/>
                <circle cx="-6" cy="-7" r="6" fill="#fff" opacity=".7"/>
                <ellipse cx="0" cy="26" rx="14" ry="4" fill="${el.deep}" opacity=".35"/></g>`;
        case 8: // 盾
            return `<g transform="translate(${x},${y}) scale(${s})">
                <path d="M0 -34 l24 10 v22 q0 20 -24 32 q-24 -12 -24 -32 v-22 z" fill="${c}" stroke="${d}" stroke-width="3"/>
                <path d="M0 -22 l13 6 v12 q0 11 -13 18 q-13 -7 -13 -18 v-12 z" fill="${el.main}" opacity=".85"/></g>`;
        default: // 伞
            return `<g transform="translate(${x},${y}) scale(${s})">
                <path d="M-30 -6 a30 30 0 0 1 60 0 z" fill="${el.main}" stroke="${el.deep}" stroke-width="3"/>
                <rect x="-2" y="-6" width="4" height="52" rx="2" fill="${d}"/>
                <path d="M2 46 q10 0 10 -8" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/></g>`;
    }
}

/* ---------------- 头像（大头贴） ---------------- */
function avatarSVG(hero, p) {
    const el = EL[p.element] || EL.光;
    const cx = 64, cy = 74, rx = 33, ry = 31;
    const gid = '';
    const rcol = RARITY[p.rarity] || RARITY['普通'];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<defs>
  <clipPath id="clip"><circle cx="64" cy="64" r="62"/></clipPath>
  <radialGradient id="bg" cx="50%" cy="30%" r="80%">
    <stop offset="0%" stop-color="${el.glow}"/><stop offset="100%" stop-color="${el.deep}"/>
  </radialGradient>
  <radialGradient id="bglow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${el.main}" stop-opacity=".55"/><stop offset="100%" stop-color="${el.main}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="iris${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${p.iris}"/><stop offset="100%" stop-color="${el.deep}"/>
  </linearGradient>
  <linearGradient id="cloth" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${el.main}"/><stop offset="100%" stop-color="${el.deep}"/>
  </linearGradient>
  <radialGradient id="face" cx="50%" cy="38%" r="70%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity=".25"/><stop offset="100%" stop-color="#000000" stop-opacity=".06"/>
  </radialGradient>
  ${glowFilter('aglow', el.main)}
</defs>
<circle cx="64" cy="64" r="64" fill="url(#bg)"/>
<circle cx="64" cy="64" r="60" fill="url(#bglow)"/>
<g clip-path="url(#clip)">
  <circle cx="64" cy="30" r="46" fill="${el.light}" opacity=".35"/>
  ${[0, 1, 2, 3, 4].map(i => `<circle cx="${18 + i * 23}" cy="${20 + (i % 2) * 14}" r="2.2" fill="#fff" opacity=".55"/>`).join('')}
  ${symbol(el.sym || 'star', 100, 26, 9, '#fff')}
  <path d="M10 128 q8 -34 54 -34 t54 34 z" fill="url(#cloth)"/>
  <path d="M46 96 q18 14 36 0 l4 8 q-22 16 -44 0 z" fill="#fff" opacity=".55"/>
  ${hairBack(p.style, cx, cy, rx, ry, p.hair, p.hairDeep)}
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${p.skin}"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#face)"/>
  <ellipse cx="${cx - rx * 0.92}" cy="${cy + ry * 0.24}" rx="${rx * 0.12}" ry="${rx * 0.17}" fill="${p.skin}" opacity=".9"/>
  <ellipse cx="${cx + rx * 0.92}" cy="${cy + ry * 0.24}" rx="${rx * 0.12}" ry="${rx * 0.17}" fill="${p.skin}" opacity=".9"/>
  ${eye(cx - rx * 0.42, cy + ry * 0.16, rx * 0.28, ry * 0.30, p.iris, true, gid, p.expr)}
  ${eye(cx + rx * 0.42, cy + ry * 0.16, rx * 0.28, ry * 0.30, p.iris, false, gid, p.expr)}
  <ellipse cx="${cx - rx * 0.66}" cy="${cy + ry * 0.52}" rx="${rx * 0.16}" ry="${ry * 0.09}" fill="#ff8fa8" opacity=".38"/>
  <ellipse cx="${cx + rx * 0.66}" cy="${cy + ry * 0.52}" rx="${rx * 0.16}" ry="${ry * 0.09}" fill="#ff8fa8" opacity=".38"/>
  ${mouth(cx, cy, rx, ry, p.expr)}
  ${hairFront(p.style, cx, cy, rx, ry, p.hair, p.hairDeep)}
  ${extra(p.extra, cx, cy, rx, ry, el, p.hair)}
</g>
<circle cx="64" cy="64" r="60" fill="none" stroke="${el.main}" stroke-width="5" opacity=".85" filter="url(#aglow)"/>
<circle cx="64" cy="64" r="61" fill="none" stroke="${rcol}" stroke-width="3" opacity=".95"/>
<circle cx="64" cy="64" r="63" fill="none" stroke="#ffffff" stroke-width="1.5" opacity=".35"/>
${p.rarity && p.rarity !== '普通' ? `<text x="64" y="20" text-anchor="middle" font-size="11" font-weight="bold" fill="${rcol}" opacity=".95">${p.rarity}</text>` : ''}
</svg>`;
}

/* ---------------- 立绘（2 头身全身） ---------------- */
function heroSVG(hero, p) {
    const el = EL[p.element] || EL.光;
    const gid = '';
    const cx = 160, cy = 132, rx = 54, ry = 50;
    const rcol = RARITY[p.rarity] || RARITY['普通'];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420" width="320" height="420">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${el.glow}"/><stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="${el.light}"/>
  </linearGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${el.main}" stop-opacity=".6"/><stop offset="100%" stop-color="${el.main}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="face" cx="50%" cy="36%" r="72%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity=".28"/><stop offset="100%" stop-color="#000000" stop-opacity=".08"/>
  </radialGradient>
  <linearGradient id="iris${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${p.iris}"/><stop offset="100%" stop-color="${el.deep}"/>
  </linearGradient>
  <linearGradient id="cloth" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${el.main}"/><stop offset="100%" stop-color="${el.deep}"/>
  </linearGradient>
  ${glowFilter('hglow', el.main)}
</defs>
<rect width="320" height="420" fill="url(#bg)"/>
<circle cx="160" cy="150" r="128" fill="url(#halo)" filter="url(#hglow)"/>
<circle cx="160" cy="150" r="100" fill="none" stroke="${el.main}" stroke-width="2.5" opacity=".4"/>
${[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const a = (i / 8) * Math.PI * 2;
        return `<circle cx="${160 + Math.cos(a) * 112}" cy="${150 + Math.sin(a) * 112}" r="${2 + (i % 3)}" fill="${el.deep}" opacity=".35"/>`;
    }).join('')}
${symbol(el.sym || 'star', 44, 44, 15, el.main)}
${symbol(el.sym || 'star', 276, 60, 10, el.main)}
<ellipse cx="160" cy="392" rx="72" ry="12" fill="${el.deep}" opacity=".18"/>
<!-- 腿 -->
<rect x="138" y="322" width="16" height="52" rx="8" fill="${el.deep}"/>
<rect x="166" y="322" width="16" height="52" rx="8" fill="${el.deep}"/>
<ellipse cx="146" cy="376" rx="14" ry="8" fill="#3b3455"/>
<ellipse cx="174" cy="376" rx="14" ry="8" fill="#3b3455"/>
<!-- 身体 -->
<path d="M160 196 q-40 4 -44 44 l-4 74 q44 14 96 0 l-4 -74 q-4 -40 -44 -44 z" fill="url(#cloth)"/>
<path d="M160 196 q-16 2 -20 10 q22 12 40 0 q-4 -8 -20 -10 z" fill="#fff" opacity=".55"/>
<path d="M116 258 q44 16 88 0" fill="none" stroke="#ffe9a8" stroke-width="4" opacity=".9"/>
<circle cx="160" cy="258" r="9" fill="#ffe9a8"/>
<!-- 手臂 -->
<rect x="108" y="212" width="16" height="54" rx="8" fill="${el.main}" transform="rotate(-8 116 240)"/>
<rect x="196" y="212" width="16" height="54" rx="8" fill="${el.main}" transform="rotate(8 204 240)"/>
<circle cx="112" cy="272" r="11" fill="${p.skin}"/>
<circle cx="208" cy="272" r="11" fill="${p.skin}"/>
<!-- 披风 -->
<path d="M120 200 q-34 10 -34 60 l6 56 q26 -18 28 -46 z" fill="${el.deep}" opacity=".85"/>
<path d="M200 200 q34 10 34 60 l-6 56 q-26 -18 -28 -46 z" fill="${el.deep}" opacity=".85"/>
${weapon(p.weapon, 250, 250, 1, el)}
<!-- 头 -->
${hairBack(p.style, cx, cy, rx, ry, p.hair, p.hairDeep)}
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${p.skin}"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#face)"/>
<ellipse cx="${cx - rx * 0.98}" cy="${cy + ry * 0.22}" rx="${rx * 0.11}" ry="${rx * 0.16}" fill="${p.skin}"/>
<ellipse cx="${cx + rx * 0.98}" cy="${cy + ry * 0.22}" rx="${rx * 0.11}" ry="${rx * 0.16}" fill="${p.skin}"/>
${eye(cx - rx * 0.40, cy + ry * 0.14, rx * 0.27, ry * 0.30, p.iris, true, gid, p.expr)}
${eye(cx + rx * 0.40, cy + ry * 0.14, rx * 0.27, ry * 0.30, p.iris, false, gid, p.expr)}
<ellipse cx="${cx - rx * 0.62}" cy="${cy + ry * 0.5}" rx="${rx * 0.15}" ry="${ry * 0.08}" fill="#ff8fa8" opacity=".38"/>
<ellipse cx="${cx + rx * 0.62}" cy="${cy + ry * 0.5}" rx="${rx * 0.15}" ry="${ry * 0.08}" fill="#ff8fa8" opacity=".38"/>
${mouth(cx, cy, rx, ry, p.expr)}
${hairFront(p.style, cx, cy, rx, ry, p.hair, p.hairDeep)}
${extra(p.extra, cx, cy, rx, ry, el, p.hair)}
${p.rarity && p.rarity !== '普通' ? `<g transform="translate(160,52)">
  <path d="M0 -10 l3 7 l8 0 l-6 6 l2 8 l-7 -4 l-7 4 l2 -8 l-6 -6 l8 0 z" fill="${rcol}" stroke="#fff" stroke-width="1" opacity=".95"/>
</g>` : ''}
</svg>`;
}

/* ---------------- 主流程 ---------------- */
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const args = process.argv.slice(2);
const list = (db.heroes || []).filter(h => !h.material && (!args.length || args.includes(h.id)));

fs.mkdirSync(HERO_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const SYM = { 草: 'leaf', 水: 'drop', 火: 'flame', 光: 'star', 暗: 'moon' };
let n = 0;
for (const h of list) {
    const seed = hash(h.id + '|' + (h.name || ''));
    const element = h.element || '光';
    const el = EL[element] || EL.光;
    const p = {
        element,
        rarity: h.rarity,
        style: seed % 14,
        extra: (seed >>> 4) % 8,
        weapon: (seed >>> 8) % 10,
        expr: (seed >>> 20) % 3,
        hair: pick(HAIRS, seed, 12),
        hairDeep: '',
        iris: pick(IRIS, seed, 16),
        skin: pick(SKINS, seed, 20),
    };
    // 发色暗部：同色系加深
    p.hairDeep = shade(p.hair, -0.28);
    el.sym = SYM[element];
    fs.writeFileSync(path.join(HERO_DIR, h.id + '.svg'), heroSVG(h, p));
    fs.writeFileSync(path.join(AVATAR_DIR, h.id + '.svg'), avatarSVG(h, p));
    n++;
}
console.log(`✅ 生成 ${n} 个英雄立绘 + 头像 → public/img/heroes, public/img/avatars`);

function shade(hex, amt) {
    const m = hex.replace('#', '');
    let r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
