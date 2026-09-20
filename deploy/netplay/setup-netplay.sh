#!/usr/bin/env bash
# 自建 EmulatorJS Netplay 信令服务器（tower-odyssey 生产用）
# 目的：把联机信令留在自家服务器，避免公开大厅里和陌生人挤在一起、且跨公网更可控。
# 用法（服务器上）：bash deploy/netplay/setup-netplay.sh
# 前置：node v18+、git、systemctl
set -e

INSTALL_DIR=/opt/emulatorjs-netplay
PORT=3000

echo "== 1) 拉取官方 netplay 服务（含 node 版 server.js）=="
if [ ! -d "$INSTALL_DIR" ]; then
  git clone https://github.com/EmulatorJS/EmulatorJS-Netplay.git "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
# 上游默认分支历史上在 rust / main / node 间切换；优先找含 node server.js 的分支
if [ ! -f server.js ]; then
  for b in main node master; do
    git checkout "$b" 2>/dev/null && [ -f server.js ] && break
  done
fi
[ -f server.js ] || { echo "✗ 未找到 server.js，请检查 EmulatorJS-Netplay 仓库分支"; exit 1; }

echo "== 2) 安装依赖（express / socket.io / cors）=="
npm install --omit=dev

echo "== 3) 写 systemd 单元 =="
cat > /etc/systemd/system/tower-odyssey-netplay.service <<EOF
[Unit]
Description=Tower Odyssey - EmulatorJS Netplay signaling server
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Environment=PORT=$PORT
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "== 4) 启用并启动 =="
systemctl daemon-reload
systemctl enable --now tower-odyssey-netplay
systemctl status tower-odyssey-netplay --no-pager

echo ""
echo "== 完成 =="
echo "把 emulator.js 里 NETPLAY.server 改成 'https://你的域名/netplay/' 即可走自建信令"
echo "别忘了在 Nginx 加上 deploy/netplay/nginx-netplay.conf 的 /netplay/ 反代并重载"
