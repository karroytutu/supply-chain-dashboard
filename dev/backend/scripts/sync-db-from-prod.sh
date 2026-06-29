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

# Homebrew postgresql@17 路径动态查找（兼容版本升级）
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"

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

# 2. 检查 SSH 连接（兼容 OpenSSH 10.2+）
log "检查 SSH 连接（${PROD_HOST}）..."
set +e
SSH_CHECK=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$PROD_HOST" "echo ok" 2>/dev/null)
if ! echo "$SSH_CHECK" | grep -q "ok"; then
  # OpenSSH 10.2+ 回退到管道方式
  SSH_CHECK=$(printf 'echo ok\nexit\n' | ssh -o ConnectTimeout=10 -o BatchMode=yes "$PROD_HOST" 2>/dev/null)
fi
set -e
if ! echo "$SSH_CHECK" | grep -q "ok"; then
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

# 4. 数据传输与恢复（远端 dump → scp 传回 → 本地恢复）
REMOTE_DUMP="/tmp/sync-db-${DB_NAME}.dump"
LOCAL_DUMP="/tmp/sync-db-${DB_NAME}.dump"

# 4a. 在生产服务器执行 pg_dump 到临时文件
log "步骤 1/3：在生产服务器执行 pg_dump..."
DUMP_START=$(date +%s)

set +e
ssh "$PROD_HOST" "docker exec ${PROD_CONTAINER} pg_dump -U ${DB_USER} -Fc ${DB_NAME} > ${REMOTE_DUMP}" 2>/dev/null
REMOTE_DUMP_EXIT=$?
if [ $REMOTE_DUMP_EXIT -ne 0 ]; then
  # OpenSSH 10.2+ 回退到管道方式
  printf "docker exec ${PROD_CONTAINER} pg_dump -U ${DB_USER} -Fc ${DB_NAME} > ${REMOTE_DUMP}\nexit\n" \
    | ssh "$PROD_HOST" 2>/dev/null
  REMOTE_DUMP_EXIT=$?
fi
set -e

if [ $REMOTE_DUMP_EXIT -ne 0 ]; then
  log_error "远端 pg_dump 失败（退出码: $REMOTE_DUMP_EXIT）"
  exit 1
fi

# 获取远端 dump 文件精确大小
set +e
REMOTE_FILE_SIZE=$(ssh "$PROD_HOST" "stat -c %s ${REMOTE_DUMP}" 2>/dev/null | grep -o '[0-9]\+' | head -1)
if [ -z "$REMOTE_FILE_SIZE" ]; then
  # OpenSSH 10.2+ 回退
  REMOTE_FILE_SIZE=$(printf "stat -c %%s ${REMOTE_DUMP}\nexit\n" | ssh "$PROD_HOST" 2>/dev/null | grep -o '[0-9]\{5,\}' | head -1)
fi
set -e

if [ -z "$REMOTE_FILE_SIZE" ] || [ "$REMOTE_FILE_SIZE" -eq 0 ] 2>/dev/null; then
  log_error "远端 dump 文件为空或不存在"
  exit 1
fi

REMOTE_SIZE_MB=$((REMOTE_FILE_SIZE / 1024 / 1024))
DUMP_END=$(date +%s)
log_ok "远端 dump 完成，大小: ${REMOTE_SIZE_MB}MB，耗时: $((DUMP_END - DUMP_START)) 秒"

# 4b. 从生产服务器传输 dump 文件到本地（scp 保证二进制完整）
log "步骤 2/3：scp 传输 dump 文件到本地（${REMOTE_SIZE_MB}MB）..."
TRANSFER_START=$(date +%s)

set +e
scp "${PROD_HOST}:${REMOTE_DUMP}" "$LOCAL_DUMP" 2>&1
SCP_EXIT=$?
set -e

# 清理远端临时文件（后台执行，不阻塞）
ssh "$PROD_HOST" "rm -f ${REMOTE_DUMP}" 2>/dev/null &

if [ $SCP_EXIT -ne 0 ] || [ ! -s "$LOCAL_DUMP" ]; then
  log_error "scp 传输失败（退出码: $SCP_EXIT）"
  rm -f "$LOCAL_DUMP"
  exit 1
fi

LOCAL_SIZE=$(du -h "$LOCAL_DUMP" | cut -f1)
TRANSFER_END=$(date +%s)
log_ok "传输完成，大小: ${LOCAL_SIZE}，耗时: $((TRANSFER_END - TRANSFER_START)) 秒"

# 4c. 并行恢复到本地数据库
log "步骤 3/3：并行恢复到本地数据库（4 worker）..."
RESTORE_START=$(date +%s)

set +e  # 临时关闭 set -e，pg_restore 的退出码 1 表示警告（可接受）
pg_restore -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -j 4 --no-owner --clean --if-exists "$LOCAL_DUMP"
RESTORE_EXIT=$?
set -e

rm -f "$LOCAL_DUMP"

if [ $RESTORE_EXIT -eq 0 ]; then
  log_ok "恢复成功（无警告）"
elif [ $RESTORE_EXIT -eq 1 ]; then
  log_warn "恢复完成（有警告，通常为正常现象，如 DROP 不存在的对象）"
else
  log_error "数据同步失败（pg_restore 退出码: $RESTORE_EXIT）"
  exit 1
fi

RESTORE_END=$(date +%s)
log_ok "恢复耗时: $((RESTORE_END - RESTORE_START)) 秒"

# ==================== 结果输出 ====================
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
log_ok "同步完成！总耗时 ${ELAPSED} 秒（dump: $((DUMP_END - DUMP_START))秒 + 传输: $((TRANSFER_END - TRANSFER_START))秒 + 恢复: $((RESTORE_END - RESTORE_START))秒）"

# 查询同步后的表数量作为验证
TABLE_COUNT=$(psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
  SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
" 2>/dev/null || echo "?")

log "本地库现有 ${TABLE_COUNT} 张表"
