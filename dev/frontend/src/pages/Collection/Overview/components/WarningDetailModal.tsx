/**
 * 预警明细弹窗组件
 * 显示对应预警等级的详细数据
 * 3级预警：今日到期(0天)、高危(1-2天)、关注(3-5天)
 * 支持响应式：桌面端 Modal + 表格，移动端 Drawer + 卡片列表
 */
import React from 'react';
import {
  Modal, Drawer, Table, Tag, Spin, Row, Col, Statistic, Empty, List, Card, Space, Typography, Divider,
} from 'antd';
import { ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import type { UpcomingWarning, WarningLevel } from '@/types/ar-collection';
import useMedia from '../hooks/useMedia';
import WarningItemCard from './WarningItemCard';

interface WarningDetailModalProps {
  visible: boolean;
  level: WarningLevel | null;
  data: UpcomingWarning[];
  loading: boolean;
  onClose: () => void;
}

const { Text } = Typography;

// 3级预警配置
const levelConfig: Record<WarningLevel, { title: string; badge: string; tagColor: string; levelText: string }> = {
  today: { title: '今日到期明细', badge: '今日到期', tagColor: 'red', levelText: '今日到期' },
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
      render: (text: string) => <Text code>{text}</Text>,
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
        <Text type="danger" strong>
          ¥{amount?.toLocaleString() ?? 0}
        </Text>
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
      render: (days: number) => (days ? `${days}天` : '-'),
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
        <Text type="danger" strong>
          <ClockCircleOutlined /> {days}天
        </Text>
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

  // 统计摘要（桌面端与移动端统一）
  const renderSummary = () => (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Row gutter={24}>
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
    </Card>
  );

  // 渲染移动端内容
  const renderMobileContent = () => (
    <Spin spinning={loading}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <Space>
          <WarningOutlined style={{ color: config.tagColor === 'orange' ? '#fa8c16' : '#faad14' }} />
          <Tag color={config.tagColor}>{config.levelText}</Tag>
          <Text strong>{config.title}</Text>
        </Space>
        <Tag color={config.tagColor}>{config.badge}</Tag>
      </Space>
      <Divider style={{ margin: '0 0 12px 0' }} />

      {renderSummary()}

      <List
        dataSource={data}
        renderItem={(item) => (
          <List.Item style={{ padding: 0, border: 'none' }}>
            <WarningItemCard item={item} />
          </List.Item>
        )}
        locale={{ emptyText: <Empty description="暂无预警数据" /> }}
      />
    </Spin>
  );

  // 渲染桌面端内容
  const renderDesktopContent = () => (
    <Spin spinning={loading}>
      {renderSummary()}

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
        <Space>
          <Tag color={config.tagColor}>{config.levelText}</Tag>
          <Text strong>{config.title}</Text>
          <Tag color={config.tagColor}>{config.badge}</Tag>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1100}
    >
      {renderDesktopContent()}
    </Modal>
  );
};

export default WarningDetailModal;
