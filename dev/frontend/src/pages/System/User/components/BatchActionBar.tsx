/**
 * 批量操作栏组件
 */
import React from 'react';
import { Checkbox, Button, Space, Modal } from 'antd';
import { CheckOutlined, StopOutlined, UserSwitchOutlined } from '@ant-design/icons';
import styles from '../index.less';

interface BatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  checked: boolean;
  onCheckChange: (checked: boolean) => void;
  onBatchEnable: () => void;
  onBatchDisable: () => void;
  onBatchAssignRoles: () => void;
  loading: boolean;
}

const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  totalCount,
  checked,
  onCheckChange,
  onBatchEnable,
  onBatchDisable,
  onBatchAssignRoles,
  loading,
}) => {
  const handleBatchDisable = () => {
    Modal.confirm({
      title: '确认批量禁用',
      content: `确定要禁用选中的 ${selectedCount} 个用户吗？禁用后这些用户将无法登录系统。`,
      okText: '确认禁用',
      okButtonProps: { danger: true },
      onOk: onBatchDisable,
    });
  };

  return (
    <div className={styles.batchActionBar}>
      <Space size="middle">
        <Checkbox
          checked={checked}
          onChange={e => onCheckChange(e.target.checked)}
        >
          全选
        </Checkbox>
        {selectedCount > 0 && (
          <span className={styles.selectedInfo}>
            已选择 {selectedCount} 项
          </span>
        )}
      </Space>

      <Space size="small">
        <Button
          type="primary"
          icon={<CheckOutlined />}
          disabled={selectedCount === 0}
          loading={loading}
          onClick={onBatchEnable}
        >
          批量启用
        </Button>
        <Button
          danger
          icon={<StopOutlined />}
          disabled={selectedCount === 0}
          loading={loading}
          onClick={handleBatchDisable}
        >
          批量禁用
        </Button>
        <Button
          icon={<UserSwitchOutlined />}
          disabled={selectedCount === 0}
          loading={loading}
          onClick={onBatchAssignRoles}
        >
          批量分配角色
        </Button>
      </Space>
    </div>
  );
};

export { BatchActionBar };
export default BatchActionBar;
