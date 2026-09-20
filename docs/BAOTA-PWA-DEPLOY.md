# 宝塔部署 HTTPS 与手机离线 PWA

本文以当前项目和服务器 `152.136.167.250:5180` 为例。正式地址建议使用域名，例如 `game.example.com`，不要直接使用 IP 安装 PWA。

## 0. 需要准备的东西

- 一个域名，例如 `game.example.com`
- 域名的管理权限
- 宝塔面板管理员权限
- 当前 Node 项目已经能在服务器本机访问 `http://127.0.0.1:5180`
- 腾讯云安全组和服务器防火墙开放 TCP `80`、`443`

如果服务器在中国大陆，域名通常还需要完成 ICP 备案。域名注册商、DNS 服务商和服务器提供商可以不同，但 DNS 必须把域名解析到 `152.136.167.250`。

## 1. 注册域名

以腾讯云为例：

1. 进入腾讯云控制台。
2. 打开「域名注册」并搜索想要的域名。
3. 购买域名并完成实名认证。
4. 如果服务器在中国大陆，按腾讯云流程申请 ICP 备案。

也可以在阿里云、Cloudflare Registrar 或其他注册商购买。本文后续只要求域名可以添加 DNS 记录。

## 2. 添加 DNS 解析

以腾讯云 DNSPod 为例：

1. 打开「云解析 DNS」→「域名列表」。
2. 选择域名 →「记录管理」→「添加记录」。
3. 添加主域名记录：

```text
主机记录：game
记录类型：A
记录值：152.136.167.250
TTL：600
```

这样得到：

```text
game.example.com
```

如果还需要 `www`，再添加：

```text
主机记录：www
记录类型：CNAME
记录值：game.example.com
```

等待解析生效后，在电脑执行：

```powershell
nslookup game.example.com
```

结果中应出现：

```text
152.136.167.250
```

## 3. 检查 Node 项目

SSH 登录服务器后执行：

```bash
cd /www/wwwroot/tower-odyssey
curl -I http://127.0.0.1:5180/
```

应返回 `HTTP/1.1 200`。

如果项目还没有常驻运行，可以用 PM2：

```bash
cd /www/wwwroot/tower-odyssey
npm install --omit=dev
pm2 start server.js --name tower-odyssey
pm2 save
```

如果服务器已经由 systemd、宝塔 Node 项目或其他进程管理器启动，不要重复启动第二个 Node 进程。

## 4. 宝塔添加网站

当前项目是 Node 后端，不能把 `dist/offline-pwa` 直接当成完整网站根目录，否则登录、存档和 API 都不能使用。

在宝塔中：

1. 打开「网站」→「添加站点」。
2. 域名填写 `game.example.com`。
3. 根目录填写：

```text
/www/wwwroot/tower-odyssey
```

4. PHP 版本选择「纯静态」或默认即可，后面使用反向代理。

如果宝塔中已经有对应网站，直接编辑原网站，不要重复创建。

## 5. 配置反向代理

进入网站的「反向代理」→「添加反向代理」：

```text
代理名称：tower-odyssey
目标 URL：http://127.0.0.1:5180
发送域名：$host
```

打开 WebSocket 支持。若面板没有单独开关，在「配置文件」中确认包含：

```nginx
location / {
    proxy_pass http://127.0.0.1:5180;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

保存并重载 Nginx。此时先测试：

```text
http://game.example.com/
```

## 6. 配置 HTTPS

在宝塔网站中：

1. 打开「SSL」。
2. 选择「Let's Encrypt」。
3. 勾选 `game.example.com`，如有需要同时勾选 `www.game.example.com`。
4. 点击「申请」。
5. 申请成功后打开「强制 HTTPS」。
6. 保存并重载 Nginx。

最终访问：

```text
https://game.example.com/
```

PWA 必须通过 HTTPS 使用。`http://152.136.167.250:5180` 只能用于调试，不能作为苹果手机的正式 PWA 地址。

## 7. 检查 PWA 文件

在浏览器中依次访问：

```text
https://game.example.com/manifest.webmanifest
https://game.example.com/sw.js
https://game.example.com/offline-pinball.html
```

三者都应该返回 `200`。其中 manifest 的响应类型应为：

```text
application/manifest+json
```

如果返回 404，说明反向代理没有指向当前项目，或服务器还没有更新 `public` 目录。

## 8. 在苹果手机安装

1. 用 Safari 打开：

```text
https://game.example.com/offline-pinball.html
```

2. 等待三维弹球完全加载。
3. 点击 Safari 的「分享」按钮。
4. 选择「添加到主屏幕」。
5. 从桌面图标启动。
6. 首次启动完成后可以开启飞行模式测试。

独立弹球入口不依赖登录 API。完整站点的登录、聊天、云存档和联网功能仍需要服务器网络。

## 9. 发布新版本

### 当前 Node 项目

