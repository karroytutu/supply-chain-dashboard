/**
 * 订单明细 Modal 组件 - 带凭证标记功能
 * 用于展示预处理任务关联的订单明细并支持快速标记凭证状态
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Descriptions,
  Table,
  Tag,
  Spin,
  Empty,
  Typography,
  message,
  Space,
  Button,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type {
  PreprocessingTaskBillsResponse,
  VoucherStatus,
  PreprocessingBillDetailWithVoucher,
} from '@/types/accounts-receivable';
import {
  getPreprocessingTaskBills,
  markVoucherStatus,
  batchMarkVoucherStatus,
} from '@/services/api/accounts-receivable';

const { Text } = Typography;

// 凭证状态配置
const VOUCHER_CONFIG = {
  has_voucher: { text: '有凭证', color: 'green', icon: <CheckCircleOutlined /> },
  no_voucher: { text: '无凭证', color: 'red', icon: <CloseCircleOutlined /> },
  voucher_unqualified: { text: '不合格', color: 'orange', icon: <ExclamationCircleOutlined /> },
  unmarked: { text: '未标记', color: 'default', icon: <QuestionCircleOutlined /> },
} as const;

interface OrderDetailModalProps {
  visible: boolean;
  taskId: number | null;
  onCancel: () => void;
  onComplete?: () => void;
}

// 逾期等级标签
const overdueLevelMap: Record<string, { text: string; color: string }> = {
  light: { text: '轻度逾期', color: 'green' },
  medium: { text: '中度逾期', color: 'orange' },
  severe: { text: '严重逾期', color: 'red' },
};

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ visible, taskId, onCancel, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreprocessingTaskBillsResponse | null>(null);
  const [voucherFilter, setVoucherFilter] = useState<VoucherStatus | 'all' | 'unmarked'>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [markingKeys, setMarkingKeys] = useState<Set<React.Key>>(new Set());
  const [batchMarking, setBatchMarking] = useState(false);

  // 获取订单明细
  useEffect(() => {
    if (!visible || !taskId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getPreprocessingTaskBills(taskId);
        setData(result);
        setSelectedRowKeys([]);
        setVoucherFilter('all');
      } catch (error) {
        console.error('获取订单明细失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [visible, taskId]);

  // 格式化金额
  const formatAmount = (amount: number | string): string => {
    const numAmount = Number(amount);
    if (isNaN(numAmount)) return '¥0.00';
    return `¥${numAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
  };

  // 格式化日期
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  // 计算凭证统计
  const voucherStats = useMemo(() => {
    if (!data?.bills) return { hasVoucher: 0, noVoucher: 0, voucherUnqualified: 0, unmarked: 0, total: 0 };

    const stats = { hasVoucher: 0, noVoucher: 0, voucherUnqualified: 0, unmarked: 0, total: data.bills.length };
    data.bills.forEach((bill: any) => {
      const status = bill.receivable?.voucher_status;
      if (status === 'has_voucher') stats.hasVoucher++;
      else if (status === 'no_voucher') stats.noVoucher++;
      else if (status === 'voucher_unqualified') stats.voucherUnqualified++;
      else stats.unmarked++;
    });
    return stats;
  }, [data]);

  // 过滤后的单据列表
  const filteredBills = useMemo(() => {
    if (!data?.bills) return [];
    if (voucherFilter === 'all') return data.bills;
    return data.bills.filter((bill: any) => {
      const status = bill.receivable?.voucher_status;
      if (voucherFilter === 'unmarked') return !status;
      return status === voucherFilter;
    });
  }, [data, voucherFilter]);

  // 标记单个单据凭证状态
  const handleMarkVoucher = async (arId: number, status: VoucherStatus) => {
    if (!taskId) return;
    setMarkingKeys((prev) => new Set(prev).add(arId));
    try {
      await markVoucherStatus(taskId, { arId, voucherStatus: status });
      message.success('标记成功');
      // 乐观更新
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          bills: prev.bills.map((bill: any) =>
            bill.receivable.id === arId
              ? { ...bill, receivable: { ...bill.receivable, voucher_status: status } }
              : bill
          ),
        };
      });
    } catch (error) {
      message.error('标记失败');
    } finally {
      setMarkingKeys((prev) => {
        const next = new Set(prev);
        next.delete(arId);
        return next;
      });
    }
  };

  // 批量标记凭证状态
  const handleBatchMark = async (status: VoucherStatus) => {
    if (!taskId || selectedRowKeys.length === 0) return;
    setBatchMarking(true);
    try {
      await batchMarkVoucherStatus(taskId, {
        marks: selectedRowKeys.map((key) => ({ arId: Number(key), voucherStatus: status })),
      });
      message.success(`批量标记成功 ${selectedRowKeys.length} 张`);
      setSelectedRowKeys([]);
      // 刷新数据
      const result = await getPreprocessingTaskBills(taskId);
      setData(result);
    } catch (error) {
      message.error('批量标记失败');
    } finally {
      setBatchMarking(false);
    }
  };

  // 渲染凭证状态按钮组
  const renderVoucherButtons = (bill: any) => {
    const arId = bill.receivable.id;
    const currentStatus = bill.receivable.voucher_status;
    const isMarking = markingKeys.has(arId);

    return (
      <Space size={4}>
        {(['has_voucher', 'no_voucher', 'voucher_unqualified'] as VoucherStatus[]).map((status) => {
          const config = VOUCHER_CONFIG[status];
          const isActive = currentStatus === status;
          return (
            <Button
              key={status}
              size="small"
              type={isActive ? 'primary' : 'default'}
              danger={status === 'no_voucher'}
              icon={config.icon}
              loading={isMarking}
              disabled={isMarking || batchMarking}
              onClick={() => handleMarkVoucher(arId, status)}
            >
              {config.text}
            </Button>
          );
        })}
      </Space>
    );
  };

  // Table 列定义
  const columns: ColumnsType<PreprocessingBillDetailWithVoucher> = [
    {
      title: '订单号',
      dataIndex: ['receivable', 'order_no'],
      key: 'order_no',
      width: 150,
      ellipsis: true,
      render: (value: string, record) => value || record.receivable.erp_bill_id,
    },
    {
      title: '客户',
      dataIndex: ['receivable', 'consumer_name'],
      key: 'consumer_name',
      width: 120,
      ellipsis: true,
    },
    {
      title: '欠款金额',
      dataIndex: ['receivable', 'left_amount'],
      key: 'left_amount',
      width: 120,
      render: (value: number) => <Text type="danger">{formatAmount(value)}</Text>,
    },
    {
      title: '逾期天数',
      dataIndex: ['receivable', 'overdue_days'],
      key: 'overdue_days',
      width: 90,
      render: (value: number) => <Text type="danger">{value || 0} 天</Text>,
    },
    {
      title: '凭证状态',
      key: 'voucher_status',
      width: 110,
      render: (_: unknown, record: any) => {
        const status = record.receivable.voucher_status;
        const config = status ? VOUCHER_CONFIG[status] : VOUCHER_CONFIG.unmarked;
        return <Tag color={config.color}>{config.icon} {config.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_: unknown, record: any) => renderVoucherButtons(record),
    },
  ];

  // 取消处理
  const handleCancel = () => {
    setData(null);
    setSelectedRowKeys([]);
    onCancel();
  };

  return (
    <Modal
      title="订单明细 - 凭证标记"
      open={visible}
      onCancel={handleCancel}
      width={1100}
      footer={
        <Space>
          <Button onClick={handleCancel}>关闭</Button>
          {onComplete && (
            <Button type="primary" onClick={onComplete}>
              完成预处理
            </Button>
          )}
        </Space>
      }
      destroyOnClose
    >
      <Spin spinning={loading}>
        {data && (
          <>
            {/* 任务摘要 */}
            <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="任务编号">{data.taskInfo.taskNo}</Descriptions.Item>
              <Descriptions.Item label="客户名称">{data.taskInfo.consumerName}</Descriptions.Item>
              <Descriptions.Item label="逾期等级">
                {overdueLevelMap[data.taskInfo.overdueLevel] && (
                  <Tag color={overdueLevelMap[data.taskInfo.overdueLevel].color}>
                    {overdueLevelMap[data.taskInfo.overdueLevel].text}
                  </Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="单据数">{data.taskInfo.billCount}</Descriptions.Item>
              <Descriptions.Item label="总金额">{formatAmount(data.taskInfo.totalAmount)}</Descriptions.Item>
            </Descriptions>

            {/* 凭证统计 */}
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fafafa', borderRadius: 4 }}>
              <Space size="large">
                <Text strong>凭证统计:</Text>
                <Tag color="green">{VOUCHER_CONFIG.has_voucher.icon} 有凭证({voucherStats.hasVoucher})</Tag>
                <Tag color="red">{VOUCHER_CONFIG.no_voucher.icon} 无凭证({voucherStats.noVoucher})</Tag>
                <Tag color="orange">{VOUCHER_CONFIG.voucher_unqualified.icon} 不合格({voucherStats.voucherUnqualified})</Tag>
                <Tag color="default">{VOUCHER_CONFIG.unmarked.icon} 未标记({voucherStats.unmarked})</Tag>
                <Text type="secondary">共 {voucherStats.total} 张</Text>
              </Space>
            </div>

            {/* 筛选栏 */}
            <div style={{ marginBottom: 12 }}>
              <Space>
                <Text>筛选:</Text>
                {[
                  { key: 'all', text: '全部' },
                  { key: 'has_voucher', text: '有凭证' },
                  { key: 'no_voucher', text: '无凭证' },
                  { key: 'voucher_unqualified', text: '不合格' },
                  { key: 'unmarked', text: '未标记' },
                ].map((item) => (
                  <Tag
                    key={item.key}
                    color={voucherFilter === item.key ? 'blue' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setVoucherFilter(item.key as any)}
                  >
                    {item.text}
                  </Tag>
                ))}
              </Space>
            </div>

            {/* 批量操作栏 */}
            {selectedRowKeys.length > 0 && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#e6f7ff', borderRadius: 4 }}>
                <Space>
                  <Text>已选择 {selectedRowKeys.length} 张单据，标记为:</Text>
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    loading={batchMarking}
                    onClick={() => handleBatchMark('has_voucher')}
                  >
                    有凭证
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<CloseCircleOutlined />}
                    loading={batchMarking}
                    onClick={() => handleBatchMark('no_voucher')}
                  >
                    无凭证
                  </Button>
                  <Button
                    size="small"
                    icon={<ExclamationCircleOutlined />}
                    loading={batchMarking}
                    onClick={() => handleBatchMark('voucher_unqualified')}
                  >
                    不合格
                  </Button>
                  <Button size="small" onClick={() => setSelectedRowKeys([])}>
                    取消选择
                  </Button>
                </Space>
              </div>
            )}

            {/* 单据列表 */}
            <Table
              rowKey={(record) => record.receivable.id}
              columns={columns}
              dataSource={filteredBills}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
              pagination={false}
              scroll={{ y: 400 }}
              size="small"
              locale={{ emptyText: <Empty description="暂无单据数据" /> }}
            />
          </>
        )}

        {!loading && !data && taskId && <Empty description="暂无订单数据" />}
      </Spin>
    </Modal>
  );
};

export default OrderDetailModal;
