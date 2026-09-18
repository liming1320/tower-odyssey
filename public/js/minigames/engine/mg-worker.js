// 小游戏引擎 · Web Worker 离屏计算（mg-worker.js）—— 性能 D1
window.MG = window.MG || {}; var MG = window.MG;
// 把纯计算（关卡生成 / 棋类 AI / 寻路 / 大数组排序）丢到 Worker 跑，主线程不卡。
// 限制：fn 必须是「自包含」的（不能引用外部闭包/全局，除了 Math/Date 等内置），否则序列化后取不到。
// 用法：const w = MG.worker(function (data) { return heavy(data); });
//       w.run(input).then(out => ...);  w.terminate();
//       环境不支持 Worker（或构造失败）时返回 null，调用方应回退到主线程同步计算。
MG.worker = function (fn) {
    if (typeof Worker === 'undefined' || !fn) return null;
    if (typeof document === 'undefined') return null;
    try {
        const src = 'self.onmessage=function(e){try{var r=(' + fn.toString() + ')(e.data);self.postMessage({ok:1,res:r});}catch(err){self.postMessage({ok:0,err:String((err&&err.message)||err)});}};';
        const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
        const w = new Worker(url);
        return {
            run(data) {
                return new Promise((res, rej) => {
                    const h = (e) => { w.removeEventListener('message', h); if (e.data && e.data.ok) res(e.data.res); else rej(new Error((e.data && e.data.err) || 'worker-error')); };
                    w.addEventListener('message', h); w.postMessage(data);
                });
            },
            terminate() { try { w.terminate(); URL.revokeObjectURL(url); } catch (e) {} },
        };
    } catch (e) { return null; }
};
