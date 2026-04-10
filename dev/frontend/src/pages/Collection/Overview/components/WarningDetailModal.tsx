/**
 * 预警明细弹窗组件
 * 显示对应预警等级的详细数据
 * 简化为2级预警：高危(1-2天)、关注(3-5天)
 * 支持响应式：桌面端 Modal + 表格，移动端 Drawer + 卡片列表
 */
import React from 'react';
import { Modal, Drawer, Table, Tag, Spin, Row, Col, Statistic, Empty } from 'antd';
import { ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import type { UpcomingWarning, WarningLevel } from '@/types/ar-collection';
import useMedia from '../hooks/useMedia';
import WarningItemCard from './WarningItemCard';
import './WarningDetailModal.less';

interface WarningDetailModalProps {
  visible: boolean;
  level: WarningLevel | null;
  data: UpcomingWarning[];
  loading: boolean;
  onClose: () => void;
}

// 简化为2级预警配置
const levelConfig: Record<WarningLevel, { title: string; badge: string; tagColor: string; levelText: string }> = {
  high: { title: '高危预警明细', badge: '1-2天内到期', tagColor: 'orange', levelText: '高危' },
  medium: { title: '关注预警明细', badge: '3-5天内到期', tagColor: 'gold', levelText: '关注' },
};

const WarningDetailModal: React.FC<WarningDetailModalProps> = ({
  visible,
  level,
  data,
  loading,
  onClose,
}) => {
  const { isMobile } = useMedia();

  if (!level) return null;

  const config = levelConfig[level];
  const totalAmount = data.reduce((sum, item) => sum + (item.leftAmount || 0), 0);
  const reminded = data.filter((item) => item.reminderCount > 0).length;

  // 桌面端表格列配置
  const columns = [
    {
      title: '单据编号',
      dataIndex: 'billNo',
      key: 'billNo',
      width: 140,
      render: (text: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</span>
      ),
    },
    {
      title: '客户名称',
      dataIndex: 'consumerName',
      key: 'consumerName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '负责人',
      dataIndex: 'managerUserName',
      key: 'managerUserName',
      width: 80,
    },
    {
      title: '欠款金额',
      dataIndex: 'leftAmount',
      key: 'leftAmount',
      width: 100,
      align: 'right' as const,
      render: (amount: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 500 }}>
          ¥{amount?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      title: '结算方式',
      dataIndex: 'settleMethod',
      key: 'settleMethod',
      width: 100,
      align: 'center' as const,
      render: (method: number) => (
        <Tag color={method === 2 ? 'blue' : 'green'}>
          {method === 2 ? '挂账' : '现款'}
        </Tag>
      ),
    },
    {
      title: '最大欠款天数',
      dataIndex: 'consumerExpireDay',
      key: 'consumerExpireDay',
      width: 110,
      align: 'center' as const,
      render: (days: number) => days ? `${days}天` : '-',
    },
    {
      title: '到期日期',
      dataIndex: 'expireDate',
      key: 'expireDate',
      width: 100,
    },
    {
      title: '剩余天数',
      dataIndex: 'daysToExpire',
      key: 'daysToExpire',
      width: 90,
      align: 'center' as const,
      render: (days: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
          <ClockCircleOutlined /> {days}天
        </span>
      ),
    },
    {
      title: '提醒情况',
      dataIndex: 'reminderCount',
      key: 'reminderCount',
      width: 90,
      align: 'center' as const,
      render: (count: number) => (
        <Tag color={count > 0 ? 'blue' : 'default'}>
          {count > 0 ? `已提醒${count}次` : '未提醒'}
        </Tag>
      ),
    },
  ];

  // 渲染统计摘要
  const renderSummary = () => (
    <div className="warning-summary">
      <div className="summary-item">
        <Statistic title="预警数量" value={data.length} suffix="笔" />
      </div>
      <div className="summary-item">
        <Statistic
          title="涉及金额"
          value={(totalAmount / 10000).toFixed(1)}
          suffix="万"
          prefix="¥"
          valueStyle={{ color: '#ff4d4f' }}
        />
      </div>
      <div className="summary-item">
        <Statistic title="已提醒" value={reminded} suffix="笔" />
      </div>
      <div className="summary-item">
        <Statistic title="未提醒" value={data.length - reminded} suffix="笔" />
      </div>
    </div>
  );

  // 渲染移动端内容
  const renderMobileContent = () => (
    <Spin spinning={loading}>
      {/* 标题 */}
      <div className="warning-drawer-header">
        <div className="drawer-title">
          <WarningOutlined style={{ color: config.tagColor === 'orange' ? '#fa8c16' : '#faad14' }} />
          <Tag color={config.tagColor}>{config.levelText}</Tag>
          <span>{config.title}</span>
        </div>
        <Tag color={config.tagColor}>{config.badge}</Tag>
      </div>

      {/* 统计摘要 */}
      {renderSummary()}

      {/* 卡片列表 */}
      <div className="warning-card-list">
        {data.length > 0 ? (
          data.map((item) => (
            <WarningItemCard key={item.erpBillId} item={item} />
          ))
        ) : (
          <Empty description="暂无预警数据" className="warning-empty" />
        )}
      </div>
    </Spin>
  );

  // 渲染桌面端内容
  const renderDesktopContent = () => (
    <Spin spinning={loading}>
      {/* 统计摘要 */}
      <Row gutter={24} style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 6 }}>
        <Col>
          <Statistic title="预警数量" value={data.length} suffix="笔" />
        </Col>
        <Col>
          <Statistic
            title="涉及金额"
            value={(totalAmount / 10000).toFixed(1)}
            suffix="万"
            prefix="¥"
            valueStyle={{ color: '#ff4d4f' }}
          />
        </Col>
        <Col>
          <Statistic title="已提醒" value={reminded} suffix="笔" />
        </Col>
        <Col>
          <Statistic title="未提醒" value={data.length - reminded} suffix="笔" />
        </Col>
      </Row>

      {/* 明细表格 */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey="erpBillId"
        size="small"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (total) => `共 ${total} 条`,
        }}
        scroll={{ x: 1000 }}
      />
    </Spin>
  );

  // 移动端渲染 Drawer
  if (isMobile) {
    return (
      <Drawer
        placement="bottom"
        height="90vh"
        open={visible}
        onClose={onClose}
        className="warning-drawer-mobile"
        closable={false}
      >
        {renderMobileContent()}
      </Drawer>
    );
  }

  // 桌面端渲染 Modal
  return (
    <Modal
      title={
        <span>
          <Tag color={config.tagColor} style={{ marginRight: 8 }}>{config.levelText}</Tag>
          {config.title}
          <Tag color={config.tagColor} style={{ marginLeft: 8 }}>
            {config.badge}
          </Tag>
        </span>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1100}
      className="warning-modal-desktop"
    >
      {renderDesktopContent()}
    </Modal>
  );
};

export default WarningDetailModal;
