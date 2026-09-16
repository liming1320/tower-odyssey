// Build an auditable per-game migration ledger from the PK32 catalog.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const file = path.join(root, 'public', 'js', 'minigames', 'pk32.js');
const source = fs.readFileSync(file, 'utf8');
const runtime = { window: { MiniGames: {} } };
vm.createContext(runtime);
vm.runInContext(source, runtime, { filename: file });
const catalog = runtime.window.PK32Catalog || [];
function launcher(record) {
  if (record.playable) return record.playable.gameId;
  if (record.module) return 'board';
  if (record.variant) return 'variant';
  if (record.puzzle) return 'puzzle';
  if (record.action) return 'action';
  if (record.casual) return 'casual';
  if (record.strategy) return 'strategy';
  if (record.card) return 'card';
  return null;
}
const ledger = catalog.map(record => ({
  id: record.id,
  index: record.index,
  name: record.name,
  group: record.group,
  launcher: launcher(record),
  launcherVerified: false,
  assetsMigrated: false,
  levelsMigrated: false,
  rulesMigrated: false,
  fullFlowMigrated: false,
  originalLevelsVerified: false,
  originalRulesVerified: false,
  originalAssetsVerified: false,
  fullFlowVerified: false,
  originalComplete: false,
  evidence: record.evidence,
  notes: ''
}));
const out = path.join(root, 'output', 'pk32-reference', 'migration-ledger.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ version: 1, generatedFrom: 'public/js/minigames/pk32.js', total: ledger.length, records: ledger }, null, 2));
console.log(JSON.stringify({ out, total: ledger.length, launcherVerified: ledger.filter(x => x.launcherVerified).length, originalComplete: ledger.filter(x => x.originalComplete).length }));
