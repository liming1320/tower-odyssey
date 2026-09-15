'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const requested = (args.find(arg => arg.startsWith('--group=')) || '').slice(8).split(',').filter(Boolean);
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
  }
};
const selected = args.includes('--all') ? Object.keys(groups) : (requested.length ? requested : Object.keys(groups));
selected.forEach(name => { if (!groups[name]) throw new Error('Unknown validation group: ' + name); });

const allSteps = [
  { phase: 'inventory', script: 'tools/build-pk32-migration-queue.js' },
  { phase: 'inventory', script: 'tools/verify-pk32-inventory.js' },
  { phase: 'inventory', script: 'tools/verify-pk32-catalog.js' },
  { phase: 'inventory', script: 'tools/verify-pk32-catalog-coverage.js' },
  { phase: 'evidence', script: 'tools/verify-pk32-native-data-manifest.js' },
  { phase: 'evidence', script: 'tools/verify-pk32-native-data.js' },
  ...selected.flatMap(name => groups[name].evidence.map(script => ({ phase: 'evidence', group: name, script }))),
  { phase: 'implementation', script: 'tools/verify-pk32-startup.js' },
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

(async () => {
  const report = { version: 1, startedAt: new Date().toISOString(), selectedGroups: selected, steps: [] };
  const needsBrowser = steps.some(step => step.phase === 'browser');
  const port = needsBrowser ? await freePort() : null;
  const env = { ...process.env, PK32_BASE_URL: port ? 'http://127.0.0.1:' + port : process.env.PK32_BASE_URL };
  let server = null;
  try {
    if (needsBrowser) {
      server = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
      await waitForServer(env.PK32_BASE_URL);
    }
    for (const step of steps) {
      const result = await run(step, env);
      report.steps.push(result);
      console.log((result.passed ? 'PASS ' : 'FAIL ') + result.phase + ' ' + result.script + ' (' + result.durationMs + 'ms)');
      if (!result.passed) break;
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
