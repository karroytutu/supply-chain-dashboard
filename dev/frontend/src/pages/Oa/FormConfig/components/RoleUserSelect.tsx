/**
 * 岗位 + 人员混合多选组件
 * @module pages/Oa/FormConfig/components/RoleUserSelect
 *
 * 用于表单管理页内联编辑，支持同时选择岗位和具体人员。
 * 岗位组使用静态列表，人员组使用远程搜索。
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Select, Tag, Spin } from 'antd';
import type { SelectProps } from 'antd';
import { searchHandoverUsers } from '@/services/api/oa';

interface RoleUserSelectProps {
  /** 可选岗位列表 */
  roles: Array<{ code: string; name: string }>;
  /** 已选岗位编码 */
  selectedRoles: string[];
  /** 已选用户ID */
  selectedUsers: number[];
  /** 变更回调 */
  onChange: (roles: string[], users: number[]) => void;
  /** 自动聚焦 */
  autoFocus?: boolean;
  /** 宽度 */
  style?: React.CSSProperties;
}

/** 值编码前缀 */
const ROLE_PREFIX = 'role:';
const USER_PREFIX = 'user:';

const RoleUserSelect: React.FC<RoleUserSelectProps> = ({
  roles,
  selectedRoles,
  selectedUsers,
  onChange,
  autoFocus = false,
  style,
}) => {
  const [userOptions, setUserOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  /** 已加载的用户 ID 缓存（避免重复搜索已知用户） */
  const loadedUserIdsRef = useRef<Set<number>>(new Set());

  // 合并当前选中值为统一编码
  const value = useMemo(() => {
    const vals: string[] = [];
    for (const r of selectedRoles) vals.push(`${ROLE_PREFIX}${r}`);
    for (const u of selectedUsers) vals.push(`${USER_PREFIX}${u}`);
    return vals;
  }, [selectedRoles, selectedUsers]);

  // 初始加载：将已选用户加入选项（避免 Tag 显示 ID 而非姓名）
  const initialUserLoaded = useRef(false);
  if (!initialUserLoaded.current && selectedUsers.length > 0) {
    initialUserLoaded.current = true;
    // 异步加载已选用户信息
    Promise.all(
      selectedUsers
        .filter(id => !loadedUserIdsRef.current.has(id))
        .map(id => searchHandoverUsers(String(id)).catch(() => []))
    ).then(results => {
      const allUsers = results.flat();
      for (const u of allUsers) loadedUserIdsRef.current.add(u.id);
      setUserOptions(prev => {
        const existingIds = new Set(prev.map(o => o.id));
        const newUsers = allUsers.filter(u => !existingIds.has(u.id));
        return [...prev, ...newUsers];
      });
    });
  }

  // 远程搜索用户（300ms 防抖，最小 2 字符）
  const handleSearch = useCallback((keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (keyword.trim().length < 2) return;

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const users = await searchHandoverUsers(keyword.trim());
        // 合并到选项列表（去重）
        setUserOptions(prev => {
          const existingIds = new Set(prev.map(o => o.id));
          const newUsers = users.filter(u => !existingIds.has(u.id));
          for (const u of users) loadedUserIdsRef.current.add(u.id);
          return [...prev, ...newUsers];
        });
      } catch {
        // 搜索失败忽略
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // 选择变更
  const handleChange = useCallback((vals: string[]) => {
    const newRoles: string[] = [];
    const newUsers: number[] = [];
    for (const v of vals) {
      if (v.startsWith(ROLE_PREFIX)) {
        newRoles.push(v.slice(ROLE_PREFIX.length));
      } else if (v.startsWith(USER_PREFIX)) {
        newUsers.push(Number(v.slice(USER_PREFIX.length)));
      }
    }
    onChange(newRoles, newUsers);
  }, [onChange]);

  // 构建选项列表
  const options: SelectProps['options'] = useMemo(() => {
    const roleOpts = roles.map(r => ({
      value: `${ROLE_PREFIX}${r.code}`,
      label: r.name,
    }));
    const userOpts = userOptions.map(u => ({
      value: `${USER_PREFIX}${u.id}`,
      label: u.name,
    }));
    return [
      { label: '按岗位', options: roleOpts },
      { label: '按人员（搜索添加）', options: userOpts },
    ];
  }, [roles, userOptions]);

  // 自定义 Tag 渲染
  const tagRender: SelectProps['tagRender'] = useCallback((props: any) => {
    const { value: val, closable, onClose } = props;
    if (val == null || typeof val !== 'string') {
      return <Tag closable={closable} onClose={onClose}>{String(val ?? '')}</Tag>;
    }
    const isRole = val.startsWith(ROLE_PREFIX);
    const code = isRole ? val.slice(ROLE_PREFIX.length) : val.slice(USER_PREFIX.length);
    // 查找显示名
    let displayName = code;
    if (isRole) {
      const role = roles.find(r => r.code === code);
      displayName = role?.name || code;
    } else {
      const user = userOptions.find(u => u.id === Number(code));
      displayName = user?.name || code;
    }
    return (
      <Tag
        color={isRole ? 'blue' : 'green'}
        closable={closable}
        onClose={onClose}
        style={{ marginRight: 3 }}
      >
        {displayName}
      </Tag>
    );
  }, [roles, userOptions]);

  return (
    <Select
      mode="multiple"
      value={value}
      onChange={handleChange}
      onSearch={handleSearch}
      options={options}
      tagRender={tagRender}
      filterOption={(input, option) => {
        // 本地过滤岗位选项（人员选项由远程搜索控制）
        if (!option?.value) return false;
        if (String(option.value).startsWith(USER_PREFIX)) return true; // 人员选项始终显示
        const label = String(option.label || '').toLowerCase();
        return label.includes(input.toLowerCase());
      }}
      showSearch
      autoFocus={autoFocus}
      style={{ minWidth: 240, ...style }}
      placeholder="选择岗位或搜索人员"
      suffixIcon={searching ? <Spin size="small" /> : undefined}
      onBlur={() => {
        // 搜索框失焦时不清空已有选项
      }}
    />
  );
};

export default RoleUserSelect;
