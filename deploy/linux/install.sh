#!/usr/bin/env bash
# 塔界远征 · Linux 一键部署（systemd 守护 / 开机自启 / 崩溃自动重启）
#
#   sudo bash deploy/linux/install.sh
#   APP_DIR=/opt/tower-odyssey PORT=5180 sudo -E bash deploy/linux/install.sh
#
# 需要：Node 18+（宝塔可在「Node.js版本管理器」安装）、git、root 权限
set -e

APP_DIR="${APP_DIR:-/www/wwwroot/tower-odyssey}"
PORT="${PORT:-5180}"
SERVICE="tower-odyssey"
RUN_USER="${RUN_USER:-root}"

say() { echo -e "\033[36m$1\033[0m"; }
die() { echo -e "\033[31m✗ $1\033[0m"; exit 1; }

# 1) 检查 Node
say "① 检查运行环境"
command -v node >/dev/null 2>&1 || die "未找到 node，请先安装 Node 18+（宝塔：软件商店 → Node.js版本管理器）"
NODE_BIN="$(command -v node)"
NODE_VER="$(node -v)"
echo "   Node: $NODE_VER ($NODE_BIN)"
NODE_MAJOR="${NODE_VER#v}"; NODE_MAJOR="${NODE_MAJOR%%.*}"
[ "$NODE_MAJOR" -ge 18 ] || die "Node 版本过低（$NODE_VER），需要 >= 18"

# 2) 检查代码目录
[ -d "$APP_DIR" ] || die "目录不存在：$APP_DIR（先 git clone 项目）"
[ -f "$APP_DIR/server.js" ] || die "$APP_DIR 里没有 server.js，路径不对"
cd "$APP_DIR"
echo "   项目：$APP_DIR"

# 3) 准备数据目录
mkdir -p "$APP_DIR/data/backups"
chmod -R 755 "$APP_DIR/data" 2>/dev/null || true

# 4) 写 systemd 服务
say "② 注册 systemd 服务（$SERVICE）"
cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=Tower Odyssey Game Server
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
Environment=PORT=${PORT}
Environment=NODE_ENV=production
ExecStart=${NODE_BIN} ${APP_DIR}/server.js
Restart=always
RestartSec=3
# 安全加固（不影响运行）
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

# 5) 等待并检查健康
say "③ 健康检查"
sleep 2
for i in $(seq 1 15); do
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/tmp/to-health.json 2>/dev/null; then
        echo "   ✅ 服务已启动："
        cat /tmp/to-health.json | head -c 400; echo
        break
    fi
    [ "$i" = 15 ] && { systemctl status "$SERVICE" --no-pager | head -15; die "服务未起来，看日志：journalctl -u $SERVICE -n 50"; }
    sleep 1
done

# 6) 防火墙提示
say "④ 端口"
if command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=${PORT}/tcp >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 && echo "   firewalld 已放行 ${PORT}"
elif command -v ufw >/dev/null 2>&1; then
    ufw allow ${PORT}/tcp >/dev/null 2>&1 && echo "   ufw 已放行 ${PORT}"
else
    echo "   未检测到 firewalld/ufw，请手动放行 ${PORT}（腾讯云安全组也要放行）"
fi

say ""
say "✅ 部署完成"
echo "   状态：systemctl status $SERVICE"
echo "   日志：journalctl -u $SERVICE -f"
echo "   重启：systemctl restart $SERVICE"
echo "   停止：systemctl stop $SERVICE"
echo "   本地：curl 127.0.0.1:${PORT}/api/health"
echo "   外网：http://服务器公网IP:${PORT}   （记得在腾讯云安全组放行 ${PORT}）"
echo "   下一步：配 Nginx 反代 + 域名 + HTTPS（见 deploy/nginx/tower-odyssey.conf）"
