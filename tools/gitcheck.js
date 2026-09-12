const { execSync } = require('child_process');
const out = execSync('git log --oneline -2 && git status --short', { cwd: 'E:\\WorkSpace\\tower-odyssey', encoding: 'utf8' });
require('fs').writeFileSync('tools/shots/git.txt', out, 'utf8');
