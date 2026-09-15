#!/usr/bin/env bash
# 塔界远征 · 一键安装自建 CD（Gitee push → 自动部署）
#
#   sudo bash deploy/linux/install-webhook.sh
#   WEBHOOK_SECRET=你的密钥 sudo -E bash deploy/linux/install-webhook.sh
#   WEBHOOK_PORT=9000 WEBHOOK_SECRET=xxx sudo -E bash deploy/linux/install-webhook.sh
#
# 装完会得到：
#   - systemd 服务 tower-odyssey-webhook（开机自启 / 崩溃自动重启）
#   - 默认只监听 127.0.0.1:<WEBHOOK_PORT>，外网由 Nginx 反代（不用放行新端口）
#   - 状态页 http://服务器IP/__deploy-status  （浏览器直接打开可看部署历史）
#
# 两种对外方式（脚本默认走方式 A）：
#   A) Nginx 反代（推荐）：Gitee 填 http://域名/__deploy，零新增端口
#      → 需要把 deploy/nginx/tower-odyssey.conf 里的 location 段加进站点配置
#   B) 直接暴露端口：WEBHOOK_HOST=0.0.0.0 再跑本脚本，然后去腾讯云安全组放行该端口
#
# 如果你装了宝塔面板，也可以用「宝塔 WebHook 插件」，见 deploy/README.md
#
# ⚠ 宝塔插件以 www 用户执行，systemctl 会没权限，部署脚本会回退到 nohup 直启，
#   留下的游离进程会占住端口让 systemd 再也起不来（EADDRINUSE）。
#   装完务必执行一次（root）：
#     cp deploy/linux/sudoers-tower-odyssey /etc/sudoers.d/tower-odyssey
#     chmod 440 /etc/sudoers.d/tower-odyssey && visudo -c

set -e

APP_DIR="${APP_DIR:-/www/wwwroot/tower-odyssey}"
SERVICE_NAME="${SERVICE_NAME:-tower-odyssey-webhook}"
GAME_SERVICE="${SERVICE:-tower-odyssey}"
PORT="${GAME_PORT:-5180}"
WEBHOOK_PORT="${WEBHOOK_PORT:-9000}"
# 默认只监听本机：外网访问交给 Nginx 反代（location = /__deploy），
# 这样腾讯云安全组不用放行 9000。要直接暴露端口就设 WEBHOOK_HOST=0.0.0.0。
WEBHOOK_HOST="${WEBHOOK_HOST:-127.0.0.1}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"
BRANCH="${DEPLOY_BRANCH:-master}"

