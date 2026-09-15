# 在 Linux 上配置 SillyTavern（AI 酒馆）

适用前提：**SillyTavern 和塔界远征跑在同一台 Linux 服务器上**（网关连 `http://127.0.0.1:8000`）。

- 塔界远征：systemd 服务 `tower-odyssey`，目录 `/www/wwwroot/tower-odyssey`，端口 `5180`
- SillyTavern：默认端口 `8000`，运行方式待确认（systemd / pm2 / docker / 裸进程）

整篇文章的命令都在**服务器上**执行。从 Windows 连过去：

```powershell
ssh root@你的服务器IP
```

（或用宝塔面板 → 终端）

---

## 第 0 步：先跑探测，别猜

把 `tools/tavern-admin.sh` 传到服务器上（或直接在服务器 `git pull` 之后就有），然后：

```bash
cd /www/wwwroot/tower-odyssey
chmod +x tools/tavern-admin.sh
./tools/tavern-admin.sh detect
```

它会一次性告诉你五件事：

1. **8000 端口谁在听** —— 判断 ST 到底起没起
2. **ST 用什么方式跑** —— systemd / pm2 / docker / 裸进程，决定你用哪条重启命令
3. **config.yaml 在哪** —— 按文件内容特征搜，不靠目录名猜
4. **ST 里已有哪些账号**
5. **塔界远征服务状态**

输出最后还会直接给出「下一步该敲什么」。**先看这个，再决定走下面哪条分支。**

---

## 第 1 步：找到 config.yaml

如果探测没找到，手动找：

```bash
# 按内容特征搜全盘（推荐，不受目录命名影响）
find / -maxdepth 6 -name config.yaml -not -path "*/node_modules/*" 2>/dev/null \
  | xargs grep -l "enableUserAccounts" 2>/dev/null
```

常见位置：

| 安装方式 | 路径 |
|---|---|
| 宝塔 / 手动 git clone | `/www/wwwroot/SillyTavern/config.yaml` |
| 手动装到 /opt | `/opt/SillyTavern/config.yaml` |
| Docker | 在**容器里** `/home/node/app/config.yaml`，宿主机上是挂载目录 |

> ⚠️ **必须改仓库根目录那份**，不是 `default/config.yaml`（那是模板，每次 `npm install` 会被覆盖回来）。
>
> ⚠️ **config.yaml 只在 ST 首次成功启动后才生成**。如果文件不存在：
> ```bash
> cd <ST目录> && node server.js    # 看到 "SillyTavern is listening" 后 Ctrl+C
> ```

---

## 第 2 步：打开多用户模式

### 方式 A：脚本自动改（推荐）

```bash
./tools/tavern-admin.sh config /www/wwwroot/SillyTavern
```

它会自动备份原文件（`.bak.时间戳`），然后把 `enableUserAccounts` 改成 `true`，并补上 `sso` 段。

### 方式 B：手动编辑

```bash
nano /www/wwwroot/SillyTavern/config.yaml
```

（nano：`Ctrl+O` 保存 → 回车 → `Ctrl+X` 退出；用 vim 就 `vim` + `:wq`）

确认 / 修改这几项：

```yaml
enableUserAccounts: true      # ← 必须，否则 ST 没有多用户，登录接口直接 404
listen: false                 # ← 保持 false！同机部署不需要监听公网，更安全
whitelistMode: true           # 默认值，同机部署不用动
```

再补一段 `sso`（文件里没有就加在末尾，**缩进用空格，不要用 Tab**）：

```yaml
sso:
  autheliaAuth: true
  trustedProxies:
    - 127.0.0.1
    - ::1
```

### 用 sed 一行搞定（不想开编辑器的话）

```bash
cd /www/wwwroot/SillyTavern
cp config.yaml config.yaml.bak
sed -i -E 's/^([[:space:]]*enableUserAccounts[[:space:]]*:[[:space:]]*).*/\1true/' config.yaml
grep -n "enableUserAccounts" config.yaml      # 确认改成了 true
```

