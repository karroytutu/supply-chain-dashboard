/**
 * 品类→商品分层表格（Ant Design Table 版）
 * 列：名称 | 上月目标 | 上月实际 | 上月达成 | 上月环比 | 本月目标 | 预计增长 | 预计环比 | 毛利率 | 预计毛利 | 基准提成 | 增量提成 | 说明
 */
import React, { useState, useCallback } from 'react';
import { Table, Button, Empty } from 'antd';
import { DownOutlined, RightOutlined, PlusOutlined } from '@ant-design/icons';
import type { CustomerTarget, CategoryTarget, SplitMethod } from '@/types/target-management';
import RemarkEditModal from './RemarkEditModal';
import { useTreeData } from './useTreeData';
import type { CatAggregates } from './useTreeData';
import { useTableColumns } from './useTableColumns';
import styles from './index.less';

interface CategoryProductTableProps {
  customer: CustomerTarget | null;
  readOnly: boolean;
  getCategoryAggregates: (category: CategoryTarget) => CatAggregates;
  onUpdateProduct: (customerId: number, catId: string, prodId: string, field: 'targetAmount' | 'remark', value: number | string) => void;
  onUpdateCategoryRemark: (customerId: number, catId: string, remark: string) => void;
  onSplit: (customerId: number, catId: string, method: SplitMethod, targetAmount: number) => void;
  onAddProduct: (customerId: number, categoryId: string, categoryName: string) => void;
  onAddCategory: () => void;
}

const CategoryProductTable: React.FC<CategoryProductTableProps> = ({
  customer, readOnly, getCategoryAggregates, onUpdateProduct, onUpdateCategoryRemark, onSplit, onAddProduct, onAddCategory,
}) => {
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const toggleCategory = useCallback((catId: string) => setExpandedCats((prev) => {
    const next = new Set(prev); next.has(catId) ? next.delete(catId) : next.add(catId); return next;
  }), []);

  const treeData = useTreeData(customer, getCategoryAggregates);
  const { columns, remarkModal, setRemarkModal, handleRemarkSave } = useTableColumns({
    customer, readOnly, onAddProduct, onSplit, onUpdateProduct, onUpdateCategoryRemark,
  });

  if (!customer) return <div className={styles.table}><Empty className={styles.empty} description="请从左侧选择客户" /></div>;

  return (
    <div className={styles.table}>
      <Table
        columns={columns}
        dataSource={treeData}
        rowKey="key"
        size="small"
        pagination={false}
        scroll={{ x: 1468, y: 'calc(100vh - 350px)' }}
        expandable={{
          expandedRowKeys: Array.from(expandedCats).map((id) => `cat-${id}`),
          onExpand: (expanded, record) => {
            if (record.rowType === 'category') toggleCategory(record.categoryId);
          },
          expandIcon: ({ expanded, onExpand: handleExpand, record }) => {
            if (record.rowType !== 'category') return null;
            return expanded
              ? <DownOutlined className={styles.expandIcon} onClick={(e) => handleExpand(record, e)} />
              : <RightOutlined className={styles.expandIcon} onClick={(e) => handleExpand(record, e)} />;
          },
          expandIconColumnIndex: 0,
          indentSize: 0,
        }}
        rowClassName={(record) =>
          record.rowType === 'category' ? styles.categoryRow : styles.productRow
        }
      />
      {!readOnly && (
        <div className={styles.addRow}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={() => onAddCategory()}>添加品类</Button>
        </div>
      )}
      <RemarkEditModal
        visible={remarkModal.visible}
        customerId={remarkModal.customerId}
        catId={remarkModal.catId}
        prodId={remarkModal.prodId}
        initialValue={remarkModal.value}
        onSave={handleRemarkSave}
        onClose={() => setRemarkModal((prev) => ({ ...prev, visible: false }))}
      />
    </div>
  );
};

export default React.memo(CategoryProductTable);
