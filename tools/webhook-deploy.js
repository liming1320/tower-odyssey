/* 自建极简 CD 服务：Gitee 推送 → 自动拉取 → 重启 → 健康检查 → 失败回滚
 *
 *   WEBHOOK_SECRET=你的密钥 WEBHOOK_PORT=9000 node tools/webhook-deploy.js
 *
 * Gitee 仓库 → 管理 → WebHooks → 添加：
 *   URL：    http://你的服务器IP:9000/hook
 *   密码：   WEBHOOK_SECRET 的值（会放在 X-Gitee-Token 头）
 *   事件：   勾选 Push
 *
 * 环境变量：
 *   WEBHOOK_PORT   监听端口（默认 9000）
 *   WEBHOOK_SECRET 签名密钥（强烈建议设置，否则任何人都能触发部署）
 *   DEPLOY_BRANCH  只部署这个分支（默认 master）
 *   APP_DIR        项目目录（默认脚本上级）
 *   SERVICE        systemd 服务名（默认 tower-odyssey）
 *   GAME_PORT      游戏端口（默认 5180）
 */
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.WEBHOOK_PORT || '9000', 10);
const SECRET = process.env.WEBHOOK_SECRET || '';
const BRANCH = process.env.DEPLOY_BRANCH || 'master';
const APP_DIR = process.env.APP_DIR || path.join(__dirname, '..');
const SERVICE = process.env.SERVICE || 'tower-odyssey';
const GAME_PORT = process.env.GAME_PORT || process.env.PORT || '5180';

const state = { running: false, last: null, history: [] };

function verify(req, raw) {
    if (!SECRET) return true;                     // 未设密钥时放行（仅内网调试用）
    const token = req.headers['x-gitee-token'];
    if (token) return safeEqual(String(token), SECRET);
    const sig = req.headers['x-gitee-signature-256'] || req.headers['x-hub-signature-256'];
    if (sig) {
        const calc = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
        return safeEqual(String(sig), calc);
    }
    return false;
}
function safeEqual(a, b) {
    try {
        const x = Buffer.from(String(a)), y = Buffer.from(String(b));
        return x.length === y.length && crypto.timingSafeEqual(x, y);
    } catch (e) { return false; }
}

function runDeploy(branch, who) {
    if (state.running) return { skipped: '已有部署在进行中' };
    state.running = true;
    const started = Date.now();
    const item = { time: new Date().toISOString(), branch, who, status: 'running' };
    state.last = item;

    const sh = path.join(APP_DIR, 'deploy/hooks/deploy.sh');
    const child = spawn('bash', [sh, branch], {
        cwd: APP_DIR,
        env: Object.assign({}, process.env, { APP_DIR, SERVICE, PORT: GAME_PORT }),
        stdio: 'ignore',
        detached: true,
    });
    child.on('exit', code => {
        state.running = false;
        item.status = code === 0 ? 'success' : 'failed';
        item.exitCode = code;
        item.cost = ((Date.now() - started) / 1000).toFixed(1) + 's';
        state.history.unshift(item);
        state.history = state.history.slice(0, 20);
        console.log(`[deploy] ${item.status} branch=${branch} cost=${item.cost}`);
        if (code !== 0) console.log('[deploy] 已自动回滚，详见 deploy/logs/deploy.log');
    });
    child.unref();
    return { started: true, branch };
}

const server = http.createServer((req, res) => {
    const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
    };

    // 状态页
    if (req.method === 'GET') {
        return send(200, {
            ok: true, service: 'tower-odyssey-webhook',
            branch: BRANCH, appDir: APP_DIR, gamePort: GAME_PORT,
            running: state.running, last: state.last, history: state.history.slice(0, 10),
        });
    }

    // 触发部署
    if (req.method === 'POST' && /^\/(hook|deploy|gitee)/.test(req.url.split('?')[0])) {
        let raw = '';
        req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
        req.on('end', () => {
            if (!verify(req, raw)) { console.warn('[deploy] 签名校验失败，已拒绝'); return send(401, { error: '签名校验失败' }); }
            let body = {};
            try { body = JSON.parse(raw || '{}'); } catch (e) { }
            const ref = body.ref || body.branch || '';
            const branch = String(ref).replace('refs/heads/', '') || BRANCH;
            if (branch !== BRANCH) {
                console.log(`[deploy] 忽略分支 ${branch}（只部署 ${BRANCH}）`);
                return send(200, { skipped: '非目标分支', branch });
            }
            const who = (body.pusher && (body.pusher.username || body.pusher.name)) || body.user_name || 'unknown';
            console.log(`[deploy] 收到 ${branch} 推送，来自 ${who}`);
            return send(202, runDeploy(branch, who));
        });
        return;
    }
    send(404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[webhook] 监听 http://0.0.0.0:${PORT}/hook  （分支 ${BRANCH} → ${APP_DIR}）`);
    console.log(`[webhook] 密钥：${SECRET ? '已设置' : '未设置（生产环境务必设置 WEBHOOK_SECRET）'}`);
});
