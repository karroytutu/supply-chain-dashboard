/**
 * 角色分配弹窗组件
 * 使用 SelectionCard 公共组件
 */
import React, { useState, useEffect } from 'react';
import { Modal } from 'antd';
import SelectionCard from '@/components/SelectionCard';
import type { UserItem, RoleInfo } from '../types';

interface RoleAssignModalProps {
  visible: boolean;
  user: UserItem | null;
  users?: UserItem[];
  roles: RoleInfo[];
  onConfirm: (roleIds: number[]) => void;
  onCancel: () => void;
  loading: boolean;
  mode?: 'single' | 'batch';
}

const RoleAssignModal: React.FC<RoleAssignModalProps> = ({
  visible,
  user,
  users,
  roles,
  onConfirm,
  onCancel,
  loading,
  mode = 'single',
}) => {
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);

  // 初始化选中角色
  useEffect(() => {
    if (visible) {
      if (mode === 'single' && user) {
        setSelectedRoleIds(user.roles?.map(r => r.id) || []);
      } else {
        setSelectedRoleIds([]);
      }
    }
  }, [visible, user, mode]);

  const handleConfirm = () => {
    onConfirm(selectedRoleIds);
  };

  const getTitle = () => {
    if (mode === 'batch') {
      return `批量分配角色 - 已选择 ${users?.length || 0} 个用户`;
    }
    return `分配角色 - ${user?.name || ''}`;
  };

  const getHint = () => {
    return mode === 'batch'
      ? '选择要分配给这些用户的角色：'
      : '选择用户的角色（可多选）：';
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
      <p style={{ marginBottom: 12, color: '#8c8c8c', fontSize: 13 }}>{getHint()}</p>
      <SelectionCard
        dataSource={roles}
        selectedKeys={selectedRoleIds}
        onChange={keys => setSelectedRoleIds(keys as number[])}
        config={{
          rowKey: 'id',
          titleKey: 'name',
          descriptionKey: 'description',
          codeKey: 'code',
          tagKey: 'is_system',
          disabledKey: item => item.is_system === true,
          disabledTooltip: '系统角色不可修改，由系统自动分配',
          columns: 2,
        }}
      />
    </Modal>
  );
};

export { RoleAssignModal };
export default RoleAssignModal;
