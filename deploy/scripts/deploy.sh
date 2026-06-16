#!/bin/bash

# 供应链仪表盘部署脚本
# 用法: ./deploy.sh [选项]
# 选项:
#   --skip-build    跳过构建步骤，仅重启容器
#   --backup        部署前创建备份
#
# 缓存策略：脚本仅检测 Dockerfile 是否变更来决定 --no-cache，
# package.json / 代码变更由 Docker 原生层缓存自动处理，无需全量重建。

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
NO_CACHE=""

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

# ========== 构建缓存自动检测 ==========
#
# 缓存策略（分层检测，精准控制重建范围）：
#
# | 变更类型              | 策略              | 原因
# |-----------------------|-------------------|--------------------------------------
# | Dockerfile 内容变更    | --no-cache 全量重建 | 可能调整了层顺序、基础镜像或系统依赖
# | 仅 package.json 变更  | 不启用 --no-cache  | Docker 原生层缓存会自动检测 COPY 文件变化，
# |                       |                   | 仅重建依赖层及之后的层
# | 仅代码/产物变更       | 不启用 --no-cache  | 只重建最后几层（COPY dist），最快
#
# 前后端独立检测，互不影响。

DOCKERFILE_CACHE_KEY_FILE="$DEPLOY_DIR/.dockerfile-cache-key"

# 仅计算 Dockerfile 的哈希（决定是否 --no-cache）
compute_dockerfile_cache_key() {
    local files=(
        "$PROJECT_ROOT/deploy/Dockerfile.backend"
        "$PROJECT_ROOT/deploy/Dockerfile.frontend"
    )
    cat "${files[@]}" 2>/dev/null | md5sum | awk '{print $1}'
}

# 自动检测 Dockerfile 是否变更，决定是否需要 --no-cache
# package.json 变更由 Docker 原生层缓存处理，脚本不介入
auto_detect_rebuild() {
    local current_key
    current_key=$(compute_dockerfile_cache_key)

    if [ ! -f "$DOCKERFILE_CACHE_KEY_FILE" ]; then
        log_info "首次部署，自动启用 --no-cache 构建基础镜像层"
        NO_CACHE="--no-cache"
        return
    fi

    local saved_key
    saved_key=$(cat "$DOCKERFILE_CACHE_KEY_FILE" 2>/dev/null || echo "")

    if [ "$current_key" != "$saved_key" ]; then
        log_info "检测到 Dockerfile 变更，自动启用 --no-cache 全量重建"
        NO_CACHE="--no-cache"
    else
        log_info "Dockerfile 未变更，复用 Docker 构建缓存（package.json 变更由 Docker 层缓存自动处理）"
    fi
}

# 保存 Dockerfile 缓存 key
save_build_cache_key() {
    local current_key
    current_key=$(compute_dockerfile_cache_key)
    echo "$current_key" > "$DOCKERFILE_CACHE_KEY_FILE"
    log_info "构建缓存 key 已保存"
}

# 执行自动检测
auto_detect_rebuild

# ========== Playwright 浏览器预置 ==========
#
# 问题：Playwright Chromium 从 CDN 下载（国内慢，175MB+，常超时）
# 方案：构建前从宿主机缓存预置浏览器到构建上下文，Dockerfile 直接 COPY
# 回退：若宿主机无缓存，Dockerfile 会自动回退到 CDN 下载

PW_BROWSERS_DIR="$DEPLOY_DIR/playwright-browsers"
HOST_PW_CACHE="${HOME}/.cache/ms-playwright"

preseed_playwright_browsers() {
    mkdir -p "$PW_BROWSERS_DIR"

    local found=false
    for dir in "$HOST_PW_CACHE"/chromium-* "$HOST_PW_CACHE"/chromium_headless_shell-*; do
        if [ -d "$dir" ]; then
            local dirname=$(basename "$dir")
            cp -a "$dir" "$PW_BROWSERS_DIR/"
            log_info "已预置 Playwright 浏览器: $dirname"
            found=true
        fi
    done

    if [ "$found" = true ]; then
        local size
        size=$(du -sh "$PW_BROWSERS_DIR" 2>/dev/null | cut -f1)
        log_info "Playwright 浏览器预置完成 ($size)，Docker 构建时将 COPY 而非 CDN 下载"
    else
        log_warn "宿主机无 Playwright 浏览器缓存，Docker 构建时将回退到 CDN 下载"
    fi
}

cleanup_playwright_browsers() {
    if [ -d "$PW_BROWSERS_DIR" ]; then
        rm -rf "$PW_BROWSERS_DIR"
        log_info "已清理 Playwright 浏览器预置目录"
    fi
}

# 构建前预置浏览器（Dockerfile 中 COPY 需要此目录）
if [ "$SKIP_BUILD" = false ]; then
    preseed_playwright_browsers
fi

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
    cp -al prod prod.backup
    log_info "当前版本已保存到 prod.backup"
fi

# ========== 辅助函数 ==========

