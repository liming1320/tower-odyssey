/* 一键推送到 Gitee：自动创建「私有」仓库 → 关联远程 → 推送
 *
 *   node tools/push-gitee.js <Gitee私人令牌> [仓库名]
 *
 * 令牌获取：Gitee 网页 → 右上角头像 → 设置 → 私人令牌 → 生成新令牌
 *          勾选权限：projects（以及 user_info 可选）
 * 仓库默认名：tower-odyssey（可用第二个参数改）
 * 仓库会设为 private=true，因此 db.json 里的账号数据不会公开。
 */
const https = require('https');
const { execSync } = require('child_process');
const path = require('path');

const token = process.argv[2];
const repo = process.argv[3] || 'tower-odyssey';
const desc = '塔界远征 · 肉鸽推塔游戏（Node 零依赖 + 原生前端）';

if (!token) {
    console.log('用法: node tools/push-gitee.js <Gitee私人令牌> [仓库名]');
    console.log('示例: node tools/push-gitee.js 8f9a...c3d tower-odyssey');
    process.exit(1);
}

const ROOT = path.join(__dirname, '..');

function api(method, apiPath, form) {
    return new Promise((resolve, reject) => {
        const body = new URLSearchParams(form).toString();
        const req = https.request({
            host: 'gitee.com', path: apiPath, method,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
        }, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => {
                let j = null; try { j = JSON.parse(d); } catch (e) { }
                resolve({ status: res.statusCode, json: j, raw: d });
            });
        });
        req.on('error', reject);
        req.write(body); req.end();
    });
}

(async () => {
    console.log('① 创建私有仓库:', repo);
    const r = await api('POST', '/api/v5/user/repos', {
        access_token: token, name: repo, description: desc,
        private: 'true', auto_init: 'false', has_issues: 'true', has_wiki: 'false',
    });
    if (r.status === 201) {
        console.log('   ✅ 已创建:', r.json.full_name, '| 私有:', r.json.private);
    } else if (r.status === 400 && /已经存在|already/i.test(r.raw)) {
        console.log('   ⚠ 仓库已存在，直接复用');
    } else {
        console.log('   ❌ 创建失败 HTTP', r.status, r.raw.slice(0, 300));
        process.exit(1);
    }

    // 用 token 内嵌的 URL 推送，避免交互式输入密码
    const remote = `https://li-ming1320:${encodeURIComponent(token)}@gitee.com/li-ming1320/${repo}.git`;
    const safe = `https://gitee.com/li-ming1320/${repo}.git`;

    const run = (cmd) => {
        console.log('   $', cmd.replace(remote, safe));
        return execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    };

    console.log('② 关联远程 + 推送');
    try { execSync('git remote remove origin', { cwd: ROOT, stdio: 'ignore' }); } catch (e) { }
    run(`git remote add origin "${remote}"`);
    run('git branch -M master');
    run('git push -u origin master');

    console.log('\n✅ 完成！仓库地址:', safe);
    console.log('   换电脑时：git clone ' + safe + ' && cd ' + repo + ' && node server.js');
    console.log('   （数据已随 db.json 一起提交；如想单独迁移存档：node tools/db-sync.js export / import）');
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
