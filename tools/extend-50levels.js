/* 批量把 18 个手写游戏的 LEVELS / PARAMS 扩到 50
 *   node tools/extend-50levels.js
 *
 * 处理三种结构：
 *   A) LEVELS+PARAMS（gomoku/snake/tetris/piano/breakout/jump/shooter/xiangqi）
 *   B) data-in-LEVELS（match3/link/hanoi）
 *   C) name-only（slide15/bulls/mole/mine/memory/reaction/sudoku6）
 *
 * 修复要点：
 *   - 保留开头 [ 与缩进，不在 replace 时丢失
 *   - 保留每行末尾的逗号（最后一条不加逗号）
 *   - 保留 PARAMS 数组原始 [n, n, n] 格式
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'public', 'js', 'minigames');

const TAIL = ['化境','绝顶','通天','御虚','破界','入圣','不灭','永劫','归元','神化',
              '霸者','绝响','傲视','凌霄','破晓','风暴','雷霆','烈火','寒冰','圣光',
              '暗影','轮回','涅槃','归一','永恒','不朽','鸿蒙','太初','无极','归墟'];

// ===== A) LEVELS+PARAMS 模式 =====
function extendParamsFile(file) {
    let src = fs.readFileSync(file, 'utf8');

    // 1) 找 LEVELS 数组（保留括号）
    const lvRe = /(\bLEVELS:\s*)\[([\s\S]*?)\n(\s{4,})\],?(\s*\n)/;
    const lvMatch = src.match(lvRe);
    if (!lvMatch) throw new Error(file + ' 未找到 LEVELS [...]');
    const lvBody = lvMatch[2];
    const lvIndent = lvMatch[3];

    // 解析每条 level
    const lvItems = [];
    const itemRe = /\{([^{}]*)\}/g;
    let m;
    while ((m = itemRe.exec(lvBody)) !== null) {
        const inner = m[1];
        const nameM = inner.match(/name:\s*['"]([^'"]+)['"]/);
        if (!nameM) continue;
        const descM = inner.match(/desc:\s*['"]([^'"]*)['"]/);
        lvItems.push({ name: nameM[1], desc: descM ? descM[1] : '' });
    }
    if (lvItems.length < 5) throw new Error(file + ' LEVELS 解析失败 ' + lvItems.length);

    // 2) 找 PARAMS 数组（可选）
    const prRe = /(\bPARAMS:\s*)\[([\s\S]*?)\n(\s{4,})\],?(\s*\n)/;
    const prMatch = src.match(prRe);

    // 3) 构造新 LEVELS 内容
    const lvExtras = [];
    for (let i = lvItems.length; i < 50; i++) {
        lvExtras.push({ name: TAIL[i - 20], desc: lvItems[lvItems.length - 1].desc || '' });
    }
    const newLvItems = lvItems.concat(lvExtras);
    const lvLines = newLvItems.map((it, i) => {
        const isLast = i === newLvItems.length - 1;
        return `${lvIndent}{ name: '${it.name}'${it.desc ? `, desc: '${it.desc}'` : ''} }${isLast ? '' : ','}`;
    });
    const newLvBlock = lvMatch[1] + '[\n' + lvLines.join('\n') + '\n' + lvIndent + ']' + lvMatch[4];

    // 4) 构造新 PARAMS（如有）
    let newPrBlock = null;
    if (prMatch) {
        const prBody = prMatch[2];
        const prIndent = prMatch[3];
        // 解析每行 [a, b, c]
        const prItems = [];
        const arrRe = /\[([^\]]+)\]/g;
        while ((m = arrRe.exec(prBody)) !== null) {
            prItems.push(m[1].split(',').map(s => s.trim()));
        }
        if (prItems.length < 5) throw new Error(file + ' PARAMS 解析失败 ' + prItems.length);
        const last = prItems[prItems.length - 1];
        const prev = prItems[prItems.length - 6];
        const extraParams = [];
        for (let i = prItems.length; i < 50; i++) {
            const row = [];
            for (let k = 0; k < last.length; k++) {
                const a = parseFloat(last[k]);
                const b = parseFloat(prev[k]);
                if (Number.isFinite(a) && Number.isFinite(b)) {
                    const step = (a - b) / 5;
                    let v = a + step * (i - (prItems.length - 1) - 1);
                    if (v < 0) v = 0;
                    row.push((v % 1 === 0) ? v.toFixed(0) : v.toFixed(2));
                } else {
                    row.push(last[k]);
                }
            }
            extraParams.push(row);
        }
        const newPrItems = prItems.concat(extraParams);
        const prLines = newPrItems.map((row, i) => {
            const isLast = i === newPrItems.length - 1;
            return `${prIndent}[${row.join(', ')}]${isLast ? '' : ','}`;
        });
        newPrBlock = prMatch[1] + '[\n' + prLines.join('\n') + '\n' + prIndent + ']' + prMatch[4];
    }

    // 5) 替换（先 PARAMS 再 LEVELS，避免互相干扰）
    if (newPrBlock) src = src.replace(prMatch[0], newPrBlock);
    src = src.replace(lvMatch[0], newLvBlock);
    fs.writeFileSync(file, src);
    return { lv: newLvItems.length, pr: prMatch ? (newLvItems.length) : 'n/a' };
}

// ===== B) data-in-LEVELS 模式（match3/link/hanoi） =====
function extendDataFile(file) {
    let src = fs.readFileSync(file, 'utf8');
    const lvRe = /(\bLEVELS:\s*)\[([\s\S]*?)\n(\s{4,})\],?(\s*\n)/;
    const lvMatch = src.match(lvRe);
    if (!lvMatch) throw new Error(file + ' 未找到 LEVELS');
    const lvBody = lvMatch[2];
    const lvIndent = lvMatch[3];

    // 递归解析 { ... }（最多一层嵌套：quotas 对象）
    const items = [];
    let i = 0;
    while (i < lvBody.length) {
        // 找下一个 {
        const start = lvBody.indexOf('{', i);
        if (start < 0) break;
        // 平衡匹配
        let depth = 1, j = start + 1;
        while (j < lvBody.length && depth > 0) {
            const ch = lvBody[j];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            j++;
        }
        if (depth !== 0) break;
        const inner = lvBody.slice(start + 1, j - 1);
        const nameM = inner.match(/name:\s*['"]([^'"]*)['"]/);
        if (!nameM) { i = j; continue; }
        const obj = { name: nameM[1] };
        const descM = inner.match(/desc:\s*['"]([^'"]*)['"]/);
        if (descM) obj.desc = descM[1];
        const numRe = /(\w+):\s*(-?\d+(?:\.\d+)?)/g;
        let nm;
        while ((nm = numRe.exec(inner)) !== null) {
            if (nm[1] !== 'name') obj[nm[1]] = parseFloat(nm[2]);
        }
        const strRe = /(\w+):\s*['"]([^'"]*)['"]/g;
        let sm;
        while ((sm = strRe.exec(inner)) !== null) {
            if (sm[1] !== 'name' && sm[1] !== 'desc') obj[sm[1]] = sm[2];
        }
        const qM = inner.match(/quotas:\s*\{([^}]+)\}/);
        if (qM) {
            const q = {};
            qM[1].split(',').forEach(pair => {
                const [k, v] = pair.split(':').map(s => s.trim());
                if (k != null && v != null) q[k] = parseFloat(v);
            });
            obj.quotas = q;
        }
        items.push(obj);
        i = j;
    }
    if (items.length < 5) throw new Error(file + ' LEVELS 解析失败 ' + items.length);

    const last = items[items.length - 1];
    const prev = items[items.length - 6];
    const extras = [];
    for (let i = 20; i < 50; i++) {
        const ext = { name: TAIL[i - 20] };
        for (const k of Object.keys(last)) {
            if (k === 'name') continue;
            if (typeof last[k] === 'number') {
                const step = (typeof prev[k] === 'number') ? (last[k] - prev[k]) / 5 : last[k] * 0.08;
                ext[k] = Math.max(1, Math.round(last[k] + step * (i - 19)));
            } else if (k === 'quotas' && last[k]) {
                const q = {};
                Object.keys(last[k]).forEach(c => q[c] = Math.round(last[k][c] * (1 + (i - 19) * 0.08)));
                ext.quotas = q;
            } else if (typeof last[k] === 'string') {
                ext[k] = last[k];
            }
        }
        extras.push(ext);
    }
    const newItems = items.concat(extras);
    const fmtItem = it => {
        const parts = [`name: '${it.name}'`];
        Object.keys(it).forEach(k => {
            if (k === 'name') return;
            if (typeof it[k] === 'number') parts.push(`${k}: ${it[k]}`);
            else if (typeof it[k] === 'string') parts.push(`${k}: '${it[k]}'`);
            else if (it[k] && typeof it[k] === 'object') {
                const q = Object.keys(it[k]).map(c => `${c}:${it[k][c]}`).join(', ');
                parts.push(`${k}: { ${q} }`);
            }
        });
        return '{ ' + parts.join(', ') + ' }';
    };
    const lvLines = newItems.map((it, i) => lvIndent + fmtItem(it) + (i === newItems.length - 1 ? '' : ','));
    const newLvBlock = lvMatch[1] + '[\n' + lvLines.join('\n') + '\n' + lvIndent + ']' + lvMatch[4];
    src = src.replace(lvMatch[0], newLvBlock);
    fs.writeFileSync(file, src);
    return newItems.length;
}

// 特殊：memory 当前只有 10 关，先用 extendParamsFile 简单补 10 个，再扩到 50
function extendMemoryFirst(file) {
    let src = fs.readFileSync(file, 'utf8');
    const lvRe = /(\bLEVELS:\s*)\[([\s\S]*?)\n(\s{4,})\],?(\s*\n)/;
    const m = src.match(lvRe);
    if (!m) throw new Error('memory LEVELS not found');
    const lvIndent = m[3];
    // 在 ] 前插入 10 条（10..20）
    const extras = [];
    for (let i = 10; i < 20; i++) {
        extras.push(`${lvIndent}{ name: '${TAIL[i - 10]}', desc: '' }`);
    }
    const newBody = m[2] + '\n' + extras.join(',\n') + ',\n';
    src = src.replace(m[0], m[1] + '[' + newBody + m[3] + ']' + m[4]);
    fs.writeFileSync(file, src);
}

// ===== 处理列表 =====
const PARAMS_GAMES = ['gomoku', 'snake', 'tetris', 'piano', 'breakout', 'jump', 'shooter', 'xiangqi'];
const DATA_GAMES = ['match3', 'link', 'hanoi'];
const NAME_GAMES = ['slide15', 'bulls', 'mole', 'mine', 'reaction', 'sudoku6'];

// 备份
fs.mkdirSync(path.join(__dirname, 'backup-pre-50levels-2'), { recursive: true });
const stamp = Date.now();
for (const g of [...PARAMS_GAMES, ...DATA_GAMES, ...NAME_GAMES, 'memory']) {
    const src = path.join(BASE, g + '.js');
    const dst = path.join(__dirname, 'backup-pre-50levels-2', `${g}-${stamp}.js`);
    fs.copyFileSync(src, dst);
}
console.log('备份完成 → tools/backup-pre-50levels-2');

// memory 先补到 20
extendMemoryFirst(path.join(BASE, 'memory.js'));
console.log('memory: 10→20');

// 处理 PARAMS 模式（8 个）
console.log('\n--- PARAMS 模式（8 个） ---');
for (const g of PARAMS_GAMES) {
    try {
        const r = extendParamsFile(path.join(BASE, g + '.js'));
        console.log(`${g.padEnd(10)} LEVELS=${r.lv} PARAMS=${r.pr}`);
    } catch (e) { console.error(`${g}: ✗ ${e.message}`); }
}

// 处理 data-in-LEVELS（3 个）
console.log('\n--- data-in-LEVELS（3 个） ---');
for (const g of DATA_GAMES) {
    try {
        const n = extendDataFile(path.join(BASE, g + '.js'));
        console.log(`${g.padEnd(10)} LEVELS=${n}`);
    } catch (e) { console.error(`${g}: ✗ ${e.message}`); }
}

// 处理 name-only（6 个 + memory）
console.log('\n--- name-only（7 个） ---');
for (const g of [...NAME_GAMES, 'memory']) {
    try {
        const r = extendParamsFile(path.join(BASE, g + '.js'));
        console.log(`${g.padEnd(10)} LEVELS=${r.lv} PARAMS=${r.pr}`);
    } catch (e) { console.error(`${g}: ✗ ${e.message}`); }
}

console.log('\n✓ 完成');