#!/usr/bin/env bash
# =============================================================
# 一键切换到 MySQL 存储
#
# 做四件事：装 mysql2 驱动 → 测连接 → 迁移现有存档 → 重写 systemd 服务并重启
# 全程可重复执行，失败会自动把服务退回 json 模式，保证游戏不中断
#
# 用法（服务器上，root 执行）：
#   DB_PASS=你的root密码 bash deploy/mysql/switch.sh
#
# 可选环境变量：
#   APP_DIR      项目目录        默认 /www/wwwroot/tower-odyssey
#   DB_HOST      127.0.0.1      DB_PORT 3306
#   DB_USER      root           DB_PASS （必填）
#   DB_NAME      tower_odyssey
#   SKIP_HEROES  1（默认）英雄表已导过 seed 时跳过，只导玩家
#                0            连英雄一起导（会覆盖 heroes 表）
#   SERVICE      tower-odyssey  PORT 5180
# =============================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/tower-odyssey}"
SERVICE="${SERVICE:-tower-odyssey}"
PORT="${PORT:-5180}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-tower_odyssey}"
DB_PASS="${DB_PASS:-}"
SKIP_HEROES="${SKIP_HEROES:-1}"

say() { echo; echo "▶ $*"; }
ok()  { echo "  ✔ $*"; }
die() { echo; echo "  ✗ $*"; exit 1; }

[ -d "$APP_DIR" ] || die "项目目录不存在：$APP_DIR（可用 APP_DIR=... 指定）"
cd "$APP_DIR" || die "无法进入 $APP_DIR"

# 1) 找 node（宝塔装的 node 不在 PATH）
# shellcheck disable=SC1091
. "$APP_DIR/deploy/linux/detect-node.sh"
detect_node || die "找不到 node，请先安装 Node（宝塔：软件商店 → Node.js版本管理器）"
ok "node: $("$NODE_BIN" -v)  ($NODE_BIN)"
NPM_BIN="$NODE_DIR/npm"
[ -x "$NPM_BIN" ] || NPM_BIN="$(command -v npm 2>/dev/null || true)"
[ -n "$NPM_BIN" ] || die "找不到 npm（NODE_DIR=$NODE_DIR）"

# 2) 密码
if [ -z "$DB_PASS" ]; then
    echo "  提示：用 DB_PASS=密码 bash $0 可免交互"
    read -r -s -p "  请输入 MySQL ${DB_USER} 的密码：" DB_PASS
    echo
fi
[ -n "$DB_PASS" ] || die "MySQL 密码为空"

export DB_DRIVER=mysql DB_HOST DB_PORT DB_USER DB_PASS DB_NAME

# 3) 装驱动
say "① 安装 mysql2 驱动"
if [ -d "$APP_DIR/node_modules/mysql2" ]; then
    ok "已安装，跳过"
else
    "$NPM_BIN" install mysql2 --no-audit --no-fund 2>&1 | tail -3 \
        || die "npm install mysql2 失败（网络问题？可手动执行：npm install mysql2）"
    [ -d "$APP_DIR/node_modules/mysql2" ] || die "装完仍找不到 node_modules/mysql2"
    ok "安装完成"
fi

# 4) 测连接 + 建表检查
say "② 测试数据库连接"
"$NODE_BIN" -e "
const mysql = require('$APP_DIR/node_modules/mysql2/promise');
(async () => {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST, port: +process.env.DB_PORT,
        user: process.env.DB_USER, password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });
    const [r] = await c.query('SELECT COUNT(*) AS n FROM heroes');
    const [p] = await c.query('SELECT COUNT(*) AS n FROM players');
    console.log('    连接成功：heroes=' + r[0].n + ' 条，players=' + p[0].n + ' 条');
    await c.end();
})().catch(e => { console.error('    连接失败：' + e.message); process.exit(1); });
" || die "连不上 MySQL。检查：① 库名是否是 $DB_NAME ② 是否执行过 deploy/mysql/schema.sql ③ 密码是否正确"

# 5) 迁移现有存档
say "③ 迁移现有存档（data/db.json → MySQL）"
if [ ! -f "$APP_DIR/data/db.json" ]; then
    echo "    没有 data/db.json，跳过（新服务器无需迁移）"
else
    MIG_ARGS=""
    [ "$SKIP_HEROES" = "1" ] && MIG_ARGS="--skip-heroes"
    "$NODE_BIN" tools/migrate-to-mysql.js $MIG_ARGS \
        || die "迁移失败（上面有原因）。服务仍运行在原模式，未受影响"
fi

# 6) 重写 systemd 并重启
say "④ 重写 systemd 服务并重启"
if command -v systemctl >/dev/null 2>&1; then
    # 备份旧服务文件
    [ -f "/etc/systemd/system/${SERVICE}.service" ] && \
        cp -f "/etc/systemd/system/${SERVICE}.service" "/tmp/${SERVICE}.service.bak" 2>/dev/null
    APP_DIR="$APP_DIR" SERVICE="$SERVICE" PORT="$PORT" \
        bash "$APP_DIR/deploy/linux/install.sh" 2>&1 | tail -8
    systemctl daemon-reload
    systemctl restart "$SERVICE" 2>&1 | tail -3
else
    echo "    未检测到 systemd，请手动用下面的环境变量启动："
    echo "    DB_DRIVER=mysql DB_HOST=$DB_HOST DB_USER=$DB_USER DB_PASS=*** DB_NAME=$DB_NAME node server.js"
    exit 0
fi

# 7) 健康检查（最多 25 秒）
say "⑤ 健康检查"
HEALTH=""
for i in $(seq 1 25); do
    HEALTH="$(curl -s -m 2 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)"
    [ -n "$HEALTH" ] && break
    sleep 1
done

if [ -z "$HEALTH" ]; then
    echo "  ✗ 服务没起来，正在回滚到文件存档模式…"
    if [ -f "/tmp/${SERVICE}.service.bak" ]; then
        cp -f "/tmp/${SERVICE}.service.bak" "/etc/systemd/system/${SERVICE}.service"
        systemctl daemon-reload && systemctl restart "$SERVICE"
        sleep 2
        curl -s -m 3 "http://127.0.0.1:${PORT}/api/health" && echo && echo "  已回滚，游戏恢复可用"
    fi
    echo "  排查：journalctl -u $SERVICE -n 30"
    exit 1
fi

echo "  $HEALTH"
case "$HEALTH" in
    *'"storage":"mysql'*)
        echo
        echo "✅ 切换成功！现在玩家数据、英雄配置都在 MySQL（$DB_NAME）"
        echo "   后台改英雄 = 直接改数据库；换设备登录自动同步；代码回滚不影响玩家数据"
        echo "   验证：注册个账号后执行  SELECT * FROM players;"
        ;;
    *)
        echo
        echo "⚠ 服务起来了但仍是文件模式（storage 不是 mysql）。"
        echo "  检查服务里的环境变量：systemctl show $SERVICE -p Environment"
        echo "  或看日志：journalctl -u $SERVICE -n 30"
        exit 1
        ;;
esac