---

## 第 3 步：重启 SillyTavern

**按第 0 步探测出来的方式选一条**，别全试。

> ⚠️ **最容易踩的坑：PM2 和 systemd 同时管 ST。**
> PM2 起的工作进程，在 `ps` 里看起来像「裸进程 `node server.js`」，很容易被误判。
> 判据是**看父进程**:父进程是 `PM2 vX: God Daemon` 就说明是 PM2 托管
> （`./tools/tavern-admin.sh detect` 第 4.5 步会自动做这个检查）。
> 这种情况下若再建 systemd 服务，PM2 会瞬间把工作进程拉回来占住 8000，
> systemd 只会无限刷 `Address 127.0.0.1:8000 is already in use`。**二选一，别都开。**
>
> 而且 `pm2` 经常不在 root 的 PATH 里（`command -v pm2` 查不到）。
> **别用 `find / -name pm2` 去找** —— 扫全盘要几十秒到几分钟，往往等不及就被 Ctrl+C 了。
> 直接用下面这条（秒出）：
> ```bash
> ls -d /www/server/nodejs/*/bin/pm2 /usr/local/bin/pm2 /usr/bin/pm2 \
>       /usr/lib/node_modules/pm2/bin/pm2 /root/.nvm/versions/node/*/bin/pm2 2>/dev/null
> ```
> 或者干脆绕开 pm2：用 `./tools/tavern-admin.sh restart` 和 `./tools/tavern-admin.sh logs`，
> 它们会自动定位 pm2，定位不到也能用（原理见下）。

### PM2（推荐：用脚本，不需要 pm2 命令）

```bash
cd /www/wwwroot/tower-odyssey
./tools/tavern-admin.sh restart     # 自动找 pm2；找不到就 kill 让 PM2 自动拉起
./tools/tavern-admin.sh logs        # 直接 tail ~/.pm2/logs/*-out.log，验证码在这读
```

**为什么 kill 一下也算重启**：PM2 托管的工作进程被 kill 后，God Daemon 会在几秒内自动拉起一个新的，
而新进程会重新读一次 `config.yaml` —— 所以配置改动就生效了。这正是 `find` 不到 pm2 时的兜底方案。

如果脚本找到了 pm2，它会打印路径，之后你也可以直接用：

```bash
export PATH="$PATH:<脚本打印的目录>"
pm2 list
pm2 restart <名字>
pm2 logs <名字> --lines 50
```

### systemd（最常见）

```bash
systemctl restart sillytavern          # 服务名以探测结果为准
systemctl status sillytavern           # 看有没有起来
journalctl -u sillytavern -f           # 实时看日志（Ctrl+C 退出）
```

如果服务名不是 `sillytavern`：

```bash
systemctl list-unit-files | grep -i silly
```

### Docker

```bash
docker ps | grep -i silly              # 拿容器名
docker restart <容器名>
docker logs --tail 50 <容器名>
```

> Docker 的话 `config.yaml` 和 `data/` 在**挂载出来的宿主机目录**里，改之前先 `docker inspect <容器名> | grep -A5 Mounts` 看挂在哪。

### 裸进程（nohup / screen 手启）

```bash
pkill -f "node server.js" ; sleep 2
cd <ST目录>
nohup node server.js > st.log 2>&1 &
sleep 3
tail -20 st.log
```

### 宝塔「Node.js 项目管理器」装的

在宝塔面板 → 软件商店 → Node.js 版本管理器 → 项目列表里点「重启」即可，本质上是 pm2。

---

## 第 4 步：确认 ST 真的起来了

```bash
curl -s http://127.0.0.1:8000/csrf-token
```

返回类似 `{"token":"xxxx"}` 就对了。返回 `connection refused` 说明没起来，回去看日志。

---

## 第 5 步：给管理员账号设密码

### 先看看 ST 里有哪些账号

```bash
./tools/tavern-admin.sh list
```

