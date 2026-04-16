/**
 * 欠款明细表格
 * 支持行选择、行内操作下拉菜单，显示选中统计
 * 移动端使用卡片列表展示
 */
import React from 'react';
import { Table, Dropdown, Button, Tag } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { CollectionDetail, CollectionDetailStatus } from '@/types/ar-collection';
import type { ModalType } from '../hooks/useTaskDetail';
import useMedia from '@/pages/Collection/Overview/hooks/useMedia';
import DetailCard from './DetailCard';

interface DetailTableProps {
  details: CollectionDetail[];
  selectedDetailIds: number[];
  selectedTotal: number;
  totalAmount: number;
  onSelectionChange: (ids: number[]) => void;
  onRowAction: (type: ModalType, detail: CollectionDetail) => void;
  /** 是否显示操作列(出纳视角不显示) */
  showActions?: boolean;
}

/** 明细状态映射 */
const DETAIL_STATUS: Record<CollectionDetailStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'default' },
  pending_verify: { label: '待核销', color: 'cyan' },
  partial_verified: { label: '部分核销', color: 'blue' },
  full_verified: { label: '已核销', color: 'green' },
  extension: { label: '延期中', color: 'purple' },
  difference_pending: { label: '差异待处理', color: 'orange' },
  difference_resolved: { label: '差异已解决', color: 'green' },
  escalated: { label: '已升级', color: 'red' },
};

/** 格式化日期 */
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  return dateStr.slice(0, 10);
};

const DetailTable: React.FC<DetailTableProps> = ({
  details,
  selectedDetailIds,
  selectedTotal,
  totalAmount,
  onSelectionChange,
  onRowAction,
  showActions = true,
}) => {
  const { isMobile } = useMedia();
  const selectedCount = selectedDetailIds.length;

  const actionMenuItems = (record: CollectionDetail) => [
    { key: 'verify', label: '核销回款' },
    { key: 'extension', label: '申请延期' },
    { key: 'difference', label: '标记差异' },
    { key: 'escalate', label: '升级处理' },
  ];

  /** 移动端卡片选择处理 */
  const handleCardSelect = (id: number) => {
    if (selectedDetailIds.includes(id)) {
      onSelectionChange(selectedDetailIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedDetailIds, id]);
    }
  };

  /** 渲染移动端卡片列表 */
  const renderMobileCards = () => (
    <div className="detail-card-list">
      {details.map((detail) => (
        <DetailCard
          key={detail.id}
          detail={detail}
          selected={selectedDetailIds.includes(detail.id)}
          showActions={showActions}
          onSelect={handleCardSelect}
          onAction={onRowAction}
        />
      ))}
    </div>
  );

  const columns: ColumnsType<CollectionDetail> = [
    {
      title: '单据号',
      dataIndex: 'billNo',
      width: 140,
      ellipsis: true,
      render: (billNo: string, record: CollectionDetail) => billNo || record.erpBillId,
    },
    {
      title: '类型',
      dataIndex: 'billTypeName',
      width: 80,
    },
    {
      title: '金额',
      dataIndex: 'leftAmount',
      width: 110,
      align: 'right',
      render: (val: number) => `¥${val.toLocaleString()}`,
    },
    {
      title: '到期日',
      dataIndex: 'expireTime',
      width: 100,
      render: (val: string) => formatDate(val),
    },
    {
      title: '逾期天数',
      dataIndex: 'overdueDays',
      width: 90,
      align: 'center',
      render: (val: number) => (
        <span style={{ color: val > 30 ? '#ff4d4f' : val > 15 ? '#faad14' : undefined }}>
          {val}天
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: CollectionDetailStatus) => {
        const cfg = DETAIL_STATUS[status];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{status}</Tag>;
      },
    },
  ];

  if (showActions) {
    columns.push({
      title: '操作',
      key: 'action',
      width: 80,
      align: 'center',
      render: (_: unknown, record: CollectionDetail) => (
        <Dropdown
          menu={{
            items: actionMenuItems(record),
            onClick: ({ key }) => onRowAction(key as ModalType, record),
          }}
          trigger={['click']}
        >
          <Button type="link" size="small">
            操作 <DownOutlined />
          </Button>
        </Dropdown>
      ),
    });
  }

  return (
    <div className="detail-table-section">
      <div className="table-header">
        <span className="table-title">欠款明细 ({details.length}笔)</span>
      </div>

      {/* 移动端显示卡片列表，桌面端显示表格 */}
      {isMobile ? (
        renderMobileCards()
      ) : (
        <Table<CollectionDetail>
          rowKey="id"
          columns={columns}
          dataSource={details}
          pagination={false}
          size="middle"
          rowSelection={{
            selectedRowKeys: selectedDetailIds,
            onChange: (keys) => onSelectionChange(keys as number[]),
          }}
        />
      )}

      <div className="selection-info">
        <span>
          已选 <strong>{selectedCount}</strong> 条，合计{' '}
          <strong>¥{selectedTotal.toLocaleString()}</strong>
        </span>
        <span className="total-hint">（整单金额 ¥{totalAmount.toLocaleString()}）</span>
      </div>

      <div className="operation-hint">提示: 不选择明细时，操作将应用于整单</div>
    </div>
  );
};

export default DetailTable;
