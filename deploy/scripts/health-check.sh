#!/bin/bash

# 供应链仪表盘健康检查脚本
# 检查前端服务 (端口 3000) 和后端服务 (端口 8000) 的可用性

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
FRONTEND_PORT=3000
BACKEND_PORT=8000
MAX_RETRIES=3
RETRY_INTERVAL=5

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

# 检查结果
FRONTEND_OK=false
BACKEND_OK=false

# 检查前端服务
check_frontend() {
    local retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        if curl -sf --connect-timeout 5 "http://localhost:$FRONTEND_PORT/" > /dev/null 2>&1; then
            FRONTEND_OK=true
            log_info "前端服务正常 (端口 $FRONTEND_PORT)"
            return 0
        fi
        retry=$((retry + 1))
        if [ $retry -lt $MAX_RETRIES ]; then
            log_warn "前端服务检查失败，等待重试... ($retry/$MAX_RETRIES)"
            sleep $RETRY_INTERVAL
        fi
    done
    log_error "前端服务不可用 (端口 $FRONTEND_PORT)"
    return 1
}

# 检查后端服务
check_backend() {
    local retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        local response
        response=$(curl -sf --connect-timeout 5 "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null)

        if [ $? -eq 0 ]; then
            # 检查响应内容
            if echo "$response" | grep -q '"status"'; then
                BACKEND_OK=true
                log_info "后端服务正常 (端口 $BACKEND_PORT)"
                log_info "健康检查响应: $response"
                return 0
            fi
        fi

        retry=$((retry + 1))
        if [ $retry -lt $MAX_RETRIES ]; then
            log_warn "后端服务检查失败，等待重试... ($retry/$MAX_RETRIES)"
            sleep $RETRY_INTERVAL
        fi
    done
    log_error "后端服务不可用 (端口 $BACKEND_PORT)"
    return 1
}

# 检查 Docker 容器状态
check_containers() {
    log_info "检查 Docker 容器状态..."

    # 检查前端容器
    if docker ps --format '{{.Names}}' | grep -q "xly-frontend"; then
        local frontend_status
        frontend_status=$(docker inspect --format='{{.State.Status}}' xly-frontend 2>/dev/null)
        if [ "$frontend_status" = "running" ]; then
            log_info "前端容器状态: running"
        else
            log_error "前端容器状态: $frontend_status"
        fi
    else
        log_error "前端容器未运行"
    fi

    # 检查后端容器
    if docker ps --format '{{.Names}}' | grep -q "xly-backend"; then
        local backend_status
        backend_status=$(docker inspect --format='{{.State.Status}}' xly-backend 2>/dev/null)
        if [ "$backend_status" = "running" ]; then
            log_info "后端容器状态: running"
        else
            log_error "后端容器状态: $backend_status"
        fi
    else
        log_error "后端容器未运行"
    fi
}

# 主函数
main() {
    echo "========================================="
    echo "    供应链仪表盘健康检查"
    echo "========================================="
    echo ""

    # 检查容器状态
    check_containers
    echo ""

    # 检查前端服务
    check_frontend
    echo ""

    # 检查后端服务
    check_backend
    echo ""

    # 汇总结果
    echo "========================================="
    echo "           检查结果汇总"
    echo "========================================="
    echo "前端服务: $([ "$FRONTEND_OK" = true ] && echo -e "${GREEN}正常${NC}" || echo -e "${RED}异常${NC}")"
    echo "后端服务: $([ "$BACKEND_OK" = true ] && echo -e "${GREEN}正常${NC}" || echo -e "${RED}异常${NC}")"
    echo "========================================="

    # 返回状态
    if [ "$FRONTEND_OK" = true ] && [ "$BACKEND_OK" = true ]; then
        log_info "所有服务正常运行"
        exit 0
    else
        log_error "部分服务异常，请检查日志"
        exit 1
    fi
}

main "$@"
