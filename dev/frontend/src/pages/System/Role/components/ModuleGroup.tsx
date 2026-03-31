/**
 * 权限模块分组组件
 * 支持模块级别的全选/全不选操作
 */
import React, { useMemo } from 'react';
import { Collapse, Button, Space, Tag, Checkbox } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import type { PermissionItem } from '@/components/PermissionTree/types';
import { getModulePermissionIds } from '@/components/PermissionTree/utils';
import styles from './ModuleGroup.less';

// 模块名称映射
const moduleNames: Record<string, string> = {
  system: '系统管理',
  finance: '财务管理',
  procurement: '采购管理',
  return: '退货管理',
  'goods-rules': '退货规则',
  strategic: '战略商品',
};

// 模块颜色映射
const moduleColors: Record<string, string> = {
  system: '#1677ff',
  finance: '#52c41a',
  procurement: '#fa8c16',
  return: '#13c2c2',
  'goods-rules': '#722ed1',
  strategic: '#eb2f96',
};

interface ModuleGroupProps {
  moduleCode: string;
  permissions: PermissionItem[];
  checkedKeys: number[];
  onCheckChange: (keys: number[]) => void;
  searchValue?: string;
}

const ModuleGroup: React.FC<ModuleGroupProps> = ({
  moduleCode,
  permissions,
  checkedKeys,
  onCheckChange,
  searchValue = '',
}) => {
  // 获取模块下所有权限ID
  const allIds = useMemo(() => getModulePermissionIds(permissions), [permissions]);
  
  // 计算选中统计
  const selectedCount = allIds.filter(id => checkedKeys.includes(id)).length;
  const totalCount = allIds.length;

  // 全选
  const handleSelectAll = () => {
    const newKeys = [...new Set([...checkedKeys, ...allIds])];
    onCheckChange(newKeys);
  };

  // 全不选
  const handleDeselectAll = () => {
    const newKeys = checkedKeys.filter(id => !allIds.includes(id));
    onCheckChange(newKeys);
  };

  // 切换单个权限
  const handleToggle = (id: number, checked: boolean) => {
    if (checked) {
      onCheckChange([...checkedKeys, id]);
    } else {
      onCheckChange(checkedKeys.filter(k => k !== id));
    }
  };

  // 渲染权限项
  const renderPermissionItem = (item: PermissionItem, level: number = 0) => {
    const isChecked = checkedKeys.includes(item.id);
    const indentStyle = { paddingLeft: level * 20 };
    
    // 搜索高亮
    const highlightText = (text: string) => {
      if (!searchValue) return text;
      const idx = text.toLowerCase().indexOf(searchValue.toLowerCase());
      if (idx === -1) return text;
      return (
        <>
          {text.slice(0, idx)}
          <span className={styles.highlight}>{text.slice(idx, idx + searchValue.length)}</span>
          {text.slice(idx + searchValue.length)}
        </>
      );
    };

    return (
      <div key={item.id}>
        <div className={styles.permissionRow} style={indentStyle}>
          <Checkbox
            checked={isChecked}
            onChange={e => handleToggle(item.id, e.target.checked)}
          />
          <span className={styles.permissionName}>{highlightText(item.name)}</span>
          <span className={styles.permissionCode}>{highlightText(item.code)}</span>
        </div>
        {item.children?.map(child => renderPermissionItem(child, level + 1))}
      </div>
    );
  };

  const color = moduleColors[moduleCode] || '#666';
  const name = moduleNames[moduleCode] || moduleCode;

  return (
    <div className={styles.moduleGroup}>
      <Collapse
        defaultActiveKey={[moduleCode]}
        items={[{
          key: moduleCode,
          label: (
            <div className={styles.moduleHeader}>
              <Space>
                <Tag color={color}>{name}</Tag>
                <span className={styles.stats}>
                  已选 {selectedCount}/{totalCount}
                </span>
              </Space>
              <Space onClick={e => e.stopPropagation()}>
                <Button
                  size="small"
                  onClick={handleSelectAll}
                  disabled={selectedCount === totalCount}
                >
                  全选
                </Button>
                <Button
                  size="small"
                  onClick={handleDeselectAll}
                  disabled={selectedCount === 0}
                >
                  全不选
                </Button>
              </Space>
            </div>
          ),
          children: (
            <div className={styles.permissionList}>
              {permissions.map(item => renderPermissionItem(item))}
            </div>
          ),
        }]}
      />
    </div>
  );
};

export default ModuleGroup;
