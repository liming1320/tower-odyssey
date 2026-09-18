// 暗棋圣手：致敬 DOS 经典（1995·至通）
// 15 关闯关 · 猜拳定先手 · 道具秘技（吃子赚金币购买）· AI 难度随关卡递增
// 宋金对决：红方 = 宋国 Q 版小人（长翅幞头），黑方 = 金国 Q 版小人（皮草帽 + 小辫）
// 击杀必杀技：炮 = 开炮轰击 / 士 = 拔剑砍 / 相 = 龟派气功 / 车 = 小人开车碾压 /
//             马 = 骑马冲锋 / 帅 = 王者威压 / 兵 = 红缨枪突刺（配漫画拟声词）
// 规则：将士象车马炮卒，等级大的吃小的；卒可吃将、将不能吃卒；炮隔一子跳吃任意明子
window.MiniGames = window.MiniGames || {};

// ================= Q 版宋金小人美术 =================
const BQ_ART = (() => {
    // 棋子种类（红黑双套字符 → 同一种类）
    const KIND = { '帥': 'K', '將': 'K', '仕': 'A', '士': 'A', '相': 'B', '象': 'B', '俥': 'R', '車': 'R', '傌': 'H', '馬': 'H', '炮': 'C', '砲': 'C', '兵': 'P', '卒': 'P' };
    const kindOf = n => KIND[n] || 'P';
    const PAL = {
        1: { // 宋国（红）
            robe1: '#e8634f', robe2: '#a52a2a', trim: '#ffd56b', skin: '#ffe3c8', cheek: '#ff9d8a',
            line: '#5a1c1c', hat: '#2e2e42', band: '#ffd56b', metal: '#dfe4ee', wood: '#8a5a2a', cloth: '#c23b3b',
        },
        2: { // 金国（蓝黑）
            robe1: '#5d6f9e', robe2: '#2c3a56', trim: '#e9ecf4', skin: '#f5cfa3', cheek: '#e8a06a',
            line: '#1c2438', hat: '#7a839a', band: '#ffd56b', metal: '#c9d2e2', wood: '#4a5568', cloth: '#3d4a6b',
        },
    };

    function figure(n, color) {
        const k = kindOf(n);
        const p = PAL[color] || PAL[1];
        const g = id => `bq-${id}-${color}`;
        const u = id => `url(#bq-${id}-${color})`;
        const defs = `<defs>
            <linearGradient id="${g('robe')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.robe1}"/><stop offset="1" stop-color="${p.robe2}"/></linearGradient>
            <linearGradient id="${g('mtl')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="0.55" stop-color="${p.metal}"/><stop offset="1" stop-color="#8d95a8"/></linearGradient>
            <radialGradient id="${g('orb')}" cx="0.38" cy="0.38" r="0.85"><stop offset="0" stop-color="#eaffff"/><stop offset="0.55" stop-color="#5cc7ff"/><stop offset="1" stop-color="#2a6adf"/></radialGradient>
        </defs>`;
        const sh = `<ellipse cx="30" cy="60" rx="15" ry="3.4" fill="rgba(0,0,0,0.28)"/>`;
        const eyes = closed => closed
            ? `<path d="M22.5 22 q3 2.2 5.6 0 M32 22 q3 2.2 5.6 0" stroke="#1c1c28" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
            : `<ellipse cx="25.6" cy="21.6" rx="2" ry="2.5" fill="#1c1c28"/><ellipse cx="34.4" cy="21.6" rx="2" ry="2.5" fill="#1c1c28"/>
               <circle cx="24.9" cy="20.7" r="0.65" fill="#fff"/><circle cx="33.7" cy="20.7" r="0.65" fill="#fff"/>`;
        const brows = color === 2 ? `<path d="M23 18.2 L28 19.6 M32 19.6 L37 18.2" stroke="#1c1c28" stroke-width="1.3" stroke-linecap="round"/>` : '';
        const head = (mouth, closed) => `<circle cx="30" cy="21" r="11.3" fill="${p.skin}"/>
            ${eyes(closed)}${brows}
            <path d="${mouth}" stroke="#a04848" stroke-width="1.5" fill="none" stroke-linecap="round"/>
            <circle cx="20.8" cy="25.4" r="2" fill="${p.cheek}" opacity="0.5"/><circle cx="39.2" cy="25.4" r="2" fill="${p.cheek}" opacity="0.5"/>`;
        const body = `<path d="M20 32.5 Q30 29 40 32.5 L44.5 55.5 Q30 60 15.5 55.5 Z" fill="${u('robe')}"/>
            <rect x="21.5" y="42.5" width="17" height="3.4" rx="1.7" fill="${p.trim}"/>`;
        // 宋：长翅幞头（两根长翅超搞笑）；金：皮草帽 + 小辫
        const hatSong = `<path d="M19.6 14.2 Q30 5.8 40.4 14.2 L40.4 17.6 Q30 13.6 19.6 17.6 Z" fill="${p.hat}"/>
            <rect x="22" y="9.2" width="16" height="6.2" rx="2.4" fill="${p.hat}"/>
            <rect x="22" y="14.6" width="16" height="2.4" fill="${p.band}"/>
            <line x1="22" y1="12.6" x2="6.5" y2="10.8" stroke="${p.hat}" stroke-width="2.4" stroke-linecap="round"/>
            <line x1="38" y1="12.6" x2="53.5" y2="10.8" stroke="${p.hat}" stroke-width="2.4" stroke-linecap="round"/>
            <circle cx="30" cy="8.4" r="2.1" fill="${p.band}"/>`;
        const hatJin = `<ellipse cx="30" cy="11.6" rx="10.6" ry="5.2" fill="${p.hat}"/>
            <circle cx="23" cy="14.3" r="2.1" fill="${p.trim}"/><circle cx="27" cy="15.6" r="2.1" fill="${p.trim}"/>
            <circle cx="33" cy="15.6" r="2.1" fill="${p.trim}"/><circle cx="37" cy="14.3" r="2.1" fill="${p.trim}"/>
            <path d="M40.6 14.6 q4 5 2.4 10" stroke="#2a2a3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
            <circle cx="43" cy="24.8" r="1.2" fill="${p.band}"/>`;
        const hat = color === 1 ? hatSong : hatJin;

        let inner;
        switch (k) {
            case 'K': { // 帅 / 将：斗篷 + 徽记 + 王冠
                const crown = color === 1
                    ? `<circle cx="30" cy="5.2" r="1.8" fill="#ffd56b"/>`
                    : `<path d="M25.5 5.8 L27.2 1.8 L30 4.8 L32.8 1.8 L34.5 5.8 Z" fill="#ffd56b" stroke="#b8860b" stroke-width="0.5"/>`;
                inner = `${sh}
                    <path d="M17 31.5 Q30 25.5 43 31.5 L47.5 56.5 Q30 62.5 12.5 56.5 Z" fill="${color === 1 ? '#8f1f1f' : '#1f2a45'}"/>
                    ${body}
                    <circle cx="30" cy="37.6" r="3.1" fill="${p.band}" stroke="${p.line}" stroke-width="0.7"/>
                    ${head('M26.4 27.6 Q30 30.4 33.6 27.6', false)}
                    ${hat}${crown}`;
                break;
            }
            case 'A': { // 仕 / 士：举剑 + 圆盾
                inner = `${sh}${body}
                    <path d="M39.5 36.5 Q46 33 48.6 25.5" stroke="${p.skin}" stroke-width="4.2" fill="none" stroke-linecap="round"/>
                    <g transform="rotate(-22 48.6 25.5)">
                        <rect x="46.9" y="8.5" width="3.4" height="16.5" rx="1.1" fill="${u('mtl')}"/>
                        <rect x="43.6" y="24.4" width="10" height="2.5" rx="1.2" fill="${p.band}"/>
                        <circle cx="48.6" cy="28.2" r="1.7" fill="${p.band}"/>
                    </g>
                    <path d="M20.5 36.5 Q14 35 12 39" stroke="${p.skin}" stroke-width="4.2" fill="none" stroke-linecap="round"/>
                    <circle cx="11" cy="42.5" r="5.4" fill="${p.cloth}" stroke="${p.trim}" stroke-width="1.3"/>
                    <circle cx="11" cy="42.5" r="1.5" fill="${p.trim}"/>
                    ${head('M26.4 27.4 Q30 30 33.6 27.4', false)}
                    ${hat}`;
                break;
            }
            case 'B': { // 相 / 象：宽袖道袍 + 双手推气功球（龟派气功预备式）
                inner = `${sh}
                    <path d="M19 32.5 Q30 29 41 32.5 L45.5 56 Q30 60.5 14.5 56 Z" fill="${u('robe')}"/>
                    <path d="M15 37 Q6.5 43 10 51.5 Q16.5 49.5 19.5 43.5 Z" fill="${u('robe')}" stroke="${p.line}" stroke-width="0.6"/>
                    <path d="M45 37 Q53.5 43 50 51.5 Q43.5 49.5 40.5 43.5 Z" fill="${u('robe')}" stroke="${p.line}" stroke-width="0.6"/>
                    <rect x="21.5" y="42.5" width="17" height="3.4" rx="1.7" fill="${p.trim}"/>
                    <circle cx="30" cy="44" r="8.2" fill="none" stroke="#5cc7ff" stroke-width="0.9" opacity="0.5"/>
                    <circle cx="30" cy="44" r="5.9" fill="${u('orb')}"/>
                    <circle cx="28" cy="42" r="1.9" fill="#fff" opacity="0.95"/>
                    ${head('M27 28.4 Q30 26.9 33 28.4', true)}
                    ${hat}`;
                break;
            }
            case 'R': { // 俥 / 車：开着小车的小人
                inner = `${sh}
                    <path d="M24 29.5 Q30 27 36 29.5 L38.5 40 H21.5 Z" fill="${u('robe')}"/>
                    ${head('M26.6 27.8 Q30 25.9 33.4 27.8', false)}
                    ${hat}
                    <rect x="10" y="40" width="40" height="13.5" rx="6" fill="${u('robe')}" stroke="${p.line}" stroke-width="1"/>
                    <rect x="13" y="42.6" width="34" height="3.6" rx="1.8" fill="${p.trim}" opacity="0.75"/>
                    <circle cx="19.5" cy="54.8" r="5.2" fill="#23232e"/><circle cx="19.5" cy="54.8" r="2" fill="#9aa2b5"/>
                    <circle cx="40.5" cy="54.8" r="5.2" fill="#23232e"/><circle cx="40.5" cy="54.8" r="2" fill="#9aa2b5"/>
                    <circle cx="50.6" cy="45.5" r="1.8" fill="#ffe08a"/>
                    <path d="M9.5 47 q-3.5 1.5 -6 -0.5" stroke="#cfd2e2" stroke-width="1.2" fill="none" opacity="0.65" stroke-linecap="round"/>`;
                break;
            }
            case 'H': { // 傌 / 馬：骑马小人
                inner = `${sh}
                    <ellipse cx="30" cy="46.5" rx="15" ry="8.2" fill="#a5713f"/>
                    <rect x="18.5" y="50" width="3.2" height="9" rx="1.5" fill="#8a5a2a"/>
                    <rect x="25.5" y="51.5" width="3.2" height="8" rx="1.5" fill="#8a5a2a"/>
                    <rect x="32" y="51.5" width="3.2" height="8" rx="1.5" fill="#8a5a2a"/>
                    <rect x="39" y="50" width="3.2" height="9" rx="1.5" fill="#8a5a2a"/>
                    <path d="M41.5 42.5 q7.5 -1.5 9 -8.5 q3.5 1 3.5 5.5 q-1.5 6 -8.5 7 z" fill="#a5713f"/>
                    <path d="M44.5 34.5 l1.5 -3.5 2.5 2.5 z" fill="#8a5a2a"/>
                    <circle cx="47.8" cy="38" r="1.1" fill="#1c1c28"/>
                    <path d="M40.5 40.5 q4 -4.5 8.5 -4.5" stroke="#5a3a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
                    <path d="M15.5 45 q-5 2 -4.5 8.5" stroke="#5a3a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
                    <path d="M24.5 31 Q30 28.5 35.5 31 L37.5 39.5 H22.5 Z" fill="${u('robe')}"/>
                    <path d="M34 33 Q42 36 44.5 40" stroke="${p.line}" stroke-width="1" fill="none"/>
                    ${head('M26.6 27.6 Q30 25.8 33.4 27.6', false)}
                    ${hat}`;
                break;
            }
            case 'C': { // 炮 / 砲：小炮 + 举火把的小人
                inner = `${sh}
                    <g transform="rotate(-16 42 36)">
                        <rect x="30" y="32.5" width="25" height="6.8" rx="3.2" fill="#3a3a48" stroke="#1c1c28" stroke-width="0.8"/>
                        <circle cx="54.6" cy="35.9" r="2.5" fill="#26262f"/>
                    </g>
                    <rect x="36" y="41" width="10" height="7" rx="2" fill="#5a4a6a"/>
                    <circle cx="38.5" cy="49.5" r="4.6" fill="#3a3a48"/><circle cx="38.5" cy="49.5" r="1.7" fill="#9aa2b5"/>
                    <path d="M17.5 33 Q23.5 30 29.5 33 L32.5 55.5 Q23.5 59.5 15 55.5 Z" fill="${u('robe')}"/>
                    <rect x="17.5" y="42.5" width="13" height="3.2" rx="1.6" fill="${p.trim}"/>
                    <path d="M28.5 36.5 Q33 36.5 35 32.5" stroke="${p.skin}" stroke-width="4" fill="none" stroke-linecap="round"/>
                    <rect x="33.9" y="23" width="2.2" height="10" rx="1.1" fill="${p.wood}"/>
                    <path d="M35 23 l2.2 -3.8 1.9 3.3 -2.7 1.5 z" fill="#ffd56b"/>
                    <circle cx="36.5" cy="18.4" r="1.1" fill="#fff3b0"/>
                    <g transform="translate(-3 0)">${head('M26.5 27.2 Q30 30.6 33.5 27.2', false)}</g>
                    <g transform="translate(-3 0)">${hat}</g>`;
                break;
            }
            default: { // 兵 / 卒：红缨枪小兵
                const spear = `<g transform="rotate(26 41 34)">
                    <rect x="39.6" y="8" width="2.5" height="44" rx="1.1" fill="${p.wood}"/>
                    <path d="M37.6 6.5 L40.8 1.2 L44 6.5 Z" fill="${u('mtl')}"/>
                    <circle cx="40.8" cy="8.4" r="2.1" fill="#e8483f"/>
                </g>`;
                const bandana = color === 1
                    ? `<path d="M19.8 16.2 Q30 10.2 40.2 16.2 L40.2 18.6 Q30 14.6 19.8 18.6 Z" fill="#c23b3b"/>
                       <path d="M40 17.4 q4 0.5 5 3.5" stroke="#c23b3b" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
                    : `<ellipse cx="30" cy="13.6" rx="9" ry="4.4" fill="${p.hat}"/>
                       <circle cx="25" cy="15.8" r="1.9" fill="${p.trim}"/><circle cx="35" cy="15.8" r="1.9" fill="${p.trim}"/>`;
                inner = `${sh}${body}
                    <path d="M38.5 36 q2.5 3 1 6.5" stroke="${p.skin}" stroke-width="3.8" fill="none" stroke-linecap="round"/>
                    ${spear}
                    ${head('M26.6 27.8 Q30 30.2 33.4 27.8', false)}
                    ${bandana}`;
            }
        }
        return `<svg viewBox="0 0 60 64" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${defs}${inner}</svg>`;
    }

    // 棋子背面（红黑同款，不泄露阵营信息）
    function back() {
        return `<svg viewBox="0 0 60 64" width="100%" height="100%">
            <defs><linearGradient id="bq-back" x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0" stop-color="#3a2c50"/><stop offset="1" stop-color="#221a34"/>
            </linearGradient></defs>
            <rect x="2.5" y="2.5" width="55" height="59" rx="9" fill="url(#bq-back)" stroke="#8a6d3b" stroke-width="1.8"/>
            <rect x="7.5" y="7.5" width="45" height="49" rx="5" fill="none" stroke="#6b5a8a" stroke-width="1" stroke-dasharray="3 2.5"/>
            <circle cx="30" cy="32" r="13.5" fill="none" stroke="#ffd56b" stroke-width="1.4" opacity="0.85"/>
            <circle cx="30" cy="32" r="10.5" fill="#ffd56b" opacity="0.12"/>
            <text x="30" y="36.8" text-anchor="middle" font-size="12.5" fill="#ffd56b" font-family="KaiTi, serif" font-weight="bold">棋</text>
            <circle cx="12" cy="12" r="1.3" fill="#ffd56b" opacity="0.6"/><circle cx="48" cy="12" r="1.3" fill="#ffd56b" opacity="0.6"/>
            <circle cx="12" cy="52" r="1.3" fill="#ffd56b" opacity="0.6"/><circle cx="48" cy="52" r="1.3" fill="#ffd56b" opacity="0.6"/>
        </svg>`;
    }

    return { kindOf, figure, back, PAL };
})();

