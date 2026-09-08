#!/usr/bin/env node
/**
 * 把 data/db.json 的全量数据导入 MySQL
 *
 * 前置：
 *   1) 建库建表：mysql -u root -p < deploy/mysql/schema.sql
 *   2) 装驱动：npm install mysql2
 *   3) 设置环境变量（或用 --init 让脚本自动建表）
 *
 * 用法：
 *   node tools/migrate-to-mysql.js                 # 只导数据（表需已建好）
 *   node tools/migrate-to-mysql.js --init          # 自动建表 + 导数据
 *   DB_USER=root DB_PASS=xxx node tools/migrate-to-mysql.js --init
 *
 * 环境变量：DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'db.json');

const Store = require(path.join(ROOT, 'server', 'store.js'));

(async () => {
    if (Store.driver !== 'mysql') {
        console.error('请设置 DB_DRIVER=mysql 再执行迁移。');
        console.error('示例：DB_DRIVER=mysql DB_USER=root DB_PASS=密码 node tools/migrate-to-mysql.js --init');
        process.exit(1);
    }
    if (!fs.existsSync(DB_FILE)) { console.error('找不到 data/db.json'); process.exit(1); }

    const init = process.argv.includes('--init');
    console.log(`▶ 连接 MySQL（${process.env.DB_HOST || '127.0.0.1'}/${process.env.DB_NAME || 'tower_odyssey'}）…`);
    await Store.init({ ensureSchema: init });
    if (init) console.log('✔ 数据表已就绪');

    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    // 1) 英雄 + 技能
    const heroes = db.heroes || [];
    if (heroes.length) {
        await Store.saveHeroes(heroes);
        const skills = heroes.reduce((n, h) => n + ((h.skills && h.skills.length) ? h.skills.length : (h.skill ? 1 : 0)), 0);
        console.log(`✔ 英雄 ${heroes.length} 个（战斗 ${heroes.filter(h => !h.material).length} / 材料 ${heroes.filter(h => h.material).length}），技能 ${skills} 条`);
    }

    // 2) 玩家账号 + 存档
    const users = db.users || {};
    const ids = Object.keys(users);
    const copy = { users };
    for (const k of ['tokens', 'chat', 'mails', 'clans', 'world', 'ancient', 'events',
        'wallSkills', 'treasures', 'equipmentTemplates', 'ringTemplates',
        'artifactTemplates', 'gemTemplates', '_meta']) {
        if (k in db) copy[k] = db[k];
    }
    await Store.saveState(copy);
    console.log(`✔ 玩家 ${ids.length} 名（含各自完整存档）`);
    if (db.mails && db.mails.length) console.log(`✔ 邮件 ${db.mails.length} 封`);

    await Store.close();
    console.log('\n✅ 迁移完成。现在用下面的方式启动服务即可切到 MySQL：');
    console.log('   DB_DRIVER=mysql DB_USER=root DB_PASS=你的密码 DB_NAME=tower_odyssey node server.js');
    console.log('   （或用 deploy/mysql/README.md 里的 systemd 环境变量写法）');
})().catch(e => {
    console.error('✗ 迁移失败：' + e.message);
    process.exit(1);
});
