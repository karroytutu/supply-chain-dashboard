/**
 * 用户搜索筛选组件
 */
import React from 'react';
import { Input, Select, Button, Space } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import DeptTreeSelect from '@/components/DeptTreeSelect';
import { useIsMobile } from '@/hooks/useMobileDetect';
import { MobileSelect } from '@/components/Mobile';
import type { UserFilters as UserFiltersType, RoleInfo } from '../types';
import styles from '../index.less';

interface UserFiltersProps {
  filters: UserFiltersType;
  roles: RoleInfo[];
  onFilterChange: (filters: Partial<UserFiltersType>) => void;
  onSearch: () => void;
  onReset: () => void;
}

const UserFilters: React.FC<UserFiltersProps> = ({
  filters,
  roles = [],
  onFilterChange,
  onSearch,
  onReset,
}) => {
  const isMobile = useIsMobile();
  return (
    <div className={styles.toolbar}>
      <Space wrap size="middle">
        <Input
          placeholder="搜索用户名/手机号/邮箱"
          value={filters.keyword}
          onChange={e => onFilterChange({ keyword: e.target.value })}
          onPressEnter={onSearch}
          style={{ width: isMobile ? '100%' : 220 }}
          prefix={<SearchOutlined />}
          allowClear
        />
        {isMobile ? (
          <MobileSelect
            value={filters.roleId}
            onChange={roleId => onFilterChange({ roleId: roleId as number | undefined })}
            options={roles.map(r => ({ label: r.name, value: r.id }))}
            placeholder="角色"
            allowClear
            title="角色"
            style={{ width: '100%' }}
          />
        ) : (
          <Select
            placeholder="角色"
            value={filters.roleId}
            onChange={roleId => onFilterChange({ roleId })}
            style={{ width: 150 }}
            allowClear
            options={roles.map(r => ({ label: r.name, value: r.id }))}
          />
        )}
        <DeptTreeSelect
          value={filters.departmentId}
          onChange={departmentId => onFilterChange({ departmentId })}
          placeholder="选择部门"
          style={{ width: isMobile ? '100%' : 220 }}
        />
        {isMobile ? (
          <MobileSelect
            value={filters.status}
            onChange={status => onFilterChange({ status: status as number | undefined })}
            options={[
              { label: '正常', value: 1 },
              { label: '禁用', value: 0 },
            ]}
            placeholder="状态"
            allowClear
            title="状态"
            style={{ width: '100%' }}
          />
        ) : (
          <Select
            placeholder="状态"
            value={filters.status}
            onChange={status => onFilterChange({ status })}
            style={{ width: 100 }}
            allowClear
            options={[
              { label: '正常', value: 1 },
              { label: '禁用', value: 0 },
            ]}
          />
        )}
        <Button type="primary" onClick={onSearch}>
          搜索
        </Button>
        <Button onClick={onReset}>
          <ReloadOutlined /> 重置
        </Button>
      </Space>
    </div>
  );
};

export { UserFilters };
export default UserFilters;
