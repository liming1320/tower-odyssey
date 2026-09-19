// 小游戏引擎 · 联机对战「游戏内同步」层（mg-pvp.js）—— 体验 E1 的真正落地
// 采用 状态同步（state-sync）模型：本地落子后，把整盘可序列化状态发给对手；
// 对手直接 setState 并重绘。回合用 side(0/1) 交替，0 号永远先手。
//
// 游戏接入只需 3 步（全部 opt-in，单人/PvE 完全不受影响）：
//   1) start 开头：if (MG.pvp.shouldBegin('gomoku')) MG.pvp.begin({ setState, onOver });
//   2) 输入处理函数：if (MG.pvp.active && !MG.pvp.canMove()) return;   // 没轮到就锁输入
//   3) 本地落子后：const next = 1 - mySide; MG.pvp.commit({ board: 序列化状态, turn: next, over: 终局? });
//      远端收到后 _recv → adapter.setState(整盘) 重绘；若带 over 则 onOver(结果) 双端展示。
//
// 为什么用状态同步而不是走子中继：棋类游戏落子语义各异（吃子/翻棋/升变/跳河），
// 逐游戏编码走子成本高且易错；整盘同步天然一致、带宽极小（棋盘仅数 KB）。
window.MG = window.MG || {};
MG.pvp = (function () {
    const api = {
        active: false,        // 是否处在联机对局中
        game: null,           // 当前游戏 id
        side: 0,              // 我方 side（0..cap-1；观战者=-1），由服务端 room.side 决定
        cap: 2,               // 房间容量（棋类 2、强手棋/大富翁 4），回合按 modulo 轮转
        _turn: 0,             // 当前应走方 side（0..cap-1）
        _adapter: null,       // { setState(msg), onOver(over) }
        _armed: null,         // { game, side, opp, cap, seats, viewer } —— 在 room/start 事件时写入

        // 由 _launchNet 在收到 start 事件时调用：武装本局对战信息。
        //   opt.cap   房间容量（默认 2）；opt.seats 服务端下发的座位快照（含昵称，按 side 索引）；opt.viewer 是否为观战者
        //   观战者 side=-1：canMove 恒 false（永不轮到），只接收 setState 重绘，不能落子。
        //   opt.race：竞速模式（如 2048 竞速）——双方独立棋盘、均可落子，不按回合锁输入；
        //     canMove 恒 true（仍受 active 限制）。普通棋类不传即走回合锁。
        arm(game, side, opp, opt) {
            opt = opt || {};
            this._armed = { game: game, side: (side == null ? 0 : side), opp: opp || null, cap: opt.cap || 2, seats: opt.seats || null, viewer: !!opt.viewer, race: !!opt.race };
        },

        // 游戏 start 开头调用：若是本游戏的联机对局则进入 pvp 模式，返回 true
        shouldBegin(gameId) { return !!(this._armed && this._armed.game === gameId); },

        begin(adapter) {
            if (!this._armed) return false;
            this.active = true;
            this.game = this._armed.game;
            this.side = this._armed.side;
            this.cap = this._armed.cap || 2;
            this._turn = 0;                       // 0 号永远先手
            this._adapter = adapter || null;
            if (this._armed.opp && MG.match) MG.match.setOpp(this._armed.opp);
            const self = this;
            // 只关心 input（服务器在房间内把一方的 input 原样转发给另一端/其余玩家）
            MG.net.on('input', function (m) { self._recv(m || {}); });
            return true;
        },

        // 我方现在能否落子（非联机时恒 true；联机时仅轮到我方；观战者 side=-1 永不轮到）。
        // 竞速模式（_armed.race）：双方均可落子，canMove 恒 true（仍受 active 限制）。
        canMove() { return !this.active || (this._armed && this._armed.race) || this._turn === this.side; },

        // 我方刚落子：state = { board, turn, over? }；切到下一回合并广播。
        // turn 由游戏显式给出（棋类 1-side、强手棋 (turn+1)%cap）；未给则按 cap 兜底轮转。
        commit(state) {
            if (!this.active) return;
            this._turn = (state && state.turn != null) ? state.turn : (this._turn + 1) % this.cap;
            try { MG.net.send('input', state); } catch (e) {}
        },

        _recv(m) {
            if (!this.active || !m) return;
            if (m.turn != null) this._turn = m.turn;
            try { if (this._adapter && this._adapter.setState) this._adapter.setState(m); } catch (e) {}
            if (m.over != null && this._adapter && this._adapter.onOver) {
                try { this._adapter.onOver(m.over); } catch (e) {}
            }
        },

        // 终局冗余上报（双端各自按本地规则也能判定；这里加速对手展示）
        reportOver(over) {
            if (this.active) { try { MG.net.send('input', { turn: this._turn, over: over }); } catch (e) {} }
        },

        // 断线重连续局：由大厅在收到服务端 resume 消息时调用。重设回合并重建棋盘（不重复 begin，
        // 保留既有 input 监听与 active 态），从而掉线期间对手的走法也能被还原到本地盘面。
        resume(state) {
            if (!this.active) {
                if (!this._armed) return;
                this.active = true; this.game = this._armed.game; this.side = this._armed.side; this.cap = this._armed.cap || 2; this._turn = 0;
                this._adapter = this._adapter || null;
                const self = this;
                MG.net.on('input', function (m) { self._recv(m || {}); });
            }
            if (state) {
                if (state.turn != null) this._turn = state.turn;
                try { if (this._adapter && this._adapter.setState) this._adapter.setState(state); } catch (e) {}
            }
        },

        end() {
            this.active = false; this.game = null; this._adapter = null; this._armed = null; this._turn = 0;
        },
    };
    return api;
})();
