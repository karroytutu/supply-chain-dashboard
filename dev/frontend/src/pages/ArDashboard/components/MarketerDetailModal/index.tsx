/**
 * 营销师催收明细弹窗
 * 点击营销师维度面板中的"催收中"数字触发
 * 桌面端：表格 + 即将超时行高亮（OA 处理时限维度）
 * 移动端：卡片流
 * 不设即将超时 Tab，仅行级高亮
 */

import React, { useState, useMemo } from 'react';
import { Modal, Table, Tag, Input, Statistic, Row, Col } from 'antd';
import { WarningOutlined, LinkOutlined, SearchOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import useMobileDetect from '@/hooks/useMobileDetect';
import styles from './index.less';

interface MarketerDetailModalProps {
  visible: boolean;
  onClose: () => void;
  marketer: MarketerStats | null;
  details: ArDetailRow[];
  /** 即将超时的 OA 单号集合（基于 pipelineTimeoutDetails 聚合） */
  timeoutInstanceNos: Set<string>;
  error?: string | null;
}

const overdueColor = (days: number) => {
  if (days <= 0) return 'rgba(0,0,0,0.25)';
  if (days <= 30) return '#52c41a';
  if (days <= 60) return '#fa8c16';
  return '#f5222d';
};

const overdueText = (days: number) => (days <= 0 ? '未逾期' : `${days}天`);

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

const MarketerDetailModal: React.FC<MarketerDetailModalProps> = ({
  visible,
  onClose,
  marketer,
  details,
  timeoutInstanceNos,
  error,
}) => {
  const isMobile = useMobileDetect();
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    if (!keyword) return details;
    const kw = keyword.toLowerCase();
    return details.filter(
      (r) =>
        r.billNo.toLowerCase().includes(kw) ||
        r.consumerName.toLowerCase().includes(kw)
    );
  }, [details, keyword]);

  const timeoutCount = useMemo(
    () => details.filter((r) => timeoutInstanceNos.has(r.oaInstanceNo || '')).length,
    [details, timeoutInstanceNos]
  );

  const totalAmount = useMemo(
    () => details.reduce((s, r) => s + r.leftAmount, 0),
    [details]
  );

  const collectingCount = useMemo(
    () => details.filter((r) => r.status !== null).length,
    [details]
  );

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
      width: 155,
      ellipsis: true,
      render: (text: string, record) =>
        timeoutInstanceNos.has(record.oaInstanceNo || '') ? (
          <span style={{ whiteSpace: 'nowrap' }}>
            <ClockCircleOutlined style={{ color: '#fa8c16', marginRight: 4 }} />
            {text}
          </span>
        ) : (
          text
        ),
    },
    { title: '客户名称', dataIndex: 'consumerName', width: 120, ellipsis: true },
    {
      title: '未收金额',
      dataIndex: 'leftAmount',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.leftAmount - b.leftAmount,
      render: (v: number) => <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>¥{v.toLocaleString()}</span>,
    },
    { title: '到期日', dataIndex: 'expireTime', width: 105, ellipsis: true },
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
  ];

  const rowClassName = (record: ArDetailRow) =>
    timeoutInstanceNos.has(record.oaInstanceNo || '') ? styles.expiryRow : '';

  if (!marketer) return null;

  const title = `${marketer.marketerName} — 催收明细`;

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '100vw' : 900}
      className={isMobile ? styles.mobileModal : ''}
      destroyOnClose
    >
      {/* 统计摘要 */}
      <div className={styles.statsBar}>
        <Row gutter={24}>
          <Col span={6}>
            <Statistic title="总笔数" value={details.length} suffix="笔" />
          </Col>
          <Col span={6}>
            <Statistic title="总金额" value={totalAmount} prefix="¥" precision={0} />
          </Col>
          <Col span={6}>
            <Statistic
              title="催收中"
              value={collectingCount}
              suffix="笔"
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="即将超时"
              value={timeoutCount}
              suffix="笔"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Col>
        </Row>
      </div>

      {error && (
        <div style={{ color: '#f5222d', marginBottom: 8 }}>加载失败: {error}</div>
      )}

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
            const isTimeout = timeoutInstanceNos.has(row.oaInstanceNo || '');
            return (
              <div
                key={`${row.billNo}-${row.oaInstanceId ?? ''}`}
                className={`${styles.cardItem} ${isTimeout ? styles.cardItemExpiry : ''}`}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.cardBillNo}>
                    {isTimeout && (
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
                  <span style={{ color: overdueColor(row.overdueDays), fontWeight: 600 }}>
                    {overdueText(row.overdueDays)}
                  </span>
                </div>
                <div className={styles.cardFooter}>
                  <span style={{ color: 'rgba(0,0,0,0.45)' }}>到期: {row.expireTime}</span>
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

export default MarketerDetailModal;
