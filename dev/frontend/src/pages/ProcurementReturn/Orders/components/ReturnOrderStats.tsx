/**
 * 退货单统计卡片组件
 */
import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import {
  ClockCircleOutlined,
  FileTextOutlined,
  HomeOutlined,
  ShoppingCartOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { ReturnOrderStats as ReturnOrderStatsType, ReturnOrderStatus } from '@/types/procurement-return';
import styles from '../index.less';

interface ReturnOrderStatsProps {
  stats: ReturnOrderStatsType;
  activeStatus?: ReturnOrderStatus;
  onStatusClick?: (status?: ReturnOrderStatus) => void;
}

const statusConfig: Array<{
  key: keyof ReturnOrderStatsType;
  status: ReturnOrderStatus | undefined;
  title: string;
  icon: React.ReactNode;
  color: string;
}> = [
  { key: 'pendingConfirm', status: 'pending_confirm', title: '待确认采购退货', icon: <ClockCircleOutlined />, color: '#1890ff' },
  { key: 'pendingErpFill', status: 'pending_erp_fill', title: '待填ERP', icon: <FileTextOutlined />, color: '#ff4d4f' },
  { key: 'pendingWarehouseExecute', status: 'pending_warehouse_execute', title: '待仓储退货', icon: <HomeOutlined />, color: '#fa8c16' },
  { key: 'pendingMarketingSale', status: 'pending_marketing_sale', title: '待营销销售', icon: <ShoppingCartOutlined />, color: '#722ed1' },
  { key: 'completed', status: 'completed', title: '已完成', icon: <CheckCircleOutlined />, color: '#52c41a' },
];

const ReturnOrderStats: React.FC<ReturnOrderStatsProps> = ({
  stats,
  activeStatus,
  onStatusClick,
}) => {
  const handleClick = (status?: ReturnOrderStatus) => {
    // 点击已激活的状态则取消筛选
    if (activeStatus === status) {
      onStatusClick?.(undefined);
    } else {
      onStatusClick?.(status);
    }
  };

  return (
    <Row gutter={[16, 16]} className={styles.statsRow}>
      {statusConfig.map(({ key, status, title, icon, color }) => {
        const isActive = activeStatus === status;
        return (
          <Col xs={12} sm={12} md={24 / 5} key={key}>
            <Card
              className={`${styles.statsCard} ${isActive ? styles.statsCardActive : ''}`}
              onClick={() => handleClick(status)}
              hoverable
              style={{ borderColor: isActive ? color : undefined }}
            >
              <Statistic
                title={title}
                value={stats[key]}
                prefix={icon}
                valueStyle={{ color, fontSize: 24 }}
              />
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};

export { ReturnOrderStats };
export default ReturnOrderStats;
