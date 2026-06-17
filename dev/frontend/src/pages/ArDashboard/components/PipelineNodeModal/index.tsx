/**
 * 催收进度管道节点明细弹窗
 * 桌面端：表格形式，即将超时/已超时行高亮
 * 移动端：卡片流布局，展示全部字段
 * 时限维度：基于 OA 节点 deadline_at 计算剩余处理时限
 */

import React, { useState, useMemo } from 'react';
import { Modal, Table, Tag, Input, Statistic, Row, Col } from 'antd';
import { WarningOutlined, LinkOutlined, SearchOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import useMobileDetect from '@/hooks/useMobileDetect';
import styles from './index.less';

interface PipelineNodeModalProps {
  visible: boolean;
  onClose: () => void;
  node: PipelineNode | null;
  allDetails: ArDetailRow[];
  /** 超时明细数据（来自 getPipelineTimeoutDetails） */
  timeoutDetails: PipelineTimeoutDetail[];
  timeoutLoading?: boolean;
  error?: string | null;
}

/** 逾期天数颜色（付款维度，保留参考） */
const overdueColor = (days: number) => {
  if (days <= 0) return 'rgba(0,0,0,0.25)';
  if (days <= 30) return '#52c41a';
  if (days <= 60) return '#fa8c16';
  return '#f5222d';
};

const overdueText = (days: number) => (days <= 0 ? '未逾期' : `${days}天`);

/** 格式化剩余时限 */
const formatRemaining = (hours: number): { text: string; color: string } => {
  if (hours < 0) {
    const absHours = Math.abs(hours);
    return { text: absHours >= 24 ? `已超时${Math.floor(absHours / 24)}天` : `已超时${Math.round(absHours)}h`, color: '#f5222d' };
  }
  if (hours >= 24) return { text: `剩余${Math.floor(hours / 24)}天${Math.round(hours % 24)}h`, color: 'rgba(0,0,0,0.45)' };
  return { text: `剩余${Math.round(hours)}h`, color: '#fa8c16' };
};

/** OA 单号点击跳转 */
const OaLink: React.FC<{ id?: number; no?: string }> = ({ id, no }) => {
  if (!no) return <span style={{ color: 'rgba(0,0,0,0.25)' }}>--</span>;
  return (
    <a
      onClick={(e) => {
        e.stopPropagation();
        if (id) window.open(`/oa/detail/${id}`, '_blank');
      }}
      style={{ color: '#1890ff' }}
    >
      <LinkOutlined /> {no}
    </a>
  );
};

const PipelineNodeModal: React.FC<PipelineNodeModalProps> = ({
  visible,
  onClose,
  node,
  allDetails,
  timeoutDetails,
  timeoutLoading,
  error,
}) => {
  const isMobile = useMobileDetect();
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    if (!keyword) return allDetails;
    const kw = keyword.toLowerCase();
    return allDetails.filter(
      (r) =>
        r.billNo.toLowerCase().includes(kw) ||
        r.consumerName.toLowerCase().includes(kw)
    );
  }, [allDetails, keyword]);

  /** 通过 instanceNo 构建超时信息索引 */
  const timeoutByInstanceNo = useMemo(() => {
    const map = new Map<string, PipelineTimeoutDetail>();
    for (const t of timeoutDetails) {
      map.set(t.instanceNo, t);
    }
    return map;
  }, [timeoutDetails]);

  const upcomingTimeoutCount = useMemo(
    () => timeoutDetails.filter((t) => !t.isOverdue).length,
    [timeoutDetails]
  );

  const overdueTimeoutCount = useMemo(
    () => timeoutDetails.filter((t) => t.isOverdue).length,
    [timeoutDetails]
  );

  const totalAmount = useMemo(
    () => allDetails.reduce((s, r) => s + r.leftAmount, 0),
    [allDetails]
  );

  /** 桌面端表格列 */
  const columns: ColumnsType<ArDetailRow> = [
    {
      title: 'OA单号',
      dataIndex: 'oaInstanceNo',
      width: 155,
      ellipsis: true,
      render: (_: unknown, record) => (
        <OaLink id={record.oaInstanceId} no={record.oaInstanceNo} />
      ),
    },
    {
      title: '单据编号',
      dataIndex: 'billNo',
      width: 150,
      ellipsis: true,
    },
    { title: '客户名称', dataIndex: 'consumerName', width: 110, ellipsis: true },
    {
      title: '未收金额',
      dataIndex: 'leftAmount',
      width: 105,
      align: 'right',
      sorter: (a, b) => a.leftAmount - b.leftAmount,
      render: (v: number) => <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>¥{v.toLocaleString()}</span>,
    },
    {
      title: '入催日期',
      dataIndex: 'collectionStartDate',
      width: 100,
      ellipsis: true,
      render: (v: string) => v || <span style={{ color: 'rgba(0,0,0,0.25)' }}>--</span>,
    },
    {
      title: '剩余时限',
      dataIndex: 'oaInstanceNo',
      width: 110,
      align: 'center',
      sorter: (a, b) => {
        const ta = timeoutByInstanceNo.get(a.oaInstanceNo || '');
        const tb = timeoutByInstanceNo.get(b.oaInstanceNo || '');
        return (ta?.remainingHours ?? 9999) - (tb?.remainingHours ?? 9999);
      },
      render: (_: unknown, record) => {
        const t = timeoutByInstanceNo.get(record.oaInstanceNo || '');
        if (!t) return <span style={{ color: 'rgba(0,0,0,0.25)' }}>--</span>;
        const { text, color } = formatRemaining(t.remainingHours);
        return (
          <Tag
            color={t.isOverdue ? 'red' : t.remainingHours <= 24 ? 'orange' : 'default'}
            icon={t.isOverdue ? <WarningOutlined /> : <ClockCircleOutlined />}
            style={{ whiteSpace: 'nowrap' }}
          >
            {text}
          </Tag>
        );
      },
    },
    {
      title: '逾期天数',
      dataIndex: 'overdueDays',
      width: 85,
      align: 'center',
      sorter: (a, b) => a.overdueDays - b.overdueDays,
      render: (v: number) => (
        <span style={{ color: overdueColor(v), fontWeight: v > 0 ? 600 : 400, whiteSpace: 'nowrap' }}>
          {overdueText(v)}
        </span>
      ),
    },
    { title: '营销师', dataIndex: 'managerUserName', width: 75, ellipsis: true },
  ];

  /** 桌面端行样式：超时高亮 */
  const rowClassName = (record: ArDetailRow) => {
    const t = timeoutByInstanceNo.get(record.oaInstanceNo || '');
    if (!t) return '';
    if (t.isOverdue) return styles.overdueTimeoutRow;
    if (t.remainingHours <= 24) return styles.expiryRow;
    return '';
  };

  if (!node) return null;

  const title = `${node.label} — 全部欠款明细`;

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '100vw' : 960}
      className={isMobile ? styles.mobileModal : ''}
      destroyOnClose
    >
      {/* 统计摘要 */}
      <div className={styles.statsBar}>
        <Row gutter={24}>
          <Col span={6}>
            <Statistic title="总笔数" value={allDetails.length} suffix="笔" />
          </Col>
          <Col span={6}>
            <Statistic title="总金额" value={totalAmount} prefix="¥" precision={0} />
          </Col>
          <Col span={6}>
            <Statistic
              title="即将超时"
              value={timeoutLoading ? '...' : upcomingTimeoutCount}
              suffix="笔"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="已超时"
              value={timeoutLoading ? '...' : overdueTimeoutCount}
              suffix="笔"
              valueStyle={{ color: '#f5222d' }}
            />
          </Col>
        </Row>
      </div>

      {error && (
        <div style={{ color: '#f5222d', marginBottom: 8 }}>加载失败: {error}</div>
      )}

      {/* 搜索框 */}
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索客户名/单据编号"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        allowClear
        style={{ marginBottom: 12 }}
      />

      {/* 桌面端：表格 */}
      {!isMobile && (
        <Table<ArDetailRow>
          rowKey={(row) => `${row.billNo}-${row.oaInstanceId ?? ''}`}
          columns={columns}
          dataSource={filtered}
          rowClassName={rowClassName}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      )}

      {/* 移动端：卡片流 */}
      {isMobile && (
        <div className={styles.cardList}>
          {filtered.map((row) => {
            const t = timeoutByInstanceNo.get(row.oaInstanceNo || '');
            const isUpcoming = t && !t.isOverdue && t.remainingHours <= 24;
            const isOverdue = t?.isOverdue;
            const cardClass = isOverdue
              ? styles.cardItemOverdue
              : isUpcoming
                ? styles.cardItemExpiry
                : '';
            return (
              <div key={`${row.billNo}-${row.oaInstanceId ?? ''}`} className={`${styles.cardItem} ${cardClass}`}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardBillNo}>
                    {isOverdue && (
                      <Tag color="red" icon={<WarningOutlined />} style={{ marginRight: 4 }}>
                        已超时
                      </Tag>
                    )}
                    {isUpcoming && (
                      <Tag color="orange" icon={<ClockCircleOutlined />} style={{ marginRight: 4 }}>
                        即将超时
                      </Tag>
                    )}
                    {row.billNo}
                  </span>
                  <span
                    className={styles.cardAmount}
                    style={{ color: row.leftAmount > 0 ? '#f5222d' : 'rgba(0,0,0,0.45)' }}
                  >
                    ¥{row.leftAmount.toLocaleString()}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <span>{row.consumerName}</span>
                  <span>{row.managerUserName}</span>
                </div>
                <div className={styles.cardFooter}>
                  <span style={{ color: 'rgba(0,0,0,0.45)' }}>入催: {row.collectionStartDate || '--'}</span>
                  {t && (
                    <span style={{ color: formatRemaining(t.remainingHours).color, fontWeight: 600 }}>
                      {formatRemaining(t.remainingHours).text}
                    </span>
                  )}
                  <OaLink id={row.oaInstanceId} no={row.oaInstanceNo} />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: 'rgba(0,0,0,0.25)', padding: 24 }}>
              暂无匹配数据
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default PipelineNodeModal;
