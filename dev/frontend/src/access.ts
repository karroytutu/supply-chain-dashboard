/**
 * UmiJS access 插件配置
 * 根据用户权限和角色生成访问控制对象，用于菜单过滤和路由权限校验
 *
 * @see https://umijs.org/docs/max/access
 */
import { PERMISSIONS } from '@/constants/permissions';

/** 递归提取 PERMISSIONS 对象中所有权限编码字符串 */
function getAllPermissionCodes(obj: Record<string, any>): string[] {
  const codes: string[] = [];
  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      codes.push(value);
    } else if (typeof value === 'object' && value !== null) {
      codes.push(...getAllPermissionCodes(value));
    }
  }
  return codes;
}

const allPermissionCodes = getAllPermissionCodes(PERMISSIONS as any);

export default function access(initialState: {
  permissions?: string[];
  roles?: string[];
} | undefined) {
  const permissions = initialState?.permissions || [];
  const roles = initialState?.roles || [];

  // admin 角色拥有所有权限
  if (roles.includes('admin')) {
    return Object.fromEntries(allPermissionCodes.map(code => [code, true]));
  }

  // 根据用户权限列表映射
  return Object.fromEntries(
    allPermissionCodes.map(code => [code, permissions.includes(code)]),
  );
}
