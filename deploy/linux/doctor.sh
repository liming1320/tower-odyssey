#!/usr/bin/env bash
# 塔界远征 · 服务起不来的体检脚本（只读诊断，不改任何东西）
#
#   sudo bash deploy/linux/doctor.sh
#   APP_DIR=/www/wwwroot/tower-odyssey PORT=5180 SERVICE=tower-odyssey sudo -E bash deploy/linux/doctor.sh
#
# 每节都会打印结论，最后给一条最可能的修复命令。

APP_DIR="${APP_DIR:-/www/wwwroot/tower-odyssey}"
PORT="${PORT:-5180}"
SERVICE="${SERVICE:-tower-odyssey}"
UNIT="/etc/systemd/system/${SERVICE}.service"

C=$'\033[36m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; Z=$'\033[0m'
say() { echo -e "${C}$1${Z}"; }
ok()  { echo -e "  ${G}✅ $1${Z}"; }
warn(){ echo -e "  ${Y}⚠ $1${Z}"; }
bad() { echo -e "  ${R}✗ $1${Z}"; }

echo "================ 塔界远征 · 服务体检 ================"
echo "时间：$(date '+%F %T')"
echo "目录：$APP_DIR   端口：$PORT   服务名：$SERVICE"
echo

# ---------- 1. systemd 服务存在吗 ----------
say "① systemd 服务"
if [ -f "$UNIT" ]; then
    ok "单元文件存在：$UNIT"
    echo "  ---- ExecStart / User / Environment ----"
    grep -E '^(ExecStart|User|WorkingDirectory|Environment|Restart)=' "$UNIT" | sed 's/^/  /'
    echo
else
    bad "没有 $UNIT —— systemctl 根本没这个服务"
    echo "     先跑： sudo bash $APP_DIR/deploy/linux/install.sh"
fi

# ---------- 2. 服务状态 ----------
say "② 服务状态"
if command -v systemctl >/dev/null 2>&1; then
    ACT="$(systemctl is-active "$SERVICE" 2>/dev/null)"
    ENB="$(systemctl is-enabled "$SERVICE" 2>/dev/null)"
    [ "$ACT" = "active" ] && ok "is-active = $ACT" || bad "is-active = ${ACT:-unknown}"
    [ "$ENB" = "enabled" ] && ok "is-enabled = $ENB" || warn "is-enabled = ${ENB:-unknown}（开机不会自启：systemctl enable $SERVICE）"
    echo "  ---- systemctl status（前 12 行）----"
    systemctl status "$SERVICE" --no-pager -n 0 2>&1 | head -12 | sed 's/^/  /'
    echo
fi

# ---------- 3. 最近日志（最关键）----------
say "③ 最近 40 行日志（journalctl -u $SERVICE）"
if command -v journalctl >/dev/null 2>&1; then
    journalctl -u "$SERVICE" -n 40 --no-pager 2>&1 | sed 's/^/  /'
else
    warn "没有 journalctl，跳过"
fi
echo

# ---------- 4. 端口被谁占了 ----------
say "④ 端口 $PORT 占用情况"
PORT_UP=""
if command -v ss >/dev/null 2>&1; then
    ss -lntp 2>/dev/null | grep -E ":$PORT\b|Local" | sed 's/^/  /'
    ss -lnt 2>/dev/null | grep -qE ":$PORT\b" && PORT_UP=1
elif command -v netstat >/dev/null 2>&1; then
    netstat -lntp 2>/dev/null | grep -E ":$PORT\b|Proto" | sed 's/^/  /'
    netstat -lnt 2>/dev/null | grep -qE ":$PORT\b" && PORT_UP=1
else
    warn "没有 ss / netstat"
fi
# 「systemd 显示 active 但端口没监听」是最容易被误判的情况：
# 进程在、日志也正常，但初始化阶段抛异常把 server.listen() 带没了。
if [ -z "$PORT_UP" ]; then
    bad "$PORT 没有任何监听 —— 这就是网页打不开的直接原因"
    echo "  ↳ 若 ② 显示 active (running)，说明进程活着但没走到 listen()，"
    echo "    去看 ③ 日志里紧跟在「已载入 N 名玩家」后面的第一条异常。"
else
    ok "$PORT 已在监听"
    echo "  ↳ 本机自检：curl -s -o /dev/null -w '%{http_code}' --noproxy '*' http://127.0.0.1:$PORT/api/health" \
        " → 实际：$(curl -s -o /dev/null -w '%{http_code}' -m 3 --noproxy '*' "http://127.0.0.1:$PORT/api/health" 2>/dev/null)"
fi
echo

# ---------- 5. 游离的 node 进程（EADDRINUSE 元凶）----------
say "⑤ 还在跑的 node / server.js 进程"
PS_OUT="$(ps -eo pid,ppid,etime,cmd 2>/dev/null | grep -E "node .*server\.js|node .*tower" | grep -v grep)"
if [ -n "$PS_OUT" ]; then
    warn "发现以下进程（可能是旧的手动启动，会占着 $PORT 让 systemd 起不来）："
    echo "$PS_OUT" | sed 's/^/  /'
else
    ok "没有游离的 node server.js 进程"
fi
echo

# ---------- 6. node 在不在（宝塔常见坑）----------
say "⑥ Node 环境"
# 注意：ExecStart=/path/to/node /path/to/server.js
# 整行按空格切的话 $2 是**脚本**不是 node，必须先剥掉 "ExecStart=" 前缀再取第一个字段。
# （曾经写成 awk '{print $2}'，结果永远报「node 不可执行: .../server.js」的假红）
EXEC_LINE="$(grep -m1 '^ExecStart=' "$UNIT" 2>/dev/null | sed 's/^ExecStart=//; s/^-//')"
NODE_BIN="$(echo "$EXEC_LINE" | awk '{print $1}')"
# ExecStart 可能是 wrapper（/bin/bash -c "..."），这时第一个字段不是 node，退回去找 PATH 里的
case "$NODE_BIN" in
    */node|node) ;;
    *) [ -n "$NODE_BIN" ] && warn "ExecStart 第一个字段不像 node（$NODE_BIN）—— 可能是 wrapper，改用 PATH 里的 node"; NODE_BIN="";;
