#!/bin/bash

# ==============================================================================
# 生产数据库同步脚本
#
# 将云服务器 (8.130.26.73) 的 PostgreSQL 数据通过 SSH 管道同步到本地开发库
# 同步方式：影子库恢复 + 原子切换（零停机）
#
# 用法：
#   bash scripts/sync-db-from-prod.sh                          # 完整同步
#   bash scripts/sync-db-from-prod.sh --local                  # 本地调试（跳过下载）
#   bash scripts/sync-db-from-prod.sh --tables t1,t2,t3        # 定向同步指定表（覆盖已有数据）
#   bash scripts/sync-db-from-prod.sh --exclude-tables t1,t2   # 完整同步但排除指定表
#   npm run sync:db                                            # 完整同步
#   npm run sync:db -- --local                                 # 本地调试
# ==============================================================================

set -euo pipefail

# ==================== 参数解析 ====================
LOCAL_MODE=false
TABLES=""
TABLES_MODE=false
EXCLUDE_TABLES=""
EXCLUDE_MODE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL_MODE=true; shift ;;
    --tables=*) TABLES="${1#*=}"; TABLES_MODE=true; shift ;;
    --tables) TABLES="$2"; TABLES_MODE=true; shift 2 ;;
    --exclude-tables=*) EXCLUDE_TABLES="${1#*=}"; EXCLUDE_MODE=true; shift ;;
    --exclude-tables) EXCLUDE_TABLES="$2"; EXCLUDE_MODE=true; shift 2 ;;
    *) shift ;;
  esac
done

# 构造 pg_dump 的 -t 参数（将逗号分隔转为多个 -t tablename）
PG_DUMP_TABLE_ARGS=""
if $TABLES_MODE && [ -n "$TABLES" ]; then
  IFS=',' read -ra TABLE_ARRAY <<< "$TABLES"
  for t in "${TABLE_ARRAY[@]}"; do
    t=$(echo "$t" | xargs)  # trim whitespace
    PG_DUMP_TABLE_ARGS="$PG_DUMP_TABLE_ARGS -t \"$t\""
  done
fi

# 构造 pg_dump 的 -T 参数（排除表）
PG_DUMP_EXCLUDE_ARGS=""
if $EXCLUDE_MODE && [ -n "$EXCLUDE_TABLES" ]; then
  IFS=',' read -ra EXCLUDE_ARRAY <<< "$EXCLUDE_TABLES"
  for t in "${EXCLUDE_ARRAY[@]}"; do
    t=$(echo "$t" | xargs)  # trim whitespace
    PG_DUMP_EXCLUDE_ARGS="$PG_DUMP_EXCLUDE_ARGS -T \"$t\""
  done
fi

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
# 禁止 --tables 与 --local 同时使用
if $TABLES_MODE && $LOCAL_MODE; then
  log_error "不支持 --tables 与 --local 同时使用"
  exit 1
fi

# 禁止 --tables 与 --exclude-tables 同时使用
if $TABLES_MODE && $EXCLUDE_MODE; then
  log_error "不支持 --tables 与 --exclude-tables 同时使用"
  exit 1
fi

if $TABLES_MODE; then
  log "开始定向同步：${PROD_HOST} → localhost"
  log "目标数据库：${DB_NAME}"
  log "同步表：${TABLES}"
elif $EXCLUDE_MODE; then
  log "开始完整同步（排除表）：${PROD_HOST} → localhost"
  log "目标数据库：${DB_NAME}"
  log "排除表：${EXCLUDE_TABLES}"
else
  log "开始完整同步：${PROD_HOST} → localhost"
  log "目标数据库：${DB_NAME}"
fi
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
DUMP_START=$START_TIME
DUMP_END=$START_TIME
TRANSFER_START=$START_TIME
TRANSFER_END=$START_TIME

DB_NEW="${DB_NAME}_new"
DB_OLD="${DB_NAME}_old"

# 3. 数据传输与恢复（远端 dump → scp 传回 → 影子库恢复 → 原子切换）
REMOTE_DUMP="/tmp/sync-db-${DB_NAME}.dump"
LOCAL_DUMP="/tmp/sync-db-${DB_NAME}.dump"

if $LOCAL_MODE; then
  # 本地模式：跳过下载，直接用已有 dump 文件
  log "本地模式（--local）：跳过步骤 1/4 和 2/4"
  if [ ! -s "$LOCAL_DUMP" ]; then
    log_error "本地 dump 文件不存在或为空：$LOCAL_DUMP"
    log_error "请先执行完整同步（不带 --local）下载 dump 文件"
    exit 1
  fi
  LOCAL_SIZE=$(du -h "$LOCAL_DUMP" | cut -f1)
  log_ok "找到本地 dump 文件：${LOCAL_SIZE}"
