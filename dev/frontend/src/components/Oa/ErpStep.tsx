import React, { useState } from 'react';
import { Tag, Button, message, Spin } from 'antd';
import { RedoOutlined, LoadingOutlined } from '@ant-design/icons';
import type { ErpMeta } from '@/types/oa';
import { oaApi } from '@/services/api/oa';
import { ERP_STATUS_CONFIG } from './flow-types';
import styles from './ApprovalFlow.less';
import { getErrorMessage } from '../../utils/errorUtils';

export interface ErpStepProps {
  erpMeta: ErpMeta;
  instanceId?: number;
  /** 重试成功后的回调（用于触发数据刷新/轮询） */
  onRetrySuccess?: () => void;
}

const ErpStep: React.FC<ErpStepProps> = ({ erpMeta, instanceId, onRetrySuccess }) => {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!instanceId) return;
    setRetrying(true);
    try {
      await oaApi.retryErpOperation(instanceId);
      message.success('重试已触发，系统处理中...');
      onRetrySuccess?.();
    } catch (err) {
      message.error(getErrorMessage(err) || '重试失败');
    } finally {
      setRetrying(false);
    }
  };

  // 处理中状态：显示加载指示
  if (erpMeta.status === 'processing') {
    return (
      <div className={styles.erpStep}>
        <div className={styles.erpProcessingSection}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />
          <span className={styles.erpProcessingText}>系统处理中，请稍候...</span>
        </div>
      </div>
    );
  }

  const statusConfig = ERP_STATUS_CONFIG[erpMeta.status] || { color: 'default', text: erpMeta.status };

  return (
    <div className={styles.erpStep}>
      <div className={styles.erpInfoRow}>
        <span>状态: <Tag color={statusConfig.color}>{statusConfig.text}</Tag></span>
        {erpMeta.applicationNo && <span>申请编号: {erpMeta.applicationNo}</span>}
      </div>
      {erpMeta.retries > 0 && (
        <div className={styles.erpInfoRow}>
          <span>重试次数: {erpMeta.retries}</span>
        </div>
      )}
      {erpMeta.status === 'erp_failed' && (
        <div className={styles.erpErrorSection}>
          <div className={styles.erpErrorMsg}>
            {erpMeta.requestLog?.error ? String(erpMeta.requestLog.error) : '系统处理失败，请重试'}
          </div>
          {instanceId && (
            <Button
              size="small"
              danger
              icon={<RedoOutlined />}
              loading={retrying}
              onClick={handleRetry}
              className={styles.erpRetryBtn}
            >
              重试
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default ErpStep;
