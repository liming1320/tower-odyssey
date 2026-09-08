# 塔界远征 · MySQL 存储方案

把玩家数据和英雄配置放进 MySQL，解决三件事：

1. **改名 / 改技能 / 换立绘直接在数据库改**，不用动代码、不用重新部署
2. **玩家换设备登录同一账号，进度自动同步**（数据在服务端数据库）
3. **代码回滚、重新部署、重装代码都不会影响玩家数据**

---

## 一、表结构速览

| 表 | 作用 | 关键字段 |
|---|---|---|
| `players` | 账号（只存登录信息） | id, username, pass_hash, is_admin |
| `player_state` | **玩家存档**（整份 JSON） | player_id, state(JSON) |
| `heroes` | **英雄配置** | id, name, rarity, element, img, avatar, 主技能字段 |
| `hero_skills` | 英雄多技能 | hero_id, slot, name, cd, multiplier, fx |
| `game_meta` | 全局数据 KV | chat / mails / clans / world / tokens… |
| `mails` | 游戏内邮件 | to_user, rewards(JSON), claimed |
| `admin_logs` | 后台操作留痕 | admin, action, detail |

> 设计原则：**玩家存档 = `player_state` 表，代码 = 仓库**。两者物理分离，
> 回滚代码只动仓库，碰不到 `player_state` 一行数据。

---

## 二、宝塔上安装 MySQL（10 分钟）

### 版本怎么选：直接用宝塔里的 MySQL 5.7.44 就行

| 版本 | 结论 |
|---|---|
| **MySQL 5.7.44**（软件商店默认能搜到的） | ✅ **直接用**，本方案全部兼容 |
| MySQL 8.0 / 8.4 | ✅ 也支持，但宝塔软件商店常搜不到，要手动装，没必要折腾 |
| MariaDB 10.6 | ✅ 支持（记得建库时字符集选 utf8mb4） |

脚本只用到了 **JSON 列**（5.7.0+ 就有）和 **utf8mb4**，没有 MySQL 8 专有语法，
所以 **5.7.44 完全够用**。想装 8 的话：宝塔 → 软件商店 → **MySQL多版本管理**（Docker 插件），
或手动 `yum install mysql-server`（不推荐，容易和宝塔的环境打架）。

### 安装步骤

1. 宝塔 → 软件商店 → 搜索 **MySQL** → 安装 **5.7.44**（2C4G 内存足够）
2. 装完后 → 数据库 → **root 密码** 看一下并记下来
3. 创建数据库：数据库 → 添加数据库
   - 数据库名：`tower_odyssey`
   - 用户名：`to_user`
   - 密码：自己设（记下来）
   - 访问权限：本地服务器

---

## 三、建表

**方式 A：phpMyAdmin（最省事）**
宝塔 → 数据库 → 对应库的「管理」→ SQL → 粘贴 `schema.sql` 全部内容 → 执行

**方式 B：命令行**
```bash
mysql -u root -p < /www/wwwroot/tower-odyssey/deploy/mysql/schema.sql
```

---

## 四、导入英雄数据

**首次导入**（会清空 heroes / hero_skills 再全量写入）：
```bash
cd /www/wwwroot/tower-odyssey
mysql -u root -p tower_odyssey < deploy/mysql/seed-heroes.sql
```

导入后 56 个英雄（46 战斗 + 10 材料）、102 条技能就进 `heroes` / `hero_skills` 表了。

> ⚠ **以后别再跑上面这条**——它会 `TRUNCATE` 清空英雄表，把你在数据库里改过的名字/技能全冲掉。
> 已经改过数据、只是想**补新增英雄**时，用安全版（INSERT IGNORE，已存在的行不动）：
> ```bash
> mysql -u root -p tower_odyssey < deploy/mysql/seed-heroes-safe.sql
> ```
> 本地改完英雄名/立绘后，重新生成两个文件：
> `node tools/gen-mysql-seed.js && node tools/gen-mysql-seed.js --safe`

**验证**：
```sql
SELECT COUNT(*) FROM heroes;        -- 56
SELECT COUNT(*) FROM hero_skills;   -- 102
SELECT id,name,element,img FROM heroes LIMIT 5;
```

---

## 五、把现有存档迁进 MySQL

```bash
cd /www/wwwroot/tower-odyssey
npm install mysql2                  # 安装驱动（只需一次）

DB_DRIVER=mysql \
DB_HOST=127.0.0.1 DB_PORT=3306 \
DB_USER=root DB_PASS=你的root密码 \
DB_NAME=tower_odyssey \
node tools/migrate-to-mysql.js
```

会把 `data/db.json` 里的玩家、英雄、邮件、聊天全量导入。
第一次跑可以加 `--init` 让它顺便建表。

---

## 六、让服务用 MySQL 启动

```bash
cd /www/wwwroot/tower-odyssey
DB_DRIVER=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=to_user \
DB_PASS=你的密码 DB_NAME=tower_odyssey \
sudo -E APP_DIR=/www/wwwroot/tower-odyssey PORT=5180 bash deploy/linux/install.sh
```

（`-E` 是为了把 DB_* 变量传给 sudo；install.sh 会把它们写进 systemd 服务的 `Environment=`）

之后：
```bash
systemctl restart tower-odyssey
journalctl -u tower-odyssey -n 20
curl 127.0.0.1:5180/api/health        # 看 storage 字段
```

正常会看到：
```json
{"ok":true,"players":17,"heroes":56,"storage":"mysql(tower_odyssey)"}
```

也可以直接改服务文件：
```bash
systemctl edit tower-odyssey
# 写入：
# [Service]
# Environment=DB_DRIVER=mysql
# Environment=DB_USER=to_user
# Environment=DB_PASS=xxx
# Environment=DB_NAME=tower_odyssey
systemctl daemon-reload && systemctl restart tower-odyssey
```

---

## 七、日常运维（这才是重点）

### 给英雄改名
```sql
UPDATE heroes SET name='新名字' WHERE id='h01';
```
然后 **后台 → 英雄管理 → 点「重载英雄配置」**（或调 `POST /api/admin/hero/reload`），**不用重启服务、不用改代码**。

### 改技能
```sql
UPDATE hero_skills
SET name='新技能名', skill_desc='新描述', cd=8, multiplier=3.5
WHERE hero_id='h01' AND slot=0;
```

### 换立绘 / 头像
```sql
UPDATE heroes SET img='heroes/h01.svg', avatar='avatars/h01.svg' WHERE id='h01';
```

### 下架英雄（老玩家已拥有的保留）
```sql
UPDATE heroes SET enabled=0 WHERE id='h01';
```

### 查玩家存档
```sql
SELECT player_id, JSON_EXTRACT(state,'$.resources') FROM player_state WHERE player_id='xxx';
```

---

## 八、数据安全

- **代码回滚 / 重新部署**：只 `git reset --hard`，碰不到数据库 → 玩家数据 100% 安全
- **备份**：宝塔 → 数据库 → 计划任务 → 每天自动备份（强烈建议开启）
- **手动备份**：
  ```bash
  mysqldump -u root -p tower_odyssey > /backup/to-$(date +%F).sql
  ```
- **恢复**：
  ```bash
  mysql -u root -p tower_odyssey < /backup/to-2026-09-08.sql
  ```

---

## 九、回滚到文件存档（出问题时的退路）

把服务的 `DB_DRIVER` 改成 `json`（或删掉这行），重启即可回到 `data/db.json`，代码不用改：

```bash
systemctl edit tower-odyssey     # Environment=DB_DRIVER=json
systemctl daemon-reload && systemctl restart tower-odyssey
```