else
# 3a. 在生产服务器执行 pg_dump 到临时文件
log "步骤 1/4：在生产服务器执行 pg_dump..."
DUMP_START=$(date +%s)

if $TABLES_MODE; then
  DUMP_CMD="docker exec ${PROD_CONTAINER} pg_dump -v -U ${DB_USER} -Fc ${DB_NAME}${PG_DUMP_TABLE_ARGS} > ${REMOTE_DUMP}"
elif $EXCLUDE_MODE; then
  DUMP_CMD="docker exec ${PROD_CONTAINER} pg_dump -v -U ${DB_USER} -Fc ${DB_NAME}${PG_DUMP_EXCLUDE_ARGS} > ${REMOTE_DUMP}"
else
  DUMP_CMD="docker exec ${PROD_CONTAINER} pg_dump -v -U ${DB_USER} -Fc ${DB_NAME} > ${REMOTE_DUMP}"
fi

set +e
ssh "$PROD_HOST" "$DUMP_CMD" 2>&1 | grep -E "dumping|saving|done|finished"
REMOTE_DUMP_EXIT=${PIPESTATUS[0]}
if [ $REMOTE_DUMP_EXIT -ne 0 ]; then
  # OpenSSH 10.2+ 回退到管道方式
  printf "%s\nexit\n" "$DUMP_CMD" \
    | ssh "$PROD_HOST" 2>&1 | grep -E "dumping|saving|done|finished"
  REMOTE_DUMP_EXIT=${PIPESTATUS[0]}
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

# 3b. 从生产服务器传输 dump 文件到本地（scp 保证二进制完整）
log "步骤 2/4：scp 传输 dump 文件到本地（${REMOTE_SIZE_MB}MB）..."
TRANSFER_START=$(date +%s)

set +e
# 后台进度监控（每3秒输出百分比）
(
  while true; do
    sleep 3
    if [ -f "$LOCAL_DUMP" ]; then
      CURRENT_SIZE=$(stat -f%z "$LOCAL_DUMP" 2>/dev/null || echo 0)
      if [ "$REMOTE_FILE_SIZE" -gt 0 ] 2>/dev/null; then
        PCT=$((CURRENT_SIZE * 100 / REMOTE_FILE_SIZE))
        [ $PCT -gt 100 ] && PCT=100
        CURRENT_MB=$((CURRENT_SIZE / 1024 / 1024))
        echo -ne "\r  进度: ${CURRENT_MB}MB / ${REMOTE_SIZE_MB}MB (${PCT}%)"
      fi
    fi
  done
) &
MONITOR_PID=$!

scp "${PROD_HOST}:${REMOTE_DUMP}" "$LOCAL_DUMP" 2>/dev/null
SCP_EXIT=$?

kill $MONITOR_PID 2>/dev/null
wait $MONITOR_PID 2>/dev/null
echo ""  # 换行
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
fi  # end of non-local mode (steps 1-2)

# ==================== 定向同步：直接覆盖指定表 ====================
if $TABLES_MODE; then
  log "步骤 3/3：恢复指定表到现有库 ${DB_NAME}（--clean 覆盖模式）..."
  RESTORE_START=$(date +%s)

  set +e
  pg_restore -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --clean -j 4 --no-owner -v "$LOCAL_DUMP" 2>&1 | grep "TABLE DATA"
  RESTORE_EXIT=${PIPESTATUS[0]}
  set -e

  RESTORE_END=$(date +%s)

  if [ $RESTORE_EXIT -eq 0 ]; then
    log_ok "恢复成功（无警告）"
  elif [ $RESTORE_EXIT -eq 1 ]; then
    log_warn "恢复完成（有警告，通常为正常现象）"
  else
    log_error "定向同步失败（pg_restore 退出码: $RESTORE_EXIT）"
    exit 1
  fi

  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))
  echo ""
  log_ok "定向同步完成！表: ${TABLES}"
  log_ok "总耗时 ${ELAPSED} 秒（dump: $((DUMP_END - DUMP_START))秒 + 传输: $((TRANSFER_END - TRANSFER_START))秒 + 恢复: $((RESTORE_END - RESTORE_START))秒）"
  exit 0
fi

# ==================== 完整同步：影子库恢复 + 原子切换 ====================
# 3c. 创建影子库并恢复
log "步骤 3/4：恢复到影子库 ${DB_NEW}（4 worker）..."

# 创建干净的影子库
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname = '${DB_NEW}' AND pid <> pg_backend_pid();
" &>/dev/null
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "
  DROP DATABASE IF EXISTS ${DB_NEW};
