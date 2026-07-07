import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import type { ApprovalDetail, ApprovalNode, ApprovalAction } from '@/types/oa';
import { oaApi } from '@/services/api/oa';

/** 详情加载失败类型 */
export type DetailErrorType = 'forbidden' | 'not_found' | 'server_error' | null;

/** auto 节点轮询间隔（毫秒） */
const AUTO_NODE_POLL_INTERVAL = 2000;

export interface ApprovalDetailData {
  loading: boolean;
  detail: ApprovalDetail | null;
  nodes: ApprovalNode[];
  actions: ApprovalAction[];
  errorType: DetailErrorType;
  loadDetail: () => Promise<void>;
  /** 静默刷新详情（不触发 loading 状态，避免全屏闪屏） */
  silentRefresh: () => Promise<void>;
}

export function useApprovalDetailData(id: string | undefined): ApprovalDetailData {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [nodes, setNodes] = useState<ApprovalNode[]>([]);
  const [actions, setActions] = useState<ApprovalAction[]>([]);
  const [errorType, setErrorType] = useState<DetailErrorType>(null);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErrorType(null);
    try {
      const detailRes = await oaApi.getDetail(parseInt(id));
      const detailData = detailRes.data;
      setDetail(detailData);
      setNodes(detailData.nodes || []);
      setActions(detailData.actions || []);
    } catch (error: any) {
      if (error?.status === 403) {
        setErrorType('forbidden');
      } else if (error?.status === 404) {
        setErrorType('not_found');
      } else {
        setErrorType('server_error');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const silentRefresh = useCallback(async () => {
    if (!id) return;
    try {
      const detailRes = await oaApi.getDetail(parseInt(id));
      const detailData = detailRes.data;
      setDetail(detailData);
      setNodes(detailData.nodes || []);
      setActions(detailData.actions || []);
    } catch {
      // 静默刷新失败不中断用户操作
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // auto 节点状态轮询
  const pollFetchIdRef = useRef(0);
  useEffect(() => {
    if (!id || !detail || detail.status !== 'processing') return;

    const fetchId = ++pollFetchIdRef.current;
    const timer = setInterval(async () => {
      if (fetchId !== pollFetchIdRef.current) return;
      try {
        const detailRes = await oaApi.getDetail(parseInt(id as string));
        if (fetchId !== pollFetchIdRef.current) return;
        const detailData = detailRes.data;
        setDetail(detailData);
        setNodes(detailData.nodes || []);
        setActions(detailData.actions || []);
        if (detailData.status !== 'processing') {
          clearInterval(timer);
          if (detailData.status === 'approved') {
            message.success('系统处理完成');
          } else if (detailData.status === 'erp_failed') {
            message.error('系统处理失败，请点击重试');
          }
        }
      } catch {
        // 轮询失败静默忽略
      }
    }, AUTO_NODE_POLL_INTERVAL);

    return () => {
      clearInterval(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
      pollFetchIdRef.current++;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [id, detail?.status]);

  return { loading, detail, nodes, actions, errorType, loadDetail, silentRefresh };
}
