/**
 * 角色分配弹窗组件
 * 使用 Ant Design Transfer 穿梭框，左右分栏清晰区分已分配/未分配角色
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Transfer } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { usePermission } from '@/hooks/usePermission';
import type { UserItem, RoleInfo } from '../types';
import type { TransferProps } from 'antd';

interface RoleAssignModalProps {
  visible: boolean;
  user: UserItem | null;
  roles: RoleInfo[];
  onConfirm: (roleIds: number[]) => void;
  onCancel: () => void;
  loading: boolean;
}

/** Transfer 数据项类型（key 必须为 string） */
interface RoleTransferItem {
  key: string;
  title: string;
  description?: string;
  disabled: boolean;
  isSystem?: boolean;
}

const RoleAssignModal: React.FC<RoleAssignModalProps> = ({
  visible,
  user,
  roles,
  onConfirm,
  onCancel,
  loading,
}) => {
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const { hasRole } = usePermission();
  const isAdmin = hasRole('admin');

  // 构建 Transfer 数据源：key 为 string 类型的角色 ID
  const dataSource: RoleTransferItem[] = useMemo(
    () =>
      roles.map(r => ({
        key: String(r.id),
        title: r.name,
        description: r.description,
        disabled: !isAdmin && r.isSystem === true,
        isSystem: r.isSystem,
      })),
    [roles, isAdmin],
  );

  // 初始化已分配角色（打开弹窗时从用户当前角色提取）
  useEffect(() => {
    if (visible) {
      setTargetKeys(user?.roles?.map(r => String(r.id)) || []);
    }
  }, [visible, user]);

  const handleChange: TransferProps<RoleTransferItem>['onChange'] = (nextTargetKeys) => {
    setTargetKeys(nextTargetKeys as string[]);
  };

  const handleConfirm = () => {
    // 将 string key 转回 number ID
    onConfirm(targetKeys.map(Number));
  };

  // 自定义每行渲染：角色名 + 系统角色时显示锁图标
  const renderItem = (item: RoleTransferItem) => (
    <span>
      {item.title}
      {item.isSystem && (
        <LockOutlined style={{ marginLeft: 6, color: '#faad14', fontSize: 12 }} />
      )}
    </span>
  );

  // 搜索过滤：按角色名匹配
  const filterOption = (inputValue: string, option: RoleTransferItem) =>
    option.title.includes(inputValue);

  return (
    <Modal
      title={`分配角色 - ${user?.name || ''}`}
      open={visible}
      onOk={handleConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      width={560}
      okText="确认分配"
      cancelText="取消"
      destroyOnClose
    >
      <Transfer
        dataSource={dataSource}
        targetKeys={targetKeys}
        onChange={handleChange}
        render={renderItem}
        showSearch
        filterOption={filterOption}
        listStyle={{ width: 220, height: 300 }}
        titles={['可选角色', '已分配']}
        locale={{
          itemUnit: '个角色',
          itemsUnit: '个角色',
          searchPlaceholder: '搜索角色',
          notFoundContent: '无角色',
        }}
      />
    </Modal>
  );
};

export { RoleAssignModal };
export default RoleAssignModal;
