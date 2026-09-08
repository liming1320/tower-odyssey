#!/usr/bin/env bash
# 塔界远征 · 服务器首次初始化
#   自动完成：检查环境 → 配置 SSH 免密 → 拉代码 → 注册 systemd 服务
#
# 用法（SSH 方式，推荐，需先在 Gitee 添加部署公钥）：
#   sudo bash deploy/linux/bootstrap.sh
#
# 用法（HTTPS 令牌方式，最快，不想配公钥时用这个）：
#   GITEE_USER=你的Gitee用户名 GITEE_TOKEN=你的私人令牌 bash deploy/linux/bootstrap.sh
#
# 可选环境变量：
#   APP_DIR   安装目录，默认 /www/wwwroot/tower-odyssey
#   REPO      仓库地址，默认 git@gitee.com:li-ming1320/tower-odyssey.git
#   PORT      服务端口，默认 5180
set -o pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/tower-odyssey}"
PORT="${PORT:-5180}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/gitee_deploy}"

say()  { echo -e "\033[36m$1\033[0m"; }
warn() { echo -e "\033[33m$1\033[0m"; }
die()  { echo -e "\033[31m✗ $1\033[0m"; exit 1; }

# ---------- 决定用哪种方式拉代码 ----------
if [ -n "$GITEE_TOKEN" ]; then
    MODE="https"
    GITEE_USER="${GITEE_USER:-li-ming1320}"
    REPO="${REPO:-https://${GITEE_USER}:${GITEE_TOKEN}@gitee.com/${GITEE_USER}/tower-odyssey.git}"
    SAFE_REPO="https://gitee.com/${GITEE_USER}/tower-odyssey.git"
else
    MODE="ssh"
    REPO="${REPO:-git@gitee.com:li-ming1320/tower-odyssey.git}"
    SAFE_REPO="$REPO"
fi

say "① 检查运行环境"
command -v git  >/dev/null 2>&1 || die "未找到 git，先装：yum install -y git  或  apt install -y git"
. "$(dirname "$0")/detect-node.sh"
if ! detect_node; then
    command -v node >/dev/null 2>&1 || { die "未找到 node（git 已就绪，node 在拉代码前必须有）"; node_hint; exit 1; }
fi
echo "   git : $(git --version)"
echo "   node: $("$NODE_BIN" -v)  ($NODE_BIN  ← 已自动识别宝塔 Node)"
NODE_MAJOR="$("$NODE_BIN" -v | sed 's/^v//; s/\..*//')"
if [ "$NODE_MAJOR" -lt 18 ]; then echo "   Node 版本过低，需要 >= 18"; node_hint; exit 1; fi

# ---------- SSH 方式：准备密钥 ----------
if [ "$MODE" = "ssh" ]; then
    say ""
    say "② 配置 SSH 免密"
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"

    if [ ! -f "$SSH_KEY" ]; then
        ssh-keygen -t ed25519 -C "deploy" -f "$SSH_KEY" -N "" >/dev/null 2>&1
        echo "   已生成密钥：$SSH_KEY"
    else
        echo "   复用已有密钥：$SSH_KEY"
    fi
    chmod 600 "$SSH_KEY"; chmod 644 "$SSH_KEY.pub"

    # 关键：自定义文件名的 key 必须在 ~/.ssh/config 里指定，否则 SSH 不会自动用它
    if ! grep -q "Host gitee.com" "$HOME/.ssh/config" 2>/dev/null; then
        cat >> "$HOME/.ssh/config" <<EOF

Host gitee.com
    HostName gitee.com
    User git
    IdentityFile $SSH_KEY
    IdentitiesOnly yes
    PreferredAuthentications publickey
    StrictHostKeyChecking accept-new
EOF
        chmod 600 "$HOME/.ssh/config"
        echo "   已写入 $HOME/.ssh/config（指定使用 $SSH_KEY）"
    else
        echo "   $HOME/.ssh/config 已有 gitee.com 配置，未改动"
    fi

    # 测试连通性，不通就把公钥打出来让用户去添加
    for i in 1 2 3 4 5; do
        OUT="$(ssh -T -o BatchMode=yes -o ConnectTimeout=8 git@gitee.com 2>&1 || true)"
        if echo "$OUT" | grep -qi "permission denied"; then
            if [ "$i" = "1" ]; then
                warn ""
                warn "   ┌─ 还连不上 Gitee，请把下面这一整行复制，添加到："
                warn "   │  Gitee 仓库页面 → 管理 → 部署公钥管理 → 添加公钥"
                warn "   └─ 标题随便填（如 deploy），粘贴后点确定"
                echo ""
                echo "$(cat "$SSH_KEY.pub")"
                echo ""
            fi
            read -r -p "   添加完成后按回车重试（第 $i 次，输入 q 放弃改用 HTTPS 令牌）：" ANS
            [ "$ANS" = "q" ] && { die "已放弃。改用 HTTPS：GITEE_USER=用户名 GITEE_TOKEN=私人令牌 bash deploy/linux/bootstrap.sh"; }
        else
            echo "   ✅ SSH 连通：$(echo "$OUT" | head -1)"
            break
        fi
    done
    echo "$OUT" | grep -qi "permission denied" && die "SSH 认证仍失败，请确认公钥已添加"
fi

# ---------- 拉代码 ----------
say ""
say "③ 拉取代码 → $APP_DIR"
mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
    echo "   目录已存在，跳过 clone（如需重装请先 rm -rf $APP_DIR）"
    cd "$APP_DIR" || exit 1
else
    rm -rf "$APP_DIR"
    git clone "$REPO" "$APP_DIR" || die "clone 失败，检查仓库地址 / 公钥 / 令牌权限（令牌需勾 repo）"
    cd "$APP_DIR" || exit 1
    # HTTPS 方式：把带令牌的地址换成干净的，再让 git 记住凭据，以后 pull 不用再输
    if [ "$MODE" = "https" ]; then
        git remote set-url origin "$SAFE_REPO"
        git config credential.helper store
        printf 'https://%s:%s@gitee.com\n' "$GITEE_USER" "$GITEE_TOKEN" > "$HOME/.git-credentials"
        chmod 600 "$HOME/.git-credentials"
    fi
fi
echo "   版本：$(git log -1 --oneline 2>/dev/null)"

# ---------- 装服务 ----------
say ""
say "④ 注册 systemd 服务"
APP_DIR="$APP_DIR" PORT="$PORT" bash "$APP_DIR/deploy/linux/install.sh"

say ""
say "首次初始化完成。后续 push 到 Gitee 会自动触发部署（需配 WebHook，见 deploy/README.md）。"
