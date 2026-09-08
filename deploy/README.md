# 部署指南 · 塔界远征（tower-odyssey）

零依赖 Node 服务：只要机器能跑 Node 18+，把代码放上去 `node server.js` 就能跑。
默认端口 **5180**，支持 `PORT` 环境变量覆盖，监听 `0.0.0.0`（外网可直接访问）。

---

## 一、三台机器怎么选

| 机器 | 能不能跑 | 适合干什么 | 评价 |
|---|---|---|---|
| **宝塔 Linux 面板（2核4G）** | ✅ 能 | **推荐做生产环境** | 面板一键装 Node / Nginx / MySQL，SSL 证书、计划任务备份、监控全可视化；Linux 跑 Node 稳定、资源占用低（面板本身约 300-500MB，剩 3.5G 给游戏） |
| **OpenClaw 服务器（2核4G）** | ✅ 能 | 做**测试 / 备用 / 灰度**环境 | 没有面板就得手动配（用本目录 `linux/install.sh` 也一样快）。建议保持干净系统，专门用来验证新版本 |
| **Windows Server-HFAb（4核4GB）** | ✅ 能 | 做**内网演示 / 开发机 / 备用** | 远程桌面操作直观，但跑生产不推荐：IIS/Nginx 反代配置麻烦、系统自身占 1.5-2G、重启补丁会中断服务、进程守护要额外装工具 |

### 推荐架构（够用且好维护）

```
手机 / 电脑浏览器
        │  https://你的域名（443）
        ▼
   宝塔 Linux（Nginx 反代 + 免费 SSL）
        │  http://127.0.0.1:5180
        ▼
   Node 游戏服务（systemd 守护，崩溃自动重启）
        │
        ▼
   存档：data/db.json（当前）→ 后续可切 MySQL
```

- **一台 2核4G 能撑多少人？** 这个游戏是 H5 + 短连接 JSON API，单进程实测轻松支撑 **数百人同时在线 / 数千日活**。真到瓶颈再横向扩容（见文末）。
- **手机能玩的关键**：① 腾讯云安全组放行 80/443（或 5180）② 域名解析到这台机 ③ 用 Nginx + 免费 Let's Encrypt 证书上 HTTPS（微信里打开必须是 HTTPS，否则会被拦截或提示不安全）。

---

## 二、宝塔 Linux 部署（推荐，10 分钟）

### 1）面板里准备环境
- 软件商店 → 安装 **Nginx**（任意版本）
- 软件商店 → 安装 **Node.js 版本管理器** → 装 **Node 18/20**（或系统已装 Node 可跳过）
- 放行端口：面板「安全」+ 腾讯云控制台「安全组」都放行 `80`、`443`（调试阶段可临时放行 `5180`）

### 2）拉代码
仓库是**私有**的，直接 https clone 会要求输密码。用下面任一种：

```bash
# A. 一条命令全搞定（推荐）
cd /www/wwwroot
bash <(curl -fsSL https://gitee.com/li-ming1320/tower-odyssey/raw/master/deploy/linux/bootstrap.sh)

# B. HTTPS + 私人令牌（最快）
git clone https://用户名:令牌@gitee.com/li-ming1320/tower-odyssey.git

# C. SSH 部署公钥（长期用，需先配 ~/.ssh/config，见第六章 0）
git clone git@gitee.com:li-ming1320/tower-odyssey.git
```

### 3）一键部署（systemd 守护）
> 用 A 方式的话，bootstrap.sh 已经帮你装好了，这步可跳过。
```bash
chmod +x deploy/linux/install.sh
sudo APP_DIR=/www/wwwroot/tower-odyssey PORT=5180 bash deploy/linux/install.sh
```
脚本会：检查 Node → 注册 systemd 服务 → 开机自启 → 崩溃自动重启 → 输出状态。

常用命令：
```bash
systemctl status tower-odyssey     # 看状态
systemctl restart tower-odyssey    # 重启
journalctl -u tower-odyssey -f     # 看实时日志
curl 127.0.0.1:5180/api/health     # 健康检查
```

### 4）Nginx 反代
宝塔 → 网站 → 添加站点（填域名）→ 设置 → 配置文件，把 `deploy/nginx/tower-odyssey.conf` 里 `location` 部分粘进去（改 `server_name` 和端口）。

### 5）上 HTTPS（手机能玩的最后一步）
宝塔 → 站点 → SSL → Let's Encrypt → 申请 → 打开「强制 HTTPS」。
完成后手机浏览器/微信打开 `https://你的域名` 即可，**玩家换手机只要登录账号，数据全在服务器**。

---

