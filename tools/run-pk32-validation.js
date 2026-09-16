'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const requested = (args.find(arg => arg.startsWith('--group=')) || '').slice(8).split(',').filter(Boolean);
const requestedJobs = Number((args.find(arg => arg.startsWith('--jobs=')) || '').slice(7) || process.env.PK32_VALIDATION_JOBS || 3);
const jobs = Number.isInteger(requestedJobs) && requestedJobs > 0 ? Math.min(requestedJobs, 4) : 3;
const groups = {
  peg: {
    games: ['\u72ec\u7c92\u94bb\u77f3'],
    evidence: ['tools/verify-pk32-peg-data.js'],
    browser: ['tools/verify-pk32-peg-cdp.js']
  },
  'native-extracted': {
    games: ['\u540c\u6b65\u79fb\u52a8', '\u6728\u4e43\u4f0a', '\u7535\u78c1\u5f69\u7403'],
    evidence: [],
    browser: ['tools/verify-pk32-native-cdp.js']
  },
  'same-color': {
    games: ['\u540c\u8272\u65b9\u5757', '\u7206\u7834\u5f69\u7403'],
    evidence: ['tools/verify-pk32-same-color-data.js', 'tools/verify-pk32-burst-balls.js'],
    browser: ['tools/verify-pk32-native-cdp.js', 'tools/verify-pk32-burst-cdp.js']
  },
  'pixel-island': {
    games: ['\u50cf\u7d20\u5c9b'],
    evidence: ['tools/verify-pk32-pixel-island-data.js'],
    browser: ['tools/verify-pk32-pixel-island-flow.js']
  },
  jungle: {
    games: ['\u6597\u517d\u68cb'],
    evidence: [],
    browser: ['tools/verify-pk32-jungle-cdp.js']
  },
  reversi: {
    games: ['\u9ed1\u767d\u68cb'],
    evidence: ['tools/verify-pk32-reversi-data.js'],
    browser: ['tools/verify-pk32-reversi-cdp.js']
  },
  pipe: {
    games: ['\u63a5\u6c34\u7ba1'],
    evidence: ['tools/verify-pk32-pipe-connect-data.js', 'tools/verify-pk32-pipe-connect-flow.js'],
    browser: ['tools/verify-pk32-pipe-connect-cdp.js']
  },
  huarong: {
    games: ['\u534e\u5bb9\u9053'],
    evidence: ['tools/verify-pk32-huarong-data.js', 'tools/verify-pk32-huarong-solvability.js'],
    browser: ['tools/verify-pk32-huarong-cdp.js']
  },
  sokoban4: {
    games: ['\u63a8\u7bb1\u5b50\u56db'],
    evidence: ['tools/verify-pk32-sokoban4.js', 'tools/verify-pk32-sokoban4-data.js'],
    browser: ['tools/verify-pk32-sokoban4-cdp.js']
  },
  light: {
    games: ['\u667a\u6167\u4e4b\u5149'],
    evidence: ['tools/verify-pk32-light.js', 'tools/verify-pk32-light-rules.js'],
    browser: ['tools/verify-pk32-light-cdp.js']
  },
  ships: {
    games: ['\u822a\u6d77\u8ff7\u9898'],
    evidence: ['tools/verify-pk32-ships-data.js'],
    browser: ['tools/verify-pk32-ships-cdp.js']
  },
  electromagnetic: {
    games: ['\u7535\u78c1\u5f69\u7403'],
    evidence: ['tools/verify-pk32-electromagnetic-data.js'],
    browser: ['tools/verify-pk32-native-cdp.js']
  },
  'black-hole': {
    games: ['\u5b87\u5b99\u9ed1\u6d1e'],
    evidence: ['tools/verify-pk32-black-hole.js'],
    browser: ['tools/verify-pk32-native-cdp.js']
  }
};
const selected = args.includes('--all') ? Object.keys(groups) : (requested.length ? requested : Object.keys(groups));
selected.forEach(name => { if (!groups[name]) throw new Error('Unknown validation group: ' + name); });

