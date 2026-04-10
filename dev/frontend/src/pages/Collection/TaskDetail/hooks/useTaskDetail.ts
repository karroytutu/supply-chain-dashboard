/**
 * 任务详情数据管理 Hook
 * 获取任务信息、欠款明细、操作历史、法律进展，管理选中状态和弹窗状态
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getCollectionTaskById,
  getCollectionTaskDetails,
  getCollectionTaskActions,
  getLegalProgress,
} from '@/services/api/ar-collection';
import type {
  CollectionTask,
  CollectionDetail,
  CollectionAction,
  LegalProgress,
} from '@/types/ar-collection';

/** 弹窗类型 */
export type ModalType =
  | 'verify'
  | 'extension'
  | 'difference'
  | 'escalate'
  | 'confirmVerify'
  | 'resolveDifference'
  | 'sendNotice'
  | 'lawsuit'
  | 'updateLegalProgress'
  | null;

interface UseTaskDetailReturn {
  /** 任务信息 */
  task: CollectionTask | null;
  /** 欠款明细列表 */
  details: CollectionDetail[];
  /** 操作历史 */
  actions: CollectionAction[];
  /** 法律催收进展 */
  legalProgress: LegalProgress[];
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 已选明细 ID 列表 */
  selectedDetailIds: number[];
  /** 已选明细对象列表 */
  selectedDetails: CollectionDetail[];
  /** 已选金额合计 */
  selectedTotal: number;
  /** 当前打开的弹窗 */
  activeModal: ModalType;
  /** 单条操作的明细(行操作时使用) */
  singleActionDetail: CollectionDetail | null;
  /** 选择/取消明细 */
  setSelectedDetailIds: (ids: number[]) => void;
  /** 全选/取消全选 */
  toggleSelectAll: () => void;
  /** 打开弹窗 */
  openModal: (type: ModalType, singleDetail?: CollectionDetail) => void;
  /** 关闭弹窗 */
  closeModal: () => void;
  /** 刷新所有数据 */
  refresh: () => Promise<void>;
}

export function useTaskDetail(taskId: number | undefined): UseTaskDetailReturn {
  const [task, setTask] = useState<CollectionTask | null>(null);
  const [details, setDetails] = useState<CollectionDetail[]>([]);
  const [actions, setActions] = useState<CollectionAction[]>([]);
  const [legalProgress, setLegalProgress] = useState<LegalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDetailIds, setSelectedDetailIds] = useState<number[]>([]);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [singleActionDetail, setSingleActionDetail] = useState<CollectionDetail | null>(null);

  /** 获取所有数据 */
  const fetchData = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, detailsData, actionsData] = await Promise.all([
        getCollectionTaskById(taskId),
        getCollectionTaskDetails(taskId),
        getCollectionTaskActions(taskId),
      ]);
      setTask(taskData);
      setDetails(detailsData);
      setActions(actionsData);

      // 仅在升级至财务时加载法律进展
      if (taskData.escalationLevel === 2) {
        const progressData = await getLegalProgress(taskId);
        setLegalProgress(progressData);
      }
    } catch (err: any) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** 已选明细对象 */
  const selectedDetails = useMemo(() => {
    return details.filter((d) => selectedDetailIds.includes(d.id));
  }, [details, selectedDetailIds]);

  /** 已选金额合计 */
  const selectedTotal = useMemo(() => {
    return selectedDetails.reduce((sum, d) => sum + d.leftAmount, 0);
  }, [selectedDetails]);

  /** 全选/取消全选 */
  const toggleSelectAll = useCallback(() => {
    if (selectedDetailIds.length === details.length) {
      setSelectedDetailIds([]);
    } else {
      setSelectedDetailIds(details.map((d) => d.id));
    }
  }, [selectedDetailIds, details]);

  /** 打开弹窗 */
  const openModal = useCallback(
    (type: ModalType, singleDetail?: CollectionDetail) => {
      setSingleActionDetail(singleDetail || null);
      setActiveModal(type);
    },
    [],
  );

  /** 关闭弹窗 */
  const closeModal = useCallback(() => {
    setActiveModal(null);
    setSingleActionDetail(null);
  }, []);

  /** 刷新数据 */
  const refresh = useCallback(async () => {
    setSelectedDetailIds([]);
    await fetchData();
  }, [fetchData]);

  return {
    task,
    details,
    actions,
    legalProgress,
    loading,
    error,
    selectedDetailIds,
    selectedDetails,
    selectedTotal,
    activeModal,
    singleActionDetail,
    setSelectedDetailIds,
    toggleSelectAll,
    openModal,
    closeModal,
    refresh,
  };
}

export default useTaskDetail;
