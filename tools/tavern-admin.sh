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
#   ./tools/tavern-admin.sh promote <handle> [ST目录]   # 把账号提升为管理员（改 data/_storage）
#   ./tools/tavern-admin.sh logs [行数]           # 读 ST 控制台输出（找验证码用，不需要 pm2 命令）
#   ./tools/tavern-admin.sh restart               # 重启 ST（不需要 pm2 命令）
#
# 提示：pm2 常常不在 root 的 PATH 里。本脚本的 logs / restart 都不依赖 pm2 命令，
#       它会先自己找 pm2（见 find_pm2），找不到就退化成「直接读 ~/.pm2/logs」和「kill 让 PM2 拉起」。
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
    local pm2bin=""; pm2bin="$(find_pm2 2>/dev/null || true)"
    if [ -n "$pm2bin" ]; then
        echo "  pm2 命令：$pm2bin $([ "$pm2bin" = "$(command -v pm2 2>/dev/null)" ] || echo '（不在 PATH 里，本脚本已自动定位）')"
        p="$("$pm2bin" jlist 2>/dev/null | grep -o '"name":"[^"]*"' | grep -i silly || true)"
        [ -n "$p" ] && { echo "  pm2 进程：$p"; found=1; }
    else
        echo "  pm2 命令：没找到（不影响，用 '$0 logs' / '$0 restart' 代替）"
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
            *PM2*)        echo "  ⇒ 由 **PM2** 托管（父进程 $ppid 是 PM2 God Daemon）"
                          echo "     重启：$( [ -n "$pm2bin" ] && echo "$pm2bin restart <名字>  （或 $0 restart）" || echo "$0 restart   ← kill 后 PM2 会自动拉起，不需要 pm2 命令" )"
                          echo "     日志：$( [ -n "$pm2bin" ] && echo "$pm2bin logs <名字>  （或 $0 logs）" || echo "$0 logs       ← 直接 tail ~/.pm2/logs，不需要 pm2 命令" )" ;;
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
    echo "       $0 restart    ← 推荐：自动识别 PM2 / systemd，PM2 不在 PATH 也能用"
    echo "       $0 logs       ← 读控制台输出（找验证码用），同样不需要 pm2 命令"
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

