#!/usr/bin/env bash
# 自动部署脚本（被 WebHook / 流水线调用）
#   拉取最新代码 → 备份存档 → 重启服务 → 健康检查 → 失败自动回滚
#
# 用法：bash deploy/hooks/deploy.sh [分支名]
# 环境变量：APP_DIR（默认脚本上级两级）/ SERVICE（默认 tower-odyssey）/ PORT（默认 5180）

set -o pipefail
BRANCH="${1:-master}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SERVICE="${SERVICE:-tower-odyssey}"
PORT="${PORT:-5180}"
LOG_DIR="$APP_DIR/deploy/logs"
LOG="$LOG_DIR/deploy.log"
mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

log "===== 开始部署 branch=$BRANCH ====="
cd "$APP_DIR" || { log "✗ 目录不存在：$APP_DIR"; exit 1; }

# 0) 记录当前版本，便于回滚
OLD_SHA="$(git rev-parse HEAD 2>/dev/null)"
log "当前版本：$OLD_SHA"

# 1) 拉取代码
#    禁止交互：万一 SSH 公钥/令牌失效，git 会卡在输密码，这里直接失败走回滚，不阻塞 WebHook
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/bin/true
git config --global --add safe.directory "$APP_DIR" >/dev/null 2>&1
git fetch --all --quiet 2>>"$LOG" || { log "✗ git fetch 失败（SSH 公钥或令牌权限失效？）"; exit 1; }
git checkout "$BRANCH" --quiet 2>>"$LOG" || { log "✗ 切换分支 $BRANCH 失败"; exit 1; }
git reset --hard "origin/$BRANCH" --quiet 2>>"$LOG" || { log "✗ 拉取代码失败"; exit 1; }
NEW_SHA="$(git rev-parse HEAD)"
[ "$OLD_SHA" = "$NEW_SHA" ] && log "代码无变化（$NEW_SHA），仍执行重启以保稳妥"
log "新版本：$NEW_SHA"

# 2) 部署前备份存档（回滚用）
if [ -f "$APP_DIR/data/db.json" ]; then
    mkdir -p "$APP_DIR/data/backups"
    cp "$APP_DIR/data/db.json" "$APP_DIR/data/backups/pre-deploy-$(date '+%F-%H%M%S').json"
    log "存档已备份"
fi

# 3) 重启服务（有 systemd 用它，没有就直接杀进程重起）
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "$SERVICE"; then
    systemctl restart "$SERVICE" 2>>"$LOG"
    log "已通过 systemd 重启 $SERVICE"
else
    # 兜底：按「项目目录 + server.js」精确匹配，避免误杀其它 node 进程（例如 webhook 服务）
    pkill -f "node ${APP_DIR}/server.js" 2>/dev/null || true
    sleep 2
    cd "$APP_DIR" && nohup node server.js >>"$LOG_DIR/server.log" 2>&1 &
    log "已直接启动 node server.js"
fi

# 4) 健康检查，失败自动回滚
OK=0
for i in $(seq 1 20); do
    sleep 1
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >>"$LOG" 2>&1; then OK=1; break; fi
done

if [ "$OK" = "1" ]; then
    log "✅ 部署成功：$(git log -1 --oneline)"
    exit 0
fi

log "✗ 健康检查失败，回滚到 $OLD_SHA"
git reset --hard "$OLD_SHA" --quiet 2>>"$LOG"
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "$SERVICE"; then
    systemctl restart "$SERVICE" 2>>"$LOG"
else
    pkill -f "node ${APP_DIR}/server.js" 2>/dev/null || true
    sleep 2
    cd "$APP_DIR" && nohup node server.js >>"$LOG_DIR/server.log" 2>&1 &
fi
sleep 3
curl -fsS "http://127.0.0.1:${PORT}/api/health" >>"$LOG" 2>&1 \
    && log "↩ 回滚完成，服务已恢复" \
    || log "☠ 回滚后仍不健康，请人工检查：$LOG"
exit 1
