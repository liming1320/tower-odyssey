// Audit existing batch extraction against the captured executable, without
// treating numeric strings as maps or successful launchers as completed ports.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const reference = path.join(root, 'output', 'pk32-reference');
const read = name => JSON.parse(fs.readFileSync(path.join(reference, name), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const moduleBytes = fs.readFileSync(path.join(reference, 'module.bin'));
const bitmaps = read('bitmaps.json');
const picForms = read('picform-index.json').records;
const strings = read('strings.json');
const ledger = read('migration-ledger.json');
const native = read('native-index.json');
assert.equal(native.moduleSha256, hash(moduleBytes));

const images = bitmaps.map(record => {
    const offset = record.offset;
    assert.equal(moduleBytes.toString('ascii', offset, offset + 2), 'BM');
    const size = moduleBytes.readUInt32LE(offset + 2);
    const extracted = fs.readFileSync(path.join(reference, record.file));
    assert.ok(extracted.equals(moduleBytes.subarray(offset, offset + size)), record.file + ': source mismatch');
    assert.equal(hash(extracted), record.sha256, record.file + ': hash mismatch');
    return {
        file: record.file, offset, size,
        width: moduleBytes.readInt32LE(offset + 18),
        height: moduleBytes.readInt32LE(offset + 22),
        bits: moduleBytes.readUInt16LE(offset + 28),
        sha256: hash(extracted), sourceBytesVerified: true,
        picFormIndexed: picForms.some(form => form.bmpOffset === offset)
    };
});

// Length and a nearby game title are insufficient to establish map semantics.
const numericPayloads = read('tower-maps-index.json').map(set => ({
    name: set.name,
    claimedDimensions: [set.width, set.height],
    classificationVerified: false,
    payloads: set.maps.map(record => {
        const bytes = Buffer.from(record.text, 'utf16le');
        assert.ok(bytes.equals(moduleBytes.subarray(record.offset, record.offset + bytes.length)), 'numeric payload mismatch');
        const result = { offset: record.offset, characters: record.text.length, sourceBytesVerified: true };
        if (record.text.length === 900) {
            const words = record.text.match(/.{6}/g).map(Number);
            result.warning = 'Possible fixed-width numeric table; do not assume a 30x30 tile map.';
            result.sixDigitWordCount = words.length;
            result.firstFourRecordsOfSixWords = Array.from({ length: 4 }, (_, i) => words.slice(i * 6, i * 6 + 6));
            result.largestWord = Math.max(...words);
        }
        return result;
    })
}));

const vbSignature = moduleBytes.indexOf(Buffer.from('VB5!'));
const report = {
    module: { file: 'module.bin', bytes: moduleBytes.length, sha256: hash(moduleBytes), vbSignatureOffset: vbSignature },
    coverage: {
        extractedBitmaps: images.length,
        picFormRecords: picForms.length,
        candidateStrings: strings.length,
        catalogRecords: ledger.records.length,
        claimedOriginalComplete: ledger.records.filter(record => record.originalComplete).length,
        allResourceTypesVerified: false,
        executableLogicRecovered: false
    },
    images,
    numericPayloads,
    visualEvidence: [
        { source: 'sheet-de1b36.bmp', region: native.richmanAtlas.board.source, content: 'Richman board, HUD, four directional actors and property sprites', basis: 'Native PicForm(13) selection and blit instructions; see native-index.json', runtimeMappingVerified: true, fullRulesVerified: false },
        { source: 'sheet-915611.bmp', content: 'Tower one terrain and actors', basis: 'Native PicForm(22), 22 map dispatch cases, 32px blits on 33px stride', mapCodeMappingVerified: true, mapSemanticsVerified: false, fullUiVerified: false },
        { source: 'sheet-5579f0.bmp', pairedCandidate: 'sheet-5cf6db.bmp', content: 'Silhouette atlas; possible mask/color pair', compositionVerified: false }
    ],
    requiredNextEvidence: [
        'Trace remaining games drawing calls and transparency operations; tower one and Richman basic blits are verified.',
        'Classify remaining numeric payloads; only tower one has 22 proven native floor dispatch cases.',
        'Recover rule handlers and compare observable behavior with the original executable.',
        'Compare isolated desktop/mobile screenshots; launcher counts do not prove fidelity.'
    ]
};
const output = path.join(reference, 'extraction-audit.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, ...report.coverage, verifiedBitmapBytes: true, unclassified900CharacterPayloads: numericPayloads.flatMap(set => set.payloads).filter(p => p.characters === 900).length }));
