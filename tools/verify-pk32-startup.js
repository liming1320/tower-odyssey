const fs = require('fs');
const vm = require('vm');
const Stub = require('./mg-dom-stub');

const S = Stub.install();
const files = ['pk32.js', 'pk32-board.js', 'pk32-sokoban4.js', 'pk32-casual.js', 'pk32-action.js', 'pk32-strategy.js', 'pk32-tower.js', 'pk32-richman.js', 'pk32-card.js', 'pk32-puzzle.js', 'pk32-variants.js', 'richman.js'];
files.forEach(file => S.loadGameFile(file));
const catalog = global.PK32Catalog;
const failures = [];
const results = [];
function elementCount(node) {
    if (!node) return 0;
    const children = Array.isArray(node.children) ? node.children : [];
    return 1 + children.reduce((sum, child) => sum + elementCount(child), 0);
}
for (const record of catalog) {
    const host = S.makeEl('div');
    let session;
    try {
        if (record.module) session = global.PK32Board.startUI(host, record.module.id, {});
        else if (record.casual) session = global.PK32Casual.startGame(host, record.casual, {});
        else if (record.action) session = global.PK32Action.startGame(host, record.action, {});
        else if (record.strategy) session = global.PK32Strategy.startGame(host, record.strategy, {});
        else if (record.card) session = global.PK32Card.startGame(host, record.card, {});
        else if (record.puzzle) session = global.PK32Puzzle.startGame(host, record.puzzle, {});
        else if (record.variant) session = global.PK32Variants.startGame(host, record.variant, {});
        else if (record.playable && record.playable.gameId === 'tower') session = global.PK32Tower.startUI(host, {});
        else if (record.playable && record.playable.gameId === 'pk32-richman') session = global.PK32Richman.start(host, {});
        else if (record.playable && global.MiniGames[record.playable.gameId]) session = global.MiniGames[record.playable.gameId].start(host, {});
        else throw new Error('no launcher');
        const rendered = elementCount(host);
        if (!rendered) throw new Error('launcher rendered an empty host');
        const launcher = record.module ? 'board' : record.casual ? 'casual' : record.action ? 'action' : record.strategy ? 'strategy' : record.card ? 'card' : record.puzzle ? 'puzzle' : record.variant ? 'variant' : record.playable ? record.playable.gameId : 'none';
        results.push({ index: record.index, name: record.name, launcher, rendered });
        if (session && typeof session.stop === 'function') session.stop();
        else if (session && typeof session.destroy === 'function') session.destroy();
    } catch (error) {
        failures.push(record.index + '. ' + record.name + ': ' + error.message);
    }
}
if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
}
const ledgerFile = require('path').join(__dirname, '..', 'output', 'pk32-reference', 'migration-ledger.json');
if (fs.existsSync(ledgerFile)) {
    const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    const byId = new Map(results.map(x => [x.index, x]));
    ledger.records = ledger.records.map(record => Object.assign({}, record, { launcherVerified: !!byId.get(record.index), launchVerifiedNodes: byId.get(record.index) ? byId.get(record.index).rendered : 0 }));
    ledger.lastLauncherVerification = new Date().toISOString();
    fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2));
}
console.log(JSON.stringify({ launched: catalog.length, failures: 0, rendered: results.length, launchers: [...new Set(results.map(x => x.launcher))].sort(), ledgerUpdated: fs.existsSync(ledgerFile) }));
