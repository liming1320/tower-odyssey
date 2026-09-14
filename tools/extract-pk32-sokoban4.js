'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'output/pk32-reference/module.bin');

function extract(moduleImage) {
    const base = moduleImage.readUInt32LE(moduleImage.readUInt32LE(0x3c) + 52);
    const guard = 0x1bf4231, table = 0x1bf4a60;
    assert.equal(moduleImage.subarray(guard, guard + 9).toString('hex'), '8b45080fbf0083f816');
    assert.equal(moduleImage.subarray(0x1bf4240, 0x1bf4243).toString('hex'), 'ff2485');
    assert.equal(moduleImage.readUInt32LE(0x1bf4243), base + table);
    assert.equal(moduleImage.subarray(0x1bf42f2, 0x1bf42f7).toString('hex'), 'b96cb52402');
    assert.equal(moduleImage.subarray(0x1bf3497, 0x1bf349f).toString('hex'), '668b42088b1f6640');
    const levels = [];
    for (let index = 0; index < 23; index++) {
        const caseRva = moduleImage.readUInt32LE(table + index * 4) - base;
        assert.equal(moduleImage[caseRva], 0xba);
        const offset = moduleImage.readUInt32LE(caseRva + 1) - base;
        const byteLength = moduleImage.readUInt32LE(offset - 4);
        assert.ok(byteLength > 4 && byteLength < 4096 && byteLength % 2 === 0);
        const raw = moduleImage.toString('utf16le', offset, offset + byteLength);
        assert.match(raw, /^\d{4}[0-6]+$/);
        const width = Number(raw.slice(0, 2)), height = Number(raw.slice(2, 4));
        const cells = raw.slice(4);
        assert.equal(cells.length, width * height);
        assert.equal(cells.split('6').length - 1, 1);
        levels.push({ number: index + 1, dispatchIndex: index, caseRva, offset, width, height, cells });
    }
    assert.equal(new Set(levels.map(level => level.offset)).size, 23);
    // Native demo selector has only three cases, not one invented solution per level.
    [0x1bf6890, 0x1bf6889, 0x1bf6882].forEach((demoCaseRva, index) => {
        assert.equal(moduleImage[demoCaseRva], 0xba);
        const offset = moduleImage.readUInt32LE(demoCaseRva + 1) - base;
        const bytes = moduleImage.readUInt32LE(offset - 4);
        const keys = moduleImage.toString('utf16le', offset, offset + bytes);
        assert.match(keys, /^[0-3]+$/);
        levels[index].demo = { caseRva: demoCaseRva, offset, keys };
    });
    return {
        version: 2,
        source: 'PK32 native dispatch at RVA 0x1bf4231; table RVA 0x1bf4a60',
        moduleSha256: crypto.createHash('sha256').update(moduleImage).digest('hex'),
        nativeLevelCount: 23,
        extractedLevelCount: levels.length,
        ruleTextOffset: 3076896,
        fullGameRulesVerified: false,
        levels
    };
}

if (require.main === module) {
    const result = extract(fs.readFileSync(source));
    const output = path.join(root, 'public/data/pk32-sokoban4-levels.json');
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({ extracted: result.levels.length, source: result.source, fullGameRulesVerified: false }));
}

module.exports = { extract };
