/**
 * 组合销售与库存匹配
 * 包含关联网络图（纯 CSS/SVG）和库存健康状态
 */

import React from 'react';
import { Card } from 'antd';
import type { InventoryMatchItem } from '@/types/sales-analysis';
import styles from './ComboInventory.less';

interface ComboInventoryProps {
  inventoryData: InventoryMatchItem[];
}

const STATUS_COLOR_MAP: Record<string, string> = {
  healthy: '#52c41a', shortage: '#ff4d4f', overstock: '#faad14',
};

const NETWORK_NODES = [
  { label: 'A12', type: 'main' },
  { label: '壳套', type: 'sub', position: 'left' },
  { label: '耳机', type: 'sub', position: 'right' },
  { label: '充电器', type: 'sub', position: 'bottomLeft' },
  { label: '延保', type: 'sub', position: 'bottomRight' },
];

const NETWORK_LINES = [
  { x1: 50, y1: 50, x2: 22, y2: 28 },
  { x1: 50, y1: 50, x2: 80, y2: 28 },
  { x1: 50, y1: 50, x2: 32, y2: 82 },
  { x1: 50, y1: 50, x2: 74, y2: 80 },
];

const POSITION_CLASS_MAP: Record<string, string> = {
  left: 'nodeLeft', right: 'nodeRight',
  bottomLeft: 'nodeBottomLeft', bottomRight: 'nodeBottomRight',
};

/** 关联网络图 */
const NetworkGraph: React.FC = () => (
  <div className={styles.network}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.networkSvg}>
      {NETWORK_LINES.map((line, idx) => (
        <line key={idx} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#d9d9d9" strokeWidth="1.2" />
      ))}
    </svg>
    {NETWORK_NODES.map((node) => {
      const posClass = node.position ? POSITION_CLASS_MAP[node.position] : '';
      return (
        <span
          key={node.label}
          className={[styles.node, node.type === 'main' ? styles.nodeMain : styles.nodeSub, posClass ? styles[posClass] : ''].filter(Boolean).join(' ')}
        >
          {node.label}
        </span>
      );
    })}
  </div>
);

/** 库存匹配条目 */
const StockList: React.FC<{ data: InventoryMatchItem[] }> = ({ data }) => (
  <div className={styles.stockGroup}>
    {data.map((item) => (
      <div key={item.name} className={styles.stockRow}>
        <span className={styles.stockName}>{item.name}</span>
        <div className={styles.dualBar}>
          <span className={styles.inventory} style={{ width: `${item.inventoryPercent}%` }} />
          <span className={styles.sales} style={{ width: `${item.salesPercent}%` }} />
        </div>
        <strong style={{ color: STATUS_COLOR_MAP[item.status] }}>{item.statusLabel}</strong>
      </div>
    ))}
  </div>
);

const ComboInventory: React.FC<ComboInventoryProps> = ({ inventoryData }) => (
  <Card className={styles.card} size="small" title={null}>
    <div className={styles.cardTitleRow}>
      <div>
        <h3 className={styles.cardTitle}>组合销售与库存匹配</h3>
        <p className={styles.cardSubtitle}>同时查看关联销售关系与库存健康程度。</p>
      </div>
    </div>
    <NetworkGraph />
    <StockList data={inventoryData} />
  </Card>
);

export default ComboInventory;