MiniGames.banqi = {
    LEVELS: [
        { name: '初出茅庐', desc: '暗棋入门 · 认子阶段' }, { name: '棋摊学徒', desc: '熟悉棋子走法' },
        { name: '街头好手', desc: '开始算计' }, { name: '茶馆常客', desc: '中盘缠斗' },
        { name: '县城新锐', desc: '攻守兼备' }, { name: '府城名宿', desc: '老练布局' },
        { name: '棋社教头', desc: '试探虚实' }, { name: '京城乡试', desc: '稳扎稳打' },
        { name: '翰林待诏', desc: '算路深远' }, { name: '宫中伴驾', desc: '步步紧逼' },
        { name: '国手挑战', desc: '高手对决' }, { name: '南北擂台', desc: '擂台争锋' },
        { name: '棋坛盟主', desc: '盟主之争' }, { name: '御前圣战', desc: '御前决战' },
        { name: '暗棋圣手', desc: '终极一战' },
    ],
    ITEMS: [
        { id: 'peek', icon: '🔍', name: '透视镜', cost: 30,  desc: '偷看一枚暗子' },
        { id: 'wing', icon: '🪽', name: '羽翼',   cost: 80,  desc: '己方棋子飞到任意空格' },
        { id: 'soup', icon: '🍲', name: '大补粥', cost: 120, desc: '复活一枚被吃的己方棋子' },
    ],

    ENDLESS: { name: '∞ 无尽', desc: '挑战最强 AI（第15关），反复对战刷新战绩' },

    start(container, opts) {
        let alive = true;
        const api = { stop() { alive = false; } };
        const showSelect = () => {
            if (!alive) return;
            // 无尽模式入口（暗棋不走统一框架，自行提供 ∞ 按钮）
            const extra = MiniGames.banqi.ENDLESS
                ? [{ label: '∞ 无尽模式（挑战最强 AI，反复对战）', onClick: () => MG.rps(container, first => play(14, first, true)) }]
                : [];
            MG.levelSelect(container, {
                game: 'banqi', title: '暗棋圣手 · 15 关闯关',
                levels: this.LEVELS, extra,
                onStart: idx => MG.rps(container, first => play(idx, first)),
            });
        };
        const play = (levelIdx, first, endless) => {
            if (!alive) return;
            gameRound(container, opts, levelIdx + 1, first, api, showSelect, play, endless);
        };
        showSelect();
        return api;
    },
};