```bash
cd /www/wwwroot/tower-odyssey
git pull
npm install --omit=dev
pm2 restart tower-odyssey
```

如果使用 systemd 或宝塔 Node 项目管理器，最后一条替换为对应的重启操作。

用户下一次在线打开 PWA 时，Service Worker 会发现新版本并更新缓存。更新后关闭并重新打开一次桌面图标即可。

### 生成独立静态离线包

在项目根目录执行：

```bash
npm run pwa:build
```

生成目录：

```text
dist/offline-pwa/
```

如果要单独部署纯静态三维弹球：

1. 宝塔新建一个网站或子域名。
2. 根目录设置为：

```text
/www/wwwroot/tower-odyssey/dist/offline-pwa
```

3. 为这个域名单独申请 HTTPS。
4. 访问 `/offline-pinball.html`。

这个静态包适合只部署离线游戏，不包含 Node API、登录和云存档服务。

## 10. 常见问题

### 手机仍然显示 HTTP

不要使用 IP 地址访问，确认地址栏是：

```text
https://game.example.com/
```

### Service Worker 没有生效

- 确认 HTTPS 证书有效。
- 确认 `/sw.js` 返回 200。
- 不要在 Safari「无痕浏览」中测试。
- 在线打开一次，再关闭并重新打开桌面图标。

### WebSocket 联机失效

检查 Nginx 是否保留了 `Upgrade`、`Connection` 两个请求头，并确认宝塔反向代理开启 WebSocket。

### 更新后手机仍显示旧版本

先联网打开一次，再完全关闭桌面 PWA 后重新打开。必要时在 Safari 的「设置」→「高级」→「网站数据」中删除该域名缓存后重新安装。

## 11. 没有域名和 ICP 备案时的方案

### 方案 A：Cloudflare Pages 免费 HTTPS（推荐只玩三维弹球）

这个方案不需要购买域名。Cloudflare 会提供一个类似下面的免费 HTTPS 地址：

```text
https://your-project.pages.dev
```

部署步骤：

1. 在项目根目录执行：

```bash
npm run pwa:build
```

2. 注册 Cloudflare 账号。
3. 进入「Workers & Pages」→「Create application」→「Pages」→「Direct Upload」。
4. 上传整个目录：

```text
dist/offline-pwa/
```

5. 部署完成后打开：

```text
https://your-project.pages.dev/offline-pinball.html
```

6. 在 Safari 中选择「分享」→「添加到主屏幕」。

这个方案适合独立离线三维弹球。它不会自动连接当前宝塔上的账号、聊天和存档 API；而且 `pages.dev` 在中国大陆的访问速度和稳定性可能不如国内服务器。

### 方案 B：GitHub Pages 免费 HTTPS

也可以把 `dist/offline-pwa/` 部署到 GitHub Pages，得到 `github.io` HTTPS 地址。建议使用用户站点根路径，例如：

```text
https://用户名.github.io/offline-pinball.html
```

GitHub Pages 在部分网络环境下可能无法稳定访问，并且同样只适合静态离线弹球，不适合当前 Node 后端。

### 方案 C：Cloudflare Quick Tunnel 临时 HTTPS

如果只是临时测试当前宝塔项目，可以在服务器安装 `cloudflared` 后执行：

```bash
cloudflared tunnel --url http://127.0.0.1:5180
```

它会临时生成一个 `https://*.trycloudflare.com` 地址。该地址通常会在进程重启后变化，不适合长期部署，但可以用于手机测试 HTTPS、Service Worker 和 PWA 安装。

### 方案 D：手机本地离线 HTTP 服务

如果完全不想依赖公网：

1. 先执行 `npm run pwa:build`。
2. 把 `dist/offline-pwa/` 复制到手机。
3. 在手机上使用支持本地 HTTP 服务的文件服务器应用。
4. 用 Safari 访问类似下面的本地地址：

```text
http://127.0.0.1:8080/offline-pinball.html
```

Android 也可以使用 Termux：

```bash
cd offline-pwa
python -m http.server 8080
```

这种方式不需要域名和 ICP，但本地服务器应用必须保持运行。不要直接双击 HTML 文件使用 `file://`，WASM 和 `.data` 文件可能会被浏览器安全策略拦截。

### 不建议的方案：IP + 自签名证书

可以给 `152.136.167.250` 配自签名 HTTPS 证书，但苹果手机还需要手动安装并信任证书，Safari、Service Worker 和 PWA 都容易遇到信任问题。除非只是内网调试，否则不建议使用。

没有域名时的选择结论：

- 只玩离线三维弹球：使用 Cloudflare Pages 或本地 HTTP 服务。
- 临时访问完整 Node 项目：使用 Cloudflare Quick Tunnel。
- 长期运行完整项目并让苹果手机稳定安装 PWA：最终仍建议使用域名 + HTTPS。
