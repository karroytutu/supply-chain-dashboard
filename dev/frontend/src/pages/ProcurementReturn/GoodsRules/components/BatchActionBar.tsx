/**
 * 批量操作栏组件
 */
import React from 'react';
import { Button, Space, Alert } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import styles from '../index.less';

interface BatchActionBarProps {
  selectedCount: number;
  onBatchSet: (canReturn: boolean) => void;
  loading: boolean;
}

const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  onBatchSet,
  loading,
}) => {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className={styles.batchBar}>
      <Alert
        type="info"
        showIcon
        message={
          <div className={styles.batchContent}>
            <span className={styles.selectedInfo}>
              已选中 {selectedCount} 条记录
            </span>
            <Space>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => onBatchSet(true)}
                loading={loading}
              >
                批量设为可采购退货
              </Button>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => onBatchSet(false)}
                loading={loading}
              >
                批量设为不可采购退货
              </Button>
            </Space>
          </div>
        }
      />
    </div>
  );
};

export { BatchActionBar };
export default BatchActionBar;
