/**
 * 客户列表面板
 * 左侧面板：搜索、客户列表、添加计划开发客户
 */
import React, { useState, useMemo } from 'react';
import { Input, Button, Tag, Empty, Modal } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { CustomerTarget } from '@/types/target-management';
import { formatCompactAmount } from '@/utils/format';
import styles from './index.less';

interface CustomerListPanelProps {
  customers: CustomerTarget[];
  selectedCustomerId: number | null;
  onSelectCustomer: (id: number) => void;
  onAddCustomer: () => void;
  onRemoveCustomer?: (id: number) => void;
  getCustomerTotal: (customer: CustomerTarget) => number;
  readOnly: boolean;
  /** 全部营销师视图时显示营销师标签 */
  showMarketerTag?: boolean;
}

const CustomerListPanel: React.FC<CustomerListPanelProps> = ({
  customers, selectedCustomerId, onSelectCustomer, onAddCustomer, onRemoveCustomer, getCustomerTotal, readOnly, showMarketerTag,
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

            return (
              <div
                key={customer.customerId}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                className={`${styles.item} ${isSelected ? styles.itemSelected : ''} ${customer.isPlannedNew ? styles.itemNew : ''}`}
                onClick={() => onSelectCustomer(customer.customerId)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectCustomer(customer.customerId); } }}
              >
                <div className={styles.itemTop}>
                  <div className={styles.itemName}>
                    {customer.isPlannedNew && <Tag color="orange" className={styles.newTag}>新</Tag>}
                    {showMarketerTag && <Tag color="blue" className={styles.marketerTag}>{customer.marketerName}</Tag>}
                    {customer.customerName}
                  </div>
                  <div className={styles.itemActions}>
                    <span className={styles.itemAmount}>{formatCompactAmount(total, { zeroAs: '¥0' })}</span>
                    {!readOnly && (
                      <Button
                        type="text"
                        size="small"
                        danger
                        className={styles.deleteBtn}
                        icon={<DeleteOutlined />}
                        aria-label="删除客户"
                        onClick={(e) => {
                          e.stopPropagation();
                          Modal.confirm({
                            title: '确认删除',
                            content: `确定要从目标中移除「${customer.customerName}」吗？该客户当月目标为 ${formatCompactAmount(getCustomerTotal(customer))}，保存后生效。`,
                            okText: '删除',
                            okButtonProps: { danger: true },
                            cancelText: '取消',
                            onOk: () => onRemoveCustomer?.(customer.customerId),
                          });
                        }}
                      />
                    )}
                  </div>
                </div>
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

export default React.memo(CustomerListPanel);
