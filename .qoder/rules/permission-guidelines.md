---
trigger: always_on
---
# 权限开发规范

本文档定义了供应链仪表盘项目的权限管理规范，供开发者和 AI 助手参考。

---

## 一、权限编码规范

### 1.1 命名规则

权限编码采用三段式命名：`{模块}:{资源}:{操作}`

| 段位 | 说明 | 示例 |
|------|------|------|
| 模块 | 业务模块名称 | `system`, `finance`, `procurement` |
| 资源 | 具体资源类型 | `user`, `role`, `permission`, `ar` |
| 操作 | 操作类型 | `read`, `write`, `delete`, `confirm` |

### 1.2 操作类型定义

| 操作 | 说明 | 示例 |
|------|------|------|
| `read` | 查看权限 | `system:user:read` - 查看用户列表 |
| `write` | 编辑权限 | `system:user:write` - 创建/编辑用户 |
| `delete` | 删除权限 | `system:user:delete` - 删除用户 |
| `confirm` | 确认权限 | `strategic:confirm:procurement` - 采购确认 |

### 1.3 权限编码示例

```
# 系统管理
system:user:read        # 查看用户
system:user:write       # 编辑用户
system:role:read        # 查看角色
system:role:write       # 编辑角色
system:permission:read  # 查看权限
system:permission:write # 编辑权限

# 财务模块
finance:ar:read         # 查看应收账款
finance:ar:write        # 编辑应收账款
finance:ar:collect      # 催收操作
finance:ar:penalty      # 考核管理

# 采购模块
procurement:archive:read # 查看采购归档
return:read              # 查看退货单
return:write             # 编辑退货单
goods-rules:read         # 查看退货规则
goods-rules:write        # 编辑退货规则

# 战略商品
strategic:read                   # 查看战略商品
strategic:write                  # 编辑战略商品
strategic:confirm:procurement    # 采购确认
strategic:confirm:marketing      # 市场营销确认
```

---

## 二、后端开发规范

### 2.1 新增 API 权限配置

**步骤 1**: 在路由文件中添加权限中间件

```typescript
// dev/backend/src/routes/example.routes.ts
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/permission';

const router = Router();

// 单个权限检查
router.get('/api/example', 
  authMiddleware, 
  requirePermission('example:read'), 
  controller.list
);

// 多个权限检查（满足任一即可）
router.post('/api/example',
  authMiddleware,
  requirePermission(['example:write', 'admin']),
  controller.create
);

// 角色检查（仅管理员）
router.delete('/api/example/:id',
  authMiddleware,
  requireRole('admin'),
  controller.delete
);
```

**步骤 2**: 在迁移脚本中添加权限定义

```sql
-- dev/backend/src/db/migrations/xxx_add_example_permission.sql
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES 
  ('example:read', '查看示例', 'menu', '/example', 'read'),
  ('example:write', '编辑示例', 'api', '/api/example', 'write');

-- 为相关角色分配权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'manager') AND p.code IN ('example:read', 'example:write');
```

### 2.2 权限缓存失效

在修改用户角色或角色权限时，必须调用缓存失效方法：

```typescript
import { 
  invalidateUserPermissionCache,
  invalidateRolePermissionCache,
  invalidatePermissionTreeCache 
} from './permission-cache.service';

// 修改用户角色后
await assignUserRoles(userId, roleIds);
invalidateUserPermissionCache(userId);

// 修改角色权限后
await assignRolePermissions(roleId, permissionIds);
await invalidateRolePermissionCache(roleId);

// 修改权限结构后
await createPermission(data);
invalidatePermissionTreeCache();
```

### 2.3 系统角色保护

系统角色（`is_system = true`）有特殊保护：

- 只能修改 `description` 字段
- 不能删除
- 权限变更需要管理员权限

```typescript
// 检查系统角色
if (role.is_system) {
  // 只允许修改 description
  const allowedFields = ['description'];
}
```

---

## 三、前端开发规范

### 3.1 使用权限常量

**禁止**硬编码权限字符串，必须使用常量文件：

