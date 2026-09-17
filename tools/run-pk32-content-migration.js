'use strict';

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const continueOnError = args.includes('--continue-on-error');
const skipReference = args.includes('--skip-reference');

function run(script, scriptArgs) {
  const startedAt = Date.now();
  let result;
  let attempts = 0;
  do {
    attempts += 1;
    result = childProcess.spawnSync(process.execPath, [path.join(root, script), ...(scriptArgs || [])], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } while (result.status !== 0 && attempts < 3 && /UNKNOWN: unknown error, open/.test((result.stderr || '') + (result.stdout || '')));
  const step = {
    script,
    args: scriptArgs || [],
    passed: result.status === 0,
    code: result.status,
    attempts,
    durationMs: Date.now() - startedAt,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim()
  };
  console.log((step.passed ? 'PASS ' : 'FAIL ') + script + ' (' + step.durationMs + 'ms)');
  if (!step.passed && !continueOnError) {
    if (step.stderr) console.error(step.stderr);
    else if (step.stdout) console.error(step.stdout);
    process.exitCode = result.status || 1;
    throw new Error(script + ' failed');
  }
  return step;
}

function discoverExtractors() {
  const excluded = new Set([
    'extract-pk32-reference.js',
    'extract-pk32-dimension-grids.js'
  ]);
  return fs.readdirSync(path.join(root, 'tools'))
    .filter(file => /^extract-pk32-.*\.js$/.test(file) && !excluded.has(file))
    .sort()
    .map(file => 'tools/' + file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

const steps = [];
try {
  if (!skipReference) steps.push(run('tools/build-pk32-reference.js', ['--skip-launcher']));
  for (const script of discoverExtractors()) steps.push(run(script));
  steps.push(run('tools/extract-pk32-dimension-grids.js'));
  steps.push(run('tools/build-pk32-structured-payloads.js'));
  steps.push(run('tools/build-pk32-resource-manifest.js'));
  steps.push(run('tools/build-pk32-migration-queue.js'));
  if (fs.existsSync(path.join(root, 'output/pk32-reference/native-ownership.json'))) {
    steps.push(run('tools/build-pk32-native-migration-map.js'));
  }
  steps.push(run('tools/build-pk32-decoded-docs.js'));

  const queue = readJson('output/pk32-reference/migration-queue.json');
  const decoded = readJson('output/pk32-reference/decoded-content-index.json');
  const publicStatus = fs.existsSync(path.join(root, 'public/data/pk32-migration-status.json'))
    ? readJson('public/data/pk32-migration-status.json')
    : null;
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      browserVerificationSkipped: true,
      migrationCompleteRequiresAssetsLevelsRulesAndFullFlow: true,
      originalCompleteRequiresMigrationAndVerification: true
    },
    summary: {
      steps: steps.length,
      failedSteps: steps.filter(step => !step.passed).length,
      games: queue.summary.total,
      migrationComplete: queue.summary.migrationComplete,
      verificationComplete: queue.summary.verificationComplete,
      originalComplete: queue.summary.originalComplete,
      assetsMigrated: queue.summary.assetsMigrated,
      levelsMigrated: queue.summary.levelsMigrated,
      adapterPlayableMigrated: queue.summary.adapterPlayableMigrated,
      rulesMigrated: queue.summary.rulesMigrated,
      fullFlowMigrated: queue.summary.fullFlowMigrated,
      payloadMigration: queue.summary.payloadMigration,
      partialContentMigration: queue.summary.partialContentMigration,
      evidenceAdapterMigration: queue.summary.evidenceAdapterMigration,
      catalogMigration: queue.summary.catalogMigration,
      nativeData: queue.summary.nativeData,
      candidateData: queue.summary.candidateData,
      sharedResourcePackagesBound: queue.summary.sharedResourcePackagesBound,
      gameSpecificAssetMappings: queue.summary.gameSpecificAssetMappings,
      evidenceAdapterMigrated: queue.summary.evidenceAdapterMigrated,
      flowContentMigrated: queue.summary.flowContentMigrated,
      catalogEvidenceAdapter: queue.summary.catalogEvidenceAdapter,
      titleReferenceEvidence: queue.summary.titleReferenceEvidence,
      launchEvidence: queue.summary.launchEvidence,
      helpTextEvidence: queue.summary.helpTextEvidence,
      sharedPcodeMetadata: queue.summary.sharedPcodeMetadata,
      sharedRuntimeMethodTable: queue.summary.sharedRuntimeMethodTable,
      runtimeMethodEntries: queue.summary.runtimeMethodEntries,
      runtimeMethodRegionTargets: queue.summary.runtimeMethodRegionTargets,
      runtimePcodeSlices: queue.summary.runtimePcodeSlices,
      runtimePcodeTrustedSlices: queue.summary.runtimePcodeTrustedSlices,
      runtimePcodeTerminatedSlices: queue.summary.runtimePcodeTerminatedSlices,
      runtimePcodeTrustedTerminatedSlices: queue.summary.runtimePcodeTrustedTerminatedSlices,
      methodBodyCaptured: queue.summary.methodBodyCaptured,
      charGridCandidateGames: queue.summary.charGridCandidateGames,
      charGridCandidates: queue.summary.charGridCandidates,
      decodedDoc: 'docs/pk32-decoded-content.md',
      decodedIndex: 'output/pk32-reference/decoded-content-index.json',
      autoBindableContent: decoded.summary.canAutoBindContent,
      awaitingAdapter: queue.summary.awaitingAdapter,
      publicStatusRecords: publicStatus && publicStatus.records ? publicStatus.records.length : 0
    },
    steps
  };
  const out = path.join(root, 'output/pk32-reference/content-migration-run.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: path.relative(root, out), ...report.summary }));
  if (report.summary.failedSteps) process.exitCode = 1;
} catch (error) {
  if (!process.exitCode) process.exitCode = 1;
  if (!continueOnError) console.error(error.message);
}
