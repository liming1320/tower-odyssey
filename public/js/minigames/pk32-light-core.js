// PK32 智慧之光 原生状态机（纯逻辑，可独立在 Node 中回放验证）。
// 所有规则来自 output/pk32-reference/light-native-analysis.md 的反编译证据。
// 美术资源与坐标关系：sheet-7a90dd.png (PicForm26, Native RVA 0x7a90dd)。
(function (root) {
    'use strict';

    // Native RVA 0x1c32a10：点击自身的普通变换表（ordinary transform）。
    // 索引 0..59，值 = 变换后的自身代码。40..59 不变。
    var ORDINARY = [
        1, 0, 3, 2, 5, 4, 7, 6, 9, 8,            // 00..09
        11, 12, 12, 14, 15, 13, 17, 16, 19, 18,  // 10..19
        21, 20, 23, 22, 25, 24, 27, 26, 28, 29,  // 20..29
        30, 31, 33, 32, 35, 34, 36, 37, 38, 39,  // 30..39
        40, 41, 42, 43, 44, 45, 46, 47, 48, 49,  // 40..49
        50, 51, 52, 53, 54, 55, 56, 57, 58, 59   // 50..59
    ];

    var GRID_W = 16, GRID_H = 9;

    // 解码：cells 形如 "WW HH" + W*H 个两位数代码；居中到 16x9，无效/99 置 -1。
    // Native RVA 0x1c2fd15..0x1c30179：floor((16-W)/2), floor((9-H)/2)，仅复制 0..59。
    function decodeLevel(level) {
        var raw = String(level.cells).match(/.{1,2}/g).map(function (s) { return parseInt(s, 10); });
        var W = raw.shift(), H = raw.shift();
        var ox = Math.floor((GRID_W - W) / 2), oy = Math.floor((GRID_H - H) / 2);
        var grid = new Array(GRID_W * GRID_H).fill(-1);
        for (var y = 0; y < H; y++) {
            for (var x = 0; x < W; x++) {
                var c = raw[y * W + x];
                if (c === 99) c = -1;
                if (c >= 0 && c <= 59) grid[(oy + y) * GRID_W + (ox + x)] = c;
            }
        }
        return { W: W, H: H, ox: ox, oy: oy, grid: grid };
    }

    function inBounds(x, y) { return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H; }
    function valid(c) { return c >= 0 && c <= 59; }

    // Scope helper 0x1c32b40 + table 0x1c34684：返回相对偏移（不含自身 C）。
    function scopeOffsets(co) {
        // co 为点击后的自身代码（ORDINARY[orig]）。
        if (co === 0 || co === 1 || co === 10 || co === 11 || co === 13 || co === 14 || co === 15 || co === 16)
            return [[-1, 0], [1, 0], [0, -1], [0, 1]];          // C,L,R,U,D
        if (co === 2 || co === 3) {                              // 8 邻
            var n = [];
            for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (dx || dy) n.push([dx, dy]);
            return n;
        }
        if (co === 4 || co === 5) {                             // 半径 2 外环
            var r = [];
            for (var ry = -2; ry <= 2; ry++) for (var rx = -2; rx <= 2; rx++)
                if ((Math.abs(rx) === 2 || Math.abs(ry) === 2) && !(rx === 0 && ry === 0)) r.push([rx, ry]);
            return r;
        }
        if (co === 6 || co === 7) {                             // 整行 + 整列
            var rc = [];
            for (var cx = 0; cx < GRID_W; cx++) if (cx !== 0) rc.push([cx, 0]);
            for (var cy = 0; cy < GRID_H; cy++) if (cy !== 0) rc.push([0, cy]);
            return rc;
        }
        if (co === 8 || co === 9) {                             // 双对角线
            var d = [];
            for (var t = -GRID_W; t <= GRID_W; t++) if (t) { d.push([t, t]); d.push([t, -t]); }
            return d;
        }
        if (co === 12 || co === 17 || co === 18 || co === 19 || co === 28 || co === 29 || co === 32 || co === 34 || co === 46 || co === 50)
            return [];                                          // 空作用域
        if (co === 20 || co === 21) return [[-1, 0]];           // C+L
        if (co === 22 || co === 23) return [[1, 0]];            // C+R
        if (co === 24 || co === 25) return [[0, -1]];           // C+U
        if (co === 26 || co === 27) return [[0, 1]];            // C+D
        if (co === 30 || co === 33) return [[-1, 0], [1, 0]];   // L,R（特殊，作为兜底）
        if (co === 31 || co === 35) return [[0, -1], [0, 1]];   // U,D
        if (co === 36 || co === 37) { var rrow = []; for (var x1 = 0; x1 < GRID_W; x1++) if (x1) rrow.push([x1, 0]); return rrow; }
        if (co === 38 || co === 39) { var rcol = []; for (var y1 = 0; y1 < GRID_H; y1++) if (y1) rcol.push([0, y1]); return rcol; }
        if (co === 40 || co === 43 || co === 47 || co === 48 || co === 49 || co === 54 || co === 55 || co === 56) {
            var a8 = []; for (var ey = -1; ey <= 1; ey++) for (var ex = -1; ex <= 1; ex++) if (ex || ey) a8.push([ex, ey]); return a8;
        }
        if (co === 41 || co === 44 || co === 51 || co === 52 || co === 53 || co === 57 || co === 58 || co === 59)
            return [[-1, 0], [1, 0], [0, -1], [0, 1]];          // L,R,U,D
        if (co === 42 || co === 45) return [[-1, -1], [-1, 1], [1, 1], [1, -1]]; // UL,UR,DL,DR
        return [];
    }

    // 特殊分发 0x1c32940：30/33 交换 L,R；31/35 交换 U,D；36/37 行循环；38/39 列循环；40..59 环形。
    function applySpecial(state, c, gx, gy) {
        var idx = gy * GRID_W + gx;
        function swap(a, b) { var t = state.grid[a[1] * GRID_W + a[0]]; state.grid[a[1] * GRID_W + a[0]] = state.grid[b[1] * GRID_W + b[0]]; state.grid[b[1] * GRID_W + b[0]] = t; }
        if (c === 30 || c === 33) {
            var L = [gx - 1, gy], R = [gx + 1, gy];
            if (inBounds(L[0], L[1]) && inBounds(R[0], R[1])) { swap(L, R); if (c === 33) state.grid[idx] = 32; }
            return;
        }
        if (c === 31 || c === 35) {
            var U = [gx, gy - 1], D = [gx, gy + 1];
            if (inBounds(U[0], U[1]) && inBounds(D[0], D[1])) { swap(U, D); if (c === 35) state.grid[idx] = 34; }
            return;
        }
        if (c === 36 || c === 37) {
            var xs = []; for (var x = 0; x < GRID_W; x++) { var xi = gy * GRID_W + x; if (valid(state.grid[xi])) xs.push(x); }
            if (xs.length) {
                var xvals = xs.map(function (x) { return state.grid[gy * GRID_W + x]; });
                var xn = xvals.length, xrot = xvals.map(function (_, i) { return xvals[(i + (c === 36 ? 1 : xn - 1)) % xn]; });
                xs.forEach(function (x, i) { state.grid[gy * GRID_W + x] = xrot[i]; });
            }
            return;
        }
        if (c === 38 || c === 39) {
            var ys = []; for (var y = 0; y < GRID_H; y++) { var yi = y * GRID_W + gx; if (valid(state.grid[yi])) ys.push(y); }
            if (ys.length) {
                var yvals = ys.map(function (y) { return state.grid[y * GRID_W + gx]; });
                var yn = yvals.length, yrot = yvals.map(function (_, i) { return yvals[(i + (c === 38 ? 1 : yn - 1)) % yn]; });
                ys.forEach(function (y, i) { state.grid[y * GRID_W + gx] = yrot[i]; });
            }
            return;
        }
        // 环形：A=[L,DL,D,DR,R,UR,U,UL] B=[L,D,R,U] E=[UL,DL,DR,UR]
        var ring = null;
        if (c === 40 || c === 43 || c === 47 || c === 48 || c === 49 || c === 54 || c === 55 || c === 56)
            ring = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];
        else if (c === 41 || c === 44 || c === 51 || c === 52 || c === 53 || c === 57 || c === 58 || c === 59)
            ring = [[-1, 0], [0, 1], [1, 0], [0, -1]];
        else if (c === 42 || c === 45)
            ring = [[-1, -1], [-1, 1], [1, 1], [1, -1]];
        if (!ring) return;
        if (!ring.every(function (p) { return inBounds(gx + p[0], gy + p[1]); })) return; // 整环须在界内
        var pos = ring.map(function (p) { return [gx + p[0], gy + p[1]]; });
        var vals = pos.map(function (p) { return state.grid[p[1] * GRID_W + p[0]]; });
        var left = (c === 40 || c === 47 || c === 48 || c === 49 || c === 54 || c === 55 || c === 56) ||
                   (c === 41 || c === 51 || c === 52 || c === 53 || c === 57 || c === 58 || c === 59) ||
                   (c === 42);
        var rn = vals.length;
        var rot = vals.map(function (_, i) { return vals[(i + (left ? 1 : rn - 1)) % rn]; });
        pos.forEach(function (p, i) { state.grid[p[1] * GRID_W + p[0]] = rot[i]; });
        // 消耗计数：使用后改变自身代码
        var usage = { 47: 46, 48: 47, 49: 48, 54: 46, 55: 54, 56: 55, 51: 50, 52: 51, 53: 52, 57: 50, 58: 57, 59: 58 };
        if (usage[c] != null) state.grid[idx] = usage[c];
    }

    // 后处理 0x1c3227c..0x1c3292e：扫描 x 外 0..15，y 内 0..8，原位做一次。28 减、29 增，影响 8 邻。
    function postprocess(state) {
        for (var x = 0; x < GRID_W; x++) {
            for (var y = 0; y < GRID_H; y++) {
                var idx = y * GRID_W + x;
                var code = state.grid[idx];
                if (code === 28) applyNeighborDelta(state, x, y, false);
                else if (code === 29) applyNeighborDelta(state, x, y, true);
            }
        }
    }
    function applyNeighborDelta(state, x, y, inc) {
        var deltas = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
        for (var k = 0; k < deltas.length; k++) {
            var nx = x + deltas[k][0], ny = y + deltas[k][1];
            if (!inBounds(nx, ny)) continue;
            var ni = ny * GRID_W + nx, v = state.grid[ni];
            if (!valid(v)) continue;
            state.grid[ni] = inc ? inc28(v) : dec28(v);
        }
    }
    function dec28(v) {
        if ([1, 3, 5, 7, 9, 17, 19, 21, 23, 25, 27, 33, 35].indexOf(v) >= 0) return v - 1;
        if (v === 11) return 10;
        if (v === 13 || v === 14) return 12;
        return v;
    }
    function inc28(v) {
        if ([0, 2, 4, 6, 8, 16, 18, 20, 22, 24, 26, 32, 34].indexOf(v) >= 0) return v + 1;
        if (v === 10 || v === 11) return 12;
        if (v === 12 || v === 13) return 14;
        return v;
    }

    // 胜利判定 0x1c34740：无代码落在暗状态集合。
    var DARK = [0, 2, 4, 6, 8, 10, 12, 13, 14, 16, 18, 20, 22, 24, 26];
    function isWin(state) {
        for (var i = 0; i < state.grid.length; i++) {
            var v = state.grid[i];
            if (!valid(v)) continue;
            if (DARK.indexOf(v) >= 0) return false;
        }
        return true;
    }

    // 点击（gx,gy 为 16x9 网格坐标，即原版演示坐标）。返回是否产生了有效操作。
    function click(state, gx, gy) {
        if (!inBounds(gx, gy)) return false;
        var idx = gy * GRID_W + gx;
        var c = state.grid[idx];
        if (!valid(c)) return false;
        var co = ORDINARY[c];
        state.grid[idx] = co;                       // 自身普通变换
        if (co >= 30) {
            applySpecial(state, c, gx, gy);         // 特殊分发（按原始 c 决定行为）
        } else {
            var offs = scopeOffsets(co);
            for (var o = 0; o < offs.length; o++) {
                var nx = gx + offs[o][0], ny = gy + offs[o][1];
                if (!inBounds(nx, ny)) continue;
                var ni = ny * GRID_W + nx;
                if (!valid(state.grid[ni])) continue;
                state.grid[ni] = ORDINARY[state.grid[ni]];
            }
        }
        postprocess(state);
        return true;
    }

    // 演示坐标约定：原生 0-based 网格坐标（直接落在 16x9 网格，与反编译文档 "XXYY" 一致）。
    // 棋盘在 16x9 内居中，故演示坐标即网格绝对坐标，无需叠加偏移。
    function blToGrid(state, gx, gy) {
        return [gx, gy];
    }

    // 回放：对给定关卡套用一组 0-based 网格坐标点击，返回结果。
    function runDemo(level, clicks) {
        var state = decodeLevel(level);
        var applied = 0;
        var invalid = 0;
        for (var i = 0; i < clicks.length; i++) {
            var ok = click(state, clicks[i][0], clicks[i][1]);
            if (ok) applied += 1; else invalid += 1;
        }
        return { win: isWin(state), grid: state.grid, clicksApplied: applied, invalid: invalid };
    }

    var API = {
        GRID_W: GRID_W, GRID_H: GRID_H, ORDINARY: ORDINARY, DARK: DARK,
        decodeLevel: decodeLevel, scopeOffsets: scopeOffsets, applySpecial: applySpecial,
        postprocess: postprocess, isWin: isWin, click: click, runDemo: runDemo, blToGrid: blToGrid
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (root) root.PK32LightCore = API;
})(typeof window !== 'undefined' ? window : null);
