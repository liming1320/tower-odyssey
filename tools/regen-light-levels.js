// 重新提取智慧之光全部 140 关（原生分派表 RVA 0x1c30240），保留现有 20 段演示与元数据。
// 每一步都复用 extract-pk32-light.js 已验证的原生读取逻辑，并对每个关卡套用核心解码器确认可解析。
const fs = require('fs');
const path = require('path');
const core = require(path.join(__dirname, '..', 'public', 'js', 'minigames', 'pk32-light-core.js'));

const moduleBin = path.join(__dirname, '..', 'output', 'pk32-reference', 'module.bin');
const image = fs.readFileSync(moduleBin);
const base = 0x400000, table = 0x1c30240;

const levels = [];
const invalid = [];
for (let i = 0; i < 140; i += 1) {
    try {
        const target = image.readUInt32LE(table + i * 4) - base;
        if (image[target] !== 0xba) throw new Error('invalid native board case ' + i);
        const pointer = image.readUInt32LE(target + 1) - base;
        const bytes = image.readUInt32LE(pointer - 4);
        const cells = image.subarray(pointer, pointer + bytes).toString('utf16le');
        const width = Number(cells.slice(0, 2)), height = Number(cells.slice(2, 4));
        if (!width || !height || cells.length !== 4 + width * height * 2) throw new Error('invalid board ' + i);
        const level = { number: i + 1, offset: pointer, width, height, cells };
        // 核心解码器确认可解析（不抛异常即视为有效）
        core.decodeLevel(level);
        levels.push(level);
    } catch (e) {
        invalid.push({ number: i + 1, error: String(e.message || e) });
    }
}

const dataPath = path.join(__dirname, '..', 'public', 'data', 'pk32-light-levels.json');
const prev = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const merged = Object.assign({}, prev, {
    name: '智慧之光',
    picForm: 26,
    spriteSheet: '/img/pk32/original/sheet-7a90dd.png',
    nativeLevelCount: 140,
    extractedLevelCount: levels.length,
    extractedPayloadCount: levels.length,
    fullGameRulesVerified: false,
    levels: levels,
    demos: prev.demos || [],
});

fs.writeFileSync(dataPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
    extracted: levels.length,
    invalid: invalid.length,
    invalidSamples: invalid.slice(0, 5),
    demosPreserved: (prev.demos || []).length
}));