const allSteps = [
  { phase: 'inventory', script: 'tools/build-pk32-migration-queue.js' },
  { phase: 'inventory', script: 'tools/verify-pk32-inventory.js' },
  { phase: 'inventory', script: 'tools/verify-pk32-catalog.js' },
  { phase: 'inventory', script: 'tools/verify-pk32-catalog-coverage.js' },
  { phase: 'inventory', script: 'tools/verify-pk32-level-boundaries.js' },
  { phase: 'inventory', script: 'tools/verify-pk32-evidence-layer.js' },
  { phase: 'evidence', script: 'tools/verify-pk32-native-data-manifest.js' },
  { phase: 'evidence', script: 'tools/verify-pk32-native-data.js' },
  { phase: 'evidence', script: 'tools/verify-pk32-native-ownership.js' },
  { phase: 'evidence', script: 'tools/verify-pk32-dimension-grids.js' },
  { phase: 'evidence', script: 'tools/verify-pk32-structured-payloads.js' },
  ...selected.flatMap(name => groups[name].evidence.map(script => ({ phase: 'evidence', group: name, script }))),
  { phase: 'implementation', script: 'tools/verify-pk32-startup.js' },
  { phase: 'browser', script: 'tools/verify-pk32-evidence-browser.js' },
  ...selected.flatMap(name => groups[name].browser.map(script => ({ phase: 'browser', group: name, script })))
];
const seenSteps = new Set();
const steps = allSteps.filter(step => { const key = step.phase + '|' + step.script; if (seenSteps.has(key)) return false; seenSteps.add(key); return true; });

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(url) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 20000;
    const attempt = () => {
      const request = http.get(url, response => {
        response.resume();
        if (response.statusCode < 500) return resolve();
        setTimeout(attempt, 150);
      });
      request.on('error', () => Date.now() < deadline ? setTimeout(attempt, 150) : reject(new Error('Server startup timed out')));
    };
    attempt();
  });
}

function run(step, env) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [path.join(root, step.script)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 180000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ ...step, passed: code === 0 && !timedOut, code, timedOut, durationMs: Date.now() - startedAt, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function runParallel(batch, env) {
  const results = new Array(batch.length);
  let next = 0;
  const worker = async () => {
    while (next < batch.length) {
      const index = next++;
      results[index] = await run(batch[index], env);
    }
  };
  return Promise.all(Array.from({ length: Math.min(jobs, batch.length) }, worker)).then(() => results);
}

(async () => {
  const report = { version: 2, startedAt: new Date().toISOString(), selectedGroups: selected, jobs, steps: [] };
  const queueStep = steps.find(step => step.script === 'tools/build-pk32-migration-queue.js');
  const preBrowserSteps = steps.filter(step => step !== queueStep && step.phase !== 'browser');
  const browserSteps = steps.filter(step => step.phase === 'browser');
  const env = { ...process.env };
  let server = null;
  try {
    if (queueStep) report.steps.push(await run(queueStep, env));
    if (report.steps.every(step => step.passed)) {
      report.steps.push(...await runParallel(preBrowserSteps, env));
    }
    for (const result of report.steps) {
      console.log((result.passed ? 'PASS ' : 'FAIL ') + result.phase + ' ' + result.script + ' (' + result.durationMs + 'ms)');
    }
    if (report.steps.length === 1 + preBrowserSteps.length && report.steps.every(step => step.passed) && browserSteps.length) {
      const port = await freePort();
      env.PK32_BASE_URL = 'http://127.0.0.1:' + port;
      server = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
      await waitForServer(env.PK32_BASE_URL);
      const results = await runParallel(browserSteps, env);
      report.steps.push(...results);
      for (const result of results) {
        console.log((result.passed ? 'PASS ' : 'FAIL ') + result.phase + ' ' + result.script + ' (' + result.durationMs + 'ms)');
      }
    }
  } finally {
    if (server) server.kill();
    const ledger = JSON.parse(fs.readFileSync(path.join(root, 'output/pk32-reference/migration-ledger.json'), 'utf8'));
    const invalidComplete = ledger.records.filter(record => record.originalComplete === true && !(record.originalAssetsVerified && record.originalLevelsVerified && record.originalRulesVerified));
    report.invalidComplete = invalidComplete.map(record => record.name);
    report.passed = report.steps.length === steps.length && report.steps.every(step => step.passed) && invalidComplete.length === 0;
    report.finishedAt = new Date().toISOString();
    const reportDir = path.join(root, 'output', 'pk32-validation');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: report.passed, steps: report.steps.length, groups: selected, report: 'output/pk32-validation/latest.json' }));
    if (!report.passed) process.exitCode = 1;
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
