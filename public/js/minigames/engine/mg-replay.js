// 小游戏引擎 · 输入录制/回放（mg-replay.js）—— Tier1-3
// 说明：MG.ri 为 Math.random 驱动、不可重置种子，故本模块录制「玩家输入流」而非确定性复现。
// 随机局不会逐帧一致，但输入回放对「复盘/分享操作」仍极具价值。
window.MG = window.MG || {}; var MG = window.MG;
MG.replay = {
    // 在 E.def 画布游戏 start 前调用：返回 recorder；引擎自动把 tap/key 推入 rec.events
    record(api, seed) {
        const rec = { seed: seed != null ? seed : 1, t0: performance.now(), events: [] };
        api._rec = rec; api._recT0 = rec.t0;
        return {
            stop() { api._rec = null; return rec; },
            save(name) { try { localStorage.setItem('mg-replay:' + (name || Date.now()), JSON.stringify(rec)); } catch (e) {} return rec; },
        };
    },
    load(name) { try { return JSON.parse(localStorage.getItem('mg-replay:' + name) || 'null'); } catch (e) { return null; } },
    saveLocal(name, rec) { try { localStorage.setItem('mg-replay:' + name, JSON.stringify(rec)); } catch (e) {} },
    // 回放：用相同游戏对象（window.MiniGames[id]）重开一局，引擎在 __replay 模式下按时间戳投递事件
    //   const rec = MG.replay.load('myrun'); MG.replay.play(window.MiniGames['reversi'], container, rec);
    play(gameObj, container, rec) {
        return gameObj.start(container, { __replay: rec });
    },
};
