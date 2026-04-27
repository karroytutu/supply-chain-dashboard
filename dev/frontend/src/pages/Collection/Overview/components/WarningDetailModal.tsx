/**
 * 预警明细弹窗组件
 * 显示对应预警等级的详细数据
 * 3级预警：今日到期(0天)、高危(1-2天)、关注(3-5天)
 * 支持响应式：桌面端 Modal + 表格，移动端 Drawer + 卡片列表
 */
import React from 'react';
import {
  Modal, Drawer, Table, Tag, Spin, Empty, List, Space, Typography, Divider,
} from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { UpcomingWarning, WarningLevel } from '@/types/ar-collection';
import useMedia from '../hooks/useMedia';
import WarningItemCard from './WarningItemCard';
import { warningDetailColumns, WarningSummary } from './WarningDetailTable';
import styles from './WarningDetailModal.less';

interface WarningDetailModalProps {
  visible: boolean;
  level: WarningLevel | null;
  data: UpcomingWarning[];
  loading: boolean;
  onClose: () => void;
}

const { Text } = Typography;

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

  // 渲染移动端内容
  const renderMobileContent = () => (
    <Spin spinning={loading}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space>
          <WarningOutlined style={{ color: config.tagColor === 'orange' ? '#fa8c16' : '#faad14' }} />
          <Tag color={config.tagColor}>{config.levelText}</Tag>
          <Text strong>{config.title}</Text>
        </Space>
        <Tag color={config.tagColor}>{config.badge}</Tag>
      </Space>
      <Divider style={{ margin: '0 0 8px 0' }} />

      <WarningSummary data={data} isMobile={isMobile} />

      <List
        dataSource={data}
        renderItem={(item) => (
          <List.Item style={{ padding: 0, border: 'none' }}>
            <WarningItemCard item={item} isMobile={isMobile} />
          </List.Item>
        )}
        locale={{ emptyText: <Empty description="暂无预警数据" /> }}
      />
    </Spin>
  );

  // 渲染桌面端内容
  const renderDesktopContent = () => (
    <Spin spinning={loading}>
      <WarningSummary data={data} isMobile={isMobile} />

      <Table
        columns={warningDetailColumns}
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
        className={styles['overdue-warning-drawer']}
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
