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
```bash
mkdir -p /www/wwwroot && cd /www/wwwroot
git clone https://gitee.com/li-ming1320/tower-odyssey.git
cd tower-odyssey
```

### 3）一键部署（systemd 守护）
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
git clone https://gitee.com/li-ming1320/tower-odyssey.git /opt/tower-odyssey
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

## 六、后续扩容（人真多了再说）

1. **先纵向**：宝塔面板 → 调整 Node 内存上限；2核4G 升 4核8G
2. **再横向**：把存档从 `db.json` 换成 **MySQL**（腾讯云 MySQL 或面板里装），服务改成无状态 → 起多个 Node 实例 → 腾讯云 CLB 负载均衡
3. **静态资源**：`public/` 全部丢到腾讯云 COS + CDN，Node 只处理 API

需要我做第 2 步（存储层切 MySQL）时说一声，我会加 `server/store.js` 抽象层，本地仍保持零依赖 JSON，生产切 MySQL。
