#!/usr/bin/env bash
# 公共片段：探测 node 可执行文件（供 install.sh / bootstrap.sh source）
#
# 宝塔「Node.js版本管理器」装的 node 位于 /www/server/nodejs/<版本>/bin/node，
# 默认不在 PATH 里，命令行直接敲 node 会报「未找到命令」。
# 这里按常见安装路径扫一遍，找到就把它所在目录加进 PATH。
# 用法：source deploy/linux/detect-node.sh && detect_node
detect_node() {
    if command -v node >/dev/null 2>&1; then
        NODE_BIN="$(command -v node)"
        NODE_DIR="$(dirname "$NODE_BIN")"
        return 0
    fi
    local d
    for d in \
        /www/server/nodejs/*/bin \
        /www/server/nodejs/bin \
        /usr/local/nodejs/bin \
        /usr/local/n/versions/node/*/bin \
        /opt/node*/bin \
        /usr/local/bin \
        /usr/bin
    do
        if [ -x "$d/node" ]; then
            export PATH="$PATH:$d"
            NODE_BIN="$d/node"
            NODE_DIR="$d"
            return 0
        fi
    done
    return 1
}

# 打印「找不到 node / 想升级」时的处理建议
node_hint() {
    echo "   处理方式（任选一）："
    echo "   1) 宝塔 → 软件商店 → Node.js版本管理器 → 装 v16+（本项目用 v16 即可跑）"
    echo "   2) 已装但不在 PATH：先 ls /www/server/nodejs/ 看版本号，再执行"
    echo "      ln -sf /www/server/nodejs/<版本>/bin/node /usr/local/bin/node"
    echo "      ln -sf /www/server/nodejs/<版本>/bin/npm  /usr/local/bin/npm"
    echo "   3) 手动装 Node 20（推荐，v16 官方已停止维护）："
    echo "      yum install -y xz && cd /usr/local \\"
    echo "      && curl -fsSL https://npmmirror.com/mirrors/node/v20.18.1/node-v20.18.1-linux-x64.tar.xz -o n.tar.xz \\"
    echo "      && tar -xJf n.tar.xz && rm -f n.tar.xz \\"
    echo "      && ln -sf /usr/local/node-v20.18.1-linux-x64/bin/node /usr/local/bin/node \\"
    echo "      && ln -sf /usr/local/node-v20.18.1-linux-x64/bin/npm /usr/local/bin/npm"
    echo "   4) 装完验证：node -v"
}
