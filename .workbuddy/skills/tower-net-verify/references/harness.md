# harness.md — copy-paste networking test scaffold

## `makeClient` helper (real `ws`, event-driven)

Paste this into any `tools/verify-*.js`. It keeps the relay's "sender is excluded from broadcast"
contract honest and gives you `waitFor` / `waitForNone` assertion helpers.

```js
process.env.MG_ROOMS_OFF = '1';            // set '0'/omit to exercise disk snapshot + restoreRooms
const http = require('http');
const WebSocket = require('ws');
const { attach } = require('../server/ws-relay');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

function makeClient(url) {
  const ws = new WebSocket(url);
  const handlers = {};
  const c = {
    ws, slot: null, room: null, side: null,
    open: () => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); }),
    send(type, data) { ws.send(JSON.stringify({ type, data })); },
    on(type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); },
    // resolves with the data of the FIRST matching message; rejects on timeout
    waitFor(type, timeout = 3000) {
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout: ' + type)), timeout);
        c.on(type, d => { clearTimeout(t); res(d); });
      });
    },
    // resolves with the message if it ARRIVES, or null after `timeout` (proves dedup/interception)
    waitForNone(type, timeout = 800) {
      return new Promise(res => {
        const h = d => { clearTimeout(t); res(d); };
        const t = setTimeout(() => res(null), timeout);
        c.on(type, h);
      });
    },
    close() { try { ws.terminate(); } catch (e) {} },   // abrupt drop → peer_gone / reconnect tests
  };
  ws.on('message', buf => {
    let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
    (handlers[m.type] || []).forEach(h => h(m.data));
  });
  return c;
}
```

## Minimal end-to-end skeleton

```js
(async () => {
  const server = http.createServer();
  attach(server);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const url = `ws://127.0.0.1:${port}/ws/minigame`;

  // 1) host creates a room
  const A = makeClient(url);
  await A.open();
  A.send('lobby', { game: 'gomoku', cap: 2 });
  A.send('join', { game: 'gomoku', cap: 2, create: true, me: 'A' });
  const aSeat = await A.waitFor('seat'); A.room = aSeat.room;
  B.send('join', { game: 'gomoku', cap: 2, room: A.room, me: 'B' });
  const [aStart, bStart] = await Promise.all([A.waitFor('start'), B.waitFor('start')]);
  A.slot = aStart.slot; A.side = aStart.side;
  B.slot = bStart.slot; B.side = bStart.side;

  // 2) SEND first, then await — never the other way around
  let bCount = 0;
  B.on('input', () => bCount++);
  A.send('input', { _seq: 1, board: [1], turn: 1 - A.side });   // <-- send BEFORE waitFor
  const b1 = await B.waitFor('input', 3000);
  ok(b1 && b1._seq === 1 && bCount === 1, 'B received seq=1');

  // 3) prove a duplicate is dropped
  A.send('input', { _seq: 1, board: [1], turn: 1 - A.side });
  const dup = await B.waitForNone('input', 800);
  ok(dup == null && bCount === 1, 'duplicate seq=1 dropped (count still 1)');

  A.close(); B.close();
  console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
  try { server.close(); } catch (e) {}
  setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
```

## Checklist before declaring a new gate green

- [ ] `ws` is the real module (not stubbed); relay mounted via `attach(server)` on `port 0`.
- [ ] Every `waitFor` is preceded by the `send` that triggers the message.
- [ ] Dedup / interception assertions use `waitForNone` and read the `null` result as success.
- [ ] All client data reads the `_seq` field (underscore), never `seq`.
- [ ] `side=-1` spectator peers are excluded from player counts and from `opp`/`seats`.
- [ ] `process.exit(fail ? 1 : 0)` so a deploy gate can fail the build on regression.
