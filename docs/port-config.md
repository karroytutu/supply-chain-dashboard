# 服务端口配置

## 端口分配

| 环境 | 前端 | 后端 API | 说明 |
|------|------|----------|------|
| 生产环境 | 3000 | 8000 | 生产部署使用 |
| 开发环境 | 3100 | 8100 | 本地开发使用 |

## 启动命令

### 开发环境

**后端服务 (端口 8100)**
```bash
cd /www2/DevHub/supply-chain-dashboard/server
npm run dev
```

**前端服务 (端口 3100)**
```bash
cd /www2/DevHub/supply-chain-dashboard
npm run dev
```

### 生产环境

**后端服务 (端口 8000)**
```bash
cd /www2/DevHub/supply-chain-dashboard/server
npm run start
```

**前端服务**
```bash
# 使用 Docker 部署，映射到端口 3000
docker build -t supply-chain-dashboard .
docker run -d -p 3000:80 supply-chain-dashboard
```

## 配置文件

### 后端配置
- 开发环境配置: `server/.env.development` (端口 8100)
- 生产环境配置: `server/.env.production` (端口 8000)

### 前端配置
- 配置文件: `.umirc.ts`
- 开发环境代理: `/api` -> `http://localhost:8100`
- 生产环境代理: 通过 nginx 配置

## 数据库连接

| 参数 | 值 |
|------|-----|
| 主机 | localhost |
| 端口 | 5432 |
| 数据库 | xinshutong |
| 用户名 | postgres |
| 密码 | postgres |

## 注意事项

1. 启动服务前请先检查端口是否被占用
2. 仅能杀死本项目占用的端口，不允许杀死其他项目的端口，避免影响其他项目
3. 检查端口命令: `lsof -i :端口号`
4. 开发环境和生产环境使用不同端口，可以在同一台机器上同时运行
5. 切换环境时注意使用正确的启动命令