# 从 ST 日志里抓最后一次「password recovery code is: XXXXXX」的 6 位码。
# 免得用户开第二个窗口翻日志；找不到就返回 1，由调用方退回手动输入。
grab_recovery_code() {
    local f hit
    for f in "${PM2_HOME:-$HOME/.pm2}"/logs/*-out.log; do
        [ -f "$f" ] || continue
        hit="$(tail -n 200 "$f" 2>/dev/null | grep -oE 'recovery code is: [0-9]{6}' | tail -1 | grep -oE '[0-9]{6}')"
        [ -n "$hit" ] && { echo "$hit"; return 0; }
    done
    if command -v journalctl >/dev/null 2>&1; then
        hit="$(journalctl -u sillytavern -n 200 --no-pager 2>/dev/null \
               | grep -oE 'recovery code is: [0-9]{6}' | tail -1 | grep -oE '[0-9]{6}')"
        [ -n "$hit" ] && { echo "$hit"; return 0; }
    fi
    return 1
}

cmd_list() {
    echo "→ 列出 $ST_URL 的账号"
    local tok; tok="$(csrf)" || exit 1   # 必须：ST 全局 CSRF 保护，裸 POST 一律返回 HTML 403

    # -w 把 HTTP 状态码打出来，非 2xx 时把原始响应也吐出来，否则只能看到「不是 JSON」这种废话
    local body code
    body="$(curl -sS -w $'\n%{http_code}' -X POST "$ST_URL/api/users/list" \
            -b "$JAR" -H "X-CSRF-Token: $tok" -H 'Content-Type: application/json' -d '{}' 2>&1)"
    code="$(printf '%s' "$body" | tail -n1)"
    body="$(printf '%s' "$body" | sed '$d')"

    if [ "$code" != "200" ]; then
        echo "✗ HTTP $code"
        printf '%s' "$body" | head -c 400 | sed 's/^/    /'
        echo
        case "$code" in
            404) echo "  → 404 = ST 没开多用户模式：config.yaml 的 enableUserAccounts 要为 true 并重启 ST" ;;
            403) echo "  → 403 = CSRF 或 IP 白名单。确认 config.yaml 的 whitelist 含 127.0.0.1" ;;
            429) echo "  → 429 = 被限流了，等一分钟再试" ;;
        esac
        return 1
    fi

    printf '%s' "$body" | python3 -c '
import sys, json
try: users = json.load(sys.stdin)
except Exception:
    print("（返回不是 JSON，原始内容见上）"); sys.exit(0)
if not users: print("⚠ 一个账号都没有。先把 config.yaml 的 enableUserAccounts 设为 true 并重启 ST。")
for u in users:
    print("  %-20s 名称=%-16s 已设密码=%s" % (u.get("handle","?"), u.get("name",""), "是" if u.get("password") else "否"))
'
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
    echo "  验证码已打印到 ST 控制台，正在日志里找（等 2 秒让日志落盘）…"
    sleep 2
    local code=""
    code="$(grab_recovery_code || true)"

    if [ -n "$code" ]; then
        echo "  ✓ 自动读到验证码：$code"
    else
        echo "  ✗ 日志里没找到，另开一个 SSH 窗口自己看："
        echo "    $0 logs           ← 推荐，自动判断 pm2 / systemd / nohup"
        echo "    · pm2     : tail -50 /root/.pm2/logs/*-out.log"
        echo "    · systemd : journalctl -u <服务名> -n 50 --no-pager"
        echo "    · nohup   : tail -50 st.log"
        read -r -p "  输入 6 位验证码: " code
    fi

    read -r -s -p "  给 $handle 设置的新密码: " pw
    echo

    local payload
    payload="$(python3 -c 'import json,sys;print(json.dumps({"handle":sys.argv[1],"code":sys.argv[2],"newPassword":sys.argv[3]}))' "$handle" "$code" "$pw")"

    # 关键：ST 的 CSRF token 是一次性的（step1 用掉后立刻失效），
    # 复用同一个 token 调 step2 会拿到 403 Invalid CSRF token，必须重新取。
    tok="$(csrf)"

    local body httpcode
    body="$(curl -sS -w $'\n%{http_code}' -X POST "$ST_URL/api/users/recover-step2" \
            -b "$JAR" -H "X-CSRF-Token: $tok" -H 'Content-Type: application/json' \
            -d "$payload" 2>&1)"
    httpcode="$(printf '%s' "$body" | tail -n1)"
    if [ "$httpcode" != "200" ] && [ "$httpcode" != "204" ]; then
        echo "✗ 设置密码失败，HTTP $httpcode"
        printf '%s' "$body" | sed '$d' | head -c 400 | sed 's/^/    /'
        echo
        case "$httpcode" in
            403) echo "  → 403 = 验证码错/过期，或 CSRF 失效。重跑一次本命令拿新验证码。" ;;
            429) echo "  → 429 = 被限流，等一分钟再试" ;;
        esac
        return 1
    fi

    echo
    echo "✓ 已设置。现在去塔界远征后台「AI 酒馆」页填："
    echo "    管理员句柄 = $handle"
    echo "    管理员密码 = <你刚输入的密码>"
    echo "  然后点「保存并生效」。"
}

# =========================================================== 提升为管理员
# ST 用 node-persist 把账号存在 data/_storage（每个 key 一个 JSON 文件），记录里有 admin 字段。
# 没有管理员账号时 /api/users/create 根本调不动，只能直接改这条记录。
cmd_promote() {
    local handle="${1:-}" dir="${2:-}"
    [ -n "$handle" ] || die "用法：$0 promote <handle> [SillyTavern目录]"

    if [ -z "$dir" ]; then
        for d in /www/SillyTavern /opt/SillyTavern /root/SillyTavern "$HOME/SillyTavern" /www/wwwroot/SillyTavern; do
            [ -f "$d/server.js" ] && dir="$d" && break
        done
    fi
    [ -n "$dir" ] || die "找不到 SillyTavern 目录，手动指定：$0 promote $handle /www/SillyTavern"

    local store="$dir/data/_storage"
    [ -d "$store" ] || die "没有 $store —— 这台不是 node-persist 版本的 ST，或目录不对"

    echo "→ 在 $store 里找 handle=$handle 的账号记录"
    node -e '
const fs = require("fs"), p = require("path");
const dir = process.argv[1], handle = process.argv[2];
let found = 0;
for (const f of fs.readdirSync(dir)) {
  const fp = p.join(dir, f);
  let d; try { d = JSON.parse(fs.readFileSync(fp, "utf8")); } catch (e) { continue; }
  let rec = null, wrapped = false;
  if (d && d.handle === handle) { rec = d; }
  else if (d && d.value && d.value.handle === handle) { rec = d.value; wrapped = true; }
  if (!rec) continue;
  found++;
  console.log("  " + fp);
  console.log("    handle=" + rec.handle + " admin=" + rec.admin + " enabled=" + rec.enabled);
  if (rec.admin === true) { console.log("    已经是管理员，不用改"); continue; }
  const bak = fp + ".bak";
  if (!fs.existsSync(bak)) fs.copyFileSync(fp, bak);
  rec.admin = true;
  const out = wrapped ? Object.assign({}, d, { value: rec }) : rec;
  fs.writeFileSync(fp, JSON.stringify(out));
  console.log("    ✓ admin 已改成 true（原文件备份在 " + bak + "）");
}
if (!found) { console.log("  ✗ 没找到 handle=" + handle + " 的账号记录"); process.exit(1); }
' "$store" "$handle" || return 1

    echo
    echo "→ 改完必须重启 SillyTavern 才生效（账号在 ST 内存里有缓存）："
    echo "    $0 restart"
}

# =========================================================== 找 pm2（常常不在 PATH 里）
# 不要用 `find / -name pm2` —— 扫全盘太慢（几十秒到几分钟），下面这些都是 O(1) 的探测。
find_pm2() {
    command -v pm2 2>/dev/null && return 0
    local n
    for n in /www/server/nodejs/*/bin/pm2 \
             /usr/local/bin/pm2 /usr/bin/pm2 \
             /usr/lib/node_modules/pm2/bin/pm2 \
             /usr/local/lib/node_modules/pm2/bin/pm2 \
             /root/.nvm/versions/node/*/bin/pm2 \
             /www/server/nvm/versions/node/*/bin/pm2
    do
        [ -x "$n" ] && { echo "$n"; return 0; }
    done
    # 兜底：从 PM2 守护进程自己身上反推 —— 它的 exe 就是 node，pm2 是同目录的兄弟文件
    local dpid; dpid="$(ps -eo pid,cmd 2>/dev/null | grep '[P]M2 v' | awk '{print $1}' | head -1)"
    if [ -n "$dpid" ] && [ -r "/proc/$dpid/exe" ]; then
        local d; d="$(dirname "$(readlink "/proc/$dpid/exe" 2>/dev/null)" 2>/dev/null)"
        [ -n "$d" ] && [ -x "$d/pm2" ] && { echo "$d/pm2"; return 0; }
        # 再从它的环境变量 PATH 里翻（PM2 是被带完整 PATH 拉起来的）
        local ep p
        ep="$(tr '\0' '\n' < "/proc/$dpid/environ" 2>/dev/null | grep '^PATH=' | head -1 | cut -d= -f2-)"
        if [ -n "$ep" ]; then
            for p in $(echo "$ep" | tr ':' ' '); do
                [ -x "$p/pm2" ] && { echo "$p/pm2"; return 0; }
            done
        fi
    fi
    return 1
}

