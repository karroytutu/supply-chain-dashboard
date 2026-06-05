/**
 * 流程中心 - 详情面板（薄包装器）
 * 内部加载详情数据 + 使用共享 useApprovalActions + 渲染共享 ApprovalDetailContent
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Empty, Result, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { ApprovalDetail, ViewMode } from '@/types/oa';
import { oaApi } from '@/services/api/oa';
import { useApprovalActions } from '@/components/Oa/hooks/useApprovalActions';
import { ApprovalDetailContent } from '@/components/Oa';
import { usePermission } from '@/hooks/usePermission';
import { createLogger } from '../../../../utils/logger';
import styles from '../index.less';

const log = createLogger('OaCenter');

interface ApprovalDetailPanelProps {
  selectedId: number | null;
  viewMode: ViewMode;
  onActionComplete: (instanceId: number) => Promise<void>;
  onWithdrawComplete: () => Promise<void>;
  isMobile?: boolean;
  onBack?: () => void;
}

const ApprovalDetailPanel: React.FC<ApprovalDetailPanelProps> = ({
  selectedId, viewMode, onActionComplete, onWithdrawComplete, isMobile, onBack,
}) => {
  const { currentUser } = usePermission();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    setLoadError(false);
    try {
      const res = await oaApi.getDetail(id);
      setDetail(res.data);
    } catch (error) {
      log.error('加载详情失败:', error);
      setLoadError(true);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [selectedId]);

  const nodes = detail?.nodes || [];

  // W6: 用 useCallback 稳定引用，避免每次渲染创建新函数导致下游重渲染
  const handleActionCompleteCb = useCallback(() => {
    if (selectedId) onActionComplete(selectedId);
  }, [selectedId, onActionComplete]);

  const actionState = useApprovalActions({
    instanceId: selectedId ?? undefined,
    detail,
    nodes,
    onActionComplete: selectedId ? handleActionCompleteCb : undefined,
    onWithdrawComplete,
  });

  if (detailLoading) {
    return <div className={styles.detailPanel}><div className={styles.loadingContainer}><Spin /></div></div>;
  }

  if (!detail) {
    if (loadError && selectedId) {
      return (
        <div className={styles.detailPanel}>
          <Result
            status="error"
            title="加载失败"
            extra={<Button onClick={() => loadDetail(selectedId)}>重试</Button>}
          />
        </div>
      );
    }
    return <div className={styles.detailPanel}><Empty description="请选择流程查看详情" /></div>;
  }

  // 根据 viewMode 计算 canOperate/canWithdraw 覆盖值
  const currentNode = detail.nodes.find((n) => n.nodeOrder === detail.currentNodeOrder);
  const isCurrentApprover = currentNode?.assignedUserId === currentUser?.id;
  const isApplicant = detail.applicantId === currentUser?.id;

  const canOperate = viewMode === 'pending' && detail.status === 'pending' && isCurrentApprover;
  const canWithdraw = viewMode === 'my' && detail.status === 'pending' && isApplicant;

  return (
    <div className={styles.detailPanel}>
      {isMobile && (
        <div className={styles.mobileBackBar}>
          <ArrowLeftOutlined onClick={onBack} style={{ fontSize: 16, cursor: 'pointer' }} />
          <span className={styles.mobileBackTitle}>{detail.formTypeName}</span>
        </div>
      )}
      <div className={styles.detailScroll}>
        <ApprovalDetailContent
          detail={detail}
          actionState={actionState}
          formLayout="list"
          canOperateOverride={canOperate}
          canWithdrawOverride={canWithdraw}
        />
      </div>
    </div>
  );
};

export default ApprovalDetailPanel;