## 三、OpenClaw（纯 Linux，无面板）部署

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -   # CentOS/Rocky
# 或：curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
# 先配好 SSH 部署公钥（见第六章 0），然后：
git clone git@gitee.com:li-ming1320/tower-odyssey.git /opt/tower-odyssey
cd /opt/tower-odyssey && chmod +x deploy/linux/install.sh
sudo APP_DIR=/opt/tower-odyssey bash deploy/linux/install.sh
```
Nginx 与证书用 `certbot --nginx` 一行搞定。

---

## 四、Windows Server 部署

```powershell
# 管理员 PowerShell
cd E:\WorkSpace\tower-odyssey        # 或任意目录
powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1 -Port 5180
```
脚本做三件事：放行防火墙端口 → 创建开机自启计划任务 → 立即启动并健康检查。
（生产更推荐装 [NSSM](https://nssm.cc/) 把 node 注册成服务，比计划任务稳定。）

---

## 五、备份与数据安全

服务端已内置三重保护（`server.js`）：
1. **原子写**：临时文件 + rename，写一半断电也不会损坏 `db.json`
2. **自动备份**：启动时 + 每小时各一份，存 `data/backups/`
3. **保留策略**：最近 12 份全留 + 每天 1 份保留 14 天，自动清理旧档

再加一层异地备份（推荐）：
```bash
# 宝塔「计划任务」→ shell 脚本，每天 3:00 执行
tar czf /www/backup/game-$(date +%F).tar.gz /www/wwwroot/tower-odyssey/data/db.json
# 可选：同步到腾讯云 COS
# coscli cp /www/backup/ cos://你的桶/game-backup/ -r
```

---

## 六、自动化部署（CI/CD）：push 到 Gitee 就自动上线

### 两个脚本，别搞混

| 脚本 | 什么时候用 | 干什么 |
|---|---|---|
| `deploy/linux/bootstrap.sh` | **新服务器第一次**才用，一台机器执行一次 | 生成/配置 SSH 免密 → 拉代码 → 装 systemd 服务。装完就不用再碰了 |
| `deploy/hooks/deploy.sh` | **每次 push 自动触发**（WebHook 调它） | 快照存档 → 拉最新代码 → 还原存档 → 重启 → 健康检查 → 失败回滚 |

简单记：**bootstrap 是"装机"，deploy 是"更新"**。你已经装过服务的话，只配 deploy.sh 就行。

> ⚠️ 重要变更：`data/db.json`（玩家存档）已移出版本控制，不再进仓库。
> 否则每次部署都会用开发机的测试存档覆盖服务器数据。英雄配置改放在
> `data/heroes.seed.json`（进仓库），新服务器首次启动会自动用它生成存档。
> 若以后英雄改名/换立绘，跑一次 `node tools/update-hero-seed.js` 再 push。

### 0）前置：让服务器能免密拉代码（做一次）

**推荐：一条命令自动搞定（生成密钥 → 写 ssh config → 测连通 → 拉代码 → 装服务）**
```bash
cd /www/wwwroot
curl -o bootstrap.sh https://gitee.com/li-ming1320/tower-odyssey/raw/master/deploy/linux/bootstrap.sh
bash bootstrap.sh
# 脚本会打印公钥，粘到 Gitee 仓库 → 管理 → 部署公钥管理 → 添加，回车继续
```

<details>
<summary>手动分步（想自己控制时用）</summary>

```bash
ssh-keygen -t ed25519 -C "deploy" -f ~/.ssh/gitee_deploy -N ""
cat ~/.ssh/gitee_deploy.pub     # 粘到 Gitee → 仓库 → 管理 → 部署公钥管理 → 添加公钥
```

**⚠️ 最容易踩的坑**：密钥文件名不是默认的 `id_ed25519`，SSH **不会自动使用它**。
必须写 `~/.ssh/config` 指定，否则一定报 `Permission denied (publickey)`：
```bash
cat >> ~/.ssh/config <<'EOF'
Host gitee.com
    HostName gitee.com
    User git
    IdentityFile ~/.ssh/gitee_deploy
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

验证（看到 `successfully authenticated` 即成功）：
```bash
ssh -T git@gitee.com
cd /www/wwwroot && git clone git@gitee.com:li-ming1320/tower-odyssey.git
```
</details>

<details>
<summary>备选：HTTPS + 私人令牌（不想配公钥时用，最快）</summary>

```bash
GITEE_USER=你的Gitee用户名 GITEE_TOKEN=私人令牌 bash bootstrap.sh
# 或手写：
git clone https://用户名:令牌@gitee.com/li-ming1320/tower-odyssey.git
git remote set-url origin https://gitee.com/li-ming1320/tower-odyssey.git
printf 'https://用户名:令牌@gitee.com\n' > ~/.git-credentials && chmod 600 ~/.git-credentials
git config credential.helper store      # 以后 pull 不再输密码
```
令牌需勾选 **repo** 权限；Gitee「设置 → 私人令牌」可随时吊销。
</details>