st_pids() { ps -eo pid,cmd 2>/dev/null | grep '[s]erver\.js' | grep -i silly | awk '{print $1}'; }

# =========================================================== 读日志（找验证码用）
# PM2 的日志是固定路径 ~/.pm2/logs/<name>-out.log，直接 tail 就行，不需要 pm2 命令。
cmd_logs() {
    local n="${1:-60}"
    local d="${PM2_HOME:-$HOME/.pm2}/logs"
    if [ -d "$d" ]; then
        echo "→ PM2 日志目录：$d"
        ls -1t "$d" 2>/dev/null | head -10 | sed 's/^/    /'
        echo
        echo "── stdout（最后 $n 行）──"
        tail -n "$n" "$d"/*-out.log 2>/dev/null
        local err
        err="$(tail -n 30 "$d"/*-error.log 2>/dev/null | grep -v '^[[:space:]]*$')"
        [ -n "$err" ] && { echo; echo "── stderr ──"; echo "$err"; }
        return 0
    fi
    local pm2bin; pm2bin="$(find_pm2 2>/dev/null)"
    if [ -n "$pm2bin" ]; then
        echo "→ 用 $pm2bin 读日志"
        "$pm2bin" logs --lines "$n" --nostream 2>&1 | tail -n "$((n+10))"
        return 0
    fi
    if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -qi silly; then
        local u; u="$(systemctl list-unit-files 2>/dev/null | grep -i silly | awk '{print $1}' | head -1)"
        echo "→ 走 systemd：$u"
        journalctl -u "$u" -n "$n" --no-pager 2>&1 | sed 's/^/    /'
        return 0
    fi
    echo "✗ 找不到 PM2 日志目录 $d，也没找到 pm2 命令，也没有 systemd 服务。"
    echo "  手动看看 ST 的输出打到哪：ls -l /proc/<ST的pid>/fd/1"
    echo "  如果指向 /dev/null，说明控制台输出被丢了 —— 验证码读不到，得先改成能落盘的方式启动。"
}

# =========================================================== 重启 ST
# 关键：如果 ST 由 PM2 托管，kill 掉工作进程后 PM2 会自动拉起一个新的（带新配置）。
# 这才是不需要 pm2 命令也能重启的原理。
cmd_restart() {
    local pm2bin; pm2bin="$(find_pm2 2>/dev/null)"
    if [ -n "$pm2bin" ]; then
        echo "→ 找到 pm2：$pm2bin"
        echo "  当前进程："
        "$pm2bin" list 2>&1 | sed 's/^/    /'
        local name
        name="$("$pm2bin" jlist 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | grep -i silly | head -1)"
        if [ -n "$name" ]; then
            echo "→ pm2 restart $name"
            "$pm2bin" restart "$name" 2>&1 | sed 's/^/    /'
            sleep 4
            "$pm2bin" logs "$name" --lines 25 --nostream 2>&1 | sed 's/^/    /'
        else
            echo "  ⚠ pm2 list 里没看到名字含 silly 的进程，请手动：pm2 restart <名字>"
        fi
        return 0
    fi

    echo "⚠ 没找到 pm2 命令，改用「kill + PM2 自动拉起」"
    local pids; pids="$(st_pids)"
    [ -n "$pids" ] || die "没找到 ST 进程，也没 pm2。手动进 ST 目录启动：nohup node server.js > st.log 2>&1 &"
    local guarded=0
    for pid in $pids; do
        local ppid; ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
        if ps -o cmd= -p "$ppid" 2>/dev/null | grep -q PM2; then guarded=1; fi
        echo "  kill $pid（父进程 $ppid）"
        kill "$pid" 2>/dev/null
    done
    if [ "$guarded" = 1 ]; then
        echo "→ PM2 会在几秒内自动拉起新进程，等 8 秒…"
        sleep 8
    else
        echo "  ⚠ 父进程不是 PM2，kill 后不会自动拉起！需要手动启动。"
        return 1
    fi
    echo "  新进程："
    ps -eo pid,ppid,etime,cmd 2>/dev/null | grep '[s]erver\.js' | grep -i silly | sed 's/^/    /'
    local ok
    ok="$(curl -fsS --max-time 5 "$ST_URL/csrf-token" 2>/dev/null)"
    if [ -n "$ok" ]; then echo "✓ ST 已就绪：$ok"; else echo "✗ ST 还没起来，跑 '$0 logs'"; fi
}

case "${1:-}" in
    detect)  cmd_detect ;;
    config)  cmd_config "${2:-}" ;;
    list)    cmd_list ;;
    passwd)  cmd_passwd "${2:-}" ;;
    promote) cmd_promote "${2:-}" "${3:-}" ;;
    logs)    cmd_logs "${2:-60}" ;;
    restart) cmd_restart ;;
    *)       sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
