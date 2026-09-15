#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# tavern-admin.sh —— 在 Linux 服务器上配置 SillyTavern 账号（纯命令行，无需图形界面）
#
# 场景：SillyTavern 跑在没有桌面的 Linux 上，你没法打开它的登录页去注册/改密码，
#       于是塔界远征的网关一直拿不到可用的管理员凭据。
#
# 先跑探测（它会告诉你 ST 装在哪、怎么跑的、下一步该敲什么）：
#   ./tools/tavern-admin.sh detect
#
# 其它命令：
#   ./tools/tavern-admin.sh list                  # 列出 ST 里的账号（走 API）
#   ./tools/tavern-admin.sh config <ST目录>       # 打开多用户模式（改 config.yaml，自动备份）
#   ./tools/tavern-admin.sh passwd <handle>       # 用「找回密码」通道给账号设密码
#
# 环境变量：
#   ST_URL     SillyTavern 地址，默认 http://127.0.0.1:8000
# ---------------------------------------------------------------------------
set -uo pipefail   # 故意不加 -e：探测阶段大量 grep 可能匹配不到，不该中断整个脚本

ST_URL="${ST_URL:-http://127.0.0.1:8000}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

die() { echo "✗ $*" >&2; exit 1; }

# =========================================================== 探测
cmd_detect() {
    echo "━━ 1) 8000 端口是谁在听 ━━"
    local portinfo=""
    if command -v ss >/dev/null 2>&1; then portinfo="$(ss -lntp 2>/dev/null | grep -w 8000)"
    elif command -v netstat >/dev/null 2>&1; then portinfo="$(netstat -lntp 2>/dev/null | grep -w 8000)"; fi
    if [ -n "$portinfo" ]; then echo "$portinfo" | sed 's/^/  /'
    else echo "  ⚠ 8000 没在监听 —— ST 没启动，或端口被改过"; fi

    echo
    echo "━━ 2) ST 是怎么跑起来的（决定你用哪条重启命令）━━"
    local found=0 u p d pr
    if command -v systemctl >/dev/null 2>&1; then
        u="$(systemctl list-unit-files 2>/dev/null | grep -i silly || true)"
        [ -n "$u" ] && { echo "$u" | sed 's/^/  systemd: /'; found=1; }
    fi
    if command -v pm2 >/dev/null 2>&1; then
        p="$(pm2 jlist 2>/dev/null | grep -o '"name":"[^"]*"' | grep -i silly || true)"
        [ -n "$p" ] && { echo "  pm2: $p"; found=1; }
    fi
    if command -v docker >/dev/null 2>&1; then
        d="$(docker ps --format '{{.Names}} ({{.Image}})' 2>/dev/null | grep -i silly || true)"
        [ -n "$d" ] && { echo "  docker: $d"; found=1; }
    fi
    pr="$(ps -ef 2>/dev/null | grep '[s]erver\.js' | grep -i silly || true)"
    [ -n "$pr" ] && { echo "$pr" | sed 's/^/  进程: /'; found=1; }

    # 光看进程列表会误判成「裸进程」——PM2 起的工作进程，父进程是 "PM2 vX: God Daemon"。
    # 而且 pm2 常常不在 root 的 PATH 里，所以必须靠父进程识别，不能只靠 command -v pm2。
    local pids; pids="$(ps -eo pid,cmd 2>/dev/null | grep '[s]erver\.js' | grep -i silly | awk '{print $1}' || true)"
    for pid in $pids; do
        local ppid pcmd
        ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
        pcmd="$(ps -o cmd= -p "$ppid" 2>/dev/null || true)"
        case "$pcmd" in
            *PM2*)        echo "  ⇒ 由 **PM2** 托管（父进程 $ppid 是 PM2 God Daemon）→ 用 pm2 重启"
                          command -v pm2 >/dev/null 2>&1 || echo "     ⚠ pm2 不在 PATH 里，先找它：find / -maxdepth 6 -name pm2 -type f 2>/dev/null | head -3" ;;
            *docker*|*containerd*) echo "  ⇒ 由 **docker** 托管（父进程 $ppid）→ docker restart <容器名>" ;;
            *systemd*)    echo "  ⇒ 由 **systemd** 托管（父进程 $ppid）" ;;
            *)            echo "  ⇒ 裸进程（父进程 $ppid: ${pcmd:0:50}）" ;;
        esac
    done
    [ "$found" = 0 ] && echo "  ⚠ 没找到 ST 进程（systemd / pm2 / docker / 裸进程 都没匹配到）"

    echo
    echo "━━ 3) config.yaml 在哪 ━━"
    # 按内容特征找，比按目录名猜靠谱（克隆目录可能叫 st / ai-tavern / tavern…）
    local cands
    cands="$(find /www /home /root /opt /srv /data /usr/local /mnt -maxdepth 6 -name config.yaml \
             2>/dev/null | xargs grep -l 'enableUserAccounts' 2>/dev/null | head -5 || true)"
    if [ -z "$cands" ]; then
        echo "  ⚠ 没找到 —— ST 至少要先成功启动一次才会生成 config.yaml"
    else
        echo "$cands" | while read -r f; do
            echo "  📄 $f"
            grep -nE '^[[:space:]]*(enableUserAccounts|listen|whitelistMode|port)[[:space:]]*:' "$f" 2>/dev/null | sed 's/^/       /'
        done
    fi

    echo
    echo "━━ 4) ST 里已有哪些账号（读 data 目录）━━"
    if [ -n "$cands" ]; then
        echo "$cands" | while read -r f; do
            local dd; dd="$(dirname "$f")/data"
            if [ -d "$dd" ]; then
                echo "  $dd"
                ls -1 "$dd" 2>/dev/null | grep -vE '^(backups|assets|extensions|_uploads|_storage|default-content)$' | sed 's/^/     - /'
            fi
        done
    fi

    echo
    echo "━━ 4.5) 冲突检查（两种守护同时管 ST 会抢 8000 端口）━━"
    local has_unit=0 has_pm2=0
    systemctl list-unit-files 2>/dev/null | grep -qi silly && has_unit=1
    ps -eo pid,cmd 2>/dev/null | grep '[s]erver\.js' | grep -i silly | awk '{print $1}' | while read -r pid; do
        local ppid; ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
        ps -o cmd= -p "$ppid" 2>/dev/null | grep -q PM2 && echo "  PM2 也在管 ST（pid $pid）"
    done
    [ "$has_unit" = 1 ] && echo "  systemd 有 sillytavern 服务"
    if [ "$has_unit" = 1 ]; then
        echo "  ⚠ 若上面同时出现 PM2 和 systemd，二选一，别两个都开："
        echo "     留 PM2   : systemctl disable --now sillytavern && rm -f /etc/systemd/system/sillytavern.service && systemctl daemon-reload"
        echo "     留 systemd: pm2 stop <名字> && pm2 delete <名字>，再 systemctl restart sillytavern"
    else
        echo "  ✓ 没有发现双重守护"
    fi

    echo
    echo "━━ 5) 塔界远征服务状态 ━━"
    if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q tower-odyssey; then
        echo "  tower-odyssey: $(systemctl is-active tower-odyssey 2>/dev/null)"
    else
        echo "  没找到 tower-odyssey 服务"
    fi

    echo
    echo "━━ 下一步 ━━"
    echo "  ① 确认第 3 步里 enableUserAccounts 是 true（是 false 就跑：$0 config <ST目录>）"
    echo "  ② 按第 2 步「⇒」指出的方式重启 SillyTavern（**只能选一种守护**）："
    echo "       PM2     : pm2 restart <名字>          （日志：pm2 logs <名字> --lines 50）"
    echo "       systemd : systemctl restart sillytavern（日志：journalctl -u sillytavern -f）"
    echo "       docker  : docker restart <容器名>"
    echo "       裸进程  : cd <ST目录> && nohup node server.js > st.log 2>&1 &"
    echo "     ⚠ 别一边留 PM2 一边加 systemd：PM2 会自动拉起工作进程占住 8000，"
    echo "       systemd 永远起不来，只会刷 'Address 127.0.0.1:8000 is already in use'。"
    echo "  ③ $0 list           看看有哪些账号"
    echo "  ④ $0 passwd <句柄>   设密码（验证码会打到 ST 控制台）"
    echo "  ⑤ systemctl restart tower-odyssey   让塔界远征加载新配置"
}

