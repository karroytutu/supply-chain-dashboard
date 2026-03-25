import React, { useState, useMemo } from 'react';
import { Table, Progress, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CategoryTreeNode } from '@/services/api/dashboard';
import styles from './index.less';

interface CategoryTableProps {
  data: CategoryTreeNode[];
  onViewProducts?: (item: CategoryTreeNode) => void;
}

// 颜色范围（从红到绿）
const colorRange = ['#ff4d4f', '#fa8c16', '#faad14', '#73d13d', '#52c41a'];

// 根据齐全率值计算颜色（线性插值）
function getColorByRate(rate: number): string {
  const clampedRate = Math.max(0, Math.min(100, rate));
  const index = (clampedRate / 100) * (colorRange.length - 1);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.min(lowerIndex + 1, colorRange.length - 1);
  const t = index - lowerIndex;

  const lowerColor = hexToRgb(colorRange[lowerIndex]);
  const upperColor = hexToRgb(colorRange[upperIndex]);

  if (!lowerColor || !upperColor) return colorRange[0];

  const r = Math.round(lowerColor.r + (upperColor.r - lowerColor.r) * t);
  const g = Math.round(lowerColor.g + (upperColor.g - lowerColor.g) * t);
  const b = Math.round(lowerColor.b + (upperColor.b - lowerColor.b) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// 为节点添加唯一 key
interface TreeNode extends CategoryTreeNode {
  key: string;
  children?: TreeNode[];
}

function addKeysToNodes(nodes: CategoryTreeNode[], parentKey: string = ''): TreeNode[] {
  return nodes.map((node, index) => {
    const key = parentKey ? `${parentKey}-${index}` : `l1-${index}`;
    return {
      ...node,
      key,
      children: node.children ? addKeysToNodes(node.children, key) : undefined,
    };
  });
}

const CategoryTable: React.FC<CategoryTableProps> = ({
  data,
  onViewProducts,
}) => {
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

  // 为数据添加 key
  const dataWithKeys = useMemo(() => addKeysToNodes(data), [data]);

  // 判断是否为叶子节点（三级品类）
  const isLeafNode = (record: TreeNode) => !record.children || record.children.length === 0;

  // 列定义
  const columns: ColumnsType<TreeNode> = [
    {
      title: '品类名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'SKU数量',
      dataIndex: 'totalCount',
      key: 'totalCount',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.totalCount - b.totalCount,
      render: (count: number) => <span className={styles.skuCount}>{count}</span>,
    },
    {
      title: '齐全率',
      dataIndex: 'availabilityRate',
      key: 'availabilityRate',
      width: 180,
      sorter: (a, b) => a.availabilityRate - b.availabilityRate,
      defaultSortOrder: 'ascend',
      render: (rate: number) => (
        <Progress
          percent={rate}
          size="small"
          strokeColor={getColorByRate(rate)}
          format={(percent) => `${percent?.toFixed(1)}%`}
        />
      ),
    },
    {
      title: '有货/缺货',
      key: 'stock',
      width: 120,
      align: 'center',
      render: (_: unknown, record: TreeNode) => {
        const outOfStock = record.totalCount - record.inStockCount;
        return (
          <span className={styles.stockInfo}>
            <span className={styles.inStock}>{record.inStockCount}</span>
            <span className={styles.separator}>/</span>
            <span className={outOfStock > 0 ? styles.outOfStock : styles.inStock}>
              {outOfStock}
            </span>
          </span>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      align: 'center',
      render: (_: unknown, record: TreeNode) => {
        // 只有三级品类（叶子节点）才显示查看按钮
        if (!isLeafNode(record)) return null;
        const outOfStock = record.totalCount - record.inStockCount;
        if (outOfStock === 0) return <span className={styles.noAction}>-</span>;
        return (
          <Button
            type="link"
            size="small"
            onClick={() => onViewProducts?.(record)}
          >
            查看
          </Button>
        );
      },
    },
  ];

  return (
    <div className={styles.categoryTable}>
      <Table
        columns={columns}
        dataSource={dataWithKeys}
        rowKey="key"
        size="small"
        pagination={false}
        scroll={{ y: 280 }}
        className={styles.table}
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as React.Key[]),
          childrenColumnName: 'children',
          defaultExpandAllRows: false,
          indentSize: 20,
        }}
      />
    </div>
  );
};

export default CategoryTable;
