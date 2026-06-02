import React, { useState } from 'react';
import { Tag, Button, message } from 'antd';
import { CloseCircleOutlined, LoadingOutlined, RedoOutlined, SettingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ErpMeta } from '@/types/oa';
import { oaApi } from '@/services/api/oa';
import { ERP_STATUS_CONFIG } from './flow-types';
import styles from './ApprovalFlow.less';

/** 获取 ERP 节点图标 */
function getErpStepIcon(status: string) {
  const iconStyle: React.CSSProperties = { fontSize: 14 };
  if (status === 'erp_failed') return <CloseCircleOutlined style={{ ...iconStyle, color: '#f5222d' }} />;
  if (['processing', 'paying', 'purchasing', 'storing'].includes(status)) {
    return <LoadingOutlined style={{ ...iconStyle, color: '#722ed1' }} spin />;
  }
  if (['completed', 'erp_completed'].includes(status)) return <CheckCircleOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
  return <SettingOutlined style={{ ...iconStyle, color: '#722ed1' }} />;
}

export { getErpStepIcon };

const ErpStep: React.FC<{ erpMeta: ErpMeta; instanceId?: number }> = ({ erpMeta, instanceId }) => {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!instanceId) return;
    setRetrying(true);
    try {
      await oaApi.retryErpOperation(instanceId);
      message.success('ERP重试已触发，请稍后刷新查看');
    } catch (err: any) {
      message.error(err.message || '重试失败');
    } finally {
      setRetrying(false);
    }
  };

  const statusConfig = ERP_STATUS_CONFIG[erpMeta.status] || { color: 'default', text: erpMeta.status };

  return (
    <div className={styles.erpStep}>
      <div className={styles.erpInfoRow}>
        <span>状态: <Tag color={statusConfig.color}>{statusConfig.text}</Tag></span>
        <span>申请编号: {erpMeta.applicationNo || '-'}</span>
      </div>
      {erpMeta.retries > 0 && (
        <div className={styles.erpInfoRow}>
          <span>重试次数: {erpMeta.retries}</span>
        </div>
      )}
      {erpMeta.status === 'erp_failed' && (
        <div className={styles.erpErrorSection}>
          <div className={styles.erpErrorMsg}>
            {erpMeta.requestLog?.error ? String(erpMeta.requestLog.error) : '请点击重试按钮重新处理'}
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