# =========================================================== 打开多用户模式
cmd_config() {
    local dir="${1:-}"
    [ -n "$dir" ] || die "用法：$0 config <SillyTavern 安装目录>"
    local f="$dir/config.yaml"
    [ -f "$f" ] || die "没有 $f —— ST 至少要先成功启动过一次才会生成它"

    cp "$f" "$f.bak.$(date +%Y%m%d%H%M%S)" && echo "✓ 已备份原文件（同目录 .bak 后缀）"

    if grep -qE '^[[:space:]]*enableUserAccounts[[:space:]]*:' "$f"; then
        sed -i -E 's/^([[:space:]]*enableUserAccounts[[:space:]]*:[[:space:]]*).*/\1true/' "$f"
    else
        printf '\n# 多用户模式（塔界远征网关需要）\nenableUserAccounts: true\n' >> "$f"
    fi

    if ! grep -qE '^[[:space:]]*sso[[:space:]]*:' "$f"; then
        printf '\nsso:\n  autheliaAuth: true\n  trustedProxies:\n    - 127.0.0.1\n    - ::1\n' >> "$f"
    fi

    echo "✓ 已改好，当前关键配置："
    grep -nE '^[[:space:]]*(enableUserAccounts|listen|whitelistMode)[[:space:]]*:|^sso:|autheliaAuth|trustedProxies' "$f" | sed 's/^/    /'
    echo
    echo "→ 现在去重启 SillyTavern（命令见 '$0 detect' 第 2 步）"
}