" &>/dev/null
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "
  CREATE DATABASE ${DB_NEW};
" &>/dev/null

RESTORE_START=$(date +%s)

set +e  # 临时关闭 set -e，pg_restore 的退出码 1 表示警告（可接受）
pg_restore -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NEW" \
  -j 4 --no-owner -v "$LOCAL_DUMP" 2>&1 | grep "TABLE DATA"
RESTORE_EXIT=${PIPESTATUS[0]}
set -e

# 保留 dump 文件，供 --local 模式调试使用（不删除）

if [ $RESTORE_EXIT -eq 0 ]; then
  log_ok "恢复成功（无警告）"
elif [ $RESTORE_EXIT -eq 1 ]; then
  log_warn "恢复完成（有警告，通常为正常现象）"
else
  log_error "数据同步失败（pg_restore 退出码: $RESTORE_EXIT）"
  # 清理影子库
  psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NEW};" &>/dev/null
  exit 1
fi

RESTORE_END=$(date +%s)
log_ok "恢复耗时: $((RESTORE_END - RESTORE_START)) 秒"

# 3d. 原子切换：影子库 → 正式库
log "步骤 4/4：原子切换（${DB_NEW} → ${DB_NAME}）..."
SWITCH_START=$(date +%s)
SWITCH_LOG="/tmp/sync-switch-output.log"

# 禁止新连接（先设置 CONNECTION LIMIT，后续杀连接才不会被重连）
psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "
  ALTER DATABASE ${DB_NAME} CONNECTION LIMIT 0;
" 2>&1

# 重试切换（最多 5 次，每次间隔 1 秒）
SWITCH_OK=0
for i in 1 2 3 4 5; do
  # 杀连接（SELECT 可以在事务内）
  psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname IN ('${DB_NAME}', '${DB_OLD}') AND pid <> pg_backend_pid();
  " >"$SWITCH_LOG" 2>&1

  # 以下每条 DDL 必须单独执行（DROP/ALTER DATABASE 不能在事务块内）
  if psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres \
       -c "DROP DATABASE IF EXISTS ${DB_OLD};" >"$SWITCH_LOG" 2>&1 && \
     psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres \
       -c "ALTER DATABASE ${DB_NAME} RENAME TO ${DB_OLD};" >"$SWITCH_LOG" 2>&1 && \
     psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres \
       -c "ALTER DATABASE ${DB_NEW} RENAME TO ${DB_NAME};" >"$SWITCH_LOG" 2>&1 && \
     psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres \
       -c "ALTER DATABASE ${DB_NAME} CONNECTION LIMIT -1;" >"$SWITCH_LOG" 2>&1 && \
     psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres \
       -c "DROP DATABASE ${DB_OLD};" >"$SWITCH_LOG" 2>&1; then
    SWITCH_OK=1
    break
  fi

  log_warn "切换尝试 $i/5 失败，1 秒后重试..."
  sleep 1
done

if [ "$SWITCH_OK" -ne 1 ]; then
  log_error "原子切换失败（5 次重试均失败）"
  log_error "最后错误：$(cat "$SWITCH_LOG" 2>/dev/null)"
  # 恢复连接限制
  psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "ALTER DATABASE ${DB_NAME} CONNECTION LIMIT -1;" 2>/dev/null
  # 清理影子库
  psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NEW};" 2>/dev/null
  rm -f "$SWITCH_LOG"
  exit 1
fi
rm -f "$SWITCH_LOG"

SWITCH_END=$(date +%s)
log_ok "切换完成，耗时: $((SWITCH_END - SWITCH_START)) 秒"

# ==================== 结果输出 ====================
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
if $TABLES_MODE; then
  log_ok "定向同步完成！表: ${TABLES}"
  log_ok "总耗时 ${ELAPSED} 秒（dump: $((DUMP_END - DUMP_START))秒 + 传输: $((TRANSFER_END - TRANSFER_START))秒 + 恢复: $((RESTORE_END - RESTORE_START))秒 + 切换: $((SWITCH_END - SWITCH_START))秒）"
else
  log_ok "同步完成！总耗时 ${ELAPSED} 秒（dump: $((DUMP_END - DUMP_START))秒 + 传输: $((TRANSFER_END - TRANSFER_START))秒 + 恢复: $((RESTORE_END - RESTORE_START))秒 + 切换: $((SWITCH_END - SWITCH_START))秒）"

  # 查询同步后的表数量作为验证
  TABLE_COUNT=$(psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
    SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
  " 2>/dev/null || echo "?")

  log "本地库现有 ${TABLE_COUNT} 张表"
fi