// 一局对弈（闭包，避免实例间状态串扰）
//   endless：无尽模式（挑战最强 AI 第15关），反复对战、记录是否击败最强 AI
function gameRound(container, opts, level, first, api, onBack, onReplay, endless) {
    const COLS = 8, ROWS = 4;
    const K = BQ_ART.kindOf;
    // 红方（宋国）：帥仕相俥傌炮兵；黑方（金国）：將士象車馬砲卒 —— 同 kind 等级相同
    const PIECES_RED = [
        ['帥', 7, 1], ['仕', 6, 2], ['仕', 6, 2], ['相', 5, 2], ['相', 5, 2], ['俥', 4, 2], ['俥', 4, 2],
        ['傌', 3, 2], ['傌', 3, 2], ['炮', 2, 2], ['炮', 2, 2], ['兵', 1, 5], ['兵', 1, 5], ['兵', 1, 5], ['兵', 1, 5], ['兵', 1, 5],
    ];
    const PIECES_BLK = [
        ['將', 7, 1], ['士', 6, 2], ['士', 6, 2], ['象', 5, 2], ['象', 5, 2], ['車', 4, 2], ['車', 4, 2],
        ['馬', 3, 2], ['馬', 3, 2], ['砲', 2, 2], ['砲', 2, 2], ['卒', 1, 5], ['卒', 1, 5], ['卒', 1, 5], ['卒', 1, 5], ['卒', 1, 5],
    ];

    // ---- 状态 ----
    let board, turn, sel = null, over = false, coins = 0, itemMode = null, lastAI = null, busy = false;
    let capturedMine = [];   // 我方被吃（供大补粥复活 / 底部托盘）
    let capturedAI = [];     // 我吃掉的敌子（顶部托盘）
    let stats = { flips: 0 };
    let idlePlies = 0;       // 连续无吃子的手数（持久战判定用）
    let totalPlies = 0;      // 总手数（防拉锯保险丝）
    let lastResultRef = null;
    const init = () => {
        const reds = PIECES_RED.map(([n, r]) => ({ n, r, color: 1 }));
        const blacks = PIECES_BLK.map(([n, r]) => ({ n, r, color: 2 }));
        const all = MG.shuffle([...reds, ...blacks]);
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
        let k = 0;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) board[i][j] = { ...all[k++], faceUp: false };
    };
    init();
    turn = first === 'player' ? 1 : 2;

    // ---- 规则 ----
    const inB = (i, j) => i >= 0 && i < ROWS && j >= 0 && j < COLS;
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const canCapAdj = (a, b) => {  // a 邻吃 b
        if (a.color === b.color) return false;
        if (K(a.n) === 'C') return false;                 // 炮不能邻吃
        if (K(a.n) === 'P' && K(b.n) === 'K') return true;  // 卒吃帅
        if (K(a.n) === 'K' && K(b.n) === 'P') return false; // 帅不能吃卒
        return a.r >= b.r;
    };
    const jumpTargets = (i, j) => {  // 炮的隔子跳吃目标（只能吃翻开的明子）
        const out = [];
        for (const [di, dj] of DIRS) {
            let x = i + di, y = j + dj, screened = false;
            while (inB(x, y)) {
                const p = board[x][y];
                if (p) {
                    if (!screened) screened = true;     // 第一枚 = 炮架（明暗皆可）
                    else { if (p.color !== board[i][j].color && p.faceUp) out.push([x, y]); break; }
                }
                x += di; y += dj;
            }
        }
        return out;
    };
    const legalMoves = color => {  // [{t:'flip'|'m', ...}]
        const ms = [];
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const p = board[i][j];
            if (!p) continue;
            if (!p.faceUp) { ms.push({ t: 'flip', i, j }); continue; }
            if (p.color !== color) continue;
            for (const [di, dj] of DIRS) {
                const x = i + di, y = j + dj;
                if (!inB(x, y)) continue;
                const q = board[x][y];
                if (!q) ms.push({ t: 'm', fi: i, fj: j, ti: x, tj: y });
                else if (q.faceUp && canCapAdj(p, q)) ms.push({ t: 'm', fi: i, fj: j, ti: x, tj: y });
            }
            if (K(p.n) === 'C') for (const [x, y] of jumpTargets(i, j)) ms.push({ t: 'm', fi: i, fj: j, ti: x, tj: y });
        }
        return ms;
    };
    const applyMove = m => {
        if (m.t === 'flip') { board[m.i][m.j].faceUp = true; stats.flips++; }
        else {
            const a = board[m.fi][m.fj], b = board[m.ti][m.tj];
            board[m.ti][m.tj] = a; board[m.fi][m.fj] = null;
            if (b) return b;   // 返回被吃子
        }
        return null;
    };
    const pieceCount = color => {
        let n = 0;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const p = board[i][j]; if (p && p.color === color) n++;
        }
        return n;
    };

    // ---- AI（难度 1-15 递增）----
    const aiDifficulty = level; // 1..15
    const evalCellDanger = (i, j, color) => {  // (i,j) 处 color 子被对方邻吃的风险
        const p = board[i][j]; if (!p) return 0;
        let risk = 0;
        for (const [di, dj] of DIRS) {
            const x = i + di, y = j + dj;
            if (!inB(x, y)) continue;
            const q = board[x][y];
            if (q && q.faceUp && q.color !== color && canCapAdj(q, p)) risk += p.r * 10 + 5;
        }
        return risk;
    };
    const scoreAI = m => {
        let s = 0;
        if (m.t === 'flip') {
            s = 6 + MG.ri(0, 3);
        } else {
            const a = board[m.fi][m.fj], b = board[m.ti][m.tj];
            if (b) {
                s += b.r * 12;
                if (K(b.n) === 'K') s += 10000;             // 吃帅直接赢
                if (b.color === 1) s += 3;                   // 略偏好主动进攻
            } else s += MG.ri(0, 2);
            // 落点安全 / 机会（虚拟落子后评估）
            const save = [board[m.fi][m.fj], board[m.ti][m.tj]];
            board[m.ti][m.tj] = a; board[m.fi][m.fj] = null;
            s -= evalCellDanger(m.ti, m.tj, 2) * 1.2;
            for (const [di, dj] of DIRS) {
                const x = m.ti + di, y = m.tj + dj;
                if (!inB(x, y)) continue;
                const q = board[x][y];
                if (q && q.faceUp && q.color === 1 && canCapAdj(a, q)) s += 8;      // 威胁敌方
                if (q && !q.faceUp) s += 2;                                          // 逼角暗子
            }
            if (K(a.n) === 'K') s -= 12;   // 帅少动
            board[m.fi][m.fj] = save[0]; board[m.ti][m.tj] = save[1];
        }
        // 高难度：考虑对手最佳回应（吃回）
        if (aiDifficulty >= 8 && m.t === 'm') {
            const save = [board[m.fi][m.fj], board[m.ti][m.tj]];
            board[m.ti][m.tj] = save[0]; board[m.fi][m.fj] = null;
            const replies = legalMoves(1).filter(r => r.t === 'm' && r.ti === m.ti && r.tj === m.tj && board[r.fi][r.fj]);
            let worst = 0;
            for (const r of replies) {
                const victim = board[r.ti][r.tj];
                const v = victim ? (K(victim.n) === 'K' ? 10000 : victim.r * 12) : 0;
                if (v > worst) worst = v;
            }
            s -= worst * 0.85;
            board[m.fi][m.fj] = save[0]; board[m.ti][m.tj] = save[1];
        }
        return s;
    };
    const aiTurn = () => {
        if (over || turn !== 2) return;
        const ms = legalMoves(2);
        if (!ms.length) return finish(true, '对方无子可动');
        let m;
        const randChance = Math.max(0, 0.45 - aiDifficulty * 0.03);
        if (Math.random() < randChance) {
            m = MG.pick(ms);
        } else {
            let best = -Infinity;
            const noise = Math.max(1, 8 - aiDifficulty * 0.5);
            for (const x of ms) {
                const sc = scoreAI(x) + MG.ri(0, noise);
                if (sc > best) { best = sc; m = x; }
            }
        }
        performMove(m, victim => {
            lastAI = m;
            totalPlies++;
            idlePlies = victim ? 0 : idlePlies + 1;
            if (victim && victim.color === 1) {
                capturedMine.push(victim);
                if (K(victim.n) === 'K') return finish(false, '你的主将被吃了');
            }
            turn = 1; render();
            afterTurnChecks();
        });
    };

    // ---- 持久战判定：连续 50 手无吃子 → 按子力判胜负，避免避战死循环 ----
    const materialSum = color => {
        let s = 0;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const p = board[i][j]; if (p && p.color === color) s += p.r;
        }
        return s;
    };

    // ---- 胜负判定 ----
    const finish = (win, reason) => {
        if (over) return;
        over = true;
        lastResultRef = { win, reason };
        const mine = pieceCount(1);
        const stars = win ? (mine >= 5 ? 3 : mine >= 3 ? 2 : 1) : 0;
        if (win) MG.recordStars('banqi', level, stars);
        if (endless) {
            // 无尽模式：记录「是否击败最强 AI」战绩，重试继续打第15关
            MG.setBest('banqi', win ? 1 : 0);
            const best = MG.getBest('banqi');
            MG.result(container, {
                win, stars: win ? 3 : 0,
                title: win ? '👑 击败最强 AI！' : '💥 挑战失败',
                lines: [
                    reason || '',
                    `我方剩余棋子 ${mine} 枚 · 本局金币 🪙${coins}`,
                    `🏅 无尽最高战绩：${best ? '已击败最强 AI' : '尚未击败'}`,
                ].filter(Boolean),
                hasNext: false,
                onRetry: () => { gameRound(container, opts, level, first, api, onBack, onReplay, true); },
                onBack,
            });
            render();
            return;
        }
        MG.result(container, {
            win, stars,
            title: win ? (level >= 15 ? '👑 暗棋圣手！' : `🏆 第 ${level} 关通过`) : '💥 挑战失败',
            lines: [
                reason || '',
                `我方剩余棋子 ${mine} 枚 · 本局金币 🪙${coins}`,
                win && stars < 3 ? '剩 5 枚以上棋子可得 ★★★' : '',
                win && level >= 15 ? '你已通关全部 15 关，成为真正的暗棋圣手！' : '',
            ].filter(Boolean),
            hasNext: win && level < 15,
            onRetry: () => { gameRound(container, opts, level, first, api, onBack, onReplay); },
            onNext: () => { gameRound(container, opts, level + 1, 'player', api, onBack, onReplay); },
            onBack,
        });
        render();
    };
    const afterTurnChecks = () => {
        if (over) return;
        // 持久战判定：30 手无交战或总手数超 300 → 子力定胜负，杜绝避战死循环
        if (idlePlies >= 30 || totalPlies >= 300) {
            const a = materialSum(1), b = materialSum(2);
            const why = idlePlies >= 30 ? '长期无交战' : '鏖战超 150 回合';
            return finish(a >= b, a >= b ? `${why} · 子力判定你获胜` : `${why} · 子力判定电脑获胜`);
        }
        if (turn === 1) {
            if (!pieceCount(2)) return finish(true, '敌方全军覆没');
            if (!legalMoves(1).length) return finish(false, '你无子可动');
        } else {
            if (!pieceCount(1)) return finish(false, '我方全军覆没');
            setTimeout(() => { if (!over && apiAlive) aiTurn(); }, 700);
        }
    };
    let apiAlive = true;
    const origStop = api.stop;
    api.stop = function () { apiAlive = false; origStop(); };

    // ================= DOM 棋盘（宋金小人 + 必杀技动画）=================
    const wrap = document.createElement('div');
    wrap.className = 'bq-wrap';
    const mkBanner = (flagCls, flagChar, sideText) => {
        const b = document.createElement('div');
        b.className = 'bq-banner';
        b.innerHTML = `<span class="bq-flag ${flagCls}">${flagChar}</span><span class="bq-side">${sideText}</span>`;
        return b;
    };
    const bannerTop = mkBanner('f2', '金', `金国 · 第 ${level} 关`);
    const bannerBottom = mkBanner('f1', '宋', '宋国 · 你');
    const trayTop = document.createElement('div'); trayTop.className = 'bq-tray';
    const trayBottom = document.createElement('div'); trayBottom.className = 'bq-tray';
    bannerTop.appendChild(trayTop);
    bannerBottom.appendChild(trayBottom);
    const boardEl = document.createElement('div');
    boardEl.className = 'bq-board';
    const piecesEl = document.createElement('div'); piecesEl.className = 'bq-pieces';
    const fxEl = document.createElement('div'); fxEl.className = 'bq-fx';
    const tip = document.createElement('div');
    tip.className = 'bq-tip';
    tip.textContent = '点暗子翻开 · 点己方子选中，邻格移动/吃子 · 炮隔一子跳吃明子';
    container.innerHTML = '';
    wrap.appendChild(bannerTop);
    wrap.appendChild(boardEl);
    wrap.appendChild(bannerBottom);
    wrap.appendChild(tip);
    container.appendChild(wrap);

    const cells = [];
    for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
        const c = document.createElement('div');
        c.className = 'bq-cell' + ((i + j) % 2 ? ' alt' : '');
        c.style.left = (j * 12.5) + '%';
        c.style.top = (i * 25) + '%';
        c.onclick = () => onTap(i, j);
        boardEl.appendChild(c);
        cells.push(c);
    }
    boardEl.appendChild(piecesEl);
    boardEl.appendChild(fxEl);

    const makePieceEl = p => {
        const el = document.createElement('div');
        el.className = 'bq-piece down';
        const fw = document.createElement('div');
        fw.className = 'bq-flipwrap';
        const face = document.createElement('div');
        face.className = 'bq-face';
        face.innerHTML = BQ_ART.figure(p.n, p.color);
        const tag = document.createElement('div');
        tag.className = 'bq-tag ' + (p.color === 1 ? 't1' : 't2');
        tag.textContent = p.n;
        face.appendChild(tag);
        const backEl = document.createElement('div');
        backEl.className = 'bq-back';
        backEl.innerHTML = BQ_ART.back();
        fw.appendChild(face); fw.appendChild(backEl);
        el.appendChild(fw);
        piecesEl.appendChild(el);
        return el;
    };
    const posOf = (el, i, j) => { el.style.left = (j * 12.5) + '%'; el.style.top = (i * 25) + '%'; };
    const placePiece = (p, i, j) => {
        const el = p.el || (p.el = makePieceEl(p));
        if (!el._placed) {
            el.style.transition = 'none';   // 初始摆位不做位移动画
            posOf(el, i, j);
            el._placed = true;
            setTimeout(() => { el.style.transition = ''; }, 60);
        } else posOf(el, i, j);
        el.classList.toggle('down', !p.faceUp);
    };

    const render = () => {
        // 格子高亮：选中 / AI 落点 / 炮跳吃提示
        cells.forEach((c, idx) => {
            const i = idx >> 3, j = idx & 7;
            const isSel = sel && sel[0] === i && sel[1] === j;
            const isLast = lastAI && ((lastAI.t === 'flip' && lastAI.i === i && lastAI.j === j) ||
                (lastAI.t === 'm' && lastAI.ti === i && lastAI.tj === j));
            let jump = false;
            if (sel) {
                const p = board[sel[0]][sel[1]];
                if (p && K(p.n) === 'C') jump = jumpTargets(sel[0], sel[1]).some(([x, y]) => x === i && y === j);
            }
            c.classList.toggle('bq-sel', !!isSel);
            c.classList.toggle('bq-last', !!isLast);
            c.classList.toggle('bq-jump', jump);
        });
        // 棋子
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            const p = board[i][j];
            if (p) {
                placePiece(p, i, j);
                if (sel && sel[0] === i && sel[1] === j) p.el.classList.add('sel');
                else if (p.el) p.el.classList.remove('sel');
            }
        }
        renderTrays();
    };
    const miniHTML = p => `<div class="bq-mini" title="${p.n}">${BQ_ART.figure(p.n, p.color)}</div>`;
    const renderTrays = () => {
        trayTop.innerHTML = capturedAI.map(miniHTML).join('');       // 我吃掉的金国子
        trayBottom.innerHTML = capturedMine.map(miniHTML).join('');  // 我被吃的宋国子
    };

    // ---- 特效层工具 ----
    const rectOf = el => (el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 400, height: 300 });
    const cellPx = (i, j) => {
        const r = rectOf(boardEl);
        return { x: (j + 0.5) / COLS * r.width, y: (i + 0.5) / ROWS * r.height };
    };
    const fxAdd = (html, cls, x, y) => {
        const d = document.createElement('div');
        d.className = cls;
        d.style.left = x + 'px';
        d.style.top = y + 'px';
        if (html) d.innerHTML = html;
        fxEl.appendChild(d);
        setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 900);
        return d;
    };
    const word = (txt, x, y) => fxAdd(txt, 'bq-word', x, y - 10);
    const burst = (x, y, color) => {
        for (let k = 0; k < 7; k++) {
            const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 24;
            const pt = fxAdd('', 'bq-pt', x, y);
            pt.style.background = color || '#ffd56b';
            if (pt.style.setProperty) {
                pt.style.setProperty('--dx', Math.cos(a) * d + 'px');
                pt.style.setProperty('--dy', Math.sin(a) * d + 'px');
            }
        }
    };
    const dust = (x, y) => {
        for (let k = 0; k < 3; k++) fxAdd('', 'bq-dust', x + MG.ri(-8, 8), y + MG.ri(-4, 6));
    };

    // ---- 必杀技时间轴 ----
    const ATK = {
        K: { word: '威!!', die: 'bq-kneel' },   // 帅：王者威压，敌子跪地
        A: { word: '唰!', die: 'bq-die' },      // 仕：拔剑砍
        B: { word: '波!!', die: 'bq-die' },     // 相：龟派气功
        R: { word: '嘀嘀!', die: 'bq-squash' }, // 俥：开车碾压，敌子压扁
        H: { word: '咴!', die: 'bq-fly' },      // 傌：骑马冲锋，敌子撞飞
        C: { word: '轟!', die: 'bq-die' },      // 炮：开炮轰击
        P: { word: '戳!', die: 'bq-die' },      // 兵：红缨枪突刺
    };
    const attackAnim = (attacker, victim, m, cb) => {
        const k = K(attacker.n), cfg = ATK[k] || ATK.P;
        const A = cellPx(m.fi, m.fj), B = cellPx(m.ti, m.tj);
        const aEl = attacker.el, vEl = victim.el;
        if (aEl) { aEl.style.zIndex = 20; aEl.classList.add('bq-windup'); }
        const ang = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
        // T1=170ms：出手
        setTimeout(() => {
            if (aEl) aEl.classList.remove('bq-windup');
            if (k === 'B') {            // 相：龟派气功 → 蓝白光束
                const beam = fxAdd('', 'bq-beam', A.x, A.y);
                beam.style.width = Math.hypot(B.x - A.x, B.y - A.y) + 'px';
                if (beam.style.setProperty) beam.style.setProperty('--ang', ang + 'deg');
                if (aEl) aEl.classList.add('bq-kame');
            } else if (k === 'C') {     // 炮：炮口火光 + 弹丸飞行
                const rad = ang * Math.PI / 180;
                fxAdd('', 'bq-flash', A.x + Math.cos(rad) * 16, A.y + Math.sin(rad) * 16);
                const ball = fxAdd('', 'bq-ball', A.x, A.y);
                setTimeout(() => { ball.style.left = B.x + 'px'; ball.style.top = B.y + 'px'; }, 30);
            } else if (k === 'A') {     // 仕：剑光斩击
                fxAdd('', 'bq-slash', B.x, B.y);
                if (aEl) aEl.classList.add('bq-strike');
            } else if (k === 'K') {     // 帅：金色威压冲击波
                fxAdd('', 'bq-wave', A.x, A.y);
                if (aEl) aEl.classList.add('bq-strike');
            } else if (k === 'P') {     // 兵：枪尖星芒
                fxAdd('', 'bq-poke', B.x, B.y);
                if (aEl) aEl.classList.add('bq-strike');
            } else if (k === 'R') {     // 俥：小人开车冲过去（尘土飞扬）
                if (aEl) { aEl.classList.add('bq-drive'); posOf(aEl, m.ti, m.tj); }
                dust(A.x, A.y);
            } else if (k === 'H') {     // 傌：骑马冲锋
                if (aEl) { aEl.classList.add('bq-gallop'); posOf(aEl, m.ti, m.tj); }
            }
            word(cfg.word, B.x, B.y);
            if (vEl) vEl.classList.add('bq-hit');
        }, 170);
        // T2=340ms：命中结算（敌子阵亡表现 + 爆炸）
        setTimeout(() => {
            if (vEl) {
                vEl.classList.remove('bq-hit');
                vEl.classList.add(cfg.die);
            }
            if (k === 'C') fxAdd('', 'bq-boom', B.x, B.y);
            burst(B.x, B.y, k === 'B' ? '#7ad0ff' : '#ffd56b');
        }, 340);
        // 其他兵种：命中后攻击方滑进目标格
        if (aEl && k !== 'R' && k !== 'H') setTimeout(() => posOf(aEl, m.ti, m.tj), 330);
        // T3=820ms：收尾
        setTimeout(() => {
            if (vEl && vEl.parentNode) vEl.parentNode.removeChild(vEl);
            if (aEl) { aEl.style.zIndex = ''; aEl.classList.remove('bq-kame', 'bq-strike', 'bq-drive', 'bq-gallop'); }
            render();
            cb();
        }, 820);
    };
    const slideAnim = (p, m, cb) => {
        if (p.el) { p.el.style.zIndex = 8; p.el.classList.add('bq-slide'); posOf(p.el, m.ti, m.tj); }
        setTimeout(() => {
            if (p.el) { p.el.classList.remove('bq-slide'); p.el.style.zIndex = ''; }
            cb();
        }, 300);
    };
    const flipAnim = (p, cb) => {
        if (p.el) p.el.classList.remove('down');   // CSS 3D 翻牌
        setTimeout(cb, 340);
    };
    // 统一走子入口：先改棋盘逻辑，再放动画，动画结束回调继续回合流程
    const performMove = (m, done) => {
        busy = true;
        try { MG.audio.unlock(); } catch (e) {}
        if (m.t === 'flip') {
            applyMove(m);
            try { MG.audio.sfx('click'); } catch (e) {}
            flipAnim(board[m.i][m.j], () => { busy = false; done && done(null); });
        } else {
            const victim = applyMove(m);
            const attacker = board[m.ti][m.tj];
            try { MG.audio.sfx(victim ? 'target' : 'click'); } catch (e) {}
            if (victim) attackAnim(attacker, victim, m, () => { busy = false; done && done(victim); });
            else slideAnim(attacker, m, () => { busy = false; done && done(null); });
        }
    };

    // ---- 道具 ----
    const itembar = document.createElement('div');
    itembar.className = 'mg-itembar';
    const renderItems = () => {
        itembar.innerHTML = `<span class="mg-coins">🪙 ${coins}</span>` + MiniGames.banqi.ITEMS.map(it => {
            const ok = coins >= it.cost;
            return `<button class="mg-item ${ok ? '' : 'off'} ${itemMode === it.id ? 'armed' : ''}"
                data-item="${it.id}" title="${it.desc}">${it.icon}${it.name} <b>${it.cost}</b></button>`;
        }).join('');
        itembar.querySelectorAll('[data-item]').forEach(b => b.onclick = () => {
            const it = MiniGames.banqi.ITEMS.find(x => x.id === b.dataset.item);
            if (coins < it.cost || over || turn !== 1 || busy) return;
            if (it.id === 'soup') {   // 立即生效：复活最强被吃子
                if (!capturedMine.length) return flashHint('没有可复活的棋子');
                coins -= it.cost;
                const best = capturedMine.sort((a, b2) => b2.r - a.r)[0];
                capturedMine = capturedMine.filter(x => x !== best);
                const empties = [];
                for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) if (!board[i][j]) empties.push([i, j]);
                const [x, y] = MG.pick(empties);
                board[x][y] = { ...best, faceUp: true, el: null };
                itemMode = null; renderItems(); render();
                const c0 = cellPx(x, y);
                fxAdd('✨', 'bq-word', c0.x, c0.y);
                flashHint(`🍲 大补粥复活了 ${best.n}！`);
                return;
            }
            itemMode = itemMode === it.id ? null : it.id;
            sel = null;
            renderItems(); render();
            flashHint(itemMode ? `${it.icon}${it.name}已启用：` + (it.id === 'peek' ? '点击一枚暗子查看' : '先点己方棋子，再点任意空格') : '');
        });
    };
    const flashHint = t => { opts.onScore && opts.onScore(t); };
    container.appendChild(itembar);
    renderItems();

    // ---- 玩家交互 ----
    const onTap = (i, j) => {
        if (over || busy || turn !== 1) return;
        if (!inB(i, j)) return;
        const cur = board[i][j];
        // 道具模式
        if (itemMode === 'peek') {
            if (cur && !cur.faceUp) {
                coins -= 30; cur.faceUp = true; itemMode = null;
                renderItems(); render(); flashHint(`🔍 傍观：这是一枚「${cur.n}」`);
            }
            return;
        }
        if (itemMode === 'wing') {
            if (cur && cur.faceUp && cur.color === 1) { sel = [i, j]; render(); return; }
            if (!cur && sel) {
                board[i][j] = board[sel[0]][sel[1]]; board[sel[0]][sel[1]] = null;
                coins -= 80; itemMode = null; sel = null;
                renderItems(); render(); flashHint('🪽 羽翼飞行成功（不消耗步数）');
            }
            return;
        }
        if (!sel) {
            if (cur && cur.faceUp && cur.color === 1) { sel = [i, j]; }
            else if (cur && !cur.faceUp) {
                performMove({ t: 'flip', i, j }, () => {
                    idlePlies = 0; totalPlies++;
                    turn = 2; render(); afterTurnChecks();
                });
                return;
            }
            render(); return;
        }
        const a = board[sel[0]][sel[1]];
        if (sel[0] === i && sel[1] === j) { sel = null; render(); return; }
        if (cur && cur.faceUp && cur.color === 1) { sel = [i, j]; render(); return; }
        // 移动 / 吃子
        const adj = DIRS.some(([di, dj]) => sel[0] + di === i && sel[1] + dj === j);
        let ok = false;
        if (adj && !cur) ok = true;
        else if (adj && cur && cur.faceUp && canCapAdj(a, cur)) ok = true;
        else if (K(a.n) === 'C' && cur && cur.faceUp && jumpTargets(sel[0], sel[1]).some(([x, y]) => x === i && y === j)) ok = true;
        if (ok) {
            performMove({ t: 'm', fi: sel[0], fj: sel[1], ti: i, tj: j }, victim => {
                totalPlies++;
                idlePlies = victim ? 0 : idlePlies + 1;
                if (victim) {
                    coins += victim.r * 10;
                    capturedAI.push(victim);
                    if (K(victim.n) === 'K') { renderItems(); render(); return finish(true, '你吃掉了敌方主将！'); }
                }
                sel = null; turn = 2;
                renderItems(); render(); afterTurnChecks();
            });
        } else { sel = null; render(); }
    };

    render();
    const lvlName = MiniGames.banqi.LEVELS[level - 1].name;
    opts.onScore && opts.onScore(`第 ${level} 关 · ${lvlName} · ${turn === 1 ? '🟢 你先行' : '🔴 电脑先行'}`);
    if (turn === 2) afterTurnChecks();
    // 测试钩子（仅测试模式）
    if (typeof window !== 'undefined' && window.__MG_TEST) {
        window.__banqi = {
            get board() { return board; }, get turn() { return turn; }, get over() { return over; },
            get idlePlies() { return idlePlies; }, get lastResult() { return lastResultRef; },
            legalMoves, applyMove, aiTurn, afterTurnChecks, finish,
            tap: (i, j) => onTap(i, j),
        };
    }
}