# 判断是否需要执行 npm ci（package.json 是否变更）
needs_npm_ci() {
    local dir="$1"
    if [ ! -d "$dir/node_modules" ]; then
        return 0
    fi
    local pkg_hash
    pkg_hash=$(md5sum "$dir/package.json" 2>/dev/null | awk '{print $1}')
    if [ -f "$dir/node_modules/.package-hash" ]; then
        local saved_hash
        saved_hash=$(cat "$dir/node_modules/.package-hash" 2>/dev/null)
        if [ "$pkg_hash" = "$saved_hash" ]; then
            return 1
        fi
    fi
    return 0
}

# 检查源码是否比产物更新
check_source_freshness() {
    local src_dir="$1"
    local dist_file="$2"
    local name="$3"

    if [ ! -f "$dist_file" ]; then
        log_warn "$name 构建产物不存在"
        return
    fi

    local latest_src
    latest_src=$(find "$src_dir" -type f -exec stat -c %Y {} + 2>/dev/null | sort -n | tail -1)
    local dist_mtime
    dist_mtime=$(stat -c %Y "$dist_file" 2>/dev/null || echo 0)

    if [ "$latest_src" -gt "$dist_mtime" ] 2>/dev/null; then
        log_warn "$name 源码有更新，但产物较旧（产物时间: $(date -d @"$dist_mtime" '+%Y-%m-%d %H:%M:%S')）"
    fi
}

# 构建产物摘要
print_build_summary() {
    local dist_dir="$1"
    local name="$2"
    if [ -d "$dist_dir" ]; then
        local size files
        size=$(du -sh "$dist_dir" 2>/dev/null | cut -f1)
        files=$(find "$dist_dir" -type f 2>/dev/null | wc -l)
        log_info "$name 产物摘要: $size, $files 个文件"
    fi
}

# 前端构建（后台执行）
build_frontend_async() {
    cd "$PROJECT_ROOT/dev/frontend"
    if needs_npm_ci "$PROJECT_ROOT/dev/frontend"; then
        log_info "前端依赖有变更，执行 npm ci..."
        npm ci
        md5sum "$PROJECT_ROOT/dev/frontend/package.json" | awk '{print $1}' > "$PROJECT_ROOT/dev/frontend/node_modules/.package-hash"
    else
        log_info "前端依赖未变更，跳过 npm ci"
    fi
    npm run build
}

# 后端构建（后台执行）
build_backend_async() {
    cd "$PROJECT_ROOT/dev/backend"
    if needs_npm_ci "$PROJECT_ROOT/dev/backend"; then
        log_info "后端依赖有变更，执行 npm ci..."
        npm ci
        md5sum "$PROJECT_ROOT/dev/backend/package.json" | awk '{print $1}' > "$PROJECT_ROOT/dev/backend/node_modules/.package-hash"
    else
        log_info "后端依赖未变更，跳过 npm ci"
    fi
    # 构建前清空 dist/：tsc 不会删除已废弃的编译文件，源码目录重命名或删除后旧文件会残留
    if [ -d "$PROJECT_ROOT/prod/backend/dist" ]; then
        rm -rf "$PROJECT_ROOT/prod/backend/dist"
        log_info "已清空旧编译产物: prod/backend/dist/"
    fi
    npm run build
}

# 构建步骤（并行 + 原子替换）
if [ "$SKIP_BUILD" = false ]; then
    log_info "开始构建..."

    # 源码-产物新鲜度预检
    check_source_freshness "$PROJECT_ROOT/dev/frontend/src" "$PROJECT_ROOT/prod/frontend/dist/index.html" "前端"
    check_source_freshness "$PROJECT_ROOT/dev/backend/src" "$PROJECT_ROOT/prod/backend/dist/app.js" "后端"

    # 备份当前产物（用于构建失败时回滚）
    cp -al "$PROJECT_ROOT/prod" "$PROJECT_ROOT/prod.backup.before-build"

    # 前后端并行构建
    build_frontend_async > /tmp/build-frontend.log 2>&1 &
    FRONTEND_PID=$!

    build_backend_async > /tmp/build-backend.log 2>&1 &
    BACKEND_PID=$!

    # 等待前端构建
    FRONTEND_FAILED=0
    if wait $FRONTEND_PID; then
        log_info "前端构建成功"
    else
        log_error "前端构建失败"
        cat /tmp/build-frontend.log
        FRONTEND_FAILED=1
    fi

    # 等待后端构建
    BACKEND_FAILED=0
    if wait $BACKEND_PID; then
        log_info "后端构建成功"
    else
        log_error "后端构建失败"
        cat /tmp/build-backend.log
        BACKEND_FAILED=1
    fi

    # 原子性检查：任一失败则恢复备份
    if [ $FRONTEND_FAILED -eq 1 ] || [ $BACKEND_FAILED -eq 1 ]; then
        rm -rf "$PROJECT_ROOT/prod"
        mv "$PROJECT_ROOT/prod.backup.before-build" "$PROJECT_ROOT/prod"
        log_error "构建失败，已自动恢复原始产物"
        exit 1
    fi

    rm -rf "$PROJECT_ROOT/prod.backup.before-build"
    log_info "构建产物原子替换完成"