say() { echo -e "\033[36m$1\033[0m"; }
warn() { echo -e "\033[33m⚠ $1\033[0m"; }
die() { echo -e "\033[31m✗ $1\033[0m"; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 执行：sudo bash $0"
[ -d "$APP_DIR" ] || die "目录不存在：$APP_DIR（先 git clone 项目）"
[ -f "$APP_DIR/tools/webhook-deploy.js" ] || die "$APP_DIR/tools/webhook-deploy.js 不存在"

# ---- 1) 探测 node（宝塔装的 node 常不在 PATH 里）----
say "① 探测 Node"
. "$(dirname "$0")/detect-node.sh"
detect_node || { node_hint; exit 1; }
echo "   Node: $($NODE_BIN -v)  ($NODE_BIN)"

# ---- 2) 生成密钥 ----
if [ -z "$WEBHOOK_SECRET" ]; then
    if command -v openssl >/dev/null 2>&1; then
        WEBHOOK_SECRET="$(openssl rand -hex 20)"
        say "② 自动生成 WEBHOOK_SECRET（未指定时随机生成）"
    else
        WEBHOOK_SECRET="change-me-$(date +%s)"
        warn "② 本机没有 openssl，已用弱密钥，请手动改 /etc/systemd/system/${SERVICE_NAME}.service"
    fi
else
    say "② 使用传入的 WEBHOOK_SECRET"
fi

# ---- 3) 写 systemd unit ----
say "③ 注册 systemd 服务（$SERVICE_NAME）"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Tower Odyssey Deploy Webhook (Gitee push -> auto deploy)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
Environment=PATH=${NODE_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=WEBHOOK_PORT=${WEBHOOK_PORT}
Environment=WEBHOOK_HOST=${WEBHOOK_HOST}
Environment=WEBHOOK_SECRET=${WEBHOOK_SECRET}
Environment=DEPLOY_BRANCH=${BRANCH}
Environment=APP_DIR=${APP_DIR}
Environment=SERVICE=${GAME_SERVICE}
Environment=GAME_PORT=${PORT}
ExecStart=${NODE_BIN} ${APP_DIR}/tools/webhook-deploy.js
Restart=always
RestartSec=3
StandardOutput=append:${APP_DIR}/deploy/logs/webhook.log
StandardError=append:${APP_DIR}/deploy/logs/webhook.log

[Install]
WantedBy=multi-user.target
EOF
mkdir -p "$APP_DIR/deploy/logs"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
systemctl restart "$SERVICE_NAME"
sleep 2

# ---- 4) 本机自检 ----
say "④ 本机自检"
if curl -fsS "http://127.0.0.1:${WEBHOOK_PORT}/" >/dev/null 2>&1; then
    echo "   ✅ 服务已启动，状态页可访问"
else
    warn "服务未响应，看日志：journalctl -u ${SERVICE_NAME} -n 30"
fi
systemctl is-active "$SERVICE_NAME" >/dev/null 2>&1 && echo "   ✅ systemctl: active" || warn "systemctl 状态异常"

PUBLIC_IP="$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || echo '')"

echo
say "================= 安装完成 ================="
echo "  监听：    ${WEBHOOK_HOST}:${WEBHOOK_PORT}"
echo "  密钥：    ${WEBHOOK_SECRET}"
echo

if [ "$WEBHOOK_HOST" = "127.0.0.1" ] || [ "$WEBHOOK_HOST" = "localhost" ]; then
    say "【方式 A · Nginx 反代，推荐】零新增端口"
    echo "  1) 把 deploy/nginx/tower-odyssey.conf 里 location = /__deploy 那一段"
    echo "     加进宝塔站点配置（站点 → 设置 → 配置文件），然后 nginx -s reload"
    echo "     建议把 /__deploy 改成随机串，如 /__deploy-7f3a9c，防被扫"
    echo "  2) Gitee 仓库 → 管理 → WebHooks → 添加"
    echo "     URL：   http://${PUBLIC_IP:-你的域名}/__deploy"
    echo "     密码：  ${WEBHOOK_SECRET}"
    echo "     事件：  勾选 Push"
    echo
    echo "  ⚠ 注意：Nginx 反代会把请求转到 /hook，所以 Gitee 填的路径是 /__deploy"
    echo "     （不是 /__deploy/hook），密钥照原样填。"
else
    say "【方式 B · 直接暴露端口】"
    echo "  1) 腾讯云控制台 → 安全组 → 放行 TCP ${WEBHOOK_PORT}"
    echo "     （这是云厂商那层，本机防火墙放行没用，脚本也动不了）"
    echo "  2) Gitee 仓库 → 管理 → WebHooks → 添加"
    echo "     URL：   http://${PUBLIC_IP:-服务器IP}:${WEBHOOK_PORT}/hook"
    echo "     密码：  ${WEBHOOK_SECRET}"
    echo "     事件：  勾选 Push"
fi

echo
echo "  本机自检（正常返回 {\"started\":true...} 或 {\"skipped\":...}）："
echo "    curl -X POST http://127.0.0.1:${WEBHOOK_PORT}/hook \\"
echo "      -H 'X-Gitee-Token: ${WEBHOOK_SECRET}' \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"ref\":\"refs/heads/${BRANCH}\"}'"
echo
echo "  部署日志：tail -f ${APP_DIR}/deploy/logs/webhook.log"
echo "            tail -f ${APP_DIR}/deploy/logs/deploy.log"
echo "  服务日志：journalctl -u ${SERVICE_NAME} -f"
