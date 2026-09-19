// verify-net-gate.js —— 部署前联机回归闸（被 deploy/hooks/deploy.sh Phase 2.6 调用）
//
// 依次运行 5 个「真 ws 中继」回归测试（无需浏览器、不依赖线上服务进程）：
//   reconnect  断线重连 / 续局
//   4p         4 人桌真实同步
//   persist    房间快照持久化 / 重启续局
//   seq        落子 _seq 去重（防重连重放重复落子 / 乱序防护）
//   spectate   观战模式（side=-1 只读、自身 input 拦截、退出不推 peer_left）
//   heartbeat  应用层心跳 ping/pong 往返 + 客户端死连看门狗（网络黑洞检测）
//   net-games  memory/g2048 新增联机游戏的状态同步契约（整盘转发给对手）
//
// 设计要点：
//   - 每个 verify 脚本自带 ws 中继、自带退出码（PASS→0，FAIL→1，harness 异常→2）。
//   - 本脚本用 spawnSync 串行执行，单套超时 45s 防卡死；任一非 0 → 整体 exit(1)。
//   - stdio: 'inherit'：子进程输出（含各自 PASS/FAIL 汇总）直接透传，最终进 deploy.log。
//   - 环境变量 APP_DIR 缺省回退到本脚本上级目录，便于本地直接 `node tools/verify-net-gate.js` 预检。
const { spawnSync } = require('child_process');
const path = require('path');

const APP_DIR = process.env.APP_DIR || path.join(__dirname, '..');
const SUITES = ['reconnect', '4p', 'persist', 'seq', 'spectate', 'heartbeat', 'net-games'];
const PER_SUITE_TIMEOUT = 45000;

let failCount = 0;
console.log('[net-gate] 部署前联机回归闸启动，共 ' + SUITES.length + ' 套');

for (const name of SUITES) {
    const script = path.join(APP_DIR, 'tools', 'verify-' + name + '.js');
    process.stdout.write('[net-gate] → verify-' + name + '.js ... ');
    const r = spawnSync(process.execPath, [script], {
        cwd: APP_DIR,
        env: Object.assign({}, process.env, { MG_NET_GATE: '1' }),
        stdio: 'inherit',
        timeout: PER_SUITE_TIMEOUT,
    });

    if (r.error) {
        // 启动失败（如模块缺失）或被超时杀死
        console.log('INFRA_ERROR (' + (r.error.code || r.error.message) + ')');
        failCount++;
        continue;
    }
    if (r.status === 0) {
        console.log('PASS');
    } else {
        const sig = r.signal ? ' signal=' + r.signal : '';
        console.log('FAIL (exit=' + r.status + sig + ')');
        failCount++;
    }
}

if (failCount) {
    console.log('[net-gate] 结果：✗ ' + failCount + ' 套失败 —— 阻止坏版本上线');
    process.exit(1);
}
console.log('[net-gate] 结果：✓ 全部 ' + SUITES.length + ' 套通过（含 heartbeat / net-games）');
process.exit(0);
