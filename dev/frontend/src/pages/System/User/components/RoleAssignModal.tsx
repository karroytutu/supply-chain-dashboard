/**
 * 角色分配弹窗组件
 * 使用 SelectionCard 公共组件
 */
import React, { useState, useEffect } from 'react';
import { Modal } from 'antd';
import SelectionCard from '@/components/SelectionCard';
import { usePermission } from '@/hooks/usePermission';
import type { UserItem, RoleInfo } from '../types';

interface RoleAssignModalProps {
  visible: boolean;
  user: UserItem | null;
  roles: RoleInfo[];
  onConfirm: (roleIds: number[]) => void;
  onCancel: () => void;
  loading: boolean;
}

const RoleAssignModal: React.FC<RoleAssignModalProps> = ({
  visible,
  user,
  roles,
  onConfirm,
  onCancel,
  loading,
}) => {
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const { hasRole } = usePermission();
  const isAdmin = hasRole('admin');

  // 初始化选中角色（取用户的所有角色）
  useEffect(() => {
    if (visible) {
      setSelectedRoleIds(user?.roles?.map(r => r.id) || []);
    }
  }, [visible, user]);

  const handleConfirm = () => {
    onConfirm(selectedRoleIds);
  };

  const getTitle = () => {
    return `分配角色 - ${user?.name || ''}`;
  };

  return (
    <Modal
      title={getTitle()}
      open={visible}
      onOk={handleConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      width={520}
      okText="确认分配"
      cancelText="取消"
      destroyOnClose
    >
      <p style={{ marginBottom: 12, color: '#8c8c8c', fontSize: 13 }}>选择用户的角色（可多选）：</p>
      <SelectionCard
        dataSource={roles}
        selectedKeys={selectedRoleIds}
        onChange={keys => setSelectedRoleIds(keys as number[])}
        config={{
          rowKey: 'id',
          titleKey: 'name',
          descriptionKey: 'description',
          codeKey: 'code',
          tagKey: 'isSystem',
          mode: 'multiple',
          disabledKey: item => !isAdmin && item.isSystem === true,
          disabledTooltip: '系统角色仅管理员可分配',
          columns: 2,
        }}
      />
    </Modal>
  );
};

export { RoleAssignModal };
export default RoleAssignModal;