```typescript
// 错误 ❌
<Authorized permission="system:user:write">

// 正确 ✅
import { PERMISSIONS } from '@/constants/permissions';
<Authorized permission={PERMISSIONS.SYSTEM.USER.WRITE}>
```

### 3.2 按钮权限控制

使用 `<Authorized>` 组件包裹操作按钮：

```tsx
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';

// 单个权限
<Authorized permission={PERMISSIONS.SYSTEM.USER.WRITE}>
  <Button>编辑用户</Button>
</Authorized>

// 多个权限（满足任一）
<Authorized permission={[PERMISSIONS.SYSTEM.USER.WRITE, PERMISSIONS.SYSTEM.ROLE.WRITE]}>
  <Button>操作</Button>
</Authorized>

// 多个权限（需全部满足）
<Authorized permission={['perm1', 'perm2']} mode="all">
  <Button>操作</Button>
</Authorized>

// 角色检查
<Authorized role="admin">
  <Button>管理员操作</Button>
</Authorized>

// 无权限时显示替代内容
<Authorized permission={PERMISSIONS.SYSTEM.USER.WRITE} fallback={<span>无权限</span>}>
  <Button>编辑用户</Button>
</Authorized>
```

### 3.3 使用权限 Hook

```tsx
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/constants/permissions';

function MyComponent() {
  const { 
    hasPermission, 
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    currentUser 
  } = usePermission();

  // 单个权限检查
  if (hasPermission(PERMISSIONS.SYSTEM.USER.WRITE)) {
    // 执行操作
  }

  // 多个权限检查（任一）
  if (hasAnyPermission(['perm1', 'perm2'])) {
    // 执行操作
  }

  // 多个权限检查（全部）
  if (hasAllPermissions(['perm1', 'perm2'])) {
    // 执行操作
  }

  // 角色检查
  if (hasRole('admin')) {
    // 管理员操作
  }
}
```

### 3.4 路由权限配置

在 `.umirc.ts` 中为路由添加权限元数据：

```typescript
{
  path: '/system/users',
  name: '用户管理',
  component: '@/pages/System/User',
  permission: 'system:user:read',  // 添加权限字段
}
```

---

## 四、新功能开发检查清单

开发新功能时，请按以下清单检查权限配置：

### 后端检查项

- [ ] 为新 API 添加权限中间件（`requirePermission` 或 `requireRole`）
- [ ] 在迁移脚本中定义新权限
- [ ] 为相关角色分配新权限
- [ ] 如有权限变更操作，调用缓存失效方法

### 前端检查项

- [ ] 在 `constants/permissions.ts` 中定义权限常量
- [ ] 为路由添加 `permission` 元数据
- [ ] 为操作按钮添加 `<Authorized>` 包裹
- [ ] 测试无权限用户看不到操作入口
- [ ] 测试无权限用户调用 API 返回 403

---

## 五、角色定义

| 角色编码 | 角色名称 | 说明 |
|----------|----------|------|
| `admin` | 系统管理员 | 拥有系统全部权限 |
| `manager` | 供应链经理 | 管理数据和报表 |
| `operator` | 运营人员 | 日常数据操作 |
| `viewer` | 只读用户 | 仅查看权限 |
| `procurement_manager` | 采购主管 | 负责临期退货确认和 ERP 退货单填写 |
| `warehouse_manager` | 仓储主管 | 负责仓储退货执行 |
| `finance_staff` | 财务人员 | 负责应收账款财务审核 |
| `cashier` | 结算会计 | 负责回款核实确认 |
| `marketing_supervisor` | 营销主管 | 负责催收升级处理 |

---

## 六、常见问题

### Q: 权限修改后多久生效？

A: 权限修改后最多 30 秒生效（缓存 TTL），无需重新登录。

### Q: 如何判断当前用户是否为管理员？

A: 使用 `hasRole('admin')` 或 `<Authorized role="admin">`。

### Q: 如何处理 403 错误？

A: 前端请求拦截器已统一处理，会显示"无权限访问"提示。

### Q: 如何添加新的权限编码？

A: 1) 在迁移脚本中添加数据库记录；2) 在 `constants/permissions.ts` 中定义常量；3) 在路由和按钮中使用。
