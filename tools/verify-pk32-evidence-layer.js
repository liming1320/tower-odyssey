'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const catalog = require(path.join(root, 'public/data/pk32-native-catalog.json'));
const queue = require(path.join(root, 'output/pk32-reference/migration-queue.json'));
const source = fs.readFileSync(path.join(root, 'public/js/minigames/pk32.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const context = { window: { MiniGames: {} } };
vm.createContext(context);
vm.runInContext(source, context);
const records = context.window.PK32Catalog || [];

assert.equal(records.length, 213);
assert.equal(catalog.records.length, 213);
assert.equal(queue.records.length, 213);
assert.equal(records.filter(record => record.originalComplete).length, 0);
assert.equal(queue.summary.originalComplete, 0);
assert.equal(queue.summary.awaitingAdapter, queue.records.filter(record => record.migrationStatus === 'native-payloads-awaiting-adapter').length);
assert.equal(queue.summary.assignmentReview, queue.records.filter(record => record.migrationStatus === 'payload-assignment-review' || record.migrationStatus === 'structured-data-assignment-review').length);
assert.equal(queue.summary.payloadFormatGroups, queue.payloadFormatGroups.length);
assert.ok(queue.payloadFormatGroups.every(group => group.semanticsVerified === false));
assert.ok(catalog.records.filter(record => record.payloadCount).every(record => record.payloadProfile && record.payloadProfile.semanticsVerified === false));
assert.match(source, /data-pk32-evidence/);
assert.match(source, /x\.dedicatedLauncher === 'variant'/);
assert.match(index, /pk32-evidence\.js/);

console.log(JSON.stringify({
    total: records.length,
    dedicatedEntries: records.filter(record => record.dedicated).length,
    awaitingAdapter: queue.summary.awaitingAdapter,
    assignmentReview: queue.summary.assignmentReview,
    payloadFormatGroups: queue.summary.payloadFormatGroups,
    originalComplete: queue.summary.originalComplete
}));
