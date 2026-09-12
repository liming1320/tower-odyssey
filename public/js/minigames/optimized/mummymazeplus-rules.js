// Pure puzzle model: orthogonal movement, edge walls, deterministic pursuit.
(function (root) {
    const actions = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
    const edge = (a, b) => a < b ? a + ':' + b : b + ':' + a;
    function neighbor(level, at, dx, dy) {
        const x = at % level.n + dx, y = Math.floor(at / level.n) + dy;
        if (x < 0 || y < 0 || x >= level.n || y >= level.n) return -1;
        const next = y * level.n + x;
        return level.walls.has(edge(at, next)) ? -1 : next;
    }
    function turn(level, state, action) {
        const [dx, dy] = actions[action] || [0, 0];
        const hero = neighbor(level, state.hero, dx, dy);
        if (hero < 0) return null;
        let mummy = state.mummy;
        if (hero === mummy) return { hero, mummy, lost: true };
        if (hero === level.exit) return { hero, mummy, won: true };
        for (let i = 0; i < 2; i++) {
            const sx = Math.sign(hero % level.n - mummy % level.n);
            const sy = Math.sign(Math.floor(hero / level.n) - Math.floor(mummy / level.n));
            const axes = level.red ? [[0, sy], [sx, 0]] : [[sx, 0], [0, sy]];
            for (const [ax, ay] of axes) {
                if (!ax && !ay) continue;
                const next = neighbor(level, mummy, ax, ay);
                if (next >= 0) { mummy = next; break; }
            }
            if (hero === mummy) return { hero, mummy, lost: true };
        }
        return { hero, mummy };
    }
    function solve(level, initial) {
        const key = s => s.hero * level.n * level.n + s.mummy;
        const queue = [{ state: initial, parent: -1, action: -1 }];
        const seen = new Set([key(initial)]);
        for (let head = 0; head < queue.length && head < 6000; head++) {
            const node = queue[head];
            if (node.state.won || node.state.hero === level.exit) {
                const result = []; let i = head;
                while (queue[i].parent >= 0) { result.push(queue[i].action); i = queue[i].parent; }
                return result.reverse();
            }
            for (let a = 0; a < actions.length; a++) {
                const state = turn(level, node.state, a);
                if (!state || state.lost || seen.has(key(state))) continue;
                seen.add(key(state)); queue.push({ state, parent: head, action: a });
            }
        }
        return null;
    }
    function generate(index) {
        let seed = (index + 1) * 104729;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const n = 6 + Math.min(2, Math.floor(index / 20));
        let fallback = null;
        for (let attempt = 0; attempt < 180; attempt++) {
            const level = { n, walls: new Set(), exit: n - 1, red: index >= 12 && index % 2 === 0,
                initial: { hero: n * (n - 1), mummy: Math.floor(random() * (n * n - n)) } };
            for (let p = 0; p < n * n; p++) {
                if (p % n < n - 1 && random() < .28) level.walls.add(edge(p, p + 1));
                if (p < n * (n - 1) && random() < .28) level.walls.add(edge(p, p + n));
            }
            const solution = solve(level, level.initial);
            if (solution && solution.length >= 6) {
                level.solution = solution; fallback = level;
                if (solution.length >= 10 + Math.min(12, Math.floor(index / 4))) return level;
            }
        }
        if (fallback) return fallback;
        // Deterministic fallback: the mummy is enclosed; the perimeter route remains open.
        const m = n + 1, level = { n, walls: new Set([edge(m, m - 1), edge(m, m + 1), edge(m, m - n), edge(m, m + n)]), exit: n - 1,
            red: false, initial: { hero: n * (n - 1), mummy: m } };
        level.solution = solve(level, level.initial);
        return level;
    }
    const api = { actions, edge, neighbor, turn, solve, generate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.MummyMazePlusRules = api;
})(typeof window === 'undefined' ? globalThis : window);
