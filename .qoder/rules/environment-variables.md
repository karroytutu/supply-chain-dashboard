---
trigger: always_on
---
# 环境变量管理规范

版本：v1.0（2026-06-27）
适用范围：本项目所有涉及环境变量的后端代码
核心原则：统一入口、启动校验、模板同步、敏感隔离

---

## 一、.env 文件管理

### 1.1 三个文件的职责

| 文件 | 位置 | 提交到 Git | 用途 |
|------|------|-----------|------|
| `.env.example` | `dev/backend/` | 是 | 配置模板，列出所有变量及说明，敏感值用占位符 |
| `.env.development` | `dev/backend/` | 否（.gitignore） | 开发环境的实际配置 |
| `prod/backend/.env` | 生产服务器 | 否（.gitignore） | 生产环境的实际配置 |

### 1.2 规则

- `.env.example` 是所有 `.env` 文件的"空白表格"，只包含变量名和占位符，不含真实密码
- `.env.development` 和 `prod/backend/.env` 永远不提交到 Git
- 新增环境变量时，必须同时更新三个文件（见检查清单）

---

## 二、config/index.ts 作为唯一入口

### 2.1 规则

所有环境变量必须通过 `dev/backend/src/config/index.ts` 读取和导出，业务代码禁止直接访问 `process.env`。

```typescript
// 正确：通过 config 读取
import { config } from '../config';
const baseUrl = config.app.baseUrl;

// 错误：直接读取 process.env
const baseUrl = process.env.APP_BASE_URL || 'http://localhost:8100';
```

### 2.2 例外

以下位置允许直接读取 `process.env`（因为它们属于基础设施层，在 config 之前加载）：
- `config/index.ts` 本身
- `db/migrate.ts`（独立的 CLI 工具，有自己的 dotenv 加载）

---

## 三、启动校验

### 3.1 必需变量清单

`config/index.ts` 中维护一个 `REQUIRED_VARS` 数组，列出所有缺失时会导致功能异常的变量。程序启动时自动检查，缺失则立即报错并拒绝启动。

当前的必需变量：

```
APP_DB_HOST, APP_DB_NAME, APP_DB_USER, APP_DB_PASSWORD,
DINGTALK_APP_KEY, DINGTALK_APP_SECRET, DINGTALK_CORP_ID, DINGTALK_AGENT_ID,
JWT_SECRET,
APP_BASE_URL, ALLOWED_ORIGINS
```

### 3.2 新增必需变量时

如果新增的变量缺失会导致程序无法正常工作，必须将其加入 `REQUIRED_VARS` 数组。

---

## 四、新增环境变量检查清单

每次新增环境变量时，必须完成以下所有步骤：

- [ ] 在 `config/index.ts` 中添加读取逻辑（`config.xxx` 新增属性）
- [ ] 在 `.env.example` 中添加变量名和占位符说明
- [ ] 在 `.env.development` 中添加开发环境的值
- [ ] SSH 到生产服务器，在 `prod/backend/.env` 中添加生产环境的值
- [ ] 如果变量缺失会导致功能异常，加入 `REQUIRED_VARS` 校验清单
- [ ] 如果变量影响 CORS、JWT 等安全相关功能，确认生产值与开发值不同

---

## 五、敏感信息管理

### 5.1 禁止提交到 Git 的内容

以下信息绝对不允许出现在 Git 仓库中：
- 数据库密码
- JWT 密钥
- 钉钉 AppKey/AppSecret
- ERP/WMS 登录凭证
- 任何第三方 API 的密钥或 Token

### 5.2 .env.example 中的占位符格式

```
# 使用尖括号包裹的占位符
APP_DB_PASSWORD=<your-password>
JWT_SECRET=<generate-with-openssl-rand-base64-32>
DINGTALK_APP_KEY=<your-dingtalk-app-key>
```

---

## 六、生产与开发的差异变量

以下变量在开发和生产中必须使用不同的值：

| 变量 | 开发值 | 生产值 |
|------|--------|--------|
| `PORT` | 8100 | 8000 |
| `NODE_ENV` | development | production |
| `APP_DB_HOST` | localhost | xinshutong-postgres（Docker 内网） |
| `JWT_SECRET` | 开发用弱密钥 | 生产用强密钥（至少32位） |
| `APP_BASE_URL` | http://localhost:3100 | https://xly.gzzxd.com |
| `ALLOWED_ORIGINS` | http://localhost:3100 | https://xly.gzzxd.com |
| `LOG_LEVEL` | debug | info |

---

## 七、反模式（禁止的做法）

- 在业务代码中直接读取 `process.env.XXX`（必须通过 `config.xxx`）
- 新增环境变量只更新了开发 `.env`，忘了同步生产和 `.env.example`
- 在 `.env.example` 中写入真实的密码或密钥
- 将 `.env` 文件提交到 Git
- 在代码中硬编码环境相关的值（如写死 `http://localhost:3100`）
