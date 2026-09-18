// Parse-only syntax check (vm.Script) for all new/changed minigame engine files.
// Browser globals are NOT required to exist — vm.Script only parses, never executes.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const eng = path.join(root, 'public', 'js', 'minigames', 'engine');

// New D/E/F modules + changed shared files this round.
const targets = [
  'mg-pool.js', 'mg-ticker.js', 'mg-worker.js', 'mg-atlas.js',         // D
  'mg-daily-ui.js', 'mg-replaycode.js', 'mg-net.js',                   // E
  'mg-loadmod.js', 'mg-perfguard.js', 'mg-reporterror.js',             // F (new)
  'mg-render.js', '_engine.js', 'mg-settings.js',                      // changed shared
  'mg-gfx.js' // may not exist; guarded below
];

// Also check the F2 visual-regression tool (Node script).
const tools = [
  path.join(root, 'tools', 'visual-regression.js')
];

let fail = 0, ok = 0, skip = 0;
const log = [];

for (const f of targets) {
  const fp = path.join(eng, f);
  if (!fs.existsSync(fp)) { skip++; log.push('SKIP (missing) ' + f); continue; }
  const code = fs.readFileSync(fp, 'utf8');
  try { new vm.Script(code, { filename: f }); ok++; log.push('PARSE OK ' + f); }
  catch (e) { fail++; log.push('PARSE FAIL ' + f + ' :: ' + e.message); }
}
for (const fp of tools) {
  if (!fs.existsSync(fp)) { skip++; log.push('SKIP (missing) ' + fp); continue; }
  const code = fs.readFileSync(fp, 'utf8');
  try { new vm.Script(code, { filename: fp }); ok++; log.push('PARSE OK ' + path.basename(fp)); }
  catch (e) { fail++; log.push('PARSE FAIL ' + path.basename(fp) + ' :: ' + e.message); }
}

console.log(log.join('\n'));
console.log('\n--- SUMMARY: ok=' + ok + ' fail=' + fail + ' skip=' + skip + ' ---');
process.exit(fail > 0 ? 1 : 0);
