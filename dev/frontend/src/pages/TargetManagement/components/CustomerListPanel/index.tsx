/**
 * 客户列表面板
 * 左侧面板：搜索、客户列表、添加计划开发客户
 */
import React, { useState, useMemo } from 'react';
import { Input, Button, Tag, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { CustomerTarget } from '@/types/target-management';
import styles from './index.less';

interface CustomerListPanelProps {
  customers: CustomerTarget[];
  selectedCustomerId: string | null;
  onSelectCustomer: (id: string) => void;
  onAddCustomer: () => void;
  getCustomerTotal: (customer: CustomerTarget) => number;
  readOnly: boolean;
}

/** 格式化金额 */
function fmtAmount(n: number): string {
  if (n >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  if (n > 0) return `¥${n.toLocaleString()}`;
  return '¥0';
}

const CustomerListPanel: React.FC<CustomerListPanelProps> = ({
  customers, selectedCustomerId, onSelectCustomer, onAddCustomer, getCustomerTotal, readOnly,
}) => {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    if (!keyword) return customers;
    return customers.filter((c) => c.customerName.includes(keyword));
  }, [customers, keyword]);

  return (
    <div className={styles.panel}>
      <Input.Search
        placeholder="搜索客户名称..."
        allowClear
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className={styles.search}
      />
      <div className={styles.header}>全部客户 ({filtered.length})</div>
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无客户" />
        ) : (
          filtered.map((customer) => {
            const total = getCustomerTotal(customer);
            const isSelected = customer.customerId === selectedCustomerId;
            const topCategories = customer.categories.slice(0, 2);

            return (
              <div
                key={customer.customerId}
                className={`${styles.item} ${isSelected ? styles.itemSelected : ''} ${customer.isPlannedNew ? styles.itemNew : ''}`}
                onClick={() => onSelectCustomer(customer.customerId)}
              >
                <div className={styles.itemTop}>
                  <div className={styles.itemName}>
                    {customer.isPlannedNew && <Tag color="orange" className={styles.newTag}>新</Tag>}
                    {customer.customerName}
                  </div>
                  <span className={styles.itemAmount}>{fmtAmount(total)}</span>
                </div>
                {topCategories.length > 0 && (
                  <div className={styles.itemCategories}>
                    {topCategories.map((cat, idx) => (
                      <React.Fragment key={cat.categoryId}>
                        {idx > 0 && <span className={styles.catSeparator}> | </span>}
                        <span>{cat.categoryName}{fmtAmount(cat.products.reduce((s, p) => s + p.targetAmount, 0))}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {!readOnly && (
        <div className={styles.footer}>
          <Button type="dashed" icon={<PlusOutlined />} block onClick={onAddCustomer}>
            添加计划开发客户
          </Button>
        </div>
      )}
    </div>
  );
};

export default CustomerListPanel;
