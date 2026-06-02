/**
 * 待办事项模块卡片组件
 * 展示单个业务模块的待办子项和计数
 */

import React from 'react';
import { Badge, Button } from 'antd';
import {
  AuditOutlined,
  AlertOutlined,
  ShoppingOutlined,
  StarOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { WorkspaceModule } from '@/types/workspace';
import styles from './ModuleCard.less';

const ICON_MAP: Record<string, React.ReactNode> = {
  AuditOutlined: <AuditOutlined />,
  AlertOutlined: <AlertOutlined />,
  ShoppingOutlined: <ShoppingOutlined />,
  StarOutlined: <StarOutlined />,
};

const COLOR_MAP: Record<string, { bg: string; fg: string }> = {
  'oa-approval': { bg: '#f6ffed', fg: '#52c41a' },
  collection: { bg: '#fff7e6', fg: '#fa8c16' },
  'return-order': { bg: '#f9f0ff', fg: '#722ed1' },
  'strategic-product': { bg: '#f0f5ff', fg: '#2f54eb' },
  assessment: { bg: '#e6f7ff', fg: '#1890ff' },
};

const ROUTE_MAP: Record<string, string> = {
  'oa-approval': '/oa/center',
  collection: '/collection/overview',
  'return-order': '/procurement/return/orders',
  'strategic-product': '/procurement/strategic-products',
  assessment: '/assessment',
};

interface ModuleCardProps {
  module: WorkspaceModule;
  onNavigate: (path: string) => void;
}

const ModuleCard: React.FC<ModuleCardProps> = ({ module, onNavigate }) => {
  const color = COLOR_MAP[module.code] || { bg: '#f5f5f5', fg: '#666' };
  const icon = ICON_MAP[module.icon] || <AuditOutlined />;
  const route = ROUTE_MAP[module.code] || '/overview';

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.iconWrap} style={{ background: color.bg, color: color.fg }}>
            {icon}
          </div>
          <span className={styles.name}>{module.name}</span>
        </div>
        <Badge
          count={module.totalPending}
          showZero
          style={{
            backgroundColor: module.totalPending > 0 ? '#f5222d' : '#d9d9d9',
          }}
        />
      </div>

      <div className={styles.items}>
        {module.items.map((item, idx) => (
          <div className={styles.itemRow} key={idx}>
            <span className={styles.itemLabel}>
              <span
                className={styles.dot}
                style={{
                  backgroundColor:
                    item.level === 'urgent'
                      ? '#f5222d'
                      : item.level === 'warning'
                      ? '#fa8c16'
                      : '#1890ff',
                }}
              />
              {item.label}
            </span>
            <span
              className={styles.itemCount}
              style={{
                color:
                  item.level === 'urgent'
                    ? '#f5222d'
                    : item.count === 0
                    ? 'rgba(0,0,0,0.25)'
                    : 'rgba(0,0,0,0.85)',
                fontWeight: item.count === 0 ? 400 : 600,
              }}
            >
              {item.count}
            </span>
          </div>
        ))}
      </div>

      <Button
        type="link"
        className={styles.goBtn}
        onClick={() => onNavigate(route)}
      >
        前往处理 <RightOutlined />
      </Button>
    </div>
  );
};

export default ModuleCard;
