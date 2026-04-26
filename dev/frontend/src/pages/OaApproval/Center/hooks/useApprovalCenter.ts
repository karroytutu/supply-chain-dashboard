import { useState, useEffect } from 'react';
import { message } from 'antd';
import { oaApprovalApi } from '@/services/api/oa-approval';
import type { ApprovalInstance, ApprovalDetail, ApprovalStats, ViewMode } from '@/types/oa-approval';

interface UseApprovalCenterReturn {
  loading: boolean;
  detailLoading: boolean;
  viewMode: ViewMode;
  stats: ApprovalStats;
  list: ApprovalInstance[];
  total: number;
  page: number;
  searchText: string;
  selectedId: number | null;
  detail: ApprovalDetail | null;
  rejectModalVisible: boolean;
  rejectReason: string;
  transferModalVisible: boolean;
  transferUsers: Array<{ id: number; name: string }>;
  transferUserId: number | null;
  setViewMode: (mode: ViewMode) => void;
  setPage: (page: number) => void;
  setSearchText: (text: string) => void;
  setSelectedId: (id: number | null) => void;
  setRejectModalVisible: (visible: boolean) => void;
  setRejectReason: (reason: string) => void;
  setTransferModalVisible: (visible: boolean) => void;
  setTransferUserId: (id: number | null) => void;
  openTransferModal: () => void;
  handleTransfer: () => Promise<void>;
  handleApprove: () => Promise<void>;
  handleReject: () => Promise<void>;
  handleWithdraw: () => Promise<void>;
  loadList: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadDetail: (id: number) => Promise<void>;
}

export function useApprovalCenter(): UseApprovalCenterReturn {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('pending');
  const [stats, setStats] = useState<ApprovalStats>({ total: 0, pending: 0, processed: 0, approved: 0, rejected: 0, my: 0, cc: 0 });
  const [list, setList] = useState<ApprovalInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferUsers, setTransferUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [transferUserId, setTransferUserId] = useState<number | null>(null);

  const loadStats = async () => {
    try {
      const res = await oaApprovalApi.getStats();
      setStats(res.data);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const result = await oaApprovalApi.getApprovalList({ viewMode, page, pageSize: 20 });
      setList(result.data);
      setTotal(result.total);
      if (result.data.length > 0 && !selectedId) {
        setSelectedId(result.data[0].id);
      }
    } catch (error) {
      console.error('加载列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await oaApprovalApi.getDetail(id);
      setDetail(res.data);
    } catch (error) {
      console.error('加载详情失败:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  useEffect(() => { loadList(); }, [viewMode, page]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId]);

  // 同意审批
  const handleApprove = async () => {
    if (!selectedId) return;
    try {
      await oaApprovalApi.approve(selectedId);
      message.success('审批通过');
      loadList();
      loadStats();
      loadDetail(selectedId);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  // 拒绝审批
  const handleReject = async () => {
    if (!selectedId || !rejectReason.trim()) {
      message.error('请填写拒绝原因');
      return;
    }
    try {
      await oaApprovalApi.reject(selectedId, { comment: rejectReason });
      message.success('已拒绝');
      setRejectModalVisible(false);
      setRejectReason('');
      loadList();
      loadStats();
      loadDetail(selectedId);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  // 撤回审批
  const handleWithdraw = async () => {
    if (!selectedId) return;
    try {
      await oaApprovalApi.withdraw(selectedId);
      message.success('撤回成功');
      loadList();
      loadStats();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  // 打开转交弹窗
  const openTransferModal = () => {
    setTransferModalVisible(true);
    oaApprovalApi.getTransferCandidates()
      .then((users) => setTransferUsers(users))
      .catch(() => setTransferUsers([]));
  };

  // 转交审批
  const handleTransfer = async () => {
    if (!selectedId || !transferUserId) {
      message.warning('请选择转交人员');
      return;
    }
    try {
      await oaApprovalApi.transfer(selectedId, { transferToUserId: transferUserId });
      message.success('已转交');
      setTransferModalVisible(false);
      setTransferUserId(null);
      loadList();
      loadStats();
      if (selectedId) loadDetail(selectedId);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  return {
    loading, detailLoading, viewMode, stats, list, total, page,
    searchText, selectedId, detail, rejectModalVisible, rejectReason,
    transferModalVisible, transferUsers, transferUserId,
    setViewMode, setPage, setSearchText, setSelectedId,
    setRejectModalVisible, setRejectReason,
    setTransferModalVisible, setTransferUserId,
    openTransferModal, handleTransfer,
    handleApprove, handleReject, handleWithdraw, loadList, loadStats, loadDetail,
  };
}
