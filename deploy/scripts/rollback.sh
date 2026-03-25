#!/bin/bash

# 供应链仪表盘回滚脚本
# 用法: ./rollback.sh [选项]
# 选项:
#   --version DIR    指定回滚到的版本目录
#   --list           列出可用的备份版本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"

# 解析参数
TARGET_VERSION=""
LIST_VERSIONS=false

for arg in "$@"; do
    case $arg in
        --version)
            shift
            TARGET_VERSION="$1"
            shift
            ;;
        --list)
            LIST_VERSIONS=true
            ;;
    esac
done

# 列出可用版本
list_versions() {
    echo "========================================="
    echo "        可用的备份版本"
    echo "========================================="

    # 检查 prod.backup
    if [ -d "$PROJECT_ROOT/prod.backup" ]; then
        echo -e "1. ${GREEN}prod.backup${NC} (最近一次部署前的备份)"
    fi

    # 检查 backup_* 目录
    local backups
    backups=$(find "$PROJECT_ROOT" -maxdepth 1 -type d -name "backup_*" 2>/dev/null | sort -r)

    if [ -n "$backups" ]; then
        local count=2
        echo "$backups" | while read -r backup; do
            local dirname
            dirname=$(basename "$backup")
            local timestamp
            timestamp=$(echo "$dirname" | sed 's/backup_//')
            echo -e "$count. ${GREEN}$dirname${NC} ($timestamp)"
            count=$((count + 1))
        done
    fi

    echo ""
    echo "使用方法: ./rollback.sh --version <目录名>"
    echo "示例: ./rollback.sh --version prod.backup"
}

# 如果是列出版本
if [ "$LIST_VERSIONS" = true ]; then
    list_versions
    exit 0
fi

# 确定目标版本
if [ -z "$TARGET_VERSION" ]; then
    # 默认使用 prod.backup
    if [ -d "$PROJECT_ROOT/prod.backup" ]; then
        TARGET_VERSION="prod.backup"
    else
        log_error "没有找到可用的备份版本"
        log_info "请使用 --list 选项查看可用版本"
        exit 1
    fi
fi

TARGET_DIR="$PROJECT_ROOT/$TARGET_VERSION"

# 验证目标版本存在
if [ ! -d "$TARGET_DIR" ]; then
    log_error "备份版本不存在: $TARGET_DIR"
    log_info "请使用 --list 选项查看可用版本"
    exit 1
fi

echo "========================================="
echo "        开始回滚操作"
echo "========================================="
log_info "目标版本: $TARGET_VERSION"
log_info "目标目录: $TARGET_DIR"
echo ""

# 确认回滚
read -p "确认要回滚到 $TARGET_VERSION 吗? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    log_info "回滚操作已取消"
    exit 0
fi

log_step "步骤 1: 备份当前版本..."
CURRENT_BACKUP="$PROJECT_ROOT/prod.failed_$(date +%Y%m%d_%H%M%S)"
if [ -d "$PROJECT_ROOT/prod" ]; then
    cp -r "$PROJECT_ROOT/prod" "$CURRENT_BACKUP"
    log_info "当前版本已备份到: $(basename $CURRENT_BACKUP)"
fi

log_step "步骤 2: 停止服务..."
cd "$DEPLOY_DIR"
docker-compose down 2>/dev/null || true
log_info "服务已停止"

log_step "步骤 3: 恢复备份版本..."
# 删除当前 prod 目录内容（保留目录本身）
rm -rf "$PROJECT_ROOT/prod/frontend/dist" 2>/dev/null || true
rm -rf "$PROJECT_ROOT/prod/backend/dist" 2>/dev/null || true

# 恢复前端
if [ -d "$TARGET_DIR/frontend_dist" ] || [ -d "$TARGET_DIR/frontend/dist" ]; then
    mkdir -p "$PROJECT_ROOT/prod/frontend"
    if [ -d "$TARGET_DIR/frontend_dist" ]; then
        cp -r "$TARGET_DIR/frontend_dist" "$PROJECT_ROOT/prod/frontend/dist"
    else
        cp -r "$TARGET_DIR/frontend/dist" "$PROJECT_ROOT/prod/frontend/dist"
    fi
    log_info "前端产物已恢复"
fi

# 恢复后端
if [ -d "$TARGET_DIR/backend_dist" ] || [ -d "$TARGET_DIR/backend/dist" ]; then
    mkdir -p "$PROJECT_ROOT/prod/backend"
    if [ -d "$TARGET_DIR/backend_dist" ]; then
        cp -r "$TARGET_DIR/backend_dist" "$PROJECT_ROOT/prod/backend/dist"
    else
        cp -r "$TARGET_DIR/backend/dist" "$PROJECT_ROOT/prod/backend/dist"
    fi
    log_info "后端产物已恢复"
fi

# 恢复环境配置
if [ -f "$TARGET_DIR/backend.env" ] || [ -f "$TARGET_DIR/backend/.env" ]; then
    mkdir -p "$PROJECT_ROOT/prod/backend"
    if [ -f "$TARGET_DIR/backend.env" ]; then
        cp "$TARGET_DIR/backend.env" "$PROJECT_ROOT/prod/backend/.env"
    else
        cp "$TARGET_DIR/backend/.env" "$PROJECT_ROOT/prod/backend/.env"
    fi
    log_info "环境配置已恢复"
fi

log_step "步骤 4: 重启服务..."
cd "$DEPLOY_DIR"
docker-compose up -d
if [ $? -ne 0 ]; then
    log_error "服务启动失败"
    exit 1
fi
log_info "服务已启动"

log_step "步骤 5: 等待服务就绪..."
sleep 10

log_step "步骤 6: 健康检查..."
"$SCRIPT_DIR/health-check.sh"

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "        回滚成功!"
    echo "========================================="
    log_info "已回滚到版本: $TARGET_VERSION"
    log_info "失败的版本已备份到: $(basename $CURRENT_BACKUP)"
else
    log_error "回滚后健康检查失败，请手动检查服务状态"
    exit 1
fi
