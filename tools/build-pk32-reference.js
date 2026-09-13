// Rebuild the PK32 evidence bundle in one repeatable command.
// This pipeline extracts data only; it never edits the original game files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const childProcess = require('child_process');
const os = require('os');

const root = path.resolve(__dirname, '..');
const defaultOutput = path.join(root, 'output', 'pk32-reference');
const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
const output = path.resolve(arg('--output', defaultOutput));
const input = path.resolve(arg('--input', path.join(output, 'module.bin')));
const skipNative = args.includes('--skip-native');
const skipLauncher = args.includes('--skip-launcher');
const readJson = name => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'));
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run = (command, commandArgs) => {
  const result = childProcess.spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(command + ' ' + commandArgs.join(' ') + ' failed' + (detail ? ': ' + detail : ''));
  }
  return (result.stdout || '').trim();
};

if (!fs.existsSync(input)) throw new Error('Input module does not exist: ' + input);
fs.mkdirSync(output, { recursive: true });
run(process.execPath, [path.join(root, 'tools', 'extract-pk32-reference.js'), input, output]);
run(process.execPath, [path.join(root, 'tools', 'index-pk32-picform.js'), input, path.join(output, 'picform-index.json')]);
const ledgerFile = path.join(output, 'migration-ledger.json');
if (!fs.existsSync(ledgerFile)) run(process.execPath, [path.join(root, 'tools', 'build-pk32-ledger.js')]);

let nativeStatus = { attempted: false, verified: false, error: null };
if (!skipNative) {
  nativeStatus.attempted = true;
  const bundledPython = path.resolve(path.dirname(process.execPath), '..', '..', 'python', 'python.exe');
  const workspacePython = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
  const pythonCommands = [process.env.PK32_PYTHON, process.env.PYTHON,
    fs.existsSync(bundledPython) ? bundledPython : null,
    fs.existsSync(workspacePython) ? workspacePython : null,
    'python', 'py'].filter(Boolean);
  let lastError = null;
  for (const python of pythonCommands) {
    try {
      run(python, [path.join(root, 'tools', 'inspect-pk32-native.py')]);
      nativeStatus.verified = true;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) nativeStatus.error = lastError.message;
}
run(process.execPath, [path.join(root, 'tools', 'audit-pk32-extraction.js')]);
if (!skipLauncher) run(process.execPath, [path.join(root, 'tools', 'verify-pk32-startup.js')]);

const runtime = { window: { MiniGames: {} } };
vm.createContext(runtime);
vm.runInContext(fs.readFileSync(path.join(root, 'public', 'js', 'minigames', 'pk32.js'), 'utf8'), runtime);
const catalog = runtime.window.PK32Catalog || [];
const ledger = readJson('migration-ledger.json');
const picform = readJson('picform-index.json');
const extraction = readJson('extraction-audit.json');
const native = fs.existsSync(path.join(output, 'native-index.json')) ? readJson('native-index.json') : null;
const byIndex = new Map(ledger.records.map(record => [record.index, record]));

function launcher(record) {
  if (record.playable) return record.playable.gameId;
  if (record.module) return 'board';
  if (record.casual) return 'casual';
  if (record.action) return 'action';
  if (record.strategy) return 'strategy';
  if (record.card) return 'card';
  if (record.puzzle) return 'puzzle';
  if (record.variant) return 'variant';
  return null;
}

function originalEvidence(record) {
  if (record.name === '魔塔') {
    const maps = native && native.towerFloorDispatch && native.towerFloorDispatch.maps;
    return {
      asset: { verified: !!(native && native.towerAtlas && native.towerAtlas.mappingVerified), source: 'picform-22' },
      levels: { verified: Array.isArray(maps) && maps.length === 22, count: Array.isArray(maps) ? maps.length : 0 },
      rules: { verified: false, missing: ['tile semantics', 'NPC and gate state machine', 'ending flow'] }
    };
  }
  if (record.name === '强手棋') {
    const board = native && native.richmanAtlas;
    return {
      asset: { verified: !!(board && board.mappingVerified), source: 'picform-13' },
      levels: { verified: !!(board && board.track && board.track.cells === 40), count: board && board.track ? board.track.cells : 0 },
      rules: { verified: false, missing: ['rent table', 'card effects', 'building restrictions', 'AI and end flow'] }
    };
  }
  return {
    asset: { verified: false, source: null },
    levels: { verified: false, count: null },
    rules: { verified: false, missing: ['game boundary', 'asset bindings', 'level or round data', 'observable rule trace'] }
  };
}

const records = catalog.map(record => {
  const evidence = originalEvidence(record);
  const old = byIndex.get(record.index) || {};
  return {
    id: record.id,
    index: record.index,
    name: record.name,
    group: record.group,
    launcher: launcher(record),
    launcherVerified: old.launcherVerified === true,
    originalAssetsVerified: evidence.asset.verified,
    originalLevelsVerified: evidence.levels.verified,
    originalRulesVerified: evidence.rules.verified,
    originalComplete: old.originalComplete === true,
    evidence,
    launchVerifiedNodes: old.launchVerifiedNodes || 0,
    notes: old.notes || '',
    source: 'PK32 module.bin; read-only extraction'
  };
});

const manifest = {
  version: 2,
  generatedAt: new Date().toISOString(),
  input: { file: path.relative(root, input), bytes: fs.statSync(input).size, sha256: sha256(input) },
  extraction: {
    strings: extraction.coverage.candidateStrings,
    bitmaps: extraction.coverage.extractedBitmaps,
    picForms: picform.count,
    catalog: catalog.length,
    native: nativeStatus,
    executableLogicRecovered: extraction.coverage.executableLogicRecovered
  },
  completionRule: 'originalComplete is true only when the same game has verified assets, original level/round data, and observable rules.',
  records,
  unassignedPicForms: picform.records.map(row => row.internalId).filter(id => id != null && ![13, 22].includes(id)),
  limitations: [
    'A successful launcher is not evidence of original behavior.',
    'Numeric payload length alone is not evidence of a map or level count.',
    'The current native evidence proves only the two explicitly inspected games.'
  ]
};
const manifestFile = path.join(output, 'pk32-reference-manifest.json');
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({
  manifest: path.relative(root, manifestFile),
  inputSha256: manifest.input.sha256,
  total: records.length,
  launchersVerified: records.filter(record => record.launcherVerified).length,
  originalComplete: records.filter(record => record.originalComplete).length,
  launcherVerification: skipLauncher ? 'skipped' : 'completed',
  native: nativeStatus
}));
