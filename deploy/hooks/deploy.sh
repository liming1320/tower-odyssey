#!/usr/bin/env bash
# 自动部署脚本（被宝塔 WebHook / 自建 CD / 流水线调用）
#   快照存档 → 拉代码 → 还原存档 → 重启 → 健康检查 → 失败自动回滚
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

# ---------- 0) 运行环境：WebHook 的 PATH 常常没有 node ----------
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
if ! command -v node >/dev/null 2>&1; then
    for d in /www/server/nodejs/*/bin /usr/local/nodejs/bin /opt/node*/bin /usr/local/n/versions/node/*/bin; do
        [ -x "$d/node" ] && { export PATH="$PATH:$d"; break; }
    done
fi
if ! command -v node >/dev/null 2>&1; then
    log "✗ 找不到 node，请把 node 所在目录加入 PATH"
    exit 1
fi
NODE_BIN="$(command -v node)"
log "===== 开始部署 branch=$BRANCH (node $(node -v) @ $NODE_BIN) ====="

cd "$APP_DIR" || { log "✗ 目录不存在：$APP_DIR"; exit 1; }

# ---------- 1) 存档保护（最高优先级）----------
# data/db.json 是玩家数据。它曾经被 git 跟踪过，历史 commit 里仍有它，
# 而 `git reset --hard` 会用仓库里的版本覆盖甚至删除它 —— 那样玩家数据就没了。
# 所以：拉取前先快照，拉取/回滚后无条件还原。
DB="$APP_DIR/data/db.json"
SNAP="$(mktemp /tmp/to-db-XXXXXX.json)"
save_db() {
    if [ -f "$DB" ]; then
        cp "$DB" "$SNAP" && log "存档已快照（$(du -h "$DB" | cut -f1)）"
        # 同时留一份人类可读的部署前备份，便于人工找回
        mkdir -p "$APP_DIR/data/backups"
        cp "$DB" "$APP_DIR/data/backups/pre-deploy-$(date '+%F-%H%M%S').json" 2>/dev/null
    else
        log "提示：data/db.json 不存在，首次部署将由 server.js 自动生成"
        : > "$SNAP"
    fi
}
restore_db() {
    [ -s "$SNAP" ] || return 0
    mkdir -p "$APP_DIR/data"
    if ! cmp -s "$SNAP" "$DB" 2>/dev/null; then
        cp "$SNAP" "$DB" && log "存档已还原（代码仓库中的 db.json 不覆盖线上数据）"
    fi
}
save_db

# ---------- 2) 拉取代码 ----------
# 禁止交互：万一 SSH 公钥/令牌失效，git 会卡在输密码，这里直接失败走回滚，不阻塞 WebHook
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/bin/true
git config --global --add safe.directory "$APP_DIR" >/dev/null 2>&1

OLD_SHA="$(git rev-parse HEAD 2>/dev/null)"
log "当前版本：$OLD_SHA"

if ! git fetch --all --quiet 2>>"$LOG"; then
    log "✗ git fetch 失败（SSH 公钥或令牌权限失效？）"; restore_db; exit 1
fi
# 注意 -f：db.json 曾被 git 跟踪，服务器上它必然被玩家数据改过，
# 不带 -f 的 checkout 会因为「本地修改会被覆盖」直接报失败，导致部署卡住。
git checkout -f "$BRANCH" --quiet 2>>"$LOG" || { log "✗ 切换分支 $BRANCH 失败"; restore_db; exit 1; }
git reset --hard "origin/$BRANCH" --quiet 2>>"$LOG" || { log "✗ 拉取代码失败"; restore_db; exit 1; }
# 老版本仓库里跟踪过 db.json，这里彻底摘掉索引，避免以后再干扰部署
git rm --cached --quiet data/db.json 2>/dev/null && { log "已将 data/db.json 从 git 索引中移除"; git reset -q -- data/db.json 2>/dev/null || true; }

NEW_SHA="$(git rev-parse HEAD)"
[ "$OLD_SHA" = "$NEW_SHA" ] && log "代码无变化（$NEW_SHA），仍执行重启以保稳妥"
log "新版本：$NEW_SHA  $(git log -1 --pretty=%s)"
restore_db

# ---------- 3) 重启服务 ----------
restart_service() {
    if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "$SERVICE"; then
        systemctl restart "$SERVICE" 2>>"$LOG" && return 0
        # 非 root（如某些 WebHook 插件以 www 运行）时 systemctl 会失败，退回直启
        log "systemctl 重启失败（权限？），改用直接启动"
    fi
    pkill -f "node ${APP_DIR}/server.js" 2>/dev/null || true
    sleep 2
    cd "$APP_DIR" && nohup "$NODE_BIN" server.js >>"$LOG_DIR/server.log" 2>&1 &
}
restart_service
log "服务已重启"

# ---------- 4) 健康检查，失败自动回滚 ----------
OK=0
for i in $(seq 1 20); do
    sleep 1
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >>"$LOG" 2>&1; then OK=1; break; fi
done

if [ "$OK" = "1" ]; then
    log "✅ 部署成功：$(git log -1 --oneline)"
    rm -f "$SNAP"
    exit 0
fi

log "✗ 健康检查失败，回滚到 $OLD_SHA"
git reset --hard "$OLD_SHA" --quiet 2>>"$LOG"
restore_db
restart_service
sleep 3
curl -fsS "http://127.0.0.1:${PORT}/api/health" >>"$LOG" 2>&1 \
    && log "↩ 回滚完成，服务已恢复" \
    || log "☠ 回滚后仍不健康，请人工检查：$LOG"
rm -f "$SNAP"
exit 1
