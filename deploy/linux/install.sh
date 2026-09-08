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
SERVICE="${SERVICE:-tower-odyssey}"
RUN_USER="${RUN_USER:-root}"

say() { echo -e "\033[36m$1\033[0m"; }
die() { echo -e "\033[31m✗ $1\033[0m"; exit 1; }

# 1) 检查 Node（兼容宝塔「Node.js版本管理器」：装了但不在 PATH 里）
say "① 检查运行环境"
. "$(dirname "$0")/detect-node.sh"
if ! detect_node; then
    die "未找到 node"
    node_hint
    exit 1
fi
NODE_VER="$("$NODE_BIN" -v)"
echo "   Node: $NODE_VER ($NODE_BIN)"
NODE_MAJOR="${NODE_VER#v}"; NODE_MAJOR="${NODE_MAJOR%%.*}"
if [ "$NODE_MAJOR" -lt 16 ]; then
    echo "✗ Node 版本过低（$NODE_VER），至少需要 16"
    node_hint
    exit 1
elif [ "$NODE_MAJOR" -lt 18 ]; then
    echo "   ⚠ Node $NODE_VER 可以正常运行本项目，但官方已停止维护，建议升到 20.x"
fi

# 2) 检查代码目录
[ -d "$APP_DIR" ] || die "目录不存在：$APP_DIR（先 git clone 项目）"
[ -f "$APP_DIR/server.js" ] || die "$APP_DIR 里没有 server.js，路径不对"
cd "$APP_DIR"
echo "   项目：$APP_DIR"

# 3) 准备数据目录
mkdir -p "$APP_DIR/data/backups"
chmod -R 755 "$APP_DIR/data" 2>/dev/null || true

# 数据库环境变量（DB_DRIVER=mysql 时生效；默认 json 文件存档）
db_env_lines() {
    local s="" val
    for v in DB_DRIVER DB_HOST DB_PORT DB_USER DB_PASS DB_NAME DB_POOL DB_AUTO_SCHEMA; do
        eval val="\${$v}"
        [ -n "$val" ] && s="${s}Environment=${v}=${val}"$'\n'
    done
    printf "%s" "$s"
}

# 4) 写 systemd 服务
say "② 注册 systemd 服务（$SERVICE）"
cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=Tower Odyssey Game Server
After=network.target mysqld.service mariadb.service

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
Environment=PORT=${PORT}
Environment=NODE_ENV=production
$(db_env_lines)Environment=PATH=${NODE_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
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
