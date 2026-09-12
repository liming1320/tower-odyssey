const fs = require('fs');
const vm = require('vm');
const Stub = require('./mg-dom-stub');

const S = Stub.install();
const files = ['pk32.js', 'pk32-board.js', 'pk32-casual.js', 'pk32-action.js', 'pk32-strategy.js', 'pk32-tower.js', 'pk32-richman.js', 'pk32-card.js', 'pk32-puzzle.js', 'pk32-variants.js', 'richman.js'];
files.forEach(file => S.loadGameFile(file));
const catalog = global.PK32Catalog;
const failures = [];
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
console.log(JSON.stringify({ launched: catalog.length, failures: 0 }));