# =========================================================== 账号操作
# 取 CSRF token（顺便建立未签名会话 cookie）。ST 全局开了 CSRF 保护，缺这一步一律 403。
csrf() {
    local tok
    tok="$(curl -fsS -c "$JAR" "$ST_URL/csrf-token" 2>/dev/null \
           | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)"
    [ -n "$tok" ] || die "取不到 CSRF token —— SillyTavern 没启动？地址对不对：$ST_URL"
    echo "$tok"
}

cmd_list() {
    echo "→ 列出 $ST_URL 的账号"
    curl -fsS -X POST "$ST_URL/api/users/list" -H 'Content-Type: application/json' -d '{}' 2>/dev/null \
    | python3 -c '
import sys, json
try: users = json.load(sys.stdin)
except Exception:
    print("（返回不是 JSON —— ST 没开多用户 / 地址不对 / 被 CSRF 拦了）"); sys.exit(0)
if not users: print("⚠ 一个账号都没有。先把 config.yaml 的 enableUserAccounts 设为 true 并重启 ST。")
for u in users:
    print("  %-20s 名称=%-16s 已设密码=%s" % (u.get("handle","?"), u.get("name",""), "是" if u.get("password") else "否"))
' || echo "✗ 请求失败，先跑 '$0 detect' 确认 ST 在跑"
}

cmd_passwd() {
    local handle="${1:-}"
    [ -n "$handle" ] || die "用法：$0 passwd <handle>"

    local tok; tok="$(csrf)"

    echo "→ 请求验证码（句柄：$handle）"
    curl -fsS -X POST "$ST_URL/api/users/recover-step1" \
         -b "$JAR" -H "X-CSRF-Token: $tok" -H 'Content-Type: application/json' \
         -d "{\"handle\":\"$handle\"}" -o /dev/null \
        || die "请求验证码失败。句柄不存在？先用 '$0 list' 确认名字。"

    echo
    echo "  验证码已经打印到 SillyTavern 的控制台里，去那边找 6 位数字："
    echo "    · systemd : journalctl -u <服务名> -n 50 --no-pager"
    echo "    · pm2     : pm2 logs <名字> --lines 50"
    echo "    · nohup   : tail -50 st.log          · docker: docker logs --tail 50 <容器>"
    echo
    read -r -p "  输入 6 位验证码: " code
    read -r -s -p "  给 $handle 设置的新密码: " pw
    echo

    local payload
    payload="$(python3 -c 'import json,sys;print(json.dumps({"handle":sys.argv[1],"code":sys.argv[2],"newPassword":sys.argv[3]}))' "$handle" "$code" "$pw")"

    curl -fsS -X POST "$ST_URL/api/users/recover-step2" \
         -b "$JAR" -H "X-CSRF-Token: $tok" -H 'Content-Type: application/json' \
         -d "$payload" -o /dev/null \
        || die "设置密码失败（验证码错或已过期，5 分钟内有效）"

    echo
    echo "✓ 已设置。现在去塔界远征后台「AI 酒馆」页填："
    echo "    管理员句柄 = $handle"
    echo "    管理员密码 = <你刚输入的密码>"
    echo "  然后点「保存并生效」。"
}

case "${1:-}" in
    detect)  cmd_detect ;;
    config)  cmd_config "${2:-}" ;;
    list)    cmd_list ;;
    passwd)  cmd_passwd "${2:-}" ;;
    *)       sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
