// 小游戏引擎 · 本地多人/轮流框架（mg-localmp.js）—— 玩法 B10
window.MG = window.MG || {}; var MG = window.MG;
// 统一回合顺序与当前玩家：棋牌/卡牌类游戏可调用 MG.localMP(n) 拿到回合管理器，
// 而不必各自实现一套 pass-and-play 逻辑。
MG.localMP = function (n) {
    n = Math.max(2, n | 0);
    const o = {
        n, idx: 0, names: [], _cb: null,
        name(i, nm) { if (i >= 0 && i < n) this.names[i] = nm; },
        current() { return this.idx; },
        currentName() { return this.names[this.idx] || ('P' + (this.idx + 1)); },
        start(cb) { this._cb = cb; this._emit(); },
        _emit() { try { this._cb && this._cb(this.idx, this.currentName()); } catch (e) {} },
        next() { this.idx = (this.idx + 1) % this.n; this._emit(); },
        pass() { this.next(); },
        reset() { this.idx = 0; this._emit(); },
    };
    return o;
};
