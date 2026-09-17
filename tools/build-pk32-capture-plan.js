'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'public', 'data', 'pk32-native-catalog.json');
const outputPath = path.join(root, 'output', 'pk32-reference', 'capture-plan.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

if (!Array.isArray(catalog.records) || catalog.records.length !== 213) {
  throw new Error('Expected exactly 213 PK32 catalog records.');
}

const games = catalog.records.map((record, position) => ({
  id: record.id,
  name: record.name,
  catalogIndex: position + 1,
  moduleCandidate: `Pk_${String(position + 1).padStart(2, '0')}`,
  selection: {
    strategy: 'home-then-down-index-then-enter',
    downCount: position,
    confidence: 'unverified',
    warning: 'The PK32 launcher navigation must be calibrated against screenshots before this can be treated as a game-to-module binding.'
  },
  phases: ['launcher', 'selected', 'started', 'after-input'],
  evidenceStatus: 'not-captured'
}));

const plan = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'public/data/pk32-native-catalog.json',
  policy: {
    isACollectionPlan: true,
    selectionRequiresCalibration: true,
    captureDoesNotProveRuleRecovery: true,
    captureDoesNotChangeMigrationStatus: true
  },
  defaults: {
    launcherNavigation: ['HOME', 'DOWN x catalogIndex-1', 'ENTER'],
    postStartInputs: ['LEFT', 'UP', 'RIGHT', 'DOWN', 'SPACE'],
    captureMemoryDump: false
  },
  games
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, outputPath), games: games.length }));
