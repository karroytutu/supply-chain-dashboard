#!/bin/bash

# 供应链仪表盘部署脚本
# 用法: ./deploy.sh [选项]
# 选项:
#   --skip-build    跳过构建步骤，仅重启容器
#   --backup        部署前创建备份

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# 解析参数
SKIP_BUILD=false
CREATE_BACKUP=false

for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --backup)
            CREATE_BACKUP=true
            shift
            ;;
    esac
done

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"

log_info "项目路径: $PROJECT_ROOT"
log_info "部署配置目录: $DEPLOY_DIR"

# 切换到项目根目录
cd "$PROJECT_ROOT"

# 创建备份
if [ "$CREATE_BACKUP" = true ]; then
    log_info "创建备份..."
    BACKUP_DIR="$PROJECT_ROOT/backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    if [ -d "prod/frontend/dist" ]; then
        cp -r prod/frontend/dist "$BACKUP_DIR/frontend_dist"
        log_info "前端产物已备份"
    fi

    if [ -d "prod/backend/dist" ]; then
        cp -r prod/backend/dist "$BACKUP_DIR/backend_dist"
        log_info "后端产物已备份"
    fi

    if [ -f "prod/backend/.env" ]; then
        cp prod/backend/.env "$BACKUP_DIR/backend.env"
        log_info "后端环境配置已备份"
    fi
fi

# 保存当前版本用于回滚
log_info "保存当前版本..."
if [ -d "prod" ]; then
    rm -rf prod.backup 2>/dev/null || true
    cp -r prod prod.backup
    log_info "当前版本已保存到 prod.backup"
fi

# 构建步骤
if [ "$SKIP_BUILD" = false ]; then
    log_info "开始构建..."

    # 构建前端
    log_info "构建前端..."
    cd "$PROJECT_ROOT/dev/frontend"
    npm install
    npm run build
    if [ $? -ne 0 ]; then
        log_error "前端构建失败"
        exit 1
    fi
    log_info "前端构建完成"

    # 构建后端
    log_info "构建后端..."
    cd "$PROJECT_ROOT/dev/backend"
    npm install
    npm run build
    if [ $? -ne 0 ]; then
        log_error "后端构建失败"
        exit 1
    fi
    log_info "后端构建完成"
fi

# 恢复环境配置
if [ -f "prod/backend/.env.backup" ]; then
    cp prod/backend/.env.backup prod/backend/.env
    log_info "环境配置已恢复"
fi

# 部署 Docker 容器
log_info "部署 Docker 容器..."
cd "$DEPLOY_DIR"

# 停止现有容器
docker-compose down 2>/dev/null || true
log_info "已停止现有容器"

# 构建新镜像
docker-compose build --no-cache
if [ $? -ne 0 ]; then
    log_error "Docker 镜像构建失败"
    exit 1
fi
log_info "Docker 镜像构建完成"

# 启动容器
docker-compose up -d
if [ $? -ne 0 ]; then
    log_error "容器启动失败"
    exit 1
fi
log_info "容器已启动"

# 等待服务启动
log_info "等待服务启动..."
sleep 10

# 执行健康检查
log_info "执行健康检查..."
"$SCRIPT_DIR/health-check.sh"

if [ $? -eq 0 ]; then
    log_info "部署成功!"
    # 清理备份
    rm -rf prod.backup 2>/dev/null || true
else
    log_error "健康检查失败，执行回滚..."
    "$SCRIPT_DIR/rollback.sh"
    exit 1
fi