fi

# 验证构建产物存在
log_info "验证构建产物..."
if [ ! -f "$PROJECT_ROOT/prod/frontend/dist/index.html" ]; then
    log_error "前端构建产物不存在: prod/frontend/dist/index.html"
    log_error "请移除 --skip-build 参数或手动执行构建"
    exit 1
fi
if [ ! -f "$PROJECT_ROOT/prod/backend/dist/app.js" ]; then
    log_error "后端构建产物不存在: prod/backend/dist/app.js"
    log_error "请移除 --skip-build 参数或手动执行构建"
    exit 1
fi
log_info "构建产物验证通过"

# 构建新鲜度检查
STALE_THRESHOLD=$((24 * 3600))  # 24小时
CURRENT_TIME=$(date +%s)

check_stale() {
    local file_path="$1"
    local file_name="$2"
    local file_mtime=$(stat -c %Y "$file_path" 2>/dev/null || echo 0)
    local file_age=$((CURRENT_TIME - file_mtime))

    if [ "$file_age" -gt "$STALE_THRESHOLD" ]; then
        local hours_old=$((file_age / 3600))
        if [ "$SKIP_BUILD" = true ]; then
            log_error "${file_name}构建产物已过期（${hours_old}小时前构建）"
            log_error "使用了 --skip-build 但构建产物超过24小时，请移除 --skip-build 重新构建"
            exit 1
        else
            log_warn "${file_name}构建产物已过期（${hours_old}小时前构建），将重新构建"
        fi
    else
        log_info "${file_name}构建产物新鲜度检查通过"
    fi
}

check_stale "$PROJECT_ROOT/prod/frontend/dist/index.html" "前端"
check_stale "$PROJECT_ROOT/prod/backend/dist/app.js" "后端"

# 恢复环境配置
if [ -f "prod/backend/.env.backup" ]; then
    cp prod/backend/.env.backup prod/backend/.env
    log_info "环境配置已恢复"
fi

# 构建产物摘要
print_build_summary "$PROJECT_ROOT/prod/frontend/dist" "前端"
print_build_summary "$PROJECT_ROOT/prod/backend/dist" "后端"

# 部署 Docker 容器
log_info "部署 Docker 容器..."

# 前置检查：xinshutong_default 外部网络是否存在
# docker-compose.yml 中 backend 服务依赖此网络连接 PostgreSQL 容器
if ! docker network inspect xinshutong_default &>/dev/null; then
    log_error "xinshutong_default 网络不存在"
    log_error "本项目 backend 服务通过此网络连接 PostgreSQL 容器（由 xinshutong 项目创建）"
    log_error "请先部署 xinshutong 项目的 PostgreSQL 容器，或手动创建网络："
    log_error "  docker network create xinshutong_default"
    exit 1
fi
log_info "xinshutong_default 网络检查通过"

cd "$DEPLOY_DIR"

# 创建上传目录（确保目录存在并设置正确权限）
log_info "初始化上传目录..."
mkdir -p /data/uploads/return-evidence
mkdir -p /data/uploads/ar-evidence
mkdir -p /data/uploads/credit-license
chmod 755 /data/uploads
chmod 755 /data/uploads/return-evidence
chmod 755 /data/uploads/ar-evidence
chmod 755 /data/uploads/credit-license
log_info "上传目录已创建: /data/uploads"

# 停止并移除现有容器（保留网络避免冲突，up -d 会自动复用）
docker-compose stop 2>/dev/null || true
docker-compose rm -f 2>/dev/null || true
log_info "已停止旧容器，网络保留复用"

# 构建新镜像（默认使用 Docker 层缓存加速，--rebuild 参数可强制全量重建）
docker-compose build $NO_CACHE
if [ $? -ne 0 ]; then
    log_error "Docker 镜像构建失败"
    cleanup_playwright_browsers
    exit 1
fi
log_info "Docker 镜像打包完成（使用本地构建产物）"

# 构建后清理 Playwright 浏览器预置目录（避免占用磁盘）
cleanup_playwright_browsers

# 启动容器
docker-compose up -d
if [ $? -ne 0 ]; then
    log_error "容器启动失败"
    exit 1
fi
log_info "容器已启动"

# 等待服务启动（轮询检测，最多等待 20 秒）
log_info "等待服务启动..."
READY=false
for i in $(seq 1 10); do
    if curl -sf --connect-timeout 2 "http://localhost:8000/api/health" > /dev/null 2>&1; then
        READY=true
        log_info "服务已就绪（${i}x2 秒）"
        break
    fi
    sleep 2
done
if [ "$READY" = false ]; then
    log_warn "服务启动较慢，将交由健康检查进一步验证"
fi

# 执行健康检查
log_info "执行健康检查..."
"$SCRIPT_DIR/health-check.sh"

if [ $? -eq 0 ]; then
    log_info "部署成功!"
    save_build_cache_key
    # 清理备份
    rm -rf prod.backup 2>/dev/null || true
else
    log_error "健康检查失败，执行回滚..."
    "$SCRIPT_DIR/rollback.sh"
    exit 1
fi
