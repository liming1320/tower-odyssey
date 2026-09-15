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

# ---------- 0.5) 单实例 + 清理卡死的旧部署进程 ----------
# 真事：部署脚本卡住不退出，每次 push 都堆一个新的，每个还带着一个 nohup 起的
# server.js —— 十几个进程一起抢 5180，systemd 永远起不来。
LOCK="/tmp/to-deploy.lock"
SELF="$$"

# ⚠️ 清理必须放在加锁「之前」。曾经写在 flock 之后，结果：卡死的部署进程一直握着锁，
#    之后的每次部署都在 flock 处直接跳过，永远走不到清理那一步 → 彻底死锁，
#    表现为「push 成功了、WebHook 也没报错，但线上代码纹丝不动」。
kill_stale_deploys() {
    local n=0
    ps -eo pid,etimes,cmd 2>/dev/null | grep "deploy/hooks/deploy.sh" | grep -v grep | while read -r p et _rest; do
        case "$p" in ''|*[!0-9]*) continue ;; esac
        [ "$p" = "$SELF" ] && continue
        [ -n "$et" ] || continue
        if [ "$et" -gt 600 ] 2>/dev/null; then
            kill -9 "$p" 2>/dev/null && log "已清理卡死 ${et}s 的部署进程 $p"
        fi
    done
    # 卡死的部署还会留下「活着但不服务」的 node（监听失败却不退出），一并清掉
    for p in $(ps -eo pid,cmd 2>/dev/null | grep "[n]ode server.js" | awk '{print $1}'); do
        [ "$(readlink /proc/$p/cwd 2>/dev/null)" = "$APP_DIR" ] || continue
        kill -9 "$p" 2>/dev/null && log "已清理本项目的游离 node 进程 $p"
    done
    return 0
}

kill_stale_deploys
exec 9>"$LOCK"
if command -v flock >/dev/null 2>&1; then
    # 先等 20s（正常部署也就几秒）；拿不到就再清一次老进程后重试，仍不行才放弃
    if ! flock -w 20 9; then
        log "⚠ 等待 20s 仍拿不到部署锁，清理卡死进程后重试"
        kill_stale_deploys
        flock -w 20 9 || { log "✗ 仍拿不到部署锁（有其它部署在跑），本次放弃"; exit 0; }
    fi
fi

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

# timeout：网络/凭据异常时 git 可能无限期挂住，把部署进程永远留在进程表里
if ! timeout 120 git fetch --all --quiet 2>>"$LOG"; then
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

# 结束占用 PORT 的游离进程（systemd 拉不起来的常见原因）
kill_port_holders() {
    local pids="" pid
    if command -v ss >/dev/null 2>&1; then
        pids="$(ss -lptnH "sport = :${PORT}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2)"
    fi
    if [ -z "$pids" ] && command -v lsof >/dev/null 2>&1; then
        pids="$(lsof -ti ":${PORT}" -sTCP:LISTEN 2>/dev/null)"
    fi
    for pid in $(echo "$pids" | sort -u); do
        case "$pid" in ''|*[!0-9]*) continue;; esac
        [ "$pid" = "0" ] && continue
        kill -9 "$pid" 2>/dev/null && log "已结束占用 ${PORT} 的游离进程 $pid"
    done
}

# ---------- 3) 重启服务 ----------
restart_service() {
    # 非 root（宝塔 WebHook 以 www 运行）时连 stop/start 也要走 sudo，否则一律失败
    SCTL="systemctl"
    if [ "$(id -u)" != "0" ] && command -v sudo >/dev/null 2>&1; then SCTL="sudo -n systemctl"; fi
    if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "$SERVICE"; then
        # ⚠️ 不能指望 systemctl restart 自己搞定端口。端口若被上次 nohup 直启的游离进程占着，
        # systemd 那份会 EADDRINUSE：旧代码不退出（restart 还返回成功 → 部署「假成功」，线上仍是旧进程），
        # 新代码直接退出（连续失败会触发 start-limit，单元被打进 failed，之后 start 全被拒）。
        # 所以每次都主动：停服 → 清空端口 → reset-failed → 启动。
        log "停服并清空 ${PORT}（避免游离进程抢占导致 systemd 起不来）"
        $SCTL stop "$SERVICE" 2>/dev/null
        kill_port_holders
        sleep 1
        $SCTL reset-failed "$SERVICE" 2>/dev/null
        if $SCTL start "$SERVICE" 2>>"$LOG"; then
            log "已通过 systemctl 重启（已先清空 ${PORT}）"
            return 0
        fi
        log "✗ systemctl 仍无法启动，日志：journalctl -u $SERVICE -n 20"
        if [ "$(id -u)" != "0" ]; then
            log "   多半是权限问题（WebHook 以 $(id -un) 运行）。放行办法（root 执行一次）："
            log "     cp $APP_DIR/deploy/linux/sudoers-tower-odyssey /etc/sudoers.d/tower-odyssey"
            log "     chmod 440 /etc/sudoers.d/tower-odyssey && visudo -c"
        fi
    fi
    # ⚠️ 兜底直启会留下游离进程，下次 systemd 就再也起不来（EADDRINUSE）——
    #    能走 systemd 就绝不要走到这里。
    log "⚠ 回退到直接启动（systemd 不可用）—— 这会留下游离进程，请尽快按上面提示放行 sudo"
    pkill -f "node ${APP_DIR}/server.js" 2>/dev/null || true
    kill_port_holders
    sleep 2
    cd "$APP_DIR" && nohup "$NODE_BIN" server.js >>"$LOG_DIR/server.log" 2>&1 &
}
restart_service
log "服务已重启"

# ---------- 4) 健康检查，失败自动回滚 ----------
OK=0
for i in $(seq 1 20); do
    sleep 1
    if curl -fsS -m 5 "http://127.0.0.1:${PORT}/api/health" >>"$LOG" 2>&1; then OK=1; break; fi
done

if [ "$OK" = "1" ]; then
    log "✅ 部署成功：$(git log -1 --oneline)"
    # 存储模式一致性检查：配了 data/db-env.json（MySQL）但服务跑在 json 模式，
    # 说明进程没拿到数据库配置（如游离 nohup 进程），会导致新玩家不进 MySQL —— 立刻告警。
    if [ -f "$APP_DIR/data/db-env.json" ]; then
        if curl -fsS -m 5 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null | grep -q '"storage":"json'; then
            log "☠⚠ 严重告警：data/db-env.json 已配置 MySQL，但服务正在 json 模式运行！"
            log "   新注册玩家会写进 data/db.json 而不是 MySQL。请执行：systemctl restart tower-odyssey"
        fi
    fi
    rm -f "$SNAP"
    exit 0
fi

log "✗ 健康检查失败，回滚到 $OLD_SHA"
git reset --hard "$OLD_SHA" --quiet 2>>"$LOG"
restore_db
restart_service
sleep 3
curl -fsS -m 5 "http://127.0.0.1:${PORT}/api/health" >>"$LOG" 2>&1 \
    && log "↩ 回滚完成，服务已恢复" \
    || log "☠ 回滚后仍不健康，请人工检查：$LOG"
rm -f "$SNAP"
exit 1