**ST 首次启动时若一个账号都没有，会自动建一个 `default-user`——它默认就是管理员，而且初始没有密码。**
所以如果你从没在 ST 里注册过，句柄就是 `default-user`。

> 如果列表是空的 → `enableUserAccounts` 没生效，回到第 2、3 步。

### 设密码（全程命令行，不用开浏览器）

```bash
./tools/tavern-admin.sh passwd default-user
```

脚本会请求一个验证码，**ST 会把 6 位验证码打印到它自己的控制台**。另开一个终端窗口去读：

```bash
# 推荐：脚本自动判断 pm2 / systemd / nohup，不需要 pm2 命令
./tools/tavern-admin.sh logs

# 或者手动
journalctl -u sillytavern -n 20 --no-pager   # systemd
pm2 logs <名字> --lines 20                    # pm2（pm2 在 PATH 里才行）
tail -20 /root/.pm2/logs/*-out.log           # pm2 但命令找不到时
tail -20 st.log                              # nohup
docker logs --tail 20 <容器名>                # docker
```

看到 `your password recovery code is: 123456` 这类输出，把 6 位数字填回脚本，再输入新密码即可。

> 验证码 5 分钟内有效。填错会有速率限制（5 次 / 5 分钟），等一会儿再试。

### 也可以走图形界面

如果有 SSH 隧道或面板自带终端浏览器：

```powershell
# 你自己的 Windows 电脑上执行
ssh -L 8000:127.0.0.1:8000 root@你的服务器IP
```

然后本机浏览器开 `http://127.0.0.1:8000` → 点 `default-user` 直接进（无密码）→
「用户设置 → 账户 → 更改密码」。

---

## 第 6 步：填后台 + 重启塔界远征

1. 打开 `http://你的服务器/admin` → 导航「AI 酒馆」
2. 填：
   - **上游地址**：`http://127.0.0.1:8000`（同机就别改）
   - **管理员句柄**：`default-user`（或你第 5 步看到的实际句柄）
   - **管理员密码**：刚设的那个
   - 勾选「启用 AI 酒馆网关」
3. 点「保存并生效」→ 再点「测试连接」

**注意：前面修的网关代码（`server/tavern.js`）要重新部署并重启才生效：**

```bash
cd /www/wwwroot/tower-odyssey
git pull
systemctl restart tower-odyssey
systemctl status tower-odyssey
journalctl -u tower-odyssey -n 30 --no-pager
```

---

## 排查表

| 现象 | 原因 | 怎么修 |
|---|---|---|
| 测试连接报 **404** | ST 没开 `enableUserAccounts` | 第 2 步 + 第 3 步 |
| 报 **403** | 句柄不存在 / 密码不一致 / 账号被禁用 | `list` 看真实句柄，重设密码 |
| 报 **400** | 网关代码没更新（旧版本传 `username`） | `git pull` + `systemctl restart tower-odyssey` |
| 报 **429** | 失败太多次被限流 | 等 1 分钟；或 `rateLimiting.accountsLoginMaxAttempts` |
| 「连不上 SillyTavern」 | ST 没起 / 端口不是 8000 | 第 4 步；`ss -lntp \| grep 8000` |
| 玩家进酒馆要重新登录 | SSO 头没被信任 | 确认 `sso.trustedProxies` 含 `127.0.0.1` 且 `autheliaAuth: true` |
| 玩家能开页面但消息发不出去 | WebSocket 没透传 | 必须走 `/tavern` 前缀，别直连 8000 |

---

## 安全提醒

- **不要**给 ST 加 `--listen` 或把 `listen` 设成 `true`。同机部署走 `127.0.0.1` 就够了 —— ST 面板能改 API Key，暴露公网等于把你的模型额度送人。
- `config.yaml` 里如果开了 `basicAuthMode`，网关直连会被 Basic Auth 拦住。同机部署建议保持 `false`。
- `data/tavern-env.json` 存的是**明文**密码，已在 `.gitignore`，别提交。
