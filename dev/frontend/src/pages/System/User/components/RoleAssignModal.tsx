/**
 * 角色分配弹窗组件
 */
import React, { useState, useEffect } from 'react';
import { Modal, Checkbox, Tag } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import type { UserItem, RoleInfo } from '../types';
import styles from '../index.less';

interface RoleAssignModalProps {
  visible: boolean;
  user: UserItem | null;
  users?: UserItem[]; // 批量分配时使用
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

  const handleRoleToggle = (roleId: number) => {
    setSelectedRoleIds(prev => 
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  const handleConfirm = () => {
    onConfirm(selectedRoleIds);
  };

  const getTitle = () => {
    if (mode === 'batch') {
      return `批量分配角色 - 已选择 ${users?.length || 0} 个用户`;
    }
    return `分配角色 - ${user?.name || ''}`;
  };

  return (
    <Modal
      title={getTitle()}
      open={visible}
      onOk={handleConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      width={480}
      okText="确认分配"
      cancelText="取消"
    >
      <div className={styles.roleList}>
        <p className={styles.roleHint}>
          {mode === 'batch' 
            ? '选择要分配给这些用户的角色：' 
            : '选择用户的角色（可多选）：'}
        </p>
        {roles.map(role => {
          const isSelected = selectedRoleIds.includes(role.id);
          return (
            <div
              key={role.id}
              className={`${styles.roleCard} ${isSelected ? styles.roleCardSelected : ''}`}
              onClick={() => handleRoleToggle(role.id)}
            >
              <div className={styles.roleCardHeader}>
                {isSelected ? (
                  <CheckCircleOutlined style={{ color: '#1890ff', fontSize: 18 }} />
                ) : (
                  <div className={styles.roleCardCheckbox} />
                )}
                <span className={styles.roleCardTitle}>{role.name}</span>
                {role.is_system && (
                  <Tag color="red" style={{ marginLeft: 8 }}>系统角色</Tag>
                )}
              </div>
              <div className={styles.roleCardDesc}>
                <Tag>{role.code}</Tag>
                {role.description && (
                  <span style={{ marginLeft: 8 }}>{role.description}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

export { RoleAssignModal };
export default RoleAssignModal;
