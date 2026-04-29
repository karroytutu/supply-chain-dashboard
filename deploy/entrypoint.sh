#!/bin/sh
set -e

# 修复 Docker volume 挂载导致的目录权限问题
# 当宿主机目录以 root 创建时，volume 挂载会覆盖镜像内的 chown 设置，
# 导致 nodejs 用户无法写入上传目录
echo "[Entrypoint] 检查上传目录权限..."
chown -R nodejs:nodejs /app/uploads /app/logs 2>/dev/null || true

# 使用 gosu 降权到 nodejs 用户执行应用
exec gosu nodejs "$@"
