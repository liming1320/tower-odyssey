---
name: tower-net-verify
description: This skill should be used when writing or debugging regression tests for the tower-odyssey realtime networking layer (server/ws-relay.js, public/js/minigames/engine/mg-net.js, mg-pvp.js, public/js/views/minigames.js). It provides the event-driven "real websocket" test harness pattern and the known protocol pitfalls (the `_seq` field-name, waitFor ordering, the waitForNone rewrite) so new game/relay behaviors can be covered without sleep-based flakiness.
agent_created: true
---

# tower-net-verify — 联机回归测试（真 ws 事件驱动）

## Overview

The tower-odyssey networking stack (`server/ws-relay.js` + client `mg-net.js` / `mg-pvp.js` /
`minigames.js`) is exercised by standalone Node scripts under `tools/verify-*.js`. These scripts
mount the **real** relay on a throwaway port and drive **real `ws` clients** — no browser, no mocks.
They assert behavior **event-driven** (wait for the exact message you expect) so they never rely on
`sleep()` polling and never flake on timing.

Use this skill whenever you add or change any networking behavior (a new game going online, 4-player
sync, spectate, seq dedup, room snapshots, reconnect/resume) and need a green regression gate.

## When to use

- Adding a new minigame to `NET_WIRED` or widening `cap` beyond 2 (N-player sync).
- Changing the relay message contract (`input`/`state`/`sync`/`start`/`seat`/`resume`/`peer_*`/
  `spectate`/`leave`).
- Touching `mg-net.send`, the seq dedup, the spectate path, or room snapshot persistence.
- Reproducing a "duplicate move" / "out-of-order packet" / "reconnect shows wrong board" bug.

## Workflow

1. **Mount the relay on a temp port.** Reuse the existing harness shape:
   ```js
   process.env.MG_ROOMS_OFF = '1';            // skip disk snapshot unless testing it
   const http = require('http');
   const WebSocket = require('ws');          // real ws, NOT a stub
   const { attach } = require('../server/ws-relay');
   const server = http.createServer();
   attach(server);
   await new Promise(r => server.listen(0, r)); // port 0 = OS picks a free port
   const url = `ws://127.0.0.1:${server.address().port}/ws/minigame`;
   ```
2. **Build clients with the shared `makeClient` helper** (see `references/harness.md`). It exposes
   `open()`, `send(type,data)`, `on(type,fn)`, `waitFor(type,timeout)`, `waitForNone(type,timeout)`,
   and `close()` (use `ws.terminate()` to simulate an abrupt drop for reconnect/peer_gone tests).
3. **Drive the lobby→seat→start flow**, then assert. Put `await client.waitFor('X')` **after** the
   `send` that triggers it — never before (see pitfalls).
4. **Exit non-zero on any failure** so a CI/webhook step can block a bad deploy:
   `setTimeout(() => process.exit(fail ? 1 : 0), 200);` and print `PASS n / FAIL m`.
5. **Run it**: `node tools/verify-xxx.js`. All five current gates are green:
   `verify-reconnect.js` (14/0), `verify-4p.js` (15/0), `verify-persist.js` (12/0),
   `verify-seq.js` (5/0), `verify-spectate.js` (8/0).

## Key pitfalls (already paid for — do not relearn)

- **Field name is `_seq`, not `seq`.** `MG.net.send` stamps `data._seq` (underscore) on
  `input`/`state`/`sync`; the relay forwards `d` intact so the wire keeps `_seq`. Asserting
  `d.seq` silently mismatches → phantom "dedup dropped the packet" failures. Always read `d._seq`.
- **`waitFor` must come AFTER `send`.** Writing `await B.waitFor('input')` before `A.send('input')`
  deadlocks — B never receives anything because A never sent it. Send first, then await.
- **`waitForNone` must resolve on timeout.** A naive `setTimeout(() => rej(...), t)` never resolves
  when the message correctly does NOT arrive. Rewrite as `setTimeout(() => res(null), t)` then register
  the handler; treat `null` as "correctly absent" (used to prove dedup/interception dropped a packet).
- **Assert on the relay's broadcast, not on a single client's echo.** The sender is excluded from
  forwarding (`p.ws !== ws`), so the sender never receives its own `input` — only peers do.
- **Spectators (`side=-1`) must not appear as players.** The relay filters `viewer` peers out of
  `opp`/`seats` and ignores their `input`. Tests that count players must exclude `p.viewer`.
- **Room snapshots persist only started rooms.** `MG_ROOMS_OFF=1` disables disk I/O for unit runs;
  to test resume-after-restart, leave it on and use `MG_ROOMS_FILE` pointing at a temp dir.

## Resources

- `references/harness.md` — copy-paste `makeClient` template plus a minimal end-to-end verify skeleton.
