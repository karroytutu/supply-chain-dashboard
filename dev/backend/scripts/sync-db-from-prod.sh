#!/bin/bash

# ==============================================================================
# 生产数据库同步脚本
#
# 将云服务器 (8.130.26.73) 的 PostgreSQL 数据通过 SSH 管道同步到本地开发库
# 同步方式：DROP + CREATE，完全覆盖开发库
#
# 用法：
#   bash scripts/sync-db-from-prod.sh
#   npm run sync:db
#
# 定时任务管理（launchd）：
#   安装：npm run sync:db:install
#   卸载：npm run sync:db:uninstall
#   查看：launchctl list | grep sync-db
# ==============================================================================

set -euo pipefail

# ==================== 配置 ====================
PROD_HOST="root@8.130.26.73"
PROD_CONTAINER="xinshutong-postgres"
DB_NAME="xly_dashboard"
DB_USER="postgres"
LOCAL_HOST="localhost"
LOCAL_PORT="5432"

# 脚本所在目录（兼容从任意位置执行）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/sync-db.log"

# ==================== 颜色输出 ====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${CYAN}[$timestamp]${NC} $1"
}

log_ok() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${GREEN}[$timestamp]${NC} OK  $1"
}

log_warn() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${YELLOW}[$timestamp]${NC} WARN $1"
}

log_error() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${RED}[$timestamp]${NC} ERR  $1"
}

# 确保日志目录存在
mkdir -p "$LOG_DIR"

# 同时写日志文件（追加）
exec > >(tee -a "$LOG_FILE") 2>&1

# ==================== 前置检查 ====================
log "开始同步：${PROD_HOST} → localhost"
log "目标数据库：${DB_NAME}"
echo ""

# 1. 检查本地 PostgreSQL 是否运行
log "检查本地 PostgreSQL..."
if ! pg_isready -h "$LOCAL_HOST" -p "$LOCAL_PORT" -q 2>/dev/null; then
  log_error "本地 PostgreSQL 未运行（${LOCAL_HOST}:${LOCAL_PORT}）"
  log_error "请先启动 PostgreSQL，或检查端口配置"
  exit 1
fi
log_ok "本地 PostgreSQL 运行中"

# 2. 检查 SSH 连接
log "检查 SSH 连接（${PROD_HOST}）..."
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$PROD_HOST" "echo ok" &>/dev/null; then
  log_error "无法连接生产服务器：${PROD_HOST}"
  log_error "请检查 SSH 密钥配置或网络连接"
  exit 1
fi
log_ok "SSH 连接正常"

# ==================== 执行同步 ====================
START_TIME=$(date +%s)

# 3. DROP + CREATE 开发库（完全替换）
log "重建开发库（DROP + CREATE）..."

# 断开所有活跃连接后删除重建
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
" &>/dev/null

psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "
  DROP DATABASE IF EXISTS ${DB_NAME};
" &>/dev/null

psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "
  CREATE DATABASE ${DB_NAME};
" &>/dev/null

log_ok "开发库已重建"

# 4. SSH 管道同步
log "开始同步数据（SSH 管道 pg_dump → psql）..."

ssh "$PROD_HOST" \
  "docker exec ${PROD_CONTAINER} pg_dump -U ${DB_USER} ${DB_NAME}" \
  | psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" -q 2>/dev/null

if [ $? -ne 0 ]; then
  log_error "数据同步失败"
  log_error "请检查生产服务器 Docker 容器状态和数据库连接"
  exit 1
fi

# ==================== 结果输出 ====================
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
log_ok "同步完成！耗时 ${ELAPSED} 秒"

# 查询同步后的表数量作为验证
TABLE_COUNT=$(psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
  SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
" 2>/dev/null || echo "?")

log "本地库现有 ${TABLE_COUNT} 张表"
