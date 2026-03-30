/**
 * 批量操作栏组件
 */
import React from 'react';
import { Checkbox, Button, Space } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import styles from '../index.less';

interface BatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  checked: boolean;
  onCheckChange: (checked: boolean) => void;
  onBatchConfirm: (canReturn: boolean) => void;
  loading: boolean;
}

const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  totalCount,
  checked,
  onCheckChange,
  onBatchConfirm,
  loading,
}) => {
  return (
    <div className={styles.batchActionBar}>
      <Space size="middle">
        <Checkbox
          checked={checked}
          onChange={(e) => onCheckChange(e.target.checked)}
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
          onClick={() => onBatchConfirm(true)}
        >
          批量确认可退货
        </Button>
        <Button
          danger
          icon={<CloseOutlined />}
          disabled={selectedCount === 0}
          loading={loading}
          onClick={() => onBatchConfirm(false)}
        >
          批量确认不可退货
        </Button>
      </Space>
    </div>
  );
};

export { BatchActionBar };
export default BatchActionBar;
