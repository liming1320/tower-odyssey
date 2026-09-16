'use strict';

const FIXED_AREAS = new Set([25, 36, 49, 64, 81, 100, 120, 144, 150, 160, 168, 192, 200, 242, 256, 280, 400, 800, 900]);
const CELL_FAMILIES = {
    1: 'dimension-prefix-single-cell',
    2: 'dimension-prefix-paired-cell',
    3: 'dimension-prefix-triple-cell'
};

function chunks(value, size) {
    const result = [];
    for (let index = 0; index < value.length; index += size) result.push(value.slice(index, index + size));
    return result;
}

function fixedShapes(length) {
    const shapes = [];
    for (const cellWidth of [1, 2, 3]) {
        if (length % cellWidth) continue;
        const area = length / cellWidth;
        for (let width = 3; width <= 40; width += 1) {
            const height = area / width;
            if (Number.isInteger(height) && height >= 3 && height <= 40 && width >= height) shapes.push({ width, height, cellWidth });
        }
    }
    return shapes;
}

function classifyPayload(payload) {
    const value = String(payload && payload.value || '');
    const length = value.length;
    const width = Number(value.slice(0, 2));
    const height = Number(value.slice(2, 4));
    const dimensionsPlausible = width >= 2 && width <= 40 && height >= 2 && height <= 40;
    if (dimensionsPlausible) {
        for (const cellWidth of [1, 2, 3]) {
            const expected = 4 + width * height * cellWidth;
            if (expected === length) {
                return {
                    family: CELL_FAMILIES[cellWidth],
                    confidence: 'exact-structure',
                    width,
                    height,
                    cellWidth,
                    trailerLength: 0,
                    semanticsVerified: false
                };
            }
        }
        for (const cellWidth of [1, 2, 3]) {
            const expected = 4 + width * height * cellWidth;
            const trailerLength = length - expected;
            if (trailerLength > 0 && trailerLength <= 12) {
                return {
                    family: CELL_FAMILIES[cellWidth] + '-with-trailer',
                    confidence: 'exact-body-plus-trailer',
                    width,
                    height,
                    cellWidth,
                    trailerLength,
                    semanticsVerified: false
                };
            }
        }
    }

    const compactWidth = Number(value.slice(0, 1));
    const compactHeight = Number(value.slice(1, 2));
    if (compactWidth >= 2 && compactHeight >= 2 && length === 2 + compactWidth * compactHeight) {
        return {
            family: 'compact-dimension-grid',
            confidence: 'exact-structure',
            width: compactWidth,
            height: compactHeight,
            cellWidth: 1,
            trailerLength: 0,
            semanticsVerified: false
        };
    }
    if (/^100\d{2}/.test(value) && length >= 100) {
        return { family: 'legacy-100-stream', confidence: 'header-only', length, semanticsVerified: false };
    }

    if (FIXED_AREAS.has(length)) {
        return { family: 'fixed-area-candidate', confidence: 'shape-only', length, semanticsVerified: false };
    }
    const tupleOffset = length % 3 === 0 ? 0 : (length - 1) % 3 === 0 ? 1 : -1;
    if (tupleOffset >= 0 && chunks(value.slice(tupleOffset), 3).every(part => Number(part) <= 255)) {
        return { family: 'three-digit-index-candidate', confidence: 'shape-only', prefixLength: tupleOffset, tupleCount: (length - tupleOffset) / 3, semanticsVerified: false };
    }
    if (length % 2 === 0) {
        return { family: 'paired-code-candidate', confidence: 'shape-only', tupleCount: length / 2, semanticsVerified: false };
    }
    return { family: 'numeric-mixed', confidence: 'unclassified', length, semanticsVerified: false };
}

function profilePayloads(payloads) {
    const profiles = (payloads || []).map(classifyPayload);
    const familyCounts = {};
    profiles.forEach(profile => { familyCounts[profile.family] = (familyCounts[profile.family] || 0) + 1; });
    const families = Object.entries(familyCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return {
        payloadCount: profiles.length,
        dominantFamily: families.length ? families[0][0] : null,
        familyCounts,
        semanticsVerified: false,
        samples: profiles.slice(0, 12)
    };
}

function decodePayload(payload) {
    const value = String(payload && payload.value || '');
    const profile = classifyPayload(payload);
    const result = {
        offset: payload && payload.offset,
        length: value.length,
        family: profile.family,
        confidence: profile.confidence,
        semanticsVerified: false,
        structure: {},
        units: []
    };
    if (/^dimension-prefix-/.test(profile.family)) {
        const bodyEnd = 4 + profile.width * profile.height * profile.cellWidth;
        result.structure = { width: profile.width, height: profile.height, cellWidth: profile.cellWidth, prefixLength: 4, trailerLength: value.length - bodyEnd };
        result.units = chunks(value.slice(4, bodyEnd), profile.cellWidth);
        result.trailer = value.slice(bodyEnd);
    } else if (profile.family === 'compact-dimension-grid') {
        result.structure = { width: profile.width, height: profile.height, cellWidth: 1, prefixLength: 2 };
        result.units = value.slice(2).split('');
    } else if (profile.family === 'fixed-area-candidate') {
        result.structure = { candidateShapes: fixedShapes(value.length) };
        result.units = value.split('');
    } else if (profile.family === 'legacy-100-stream') {
        const headerValue = Number(value.slice(3, 5));
        const headerCountFits = value.length >= 5 + headerValue * 3;
        const bodyEnd = headerCountFits ? 5 + headerValue * 3 : 5 + Math.floor((value.length - 5) / 3) * 3;
        result.structure = { marker: value.slice(0, 3), headerValue, headerCountFits, bodyOffset: 5, trailerLength: value.length - bodyEnd };
        result.units = chunks(value.slice(5, bodyEnd), 3).map(Number);
        result.trailer = value.slice(bodyEnd);
    } else if (profile.family === 'three-digit-index-candidate') {
        result.structure = { prefixLength: profile.prefixLength, tupleCount: profile.tupleCount };
        result.prefix = value.slice(0, profile.prefixLength);
        result.units = chunks(value.slice(profile.prefixLength), 3).map(Number);
    } else if (profile.family === 'paired-code-candidate') {
        result.structure = { tupleCount: profile.tupleCount, cellWidth: 2 };
        result.units = chunks(value, 2).map(Number);
    } else if (value.length % 3 === 0) {
        result.structure = { tupleCount: value.length / 3, cellWidth: 3, unrestrictedRange: true };
        result.units = chunks(value, 3).map(Number);
    } else {
        result.units = value.split('').map(Number);
    }
    return result;
}

module.exports = { classifyPayload, decodePayload, fixedShapes, profilePayloads };
