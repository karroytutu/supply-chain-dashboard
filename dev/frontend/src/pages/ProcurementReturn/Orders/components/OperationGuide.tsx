/**
 * 操作引导组件
 * 根据当前筛选状态显示对应的批量操作入口
 */
import React from 'react';
import { Button, Space, Alert } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined, RollbackOutlined } from '@ant-design/icons';
import type { ReturnOrderStatus } from '@/types/procurement-return';
import styles from '../index.less';

interface OperationGuideProps {
  activeStatus?: ReturnOrderStatus;
  selectedCount: number;
  onBatchConfirm?: (canReturn: boolean) => void;
  loading?: boolean;
}

const OperationGuide: React.FC<OperationGuideProps> = ({
  activeStatus,
  selectedCount,
  onBatchConfirm,
  loading,
}) => {
  // 根据状态返回对应的操作引导
  const renderGuide = () => {
    switch (activeStatus) {
      case 'pending_confirm':
        return (
          <Alert
            type="info"
            showIcon
            message={
              <div className={styles.operationGuideContent}>
                <span>当前状态：<strong>待确认</strong> — 请选择退货单后确认是否可退货</span>
                <Space>
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    size="small"
                    disabled={selectedCount === 0}
                    loading={loading}
                    onClick={() => onBatchConfirm?.(true)}
                  >
                    批量确认可退货 ({selectedCount})
                  </Button>
                  <Button
                    danger
                    icon={<CloseOutlined />}
                    size="small"
                    disabled={selectedCount === 0}
                    loading={loading}
                    onClick={() => onBatchConfirm?.(false)}
                  >
                    批量确认不可退货 ({selectedCount})
                  </Button>
                </Space>
              </div>
            }
          />
        );

      case 'pending_erp_fill':
        return (
          <Alert
            type="warning"
            showIcon
            message={
              <div className={styles.operationGuideContent}>
                <span>当前状态：<strong>待填ERP</strong> — 请在表格行中填写ERP退货单号</span>
                <span className={styles.operationGuideHint}>
                  <EditOutlined /> 点击操作列的编辑按钮填写ERP单号
                </span>
              </div>
            }
          />
        );

      case 'pending_warehouse_execute':
        return (
          <Alert
            type="warning"
            showIcon
            message={
              <div className={styles.operationGuideContent}>
                <span>当前状态：<strong>待仓储退货</strong> — 请在表格行中执行退货操作</span>
                <span className={styles.operationGuideHint}>
                  确认实际退货后点击操作列的执行按钮
                </span>
              </div>
            }
          />
        );

      case 'pending_marketing_sale':
        return (
          <Alert
            type="info"
            showIcon
            message={
              <div className={styles.operationGuideContent}>
                <span>当前状态：<strong>待营销销售</strong> — 退货商品等待营销处理</span>
              </div>
            }
          />
        );

      case 'completed':
        return (
          <Alert
            type="success"
            showIcon
            message={
              <div className={styles.operationGuideContent}>
                <span>当前状态：<strong>已完成</strong> — 退货流程已完成</span>
              </div>
            }
          />
        );

      case 'cancelled':
        return (
          <Alert
            type="error"
            showIcon
            message={
              <div className={styles.operationGuideContent}>
                <span>当前状态：<strong>已取消</strong> — 退货单已取消</span>
              </div>
            }
          />
        );

      default:
        // 无筛选状态，显示总体提示
        return (
          <Alert
            type="info"
            showIcon
            message={
              <div className={styles.operationGuideContent}>
                <span>点击上方统计卡片筛选对应状态的退货单</span>
                <span className={styles.operationGuideHint}>
                  共选中 {selectedCount} 条记录
                </span>
              </div>
            }
          />
        );
    }
  };

  return (
    <div className={styles.operationGuide}>
      {renderGuide()}
    </div>
  );
};

export { OperationGuide };
export default OperationGuide;
