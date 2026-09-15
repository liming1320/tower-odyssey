'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const base = process.env.PK32_BASE_URL || 'http://127.0.0.1:5180';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, response => {
            let body = '';
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
        }).on('error', reject);
    });
}

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

class CDP {
    constructor(ws, onEvent) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        ws.on('message', data => {
            const message = JSON.parse(data);
            if (!message.id) { if (onEvent) onEvent(message); return; }
            const resolve = this.pending.get(message.id);
            if (!resolve) return;
            this.pending.delete(message.id);
            resolve(message);
        });
    }

    send(method, params) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(method + ' timeout')), 8000);
            this.pending.set(id, message => { clearTimeout(timer); resolve(message); });
        });
    }

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
        });
        if (result.result && result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text || 'Runtime.evaluate failed');
        return result.result && result.result.result ? result.result.result.value : undefined;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

(async () => {
    const source = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'pk32-peg-native-boards.json'), 'utf8'));
    assert(source.name === '独粒钻石' && source.count === 17 && source.levels.length === 17, 'native peg data count mismatch');
    function hasOpeningMove(cells) {
        const occupied = index => cells[index] === '1';
        for (let index = 0; index < cells.length; index += 1) {
            if (!occupied(index)) continue;
            const row = Math.floor(index / 7), col = index % 7;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const middleRow = row + dr, middleCol = col + dc, targetRow = row + dr * 2, targetCol = col + dc * 2;
                if (targetRow >= 0 && targetRow < 7 && targetCol >= 0 && targetCol < 7 && middleRow >= 0 && middleRow < 7 && middleCol >= 0 && middleCol < 7 && occupied(middleRow * 7 + middleCol) && cells[targetRow * 7 + targetCol] === '0') return true;
            }
        }
        return false;
    }
    source.levels.forEach((level, index) => {
        assert(/^[x01]{49}$/.test(level.cells), 'native peg board encoding mismatch at level ' + (index + 1));
    });
    const port = await freePort();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk32-peg-cdp-'));
    const chrome = spawn(chromePath, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://',
        '--proxy-bypass-list=*', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank'
    ], { stdio: 'ignore' });
    let ws;
    try {
        let targets;
        for (let attempt = 0; attempt < 50; attempt += 1) {
            try { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); } catch (_) {}
            if (targets && targets.some(item => item.type === 'page')) break;
            await sleep(100);
        }
        const page = (targets || []).find(item => item.type === 'page');
        assert(page && page.webSocketDebuggerUrl, 'Chrome page target unavailable');
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const protocolErrors = [];
        const cdp = new CDP(ws, message => {
            if (message.method === 'Runtime.exceptionThrown' || message.method === 'Log.entryAdded' && message.params && message.params.entry && message.params.entry.level === 'error') protocolErrors.push(message);
        });
        cdp.send('Runtime.enable');
        cdp.send('Page.enable');
        cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await cdp.send('Page.navigate', { url: base + '?pk32-peg-cdp=' + Date.now() });
        await cdp.evaluate(`new Promise(resolve => {
            const wait = () => window.PK32Puzzle ? resolve(true) : setTimeout(wait, 25);
            wait();
        })`);
        const result = await cdp.evaluate(`(async () => {
            const host = document.createElement('div');
            host.id = 'pk32-peg-cdp-host';
            document.body.appendChild(host);
            window.__MG_TEST = true;
            const errors = [];
            const onError = event => errors.push(event.message || String(event.error || 'window error'));
            window.addEventListener('error', onError);
            const game = window.PK32Puzzle.startGame(host, '独粒钻石', {});
            for (let i = 0; i < 200; i += 1) {
                if (host.querySelectorAll('.native-cell').length === 49) break;
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            const cells = () => [...host.querySelectorAll('.native-cell')];
            const snapshot = () => cells().map(cell => cell.dataset.code);
            const before = snapshot();
            const options = host.querySelectorAll('.native-level option').length;
            let move = null;
            for (let index = 0; index < before.length && !move; index += 1) {
                if (before[index] !== '1') continue;
                const row = Math.floor(index / 7), col = index % 7;
                for (const direction of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const middleRow = row + direction[0], middleCol = col + direction[1];
                    const targetRow = row + direction[0] * 2, targetCol = col + direction[1] * 2;
                    const middle = middleRow * 7 + middleCol, target = targetRow * 7 + targetCol;
                    if (middleRow >= 0 && middleRow < 7 && middleCol >= 0 && middleCol < 7 && targetRow >= 0 && targetRow < 7 && targetCol >= 0 && targetCol < 7 && before[middle] === '1' && before[target] === '0') {
                        move = { source: index, middle, target, code: before[index] };
                        break;
                    }
                }
            }
            if (move) {
                cells()[move.source].click();
                cells()[move.target].click();
            }
            await new Promise(resolve => setTimeout(resolve, 30));
            const after = snapshot();
            const remainingPieces = after.filter(code => code === '1').length;
            const status = host.querySelector('.msg')?.textContent || '';
            const singleJump = { source: move ? after[move.source] : null, middle: move ? after[move.middle] : null, target: move ? after[move.target] : null };
            const fixture = Array(49).fill('x');
            fixture[21] = '1'; fixture[22] = '1'; fixture[23] = '0'; fixture[24] = '1'; fixture[25] = '0';
            window.__pk32PegDebug.setBoard(fixture);
            let fixtureCells = [...host.querySelectorAll('.native-cell')];
            fixtureCells[21].click(); fixtureCells = [...host.querySelectorAll('.native-cell')]; fixtureCells[23].click();
            const firstChainJump = window.__pk32PegDebug.getState();
            fixtureCells = [...host.querySelectorAll('.native-cell')]; fixtureCells[25].click();
            const secondChainJump = window.__pk32PegDebug.getState();
            host.querySelector('.pk32p').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
            const afterChainUndo = window.__pk32PegDebug.getState();
            const overflow = { innerWidth: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth };
            window.removeEventListener('error', onError);
            if (game && game.destroy) game.destroy();
            return {
                cellCount: before.length, options, move, source: singleJump.source, middle: singleJump.middle, target: singleJump.target, remainingPieces, status,
                firstChainJump: { selected: firstChainJump.selected, chainActive: firstChainJump.chainActive, moves: firstChainJump.moves },
                secondChainJump: { moves: secondChainJump.moves, target: secondChainJump.board[25], ended: secondChainJump.ended },
                afterChainUndo: { moves: afterChainUndo.moves, segment: afterChainUndo.board.slice(21, 26).join('') },
                overflow, errors
            };
        })()`);
        const checks = [
            ['17 native boards are selectable', result.options === 17],
            ['7x7 native board loads', result.cellCount === 49],
            ['a legal jump is found', !!result.move],
            ['jump clears source and middle', result.source === '0' && result.middle === '0'],
            ['jump moves the original piece', result.move && result.target === result.move.code],
            ['status reports the actual remaining piece count', result.status.includes('剩余棋子：' + result.remainingPieces)],
            ['continuous jump keeps the moved piece selected', result.firstChainJump.chainActive && result.firstChainJump.selected === 23],
            ['two continuous jumps count as one move', result.secondChainJump.moves === 1 && result.secondChainJump.target === '1' && result.secondChainJump.ended],
            ['undo restores the complete continuous move', result.afterChainUndo.moves === 0 && result.afterChainUndo.segment === '11010'],
            ['mobile board does not overflow', result.overflow.document <= result.overflow.innerWidth && result.overflow.body <= result.overflow.innerWidth],
            ['no page runtime error', protocolErrors.length === 0 && result.errors.length === 0]
        ];
        for (const [name, passed] of checks) console.log((passed ? 'PASS ' : 'FAIL ') + name);
        console.log(JSON.stringify({ game: '独粒钻石', result, protocolErrors }, null, 2));
        if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
    } finally {
        if (ws) ws.close();
        chrome.kill();
    }
})().catch(error => { console.error('FAIL peg-cdp ' + (error.stack || error)); process.exitCode = 1; });
