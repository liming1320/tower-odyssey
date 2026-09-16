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
const ledger = catalog.map(record => ({
  id: record.id,
  index: record.index,
  name: record.name,
  group: record.group,
  launcher: record.playable ? record.playable.gameId : record.module ? 'board' : record.casual ? 'casual' : record.action ? 'action' : record.strategy ? 'strategy' : record.card ? 'card' : record.puzzle ? 'puzzle' : record.variant ? 'variant' : null,
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