### 1）方式一：宝塔 WebHook（最省事，推荐）

1. 宝塔 → 软件商店 → 安装 **WebHook**
2. 添加 Hook，执行脚本填（**不要用 `sudo`，宝塔 WebHook 本身就是 root 运行**）：
   ```bash
   export APP_DIR=/www/wwwroot/tower-odyssey
   export SERVICE=tower-odyssey
   export PORT=5180
   bash $APP_DIR/deploy/hooks/deploy.sh master >> /tmp/bt-deploy.log 2>&1
   ```
   > 必须写 `export APP_DIR=...`：`export` 才能让变量传给脚本；不写的话脚本靠自身路径推断也行，但显式最稳。
3. 复制生成的 URL（形如 `http://IP:8888/hook?access_key=xxx`），点「测试」看是否返回成功
4. Gitee 仓库 → 管理 → **WebHooks** → 添加 URL，勾选 **Push** 事件，密码留空（宝塔用 URL 里的 `access_key` 鉴权）
5. 以后本地 `git push` → 服务器自动拉代码、重启、健康检查，失败自动回滚

**验证**：本地改个文件 push，然后
```bash
tail -20 /www/wwwroot/tower-odyssey/deploy/logs/deploy.log   # 看部署记录
curl 127.0.0.1:5180/api/health
```

**排错**：
| 现象 | 原因 / 处理 |
|---|---|
| WebHook 一直转圈不返回 | 脚本里 `nohup` 起的 node 会占住输出，宝塔会等。把上面命令末尾的 `>> /tmp/bt-deploy.log 2>&1` 加上即可 |
| 日志报 `找不到 node` | 宝塔的 Node 不在 PATH。脚本已自动扫 `/www/server/nodejs/*/bin`，扫不到就在宝塔「Node.js版本管理器」里设个默认版本，或在脚本里 `export PATH=$PATH:/你的node目录` |
| `切换分支 master 失败` | 已用 `git checkout -f` 修复；若仍失败，确认服务器分支名是 `master` 还是 `main` |
| `git fetch 失败` | SSH 公钥/令牌失效，按第六章 0 重配 |
| 玩家数据被重置了 | 不应发生（脚本会快照还原）。找回：`ls -t data/backups/pre-deploy-*.json` 挑一份覆盖回 `data/db.json` |

### 2）方式二：自建 WebHook 服务（无面板 / 任何机器都能用，零依赖）

```bash
cp deploy/webhook-deploy.service /etc/systemd/system/
vi /etc/systemd/system/webhook-deploy.service    # 改 WEBHOOK_SECRET 和 APP_DIR
systemctl daemon-reload && systemctl enable --now webhook-deploy
curl http://127.0.0.1:9000/                      # 看状态
```
Gitee WebHook 填 `http://你的IP:9000/hook`，密码填 `WEBHOOK_SECRET`。
（腾讯云安全组需放行 9000，或只放行 Gitee 的出口 IP 段）

### 3）方式三：Gitee Go 流水线（可视化，需开通 Gitee Go）

已提供 `.gitee/workflows/deploy.yml`，在流水线「变量/密钥」里配好
`SSH_KEY` / `SSH_HOST` / `SSH_USER` / `APP_DIR` 四个变量即可。

### 4）部署脚本做了什么（`deploy/hooks/deploy.sh`）

1. `git fetch` + `reset --hard origin/master`
2. **部署前自动备份** `data/db.json` → `data/backups/pre-deploy-*.json`
3. 重启服务（有 systemd 用 systemd，没有就 nohup 直接拉起）
4. 轮询 `/api/health` 最多 20 秒
5. **失败自动回滚**到上一个 commit 并重启

日志：`deploy/logs/deploy.log`　｜　手动触发：`bash deploy/hooks/deploy.sh master`

---

## 七、后续扩容（人真多了再说）

1. **先纵向**：宝塔面板 → 调整 Node 内存上限；2核4G 升 4核8G
2. **再横向**：把存档从 `db.json` 换成 **MySQL**（腾讯云 MySQL 或面板里装），服务改成无状态 → 起多个 Node 实例 → 腾讯云 CLB 负载均衡
3. **静态资源**：`public/` 全部丢到腾讯云 COS + CDN，Node 只处理 API

需要我做第 2 步（存储层切 MySQL）时说一声，我会加 `server/store.js` 抽象层，本地仍保持零依赖 JSON，生产切 MySQL。
