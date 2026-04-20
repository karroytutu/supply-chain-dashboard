/**
 * 权限分配弹窗组件
 * 按模块分组展示权限，支持模块级快捷操作
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Input, Button, Space, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import ModuleGroup from './ModuleGroup';
import { groupByModule, getAllKeys } from '@/components/PermissionTree/utils';
import { assignRolePermissions } from '@/services/api/auth';
import type { PermissionItem } from '@/components/PermissionTree/types';
import styles from './PermissionAssignModal.less';

interface RoleItem {
  id: number;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  status: number;
  permissions: { id: number; code: string; name: string }[];
}

interface PermissionAssignModalProps {
  visible: boolean;
  role: RoleItem | null;
  permissionTree: PermissionItem[];
  onClose: () => void;
  onSuccess: () => void;
}

const PermissionAssignModal: React.FC<PermissionAssignModalProps> = ({
  visible,
  role,
  permissionTree = [],
  onClose,
  onSuccess,
}) => {
  const [checkedKeys, setCheckedKeys] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  // 初始化选中权限
  useEffect(() => {
    if (visible && role) {
      setCheckedKeys(role.permissions?.map(p => p.id) || []);
      setSearchValue('');
    }
  }, [visible, role]);

  // 按模块分组
  const moduleGroups = useMemo(() => {
    return groupByModule(permissionTree);
  }, [permissionTree]);

  // 所有权限ID
  const allPermissionIds = useMemo(() => {
    return getAllKeys(permissionTree).map(k => Number(k));
  }, [permissionTree]);

  // 全部选择
  const handleSelectAll = () => {
    setCheckedKeys(allPermissionIds);
  };

  // 全部取消
  const handleDeselectAll = () => {
    setCheckedKeys([]);
  };

  // 提交
  const handleOk = async () => {
    if (!role) return;

    setLoading(true);
    try {
      await assignRolePermissions(role.id, checkedKeys);
      message.success('权限分配成功');
      onSuccess();
      onClose();
    } catch (error: any) {
      message.error(error.message || '分配失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`分配权限 - ${role?.name || ''}`}
      open={visible}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      width={720}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <div className={styles.container}>
        {/* 搜索栏 */}
        <div className={styles.searchBar}>
          <Input
            placeholder="搜索权限名称或编码"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            allowClear
          />
        </div>

        {/* 全局操作栏 */}
        <div className={styles.actionBar}>
          <span className={styles.stats}>
            已选择 <strong>{checkedKeys.length}</strong> 项权限
          </span>
          <Space>
            <Button
              size="small"
              onClick={handleSelectAll}
              disabled={checkedKeys.length === allPermissionIds.length}
            >
              全部选择
            </Button>
            <Button
              size="small"
              onClick={handleDeselectAll}
              disabled={checkedKeys.length === 0}
            >
              全部取消
            </Button>
          </Space>
        </div>

        {/* 模块分组列表 */}
        <div className={styles.moduleList}>
          {Array.from(moduleGroups.entries()).map(([moduleCode, permissions]) => (
            <ModuleGroup
              key={moduleCode}
              moduleCode={moduleCode}
              permissions={permissions}
              checkedKeys={checkedKeys}
              onCheckChange={setCheckedKeys}
              searchValue={searchValue}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default PermissionAssignModal;