esac
if [ -n "$NODE_BIN" ]; then
    if [ -x "$NODE_BIN" ]; then ok "ExecStart 里的 node 可用：$NODE_BIN（$("$NODE_BIN" -v 2>&1)）"
    else bad "ExecStart 里的 node 不可执行：$NODE_BIN（宝塔装的通常在 /www/server/nodejs/<版本>/bin/node）"; NODE_BIN=""; fi
else
    warn "读不到有效的 ExecStart"
fi
echo "  PATH 里的 node：$(command -v node || echo '（不在 PATH）') $(node -v 2>/dev/null)"
echo "  常见路径："
for p in /usr/bin/node /usr/local/bin/node /www/server/nodejs/*/bin/node; do
    [ -x "$p" ] && echo "    - $p  ($("$p" -v 2>&1))"
done
echo

# ---------- 7. 依赖 / 目录 ----------
say "⑦ 代码与依赖"
[ -f "$APP_DIR/server.js" ] && ok "server.js 存在" || bad "server.js 不存在（APP_DIR 不对？）"
if [ -f "$APP_DIR/node_modules/mysql2/package.json" ]; then ok "mysql2 已安装"
else warn "没装 mysql2 —— 如果 DB_DRIVER=mysql 会直接 process.exit(1)（npm i mysql2 或改回 json）"; fi
echo "  git HEAD：$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null)  分支：$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)"
echo

# ---------- 8. 机器资源 ----------
say "⑧ 资源"
echo "  内存：$(free -m 2>/dev/null | awk '/Mem:/{printf "%.0f/%.0f MB（可用 %.0f MB）", $3, $2, $7}')"
echo "  磁盘：$(df -h "$APP_DIR" 2>/dev/null | awk 'NR==2{print $5" 已用，剩 "$4}')"
echo "  负载：$(cat /proc/loadavg 2>/dev/null | awk '{print $1" "$2" "$3}')"
echo

# ---------- 9. 前台试跑（最能暴露真错）----------
say "⑨ 前台试跑 6 秒（直接看报什么错）"
cd "$APP_DIR" 2>/dev/null || { bad "cd 不进 $APP_DIR"; exit 1; }
RUN_NODE="${NODE_BIN:-$(command -v node)}"
if [ -z "$RUN_NODE" ] || [ ! -x "$RUN_NODE" ]; then
    bad "找不到可执行的 node，跳过试跑"
else
    echo "  执行：timeout 6 $RUN_NODE server.js"
    timeout 6 "$RUN_NODE" server.js 2>&1 | head -30 | sed 's/^/  /'
    echo "  （退出码 $?；137/124 = 被 timeout 正常杀掉 = 服务其实能起来）"
fi
echo

# ---------- 结论 ----------
say "================ 最可能的修复 ================"
cat <<EOF
  1) 先看 ③ 的日志，那里会直接写出崩溃原因。

  2) 如果是 EADDRINUSE（端口被占）— ⑤ 里能看到游离进程：
       pkill -f "node server.js"; sleep 2
       systemctl restart $SERVICE

  3) 如果是 node 路径不对（⑥ 报红）— 重装一次服务让它自动探测：
       sudo bash deploy/linux/install.sh

  4) 如果是 mysql2 没装 / MySQL 连不上（⑦）：
       cd $APP_DIR && npm i mysql2
       # 或者先用文件存档顶上：在 $UNIT 里加 Environment=DB_DRIVER=json

  5) 只是想立刻恢复访问（别用 nohup 手启，会留下游离进程再占端口）：
       pkill -f "node .*server\.js"; sleep 2
       systemctl restart $SERVICE; sleep 3
       curl -s -o /dev/null -w '%{http_code}' --noproxy '*' http://127.0.0.1:$PORT/api/health
       # 想看实时日志：journalctl -u $SERVICE -f

  6) ④ 报「端口没监听」但 ② 是 active：
     进程活着却没 listen()，一定是启动初始化抛异常了。
     看 ③ 里「已载入 N 名玩家」之后的第一条 TypeError，修掉即可。
EOF
echo
