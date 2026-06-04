/**
 * PermissionTree 工具函数单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  convertToTreeData,
  getAllKeys,
  getParentKeys,
  getMatchedKeys,
  getModulePermissionIds,
  groupByModule,
} from './utils';
import type { PermissionItem } from './types';

// 测试数据工厂
function createPermissions(): PermissionItem[] {
  return [
    {
      id: 1, name: '系统管理', code: 'system', children: [
        {
          id: 2, name: '用户管理', code: 'system:user', children: [
            { id: 3, name: '查看用户', code: 'system:user:read' },
            { id: 4, name: '编辑用户', code: 'system:user:write' },
          ],
        },
        {
          id: 5, name: '角色管理', code: 'system:role', children: [
            { id: 6, name: '查看角色', code: 'system:role:read' },
          ],
        },
      ],
    },
    {
      id: 10, name: '财务模块', code: 'finance', children: [
        { id: 11, name: '应收账款', code: 'finance:ar:read' },
      ],
    },
  ];
}

// ==================== convertToTreeData ====================

describe('convertToTreeData', () => {
  it('转换权限数据为 Tree 格式', () => {
    const items = createPermissions();
    const tree = convertToTreeData(items);

    expect(tree).toHaveLength(2);
    expect(tree[0].key).toBe(1);
    expect(tree[0].title).toBe('系统管理');
    expect(tree[0].children).toHaveLength(2);
  });

  it('空数据返回空数组', () => {
    expect(convertToTreeData([])).toEqual([]);
  });

  it('无 children 的节点正确转换', () => {
    const items: PermissionItem[] = [
      { id: 1, name: '叶子', code: 'leaf' },
    ];
    const tree = convertToTreeData(items);
    expect(tree[0].children).toBeUndefined();
  });
});

// ==================== getAllKeys ====================

describe('getAllKeys', () => {
  it('获取所有节点 key', () => {
    const items = createPermissions();
    const keys = getAllKeys(items);

    expect(keys).toContain(1);
    expect(keys).toContain(2);
    expect(keys).toContain(3);
    expect(keys).toContain(4);
    expect(keys).toContain(5);
    expect(keys).toContain(6);
    expect(keys).toContain(10);
    expect(keys).toContain(11);
    expect(keys).toHaveLength(8);
  });

  it('空数据返回空数组', () => {
    expect(getAllKeys([])).toEqual([]);
    expect(getAllKeys()).toEqual([]);
  });
});

// ==================== getParentKeys ====================

describe('getParentKeys', () => {
  it('搜索叶子节点返回所有父级 key', () => {
    const items = createPermissions();
    const keys = getParentKeys(items, '查看用户');

    expect(keys).toContain(1); // 系统管理
    expect(keys).toContain(2); // 用户管理
    expect(keys).not.toContain(5); // 角色管理不应包含
  });

  it('按 code 搜索也匹配', () => {
    const items = createPermissions();
    const keys = getParentKeys(items, 'system:user:write');

    expect(keys).toContain(1);
    expect(keys).toContain(2);
  });

  it('无匹配时返回空', () => {
    const items = createPermissions();
    expect(getParentKeys(items, '不存在的权限')).toEqual([]);
  });

  it('搜索根节点返回空（无父级）', () => {
    const items = createPermissions();
    expect(getParentKeys(items, '系统管理')).toEqual([]);
  });
});

// ==================== getMatchedKeys ====================

describe('getMatchedKeys', () => {
  it('返回所有匹配节点的 key', () => {
    const items = createPermissions();
    const keys = getMatchedKeys(items, '用户');

    expect(keys).toContain(2); // 用户管理
    expect(keys).toContain(3); // 查看用户
    expect(keys).toContain(4); // 编辑用户
  });

  it('按 code 搜索匹配', () => {
    const items = createPermissions();
    const keys = getMatchedKeys(items, 'finance');

    expect(keys).toContain(10);
    expect(keys).toContain(11);
  });

  it('无匹配返回空', () => {
    const items = createPermissions();
    expect(getMatchedKeys(items, 'xyz')).toEqual([]);
  });

  it('大小写不敏感', () => {
    const items = createPermissions();
    const keys = getMatchedKeys(items, 'SYSTEM');
    expect(keys.length).toBeGreaterThan(0);
  });
});

// ==================== getModulePermissionIds ====================

describe('getModulePermissionIds', () => {
  it('获取模块下所有权限 ID（含子节点）', () => {
    const items = createPermissions();
    const ids = getModulePermissionIds(items);

    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).toHaveLength(8);
  });
});

// ==================== groupByModule ====================

describe('groupByModule', () => {
  it('按模块分组', () => {
    const items = createPermissions();
    const groups = groupByModule(items);

    expect(groups.has('system')).toBe(true);
    expect(groups.has('finance')).toBe(true);
    expect(groups.get('system')!.length).toBeGreaterThan(0);
    expect(groups.get('finance')!.length).toBeGreaterThan(0);
  });

  it('空数据返回空 Map', () => {
    expect(groupByModule([]).size).toBe(0);
    expect(groupByModule().size).toBe(0);
  });

  it('嵌套子节点也被分组', () => {
    const items: PermissionItem[] = [
      {
        id: 1, name: '系统', code: 'system', children: [
          { id: 2, name: '用户', code: 'system:user' },
        ],
      },
    ];
    const groups = groupByModule(items);
    const systemGroup = groups.get('system')!;
    expect(systemGroup).toHaveLength(2); // 系统 + 用户
  });
});
