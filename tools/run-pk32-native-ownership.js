'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bundledPython = path.resolve(path.dirname(process.execPath), '..', '..', 'python', 'python.exe');
const workspacePython = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
const candidates = [process.env.PK32_PYTHON, process.env.PYTHON, bundledPython, workspacePython, 'python', 'py'].filter(Boolean);
let lastError = null;

for (const python of candidates) {
    if (path.isAbsolute(python) && !fs.existsSync(python)) continue;
    const result = childProcess.spawnSync(python, [path.join(root, 'tools', 'build-pk32-native-ownership.py')], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    if (!result.error && result.status === 0) {
        process.stdout.write(result.stdout || '');
        process.exit(0);
    }
    if (result.error && result.error.code === 'ENOENT') {
        lastError = result.error;
        continue;
    }
    lastError = result.error || new Error((result.stderr || result.stdout || '').trim() || 'exit ' + result.status);
    break;
}

throw lastError || new Error('No Python runtime is available for PK32 native ownership analysis');
